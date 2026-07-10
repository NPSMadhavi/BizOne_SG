import { pgTable, text, serial, timestamp, integer, decimal, jsonb } from "drizzle-orm/pg-core";

export const vouchersTable = pgTable("vouchers", {
  id: serial("id").primaryKey(),
  voucherNumber: text("voucher_number").notNull(),
  companyId: integer("company_id").notNull(),
  projectId: integer("project_id").notNull(),
  type: text("type").notNull().default("payment"),
  payee: text("payee").notNull(),
  payeeContact: text("payee_contact"),
  issueDate: text("issue_date"),
  description: text("description"),
  status: text("status").notNull().default("draft"),
  items: jsonb("items").notNull().default([]),
  totalAmount: decimal("total_amount", { precision: 15, scale: 2 }).notNull().default("0"),
  currency: text("currency").notNull().default("SGD"),
  paidDate: text("paid_date"),
  bankRef: text("bank_ref"),
  notes: text("notes"),
  createdBy: integer("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type VoucherRecord = typeof vouchersTable.$inferSelect;
