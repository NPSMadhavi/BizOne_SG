import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable, companiesTable, userCompaniesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { LoginBody, SelectCompanyBody } from "@workspace/api-zod";

declare module "express-session" {
  interface SessionData {
    userId?: number;
    companyId?: number;
    isAdmin?: boolean;
    userRole?: string;
  }
}

const ALL_MODULES = ["purchase_orders", "quotations", "invoices", "delivery_orders"];

const router: IRouter = Router();

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
    createdAt: user.createdAt instanceof Date ? user.createdAt.toISOString() : user.createdAt,
    companies,
    selectedCompanyId: selectedCompanyId ?? null,
  };
}

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { username, password } = parsed.data;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.username, username));

  if (!user) {
    res.status(401).json({ error: "Invalid username or password" });
    return;
  }

  const validPassword = await bcrypt.compare(password, user.passwordHash);
  if (!validPassword) {
    res.status(401).json({ error: "Invalid username or password" });
    return;
  }

  req.session.userId = user.id;
  req.session.isAdmin = user.role === "admin";
  req.session.userRole = user.role;
  req.session.companyId = undefined;

  const companies = await getUserCompanies(user.id);

  if (companies.length === 1) {
    req.session.companyId = companies[0].id;
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
