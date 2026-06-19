import { pgTable, serial, text, decimal, integer, timestamp } from "drizzle-orm/pg-core";

export const whtRecordsTable = pgTable("wht_records", {
  id:             serial("id").primaryKey(),
  companyId:      integer("company_id").notNull(),
  vendorName:     text("vendor_name").notNull(),
  vendorCountry:  text("vendor_country"),
  paymentDate:    text("payment_date").notNull(),
  nature:         text("nature").notNull(),
  paymentType:    text("payment_type").notNull(),
  currency:       text("currency").notNull().default("SGD"),
  grossAmount:    decimal("gross_amount", { precision: 15, scale: 2 }).notNull(),
  whtRate:        decimal("wht_rate",     { precision: 5,  scale: 2 }).notNull(),
  whtAmount:      decimal("wht_amount",   { precision: 15, scale: 2 }).notNull(),
  netAmount:      decimal("net_amount",   { precision: 15, scale: 2 }).notNull(),
  filingDeadline: text("filing_deadline"),
  status:         text("status").notNull().default("pending"),
  filedDate:      text("filed_date"),
  referenceNo:    text("reference_no"),
  notes:          text("notes"),
  createdAt:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy:      integer("created_by"),
});

export type WhtRecord = typeof whtRecordsTable.$inferSelect;
