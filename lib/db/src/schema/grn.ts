import { pgTable, text, serial, timestamp, integer, jsonb, boolean } from "drizzle-orm/pg-core";

export const grnTable = pgTable("grn", {
  id: serial("id").primaryKey(),
  grnNumber: text("grn_number").notNull().unique(),
  poId: integer("po_id").notNull(),
  poNumber: text("po_number").notNull(),
  vendorName: text("vendor_name").notNull(),
  companyId: integer("company_id").notNull().default(1),
  status: text("status").notNull().default("draft"),
  items: jsonb("items").notNull().default([]),
  createdBy: integer("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type GrnRecord = typeof grnTable.$inferSelect;
