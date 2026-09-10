import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import signature from "cookie-signature";
import pg from "pg";
import path from "path";
import fs from "fs";

import router from "./routes";
import { logger } from "./lib/logger";
import { seedCompanies } from "./routes/companies";
import { sanitizeErrorMessage, logServerError } from "./lib/safe-error.js";

// cookie-signature may be CJS; ensure .sign exists
const signCookie = (sid: string, secret: string) =>
  "s:" + (signature as { sign: (val: string, secret: string) => string }).sign(sid, secret);

const isProd = process.env.NODE_ENV === "production";

const app: Express = express();

/**
 * Plesk / nginx terminates TLS. Trust X-Forwarded-* so secure cookies and
 * protocol detection work behind the reverse proxy.
 */
if (isProd || process.env.TRUST_PROXY === "true" || process.env.TRUST_PROXY === "1") {
  app.set("trust proxy", 1);
}

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

/** Comma-separated origins, e.g. https://sg.biz1.in,https://www.sg.biz1.in */
const corsOrigins = (process.env.CORS_ORIGINS || process.env.APP_URL || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

let corsProdWarningLogged = false;

app.use(
  cors({
    credentials: true,
    origin(origin, callback) {
      // Non-browser / same-origin requests may omit Origin
      if (!origin) {
        callback(null, true);
        return;
      }
      if (!isProd) {
        callback(null, true);
        return;
      }
      if (corsOrigins.length === 0) {
        if (!corsProdWarningLogged) {
          corsProdWarningLogged = true;
          logger.warn(
            "CORS_ORIGINS / APP_URL not set in production — reflecting request origin. Set CORS_ORIGINS for stricter control.",
          );
        }
        callback(null, true);
        return;
      }
      if (corsOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`CORS blocked for origin: ${origin}`));
    },
  }),
);

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

/**
 * ---------------------------------------------------------
 * Session configuration
 * ---------------------------------------------------------
 */

if (isProd && !process.env.SESSION_SECRET) {
  throw new Error(
    "SESSION_SECRET is required in production. Set a strong random secret in the Plesk environment.",
  );
}

const sessionSecret =
  process.env.SESSION_SECRET ||
  (!isProd ? "dev-only-insecure-session-secret" : "");

if (!sessionSecret) {
  throw new Error("SESSION_SECRET is required");
}

const cookieSecure =
  process.env.COOKIE_SECURE === "true" ||
  process.env.COOKIE_SECURE === "1" ||
  (isProd && process.env.COOKIE_SECURE !== "false");

const PgSession = connectPgSimple(session);

const pgPool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ...(process.env.DATABASE_SSL === "true" || process.env.DATABASE_SSL === "require"
    ? {
        ssl: {
          rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false",
        },
      }
    : {}),
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

/**
 * Mobile clients (React Native) often cannot read Set-Cookie.
 * Accept unsigned session id via X-BizOne-Session and inject a signed cookie
 * before express-session runs.
 */
app.use((req, _res, next) => {
  const mobileSid = req.headers["x-bizone-session"];
  if (typeof mobileSid === "string" && mobileSid.length > 5) {
    const existing = req.headers.cookie || "";
    if (!existing.includes("bizone.sid=")) {
      const signed = signCookie(mobileSid, sessionSecret);
      req.headers.cookie = `bizone.sid=${signed}${existing ? `; ${existing}` : ""}`;
    }
  }
  next();
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
      secure: cookieSecure,
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
    req: any,
    res: any,
    _next: any,
  ) => {
    logServerError(logger, err, {
      reqId: req?.id,
      method: req?.method,
      url: req?.url?.split("?")[0],
    });

    const status =
      err.status ??
      err.statusCode ??
      500;

    res.status(status).json({
      error: sanitizeErrorMessage(err, "Internal server error"),
    });
  },
);

export default app;