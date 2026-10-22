/**
 * READ-ONLY: inspect bizone_spsynet tenant for company 15 vs keep-id (23 or 20).
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

const url = new URL(process.env.DATABASE_URL);
url.pathname = "/bizone_spsynet";
const c = new pg.Client({ connectionString: url.toString() });
await c.connect();

console.log("DB", (await c.query("SELECT current_database() AS db")).rows[0]);

const cos = await c.query(
  `SELECT id, name, email, slug, database_name FROM companies ORDER BY id`,
);
console.log("\n=== ALL COMPANIES IN TENANT ===");
console.table(cos.rows);

const FROM = 15;
const keepCandidates = cos.rows.filter((r) => r.id !== FROM);
console.log("keep candidates", keepCandidates.map((r) => r.id));

for (const TO of [20, 23, 24, ...keepCandidates.map((r) => r.id)]) {
  const exists = cos.rows.some((r) => r.id === TO);
  if (!exists) continue;
  const tables = await c.query(
    `SELECT c.table_name
     FROM information_schema.columns c
     JOIN information_schema.tables t ON t.table_schema=c.table_schema AND t.table_name=c.table_name
     WHERE c.table_schema='public' AND c.column_name='company_id' AND t.table_type='BASE TABLE'
     ORDER BY 1`,
  );
  const rows = [];
  for (const { table_name } of tables.rows) {
    if (!/^[a-z_][a-z0-9_]*$/i.test(table_name)) continue;
    const r = await c.query(
      `SELECT count(*) FILTER (WHERE company_id=$1)::int AS a,
              count(*) FILTER (WHERE company_id=$2)::int AS b
       FROM ${table_name}`,
      [FROM, TO],
    );
    if (r.rows[0].a || r.rows[0].b) {
      rows.push({ table: table_name, c15: r.rows[0].a, [`c${TO}`]: r.rows[0].b, both: r.rows[0].a > 0 && r.rows[0].b > 0 });
    }
  }
  console.log(`\n=== COUNTS 15 vs ${TO} ===`);
  console.table(rows);
  console.log("conflicts", rows.filter((r) => r.both).map((r) => r.table));
}

const roles = await c.query(`SELECT id, name, company_id FROM roles WHERE company_id IN (15,20,23,24) ORDER BY company_id, id`);
console.log("\n=== ROLES ===");
console.table(roles.rows);

const fys = await c.query(`SELECT id, company_id, label, start_date, end_date FROM financial_years WHERE company_id IN (15,20,23,24) ORDER BY company_id`);
console.log("\n=== FY ===");
console.table(fys.rows);

const settings = await c.query(
  `SELECT company_id, id, po_counter, inv_counter, qt_counter, do_counter, grn_counter,
          pi_counter, si_counter, dn_counter, so_counter, pq_counter, fa_counter, bc_counter
   FROM settings WHERE company_id IN (15,20,23,24) ORDER BY company_id`,
);
console.log("\n=== SETTINGS COUNTERS ===");
console.table(settings.rows);

const users = await c.query(
  `SELECT id, username, email, company_id, role_id FROM users ORDER BY id`,
);
console.log("\n=== USERS ===");
console.table(users.rows);

const uc = await c.query(`SELECT * FROM user_companies ORDER BY id`);
console.log("\n=== USER_COMPANIES ===");
console.table(uc.rows);

const fyRefs = await c.query(
  `SELECT 'opening_balances' AS t, count(*)::int AS n FROM opening_balances WHERE financial_year_id IN (SELECT id FROM financial_years WHERE company_id=15)
   UNION ALL SELECT 'bank_opening_balances', count(*)::int FROM bank_opening_balances WHERE financial_year_id IN (SELECT id FROM financial_years WHERE company_id=15)
   UNION ALL SELECT 'customer_opening_balances', count(*)::int FROM customer_opening_balances WHERE financial_year_id IN (SELECT id FROM financial_years WHERE company_id=15)
   UNION ALL SELECT 'vendor_opening_balances', count(*)::int FROM vendor_opening_balances WHERE financial_year_id IN (SELECT id FROM financial_years WHERE company_id=15)
   UNION ALL SELECT 'accounting_backups', count(*)::int FROM accounting_backups WHERE financial_year_id IN (SELECT id FROM financial_years WHERE company_id=15)`,
).catch((e) => ({ rows: [{ error: e.message }] }));
console.log("\n=== FY 15 REFERENCES ===");
console.table(fyRefs.rows);

const roleUserRefs = await c.query(
  `SELECT id, username, company_id, role_id FROM users WHERE role_id IN (SELECT id FROM roles WHERE company_id=15)`,
);
console.log("\n=== USERS ON CO15 ROLES ===");
console.table(roleUserRefs.rows);

await c.end();
