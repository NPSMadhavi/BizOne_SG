import { pgTable, serial, decimal } from "drizzle-orm/pg-core";

export const settingsTable = pgTable("settings", {
  id: serial("id").primaryKey(),
  gstRate: decimal("gst_rate", { precision: 5, scale: 2 }).notNull().default("9"),
});

export type SettingsRecord = typeof settingsTable.$inferSelect;
