import app from "./app";
import { logger } from "./lib/logger";
import { seedIfEmpty } from "./seed";
import { backfillExchangeRatesOnStartup, backfillExpenseJEsOnStartup, runStartupMigrations } from "./lib/startup-backfill.js";

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

seedIfEmpty()
  .then(() => runStartupMigrations())
  .then(() => backfillExpenseJEsOnStartup())
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
