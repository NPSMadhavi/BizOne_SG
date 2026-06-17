import { pgTable, text, serial, timestamp, integer, boolean, unique } from "drizzle-orm/pg-core";

export const accountsTable = pgTable("accounts", {
  id:          serial("id").primaryKey(),
  companyId:   integer("company_id").notNull(),
  code:        text("code").notNull(),
  name:        text("name").notNull(),
  type:        text("type").notNull(),     // asset | liability | equity | revenue | expense
  subType:     text("sub_type").notNull(), // current_asset | fixed_asset | current_liability | long_term_liability | share_capital | retained_earnings | sales | other_income | cost_of_sales | operating_expense
  description: text("description"),
  isActive:    boolean("is_active").notNull().default(true),
  isSystem:    boolean("is_system").notNull().default(false), // system accounts cannot be deleted
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  companyCodeUnique: unique("accounts_company_code_unique").on(t.companyId, t.code),
}));

export type AccountRecord = typeof accountsTable.$inferSelect;
