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

await tryQ("SO dates", `SELECT min(order_date)::text min, max(order_date)::text max, count(*)::int n FROM sales_orders WHERE company_id=23`);
await tryQ("INV dates", `SELECT min(invoice_date)::text min, max(invoice_date)::text max, count(*)::int n FROM invoices WHERE company_id=23`);
await tryQ("TXN dates", `SELECT min(transaction_date)::text min, max(transaction_date)::text max, count(*)::int n FROM transactions WHERE company_id=23`);
await tryQ("JE dates", `SELECT min(entry_date)::text min, max(entry_date)::text max, count(*)::int n FROM journal_entries WHERE company_id=23`);
await tryQ("docs tables", `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name ILIKE '%document%' ORDER BY 1`);
await tryQ("FY", `SELECT id, name, start_date::text, end_date::text, company_id FROM financial_years WHERE company_id=23 ORDER BY 1`);
await c.end();
