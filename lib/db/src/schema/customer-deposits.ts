import { pgTable, serial, text, integer, decimal, timestamp } from "drizzle-orm/pg-core";

export const customerDepositsTable = pgTable("customer_deposits", {
  id:            serial("id").primaryKey(),
  companyId:     integer("company_id").notNull(),
  customerName:  text("customer_name").notNull(),
  currency:      text("currency").notNull().default("SGD"),
  totalAmount:   decimal("total_amount",   { precision: 15, scale: 2 }).notNull(),
  appliedAmount: decimal("applied_amount", { precision: 15, scale: 2 }).notNull().default("0"),
  status:        text("status").notNull().default("available"), // available | exhausted | refunded
  paymentDate:   text("payment_date").notNull(),
  paymentMethod: text("payment_method").default("bank_transfer"),
  bankRef:       text("bank_ref"),
  notes:         text("notes"),
  journalEntryId: integer("journal_entry_id"),
  createdBy:     integer("created_by").notNull(),
  createdAt:     timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CustomerDepositRecord = typeof customerDepositsTable.$inferSelect;
