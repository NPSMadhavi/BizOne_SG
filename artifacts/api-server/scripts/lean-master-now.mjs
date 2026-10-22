/**
 * Force lean master: drop every non-directory table from BizoneDB,
 * ensure every company has slug + database_name pointing at bizone_<slug>.
 */
import pg from "pg";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const line of fs.readFileSync(path.join(root, ".env"), "utf8").split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("=");
  if (eq <= 0) continue;
  const k = t.slice(0, eq).trim();
  let v = t.slice(eq + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  if (!process.env[k]) process.env[k] = v;
}

const MASTER_TABLES = new Set([
  "companies",
  "users",
  "login_credentials",
  "user_companies",
  "roles",
  "permissions",
  "role_permissions",
  "session",
]);

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
console.log("DB", (await c.query("SELECT current_database() AS d")).rows[0].d);

// Ensure directory objects exist
await c.query(`CREATE TABLE IF NOT EXISTS login_credentials (
  user_id integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  password_hash text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
)`);
await c.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS slug text`);
await c.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS database_name text`);
await c.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS database_name text`);
await c.query(
  `CREATE UNIQUE INDEX IF NOT EXISTS companies_slug_unique ON companies (slug) WHERE slug IS NOT NULL`,
);

const before = await c.query(
  `SELECT table_name FROM information_schema.tables
   WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY 1`,
);
console.log("tables BEFORE prune:", before.rows.map((r) => r.table_name));

const dropped = [];
for (const { table_name } of before.rows) {
  if (MASTER_TABLES.has(table_name)) continue;
  await c.query(`DROP TABLE IF EXISTS "${table_name}" CASCADE`);
  dropped.push(table_name);
}
console.log("dropped", dropped.length, dropped);

const after = await c.query(
  `SELECT table_name FROM information_schema.tables
   WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY 1`,
);
console.log("tables AFTER (master only):", after.rows.map((r) => r.table_name));

const cos = await c.query(
  `SELECT id, name, slug, database_name FROM companies ORDER BY id`,
);
console.log("\n=== company → tenant DB links ===");
const links = [];
for (const co of cos.rows) {
  const dbName = co.database_name;
  let ok = false;
  if (dbName) {
    const exists = await c.query(`SELECT 1 FROM pg_database WHERE datname=$1`, [dbName]);
    ok = (exists.rowCount ?? 0) > 0;
  }
  links.push({
    id: co.id,
    name: co.name,
    slug: co.slug,
    database_name: dbName,
    db_exists: ok,
  });
}
console.table(links);

const missing = links.filter((l) => !l.db_exists);
if (missing.length) {
  console.log("WARNING: companies without live tenant DB:", missing);
} else {
  console.log("OK: every company row points at an existing bizone_* database");
}

await c.end();
