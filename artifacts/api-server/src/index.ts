import "./load-env";
import app from "./app";
import { logger } from "./lib/logger";
import { seedIfEmpty } from "./seed";
import { seedInvoiceReportDefinition } from "./lib/reports/seed.js";
import { backfillExchangeRatesOnStartup, backfillExpenseJEsOnStartup, backfillInvoiceJEsOnStartup, reconcileStockQuantitiesOnStartup, runStartupMigrations, scrubAccidentalModuleDefaultsOnStartup } from "./lib/startup-backfill.js";
import { startBackupScheduler } from "./lib/accounting-backup.js";
import { ensureUploadDirectories } from "./lib/ensure-uploads.js";
import { pool } from "@workspace/db";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

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
    logger.error({ err }, "[startup] database diagnostics failed");
    throw err;
  }
}

ensureUploadDirectories();

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
    logger.error({ err }, "Failed to initialize database");
    process.exit(1);
  });
