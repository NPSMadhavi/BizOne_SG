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
url.pathname = "/bizone_spsysnet";
const c = new pg.Client({ connectionString: url.toString() });
await c.connect();
console.log("DB", (await c.query("SELECT current_database() AS db")).rows[0]);
console.table((await c.query("SELECT id, name, email, database_name FROM companies ORDER BY id")).rows);

const tables = await c.query(
  `SELECT c.table_name FROM information_schema.columns c
   JOIN information_schema.tables t ON t.table_schema=c.table_schema AND t.table_name=c.table_name
   WHERE c.table_schema='public' AND c.column_name='company_id' AND t.table_type='BASE TABLE' ORDER BY 1`,
);
const ids = [15, 20, 23, 24];
const out = [];
for (const { table_name } of tables.rows) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(table_name)) continue;
  const parts = ids.map((_, i) => `count(*) FILTER (WHERE company_id=$${i + 1})::int AS c${ids[i]}`).join(", ");
  const r = await c.query(`SELECT ${parts} FROM ${table_name}`, ids);
  const row = { table: table_name, ...r.rows[0] };
  if (ids.some((id) => row[`c${id}`] > 0)) out.push(row);
}
console.table(out);
console.table((await c.query("SELECT id,name,company_id FROM roles WHERE company_id IN (15,20,23,24) ORDER BY company_id,id")).rows);
console.table(
  (
    await c.query(
      `SELECT company_id, po_counter, inv_counter, so_counter, do_counter, pq_counter, qt_counter, grn_counter, pi_counter, si_counter, dn_counter, fa_counter, bc_counter
       FROM settings WHERE company_id IN (15,20,23,24)`,
    )
  ).rows,
);
console.table((await c.query("SELECT id,username,company_id,role_id FROM users ORDER BY id")).rows);
console.table((await c.query("SELECT * FROM user_companies")).rows);
await c.end();
