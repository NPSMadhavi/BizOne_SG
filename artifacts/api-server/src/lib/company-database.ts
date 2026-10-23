import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { applySalesPosSchema, DRIZZLE_TABLE_CREATES } from "../migrate-drizzle-columns.js";
import { migrateOperationsOnPool } from "../migrate-operations-tables.js";

const prepared = new Map<string, Promise<pg.Pool | null>>();
const pools = new Map<string, pg.Pool>();
/** companyId → database_name (avoid master lookup on every API request) */
const companyDbNameCache = new Map<number, string>();
/** database_name → already ran heavy schema heal this process */
const schemaHealed = new Set<string>();
/** database_name → dropped FKs that reference companies(id) (tenant DBs only) */
const companyFksDropped = new Set<string>();
/** `${databaseName}:${companyId}` → company stub row confirmed */
const companyRowEnsured = new Set<string>();

function quoteIdent(name: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(name)) throw new Error("Invalid database identifier");
  return `"${name}"`;
}

function databaseUrlFor(databaseUrl: string, dbName: string): string {
  const url = new URL(databaseUrl);
  url.pathname = `/${dbName}`;
  return url.toString();
}

function redact(text: string): string {
  return text.replace(/postgres(?:ql)?:\/\/\S+/gi, "postgresql://***");
}

function pgDumpBin(): string {
  const candidates = [
    process.env.PG_DUMP_PATH,
    "C:\\Program Files\\PostgreSQL\\18\\bin\\pg_dump.exe",
    "C:\\Program Files\\PostgreSQL\\17\\bin\\pg_dump.exe",
    "pg_dump",
  ].filter((value): value is string => Boolean(value));
  return candidates.find((file) => file === "pg_dump" || fs.existsSync(file)) ?? "pg_dump";
}

function cleanDump(sql: string): string {
  const body = sql
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith("\\"))
    .join("\n")
    .replace(/CREATE SCHEMA public;\s*/g, "")
    .replace(/COMMENT ON SCHEMA public[\s\S]*?;\s*/g, "");
  return `DROP SCHEMA IF EXISTS public CASCADE;\nCREATE SCHEMA public;\n${body}`;
}

async function dumpPublicSchema(databaseUrl: string): Promise<string> {
  const bin = pgDumpBin();
  const stdout = await new Promise<string>((resolve, reject) => {
    const child = spawn(
      bin,
      ["--schema-only", "--no-owner", "--no-privileges", "--schema=public", databaseUrl],
      { windowsHide: true },
    );
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on("data", (chunk) => out.push(chunk));
    child.stderr.on("data", (chunk) => err.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(redact(Buffer.concat(err).toString()) || `pg_dump exited ${code}`));
        return;
      }
      resolve(Buffer.concat(out).toString());
    });
  });
  return cleanDump(stdout);
}

