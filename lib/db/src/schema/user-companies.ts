import { pgTable, serial, integer, unique } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { companiesTable } from "./companies";

export const userCompaniesTable = pgTable("user_companies", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
}, (table) => [
  unique().on(table.userId, table.companyId),
]);

export type UserCompanyRecord = typeof userCompaniesTable.$inferSelect;
