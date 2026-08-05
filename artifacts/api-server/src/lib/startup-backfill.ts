/**
 * Startup migrations + exchange-rate backfill.
 * Safe to call on every boot — all DDL uses IF NOT EXISTS / idempotent checks.
 */
import { db, companiesTable } from "@workspace/db";
import { sql, eq } from "drizzle-orm";
import { getExchangeRateToSGD } from "./exchange-rate.js";
import { backfillExpenseJEs } from "./expense-auto-post.js";
import { backfillInvoiceJEs } from "./invoice-auto-post.js";
import { logger } from "./logger.js";

/** Ensure any schema columns added after initial deploy exist on the live DB. */
export async function runStartupMigrations(): Promise<void> {
  try {
    await db.execute(sql`
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS quotation_terms text
    `);
    await db.execute(sql`
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
    `);
    await db.execute(sql`ALTER TABLE settings ADD COLUMN IF NOT EXISTS dn_prefix text NOT NULL DEFAULT 'DN'`);
    await db.execute(sql`ALTER TABLE settings ADD COLUMN IF NOT EXISTS dn_counter integer NOT NULL DEFAULT 1`);
    await db.execute(sql`ALTER TABLE settings ADD COLUMN IF NOT EXISTS dn_suffix text NOT NULL DEFAULT ''`);
    logger.info("[startup-migrations] schema up to date");
  } catch (err) {
    logger.warn({ err }, "[startup-migrations] non-fatal error — continuing");
  }
}

interface FxRow extends Record<string, unknown> { id: number; currency: string; date: string | null; }

async function backfillTable(
  table: string,
  dateCol: string,
): Promise<{ updated: number; failed: number }> {
  let updated = 0; let failed = 0;

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
