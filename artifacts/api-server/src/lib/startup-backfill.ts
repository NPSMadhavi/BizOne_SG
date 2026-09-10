/**
 * Startup migrations + exchange-rate backfill.
 * Safe to call on every boot — all DDL uses IF NOT EXISTS / idempotent checks.
 */
import { db, companiesTable, userCompaniesTable, usersTable } from "@workspace/db";
import { sql, eq } from "drizzle-orm";
import { getExchangeRateToSGD } from "./exchange-rate.js";
import { backfillExpenseJEs } from "./expense-auto-post.js";
import { backfillInvoiceJEs } from "./invoice-auto-post.js";
import { logger } from "./logger.js";
import { migrateWmsTables } from "../migrate-wms-tables.js";
import { migrateOperationsTables } from "../migrate-operations-tables.js";
import { migrateAuthFields } from "../migrate-auth-fields.js";
import { migrateDrizzleColumns } from "../migrate-drizzle-columns.js";

function isSoftMigrationStep(name: string): boolean {
  const n = name.toLowerCase();
  return (
    n.includes("backfill") ||
    n.includes("clear orphan") ||
    n.includes("reconcile") ||
    n.includes("scrub")
  );
}

function isBenignPgError(err: unknown): boolean {
  const code = (err as { code?: string })?.code;
  return (
    code === "42701" || // duplicate_column
    code === "42P07" || // duplicate_table
    code === "42710" || // duplicate_object
    code === "42P01" // undefined_table (rare race)
  );
}

