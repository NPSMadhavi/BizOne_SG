import {
  pgTable,
  text,
  serial,
  timestamp,
  integer,
  boolean,
  bigint,
} from "drizzle-orm/pg-core";

/** Accounting backup history — multi-tenant, independent of FY status. */
export const accountingBackupsTable = pgTable("accounting_backups", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull(),
  backupCode: text("backup_code").notNull(), // human Backup ID e.g. BK-2026-0001
  backupType: text("backup_type").notNull(), // full_database | accounting | financial_year
  fromDate: text("from_date"),
  toDate: text("to_date"),
  financialYearId: integer("financial_year_id"),
  financialYearLabel: text("financial_year_label"),
  status: text("status").notNull().default("pending"), // pending|in_progress|completed|failed|restored
  storagePath: text("storage_path"),
  storageRef: text("storage_ref"),
  fileSizeBytes: bigint("file_size_bytes", { mode: "number" }),
  checksumSha256: text("checksum_sha256"),
  backupSource: text("backup_source").notNull().default("manual"), // manual|scheduled|fy_close
  scheduleId: integer("schedule_id"),
  errorMessage: text("error_message"),
  createdBy: integer("created_by"),
  createdByUsername: text("created_by_username"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  restoredAt: timestamp("restored_at", { withTimezone: true }),
  restoredBy: integer("restored_by"),
});

export const backupSchedulesTable = pgTable("backup_schedules", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  frequency: text("frequency").notNull(), // daily|weekly|monthly
  timeOfDay: text("time_of_day").notNull().default("23:00"), // HH:mm local
  dayOfWeek: integer("day_of_week"), // 0=Sun for weekly
  backupType: text("backup_type").notNull().default("accounting"),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  nextRunAt: timestamp("next_run_at", { withTimezone: true }),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const backupRetentionSettingsTable = pgTable("backup_retention_settings", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().unique(),
  dailyKeepDays: integer("daily_keep_days").notNull().default(30),
  weeklyKeepWeeks: integer("weekly_keep_weeks").notNull().default(12),
  monthlyKeepMonths: integer("monthly_keep_months").notNull().default(12),
  financialYearKeepForever: boolean("financial_year_keep_forever").notNull().default(true),
  updatedBy: integer("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** High-risk restore job tracking — admin-only operations. */
export const accountingRestoreOperationsTable = pgTable("accounting_restore_operations", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull(),
  restoreCode: text("restore_code").notNull(), // RST-2026-0001
  backupId: integer("backup_id").notNull(),
  backupCode: text("backup_code").notNull(),
  restoreType: text("restore_type").notNull(), // full_database | accounting | financial_year
  status: text("status").notNull().default("PENDING"),
  // PENDING | VALIDATING | SAFETY_BACKUP | RESTORING | VERIFYING | COMPLETED | FAILED | ROLLED_BACK
  safetyBackupId: integer("safety_backup_id"),
  safetyBackupCode: text("safety_backup_code"),
  stepsJson: text("steps_json"), // JSON checklist for UI progress
  resultMessage: text("result_message"),
  errorDetails: text("error_details"),
  startedBy: integer("started_by"),
  startedByUsername: text("started_by_username"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export type AccountingBackupRecord = typeof accountingBackupsTable.$inferSelect;
export type AccountingRestoreOperationRecord = typeof accountingRestoreOperationsTable.$inferSelect;
