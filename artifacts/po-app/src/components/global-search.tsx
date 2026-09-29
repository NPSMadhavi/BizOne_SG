import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useLocation } from "wouter";
import { Search, Loader2, FileText, Users, Package, LayoutDashboard, FolderKanban, BookOpen, X } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import type { AppModule } from "@/contexts/auth-modules";
import { cn } from "@/lib/utils";

type SearchHit = {
  type: string;
  category: string;
  id: number | string;
  title: string;
  subtitle?: string;
  href: string;
  status?: string | null;
};

type PageEntry = {
  label: string;
  href: string;
  keywords: string[];
  module?: AppModule | AppModule[];
  singaporeOnly?: boolean;
};

const PAGES: PageEntry[] = [
  { label: "Dashboard", href: "/dashboard", keywords: ["home", "overview"], module: "dashboard" },
  { label: "Invoices", href: "/invoices", keywords: ["sales invoice", "bill"], module: "invoices" },
  { label: "Quotations", href: "/quotations", keywords: ["quote", "sales quotation"], module: "quotations" },
  { label: "Sales Orders", href: "/sales-orders", keywords: ["so", "order"], module: "sales_orders" },
  { label: "Delivery Orders", href: "/delivery-orders", keywords: ["do", "delivery"], module: "delivery_orders" },
  { label: "Credit Notes", href: "/credit-notes", keywords: ["cn", "credit"], module: "credit_notes" },
  { label: "Proforma Invoices", href: "/proforma-invoices", keywords: ["proforma"], module: "proforma_invoices" },
  { label: "Point of Sale", href: "/point-of-sale", keywords: ["pos", "retail"], module: "point_of_sale" },
  { label: "Purchase Orders", href: "/purchase-orders", keywords: ["po", "purchase"], module: "purchase_orders" },
  { label: "Purchase Quotations", href: "/purchase-quotations", keywords: ["pq", "rfq"], module: "purchase_quotations" },
  { label: "Vendor Invoices", href: "/vendor-invoices", keywords: ["pi", "bill", "payable"], module: "vendor_invoices" },
  { label: "GRN", href: "/grn", keywords: ["goods receipt", "receiving"], module: "grn" },
  { label: "Debit Notes", href: "/debit-notes", keywords: ["dn", "debit"], module: "debit_notes" },
  { label: "Customers", href: "/customers", keywords: ["client", "buyer"], module: "customers" },
  { label: "Vendors", href: "/vendors", keywords: ["supplier"], module: "vendors" },
  { label: "Sales Persons", href: "/sales-persons", keywords: ["salesperson"], module: "customers" },
  { label: "Address Book", href: "/address-book", keywords: ["contacts", "email"], module: "address_book" },
  { label: "Item Master", href: "/stock", keywords: ["stock", "inventory", "product"], module: "stock_items" },
  { label: "Warehouses", href: "/inventory/warehouses", keywords: ["warehouse"], module: "warehouses" },
  { label: "Stock Transfer", href: "/inventory/stock-transfer", keywords: ["transfer"], module: "stock_transfer" },
  { label: "Stock Reports", href: "/inventory/reports", keywords: ["inventory report"], module: "inventory_reports" },
  { label: "Projects", href: "/projects", keywords: ["project"], module: "projects" },
  { label: "Assets", href: "/assets", keywords: ["fixed asset"], module: "assets" },
  { label: "Licenses", href: "/licenses", keywords: ["licence"], module: "licenses" },
  { label: "Employees", href: "/employees", keywords: ["staff", "hr"], module: "employees" },
  { label: "Payroll", href: "/payroll", keywords: ["salary"], module: "payroll" },
  { label: "Chart of Accounts", href: "/accounting/chart-of-accounts", keywords: ["coa", "ledger"], module: "accounting_coa", singaporeOnly: true },
  { label: "Journal Entries", href: "/accounting/journal-entries", keywords: ["je", "journal"], module: "accounting_je", singaporeOnly: true },
  { label: "General Ledger", href: "/accounting/general-ledger", keywords: ["gl", "ledger"], module: "accounting_gl", singaporeOnly: true },
  { label: "Trial Balance", href: "/accounting/trial-balance", keywords: ["tb"], module: "accounting_tb", singaporeOnly: true },
  { label: "Balance Sheet", href: "/accounting/balance-sheet", keywords: ["bs"], module: "accounting_bs", singaporeOnly: true },
  { label: "Profit & Loss", href: "/accounting/profit-loss", keywords: ["p&l", "income statement"], module: "accounting_pl", singaporeOnly: true },
  { label: "Cash Flow", href: "/accounting/cash-flow", keywords: ["cf"], module: "accounting_cf", singaporeOnly: true },
  { label: "Income", href: "/accounting/income", keywords: ["non-trade income"], module: "accounting_income", singaporeOnly: true },
  { label: "Expenses", href: "/accounting/expenses", keywords: ["expense"], module: "accounting_expenses", singaporeOnly: true },
  { label: "GST F5 Return", href: "/accounting/gst-f5", keywords: ["gst", "f5", "iras"], module: "accounting_gst_f5", singaporeOnly: true },
  { label: "GST F7 Amended", href: "/accounting/gst-f7", keywords: ["gst", "f7"], module: "accounting_gst_f7", singaporeOnly: true },
  { label: "GST IO Listing", href: "/accounting/gst-io", keywords: ["input", "output tax"], module: "accounting_gst_io", singaporeOnly: true },
  { label: "Withholding Tax", href: "/accounting/wht", keywords: ["wht", "section 45"], module: "accounting_wht", singaporeOnly: true },
  { label: "ECI", href: "/accounting/eci", keywords: ["estimated chargeable"], module: "accounting_eci", singaporeOnly: true },
  { label: "Form C-S", href: "/accounting/form-cs", keywords: ["corporate tax"], module: "accounting_formcs", singaporeOnly: true },
  { label: "IRAS Audit File", href: "/accounting/iaf", keywords: ["iaf"], module: "accounting_iaf", singaporeOnly: true },
  { label: "AR Collections", href: "/accounting/ar", keywords: ["receivable", "collection"], module: "accounting_ar", singaporeOnly: true },
  { label: "AR Aging", href: "/accounting/ar-aging", keywords: ["aging receivable"], module: "accounting_ar_aging", singaporeOnly: true },
  { label: "Customer Statement", href: "/accounting/customer-statement", keywords: ["statement"], module: "accounting_cust_stmt", singaporeOnly: true },
  { label: "AP Payments", href: "/accounting/ap", keywords: ["payable", "payment"], module: "accounting_ap", singaporeOnly: true },
  { label: "AP Aging", href: "/accounting/ap-aging", keywords: ["aging payable"], module: "accounting_ap_aging", singaporeOnly: true },
  { label: "Vendor Statement", href: "/accounting/vendor-statement", keywords: ["vendor statement"], module: "accounting_vendor_stmt", singaporeOnly: true },
  { label: "Bank Reconciliation", href: "/accounting/bank-reconciliation", keywords: ["bank recon"], module: "accounting_bank_recon", singaporeOnly: true },
  { label: "Settings", href: "/settings", keywords: ["config"], module: "settings" },
  { label: "User Management", href: "/admin", keywords: ["users", "roles"], module: "user_management" },
  { label: "Audit Log", href: "/audit-log", keywords: ["audit"], module: "audit_log" },
];

