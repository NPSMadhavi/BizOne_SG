/**
 * Re-link Spsynet (company 23 / bizone_spsynet) on lean master from the tenant DB.
 * Master user id may differ from tenant; match by username/email.
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

function dbUrl(name) {
  const url = new URL(process.env.DATABASE_URL);
  url.pathname = `/${name}`;
  return url.toString();
}

const master = new pg.Client({ connectionString: process.env.DATABASE_URL });
const tenant = new pg.Client({ connectionString: dbUrl("bizone_spsynet") });
await master.connect();
await tenant.connect();

const [company] = (
  await tenant.query(
    `SELECT id, name, country, address, email, phone, domain, business_type,
            registration_no, gst_reg_no, slug, database_name
     FROM companies
     WHERE id = 23 OR lower(coalesce(slug,'')) = 'spsynet' OR lower(name) LIKE '%spsynet%'
     ORDER BY CASE WHEN id = 23 THEN 0 ELSE 1 END
     LIMIT 1`,
  )
).rows;
if (!company) {
  console.error("No Spsynet company row in bizone_spsynet");
  process.exit(1);
}
const companyId = 23;
console.log("tenant company", company);

await master.query(
  `INSERT INTO companies (
     id, name, country, address, email, phone, domain, business_type,
     registration_no, gst_reg_no, slug, database_name
   ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
   ON CONFLICT (id) DO UPDATE SET
     name = EXCLUDED.name,
     country = EXCLUDED.country,
     address = EXCLUDED.address,
     email = EXCLUDED.email,
     phone = EXCLUDED.phone,
     domain = EXCLUDED.domain,
     business_type = EXCLUDED.business_type,
     registration_no = EXCLUDED.registration_no,
     gst_reg_no = EXCLUDED.gst_reg_no,
     slug = EXCLUDED.slug,
     database_name = EXCLUDED.database_name`,
  [
    companyId,
    company.name || "Spsynet",
    company.country || "SG",
    company.address,
    company.email || "spsynet@gmail.com",
    company.phone,
    company.domain,
    company.business_type,
    company.registration_no,
    company.gst_reg_no,
    company.slug || "spsynet",
    "bizone_spsynet",
  ],
);
await master.query(
  `SELECT setval(pg_get_serial_sequence('companies', 'id'), GREATEST((SELECT MAX(id) FROM companies), 1), true)`,
);

const [tenantUser] = (
  await tenant.query(
    `SELECT id, username, role, email, full_name, phone_number, is_active, role_id, password_hash
     FROM users
     WHERE company_id = $1 OR lower(username) = 'spsynet@gmail.com'
     ORDER BY id LIMIT 1`,
    [company.id],
  )
).rows;
if (!tenantUser) {
  console.error("No Spsynet user in tenant");
  process.exit(1);
}
console.log("tenant user", { id: tenantUser.id, username: tenantUser.username });

// Ensure Administrator role exists on master for company 23 (new id ok)
let adminRoleId = null;
{
  const existing = await master.query(
    `SELECT id FROM roles WHERE company_id = $1 AND lower(name) = 'administrator' LIMIT 1`,
    [companyId],
  );
  if (existing.rows[0]) {
    adminRoleId = existing.rows[0].id;
  } else {
    const inserted = await master.query(
      `INSERT INTO roles (name, company_id) VALUES ('Administrator', $1) RETURNING id`,
      [companyId],
    );
    adminRoleId = inserted.rows[0].id;
  }
}

// Grant all permissions to admin role when catalog exists
const perms = await master.query(`SELECT id FROM permissions`);
for (const p of perms.rows) {
  await master.query(
    `INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [adminRoleId, p.id],
  );
}

const login = String(tenantUser.username || "spsynet@gmail.com").toLowerCase();
let masterUser = (
  await master.query(
    `SELECT id FROM users WHERE lower(username) = $1 OR lower(coalesce(email,'')) = $1 LIMIT 1`,
    [login],
  )
).rows[0];

if (masterUser) {
  await master.query(
    `UPDATE users SET
       username = $2,
       role = 'admin',
       email = $3,
       full_name = $4,
       phone_number = $5,
       is_active = true,
       company_id = $6,
       role_id = $7,
       database_name = 'bizone_spsynet'
     WHERE id = $1`,
    [
      masterUser.id,
      login,
      tenantUser.email || login,
      tenantUser.full_name,
      tenantUser.phone_number,
      companyId,
      adminRoleId,
    ],
  );
} else {
  const inserted = await master.query(
    `INSERT INTO users (
       username, role, email, full_name, phone_number, is_active, company_id, role_id, database_name
     ) VALUES ($1,'admin',$2,$3,$4,true,$5,$6,'bizone_spsynet')
     RETURNING id`,
    [
      login,
      tenantUser.email || login,
      tenantUser.full_name,
      tenantUser.phone_number,
      companyId,
      adminRoleId,
    ],
  );
  masterUser = inserted.rows[0];
}

if (tenantUser.password_hash) {
  await master.query(
    `INSERT INTO login_credentials (user_id, password_hash, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (user_id) DO UPDATE SET password_hash = EXCLUDED.password_hash, updated_at = now()`,
    [masterUser.id, tenantUser.password_hash],
  );
}

await master.query(
  `INSERT INTO user_companies (user_id, company_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
  [masterUser.id, companyId],
);

console.log("master company", (await master.query(`SELECT id,name,slug,database_name FROM companies WHERE id=$1`, [companyId])).rows);
console.log("master user", (await master.query(`SELECT id,username,company_id,database_name,role_id FROM users WHERE id=$1`, [masterUser.id])).rows);
console.log("has creds", (await master.query(`SELECT 1 FROM login_credentials WHERE user_id=$1`, [masterUser.id])).rowCount > 0);

await tenant.end();
await master.end();
console.log("DONE");
