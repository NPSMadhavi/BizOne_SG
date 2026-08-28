import { db, userCompaniesTable, companiesTable, APP_ALL_MODULES } from "@workspace/db";
import { and, eq } from "drizzle-orm";

export type AgentAuthContext = {
  userId: number;
  role: string;
  isAdmin: boolean;
  companyId: number;
  modules: string[];
  permissions: string[];
};

const MODULE_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  assets: "Asset",
  licenses: "License",
  employees: "Employee",
  payroll: "Payroll",
  purchase_quotations: "Purchase Quotation",
  purchase_orders: "Purchase Order",
  vendor_invoices: "Vendor Invoice",
  quotations: "Quotation",
  sales_orders: "Sales Order",
  invoices: "Invoice",
  proforma_invoices: "Proforma Invoice",
  credit_notes: "Credit Note",
  debit_notes: "Debit Note",
  delivery_orders: "Delivery Order",
  point_of_sale: "Point of Sale",
  bill_of_materials: "Bill of Materials",
  multi_price_level: "Multi Price Level",
  grn: "GRN",
  stock_items: "Stock Item",
  warehouses: "Warehouse",
  stock_transfer: "Stock Transfer",
  inventory_reports: "Inventory Report",
  batch_expiry: "Batch & Expiry",
  vendors: "Vendor",
  customers: "Customer",
  address_book: "Address Book",
  projects: "Project",
  accounting_coa: "Chart of Accounts",
  accounting_je: "Journal Entry",
  accounting_gl: "General Ledger",
  accounting_tb: "Trial Balance",
  accounting_bs: "Balance Sheet",
  accounting_pl: "Profit & Loss",
  accounting_cf: "Cash Flow",
  accounting_bank_recon: "Bank Reconciliation",
  accounting_gst_f5: "GST F5",
  accounting_gst_f7: "GST F7",
  accounting_gst_io: "GST IO Listing",
  accounting_wht: "Withholding Tax",
  accounting_eci: "ECI",
  accounting_formcs: "Form C-S",
  accounting_iaf: "IRAS Audit File",
  accounting_ar: "AR Collection",
  accounting_ar_aging: "AR Aging",
  accounting_cust_stmt: "Customer Statement",
  accounting_ap: "AP Payment",
  accounting_ap_aging: "AP Aging",
  accounting_vendor_stmt: "Vendor Statement",
  accounting_expenses: "Expense",
  accounting_income: "Income",
  user_management: "User Management",
  audit_log: "Audit Log",
  settings: "Settings",
};

const DOC_TYPE_MODULE: Record<string, string> = {
  inv: "invoices",
  qt: "quotations",
  po: "purchase_orders",
  do: "delivery_orders",
  pq: "purchase_quotations",
  so: "sales_orders",
  pi: "vendor_invoices",
  grn: "grn",
};

const PATH_PREFIXES: { prefix: string; module: string }[] = [
  { prefix: "/admin", module: "user_management" },
  { prefix: "/settings", module: "settings" },
  { prefix: "/report-templates", module: "report_templates" },
  { prefix: "/audit-log", module: "audit_log" },
  { prefix: "/customers", module: "customers" },
  { prefix: "/vendors", module: "vendors" },
  { prefix: "/address-book", module: "address_book" },
  { prefix: "/stock", module: "stock_items" },
  { prefix: "/warehouses", module: "warehouses" },
  { prefix: "/inventory/stock-transfer", module: "stock_transfer" },
  { prefix: "/inventory/batch-expiry", module: "batch_expiry" },
  { prefix: "/inventory/reports", module: "inventory_reports" },
  { prefix: "/inventory/warehouses", module: "warehouses" },
  { prefix: "/inventory", module: "stock_items" },
  { prefix: "/purchase-quotations", module: "purchase_quotations" },
  { prefix: "/purchase-orders", module: "purchase_orders" },
  { prefix: "/vendor-invoices", module: "vendor_invoices" },
  { prefix: "/quotations", module: "quotations" },
  { prefix: "/sales-orders", module: "sales_orders" },
  { prefix: "/proforma-invoices", module: "proforma_invoices" },
  { prefix: "/credit-notes", module: "credit_notes" },
  { prefix: "/debit-notes", module: "debit_notes" },
  { prefix: "/delivery-orders", module: "delivery_orders" },
  { prefix: "/invoices", module: "invoices" },
  { prefix: "/grn", module: "grn" },
  { prefix: "/point-of-sale", module: "point_of_sale" },
  { prefix: "/bill-of-materials", module: "bill_of_materials" },
  { prefix: "/multi-price-level", module: "multi_price_level" },
  { prefix: "/projects", module: "projects" },
  { prefix: "/assets", module: "assets" },
  { prefix: "/licenses", module: "licenses" },
  { prefix: "/employees", module: "employees" },
  { prefix: "/payroll", module: "payroll" },
  { prefix: "/accounting/expenses", module: "accounting_expenses" },
  { prefix: "/expenses", module: "accounting_expenses" },
  { prefix: "/accounting/income", module: "accounting_income" },
  { prefix: "/accounting/gst-f5", module: "accounting_gst_f5" },
  { prefix: "/accounting/gst-f7", module: "accounting_gst_f7" },
  { prefix: "/accounting/gst-io", module: "accounting_gst_io" },
  { prefix: "/accounting/wht", module: "accounting_wht" },
  { prefix: "/accounting/bank-reconciliation", module: "accounting_bank_recon" },
  { prefix: "/accounting/journal", module: "accounting_je" },
  { prefix: "/accounting/chart-of-accounts", module: "accounting_coa" },
  { prefix: "/accounting/trial-balance", module: "accounting_tb" },
  { prefix: "/accounting/balance-sheet", module: "accounting_bs" },
  { prefix: "/accounting/profit-loss", module: "accounting_pl" },
  { prefix: "/accounting/ar-aging", module: "accounting_ar_aging" },
  { prefix: "/accounting/ap-aging", module: "accounting_ap_aging" },
  { prefix: "/accounting/ar", module: "accounting_ar" },
  { prefix: "/accounting/ap", module: "accounting_ap" },
  { prefix: "/accounting", module: "accounting_coa" },
  { prefix: "/dashboard", module: "dashboard" },
];

