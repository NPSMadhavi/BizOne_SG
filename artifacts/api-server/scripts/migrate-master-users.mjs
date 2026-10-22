/**
 * Apply master user-directory migration now (without waiting for full app startup).
 * - Adds users.database_name
 * - Creates login_credentials and copies password hashes
 * - Drops users.password_hash on master
 * - Attempts prune of business tables (skipped if shared companies remain)
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

const MASTER_TABLES = new Set([
  "companies",
  "users",
  "login_credentials",
  "user_companies",
  "roles",
  "permissions",
  "role_permissions",
  "session",
]);

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

async function columnExists(table, column) {
  const r = await c.query(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
     ) AS exists`,
    [table, column],
  );
  return Boolean(r.rows[0]?.exists);
}

await c.query(`CREATE TABLE IF NOT EXISTS login_credentials (
  user_id integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  password_hash text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
)`);
await c.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS database_name text`);

if (await columnExists("users", "password_hash")) {
  const moved = await c.query(
    `INSERT INTO login_credentials (user_id, password_hash, updated_at)
     SELECT id, password_hash, COALESCE(updated_at, now())
     FROM users
     WHERE password_hash IS NOT NULL AND btrim(password_hash) <> ''
     ON CONFLICT (user_id) DO NOTHING
     RETURNING user_id`,
  );
  console.log("copied_to_login_credentials", moved.rowCount);
}

await c.query(
  `UPDATE users u
   SET database_name = c.database_name
   FROM companies c
   WHERE u.company_id = c.id
     AND c.database_name IS NOT NULL
     AND btrim(c.database_name) <> ''
     AND (u.database_name IS NULL OR btrim(u.database_name) = '')`,
);
const withDb = await c.query(
  `SELECT count(*)::int AS n FROM users WHERE database_name IS NOT NULL AND btrim(database_name) <> ''`,
);
console.log("users_with_database_name", withDb.rows[0].n);

if (await columnExists("users", "password_hash")) {
  const left = await c.query(
    `SELECT count(*)::int AS n FROM users
     WHERE password_hash IS NOT NULL AND btrim(password_hash) <> ''
       AND id NOT IN (SELECT user_id FROM login_credentials)`,
  );
  if (left.rows[0].n === 0) {
    await c.query(`ALTER TABLE users DROP COLUMN IF EXISTS password_hash`);
    console.log("dropped users.password_hash");
  } else {
    console.log("kept users.password_hash; remaining", left.rows[0].n);
  }
} else {
  console.log("users.password_hash already absent");
}

const cols = await c.query(
  `SELECT column_name FROM information_schema.columns WHERE table_name = 'users' ORDER BY ordinal_position`,
);
console.log("USER_COLS", cols.rows.map((r) => r.column_name));

const shared = await c.query(
  `SELECT count(*)::int AS n FROM companies WHERE database_name IS NULL OR btrim(database_name) = ''`,
);
console.log("shared_companies", shared.rows[0].n);
if (shared.rows[0].n === 0) {
  const tables = await c.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`,
  );
  const dropped = [];
  for (const row of tables.rows) {
    if (MASTER_TABLES.has(row.table_name)) continue;
    await c.query(`DROP TABLE IF EXISTS "${row.table_name}" CASCADE`);
    dropped.push(row.table_name);
  }
  console.log("pruned", dropped.length, dropped);
} else {
  console.log("skip prune — shared companies still present");
}

await c.end();
console.log("done");
