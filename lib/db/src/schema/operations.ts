import { pgTable, serial, text, integer, boolean, timestamp, jsonb, decimal } from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";
import { usersTable } from "./users";

export const employeesTable = pgTable("ops_employees", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  employeeCode: text("employee_code").notNull(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  address: text("address"),
  department: text("department"),
  designation: text("designation"),
  joinDate: text("join_date"),
  status: text("status").notNull().default("active"),
  salary: text("salary"),
  nationality: text("nationality"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const assetsTable = pgTable("ops_assets", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  tag: text("tag").notNull(),
  type: text("type").notNull(),
  category: text("category").notNull().default("hardware"),
  serial: text("serial"),
  model: text("model"),
  manufacturer: text("manufacturer"),
  status: text("status").notNull().default("available"),
  condition: text("condition"),
  assignedTo: text("assigned_to"),
  location: text("location"),
  vendor: text("vendor"),
  purchaseDate: text("purchase_date"),
  warrantyExpiry: text("warranty_expiry"),
  cost: text("cost"),
  description: text("description"),
  hasLicense: boolean("has_license").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const licensesTable = pgTable("ops_licenses", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  assetId: integer("asset_id"),
  name: text("name").notNull(),
  licenseKey: text("license_key").notNull(),
  type: text("type").notNull().default("perpetual"),
  seats: integer("seats").default(1),
  purchaseDate: text("purchase_date"),
  expiryDate: text("expiry_date"),
  cost: text("cost"),
  renewalCycle: text("renewal_cycle").default("none"),
  status: text("status").default("active"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const assetAssignmentsTable = pgTable("ops_asset_assignments", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  assetId: integer("asset_id").notNull(),
  employeeId: integer("employee_id").notNull(),
  dateAssigned: text("date_assigned"),
  dateReturned: text("date_returned"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const employeePayrollTable = pgTable("ops_employee_payroll", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  employeeId: integer("employee_id").notNull(),
  baseSalary: decimal("base_salary", { precision: 15, scale: 2 }).notNull().default("0"),
  allowances: jsonb("allowances").$type<Record<string, unknown>>().default({}),
  deductions: jsonb("deductions").$type<Record<string, unknown>>().default({}),
  currency: text("currency").notNull().default("SGD"),
  payFrequency: text("pay_frequency").notNull().default("monthly"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const payrollRecordsTable = pgTable("ops_payroll_records", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  employeeId: integer("employee_id").notNull(),
  payrollConfigId: integer("payroll_config_id"),
  periodStart: text("period_start").notNull(),
  periodEnd: text("period_end").notNull(),
  grossPay: decimal("gross_pay", { precision: 15, scale: 2 }).notNull().default("0"),
  netPay: decimal("net_pay", { precision: 15, scale: 2 }).notNull().default("0"),
  status: text("status").notNull().default("draft"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const opsTasksTable = pgTable("ops_tasks", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").notNull().default("todo"),
  priority: text("priority").notNull().default("medium"),
  assigneeId: integer("assignee_id"),
  startDate: text("start_date"),
  dueDate: text("due_date"),
  eventType: text("event_type").default("task"),
  createdBy: integer("created_by").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const companyDocumentsTable = pgTable("ops_company_documents", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  documentType: text("document_type").notNull().default("other"),
  title: text("title").notNull(),
  filePath: text("file_path"),
  issueDate: text("issue_date"),
  expiryDate: text("expiry_date"),
  notes: text("notes"),
  uploadedBy: integer("uploaded_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type OpsEmployee = typeof employeesTable.$inferSelect;
export type OpsAsset = typeof assetsTable.$inferSelect;
export type OpsLicense = typeof licensesTable.$inferSelect;
export type OpsTask = typeof opsTasksTable.$inferSelect;
