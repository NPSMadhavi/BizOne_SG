import { pgTable, text, integer, serial, timestamp, boolean, pgEnum, uuid, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations, sql } from "drizzle-orm";

// Singapore GST / UEN registration number format.
// Covers the common patterns, e.g. 200812581D (ROC), 53012345A (ROB),
// and the newer UEN style such as T08LL1234A. Matching is case-insensitive.
export const SINGAPORE_GST_REGEX = /^(\d{8}[A-Za-z]|\d{9}[A-Za-z]|[TSRtsr]\d{2}[A-Za-z]{2}\d{4}[A-Za-z])$/;
export const GST_VALIDATION_MESSAGE = "Please enter a valid GST registration number (e.g., 200812581D)";

// Validates a GST registration number ONLY when a value is actually provided.
// Empty / null / undefined values are treated as valid so the field stays optional.
export const isValidOptionalGstNumber = (value?: string | null): boolean => {
  if (value === undefined || value === null) return true;
  const trimmed = value.trim();
  if (trimmed === "") return true;
  return SINGAPORE_GST_REGEX.test(trimmed);
};

// Enums
export const userRoleEnum = pgEnum('user_role', ['super_admin', 'admin', 'hr_manager', 'it_manager', 'accountant', 'employee']);
export const moduleEnum = pgEnum('module', [
  'dashboard', 'assets', 'licenses', 'employees', 'documents', 
  'vendors', 'customers', 'quotations', 'invoices', 'deliveryorders', 'purchaseorders', 'servicereports', 'servicebilling',
  'payroll', 'cashflow', 'projects', 'reports', 'audit_logs', 'settings', 'user_management', 'leases'
]);
export const assetStatusEnum = pgEnum('asset_status', ['available', 'assigned', 'maintenance', 'retired']);
export const documentTypeEnum = pgEnum('document_type', ['passport', 'visa', 'contract', 'certification', 'warranty', 'purchase_order', 'other']);
export const notificationTypeEnum = pgEnum('notification_type', ['document_expiry', 'maintenance_due', 'assignment', 'license_expiry', 'warranty_expiry']);
export const licenseTypeEnum = pgEnum('license_type', ['software', 'hardware', 'subscription', 'service', 'other']);
export const licenseStatusEnum = pgEnum('license_status', ['active', 'expired', 'revoked', 'assigned']);
export const renewalCycleEnum = pgEnum('renewal_cycle', ['none', 'monthly', 'yearly', 'custom']);
export const subscriptionPlanEnum = pgEnum('subscription_plan', ['free', 'starter', 'business', 'enterprise']);
export const subscriptionDurationEnum = pgEnum('subscription_duration', ['free_trial', 'monthly', 'yearly', 'lifetime']);
export const invoiceStatusEnum = pgEnum('invoice_status', ['draft', 'sent', 'paid', 'overdue', 'cancelled']);
export const paymentMethodEnum = pgEnum('payment_method', ['bank_transfer', 'credit_card', 'cash', 'check', 'other']);
export const visaTypeEnum = pgEnum('visa_type', ['s_pass', 'work_permit', 'employment_pass', 'pr', 'dependent_pass', 'ltvp', 'student_pass', 'other']);
export const employeeStatusEnum = pgEnum('employee_status', ['active', 'resigned', 'on_hold', 'terminated']);
export const relationshipEnum = pgEnum('relationship', ['spouse', 'child', 'parent', 'sibling', 'other']);
export const companyDocumentTypeEnum = pgEnum("company_document_type", ["company_license", "government_certificate", "purchase_invoice", "rental_agreement", "utility_bill", "payment_reminder", "legal_agreement", "other"]);

// Payroll Enums
export const payrollStatusEnum = pgEnum('payroll_status', ['draft', 'pending', 'approved', 'paid', 'cancelled']);
export const payrollPeriodEnum = pgEnum('payroll_period', ['monthly', 'bi_weekly', 'weekly']);

// Task Management Enums
export const taskStatusEnum = pgEnum('task_status', ['todo', 'in_progress', 'in_review', 'completed', 'cancelled']);
export const taskPriorityEnum = pgEnum('task_priority', ['low', 'medium', 'high', 'urgent']);
export const projectStatusEnum = pgEnum('project_status', ['planning', 'active', 'on_hold', 'completed', 'cancelled']);

// Calendar & Event Enums
export const eventTypeEnum = pgEnum('event_type', ['meeting', 'leave', 'work_reminder', 'personal_reminder', 'todo_list']);
export const recurrenceTypeEnum = pgEnum('recurrence_type', ['none', 'daily', 'weekly', 'monthly', 'yearly']);
export const leaveTypeEnum = pgEnum('leave_type', ['vacation', 'sick', 'personal', 'other']);

// Reminder Enums
export const reminderStatusEnum = pgEnum('reminder_status', ['active', 'snoozed', 'addressed', 'ignored']);
export const reminderTypeEnum = pgEnum('reminder_type', ['task', 'meeting', 'expiry', 'todo_task']);

// New Business Module Enums
export const quotationStatusEnum = pgEnum('quotation_status', ['draft', 'sent', 'approved', 'rejected', 'expired']);
export const quotationApprovalMethodEnum = pgEnum('quotation_approval_method', ['portal', 'manual']);
export const deliveryStatusEnum = pgEnum('delivery_status', ['pending', 'in_transit', 'delivered', 'signed', 'approved', 'cancelled']);
export const serviceReportStatusEnum = pgEnum('service_report_status', ['pending', 'resolved', 'aborted']);
export const serviceBillingStatusEnum = pgEnum('service_billing_status', ['pending', 'invoiced', 'paid', 'cancelled']);
export const priorityLevelEnum = pgEnum('priority_level', ['low', 'medium', 'high']);
export const purchaseOrderStatusEnum = pgEnum('purchase_order_status', ['draft', 'ordered', 'received', 'cancelled']);
export const proformaInvoiceStatusEnum = pgEnum('proforma_invoice_status', ['draft', 'sent', 'partially_paid', 'paid', 'cancelled']);
export const paymentGatewayTypeEnum = pgEnum('payment_gateway_type', ['stripe', 'paypal', 'paynow']);
export const invoiceStatusEnhancedEnum = pgEnum('invoice_status_enhanced', ['draft', 'sent', 'unpaid', 'partially_paid', 'paid', 'overdue', 'cancelled']);

// Service Plan Enums
export const servicePlanTypeEnum = pgEnum('service_plan_type', ['icare_pack', 'monthly', 'ad_hoc']);
export const icarePackHoursEnum = pgEnum('icare_pack_hours', ['25', '50', '100', '120', '150']);

// Cash Flow Tracker Enums
export const cashFlowModeEnum = pgEnum('cash_flow_mode', ['personal', 'business']);
export const transactionTypeEnum = pgEnum('transaction_type', ['credit', 'debit']);
export const paidTypeEnum = pgEnum('paid_type', ['paid_in', 'paid_out']);
export const bankAccountSectionEnum = pgEnum('bank_account_section', ['personal', 'business']);

// Email Encryption Type Enum
export const emailEncryptionEnum = pgEnum('email_encryption', ['none', 'starttls', 'ssl_tls']);

// Tables
export const tenants = pgTable("tenants", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  domain: text("domain"),
  country: text("country"),
  address: text("address"),
  plan: subscriptionPlanEnum("plan").notNull().default('free'),
  subscriptionDuration: subscriptionDurationEnum("subscription_duration"),
  maxUsers: integer("max_users").notNull().default(5),
  maxAssets: integer("max_assets").notNull().default(20),
  maxDocuments: integer("max_documents").notNull().default(50),
  isActive: boolean("is_active").notNull().default(true),
  logo: text("logo"),
  primaryColor: text("primary_color").default('#10b981'),
  isGstRegistered: boolean("is_gst_registered").notNull().default(false),
  gstRegistrationNumber: text("gst_registration_number"),
  databaseName: text("database_name"),

  allowedModules: text("allowed_modules").array().notNull().default(sql`ARRAY[
    'dashboard','assets','licenses','employees','documents','synctasks','doceye',
    'vendors','customers','quotations','proformainvoices','deliveryorders',
    'purchaseorders','invoices','servicereports','cashflow','projects','reports',
    'auditlogs','settings','usermanagement','notifications','leases'
  ]::text[]`),

  createdAt: timestamp("created_at").defaultNow(),
  expiryDate: timestamp("expiry_date"),
}, (table) => ({
  // ✅ FIX: Indexes should be defined using index() function
  idx_tenants_id: index("idx_tenants_id").on(table.id),
  idx_tenants_active: index("idx_tenants_active").on(table.isActive),
  idx_tenants_id_active: index("idx_tenants_id_active").on(table.id, table.isActive),
}));

