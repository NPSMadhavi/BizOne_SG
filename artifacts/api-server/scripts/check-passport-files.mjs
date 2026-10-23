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

const url = new URL(process.env.DATABASE_URL);
url.pathname = "/bizone_spsynet";
const c = new pg.Client({ connectionString: url.toString() });
await c.connect();
const rows = await c.query(
  `SELECT id, name, passport_scan, visa_scan, nric_scan FROM employees
   WHERE passport_scan IS NOT NULL OR visa_scan IS NOT NULL OR nric_scan IS NOT NULL
   ORDER BY id DESC LIMIT 20`,
);
console.log("employees with scans:", rows.rows);
const uploads = path.join(root, "uploads", "employee-documents");
console.log("uploads dir", uploads, "exists", fs.existsSync(uploads));
if (fs.existsSync(uploads)) console.log("files", fs.readdirSync(uploads));
for (const row of rows.rows) {
  for (const col of ["passport_scan", "visa_scan", "nric_scan"]) {
    const v = row[col];
    if (!v || String(v).startsWith("data:")) continue;
    const base = path.basename(String(v));
    const abs = path.join(uploads, base);
    console.log(row.id, col, v, "->", abs, "exists=", fs.existsSync(abs));
  }
}
await c.end();
