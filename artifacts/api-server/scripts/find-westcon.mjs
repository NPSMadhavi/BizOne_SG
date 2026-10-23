import pg from "pg";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rootEnv = path.resolve(root, "../../.env");
for (const envPath of [path.join(root, ".env"), rootEnv]) {
  if (!fs.existsSync(envPath)) continue;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[k]) process.env[k] = v;
  }
}

console.log("DATABASE_URL", process.env.DATABASE_URL?.replace(/:[^:@/]+@/, ":***@"));
const m = new pg.Client({ connectionString: process.env.DATABASE_URL });
await m.connect();
console.log("companies", (await m.query(`SELECT id, name, slug, database_name FROM companies ORDER BY id`)).rows);
console.log("users", (await m.query(`SELECT id, username, company_id, database_name FROM users ORDER BY id`)).rows);
console.log("dbs", (await m.query(`SELECT datname FROM pg_database WHERE datname LIKE 'bizone_%' ORDER BY 1`)).rows);
await m.end();