// Global GST Settings table
export const gstSettings = pgTable("gst_settings", {
  id: serial("id").primaryKey(),
  gstRate: integer("gst_rate").notNull().default(900), // Stored as basis points (9% = 900)
  countryCode: text("country_code").notNull().default('SG'),
  lastUpdatedBy: integer("last_updated_by").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Global Email Settings table (Super Admin only, all tenants use this)
export const globalEmailSettings = pgTable("global_email_settings", {
  id: serial("id").primaryKey(),
  // System SMTP Settings (for notifications)
  smtpHost: text("smtp_host"),
  smtpPort: integer("smtp_port").default(587),
  smtpUsername: text("smtp_username"),
  smtpPassword: text("smtp_password"),
  encryptionType: emailEncryptionEnum("encryption_type").default('starttls'),
  fromEmail: text("from_email"),
  fromName: text("from_name"),
  isEnabled: boolean("is_enabled").default(false),
  
  // Microsoft OAuth App Credentials (Application-level)
  microsoftOauthClientId: text("microsoft_oauth_client_id"),
  microsoftOauthClientSecret: text("microsoft_oauth_client_secret"),
  microsoftOauthTenantId: text("microsoft_oauth_tenant_id"),
  
  lastUpdatedBy: integer("last_updated_by").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Email Authentication Type
export const emailAuthTypeEnum = pgEnum('email_auth_type', ['smtp', 'oauth_microsoft']);

export const emailSettings = pgTable("email_settings", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
  tenantSlug: text("tenant_slug").notNull(),
  authType: emailAuthTypeEnum("auth_type").notNull().default('smtp'),
  
  // SMTP Settings
  smtpHost: text("smtp_host"),
  smtpPort: integer("smtp_port").default(587),
  smtpUsername: text("smtp_username"),
  smtpPassword: text("smtp_password"),
  smtpSecure: boolean("smtp_secure").default(false),
  
  // Microsoft OAuth Settings
  oauthClientId: text("oauth_client_id"),
  oauthClientSecret: text("oauth_client_secret"),
  oauthTenantId: text("oauth_tenant_id"),
  oauthRefreshToken: text("oauth_refresh_token"),
  oauthAccessToken: text("oauth_access_token"),
  oauthTokenExpiry: timestamp("oauth_token_expiry"),
  
  // Common Settings
  fromEmail: text("from_email"),
  fromName: text("from_name"),
  isEnabled: boolean("is_enabled").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// User Email Settings (User-level email configuration)
export const userEmailSettings = pgTable("user_email_settings", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull().unique(), // One setting per user
  authType: emailAuthTypeEnum("auth_type").notNull().default('smtp'),
  
  // SMTP Settings (user configures their own SMTP)
  smtpHost: text("smtp_host"),
  smtpPort: integer("smtp_port").default(587),
  smtpUsername: text("smtp_username"),
  smtpPassword: text("smtp_password"),
  encryptionType: emailEncryptionEnum("encryption_type").default('starttls'),
  
  // Microsoft OAuth Settings (user-specific tokens)
  oauthRefreshToken: text("oauth_refresh_token"),
  oauthAccessToken: text("oauth_access_token"),
  oauthTokenExpiry: timestamp("oauth_token_expiry"),
  oauthEmail: text("oauth_email"), // The email address connected via OAuth
  
  // Common Settings
  fromEmail: text("from_email"), // User's sending email
  fromName: text("from_name"), // User's display name
  isEnabled: boolean("is_enabled").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Running Numbers Configuration
export const runningNumbersEnum = pgEnum('running_number_type', ['quotation', 'invoice', 'proforma_invoice', 'delivery_order', 'service_report', 'purchase_order', 'lease', 'employee']);

export const runningNumbers = pgTable("running_numbers", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
  tenantSlug: text("tenant_slug").notNull(),
  type: runningNumbersEnum("type").notNull(),
  prefix: text("prefix").default(""),
  suffix: text("suffix").default(""),
  currentNumber: integer("current_number").notNull().default(1),
  numberLength: integer("number_length").notNull().default(4), // Zero-padded length
  resetPeriod: text("reset_period").default("never"), // yearly, monthly, never
  lastResetDate: timestamp("last_reset_date"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Notification Settings
export const notificationSettings = pgTable("notification_settings", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
  tenantSlug: text("tenant_slug").notNull(),
  documentExpiryEnabled: boolean("document_expiry_enabled").notNull().default(true),
  assetAssignmentEnabled: boolean("asset_assignment_enabled").notNull().default(true),
  maintenanceAlertsEnabled: boolean("maintenance_alerts_enabled").notNull().default(true),
  warrantyExpiryEnabled: boolean("warranty_expiry_enabled").notNull().default(true),
  documentExpiryDays: integer("document_expiry_days").notNull().default(30),
  reminderFrequency: integer("reminder_frequency").notNull().default(7),
  warrantyExpiryMonths: integer("warranty_expiry_months").notNull().default(2),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id),
  tenantSlug: text("tenant_slug"),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  role: userRoleEnum("role").notNull().default('employee'),
  password: text("password").notNull(),
  isSuperAdmin: boolean("is_super_admin").default(false),
  isEmailVerified: boolean("is_email_verified").default(false),
  emailVerificationToken: text("email_verification_token"),
  emailVerificationExpiry: timestamp("email_verification_expiry"),
  isActive: boolean("is_active").default(true),
  allowedModules: text("allowed_modules").array(),
  canCreatePersonalBankAccounts: boolean("can_create_personal_bank_accounts").default(false),
  dateFormat: text("date_format").default('MM/DD/YYYY'),
  theme: text("theme").default('light'),
  defaultExportFormat: text("default_export_format").default('csv'),
  createdAt: timestamp("created_at").defaultNow(),
});

export const userPermissions = pgTable("user_permissions", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id),
  tenantSlug: text("tenant_slug"),
  userId: integer("user_id").references(() => users.id).notNull(),
  module: moduleEnum("module").notNull(),
  canView: boolean("can_view").default(true),
  canCreate: boolean("can_create").default(false),
  canUpdate: boolean("can_update").default(false),
  canDelete: boolean("can_delete").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// WebAuthn Passkeys for passwordless authentication
export const passkeys = pgTable("passkeys", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  credentialId: text("credential_id").notNull().unique(),
  publicKey: text("public_key").notNull(),
  counter: integer("counter").notNull().default(0),
  transports: text("transports").array(),
  deviceType: text("device_type"),
  backedUp: boolean("backed_up").default(false),
  friendlyName: text("friendly_name").notNull(),
  lastUsedAt: timestamp("last_used_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPasskeySchema = createInsertSchema(passkeys).omit({ id: true, createdAt: true });
export type InsertPasskey = z.infer<typeof insertPasskeySchema>;
export type Passkey = typeof passkeys.$inferSelect;

export const employees = pgTable("employees", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id),
  tenantSlug: text("tenant_slug"),
  employeeId: text("employee_id").notNull(),
  userId: integer("user_id").references(() => users.id),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  address: text("address").notNull(),
  department: text("department").notNull(),
  designation: text("designation").notNull(),
  joinDate: timestamp("join_date").notNull(),
  status: employeeStatusEnum("status").notNull().default('active'),
  salary: text("salary"),
  annualSalary: text("annual_salary"),
  nationality: text("nationality"),
  prStatus: text("pr_status"),
  dateOfBirth: timestamp("date_of_birth"),
  companyId: integer("company_id").references(() => tenants.id),
  passportNumber: text("passport_number"),
  passportExpiry: timestamp("passport_expiry"),
  visaNumber: text("visa_number"),
  visaExpiry: timestamp("visa_expiry"),
  visaType: visaTypeEnum("visa_type"),
  visaRemarks: text("visa_remarks"),
  passportScan: text("passport_scan"),
  visaScan: text("visa_scan"),
  nricNumber: text("nric_number"),
  nricExpiry: timestamp("nric_expiry"),
  nricScan: text("nric_scan"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const dependents = pgTable("dependents", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id),
  tenantSlug: text("tenant_slug"),
  employeeId: integer("employee_id").references(() => employees.id).notNull(),
  name: text("name").notNull(),
  relationship: relationshipEnum("relationship").notNull(),
  passportNumber: text("passport_number"),
  passportExpiry: timestamp("passport_expiry"),
  visaNumber: text("visa_number"),
  visaExpiry: timestamp("visa_expiry"),
  visaType: visaTypeEnum("visa_type"),
  passportScan: text("passport_scan"),
  visaScan: text("visa_scan"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const assets = pgTable("assets", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id),
  tenantSlug: text("tenant_slug"),
  tag: text("tag").notNull(),
  type: text("type").notNull(),
  category: text("category").notNull(),
  serial: text("serial").notNull(),
  model: text("model"),
  manufacturer: text("manufacturer"),
  status: assetStatusEnum("status").notNull().default('available'),
  condition: text("condition"),
  assignedTo: text("assigned_to"),
  location: text("location"),
  vendor: text("vendor"),
  vendorId: integer("vendor_id").references(() => vendors.id),
  invoiceNumber: text("invoice_number"),
  purchaseDate: timestamp("purchase_date"),
  warrantyExpiry: timestamp("warranty_expiry"),
  cost: text("cost"),
  depreciationStartDate: timestamp("depreciation_start_date"),
  usefulLifeYears: integer("useful_life_years"),
  depreciationMethod: text("depreciation_method"),
  description: text("description"),
  hasLicense: boolean("has_license").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const licenses = pgTable("licenses", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id),
  tenantSlug: text("tenant_slug"),
  assetId: integer("asset_id").references(() => assets.id),
  name: text("name").notNull(),
  licenseKey: text("license_key").notNull(),
  type: licenseTypeEnum("type").notNull(),
  seats: integer("seats").default(1),
  vendorId: integer("vendor_id").references(() => vendors.id),
  purchaseDate: timestamp("purchase_date"),
  expiryDate: timestamp("expiry_date"),
  cost: text("cost"),
  renewalCycle: renewalCycleEnum("renewal_cycle").default('none'),
  status: licenseStatusEnum("status").default('active'),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const assetAssignments = pgTable("asset_assignments", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id),
  tenantSlug: text("tenant_slug"),
  assetId: integer("asset_id").references(() => assets.id).notNull(),
  employeeId: integer("employee_id").references(() => employees.id).notNull(),
  dateAssigned: timestamp("date_assigned").notNull().defaultNow(),
  dateReturned: timestamp("date_returned"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const maintenanceRecords = pgTable("maintenance_records", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id),
  tenantSlug: text("tenant_slug"),
  assetId: integer("asset_id").references(() => assets.id).notNull(),
  issueDescription: text("issue_description").notNull(),
  resolution: text("resolution"),
  serviceDate: timestamp("service_date").notNull(),
  nextMaintenanceDate: timestamp("next_maintenance_date"),
  cost: text("cost"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const employeeDocuments = pgTable("employee_documents", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id),
  tenantSlug: text("tenant_slug"),
  employeeId: integer("employee_id").references(() => employees.id).notNull(),
  documentType: documentTypeEnum("document_type").notNull(),
  filePath: text("file_path").notNull(),
  issueDate: timestamp("issue_date"),
  expiryDate: timestamp("expiry_date"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const companyDocuments = pgTable("company_documents", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id),
  tenantSlug: text("tenant_slug"),
  documentType: companyDocumentTypeEnum("document_type").notNull(),
  customType: text("custom_type"),
  title: text("title").notNull(),
  filePath: text("file_path").notNull(), // Now stores secure object storage path
  issueDate: timestamp("issue_date"),
  expiryDate: timestamp("expiry_date"),
  notes: text("notes"),
  uploadedBy: integer("uploaded_by").references(() => users.id),
  // Enhanced AI-powered fields
  aiAnalysisData: text("ai_analysis_data"), // JSON storage for AI analysis results
  extractedText: text("extracted_text"), // Full text content extracted by AI
  keyEntities: text("key_entities"), // JSON array of extracted entities
  securityClassification: text("security_classification").default("internal"), // public|internal|confidential|restricted
  confidence: integer("confidence").default(50), // AI confidence score (0-100)
  language: text("language").default("English"),
  pageCount: integer("page_count").default(1),
  processingTime: integer("processing_time"), // AI processing time in milliseconds
  fileSize: integer("file_size"), // File size in bytes
  mimeType: text("mime_type"), // Original file MIME type
  originalFilename: text("original_filename"), // Original uploaded filename
  suggestedActions: text("suggested_actions"), // JSON array of AI-suggested actions
  isSecureStorage: boolean("is_secure_storage").default(true), // Indicates if stored in secure object storage
  createdAt: timestamp("created_at").defaultNow(),
});

// Task Management Tables
export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id),
  tenantSlug: text("tenant_slug"),
  name: text("name").notNull(),
  description: text("description"),
  status: projectStatusEnum("status").notNull().default('planning'),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  ownerId: integer("owner_id").references(() => users.id).notNull(),
  color: text("color").default('#3b82f6'),
  priority: taskPriorityEnum("priority").notNull().default('medium'),
  budget: text("budget"),
  completionPercentage: integer("completion_percentage").default(0),
  isArchived: boolean("is_archived").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id),
  tenantSlug: text("tenant_slug"),
  projectId: integer("project_id").references(() => projects.id),
  userId: integer("user_id").references(() => users.id), // Owner for personal events
  title: text("title").notNull(),
  description: text("description"),
  status: taskStatusEnum("status").notNull().default('todo'),
  priority: taskPriorityEnum("priority").notNull().default('medium'),
  assigneeId: integer("assignee_id").references(() => users.id),
  reporterId: integer("reporter_id").references(() => users.id).notNull(),
  ownerId: integer("owner_id").references(() => users.id),
  estimatedHours: integer("estimated_hours"),
  dueDate: timestamp("due_date"),
  startDate: timestamp("start_date"),
  startTime: text("start_time"), // Time as HH:MM format
  endTime: text("end_time"), // Time as HH:MM format
  completedDate: timestamp("completed_date"),
  tags: text("tags").array(),
  attachments: text("attachments").array(), // JSON array of file paths
  type: text("type").default("task"),
  visibility: text("visibility").default("open"), // "open" (shared within tenant) or "personal" (private to user)
  isArchived: boolean("is_archived").default(false),
  // Calendar-specific fields
  eventType: eventTypeEnum("event_type"), // meeting, leave, work_reminder, personal_reminder
  recurrenceType: recurrenceTypeEnum("recurrence_type").default('none'),
  recurrenceEndDate: timestamp("recurrence_end_date"),
  participants: integer("participants").array(), // User IDs for meetings
  reminderMinutes: integer("reminder_minutes").array(), // Minutes before event to send reminders [15, 60, 1440]
  location: text("location"), // Meeting location or link
  allDay: boolean("all_day").default(false), // For full-day events like leave
  leaveType: leaveTypeEnum("leave_type"), // For leave events
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const taskComments = pgTable("task_comments", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id),
  tenantSlug: text("tenant_slug"),
  taskId: integer("task_id").references(() => tasks.id).notNull(),
  userId: integer("user_id").references(() => users.id).notNull(),
  comment: text("comment").notNull(),
  attachments: text("attachments").array(),
  isEdited: boolean("is_edited").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const timeEntries = pgTable("time_entries", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id),
  tenantSlug: text("tenant_slug"),
  taskId: integer("task_id").references(() => tasks.id).notNull(),
  userId: integer("user_id").references(() => users.id).notNull(),
  description: text("description"),
  hours: integer("hours").notNull(), // in minutes for precision
  startTime: timestamp("start_time"),
  endTime: timestamp("end_time"),
  logDate: timestamp("log_date").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Login reminder system for popups
export const reminders = pgTable("reminders", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id),
  tenantSlug: text("tenant_slug"),
  userId: integer("user_id").references(() => users.id).notNull(),
  type: reminderTypeEnum("type").notNull(),
  relatedId: integer("related_id"),
  title: text("title").notNull(),
  message: text("message").notNull(),
  priority: taskPriorityEnum("priority").notNull().default('medium'),
  status: reminderStatusEnum("status").notNull().default('active'),
  snoozeUntil: timestamp("snooze_until"),
  snoozeHours: integer("snooze_hours").default(2),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const documentReminders = pgTable("document_reminders", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id),
  tenantSlug: text("tenant_slug"),
  documentId: integer("document_id").references(() => companyDocuments.id, { onDelete: "cascade" }).notNull(),
  daysBefore: integer("days_before").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const todoListItems = pgTable("todo_list_items", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id),
  tenantSlug: text("tenant_slug"),
  taskId: integer("task_id").references(() => tasks.id, { onDelete: "cascade" }).notNull(), // Parent To Do List event
  title: text("title").notNull(),
  isCompleted: boolean("is_completed").notNull().default(false),
  completedAt: timestamp("completed_at"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdBy: integer("created_by").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const vendors = pgTable("vendors", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id),
  tenantSlug: text("tenant_slug"),
  name: text("name").notNull(),
  contact: text("contact").notNull(),
  email: text("email").notNull(),
  assetTypesSupplied: text("asset_types_supplied"),
  isGstRegistered: boolean("is_gst_registered").notNull().default(false),
  gstRegistrationNumber: text("gst_registration_number"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id),
  tenantSlug: text("tenant_slug"),
  type: notificationTypeEnum("type").notNull(),
  message: text("message").notNull(),
  targetUserId: integer("target_user_id").references(() => users.id).notNull(),
  seen: boolean("seen").notNull().default(false),
  entityId: integer("entity_id"), // Reference to related entity (document, asset, etc.)
  entityType: text("entity_type"), // Type of the entity (document, asset, etc.)
  createdAt: timestamp("created_at").defaultNow(),
});

export const notificationPreferences = pgTable("notification_preferences", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull().unique(),
  tenantId: integer("tenant_id").references(() => tenants.id),
  tenantSlug: text("tenant_slug"),
  emailNotificationsEnabled: boolean("email_notifications_enabled").default(true),
  browserPushEnabled: boolean("browser_push_enabled").default(false),
  defaultReminderMinutes: integer("default_reminder_minutes").array().default(sql`ARRAY[15, 60]`), // [15 min, 1 hour] before event
  dailyDigestEnabled: boolean("daily_digest_enabled").default(false),
  dailyDigestTime: text("daily_digest_time").default('09:00'), // HH:MM format
  workingHoursStart: text("working_hours_start").default('09:00'), // For availability
  workingHoursEnd: text("working_hours_end").default('18:00'),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: 'set null' }),
  tenantSlug: text("tenant_slug"),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: integer("entity_id"),
  userId: integer("user_id").references(() => users.id).notNull(),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
});

export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id),
  tenantSlug: text("tenant_slug"),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  company: text("company"),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  zipCode: text("zip_code"),
  country: text("country"),
  taxId: text("tax_id"),
  isActive: boolean("is_active").default(true),
  notes: text("notes"),
  // Service Plan Fields
  servicePlanType: servicePlanTypeEnum("service_plan_type").default('ad_hoc'),
  icarePackHours: icarePackHoursEnum("icare_pack_hours"), // Only for icare_pack type
  remainingHours: integer("remaining_hours").default(0), // Tracks remaining hours for icare_pack
  totalHoursAllocated: integer("total_hours_allocated").default(0), // Original allocation for icare_pack
  hoursUsed: integer("hours_used").default(0), // Total hours used
  lastServiceDate: timestamp("last_service_date"),
  // Customer Portal Credentials
  portalUsername: text("portal_username"),
  portalPassword: text("portal_password"), // Hashed password
  isPortalActive: boolean("is_portal_active").default(true),
  mustChangePassword: boolean("must_change_password").default(true), // Force password change on first login
  createdAt: timestamp("created_at").defaultNow(),
});

export const invoices = pgTable("invoices", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id),
  tenantSlug: text("tenant_slug"),
  invoiceNumber: text("invoice_number").notNull().unique(),
  customerId: integer("customer_id").references(() => customers.id),
  quotationId: integer("quotation_id").references(() => quotations.id), // Link to quotation
  purchaseOrderId: integer("purchase_order_id").references(() => purchaseOrders.id), // Link to PO
  deliveryOrderId: integer("delivery_order_id").references(() => deliveryOrders.id), // Link to DO
  customerPONumber: text("customer_po_number"), // Customer's own PO number
  issueDate: timestamp("issue_date").notNull(),
  dueDate: timestamp("due_date").notNull(),
  status: invoiceStatusEnum("status").notNull().default('draft'),
  subtotal: integer("subtotal").notNull(), // in cents
  taxAmount: integer("tax_amount").default(0), // in cents
  discountAmount: integer("discount_amount").default(0), // in cents
  totalAmount: integer("total_amount").notNull(), // in cents
  advancePaidAmount: integer("advance_paid_amount").default(0), // in cents (from proforma invoices)
  paidAmount: integer("paid_amount").default(0), // in cents
  balanceAmount: integer("balance_amount").notNull(), // in cents
  taxRate: integer("tax_rate").default(0), // percentage * 100 (e.g., 15.5% = 1550)
  discountRate: integer("discount_rate").default(0), // percentage * 100
  currency: text("currency").default('USD'),
  paymentTerms: text("payment_terms"),
  notes: text("notes"),
  isEmailSent: boolean("is_email_sent").default(false),
  emailSentAt: timestamp("email_sent_at"),
  shareToken: text("share_token"), // For customer portal access
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const invoiceItems = pgTable("invoice_items", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id),
  tenantSlug: text("tenant_slug"),
  invoiceId: integer("invoice_id").references(() => invoices.id),
  name: text("name").notNull(),
  description: text("description").notNull(),
  quantity: integer("quantity").notNull().default(1),
  unitPrice: integer("unit_price").notNull(), // in cents
  totalPrice: integer("total_price").notNull(), // in cents
  serialNumbers: text("serial_numbers").array(), // Serial numbers from delivery order
  isProformaCredit: boolean("is_proforma_credit").default(false), // For proforma invoice line items
  proformaInvoiceId: integer("proforma_invoice_id"), // Reference to proforma invoice if this is a credit
  createdAt: timestamp("created_at").defaultNow(),
});

