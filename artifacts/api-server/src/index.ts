import "./load-env";
import app, { assertProductionConfig, frontendPath } from "./app";
import { logger } from "./lib/logger";
import { seedIfEmpty } from "./seed";
import { seedInvoiceReportDefinition } from "./lib/reports/seed.js";
import { seedCompanies } from "./routes/companies";
import {
  backfillExchangeRatesOnStartup,
  backfillExpenseJEsOnStartup,
  backfillInvoiceJEsOnStartup,
  getPgErrorCode,
  reconcileStockQuantitiesOnStartup,
  runStartupMigrations,
  scrubAccidentalModuleDefaultsOnStartup,
  withStartupBootstrapLock,
} from "./lib/startup-backfill.js";
import { startBackupScheduler } from "./lib/accounting-backup.js";
import { ensureUploadDirectories } from "./lib/ensure-uploads.js";
import { pool } from "@workspace/db";

/**
 * Under Passenger, listen() is intercepted and bound to a Passenger-owned
 * socket — the port is ignored. PORT only matters standalone (local dev).
 */
function resolveListenPort(): number {
  const rawPort = process.env["PORT"];
  if (!rawPort) return 3000;
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
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

function annotateBootstrapError(err: unknown, step: string): never {
  if (err && typeof err === "object") {
    (err as { bootstrapStep?: string; pgCode?: string }).bootstrapStep = step;
    const code = getPgErrorCode(err);
    if (code) (err as { pgCode?: string }).pgCode = code;
  }
  throw err;
}

async function runBootstrapStep(
  name: string,
  fn: () => Promise<void>,
): Promise<void> {
  try {
    await fn();
  } catch (err) {
    annotateBootstrapError(err, name);
  }
}

/**
 * Single coordinated startup bootstrap.
 * Blocking advisory lock: one worker runs schema + data writers; others wait
 * then re-enter the same idempotent work. Process death releases the lock.
 */
async function runCoordinatedStartupBootstrap(): Promise<void> {
  await withStartupBootstrapLock(async () => {
    try {
      await runStartupMigrations();
    } catch (err) {
      printMigrationFailure(err);
      throw err;
    }
    await runBootstrapStep("seedCompanies", () => seedCompanies());
    await runBootstrapStep("seedIfEmpty", () => seedIfEmpty());
    await runBootstrapStep("seedInvoiceReportDefinition", () =>
      seedInvoiceReportDefinition(),
    );
    await runBootstrapStep(
      "scrubAccidentalModuleDefaultsOnStartup",
      () => scrubAccidentalModuleDefaultsOnStartup(),
    );
    await runBootstrapStep("backfillExpenseJEsOnStartup", () =>
      backfillExpenseJEsOnStartup(),
    );
    await runBootstrapStep("backfillInvoiceJEsOnStartup", () =>
      backfillInvoiceJEsOnStartup(),
    );
    await runBootstrapStep("backfillExchangeRatesOnStartup", () =>
      backfillExchangeRatesOnStartup(),
    );
    await runBootstrapStep("reconcileStockQuantitiesOnStartup", () =>
      reconcileStockQuantitiesOnStartup(),
    );
    logger.info("[startup-bootstrap] complete");
  });
}

// load-env has already run (side-effect import). Validate production config next.
try {
  assertProductionConfig();
} catch (err) {
  logger.error({ err }, "Production configuration invalid — refusing to start");
  process.exit(1);
}

/** Offline / Plesk one-shot: same coordinated bootstrap as boot, never listen. */
if (isMigrateOnly()) {
  logger.info("[migrate:production] starting (bootstrap only, no listen)");
  runCoordinatedStartupBootstrap()
    .then(async () => {
      await logSafeDbDiagnostics();
      logger.info("[migrate:production] SUCCESS — startup bootstrap complete");
      console.log("MIGRATION COMMAND: PASS");
      await endPoolQuietly();
      process.exit(0);
    })
    .catch(async (err) => {
      const step =
        err && typeof err === "object" && "migrationStep" in err
          ? String((err as { migrationStep?: string }).migrationStep || "")
          : "";
      if (!step) {
        logger.error({ err }, "Startup failed");
      }
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

  runCoordinatedStartupBootstrap()
    .then(() => logSafeDbDiagnostics())
    .then(() => {
      if (!frontendPath) {
        logger.error(
          "React frontend build directory was not found — refusing to listen",
        );
        process.exit(1);
        return;
      }
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
      const isMigration =
        err && typeof err === "object" && "migrationStep" in err;
      if (!isMigration) {
        const step =
          err && typeof err === "object" && "bootstrapStep" in err
            ? String((err as { bootstrapStep?: string }).bootstrapStep || "")
            : "";
        const pgCode =
          (err && typeof err === "object" && "pgCode" in err
            ? String((err as { pgCode?: string }).pgCode || "")
            : "") || getPgErrorCode(err) || "(none)";
        logger.error(
          {
            err,
            step: step || undefined,
            pgCode: pgCode === "(none)" ? undefined : pgCode,
          },
          "Startup failed",
        );
      } else {
        logger.error({ err }, "Startup failed");
      }
      process.exit(1);
    });
}
