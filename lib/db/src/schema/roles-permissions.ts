import { pgTable, serial, text, integer, timestamp, unique } from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";

export const rolesTable = pgTable("roles", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const permissionsTable = pgTable("permissions", {
  id: serial("id").primaryKey(),
  module: text("module").notNull(),
  action: text("action").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique().on(table.module, table.action),
]);

export const rolePermissionsTable = pgTable("role_permissions", {
  roleId: integer("role_id").notNull().references(() => rolesTable.id, { onDelete: "cascade" }),
  permissionId: integer("permission_id").notNull().references(() => permissionsTable.id, { onDelete: "cascade" }),
}, (table) => [
  unique().on(table.roleId, table.permissionId),
]);