export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id),
  tenantSlug: text("tenant_slug"),
  invoiceId: integer("invoice_id").references(() => invoices.id),
  amount: integer("amount").notNull(), // in cents
  paymentMethod: paymentMethodEnum("payment_method").notNull(),
  paymentDate: timestamp("payment_date").notNull(),
  transactionId: text("transaction_id"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

import { decimal, date, jsonb } from "drizzle-orm/pg-core";

// Employee Payroll Configuration table
export const employeePayroll = pgTable("employee_payroll", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
  tenantSlug: text("tenant_slug").notNull(),
  employeeId: integer("employee_id").references(() => employees.id).notNull(),
  baseSalary: decimal("base_salary", { precision: 10, scale: 2 }).notNull(),
  payrollPeriod: payrollPeriodEnum("payroll_period").notNull().default('monthly'),
  hourlyRate: decimal("hourly_rate", { precision: 8, scale: 2 }),
  overtimeRate: decimal("overtime_rate", { precision: 8, scale: 2 }),
  allowances: jsonb("allowances").$type<Record<string, number>>().default({}),
  deductions: jsonb("deductions").$type<Record<string, number>>().default({}),
  taxRate: decimal("tax_rate", { precision: 5, scale: 2 }).default('0.00'),
  cpfRate: decimal("cpf_rate", { precision: 5, scale: 2 }).default('20.00'),
  cpfAmount: decimal("cpf_amount", { precision: 12, scale: 2 }),
  employerCpfRate: decimal("employer_cpf_rate", { precision: 5, scale: 2 }).default('0.00'),
  employerCpfAmount: decimal("employer_cpf_amount", { precision: 12, scale: 2 }),
  netSalary: decimal("net_salary", { precision: 12, scale: 2 }),
  noOfWorkingDays: integer("no_of_working_days"),
  isActive: boolean("is_active").default(true).notNull(),
  effectiveFrom: date("effective_from").notNull(),
  effectiveTo: date("effective_to"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdBy: integer("created_by").references(() => users.id).notNull(),
});

// Payroll Records table
export const payrollRecords = pgTable("payroll_records", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
  tenantSlug: text("tenant_slug").notNull(),
  employeeId: integer("employee_id").references(() => employees.id).notNull(),
  payrollConfigId: integer("payroll_config_id").references(() => employeePayroll.id).notNull(),
  payPeriodStart: date("pay_period_start").notNull(),
  payPeriodEnd: date("pay_period_end").notNull(),
  payrollMonth: integer("payroll_month"),
  payrollYear: integer("payroll_year"),
  baseSalary: decimal("base_salary", { precision: 10, scale: 2 }).notNull(),
  overtimeHours: decimal("overtime_hours", { precision: 6, scale: 2 }).default('0.00'),
  overtimePay: decimal("overtime_pay", { precision: 10, scale: 2 }).default('0.00'),
  allowances: jsonb("allowances").$type<Record<string, number>>().default({}),
  deductions: jsonb("deductions").$type<Record<string, number>>().default({}),
  grossPay: decimal("gross_pay", { precision: 10, scale: 2 }).notNull(),
  taxDeduction: decimal("tax_deduction", { precision: 10, scale: 2 }).default('0.00'),
  cpfDeduction: decimal("cpf_deduction", { precision: 10, scale: 2 }).default('0.00'),
  netPay: decimal("net_pay", { precision: 10, scale: 2 }).notNull(),
  status: payrollStatusEnum("status").notNull().default('draft'),
  paymentDate: date("payment_date"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdBy: integer("created_by").references(() => users.id).notNull(),
  approvedBy: integer("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
});

// Business Module Tables
export const quotations = pgTable("quotations", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
  tenantSlug: text("tenant_slug").notNull(),
  quotationNumber: text("quotation_number").notNull().unique(),
  customerId: integer("customer_id").references(() => customers.id).notNull(),
  title: text("title").notNull(),
  description: text("description"),
  status: quotationStatusEnum("status").notNull().default('draft'),
  validUntil: timestamp("valid_until").notNull(),
  subtotal: integer("subtotal").notNull().default(0), // in cents
  discountType: text("discount_type").default("percentage"),
  discountValue: integer("discount_value").default(0),
  taxRate: integer("tax_rate").notNull().default(900), // 9% = 900 basis points
  taxAmount: integer("tax_amount").notNull().default(0), // in cents
  discountAmount: integer("discount_amount").notNull().default(0), // in cents
  totalAmount: integer("total_amount").notNull().default(0), // in cents
  notes: text("notes"),
  termsAndConditions: text("terms_and_conditions"),
  isEmailSent: boolean("is_email_sent").default(false),
  emailSentAt: timestamp("email_sent_at"),
  approvedAt: timestamp("approved_at"),
  approvedItems: text("approved_items").array(), // Array of item IDs that were approved
  approvalMethod: quotationApprovalMethodEnum("approval_method"), // How quotation was approved
  approvedQuotationFileUrl: text("approved_quotation_file_url"), // Uploaded signed quotation file
  customerApprovedDate: timestamp("customer_approved_date"), // When customer approved
  shareToken: text("share_token"), // For customer access
  createdBy: integer("created_by").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const quotationItems = pgTable("quotation_items", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
  tenantSlug: text("tenant_slug").notNull(),
  quotationId: integer("quotation_id").references(() => quotations.id).notNull(),
  name: text("name").notNull(),
  description: text("description").notNull(), // Rich text HTML content
  quantity: integer("quantity").notNull().default(1),
  unitPrice: integer("unit_price").notNull(), // in cents
  discountType: text("discount_type").default("none"), // none, percentage, fixed
  discountValue: integer("discount_value").default(0), // percentage (e.g., 10 for 10%) or amount in cents
  discountAmount: integer("discount_amount").default(0), // calculated discount amount in cents
  totalPrice: integer("total_price").notNull(), // in cents (after discount)
  isApproved: boolean("is_approved").default(true), // Customer approval checkbox
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const deliveryOrders = pgTable("delivery_orders", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
  tenantSlug: text("tenant_slug").notNull(),
  deliveryNumber: text("delivery_number").notNull().unique(),
  customerId: integer("customer_id").references(() => customers.id).notNull(),
  invoiceId: integer("invoice_id").references(() => invoices.id),
  quotationId: integer("quotation_id").references(() => quotations.id), // Link to quotation
  purchaseOrderId: integer("purchase_order_id").references(() => purchaseOrders.id), // Link to PO
  customerPONumber: text("customer_po_number"), // Customer's own PO number
  title: text("title").notNull(),
  description: text("description"),
  status: deliveryStatusEnum("status").notNull().default('pending'),
  deliveryDate: timestamp("delivery_date"),
  deliveryAddress: text("delivery_address"),
  recipientName: text("recipient_name"),
  recipientPhone: text("recipient_phone"),
  notes: text("notes"),
  shareToken: text("share_token"), // For customer portal access
  acceptedBy: text("accepted_by"), // Customer name who accepted
  acceptedAt: timestamp("accepted_at"),
  approvalMethod: text("approval_method"), // 'portal' or 'manual'
  createdBy: integer("created_by"), // Nullable - no FK since tenant DB can't reference main DB users
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const deliveryItems = pgTable("delivery_items", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
  tenantSlug: text("tenant_slug").notNull(),
  deliveryOrderId: integer("delivery_order_id").references(() => deliveryOrders.id).notNull(),
  description: text("description").notNull(),
  quantity: integer("quantity").notNull().default(1),
  deliveredQuantity: integer("delivered_quantity").notNull().default(0),
  serialNumbers: text("serial_numbers").array(), // Array for barcode scanned serial numbers
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const serviceReports = pgTable("service_reports", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
  tenantSlug: text("tenant_slug").notNull(),
  csrNumber: text("csr_number").notNull().unique(),
  customerId: integer("customer_id").references(() => customers.id).notNull(),
  customerName: text("customer_name").notNull(),
  customerAddress: text("customer_address"),
  customerContactPerson: text("customer_contact_person"),
  customerPhone: text("customer_phone"),
  customerEmail: text("customer_email"),
  supportRequestedBy: text("support_requested_by").notNull(),
  supportRequestDate: timestamp("support_request_date").notNull(),
  problemDescription: text("problem_description").notNull(),
  engineerId: integer("engineer_id"), // Nullable to avoid FK violations in tenant DB
  serviceDate: timestamp("service_date").notNull(),
  serviceTime: text("service_time").notNull(),
  hoursCharged: decimal("hours_charged", { precision: 4, scale: 2 }).notNull(),
  serviceDetails: text("service_details").notNull(),
  remarks: text("remarks"),
  priorityLevel: priorityLevelEnum("priority_level").notNull().default('medium'),
  status: serviceReportStatusEnum("status").notNull().default('pending'),
  slaResponseTime: integer("sla_response_time").default(1), // hours
  slaResolutionTime: integer("sla_resolution_time").default(4), // hours
  actualResponseTime: integer("actual_response_time"), // minutes
  actualResolutionTime: integer("actual_resolution_time"), // minutes
  createdBy: integer("created_by"), // Nullable to avoid FK violations in tenant DB
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const serviceBilling = pgTable("service_billing", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
  tenantSlug: text("tenant_slug").notNull(),
  serviceReportId: integer("service_report_id").references(() => serviceReports.id).notNull(),
  customerId: integer("customer_id").references(() => customers.id).notNull(),
  csrNumber: text("csr_number").notNull(),
  serviceDate: timestamp("service_date").notNull(),
  hoursCharged: decimal("hours_charged", { precision: 4, scale: 2 }).notNull(),
  hourlyRate: decimal("hourly_rate", { precision: 8, scale: 2 }).notNull().default('80.00'), // SGD per hour
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }).notNull(),
  status: serviceBillingStatusEnum("status").notNull().default('pending'),
  invoiceId: integer("invoice_id").references(() => invoices.id),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Purchase Order Tables
export const purchaseOrders = pgTable("purchase_orders", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
  tenantSlug: text("tenant_slug").notNull(),
  poNumber: text("po_number").notNull().unique(),
  supplier: text("supplier"), // Optional - to be filled when actual supplier is identified
  quotationId: integer("quotation_id").references(() => quotations.id), // Link to source quotation if auto-generated
  status: purchaseOrderStatusEnum("status").notNull().default('draft'),
  poDate: timestamp("po_date").notNull(),
  expectedDeliveryDate: timestamp("expected_delivery_date"),
  subtotal: integer("subtotal").notNull().default(0), // in cents
  taxRate: integer("tax_rate").notNull().default(900), // 9% = 900 basis points
  taxAmount: integer("tax_amount").notNull().default(0), // in cents
  totalAmount: integer("total_amount").notNull().default(0), // in cents
  notes: text("notes"),
  termsAndConditions: text("terms_and_conditions"),
  isEmailSent: boolean("is_email_sent").default(false),
  emailSentAt: timestamp("email_sent_at"),
  createdBy: integer("created_by"), // Nullable to avoid FK violations in tenant DB
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const purchaseOrderItems = pgTable("purchase_order_items", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
  tenantSlug: text("tenant_slug").notNull(),
  purchaseOrderId: integer("purchase_order_id").references(() => purchaseOrders.id).notNull(),
  quotationItemId: integer("quotation_item_id").references(() => quotationItems.id), // Link to source quotation item if auto-generated
  name: text("name").notNull(),
  description: text("description").notNull(),
  quantity: integer("quantity").notNull().default(1),
  unitPrice: integer("unit_price").notNull(), // in cents
  totalPrice: integer("total_price").notNull(), // in cents
  receivedQuantity: integer("received_quantity").default(0),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

// Proforma Invoice Tables
export const proformaInvoices = pgTable("proforma_invoices", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
  tenantSlug: text("tenant_slug").notNull(),
  proformaNumber: text("proforma_number").notNull().unique(),
  quotationId: integer("quotation_id").references(() => quotations.id).notNull(),
  purchaseOrderId: integer("purchase_order_id").references(() => purchaseOrders.id),
  customerId: integer("customer_id").references(() => customers.id).notNull(),
  issueDate: timestamp("issue_date").notNull(),
  validUntil: timestamp("valid_until"),
  subtotal: integer("subtotal").notNull().default(0), // in cents
  taxRate: integer("tax_rate").notNull().default(900), // 9% = 900 basis points
  taxAmount: integer("tax_amount").notNull().default(0), // in cents
  totalAmount: integer("total_amount").notNull().default(0), // in cents
  advancePercentage: integer("advance_percentage").default(0), // Percentage of advance (e.g., 30 for 30%)
  advanceAmount: integer("advance_amount").notNull().default(0), // in cents
  paidAmount: integer("paid_amount").default(0), // in cents
  balanceAmount: integer("balance_amount").default(0), // in cents
  status: proformaInvoiceStatusEnum("status").notNull().default('draft'),
  notes: text("notes"),
  termsAndConditions: text("terms_and_conditions"),
  paymentProofUrl: text("payment_proof_url"), // For manual payment proof upload
  isEmailSent: boolean("is_email_sent").default(false),
  emailSentAt: timestamp("email_sent_at"),
  shareToken: text("share_token"), // For customer portal access
  createdBy: integer("created_by"), // Nullable to avoid FK violations in tenant DB
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const proformaInvoiceItems = pgTable("proforma_invoice_items", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
  tenantSlug: text("tenant_slug").notNull(),
  proformaInvoiceId: integer("proforma_invoice_id").references(() => proformaInvoices.id).notNull(),
  quotationItemId: integer("quotation_item_id").references(() => quotationItems.id),
  name: text("name").notNull(),
  description: text("description").notNull(),
  quantity: integer("quantity").notNull().default(1),
  unitPrice: integer("unit_price").notNull(), // in cents
  totalPrice: integer("total_price").notNull(), // in cents
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const proformaPayments = pgTable("proforma_payments", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
  tenantSlug: text("tenant_slug").notNull(),
  proformaInvoiceId: integer("proforma_invoice_id").references(() => proformaInvoices.id).notNull(),
  amount: integer("amount").notNull(), // in cents
  paymentMethod: text("payment_method").notNull(), // 'stripe', 'paypal', 'paynow', 'manual'
  paymentDate: timestamp("payment_date").notNull(),
  transactionId: text("transaction_id"), // From payment gateway
  receiptUrl: text("receipt_url"), // Manual upload
  notes: text("notes"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Payment Gateway Settings Table
export const paymentGatewaySettings = pgTable("payment_gateway_settings", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id).notNull().unique(),
  tenantSlug: text("tenant_slug").notNull().unique(),
  gatewayType: paymentGatewayTypeEnum("gateway_type").notNull().default('stripe'),
  isEnabled: boolean("is_enabled").default(false),
  // Stripe Settings
  stripeSecretKey: text("stripe_secret_key"),
  stripePublishableKey: text("stripe_publishable_key"),
  stripeMode: text("stripe_mode").default('test'), // 'test' or 'live'
  // PayPal Settings
  paypalClientId: text("paypal_client_id"),
  paypalClientSecret: text("paypal_client_secret"),
  paypalMode: text("paypal_mode").default('sandbox'), // 'sandbox' or 'live'
  // PayNow Settings (Singapore)
  paynowUEN: text("paynow_uen"),
  paynowCompanyName: text("paynow_company_name"),
  // General Settings
  allowManualPayment: boolean("allow_manual_payment").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Document Workflow Settings Table
export const workflowSettings = pgTable("workflow_settings", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id).notNull().unique(),
  tenantSlug: text("tenant_slug").notNull().unique(),
  // Quotation Settings
  requireManualApprovalUpload: boolean("require_manual_approval_upload").default(false),
  // Purchase Order Settings
  autoGeneratePOFromQuotation: boolean("auto_generate_po_from_quotation").default(false),
  // Delivery Order Settings
  promptGenerateInvoiceOnDO: boolean("prompt_generate_invoice_on_do").default(true),
  autoGenerateInvoiceOnDOApproval: boolean("auto_generate_invoice_on_do_approval").default(false),
  // Invoice Settings
  showProformaAsLineItems: boolean("show_proforma_as_line_items").default(true),
  sendEmailOnAutoGenerateInvoice: boolean("send_email_on_auto_generate_invoice").default(true),
  // General Settings
  requireCustomerPONumber: boolean("require_customer_po_number").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Cash Flow Tracker Tables
export const bankAccounts = pgTable("bank_accounts", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
  tenantSlug: text("tenant_slug").notNull(),
  userId: integer("user_id").references(() => users.id).notNull(),
  createdBy: integer("created_by").references(() => users.id).notNull(),
  bankName: text("bank_name").notNull(),
  accountNumber: text("account_number"),
  openingBalance: integer("opening_balance").notNull().default(0), // in cents
  currentBalance: integer("current_balance").notNull().default(0), // in cents
  mode: cashFlowModeEnum("mode").notNull().default('business'),
  section: bankAccountSectionEnum("section").notNull().default('business'),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const cashFlowTransactions = pgTable("cash_flow_transactions", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
  tenantSlug: text("tenant_slug").notNull(),
  userId: integer("user_id").references(() => users.id).notNull(),
  bankAccountId: integer("bank_account_id").references(() => bankAccounts.id).notNull(),
  transactionDate: timestamp("transaction_date").notNull(),
  paidType: paidTypeEnum("paid_type").notNull(), // paid_in or paid_out
  transactionType: transactionTypeEnum("transaction_type").notNull(), // credit or debit
  amount: integer("amount").notNull(), // in cents
  runningBalance: integer("running_balance").notNull(), // in cents
  remarks: text("remarks"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const bankAccountShares = pgTable("bank_account_shares", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
  tenantSlug: text("tenant_slug").notNull(),
  bankAccountId: integer("bank_account_id").references(() => bankAccounts.id).notNull(),
  sharedWithUserId: integer("shared_with_user_id").references(() => users.id).notNull(),
  sharedByUserId: integer("shared_by_user_id").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Relations
export const tenantsRelations = relations(tenants, ({ many, one }) => ({
  users: many(users),
  employees: many(employees),
  assets: many(assets),
  licenses: many(licenses),
  vendors: many(vendors),
  assetAssignments: many(assetAssignments),
  maintenanceRecords: many(maintenanceRecords),
  employeeDocuments: many(employeeDocuments),
  dependents: many(dependents),
  notifications: many(notifications),
  auditLogs: many(auditLogs),
  customers: many(customers),
  invoices: many(invoices),
  invoiceItems: many(invoiceItems),
  payments: many(payments),
  employeePayroll: many(employeePayroll),
  payrollRecords: many(payrollRecords),
  projects: many(projects),
  tasks: many(tasks),
  taskComments: many(taskComments),
  timeEntries: many(timeEntries),
  reminders: many(reminders),
  documentReminders: many(documentReminders),
  companyDocuments: many(companyDocuments),
  userPermissions: many(userPermissions),
  emailSettings: one(emailSettings),
  quotations: many(quotations),
  quotationItems: many(quotationItems),
  deliveryOrders: many(deliveryOrders),
  deliveryItems: many(deliveryItems),
  serviceReports: many(serviceReports),
  serviceBilling: many(serviceBilling),
  purchaseOrders: many(purchaseOrders),
  purchaseOrderItems: many(purchaseOrderItems),
  bankAccounts: many(bankAccounts),
  cashFlowTransactions: many(cashFlowTransactions),
}));

export const emailSettingsRelations = relations(emailSettings, ({ one }) => ({
  tenant: one(tenants, {
    fields: [emailSettings.tenantId],
    references: [tenants.id],
  }),
}));

export const usersRelations = relations(users, ({ many, one }) => ({
  tenant: one(tenants, {
    fields: [users.tenantId],
    references: [tenants.id],
  }),
  employees: many(employees),
  notifications: many(notifications),
  auditLogs: many(auditLogs),
  bankAccounts: many(bankAccounts),
  cashFlowTransactions: many(cashFlowTransactions),
}));

export const employeesRelations = relations(employees, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [employees.tenantId],
    references: [tenants.id],
  }),
  user: one(users, {
    fields: [employees.userId],
    references: [users.id],
  }),
  dependents: many(dependents),
  documents: many(employeeDocuments),
  assetAssignments: many(assetAssignments),
}));

export const dependentsRelations = relations(dependents, ({ one }) => ({
  tenant: one(tenants, {
    fields: [dependents.tenantId],
    references: [tenants.id],
  }),
  employee: one(employees, {
    fields: [dependents.employeeId],
    references: [employees.id],
  }),
}));

export const assetsRelations = relations(assets, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [assets.tenantId],
    references: [tenants.id],
  }),
  vendor: one(vendors, {
    fields: [assets.vendorId],
    references: [vendors.id],
  }),
  assignments: many(assetAssignments),
  maintenanceRecords: many(maintenanceRecords),
  licenses: many(licenses),
}));

export const licensesRelations = relations(licenses, ({ one }) => ({
  tenant: one(tenants, {
    fields: [licenses.tenantId],
    references: [tenants.id],
  }),
  asset: one(assets, {
    fields: [licenses.assetId],
    references: [assets.id],
  }),
  vendor: one(vendors, {
    fields: [licenses.vendorId],
    references: [vendors.id],
  }),
}));

export const assetAssignmentsRelations = relations(assetAssignments, ({ one }) => ({
  tenant: one(tenants, {
    fields: [assetAssignments.tenantId],
    references: [tenants.id],
  }),
  asset: one(assets, {
    fields: [assetAssignments.assetId],
    references: [assets.id],
  }),
  employee: one(employees, {
    fields: [assetAssignments.employeeId],
    references: [employees.id],
  }),
}));

export const maintenanceRecordsRelations = relations(maintenanceRecords, ({ one }) => ({
  tenant: one(tenants, {
    fields: [maintenanceRecords.tenantId],
    references: [tenants.id],
  }),
  asset: one(assets, {
    fields: [maintenanceRecords.assetId],
    references: [assets.id],
  }),
}));

export const employeeDocumentsRelations = relations(employeeDocuments, ({ one }) => ({
  tenant: one(tenants, {
    fields: [employeeDocuments.tenantId],
    references: [tenants.id],
  }),
  employee: one(employees, {
    fields: [employeeDocuments.employeeId],
    references: [employees.id],
  }),
}));

export const companyDocumentsRelations = relations(companyDocuments, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [companyDocuments.tenantId],
    references: [tenants.id],
  }),
  uploadedBy: one(users, {
    fields: [companyDocuments.uploadedBy],
    references: [users.id],
  }),
  reminders: many(documentReminders),
}));

export const documentRemindersRelations = relations(documentReminders, ({ one }) => ({
  tenant: one(tenants, {
    fields: [documentReminders.tenantId],
    references: [tenants.id],
  }),
  document: one(companyDocuments, {
    fields: [documentReminders.documentId],
    references: [companyDocuments.id],
  }),
}));

export const vendorsRelations = relations(vendors, ({ many, one }) => ({
  tenant: one(tenants, {
    fields: [vendors.tenantId],
    references: [tenants.id],
  }),
  assets: many(assets),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  tenant: one(tenants, {
    fields: [notifications.tenantId],
    references: [tenants.id],
  }),
  user: one(users, {
    fields: [notifications.targetUserId],
    references: [users.id],
  }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  tenant: one(tenants, {
    fields: [auditLogs.tenantId],
    references: [tenants.id],
  }),
  user: one(users, {
    fields: [auditLogs.userId],
    references: [users.id],
  }),
}));

export const customersRelations = relations(customers, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [customers.tenantId],
    references: [tenants.id],
  }),
  invoices: many(invoices),
  quotations: many(quotations),
  deliveryOrders: many(deliveryOrders),
  serviceReports: many(serviceReports),
  serviceBilling: many(serviceBilling),
}));

export const employeePayrollRelations = relations(employeePayroll, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [employeePayroll.tenantId],
    references: [tenants.id],
  }),
  employee: one(employees, {
    fields: [employeePayroll.employeeId],
    references: [employees.id],
  }),
  createdByUser: one(users, {
    fields: [employeePayroll.createdBy],
    references: [users.id],
  }),
  payrollRecords: many(payrollRecords),
}));

