/**
 * Startup migrations + exchange-rate backfill.
 * Safe to call on every boot — all DDL uses IF NOT EXISTS / idempotent checks.
 */
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { getExchangeRateToSGD } from "./exchange-rate.js";
import { logger } from "./logger.js";

/** Ensure any schema columns added after initial deploy exist on the live DB. */
export async function runStartupMigrations(): Promise<void> {
  const steps: Array<{ name: string; sql: ReturnType<typeof sql> }> = [
    {
      name: "customers.quotation_terms",
      sql: sql`ALTER TABLE customers ADD COLUMN IF NOT EXISTS quotation_terms text`,
    },
    {
      name: "debit_notes table",
      sql: sql`
      CREATE TABLE IF NOT EXISTS debit_notes (
        id              serial       PRIMARY KEY,
        dn_number       text         NOT NULL,
        company_id      integer      NOT NULL DEFAULT 1,
        customer_name   text         NOT NULL,
        customer_address text,
        contact_person  text,
        contact_email   text,
        ref_inv_number  text,
        reason          text,
        issue_date      text,
        currency        text         NOT NULL DEFAULT 'SGD',
        payment_terms   text,
        notes           text,
        is_private      boolean      NOT NULL DEFAULT false,
        items           jsonb        NOT NULL DEFAULT '[]',
        subtotal        numeric(15,2) NOT NULL DEFAULT 0,
        discount_amount numeric(15,2) NOT NULL DEFAULT 0,
        tax_rate        numeric(5,2)  NOT NULL DEFAULT 9,
        tax             numeric(15,2) NOT NULL DEFAULT 0,
        total_amount    numeric(15,2) NOT NULL DEFAULT 0,
        status          text         NOT NULL DEFAULT 'draft',
        void_reason     text,
        email_sent_to   text,
        created_by      integer      NOT NULL,
        created_at      timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT debit_notes_company_dn_number_unique UNIQUE (company_id, dn_number)
      )
    `,
    },
    {
      name: "settings.dn_prefix",
      sql: sql`ALTER TABLE settings ADD COLUMN IF NOT EXISTS dn_prefix text NOT NULL DEFAULT 'DN'`,
    },
    {
      name: "settings.dn_counter",
      sql: sql`ALTER TABLE settings ADD COLUMN IF NOT EXISTS dn_counter integer NOT NULL DEFAULT 1`,
    },
    {
      name: "settings.dn_suffix",
      sql: sql`ALTER TABLE settings ADD COLUMN IF NOT EXISTS dn_suffix text NOT NULL DEFAULT ''`,
    },
    {
      name: "companies.gst_reg_no",
      sql: sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS gst_reg_no text`,
    },
    {
      name: "vendor_invoices.exchange_rate",
      sql: sql`ALTER TABLE vendor_invoices ADD COLUMN IF NOT EXISTS exchange_rate numeric(10,6) NOT NULL DEFAULT 1.000000`,
    },
    {
      name: "vendor_invoices.gst_treatment",
      sql: sql`ALTER TABLE vendor_invoices ADD COLUMN IF NOT EXISTS gst_treatment text NOT NULL DEFAULT 'standard_rated'`,
    },
    {
      name: "vendor_invoices.gst_rate",
      sql: sql`ALTER TABLE vendor_invoices ADD COLUMN IF NOT EXISTS gst_rate numeric(5,2) NOT NULL DEFAULT 9`,
    },
    {
      name: "vendor_invoices.gst_amount",
      sql: sql`ALTER TABLE vendor_invoices ADD COLUMN IF NOT EXISTS gst_amount numeric(15,2) NOT NULL DEFAULT 0`,
    },
    {
      name: "vendor_invoices.gst_inclusive",
      sql: sql`ALTER TABLE vendor_invoices ADD COLUMN IF NOT EXISTS gst_inclusive boolean NOT NULL DEFAULT false`,
    },
    {
      name: "vendor_invoices.items",
      sql: sql`ALTER TABLE vendor_invoices ADD COLUMN IF NOT EXISTS items jsonb NOT NULL DEFAULT '[]'::jsonb`,
    },
    {
      name: "vendor_invoices.items_default",
      sql: sql`ALTER TABLE vendor_invoices ALTER COLUMN items SET DEFAULT '[]'::jsonb`,
    },
    {
      name: "vendor_invoices.subtotal",
      sql: sql`ALTER TABLE vendor_invoices ADD COLUMN IF NOT EXISTS subtotal numeric(15,2) NOT NULL DEFAULT 0`,
    },
    {
      name: "vendor_invoices.tax",
      sql: sql`ALTER TABLE vendor_invoices ADD COLUMN IF NOT EXISTS tax numeric(15,2) NOT NULL DEFAULT 0`,
    },
    {
      name: "invoices.exchange_rate",
      sql: sql`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS exchange_rate numeric(10,6) NOT NULL DEFAULT 1.000000`,
    },
    {
      name: "income_records table",
      sql: sql`
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
    `,
    },
    {
      name: "income_records.exchange_rate",
      sql: sql`ALTER TABLE income_records ADD COLUMN IF NOT EXISTS exchange_rate numeric(10,6) NOT NULL DEFAULT 1.000000`,
    },
    {
      name: "ops_employees table",
      sql: sql`
      CREATE TABLE IF NOT EXISTS ops_employees (
        id serial PRIMARY KEY,
        company_id integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        employee_code text NOT NULL,
        name text NOT NULL,
        email text NOT NULL,
        phone text,
        address text,
        department text,
        designation text,
        join_date text,
        status text NOT NULL DEFAULT 'active',
        salary text,
        nationality text,
        created_at timestamptz NOT NULL DEFAULT now()
      )`,
    },
    {
      name: "ops_assets table",
      sql: sql`
      CREATE TABLE IF NOT EXISTS ops_assets (
        id serial PRIMARY KEY,
        company_id integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        tag text NOT NULL,
        type text NOT NULL,
        category text NOT NULL DEFAULT 'hardware',
        serial text,
        model text,
        manufacturer text,
        status text NOT NULL DEFAULT 'available',
        condition text,
        assigned_to text,
        location text,
        vendor text,
        purchase_date text,
        warranty_expiry text,
        cost text,
        description text,
        has_license boolean DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now()
      )`,
    },
    {
      name: "ops_licenses table",
      sql: sql`
      CREATE TABLE IF NOT EXISTS ops_licenses (
        id serial PRIMARY KEY,
        company_id integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        asset_id integer,
        name text NOT NULL,
        license_key text NOT NULL,
        type text NOT NULL DEFAULT 'perpetual',
        seats integer DEFAULT 1,
        purchase_date text,
        expiry_date text,
        cost text,
        renewal_cycle text DEFAULT 'none',
        status text DEFAULT 'active',
        notes text,
        created_at timestamptz NOT NULL DEFAULT now()
      )`,
    },
    {
      name: "ops_asset_assignments table",
      sql: sql`
      CREATE TABLE IF NOT EXISTS ops_asset_assignments (
        id serial PRIMARY KEY,
        company_id integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        asset_id integer NOT NULL,
        employee_id integer NOT NULL,
        date_assigned text,
        date_returned text,
        notes text,
        created_at timestamptz NOT NULL DEFAULT now()
      )`,
    },
    {
      name: "ops_employee_payroll table",
      sql: sql`
      CREATE TABLE IF NOT EXISTS ops_employee_payroll (
        id serial PRIMARY KEY,
        company_id integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        employee_id integer NOT NULL,
        base_salary numeric(15,2) NOT NULL DEFAULT 0,
        allowances jsonb DEFAULT '{}',
        deductions jsonb DEFAULT '{}',
        currency text NOT NULL DEFAULT 'SGD',
        pay_frequency text NOT NULL DEFAULT 'monthly',
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`,
    },
    {
      name: "ops_payroll_records table",
      sql: sql`
      CREATE TABLE IF NOT EXISTS ops_payroll_records (
        id serial PRIMARY KEY,
        company_id integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        employee_id integer NOT NULL,
        payroll_config_id integer,
        period_start text NOT NULL,
        period_end text NOT NULL,
        gross_pay numeric(15,2) NOT NULL DEFAULT 0,
        net_pay numeric(15,2) NOT NULL DEFAULT 0,
        status text NOT NULL DEFAULT 'draft',
        notes text,
        created_at timestamptz NOT NULL DEFAULT now()
      )`,
    },
    {
      name: "ops_tasks table",
      sql: sql`
      CREATE TABLE IF NOT EXISTS ops_tasks (
        id serial PRIMARY KEY,
        company_id integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        title text NOT NULL,
        description text,
        status text NOT NULL DEFAULT 'todo',
        priority text NOT NULL DEFAULT 'medium',
        assignee_id integer,
        start_date text,
        due_date text,
        event_type text DEFAULT 'task',
        created_by integer,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`,
    },
    {
      name: "ops_company_documents table",
      sql: sql`
      CREATE TABLE IF NOT EXISTS ops_company_documents (
        id serial PRIMARY KEY,
        company_id integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        document_type text NOT NULL DEFAULT 'other',
        title text NOT NULL,
        file_path text,
        issue_date text,
        expiry_date text,
        notes text,
        uploaded_by integer,
        created_at timestamptz NOT NULL DEFAULT now()
      )`,
    },
  ];

  for (const step of steps) {
    try {
      await db.execute(step.sql);
    } catch (err) {
      logger.warn({ err, step: step.name }, "[startup-migrations] step skipped");
    }
  }
  logger.info("[startup-migrations] schema up to date");
}

interface FxRow extends Record<string, unknown> { id: number; currency: string; date: string | null; }

async function tableExists(table: string): Promise<boolean> {
  const result = await db.execute<{ exists: boolean }>(sql`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ${table}
    ) AS "exists"
  `);
  return Boolean(result.rows[0]?.exists);
}

async function backfillTable(
  table: string,
  dateCol: string,
): Promise<{ updated: number; failed: number }> {
  let updated = 0; let failed = 0;

  if (!(await tableExists(table))) {
    return { updated, failed };
  }

  const rows = await db.execute<FxRow>(
    sql.raw(`SELECT id, currency, ${dateCol} AS date FROM ${table} WHERE currency != 'SGD' AND (exchange_rate IS NULL OR exchange_rate = 1.000000)`)
  );

  for (const row of rows.rows) {
    try {
      const rate = await getExchangeRateToSGD(row.currency, row.date ?? undefined);
      await db.execute(
        sql`UPDATE ${sql.raw(table)} SET exchange_rate = ${rate.toFixed(6)} WHERE id = ${row.id}`
      );
      updated++;
    } catch {
      failed++;
    }
  }

  return { updated, failed };
}

export async function backfillExchangeRatesOnStartup(): Promise<void> {
  try {
    const vi  = await backfillTable("vendor_invoices", "pi_date");
    const inv = await backfillTable("invoices",        "issue_date");
    const inc = await backfillTable("income_records",  "income_date");

    const total = vi.updated + inv.updated + inc.updated;
    const fails = vi.failed  + inv.failed  + inc.failed;
    if (total > 0 || fails > 0) {
      logger.info({ updated: total, failed: fails }, "[startup-backfill] exchange rate backfill complete");
    }
  } catch (e: any) {
    // Non-fatal — log and continue booting
    logger.warn({ err: e.message }, "[startup-backfill] exchange rate backfill failed");
  }
}
