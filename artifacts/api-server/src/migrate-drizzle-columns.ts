/**
 * Idempotent Drizzle↔DB column alignment.
 * Safe for Plesk: CREATE/ADD IF NOT EXISTS only — never DROP/TRUNCATE.
 * Called from runStartupMigrations() before the app listens.
 */
import { pool } from "@workspace/db";
import { logger } from "./lib/logger";

/**
 * Ensure core document tables exist (full current shape).
 * IF NOT EXISTS — never recreates or wipes existing production tables.
 */
export const DRIZZLE_TABLE_CREATES: string[] = [
  `CREATE TABLE IF NOT EXISTS invoices (
    id serial PRIMARY KEY,
    inv_number text NOT NULL,
    company_id integer NOT NULL DEFAULT 1,
    customer_name text NOT NULL,
    customer_address text,
    customer_contact text,
    customer_contact_email text,
    delivery_address text,
    issue_date text,
    delivery_date text,
    payment_terms text,
    sales_person text,
    notes text,
    is_private boolean NOT NULL DEFAULT false,
    items jsonb NOT NULL DEFAULT '[]',
    subtotal numeric(15,2) NOT NULL DEFAULT 0,
    discount_amount numeric(15,2) NOT NULL DEFAULT 0,
    tax numeric(15,2) NOT NULL DEFAULT 0,
    total_amount numeric(15,2) NOT NULL DEFAULT 0,
    currency text NOT NULL DEFAULT 'SGD',
    exchange_rate numeric(10,6) NOT NULL DEFAULT 1.000000,
    po_ref_no text,
    so_id integer,
    so_number text,
    status text NOT NULL DEFAULT 'draft',
    is_modified boolean NOT NULL DEFAULT false,
    email_sent_to text,
    void_reason text,
    terms_and_conditions text,
    delivery_instructions text,
    customer_note text,
    authorised_signature text,
    created_by integer NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS quotations (
    id serial PRIMARY KEY,
    qt_number text NOT NULL UNIQUE,
    company_id integer NOT NULL DEFAULT 1,
    customer_name text NOT NULL,
    customer_address text,
    customer_contact text,
    customer_contact_email text,
    delivery_address text,
    issue_date text,
    valid_until text,
    delivery_date text,
    sales_person text,
    payment_terms text,
    notes text,
    is_private boolean NOT NULL DEFAULT false,
    items jsonb NOT NULL DEFAULT '[]',
    subtotal numeric(15,2) NOT NULL DEFAULT 0,
    discount_amount numeric(15,2) NOT NULL DEFAULT 0,
    tax numeric(15,2) NOT NULL DEFAULT 0,
    total_amount numeric(15,2) NOT NULL DEFAULT 0,
    currency text NOT NULL DEFAULT 'SGD',
    status text NOT NULL DEFAULT 'draft',
    email_sent_to text,
    terms_and_conditions text,
    delivery_instructions text,
    customer_note text,
    authorised_signature text,
    created_by integer NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS delivery_orders (
    id serial PRIMARY KEY,
    do_number text NOT NULL UNIQUE,
    company_id integer NOT NULL DEFAULT 1,
    customer_name text NOT NULL,
    customer_address text,
    customer_contact text,
    issue_date text,
    delivery_date text,
    payment_terms text,
    notes text,
    is_private boolean NOT NULL DEFAULT false,
    items jsonb NOT NULL DEFAULT '[]',
    status text NOT NULL DEFAULT 'draft',
    email_sent_to text,
    terms_and_conditions text,
    delivery_instructions text,
    customer_note text,
    authorised_signature text,
    inv_id integer,
    inv_number text,
    so_id integer,
    so_number text,
    created_by integer NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS credit_notes (
    id serial PRIMARY KEY,
    cn_number text NOT NULL,
    company_id integer NOT NULL DEFAULT 1,
    customer_name text NOT NULL,
    customer_address text,
    contact_person text,
    contact_email text,
    ref_inv_number text,
    so_id integer,
    so_number text,
    reason text,
    issue_date text,
    currency text NOT NULL DEFAULT 'SGD',
    payment_terms text,
    notes text,
    is_private boolean NOT NULL DEFAULT false,
    items jsonb NOT NULL DEFAULT '[]',
    subtotal numeric(15,2) NOT NULL DEFAULT 0,
    discount_amount numeric(15,2) NOT NULL DEFAULT 0,
    tax_rate numeric(5,2) NOT NULL DEFAULT 9,
    tax numeric(15,2) NOT NULL DEFAULT 0,
    total_amount numeric(15,2) NOT NULL DEFAULT 0,
    status text NOT NULL DEFAULT 'draft',
    void_reason text,
    email_sent_to text,
    terms_and_conditions text,
    delivery_instructions text,
    customer_note text,
    authorised_signature text,
    created_by integer NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS proforma_invoices (
    id serial PRIMARY KEY,
    pi_number text NOT NULL,
    company_id integer NOT NULL DEFAULT 1,
    customer_name text NOT NULL,
    customer_address text,
    customer_contact text,
    customer_contact_email text,
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
    qt_ref_no text,
    status text NOT NULL DEFAULT 'draft',
    email_sent_to text,
    terms_and_conditions text,
    delivery_instructions text,
    customer_note text,
    authorised_signature text,
    created_by integer NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS purchase_orders (
    id serial PRIMARY KEY,
    po_number text NOT NULL UNIQUE,
    company_id integer NOT NULL DEFAULT 1,
    vendor_name text NOT NULL,
    vendor_address text,
    vendor_contact text,
    vendor_contact_email text,
    delivery_address text,
    issue_date text,
    delivery_date text,
    payment_terms text,
    quote_ref_no text,
    notes text,
    is_private boolean NOT NULL DEFAULT false,
    items jsonb NOT NULL DEFAULT '[]',
    subtotal numeric(15,2) NOT NULL DEFAULT 0,
    tax numeric(15,2) NOT NULL DEFAULT 0,
    total_amount numeric(15,2) NOT NULL DEFAULT 0,
    currency text NOT NULL DEFAULT 'SGD',
    status text NOT NULL DEFAULT 'draft',
    customer_id integer,
    customer_po_ref text,
    email_sent_to text,
    ack_token text,
    ack_at text,
    ack_note text,
    created_by integer NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
];

/**
 * Columns that exist in Drizzle schemas but may be missing on older Plesk DBs
 * that only ran CREATE TABLE IF NOT EXISTS (which does not upgrade existing tables).
 *
 * All statements are non-destructive and idempotent.
 */
export const DRIZZLE_COLUMN_MIGRATIONS: string[] = [
  // ── sales_orders ──────────────────────────────────────────────────────────
  `ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS inv_id integer`,
  `ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS inv_number text`,
  `ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS do_id integer`,
  `ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS do_number text`,
  `ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS terms_and_conditions text`,
  `ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS delivery_instructions text`,
  `ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS customer_note text`,
  `ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS authorised_signature text`,
  `ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS email_sent_to text`,
  `ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS discount_amount numeric(15,2) NOT NULL DEFAULT 0`,
  `ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS tax numeric(15,2) NOT NULL DEFAULT 0`,
  `ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS total_amount numeric(15,2) NOT NULL DEFAULT 0`,
  `ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'SGD'`,
  `ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft'`,

  // ── invoices ──────────────────────────────────────────────────────────────
  `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS so_id integer`,
  `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS so_number text`,
  `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS is_modified boolean NOT NULL DEFAULT false`,
  `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS exchange_rate numeric(10,6) NOT NULL DEFAULT 1.000000`,
  `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS sales_person text`,
  `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS po_ref_no text`,
  `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS void_reason text`,
  `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS email_sent_to text`,
  `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS terms_and_conditions text`,
  `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS delivery_instructions text`,
  `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS customer_note text`,
  `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS authorised_signature text`,
  `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS discount_amount numeric(15,2) NOT NULL DEFAULT 0`,
  `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS customer_contact_email text`,
  `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS delivery_address text`,
  `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS delivery_date text`,

  // ── quotations ────────────────────────────────────────────────────────────
  `ALTER TABLE quotations ADD COLUMN IF NOT EXISTS valid_until text`,
  `ALTER TABLE quotations ADD COLUMN IF NOT EXISTS sales_person text`,
  `ALTER TABLE quotations ADD COLUMN IF NOT EXISTS email_sent_to text`,
  `ALTER TABLE quotations ADD COLUMN IF NOT EXISTS terms_and_conditions text`,
  `ALTER TABLE quotations ADD COLUMN IF NOT EXISTS delivery_instructions text`,
  `ALTER TABLE quotations ADD COLUMN IF NOT EXISTS customer_note text`,
  `ALTER TABLE quotations ADD COLUMN IF NOT EXISTS authorised_signature text`,
  `ALTER TABLE quotations ADD COLUMN IF NOT EXISTS discount_amount numeric(15,2) NOT NULL DEFAULT 0`,
  `ALTER TABLE quotations ADD COLUMN IF NOT EXISTS customer_contact_email text`,
  `ALTER TABLE quotations ADD COLUMN IF NOT EXISTS delivery_address text`,
  `ALTER TABLE quotations ADD COLUMN IF NOT EXISTS delivery_date text`,

  // ── delivery_orders ───────────────────────────────────────────────────────
  `ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS so_id integer`,
  `ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS so_number text`,
  `ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS inv_id integer`,
  `ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS inv_number text`,
  `ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS email_sent_to text`,
  `ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS terms_and_conditions text`,
  `ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS delivery_instructions text`,
  `ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS customer_note text`,
  `ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS authorised_signature text`,
  `ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS payment_terms text`,

  // ── credit_notes ──────────────────────────────────────────────────────────
  `ALTER TABLE credit_notes ADD COLUMN IF NOT EXISTS so_id integer`,
  `ALTER TABLE credit_notes ADD COLUMN IF NOT EXISTS so_number text`,
  `ALTER TABLE credit_notes ADD COLUMN IF NOT EXISTS void_reason text`,
  `ALTER TABLE credit_notes ADD COLUMN IF NOT EXISTS email_sent_to text`,
  `ALTER TABLE credit_notes ADD COLUMN IF NOT EXISTS terms_and_conditions text`,
  `ALTER TABLE credit_notes ADD COLUMN IF NOT EXISTS delivery_instructions text`,
  `ALTER TABLE credit_notes ADD COLUMN IF NOT EXISTS customer_note text`,
  `ALTER TABLE credit_notes ADD COLUMN IF NOT EXISTS authorised_signature text`,
  `ALTER TABLE credit_notes ADD COLUMN IF NOT EXISTS discount_amount numeric(15,2) NOT NULL DEFAULT 0`,
  `ALTER TABLE credit_notes ADD COLUMN IF NOT EXISTS tax_rate numeric(5,2) NOT NULL DEFAULT 9`,
  `ALTER TABLE credit_notes ADD COLUMN IF NOT EXISTS contact_person text`,
  `ALTER TABLE credit_notes ADD COLUMN IF NOT EXISTS contact_email text`,

  // ── debit_notes ───────────────────────────────────────────────────────────
  `ALTER TABLE debit_notes ADD COLUMN IF NOT EXISTS so_id integer`,
  `ALTER TABLE debit_notes ADD COLUMN IF NOT EXISTS so_number text`,
  `ALTER TABLE debit_notes ADD COLUMN IF NOT EXISTS void_reason text`,
  `ALTER TABLE debit_notes ADD COLUMN IF NOT EXISTS email_sent_to text`,
  `ALTER TABLE debit_notes ADD COLUMN IF NOT EXISTS terms_and_conditions text`,
  `ALTER TABLE debit_notes ADD COLUMN IF NOT EXISTS delivery_instructions text`,
  `ALTER TABLE debit_notes ADD COLUMN IF NOT EXISTS customer_note text`,
  `ALTER TABLE debit_notes ADD COLUMN IF NOT EXISTS authorised_signature text`,
  `ALTER TABLE debit_notes ADD COLUMN IF NOT EXISTS discount_amount numeric(15,2) NOT NULL DEFAULT 0`,
  `ALTER TABLE debit_notes ADD COLUMN IF NOT EXISTS tax_rate numeric(5,2) NOT NULL DEFAULT 9`,
  `ALTER TABLE debit_notes ADD COLUMN IF NOT EXISTS contact_person text`,
  `ALTER TABLE debit_notes ADD COLUMN IF NOT EXISTS contact_email text`,

  // ── proforma_invoices ─────────────────────────────────────────────────────
  `ALTER TABLE proforma_invoices ADD COLUMN IF NOT EXISTS email_sent_to text`,
  `ALTER TABLE proforma_invoices ADD COLUMN IF NOT EXISTS terms_and_conditions text`,
  `ALTER TABLE proforma_invoices ADD COLUMN IF NOT EXISTS delivery_instructions text`,
  `ALTER TABLE proforma_invoices ADD COLUMN IF NOT EXISTS customer_note text`,
  `ALTER TABLE proforma_invoices ADD COLUMN IF NOT EXISTS authorised_signature text`,
  `ALTER TABLE proforma_invoices ADD COLUMN IF NOT EXISTS discount_amount numeric(15,2) NOT NULL DEFAULT 0`,
  `ALTER TABLE proforma_invoices ADD COLUMN IF NOT EXISTS qt_ref_no text`,
  `ALTER TABLE proforma_invoices ADD COLUMN IF NOT EXISTS customer_contact_email text`,
  `ALTER TABLE proforma_invoices ADD COLUMN IF NOT EXISTS delivery_address text`,
  `ALTER TABLE proforma_invoices ADD COLUMN IF NOT EXISTS delivery_date text`,
  `ALTER TABLE proforma_invoices ADD COLUMN IF NOT EXISTS is_private boolean NOT NULL DEFAULT false`,

  // ── vendor_invoices (ensure note/signature + common fields) ───────────────
  `ALTER TABLE vendor_invoices ADD COLUMN IF NOT EXISTS customer_note text`,
  `ALTER TABLE vendor_invoices ADD COLUMN IF NOT EXISTS delivery_instructions text`,
  `ALTER TABLE vendor_invoices ADD COLUMN IF NOT EXISTS terms_and_conditions text`,
  `ALTER TABLE vendor_invoices ADD COLUMN IF NOT EXISTS authorised_signature text`,
  `ALTER TABLE vendor_invoices ADD COLUMN IF NOT EXISTS payment_terms text NOT NULL DEFAULT '30 Days Net'`,
  `ALTER TABLE vendor_invoices ADD COLUMN IF NOT EXISTS due_date text`,
  `ALTER TABLE vendor_invoices ADD COLUMN IF NOT EXISTS planned_payment_date text`,
  `ALTER TABLE vendor_invoices ADD COLUMN IF NOT EXISTS reminders_enabled boolean NOT NULL DEFAULT false`,
  `ALTER TABLE vendor_invoices ADD COLUMN IF NOT EXISTS reminder_start_after_day integer`,
  `ALTER TABLE vendor_invoices ADD COLUMN IF NOT EXISTS reminder_emails jsonb NOT NULL DEFAULT '[]'::jsonb`,
  `ALTER TABLE vendor_invoices ADD COLUMN IF NOT EXISTS exchange_rate numeric(10,6) NOT NULL DEFAULT 1.000000`,
  `ALTER TABLE vendor_invoices ADD COLUMN IF NOT EXISTS gst_treatment text NOT NULL DEFAULT 'standard_rated'`,
  `ALTER TABLE vendor_invoices ADD COLUMN IF NOT EXISTS gst_rate numeric(5,2) NOT NULL DEFAULT 9`,
  `ALTER TABLE vendor_invoices ADD COLUMN IF NOT EXISTS gst_amount numeric(15,2) NOT NULL DEFAULT 0`,
  `ALTER TABLE vendor_invoices ADD COLUMN IF NOT EXISTS gst_inclusive boolean NOT NULL DEFAULT false`,
  `ALTER TABLE vendor_invoices ADD COLUMN IF NOT EXISTS items jsonb NOT NULL DEFAULT '[]'::jsonb`,
  `ALTER TABLE vendor_invoices ADD COLUMN IF NOT EXISTS subtotal numeric(15,2) NOT NULL DEFAULT 0`,
  `ALTER TABLE vendor_invoices ADD COLUMN IF NOT EXISTS tax numeric(15,2) NOT NULL DEFAULT 0`,
  `ALTER TABLE vendor_invoices ADD COLUMN IF NOT EXISTS discount_amount numeric(15,2) NOT NULL DEFAULT 0`,
  `ALTER TABLE vendor_invoices ADD COLUMN IF NOT EXISTS expense_account_id integer`,
  `ALTER TABLE vendor_invoices ADD COLUMN IF NOT EXISTS sales_person text`,

  // ── purchase_orders ───────────────────────────────────────────────────────
  `ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS customer_id integer`,
  `ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS customer_po_ref text`,
  `ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS email_sent_to text`,
  `ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS ack_token text`,
  `ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS ack_at text`,
  `ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS ack_note text`,
  `ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS quote_ref_no text`,
  `ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS vendor_contact_email text`,
  `ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS is_private boolean NOT NULL DEFAULT false`,

  // ── purchase_quotations ───────────────────────────────────────────────────
  `ALTER TABLE purchase_quotations ADD COLUMN IF NOT EXISTS converted_po_id integer`,
  `ALTER TABLE purchase_quotations ADD COLUMN IF NOT EXISTS converted_po_number text`,
  `ALTER TABLE purchase_quotations ADD COLUMN IF NOT EXISTS email_sent_to text`,
  `ALTER TABLE purchase_quotations ADD COLUMN IF NOT EXISTS discount_amount numeric(15,2) NOT NULL DEFAULT 0`,

  // ── customers ─────────────────────────────────────────────────────────────
  `ALTER TABLE customers ADD COLUMN IF NOT EXISTS quotation_terms text`,
  `ALTER TABLE customers ADD COLUMN IF NOT EXISTS ship_to_address text`,
  `ALTER TABLE customers ADD COLUMN IF NOT EXISTS gst_registered boolean NOT NULL DEFAULT false`,
  `ALTER TABLE customers ADD COLUMN IF NOT EXISTS gst_no text`,
  `ALTER TABLE customers ADD COLUMN IF NOT EXISTS postal_code text`,
  `ALTER TABLE customers ADD COLUMN IF NOT EXISTS currency text DEFAULT 'SGD'`,

  // ── companies ─────────────────────────────────────────────────────────────
  `ALTER TABLE companies ADD COLUMN IF NOT EXISTS gst_reg_no text`,
  `ALTER TABLE companies ADD COLUMN IF NOT EXISTS logo_url text`,
  `ALTER TABLE companies ADD COLUMN IF NOT EXISTS domain text`,
];

