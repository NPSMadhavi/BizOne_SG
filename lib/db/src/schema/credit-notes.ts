import { pgTable, text, serial, timestamp, integer, decimal, jsonb, boolean, unique } from "drizzle-orm/pg-core";

export const creditNotesTable = pgTable("credit_notes", {
  id: serial("id").primaryKey(),
  cnNumber: text("cn_number").notNull(),
  companyId: integer("company_id").notNull().default(1),
  customerName: text("customer_name").notNull(),
  customerAddress: text("customer_address"),
  contactPerson: text("contact_person"),
  contactEmail: text("contact_email"),
  refInvNumber: text("ref_inv_number"),
  soId: integer("so_id"),
  soNumber: text("so_number"),
  reason: text("reason"),
  issueDate: text("issue_date"),
  currency: text("currency").notNull().default("SGD"),
  paymentTerms: text("payment_terms"),
  notes: text("notes"),
  isPrivate: boolean("is_private").default(false).notNull(),
  items: jsonb("items").notNull().default([]),
  subtotal: decimal("subtotal", { precision: 15, scale: 2 }).notNull().default("0"),
  discountAmount: decimal("discount_amount", { precision: 15, scale: 2 }).notNull().default("0"),
  taxRate: decimal("tax_rate", { precision: 5, scale: 2 }).notNull().default("9"),
  tax: decimal("tax", { precision: 15, scale: 2 }).notNull().default("0"),
  totalAmount: decimal("total_amount", { precision: 15, scale: 2 }).notNull().default("0"),
  status: text("status").notNull().default("draft"),
  voidReason: text("void_reason"),
  emailSentTo: text("email_sent_to"),
  termsAndConditions: text("terms_and_conditions"),
  deliveryInstructions: text("delivery_instructions"),
  customerNote: text("customer_note"),
  authorisedSignature: text("authorised_signature"),
  createdBy: integer("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  companyCnUnique: unique("credit_notes_company_cn_number_unique").on(t.companyId, t.cnNumber),
}));

export type CreditNoteRecord = typeof creditNotesTable.$inferSelect;
