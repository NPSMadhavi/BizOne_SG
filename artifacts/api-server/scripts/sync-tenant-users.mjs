/** Ensure each tenant has its company users + password hashes from master login_credentials. */
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
const cos = await master.query(`SELECT id, name, database_name FROM companies WHERE database_name IS NOT NULL ORDER BY id`);

for (const co of cos.rows) {
  const url = new URL(process.env.DATABASE_URL);
  url.pathname = `/${co.database_name}`;
  const t = new pg.Client({ connectionString: url.toString() });
  await t.connect();
  try {
    await t.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS company_id integer`).catch(() => undefined);
    await t.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email text`).catch(() => undefined);
    await t.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name text`).catch(() => undefined);
    await t.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_number text`).catch(() => undefined);
    await t.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true`).catch(() => undefined);
    await t.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS role_id integer`).catch(() => undefined);
    await t.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS database_name text`).catch(() => undefined);
    await t.query(`ALTER TABLE users ALTER COLUMN password_hash SET DEFAULT ''`).catch(() => undefined);

    const users = await master.query(
      `SELECT u.*, lc.password_hash AS cred_hash
       FROM users u
       LEFT JOIN login_credentials lc ON lc.user_id = u.id
       WHERE u.company_id = $1`,
      [co.id],
    );
    let upserted = 0;
    for (const u of users.rows) {
      await t.query(
        `INSERT INTO users (id, username, password_hash, role, email, full_name, phone_number, is_active, company_id, role_id, database_name, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8,true),$9,$10,$11,COALESCE($12,now()),now())
         ON CONFLICT (id) DO UPDATE SET
           username = EXCLUDED.username,
           password_hash = COALESCE(NULLIF(EXCLUDED.password_hash,''), users.password_hash),
           role = EXCLUDED.role,
           email = EXCLUDED.email,
           full_name = EXCLUDED.full_name,
           phone_number = EXCLUDED.phone_number,
           is_active = EXCLUDED.is_active,
           company_id = EXCLUDED.company_id,
           role_id = EXCLUDED.role_id,
           database_name = EXCLUDED.database_name,
           updated_at = now()`,
        [
          u.id,
          u.username,
          u.cred_hash || "",
          u.role,
          u.email,
          u.full_name,
          u.phone_number,
          u.is_active,
          u.company_id,
          u.role_id,
          co.database_name,
          u.created_at,
        ],
      );
      upserted++;
    }
    await t.query(
      `SELECT setval(pg_get_serial_sequence('users','id'), GREATEST(COALESCE((SELECT MAX(id) FROM users),1),1), true)`,
    ).catch(() => undefined);

    const uc = await master.query(`SELECT * FROM user_companies WHERE company_id=$1`, [co.id]);
    for (const link of uc.rows) {
      await t.query(
        `INSERT INTO user_companies (id, user_id, company_id, modules)
         VALUES ($1,$2,$3,$4::jsonb)
         ON CONFLICT DO NOTHING`,
        [link.id, link.user_id, link.company_id, JSON.stringify(link.modules ?? [])],
      ).catch(async () => {
        await t.query(
          `INSERT INTO user_companies (user_id, company_id, modules)
           VALUES ($1,$2,$3::jsonb)
           ON CONFLICT DO NOTHING`,
          [link.user_id, link.company_id, JSON.stringify(link.modules ?? [])],
        ).catch(() => undefined);
      });
    }

    const n = await t.query(`SELECT count(*)::int AS n FROM users WHERE company_id=$1`, [co.id]);
    console.log(`${co.database_name}: upserted ${upserted}, users for company=${n.rows[0].n}`);
  } finally {
    await t.end();
  }
}

await master.end();
