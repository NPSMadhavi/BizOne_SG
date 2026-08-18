import { pgTable, serial, text, boolean, timestamp } from "drizzle-orm/pg-core";

export const reportDefinitionsTable = pgTable("report_definitions", {
  id: serial("id").primaryKey(),
  module: text("module").notNull(),
  reportType: text("report_type").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  isSystem: boolean("is_system").notNull().default(true),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ReportDefinitionRecord = typeof reportDefinitionsTable.$inferSelect;
