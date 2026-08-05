import { pool } from "@workspace/db";
import { logger } from "./lib/logger";

const AUTH_USER_COLUMN_MIGRATIONS = [
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name TEXT`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_number TEXT`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
];

const COMPANY_COLUMN_MIGRATIONS = [
  `ALTER TABLE companies ADD COLUMN IF NOT EXISTS domain TEXT`,
];

export async function migrateAuthFields(): Promise<void> {
  for (const statement of AUTH_USER_COLUMN_MIGRATIONS) {
    await pool.query(statement);
  }
  for (const statement of COMPANY_COLUMN_MIGRATIONS) {
    await pool.query(statement);
  }
  logger.info("Users auth columns migration complete");
}
