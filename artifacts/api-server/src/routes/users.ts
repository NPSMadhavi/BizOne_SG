import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import {
  db,
  usersTable,
  companiesTable,
  userCompaniesTable,
  rolesTable,
  APP_ALL_MODULES,
} from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { CreateUserBody, UpdateUserBody, UpdateUserParams, DeleteUserParams } from "@workspace/api-zod";
import { logAudit } from "../lib/audit.js";
import { requirePermission } from "../lib/auth-middleware.js";

const router: IRouter = Router();

type AppRole = "admin" | "user" | "external" | "accountant";

/** Map roles-table display names (and legacy values) to API enum. */
function toAppRole(value: string | null | undefined): AppRole {
  const v = (value || "user").trim().toLowerCase();
  if (v === "admin" || v === "administrator") return "admin";
  if (v === "accountant") return "accountant";
  if (v === "external") return "external";
  if (v === "user" || v === "employee") return "user";
  return "user";
}

/** Map API role enum to seeded roles.name (null = no roles-table row). */
function roleEnumToDbName(role: AppRole): string | null {
  if (role === "admin") return "Administrator";
  if (role === "user") return "Employee";
  if (role === "accountant") return "Accountant";
  return null;
}

async function resolveUserRole(
  companyId: number,
  role: AppRole,
  roleId?: number | null,
) {
  if (roleId != null) {
    const [dbRole] = await db
      .select()
      .from(rolesTable)
      .where(and(eq(rolesTable.id, roleId), eq(rolesTable.companyId, companyId)))
      .limit(1);
    if (!dbRole) return null;
    return { roleId: dbRole.id as number, usersRole: toAppRole(dbRole.name), roleName: dbRole.name };
  }
  const resolved = await resolveCompanyRole(companyId, role);
  if (!resolved) return null;
  return { ...resolved, roleName: roleEnumToDbName(role) ?? role };
}

async function resolveCompanyRole(companyId: number, role: AppRole) {
  const roleName = roleEnumToDbName(role);
  if (!roleName) {
    return { roleId: null as number | null, usersRole: role };
  }
  const [dbRole] = await db
    .select()
    .from(rolesTable)
    .where(
      sql`lower(${rolesTable.name}) = ${roleName.toLowerCase()} AND ${rolesTable.companyId} = ${companyId}`,
    )
    .limit(1);
  if (!dbRole) {
    return null;
  }
  return { roleId: dbRole.id as number, usersRole: role };
}

function modulesForRole(
  role: AppRole,
  companyAccess: { companyId: number; modules: string[] }[] | undefined,
  companyId: number,
): string[] {
  if (role === "admin") return [...APP_ALL_MODULES];
  const entry = companyAccess?.find((c) => c.companyId === companyId);
  const allowed = new Set<string>(APP_ALL_MODULES as unknown as string[]);
  // Exact checkbox selection only — never invent Inventory / Directory / defaults
  return (Array.isArray(entry?.modules) ? entry!.modules : []).filter((m) => allowed.has(m));
}

async function getUserWithCompaniesAndRole(userId: number, currentCompanyId: number) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) return null;

  const ucRows = await db
    .select({ company: companiesTable, uc: userCompaniesTable })
    .from(userCompaniesTable)
    .innerJoin(companiesTable, eq(userCompaniesTable.companyId, companiesTable.id))
    .where(and(eq(userCompaniesTable.userId, userId), eq(userCompaniesTable.companyId, currentCompanyId)));

  const [userRole] = user.roleId
    ? await db.select().from(rolesTable).where(eq(rolesTable.id, user.roleId))
    : [];

  return {
    id: user.id,
    username: user.username,
    // Always return API enum — never "Employee" / "Administrator"
    role: toAppRole(userRole?.name || user.role),
    roleId: user.roleId,
    roleName: userRole?.name ?? null,
    companyId: user.companyId,
    createdAt: user.createdAt.toISOString(),
    companies: ucRows.map((r) => ({
      ...r.company,
      modules: Array.isArray(r.uc.modules) ? (r.uc.modules as string[]) : [],
    })),
    selectedCompanyId: null,
  };
}

router.get("/users", requirePermission("user_management:view"), async (req, res): Promise<void> => {
  const companyId = req.session.companyId;
  if (!companyId) {
    res.status(403).json({ error: "Active company context required" });
    return;
  }

  const users = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.companyId, companyId))
    .orderBy(usersTable.createdAt);

  const result = await Promise.all(users.map((u) => getUserWithCompaniesAndRole(u.id, companyId)));
  res.json(result.filter(Boolean));
});

