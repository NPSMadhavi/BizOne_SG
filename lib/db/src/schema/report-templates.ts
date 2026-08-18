import { pgTable, serial, text, boolean, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";
import { reportDefinitionsTable } from "./report-definitions";
import { usersTable } from "./users";

export const reportTemplatesTable = pgTable("report_templates", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companiesTable.id, { onDelete: "cascade" }),
  reportDefinitionId: integer("report_definition_id")
    .notNull()
    .references(() => reportDefinitionsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  templateJson: jsonb("template_json").notNull().default({}),
  isSystemTemplate: boolean("is_system_template").notNull().default(false),
  isActive: boolean("is_active").notNull().default(false),
  createdBy: integer("created_by").references(() => usersTable.id, { onDelete: "set null" }),
  updatedBy: integer("updated_by").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ReportTemplateRecord = typeof reportTemplatesTable.$inferSelect;
