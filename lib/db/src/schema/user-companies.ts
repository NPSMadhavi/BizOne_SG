import { pgTable, serial, integer, unique, jsonb } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { companiesTable } from "./companies";

export const ALL_MODULES = ["purchase_orders", "quotations", "invoices", "delivery_orders"] as const;
export type AppModule = typeof ALL_MODULES[number];

export const userCompaniesTable = pgTable("user_companies", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  modules: jsonb("modules").$type<string[]>().notNull().default(["purchase_orders", "quotations", "invoices", "delivery_orders"]),
}, (table) => [
  unique().on(table.userId, table.companyId),
]);

export type UserCompanyRecord = typeof userCompaniesTable.$inferSelect;
