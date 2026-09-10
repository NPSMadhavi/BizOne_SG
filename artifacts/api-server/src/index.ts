import "./load-env";
import app, { assertProductionConfig } from "./app";
import { logger } from "./lib/logger";
import { seedIfEmpty } from "./seed";
import { seedInvoiceReportDefinition } from "./lib/reports/seed.js";
import {
  backfillExchangeRatesOnStartup,
  backfillExpenseJEsOnStartup,
  backfillInvoiceJEsOnStartup,
  reconcileStockQuantitiesOnStartup,
  runStartupMigrations,
  scrubAccidentalModuleDefaultsOnStartup,
} from "./lib/startup-backfill.js";
import { startBackupScheduler } from "./lib/accounting-backup.js";
import { ensureUploadDirectories } from "./lib/ensure-uploads.js";
import { pool } from "@workspace/db";

/**
 * Passenger provides PORT. Never hardcode. Never fall back to 3000.
 * Re-read at listen time so load-env cannot stale-capture an empty value.
 */
function resolveListenPort(): number {
  const rawPort = process.env["PORT"];
  if (!rawPort) {
    throw new Error(
      "PORT environment variable is required but was not provided. " +
        "Passenger/Plesk must inject PORT — do not hardcode it.",
    );
  }
  const port = Number(rawPort);
  if (Number.isNaN(port) || port <= 0) {
    throw new Error(`Invalid PORT value: "${rawPort}"`);
  }
  return port;
}

/** Informational only — migrations already proved DB connectivity. */
async function logSafeDbDiagnostics(): Promise<void> {
  try {
    const result = await pool.query<{
      db: string;
      schema: string;
      user: string;
      version: string;
    }>(
      `SELECT current_database() AS db,
              current_schema() AS schema,
              current_user AS user,
              split_part(version(), ' on ', 1) AS version`,
    );
    const row = result.rows[0];
    let host = "(unknown)";
    try {
      const u = new URL(process.env.DATABASE_URL!.replace(/^postgresql:/, "http:"));
      host = u.hostname;
    } catch {
      /* ignore */
    }
    logger.info(
      {
        env: process.env.NODE_ENV || "development",
        dbHost: host,
        database: row?.db,
        schema: row?.schema,
        dbUser: row?.user,
        pgVersion: row?.version,
      },
      "[startup] database connection OK (credentials not logged)",
    );
  } catch (err) {
    // Migrations already required a working DB; do not independently kill boot.
    logger.warn({ err }, "[startup] database diagnostics failed (non-fatal after migrations)");
  }
}

// load-env has already run (side-effect import). Validate production config next.
try {
  assertProductionConfig();
} catch (err) {
  logger.error({ err }, "Production configuration invalid — refusing to start");
  process.exit(1);
}

const uploads = ensureUploadDirectories();
if (!uploads.ok) {
  logger.warn(
    { uploadsRoot: uploads.uploadsRoot, error: uploads.error },
    "[startup] continuing without writable uploads directory",
  );
}

runStartupMigrations()
  .then(() => logSafeDbDiagnostics())
  .then(() => seedIfEmpty())
  .then(() => seedInvoiceReportDefinition())
  .then(() => scrubAccidentalModuleDefaultsOnStartup())
  .then(() => backfillExpenseJEsOnStartup())
  .then(() => backfillInvoiceJEsOnStartup())
  .then(() => backfillExchangeRatesOnStartup())
  .then(() => reconcileStockQuantitiesOnStartup())
  .then(() => {
    const port = resolveListenPort();
    app.listen(port, "0.0.0.0", (err) => {
      if (err) {
        logger.error({ err }, "Error listening on port");
        process.exit(1);
      }

      logger.info(
        {
          pid: process.pid,
          hostname: "0.0.0.0",
          port,
          migrationStatus: "complete",
        },
        "Server listening",
      );
      startBackupScheduler();
    });
  })
  .catch((err) => {
    logger.error(
      {
        err,
        pgCode: (err as { code?: string })?.code,
        message: err instanceof Error ? err.message : String(err),
      },
      "Failed to initialize database / startup migrations",
    );
    process.exit(1);
  });
