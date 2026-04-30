import { pgTable, serial, text, integer, decimal, timestamp } from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";
import { vendorInvoicesTable } from "./vendor-invoices";

export const vendorPaymentsTable = pgTable("vendor_payments", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  vendorInvoiceId: integer("vendor_invoice_id").notNull().references(() => vendorInvoicesTable.id, { onDelete: "cascade" }),
  paymentDate: text("payment_date").notNull(),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  reference: text("reference"),
  paymentMethod: text("payment_method").default("bank_transfer"),
  notes: text("notes"),
  createdBy: integer("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type VendorPaymentRecord = typeof vendorPaymentsTable.$inferSelect;
