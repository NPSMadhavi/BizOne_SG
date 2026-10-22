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
await master.connect();
const dbs = (await master.query(`SELECT datname FROM pg_database WHERE datname LIKE 'bizone_signtest%' ORDER BY 1`)).rows;
console.log("signtest dbs", dbs);
const cos = (await master.query(`SELECT id, name, slug, database_name FROM companies WHERE id >= 24 OR slug LIKE 'signtest%' ORDER BY id`)).rows;
console.log("new companies", cos);
await master.end();

const sample = "bizone_spsynet";
const t = new pg.Client({ connectionString: urlFor(sample) });
await t.connect();
const cols = await t.query(
  `SELECT column_name, data_type, is_nullable, column_default
   FROM information_schema.columns
   WHERE table_schema='public' AND table_name='financial_years'
   ORDER BY ordinal_position`,
);
console.log("FY cols on", sample);
for (const c of cols.rows) console.log(c.column_name, c.data_type, c.is_nullable, c.column_default);
const exists = await t.query(`SELECT to_regclass('public.financial_years')`);
console.log("regclass", exists.rows[0]);
await t.end();
