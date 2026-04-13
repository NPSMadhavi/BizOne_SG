import { pgTable, text, serial, timestamp, integer, jsonb } from "drizzle-orm/pg-core";

export const deliveryOrdersTable = pgTable("delivery_orders", {
  id: serial("id").primaryKey(),
  doNumber: text("do_number").notNull().unique(),
  customerName: text("customer_name").notNull(),
  customerAddress: text("customer_address"),
  customerContact: text("customer_contact"),
  deliveryDate: text("delivery_date"),
  notes: text("notes"),
  items: jsonb("items").notNull().default([]),
  status: text("status").notNull().default("draft"),
  createdBy: integer("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type DeliveryOrderRecord = typeof deliveryOrdersTable.$inferSelect;
