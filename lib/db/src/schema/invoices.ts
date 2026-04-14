import { pgTable, text, serial, timestamp, integer, decimal, jsonb, boolean } from "drizzle-orm/pg-core";

export const invoicesTable = pgTable("invoices", {
  id: serial("id").primaryKey(),
  invNumber: text("inv_number").notNull().unique(),
  companyId: integer("company_id").notNull().default(1),
  customerName: text("customer_name").notNull(),
  customerAddress: text("customer_address"),
  customerContact: text("customer_contact"),
  customerContactEmail: text("customer_contact_email"),
  deliveryAddress: text("delivery_address"),
  deliveryDate: text("delivery_date"),
  paymentTerms: text("payment_terms"),
  notes: text("notes"),
  isPrivate: boolean("is_private").default(false).notNull(),
  items: jsonb("items").notNull().default([]),
  subtotal: decimal("subtotal", { precision: 15, scale: 2 }).notNull().default("0"),
  discountAmount: decimal("discount_amount", { precision: 15, scale: 2 }).notNull().default("0"),
  tax: decimal("tax", { precision: 15, scale: 2 }).notNull().default("0"),
  totalAmount: decimal("total_amount", { precision: 15, scale: 2 }).notNull().default("0"),
  currency: text("currency").notNull().default("SGD"),
  status: text("status").notNull().default("draft"),
  voidReason: text("void_reason"),
  createdBy: integer("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type InvoiceRecord = typeof invoicesTable.$inferSelect;
