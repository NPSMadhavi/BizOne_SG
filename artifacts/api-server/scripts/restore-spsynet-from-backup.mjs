/**
 * Restore Downloads/BizOneBackup.backup into local bizone_spsynet,
 * then remap company_id 15 → 23 so spsynet@gmail.com (company 23) sees the data.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

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

const BACKUP = "C:\\Users\\USER\\Downloads\\BizOneBackup.backup";
const PG = "C:\\Program Files\\PostgreSQL\\18\\bin";
const TARGET = "bizone_spsynet";
const FROM = 15;
const TO = 23;

if (!fs.existsSync(BACKUP)) throw new Error(`Backup not found: ${BACKUP}`);

const url = new URL(process.env.DATABASE_URL);
process.env.PGPASSWORD = decodeURIComponent(url.password);
const host = url.hostname;
const user = decodeURIComponent(url.username);
const port = url.port || "5432";

function psql(db, sql) {
  const r = spawnSync(
    path.join(PG, "psql.exe"),
    ["-U", user, "-h", host, "-p", port, "-d", db, "-v", "ON_ERROR_STOP=1", "-c", sql],
    { encoding: "utf8", env: process.env },
  );
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout);
    throw new Error(`psql failed: ${sql.slice(0, 80)}`);
  }
  return r.stdout;
}

function pgRestore(db) {
  const r = spawnSync(
    path.join(PG, "pg_restore.exe"),
    ["--no-owner", "--no-acl", "-U", user, "-h", host, "-p", port, "-d", db, BACKUP],
    { encoding: "utf8", env: process.env },
  );
  // pg_restore often exits 1 on benign warnings
  console.log(r.stderr?.slice(-500) || r.stdout?.slice(-200) || "pg_restore done");
}

console.log("1) Recreate", TARGET);
psql("postgres", `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${TARGET}' AND pid <> pg_backend_pid()`);
psql("postgres", `DROP DATABASE IF EXISTS "${TARGET}"`);
psql("postgres", `CREATE DATABASE "${TARGET}"`);

console.log("2) Restore backup…");
pgRestore(TARGET);

const tenantUrl = new URL(process.env.DATABASE_URL);
tenantUrl.pathname = `/${TARGET}`;
const t = new pg.Client({ connectionString: tenantUrl.toString() });
await t.connect();

const before = await t.query(
  `SELECT count(*) FILTER (WHERE company_id=$1)::int AS c15,
          count(*) FILTER (WHERE company_id=$2)::int AS c23
   FROM sales_orders`,
  [FROM, TO],
);
console.log("sales_orders before remap", before.rows[0]);

console.log("3) Remap company_id", FROM, "→", TO);
await t.query("SET session_replication_role = replica");

// Ensure company 23 row exists (copy from 15), then remap FKs
const co15 = await t.query(`SELECT * FROM companies WHERE id = $1`, [FROM]);
if (!co15.rowCount) throw new Error("company 15 missing after restore");
const row = co15.rows[0];
await t.query(`DELETE FROM companies WHERE id = $1`, [TO]).catch(() => undefined);
await t.query(
  `INSERT INTO companies (id, name, country, address, registration_no, gst_reg_no, email, phone, domain, business_type, slug, database_name, logo_url, created_at)
   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
   ON CONFLICT (id) DO UPDATE SET
     name=EXCLUDED.name, email=EXCLUDED.email, slug=EXCLUDED.slug, database_name=EXCLUDED.database_name`,
  [
    TO,
    "Spsynet",
    row.country ?? "SG",
    row.address,
    row.registration_no,
    row.gst_reg_no,
    row.email ?? "spsynet@gmail.com",
    row.phone,
    row.domain,
    row.business_type,
    "spsynet",
    TARGET,
    row.logo_url,
    row.created_at ?? new Date(),
  ],
).catch(async (err) => {
  // Minimal columns if schema differs
  console.warn("full company insert failed, trying minimal:", err.message.slice(0, 100));
  await t.query(
    `INSERT INTO companies (id, name, country, email, slug, database_name)
     VALUES ($1,'Spsynet','SG','spsynet@gmail.com','spsynet',$2)
     ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, database_name=EXCLUDED.database_name`,
    [TO, TARGET],
  );
});

const tables = await t.query(
  `SELECT c.table_name
   FROM information_schema.columns c
   JOIN information_schema.tables tb
     ON tb.table_schema=c.table_schema AND tb.table_name=c.table_name
   WHERE c.table_schema='public' AND c.column_name='company_id' AND tb.table_type='BASE TABLE'
   ORDER BY 1`,
);
for (const { table_name } of tables.rows) {
  if (table_name === "companies") continue;
  const r = await t.query(`UPDATE "${table_name}" SET company_id = $1 WHERE company_id = $2`, [TO, FROM]);
  if (r.rowCount) console.log(`  ${table_name}: ${r.rowCount}`);
}

// Remap roles: keep role rows under company 23 (already updated via company_id)
// Users: point to company 23
await t.query(`UPDATE users SET company_id = $1, database_name = $2 WHERE company_id = $3 OR lower(username)='spsynet@gmail.com'`, [
  TO,
  TARGET,
  FROM,
]);

await t.query(`DELETE FROM companies WHERE id = $1`, [FROM]);
await t.query("SET session_replication_role = origin");

const after = await t.query(
  `SELECT count(*) FILTER (WHERE company_id=$1)::int AS c15,
          count(*) FILTER (WHERE company_id=$2)::int AS c23
   FROM sales_orders`,
  [FROM, TO],
);
console.log("sales_orders after remap", after.rows[0]);
console.log(
  "accounts",
  (await t.query(`SELECT company_id, count(*)::int n FROM accounts GROUP BY 1`)).rows,
);
console.log(
  "users",
  (await t.query(`SELECT id, username, company_id FROM users`)).rows,
);
console.log(
  "companies",
  (await t.query(`SELECT id, name, slug, database_name FROM companies`)).rows,
);
console.log(
  "settings counters",
  (
    await t.query(
      `SELECT company_id, so_counter, inv_counter, po_counter FROM settings WHERE company_id=$1`,
      [TO],
    )
  ).rows,
);

await t.end();

// Master: ensure login user points at company 23 / bizone_spsynet
const master = new pg.Client({ connectionString: process.env.DATABASE_URL });
await master.connect();
await master.query(
  `UPDATE companies SET slug='spsynet', database_name=$1, name='Spsynet', email='spsynet@gmail.com' WHERE id=$2`,
  [TARGET, TO],
);
await master.query(
  `UPDATE users SET company_id=$1, database_name=$2 WHERE lower(username)='spsynet@gmail.com' OR lower(email)='spsynet@gmail.com'`,
  [TO, TARGET],
);
const u = await master.query(
  `SELECT id, username, company_id, database_name FROM users WHERE lower(username)='spsynet@gmail.com'`,
);
console.log("master user", u.rows);
await master.end();

console.log("\nDONE — logout/login as spsynet@gmail.com; dashboard should show Company 23 data.");
