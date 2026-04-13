import { pgTable, serial, decimal, text } from "drizzle-orm/pg-core";

export const settingsTable = pgTable("settings", {
  id: serial("id").primaryKey(),
  gstRate: decimal("gst_rate", { precision: 5, scale: 2 }).notNull().default("9"),
  smtpHost: text("smtp_host"),
  smtpPort: text("smtp_port"),
  smtpUser: text("smtp_user"),
  smtpPass: text("smtp_pass"),
  smtpFrom: text("smtp_from"),
});

export type SettingsRecord = typeof settingsTable.$inferSelect;
