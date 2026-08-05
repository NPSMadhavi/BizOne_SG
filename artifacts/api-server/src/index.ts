import app from "./app";
import { logger } from "./lib/logger";
import { seedIfEmpty } from "./seed";
import { backfillExchangeRatesOnStartup, runStartupMigrations } from "./lib/startup-backfill.js";
import { migrateAuthFields } from "./migrate-auth-fields";
import { migrateOperationsTables } from "./migrate-operations-tables";
import { migrateWmsTables } from "./migrate-wms-tables";

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

migrateAuthFields()
  .then(() => seedIfEmpty())
  .then(() => runStartupMigrations())
  .then(() => migrateOperationsTables())
  .then(() => migrateWmsTables())
  .then(() => backfillExchangeRatesOnStartup())
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
    logger.error({ err }, "Failed to seed database");
    process.exit(1);
  });
