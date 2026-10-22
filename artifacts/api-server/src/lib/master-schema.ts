import pg from "pg";
import { masterPool } from "@workspace/db";
import { logger } from "./logger.js";

/**
 * Tables that belong on the shared master database.
 * Everything else lives on per-company databases (bizone_<slug>).
 */
export const MASTER_TABLES = new Set([
  "companies",
  "users",
  "login_credentials",
  "user_companies",
  "roles",
  "permissions",
  "role_permissions",
  "session",
]);

export function isMasterTable(name: string): boolean {
  return MASTER_TABLES.has(name.toLowerCase());
}

/**
 * True when every company has its own database and master no longer holds
 * business tables (e.g. invoices / stock_items). Startup must skip WMS/ops
 * migrations against master in this mode.
 */
export async function isLeanMasterDirectory(): Promise<boolean> {
  const shared = await masterPool.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM companies
     WHERE database_name IS NULL OR btrim(database_name) = ''`,
  ).catch(() => ({ rows: [{ n: 1 }] }));
  if ((shared.rows[0]?.n ?? 1) > 0) return false;

  const invoices = await masterPool.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'invoices'
     ) AS exists`,
  );
  const stock = await masterPool.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'stock_items'
     ) AS exists`,
  );
  return !invoices.rows[0]?.exists && !stock.rows[0]?.exists;
}

async function columnExists(table: string, column: string): Promise<boolean> {
  const result = await masterPool.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
     ) AS exists`,
    [table, column],
  );
  return Boolean(result.rows[0]?.exists);
}

async function sharedCompanyCount(client: pg.Pool | pg.Client): Promise<number> {
  const result = await client.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM companies
     WHERE database_name IS NULL OR btrim(database_name) = ''`,
  );
  return result.rows[0]?.n ?? 0;
}

/** Ensure master-only columns / tables used for login routing. */
export async function migrateMasterUserDirectory(): Promise<void> {
  await masterPool.query(`CREATE TABLE IF NOT EXISTS login_credentials (
    user_id integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    password_hash text NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`);
  await masterPool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS database_name text`);

  // Move secrets off users before dropping the column (idempotent).
  if (await columnExists("users", "password_hash")) {
    await masterPool.query(
      `INSERT INTO login_credentials (user_id, password_hash, updated_at)
       SELECT id, password_hash, COALESCE(updated_at, now())
       FROM users
       WHERE password_hash IS NOT NULL AND btrim(password_hash) <> ''
       ON CONFLICT (user_id) DO NOTHING`,
    );
  }

  // Point each user at their company's database when the company already has one.
  await masterPool.query(
    `UPDATE users u
     SET database_name = c.database_name
     FROM companies c
     WHERE u.company_id = c.id
       AND c.database_name IS NOT NULL
       AND btrim(c.database_name) <> ''
       AND (u.database_name IS NULL OR btrim(u.database_name) = '')`,
  );

  // Drop password_hash from master users once credentials are copied.
  if (await columnExists("users", "password_hash")) {
    const emptyLeft = await masterPool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM users
       WHERE password_hash IS NOT NULL AND btrim(password_hash) <> ''
         AND id NOT IN (SELECT user_id FROM login_credentials)`,
    );
    if ((emptyLeft.rows[0]?.n ?? 0) === 0) {
      await masterPool.query(`ALTER TABLE users DROP COLUMN IF EXISTS password_hash`);
      logger.info("[master-schema] dropped users.password_hash (moved to login_credentials)");
    } else {
      logger.warn(
        { remaining: emptyLeft.rows[0]?.n },
        "[master-schema] keeping users.password_hash until all hashes are in login_credentials",
      );
    }
  }
}

/**
 * Drop non-company tables from the master DB.
 * Refuses while any company still stores business data on the shared database.
 */
export async function pruneMasterBusinessTables(): Promise<{ dropped: string[]; skipped: string }> {
  const shared = await sharedCompanyCount(masterPool);
  if (shared > 0) {
    const reason = `${shared} compan(ies) still use the shared database — refuse to drop business tables`;
    logger.warn({ shared }, `[master-schema] ${reason}`);
    return { dropped: [], skipped: reason };
  }

  const tables = await masterPool.query<{ table_name: string }>(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
     ORDER BY table_name`,
  );

  const dropped: string[] = [];
  for (const row of tables.rows) {
    const name = row.table_name;
    if (isMasterTable(name)) continue;
    if (!/^[a-z_][a-z0-9_]*$/i.test(name)) continue;
    await masterPool.query(`DROP TABLE IF EXISTS "${name}" CASCADE`);
    dropped.push(name);
  }

  if (dropped.length > 0) {
    logger.info({ count: dropped.length, dropped }, "[master-schema] pruned business tables from master");
  }
  return { dropped, skipped: "" };
}