export const payrollRecordsRelations = relations(payrollRecords, ({ one }) => ({
  tenant: one(tenants, {
    fields: [payrollRecords.tenantId],
    references: [tenants.id],
  }),
  employee: one(employees, {
    fields: [payrollRecords.employeeId],
    references: [employees.id],
  }),
  payrollConfig: one(employeePayroll, {
    fields: [payrollRecords.payrollConfigId],
    references: [employeePayroll.id],
  }),
  createdByUser: one(users, {
    fields: [payrollRecords.createdBy],
    references: [users.id],
  }),
  approvedByUser: one(users, {
    fields: [payrollRecords.approvedBy],
    references: [users.id],
  }),
}));

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [invoices.tenantId],
    references: [tenants.id],
  }),
  customer: one(customers, {
    fields: [invoices.customerId],
    references: [customers.id],
  }),
  items: many(invoiceItems),
  payments: many(payments),
}));

export const invoiceItemsRelations = relations(invoiceItems, ({ one }) => ({
  tenant: one(tenants, {
    fields: [invoiceItems.tenantId],
    references: [tenants.id],
  }),
  invoice: one(invoices, {
    fields: [invoiceItems.invoiceId],
    references: [invoices.id],
  }),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  tenant: one(tenants, {
    fields: [payments.tenantId],
    references: [tenants.id],
  }),
  invoice: one(invoices, {
    fields: [payments.invoiceId],
    references: [invoices.id],
  }),
}));

