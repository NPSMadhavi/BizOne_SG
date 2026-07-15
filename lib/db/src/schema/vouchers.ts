import { pgTable, text, serial, timestamp, integer, decimal, jsonb } from "drizzle-orm/pg-core";

export const vouchersTable = pgTable("vouchers", {
  id: serial("id").primaryKey(),
  voucherNumber: text("voucher_number").notNull(),
  companyId: integer("company_id").notNull(),
  projectId: integer("project_id"),
  type: text("type").notNull().default("payment"),
  payee: text("payee").notNull(),
  payeeContact: text("payee_contact"),
  issueDate: text("issue_date"),
  description: text("description"),
  // Status: draft | pending_verification | pending_approval | approved | paid
  status: text("status").notNull().default("draft"),
  items: jsonb("items").notNull().default([]),
  totalAmount: decimal("total_amount", { precision: 15, scale: 2 }).notNull().default("0"),
  currency: text("currency").notNull().default("SGD"),
  paidDate: text("paid_date"),
  bankRef: text("bank_ref"),
  notes: text("notes"),
  // Legacy proof fields (kept for backward compat — new system uses voucher_attachments)
  proofData: text("proof_data"),
  proofMimeType: text("proof_mime_type"),
  // Creator
  createdBy: integer("created_by").notNull(),
  preparedByName: text("prepared_by_name"),
  // Workflow signatories
  verifierId: integer("verifier_id"),
  approverId: integer("approver_id"),
  paidById: integer("paid_by_id"),
  verifiedAt: text("verified_at"),
  approvedAt: text("approved_at"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const voucherAttachmentsTable = pgTable("voucher_attachments", {
  id: serial("id").primaryKey(),
  voucherId: integer("voucher_id").notNull(),
  fileName: text("file_name").notNull().default("attachment"),
  mimeType: text("mime_type").notNull().default("image/jpeg"),
  fileData: text("file_data").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type VoucherRecord = typeof vouchersTable.$inferSelect;
export type VoucherAttachmentRecord = typeof voucherAttachmentsTable.$inferSelect;