router.post("/users", requirePermission("user_management:create"), async (req, res): Promise<void> => {
  const companyId = req.session.companyId;
  if (!companyId) {
    res.status(403).json({ error: "Active company context required" });
    return;
  }

  const parsed = CreateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { username, password, role: rawRole, companyAccess } = parsed.data;
  const role = toAppRole(rawRole);
  const roleId =
    typeof req.body?.roleId === "number" && Number.isFinite(req.body.roleId)
      ? Number(req.body.roleId)
      : undefined;

  const [existing] = await db.select().from(usersTable).where(eq(usersTable.username, username));
  if (existing) {
    res.status(400).json({ error: "Username already exists" });
    return;
  }

  const resolved = await resolveUserRole(companyId, role, roleId);
  if (!resolved) {
    const expected = roleEnumToDbName(role) ?? role;
    res.status(400).json({ error: `Selected role '${expected}' does not exist for this company.` });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const [user] = await db
    .insert(usersTable)
    .values({
      username,
      passwordHash,
      role: resolved.usersRole,
      companyId,
      roleId: resolved.roleId,
    })
    .returning();

  const modules = modulesForRole(role, companyAccess, companyId);
  await db
    .insert(userCompaniesTable)
    .values({
      userId: user.id,
      companyId,
      modules,
    })
    .onConflictDoNothing();

  // Optional: assign extra companies from payload (other than active)
  if (companyAccess?.length) {
    for (const ca of companyAccess) {
      if (ca.companyId === companyId) continue;
      await db
        .insert(userCompaniesTable)
        .values({
          userId: user.id,
          companyId: ca.companyId,
          modules: Array.isArray(ca.modules) ? ca.modules : [],
        })
        .onConflictDoNothing();
    }
  }

  const result = await getUserWithCompaniesAndRole(user.id, companyId);
  logAudit({ req, action: "create", entityType: "user", entityId: user.id, entityLabel: user.username });
  res.status(201).json(result);
});

router.put("/users/:id", requirePermission("user_management:edit"), async (req, res): Promise<void> => {
  const companyId = req.session.companyId;
  if (!companyId) {
    res.status(403).json({ error: "Active company context required" });
    return;
  }

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

  const [targetUser] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, params.data.id));

  if (!targetUser) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (targetUser.companyId !== companyId) {
    res.status(403).json({ error: "Access denied: User belongs to another company" });
    return;
  }

  const { username, password, role: rawRole, companyAccess } = parsed.data;
  const role = rawRole != null ? toAppRole(rawRole) : toAppRole(targetUser.role);
  const roleId =
    typeof req.body?.roleId === "number" && Number.isFinite(req.body.roleId)
      ? Number(req.body.roleId)
      : req.body?.roleId === null
        ? null
        : undefined;

  const updates: Record<string, unknown> = {};
  if (username) updates.username = username;
  if (password) updates.passwordHash = await bcrypt.hash(password, 12);

  if (rawRole != null || roleId !== undefined) {
    const resolved = await resolveUserRole(companyId, role, roleId ?? null);
    if (!resolved) {
      const expected = roleEnumToDbName(role) ?? role;
      res.status(400).json({ error: `Selected role '${expected}' does not exist for this company.` });
      return;
    }
    updates.role = resolved.usersRole;
    updates.roleId = resolved.roleId;
  }

  if (Object.keys(updates).length > 0) {
    await db.update(usersTable).set(updates).where(eq(usersTable.id, targetUser.id));
  }

  // Update active-company mapping; preserve other companies unless payload replaces them
  const modules = modulesForRole(role, companyAccess, companyId);
  await db
    .delete(userCompaniesTable)
    .where(and(eq(userCompaniesTable.userId, targetUser.id), eq(userCompaniesTable.companyId, companyId)));

  await db
    .insert(userCompaniesTable)
    .values({
      userId: targetUser.id,
      companyId,
      modules,
    })
    .onConflictDoNothing();

  if (companyAccess?.length) {
    for (const ca of companyAccess) {
      if (ca.companyId === companyId) continue;
      await db
        .delete(userCompaniesTable)
        .where(
          and(
            eq(userCompaniesTable.userId, targetUser.id),
            eq(userCompaniesTable.companyId, ca.companyId),
          ),
        );
      await db.insert(userCompaniesTable).values({
        userId: targetUser.id,
        companyId: ca.companyId,
        modules: Array.isArray(ca.modules) ? ca.modules : [],
      });
    }
  }

  const result = await getUserWithCompaniesAndRole(targetUser.id, companyId);
  if (!result) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  logAudit({
    req,
    action: "update",
    entityType: "user",
    entityId: targetUser.id,
    entityLabel: result.username,
  });
  res.json(result);
});

router.delete("/users/:id", requirePermission("user_management:delete"), async (req, res): Promise<void> => {
  const companyId = req.session.companyId;
  if (!companyId) {
    res.status(403).json({ error: "Active company context required" });
    return;
  }

  const params = DeleteUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid user ID" });
    return;
  }

  const [targetUser] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, params.data.id));

  if (!targetUser) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (targetUser.companyId !== companyId) {
    res.status(403).json({ error: "Access denied: User belongs to another company" });
    return;
  }

  if (targetUser.id === req.session.userId) {
    res.status(400).json({ error: "Cannot delete your own account" });
    return;
  }

  await db.delete(usersTable).where(eq(usersTable.id, targetUser.id));

  logAudit({
    req,
    action: "delete",
    entityType: "user",
    entityId: targetUser.id,
    entityLabel: targetUser.username,
  });
  res.json({ success: true });
});

export default router;