const STATIC_TOOL_ACCESS: Record<string, { module: string; action: string }> = {
  searchCustomers: { module: "customers", action: "view" },
  searchVendors: { module: "vendors", action: "view" },
  searchQuotations: { module: "quotations", action: "view" },
  getQuotation: { module: "quotations", action: "view" },
  searchStockItems: { module: "stock_items", action: "view" },
  searchPurchaseOrders: { module: "purchase_orders", action: "view" },
  getPurchaseOrder: { module: "purchase_orders", action: "view" },
  searchInvoices: { module: "invoices", action: "view" },
  getInvoice: { module: "invoices", action: "view" },
  searchDeliveryOrders: { module: "delivery_orders", action: "view" },
  getDeliveryOrder: { module: "delivery_orders", action: "view" },
  searchVendorInvoices: { module: "vendor_invoices", action: "view" },
  searchGRN: { module: "grn", action: "view" },
  getFinancialStats: { module: "invoices", action: "view" },
  createInvoice: { module: "invoices", action: "create" },
  createQuotation: { module: "quotations", action: "create" },
  createPurchaseOrder: { module: "purchase_orders", action: "create" },
  createDeliveryOrder: { module: "delivery_orders", action: "create" },
  voidInvoice: { module: "invoices", action: "edit" },
  knockOffInvoice: { module: "invoices", action: "edit" },
};

export function moduleLabel(module: string): string {
  return MODULE_LABELS[module] ?? module.replace(/_/g, " ");
}

export function accessDenied(module: string, requiredForRequest = false): { error: string; denied: true } {
  const label = moduleLabel(module);
  return {
    denied: true,
    error: requiredForRequest
      ? `You don't have permission to access the ${label} information required for this request.`
      : `You don't have permission to access ${label} information.`,
  };
}

function isAdminRole(session: { isAdmin?: boolean; userRole?: string }): boolean {
  const role = String(session.userRole || "").toLowerCase();
  return session.isAdmin === true || role === "admin" || role === "administrator";
}

/** Use the UI-selected company when the user actually belongs to it. */
export async function resolveAgentCompanyId(
  req: { session: { userId?: number; companyId?: number; isAdmin?: boolean; userRole?: string } },
  selectedCompanyId?: unknown,
): Promise<number | null> {
  const userId = req.session.userId;
  if (!userId) return null;

  const requested = Number(selectedCompanyId);
  if (Number.isInteger(requested) && requested > 0) {
    if (isAdminRole(req.session)) {
      const [company] = await db
        .select({ id: companiesTable.id })
        .from(companiesTable)
        .where(eq(companiesTable.id, requested))
        .limit(1);
      if (company) return requested;
    } else {
      const [row] = await db
        .select({ companyId: userCompaniesTable.companyId })
        .from(userCompaniesTable)
        .where(and(eq(userCompaniesTable.userId, userId), eq(userCompaniesTable.companyId, requested)))
        .limit(1);
      if (row) return requested;
    }
  }

  return req.session.companyId ?? null;
}

