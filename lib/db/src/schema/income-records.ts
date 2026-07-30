import { pgTable, serial, text, integer, decimal, timestamp } from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";

export const INCOME_CATEGORIES = [
  "rental_income",
  "interest_income",
  "dividend_income",
  "grant_subsidy",
  "commission_income",
  "service_fee",
  "royalty_income",
  "gain_on_disposal",
  "forex_gain",
  "other_income",
] as const;

export type IncomeCategory = typeof INCOME_CATEGORIES[number];

export const GST_TREATMENTS = ["standard_rated", "zero_rated", "exempt", "out_of_scope"] as const;
export type GstTreatment = typeof GST_TREATMENTS[number];

export const incomeRecordsTable = pgTable("income_records", {
  id:             serial("id").primaryKey(),
  companyId:      integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  incomeDate:     text("income_date").notNull(),
  payerName:      text("payer_name").notNull(),
  description:    text("description").notNull(),
  category:       text("category").notNull(),
  amount:         decimal("amount",     { precision: 15, scale: 2 }).notNull(),
  gstAmount:      decimal("gst_amount", { precision: 15, scale: 2 }).notNull().default("0"),
  gstTreatment:   text("gst_treatment").notNull().default("standard_rated"),
  currency:       text("currency").notNull().default("SGD"),
  // Exchange rate to SGD at income date (1.000000 for SGD records)
  exchangeRate:   decimal("exchange_rate", { precision: 10, scale: 6 }).notNull().default("1.000000"),
  paymentMethod:  text("payment_method").default("bank_transfer"),
  accountId:      integer("account_id"),
  reference:      text("reference"),
  notes:          text("notes"),
  status:         text("status").notNull().default("draft"),
  journalEntryId: integer("journal_entry_id"),
  createdBy:      integer("created_by").notNull(),
  createdAt:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:      timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type IncomeRecord = typeof incomeRecordsTable.$inferSelect;
