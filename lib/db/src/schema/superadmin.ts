import { pgTable, serial, text, integer, timestamp, boolean, numeric, jsonb, date } from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";
import { usersTable } from "./users";

export const superadminPlansTable = pgTable("superadmin_plans", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  code: text("code").notNull().unique(),
  description: text("description"),
  duration: text("duration").notNull().default("Yearly"), // Monthly | Quarterly | Yearly | Custom
  durationDays: integer("duration_days").notNull().default(365),
  price: numeric("price", { precision: 12, scale: 2 }).notNull().default("0.00"),
  currency: text("currency").notNull().default("SGD"),
  maxUsers: integer("max_users").notNull().default(5),
  modules: jsonb("modules").$type<string[]>().notNull().default([]),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const superadminLicensesTable = pgTable("superadmin_licenses", {
  id: serial("id").primaryKey(),
  licenseKey: text("license_key").notNull().unique(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  planId: integer("plan_id").references(() => superadminPlansTable.id, { onDelete: "set null" }),
  planType: text("plan_type").notNull().default("Standard"),
  purchaseDate: date("purchase_date").notNull(),
  expiryDate: date("expiry_date").notNull(),
  isRenewable: boolean("is_renewable").notNull().default(true),
  status: text("status").notNull().default("Active"), // Active | Pending | Expired | Suspended | Revoked
  paymentStatus: text("payment_status").notNull().default("Paid"), // Paid | Pending | Overdue | Refunded
  maxUsers: integer("max_users").notNull().default(5),
  enabledModules: jsonb("enabled_modules").$type<string[]>().notNull().default([]),
  notes: text("notes"),
  createdBy: integer("created_by").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const superadminLicenseRenewalsTable = pgTable("superadmin_license_renewals", {
  id: serial("id").primaryKey(),
  licenseId: integer("license_id").notNull().references(() => superadminLicensesTable.id, { onDelete: "cascade" }),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  previousExpiryDate: date("previous_expiry_date").notNull(),
  newExpiryDate: date("new_expiry_date").notNull(),
  renewalDate: date("renewal_date").notNull(),
  paymentAmount: numeric("payment_amount", { precision: 12, scale: 2 }).notNull().default("0.00"),
  paymentStatus: text("payment_status").notNull().default("Paid"),
  paymentReference: text("payment_reference"),
  notes: text("notes"),
  renewedBy: integer("renewed_by").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const superadminAuditLogsTable = pgTable("superadmin_audit_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => usersTable.id, { onDelete: "set null" }),
  username: text("username").notNull().default("superadmin"),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id"),
  details: jsonb("details").$type<Record<string, any>>().notNull().default({}),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SuperadminPlanRecord = typeof superadminPlansTable.$inferSelect;
export type SuperadminLicenseRecord = typeof superadminLicensesTable.$inferSelect;
export type SuperadminLicenseRenewalRecord = typeof superadminLicenseRenewalsTable.$inferSelect;
export type SuperadminAuditLogRecord = typeof superadminAuditLogsTable.$inferSelect;

