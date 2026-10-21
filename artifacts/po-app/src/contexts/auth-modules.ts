// Pure constants / types — kept separate from auth-context.tsx so Vite
// Fast Refresh can hot-update auth-context.tsx without invalidating the whole
// module graph (mixing React components and plain exports breaks Fast Refresh).

/** Keep in sync with sidebar (`shell.tsx`) and `lib/db/src/modules.ts`. */
export const ALL_MODULES = [
  "dashboard",
  "assets", "licenses", "employees", "payroll",
  "purchase_quotations", "purchase_orders", "vendor_invoices", "vendor_proforma_invoices", "grn", "debit_notes",
  "quotations", "sales_orders", "invoices",
  "proforma_invoices", "delivery_orders", "credit_notes",
  "point_of_sale",
  "pos_retail", "pos_supermarket", "pos_restaurants", "pos_pharmacy", "pos_electronics",
  "pos_reports",
  "bill_of_materials", "multi_price_level",
  "stock_items", "warehouses", "stock_transfer", "inventory_reports", "sales_person_wise_report", "batch_expiry",
  "vendors", "customers", "address_book",
  "projects",
  "accounting_coa", "accounting_je", "accounting_gl", "accounting_tb", "accounting_bs",
  "accounting_pl", "accounting_cf", "accounting_bank_recon",
  "accounting_gst_f5", "accounting_gst_f7", "accounting_gst_io",
  "accounting_wht", "accounting_eci", "accounting_formcs", "accounting_iaf",
  "accounting_ar", "accounting_ar_aging", "accounting_cust_stmt",
  "accounting_ap", "accounting_ap_aging", "accounting_vendor_stmt",
  "accounting_expenses",
  "accounting_income",
  "user_management", "audit_log", "settings", "report_templates",
] as const;

/** No modules are pre-selected. Admins must tick every module explicitly. */
export const DEFAULT_MODULES = [] as const;

export type AppModule = typeof ALL_MODULES[number];

export const BUSINESS_TYPES = [
  { id: "trading", label: "Trading Business" },
  { id: "trading_services", label: "Trading & Services" },
  { id: "non_trading", label: "Non-Trading Business" },
  { id: "shopping_malls", label: "Shopping Malls" },
  { id: "manufacturing", label: "Manufacturing" },
] as const;

export type BusinessTypeId = (typeof BUSINESS_TYPES)[number]["id"];

const TRANSACTIONS: AppModule[] = [
  "purchase_quotations", "purchase_orders", "vendor_invoices", "vendor_proforma_invoices", "grn", "debit_notes",
  "quotations", "sales_orders", "invoices", "proforma_invoices", "delivery_orders", "credit_notes",
  "multi_price_level",
];

const SALES_WITHOUT_CREDIT: AppModule[] = [
  "quotations", "sales_orders", "invoices", "proforma_invoices", "delivery_orders",
];

const INVENTORY: AppModule[] = [
  "stock_items", "warehouses", "stock_transfer", "inventory_reports", "sales_person_wise_report", "batch_expiry",
];

const DIRECTORY: AppModule[] = ["vendors", "customers", "address_book"];

const ACCOUNTING: AppModule[] = [
  "accounting_coa", "accounting_je", "accounting_gl", "accounting_tb", "accounting_bs",
  "accounting_pl", "accounting_cf", "accounting_bank_recon",
  "accounting_income", "accounting_expenses",
  "accounting_gst_f5", "accounting_gst_f7", "accounting_gst_io",
  "accounting_wht", "accounting_eci", "accounting_formcs", "accounting_iaf",
  "accounting_ar", "accounting_ar_aging", "accounting_cust_stmt",
  "accounting_ap", "accounting_ap_aging", "accounting_vendor_stmt",
];

const SYSTEM: AppModule[] = ["user_management", "audit_log", "settings", "report_templates"];

const OPS_ASSETS_LICENSES: AppModule[] = ["assets", "licenses"];
const OPS_ALL: AppModule[] = ["assets", "licenses", "employees", "payroll"];

