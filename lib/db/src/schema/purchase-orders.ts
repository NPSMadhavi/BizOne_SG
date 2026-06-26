import { pgTable, text, serial, timestamp, integer, decimal, jsonb, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const purchaseOrdersTable = pgTable("purchase_orders", {
  id: serial("id").primaryKey(),
  poNumber: text("po_number").notNull().unique(),
  companyId: integer("company_id").notNull().default(1),
  vendorName: text("vendor_name").notNull(),
  vendorAddress: text("vendor_address"),
  vendorContact: text("vendor_contact"),
  vendorContactEmail: text("vendor_contact_email"),
  deliveryAddress: text("delivery_address"),
  issueDate: text("issue_date"),
  deliveryDate: text("delivery_date"),
  paymentTerms: text("payment_terms"),
  quoteRefNo: text("quote_ref_no"),
  notes: text("notes"),
  isPrivate: boolean("is_private").default(false).notNull(),
  items: jsonb("items").notNull().default([]),
  subtotal: decimal("subtotal", { precision: 15, scale: 2 }).notNull().default("0"),
  tax: decimal("tax", { precision: 15, scale: 2 }).notNull().default("0"),
  totalAmount: decimal("total_amount", { precision: 15, scale: 2 }).notNull().default("0"),
  currency: text("currency").notNull().default("SGD"),
  status: text("status").notNull().default("draft"),
  customerId: integer("customer_id"),
  customerPoRef: text("customer_po_ref"),
  emailSentTo: text("email_sent_to"),
  ackToken: text("ack_token"),
  ackAt: text("ack_at"),
  ackNote: text("ack_note"),
  createdBy: integer("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPurchaseOrderSchema = createInsertSchema(purchaseOrdersTable).omit({ id: true, createdAt: true });
export type InsertPurchaseOrder = z.infer<typeof insertPurchaseOrderSchema>;
export type PurchaseOrderRecord = typeof purchaseOrdersTable.$inferSelect;
