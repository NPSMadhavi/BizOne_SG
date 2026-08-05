import { pgTable, serial, text, decimal, boolean, timestamp, integer, date, uniqueIndex } from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";
import { stockItemsTable } from "./stock-items";
import { usersTable } from "./users";

export const warehousesTable = pgTable("warehouses", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  pinCode: text("pin_code"),
  country: text("country"),
  remarks: text("remarks"),
  contactPerson: text("contact_person"),
  contactNumber: text("contact_number"),
  email: text("email"),
  isDefault: boolean("is_default").default(false).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdBy: integer("created_by").references(() => usersTable.id),
  updatedBy: integer("updated_by").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  companyCodeIdx: uniqueIndex("warehouses_company_code_idx").on(t.companyId, t.code),
}));

export const warehouseStockTable = pgTable("warehouse_stock", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  warehouseId: integer("warehouse_id").notNull().references(() => warehousesTable.id, { onDelete: "cascade" }),
  stockItemId: integer("stock_item_id").notNull().references(() => stockItemsTable.id, { onDelete: "cascade" }),
  quantity: decimal("quantity", { precision: 15, scale: 3 }).notNull().default("0"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  whItemIdx: uniqueIndex("warehouse_stock_wh_item_idx").on(t.warehouseId, t.stockItemId),
}));

export const openingStockTable = pgTable("opening_stock", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  warehouseId: integer("warehouse_id").notNull().references(() => warehousesTable.id),
  stockItemId: integer("stock_item_id").notNull().references(() => stockItemsTable.id),
  quantity: decimal("quantity", { precision: 15, scale: 3 }).notNull(),
  unitCost: decimal("unit_cost", { precision: 15, scale: 2 }).default("0"),
  entryDate: date("entry_date").notNull(),
  remarks: text("remarks"),
  createdBy: integer("created_by").references(() => usersTable.id),
  updatedBy: integer("updated_by").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  whItemIdx: uniqueIndex("opening_stock_wh_item_idx").on(t.warehouseId, t.stockItemId),
}));

export const goodsReceiptsTable = pgTable("goods_receipts", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  grnNumber: text("grn_number").notNull(),
  warehouseId: integer("warehouse_id").notNull().references(() => warehousesTable.id),
  supplier: text("supplier"),
  referenceNumber: text("reference_number"),
  receiptDate: date("receipt_date").notNull(),
  remarks: text("remarks"),
  status: text("status").notNull().default("posted"),
  createdBy: integer("created_by").references(() => usersTable.id),
  updatedBy: integer("updated_by").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const goodsReceiptItemsTable = pgTable("goods_receipt_items", {
  id: serial("id").primaryKey(),
  goodsReceiptId: integer("goods_receipt_id").notNull().references(() => goodsReceiptsTable.id, { onDelete: "cascade" }),
  stockItemId: integer("stock_item_id").notNull().references(() => stockItemsTable.id),
  quantity: decimal("quantity", { precision: 15, scale: 3 }).notNull(),
  unitCost: decimal("unit_cost", { precision: 15, scale: 2 }).default("0"),
});

export const goodsIssuesTable = pgTable("goods_issues", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  ginNumber: text("gin_number").notNull(),
  warehouseId: integer("warehouse_id").notNull().references(() => warehousesTable.id),
  reason: text("reason"),
  issueDate: date("issue_date").notNull(),
  remarks: text("remarks"),
  status: text("status").notNull().default("posted"),
  createdBy: integer("created_by").references(() => usersTable.id),
  updatedBy: integer("updated_by").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const goodsIssueItemsTable = pgTable("goods_issue_items", {
  id: serial("id").primaryKey(),
  goodsIssueId: integer("goods_issue_id").notNull().references(() => goodsIssuesTable.id, { onDelete: "cascade" }),
  stockItemId: integer("stock_item_id").notNull().references(() => stockItemsTable.id),
  quantity: decimal("quantity", { precision: 15, scale: 3 }).notNull(),
});

export const stockTransfersTable = pgTable("stock_transfers", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  transferNumber: text("transfer_number").notNull(),
  fromWarehouseId: integer("from_warehouse_id").notNull().references(() => warehousesTable.id),
  toWarehouseId: integer("to_warehouse_id").notNull().references(() => warehousesTable.id),
  transferDate: date("transfer_date").notNull(),
  remarks: text("remarks"),
  status: text("status").notNull().default("posted"),
  createdBy: integer("created_by").references(() => usersTable.id),
  updatedBy: integer("updated_by").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const stockTransferItemsTable = pgTable("stock_transfer_items", {
  id: serial("id").primaryKey(),
  stockTransferId: integer("stock_transfer_id").notNull().references(() => stockTransfersTable.id, { onDelete: "cascade" }),
  stockItemId: integer("stock_item_id").notNull().references(() => stockItemsTable.id),
  quantity: decimal("quantity", { precision: 15, scale: 3 }).notNull(),
});

export const stockAdjustmentsTable = pgTable("stock_adjustments", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  adjustmentNumber: text("adjustment_number").notNull(),
  warehouseId: integer("warehouse_id").notNull().references(() => warehousesTable.id),
  stockItemId: integer("stock_item_id").notNull().references(() => stockItemsTable.id),
  adjustmentType: text("adjustment_type").notNull(),
  reason: text("reason"),
  currentQuantity: decimal("current_quantity", { precision: 15, scale: 3 }).notNull(),
  actualQuantity: decimal("actual_quantity", { precision: 15, scale: 3 }).notNull(),
  difference: decimal("difference", { precision: 15, scale: 3 }).notNull(),
  remarks: text("remarks"),
  adjustmentDate: date("adjustment_date").notNull(),
  createdBy: integer("created_by").references(() => usersTable.id),
  updatedBy: integer("updated_by").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const stockMovementsTable = pgTable("stock_movements", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  warehouseId: integer("warehouse_id").notNull().references(() => warehousesTable.id),
  stockItemId: integer("stock_item_id").notNull().references(() => stockItemsTable.id),
  transactionType: text("transaction_type").notNull(),
  documentNumber: text("document_number"),
  referenceType: text("reference_type"),
  referenceId: integer("reference_id"),
  quantityIn: decimal("quantity_in", { precision: 15, scale: 3 }).notNull().default("0"),
  quantityOut: decimal("quantity_out", { precision: 15, scale: 3 }).notNull().default("0"),
  balance: decimal("balance", { precision: 15, scale: 3 }).notNull(),
  reference: text("reference"),
  userId: integer("user_id").references(() => usersTable.id),
  username: text("username"),
  movementDate: timestamp("movement_date", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type WarehouseRecord = typeof warehousesTable.$inferSelect;
export type StockMovementRecord = typeof stockMovementsTable.$inferSelect;
