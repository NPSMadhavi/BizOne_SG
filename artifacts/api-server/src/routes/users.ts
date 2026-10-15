import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import {
  db,
  usersTable,
  companiesTable,
  userCompaniesTable,
  rolesTable,
  salesPersonsTable,
  APP_ALL_MODULES,
} from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { z } from "zod";
import { UpdateUserParams, DeleteUserParams } from "@workspace/api-zod";
import { logAudit } from "../lib/audit.js";
import { requirePermission } from "../lib/auth-middleware.js";
import { getSalesPersonSummary } from "../lib/assigned-modules.js";
import {
  deleteLoginUser,
  insertLoginUser,
  loginNameTaken,
  publishCompanyUsersToMaster,
  saveUserCompanyAccess,
  updateLoginUser,
} from "../lib/login-account.js";

const router: IRouter = Router();

const UserRoleSchema = z.enum(["admin", "user", "external", "accountant"]);
const CompanyAccessSchema = z
  .array(z.object({
    companyId: z.number().int(),
    modules: z.array(z.string()),
  }))
  .optional();

const CreateUserPayload = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  role: UserRoleSchema,
  companyAccess: CompanyAccessSchema,
  salesPersonId: z.number().int().positive().nullable().optional(),
});

const UpdateUserPayload = z.object({
  username: z.string().min(1).optional(),
  password: z.string().min(1).optional(),
  role: UserRoleSchema.optional(),
  companyAccess: CompanyAccessSchema,
  salesPersonId: z.number().int().positive().nullable().optional(),
});

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

async function salesPersonForCompany(companyId: number, salesPersonId: number | null | undefined) {
  if (salesPersonId == null) return null;
  const [row] = await db
    .select({ id: salesPersonsTable.id })
    .from(salesPersonsTable)
    .where(and(eq(salesPersonsTable.id, salesPersonId), eq(salesPersonsTable.companyId, companyId)))
    .limit(1);
  return row?.id ?? undefined;
}

function modulesForRole(
  role: AppRole,
  companyAccess: { companyId: number; modules: string[] }[] | undefined,
  companyId: number,
): string[] {
  if (role === "admin") return [...APP_ALL_MODULES];
  const wanted = Number(companyId);
  const entry = companyAccess?.find((c) => Number(c.companyId) === wanted);
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

  const salesPerson = await getSalesPersonSummary(user.salesPersonId);

  return {
    id: user.id,
    username: user.username,
    // Always return API enum — never "Employee" / "Administrator"
    role: toAppRole(userRole?.name || user.role),
    roleId: user.roleId,
    roleName: userRole?.name ?? null,
    salesPersonId: salesPerson?.id ?? null,
    salesPerson,
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

  await publishCompanyUsersToMaster(companyId);

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

  const parsed = CreateUserPayload.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { password, role: rawRole, companyAccess, salesPersonId } = parsed.data;
  const username = parsed.data.username.trim().toLowerCase();
  const role = toAppRole(rawRole);
  const roleId =
    typeof req.body?.roleId === "number" && Number.isFinite(req.body.roleId)
      ? Number(req.body.roleId)
      : undefined;

  if (await loginNameTaken(username)) {
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
  const linkedSalesPersonId = await salesPersonForCompany(companyId, salesPersonId);
  if (salesPersonId != null && linkedSalesPersonId == null) {
    res.status(400).json({ error: "Selected Sales Person was not found." });
    return;
  }
  const user = await insertLoginUser({
    username,
    passwordHash,
    role: resolved.usersRole,
    companyId,
    roleId: resolved.roleId,
    salesPersonId: linkedSalesPersonId ?? null,
  });

  const modules = modulesForRole(role, companyAccess, companyId);
  await saveUserCompanyAccess(user.id, companyId, modules);

  if (companyAccess?.length) {
    for (const ca of companyAccess) {
      if (Number(ca.companyId) === Number(companyId)) continue;
      await saveUserCompanyAccess(user.id, ca.companyId, Array.isArray(ca.modules) ? ca.modules : []);
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

  const parsed = UpdateUserPayload.safeParse(req.body);
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

  await publishCompanyUsersToMaster(companyId);

  const { password, role: rawRole, companyAccess, salesPersonId } = parsed.data;
  const username = parsed.data.username?.trim().toLowerCase();
  const role = rawRole != null ? toAppRole(rawRole) : toAppRole(targetUser.role);
  const roleId =
    typeof req.body?.roleId === "number" && Number.isFinite(req.body.roleId)
      ? Number(req.body.roleId)
      : req.body?.roleId === null
        ? null
        : undefined;

  const updates: Record<string, unknown> = {};
  if (username) {
    updates.username = username;
    if (username.includes("@")) updates.email = username;
  }
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

  if (salesPersonId !== undefined) {
    const linkedSalesPersonId = await salesPersonForCompany(companyId, salesPersonId);
    if (salesPersonId != null && linkedSalesPersonId == null) {
      res.status(400).json({ error: "Selected Sales Person was not found." });
      return;
    }
    updates.salesPersonId = linkedSalesPersonId;
  }

  if (Object.keys(updates).length > 0) {
    await updateLoginUser(targetUser.id, companyId, updates);
  }

  const modules = modulesForRole(role, companyAccess, companyId);
  await saveUserCompanyAccess(targetUser.id, companyId, modules);

  if (companyAccess?.length) {
    for (const ca of companyAccess) {
      if (Number(ca.companyId) === Number(companyId)) continue;
      await saveUserCompanyAccess(targetUser.id, ca.companyId, Array.isArray(ca.modules) ? ca.modules : []);
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

  await deleteLoginUser(targetUser.id, targetUser.username);

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
