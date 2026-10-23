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
const cos = await master.query(`SELECT id, name, slug, database_name FROM companies ORDER BY id`);
console.log("companies", cos.rows);
const dbs = await master.query(`SELECT datname FROM pg_database WHERE datistemplate=false ORDER BY 1`);
console.log(
  "all dbs",
  dbs.rows.map((r) => r.datname),
);
for (const name of dbs.rows.map((r) => r.datname).filter((n) => n.startsWith("bizone_"))) {
  const url = new URL(process.env.DATABASE_URL);
  url.pathname = `/${name}`;
  const t = new pg.Client({ connectionString: url.toString() });
  try {
    await t.connect();
    const emp = await t.query(`SELECT to_regclass('public.employees') AS employees, to_regclass('public.ops_employees') AS ops`);
    const n = await t.query(`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public'`);
    console.log(name, "tables", n.rows[0].n, emp.rows[0]);
  } catch (e) {
    console.log(name, "ERR", e.message);
  } finally {
    await t.end().catch(() => undefined);
  }
}
await master.end();