/** Keep in sync with lib/db/src/modules.ts BUSINESS_TYPE_MODULES. */
export const BUSINESS_TYPE_MODULES: Record<BusinessTypeId, readonly AppModule[]> = {
  trading: [
    "dashboard",
    ...OPS_ASSETS_LICENSES,
    ...TRANSACTIONS,
    ...INVENTORY,
    ...DIRECTORY,
    ...ACCOUNTING,
    ...SYSTEM,
  ],
  non_trading: [
    "dashboard",
    ...SALES_WITHOUT_CREDIT,
    "customers",
    ...ACCOUNTING,
    ...SYSTEM,
  ],
  shopping_malls: [
    "dashboard",
    ...OPS_ALL,
    ...TRANSACTIONS,
    "point_of_sale",
    "pos_retail", "pos_supermarket", "pos_restaurants", "pos_pharmacy", "pos_electronics", "pos_reports",
    ...INVENTORY,
    ...DIRECTORY,
    ...ACCOUNTING,
    ...SYSTEM,
  ],
  manufacturing: [
    "dashboard",
    ...OPS_ASSETS_LICENSES,
    ...TRANSACTIONS,
    "bill_of_materials",
    ...INVENTORY,
    ...DIRECTORY,
    ...ACCOUNTING,
    ...SYSTEM,
  ],
  trading_services: [...ALL_MODULES],
};

export function modulesForBusinessType(value: string | null | undefined): readonly AppModule[] | null {
  if (!value) return null;
  if (Object.prototype.hasOwnProperty.call(BUSINESS_TYPE_MODULES, value)) {
    return BUSINESS_TYPE_MODULES[value as BusinessTypeId];
  }
  return null;
}

export const POS_CHANNEL_MODULES = [
  "pos_retail",
  "pos_supermarket",
  "pos_restaurants",
  "pos_pharmacy",
  "pos_electronics",
] as const satisfies readonly AppModule[];

/**
 * A channel is visible only when that channel was ticked.
 * Older rows that stored only point_of_sale, with no channel keys, still open every channel.
 */
export function hasPosChannelAccess(
  hasModuleAccess: (module: AppModule) => boolean,
  channel: (typeof POS_CHANNEL_MODULES)[number],
): boolean {
  const explicit = POS_CHANNEL_MODULES.some((key) => hasModuleAccess(key));
  if (explicit) return hasModuleAccess(channel);
  return hasModuleAccess("point_of_sale");
}

export const MODULE_LABELS: Record<AppModule, string> = {
  dashboard: "Dashboard",
  assets: "Assets",
  licenses: "Licenses",
  employees: "Employees",
  payroll: "Payroll",
  purchase_quotations: "Purchase Quotations",
  purchase_orders: "Purchase Orders",
  vendor_invoices: "Vendor Invoices",
  vendor_proforma_invoices: "Vendor Proforma Invoice",
  quotations: "Quotations",
  sales_orders: "Sales Orders",
  invoices: "Tax Invoices",
  proforma_invoices: "Proforma Invoices",
  credit_notes: "Credit Notes",
  debit_notes: "Debit Notes",
  delivery_orders: "Delivery Orders",
  point_of_sale: "Point of Sale",
  pos_retail: "Retail",
  pos_supermarket: "Supermarket",
  pos_restaurants: "Restaurants",
  pos_pharmacy: "Pharmacy",
  pos_electronics: "Electronics",
  pos_reports: "Reports",
  bill_of_materials: "Bill of Materials",
  multi_price_level: "Multi Price Level",
  grn: "Goods Receipt Note",
  stock_items: "Item Master",
  warehouses: "Warehouses",
  stock_transfer: "Stock Transfer",
  inventory_reports: "Stock Reports",
  sales_person_wise_report: "Sales Person Wise Report",
  batch_expiry: "Batch & Expiry",
  vendors: "Vendors",
  customers: "Customers",
  address_book: "Address Book",
  projects: "Projects",
  accounting_coa: "Chart of Accounts",
  accounting_je: "Journal Entries",
  accounting_gl: "General Ledger",
  accounting_tb: "Trial Balance",
  accounting_bs: "Balance Sheet",
  accounting_pl: "Profit & Loss",
  accounting_cf: "Cash Flow",
  accounting_bank_recon: "Bank Reconciliation",
  accounting_gst_f5: "GST F5 Return",
  accounting_gst_f7: "GST F7 (Amended)",
  accounting_gst_io: "GST IO Listing",
  accounting_wht: "Withholding Tax",
  accounting_eci: "ECI",
  accounting_formcs: "Form C-S",
  accounting_iaf: "IRAS Audit File",
  accounting_ar: "AR Collections",
  accounting_ar_aging: "AR Aging",
  accounting_cust_stmt: "Customer Statement",
  accounting_ap: "AP Payments",
  accounting_ap_aging: "AP Aging",
  accounting_vendor_stmt: "Vendor Statement",
  accounting_expenses: "Expenses",
  accounting_income: "Income",
  user_management: "User Management",
  audit_log: "Audit Log",
  settings: "Settings",
  report_templates: "Report Templates",
};

