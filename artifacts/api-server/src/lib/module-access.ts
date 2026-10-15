/**
 * Maps an API path to the company modules that may call it.
 * null means any authenticated user (shared utilities such as GST settings reads).
 * The first matching rule wins, so method-specific rules are listed before the write rule.
 */

const POS_CHANNEL_MODULES = [
  "pos_retail",
  "pos_supermarket",
  "pos_restaurants",
  "pos_pharmacy",
  "pos_electronics",
] as const;

const POS_ACCESS = ["point_of_sale", ...POS_CHANNEL_MODULES] as const;

const SALES_DOCS = [
  "invoices",
  "quotations",
  "sales_orders",
  "delivery_orders",
  "proforma_invoices",
  "credit_notes",
  ...POS_ACCESS,
] as const;

const PURCHASE_DOCS = [
  "purchase_orders",
  "purchase_quotations",
  "vendor_invoices",
  "grn",
  "debit_notes",
] as const;

const STOCK_READERS = [
  "stock_items",
  "point_of_sale",
  "bill_of_materials",
  "multi_price_level",
  "inventory_reports",
  ...SALES_DOCS,
  ...PURCHASE_DOCS,
] as const;

const DOCUMENT_REPORTS = ["report_templates", ...SALES_DOCS, ...PURCHASE_DOCS] as const;

const ACCOUNT_READERS = [
  "accounting_coa",
  "accounting_je",
  "accounting_expenses",
  "accounting_income",
  "invoices",
  "vendor_invoices",
  ...POS_ACCESS,
] as const;

type Rule = {
  prefix: string;
  methods?: readonly string[];
  anyOf: readonly string[];
};

const RULES: Rule[] = [
  { prefix: "/auth", anyOf: [] },
  { prefix: "/health", anyOf: [] },

  { prefix: "/users", anyOf: ["user_management"] },
  { prefix: "/roles", anyOf: ["user_management"] },
  { prefix: "/audit-logs", anyOf: ["audit_log"] },

  { prefix: "/companies", methods: ["GET", "HEAD"], anyOf: [] },
  { prefix: "/companies", anyOf: ["settings", "user_management"] },

  { prefix: "/settings", methods: ["GET", "HEAD"], anyOf: [] },
  { prefix: "/settings", anyOf: ["settings"] },
  { prefix: "/financial-years", methods: ["GET", "HEAD"], anyOf: [] },
  { prefix: "/financial-years", anyOf: ["settings"] },
  { prefix: "/exchange-rate", methods: ["GET", "HEAD"], anyOf: [] },
  { prefix: "/exchange-rate", anyOf: ["settings", "accounting_coa"] },

  { prefix: "/pos-sales", methods: ["GET", "HEAD"], anyOf: [...POS_ACCESS, "pos_reports"] },
  { prefix: "/pos-sales", anyOf: POS_ACCESS },
  { prefix: "/pos/", anyOf: POS_ACCESS },

  { prefix: "/sales-persons", methods: ["GET", "HEAD"], anyOf: ["customers", "user_management", "invoices", "quotations", "sales_orders", ...POS_ACCESS] },
  { prefix: "/sales-persons", anyOf: ["customers", "user_management", ...POS_ACCESS] },

  { prefix: "/stock-items", methods: ["GET", "HEAD"], anyOf: STOCK_READERS },
  { prefix: "/stock-items", anyOf: ["stock_items"] },
  { prefix: "/stock-serials", methods: ["GET", "HEAD"], anyOf: ["stock_items", ...POS_ACCESS] },
  { prefix: "/stock-serials", anyOf: ["stock_items"] },

  { prefix: "/customers", methods: ["GET", "HEAD"], anyOf: ["customers", ...SALES_DOCS] },
  { prefix: "/customers", anyOf: ["customers"] },
  { prefix: "/vendors", methods: ["GET", "HEAD"], anyOf: ["vendors", ...PURCHASE_DOCS] },
  { prefix: "/vendors", anyOf: ["vendors"] },
  { prefix: "/email-contacts", anyOf: ["address_book", "invoices", "quotations", "customers"] },
  { prefix: "/contacts", anyOf: ["address_book", "customers", "vendors"] },

  { prefix: "/invoices", anyOf: ["invoices"] },
  { prefix: "/quotations", anyOf: ["quotations"] },
  { prefix: "/sales-orders", anyOf: ["sales_orders"] },
  { prefix: "/delivery-orders", anyOf: ["delivery_orders"] },
  { prefix: "/proforma-invoices", anyOf: ["proforma_invoices"] },
  { prefix: "/credit-notes", anyOf: ["credit_notes"] },
  { prefix: "/debit-notes", anyOf: ["debit_notes"] },
  { prefix: "/purchase-orders", anyOf: ["purchase_orders"] },
  { prefix: "/purchase-quotations", anyOf: ["purchase_quotations"] },
  { prefix: "/vendor-invoices", anyOf: ["vendor_invoices"] },
  { prefix: "/grn", anyOf: ["grn"] },

  { prefix: "/warehouses", anyOf: ["warehouses"] },
  { prefix: "/opening-stock", anyOf: ["warehouses", "stock_items"] },
  { prefix: "/inventory/stock-transfers", anyOf: ["stock_transfer"] },
  { prefix: "/inventory/reports", anyOf: ["inventory_reports", "sales_person_wise_report"] },
  { prefix: "/inventory", anyOf: ["stock_items", "warehouses", "stock_transfer", "inventory_reports", "batch_expiry", "sales_person_wise_report"] },

  { prefix: "/reports/invoice-data", anyOf: DOCUMENT_REPORTS },
  { prefix: "/reports/invoice-templates", anyOf: DOCUMENT_REPORTS },
  { prefix: "/reports/preview", anyOf: DOCUMENT_REPORTS },
  { prefix: "/reports/generate", anyOf: DOCUMENT_REPORTS },
  { prefix: "/reports", anyOf: ["report_templates"] },
  { prefix: "/report-templates", anyOf: ["report_templates"] },
  { prefix: "/report-definitions", anyOf: ["report_templates"] },

  { prefix: "/accounts", methods: ["GET", "HEAD"], anyOf: ACCOUNT_READERS },
  { prefix: "/accounts", anyOf: ["accounting_coa"] },
  { prefix: "/journal-entries", anyOf: ["accounting_je"] },
  { prefix: "/trial-balance", anyOf: ["accounting_tb"] },
  { prefix: "/general-ledger", anyOf: ["accounting_gl"] },
  { prefix: "/balance-sheet", anyOf: ["accounting_bs"] },
  { prefix: "/profit-loss", anyOf: ["accounting_pl"] },
  { prefix: "/cash-flow", anyOf: ["accounting_cf"] },
  { prefix: "/gst-f5", anyOf: ["accounting_gst_f5"] },
  { prefix: "/gst-f7", anyOf: ["accounting_gst_f7"] },
  { prefix: "/gst-io-listing", anyOf: ["accounting_gst_io"] },
  { prefix: "/ar-aging", anyOf: ["accounting_ar_aging"] },
  { prefix: "/ap-aging", anyOf: ["accounting_ap_aging"] },
  { prefix: "/customer-statement", anyOf: ["accounting_cust_stmt"] },
  { prefix: "/vendor-statement", anyOf: ["accounting_vendor_stmt"] },
  { prefix: "/iaf", anyOf: ["accounting_iaf"] },
  { prefix: "/ar/", anyOf: ["accounting_ar"] },
  { prefix: "/ap/", anyOf: ["accounting_ap"] },

  { prefix: "/expenses", anyOf: ["accounting_expenses"] },
  { prefix: "/income", anyOf: ["accounting_income"] },
  { prefix: "/wht", anyOf: ["accounting_wht"] },
  { prefix: "/tax-filings", anyOf: ["accounting_eci", "accounting_formcs"] },

  { prefix: "/assets", anyOf: ["assets"] },
  { prefix: "/asset-assignments", anyOf: ["assets"] },
  { prefix: "/maintenance-records", anyOf: ["assets"] },
  { prefix: "/licenses", anyOf: ["licenses"] },
  { prefix: "/employees", anyOf: ["employees"] },
  { prefix: "/dependents", anyOf: ["employees"] },
  { prefix: "/documents", anyOf: ["employees"] },
  { prefix: "/payroll", anyOf: ["payroll"] },
  { prefix: "/employee-payroll", anyOf: ["payroll"] },
  { prefix: "/payroll-records", anyOf: ["payroll"] },
  { prefix: "/ir8a", anyOf: ["payroll"] },
  { prefix: "/projects", anyOf: ["projects"] },
];