// Task Management Relations
export const projectsRelations = relations(projects, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [projects.tenantId],
    references: [tenants.id],
  }),
  owner: one(users, {
    fields: [projects.ownerId],
    references: [users.id],
  }),
  tasks: many(tasks),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [tasks.tenantId],
    references: [tenants.id],
  }),
  project: one(projects, {
    fields: [tasks.projectId],
    references: [projects.id],
  }),
  assignee: one(users, {
    fields: [tasks.assigneeId],
    references: [users.id],
  }),
  reporter: one(users, {
    fields: [tasks.reporterId],
    references: [users.id],
  }),
  owner: one(users, {
    fields: [tasks.ownerId],
    references: [users.id],
  }),
  comments: many(taskComments),
  timeEntries: many(timeEntries),
}));

export const taskCommentsRelations = relations(taskComments, ({ one }) => ({
  tenant: one(tenants, {
    fields: [taskComments.tenantId],
    references: [tenants.id],
  }),
  task: one(tasks, {
    fields: [taskComments.taskId],
    references: [tasks.id],
  }),
  user: one(users, {
    fields: [taskComments.userId],
    references: [users.id],
  }),
}));

export const timeEntriesRelations = relations(timeEntries, ({ one }) => ({
  tenant: one(tenants, {
    fields: [timeEntries.tenantId],
    references: [tenants.id],
  }),
  task: one(tasks, {
    fields: [timeEntries.taskId],
    references: [tasks.id],
  }),
  user: one(users, {
    fields: [timeEntries.userId],
    references: [users.id],
  }),
}));

export const remindersRelations = relations(reminders, ({ one }) => ({
  tenant: one(tenants, {
    fields: [reminders.tenantId],
    references: [tenants.id],
  }),
  user: one(users, {
    fields: [reminders.userId],
    references: [users.id],
  }),
}));

