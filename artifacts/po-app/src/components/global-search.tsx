import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useLocation } from "wouter";
import {
  Search,
  Loader2,
  FileText,
  Users,
  Package,
  LayoutDashboard,
  FolderKanban,
  BookOpen,
  Banknote,
  Monitor,
  KeyRound,
  Settings,
  X,
} from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { hasPosChannelAccess, POS_CHANNEL_MODULES, type AppModule } from "@/contexts/auth-modules";
import { cn } from "@/lib/utils";

type SearchHit = {
  type: string;
  category: string;
  id: number | string;
  /** Full breadcrumb shown in the suggestion row (Module > Page > …) */
  title: string;
  subtitle?: string;
  href: string;
  status?: string | null;
};

type PageEntry = {
  label: string;
  href: string;
  keywords: string[];
  /** Sidebar module group — used as suggestion section header */
  category: string;
  /** Path segments after the module group, e.g. ["Sales", "Tax Invoices"] */
  path: string[];
  module?: AppModule | AppModule[];
  singaporeOnly?: boolean;
};

const PAGES: PageEntry[] = [
  { label: "Dashboard", href: "/dashboard", keywords: ["home", "overview"], category: "General", path: ["Dashboard"], module: "dashboard" },

  { label: "Employees", href: "/employees", keywords: ["staff", "hr"], category: "Payroll", path: ["Employees"], module: "employees" },
  { label: "Payroll", href: "/payroll", keywords: ["salary"], category: "Payroll", path: ["Payroll"], module: "payroll" },
  { label: "IR8A / AIS", href: "/payroll/ir8a", keywords: ["ir8a", "ais", "tax", "cpf"], category: "Payroll", path: ["IR8A / AIS"], module: "payroll" },
  { label: "Employer's (IR8A)", href: "/payroll/ir8a/employers", keywords: ["ir8a", "employer", "uen", "declaration"], category: "Payroll", path: ["Employer's (IR8A)"], module: "payroll" },
  { label: "Fixed Assets", href: "/assets", keywords: ["assets", "fixed asset"], category: "Fixed Assets", path: ["Fixed Assets"], module: "assets" },
  { label: "Licenses", href: "/licenses", keywords: ["licence"], category: "Licenses", path: ["Licenses"], module: "licenses" },

  { label: "Purchase Quotations", href: "/purchase-quotations", keywords: ["pq", "rfq"], category: "Transactions", path: ["Purchases", "Purchase Quotations"], module: "purchase_quotations" },
  { label: "Purchase Orders", href: "/purchase-orders", keywords: ["po", "purchase"], category: "Transactions", path: ["Purchases", "Purchase Orders"], module: "purchase_orders" },
  { label: "Goods Receipt Note", href: "/grn", keywords: ["grn", "goods receipt", "receiving"], category: "Transactions", path: ["Purchases", "Goods Receipt Note"], module: "grn" },
  { label: "Vendor Invoices", href: "/vendor-invoices", keywords: ["pi", "bill", "payable"], category: "Transactions", path: ["Purchases", "Vendor Invoices"], module: "vendor_invoices" },
  { label: "Debit Notes", href: "/debit-notes", keywords: ["dn", "debit"], category: "Transactions", path: ["Purchases", "Debit Notes"], module: "debit_notes" },

  { label: "Quotations", href: "/quotations", keywords: ["quote", "sales quotation"], category: "Transactions", path: ["Sales", "Quotations"], module: "quotations" },
  { label: "Sales Orders", href: "/sales-orders", keywords: ["so", "order"], category: "Transactions", path: ["Sales", "Sales Orders"], module: "sales_orders" },
  { label: "Proforma Invoices", href: "/proforma-invoices", keywords: ["proforma"], category: "Transactions", path: ["Sales", "Proforma Invoices"], module: "proforma_invoices" },
  { label: "Tax Invoices", href: "/invoices", keywords: ["invoice", "sales invoice", "bill"], category: "Transactions", path: ["Sales", "Tax Invoices"], module: "invoices" },
  { label: "Delivery Orders", href: "/delivery-orders", keywords: ["do", "delivery"], category: "Transactions", path: ["Sales", "Delivery Orders"], module: "delivery_orders" },
  { label: "Credit Notes", href: "/credit-notes", keywords: ["cn", "credit"], category: "Transactions", path: ["Sales", "Credit Notes"], module: "credit_notes" },
  { label: "Retail", href: "/point-of-sale/retail", keywords: ["pos", "retail"], category: "Point of Sale", path: ["Point of Sale", "Retail"], module: "pos_retail" },
  { label: "Supermarket", href: "/point-of-sale/supermarket", keywords: ["pos", "supermarket"], category: "Point of Sale", path: ["Point of Sale", "Supermarket"], module: "pos_supermarket" },
  { label: "Restaurants", href: "/point-of-sale/restaurants", keywords: ["pos", "restaurant"], category: "Point of Sale", path: ["Point of Sale", "Restaurants"], module: "pos_restaurants" },
  { label: "Pharmacy", href: "/point-of-sale/pharmacy", keywords: ["pos", "pharmacy"], category: "Point of Sale", path: ["Point of Sale", "Pharmacy"], module: "pos_pharmacy" },
  { label: "Electronics", href: "/point-of-sale/electronics", keywords: ["pos", "electronics"], category: "Point of Sale", path: ["Point of Sale", "Electronics"], module: "pos_electronics" },
  { label: "Reports", href: "/point-of-sale/reports", keywords: ["pos", "report", "overview", "sales"], category: "Point of Sale", path: ["Point of Sale", "Reports"], module: ["pos_reports", "point_of_sale", "pos_retail", "pos_supermarket", "pos_restaurants", "pos_pharmacy", "pos_electronics"] },
  { label: "Daily Closing Z Report", href: "/point-of-sale/reports/closing", keywords: ["pos", "z report", "closing"], category: "Point of Sale", path: ["Point of Sale", "Reports", "Daily Closing"], module: ["pos_reports", "point_of_sale", "pos_retail", "pos_supermarket", "pos_restaurants", "pos_pharmacy", "pos_electronics"] },
  { label: "Payment Collection Details", href: "/point-of-sale/reports/collections", keywords: ["pos", "collection", "payment"], category: "Point of Sale", path: ["Point of Sale", "Reports", "Collections"], module: ["pos_reports", "point_of_sale", "pos_retail", "pos_supermarket", "pos_restaurants", "pos_pharmacy", "pos_electronics"] },
  { label: "Salesperson Daily Report", href: "/point-of-sale/reports/salesperson", keywords: ["pos", "salesperson", "daily"], category: "Point of Sale", path: ["Point of Sale", "Reports", "Salesperson"], module: ["pos_reports", "point_of_sale", "pos_retail", "pos_supermarket", "pos_restaurants", "pos_pharmacy", "pos_electronics"] },
  { label: "Bill of Materials", href: "/bill-of-materials", keywords: ["bom"], category: "Bill of Materials", path: ["Bill of Materials"], module: "bill_of_materials" },

  { label: "Warehouses", href: "/inventory/warehouses", keywords: ["warehouse"], category: "Inventory", path: ["Warehouses"], module: "warehouses" },
  { label: "Item Master", href: "/stock", keywords: ["stock", "inventory", "product", "item"], category: "Inventory", path: ["Item Master"], module: "stock_items" },
  { label: "Stock Transfer", href: "/inventory/stock-transfer", keywords: ["transfer"], category: "Inventory", path: ["Stock Transfer"], module: "stock_transfer" },
  { label: "Stock Reports", href: "/inventory/reports", keywords: ["inventory report"], category: "Inventory", path: ["Stock Reports"], module: "inventory_reports" },
  { label: "Sales Person Wise Report", href: "/inventory/sales-person-wise-report", keywords: ["salesperson report"], category: "Inventory", path: ["Sales Person Wise Report"], module: "sales_person_wise_report" },

  { label: "Vendors", href: "/vendors", keywords: ["supplier"], category: "Directory", path: ["Vendors"], module: "vendors" },
  { label: "Customers", href: "/customers", keywords: ["client", "buyer"], category: "Directory", path: ["Customers"], module: "customers" },
  { label: "Sales Person", href: "/sales-persons", keywords: ["salesperson", "sales persons"], category: "Directory", path: ["Sales Person"], module: "customers" },
  { label: "Address Book", href: "/address-book", keywords: ["contacts", "email"], category: "Directory", path: ["Address Book"], module: "address_book" },

  { label: "Projects", href: "/projects", keywords: ["project"], category: "Projects", path: ["Projects"], module: "projects" },

  { label: "Bank Reconciliation", href: "/accounting/bank-reconciliation", keywords: ["bank recon"], category: "Accounting", path: ["Bank Reconciliation"], module: "accounting_bank_recon", singaporeOnly: true },
  { label: "Chart of Accounts", href: "/accounting/chart-of-accounts", keywords: ["coa", "ledger"], category: "Accounting", path: ["Core Books", "Chart of Accounts"], module: "accounting_coa", singaporeOnly: true },
  { label: "Journal Entries", href: "/accounting/journal-entries", keywords: ["je", "journal"], category: "Accounting", path: ["Core Books", "Journal Entries"], module: "accounting_je", singaporeOnly: true },
  { label: "General Ledger", href: "/accounting/general-ledger", keywords: ["gl", "ledger"], category: "Accounting", path: ["Core Books", "General Ledger"], module: "accounting_gl", singaporeOnly: true },
  { label: "Trial Balance", href: "/accounting/trial-balance", keywords: ["tb"], category: "Accounting", path: ["Core Books", "Trial Balance"], module: "accounting_tb", singaporeOnly: true },
  { label: "Balance Sheet", href: "/accounting/balance-sheet", keywords: ["bs"], category: "Accounting", path: ["Core Books", "Balance Sheet"], module: "accounting_bs", singaporeOnly: true },
  { label: "Profit & Loss", href: "/accounting/profit-loss", keywords: ["p&l", "income statement"], category: "Accounting", path: ["Core Books", "Profit & Loss"], module: "accounting_pl", singaporeOnly: true },
  { label: "Cash Flow", href: "/accounting/cash-flow", keywords: ["cf"], category: "Accounting", path: ["Core Books", "Cash Flow"], module: "accounting_cf", singaporeOnly: true },
  { label: "Income", href: "/accounting/income", keywords: ["non-trade income"], category: "Accounting", path: ["Income & Expenses", "Income"], module: "accounting_income", singaporeOnly: true },
  { label: "Expenses", href: "/accounting/expenses", keywords: ["expense"], category: "Accounting", path: ["Income & Expenses", "Expenses"], module: "accounting_expenses", singaporeOnly: true },
  { label: "GST F5 Return", href: "/accounting/gst-f5", keywords: ["gst", "f5", "iras"], category: "Accounting", path: ["Tax & Compliance", "GST F5 Return"], module: "accounting_gst_f5", singaporeOnly: true },
  { label: "GST F7 Amended", href: "/accounting/gst-f7", keywords: ["gst", "f7"], category: "Accounting", path: ["Tax & Compliance", "GST F7 Amended"], module: "accounting_gst_f7", singaporeOnly: true },
  { label: "GST IO Listing", href: "/accounting/gst-io", keywords: ["input", "output tax"], category: "Accounting", path: ["Tax & Compliance", "GST IO Listing"], module: "accounting_gst_io", singaporeOnly: true },
  { label: "Withholding Tax", href: "/accounting/wht", keywords: ["wht", "section 45"], category: "Accounting", path: ["Tax & Compliance", "Withholding Tax"], module: "accounting_wht", singaporeOnly: true },
  { label: "ECI", href: "/accounting/eci", keywords: ["estimated chargeable"], category: "Accounting", path: ["Tax & Compliance", "ECI"], module: "accounting_eci", singaporeOnly: true },
  { label: "Form C-S", href: "/accounting/form-cs", keywords: ["corporate tax"], category: "Accounting", path: ["Tax & Compliance", "Form C-S"], module: "accounting_formcs", singaporeOnly: true },
  { label: "IRAS Audit File", href: "/accounting/iaf", keywords: ["iaf"], category: "Accounting", path: ["Tax & Compliance", "IRAS Audit File"], module: "accounting_iaf", singaporeOnly: true },
  { label: "AR Collections", href: "/accounting/ar", keywords: ["receivable", "collection"], category: "Accounting", path: ["Receivables", "AR Collections"], module: "accounting_ar", singaporeOnly: true },
  { label: "AR Aging", href: "/accounting/ar-aging", keywords: ["aging receivable"], category: "Accounting", path: ["Receivables", "AR Aging"], module: "accounting_ar_aging", singaporeOnly: true },
  { label: "Customer Statement", href: "/accounting/customer-statement", keywords: ["statement"], category: "Accounting", path: ["Receivables", "Customer Statement"], module: "accounting_cust_stmt", singaporeOnly: true },
  { label: "AP Payments", href: "/accounting/ap", keywords: ["payable", "payment"], category: "Accounting", path: ["Payables", "AP Payments"], module: "accounting_ap", singaporeOnly: true },
  { label: "AP Aging", href: "/accounting/ap-aging", keywords: ["aging payable"], category: "Accounting", path: ["Payables", "AP Aging"], module: "accounting_ap_aging", singaporeOnly: true },
  { label: "Vendor Statement", href: "/accounting/vendor-statement", keywords: ["vendor statement"], category: "Accounting", path: ["Payables", "Vendor Statement"], module: "accounting_vendor_stmt", singaporeOnly: true },

  { label: "User Management", href: "/admin", keywords: ["users", "roles"], category: "System", path: ["User Management"], module: "user_management" },
  { label: "Audit Log", href: "/audit-log", keywords: ["audit"], category: "System", path: ["Audit Log"], module: "audit_log" },
  { label: "Settings", href: "/settings", keywords: ["config"], category: "System", path: ["Settings"], module: "settings" },
  { label: "Backup & Restore", href: "/settings/backups", keywords: ["backup", "restore"], category: "System", path: ["Backup & Restore"], module: "settings", singaporeOnly: true },
  { label: "Year End Process", href: "/settings/year-end", keywords: ["financial year", "close year", "year end"], category: "System", path: ["Year End Process"], module: "settings", singaporeOnly: true },
  { label: "Report Design", href: "/report-templates", keywords: ["report templates", "template"], category: "System", path: ["Report Design"], module: "report_templates" },
];

