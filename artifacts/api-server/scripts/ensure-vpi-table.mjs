import pg from "pg";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function loadEnv() {
  const p = path.join(root, ".env");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
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
loadEnv();

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

await c.query(`
CREATE TABLE IF NOT EXISTS vendor_proforma_invoices (
  id serial PRIMARY KEY,
  vpi_number text NOT NULL,
  company_id integer NOT NULL DEFAULT 1,
  vendor_name text NOT NULL,
  vendor_address text,
  vendor_contact text,
  vendor_contact_email text,
  delivery_address text,
  issue_date text,
  delivery_date text,
  payment_terms text,
  notes text,
  is_private boolean NOT NULL DEFAULT false,
  items jsonb NOT NULL DEFAULT '[]',
  subtotal numeric(15,2) NOT NULL DEFAULT 0,
  discount_amount numeric(15,2) NOT NULL DEFAULT 0,
  tax numeric(15,2) NOT NULL DEFAULT 0,
  total_amount numeric(15,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'SGD',
  pq_ref_no text,
  status text NOT NULL DEFAULT 'draft',
  email_sent_to text,
  terms_and_conditions text,
  delivery_instructions text,
  customer_note text,
  authorised_signature text,
  created_by integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
)`);

for (const stmt of [
  `ALTER TABLE settings ADD COLUMN IF NOT EXISTS vpi_prefix text DEFAULT 'VPI'`,
  `ALTER TABLE settings ADD COLUMN IF NOT EXISTS vpi_counter integer NOT NULL DEFAULT 0`,
  `ALTER TABLE settings ADD COLUMN IF NOT EXISTS vpi_suffix text DEFAULT ''`,
  `CREATE UNIQUE INDEX IF NOT EXISTS vendor_proforma_invoices_company_vpi_number_unique ON vendor_proforma_invoices (company_id, vpi_number)`,
]) {
  await c.query(stmt);
}

console.log("vendor_proforma_invoices + settings vpi columns OK");
await c.end();
