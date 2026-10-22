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

function urlFor(name) {
  const u = new URL(process.env.DATABASE_URL);
  u.pathname = `/${name}`;
  return u.toString();
}

const master = new pg.Client({ connectionString: process.env.DATABASE_URL });
const tenant = new pg.Client({ connectionString: urlFor("bizone_spsynet") });
await master.connect();
await tenant.connect();

await tenant.query(`ALTER TABLE users ALTER COLUMN password_hash SET DEFAULT ''`);
await tenant.query(`UPDATE users SET password_hash = '' WHERE password_hash IS NULL`);

// Ensure company 23 + user exist on tenant (from master directory + credentials)
const [co] = (await master.query(`SELECT * FROM companies WHERE id = 23`)).rows;
if (co) {
  await tenant.query(
    `INSERT INTO companies (id, name, country, address, email, phone, slug, database_name, business_type)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, database_name=EXCLUDED.database_name, slug=EXCLUDED.slug`,
    [
      23,
      co.name,
      co.country || "SG",
      co.address,
      co.email,
      co.phone,
      co.slug || "spsynet",
      "bizone_spsynet",
      co.business_type,
    ],
  ).catch(async (e) => {
    console.log("company upsert note:", e.message.slice(0, 120));
    await tenant.query(
      `UPDATE companies SET name=$2, slug='spsynet', database_name='bizone_spsynet' WHERE id=$1`,
      [23, co.name],
    );
  });
}

const users = (
  await master.query(
    `SELECT u.id, u.username, u.role, u.email, u.full_name, u.phone_number, u.is_active, u.company_id, u.role_id,
            lc.password_hash
     FROM users u
     LEFT JOIN login_credentials lc ON lc.user_id = u.id
     WHERE u.company_id = 23`,
  )
).rows;

for (const u of users) {
  const hash = u.password_hash || "";
  const existing = await tenant.query(`SELECT id FROM users WHERE id=$1 OR lower(username)=lower($2)`, [
    u.id,
    u.username,
  ]);
  if (existing.rowCount) {
    await tenant.query(
      `UPDATE users SET password_hash=$2, company_id=23, database_name='bizone_spsynet', role=$3, email=$4
       WHERE id=$1 OR lower(username)=lower($5)`,
      [existing.rows[0].id, hash, u.role || "admin", u.email || u.username, u.username],
    );
  } else {
    await tenant.query(
      `INSERT INTO users (id, username, password_hash, role, email, full_name, phone_number, is_active, company_id, role_id, database_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8,true),23,$9,'bizone_spsynet')
       ON CONFLICT (id) DO UPDATE SET password_hash=EXCLUDED.password_hash, company_id=23`,
      [
        u.id,
        u.username,
        hash,
        u.role || "admin",
        u.email || u.username,
        u.full_name,
        u.phone_number,
        u.is_active,
        u.role_id,
      ],
    );
  }
}

console.log(
  "tenant users",
  (await tenant.query(`SELECT id, username, company_id, (password_hash IS NOT NULL AND btrim(password_hash)<>'') AS has_hash FROM users`))
    .rows,
);
console.log("SO", (await tenant.query(`SELECT company_id, count(*)::int n FROM sales_orders GROUP BY 1`)).rows);

await tenant.end();
await master.end();
console.log("HEALED");
