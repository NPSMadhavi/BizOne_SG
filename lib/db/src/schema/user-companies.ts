import { pgTable, serial, integer, unique, jsonb } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { companiesTable } from "./companies";
import { APP_ALL_MODULES } from "../modules";

export { APP_ALL_MODULES as ALL_MODULES };
export type AppModule = (typeof APP_ALL_MODULES)[number];

export const userCompaniesTable = pgTable("user_companies", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  modules: jsonb("modules").$type<string[]>().notNull().default([]),
}, (table) => [
  unique().on(table.userId, table.companyId),
]);

export type UserCompanyRecord = typeof userCompaniesTable.$inferSelect;
