import { pgTable, serial, text, boolean, timestamp, integer } from "drizzle-orm/pg-core";
import { reportDefinitionsTable } from "./report-definitions";

export const reportFieldsTable = pgTable("report_fields", {
  id: serial("id").primaryKey(),
  reportDefinitionId: integer("report_definition_id")
    .notNull()
    .references(() => reportDefinitionsTable.id, { onDelete: "cascade" }),
  fieldKey: text("field_key").notNull(),
  fieldLabel: text("field_label").notNull(),
  fieldGroup: text("field_group").notNull(),
  dataType: text("data_type").notNull().default("string"),
  isRepeatable: boolean("is_repeatable").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ReportFieldRecord = typeof reportFieldsTable.$inferSelect;
