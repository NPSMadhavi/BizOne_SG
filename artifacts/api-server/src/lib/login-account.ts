import {
  companyDbContext,
  db,
  masterDb,
  masterPool,
  usersTable,
  userCompaniesTable,
  rolesTable,
  salesPersonsTable,
  companiesTable,
} from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { openCompanyPool } from "./company-database.js";
import { logger } from "./logger.js";

type UserRow = typeof usersTable.$inferSelect;

function loginEmail(username: string, email?: string | null) {
  const normalized = username.trim().toLowerCase();
  const given = email?.trim().toLowerCase();
  if (given) return given;
  return normalized.includes("@") ? normalized : null;
}

async function bumpSerial(target: { query: (sql: string) => Promise<unknown> }, table: "users" | "roles") {
  await target.query(
    `SELECT setval(pg_get_serial_sequence('${table}', 'id'), GREATEST(COALESCE((SELECT MAX(id) FROM ${table}), 1), 1), true)`,
  );
}

/** Keep a company-only sales person id off the shared user row when that id belongs to someone else. */
async function salesPersonIdForMaster(salesPersonId: number | null | undefined, companyId: number) {
  if (salesPersonId == null) return null;
  const [row] = await masterDb
    .select({ id: salesPersonsTable.id, companyId: salesPersonsTable.companyId })
    .from(salesPersonsTable)
    .where(eq(salesPersonsTable.id, salesPersonId))
    .limit(1);
  if (!row || row.companyId !== companyId) return null;
  return row.id;
}

async function ensureRoleOnMaster(roleId: number | null | undefined) {
  if (roleId == null) return;
  const [existing] = await masterDb
    .select({ id: rolesTable.id })
    .from(rolesTable)
    .where(eq(rolesTable.id, roleId))
    .limit(1);
  if (existing) return;
  if (!companyDbContext.getStore()) return;
  const [role] = await db.select().from(rolesTable).where(eq(rolesTable.id, roleId)).limit(1);
  if (!role) return;
  await masterDb.insert(rolesTable).values({
    id: role.id,
    name: role.name,
    companyId: role.companyId,
    createdAt: role.createdAt,
    updatedAt: role.updatedAt,
  });
  await bumpSerial(masterPool, "roles");
}

export async function saveUserCompanyAccess(userId: number, companyId: number, modules: string[]) {
  await upsertAccess(masterDb, userId, companyId, modules);
  if (companyDbContext.getStore()) {
    await upsertAccess(db, userId, companyId, modules);
  }
}

async function upsertAccess(
  database: typeof db,
  userId: number,
  companyId: number,
  modules: string[],
) {
  const [existing] = await database
    .select({ id: userCompaniesTable.id })
    .from(userCompaniesTable)
    .where(and(eq(userCompaniesTable.userId, userId), eq(userCompaniesTable.companyId, companyId)))
    .limit(1);
  if (existing) {
    await database.update(userCompaniesTable).set({ modules }).where(eq(userCompaniesTable.id, existing.id));
    return;
  }
  await database.insert(userCompaniesTable).values({ userId, companyId, modules });
}

async function mirrorUserToCompany(user: UserRow, salesPersonId: number | null) {
  const tenant = companyDbContext.getStore();
  if (!tenant) return;
  const values = {
    username: user.username,
    passwordHash: user.passwordHash,
    role: user.role,
    email: user.email,
    fullName: user.fullName,
    phoneNumber: user.phoneNumber,
    isActive: user.isActive,
    companyId: user.companyId,
    roleId: user.roleId,
    salesPersonId,
    updatedAt: new Date(),
  };
  const [existing] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.id, user.id))
    .limit(1);
  if (existing) {
    await db.update(usersTable).set(values).where(eq(usersTable.id, user.id));
    return;
  }
  await db.insert(usersTable).values({
    id: user.id,
    ...values,
    createdAt: user.createdAt,
  });
  await bumpSerial(tenant, "users");
}

export async function insertLoginUser(input: {
  username: string;
  passwordHash: string;
  role: string;
  companyId: number;
  roleId: number | null;
  salesPersonId: number | null;
}) {
  const username = input.username.trim().toLowerCase();
  await ensureRoleOnMaster(input.roleId);
  const [user] = await masterDb
    .insert(usersTable)
    .values({
      username,
      passwordHash: input.passwordHash,
      role: input.role,
      email: loginEmail(username),
      companyId: input.companyId,
      roleId: input.roleId,
      salesPersonId: await salesPersonIdForMaster(input.salesPersonId, input.companyId),
      isActive: true,
    })
    .returning();
  await bumpSerial(masterPool, "users");
  await mirrorUserToCompany(user, input.salesPersonId);
  return user;
}