export interface ModuleGroup {
  id: string;
  label: string;
  sgOnly?: boolean;
  modules: AppModule[];
}

/** Same groups/order as sidebar navigation. */
export const MODULE_GROUPS: ModuleGroup[] = [
  {
    id: "general",
    label: "General",
    modules: ["dashboard"],
  },
  {
    id: "payroll",
    label: "Payroll",
    modules: ["employees", "payroll"],
  },
  {
    id: "assets",
    label: "Fixed Assets",
    modules: ["assets"],
  },
  {
    id: "licenses",
    label: "Licenses",
    modules: ["licenses"],
  },
  {
    id: "documents",
    label: "Transactions",
    modules: [
      "purchase_quotations", "purchase_orders", "vendor_proforma_invoices", "vendor_invoices", "grn", "debit_notes",
      "quotations", "sales_orders", "proforma_invoices", "invoices",
      "delivery_orders", "credit_notes",
      "multi_price_level",
    ],
  },
  {
    id: "point_of_sale",
    label: "Point of Sale",
    modules: ["pos_retail", "pos_supermarket", "pos_restaurants", "pos_pharmacy", "pos_electronics", "pos_reports"],
  },
  {
    id: "bill_of_materials",
    label: "Bill of Materials",
    modules: ["bill_of_materials"],
  },
  {
    id: "inventory",
    label: "Inventory",
    modules: ["warehouses", "stock_items", "stock_transfer", "inventory_reports", "sales_person_wise_report", "batch_expiry"],
  },
  {
    id: "directory",
    label: "Directory",
    modules: ["vendors", "customers", "address_book"],
  },
  {
    id: "accounting",
    label: "Accounting",
    sgOnly: true,
    modules: [
      "accounting_coa", "accounting_je", "accounting_gl", "accounting_tb", "accounting_bs",
      "accounting_pl", "accounting_cf", "accounting_bank_recon",
      "accounting_income", "accounting_expenses",
      "accounting_gst_f5", "accounting_gst_f7", "accounting_gst_io",
      "accounting_wht", "accounting_eci", "accounting_formcs", "accounting_iaf",
      "accounting_ar", "accounting_ar_aging", "accounting_cust_stmt",
      "accounting_ap", "accounting_ap_aging", "accounting_vendor_stmt",
    ],
  },
  {
    id: "system",
    label: "System",
    modules: ["user_management", "audit_log", "settings", "report_templates"],
  },
];

/** Longest prefix first — keep in sync with api-server agent-rbac PATH_PREFIXES. */
const PATH_MODULE_PREFIXES: { prefix: string; module: AppModule }[] = [
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
  { prefix: "/inventory/sales-person-wise-report", module: "sales_person_wise_report" },
  { prefix: "/inventory/batch-expiry", module: "batch_expiry" },
  { prefix: "/inventory/reports", module: "inventory_reports" },
  { prefix: "/inventory/warehouses", module: "warehouses" },
  { prefix: "/inventory", module: "stock_items" },
  { prefix: "/purchase-quotations", module: "purchase_quotations" },
  { prefix: "/purchase-orders", module: "purchase_orders" },
  { prefix: "/vendor-invoices", module: "vendor_invoices" },
  { prefix: "/vendor-proforma-invoices", module: "vendor_proforma_invoices" },
  { prefix: "/quotations", module: "quotations" },
  { prefix: "/sales-orders", module: "sales_orders" },
  { prefix: "/proforma-invoices", module: "proforma_invoices" },
  { prefix: "/delivery-orders", module: "delivery_orders" },
  { prefix: "/credit-notes", module: "credit_notes" },
  { prefix: "/debit-notes", module: "debit_notes" },
  { prefix: "/invoices", module: "invoices" },
  { prefix: "/grn", module: "grn" },
  { prefix: "/point-of-sale/reports", module: "pos_reports" },
  { prefix: "/point-of-sale/retail", module: "pos_retail" },
  { prefix: "/point-of-sale/supermarket", module: "pos_supermarket" },
  { prefix: "/point-of-sale/restaurants", module: "pos_restaurants" },
  { prefix: "/point-of-sale/pharmacy", module: "pos_pharmacy" },
  { prefix: "/point-of-sale/electronics", module: "pos_electronics" },
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

export function pathToAppModule(path: string): AppModule | null {
  const raw = String(path || "").split("?")[0];
  if (!raw || raw === "/") return "dashboard";
  const match = PATH_MODULE_PREFIXES.find((r) => raw === r.prefix || raw.startsWith(`${r.prefix}/`));
  return match?.module ?? null;
}
