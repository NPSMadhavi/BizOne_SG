import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

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

export const pool = new Pool(buildPoolConfig());
export const db = drizzle(pool, { schema });

export * from "./schema";
export * from "./modules";
