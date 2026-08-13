import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import pg from "pg";
import path from "path";
import fs from "fs";

import router from "./routes";
import { logger } from "./lib/logger";
import { seedCompanies } from "./routes/companies";

const app: Express = express();

/**
 * ---------------------------------------------------------
 * Basic middleware
 * ---------------------------------------------------------
 */

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(cors({ origin: true, credentials: true }));

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

/**
 * ---------------------------------------------------------
 * Session configuration
 * ---------------------------------------------------------
 */

const sessionSecret =
  process.env.SESSION_SECRET ?? "rsv-infotech-po-secret-2024";

const PgSession = connectPgSimple(session);

const pgPool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

pgPool
  .query(`
    CREATE TABLE IF NOT EXISTS "session" (
      "sid" varchar NOT NULL COLLATE "default",
      "sess" json NOT NULL,
      "expire" timestamp(6) NOT NULL,
      CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
    );

    CREATE INDEX IF NOT EXISTS "IDX_session_expire"
    ON "session" ("expire");
  `)
  .catch((err: unknown) => {
    logger.error(
      { err },
      "Failed to create session table",
    );
  });

app.use(
  session({
    name: "bizone.sid",

    store: new PgSession({
      pool: pgPool,
      tableName: "session",
    }),

    secret: sessionSecret,

    resave: false,

    saveUninitialized: false,

    cookie: {
      secure: false,
      httpOnly: true,
      sameSite: "lax",
    },
  }),
);

/**
 * ---------------------------------------------------------
 * API routes
 * ---------------------------------------------------------
 */

app.use("/api", router);

/**
 * ---------------------------------------------------------
 * Seed companies
 * ---------------------------------------------------------
 */

seedCompanies().catch((err) => {
  logger.error(
    { err },
    "Failed to seed companies",
  );
});

/**
 * ---------------------------------------------------------
 * React/Vite frontend
 * ---------------------------------------------------------
 *
 * Your frontend build is:
 *
 * artifacts/
 *   po-app/
 *     dist/
 *       public/
 *         index.html
 *         assets/
 *         fonts/
 *
 * We support both possible working directories:
 *
 * 1. /home/biz1admin/sg.biz1.in
 * 2. /home/biz1admin/sg.biz1.in/artifacts
 *
 * You can also explicitly set FRONTEND_DIST_PATH
 * in Plesk environment variables.
 * ---------------------------------------------------------
 */

const frontendCandidates = [
  // If the application runs from:
  // /home/biz1admin/sg.biz1.in
  path.resolve(
    process.cwd(),
    "artifacts/po-app/dist/public",
  ),

  // If the application runs from:
  // /home/biz1admin/sg.biz1.in/artifacts
  path.resolve(
    process.cwd(),
    "po-app/dist/public",
  ),

  // Optional explicit environment variable
  process.env.FRONTEND_DIST_PATH,
].filter(Boolean) as string[];

const frontendPath = frontendCandidates.find((directory) =>
  fs.existsSync(
    path.join(directory, "index.html"),
  ),
);

if (!frontendPath) {
  logger.error(
    {
      cwd: process.cwd(),
      candidates: frontendCandidates,
    },
    "React frontend build directory was not found",
  );
} else {
  logger.info(
    {
      frontendPath,
      indexFile: path.join(frontendPath, "index.html"),
    },
    "React frontend build directory found",
  );

  /**
   * Serve React/Vite static files
   *
   * Examples:
   *
   * /assets/index-xxxxx.js
   * /assets/index-xxxxx.css
   * /fonts/...
   * /favicon.png
   */
  app.use(
    express.static(frontendPath),
  );

  /**
   * React SPA fallback
   *
   * This allows routes such as:
   *
   * /
   * /dashboard
   * /companies
   * /invoices
   * /purchase-orders
   * /settings
   *
   * to be handled by React Router.
   *
   * API routes are excluded so that:
   *
   * /api/anything
   *
   * never receives index.html.
   */
  app.use((req, res, next) => {
    if (req.path.startsWith("/api")) {
      return next();
    }

    if (
      req.method !== "GET" &&
      req.method !== "HEAD"
    ) {
      return next();
    }

    return res.sendFile(
      path.join(
        frontendPath,
        "index.html",
      ),
    );
  });
}

/**
 * ---------------------------------------------------------
 * Global error handler
 * ---------------------------------------------------------
 */

app.use(
  (
    err: any,
    _req: any,
    res: any,
    _next: any,
  ) => {
    logger.error(
      { err },
      "Unhandled route error",
    );

    const status =
      err.status ??
      err.statusCode ??
      500;

    res.status(status).json({
      error:
        err?.message ??
        "Internal server error",
    });
  },
);

export default app;