/** Columns that MUST exist after migration or startup must fail. */
const CRITICAL_COLUMNS: Array<{ table: string; column: string }> = [
  { table: "sales_orders", column: "terms_and_conditions" },
  { table: "sales_orders", column: "delivery_instructions" },
  { table: "sales_orders", column: "customer_note" },
  { table: "sales_orders", column: "authorised_signature" },
  { table: "invoices", column: "terms_and_conditions" },
  { table: "invoices", column: "delivery_instructions" },
  { table: "invoices", column: "customer_note" },
  { table: "invoices", column: "authorised_signature" },
  { table: "quotations", column: "terms_and_conditions" },
  { table: "quotations", column: "delivery_instructions" },
  { table: "quotations", column: "customer_note" },
  { table: "quotations", column: "authorised_signature" },
  { table: "delivery_orders", column: "terms_and_conditions" },
  { table: "delivery_orders", column: "delivery_instructions" },
  { table: "delivery_orders", column: "customer_note" },
  { table: "delivery_orders", column: "authorised_signature" },
  { table: "credit_notes", column: "terms_and_conditions" },
  { table: "credit_notes", column: "delivery_instructions" },
  { table: "credit_notes", column: "customer_note" },
  { table: "credit_notes", column: "authorised_signature" },
  { table: "debit_notes", column: "terms_and_conditions" },
  { table: "debit_notes", column: "delivery_instructions" },
  { table: "debit_notes", column: "customer_note" },
  { table: "debit_notes", column: "authorised_signature" },
  { table: "proforma_invoices", column: "terms_and_conditions" },
  { table: "proforma_invoices", column: "delivery_instructions" },
  { table: "proforma_invoices", column: "customer_note" },
  { table: "proforma_invoices", column: "authorised_signature" },
  { table: "vendor_invoices", column: "terms_and_conditions" },
  { table: "vendor_invoices", column: "delivery_instructions" },
  { table: "vendor_invoices", column: "customer_note" },
  { table: "vendor_invoices", column: "authorised_signature" },
];

