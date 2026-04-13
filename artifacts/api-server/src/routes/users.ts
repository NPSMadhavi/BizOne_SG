import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable, companiesTable, userCompaniesTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { CreateUserBody, UpdateUserBody, UpdateUserParams, DeleteUserParams } from "@workspace/api-zod";

declare module "express-session" {
  interface SessionData {
    userId?: number;
    companyId?: number;
  }
}

const router: IRouter = Router();

async function requireAdmin(req: any, res: any): Promise<boolean> {
  if (!req.session.userId) {
    res.status(401).json({ error: "Not authenticated" });
    return false;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.session.userId));
  if (!user || user.role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return false;
  }
  return true;
}

async function getUserWithCompanies(userId: number) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) return null;

  const ucRows = await db
    .select({ company: companiesTable })
    .from(userCompaniesTable)
    .innerJoin(companiesTable, eq(userCompaniesTable.companyId, companiesTable.id))
    .where(eq(userCompaniesTable.userId, userId));

  return {
    id: user.id,
    username: user.username,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
    companies: ucRows.map(r => r.company),
    selectedCompanyId: null,
  };
}

router.get("/users", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req, res))) return;

  const users = await db.select().from(usersTable).orderBy(usersTable.createdAt);

  const result = await Promise.all(users.map(u => getUserWithCompanies(u.id)));
  res.json(result.filter(Boolean));
});

router.post("/users", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req, res))) return;

  const parsed = CreateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { username, password, role, companyIds } = parsed.data;

  const [existing] = await db.select().from(usersTable).where(eq(usersTable.username, username));
  if (existing) {
    res.status(400).json({ error: "Username already exists" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const [user] = await db.insert(usersTable).values({ username, passwordHash, role }).returning();

  if (companyIds && companyIds.length > 0) {
    for (const companyId of companyIds) {
      await db.insert(userCompaniesTable).values({ userId: user.id, companyId }).onConflictDoNothing();
    }
  }

  const result = await getUserWithCompanies(user.id);
  res.status(201).json(result);
});

router.put("/users/:id", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req, res))) return;

  const params = UpdateUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid user ID" });
    return;
  }

  const parsed = UpdateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { username, password, role, companyIds } = parsed.data;
  const updates: Record<string, any> = {};
  if (username) updates.username = username;
  if (role) updates.role = role;
  if (password) updates.passwordHash = await bcrypt.hash(password, 12);

  if (Object.keys(updates).length > 0) {
    const [user] = await db.update(usersTable).set(updates).where(eq(usersTable.id, params.data.id)).returning();
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
  }

  if (companyIds !== undefined) {
    await db.delete(userCompaniesTable).where(eq(userCompaniesTable.userId, params.data.id));
    for (const companyId of companyIds) {
      await db.insert(userCompaniesTable).values({ userId: params.data.id, companyId }).onConflictDoNothing();
    }
  }

  const result = await getUserWithCompanies(params.data.id);
  if (!result) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(result);
});

router.delete("/users/:id", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req, res))) return;

  const params = DeleteUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid user ID" });
    return;
  }

  if (params.data.id === req.session.userId) {
    res.status(400).json({ error: "Cannot delete your own account" });
    return;
  }

  const [user] = await db.delete(usersTable).where(eq(usersTable.id, params.data.id)).returning();
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json({ success: true });
});

export default router;
