import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "lib", "db", "package.json"));
const pg = require("pg");
const envPath = path.join(root, "artifacts", "api-server", "src", ".env");

function loadEnv(filePath) {
  const env = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

const env = loadEnv(envPath);
const client = new pg.Client({ connectionString: env.DATABASE_URL });
await client.connect();

await client.query(`
  CREATE TABLE IF NOT EXISTS income_records (
    id              serial PRIMARY KEY,
    company_id      integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    income_date     text NOT NULL,
    payer_name      text NOT NULL,
    description     text NOT NULL,
    category        text NOT NULL,
    amount          numeric(15,2) NOT NULL,
    gst_amount      numeric(15,2) NOT NULL DEFAULT 0,
    gst_treatment   text NOT NULL DEFAULT 'standard_rated',
    currency        text NOT NULL DEFAULT 'SGD',
    exchange_rate   numeric(10,6) NOT NULL DEFAULT 1.000000,
    payment_method  text DEFAULT 'bank_transfer',
    account_id      integer,
    reference       text,
    notes           text,
    status          text NOT NULL DEFAULT 'draft',
    journal_entry_id integer,
    created_by      integer NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
  )
`);
console.log("OK: income_records table ready");

const check = await client.query(
  `SELECT EXISTS (
     SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'income_records'
   ) AS exists`,
);
console.log("income_records exists:", check.rows[0].exists);

await client.end();
