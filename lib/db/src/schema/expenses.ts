import { pgTable, serial, text, integer, decimal, boolean, timestamp } from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";

export const EXPENSE_CATEGORIES = [
  "staff_costs",
  "rental",
  "professional_fees",
  "advertising",
  "office_supplies",
  "utilities",
  "travel",
  "entertainment",
  "motor_vehicle_private",
  "motor_vehicle_commercial",
  "training",
  "insurance",
  "bank_charges",
  "other",
] as const;

export type ExpenseCategory = typeof EXPENSE_CATEGORIES[number];

export const expensesTable = pgTable("expenses", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  expenseDate: text("expense_date").notNull(),
  vendorName: text("vendor_name").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  gstAmount: decimal("gst_amount", { precision: 15, scale: 2 }).notNull().default("0"),
  gstClaimable: boolean("gst_claimable").notNull().default(false),
  isDeductible: boolean("is_deductible").notNull().default(true),
  deductiblePct: integer("deductible_pct").notNull().default(100),
  currency: text("currency").notNull().default("SGD"),
  paymentMethod: text("payment_method").default("bank_transfer"),
  receiptData: text("receipt_data"),
  receiptMimeType: text("receipt_mime_type"),
  vendorId: integer("vendor_id"),
  projectId: integer("project_id"),
  voucherId: integer("voucher_id"),
  journalEntryId: integer("journal_entry_id"),
  status: text("status").notNull().default("draft"),
  notes: text("notes"),
  createdBy: integer("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ExpenseRecord = typeof expensesTable.$inferSelect;
