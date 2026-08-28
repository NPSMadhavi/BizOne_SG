import { pgTable, text, serial, timestamp, integer, decimal, jsonb, boolean, unique } from "drizzle-orm/pg-core";

export const proformaInvoicesTable = pgTable("proforma_invoices", {
  id: serial("id").primaryKey(),
  piNumber: text("pi_number").notNull(),
  companyId: integer("company_id").notNull().default(1),
  customerName: text("customer_name").notNull(),
  customerAddress: text("customer_address"),
  customerContact: text("customer_contact"),
  customerContactEmail: text("customer_contact_email"),
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
  qtRefNo: text("qt_ref_no"),
  status: text("status").notNull().default("draft"),
  emailSentTo: text("email_sent_to"),
  termsAndConditions: text("terms_and_conditions"),
  deliveryInstructions: text("delivery_instructions"),
  customerNote: text("customer_note"),
  authorisedSignature: text("authorised_signature"),
  createdBy: integer("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  companyPiUnique: unique("proforma_invoices_company_pi_number_unique").on(t.companyId, t.piNumber),
}));

export type ProformaInvoiceRecord = typeof proformaInvoicesTable.$inferSelect;
