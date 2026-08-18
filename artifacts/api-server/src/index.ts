import "./load-env";
import app from "./app";
import { logger } from "./lib/logger";
import { seedIfEmpty } from "./seed";
import { seedInvoiceReportDefinition } from "./lib/reports/seed.js";
import { backfillExchangeRatesOnStartup, backfillExpenseJEsOnStartup, backfillInvoiceJEsOnStartup, reconcileStockQuantitiesOnStartup, runStartupMigrations, scrubAccidentalModuleDefaultsOnStartup } from "./lib/startup-backfill.js";

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

runStartupMigrations()
  .then(() => seedIfEmpty())
  .then(() => seedInvoiceReportDefinition())
  .then(() => scrubAccidentalModuleDefaultsOnStartup())
  .then(() => backfillExpenseJEsOnStartup())
  .then(() => backfillInvoiceJEsOnStartup())
  .then(() => backfillExchangeRatesOnStartup())
  .then(() => reconcileStockQuantitiesOnStartup())
  .then(() => {
    app.listen(port, (err) => {
      if (err) {
        logger.error({ err }, "Error listening on port");
        process.exit(1);
      }

      logger.info({ pid: process.pid, hostname: "localhost", port }, "Server listening");
    });
  })
  .catch((err) => {
    logger.error({ err }, "Failed to initialize database");
    process.exit(1);
  });
