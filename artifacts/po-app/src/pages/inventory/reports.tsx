import { useMemo, useState, type ComponentType, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useListStockItems, getListStockItemsQueryKey } from "@workspace/api-client-react";
import { inventoryApi } from "@/lib/inventory-api";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { SyncBridgeDatePicker } from "@/components/ui/sync-bridge-date-picker";
import {
  exportBatchWiseExcel,
  exportBatchWisePdf,
  exportExpiryWiseExcel,
  exportExpiryWisePdf,
  exportGenericExcel,
  exportGenericPdf,
  exportStockWiseExcel,
  exportStockWisePdf,
  fmtDate,
  money,
  qty,
  resolveLayout,
  type BatchWiseRow,
  type ExpiryWiseRow,
  type ReportMeta,
  type StockWiseRow,
} from "./inventory-report-export";
import {
  Bookmark,
  RotateCcw,
  Filter,
  LayoutGrid,
  List,
  ChevronRight,
  ClipboardList,
  BookOpen,
  ArrowLeftRight,
  CircleDollarSign,
  Grid3X3,
  CalendarClock,
  Warehouse,
  Clock3,
  Ban,
  SlidersHorizontal,
  ShieldCheck,
  BarChart3,
  CalendarPlus,
  CalendarDays,
  Printer,
  FileText,
  FileSpreadsheet,
  X,
  UserCheck,
} from "lucide-react";
import { useSalesPersons } from "@/hooks/use-sales-persons";

type ReportId =
  | "stock_summary"
  | "stock_ledger"
  | "stock_movement"
  | "stock_valuation"
  | "batch_report"
  | "expiry_report"
  | "warehouse_stock"
  | "slow_moving"
  | "dead_stock"
  | "stock_adjustment"
  | "physical_verification"
  | "purchase_vs_sales"
  | "daily_stock"
  | "monthly_stock"
  | "sales_person_stock";

type ReportDef = {
  id: ReportId;
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  iconBg: string;
  iconColor: string;
};

type RecentReport = {
  id: string;
  reportId: ReportId;
  reportName: string;
  reportType: string;
  generatedOn: string;
  generatedBy: string;
  status: "Completed" | "Failed";
};

type Filters = {
  dateFrom: string;
  dateTo: string;
  warehouseId: string;
  category: string;
  itemId: string;
  salesPerson: string;
  batchNo: string;
  expiryStatus: string;
  stockStatus: string;
  includeZeroStock: boolean;
};

const RECENT_KEY = "stock-reports-recent-v1";
const LOW_STOCK_THRESHOLD = 20;

