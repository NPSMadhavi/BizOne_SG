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

const { openCompanyPool } = await import("../dist/index.mjs").catch(() => ({ openCompanyPool: null }));
// dist bundles everything — import source via built path alternative:
const mod = await import("../src/lib/company-database.ts").catch(() => null);
if (!mod) {
  // Use pg directly to simulate copy path
  const pg = (await import("pg")).default;
  const url = new URL(process.env.DATABASE_URL);
  url.pathname = "/bizone_spsynet";
  const c = new pg.Client({ connectionString: url.toString() });
  await c.connect();
  const r = await c.query(
    `SELECT count(*)::int n FROM sales_orders WHERE company_id=23`,
  );
  console.log("tenant SO", r.rows[0]);
  await c.end();
  process.exit(0);
}
const pool = await mod.openCompanyPool(23);
console.log("pool ok", Boolean(pool));
const r = await pool.query(`SELECT count(*)::int n FROM sales_orders WHERE company_id=23`);
console.log("SO", r.rows[0]);
await pool.end();
