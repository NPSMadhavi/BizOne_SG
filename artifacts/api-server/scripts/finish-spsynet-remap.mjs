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

const url = new URL(process.env.DATABASE_URL);
url.pathname = "/bizone_spsynet";
const t = new pg.Client({ connectionString: url.toString() });
await t.connect();
await t.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS database_name text`);
await t.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS slug text`);
await t.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS database_name text`);
await t.query(
  `UPDATE users SET company_id = 23 WHERE company_id = 15 OR lower(username) = 'spsynet@gmail.com'`,
);
await t.query(`UPDATE users SET database_name = 'bizone_spsynet'`);
await t.query(
  `UPDATE companies SET name = 'Spsynet', slug = 'spsynet', database_name = 'bizone_spsynet', email = 'spsynet@gmail.com' WHERE id = 23`,
);
try {
  await t.query(`DELETE FROM companies WHERE id = 15`);
} catch (e) {
  console.log("del company 15:", e.message);
}
console.log("SO", (await t.query(`SELECT company_id, count(*)::int n FROM sales_orders GROUP BY 1`)).rows);
console.log("INV", (await t.query(`SELECT company_id, count(*)::int n FROM invoices GROUP BY 1`)).rows);
console.log("ACC", (await t.query(`SELECT company_id, count(*)::int n FROM accounts GROUP BY 1`)).rows);
console.log("users", (await t.query(`SELECT id, username, company_id FROM users`)).rows);
console.log("cos", (await t.query(`SELECT id, name, slug, database_name FROM companies`)).rows);
await t.end();

const m = new pg.Client({ connectionString: process.env.DATABASE_URL });
await m.connect();
await m.query(
  `UPDATE companies SET slug = 'spsynet', database_name = 'bizone_spsynet', name = 'Spsynet' WHERE id = 23`,
);
await m.query(
  `UPDATE users SET company_id = 23, database_name = 'bizone_spsynet' WHERE lower(username) = 'spsynet@gmail.com'`,
);
// Ensure login password exists for user
const u = await m.query(
  `SELECT id, username, company_id, database_name FROM users WHERE lower(username) = 'spsynet@gmail.com'`,
);
console.log("master user", u.rows);
if (u.rows[0]) {
  const cred = await m.query(`SELECT 1 FROM login_credentials WHERE user_id = $1`, [u.rows[0].id]);
  console.log("has login_credentials", Boolean(cred.rowCount));
}
await m.end();
console.log("DONE");