// New Business Module Relations
export const quotationsRelations = relations(quotations, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [quotations.tenantId],
    references: [tenants.id],
  }),
  customer: one(customers, {
    fields: [quotations.customerId],
    references: [customers.id],
  }),
  createdByUser: one(users, {
    fields: [quotations.createdBy],
    references: [users.id],
  }),
  items: many(quotationItems),
}));

export const quotationItemsRelations = relations(quotationItems, ({ one }) => ({
  tenant: one(tenants, {
    fields: [quotationItems.tenantId],
    references: [tenants.id],
  }),
  quotation: one(quotations, {
    fields: [quotationItems.quotationId],
    references: [quotations.id],
  }),
}));

export const deliveryOrdersRelations = relations(deliveryOrders, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [deliveryOrders.tenantId],
    references: [tenants.id],
  }),
  customer: one(customers, {
    fields: [deliveryOrders.customerId],
    references: [customers.id],
  }),
  invoice: one(invoices, {
    fields: [deliveryOrders.invoiceId],
    references: [invoices.id],
  }),
  createdByUser: one(users, {
    fields: [deliveryOrders.createdBy],
    references: [users.id],
  }),
  items: many(deliveryItems),
}));

export const deliveryItemsRelations = relations(deliveryItems, ({ one }) => ({
  tenant: one(tenants, {
    fields: [deliveryItems.tenantId],
    references: [tenants.id],
  }),
  deliveryOrder: one(deliveryOrders, {
    fields: [deliveryItems.deliveryOrderId],
    references: [deliveryOrders.id],
  }),
}));

export const serviceReportsRelations = relations(serviceReports, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [serviceReports.tenantId],
    references: [tenants.id],
  }),
  customer: one(customers, {
    fields: [serviceReports.customerId],
    references: [customers.id],
  }),
  engineer: one(users, {
    fields: [serviceReports.engineerId],
    references: [users.id],
  }),
  createdByUser: one(users, {
    fields: [serviceReports.createdBy],
    references: [users.id],
  }),
  serviceBilling: many(serviceBilling),
}));

export const serviceBillingRelations = relations(serviceBilling, ({ one }) => ({
  tenant: one(tenants, {
    fields: [serviceBilling.tenantId],
    references: [tenants.id],
  }),
  serviceReport: one(serviceReports, {
    fields: [serviceBilling.serviceReportId],
    references: [serviceReports.id],
  }),
  customer: one(customers, {
    fields: [serviceBilling.customerId],
    references: [customers.id],
  }),
  invoice: one(invoices, {
    fields: [serviceBilling.invoiceId],
    references: [invoices.id],
  }),
}));

// Purchase Order Relations
export const purchaseOrdersRelations = relations(purchaseOrders, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [purchaseOrders.tenantId],
    references: [tenants.id],
  }),
  quotation: one(quotations, {
    fields: [purchaseOrders.quotationId],
    references: [quotations.id],
  }),
  createdByUser: one(users, {
    fields: [purchaseOrders.createdBy],
    references: [users.id],
  }),
  items: many(purchaseOrderItems),
}));

export const purchaseOrderItemsRelations = relations(purchaseOrderItems, ({ one }) => ({
  tenant: one(tenants, {
    fields: [purchaseOrderItems.tenantId],
    references: [tenants.id],
  }),
  purchaseOrder: one(purchaseOrders, {
    fields: [purchaseOrderItems.purchaseOrderId],
    references: [purchaseOrders.id],
  }),
  quotationItem: one(quotationItems, {
    fields: [purchaseOrderItems.quotationItemId],
    references: [quotationItems.id],
  }),
}));

// Cash Flow Tracker Relations
export const bankAccountsRelations = relations(bankAccounts, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [bankAccounts.tenantId],
    references: [tenants.id],
  }),
  user: one(users, {
    fields: [bankAccounts.userId],
    references: [users.id],
  }),
  transactions: many(cashFlowTransactions),
}));

export const cashFlowTransactionsRelations = relations(cashFlowTransactions, ({ one }) => ({
  tenant: one(tenants, {
    fields: [cashFlowTransactions.tenantId],
    references: [tenants.id],
  }),
  user: one(users, {
    fields: [cashFlowTransactions.userId],
    references: [users.id],
  }),
  bankAccount: one(bankAccounts, {
    fields: [cashFlowTransactions.bankAccountId],
    references: [bankAccounts.id],
  }),
}));

// Insert Schemas
export const insertUserSchema = createInsertSchema(users).omit({ 
  id: true, 
  createdAt: true,
  isSuperAdmin: true,
  isEmailVerified: true,
  emailVerificationToken: true,
  emailVerificationExpiry: true
}).extend({
  email: z.string().email("Please enter a valid email address").min(1, "Email is required"),
  name: z.string().min(1, "Name is required"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  tenantId: z.coerce.number().optional().nullable(),
  tenantSlug: z.string().optional().nullable(),
});

export const insertUserPermissionSchema = createInsertSchema(userPermissions).omit({
  id: true,
  createdAt: true,
  tenantId: true,
  tenantSlug: true
});

export const insertEmployeeSchema = createInsertSchema(employees)
  .omit({ id: true, createdAt: true, tenantId: true, tenantSlug: true })
  .extend({
    employeeId: z.string().optional(),
    joinDate: z.coerce.date(),
    dateOfBirth: z.coerce.date().optional().nullable(),
    passportExpiry: z.coerce.date().optional().nullable(),
    visaExpiry: z.coerce.date().optional().nullable(),
    nricExpiry: z.coerce.date().optional().nullable(),
    salary: z.union([z.string(), z.number()]).optional().nullable(),
    annualSalary: z.union([z.string(), z.number()]).optional().nullable(),
    nationality: z.string().optional().nullable(),
    prStatus: z.string().optional().nullable(),
    companyId: z.number().optional().nullable(),
  });

export const insertDependentSchema = createInsertSchema(dependents)
  .omit({ id: true, createdAt: true, tenantId: true, tenantSlug: true })
  .extend({
    passportExpiry: z.coerce.date().optional().nullable(),
    visaExpiry: z.coerce.date().optional().nullable(),
  });

export const insertAssetSchema = createInsertSchema(assets)
  .omit({ id: true, createdAt: true, tenantId: true, tenantSlug: true })
  .extend({
    purchaseDate: z.coerce.date().optional(),
    warrantyExpiry: z.coerce.date().optional(),
    depreciationStartDate: z.coerce.date().optional(),
  });

export const insertAssetAssignmentSchema = createInsertSchema(assetAssignments)
  .omit({ id: true, createdAt: true, tenantId: true, tenantSlug: true })
  .extend({
    dateAssigned: z.coerce.date(),
    dateReturned: z.coerce.date().optional().nullable(),
  });

export const insertMaintenanceRecordSchema = createInsertSchema(maintenanceRecords)
  .omit({ id: true, createdAt: true, tenantId: true, tenantSlug: true });

export const insertEmployeeDocumentSchema = createInsertSchema(employeeDocuments)
  .omit({ id: true, createdAt: true, tenantId: true, tenantSlug: true });

export const insertCompanyDocumentSchema = createInsertSchema(companyDocuments)
  .omit({ id: true, createdAt: true, tenantId: true, tenantSlug: true, uploadedBy: true });

export const insertDocumentReminderSchema = createInsertSchema(documentReminders)
  .omit({ id: true, createdAt: true, tenantId: true, tenantSlug: true });

export const insertTodoListItemSchema = createInsertSchema(todoListItems)
  .omit({ id: true, createdAt: true, updatedAt: true, tenantId: true, tenantSlug: true, completedAt: true });

export const insertVendorSchema = createInsertSchema(vendors)
  .omit({ id: true, createdAt: true, tenantId: true, tenantSlug: true })
  .extend({
    gstRegistrationNumber: z.string().optional(),
  });

export const insertNotificationSchema = createInsertSchema(notifications)
  .omit({ id: true, createdAt: true, tenantId: true, tenantSlug: true });

export const insertNotificationPreferencesSchema = createInsertSchema(notificationPreferences)
  .omit({ id: true, createdAt: true, updatedAt: true, tenantId: true, tenantSlug: true });

export const insertLicenseSchema = createInsertSchema(licenses)
  .omit({ id: true, createdAt: true, tenantId: true, tenantSlug: true })
  .extend({
    purchaseDate: z.coerce.date().optional().nullable(),
    expiryDate: z.coerce.date().optional().nullable(),
    licenseKey: z.string().optional(),
  });

export const insertAuditLogSchema = createInsertSchema(auditLogs)
  .omit({ id: true, tenantId: true, tenantSlug: true });

export const insertTenantSchema = createInsertSchema(tenants)
  .omit({ id: true, createdAt: true })
  .extend({
    gstRegistrationNumber: z
      .string()
      .optional()
      .nullable()
      .refine(isValidOptionalGstNumber, { message: GST_VALIDATION_MESSAGE }),
    allowedModules: z.array(z.string()).optional(),
  });

export const insertCustomerSchema = createInsertSchema(customers)
  .omit({ id: true, createdAt: true, tenantId: true, tenantSlug: true })
  .extend({
    portalPassword: z.string().optional(), // Optional for updates, required only when provided
  });

export const insertInvoiceSchema = createInsertSchema(invoices)
  .omit({ id: true, createdAt: true, updatedAt: true });

export const insertInvoiceItemSchema = createInsertSchema(invoiceItems)
  .omit({ id: true, createdAt: true, tenantId: true, tenantSlug: true });

// Employee Payroll schema
export const insertEmployeePayrollSchema = createInsertSchema(employeePayroll).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertEmployeePayroll = z.infer<typeof insertEmployeePayrollSchema>;
export type EmployeePayroll = typeof employeePayroll.$inferSelect;

// Payroll Records schema
export const insertPayrollRecordSchema = createInsertSchema(payrollRecords).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  approvedAt: true,
});

export type InsertPayrollRecord = z.infer<typeof insertPayrollRecordSchema>;
export type PayrollRecord = typeof payrollRecords.$inferSelect;

export const insertPaymentSchema = createInsertSchema(payments)
  .omit({ id: true, createdAt: true });

export const insertEmailSettingsSchema = createInsertSchema(emailSettings)
  .omit({ id: true, createdAt: true, tenantId: true, tenantSlug: true });

export const insertUserEmailSettingsSchema = createInsertSchema(userEmailSettings)
  .omit({ id: true, createdAt: true, userId: true });

// New Business Module Insert Schemas
export const insertQuotationSchema = createInsertSchema(quotations)
  .omit({ id: true, createdAt: true, updatedAt: true, tenantId: true, tenantSlug: true, createdBy: true });

export const insertQuotationItemSchema = createInsertSchema(quotationItems)
  .omit({ id: true, createdAt: true, tenantId: true, tenantSlug: true });

export const insertDeliveryOrderSchema = createInsertSchema(deliveryOrders)
  .omit({ id: true, createdAt: true, updatedAt: true, tenantId: true, tenantSlug: true, createdBy: true, deliveryDate: true, acceptedAt: true })
  .extend({
    deliveryDate: z.coerce.date().optional(), // Accepts string or Date, converts to Date
    acceptedAt: z.coerce.date().optional(), // Accepts string or Date, converts to Date
    createdBy: z.number().optional().nullable(), // Optional createdBy since tenant DB can't reference main DB users
  });

export const insertDeliveryItemSchema = createInsertSchema(deliveryItems)
  .omit({ id: true, createdAt: true, tenantId: true, tenantSlug: true });

export const insertServiceReportSchema = createInsertSchema(serviceReports)
  .omit({ id: true, createdAt: true, updatedAt: true, tenantId: true, tenantSlug: true, createdBy: true, csrNumber: true, supportRequestDate: true, serviceDate: true })
  .extend({
    csrNumber: z.string().optional(),
    supportRequestDate: z.coerce.date(), // Accepts string or Date, converts to Date
    serviceDate: z.coerce.date(), // Accepts string or Date, converts to Date
  });

