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

const master = new pg.Client({ connectionString: process.env.DATABASE_URL });
await master.connect();
const co = await master.query(
  `SELECT id, name, slug, database_name FROM companies WHERE id=23 OR name ILIKE '%spsynet%' ORDER BY id`,
);
console.log("master companies", co.rows);

const url = new URL(process.env.DATABASE_URL);
url.pathname = "/bizone_spsynet";
const t = new pg.Client({ connectionString: url.toString() });
await t.connect();
const tables = ["sales_orders", "invoices", "customers", "vendors", "accounts", "expenses", "stock_items"];
for (const table of tables) {
  const exists = await t.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`,
    [table],
  );
  if (!exists.rowCount) {
    console.log(table, "MISSING");
    continue;
  }
  const r = await t.query(
    `SELECT company_id, count(*)::int AS n FROM ${table} GROUP BY 1 ORDER BY 1`,
  );
  console.log(table, r.rows.length ? r.rows : [{ n: 0 }]);
}
const cos = await t.query(`SELECT id, name FROM companies ORDER BY id`);
console.log("tenant companies", cos.rows);
await t.end();
await master.end();