function categoryIcon(category: string) {
  switch (category) {
    case "Pages":
      return LayoutDashboard;
    case "Directory":
      return Users;
    case "Inventory":
      return Package;
    case "Projects":
      return FolderKanban;
    case "Accounting":
      return BookOpen;
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

export function GlobalSearch() {
  const [, setLocation] = useLocation();
  const { hasModuleAccess, isAdmin, selectedCompany } = useAuth();
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
      if (isAdmin) return true;
      const mods = Array.isArray(module) ? module : [module];
      return mods.some((m) => hasModuleAccess(m));
    },
    [hasModuleAccess, isAdmin],
  );

  const pageHits = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 1) return [] as SearchHit[];
    const matched = PAGES.filter((p) => {
      if (p.singaporeOnly && !isSingapore) return false;
      if (!canAccess(p.module)) return false;
      const hay = `${p.label} ${p.keywords.join(" ")}`.toLowerCase();
      return hay.includes(q);
    }).map(
      (p): SearchHit => ({
        type: "page",
        category: "Pages",
        id: p.href,
        title: p.label,
        subtitle: "Go to page",
        href: p.href,
      }),
    );
    // Exact / starts-with first so Enter picks the right one
    matched.sort((a, b) => {
      const al = a.title.toLowerCase();
      const bl = b.title.toLowerCase();
      const aExact = al === q ? 0 : al.startsWith(q) ? 1 : 2;
      const bExact = bl === q ? 0 : bl.startsWith(q) ? 1 : 2;
      return aExact - bExact;
    });
    return matched.slice(0, 8);
  }, [query, isSingapore, canAccess]);

  const allHits = useMemo(() => {
    const q = query.trim().toLowerCase();
    const merged = [...pageHits, ...apiHits];
    if (!q) return merged;
    // Prefer exact doc number / name match first (what user typed)
    return [...merged].sort((a, b) => {
      const al = a.title.toLowerCase();
      const bl = b.title.toLowerCase();
      const score = (t: string) => (t === q ? 0 : t.startsWith(q) ? 1 : t.includes(q) ? 2 : 3);
      const d = score(al) - score(bl);
      if (d !== 0) return d;
      // pages after documents when scores equal
      if (a.type === "page" && b.type !== "page") return 1;
      if (b.type === "page" && a.type !== "page") return -1;
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
    const order = ["Sales", "Purchases", "Directory", "Inventory", "Projects", "Pages", "Accounting"];
    const map = new Map<string, SearchHit[]>();
    for (const hit of allHits) {
      const list = map.get(hit.category) || [];
      list.push(hit);
      map.set(hit.category, list);
    }
    return order
      .filter((c) => map.has(c))
      .map((c) => ({ category: c, hits: map.get(c)! }));
  }, [allHits]);

  const showPanel = open && query.trim().length > 0;

  function highlightTitle(title: string) {
    const q = query.trim();
    if (!q) return title;
    const idx = title.toLowerCase().indexOf(q.toLowerCase());
    if (idx < 0) return title;
    return (
      <>
        {title.slice(0, idx)}
        <mark className="bg-amber-100 text-foreground rounded px-0.5">{title.slice(idx, idx + q.length)}</mark>
        {title.slice(idx + q.length)}
      </>
    );
  }

  return (
    <div
      ref={wrapRef}
      className="sticky top-0 z-40 -mx-4 md:-mx-6 xl:-mx-8 px-4 md:px-6 xl:px-8 pt-0 pb-2 mb-2 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80"
    >
      <div className="relative w-full max-w-sm">
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
          placeholder="Search…"
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
                    <div className="sticky top-0 z-10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground bg-muted/60 border-b">
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
                          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <div className="min-w-0 flex-1">
                            <div className="font-medium truncate">{highlightTitle(hit.title)}</div>
                            {hit.subtitle && (
                              <div className="text-xs text-muted-foreground truncate">{hit.subtitle}</div>
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
                Enter → open highlighted · ↑↓ to move
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