export const insertServiceBillingSchema = createInsertSchema(serviceBilling)
  .omit({ id: true, createdAt: true, updatedAt: true, tenantId: true, tenantSlug: true });

// Purchase Order Insert Schemas
export const insertPurchaseOrderSchema = createInsertSchema(purchaseOrders)
  .omit({ id: true, createdAt: true, updatedAt: true, tenantId: true, tenantSlug: true, createdBy: true });

export const insertPurchaseOrderItemSchema = createInsertSchema(purchaseOrderItems)
  .omit({ id: true, createdAt: true, tenantId: true, tenantSlug: true });

// Proforma Invoice Insert Schemas
export const insertProformaInvoiceSchema = createInsertSchema(proformaInvoices)
  .omit({ id: true, createdAt: true, updatedAt: true, tenantId: true, tenantSlug: true, createdBy: true });

export const insertProformaInvoiceItemSchema = createInsertSchema(proformaInvoiceItems)
  .omit({ id: true, createdAt: true, tenantId: true, tenantSlug: true });

export const insertProformaPaymentSchema = createInsertSchema(proformaPayments)
  .omit({ id: true, createdAt: true, tenantId: true, tenantSlug: true, createdBy: true });

// Payment Gateway Settings Insert Schema
export const insertPaymentGatewaySettingsSchema = createInsertSchema(paymentGatewaySettings)
  .omit({ id: true, createdAt: true, updatedAt: true, tenantId: true, tenantSlug: true });

// Workflow Settings Insert Schema
export const insertWorkflowSettingsSchema = createInsertSchema(workflowSettings)
  .omit({ id: true, createdAt: true, updatedAt: true, tenantId: true, tenantSlug: true });

// Cash Flow Tracker Insert Schemas
export const insertBankAccountSchema = createInsertSchema(bankAccounts)
  .omit({ id: true, createdAt: true, updatedAt: true, tenantId: true, tenantSlug: true, userId: true, createdBy: true });

export const insertCashFlowTransactionSchema = createInsertSchema(cashFlowTransactions)
  .omit({ id: true, createdAt: true, updatedAt: true, tenantId: true, tenantSlug: true, userId: true, runningBalance: true })
  .extend({
    transactionDate: z.string().transform((str) => new Date(str)),
  });

export const insertBankAccountShareSchema = createInsertSchema(bankAccountShares)
  .omit({ id: true, createdAt: true, tenantId: true, tenantSlug: true });

// Types
export type Tenant = typeof tenants.$inferSelect;
export type InsertTenant = z.infer<typeof insertTenantSchema>;
export type Customer = typeof customers.$inferSelect;
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type Invoice = typeof invoices.$inferSelect;
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type InvoiceItem = typeof invoiceItems.$inferSelect;
export type InsertInvoiceItem = z.infer<typeof insertInvoiceItemSchema>;
export type Payment = typeof payments.$inferSelect;
export type InsertPayment = z.infer<typeof insertPaymentSchema>;

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type UserPermission = typeof userPermissions.$inferSelect;
export type InsertUserPermission = z.infer<typeof insertUserPermissionSchema>;

export type Employee = typeof employees.$inferSelect;
export type InsertEmployee = z.infer<typeof insertEmployeeSchema>;

export type Dependent = typeof dependents.$inferSelect;
export type InsertDependent = z.infer<typeof insertDependentSchema>;

export type Asset = typeof assets.$inferSelect;
export type InsertAsset = z.infer<typeof insertAssetSchema>;

export type AssetAssignment = typeof assetAssignments.$inferSelect;
export type InsertAssetAssignment = z.infer<typeof insertAssetAssignmentSchema>;

export type MaintenanceRecord = typeof maintenanceRecords.$inferSelect;
export type InsertMaintenanceRecord = z.infer<typeof insertMaintenanceRecordSchema>;

export type EmployeeDocument = typeof employeeDocuments.$inferSelect;
export type InsertEmployeeDocument = z.infer<typeof insertEmployeeDocumentSchema>;

export type Vendor = typeof vendors.$inferSelect;
export type InsertVendor = z.infer<typeof insertVendorSchema>;

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;

export type NotificationPreferences = typeof notificationPreferences.$inferSelect;
export type InsertNotificationPreferences = z.infer<typeof insertNotificationPreferencesSchema>;

export type License = typeof licenses.$inferSelect;
export type InsertLicense = z.infer<typeof insertLicenseSchema>;

export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;

export type CompanyDocument = typeof companyDocuments.$inferSelect;
export type InsertCompanyDocument = z.infer<typeof insertCompanyDocumentSchema>;
export type DocumentReminder = typeof documentReminders.$inferSelect;
export type InsertDocumentReminder = z.infer<typeof insertDocumentReminderSchema>;
export type TodoListItem = typeof todoListItems.$inferSelect;
export type InsertTodoListItem = z.infer<typeof insertTodoListItemSchema>;

// Task Management Insert Schemas
export const insertProjectSchema = createInsertSchema(projects)
  .omit({ id: true, createdAt: true, updatedAt: true, tenantId: true, tenantSlug: true })
  .extend({
    startDate: z.string().optional().nullable().transform((str) => str ? new Date(str) : null),
    endDate: z.string().optional().nullable().transform((str) => str ? new Date(str) : null),
  });

export const insertTaskSchema = createInsertSchema(tasks)
  .omit({ id: true, createdAt: true, updatedAt: true, tenantId: true, tenantSlug: true })
  .extend({
    dueDate: z.union([z.string(), z.date()]).optional().nullable().transform((val) => {
      if (!val) return null;
      return val instanceof Date ? val : new Date(val);
    }),
    startDate: z.union([z.string(), z.date()]).optional().nullable().transform((val) => {
      if (!val) return null;
      return val instanceof Date ? val : new Date(val);
    }),
    completedDate: z.union([z.string(), z.date()]).optional().nullable().transform((val) => {
      if (!val) return null;
      return val instanceof Date ? val : new Date(val);
    }),
    recurrenceEndDate: z.union([z.string(), z.date()]).optional().nullable().transform((val) => {
      if (!val) return null;
      return val instanceof Date ? val : new Date(val);
    }),
    startTime: z.string().optional().nullable(),
    endTime: z.string().optional().nullable(),
  });

export const insertTaskCommentSchema = createInsertSchema(taskComments)
  .omit({ id: true, createdAt: true, updatedAt: true, tenantId: true, tenantSlug: true });

export const insertTimeEntrySchema = createInsertSchema(timeEntries)
  .omit({ id: true, createdAt: true, tenantId: true, tenantSlug: true })
  .extend({
    logDate: z.string().transform((str) => new Date(str)),
    startTime: z.string().optional().nullable().transform((str) => str ? new Date(str) : null),
    endTime: z.string().optional().nullable().transform((str) => str ? new Date(str) : null),
  });

// Task Management Types
export type Project = typeof projects.$inferSelect;
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Task = typeof tasks.$inferSelect;
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type TaskComment = typeof taskComments.$inferSelect;
export type InsertTaskComment = z.infer<typeof insertTaskCommentSchema>;
export type TimeEntry = typeof timeEntries.$inferSelect;
export type InsertTimeEntry = z.infer<typeof insertTimeEntrySchema>;
export type EmailSettings = typeof emailSettings.$inferSelect;
export type InsertEmailSettings = z.infer<typeof insertEmailSettingsSchema>;
export type UserEmailSettings = typeof userEmailSettings.$inferSelect;
export type InsertUserEmailSettings = z.infer<typeof insertUserEmailSettingsSchema>;

// New Business Module Types
export type Quotation = typeof quotations.$inferSelect;
export type InsertQuotation = z.infer<typeof insertQuotationSchema>;
export type QuotationItem = typeof quotationItems.$inferSelect;
export type InsertQuotationItem = z.infer<typeof insertQuotationItemSchema>;
export type DeliveryOrder = typeof deliveryOrders.$inferSelect;
export type InsertDeliveryOrder = z.infer<typeof insertDeliveryOrderSchema>;
export type DeliveryItem = typeof deliveryItems.$inferSelect;
export type InsertDeliveryItem = z.infer<typeof insertDeliveryItemSchema>;
export type ServiceReport = typeof serviceReports.$inferSelect;
export type InsertServiceReport = z.infer<typeof insertServiceReportSchema>;
export type ServiceBilling = typeof serviceBilling.$inferSelect;
export type InsertServiceBilling = z.infer<typeof insertServiceBillingSchema>;

// Purchase Order Types
export type PurchaseOrder = typeof purchaseOrders.$inferSelect;
export type InsertPurchaseOrder = z.infer<typeof insertPurchaseOrderSchema>;
export type PurchaseOrderItem = typeof purchaseOrderItems.$inferSelect;
export type InsertPurchaseOrderItem = z.infer<typeof insertPurchaseOrderItemSchema>;

// Cash Flow Tracker Types
export type BankAccount = typeof bankAccounts.$inferSelect;
export type InsertBankAccount = z.infer<typeof insertBankAccountSchema>;
export type CashFlowTransaction = typeof cashFlowTransactions.$inferSelect;
export type InsertCashFlowTransaction = z.infer<typeof insertCashFlowTransactionSchema>;
export type BankAccountShare = typeof bankAccountShares.$inferSelect;
export type InsertBankAccountShare = z.infer<typeof insertBankAccountShareSchema>;

// Running Numbers Types
export const insertRunningNumberSchema = createInsertSchema(runningNumbers).omit({ id: true, createdAt: true, tenantId: true, tenantSlug: true });
export type RunningNumber = typeof runningNumbers.$inferSelect;
export type InsertRunningNumber = z.infer<typeof insertRunningNumberSchema>;

// GST Settings Types
export const insertGstSettingsSchema = createInsertSchema(gstSettings).omit({ id: true, createdAt: true, updatedAt: true, tenantId: true, tenantSlug: true });
export type GstSettings = typeof gstSettings.$inferSelect;
export type InsertGstSettings = z.infer<typeof insertGstSettingsSchema>;

// Global Email Settings Types
export const insertGlobalEmailSettingsSchema = createInsertSchema(globalEmailSettings).omit({ id: true, createdAt: true, updatedAt: true });
export type GlobalEmailSettings = typeof globalEmailSettings.$inferSelect;
export type InsertGlobalEmailSettings = z.infer<typeof insertGlobalEmailSettingsSchema>;

// Notification Settings Types
export const insertNotificationSettingsSchema = createInsertSchema(notificationSettings).omit({ id: true, createdAt: true, updatedAt: true, tenantId: true, tenantSlug: true });
export type NotificationSettings = typeof notificationSettings.$inferSelect;
export type InsertNotificationSettings = z.infer<typeof insertNotificationSettingsSchema>;