/** Postgres codes that are safe to ignore (idempotent / race / table not yet created). */
function isBenignSchemaError(err: unknown): boolean {
  const code = (err as { code?: string })?.code;
  // 42701 duplicate_column, 42P07 duplicate_table, 42710 duplicate_object,
  // 42P01 undefined_table (CREATE runs in a later/earlier step on some DBs)
  return (
    code === "42701" ||
    code === "42P07" ||
    code === "42710" ||
    code === "42P01"
  );
}

export async function migrateDrizzleColumns(): Promise<void> {
  for (const statement of DRIZZLE_TABLE_CREATES) {
    try {
      await pool.query(statement);
    } catch (err) {
      if (isBenignSchemaError(err)) continue;
      logger.error(
        { err, statement: statement.slice(0, 120) },
        "[schema-migrate] CRITICAL table create failed",
      );
      throw err;
    }
  }

  let applied = 0;
  for (const statement of DRIZZLE_COLUMN_MIGRATIONS) {
    try {
      await pool.query(statement);
      applied++;
    } catch (err) {
      if (isBenignSchemaError(err)) continue;
      logger.error(
        { err, statement: statement.slice(0, 120) },
        "[schema-migrate] CRITICAL column migration failed",
      );
      throw err;
    }
  }

  // Verify critical document columns exist (table may be missing on brand-new empty DB
  // until CREATE steps run — only verify when table exists).
  for (const { table, column } of CRITICAL_COLUMNS) {
    const tableCheck = await pool.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = $1
       ) AS exists`,
      [table],
    );
    if (!tableCheck.rows[0]?.exists) continue;

    const colCheck = await pool.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
       ) AS exists`,
      [table, column],
    );
    if (!colCheck.rows[0]?.exists) {
      throw new Error(
        `Critical column missing after migration: ${table}.${column}. ` +
          `Schema is not production-ready.`,
      );
    }
  }

  logger.info(
    {
      creates: DRIZZLE_TABLE_CREATES.length,
      alters: DRIZZLE_COLUMN_MIGRATIONS.length,
      applied,
    },
    "[schema-migrate] Drizzle column alignment complete",
  );
}