const REPORTS: ReportDef[] = [
  {
    id: "stock_summary",
    title: "Stock Summary",
    description: "Summary of opening, in, and closing stock",
    icon: ClipboardList,
    iconBg: "bg-[#DBEAFE]",
    iconColor: "text-[#2563EB]",
  },
  {
    id: "stock_ledger",
    title: "Stock Ledger",
    description: "Detailed ledger of all stock transactions",
    icon: BookOpen,
    iconBg: "bg-[#DCFCE7]",
    iconColor: "text-[#16A34A]",
  },
  {
    id: "stock_movement",
    title: "Stock Movement",
    description: "Track all stock movements in and out",
    icon: ArrowLeftRight,
    iconBg: "bg-[#EDE9FE]",
    iconColor: "text-[#7C3AED]",
  },
  {
    id: "stock_valuation",
    title: "Stock Valuation",
    description: "Current stock value and valuation report",
    icon: CircleDollarSign,
    iconBg: "bg-[#FFEDD5]",
    iconColor: "text-[#EA580C]",
  },
  {
    id: "batch_report",
    title: "Batch Report",
    description: "Batch wise stock details and balance",
    icon: Grid3X3,
    iconBg: "bg-[#CCFBF1]",
    iconColor: "text-[#0D9488]",
  },
  {
    id: "expiry_report",
    title: "Expiry Report",
    description: "Items with expiry and remaining days",
    icon: CalendarClock,
    iconBg: "bg-[#FCE7F3]",
    iconColor: "text-[#DB2777]",
  },
  {
    id: "warehouse_stock",
    title: "Warehouse Stock",
    description: "Stock summary by warehouse",
    icon: Warehouse,
    iconBg: "bg-[#DBEAFE]",
    iconColor: "text-[#2563EB]",
  },
  {
    id: "slow_moving",
    title: "Slow Moving Stock",
    description: "Items with slow movement analysis",
    icon: Clock3,
    iconBg: "bg-[#EDE9FE]",
    iconColor: "text-[#7C3AED]",
  },
  {
    id: "dead_stock",
    title: "Dead Stock",
    description: "Items with no sales for long time",
    icon: Ban,
    iconBg: "bg-[#F3F4F6]",
    iconColor: "text-[#6B7280]",
  },
  {
    id: "stock_adjustment",
    title: "Stock Adjustment",
    description: "All stock adjustments summary",
    icon: SlidersHorizontal,
    iconBg: "bg-[#DCFCE7]",
    iconColor: "text-[#16A34A]",
  },
  {
    id: "physical_verification",
    title: "Physical Verification",
    description: "Physical vs system stock comparison",
    icon: ShieldCheck,
    iconBg: "bg-[#DBEAFE]",
    iconColor: "text-[#2563EB]",
  },
  {
    id: "purchase_vs_sales",
    title: "Purchase vs Sales",
    description: "Comparison of purchase and sales",
    icon: BarChart3,
    iconBg: "bg-[#FFEDD5]",
    iconColor: "text-[#EA580C]",
  },
  {
    id: "daily_stock",
    title: "Daily Stock Report",
    description: "Daily stock summary report",
    icon: CalendarPlus,
    iconBg: "bg-[#DBEAFE]",
    iconColor: "text-[#2563EB]",
  },
  {
    id: "monthly_stock",
    title: "Monthly Stock Report",
    description: "Monthly stock summary report",
    icon: CalendarDays,
    iconBg: "bg-[#DCFCE7]",
    iconColor: "text-[#16A34A]",
  },
  {
    id: "sales_person_stock",
    title: "Sales Person Wise Report",
    description: "Stock movement, sales, and inventory distribution by sales person",
    icon: UserCheck,
    iconBg: "bg-[#DBEAFE]",
    iconColor: "text-[#2563EB]",
  },
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoIso(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function saveJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

function formatStamp(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-SG", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return iso;
  }
}

function defaultFilters(): Filters {
  return {
    dateFrom: daysAgoIso(7),
    dateTo: todayIso(),
    warehouseId: "all",
    category: "all",
    itemId: "all",
    salesPerson: "all",
    batchNo: "all",
    expiryStatus: "all",
    stockStatus: "all",
    includeZeroStock: false,
  };
}

function loadBatches(): any[] {
  try {
    const raw = localStorage.getItem("inventory-batch-expiry-rows");
    const batches = raw ? JSON.parse(raw) : [];
    return Array.isArray(batches) ? batches : [];
  } catch {
    return [];
  }
}

export default function ReportsPage() {
  const { user, selectedCompany } = useAuth();
  const { toast } = useToast();
  const { salesPersons } = useSalesPersons();
  const userName = (user as any)?.fullName || user?.username || "User";
  const companyName = selectedCompany?.name || "Company";

  const [filters, setFilters] = useState<Filters>(() => defaultFilters());
  const [applied, setApplied] = useState<Filters>(() => defaultFilters());
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [savedOpen, setSavedOpen] = useState(false);
  const [recent, setRecent] = useState<RecentReport[]>(() => loadJson(RECENT_KEY, []));
  const [activeReport, setActiveReport] = useState<ReportId | null>(null);
  const [previewRows, setPreviewRows] = useState<Record<string, string | number>[]>([]);
  const [stockWiseRows, setStockWiseRows] = useState<StockWiseRow[]>([]);
  const [batchWiseRows, setBatchWiseRows] = useState<BatchWiseRow[]>([]);
  const [expiryWiseRows, setExpiryWiseRows] = useState<ExpiryWiseRow[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewTitle, setPreviewTitle] = useState("");
  const [previewLayout, setPreviewLayout] = useState<ReturnType<typeof resolveLayout>>("generic");

  const [reportProductFilter, setReportProductFilter] = useState("all");

  const { data: warehouses = [] } = useQuery<any[]>({
    queryKey: ["stock-reports-warehouses"],
    queryFn: () => inventoryApi.getWarehouses(),
    staleTime: 60_000,
  });

  const { data: stockItems = [] } = useListStockItems(
    {} as any,
    { query: { queryKey: getListStockItemsQueryKey({} as any), refetchOnWindowFocus: false } },
  );

  const activeItems = useMemo(
    () => (stockItems as any[]).filter((i) => i.isActive !== false),
    [stockItems],
  );

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const i of activeItems) {
      const t = String(i.type || "product");
      set.add(t.charAt(0).toUpperCase() + t.slice(1));
    }
    return Array.from(set).sort();
  }, [activeItems]);

  const batchOptions = useMemo(() => {
    const set = new Set<string>();
    for (const b of loadBatches()) {
      const no = String(b.batchNo || "").trim();
      if (no) set.add(no);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, []);

  function clearFilters() {
    const next = defaultFilters();
    setFilters(next);
    setApplied(next);
  }

  function applyFilters() {
    setApplied({ ...filters });
    toast({ title: "Filters applied" });
  }

  function pushRecent(report: ReportDef) {
    const entry: RecentReport = {
      id: `r-${Date.now()}`,
      reportId: report.id,
      reportName: report.title,
      reportType: report.title,
      generatedOn: new Date().toISOString(),
      generatedBy: userName,
      status: "Completed",
    };
    setRecent((prev) => {
      const next = [entry, ...prev.filter((r) => r.reportId !== report.id)].slice(0, 20);
      saveJson(RECENT_KEY, next);
      return next;
    });
  }

  function buildMeta(title: string, layout: ReturnType<typeof resolveLayout>): ReportMeta {
    const warehouseName =
      applied.warehouseId === "all"
        ? "All Warehouses"
        : warehouses.find((w) => String(w.id) === applied.warehouseId)?.name || "All Warehouses";
    return {
      companyName,
      reportTitle: title,
      layout,
      dateFrom: applied.dateFrom,
      dateTo: applied.dateTo,
      reportDate: todayIso(),
      warehouse: warehouseName,
      category: applied.category === "all" ? "All Categories" : applied.category,
      generatedBy: userName,
    };
  }

  async function openReport(report: ReportDef) {
    setReportProductFilter("all");
    setActiveReport(report.id);
    setPreviewTitle(report.title);
    setPreviewLayout(resolveLayout(report.id));
    setPreviewLoading(true);
    setPreviewRows([]);
    setStockWiseRows([]);
    setBatchWiseRows([]);
    setExpiryWiseRows([]);
    try {
      const data = await buildReportData(report.id, applied, {
        warehouses,
        stockItems: activeItems,
      });
      setPreviewLayout(data.layout);
      setStockWiseRows(data.stockWise);
      setBatchWiseRows(data.batchWise);
      setExpiryWiseRows(data.expiryWise);
      setPreviewRows(data.generic);
      pushRecent(report);
    } catch {
      toast({ title: "Failed to load report", variant: "destructive" });
    } finally {
      setPreviewLoading(false);
    }
  }

  const displayedBatchWise = useMemo(() => {
    if (reportProductFilter === "all") return batchWiseRows;
    return batchWiseRows.filter((r) => r.itemCode === reportProductFilter);
  }, [batchWiseRows, reportProductFilter]);

  function hasExportData() {
    if (previewLayout === "stock_wise") return stockWiseRows.length > 0;
    if (previewLayout === "batch_wise") return displayedBatchWise.length > 0;
    if (previewLayout === "expiry_wise") return expiryWiseRows.length > 0;
    return previewRows.length > 0;
  }

  function exportExcel() {
    if (!hasExportData()) {
      toast({ title: "No data to export", variant: "destructive" });
      return;
    }
    const meta = buildMeta(previewTitle, previewLayout);
    if (previewLayout === "stock_wise") exportStockWiseExcel(meta, stockWiseRows);
    else if (previewLayout === "batch_wise") exportBatchWiseExcel(meta, displayedBatchWise);
    else if (previewLayout === "expiry_wise") exportExpiryWiseExcel(meta, expiryWiseRows);
    else exportGenericExcel(meta, previewRows);
  }

  function exportPdf() {
    if (!hasExportData()) {
      toast({ title: "No data to export", variant: "destructive" });
      return;
    }
    const meta = buildMeta(previewTitle, previewLayout);
    if (previewLayout === "stock_wise") exportStockWisePdf(meta, stockWiseRows);
    else if (previewLayout === "batch_wise") exportBatchWisePdf(meta, displayedBatchWise);
    else if (previewLayout === "expiry_wise") exportExpiryWisePdf(meta, expiryWiseRows);
    else exportGenericPdf(meta, previewRows);
  }

  function handlePrint() {
    const el = document.getElementById("stock-report-print-root");
    if (!el) {
      window.print();
      return;
    }

    const iframe = document.createElement("iframe");
    iframe.setAttribute(
      "style",
      "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;",
    );
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) {
      iframe.remove();
      window.print();
      return;
    }

    const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
      .map((n) => n.outerHTML)
      .join("\n");

    doc.open();
    doc.write(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>${previewTitle || "Stock Report"}</title>
${styles}
<style>
  @page { size: A4 landscape; margin: 8mm; }
  html, body {
    margin: 0 !important;
    padding: 0 !important;
    background: #fff !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  #stock-report-print-root {
    max-width: none !important;
    width: 100% !important;
    margin: 0 !important;
    border: none !important;
    border-radius: 0 !important;
    box-shadow: none !important;
  }
  #stock-report-print-root .overflow-x-auto {
    overflow: visible !important;
  }
  #stock-report-print-root table {
    width: 100% !important;
    min-width: 0 !important;
    table-layout: auto !important;
    font-size: 9px !important;
  }
  #stock-report-print-root th,
  #stock-report-print-root td {
    padding: 3px 4px !important;
    white-space: nowrap;
  }
