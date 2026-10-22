/**
 * 1) Drop every bizone_* database except the one we recreate for Spsynet
 * 2) Restore C:\Users\USER\Downloads\BizOneBackup.backup → bizone_spsynet
 * 3) Remap company_id 15 → 23
 * 4) Lean master: keep only Spsynet (company 23) + its login user
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
const KEEP_DBS = new Set(["postgres", "BizoneDB", "template0", "template1"]);

if (!fs.existsSync(BACKUP)) throw new Error(`Backup not found: ${BACKUP}`);

const url = new URL(process.env.DATABASE_URL);
process.env.PGPASSWORD = decodeURIComponent(url.password);
const host = url.hostname;
const user = decodeURIComponent(url.username);
const port = url.port || "5432";

function run(bin, args, label) {
  const r = spawnSync(path.join(PG, bin), args, { encoding: "utf8", env: process.env });
  if (r.status !== 0 && bin === "psql.exe") {
    console.error(r.stderr || r.stdout);
    throw new Error(`${label || bin} failed`);
  }
  if (bin === "pg_restore.exe") {
    const tail = (r.stderr || r.stdout || "").trim().slice(-400);
    if (tail) console.log(tail);
  }
  return r;
}

function psql(db, sql) {
  return run("psql.exe", ["-U", user, "-h", host, "-p", port, "-d", db, "-v", "ON_ERROR_STOP=1", "-c", sql], sql.slice(0, 60));
}

const admin = new pg.Client({ connectionString: process.env.DATABASE_URL.replace(/\/[^/]+$/, "/postgres") });
await admin.connect();

const all = (
  await admin.query(`SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY 1`)
).rows.map((r) => r.datname);

console.log("=== Databases before ===");
console.log(all.join("\n"));

const toDrop = all.filter((name) => {
  if (KEEP_DBS.has(name)) return false;
  // Drop every bizone_* (including current spsynet — recreated from backup)
  return name.startsWith("bizone_");
});

console.log("\n=== Dropping", toDrop.length, "tenant DBs ===");
for (const name of toDrop) {
  if (!/^bizone_[a-z0-9_]+$/i.test(name)) {
    console.warn("skip unsafe name", name);
    continue;
  }
  console.log("DROP", name);
  await admin.query(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [name],
  );
  await admin.query(`DROP DATABASE IF EXISTS "${name}"`);
}
await admin.end();

console.log("\n=== Recreate", TARGET, "===");
psql("postgres", `CREATE DATABASE "${TARGET}"`);

console.log("=== Restore backup →", TARGET, "===");
run(
  "pg_restore.exe",
  ["--no-owner", "--no-acl", "-U", user, "-h", host, "-p", port, "-d", TARGET, BACKUP],
  "pg_restore",
);

const tenantUrl = new URL(process.env.DATABASE_URL);
tenantUrl.pathname = `/${TARGET}`;
const t = new pg.Client({ connectionString: tenantUrl.toString() });
await t.connect();

await t.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS database_name text`);
await t.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS slug text`);
await t.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS database_name text`);

const before = await t.query(
  `SELECT count(*) FILTER (WHERE company_id=$1)::int AS c15,
          count(*) FILTER (WHERE company_id=$2)::int AS c23
   FROM sales_orders`,
  [FROM, TO],
);
console.log("sales_orders before remap", before.rows[0]);

console.log("=== Remap company_id", FROM, "→", TO, "===");
await t.query("SET session_replication_role = replica");

const co15 = await t.query(`SELECT * FROM companies WHERE id = $1`, [FROM]);
if (!co15.rowCount) throw new Error("company 15 missing after restore — wrong backup?");
const row = co15.rows[0];

await t.query(`DELETE FROM companies WHERE id = $1`, [TO]).catch(() => undefined);
try {
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
  );
} catch (err) {
  console.warn("full company insert failed:", err.message.slice(0, 120));
  await t.query(
    `INSERT INTO companies (id, name, country, email, slug, database_name)
     VALUES ($1,'Spsynet','SG','spsynet@gmail.com','spsynet',$2)
     ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, database_name=EXCLUDED.database_name`,
    [TO, TARGET],
  );
}

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

await t.query(
  `UPDATE users SET company_id = $1, database_name = $2
   WHERE company_id = $3 OR lower(username) = 'spsynet@gmail.com'`,
  [TO, TARGET, FROM],
);
await t.query(`UPDATE users SET database_name = $1`, [TARGET]);
await t.query(
  `UPDATE companies SET name='Spsynet', slug='spsynet', database_name=$1, email=COALESCE(email,'spsynet@gmail.com') WHERE id=$2`,
  [TARGET, TO],
);
await t.query(`DELETE FROM companies WHERE id = $1`, [FROM]);
await t.query("SET session_replication_role = origin");

console.log("SO", (await t.query(`SELECT company_id, count(*)::int n FROM sales_orders GROUP BY 1`)).rows);
console.log("INV", (await t.query(`SELECT company_id, count(*)::int n FROM invoices GROUP BY 1`)).rows);
console.log("ACC", (await t.query(`SELECT company_id, count(*)::int n FROM accounts GROUP BY 1`)).rows);
console.log("users", (await t.query(`SELECT id, username, company_id FROM users`)).rows);
console.log("companies", (await t.query(`SELECT id, name, slug, database_name FROM companies`)).rows);

const tenantUser = (
  await t.query(
    `SELECT id, username, role, email, full_name, phone_number, is_active, role_id, password_hash
     FROM users WHERE company_id=$1 OR lower(username)='spsynet@gmail.com' ORDER BY id LIMIT 1`,
    [TO],
  )
).rows[0];
const tenantRoles = (await t.query(`SELECT id, name, company_id FROM roles WHERE company_id=$1`, [TO])).rows;
await t.end();

console.log("\n=== Prune master to Spsynet only ===");
const master = new pg.Client({ connectionString: process.env.DATABASE_URL });
await master.connect();

// Ensure company 23
await master.query(
  `INSERT INTO companies (id, name, country, address, email, phone, slug, database_name, business_type)
   VALUES ($1,'Spsynet','SG',$2,$3,$4,'spsynet',$5,$6)
   ON CONFLICT (id) DO UPDATE SET
     name=EXCLUDED.name, slug=EXCLUDED.slug, database_name=EXCLUDED.database_name,
     email=EXCLUDED.email, phone=EXCLUDED.phone, business_type=EXCLUDED.business_type`,
  [
    TO,
    row.address ?? "Singapore",
    row.email ?? "spsynet@gmail.com",
    row.phone ?? null,
    TARGET,
    row.business_type ?? "trading_services",
  ],
);

// Delete other companies' memberships / roles / users first
await master.query(`DELETE FROM user_companies WHERE company_id <> $1`, [TO]);
await master.query(`DELETE FROM role_permissions WHERE role_id IN (SELECT id FROM roles WHERE company_id <> $1)`, [TO]);
await master.query(`DELETE FROM roles WHERE company_id <> $1`, [TO]);
await master.query(
  `DELETE FROM login_credentials WHERE user_id IN (SELECT id FROM users WHERE company_id IS DISTINCT FROM $1 AND lower(username) <> 'spsynet@gmail.com')`,
  [TO],
);
await master.query(
  `DELETE FROM users WHERE company_id IS DISTINCT FROM $1 AND lower(username) <> 'spsynet@gmail.com'`,
  [TO],
);
await master.query(`DELETE FROM companies WHERE id <> $1`, [TO]);

// Sync roles from tenant (best-effort by name)
let adminRoleId = (
  await master.query(`SELECT id FROM roles WHERE company_id=$1 AND lower(name)='administrator' LIMIT 1`, [TO])
).rows[0]?.id;
if (!adminRoleId) {
  adminRoleId = (await master.query(`INSERT INTO roles (name, company_id) VALUES ('Administrator',$1) RETURNING id`, [TO]))
    .rows[0].id;
}
for (const p of (await master.query(`SELECT id FROM permissions`)).rows) {
  await master.query(`INSERT INTO role_permissions (role_id, permission_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [
    adminRoleId,
    p.id,
  ]);
}

const login = String(tenantUser?.username || "spsynet@gmail.com").toLowerCase();
let masterUser = (
  await master.query(`SELECT id FROM users WHERE lower(username)=$1 OR lower(coalesce(email,''))=$1 LIMIT 1`, [login])
).rows[0];
if (masterUser) {
  await master.query(
    `UPDATE users SET username=$2, role='admin', email=$3, full_name=$4, phone_number=$5,
       is_active=true, company_id=$6, role_id=$7, database_name=$8 WHERE id=$1`,
    [
      masterUser.id,
      login,
      tenantUser?.email || login,
      tenantUser?.full_name ?? null,
      tenantUser?.phone_number ?? null,
      TO,
      adminRoleId,
      TARGET,
    ],
  );
} else {
  masterUser = (
    await master.query(
      `INSERT INTO users (username, role, email, full_name, phone_number, is_active, company_id, role_id, database_name)
       VALUES ($1,'admin',$2,$3,$4,true,$5,$6,$7) RETURNING id`,
      [
        login,
        tenantUser?.email || login,
        tenantUser?.full_name ?? null,
        tenantUser?.phone_number ?? null,
        TO,
        adminRoleId,
        TARGET,
      ],
    )
  ).rows[0];
}

if (tenantUser?.password_hash) {
  await master.query(
    `INSERT INTO login_credentials (user_id, password_hash, updated_at)
     VALUES ($1,$2,now())
     ON CONFLICT (user_id) DO UPDATE SET password_hash=EXCLUDED.password_hash, updated_at=now()`,
    [masterUser.id, tenantUser.password_hash],
  );
}

await master.query(`INSERT INTO user_companies (user_id, company_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [
  masterUser.id,
  TO,
]);
await master.query(
  `SELECT setval(pg_get_serial_sequence('companies','id'), GREATEST((SELECT MAX(id) FROM companies),1), true)`,
);
await master.query(
  `SELECT setval(pg_get_serial_sequence('users','id'), GREATEST((SELECT MAX(id) FROM users),1), true)`,
);

console.log("master companies", (await master.query(`SELECT id,name,slug,database_name FROM companies`)).rows);
console.log(
  "master users",
  (await master.query(`SELECT id,username,company_id,database_name FROM users`)).rows,
);
console.log(
  "has creds",
  (await master.query(`SELECT 1 FROM login_credentials WHERE user_id=$1`, [masterUser.id])).rowCount > 0,
);

const left = (
  await master.query(`SELECT datname FROM pg_database WHERE datname LIKE 'bizone_%' ORDER BY 1`)
).rows.map((r) => r.datname);
console.log("remaining bizone_* DBs", left);

await master.end();
console.log("\nDONE — only BizoneDB + bizone_spsynet. Login as spsynet@gmail.com");