/** Map API document types → module breadcrumb prefix */
const DOC_PATH: Record<string, { category: string; path: string[] }> = {
  invoice: { category: "Transactions", path: ["Sales", "Tax Invoices"] },
  quotation: { category: "Transactions", path: ["Sales", "Quotations"] },
  sales_order: { category: "Transactions", path: ["Sales", "Sales Orders"] },
  delivery_order: { category: "Transactions", path: ["Sales", "Delivery Orders"] },
  credit_note: { category: "Transactions", path: ["Sales", "Credit Notes"] },
  purchase_order: { category: "Transactions", path: ["Purchases", "Purchase Orders"] },
  purchase_quotation: { category: "Transactions", path: ["Purchases", "Purchase Quotations"] },
  vendor_invoice: { category: "Transactions", path: ["Purchases", "Vendor Invoices"] },
  grn: { category: "Transactions", path: ["Purchases", "Goods Receipt Note"] },
  debit_note: { category: "Transactions", path: ["Purchases", "Debit Notes"] },
  customer: { category: "Directory", path: ["Customers"] },
  vendor: { category: "Directory", path: ["Vendors"] },
  stock_item: { category: "Inventory", path: ["Item Master"] },
  project: { category: "Projects", path: ["Projects"] },
};

const CATEGORY_ORDER = [
  "General",
  "Payroll",
  "Fixed Assets",
  "Licenses",
  "Transactions",
  "Point of Sale",
  "Bill of Materials",
  "Inventory",
  "Directory",
  "Projects",
  "Accounting",
  "System",
  "Sales",
  "Purchases",
  "Pages",
];