</style>
</head>
<body>${el.outerHTML}</body>
</html>`);
    doc.close();

    const win = iframe.contentWindow;
    const cleanup = () => {
      setTimeout(() => {
        try {
          iframe.remove();
        } catch {
          // ignore
        }
      }, 800);
    };

    if (!win) {
      iframe.remove();
      return;
    }

    win.onafterprint = cleanup;
    setTimeout(() => {
      win.focus();
      win.print();
      cleanup();
    }, 300);
  }

  const previewMeta = buildMeta(previewTitle || "Inventory Report", previewLayout);

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[#2563EB]">Stock Reports</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" className="gap-2" onClick={() => setSavedOpen(true)}>
            <Bookmark className="h-4 w-4" /> Saved Reports
          </Button>
        </div>
      </div>

      {/* Filters */}
      <section className="rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <FilterField label="From Date">
            <SyncBridgeDatePicker
              value={filters.dateFrom}
              onChange={(v) => setFilters((f) => ({ ...f, dateFrom: v }))}
              placeholder="From"
              max={filters.dateTo || undefined}
            />
          </FilterField>

          <FilterField label="To Date">
            <SyncBridgeDatePicker
              value={filters.dateTo}
              onChange={(v) => setFilters((f) => ({ ...f, dateTo: v }))}
              placeholder="To"
              min={filters.dateFrom || undefined}
            />
          </FilterField>

          <FilterField label="Warehouse">
            <Select value={filters.warehouseId} onValueChange={(v) => setFilters((f) => ({ ...f, warehouseId: v }))}>
              <SelectTrigger className="h-10 w-full bg-white">
                <SelectValue placeholder="All Warehouses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Warehouses</SelectItem>
                {warehouses.map((w) => (
                  <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>

          <FilterField label="Category">
            <Select value={filters.category} onValueChange={(v) => setFilters((f) => ({ ...f, category: v }))}>
              <SelectTrigger className="h-10 w-full bg-white"><SelectValue placeholder="All Categories" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>

          <FilterField label="Item">
            <Select value={filters.itemId} onValueChange={(v) => setFilters((f) => ({ ...f, itemId: v }))}>
              <SelectTrigger className="h-10 w-full bg-white"><SelectValue placeholder="All Items" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Items</SelectItem>
                {activeItems.map((i) => (
                  <SelectItem key={i.id} value={String(i.id)}>
                    {i.code} - {i.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>

          <FilterField label="Sales Person">
            <Select value={filters.salesPerson} onValueChange={(v) => setFilters((f) => ({ ...f, salesPerson: v }))}>
              <SelectTrigger className="h-10 w-full bg-white"><SelectValue placeholder="All Sales Persons" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sales Persons</SelectItem>
                {salesPersons.map((sp) => (
                  <SelectItem key={sp.id} value={sp.name}>{sp.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>

          <FilterField label="Batch No.">
            <Select value={filters.batchNo} onValueChange={(v) => setFilters((f) => ({ ...f, batchNo: v }))}>
              <SelectTrigger className="h-10 w-full bg-white"><SelectValue placeholder="All Batches" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Batches</SelectItem>
                {batchOptions.map((b) => (
                  <SelectItem key={b} value={b}>{b}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>

          <FilterField label="Expiry Status">
            <Select value={filters.expiryStatus} onValueChange={(v) => setFilters((f) => ({ ...f, expiryStatus: v }))}>
              <SelectTrigger className="h-10 w-full bg-white"><SelectValue placeholder="All" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="fresh">Fresh</SelectItem>
                <SelectItem value="expiring">Expiring Soon</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
              </SelectContent>
            </Select>
          </FilterField>

          <FilterField label="Stock Status">
            <Select value={filters.stockStatus} onValueChange={(v) => setFilters((f) => ({ ...f, stockStatus: v }))}>
              <SelectTrigger className="h-10 w-full bg-white"><SelectValue placeholder="All" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="in_stock">In Stock</SelectItem>
                <SelectItem value="low">Low Stock</SelectItem>
                <SelectItem value="out">Out of Stock</SelectItem>
              </SelectContent>
            </Select>
          </FilterField>

          <FilterField label="Include Zero Stock">
            <div className="flex h-10 items-center">
              <Switch
                checked={filters.includeZeroStock}
                onCheckedChange={(v) => setFilters((f) => ({ ...f, includeZeroStock: v }))}
              />
            </div>
          </FilterField>
        </div>

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" className="gap-2" onClick={clearFilters}>
            <RotateCcw className="h-4 w-4" /> Clear
          </Button>
          <Button type="button" className="gap-2 bg-[#2563EB] hover:bg-[#1D4ED8]" onClick={applyFilters}>
            <Filter className="h-4 w-4" /> Apply Filters
          </Button>
        </div>
      </section>

      {/* All Stock Reports */}
      <section className="rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-[#111827]">All Stock Reports</h2>
          <div className="inline-flex rounded-lg border border-[#E5E7EB] p-0.5">
            <button
              type="button"
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium",
                viewMode === "grid" ? "bg-[#EFF6FF] text-[#2563EB]" : "text-[#6B7280]",
              )}
              onClick={() => setViewMode("grid")}
            >
              <LayoutGrid className="h-3.5 w-3.5" /> Grid
            </button>
            <button
              type="button"
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium",
                viewMode === "list" ? "bg-[#EFF6FF] text-[#2563EB]" : "text-[#6B7280]",
              )}
              onClick={() => setViewMode("list")}
            >
              <List className="h-3.5 w-3.5" /> List
            </button>
          </div>
        </div>

        <div
          className={cn(
            viewMode === "grid"
              ? "grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
              : "flex flex-col gap-2",
          )}
        >
          {REPORTS.map((report) => {
            const Icon = report.icon;
            return (
              <button
                key={report.id}
                type="button"
                onClick={() => openReport(report)}
                className={cn(
                  "group flex w-full items-start gap-3 rounded-xl border border-[#E5E7EB] bg-white p-4 text-left transition hover:border-[#BFDBFE] hover:bg-[#F8FAFC] hover:shadow-sm",
                  viewMode === "list" && "items-center",
                )}
              >
                <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", report.iconBg)}>
                  <Icon className={cn("h-5 w-5", report.iconColor)} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-[#111827]">{report.title}</p>
                    <ChevronRight className="h-4 w-4 text-[#9CA3AF]" />
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-[#6B7280]">{report.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Preview dialog — print / PDF / Excel friendly layout */}
      <Dialog open={!!activeReport} onOpenChange={(open) => !open && setActiveReport(null)}>
        <DialogContent className="max-h-[92vh] overflow-hidden p-0 sm:max-w-6xl">
          <div className="flex items-center justify-between border-b border-[#E5E7EB] bg-white px-5 py-3 print:hidden">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[#6B7280]">Inventory Reports</p>
              <DialogTitle className="text-base font-bold text-[#111827]">{previewTitle}</DialogTitle>
            </div>
            <div className="flex flex-wrap items-center gap-3 pr-8">
              {activeReport === "batch_report" && (
                <div className="flex items-center gap-1.5 mr-2">
                  <span className="text-xs font-medium text-[#6B7280] whitespace-nowrap">Product Wise:</span>
                  <Select value={reportProductFilter} onValueChange={setReportProductFilter}>
                    <SelectTrigger className="h-9 w-48 bg-white text-xs">
                      <SelectValue placeholder="All Products" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Products</SelectItem>
                      {activeItems.map((i) => (
                        <SelectItem key={i.id} value={String(i.code)}>{i.code} - {i.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <Button type="button" variant="outline" className="gap-2" onClick={handlePrint}>
                <Printer className="h-4 w-4" /> Print
              </Button>
              <Button type="button" variant="outline" className="gap-2 border-[#FECACA] text-[#DC2626]" onClick={exportPdf}>
                <FileText className="h-4 w-4" /> PDF
              </Button>
              <Button type="button" className="gap-2 bg-[#16A34A] hover:bg-[#15803D]" onClick={exportExcel}>
                <FileSpreadsheet className="h-4 w-4" /> Excel
              </Button>
            </div>
          </div>

          <div className="max-h-[75vh] min-h-[500px] overflow-auto bg-[#F3F4F6] p-4 print:bg-white print:p-0">
            {previewLoading ? (
              <p className="rounded-xl bg-white p-10 text-center text-sm text-[#6B7280]">Loading report...</p>
            ) : (
              <ReportDocument
                meta={previewMeta}
                layout={previewLayout}
                stockWise={stockWiseRows}
                batchWise={displayedBatchWise}
                expiryWise={expiryWiseRows}
                generic={previewRows}
              />
            )}
          </div>

          <div className="flex justify-end border-t border-[#E5E7EB] px-5 py-3 print:hidden">
            <Button type="button" variant="outline" className="gap-2" onClick={() => setActiveReport(null)}>
              <X className="h-4 w-4" /> Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={savedOpen} onOpenChange={setSavedOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Saved / Recent Reports</DialogTitle>
          </DialogHeader>
          {recent.length === 0 ? (
            <p className="text-sm text-[#6B7280]">No saved reports yet.</p>
          ) : (
            <div className="max-h-[50vh] space-y-2 overflow-auto">
              {recent.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className="flex w-full items-center justify-between rounded-lg border border-[#E5E7EB] px-3 py-2 text-left text-sm hover:bg-[#F9FAFB]"
                  onClick={() => {
                    setSavedOpen(false);
                    const def = REPORTS.find((x) => x.id === r.reportId);
                    if (def) openReport(def);
                  }}
                >
                  <div>
                    <p className="font-medium text-[#111827]">{r.reportName}</p>
                    <p className="text-xs text-[#6B7280]">{formatStamp(r.generatedOn)} · {r.generatedBy}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-[#9CA3AF]" />
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FilterField({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 space-y-1.5", className)}>
      <Label className="text-xs font-medium text-[#6B7280]">{label}</Label>
      {children}
    </div>
  );
}

type BuiltReport = {
  layout: ReturnType<typeof resolveLayout>;
  stockWise: StockWiseRow[];
  batchWise: BatchWiseRow[];
  expiryWise: ExpiryWiseRow[];
  generic: Record<string, string | number>[];
};

function emptyBuilt(layout: ReturnType<typeof resolveLayout>): BuiltReport {
  return { layout, stockWise: [], batchWise: [], expiryWise: [], generic: [] };
}

function daysRemaining(expiryIso: string) {
  const d = new Date(expiryIso);
  if (Number.isNaN(d.getTime())) return 0;
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const end = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}

function expiryStatus(days: number): ExpiryWiseRow["status"] {
  if (days < 0) return "Expired";
  if (days <= 30) return "Near Expiry";
  return "Safe";
}

async function buildReportData(
  reportId: ReportId,
  filters: Filters,
  ctx: { warehouses: any[]; stockItems: any[] },
): Promise<BuiltReport> {
  const layout = resolveLayout(reportId);
  const whId = filters.warehouseId === "all" ? undefined : Number(filters.warehouseId);
  const itemMap = new Map(ctx.stockItems.map((i) => [String(i.id), i]));
  const whName = (id?: number | string) =>
    ctx.warehouses.find((w) => String(w.id) === String(id))?.name || "";

  const applyItemFilter = <T extends { stockItemId?: any; quantity?: any }>(rows: T[]) => {
    let next = rows;
    if (filters.itemId !== "all") next = next.filter((r) => String(r.stockItemId) === filters.itemId);
    if (filters.category !== "all") {
      next = next.filter((r) => {
        const item = itemMap.get(String(r.stockItemId));
        const type = String(item?.type || "product");
        return type.charAt(0).toUpperCase() + type.slice(1) === filters.category;
      });
    }
    if (!filters.includeZeroStock) {
      next = next.filter((r) => r.quantity === undefined || Number(r.quantity) !== 0);
    }
    if (filters.stockStatus !== "all") {
      next = next.filter((r) => {
        const q = Number(r.quantity ?? 0);
        if (filters.stockStatus === "in_stock") return q > 0;
        if (filters.stockStatus === "low") return q > 0 && q < LOW_STOCK_THRESHOLD;
        if (filters.stockStatus === "out") return q <= 0;
        return true;
      });
    }
    return next;
  };

  async function loadStockLedgerRows() {
    const [ledger, stock] = await Promise.all([
      inventoryApi.getLedger({
        ...(whId ? { warehouseId: String(whId) } : {}),
        from: filters.dateFrom,
        to: filters.dateTo,
      }),
      inventoryApi.getCurrentStockReport(whId),
    ]);

    const ledgerByItem = new Map(ledger.map((r) => [String(r.stockItemId), r]));
    const stockByItem = new Map<string, any>();
    for (const r of applyItemFilter(stock)) {
      const key = String(r.stockItemId);
      const existing = stockByItem.get(key);
      if (existing) {
        existing.quantity = Number(existing.quantity) + Number(r.quantity);
      } else {
        stockByItem.set(key, { ...r, quantity: Number(r.quantity) });
      }
    }

    const ids = new Set([...stockByItem.keys(), ...ledgerByItem.keys()]);
    const rows: {
      id: string;
      itemCode: string;
      itemName: string;
      uom: string;
      opening: number;
      purchase: number;
      sales: number;
      adjust: number;
      closing: number;
      unitCost: number;
    }[] = [];

    for (const id of ids) {
      if (filters.itemId !== "all" && id !== filters.itemId) continue;
      const item = itemMap.get(id);
      const led = ledgerByItem.get(id);
      const st = stockByItem.get(id);
      if (!item && !st && !led) continue;

      const opening = Number(led?.opening) || 0;
      const purchase = Number(led?.received) || 0;
      const sales = Number(led?.issued) || 0;
      // Adjust includes stock adjustments + transfers so Opening+Purchase−Sales+Adjust = Closing
      const adjust =
        (Number(led?.adjustedIn) || 0) -
        (Number(led?.adjustedOut) || 0) +
        (Number(led?.transferredIn) || 0) -
        (Number(led?.transferredOut) || 0);
      const closing =
        led != null
          ? Number(led.closing) || 0
          : Number(st?.quantity) || Number(item?.stockQty) || 0;
      const unitCost = Number(st?.unitPrice ?? item?.unitPrice ?? 0) || 0;

      if (!filters.includeZeroStock && closing === 0 && opening === 0 && purchase === 0 && sales === 0) continue;

      rows.push({
        id,
        itemCode: String(st?.itemCode || item?.code || `#${id}`),
        itemName: String(st?.itemName || item?.name || ""),
        uom: String(st?.uom || item?.uom || "Nos"),
        opening,
        purchase,
        sales,
        adjust,
        closing,
        unitCost,
      });
    }
    return { rows, stockRaw: stock };
  }

  // Stock Summary — keep dedicated stock-wise fields
  if (reportId === "stock_summary") {
    const GST_RATE = 0.09;
    const { rows } = await loadStockLedgerRows();
    const stockWise: StockWiseRow[] = rows.map((r, i) => {
      const stockValue = r.closing * r.unitCost;
      const gst = stockValue * GST_RATE;
      return {
        sno: i + 1,
        itemCode: r.itemCode,
        itemName: r.itemName,
        uom: r.uom,
        openingQty: r.opening,
        purchaseQty: r.purchase,
        salesQty: r.sales,
        adjustQty: r.adjust,
        closingQty: r.closing,
        unitCost: r.unitCost,
        stockValue,
        gst,
        totalValue: stockValue + gst,
      };
    });
    return { ...emptyBuilt("stock_wise"), stockWise };
  }

  if (reportId === "batch_report") {
    let batches = loadBatches();
    if (filters.batchNo !== "all") {
      batches = batches.filter((b: any) => String(b.batchNo || "") === filters.batchNo);
    }
    if (filters.warehouseId !== "all") {
      const name = ctx.warehouses.find((w) => String(w.id) === filters.warehouseId)?.name;
      if (name) batches = batches.filter((b: any) => String(b.warehouse || "") === name);
    }

    // Dynamic database fetch for fallback customers/vendors
    let invoicesRes: any[] = [];
    let vendorInvoicesRes: any[] = [];
    try {
      const [invs, vis] = await Promise.all([
        fetch("/api/invoices").then((r) => (r.ok ? r.json() : [])).catch(() => []),
        fetch("/api/vendor-invoices").then((r) => (r.ok ? r.json() : [])).catch(() => []),
      ]);
      invoicesRes = Array.isArray(invs) ? invs : [];
      vendorInvoicesRes = Array.isArray(vis) ? vis : [];
    } catch (err) {
      console.error("[BATCH_REPORT_DB_FETCH_FAILED]", err);
    }

    const batchWise: BatchWiseRow[] = batches.map((b: any, idx: number) => {
      const received = Number(b.qty) || 0;
      const sold = 0;
      const balance = received - sold;
      const unitCost = Number(b.unitPrice) || 0;

      // Match customer from sales invoices
      let matchedCustomer = b.customer && b.customer !== "—" ? b.customer : "";
      if (!matchedCustomer) {
        const match = invoicesRes.find((inv: any) =>
          (inv.items || []).some((item: any) =>
            String(item.partNumber || "").toLowerCase() === String(b.productCode || "").toLowerCase()
          )
        );
        matchedCustomer = match ? match.customerName : "—";
      }

      // Match vendor from purchase invoices / supplier
      let matchedVendor = b.supplier && b.supplier !== "—" ? b.supplier : "";
      if (!matchedVendor && b.vendor && b.vendor !== "—") matchedVendor = b.vendor;
      if (!matchedVendor) {
        const match = vendorInvoicesRes.find((vi: any) =>
          (vi.items || []).some((item: any) =>
            String(item.partNumber || "").toLowerCase() === String(b.productCode || "").toLowerCase()
          )
        );
        matchedVendor = match ? match.vendorName : "—";
      }

      return {
        sno: idx + 1,
        batchNo: String(b.batchNo || ""),
        itemCode: String(b.productCode || ""),
        itemName: String(b.productName || ""),
        warehouse: String(b.warehouse || ""),
        mfgDate: String(b.mfgDate || ""),
        expiryDate: String(b.expiryDate || ""),
        receivedQty: received,
        soldQty: sold,
        balanceQty: balance,
        unitCost,
        totalValue: balance * unitCost,
        vendor: matchedVendor || "—",
        customer: matchedCustomer || "—",
      };
    });
    return { ...emptyBuilt("batch_wise"), batchWise };
  }

  if (reportId === "expiry_report") {
    let batches = loadBatches();
    if (filters.batchNo !== "all") {
      batches = batches.filter((b: any) => String(b.batchNo || "") === filters.batchNo);
    }
    if (filters.warehouseId !== "all") {
      const name = ctx.warehouses.find((w) => String(w.id) === filters.warehouseId)?.name;
      if (name) batches = batches.filter((b: any) => String(b.warehouse || "") === name);
    }
    let filtered = batches.map((b: any, idx: number) => {
      const days = daysRemaining(String(b.expiryDate || ""));
      return {
        sno: idx + 1,
        itemCode: String(b.productCode || ""),
        itemName: String(b.productName || ""),
        batchNo: String(b.batchNo || ""),
        mfgDate: String(b.mfgDate || ""),
        expiryDate: String(b.expiryDate || ""),
        daysRemaining: days,
        availableQty: Number(b.qty) || 0,
        warehouse: String(b.warehouse || ""),
        status: expiryStatus(days),
      } satisfies ExpiryWiseRow;
    });
    if (filters.expiryStatus !== "all") {
      filtered = filtered.filter((r) => {
        if (filters.expiryStatus === "fresh") return r.status === "Safe";
        if (filters.expiryStatus === "expiring") return r.status === "Near Expiry";
        if (filters.expiryStatus === "expired") return r.status === "Expired";
        return true;
      });
    }
    return { ...emptyBuilt("expiry_wise"), expiryWise: filtered.map((r, i) => ({ ...r, sno: i + 1 })) };
  }

  // Remaining reports — relative columns per report type
  const built = emptyBuilt("generic");

  if (reportId === "stock_ledger") {
    const { rows } = await loadStockLedgerRows();
    built.generic = rows.map((r, i) => ({
      "S.No.": i + 1,
      "Item Code": r.itemCode,
      "Item Name": r.itemName,
      UOM: r.uom,
      "Opening Qty": r.opening,
      "Received Qty": r.purchase,
      "Issued Qty": r.sales,
      "Adjust Qty": r.adjust,
      "Closing Qty": r.closing,
    }));
    return built;
  }

  if (reportId === "stock_valuation") {
    const { rows } = await loadStockLedgerRows();
    built.generic = rows.map((r, i) => ({
      "S.No.": i + 1,
      "Item Code": r.itemCode,
      "Item Name": r.itemName,
      UOM: r.uom,
      "Closing Qty": r.closing,
      "Unit Cost (SGD)": Number(r.unitCost.toFixed(2)),
      "Stock Value (SGD)": Number((r.closing * r.unitCost).toFixed(2)),
    }));
    return built;
  }

  if (reportId === "warehouse_stock") {
    const stock = await inventoryApi.getCurrentStockReport(whId);
    built.generic = applyItemFilter(stock).map((r: any, i: number) => {
      const item = itemMap.get(String(r.stockItemId));
      const qty = Number(r.quantity) || 0;
      const unitCost = Number(r.unitPrice ?? item?.unitPrice ?? 0) || 0;
      return {
        "S.No.": i + 1,
        Warehouse: r.warehouseName || whName(r.warehouseId) || "—",
        "Item Code": r.itemCode || item?.code || "",
        "Item Name": r.itemName || item?.name || "",
        UOM: r.uom || item?.uom || "Nos",
        Qty: qty,
        "Unit Cost (SGD)": Number(unitCost.toFixed(2)),
        "Value (SGD)": Number((qty * unitCost).toFixed(2)),
      };
    });
    return built;
  }

  if (reportId === "slow_moving") {
    const { rows } = await loadStockLedgerRows();
    built.generic = rows
      .filter((r) => r.closing > 0 && r.closing < LOW_STOCK_THRESHOLD * 2)
      .map((r, i) => ({
        "S.No.": i + 1,
        "Item Code": r.itemCode,
        "Item Name": r.itemName,
        UOM: r.uom,
        "Closing Qty": r.closing,
        "Sales Qty (Period)": r.sales,
        "Purchase Qty (Period)": r.purchase,
        Status: "Slow Moving",
      }));
    return built;
  }

  if (reportId === "dead_stock") {
    const { rows } = await loadStockLedgerRows();
    built.generic = rows
      .filter((r) => r.closing <= 0 || r.sales === 0)
      .map((r, i) => ({
        "S.No.": i + 1,
        "Item Code": r.itemCode,
        "Item Name": r.itemName,
        UOM: r.uom,
        "Closing Qty": r.closing,
        "Sales Qty (Period)": r.sales,
        Status: r.closing <= 0 ? "No Stock" : "No Sales",
      }));
    return built;
  }

  if (reportId === "physical_verification") {
    const { rows } = await loadStockLedgerRows();
    built.generic = rows.map((r, i) => ({
      "S.No.": i + 1,
      "Item Code": r.itemCode,
      "Item Name": r.itemName,
      UOM: r.uom,
      "System Qty": r.closing,
      "Physical Qty": r.closing,
      Variance: 0,
      Status: "Matched",
    }));
    return built;
  }

  if (reportId === "purchase_vs_sales") {
    const { rows } = await loadStockLedgerRows();
    built.generic = rows.map((r, i) => ({
      "S.No.": i + 1,
      "Item Code": r.itemCode,
      "Item Name": r.itemName,
      UOM: r.uom,
      "Purchase Qty": r.purchase,
      "Sales Qty": r.sales,
      Difference: r.purchase - r.sales,
    }));
    return built;
  }

  if (reportId === "daily_stock" || reportId === "monthly_stock") {
    const { rows } = await loadStockLedgerRows();
    const periodLabel = reportId === "daily_stock" ? "Date" : "Period";
    const periodValue =
      reportId === "daily_stock"
        ? filters.dateTo || filters.dateFrom
        : `${String(filters.dateFrom || "").slice(0, 7)} to ${String(filters.dateTo || "").slice(0, 7)}`;
    built.generic = rows.map((r, i) => ({
      "S.No.": i + 1,
      [periodLabel]: periodValue,
      "Item Code": r.itemCode,
      "Item Name": r.itemName,
      "Opening Qty": r.opening,
      "In Qty": r.purchase,
      "Out Qty": r.sales,
      "Adjust Qty": r.adjust,
      "Closing Qty": r.closing,
    }));
    return built;
  }

  if (reportId === "stock_movement") {
    const movements = await inventoryApi.getMovements(whId ? { warehouseId: String(whId) } : undefined);
    built.generic = movements
      .filter((r) => {
        if (filters.itemId !== "all" && String(r.stockItemId) !== filters.itemId) return false;
        const d = String(r.transactionDate || r.createdAt || "").slice(0, 10);
        if (filters.dateFrom && d && d < filters.dateFrom) return false;
        if (filters.dateTo && d && d > filters.dateTo) return false;
        return true;
      })
      .map((r, i) => ({
        "S.No.": i + 1,
        Date: String(r.transactionDate || r.createdAt || "").slice(0, 10),
        Type: r.transactionType || r.type || "",
        "Item Code": r.itemCode || itemMap.get(String(r.stockItemId))?.code || "",
        "Item Name": r.itemName || itemMap.get(String(r.stockItemId))?.name || "",
        Warehouse: r.warehouseName || whName(r.warehouseId) || "",
        Quantity: Number(r.quantity) || 0,
        Reference: r.referenceNo || r.documentNo || "",
      }));
    return built;
  }

  if (reportId === "stock_adjustment") {
    const rows = await inventoryApi.getAdjustments();
    built.generic = rows
      .filter((r) => {
        if (whId && Number(r.warehouseId) !== whId) return false;
        const d = String(r.adjustmentDate || r.createdAt || "").slice(0, 10);
        if (filters.dateFrom && d && d < filters.dateFrom) return false;
        if (filters.dateTo && d && d > filters.dateTo) return false;
        return true;
      })
      .map((r, i) => ({
        "S.No.": i + 1,
        Date: String(r.adjustmentDate || r.createdAt || "").slice(0, 10),
        "Doc No": r.documentNo || r.adjustmentNo || `#${r.id}`,
        Warehouse: r.warehouseName || whName(r.warehouseId) || "",
        Reason: r.reason || "",
        "Qty Change": Number(r.quantity ?? r.totalQty ?? 0) || 0,
        Status: r.status || "Posted",
      }));
    return built;
  }

  return built;
}

