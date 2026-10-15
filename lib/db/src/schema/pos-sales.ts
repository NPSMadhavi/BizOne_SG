import { pgTable, text, integer, timestamp, jsonb, uniqueIndex, index } from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";
import { usersTable } from "./users";
import { salesPersonsTable } from "./sales-persons";

export const posSalesTable = pgTable(
  "pos_sales",
  {
    id: text("id").primaryKey(),
    companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
    channel: text("channel").notNull().default("retail"),
    posNumber: text("pos_number").notNull(),
    salesPersonId: integer("sales_person_id").references(() => salesPersonsTable.id, { onDelete: "set null" }),
    salesPersonName: text("sales_person_name"),
    createdBy: integer("created_by").references(() => usersTable.id, { onDelete: "set null" }),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("pos_sales_company_number_idx").on(table.companyId, table.posNumber),
    index("pos_sales_company_channel_idx").on(table.companyId, table.channel),
  ],
);

export type PosSaleRow = typeof posSalesTable.$inferSelect;