function categoryIcon(category: string) {
  switch (category) {
    case "General":
      return LayoutDashboard;
    case "Payroll":
      return Banknote;
    case "Fixed Assets":
      return Monitor;
    case "Licenses":
      return KeyRound;
    case "Transactions":
    case "Sales":
    case "Purchases":
      return FileText;
    case "Directory":
      return Users;
    case "Inventory":
      return Package;
    case "Projects":
      return FolderKanban;
    case "Accounting":
      return BookOpen;
    case "System":
      return Settings;
    default:
      return FileText;
  }
}

function typeLabel(type: string) {
  const map: Record<string, string> = {
    page: "Page",
    invoice: "Invoice",
    quotation: "Quotation",
    sales_order: "Sales Order",
    purchase_order: "Purchase Order",
    purchase_quotation: "Purchase Quotation",
    vendor_invoice: "Vendor Invoice",
    delivery_order: "Delivery Order",
    grn: "GRN",
    credit_note: "Credit Note",
    debit_note: "Debit Note",
    customer: "Customer",
    vendor: "Vendor",
    stock_item: "Stock Item",
    project: "Project",
  };
  return map[type] || type;
}

function breadcrumb(category: string, path: string[], leaf?: string) {
  const parts = [category, ...path];
  if (leaf) parts.push(leaf);
  return parts.join(" > ");
}

