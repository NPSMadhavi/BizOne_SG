import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { companyDbContext, db, masterDb, usersTable, companiesTable, userCompaniesTable, settingsTable, financialYearsTable, APP_ALL_MODULES, rolesTable, permissionsTable, rolePermissionsTable, modulesForBusinessType } from "@workspace/db";
import { eq, or, sql } from "drizzle-orm";
import { LoginBody, RegisterBody, SelectCompanyBody } from "@workspace/api-zod";
import { seedRolesForCompany } from "../seed";
import { openCompanyPool } from "../lib/company-database";
import { dropCompanyDatabase, normalizeCompanySlug, provisionCompanyDatabase } from "../lib/provision-company-database";
import { getSalesPersonSummary, loadAssignedModules } from "../lib/assigned-modules.js";
import { mergeAssignedPermissions } from "../lib/module-access.js";
import { publishAllCompanyUsersToMaster } from "../lib/login-account.js";
import { loginPasswordMatches, setLoginPasswordHash } from "../lib/login-password.js";

declare module "express-session" {
  interface SessionData {
    userId?: number;
    companyId?: number;
    isAdmin?: boolean;
    userRole?: string;
    username?: string;
    roleId?: number;
    permissions?: string[];
  }
}

async function getUserPermissions(roleId: number): Promise<string[]> {
  // Roles/permissions live on lean master — never follow companyDbContext here.
  const rows = await masterDb
    .select({
      module: permissionsTable.module,
      action: permissionsTable.action,
    })
    .from(rolePermissionsTable)
    .innerJoin(permissionsTable, eq(rolePermissionsTable.permissionId, permissionsTable.id))
    .where(eq(rolePermissionsTable.roleId, roleId));

  return rows.map(r => `${r.module}:${r.action}`);
}

async function salesPersonForLogin(userId: number, companyId: number | undefined) {
  if (!companyId) return null;
  try {
    const tenantPool = await openCompanyPool(companyId);
    if (!tenantPool) {
      const [user] = await db.select({ salesPersonId: usersTable.salesPersonId }).from(usersTable).where(eq(usersTable.id, userId));
      return getSalesPersonSummary(user?.salesPersonId);
    }
    return await companyDbContext.run(tenantPool, async () => {
      const [user] = await db
        .select({ salesPersonId: usersTable.salesPersonId })
        .from(usersTable)
        .where(eq(usersTable.id, userId));
      return getSalesPersonSummary(user?.salesPersonId);
    });
  } catch {
    return null;
  }
}

async function permissionsFor(
  user: { id: number; role: string; roleId: number | null },
  companyId: number | undefined,
): Promise<string[]> {
  const rolePerms = user.roleId ? await getUserPermissions(user.roleId) : [];
  if (user.role === "admin") return rolePerms;
  if (!companyId) return [];
  const assigned = await loadAssignedModules(user.id, companyId);
  return mergeAssignedPermissions(rolePerms, assigned, false);
}

const ALL_MODULES = [...APP_ALL_MODULES];

