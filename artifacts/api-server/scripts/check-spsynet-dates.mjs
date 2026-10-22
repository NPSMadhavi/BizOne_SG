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

async function tryQ(label, sql) {
  try {
    const r = await c.query(sql);
    console.log(label, JSON.stringify(r.rows));
  } catch (e) {
    console.log(label, "ERR", e.message);
  }
}

await tryQ(
  "SO cols",
  `SELECT column_name FROM information_schema.columns WHERE table_name='sales_orders' AND column_name ILIKE '%date%' ORDER BY 1`,
);
await tryQ(
  "INV cols",
  `SELECT column_name FROM information_schema.columns WHERE table_name='invoices' AND column_name ILIKE '%date%' ORDER BY 1`,
);
await tryQ("SO sample", `SELECT * FROM sales_orders WHERE company_id=23 LIMIT 1`);
await tryQ(
  "SO dates",
  `SELECT min(created_at)::text min, max(created_at)::text max, count(*)::int n FROM sales_orders WHERE company_id=23`,
);
await tryQ(
  "INV dates",
  `SELECT min(created_at)::text min, max(created_at)::text max, count(*)::int n FROM invoices WHERE company_id=23`,
);
await tryQ(
  "JE dates",
  `SELECT min(entry_date)::text min, max(entry_date)::text max, count(*)::int n FROM journal_entries WHERE company_id=23`,
);
await tryQ(
  "ops docs",
  `SELECT company_id, count(*)::int n FROM ops_company_documents GROUP BY 1`,
);
await tryQ(
  "accounts",
  `SELECT company_id, count(*)::int n FROM accounts GROUP BY 1`,
);
await tryQ(
  "invoice totals",
  `SELECT company_id, coalesce(sum(total::numeric),0)::text total, count(*)::int n FROM invoices GROUP BY 1`,
);
await c.end();
