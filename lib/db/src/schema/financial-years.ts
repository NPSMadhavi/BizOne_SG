import {
  pgTable,
  text,
  serial,
  timestamp,
  integer,
  boolean,
  numeric,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/** Multi-company financial years (Singapore calendar year: Jan–Dec). */
export const financialYearsTable = pgTable(
  "financial_years",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id").notNull(),
    label: text("label").notNull(),
    startDate: text("start_date").notNull(), // YYYY-MM-DD
    endDate: text("end_date").notNull(),
    status: text("status").notNull().default("inactive"), // active | inactive | closing | closed
    auditStatus: text("audit_status").notNull().default("pending"), // pending | completed
    closedAt: timestamp("closed_at", { withTimezone: true }),
    closedBy: integer("closed_by"),
    closedByUsername: text("closed_by_username"),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    activatedBy: integer("activated_by"),
    activatedByUsername: text("activated_by_username"),
    reopenedAt: timestamp("reopened_at", { withTimezone: true }),
    reopenedBy: integer("reopened_by"),
    openingBalancesGenerated: boolean("opening_balances_generated").notNull().default(false),
    openingJournalEntryId: integer("opening_journal_entry_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    companyDatesUnique: uniqueIndex("financial_years_company_dates_uidx").on(
      t.companyId,
      t.startDate,
      t.endDate,
    ),
  }),
);

export const glOpeningBalancesTable = pgTable("opening_balances", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull(),
  financialYearId: integer("financial_year_id").notNull(),
  accountId: integer("account_id"),
  accountCode: text("account_code").notNull(),
  accountName: text("account_name").notNull(),
  accountType: text("account_type"),
  debit: numeric("debit", { precision: 15, scale: 2 }).notNull().default("0"),
  credit: numeric("credit", { precision: 15, scale: 2 }).notNull().default("0"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const customerOpeningBalancesTable = pgTable("customer_opening_balances", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull(),
  financialYearId: integer("financial_year_id").notNull(),
  customerId: integer("customer_id"),
  customerName: text("customer_name").notNull(),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull().default("0"),
  currency: text("currency").notNull().default("SGD"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const vendorOpeningBalancesTable = pgTable("vendor_opening_balances", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull(),
  financialYearId: integer("financial_year_id").notNull(),
  vendorId: integer("vendor_id"),
  vendorName: text("vendor_name").notNull(),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull().default("0"),
  currency: text("currency").notNull().default("SGD"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const inventoryOpeningBalancesTable = pgTable("inventory_opening_balances", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull(),
  financialYearId: integer("financial_year_id").notNull(),
  stockItemId: integer("stock_item_id"),
  itemCode: text("item_code"),
  itemName: text("item_name").notNull(),
  warehouseId: integer("warehouse_id"),
  warehouseName: text("warehouse_name"),
  quantity: numeric("quantity", { precision: 15, scale: 4 }).notNull().default("0"),
  value: numeric("value", { precision: 15, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const fixedAssetOpeningBalancesTable = pgTable("fixed_asset_opening_balances", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull(),
  financialYearId: integer("financial_year_id").notNull(),
  accountCode: text("account_code"),
  description: text("description").notNull(),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const bankOpeningBalancesTable = pgTable("bank_opening_balances", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull(),
  financialYearId: integer("financial_year_id").notNull(),
  accountId: integer("account_id"),
  accountCode: text("account_code").notNull(),
  accountName: text("account_name").notNull(),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type FinancialYearRecord = typeof financialYearsTable.$inferSelect;
