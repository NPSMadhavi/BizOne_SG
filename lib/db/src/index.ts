import { AsyncLocalStorage } from "node:async_hooks";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

/** When set, queries on `db` / `pool` use that company's database instead of the shared one. */
export const companyDbContext = new AsyncLocalStorage<pg.Pool>();

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

function buildPoolConfig(): pg.PoolConfig {
  const connectionString = process.env.DATABASE_URL;
  const config: pg.PoolConfig = { connectionString };

  // Explicit SSL for managed / Plesk PostgreSQL. Local dev usually omits this.
  // Also works if DATABASE_URL already contains ?sslmode=require (pg honors it).
  const sslMode = (process.env.DATABASE_SSL || "").toLowerCase();
  if (sslMode === "true" || sslMode === "require" || sslMode === "1") {
    config.ssl = {
      rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false",
    };
  }

  return config;
}

/** Always the shared database. Login reads this pool, even inside a company request. */
export const masterPool = new Pool(buildPoolConfig());

/** Shared pool that follows companyDbContext so each company reads its own database. */
export const pool = new Proxy(masterPool, {
  get(target, prop) {
    const current = companyDbContext.getStore() ?? target;
    const value = Reflect.get(current, prop, current);
    return typeof value === "function" ? value.bind(current) : value;
  },
}) as pg.Pool;

export const db = drizzle(pool, { schema });

/** Shared-database client. Does not follow companyDbContext. */
export const masterDb = drizzle(masterPool, { schema });

export * from "./schema";
export * from "./modules";