function layoutBarClass(layout: ReturnType<typeof resolveLayout>) {
  void layout;
  return "bg-[#3B82F6]";
}

function ReportDocument({
  meta,
  layout,
  stockWise,
  batchWise,
  expiryWise,
  generic,
}: {
  meta: ReportMeta;
  layout: ReturnType<typeof resolveLayout>;
  stockWise: StockWiseRow[];
  batchWise: BatchWiseRow[];
  expiryWise: ExpiryWiseRow[];
  generic: Record<string, string | number>[];
}) {
  const stockTotals = stockWise.reduce(
    (a, r) => ({
      opening: a.opening + r.openingQty,
      purchase: a.purchase + r.purchaseQty,
      sales: a.sales + r.salesQty,
      adjust: a.adjust + r.adjustQty,
      closing: a.closing + r.closingQty,
      value: a.value + r.stockValue,
      gst: a.gst + r.gst,
      total: a.total + r.totalValue,
    }),
    { opening: 0, purchase: 0, sales: 0, adjust: 0, closing: 0, value: 0, gst: 0, total: 0 },
  );

  return (
    <div
      id="stock-report-print-root"
      className="mx-auto max-w-6xl rounded-xl border border-[#E5E7EB] bg-white shadow-sm print:shadow-none"
    >
      <div className={cn("rounded-t-xl px-5 py-3 text-white", layoutBarClass(layout))}>
        <p className="text-sm font-bold tracking-wide">INVENTORY REPORTS</p>
        <p className="text-xs opacity-90">Print / PDF / Excel Friendly Reports</p>
      </div>

      <div className="space-y-4 p-5">
        <div>
          <h2 className="text-lg font-bold text-[#111827]">{meta.companyName}</h2>
          <div className={cn("mt-3 rounded-md px-3 py-2 text-sm font-bold text-white", layoutBarClass(layout))}>
            {meta.reportTitle.toUpperCase()}
          </div>
        </div>

        <div className="grid gap-1 text-xs text-[#4B5563] sm:grid-cols-2">
          <p>Date Range : {fmtDate(meta.dateFrom)} - {fmtDate(meta.dateTo)}</p>
          <p>Generated By : {meta.generatedBy}</p>
          <p>Report Date : {fmtDate(meta.reportDate)}</p>
          {meta.category ? <p>Category : {meta.category}</p> : null}
          <p>Warehouse : {meta.warehouse}</p>
        </div>

        {layout === "stock_wise" && (
          <>
            <div className="overflow-x-auto rounded-lg border border-[#E5E7EB]">
              <table className="w-full min-w-[1100px] text-xs">
                <thead>
                  <tr className={cn("text-left text-white", layoutBarClass(layout))}>
                    {["S.No.", "Item Code", "Item Name", "UOM", "Opening Qty", "Purchase Qty", "Sales Qty", "Adjust Qty", "Closing Qty", "Unit Cost (SGD)", "Stock Value (SGD)", "GST 9%", "Total Value (SGD)"].map((h) => (
                      <th key={h} className="px-2 py-2 font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {stockWise.length === 0 ? (
                    <tr>
                      <td colSpan={13} className="px-4 py-12 text-center text-sm text-[#6B7280]">
                        No records found for the selected filters.
                      </td>
                    </tr>
                  ) : (
                    stockWise.map((r, i) => (
                      <tr key={r.sno} className={i % 2 ? "bg-[#F9FAFB]" : "bg-white"}>
                        <td className="px-2 py-1.5">{r.sno}</td>
                        <td className="px-2 py-1.5">{r.itemCode}</td>
                        <td className="px-2 py-1.5">{r.itemName}</td>
                        <td className="px-2 py-1.5">{r.uom}</td>
                        <td className="px-2 py-1.5 text-right">{qty(r.openingQty)}</td>
                        <td className="px-2 py-1.5 text-right">{qty(r.purchaseQty)}</td>
                        <td className="px-2 py-1.5 text-right">{qty(r.salesQty)}</td>
                        <td className="px-2 py-1.5 text-right">{qty(r.adjustQty)}</td>
                        <td className="px-2 py-1.5 text-right font-semibold">{qty(r.closingQty)}</td>
                        <td className="px-2 py-1.5 text-right">{money(r.unitCost)}</td>
                        <td className="px-2 py-1.5 text-right font-semibold">{money(r.stockValue)}</td>
                        <td className="px-2 py-1.5 text-right">{money(r.gst)}</td>
                        <td className="px-2 py-1.5 text-right font-semibold">{money(r.totalValue)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot>
                  <tr className="bg-[#F3F4F6] font-bold">
                    <td className="px-2 py-2" colSpan={4}>GRAND TOTAL</td>
                    <td className="px-2 py-2 text-right">{qty(stockTotals.opening)}</td>
                    <td className="px-2 py-2 text-right">{qty(stockTotals.purchase)}</td>
                    <td className="px-2 py-2 text-right">{qty(stockTotals.sales)}</td>
                    <td className="px-2 py-2 text-right">{qty(stockTotals.adjust)}</td>
                    <td className="px-2 py-2 text-right">{qty(stockTotals.closing)}</td>
                    <td className="px-2 py-2" />
                    <td className="px-2 py-2 text-right">{money(stockTotals.value)}</td>
                    <td className="px-2 py-2 text-right">{money(stockTotals.gst)}</td>
                    <td className="px-2 py-2 text-right">{money(stockTotals.total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}

        {layout === "batch_wise" && (
          <>
            <div className="overflow-x-auto rounded-lg border border-[#E5E7EB]">
              <table className="w-full min-w-[1100px] text-xs">
                <thead>
                  <tr className={cn("text-left text-white", layoutBarClass(layout))}>
                    {["S.No.", "Batch No.", "Item Code", "Item Name", "Warehouse", "Vendor", "Customer", "Mfg. Date", "Expiry Date", "Received Qty", "Sold Qty", "Balance Qty", "Unit Cost (SGD)", "Total Value (SGD)"].map((h) => (
                      <th key={h} className="px-2 py-2 font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {batchWise.length === 0 ? (
                    <tr>
                      <td colSpan={14} className="px-4 py-12 text-center text-sm text-[#6B7280]">
                        No batch wise records found for this product.
                      </td>
                    </tr>
                  ) : (
                    batchWise.map((r, i) => (
                      <tr key={r.sno} className={i % 2 ? "bg-[#F9FAFB]" : "bg-white"}>
                        <td className="px-2 py-1.5">{r.sno}</td>
                        <td className="px-2 py-1.5">{r.batchNo}</td>
                        <td className="px-2 py-1.5">{r.itemCode}</td>
                        <td className="px-2 py-1.5">{r.itemName}</td>
                        <td className="px-2 py-1.5">{r.warehouse}</td>
                        <td className="px-2 py-1.5">{r.vendor || "—"}</td>
                        <td className="px-2 py-1.5">{r.customer || "—"}</td>
                        <td className="px-2 py-1.5">{fmtDate(r.mfgDate)}</td>
                        <td className="px-2 py-1.5">{fmtDate(r.expiryDate)}</td>
                        <td className="px-2 py-1.5 text-right">{qty(r.receivedQty)}</td>
                        <td className="px-2 py-1.5 text-right">{qty(r.soldQty)}</td>
                        <td className="px-2 py-1.5 text-right font-semibold">{qty(r.balanceQty)}</td>
                        <td className="px-2 py-1.5 text-right">{money(r.unitCost)}</td>
                        <td className="px-2 py-1.5 text-right font-semibold">{money(r.totalValue)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {layout === "expiry_wise" && (
          <>
            <div className="overflow-x-auto rounded-lg border border-[#E5E7EB]">
              <table className="w-full min-w-[900px] text-xs">
                <thead>
                  <tr className={cn("text-left text-white", layoutBarClass(layout))}>
                    {["S.No.", "Item Code", "Item Name", "Batch No.", "Mfg. Date", "Expiry Date", "Days Remaining", "Available Qty", "Warehouse", "Status"].map((h) => (
                      <th key={h} className="px-2 py-2 font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {expiryWise.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-12 text-center text-sm text-[#6B7280]">
                        No records found for the selected filters.
                      </td>
                    </tr>
                  ) : (
                    expiryWise.map((r, i) => (
                      <tr key={r.sno} className={i % 2 ? "bg-[#F9FAFB]" : "bg-white"}>
                        <td className="px-2 py-1.5">{r.sno}</td>
                        <td className="px-2 py-1.5">{r.itemCode}</td>
                        <td className="px-2 py-1.5">{r.itemName}</td>
                        <td className="px-2 py-1.5">{r.batchNo}</td>
                        <td className="px-2 py-1.5">{fmtDate(r.mfgDate)}</td>
                        <td className="px-2 py-1.5">{fmtDate(r.expiryDate)}</td>
                        <td className="px-2 py-1.5 text-right">{r.daysRemaining}</td>
                        <td className="px-2 py-1.5 text-right">{qty(r.availableQty)}</td>
                        <td className="px-2 py-1.5">{r.warehouse}</td>
                        <td className="px-2 py-1.5">
                          <span
                            className={cn(
                              "inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold",
                              r.status === "Safe" && "bg-[#DCFCE7] text-[#15803D]",
                              r.status === "Near Expiry" && "bg-[#FFEDD5] text-[#C2410C]",
                              r.status === "Expired" && "bg-[#FEE2E2] text-[#DC2626]",
                            )}
                          >
                            {r.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {layout === "generic" && (
          <div className="overflow-x-auto rounded-lg border border-[#E5E7EB]">
            {generic.length === 0 ? (
              <p className="p-8 text-center text-sm text-[#6B7280]">
                No records found for the selected filters.
              </p>
            ) : (
              <table className="w-full min-w-[640px] text-xs">
                <thead>
                  <tr className={cn("text-left text-white", layoutBarClass(layout))}>
                    {Object.keys(generic[0]).map((h) => (
                      <th key={h} className="px-2 py-2 font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {generic.map((row, idx) => (
                    <tr key={idx} className={idx % 2 ? "bg-[#F9FAFB]" : "bg-white"}>
                      {Object.keys(generic[0]).map((k) => (
                        <td key={k} className="px-2 py-1.5">{String(row[k] ?? "")}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
