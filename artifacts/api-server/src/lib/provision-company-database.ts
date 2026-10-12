import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

/** Lowercase so PostgreSQL lists it in pgAdmin without quotes. bizone_<slug> */
export function companyDatabaseName(slug: string): string {
  return `bizone_${slug}`;
}

export function normalizeCompanySlug(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function quoteIdent(name: string): string {
  if (!/^bizone_[a-z0-9]+$/.test(name)) {
    throw new Error("Invalid company slug");
  }
  return `"${name}"`;
}

function databaseUrlFor(databaseUrl: string, dbName: string): string {
  const url = new URL(databaseUrl);
  url.pathname = `/${dbName}`;
  return url.toString();
}

function schemaSqlPath(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(here, "../../../../db-scripts/schema-postgres.sql"),
    path.resolve(here, "../../../db-scripts/schema-postgres.sql"),
    path.resolve(process.cwd(), "../../db-scripts/schema-postgres.sql"),
    path.resolve(process.cwd(), "db-scripts/schema-postgres.sql"),
  ];
  const found = candidates.find((file) => fs.existsSync(file));
  if (!found) throw new Error("Company database schema file was not found");
  return found;
}

function ddlOnly(sql: string): string {
  const insertAt = sql.search(/^INSERT\s/m);
  return insertAt === -1 ? sql : sql.slice(0, insertAt);
}

function safePgMessage(err: unknown): string {
  const code = (err as { code?: string })?.code;
  if (code === "42501") return "The database user is not allowed to create databases.";
  if (code === "42P04") return "This slug is already used. Choose another slug.";
  const message = err instanceof Error ? err.message : "";
  if (!message || /password|postgresql:\/\//i.test(message)) {
    return "Company database could not be created";
  }
  return message;
}

/**
 * Create a separate PostgreSQL database named bizone_<slug> when a company signs up.
 * CREATE DATABASE runs on the app's existing connection (not a separate admin login).
 */
export async function provisionCompanyDatabase(slug: string): Promise<string> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("Company database could not be created");

  const normalized = normalizeCompanySlug(slug);
  if (normalized.length < 3) throw new Error("Company slug is required");
  const dbName = companyDatabaseName(normalized);

  const admin = new pg.Client({ connectionString: databaseUrl });
  await admin.connect();
  try {
    const existing = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
    if ((existing.rowCount ?? 0) > 0) {
      throw new Error("This slug is already used. Choose another slug.");
    }
    await admin.query(`CREATE DATABASE ${quoteIdent(dbName)}`);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("This slug")) throw err;
    throw new Error(safePgMessage(err));
  } finally {
    await admin.end();
  }

  const tenant = new pg.Client({ connectionString: databaseUrlFor(databaseUrl, dbName) });
  try {
    await tenant.connect();
    await tenant.query(ddlOnly(fs.readFileSync(schemaSqlPath(), "utf8")));
  } catch (err) {
    // The database itself already exists. Schema copy must not remove it.
    console.error("[signup] company database created but schema copy failed:", safePgMessage(err));
  } finally {
    await tenant.end().catch(() => undefined);
  }

  return dbName;
}

export async function dropCompanyDatabase(dbName: string): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return;
  if (!/^bizone_[a-z0-9]+$/.test(dbName)) return;
  const admin = new pg.Client({ connectionString: databaseUrl });
  await admin.connect();
  try {
    await admin.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [dbName],
    );
    await admin.query(`DROP DATABASE IF EXISTS ${quoteIdent(dbName)}`);
  } finally {
    await admin.end();
  }
}
