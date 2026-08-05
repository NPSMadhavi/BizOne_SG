import { pgTable, serial, text, integer, decimal, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";
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
  // Optional line-items payload (WMS / stock receive flows)
  items: jsonb("items").notNull().default([]),
  subtotal: decimal("subtotal", { precision: 15, scale: 2 }).notNull().default("0"),
  tax: decimal("tax", { precision: 15, scale: 2 }).notNull().default("0"),
  // GST fields (IRAS-compliant)
  // gstTreatment: 'standard_rated' (SR 9%) | 'zero_rated' (ZR 0%) | 'exempt' | 'out_of_scope' (OS)
  gstTreatment: text("gst_treatment").notNull().default("standard_rated"),
  gstRate: decimal("gst_rate", { precision: 5, scale: 2 }).notNull().default("9"),
  gstAmount: decimal("gst_amount", { precision: 15, scale: 2 }).notNull().default("0"),
  // When true, the totalAmount entered by the user already INCLUDES GST (net is back-calculated)
  gstInclusive: boolean("gst_inclusive").notNull().default(false),
  // Exchange rate to SGD at invoice date (1.000000 for SGD invoices)
  exchangeRate: decimal("exchange_rate", { precision: 10, scale: 6 }).notNull().default("1.000000"),
  createdBy: integer("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type VendorInvoiceRecord = typeof vendorInvoicesTable.$inferSelect;
