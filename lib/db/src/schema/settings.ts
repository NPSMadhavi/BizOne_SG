import { pgTable, serial, decimal, text, integer } from "drizzle-orm/pg-core";

export const settingsTable = pgTable("settings", {
  id: serial("id").primaryKey(),
  gstRate: decimal("gst_rate", { precision: 5, scale: 2 }).notNull().default("9"),
  smtpHost: text("smtp_host"),
  smtpPort: text("smtp_port"),
  smtpUser: text("smtp_user"),
  smtpPass: text("smtp_pass"),
  smtpFrom: text("smtp_from"),
  poPrefix: text("po_prefix").default("PO"),
  poCounter: integer("po_counter").default(1).notNull(),
  poSuffix: text("po_suffix").default(""),
  invPrefix: text("inv_prefix").default("INV"),
  invCounter: integer("inv_counter").default(1).notNull(),
  invSuffix: text("inv_suffix").default(""),
  qtPrefix: text("qt_prefix").default("QT"),
  qtCounter: integer("qt_counter").default(1).notNull(),
  qtSuffix: text("qt_suffix").default(""),
  doPrefix: text("do_prefix").default("DO"),
  doCounter: integer("do_counter").default(1).notNull(),
  doSuffix: text("do_suffix").default(""),
  grnPrefix: text("grn_prefix").default("GRN"),
  grnCounter: integer("grn_counter").default(1).notNull(),
  grnSuffix: text("grn_suffix").default(""),
});

export type SettingsRecord = typeof settingsTable.$inferSelect;