export async function loadAgentAuthContext(
  req: {
    session: {
      userId?: number;
      companyId?: number;
      isAdmin?: boolean;
      userRole?: string;
      permissions?: string[];
    };
  },
  companyIdOverride?: number,
): Promise<AgentAuthContext> {
  const userId = req.session.userId!;
  const companyId = companyIdOverride ?? req.session.companyId!;
  const role = String(req.session.userRole || "user");
  const isAdmin = isAdminRole(req.session);
  const permissionList = Array.isArray(req.session.permissions) ? req.session.permissions : [];

  // Match the UI: only company admins bypass assigned-module checks.
  if (isAdmin) {
    return {
      userId,
      role,
      isAdmin: true,
      companyId,
      modules: [...APP_ALL_MODULES],
      permissions: [...APP_ALL_MODULES].flatMap((m) => [`${m}:view`, `${m}:create`, `${m}:edit`, `${m}:delete`]),
    };
  }

  const [row] = await db
    .select({ modules: userCompaniesTable.modules })
    .from(userCompaniesTable)
    .where(and(eq(userCompaniesTable.userId, userId), eq(userCompaniesTable.companyId, companyId)))
    .limit(1);

  const modules = Array.isArray(row?.modules) ? (row!.modules as string[]) : [];

  return {
    userId,
    role,
    isAdmin: false,
    companyId,
    modules,
    permissions: permissionList,
  };
}

export function hasModuleAccess(auth: AgentAuthContext, module: string): boolean {
  if (auth.isAdmin) return true;
  return Array.isArray(auth.modules) && auth.modules.includes(module);
}

export function hasPermission(auth: AgentAuthContext, module: string, action: string): boolean {
  if (auth.isAdmin) return true;
  // Assigned company modules are the source of truth — role permissions cannot grant an unassigned module.
  if (!hasModuleAccess(auth, module)) return false;
  // Assigned module → chatbot may view/summarize. Mutations still need role actions when present.
  if (action === "view") return true;
  if (auth.permissions.length === 0) return false;
  return auth.permissions.includes(`${module}:${action}`);
}

export function pathAccess(path: string): { module: string; action: string } | null {
  const raw = String(path || "").split("?")[0];
  if (!raw || raw === "/") return { module: "dashboard", action: "view" };

  const match = PATH_PREFIXES.find((r) => raw === r.prefix || raw.startsWith(`${r.prefix}/`));
  if (!match) return { module: "dashboard", action: "view" };

  let action = "view";
  if (/\/new(?:\/|$)/.test(raw)) action = "create";
  else if (/\/edit(?:\/|$)/.test(raw)) action = "edit";
  return { module: match.module, action };
}

export function authorizeTool(
  auth: AgentAuthContext,
  name: string,
  args: Record<string, any> = {},
  currentPath?: string,
): { error: string; denied: true } | null {
  if (name === "getCompanySettings") {
    const canViewSettings = hasPermission(auth, "settings", "view");
    const canCreateDocs = ["invoices", "quotations", "purchase_orders", "delivery_orders", "sales_orders"].some((m) =>
      hasPermission(auth, m, "create"),
    );
    if (canViewSettings || canCreateDocs) return null;
    return accessDenied("settings");
  }

  if (name === "fillCurrentForm") {
    const access = pathAccess(currentPath || "");
    if (!access) return null;
    if (hasPermission(auth, access.module, "edit") || hasPermission(auth, access.module, "create")) return null;
    return accessDenied(access.module);
  }

  if (name === "navigateTo") {
    const access = pathAccess(String(args.path || ""));
    if (!access) return null;
    if (hasPermission(auth, access.module, access.action)) return null;
    return accessDenied(access.module, true);
  }

  if (name === "confirmDocument" || name === "sendDocumentEmail") {
    const module = DOC_TYPE_MODULE[String(args.docType || "")] || "invoices";
    const action = name === "confirmDocument" ? "edit" : "view";
    if (hasPermission(auth, module, action)) return null;
    return accessDenied(module);
  }

  const access = STATIC_TOOL_ACCESS[name];
  if (!access) return null;
  if (hasPermission(auth, access.module, access.action)) return null;
  return accessDenied(access.module);
}

export function filterTools<T extends { function?: { name?: string } }>(tools: readonly T[], auth: AgentAuthContext): T[] {
  return tools.filter((tool) => {
    const name = tool.function?.name;
    if (!name) return true;
    if (name === "navigateTo" || name === "fillCurrentForm" || name === "confirmDocument" || name === "sendDocumentEmail" || name === "getCompanySettings") {
      return true;
    }
    return authorizeTool(auth, name) === null;
  });
}

export function deniedModuleList(auth: AgentAuthContext): string[] {
  return APP_ALL_MODULES.filter((module) => !hasModuleAccess(auth, module));
}

export function permissionContextBlock(auth: AgentAuthContext): string {
  const permMap: Record<string, string[]> = {};
  for (const module of auth.modules) {
    const actions = ["view", "create", "edit", "delete"].filter((action) => hasPermission(auth, module, action));
    permMap[module] = actions.length > 0 ? actions : ["view"];
  }

  const denied = deniedModuleList(auth).map((module) => ({
    key: module,
    label: moduleLabel(module),
  }));

  return JSON.stringify(
    {
      userId: auth.userId,
      role: auth.role,
      companyId: auth.companyId,
      allowedModules: permMap,
      deniedModules: denied,
    },
    null,
    2,
  );
}
