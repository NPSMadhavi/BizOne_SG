/**
 * Apply DRIZZLE_TABLE_CREATES + directory heals to every bizone_* tenant DB
 * that still has a thin schema-postgres footprint.
 */
import pg from "pg";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

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

// Load compiled statements from source via dynamic import of ts is hard; duplicate light apply:
const migratePath = path.join(root, "src/migrate-drizzle-columns.ts");
// Prefer running through built dist if present; else inline essential creates via pg from SQL file only + ALTER heals.
// Use the JS that esbuild may not have — import from dist if available.
let DRIZZLE_TABLE_CREATES = [];
let applySalesPosSchema = async () => {};
try {
  const mod = await import(pathToFileURL(path.join(root, "dist/migrate-drizzle-columns.js")).href).catch(() => null);
  if (mod?.DRIZZLE_TABLE_CREATES) {
    DRIZZLE_TABLE_CREATES = mod.DRIZZLE_TABLE_CREATES;
    applySalesPosSchema = mod.applySalesPosSchema;
  }
} catch {
  /* fall through */
}

if (!DRIZZLE_TABLE_CREATES.length) {
  // Minimal: ensure core tables exist via openCompanyPool path — run SQL creates from a subset
  console.log("Using SQL schema heal only (dist migrate module not loaded)");
}

const master = new pg.Client({ connectionString: process.env.DATABASE_URL });
await master.connect();
const cos = await master.query(
  `SELECT id, database_name FROM companies WHERE database_name IS NOT NULL ORDER BY id`,
);

for (const co of cos.rows) {
  const url = new URL(process.env.DATABASE_URL);
  url.pathname = `/${co.database_name}`;
  const t = new pg.Client({ connectionString: url.toString() });
  await t.connect();
  try {
    const before = await t.query(
      `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'`,
    );
    if (DRIZZLE_TABLE_CREATES.length) {
      for (const stmt of DRIZZLE_TABLE_CREATES) {
        await t.query(stmt).catch(() => undefined);
      }
      await applySalesPosSchema((s) => t.query(s));
    }
    // Always ensure directory columns
    for (const stmt of [
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS company_id integer`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS database_name text`,
      `ALTER TABLE companies ADD COLUMN IF NOT EXISTS slug text`,
      `ALTER TABLE companies ADD COLUMN IF NOT EXISTS database_name text`,
    ]) {
      await t.query(stmt).catch(() => undefined);
    }
    const after = await t.query(
      `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'`,
    );
    console.log(`${co.database_name}: tables ${before.rows[0].n} → ${after.rows[0].n}`);
  } finally {
    await t.end();
  }
}
await master.end();
