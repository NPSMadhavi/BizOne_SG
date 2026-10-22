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

for (const email of ["spsynet@gmail.com", "spsysnet@gmail.com"]) {
  const u = await master.query(
    `SELECT u.id, u.username, u.company_id, u.database_name AS user_db, c.name, c.database_name AS company_db
     FROM users u
     LEFT JOIN companies c ON c.id = u.company_id
     WHERE lower(u.username)= $1 OR lower(u.email)= $1`,
    [email],
  );
  console.log("\nUSER", email, u.rows);
  const companyId = u.rows[0]?.company_id;
  const dbName = u.rows[0]?.company_db || u.rows[0]?.user_db;
  if (!dbName) {
    console.log("  → shared master only");
    if (companyId) {
      const so = await master.query(`SELECT count(*)::int AS n FROM sales_orders WHERE company_id=$1`, [companyId]);
      console.log("  master sales_orders for company", companyId, so.rows[0]);
    }
    continue;
  }
  const exists = await master.query(`SELECT 1 FROM pg_database WHERE datname=$1`, [dbName]);
  console.log("  tenant DB exists?", Boolean(exists.rowCount), dbName);
  if (!exists.rowCount) {
    console.log("  *** ROOT CAUSE: company.database_name points to missing database → app falls back to empty shared rows ***");
    continue;
  }
  const url = new URL(process.env.DATABASE_URL);
  url.pathname = `/${dbName}`;
  const t = new pg.Client({ connectionString: url.toString() });
  await t.connect();
  const so = await t.query(`SELECT count(*)::int AS n FROM sales_orders WHERE company_id=$1`, [companyId]);
  const soAll = await t.query(`SELECT company_id, count(*)::int AS n FROM sales_orders GROUP BY 1`);
  console.log("  tenant sales_orders for login company", companyId, so.rows[0]);
  console.log("  tenant sales_orders by company_id", soAll.rows);
  await t.end();
}

await master.end();
