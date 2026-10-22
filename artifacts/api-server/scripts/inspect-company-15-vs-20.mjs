/**
 * READ-ONLY inspection: Company 15 vs Company 20 consolidation prep.
 * No mutations.
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

const FROM = Number(process.env.FROM_COMPANY_ID || 15);
const TO = Number(process.env.TO_COMPANY_ID || 20);

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

const dbName = await c.query("SELECT current_database() AS db, inet_server_addr() AS host");
console.log("=== CONNECTION ===");
console.log(dbName.rows[0]);

const cos = await c.query(
  `SELECT id, name, email, slug, database_name, created_at
   FROM companies
   WHERE id IN ($1, $2)
      OR lower(coalesce(email,'')) LIKE '%spsynet%'
      OR lower(coalesce(name,'')) LIKE '%spsynet%'
      OR lower(coalesce(name,'')) LIKE '%sysnet%'
   ORDER BY id`,
  [FROM, TO],
);
console.log("\n=== RELATED COMPANIES ===");
console.table(cos.rows);

const tables = await c.query(
  `SELECT c.table_name
   FROM information_schema.columns c
   JOIN information_schema.tables t
     ON t.table_schema = c.table_schema AND t.table_name = c.table_name
   WHERE c.table_schema = 'public'
     AND c.column_name = 'company_id'
     AND t.table_type = 'BASE TABLE'
   ORDER BY c.table_name`,
);
console.log("\n=== company_id TABLE COUNTS ===");
const rows = [];
for (const { table_name } of tables.rows) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(table_name)) continue;
  const r = await c.query(
    `SELECT
       count(*) FILTER (WHERE company_id = $1)::int AS c15,
       count(*) FILTER (WHERE company_id = $2)::int AS c20
     FROM ${table_name}`,
    [FROM, TO],
  );
  const c15 = r.rows[0].c15;
  const c20 = r.rows[0].c20;
  if (c15 > 0 || c20 > 0) {
    rows.push({ table_name, company_15_count: c15, company_20_count: c20, both: c15 > 0 && c20 > 0 });
  }
}
console.table(rows);

console.log("\n=== BOTH-HAVE-DATA (conflicts) ===");
console.table(rows.filter((r) => r.both));

const fks = await c.query(
  `SELECT
     tc.table_name,
     kcu.column_name,
     ccu.table_name AS foreign_table,
     ccu.column_name AS foreign_column,
     tc.constraint_name
   FROM information_schema.table_constraints tc
   JOIN information_schema.key_column_usage kcu
     ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
   JOIN information_schema.constraint_column_usage ccu
     ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
   WHERE tc.constraint_type = 'FOREIGN KEY'
     AND tc.table_schema = 'public'
     AND (
       ccu.table_name = 'companies'
       OR ccu.table_name IN ('roles', 'financial_years', 'settings', 'users')
       OR tc.table_name IN ('roles', 'financial_years', 'settings', 'users', 'user_companies', 'role_permissions')
     )
   ORDER BY tc.table_name, kcu.column_name`,
);
console.log("\n=== RELEVANT FOREIGN KEYS ===");
console.table(fks.rows);

const uniques = await c.query(
  `SELECT tc.table_name, tc.constraint_name, string_agg(kcu.column_name, ', ' ORDER BY kcu.ordinal_position) AS cols
   FROM information_schema.table_constraints tc
   JOIN information_schema.key_column_usage kcu
     ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
   WHERE tc.constraint_type IN ('UNIQUE', 'PRIMARY KEY')
     AND tc.table_schema = 'public'
     AND tc.table_name = ANY($1::text[])
   GROUP BY tc.table_name, tc.constraint_name, tc.constraint_type
   ORDER BY tc.table_name, tc.constraint_type, tc.constraint_name`,
  [rows.map((r) => r.table_name)],
);
console.log("\n=== PK / UNIQUE on tables with data ===");
console.table(uniques.rows.filter((r) => /company_id|name|number|code/i.test(r.cols) || r.constraint_name.includes("pkey")));

const roles = await c.query(
  `SELECT id, name, company_id FROM roles WHERE company_id IN ($1, $2) ORDER BY company_id, id`,
  [FROM, TO],
);
console.log("\n=== ROLES ===");
console.table(roles.rows);

const roleRefs = await c.query(
  `SELECT u.id, u.username, u.company_id, u.role_id
   FROM users u
   WHERE u.role_id IN (
     SELECT id FROM roles WHERE company_id = $1
   )
   ORDER BY u.id`,
  [FROM],
);
console.log("\n=== USERS referencing company-15 roles ===");
console.table(roleRefs.rows);

const fys = await c.query(
  `SELECT id, company_id, label, start_date, end_date, status FROM financial_years WHERE company_id IN ($1, $2) ORDER BY company_id, id`,
  [FROM, TO],
);
console.log("\n=== FINANCIAL YEARS ===");
console.table(fys.rows);

const fyRefs = await c.query(
  `SELECT table_name, column_name
   FROM information_schema.columns
   WHERE table_schema = 'public'
     AND column_name ILIKE '%financial_year%'
   ORDER BY table_name`,
);
console.log("\n=== financial_year columns ===");
console.table(fyRefs.rows);

const settings = await c.query(`SELECT * FROM settings WHERE company_id IN ($1, $2) ORDER BY company_id`, [FROM, TO]);
console.log("\n=== SETTINGS (summary counters) ===");
for (const s of settings.rows) {
  const counters = Object.fromEntries(
    Object.entries(s).filter(([k, v]) => /counter|prefix|suffix|gst/i.test(k) || k === "id" || k === "company_id"),
  );
  console.log(counters);
}

const users = await c.query(
  `SELECT id, username, email, company_id, role_id, database_name, is_active
   FROM users
   WHERE company_id IN ($1, $2)
      OR id IN (SELECT user_id FROM user_companies WHERE company_id IN ($1, $2))
   ORDER BY id`,
  [FROM, TO],
);
console.log("\n=== USERS ===");
console.table(users.rows);

const uc = await c.query(
  `SELECT uc.user_id, uc.company_id, u.username
   FROM user_companies uc
   JOIN users u ON u.id = uc.user_id
   WHERE uc.company_id IN ($1, $2)
   ORDER BY uc.company_id, uc.user_id`,
  [FROM, TO],
);
console.log("\n=== USER_COMPANIES ===");
console.table(uc.rows);

// Optional: if company has tenant DB, compare counts there too
for (const co of cos.rows.filter((r) => r.id === FROM || r.id === TO)) {
  if (!co.database_name) {
    console.log(`\n=== TENANT DB for company ${co.id}: (shared master) ===`);
    continue;
  }
  const url = new URL(process.env.DATABASE_URL);
  url.pathname = `/${co.database_name}`;
  const t = new pg.Client({ connectionString: url.toString() });
  try {
    await t.connect();
    const sample = ["invoices", "sales_orders", "customers", "vendors", "stock_items", "accounts"];
    const out = [];
    for (const table of sample) {
      const exists = await t.query(
        `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`,
        [table],
      );
      if (!exists.rowCount) {
        out.push({ table, count: null });
        continue;
      }
      const r = await t.query(`SELECT count(*)::int AS n FROM ${table} WHERE company_id = $1`, [co.id]);
      const rAll = await t.query(`SELECT count(*)::int AS n FROM ${table}`);
      out.push({ table, for_company: r.rows[0].n, all_rows: rAll.rows[0].n });
    }
    console.log(`\n=== TENANT DB ${co.database_name} (company ${co.id}) ===`);
    console.table(out);
  } catch (err) {
    console.log(`\n=== TENANT DB ${co.database_name}: ERROR ${err.message} ===`);
  } finally {
    await t.end().catch(() => undefined);
  }
}

await c.end();
console.log("\nDONE (read-only)");
