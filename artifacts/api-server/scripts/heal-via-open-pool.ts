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

const { masterDb, companiesTable } = await import("@workspace/db");
const { openCompanyPool } = await import("../src/lib/company-database.ts");

const cos = await masterDb
  .select({
    id: companiesTable.id,
    db: companiesTable.databaseName,
  })
  .from(companiesTable);

for (const c of cos) {
  if (!c.db) continue;
  try {
    const pool = await openCompanyPool(c.id);
    if (!pool) {
      console.log(c.id, c.db, "no pool");
      continue;
    }
    const r = await pool.query(
      "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'",
    );
    console.log(c.id, c.db, "tables", r.rows[0].n);
  } catch (err) {
    console.error(c.id, c.db, err instanceof Error ? err.message : err);
  }
}

process.exit(0);
