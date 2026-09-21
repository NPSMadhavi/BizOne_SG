import { pgTable, serial, text, decimal, timestamp, integer } from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";
import { stockItemsTable } from "./stock-items";

/**
 * Dated purchase-cost history for stock items.
 * Written from Vendor Invoice unit price (invoice date) or Item Master (manual date).
 */
export const stockItemPurchasePricesTable = pgTable("stock_item_purchase_prices", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  stockItemId: integer("stock_item_id").notNull().references(() => stockItemsTable.id, { onDelete: "cascade" }),
  purchasePrice: decimal("purchase_price", { precision: 15, scale: 2 }).notNull().default("0"),
  /** Qty received at this purchase price (e.g. from Vendor Invoice). Catalogue/base stock is separate. */
  quantity: decimal("quantity", { precision: 15, scale: 3 }).notNull().default("0"),
  /** YYYY-MM-DD — vendor invoice date or user-chosen effective date */
  effectiveDate: text("effective_date").notNull(),
  /** vendor_invoice | item_master */
  sourceType: text("source_type").notNull().default("item_master"),
  sourceId: integer("source_id"),
  sourceRef: text("source_ref"),
  notes: text("notes"),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type StockItemPurchasePriceRecord = typeof stockItemPurchasePricesTable.$inferSelect;
