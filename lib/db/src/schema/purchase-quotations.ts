import { pgTable, text, serial, timestamp, integer, decimal, jsonb, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const purchaseQuotationsTable = pgTable("purchase_quotations", {
  id: serial("id").primaryKey(),
  pqNumber: text("pq_number").notNull().unique(),
  companyId: integer("company_id").notNull().default(1),
  vendorName: text("vendor_name").notNull(),
  vendorAddress: text("vendor_address"),
  vendorContact: text("vendor_contact"),
  vendorContactEmail: text("vendor_contact_email"),
  deliveryAddress: text("delivery_address"),
  issueDate: text("issue_date"),
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
  emailSentTo: text("email_sent_to"),
  convertedPoId: integer("converted_po_id"),
  convertedPoNumber: text("converted_po_number"),
  createdBy: integer("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPurchaseQuotationSchema = createInsertSchema(purchaseQuotationsTable).omit({ id: true, createdAt: true });
export type InsertPurchaseQuotation = z.infer<typeof insertPurchaseQuotationSchema>;
export type PurchaseQuotationRecord = typeof purchaseQuotationsTable.$inferSelect;