async function assignDefaultCompanyAccess(userId: number): Promise<number | null> {
  const [company] = await masterDb.select().from(companiesTable).orderBy(companiesTable.id).limit(1);
  if (!company) return null;

  await masterDb
    .insert(userCompaniesTable)
    .values({
      userId,
      companyId: company.id,
      // No modules until an admin assigns them — never auto-grant Directory / ALL
      modules: [],
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

export async function getUserCompanies(userId: number) {
  // Directory tables are on lean master; session user ids are master ids.
  const [user] = await masterDb.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) return [];

  const rows = await masterDb
    .select({ company: companiesTable, uc: userCompaniesTable })
    .from(userCompaniesTable)
    .innerJoin(companiesTable, eq(userCompaniesTable.companyId, companiesTable.id))
    .where(eq(userCompaniesTable.userId, userId));

  const companies = rows.map(r => ({
    ...r.company,
    // Strict: never invent modules (esp. Directory) when DB value is missing
    modules: Array.isArray(r.uc.modules) ? (r.uc.modules as string[]) : [],
  }));

  if (user.companyId && !companies.some((company) => company.id === user.companyId)) {
    const [own] = await masterDb.select().from(companiesTable).where(eq(companiesTable.id, user.companyId)).limit(1);
    if (own) {
      companies.unshift({
        ...own,
        modules: user.role === "admin" ? ALL_MODULES : [],
      });
    }
  }

  return companies;
}

function formatUser(
  user: any,
  companies: any[],
  selectedCompanyId?: number | null,
  permissions: string[] = [],
  salesPerson: { id: number; name: string; employmentCode: string } | null = null,
) {
  const roleRaw = String(user.role || "user").toLowerCase();
  const role =
    roleRaw === "administrator" || roleRaw === "admin" ? "admin"
    : roleRaw === "accountant" ? "accountant"
    : roleRaw === "external" ? "external"
    : roleRaw === "employee" ? "user"
    : roleRaw === "user" ? "user"
    : "user";

  return {
    id: user.id,
    username: user.username,
    role,
    email: user.email ?? null,
    fullName: user.fullName ?? null,
    phoneNumber: user.phoneNumber ?? null,
    isActive: user.isActive ?? true,
    companyId: user.companyId ?? null,
    roleId: user.roleId ?? null,
    salesPersonId: salesPerson?.id ?? user.salesPersonId ?? null,
    salesPerson,
    permissions,
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
      slug: rawSlug,
      businessType,
      financialYearFrom,
      financialYearTo,
    } = parsed.data;
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedCompanyEmail = companyEmail.trim().toLowerCase();
    const normalizedDomain = companyDomain?.trim().toLowerCase() || null;
    const signupModules = modulesForBusinessType(businessType) ?? [];
    const slug = normalizeCompanySlug(rawSlug);
    const username = normalizedEmail;

    if (financialYearTo < financialYearFrom) {
      res.status(400).json({ error: "Financial year end must be the same year or later" });
      return;
    }

    if (slug.length < 3) {
      res.status(400).json({ error: "Company slug is required" });
      return;
    }

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

    const [existingSlug] = await db
      .select({ id: companiesTable.id })
      .from(companiesTable)
      .where(eq(companiesTable.slug, slug))
      .limit(1);
    if (existingSlug) {
      res.status(400).json({ error: "This slug is already used. Choose another slug." });
      return;
    }

    let databaseName = "";
    try {
      databaseName = await provisionCompanyDatabase(slug);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Company database could not be created";
      res.status(400).json({ error: message });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const fromYear = financialYearFrom.slice(0, 4);
    const toYear = financialYearTo.slice(0, 4);
    const fyLabel = fromYear === toYear ? `FY ${fromYear}` : `FY ${fromYear}-${toYear}`;

    let result;
    try {
      // Lean master only stores directory rows. FY + settings go on the company DB below.
      result = await db.transaction(async (tx) => {
      const [company] = await tx
        .insert(companiesTable)
        .values({
          name: companyName.trim(),
          country: "SG",
          address: companyAddress.trim(),
          email: normalizedCompanyEmail,
          phone: phoneNumber.trim(),
          domain: normalizedDomain,
          businessType,
          registrationNo: gstRegistrationNo?.trim() || null,
          gstRegNo: gstRegistrationNo?.trim() || null,
          slug,
          databaseName,
        })
        .returning();

      await seedRolesForCompany(company.id, tx, signupModules);

      const [adminRole] = await tx
        .select()
        .from(rolesTable)
        .where(sql`lower(${rolesTable.name}) = 'administrator' AND ${rolesTable.companyId} = ${company.id}`)
        .limit(1);

      if (!adminRole) {
        throw new Error("Administrator role not created during company registration");
      }

      const [user] = await tx
        .insert(usersTable)
        .values({
          username,
          databaseName,
          role: "admin",
          email: normalizedEmail,
          fullName: fullName.trim(),
          phoneNumber: phoneNumber.trim(),
          isActive: true,
          companyId: company.id,
          roleId: adminRole.id,
        })
        .returning();

      await tx.insert(userCompaniesTable).values({
        userId: user.id,
        companyId: company.id,
        modules: [...signupModules],
      });

      return { user, company, adminRole, passwordHash };
    });
    } catch (err) {
      await dropCompanyDatabase(databaseName);
      throw err;
    }

    const { user, company, adminRole, passwordHash: savedHash } = result;
    await setLoginPasswordHash(user.id, savedHash);

    try {
      const tenantPool = await openCompanyPool(company.id);
      if (!tenantPool) {
        throw new Error("Company database pool could not be opened");
      }
      await companyDbContext.run(tenantPool, async () => {
        await db.insert(financialYearsTable).values({
          companyId: company.id,
          label: fyLabel,
          startDate: financialYearFrom,
          endDate: financialYearTo,
          status: "active",
          auditStatus: "pending",
          activatedAt: new Date(),
        });
        await db.insert(settingsTable).values({
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
      });
    } catch (err) {
      const cause = err && typeof err === "object" && "cause" in err ? (err as { cause?: unknown }).cause : undefined;
      const message = err instanceof Error ? err.message : "Company database could not be prepared";
      console.error("[signup] company database was created but tenant seed failed:", message, cause ?? "");
      await dropCompanyDatabase(databaseName);
      // Best-effort rollback of master directory rows created above.
      try {
        await db.delete(userCompaniesTable).where(eq(userCompaniesTable.companyId, company.id));
        await db.delete(usersTable).where(eq(usersTable.id, user.id));
        await db.delete(rolesTable).where(eq(rolesTable.companyId, company.id));
        await db.delete(companiesTable).where(eq(companiesTable.id, company.id));
      } catch (cleanupErr) {
        console.error("[signup] master cleanup after tenant seed failure:", cleanupErr);
      }
      throw err;
    }

    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.isAdmin = true;
    req.session.userRole = user.role;
    req.session.companyId = company.id;
    req.session.roleId = adminRole.id;
    req.session.permissions = await getUserPermissions(adminRole.id);

    const companies = await getUserCompanies(user.id);
    res.status(201).json({
      message: "Registration Successful",
      user: formatUser(user, companies, company.id, req.session.permissions),
      sessionId: req.sessionID,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Registration failed";
    console.error("[signup] registration failed:", message);
    if (message.includes("column") || message.includes("Failed query") || message.includes("does not exist")) {
      res.status(500).json({
        error: "Database setup incomplete. Restart the backend (npm run dev) and try again.",
      });
      return;
    }
    res.status(500).json({ error: message || "Registration failed. Please try again." });
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
  const findLoginUser = () =>
    db
      .select()
      .from(usersTable)
      .where(
        or(
          sql`lower(${usersTable.username}) = ${loginId}`,
          sql`lower(${usersTable.email}) = ${loginId}`,
        ),
      )
      .limit(1);

  let [user] = await findLoginUser();
  if (!user) {
    await publishAllCompanyUsersToMaster().catch(() => undefined);
    [user] = await findLoginUser();
  }

  if (!user) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  if (user.isActive === false) {
    res.status(403).json({ error: "Your account is inactive. Contact your administrator." });
    return;
  }

  const validPassword = await loginPasswordMatches(user.id, password);
  if (!validPassword) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  req.session.userId = user.id;
  req.session.username = user.username;
  req.session.isAdmin = user.role === "admin";
  req.session.userRole = user.role;
  req.session.companyId = user.companyId || undefined;
  req.session.roleId = user.roleId || undefined;

  await ensureUserCompanyAccess(user.id, user.role);
  const companies = await getUserCompanies(user.id);

  const sessionCompanyId = companies.some((company) => company.id === user.companyId)
    ? user.companyId
    : companies[0]?.id;

  if (sessionCompanyId) {
    req.session.companyId = sessionCompanyId;
  }
  req.session.permissions = await permissionsFor(user, req.session.companyId);
  const salesPerson = await salesPersonForLogin(user.id, req.session.companyId);

  req.session.save((err) => {
    if (err) {
      res.status(500).json({ error: "Failed to create session" });
      return;
    }
    res.json({
      user: formatUser(user, companies, req.session.companyId, req.session.permissions, salesPerson),
      sessionId: req.sessionID,
    });
  });
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

  const [user] = await masterDb.select().from(usersTable).where(eq(usersTable.id, req.session.userId));
  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }

  // Keep the company chosen in the UI (/auth/select-company). Never reset it to users.companyId.
  req.session.roleId = user.roleId ?? req.session.roleId;

  if (!req.session.companyId) {
    req.session.companyId = user.companyId ?? undefined;
    const defaultCompanyId = await ensureUserCompanyAccess(user.id, user.role);
    if (!req.session.companyId && defaultCompanyId) {
      req.session.companyId = defaultCompanyId;
    }
  }

  const companies = await getUserCompanies(user.id);
  if (!req.session.companyId || !companies.some((company) => company.id === req.session.companyId)) {
    req.session.companyId = companies[0]?.id;
  }
  req.session.permissions = await permissionsFor(user, req.session.companyId);
  const salesPerson = await salesPersonForLogin(user.id, req.session.companyId);

  res.json(formatUser(user, companies, req.session.companyId, req.session.permissions, salesPerson));
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

  const [user] = await masterDb.select().from(usersTable).where(eq(usersTable.id, req.session.userId));
  if (user) {
    req.session.companyId = companyId;
    req.session.roleId = user.roleId ?? undefined;
    req.session.permissions = await permissionsFor(user, companyId);
  }

  res.json({ success: true });
});

export default router;