// Quotation Templates
export const quotationTemplates = pgTable("quotation_templates", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  tenantSlug: text("tenant_slug").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  headerHtml: text("header_html").notNull(),
  footerHtml: text("footer_html").notNull(),
  termsAndConditions: text("terms_and_conditions").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Quotation Templates Types
export const insertQuotationTemplateSchema = createInsertSchema(quotationTemplates).omit({ id: true, createdAt: true, updatedAt: true, tenantId: true, tenantSlug: true });
export type QuotationTemplate = typeof quotationTemplates.$inferSelect;
export type InsertQuotationTemplate = z.infer<typeof insertQuotationTemplateSchema>;

// Proforma Invoice Types
export type ProformaInvoice = typeof proformaInvoices.$inferSelect;
export type InsertProformaInvoice = z.infer<typeof insertProformaInvoiceSchema>;
export type ProformaInvoiceItem = typeof proformaInvoiceItems.$inferSelect;
export type InsertProformaInvoiceItem = z.infer<typeof insertProformaInvoiceItemSchema>;
export type ProformaPayment = typeof proformaPayments.$inferSelect;
export type InsertProformaPayment = z.infer<typeof insertProformaPaymentSchema>;

// Payment Gateway Settings Types
export type PaymentGatewaySettings = typeof paymentGatewaySettings.$inferSelect;
export type InsertPaymentGatewaySettings = z.infer<typeof insertPaymentGatewaySettingsSchema>;

// Workflow Settings Types
export type WorkflowSettings = typeof workflowSettings.$inferSelect;
export type InsertWorkflowSettings = z.infer<typeof insertWorkflowSettingsSchema>;

// ==========================================
// LEASE MANAGEMENT MODULE (Standalone)
// ==========================================

// Lease Management Enums
export const leaseTypeEnum = pgEnum('lease_type', ['office_space', 'residential', 'vehicle', 'it_equipment', 'warehouse', 'other']);
export const leaseStatusEnum = pgEnum('lease_status', ['draft', 'active', 'expiring_soon', 'renewed', 'closed', 'terminated']);
export const leaseRenewalTypeEnum = pgEnum('lease_renewal_type', ['auto_renew', 'manual', 'notify', 'no_renewal']);
export const leasePaymentFrequencyEnum = pgEnum('lease_payment_frequency', ['monthly', 'quarterly', 'yearly', 'one_time']);
export const leasePaymentStatusEnum = pgEnum('lease_payment_status', ['pending', 'paid', 'overdue', 'cancelled']);
export const leaseChargeTypeEnum = pgEnum('lease_charge_type', ['rent', 'service_charge', 'maintenance', 'parking', 'utilities', 'insurance', 'tax', 'other']);

// Lease Locations (Standalone - not dependent on other modules)
export const leaseLocations = pgTable("lease_locations", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
  tenantSlug: text("tenant_slug").notNull(),
  name: text("name").notNull(),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  postalCode: text("postal_code"),
  country: text("country").default('Singapore'),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Lease Lessors (Standalone - not dependent on Vendors module)
export const leaseLessors = pgTable("lease_lessors", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
  tenantSlug: text("tenant_slug").notNull(),
  name: text("name").notNull(),
  contactPerson: text("contact_person"),
  email: text("email"),
  phone: text("phone"),
  address: text("address"),
  bankName: text("bank_name"),
  bankAccountNumber: text("bank_account_number"),
  bankAccountName: text("bank_account_name"),
  notes: text("notes"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Leases (Primary Table)
export const leases = pgTable("leases", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
  tenantSlug: text("tenant_slug").notNull(),
  leaseNumber: text("lease_number"),
  title: text("title").notNull(),
  leaseType: leaseTypeEnum("lease_type").notNull(),
  status: leaseStatusEnum("status").notNull().default('draft'),
  description: text("description"),
  
  // Dates (stored as DATE in PostgreSQL)
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  
  // Renewal Terms
  renewalType: leaseRenewalTypeEnum("renewal_type").notNull().default('manual'),
  renewalTermMonths: integer("renewal_term_months"),
  noticePeriodDays: integer("notice_period_days").default(60),
  
  // Termination
  earlyTerminationAllowed: boolean("early_termination_allowed").default(false),
  terminationPenalty: text("termination_penalty"),
  
  // Parties
  lessorId: integer("lessor_id").references(() => leaseLessors.id),
  lessorName: text("lessor_name"),
  locationId: integer("location_id").references(() => leaseLocations.id),
  locationName: text("location_name"),
  
  // Internal
  responsibleUserId: integer("responsible_user_id"),
  responsibleUserName: text("responsible_user_name"),
  department: text("department"),
  costCenter: text("cost_center"),
  
  // Financial Summary
  totalMonthlyRent: integer("total_monthly_rent").default(0),
  securityDeposit: integer("security_deposit").default(0),
  depositStatus: text("deposit_status").default('held'),
  currency: text("currency").default('SGD'),
  
  // Notes
  notes: text("notes"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Lease Items (Standalone - for IT equipment, vehicles, etc. linked to a lease)
export const leaseItems = pgTable("lease_items", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
  tenantSlug: text("tenant_slug").notNull(),
  leaseId: integer("lease_id").references(() => leases.id).notNull(),
  itemName: text("item_name").notNull(),
  itemType: text("item_type"),
  serialNumber: text("serial_number"),
  model: text("model"),
  quantity: integer("quantity").default(1),
  condition: text("condition"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Lease Documents (Standalone document storage)
export const leaseDocuments = pgTable("lease_documents", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
  tenantSlug: text("tenant_slug").notNull(),
  leaseId: integer("lease_id").references(() => leases.id).notNull(),
  documentName: text("document_name").notNull(),
  documentType: text("document_type").notNull(),
  fileName: text("file_name"),
  filePath: text("file_path"),
  fileSize: integer("file_size"),
  mimeType: text("mime_type"),
  description: text("description"),
  uploadedBy: integer("uploaded_by"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Lease Financial Charges (Recurring and one-time charges)
export const leaseCharges = pgTable("lease_charges", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
  tenantSlug: text("tenant_slug").notNull(),
  leaseId: integer("lease_id").references(() => leases.id).notNull(),
  chargeType: leaseChargeTypeEnum("charge_type").notNull(),
  chargeName: text("charge_name").notNull(),
  amount: integer("amount").notNull(),
  currency: text("currency").default('SGD'),
  frequency: leasePaymentFrequencyEnum("frequency").notNull(),
  billingDay: integer("billing_day").default(1),
  escalationPercent: integer("escalation_percent"),
  escalationFrequencyMonths: integer("escalation_frequency_months"),
  isActive: boolean("is_active").notNull().default(true),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Lease Payments (Payment schedule and tracking)
export const leasePayments = pgTable("lease_payments", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
  tenantSlug: text("tenant_slug").notNull(),
  leaseId: integer("lease_id").references(() => leases.id).notNull(),
  chargeId: integer("charge_id").references(() => leaseCharges.id),
  paymentDate: timestamp("payment_date").notNull(),
  dueDate: timestamp("due_date").notNull(),
  amount: integer("amount").notNull(),
  currency: text("currency").default('SGD'),
  status: leasePaymentStatusEnum("status").notNull().default('pending'),
  paymentMethod: text("payment_method"),
  referenceNumber: text("reference_number"),
  receiptPath: text("receipt_path"),
  notes: text("notes"),
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Lease Renewals (History of renewals)
export const leaseRenewals = pgTable("lease_renewals", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
  tenantSlug: text("tenant_slug").notNull(),
  leaseId: integer("lease_id").references(() => leases.id).notNull(),
  renewalDate: timestamp("renewal_date").notNull(),
  previousStartDate: timestamp("previous_start_date"),
  previousEndDate: timestamp("previous_end_date"),
  newStartDate: timestamp("new_start_date").notNull(),
  newEndDate: timestamp("new_end_date").notNull(),
  previousRent: integer("previous_rent"),
  newRent: integer("new_rent"),
  changedTermsSummary: text("changed_terms_summary"),
  renewalAgreementPath: text("renewal_agreement_path"),
  renewedBy: integer("renewed_by"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Lease Compliance Checklists
export const leaseComplianceItems = pgTable("lease_compliance_items", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
  tenantSlug: text("tenant_slug").notNull(),
  leaseId: integer("lease_id").references(() => leases.id).notNull(),
  itemName: text("item_name").notNull(),
  description: text("description"),
  isCompleted: boolean("is_completed").notNull().default(false),
  dueDate: timestamp("due_date"),
  completedDate: timestamp("completed_date"),
  completedBy: integer("completed_by"),
  documentPath: text("document_path"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Lease Management Insert Schemas
export const insertLeaseLocationSchema = createInsertSchema(leaseLocations)
  .omit({ id: true, createdAt: true, updatedAt: true, tenantId: true, tenantSlug: true });
export const insertLeaseLessorSchema = createInsertSchema(leaseLessors)
  .omit({ id: true, createdAt: true, updatedAt: true, tenantId: true, tenantSlug: true });
export const insertLeaseSchema = createInsertSchema(leases)
  .omit({ id: true, createdAt: true, updatedAt: true, tenantId: true, tenantSlug: true })
  .extend({
    startDate: z.string(),
    endDate: z.string(),
  });
export const insertLeaseItemSchema = createInsertSchema(leaseItems)
  .omit({ id: true, createdAt: true, tenantId: true, tenantSlug: true });
export const insertLeaseDocumentSchema = createInsertSchema(leaseDocuments)
  .omit({ id: true, createdAt: true, tenantId: true, tenantSlug: true });
export const insertLeaseChargeSchema = createInsertSchema(leaseCharges)
  .omit({ id: true, createdAt: true, tenantId: true, tenantSlug: true });
export const insertLeasePaymentSchema = createInsertSchema(leasePayments)
  .omit({ id: true, createdAt: true, updatedAt: true, tenantId: true, tenantSlug: true })
  .extend({
    paymentDate: z.string().transform((str) => new Date(str)),
    dueDate: z.string().transform((str) => new Date(str)),
    paidAt: z.string().optional().nullable().transform((str) => str ? new Date(str) : null),
  });
export const insertLeaseRenewalSchema = createInsertSchema(leaseRenewals)
  .omit({ id: true, createdAt: true, tenantId: true, tenantSlug: true })
  .extend({
    renewalDate: z.string().transform((str) => new Date(str)),
    previousStartDate: z.string().optional().nullable().transform((str) => str ? new Date(str) : null),
    previousEndDate: z.string().optional().nullable().transform((str) => str ? new Date(str) : null),
    newStartDate: z.string().transform((str) => new Date(str)),
    newEndDate: z.string().transform((str) => new Date(str)),
  });
export const insertLeaseComplianceItemSchema = createInsertSchema(leaseComplianceItems)
  .omit({ id: true, createdAt: true, updatedAt: true, tenantId: true, tenantSlug: true })
  .extend({
    dueDate: z.string().optional().nullable().transform((str) => str ? new Date(str) : null),
    completedDate: z.string().optional().nullable().transform((str) => str ? new Date(str) : null),
  });

// Lease Management Types
export type LeaseLocation = typeof leaseLocations.$inferSelect;
export type InsertLeaseLocation = z.infer<typeof insertLeaseLocationSchema>;
export type LeaseLessor = typeof leaseLessors.$inferSelect;
export type InsertLeaseLessor = z.infer<typeof insertLeaseLessorSchema>;
export type Lease = typeof leases.$inferSelect;
export type InsertLease = z.infer<typeof insertLeaseSchema>;
export type LeaseItem = typeof leaseItems.$inferSelect;
export type InsertLeaseItem = z.infer<typeof insertLeaseItemSchema>;
export type LeaseDocument = typeof leaseDocuments.$inferSelect;
export type InsertLeaseDocument = z.infer<typeof insertLeaseDocumentSchema>;
export type LeaseCharge = typeof leaseCharges.$inferSelect;
export type InsertLeaseCharge = z.infer<typeof insertLeaseChargeSchema>;
export type LeasePayment = typeof leasePayments.$inferSelect;
export type InsertLeasePayment = z.infer<typeof insertLeasePaymentSchema>;
export type LeaseRenewal = typeof leaseRenewals.$inferSelect;
export type InsertLeaseRenewal = z.infer<typeof insertLeaseRenewalSchema>;
export type LeaseComplianceItem = typeof leaseComplianceItems.$inferSelect;
export type InsertLeaseComplianceItem = z.infer<typeof insertLeaseComplianceItemSchema>;
