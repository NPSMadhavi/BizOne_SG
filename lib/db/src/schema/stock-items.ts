import { pgTable, serial, text, decimal, boolean, timestamp, integer } from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";

export const stockItemsTable = pgTable("stock_items", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  uom: text("uom").notNull().default("pcs"),
  type: text("type").notNull().default("product"),
  unitPrice: decimal("unit_price", { precision: 15, scale: 2 }).default("0"),
  stockQty: decimal("stock_qty", { precision: 15, scale: 3 }).default("0"),
  minStockLevel: decimal("min_stock_level", { precision: 15, scale: 3 }).default("0"),
  reorderLevel: decimal("reorder_level", { precision: 15, scale: 3 }).default("0"),
  maxStockLevel: decimal("max_stock_level", { precision: 15, scale: 3 }).default("0"),
  batchNo: text("batch_no"),
  isActive: boolean("is_active").default(true).notNull(),
  createdBy: integer("created_by"),
  updatedBy: integer("updated_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type StockItemRecord = typeof stockItemsTable.$inferSelect;
