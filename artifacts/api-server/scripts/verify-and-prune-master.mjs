/**
 * Verify every company has a tenant DB, then prune business tables from BizoneDB.
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

const DO_PRUNE = process.argv.includes("--prune");

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

const cos = await c.query(
  `SELECT id, name, slug, database_name FROM companies ORDER BY id`,
);
console.log("=== COMPANIES ===");
console.table(cos.rows);

const problems = [];
for (const co of cos.rows) {
  if (!co.database_name) {
    problems.push({ id: co.id, issue: "no database_name" });
    continue;
  }
  const exists = await c.query(`SELECT 1 FROM pg_database WHERE datname=$1`, [co.database_name]);
  if (!exists.rowCount) {
    problems.push({ id: co.id, issue: `DB missing: ${co.database_name}` });
    continue;
  }
  const url = new URL(process.env.DATABASE_URL);
  url.pathname = `/${co.database_name}`;
  const t = new pg.Client({ connectionString: url.toString() });
  await t.connect();
  try {
    const users = await t.query(`SELECT count(*)::int AS n FROM users WHERE company_id=$1`, [co.id]).catch(() => ({
      rows: [{ n: -1 }],
    }));
    const company = await t.query(`SELECT count(*)::int AS n FROM companies WHERE id=$1`, [co.id]);
    console.log(
      `  ${co.database_name}: companies=${company.rows[0].n} users=${users.rows[0].n}`,
    );
  } finally {
    await t.end();
  }
}

if (problems.length) {
  console.log("PROBLEMS", problems);
  await c.end();
  process.exit(1);
}

const shared = await c.query(
  `SELECT count(*)::int AS n FROM companies WHERE database_name IS NULL OR btrim(database_name)=''`,
);
console.log("shared companies:", shared.rows[0].n);

if (!DO_PRUNE) {
  console.log("OK — re-run with --prune to drop non-master tables from BizoneDB");
  await c.end();
  process.exit(0);
}

if (shared.rows[0].n > 0) {
  console.log("REFUSE prune — shared companies remain");
  await c.end();
  process.exit(1);
}

const tables = await c.query(
  `SELECT table_name FROM information_schema.tables
   WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY 1`,
);
const dropped = [];
for (const { table_name } of tables.rows) {
  if (MASTER_TABLES.has(table_name)) continue;
  await c.query(`DROP TABLE IF EXISTS "${table_name}" CASCADE`);
  dropped.push(table_name);
}
console.log("pruned", dropped.length, "tables");
console.log("remaining:", (await c.query(
  `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY 1`,
)).rows.map((r) => r.table_name));

await c.end();
