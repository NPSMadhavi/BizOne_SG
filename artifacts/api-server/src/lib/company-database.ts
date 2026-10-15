import { spawn } from "node:child_process";
import fs from "node:fs";
import pg from "pg";
import { applySalesPosSchema } from "../migrate-drizzle-columns.js";

const prepared = new Map<string, Promise<pg.Pool | null>>();
const pools = new Map<string, pg.Pool>();

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

async function installSchema(tenantUrl: string, databaseUrl: string): Promise<void> {
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
    await copyRows(master, tenant, "users", "company_id = $1", [companyId]);
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

  const meta = await withClient(databaseUrl, async (client) => {
    const result = await client.query("SELECT database_name FROM companies WHERE id = $1", [companyId]);
    return (result.rows[0]?.database_name as string | undefined) ?? "";
  });
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

async function prepareCompanyPool(databaseUrl: string, databaseName: string, companyId: number): Promise<pg.Pool> {
  const tenantUrl = databaseUrlFor(databaseUrl, databaseName);
  const [masterTables, tenantTables] = await Promise.all([
    tableCount(databaseUrl),
    tableCount(tenantUrl).catch(() => 0),
  ]);
  const companyPresent = await withClient(tenantUrl, async (client) => {
    const result = await client.query("SELECT 1 FROM companies WHERE id = $1", [companyId]).catch(() => ({ rowCount: 0 }));
    return (result.rowCount ?? 0) > 0;
  });

  if (!companyPresent && tenantTables + 5 < masterTables) {
    await installSchema(tenantUrl, databaseUrl);
  }
  await copyCompany(databaseUrl, tenantUrl, companyId);

  let pool = pools.get(databaseName);
  if (!pool) {
    pool = new pg.Pool({ connectionString: tenantUrl });
    pools.set(databaseName, pool);
  }
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
  return pool;
}
