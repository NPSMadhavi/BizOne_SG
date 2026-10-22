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
const d = await c.query(
  `SELECT datname FROM pg_database WHERE datname ILIKE '%bizone%' OR datistemplate = false ORDER BY 1`,
);
console.log("databases:", d.rows.map((r) => r.datname));
const m = await c.query(
  `SELECT id, name, email, database_name FROM companies
   WHERE id IN (15,20,23,24) OR email ILIKE '%spsynet%' OR name ILIKE '%sysnet%'
   ORDER BY id`,
);
console.log("companies:", m.rows);
await c.end();
