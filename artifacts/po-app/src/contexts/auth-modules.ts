// Pure constants / types — kept separate from auth-context.tsx so Vite
// Fast Refresh can hot-update auth-context.tsx without invalidating the whole
// module graph (mixing React components and plain exports breaks Fast Refresh).

export const ALL_MODULES = [
  "dashboard",
  "purchase_orders", "quotations", "sales_orders", "invoices", "proforma_invoices", "credit_notes", "debit_notes", "delivery_orders", "point_of_sale", "bill_of_materials", "grn",
  "stock_items", "warehouses", "stock_transfer", "inventory_reports", "batch_expiry",
  "vendors", "customers",
  "projects",
  "assets", "licenses", "employees", "payroll",
  "accounting_coa", "accounting_je", "accounting_gl", "accounting_tb", "accounting_bs",
  "accounting_pl", "accounting_cf",
  "accounting_gst_f5", "accounting_gst_f7", "accounting_gst_io",
  "accounting_wht", "accounting_eci", "accounting_formcs", "accounting_iaf",
  "accounting_ar", "accounting_ar_aging", "accounting_cust_stmt",
  "accounting_ap", "accounting_ap_aging", "accounting_vendor_stmt",
  "accounting_expenses",
  "accounting_income",
] as const;

export const DEFAULT_MODULES = ["purchase_orders", "quotations", "sales_orders", "invoices", "proforma_invoices", "delivery_orders", "point_of_sale"] as const;
export type AppModule = typeof ALL_MODULES[number];

export const MODULE_LABELS: Record<AppModule, string> = {
  dashboard: "Dashboard",
  purchase_orders: "Purchase Orders",
  quotations: "Quotations",
  sales_orders: "Sales Orders",
  invoices: "Invoices",
  proforma_invoices: "Proforma Invoices",
  credit_notes: "Credit Notes",
  debit_notes: "Debit Notes",
  delivery_orders: "Delivery Orders",
  point_of_sale: "Point of Sale",
  bill_of_materials: "Bill of Materials",
  grn: "Goods Receipt",
  stock_items: "Stock Items",
  warehouses: "Warehouses",
  stock_transfer: "Stock Transfer",
  inventory_reports: "Stock Reports",
  batch_expiry: "Batch & Expiry",
  vendors: "Vendors",
  customers: "Customers",
  projects: "Projects",
  assets: "Assets",
  licenses: "Licenses",
  employees: "Employees",
  payroll: "Payroll",
  accounting_coa: "Chart of Accounts",
  accounting_je: "Journal Entries",
  accounting_gl: "General Ledger",
  accounting_tb: "Trial Balance",
  accounting_bs: "Balance Sheet",
  accounting_pl: "Profit & Loss",
  accounting_cf: "Cash Flow",
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
};

export interface ModuleGroup {
  id: string;
  label: string;
  sgOnly?: boolean;
  modules: AppModule[];
}

export const MODULE_GROUPS: ModuleGroup[] = [
  {
    id: "documents",
    label: "Documents",
    modules: ["purchase_orders", "quotations", "sales_orders", "invoices", "proforma_invoices", "credit_notes", "debit_notes", "delivery_orders", "point_of_sale", "bill_of_materials", "grn"],
  },
  {
    id: "inventory",
    label: "Inventory",
    modules: ["warehouses", "stock_items", "stock_transfer", "inventory_reports", "batch_expiry"],
  },
  {
    id: "directory",
    label: "Directory",
    modules: ["vendors", "customers"],
  },
  {
    id: "projects",
    label: "Projects",
    modules: ["projects"],
  },
  {
    id: "operations",
    label: "Operations",
    modules: ["assets", "licenses", "employees", "payroll"],
  },
  {
    id: "accounting",
    label: "Accounting",
    sgOnly: true,
    modules: [
      "accounting_coa", "accounting_je", "accounting_gl", "accounting_tb", "accounting_bs",
      "accounting_pl", "accounting_cf",
      "accounting_gst_f5", "accounting_gst_f7", "accounting_gst_io",
      "accounting_wht", "accounting_eci", "accounting_formcs", "accounting_iaf",
      "accounting_ar", "accounting_ar_aging", "accounting_cust_stmt",
      "accounting_ap", "accounting_ap_aging", "accounting_vendor_stmt",
      "accounting_expenses",
      "accounting_income",
    ],
  },
];