async function withClient<T>(connectionString: string, fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function tableColumns(client: pg.Client, table: string): Promise<Array<{ name: string; udt: string }>> {
  const result = await client.query(
    `SELECT column_name, udt_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1 AND is_generated = 'NEVER'
     ORDER BY ordinal_position`,
    [table],
  );
  return result.rows.map((row) => ({ name: row.column_name as string, udt: row.udt_name as string }));
}

function bindValue(value: unknown, udt: string): unknown {
  if (value == null) return value;
  if (udt === "json" || udt === "jsonb") return JSON.stringify(value);
  return value;
}

/** Copy company users; fill password_hash from login_credentials (master lean directory). */
async function copyUsersWithPasswords(
  master: pg.Client,
  tenant: pg.Client,
  companyId: number,
): Promise<void> {
  const tenantHasPassword = await tenant.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'password_hash'`,
  );
  const masterHasCreds = await master.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'login_credentials'`,
  );
  const useCreds = (tenantHasPassword.rowCount ?? 0) > 0 && (masterHasCreds.rowCount ?? 0) > 0;

  const masterCols = await tableColumns(master, "users");
  const tenantCols = new Map((await tableColumns(tenant, "users")).map((c) => [c.name, c.udt]));
  const columns = masterCols.filter((c) => tenantCols.has(c.name) && /^[a-z_][a-z0-9_]*$/i.test(c.name));
  if (columns.length === 0) return;

  const includePassword = useCreds && tenantCols.has("password_hash") && !columns.some((c) => c.name === "password_hash");
  const insertCols = includePassword
    ? [...columns, { name: "password_hash", udt: tenantCols.get("password_hash") ?? "text" }]
    : columns;

  const rows = await master.query(
    `SELECT ${columns.map((c) => quoteIdent(c.name)).join(", ")} FROM users WHERE company_id = $1`,
    [companyId],
  );
  const credMap = new Map<number, string>();
  if (useCreds) {
    const creds = await master.query(
      `SELECT lc.user_id, lc.password_hash
       FROM login_credentials lc
       JOIN users u ON u.id = lc.user_id
       WHERE u.company_id = $1`,
      [companyId],
    );
    for (const row of creds.rows) {
      credMap.set(row.user_id as number, String(row.password_hash ?? ""));
    }
  }

  for (const row of rows.rows) {
    const values = insertCols.map((column) => {
      if (column.name === "password_hash" && includePassword) {
        return credMap.get(row.id as number) ?? "";
      }
      return bindValue(row[column.name], tenantCols.get(column.name) ?? column.udt);
    });
    const placeholders = insertCols.map((_, index) => `$${index + 1}`).join(", ");
    await tenant.query(
      `INSERT INTO users (${insertCols.map((c) => quoteIdent(c.name)).join(", ")})
       VALUES (${placeholders})
       ON CONFLICT DO NOTHING`,
      values,
    );
    // Also sync password by username when master/tenant user ids differ (restored tenants).
    const hash = credMap.get(row.id as number);
    if (hash && row.username) {
      await tenant.query(
        `UPDATE users SET password_hash = $1, company_id = $2
         WHERE lower(username) = lower($3) AND (password_hash IS NULL OR btrim(password_hash) = '')`,
        [hash, companyId, row.username],
      );
    }
  }
  if (insertCols.some((c) => c.name === "id")) {
    await tenant
      .query(
        `SELECT setval(pg_get_serial_sequence('users', 'id'), GREATEST(COALESCE((SELECT MAX(id) FROM users), 1), 1), true)`,
      )
      .catch(() => undefined);
  }
}

