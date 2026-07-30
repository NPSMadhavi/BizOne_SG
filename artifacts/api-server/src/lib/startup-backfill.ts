/**
 * Startup exchange-rate backfill.
 * Runs once per server boot; finds every non-SGD record whose exchange_rate
 * is still the default 1.000000 and fills it from the free CDN API.
 * Safe to call on every startup — it skips records that already have a real rate.
 */
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { getExchangeRateToSGD } from "./exchange-rate.js";
import { logger } from "./logger.js";

interface FxRow { id: number; currency: string; date: string | null; }

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
