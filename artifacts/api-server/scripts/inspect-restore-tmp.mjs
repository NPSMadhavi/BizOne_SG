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
url.pathname = "/bizone_spsynet_restore_tmp";
const c = new pg.Client({ connectionString: url.toString() });
await c.connect();
const n = await c.query(
  `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'`,
);
console.log("tables", n.rows[0].n);
console.table((await c.query(`SELECT id, name, email, database_name FROM companies ORDER BY id`)).rows);
console.table((await c.query(`SELECT id, username, company_id, role_id FROM users ORDER BY id`)).rows);
for (const table of [
  "sales_orders",
  "accounts",
  "customers",
  "vendors",
  "stock_items",
  "employees",
  "assets",
  "purchase_quotations",
  "audit_logs",
  "settings",
]) {
  const r = await c.query(
    `SELECT company_id, count(*)::int AS n FROM ${table} GROUP BY 1 ORDER BY 1`,
  ).catch((e) => ({ rows: [{ error: e.message }] }));
  console.log(table, r.rows);
}
const settings = await c.query(
  `SELECT company_id, so_counter, inv_counter, po_counter, do_counter, pq_counter FROM settings ORDER BY company_id`,
);
console.log("settings", settings.rows);
await c.end();
