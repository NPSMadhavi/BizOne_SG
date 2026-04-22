import { pgTable, serial, boolean, text, timestamp } from "drizzle-orm/pg-core";

export const maintenanceTable = pgTable("maintenance", {
  id: serial("id").primaryKey(),
  isEnabled: boolean("is_enabled").default(false).notNull(),
  scheduledStart: text("scheduled_start"),
  scheduledEnd: text("scheduled_end"),
  message: text("message"),
  contactEmail: text("contact_email"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedByUser: text("updated_by_user"),
});

export type MaintenanceRecord = typeof maintenanceTable.$inferSelect;