/** Highlight every occurrence of the typed query (case-insensitive), Wave-style blue bold. */
function highlightMatch(text: string, query: string): ReactNode {
  const q = query.trim();
  if (!q) return text;
  const lower = text.toLowerCase();
  const qLower = q.toLowerCase();
  const nodes: ReactNode[] = [];
  let start = 0;
  let idx = lower.indexOf(qLower);
  let key = 0;
  while (idx >= 0) {
    if (idx > start) nodes.push(text.slice(start, idx));
    nodes.push(
      <span key={key++} className="text-blue-600 font-semibold">
        {text.slice(idx, idx + q.length)}
      </span>,
    );
    start = idx + q.length;
    idx = lower.indexOf(qLower, start);
  }
  if (start < text.length) nodes.push(text.slice(start));
  return nodes.length === 1 && typeof nodes[0] === "string" ? nodes[0] : <>{nodes}</>;
}

function normalizeApiHit(hit: SearchHit): SearchHit {
  const meta = DOC_PATH[hit.type];
  if (!meta) return hit;
  return {
    ...hit,
    category: meta.category,
    title: breadcrumb(meta.category, meta.path, hit.title),
    subtitle: hit.subtitle,
  };
}

export function GlobalSearch() {
  const [, setLocation] = useLocation();
  const { hasModuleAccess, selectedCompany, isAdmin } = useAuth();
  const isSingapore =
    selectedCompany?.country?.toLowerCase() === "singapore" ||
    selectedCompany?.country === "SG";

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [apiHits, setApiHits] = useState<SearchHit[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const canAccess = useCallback(
    (module?: AppModule | AppModule[]) => {
      if (!module) return true;
      const mods = Array.isArray(module) ? module : [module];
      return mods.some((m) => hasModuleAccess(m));
    },
    [hasModuleAccess],
  );

  const pageHits = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 1) return [] as SearchHit[];
    const matched = PAGES.filter((p) => {
      if (p.singaporeOnly && !isSingapore) return false;
      if (isAdmin && p.href === "/point-of-sale/reports") return false;
      if (typeof p.module === "string" && p.module.startsWith("pos_") && p.module !== "pos_reports") {
        if (!hasPosChannelAccess(hasModuleAccess, p.module as (typeof POS_CHANNEL_MODULES)[number])) return false;
      } else if (!canAccess(p.module)) return false;
      const hay = `${p.label} ${p.path.join(" ")} ${p.category} ${p.keywords.join(" ")}`.toLowerCase();
      return hay.includes(q);
    }).map(
      (p): SearchHit => ({
        type: "page",
        category: p.category,
        id: p.href,
        title: breadcrumb(p.category, p.path),
        href: p.href,
      }),
    );
    matched.sort((a, b) => {
      const al = a.title.toLowerCase();
      const bl = b.title.toLowerCase();
      const aExact = al.endsWith(q) || al.split(" > ").pop() === q ? 0 : al.includes(q) ? 1 : 2;
      const bExact = bl.endsWith(q) || bl.split(" > ").pop() === q ? 0 : bl.includes(q) ? 1 : 2;
      return aExact - bExact;
    });
    return matched.slice(0, 12);
  }, [query, isSingapore, canAccess]);

  const allHits = useMemo(() => {
    const q = query.trim().toLowerCase();
    const docs = apiHits.map(normalizeApiHit);
    // Pages first (module navigation), then matching documents — same from every route
    const merged = [...pageHits, ...docs];
    if (!q) return merged;
    return [...merged].sort((a, b) => {
      // Keep pages ahead of docs when relevance is similar
      const leaf = (t: string) => t.split(" > ").pop()?.toLowerCase() || t.toLowerCase();
      const score = (t: string) => {
        const l = leaf(t);
        if (l === q) return 0;
        if (l.startsWith(q)) return 1;
        if (t.toLowerCase().includes(q)) return 2;
        return 3;
      };
      const d = score(a.title) - score(b.title);
      if (d !== 0) return d;
      if (a.type === "page" && b.type !== "page") return -1;
      if (b.type === "page" && a.type !== "page") return 1;
      return 0;
    });
  }, [pageHits, apiHits, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (activeIndex >= allHits.length) setActiveIndex(0);
  }, [allHits, activeIndex]);

  useEffect(() => {
    const q = query.trim();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (abortRef.current) abortRef.current.abort();

    if (q.length < 1) {
      setApiHits([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
          credentials: "include",
          signal: ctrl.signal,
        });
        if (!res.ok) {
          setApiHits([]);
          return;
        }
        const data = await res.json();
        setApiHits(Array.isArray(data.results) ? data.results : []);
      } catch (e: any) {
        if (e?.name !== "AbortError") setApiHits([]);
      } finally {
        setLoading(false);
      }
    }, 180);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
        inputRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  function goTo(hit: SearchHit) {
    setOpen(false);
    setQuery("");
    setApiHits([]);
    setLocation(hit.href);
  }

  function selectActiveOrFirst() {
    const hit = allHits[activeIndex] ?? allHits[0];
    if (hit) goTo(hit);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      setQuery("");
      inputRef.current?.blur();
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      if (!allHits.length) return;
      setActiveIndex((i) => (i + 1) % allHits.length);
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      if (!allHits.length) return;
      setActiveIndex((i) => (i - 1 + allHits.length) % allHits.length);
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      setOpen(true);
      if (allHits.length > 0) {
        selectActiveOrFirst();
      }
    }
  }

  const grouped = useMemo(() => {
    const map = new Map<string, SearchHit[]>();
    for (const hit of allHits) {
      const list = map.get(hit.category) || [];
      list.push(hit);
      map.set(hit.category, list);
    }
    const known = CATEGORY_ORDER.filter((c) => map.has(c)).map((c) => ({
      category: c,
      hits: map.get(c)!,
    }));
    const extras = [...map.keys()]
      .filter((c) => !CATEGORY_ORDER.includes(c))
      .map((c) => ({ category: c, hits: map.get(c)! }));
    return [...known, ...extras];
  }, [allHits]);

  const showPanel = open && query.trim().length > 0;

  return (
    <div
      ref={wrapRef}
      className="sticky top-0 z-40 -mx-4 md:-mx-6 xl:-mx-8 px-4 md:px-6 xl:px-8 pt-0 pb-2 mb-2 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80"
    >
      <div className="relative w-full max-w-lg">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search pages & records…"
          className="flex h-9 w-full rounded-lg border border-border/80 bg-card pl-9 pr-16 text-sm shadow-sm outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          role="combobox"
          aria-expanded={showPanel}
          aria-autocomplete="list"
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          {query && (
            <button
              type="button"
              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted"
              onClick={() => {
                setQuery("");
                setApiHits([]);
                inputRef.current?.focus();
              }}
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <kbd className="hidden sm:inline-flex h-5 items-center rounded border bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">
            ⌘K
          </kbd>
        </div>

        {showPanel && (
          <div className="absolute left-0 right-0 mt-1.5 rounded-lg border bg-popover shadow-lg max-h-[min(28rem,70vh)] overflow-y-auto z-50">
            {grouped.length === 0 && loading ? (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Searching…
              </div>
            ) : grouped.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                No results for “{query.trim()}”
              </div>
            ) : (
              grouped.map(({ category, hits }) => {
                const Icon = categoryIcon(category);
                return (
                  <div key={category}>
                    <div className="sticky top-0 z-10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground bg-muted/60 border-b flex items-center gap-1.5">
                      <Icon className="h-3 w-3" />
                      {category}
                    </div>
                    {hits.map((hit) => {
                      const flatIndex = allHits.indexOf(hit);
                      const active = flatIndex === activeIndex;
                      return (
                        <button
                          key={`${hit.type}-${hit.id}`}
                          type="button"
                          className={cn(
                            "w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-accent transition-colors",
                            active && "bg-accent",
                          )}
                          onMouseEnter={() => setActiveIndex(flatIndex)}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            goTo(hit);
                          }}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="truncate">{highlightMatch(hit.title, query)}</div>
                            {hit.subtitle && (
                              <div className="text-xs text-muted-foreground truncate">
                                {highlightMatch(hit.subtitle, query)}
                              </div>
                            )}
                          </div>
                          <div className="shrink-0 text-right">
                            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                              {typeLabel(hit.type)}
                            </div>
                            {hit.status && (
                              <div className="text-[10px] text-muted-foreground capitalize">{hit.status}</div>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                );
              })
            )}
            {allHits.length > 0 && (
              <div className="px-3 py-1.5 text-[10px] text-muted-foreground border-t bg-muted/30">
                Enter → open · ↑↓ to move · same from any page
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
