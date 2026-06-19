import { pgTable, serial, text, integer, decimal, timestamp, jsonb } from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";

export const vendorInvoicesTable = pgTable("vendor_invoices", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  piNumber: text("pi_number").notNull(),
  piDate: text("pi_date"),
  vendorName: text("vendor_name").notNull(),
  poIds: jsonb("po_ids").notNull().default([]),
  poNumbers: text("po_numbers"),
  currency: text("currency").notNull().default("SGD"),
  totalAmount: decimal("total_amount", { precision: 15, scale: 2 }).notNull().default("0"),
  paidAmount: decimal("paid_amount", { precision: 15, scale: 2 }).notNull().default("0"),
  status: text("status").notNull().default("pending"),
  notes: text("notes"),
  expenseAccountId: integer("expense_account_id"),
  createdBy: integer("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type VendorInvoiceRecord = typeof vendorInvoicesTable.$inferSelect;
