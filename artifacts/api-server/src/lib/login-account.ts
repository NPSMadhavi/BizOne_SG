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
import { getLoginPasswordHash, setLoginPasswordHash } from "./login-password.js";
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
  try {
    const [row] = await masterDb
      .select({ id: salesPersonsTable.id, companyId: salesPersonsTable.companyId })
      .from(salesPersonsTable)
      .where(eq(salesPersonsTable.id, salesPersonId))
      .limit(1);
    if (!row || row.companyId !== companyId) return null;
    return row.id;
  } catch {
    return null;
  }
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

async function databaseNameForCompany(companyId: number): Promise<string | null> {
  const [company] = await masterDb
    .select({ databaseName: companiesTable.databaseName })
    .from(companiesTable)
    .where(eq(companiesTable.id, companyId))
    .limit(1);
  const name = company?.databaseName?.trim();
  return name || null;
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

/** Company DBs may still have users.password_hash — keep it in sync via raw SQL. */
async function mirrorUserToCompany(user: UserRow, salesPersonId: number | null, passwordHash?: string | null) {
  const tenant = companyDbContext.getStore();
  if (!tenant) return;
  const hash = passwordHash ?? (await getLoginPasswordHash(user.id)) ?? "";
  const hasPasswordCol = await tenant.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'password_hash'`,
  );
  const withPassword = (hasPasswordCol.rowCount ?? 0) > 0;

  const [existing] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.id, user.id))
    .limit(1);

  if (existing) {
    await tenant.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS database_name text`).catch(() => undefined);

  if (withPassword) {
      await tenant.query(
        `UPDATE users SET
           username = $2, password_hash = $3, role = $4, email = $5, full_name = $6,
           phone_number = $7, is_active = $8, company_id = $9, role_id = $10,
           sales_person_id = $11, database_name = $12, updated_at = now()
         WHERE id = $1`,
        [
          user.id,
          user.username,
          hash,
          user.role,
          user.email,
          user.fullName,
          user.phoneNumber,
          user.isActive,
          user.companyId,
          user.roleId,
          salesPersonId,
          user.databaseName,
        ],
      );
    } else {
      await db
        .update(usersTable)
        .set({
          username: user.username,
          role: user.role,
          email: user.email,
          fullName: user.fullName,
          phoneNumber: user.phoneNumber,
          isActive: user.isActive,
          companyId: user.companyId,
          roleId: user.roleId,
          salesPersonId,
          databaseName: user.databaseName,
          updatedAt: new Date(),
        })
        .where(eq(usersTable.id, user.id));
    }
    return;
  }

  await tenant.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS database_name text`).catch(() => undefined);
  if (withPassword) {
    await tenant.query(
      `INSERT INTO users (
         id, username, password_hash, role, email, full_name, phone_number,
         is_active, company_id, role_id, sales_person_id, database_name, created_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,now())
       ON CONFLICT (id) DO NOTHING`,
      [
        user.id,
        user.username,
        hash,
        user.role,
        user.email,
        user.fullName,
        user.phoneNumber,
        user.isActive,
        user.companyId,
        user.roleId,
        salesPersonId,
        user.databaseName,
        user.createdAt,
      ],
    );
  } else {
    await db.insert(usersTable).values({
      id: user.id,
      username: user.username,
      role: user.role,
      email: user.email,
      fullName: user.fullName,
      phoneNumber: user.phoneNumber,
      isActive: user.isActive,
      companyId: user.companyId,
      roleId: user.roleId,
      salesPersonId,
      databaseName: user.databaseName,
      createdAt: user.createdAt,
    });
  }
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
  const databaseName = await databaseNameForCompany(input.companyId);
  const [user] = await masterDb
    .insert(usersTable)
    .values({
      username,
      databaseName,
      role: input.role,
      email: loginEmail(username),
      companyId: input.companyId,
      roleId: input.roleId,
      salesPersonId: await salesPersonIdForMaster(input.salesPersonId, input.companyId),
      isActive: true,
    })
    .returning();
  await setLoginPasswordHash(user.id, input.passwordHash);
  await bumpSerial(masterPool, "users");
  await mirrorUserToCompany(user, input.salesPersonId, input.passwordHash);
  return user;
}

export async function updateLoginUser(
  userId: number,
  companyId: number,
  updates: Record<string, unknown>,
) {
  const passwordHash =
    typeof updates.passwordHash === "string" ? (updates.passwordHash as string) : undefined;
  const { passwordHash: _drop, ...rest } = updates;
  const masterUpdates: Record<string, unknown> = { ...rest, updatedAt: new Date() };
  if ("salesPersonId" in rest) {
    masterUpdates.salesPersonId = await salesPersonIdForMaster(
      rest.salesPersonId as number | null,
      companyId,
    );
  }
  if (typeof rest.roleId === "number") await ensureRoleOnMaster(rest.roleId);
  if (!("databaseName" in masterUpdates)) {
    const databaseName = await databaseNameForCompany(companyId);
    if (databaseName) masterUpdates.databaseName = databaseName;
  }
  await masterDb.update(usersTable).set(masterUpdates).where(eq(usersTable.id, userId));
  if (passwordHash) await setLoginPasswordHash(userId, passwordHash);

  if (companyDbContext.getStore()) {
    const [user] = await masterDb.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (user) {
      await mirrorUserToCompany(
        user,
        (masterUpdates.salesPersonId as number | null | undefined) ?? user.salesPersonId,
        passwordHash,
      );
    }
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

async function tenantPasswordHash(userId: number, username: string): Promise<string | null> {
  const tenant = companyDbContext.getStore();
  if (!tenant) return null;
  const result = await tenant.query(
    `SELECT password_hash FROM users
     WHERE id = $1 OR lower(username) = $2
     LIMIT 1`,
    [userId, username.trim().toLowerCase()],
  ).catch(() => ({ rows: [] as Array<{ password_hash?: string }> }));
  return (result.rows[0]?.password_hash as string | undefined) ?? null;
}

/** Copy company-database users that login cannot see into the shared database. */
export async function publishCompanyUsersToMaster(companyId: number) {
  if (!companyDbContext.getStore()) return;
  const tenantUsers = await db.select().from(usersTable).where(eq(usersTable.companyId, companyId));
  const databaseName = await databaseNameForCompany(companyId);
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
      databaseName,
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
    const hash = await tenantPasswordHash(user.id, loginName);
    if (hash) await setLoginPasswordHash(user.id, hash);
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
