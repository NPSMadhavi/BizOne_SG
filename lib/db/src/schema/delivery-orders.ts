import { pgTable, text, serial, timestamp, integer, jsonb, boolean } from "drizzle-orm/pg-core";

export const deliveryOrdersTable = pgTable("delivery_orders", {
  id: serial("id").primaryKey(),
  doNumber: text("do_number").notNull().unique(),
  companyId: integer("company_id").notNull().default(1),
  customerName: text("customer_name").notNull(),
  customerAddress: text("customer_address"),
  customerContact: text("customer_contact"),
  issueDate: text("issue_date"),
  deliveryDate: text("delivery_date"),
  paymentTerms: text("payment_terms"),
  notes: text("notes"),
  isPrivate: boolean("is_private").default(false).notNull(),
  items: jsonb("items").notNull().default([]),
  status: text("status").notNull().default("draft"),
  invId: integer("inv_id"),
  invNumber: text("inv_number"),
  createdBy: integer("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type DeliveryOrderRecord = typeof deliveryOrdersTable.$inferSelect;
