import { pgTable, serial, text, decimal, integer, timestamp, jsonb } from "drizzle-orm/pg-core";

export const taxFilingsTable = pgTable("tax_filings", {
  id:               serial("id").primaryKey(),
  companyId:        integer("company_id").notNull(),
  type:             text("type").notNull(),             // 'eci' | 'form_cs'
  financialYear:    integer("financial_year").notNull(), // e.g. 2024 (FY, not YA)
  fyEndDate:        text("fy_end_date"),                // e.g. '2024-12-31'
  revenue:          decimal("revenue",          { precision: 15, scale: 2 }),
  chargeableIncome: decimal("chargeable_income",{ precision: 15, scale: 2 }),
  taxPayable:       decimal("tax_payable",      { precision: 15, scale: 2 }),
  status:           text("status").notNull().default("draft"), // draft | filed | nil_exempt
  filedDate:        text("filed_date"),
  referenceNo:      text("reference_no"),
  data:             jsonb("data").default({}),          // form-specific extra fields
  notes:            text("notes"),
  createdAt:        timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:        timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy:        integer("created_by"),
});

export type TaxFiling = typeof taxFilingsTable.$inferSelect;