export async function updateLoginUser(
  userId: number,
  companyId: number,
  updates: Record<string, unknown>,
) {
  const masterUpdates: Record<string, unknown> = { ...updates, updatedAt: new Date() };
  if ("salesPersonId" in updates) {
    masterUpdates.salesPersonId = await salesPersonIdForMaster(
      updates.salesPersonId as number | null,
      companyId,
    );
  }
  if (typeof updates.roleId === "number") await ensureRoleOnMaster(updates.roleId);
  await masterDb.update(usersTable).set(masterUpdates).where(eq(usersTable.id, userId));
  if (companyDbContext.getStore()) {
    await db.update(usersTable).set({ ...updates, updatedAt: new Date() }).where(eq(usersTable.id, userId));
  }
}

export async function deleteLoginUser(userId: number, username: string) {
  const loginName = username.trim().toLowerCase();
  await masterDb.delete(usersTable).where(sql`lower(${usersTable.username}) = ${loginName}`);
  if (companyDbContext.getStore()) {
    await db.delete(usersTable).where(eq(usersTable.id, userId));
  }
}

export async function loginNameTaken(username: string) {
  const loginName = username.trim().toLowerCase();
  const [onMaster] = await masterDb
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(sql`lower(${usersTable.username}) = ${loginName} OR lower(${usersTable.email}) = ${loginName}`)
    .limit(1);
  if (onMaster) return true;
  if (!companyDbContext.getStore()) return false;
  const [here] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(sql`lower(${usersTable.username}) = ${loginName} OR lower(${usersTable.email}) = ${loginName}`)
    .limit(1);
  return Boolean(here);
}

/** Copy company-database users that login cannot see into the shared database. */
export async function publishCompanyUsersToMaster(companyId: number) {
  if (!companyDbContext.getStore()) return;
  const tenantUsers = await db.select().from(usersTable).where(eq(usersTable.companyId, companyId));
  for (const user of tenantUsers) {
    const loginName = user.username.trim().toLowerCase();
    const [existing] = await masterDb
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(sql`lower(${usersTable.username}) = ${loginName}`)
      .limit(1);
    if (existing) continue;

    await ensureRoleOnMaster(user.roleId);
    const [idTaken] = await masterDb
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.id, user.id))
      .limit(1);
    if (idTaken) {
      logger.warn({ userId: user.id, username: loginName }, "company user id already used on shared database");
      continue;
    }

    await masterDb.insert(usersTable).values({
      id: user.id,
      username: loginName,
      passwordHash: user.passwordHash,
      role: user.role,
      email: loginEmail(loginName, user.email),
      fullName: user.fullName,
      phoneNumber: user.phoneNumber,
      isActive: user.isActive,
      companyId: user.companyId,
      roleId: user.roleId,
      salesPersonId: await salesPersonIdForMaster(user.salesPersonId, companyId),
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
    await bumpSerial(masterPool, "users");

    const links = await db
      .select()
      .from(userCompaniesTable)
      .where(eq(userCompaniesTable.userId, user.id));
    for (const link of links) {
      await upsertAccess(masterDb, link.userId, link.companyId, Array.isArray(link.modules) ? link.modules : []);
    }
  }
}

let publishAll: Promise<void> | null = null;

export function publishAllCompanyUsersToMaster() {
  if (!publishAll) {
    publishAll = (async () => {
      const companies = await masterDb
        .select({ id: companiesTable.id, databaseName: companiesTable.databaseName })
        .from(companiesTable);
      for (const company of companies) {
        if (!company.databaseName) continue;
        try {
          const tenantPool = await openCompanyPool(company.id);
          if (!tenantPool) continue;
          await companyDbContext.run(tenantPool, () => publishCompanyUsersToMaster(company.id));
        } catch (err) {
          logger.warn(
            { companyId: company.id, err: err instanceof Error ? err.message : String(err) },
            "skipped publishing company users for login",
          );
        }
      }
    })().catch((err) => {
      publishAll = null;
      throw err;
    });
  }
  return publishAll;
}
