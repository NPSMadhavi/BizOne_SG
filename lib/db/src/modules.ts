/** Canonical module keys used for sidebar access and user_companies.modules.
 * Keep in sync with `artifacts/po-app/src/contexts/auth-modules.ts`.
 */
export const APP_ALL_MODULES = [
  "dashboard",
  "assets",
  "licenses",
  "employees",
  "payroll",
  "purchase_quotations",
  "purchase_orders",
  "vendor_invoices",
  "quotations",
  "sales_orders",
  "invoices",
  "proforma_invoices",
  "delivery_orders",
  "credit_notes",
  "debit_notes",
  "point_of_sale",
  "bill_of_materials",
  "multi_price_level",
  "grn",
  "stock_items",
  "warehouses",
  "stock_transfer",
  "inventory_reports",
  "sales_person_wise_report",
  "batch_expiry",
  "vendors",
  "customers",
  "address_book",
  "projects",
  "accounting_coa",
  "accounting_je",
  "accounting_gl",
  "accounting_tb",
  "accounting_bs",
  "accounting_pl",
  "accounting_cf",
  "accounting_bank_recon",
  "accounting_gst_f5",
  "accounting_gst_f7",
  "accounting_gst_io",
  "accounting_wht",
  "accounting_eci",
  "accounting_formcs",
  "accounting_iaf",
  "accounting_ar",
  "accounting_ar_aging",
  "accounting_cust_stmt",
  "accounting_ap",
  "accounting_ap_aging",
  "accounting_vendor_stmt",
  "accounting_expenses",
  "accounting_income",
  "user_management",
  "audit_log",
  "settings",
  "report_templates",
] as const;

export type AppModuleKey = (typeof APP_ALL_MODULES)[number];

export const BUSINESS_TYPES = [
  { id: "trading", label: "Trading Business" },
  { id: "non_trading", label: "Non-Trading Business" },
  { id: "shopping_malls", label: "Shopping Malls" },
  { id: "manufacturing", label: "Manufacturing" },
] as const;

export type BusinessTypeId = (typeof BUSINESS_TYPES)[number]["id"];

const TRANSACTIONS: AppModuleKey[] = [
  "purchase_quotations", "purchase_orders", "vendor_invoices", "grn", "debit_notes",
  "quotations", "sales_orders", "invoices", "proforma_invoices", "delivery_orders", "credit_notes",
  "multi_price_level",
];

const SALES_WITHOUT_CREDIT: AppModuleKey[] = [
  "quotations", "sales_orders", "invoices", "proforma_invoices", "delivery_orders",
];

const INVENTORY: AppModuleKey[] = [
  "stock_items", "warehouses", "stock_transfer", "inventory_reports", "sales_person_wise_report", "batch_expiry",
];

const DIRECTORY: AppModuleKey[] = ["vendors", "customers", "address_book"];

const ACCOUNTING: AppModuleKey[] = [
  "accounting_coa", "accounting_je", "accounting_gl", "accounting_tb", "accounting_bs",
  "accounting_pl", "accounting_cf", "accounting_bank_recon",
  "accounting_income", "accounting_expenses",
  "accounting_gst_f5", "accounting_gst_f7", "accounting_gst_io",
  "accounting_wht", "accounting_eci", "accounting_formcs", "accounting_iaf",
  "accounting_ar", "accounting_ar_aging", "accounting_cust_stmt",
  "accounting_ap", "accounting_ap_aging", "accounting_vendor_stmt",
];

const SYSTEM: AppModuleKey[] = ["user_management", "audit_log", "settings", "report_templates"];

const OPS_ASSETS_LICENSES: AppModuleKey[] = ["assets", "licenses"];
const OPS_ALL: AppModuleKey[] = ["assets", "licenses", "employees", "payroll"];

/** Modules granted at signup for each business type. Keep in sync with po-app auth-modules.ts. */
export const BUSINESS_TYPE_MODULES: Record<BusinessTypeId, readonly AppModuleKey[]> = {
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
};

export function modulesForBusinessType(value: string | null | undefined): readonly AppModuleKey[] | null {
  if (!value) return null;
  if (Object.prototype.hasOwnProperty.call(BUSINESS_TYPE_MODULES, value)) {
    return BUSINESS_TYPE_MODULES[value as BusinessTypeId];
  }
  return null;
}

export function isBusinessTypeId(value: string): value is BusinessTypeId {
  return Object.prototype.hasOwnProperty.call(BUSINESS_TYPE_MODULES, value);
}
