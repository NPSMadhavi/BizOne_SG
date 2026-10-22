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

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const tables = await c.query(
  `SELECT table_name FROM information_schema.tables
   WHERE table_schema='public' ORDER BY 1`,
);
console.log("all master tables", tables.rows.map((r) => r.table_name));
const spsynet = await c.query(
  `SELECT id, name, slug, database_name FROM companies
   WHERE id = 23 OR lower(name) LIKE '%spsynet%' OR lower(slug) LIKE '%spsynet%'`,
);
console.log("spsynet companies", spsynet.rows);
const users = await c.query(
  `SELECT id, username, company_id, database_name FROM users
   WHERE lower(username) LIKE '%spsynet%' OR company_id = 23`,
);
console.log("spsynet users", users.rows);
await c.end();
