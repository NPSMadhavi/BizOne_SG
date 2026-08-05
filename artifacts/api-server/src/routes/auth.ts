import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable, companiesTable, userCompaniesTable, settingsTable, APP_ALL_MODULES } from "@workspace/db";
import { eq, or, sql } from "drizzle-orm";
import { LoginBody, RegisterBody, SelectCompanyBody } from "@workspace/api-zod";

declare module "express-session" {
  interface SessionData {
    userId?: number;
    companyId?: number;
    isAdmin?: boolean;
    userRole?: string;
    username?: string;
  }
}

const ALL_MODULES = [...APP_ALL_MODULES];

async function assignDefaultCompanyAccess(userId: number): Promise<number | null> {
  const [company] = await db.select().from(companiesTable).orderBy(companiesTable.id).limit(1);
  if (!company) return null;

  await db
    .insert(userCompaniesTable)
    .values({
      userId,
      companyId: company.id,
      modules: ALL_MODULES,
    })
    .onConflictDoNothing();

  return company.id;
}

async function ensureUserCompanyAccess(userId: number, role: string): Promise<number | null> {
  if (role === "admin") return null;

  const companies = await getUserCompanies(userId);
  if (companies.length > 0) {
    return companies.length === 1 ? companies[0].id : null;
  }

  return assignDefaultCompanyAccess(userId);
}

async function getUserCompanies(userId: number) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) return [];

  if (user.role === "admin") {
    const allCompanies = await db.select().from(companiesTable);
    return allCompanies.map(c => ({ ...c, modules: ALL_MODULES }));
  }

  const rows = await db
    .select({ company: companiesTable, uc: userCompaniesTable })
    .from(userCompaniesTable)
    .innerJoin(companiesTable, eq(userCompaniesTable.companyId, companiesTable.id))
    .where(eq(userCompaniesTable.userId, userId));

  return rows.map(r => ({
    ...r.company,
    modules: (r.uc.modules as string[]) ?? ALL_MODULES,
  }));
}

function formatUser(user: any, companies: any[], selectedCompanyId?: number | null) {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    email: user.email ?? null,
    fullName: user.fullName ?? null,
    phoneNumber: user.phoneNumber ?? null,
    isActive: user.isActive ?? true,
    createdAt: user.createdAt instanceof Date ? user.createdAt.toISOString() : user.createdAt,
    companies,
    selectedCompanyId: selectedCompanyId ?? null,
  };
}

const router: IRouter = Router();

router.post("/auth/register", async (req, res): Promise<void> => {
  try {
    const parsed = RegisterBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request body" });
      return;
    }

    const {
      fullName,
      email,
      password,
      phoneNumber,
      companyName,
      companyEmail,
      companyAddress,
      companyDomain,
      gstRegistrationNo,
    } = parsed.data;
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedCompanyEmail = companyEmail.trim().toLowerCase();
    const normalizedDomain = companyDomain.trim().toLowerCase();
    const username = normalizedEmail;

    const [existing] = await db
      .select()
      .from(usersTable)
      .where(
        or(
          eq(usersTable.username, username),
          sql`lower(${usersTable.email}) = ${normalizedEmail}`,
        ),
      );

    if (existing) {
      res.status(400).json({ error: "An account with this email already exists" });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const result = await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(usersTable)
        .values({
          username,
          passwordHash,
          role: "admin",
          email: normalizedEmail,
          fullName: fullName.trim(),
          phoneNumber: phoneNumber.trim(),
          isActive: true,
        })
        .returning();

      const [company] = await tx
        .insert(companiesTable)
        .values({
          name: companyName.trim(),
          country: "SG",
          address: companyAddress.trim(),
          email: normalizedCompanyEmail,
          phone: phoneNumber.trim(),
          domain: normalizedDomain,
          registrationNo: gstRegistrationNo?.trim() || null,
        })
        .returning();

      await tx.insert(userCompaniesTable).values({
        userId: user.id,
        companyId: company.id,
        modules: ALL_MODULES,
      });

      await tx.insert(settingsTable).values({
        companyId: company.id,
        gstRate: "9",
        poPrefix: "PO",
        poCounter: 0,
        poSuffix: "",
        invPrefix: "INV",
        invCounter: 0,
        invSuffix: "",
        qtPrefix: "QT",
        qtCounter: 0,
        qtSuffix: "",
        doPrefix: "DO",
        doCounter: 0,
        doSuffix: "",
        grnPrefix: "GRN",
        grnCounter: 0,
        grnSuffix: "",
      });

      return { user, company };
    });

    const { user, company } = result;

    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.isAdmin = false;
    req.session.userRole = user.role;
    req.session.companyId = company.id;

    const companies = await getUserCompanies(user.id);
    res.status(201).json({ message: "Registration Successful", user: formatUser(user, companies, company.id) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Registration failed";
    if (message.includes("column") || message.includes("Failed query")) {
      res.status(500).json({
        error: "Database setup incomplete. Restart the backend (pnpm dev) and try again.",
      });
      return;
    }
    res.status(500).json({ error: "Registration failed. Please try again." });
  }
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { username, password } = parsed.data;
  const loginId = username.trim().toLowerCase();
  const [user] = await db
    .select()
    .from(usersTable)
    .where(
      or(
        eq(usersTable.username, loginId),
        sql`lower(${usersTable.email}) = ${loginId}`,
      ),
    );

  if (!user) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  if (user.isActive === false) {
    res.status(403).json({ error: "Your account is inactive. Contact your administrator." });
    return;
  }

  const validPassword = await bcrypt.compare(password, user.passwordHash);
  if (!validPassword) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  req.session.userId = user.id;
  req.session.username = user.username;
  req.session.isAdmin = user.role === "admin";
  req.session.userRole = user.role;
  req.session.companyId = undefined;

  const defaultCompanyId = await ensureUserCompanyAccess(user.id, user.role);
  const companies = await getUserCompanies(user.id);

  const sessionCompanyId =
    defaultCompanyId ?? (companies.length === 1 ? companies[0].id : undefined);

  if (sessionCompanyId) {
    req.session.companyId = sessionCompanyId;
  }

  res.json({ user: formatUser(user, companies, req.session.companyId) });
});

router.post("/auth/logout", async (req, res): Promise<void> => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

router.get("/auth/me", async (req, res): Promise<void> => {
  if (!req.session.userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.session.userId));
  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }

  if (!req.session.companyId) {
    const defaultCompanyId = await ensureUserCompanyAccess(user.id, user.role);
    if (defaultCompanyId) {
      req.session.companyId = defaultCompanyId;
    }
  }

  const companies = await getUserCompanies(user.id);
  res.json(formatUser(user, companies, req.session.companyId));
});

router.post("/auth/select-company", async (req, res): Promise<void> => {
  if (!req.session.userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const parsed = SelectCompanyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { companyId } = parsed.data;
  const companies = await getUserCompanies(req.session.userId);
  const hasAccess = companies.some(c => c.id === companyId);

  if (!hasAccess) {
    res.status(403).json({ error: "Access denied to this company" });
    return;
  }

  req.session.companyId = companyId;
  res.json({ success: true });
});

export default router;
