import "./load-env";
import app, { assertProductionConfig } from "./app";
import { logger } from "./lib/logger";
import { seedIfEmpty } from "./seed";
import { seedInvoiceReportDefinition } from "./lib/reports/seed.js";
import {
  backfillExchangeRatesOnStartup,
  backfillExpenseJEsOnStartup,
  backfillInvoiceJEsOnStartup,
  getPgErrorCode,
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

function isMigrateOnly(): boolean {
  return (
    process.argv.includes("--migrate-only") ||
    process.env.MIGRATE_ONLY === "1" ||
    process.env.MIGRATE_ONLY === "true"
  );
}

function printMigrationFailure(err: unknown): void {
  const step =
    err && typeof err === "object" && "migrationStep" in err
      ? String((err as { migrationStep?: string }).migrationStep || "")
      : "";
  const pgCode =
    (err && typeof err === "object" && "pgCode" in err
      ? String((err as { pgCode?: string }).pgCode || "")
      : "") || getPgErrorCode(err) || "(none)";
  const message = err instanceof Error ? err.message : String(err);
  // Structured console lines for operators (no secrets).
  console.error("FIRST FAILURE: migration");
  console.error(`STEP: ${step || "(unknown)"}`);
  console.error(`POSTGRES CODE: ${pgCode}`);
  console.error(`MESSAGE: ${message}`);
  logger.error(
    {
      err,
      step: step || undefined,
      pgCode: pgCode === "(none)" ? undefined : pgCode,
      message,
    },
    "Failed to initialize database / startup migrations",
  );
}

async function endPoolQuietly(): Promise<void> {
  try {
    await pool.end();
  } catch {
    /* ignore */
  }
}

// load-env has already run (side-effect import). Validate production config next.
try {
  assertProductionConfig();
} catch (err) {
  logger.error({ err }, "Production configuration invalid — refusing to start");
  process.exit(1);
}

/** Offline / Plesk one-shot: same runStartupMigrations() as boot, never listen. */
if (isMigrateOnly()) {
  logger.info("[migrate:production] starting (migrations only, no listen)");
  runStartupMigrations()
    .then(async () => {
      await logSafeDbDiagnostics();
      logger.info("[migrate:production] SUCCESS — schema migrations complete");
      console.log("MIGRATION COMMAND: PASS");
      await endPoolQuietly();
      process.exit(0);
    })
    .catch(async (err) => {
      printMigrationFailure(err);
      console.error("MIGRATION COMMAND: FAIL");
      await endPoolQuietly();
      process.exit(1);
    });
} else {
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
      printMigrationFailure(err);
      process.exit(1);
    });
}
