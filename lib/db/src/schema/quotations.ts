import { pgTable, text, serial, timestamp, integer, decimal, jsonb, boolean } from "drizzle-orm/pg-core";

export const quotationsTable = pgTable("quotations", {
  id: serial("id").primaryKey(),
  qtNumber: text("qt_number").notNull().unique(),
  companyId: integer("company_id").notNull().default(1),
  customerName: text("customer_name").notNull(),
  customerAddress: text("customer_address"),
  customerContact: text("customer_contact"),
  customerContactEmail: text("customer_contact_email"),
  deliveryAddress: text("delivery_address"),
  issueDate: text("issue_date"),
  /** Quotation is valid through this date (YYYY-MM-DD); from the next day status becomes cancelled. */
  validUntil: text("valid_until"),
  deliveryDate: text("delivery_date"),
  salesPerson: text("sales_person"),
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
  termsAndConditions: text("terms_and_conditions"),
  deliveryInstructions: text("delivery_instructions"),
  customerNote: text("customer_note"),
  authorisedSignature: text("authorised_signature"),
  createdBy: integer("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type QuotationRecord = typeof quotationsTable.$inferSelect;
