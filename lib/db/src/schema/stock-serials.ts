import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";
import { stockItemsTable } from "./stock-items";

export const stockSerialsTable = pgTable("stock_serials", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  stockItemId: integer("stock_item_id").notNull().references(() => stockItemsTable.id, { onDelete: "cascade" }),
  serialNumber: text("serial_number").notNull(),
  status: text("status").notNull().default("available"),
  grnId: integer("grn_id"),
  grnNumber: text("grn_number"),
  invoiceId: integer("invoice_id"),
  invoiceNumber: text("invoice_number"),
  doId: integer("do_id"),
  doNumber: text("do_number"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type StockSerialRecord = typeof stockSerialsTable.$inferSelect;
