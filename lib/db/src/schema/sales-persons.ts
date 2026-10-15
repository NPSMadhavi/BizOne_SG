import { pgTable, serial, text, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";

export const salesPersonsTable = pgTable(
  "sales_persons",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    employmentCode: text("employment_code").notNull(),
    passwordHash: text("password_hash").notNull().default(""),
    department: text("department").notNull().default(""),
    phone: text("phone").notNull().default(""),
    country: text("country").notNull().default("Singapore"),
    address: text("address").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("sales_persons_company_code_idx").on(table.companyId, table.employmentCode),
  ],
);

export type SalesPersonRecord = typeof salesPersonsTable.$inferSelect;