/** Ensure any schema columns added after initial deploy exist on the live DB. */
export async function runStartupMigrations(): Promise<void> {
  try {
    await migrateWmsTables();
  } catch (err) {
    logger.error({ err }, "WMS tables migration failed");
    throw err;
  }

  // HR / payroll / assets / licenses (unprefixed company-scoped tables).
  // Required on Plesk: without this, create/save fails when tables/columns are missing.
  try {
    await migrateOperationsTables();
  } catch (err) {
    logger.error({ err }, "Operations tables migration failed");
    throw err;
  }

  try {
    await migrateAuthFields();
  } catch (err) {
    logger.warn({ err }, "Auth fields migration failed (non-fatal)");
  }

  const steps: Array<{ name: string; sql: ReturnType<typeof sql> }> = [
    {
      name: "financial_years and opening balance tables",
      sql: sql`
        CREATE TABLE IF NOT EXISTS financial_years (
          id serial PRIMARY KEY,
          company_id integer NOT NULL,
          label text NOT NULL,
          start_date text NOT NULL,
          end_date text NOT NULL,
          status text NOT NULL DEFAULT 'inactive',
          audit_status text NOT NULL DEFAULT 'pending',
          closed_at timestamptz,
          closed_by integer,
          closed_by_username text,
          activated_at timestamptz,
          activated_by integer,
          activated_by_username text,
          reopened_at timestamptz,
          reopened_by integer,
          opening_balances_generated boolean NOT NULL DEFAULT false,
          opening_journal_entry_id integer,
          created_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE UNIQUE INDEX IF NOT EXISTS financial_years_company_dates_uidx
          ON financial_years (company_id, start_date, end_date);

        CREATE TABLE IF NOT EXISTS opening_balances (
          id serial PRIMARY KEY,
          company_id integer NOT NULL,
          financial_year_id integer NOT NULL,
          account_id integer,
          account_code text NOT NULL,
          account_name text NOT NULL,
          account_type text,
          debit numeric(15,2) NOT NULL DEFAULT 0,
          credit numeric(15,2) NOT NULL DEFAULT 0,
          notes text,
          created_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE TABLE IF NOT EXISTS customer_opening_balances (
          id serial PRIMARY KEY,
          company_id integer NOT NULL,
          financial_year_id integer NOT NULL,
          customer_id integer,
          customer_name text NOT NULL,
          amount numeric(15,2) NOT NULL DEFAULT 0,
          currency text NOT NULL DEFAULT 'SGD',
          created_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE TABLE IF NOT EXISTS vendor_opening_balances (
          id serial PRIMARY KEY,
          company_id integer NOT NULL,
          financial_year_id integer NOT NULL,
          vendor_id integer,
          vendor_name text NOT NULL,
          amount numeric(15,2) NOT NULL DEFAULT 0,
          currency text NOT NULL DEFAULT 'SGD',
          created_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE TABLE IF NOT EXISTS inventory_opening_balances (
          id serial PRIMARY KEY,
          company_id integer NOT NULL,
          financial_year_id integer NOT NULL,
          stock_item_id integer,
          item_code text,
          item_name text NOT NULL,
          warehouse_id integer,
          warehouse_name text,
          quantity numeric(15,4) NOT NULL DEFAULT 0,
          value numeric(15,2) NOT NULL DEFAULT 0,
          created_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE TABLE IF NOT EXISTS fixed_asset_opening_balances (
          id serial PRIMARY KEY,
          company_id integer NOT NULL,
          financial_year_id integer NOT NULL,
          account_code text,
          description text NOT NULL,
          amount numeric(15,2) NOT NULL DEFAULT 0,
          created_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE TABLE IF NOT EXISTS bank_opening_balances (
          id serial PRIMARY KEY,
          company_id integer NOT NULL,
          financial_year_id integer NOT NULL,
          account_id integer,
          account_code text NOT NULL,
          account_name text NOT NULL,
          amount numeric(15,2) NOT NULL DEFAULT 0,
          created_at timestamptz NOT NULL DEFAULT now()
        );
      `,
    },
    {
      name: "accounting_backups schedule and retention tables",
      sql: sql`
        CREATE TABLE IF NOT EXISTS accounting_backups (
          id serial PRIMARY KEY,
          company_id integer NOT NULL,
          backup_code text NOT NULL,
          backup_type text NOT NULL,
          from_date text,
          to_date text,
          financial_year_id integer,
          financial_year_label text,
          status text NOT NULL DEFAULT 'pending',
          storage_path text,
          storage_ref text,
          file_size_bytes bigint,
          checksum_sha256 text,
          backup_source text NOT NULL DEFAULT 'manual',
          schedule_id integer,
          error_message text,
          created_by integer,
          created_by_username text,
          created_at timestamptz NOT NULL DEFAULT now(),
          completed_at timestamptz,
          restored_at timestamptz,
          restored_by integer
        );
        CREATE INDEX IF NOT EXISTS accounting_backups_company_idx ON accounting_backups (company_id);
        CREATE INDEX IF NOT EXISTS accounting_backups_status_idx ON accounting_backups (company_id, status);

        CREATE TABLE IF NOT EXISTS backup_schedules (
          id serial PRIMARY KEY,
          company_id integer NOT NULL,
          enabled boolean NOT NULL DEFAULT true,
          frequency text NOT NULL,
          time_of_day text NOT NULL DEFAULT '23:00',
          day_of_week integer,
          backup_type text NOT NULL DEFAULT 'accounting',
          last_run_at timestamptz,
          next_run_at timestamptz,
          created_by integer,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        );

        CREATE TABLE IF NOT EXISTS backup_retention_settings (
          id serial PRIMARY KEY,
          company_id integer NOT NULL UNIQUE,
          daily_keep_days integer NOT NULL DEFAULT 30,
          weekly_keep_weeks integer NOT NULL DEFAULT 12,
          monthly_keep_months integer NOT NULL DEFAULT 12,
          financial_year_keep_forever boolean NOT NULL DEFAULT true,
          updated_by integer,
          updated_at timestamptz NOT NULL DEFAULT now()
        );

        CREATE TABLE IF NOT EXISTS accounting_restore_operations (
          id serial PRIMARY KEY,
          company_id integer NOT NULL,
          restore_code text NOT NULL,
          backup_id integer NOT NULL,
          backup_code text NOT NULL,
          restore_type text NOT NULL,
          status text NOT NULL DEFAULT 'PENDING',
          safety_backup_id integer,
          safety_backup_code text,
          steps_json text,
          result_message text,
          error_details text,
          started_by integer,
          started_by_username text,
          started_at timestamptz NOT NULL DEFAULT now(),
          completed_at timestamptz
        );
        CREATE INDEX IF NOT EXISTS accounting_restore_ops_company_idx ON accounting_restore_operations (company_id);
        CREATE INDEX IF NOT EXISTS accounting_restore_ops_backup_idx ON accounting_restore_operations (backup_id);
      `,
    },
    {
      name: "ensure accounting_restore_operations table",
      sql: sql`
        CREATE TABLE IF NOT EXISTS accounting_restore_operations (
          id serial PRIMARY KEY,
          company_id integer NOT NULL,
          restore_code text NOT NULL,
          backup_id integer NOT NULL,
          backup_code text NOT NULL,
          restore_type text NOT NULL,
          status text NOT NULL DEFAULT 'PENDING',
          safety_backup_id integer,
          safety_backup_code text,
          steps_json text,
          result_message text,
          error_details text,
          started_by integer,
          started_by_username text,
          started_at timestamptz NOT NULL DEFAULT now(),
          completed_at timestamptz
        );
        CREATE INDEX IF NOT EXISTS accounting_restore_ops_company_idx ON accounting_restore_operations (company_id);
        CREATE INDEX IF NOT EXISTS accounting_restore_ops_backup_idx ON accounting_restore_operations (backup_id);
      `,
    },
    {
      name: "stock_items.batch_no",
      sql: sql`ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS batch_no text`,
    },
    {
      name: "stock_items.mrp_price",
      sql: sql`ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS mrp_price numeric(15,2) DEFAULT 0`,
    },
    {
      name: "stock_items.alternate_uom",
      sql: sql`
        ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS alternate_uom text;
        ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS alternate_qty numeric(15,4) DEFAULT 0;
        ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS main_qty numeric(15,4) DEFAULT 0;
      `,
    },
    {
      name: "customers.quotation_terms",
      sql: sql`ALTER TABLE customers ADD COLUMN IF NOT EXISTS quotation_terms text`,
    },
    {
      name: "vendor invoice payment schedule and reminders",
      sql: sql`
        ALTER TABLE vendor_invoices ADD COLUMN IF NOT EXISTS payment_terms text NOT NULL DEFAULT '30 Days Net';
        ALTER TABLE vendor_invoices ADD COLUMN IF NOT EXISTS due_date text;
        ALTER TABLE vendor_invoices ADD COLUMN IF NOT EXISTS planned_payment_date text;
        ALTER TABLE vendor_invoices ADD COLUMN IF NOT EXISTS reminders_enabled boolean NOT NULL DEFAULT false;
        ALTER TABLE vendor_invoices ADD COLUMN IF NOT EXISTS reminder_start_after_day integer;
        ALTER TABLE vendor_invoices ADD COLUMN IF NOT EXISTS reminder_emails jsonb NOT NULL DEFAULT '[]'::jsonb;
        UPDATE vendor_invoices
        SET due_date = (to_date(pi_date, 'YYYY-MM-DD') + interval '30 days')::date::text
        WHERE due_date IS NULL AND pi_date ~ '^\\d{4}-\\d{2}-\\d{2}$';
      `,
    },
    {
      name: "settings.so running numbers",
      sql: sql`
        ALTER TABLE settings ADD COLUMN IF NOT EXISTS so_prefix text DEFAULT 'SO';
        ALTER TABLE settings ADD COLUMN IF NOT EXISTS so_counter integer NOT NULL DEFAULT 0;
        ALTER TABLE settings ADD COLUMN IF NOT EXISTS so_suffix text DEFAULT '';
      `,
    },
    {
      name: "purchase quotations",
      sql: sql`
        ALTER TABLE settings ADD COLUMN IF NOT EXISTS pq_prefix text DEFAULT 'PQ';
        ALTER TABLE settings ADD COLUMN IF NOT EXISTS pq_counter integer NOT NULL DEFAULT 0;
        ALTER TABLE settings ADD COLUMN IF NOT EXISTS pq_suffix text DEFAULT '';
        CREATE TABLE IF NOT EXISTS purchase_quotations (
          id serial PRIMARY KEY,
          pq_number text NOT NULL UNIQUE,
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
          status text NOT NULL DEFAULT 'draft',
          email_sent_to text,
          converted_po_id integer,
          converted_po_number text,
          created_by integer NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now()
        );
      `,
    },
    {
      name: "sales_orders table",
      sql: sql`
      CREATE TABLE IF NOT EXISTS sales_orders (
        id                      serial       PRIMARY KEY,
        so_number               text         NOT NULL UNIQUE,
        company_id              integer      NOT NULL DEFAULT 1,
        qt_id                   integer,
        qt_number               text,
        customer_name           text         NOT NULL,
        customer_address        text,
        customer_contact        text,
        customer_contact_email  text,
        delivery_address        text,
        issue_date              text,
        delivery_date           text,
        payment_terms           text,
        notes                   text,
        is_private              boolean      NOT NULL DEFAULT false,
        items                   jsonb        NOT NULL DEFAULT '[]',
        subtotal                numeric(15,2) NOT NULL DEFAULT 0,
        discount_amount         numeric(15,2) NOT NULL DEFAULT 0,
        tax                     numeric(15,2) NOT NULL DEFAULT 0,
        total_amount            numeric(15,2) NOT NULL DEFAULT 0,
        currency                text         NOT NULL DEFAULT 'SGD',
        status                  text         NOT NULL DEFAULT 'draft',
        email_sent_to           text,
        created_by              integer      NOT NULL,
        created_at              timestamptz  NOT NULL DEFAULT now()
      )
    `,
    },
    {
      name: "sales_orders.inv_id",
      sql: sql`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS inv_id integer`,
    },
    {
      name: "sales_orders.inv_number",
      sql: sql`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS inv_number text`,
    },
    {
      name: "sales_orders.do_id",
      sql: sql`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS do_id integer`,
    },
    {
      name: "sales_orders.do_number",
      sql: sql`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS do_number text`,
    },
    {
      name: "invoices.so_id",
      sql: sql`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS so_id integer`,
    },
    {
      name: "invoices.so_number",
      sql: sql`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS so_number text`,
    },
    {
      name: "invoices.is_modified",
      sql: sql`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS is_modified boolean NOT NULL DEFAULT false`,
    },
    {
      name: "quotations.valid_until",
      sql: sql`ALTER TABLE quotations ADD COLUMN IF NOT EXISTS valid_until text`,
    },
    {
      name: "quotations.sales_person",
      sql: sql`ALTER TABLE quotations ADD COLUMN IF NOT EXISTS sales_person text`,
    },
    {
      name: "delivery_orders.so_id",
      sql: sql`ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS so_id integer`,
    },
    {
      name: "delivery_orders.so_number",
      sql: sql`ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS so_number text`,
    },
    {
      name: "credit_notes.so_id",
      sql: sql`ALTER TABLE credit_notes ADD COLUMN IF NOT EXISTS so_id integer`,
    },
    {
      name: "credit_notes.so_number",
      sql: sql`ALTER TABLE credit_notes ADD COLUMN IF NOT EXISTS so_number text`,
    },
    {
      name: "debit_notes.so_id",
      sql: sql`ALTER TABLE debit_notes ADD COLUMN IF NOT EXISTS so_id integer`,
    },
    {
      name: "debit_notes.so_number",
      sql: sql`ALTER TABLE debit_notes ADD COLUMN IF NOT EXISTS so_number text`,
    },
    {
      name: "clear orphan sales_orders.inv links",
      sql: sql`
        UPDATE sales_orders so
        SET inv_id = NULL, inv_number = NULL
        WHERE so.inv_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.id = so.inv_id)
      `,
    },
    {
      name: "clear orphan sales_orders.do links",
      sql: sql`
        UPDATE sales_orders so
        SET do_id = NULL, do_number = NULL
        WHERE so.do_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM delivery_orders d WHERE d.id = so.do_id)
      `,
    },
    {
      name: "backfill invoices.so from sales_orders",
      sql: sql`
        UPDATE invoices i
        SET so_id = so.id, so_number = so.so_number
        FROM sales_orders so
        WHERE so.inv_id = i.id
          AND (i.so_id IS NULL OR i.so_number IS NULL OR i.so_number = '')
      `,
    },
    {
      name: "grn.po_id nullable for manual GRN",
      sql: sql`ALTER TABLE grn ALTER COLUMN po_id DROP NOT NULL`,
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
      name: "settings.fa running numbers",
      sql: sql`
        ALTER TABLE settings ADD COLUMN IF NOT EXISTS fa_prefix text DEFAULT 'FA';
        ALTER TABLE settings ADD COLUMN IF NOT EXISTS fa_counter integer NOT NULL DEFAULT 0;
        ALTER TABLE settings ADD COLUMN IF NOT EXISTS fa_suffix text DEFAULT '';
      `,
    },
    {
      name: "employees document scan columns",
      sql: sql`
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS passport_scan text;
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS visa_scan text;
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS nric_scan text;
      `,
    },
    {
      name: "companies.gst_reg_no",
      sql: sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS gst_reg_no text`,
    },
    {
      name: "companies.logo_url and domain",
      sql: sql`
        ALTER TABLE companies ADD COLUMN IF NOT EXISTS logo_url text;
        ALTER TABLE companies ADD COLUMN IF NOT EXISTS domain text;
      `,
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
      name: "vendor_invoices.additional_info",
      sql: sql`
        ALTER TABLE vendor_invoices ADD COLUMN IF NOT EXISTS customer_note text;
        ALTER TABLE vendor_invoices ADD COLUMN IF NOT EXISTS delivery_instructions text;
        ALTER TABLE vendor_invoices ADD COLUMN IF NOT EXISTS terms_and_conditions text;
        ALTER TABLE vendor_invoices ADD COLUMN IF NOT EXISTS authorised_signature text;
        ALTER TABLE vendor_invoices ADD COLUMN IF NOT EXISTS discount_amount numeric(15,2) NOT NULL DEFAULT 0;
        ALTER TABLE vendor_invoices ADD COLUMN IF NOT EXISTS expense_account_id integer;
        ALTER TABLE vendor_invoices ADD COLUMN IF NOT EXISTS sales_person text;
      `,
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
        gst_claimable   boolean NOT NULL DEFAULT false,
        is_deductible   boolean NOT NULL DEFAULT true,
        deductible_pct  integer NOT NULL DEFAULT 100,
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
      name: "income_records.gst_claimable",
      sql: sql`ALTER TABLE income_records ADD COLUMN IF NOT EXISTS gst_claimable boolean NOT NULL DEFAULT false`,
    },
    {
      name: "income_records.is_deductible",
      sql: sql`ALTER TABLE income_records ADD COLUMN IF NOT EXISTS is_deductible boolean NOT NULL DEFAULT true`,
    },
    {
      name: "income_records.deductible_pct",
      sql: sql`ALTER TABLE income_records ADD COLUMN IF NOT EXISTS deductible_pct integer NOT NULL DEFAULT 100`,
    },
    {
      name: "income_attachments table",
      sql: sql`
      CREATE TABLE IF NOT EXISTS income_attachments (
        id          serial PRIMARY KEY,
        income_id   integer NOT NULL REFERENCES income_records(id) ON DELETE CASCADE,
        file_name   text NOT NULL DEFAULT 'attachment',
        mime_type   text NOT NULL DEFAULT 'application/octet-stream',
        file_data   text NOT NULL,
        created_at  timestamptz NOT NULL DEFAULT now()
      )
    `,
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
    {
      name: "expenses table",
      sql: sql`
      CREATE TABLE IF NOT EXISTS expenses (
        id serial PRIMARY KEY,
        company_id integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        expense_date text NOT NULL,
        vendor_name text NOT NULL,
        description text NOT NULL,
        category text NOT NULL,
        amount numeric(15,2) NOT NULL,
        gst_amount numeric(15,2) NOT NULL DEFAULT 0,
        gst_claimable boolean NOT NULL DEFAULT false,
        is_deductible boolean NOT NULL DEFAULT true,
        deductible_pct integer NOT NULL DEFAULT 100,
        currency text NOT NULL DEFAULT 'SGD',
        payment_method text DEFAULT 'bank_transfer',
        receipt_data text,
        receipt_mime_type text,
        vendor_id integer,
        project_id integer,
        voucher_id integer,
        journal_entry_id integer,
        status text NOT NULL DEFAULT 'draft',
        notes text,
        created_by integer NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`,
    },
    {
      name: "expenses.gst_amount",
      sql: sql`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS gst_amount numeric(15,2) NOT NULL DEFAULT 0`,
    },
    {
      name: "expenses.gst_claimable",
      sql: sql`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS gst_claimable boolean NOT NULL DEFAULT false`,
    },
    {
      name: "expenses.is_deductible",
      sql: sql`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS is_deductible boolean NOT NULL DEFAULT true`,
    },
    {
      name: "expenses.deductible_pct",
      sql: sql`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS deductible_pct integer NOT NULL DEFAULT 100`,
    },
    {
      name: "expenses.currency",
      sql: sql`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'SGD'`,
    },
    {
      name: "expenses.payment_method",
      sql: sql`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS payment_method text DEFAULT 'bank_transfer'`,
    },
    {
      name: "expenses.receipt_data",
      sql: sql`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS receipt_data text`,
    },
    {
      name: "expenses.receipt_mime_type",
      sql: sql`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS receipt_mime_type text`,
    },
    {
      name: "expenses.vendor_id",
      sql: sql`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS vendor_id integer`,
    },
    {
      name: "expenses.project_id",
      sql: sql`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS project_id integer`,
    },
    {
      name: "expenses.voucher_id",
      sql: sql`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS voucher_id integer`,
    },
    {
      name: "expenses.journal_entry_id",
      sql: sql`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS journal_entry_id integer`,
    },
    {
      name: "expenses.status",
      sql: sql`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft'`,
    },
    {
      name: "expenses.notes",
      sql: sql`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS notes text`,
    },
    {
      name: "expenses.updated_at",
      sql: sql`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()`,
    },
    {
      name: "roles table",
      sql: sql`
        CREATE TABLE IF NOT EXISTS roles (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
          created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
          updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
        )
      `,
    },
    {
      name: "permissions table",
      sql: sql`
        CREATE TABLE IF NOT EXISTS permissions (
          id SERIAL PRIMARY KEY,
          module TEXT NOT NULL,
          action TEXT NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
          updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
          CONSTRAINT permissions_module_action_unique UNIQUE (module, action)
        )
      `,
    },
    {
      name: "role_permissions table",
      sql: sql`
        CREATE TABLE IF NOT EXISTS role_permissions (
          role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
          permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
          CONSTRAINT role_permissions_role_id_permission_id_unique UNIQUE (role_id, permission_id)
        )
      `,
    },
    {
      name: "users company_id and role_id columns",
      sql: sql`
        ALTER TABLE users ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS role_id INTEGER REFERENCES roles(id) ON DELETE SET NULL;
      `,
    },
    {
      name: "report designer tables",
      sql: sql`
        CREATE TABLE IF NOT EXISTS report_definitions (
          id SERIAL PRIMARY KEY,
          module TEXT NOT NULL,
          report_type TEXT NOT NULL,
          name TEXT NOT NULL,
          description TEXT,
          is_system BOOLEAN NOT NULL DEFAULT TRUE,
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE UNIQUE INDEX IF NOT EXISTS report_definitions_report_type_idx
          ON report_definitions (report_type);

        CREATE TABLE IF NOT EXISTS report_fields (
          id SERIAL PRIMARY KEY,
          report_definition_id INTEGER NOT NULL REFERENCES report_definitions(id) ON DELETE CASCADE,
          field_key TEXT NOT NULL,
          field_label TEXT NOT NULL,
          field_group TEXT NOT NULL,
          data_type TEXT NOT NULL DEFAULT 'string',
          is_repeatable BOOLEAN NOT NULL DEFAULT FALSE,
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE UNIQUE INDEX IF NOT EXISTS report_fields_definition_key_idx
          ON report_fields (report_definition_id, field_key);

        CREATE TABLE IF NOT EXISTS report_templates (
          id SERIAL PRIMARY KEY,
          company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
          report_definition_id INTEGER NOT NULL REFERENCES report_definitions(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          description TEXT,
          template_json JSONB NOT NULL DEFAULT '{}'::jsonb,
          is_system_template BOOLEAN NOT NULL DEFAULT FALSE,
          is_active BOOLEAN NOT NULL DEFAULT FALSE,
          created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
          updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE UNIQUE INDEX IF NOT EXISTS report_templates_company_def_name_idx
          ON report_templates (company_id, report_definition_id, lower(name))
          WHERE company_id IS NOT NULL;
        CREATE UNIQUE INDEX IF NOT EXISTS report_templates_one_active_idx
          ON report_templates (company_id, report_definition_id)
          WHERE is_active = TRUE AND company_id IS NOT NULL AND is_system_template = FALSE;
        CREATE UNIQUE INDEX IF NOT EXISTS report_templates_one_system_default_idx
          ON report_templates (report_definition_id)
          WHERE is_system_template = TRUE AND company_id IS NULL;
      `,
    },
  ];

  for (const step of steps) {
    try {
      await db.execute(step.sql);
    } catch (err) {
      if (isBenignPgError(err)) {
        logger.info({ step: step.name }, "[startup-migrations] step already applied");
        continue;
      }
      if (isSoftMigrationStep(step.name)) {
        logger.warn({ err, step: step.name }, "[startup-migrations] soft step skipped");
        continue;
      }
      logger.error({ err, step: step.name }, "[startup-migrations] CRITICAL step failed");
      throw err;
    }
  }

  // Align Drizzle schema columns on existing tables (ADD COLUMN IF NOT EXISTS only).
  try {
    await migrateDrizzleColumns();
  } catch (err) {
    logger.error({ err }, "Drizzle column migration failed — refusing to start");
    throw err;
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

/** Post JEs for any confirmed expenses that were confirmed before auto-posting was added. */
export async function backfillExpenseJEsOnStartup(): Promise<void> {
  try {
    const companies = await db.select({ id: companiesTable.id })
      .from(companiesTable)
      .where(eq(companiesTable.country, "Singapore"));

    let total = 0;
    for (const co of companies) {
      // Use a system user id of 1 (the first seeded admin); idempotent — safe to re-run
      const posted = await backfillExpenseJEs(co.id, 1, logger);
      total += posted;
    }
    if (total > 0) {
      logger.info({ posted: total }, "[startup-backfill] expense JE backfill complete");
    }
  } catch (e: any) {
    logger.warn({ err: e.message }, "[startup-backfill] expense JE backfill failed (non-fatal)");
  }
}

/** Post JEs for any confirmed invoices that were created before auto-posting was added. */
export async function backfillInvoiceJEsOnStartup(): Promise<void> {
  try {
    const companies = await db.select({ id: companiesTable.id })
      .from(companiesTable)
      .where(eq(companiesTable.country, "Singapore"));

    let total = 0;
    for (const co of companies) {
      const posted = await backfillInvoiceJEs(co.id, 1, logger);
      total += posted;
    }
    if (total > 0) {
      logger.info({ posted: total }, "[startup-backfill] invoice JE backfill complete");
    }
  } catch (e: any) {
    logger.warn({ err: e.message }, "[startup-backfill] invoice JE backfill failed (non-fatal)");
  }
}

/**
 * Warehouse balances are the source of truth for stock. Older code paths wrote
 * stock_items.stock_qty directly, so the cached total can drift from the
 * warehouse rows and make documents look like they deducted the wrong amount.
 */
export async function reconcileStockQuantitiesOnStartup(): Promise<void> {
  try {
    if (!(await tableExists("warehouse_stock"))) return;

    const result = await db.execute<{ id: number }>(sql`
      UPDATE stock_items AS si
      SET stock_qty = totals.total, updated_at = now()
      FROM (
        SELECT stock_item_id, SUM(quantity) AS total
        FROM warehouse_stock
        GROUP BY stock_item_id
      ) AS totals
      WHERE si.id = totals.stock_item_id
        AND si.stock_qty <> totals.total
      RETURNING si.id
    `);

    if (result.rows.length > 0) {
      logger.info({ items: result.rows.length }, "[startup-backfill] stock quantities reconciled with warehouse balances");
    }
  } catch (e: any) {
    logger.warn({ err: e.message }, "[startup-backfill] stock reconciliation failed (non-fatal)");
  }
}

export async function scrubAccidentalModuleDefaultsOnStartup(): Promise<void> {
  /**
   * Older user create/update always wrote a hardcoded module list that included
   * `stock_items`, which opened the Inventory sidebar without an intentional grant.
   * Strip orphan inventory keys when no other inventory modules were assigned.
   */
  const INTENTIONAL = new Set([
    "warehouses",
    "stock_transfer",
    "inventory_reports",
    "batch_expiry",
  ]);

  try {
    const rows = await db
      .select({
        id: userCompaniesTable.id,
        userId: userCompaniesTable.userId,
        modules: userCompaniesTable.modules,
        role: usersTable.role,
      })
      .from(userCompaniesTable)
      .innerJoin(usersTable, eq(userCompaniesTable.userId, usersTable.id));

    let updated = 0;
    for (const row of rows) {
      const role = String(row.role || "").toLowerCase();
      if (role === "admin" || role === "administrator") continue;

      const mods = Array.isArray(row.modules) ? (row.modules as string[]) : [];
      if (mods.length === 0) continue;

      const hasIntentionalInventory = mods.some((m) => INTENTIONAL.has(m));
      if (hasIntentionalInventory) continue;

      const next = mods.filter((m) => m !== "stock_items");
      if (next.length === mods.length) continue;

      await db
        .update(userCompaniesTable)
        .set({ modules: next })
        .where(eq(userCompaniesTable.id, row.id));
      updated += 1;
    }

    if (updated > 0) {
      logger.info(
        { updated, scrubbed: "stock_items" },
        "[startup-backfill] removed accidental Inventory (stock_items) grants",
      );
    }
  } catch (e: any) {
    logger.warn({ err: e.message }, "[startup-backfill] module scrub failed (non-fatal)");
  }
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
