import { pgTable, text, serial, timestamp, integer, decimal } from "drizzle-orm/pg-core";

export const projectsTable = pgTable("projects", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull(),
  name: text("name").notNull(),
  code: text("code"),
  description: text("description"),
  status: text("status").notNull().default("active"),
  budget: decimal("budget", { precision: 15, scale: 2 }),
  startDate: text("start_date"),
  endDate: text("end_date"),
  createdBy: integer("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ProjectRecord = typeof projectsTable.$inferSelect;