export function normalizeApiPath(raw: string): string {
  const path = String(raw || "").split("?")[0];
  const withoutApi = path.startsWith("/api/") ? path.slice(4) : path === "/api" ? "/" : path;
  if (!withoutApi.startsWith("/")) return `/${withoutApi}`;
  return withoutApi.length > 1 && withoutApi.endsWith("/") ? withoutApi.slice(0, -1) : withoutApi;
}

function pathMatches(path: string, prefix: string): boolean {
  if (path === prefix) return true;
  const base = prefix.endsWith("/") ? prefix : `${prefix}/`;
  return path.startsWith(base);
}

/** Modules that may call this API. null = no module restriction. */
export function modulesRequiredForApi(rawPath: string, method: string): string[] | null {
  const path = normalizeApiPath(rawPath);
  const verb = String(method || "GET").toUpperCase();
  for (const rule of RULES) {
    if (!pathMatches(path, rule.prefix)) continue;
    if (rule.methods && !rule.methods.includes(verb)) continue;
    if (rule.anyOf.length === 0) return null;
    return [...rule.anyOf];
  }
  return null;
}

/**
 * Role permissions cannot grant a module the admin did not assign.
 * An assigned module the role does not mention is usable (view/create/edit)
 * so a Sales User can open Point of Sale after it is ticked.
 */
export function mergeAssignedPermissions(
  rolePermissions: string[],
  assignedModules: string[],
  isAdmin: boolean,
): string[] {
  if (isAdmin) return [...rolePermissions];
  const allowed = new Set(assignedModules);
  const filtered = rolePermissions.filter((permission) => allowed.has(permission.split(":")[0] || ""));
  const covered = new Set(filtered.map((permission) => permission.split(":")[0]));
  for (const moduleName of assignedModules) {
    if (covered.has(moduleName)) continue;
    filtered.push(`${moduleName}:view`, `${moduleName}:create`, `${moduleName}:edit`);
  }
  return filtered;
}

export const SEARCH_TYPE_MODULE: Record<string, string> = {
  invoice: "invoices",
  quotation: "quotations",
  sales_order: "sales_orders",
  delivery_order: "delivery_orders",
  credit_note: "credit_notes",
  purchase_order: "purchase_orders",
  purchase_quotation: "purchase_quotations",
  vendor_invoice: "vendor_invoices",
  grn: "grn",
  debit_note: "debit_notes",
  customer: "customers",
  vendor: "vendors",
  stock_item: "stock_items",
  project: "projects",
};