async function copyRows(
  master: pg.Client,
  tenant: pg.Client,
  table: string,
  whereSql: string,
  params: unknown[],
): Promise<void> {
  const masterCols = await tableColumns(master, table);
  const tenantCols = new Map((await tableColumns(tenant, table)).map((column) => [column.name, column.udt]));
  const columns = masterCols.filter((column) => tenantCols.has(column.name) && /^[a-z_][a-z0-9_]*$/i.test(column.name));
  if (columns.length === 0) return;

  const rows = await master.query(
    `SELECT ${columns.map((column) => quoteIdent(column.name)).join(", ")} FROM ${quoteIdent(table)} WHERE ${whereSql}`,
    params,
  );
  for (const row of rows.rows) {
    const values = columns.map((column) => bindValue(row[column.name], tenantCols.get(column.name) ?? column.udt));
    const placeholders = columns.map((_, index) => `$${index + 1}`).join(", ");
    await tenant.query(
      `INSERT INTO ${quoteIdent(table)} (${columns.map((column) => quoteIdent(column.name)).join(", ")}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
      values,
    );
  }
  if (columns.some((column) => column.name === "id")) {
    await tenant.query(
      `SELECT setval(pg_get_serial_sequence($1, 'id'), GREATEST(COALESCE((SELECT MAX(id) FROM ${quoteIdent(table)}), 1), 1), true)`,
      [table],
    ).catch(() => undefined);
  }
}

function schemaSqlPath(): string | null {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(here, "../../../../db-scripts/schema-postgres.sql"),
    path.resolve(here, "../../../db-scripts/schema-postgres.sql"),
    path.resolve(process.cwd(), "../../db-scripts/schema-postgres.sql"),
    path.resolve(process.cwd(), "db-scripts/schema-postgres.sql"),
  ];
  return candidates.find((file) => fs.existsSync(file)) ?? null;
}

function ddlOnly(sql: string): string {
  const insertAt = sql.search(/^INSERT\s/m);
  return insertAt === -1 ? sql : sql.slice(0, insertAt);
}

/**
 * Install the full app schema on a company database.
 * Prefer the checked-in schema file so master can stay lean (company tables only).
 * Fall back to pg_dump of the shared DB when the file is missing.
 */
async function installSchema(tenantUrl: string, databaseUrl: string): Promise<void> {
  const schemaFile = schemaSqlPath();
  if (schemaFile) {
    const sql = ddlOnly(fs.readFileSync(schemaFile, "utf8"));
    await withClient(tenantUrl, async (tenant) => {
      await tenant.query(sql);
    });
    return;
  }
  const sql = await dumpPublicSchema(databaseUrl);
  await withClient(tenantUrl, async (tenant) => {
    await tenant.query(sql);
  });
}

async function copyCompany(masterUrl: string, tenantUrl: string, companyId: number): Promise<void> {
  const master = new pg.Client({ connectionString: masterUrl });
  const tenant = new pg.Client({ connectionString: tenantUrl });
  await master.connect();
  await tenant.connect();
  try {
    await tenant.query("SET session_replication_role = replica").catch(() => undefined);
    await copyRows(master, tenant, "companies", "id = $1", [companyId]);
    const catalog = await tenant.query("SELECT 1 FROM permissions LIMIT 1").then(() => true).catch(() => false);
    if (catalog) {
      const empty = await tenant.query("SELECT 1 FROM permissions LIMIT 1");
      if ((empty.rowCount ?? 0) === 0) {
        await copyRows(master, tenant, "permissions", "true", []);
      }
    }
    await copyRows(master, tenant, "roles", "company_id = $1", [companyId]);
    await copyRows(
      master,
      tenant,
      "role_permissions",
      "role_id IN (SELECT id FROM roles WHERE company_id = $1)",
      [companyId],
    );
    // Master users have no password_hash (login_credentials). Tenant still requires it.
    await tenant
      .query(`ALTER TABLE users ALTER COLUMN password_hash SET DEFAULT ''`)
      .catch(() => undefined);
    await tenant
      .query(`ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL`)
      .catch(() => undefined);
    await copyUsersWithPasswords(master, tenant, companyId);
    await copyRows(master, tenant, "user_companies", "company_id = $1", [companyId]);
    await copyRows(master, tenant, "settings", "company_id = $1", [companyId]);

    const tables = await master.query(
      `SELECT c.table_name
       FROM information_schema.columns c
       JOIN information_schema.tables t
         ON t.table_schema = c.table_schema AND t.table_name = c.table_name
       WHERE c.table_schema = 'public'
         AND c.column_name = 'company_id'
         AND t.table_type = 'BASE TABLE'
         AND c.table_name NOT IN ('companies', 'roles', 'users', 'user_companies', 'settings', 'role_permissions')
       ORDER BY c.table_name`,
    );
    for (const row of tables.rows) {
      const table = row.table_name as string;
      if (!/^[a-z_][a-z0-9_]*$/i.test(table)) continue;
      const present = await tenant.query("SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1", [table]);
      if ((present.rowCount ?? 0) === 0) continue;
      await copyRows(master, tenant, table, "company_id = $1", [companyId]);
    }
  } finally {
    await tenant.query("SET session_replication_role = origin").catch(() => undefined);
    await tenant.end();
    await master.end();
  }
}

async function tableCount(connectionString: string): Promise<number> {
  return withClient(connectionString, async (client) => {
    const result = await client.query(
      "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'",
    );
    return result.rows[0].n as number;
  });
}

/**
 * Make sure a company's PostgreSQL database has the app schema and only that company's rows.
 * Returns null when this company still uses the shared database.
 */
export async function openCompanyPool(companyId: number): Promise<pg.Pool | null> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return null;

  let meta = companyDbNameCache.get(companyId) ?? "";
  if (!meta) {
    meta = await withClient(databaseUrl, async (client) => {
      const result = await client.query("SELECT database_name FROM companies WHERE id = $1", [companyId]);
      return (result.rows[0]?.database_name as string | undefined) ?? "";
    });
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(meta)) {
      companyDbNameCache.set(companyId, meta);
    }
  }
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(meta)) return null;

  const existing = prepared.get(meta);
  if (existing) return existing;

  const pending = prepareCompanyPool(databaseUrl, meta, companyId);
  prepared.set(meta, pending);
  try {
    return await pending;
  } catch (err) {
    prepared.delete(meta);
    throw err;
  }
}

async function tenantLooksReady(pool: pg.Pool, companyId: number): Promise<boolean> {
  try {
    const result = await pool.query<{ ok: boolean }>(
      `SELECT (
         to_regclass('public.employees') IS NOT NULL
         AND to_regclass('public.financial_years') IS NOT NULL
         AND to_regclass('public.settings') IS NOT NULL
         AND EXISTS (SELECT 1 FROM companies WHERE id = $1)
       ) AS ok`,
      [companyId],
    );
    return Boolean(result.rows[0]?.ok);
  } catch {
    return false;
  }
}

/**
 * Tenant DBs keep a stub companies row for legacy FKs, but the source of truth is master.
 * Missing rows (or stale schemaHealed) cause inserts like customers to fail with 23503.
 */
async function ensureTenantCompanyRow(
  pool: pg.Pool,
  masterUrl: string,
  databaseName: string,
  companyId: number,
): Promise<void> {
  const ensuredKey = `${databaseName}:${companyId}`;
  if (companyRowEnsured.has(ensuredKey)) return;

  const present = await pool.query("SELECT 1 FROM companies WHERE id = $1", [companyId]).catch(() => ({ rowCount: 0 }));
  if ((present.rowCount ?? 0) > 0) {
    companyRowEnsured.add(ensuredKey);
    return;
  }

  const master = new pg.Client({ connectionString: masterUrl });
  await master.connect();
  const tenant = await pool.connect();
  try {
    await tenant.query("SET session_replication_role = replica").catch(() => undefined);
    await copyRows(master, tenant, "companies", "id = $1", [companyId]);
    const again = await tenant.query("SELECT 1 FROM companies WHERE id = $1", [companyId]);
    if ((again.rowCount ?? 0) === 0) {
      // Master missing this company (stale session) — insert a minimal stub so FK inserts work.
      await tenant.query(
        `INSERT INTO companies (id, name, country, slug, database_name)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO NOTHING`,
        [companyId, `Company ${companyId}`, "Singapore", `company-${companyId}`, databaseName],
      );
    }
    companyRowEnsured.add(ensuredKey);
  } finally {
    await tenant.query("SET session_replication_role = origin").catch(() => undefined);
    tenant.release();
    await master.end();
  }
}

/**
 * Per-company databases should not enforce FKs to companies(id) / users(id) from master.
 * Companies + login users live on master; tenant user ids often differ after restore/copy,
 * which breaks inserts (warehouses.created_by, stock items, etc.).
 */
async function dropTenantCompanyForeignKeys(
  pool: pg.Pool,
  databaseName: string,
  force = false,
): Promise<void> {
  if (!force && companyFksDropped.has(databaseName)) return;
  try {
    const { rows } = await pool.query<{ conname: string; table_name: string }>(
      `SELECT c.conname, c.conrelid::regclass::text AS table_name
       FROM pg_constraint c
       JOIN pg_class rel ON rel.oid = c.confrelid
       JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
       WHERE c.contype = 'f'
         AND nsp.nspname = 'public'
         AND rel.relname IN ('companies', 'users')`,
    );
    for (const row of rows) {
      if (!/^[a-z0-9_."]+$/i.test(row.table_name) || !/^[a-z_][a-z0-9_]*$/i.test(row.conname)) continue;
      await pool
        .query(`ALTER TABLE ${row.table_name} DROP CONSTRAINT IF EXISTS ${quoteIdent(row.conname)}`)
        .catch(() => undefined);
    }
  } catch {
    /* ignore — older tenants may lack catalog access */
  }
  companyFksDropped.add(databaseName);
}

async function prepareCompanyPool(databaseUrl: string, databaseName: string, companyId: number): Promise<pg.Pool> {
  const tenantUrl = databaseUrlFor(databaseUrl, databaseName);

  let pool = pools.get(databaseName);
  if (!pool) {
    pool = new pg.Pool({
      connectionString: tenantUrl,
      max: 10,
      idleTimeoutMillis: 30_000,
    });
    pools.set(databaseName, pool);
  }

  // Always keep company stub + drop legacy FKs (cheap); then maybe skip heavy heal.
  await dropTenantCompanyForeignKeys(pool, databaseName);
  await ensureTenantCompanyRow(pool, databaseUrl, databaseName, companyId);

  // Fast path: tenant already has company row + core tables — skip copy/DDL heal.
  if (schemaHealed.has(databaseName) || (await tenantLooksReady(pool, companyId))) {
    schemaHealed.add(databaseName);
    return pool;
  }

  const [masterTables, tenantTables] = await Promise.all([
    tableCount(databaseUrl),
    tableCount(tenantUrl).catch(() => 0),
  ]);
  const companyPresent = await withClient(tenantUrl, async (client) => {
    const result = await client.query("SELECT 1 FROM companies WHERE id = $1", [companyId]).catch(() => ({ rowCount: 0 }));
    return (result.rowCount ?? 0) > 0;
  });

  // Company DBs must always get the full schema (not the lean master table set).
  if (!companyPresent && (tenantTables < 20 || tenantTables + 5 < masterTables)) {
    await installSchema(tenantUrl, databaseUrl);
  }
  // Only copy directory rows when the company row is missing (avoid re-copy every boot).
  if (!companyPresent) {
    await copyCompany(databaseUrl, tenantUrl, companyId);
  }
  await withClient(tenantUrl, async (tenant) => {
    await tenant.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS database_name text`).catch(() => undefined);
  });

  await pool.query(`CREATE TABLE IF NOT EXISTS ir8a_employers (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL,
    employer_name TEXT NOT NULL,
    uen TEXT NOT NULL,
    address TEXT NOT NULL,
    signatory_name TEXT NOT NULL,
    designation TEXT NOT NULL,
    declaration_date DATE,
    signature TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS ir8a_employers_company_id_idx ON ir8a_employers (company_id)`);
  await applySalesPosSchema((statement) => pool.query(statement));
  // Keep tenant DBs aligned with shared-schema document tables (e.g. vendor_proforma_invoices).
  for (const statement of DRIZZLE_TABLE_CREATES) {
    try {
      await pool.query(statement);
    } catch {
      /* IF NOT EXISTS / already-aligned — ignore benign failures */
    }
  }
  // Lean master skips operations migrations — HR tables (employees, etc.) must exist on each tenant.
  try {
    await migrateOperationsOnPool(pool);
  } catch (err) {
    console.error(
      "[company-database] operations schema heal failed:",
      err instanceof Error ? err.message : err,
    );
  }
  // Lean master skips startup FY migrations — every tenant DB must still have these tables.
  for (const stmt of [
    `CREATE TABLE IF NOT EXISTS financial_years (
      id serial PRIMARY KEY,
      company_id integer NOT NULL,
      label text NOT NULL,
      start_date text NOT NULL,
      end_date text NOT NULL,
      status text NOT NULL DEFAULT 'inactive',
      audit_status text NOT NULL DEFAULT 'pending',
      closed_at timestamptz,
      closed_by integer,
      closed_by_username text,
      activated_at timestamptz,
      activated_by integer,
      activated_by_username text,
      reopened_at timestamptz,
      reopened_by integer,
      opening_balances_generated boolean NOT NULL DEFAULT false,
      opening_journal_entry_id integer,
      created_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS financial_years_company_dates_uidx
      ON financial_years (company_id, start_date, end_date)`,
    `CREATE TABLE IF NOT EXISTS opening_balances (
      id serial PRIMARY KEY,
      company_id integer NOT NULL,
      financial_year_id integer NOT NULL,
      account_id integer,
      account_code text NOT NULL,
      account_name text NOT NULL,
      account_type text,
      debit numeric(15,2) NOT NULL DEFAULT 0,
      credit numeric(15,2) NOT NULL DEFAULT 0,
      notes text,
      created_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS customer_opening_balances (
      id serial PRIMARY KEY,
      company_id integer NOT NULL,
      financial_year_id integer NOT NULL,
      customer_id integer,
      customer_name text NOT NULL,
      amount numeric(15,2) NOT NULL DEFAULT 0,
      currency text NOT NULL DEFAULT 'SGD',
      created_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS vendor_opening_balances (
      id serial PRIMARY KEY,
      company_id integer NOT NULL,
      financial_year_id integer NOT NULL,
      vendor_id integer,
      vendor_name text NOT NULL,
      amount numeric(15,2) NOT NULL DEFAULT 0,
      currency text NOT NULL DEFAULT 'SGD',
      created_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS inventory_opening_balances (
      id serial PRIMARY KEY,
      company_id integer NOT NULL,
      financial_year_id integer NOT NULL,
      stock_item_id integer,
      item_code text,
      item_name text NOT NULL,
      warehouse_id integer,
      warehouse_name text,
      quantity numeric(15,4) NOT NULL DEFAULT 0,
      value numeric(15,2) NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS fixed_asset_opening_balances (
      id serial PRIMARY KEY,
      company_id integer NOT NULL,
      financial_year_id integer NOT NULL,
      account_code text,
      description text NOT NULL,
      amount numeric(15,2) NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS bank_opening_balances (
      id serial PRIMARY KEY,
      company_id integer NOT NULL,
      financial_year_id integer NOT NULL,
      account_id integer,
      account_code text NOT NULL,
      account_name text NOT NULL,
      amount numeric(15,2) NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now()
    )`,
    // settings columns that schema-postgres.sql may lack (drizzle inserts all of them)
    `ALTER TABLE settings ADD COLUMN IF NOT EXISTS company_id integer`,
    `ALTER TABLE settings ADD COLUMN IF NOT EXISTS gst_rate numeric(5,2) NOT NULL DEFAULT 9`,
    `ALTER TABLE settings ADD COLUMN IF NOT EXISTS smtp_host text`,
    `ALTER TABLE settings ADD COLUMN IF NOT EXISTS smtp_port text`,
    `ALTER TABLE settings ADD COLUMN IF NOT EXISTS smtp_user text`,
    `ALTER TABLE settings ADD COLUMN IF NOT EXISTS smtp_pass text`,
    `ALTER TABLE settings ADD COLUMN IF NOT EXISTS smtp_from text`,
    `ALTER TABLE settings ADD COLUMN IF NOT EXISTS po_prefix text DEFAULT 'PO'`,
    `ALTER TABLE settings ADD COLUMN IF NOT EXISTS po_counter integer NOT NULL DEFAULT 0`,
    `ALTER TABLE settings ADD COLUMN IF NOT EXISTS po_suffix text DEFAULT ''`,
    `ALTER TABLE settings ADD COLUMN IF NOT EXISTS pq_prefix text DEFAULT 'PQ'`,
    `ALTER TABLE settings ADD COLUMN IF NOT EXISTS pq_counter integer NOT NULL DEFAULT 0`,
    `ALTER TABLE settings ADD COLUMN IF NOT EXISTS pq_suffix text DEFAULT ''`,
    `ALTER TABLE settings ADD COLUMN IF NOT EXISTS inv_prefix text DEFAULT 'INV'`,
    `ALTER TABLE settings ADD COLUMN IF NOT EXISTS inv_counter integer NOT NULL DEFAULT 0`,
    `ALTER TABLE settings ADD COLUMN IF NOT EXISTS inv_suffix text DEFAULT ''`,
    `ALTER TABLE settings ADD COLUMN IF NOT EXISTS qt_prefix text DEFAULT 'QT'`,
    `ALTER TABLE settings ADD COLUMN IF NOT EXISTS qt_counter integer NOT NULL DEFAULT 0`,
    `ALTER TABLE settings ADD COLUMN IF NOT EXISTS qt_suffix text DEFAULT ''`,
    `ALTER TABLE settings ADD COLUMN IF NOT EXISTS do_prefix text DEFAULT 'DO'`,
    `ALTER TABLE settings ADD COLUMN IF NOT EXISTS do_counter integer NOT NULL DEFAULT 0`,
    `ALTER TABLE settings ADD COLUMN IF NOT EXISTS do_suffix text DEFAULT ''`,
    `ALTER TABLE settings ADD COLUMN IF NOT EXISTS so_prefix text DEFAULT 'SO'`,
    `ALTER TABLE settings ADD COLUMN IF NOT EXISTS so_counter integer NOT NULL DEFAULT 0`,
    `ALTER TABLE settings ADD COLUMN IF NOT EXISTS so_suffix text DEFAULT ''`,
    `ALTER TABLE settings ADD COLUMN IF NOT EXISTS grn_prefix text DEFAULT 'GRN'`,
    `ALTER TABLE settings ADD COLUMN IF NOT EXISTS grn_counter integer NOT NULL DEFAULT 0`,
    `ALTER TABLE settings ADD COLUMN IF NOT EXISTS grn_suffix text DEFAULT ''`,
    `ALTER TABLE settings ADD COLUMN IF NOT EXISTS cn_prefix text DEFAULT 'CN'`,
    `ALTER TABLE settings ADD COLUMN IF NOT EXISTS cn_counter integer NOT NULL DEFAULT 0`,
    `ALTER TABLE settings ADD COLUMN IF NOT EXISTS cn_suffix text DEFAULT ''`,
    `ALTER TABLE settings ADD COLUMN IF NOT EXISTS dn_prefix text DEFAULT 'DN'`,
    `ALTER TABLE settings ADD COLUMN IF NOT EXISTS dn_counter integer NOT NULL DEFAULT 0`,
    `ALTER TABLE settings ADD COLUMN IF NOT EXISTS dn_suffix text DEFAULT ''`,
    `ALTER TABLE settings ADD COLUMN IF NOT EXISTS pi_prefix text DEFAULT 'PI'`,
    `ALTER TABLE settings ADD COLUMN IF NOT EXISTS pi_counter integer NOT NULL DEFAULT 0`,
    `ALTER TABLE settings ADD COLUMN IF NOT EXISTS pi_suffix text DEFAULT ''`,
    `ALTER TABLE settings ADD COLUMN IF NOT EXISTS vpi_prefix text DEFAULT 'VPI'`,
    `ALTER TABLE settings ADD COLUMN IF NOT EXISTS vpi_counter integer NOT NULL DEFAULT 0`,
    `ALTER TABLE settings ADD COLUMN IF NOT EXISTS vpi_suffix text DEFAULT ''`,
    `ALTER TABLE settings ADD COLUMN IF NOT EXISTS pv_prefix text DEFAULT 'PV'`,
    `ALTER TABLE settings ADD COLUMN IF NOT EXISTS pv_counter integer NOT NULL DEFAULT 0`,
    `ALTER TABLE settings ADD COLUMN IF NOT EXISTS pv_suffix text DEFAULT ''`,
    `ALTER TABLE settings ADD COLUMN IF NOT EXISTS si_prefix text DEFAULT 'STK'`,
    `ALTER TABLE settings ADD COLUMN IF NOT EXISTS si_counter integer NOT NULL DEFAULT 0`,
    `ALTER TABLE settings ADD COLUMN IF NOT EXISTS si_suffix text DEFAULT ''`,
    `ALTER TABLE settings ADD COLUMN IF NOT EXISTS igr_prefix text DEFAULT 'IGR'`,
    `ALTER TABLE settings ADD COLUMN IF NOT EXISTS igr_counter integer NOT NULL DEFAULT 0`,
    `ALTER TABLE settings ADD COLUMN IF NOT EXISTS igr_suffix text DEFAULT ''`,
    `ALTER TABLE settings ADD COLUMN IF NOT EXISTS gin_prefix text DEFAULT 'GIN'`,
    `ALTER TABLE settings ADD COLUMN IF NOT EXISTS gin_counter integer NOT NULL DEFAULT 0`,
    `ALTER TABLE settings ADD COLUMN IF NOT EXISTS gin_suffix text DEFAULT ''`,
    `ALTER TABLE settings ADD COLUMN IF NOT EXISTS st_prefix text DEFAULT 'ST'`,
    `ALTER TABLE settings ADD COLUMN IF NOT EXISTS st_counter integer NOT NULL DEFAULT 0`,
    `ALTER TABLE settings ADD COLUMN IF NOT EXISTS st_suffix text DEFAULT ''`,
    `ALTER TABLE settings ADD COLUMN IF NOT EXISTS sa_prefix text DEFAULT 'SA'`,
    `ALTER TABLE settings ADD COLUMN IF NOT EXISTS sa_counter integer NOT NULL DEFAULT 0`,
    `ALTER TABLE settings ADD COLUMN IF NOT EXISTS sa_suffix text DEFAULT ''`,
    `ALTER TABLE settings ADD COLUMN IF NOT EXISTS fa_prefix text DEFAULT 'FA'`,
    `ALTER TABLE settings ADD COLUMN IF NOT EXISTS fa_counter integer NOT NULL DEFAULT 0`,
    `ALTER TABLE settings ADD COLUMN IF NOT EXISTS fa_suffix text DEFAULT ''`,
    `ALTER TABLE settings ADD COLUMN IF NOT EXISTS bc_prefix text DEFAULT 'BC'`,
    `ALTER TABLE settings ADD COLUMN IF NOT EXISTS bc_counter integer NOT NULL DEFAULT 0`,
    `ALTER TABLE settings ADD COLUMN IF NOT EXISTS bc_suffix text DEFAULT ''`,
    `ALTER TABLE settings ADD COLUMN IF NOT EXISTS allow_negative_stock boolean NOT NULL DEFAULT false`,
    `ALTER TABLE settings ADD COLUMN IF NOT EXISTS auto_deduct_on_do boolean NOT NULL DEFAULT false`,
    `ALTER TABLE settings ADD COLUMN IF NOT EXISTS low_stock_warning numeric(15,3) DEFAULT 0`,
    `ALTER TABLE settings ADD COLUMN IF NOT EXISTS default_uom text DEFAULT 'pcs'`,
    `ALTER TABLE settings ADD COLUMN IF NOT EXISTS bank_details text`,
    `ALTER TABLE settings ADD COLUMN IF NOT EXISTS terms_and_conditions text`,
    `ALTER TABLE settings ADD COLUMN IF NOT EXISTS quotation_terms text`,
    `ALTER TABLE settings ADD COLUMN IF NOT EXISTS default_verifier_id integer`,
    `ALTER TABLE settings ADD COLUMN IF NOT EXISTS default_approver_id integer`,
    `ALTER TABLE settings ADD COLUMN IF NOT EXISTS default_paid_by_id integer`,
    `CREATE UNIQUE INDEX IF NOT EXISTS vendor_proforma_invoices_company_vpi_number_unique ON vendor_proforma_invoices (company_id, vpi_number)`,
  ]) {
    try {
      await pool.query(stmt);
    } catch {
      /* ignore */
    }
  }
  // Migrations / CREATE TABLE may re-add companies(id) FKs — drop again after heal.
  await dropTenantCompanyForeignKeys(pool, databaseName, true);
  await ensureTenantCompanyRow(pool, databaseUrl, databaseName, companyId);
  schemaHealed.add(databaseName);
  return pool;
}
