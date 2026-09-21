import { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  useListStockItems,
  useDeleteStockItem,
  getListStockItemsQueryKey,
} from "@workspace/api-client-react";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Search,
  Package,
  MoreVertical,
  Pencil,
  Trash2,
  Download,
  SlidersHorizontal,
  ArrowUpDown,
  Barcode,
  Printer,
} from "lucide-react";
import { AdjustStockDialog } from "@/components/adjust-stock-dialog";
import { BarcodePreviewDialog, type BarcodePreviewItem } from "@/components/barcode-preview-dialog";
import { BarcodePrintDialog, type BarcodePrintSource } from "@/components/barcode-print-dialog";
import { usePagination } from "@/hooks/use-pagination";
import { ListPagination } from "@/components/list-pagination";
import { cn } from "@/lib/utils";

const CATEGORY_PILL: Record<string, string> = {
  computers: "bg-blue-100 text-blue-800",
  accessories: "bg-emerald-100 text-emerald-800",
  furniture: "bg-orange-100 text-orange-800",
  electronics: "bg-violet-100 text-violet-800",
  software: "bg-sky-100 text-sky-800",
  services: "bg-amber-100 text-amber-800",
};

function categoryPillClass(category?: string | null) {
  if (!category) return "bg-gray-100 text-gray-600";
  const key = category.toLowerCase().trim();
  if (CATEGORY_PILL[key]) return CATEGORY_PILL[key];
  const colors = [
    "bg-blue-100 text-blue-800",
    "bg-emerald-100 text-emerald-800",
    "bg-orange-100 text-orange-800",
    "bg-violet-100 text-violet-800",
    "bg-rose-100 text-rose-800",
    "bg-teal-100 text-teal-800",
  ];
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash + key.charCodeAt(i) * (i + 1)) % colors.length;
  return colors[hash];
}

function fmtMoney(n: number | string | null | undefined) {
  const v = parseFloat(String(n ?? 0));
  return Number.isFinite(v)
    ? v.toLocaleString("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "0.00";
}

function formatPriceDate(ymd?: string | null) {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
}

/** Apply Item Master markup/margin (from old cost + sell) onto a new purchase cost. */
function sellFromCatalogueMarkup(
  oldCost: number,
  oldSell: number,
  newCost: number,
): number | null {
  if (!(oldCost > 0) || !(newCost >= 0) || !Number.isFinite(oldSell)) return null;
  const markupPct = ((oldSell - oldCost) / oldCost) * 100;
  return Math.round(newCost * (1 + markupPct / 100) * 100) / 100;
}

type PriceHistoryRow = {
  id: number;
  purchasePrice: string;
  effectiveDate: string;
  sourceType: string;
  sourceRef?: string | null;
  quantity?: string | number | null;
};

/**
 * Item Master list rows per item:
 * - VI / Item Master with different purchase price → extra row (purchase, selling, qty)
 * - Same purchase price as catalogue → no extra row; stock adds on Active only
 * - Active row stock = warehouse total minus price-lot qtys
 */
function expandPurchasePriceRows(items: any[]) {
  const out: any[] = [];
  for (const item of items) {
    const history: PriceHistoryRow[] = Array.isArray(item.purchasePriceHistory)
      ? [...item.purchasePriceHistory]
      : [];

    const baseCost = parseFloat(String(item.purchasePrice ?? 0)) || 0;
    const baseSell = parseFloat(String(item.unitPrice ?? 0)) || 0;
    const basePriceCents = Math.round(baseCost * 100);
    const totalQty = parseFloat(String(item.stockQty ?? 0)) || 0;

    const byPrice = new Map<number, {
      id: number;
      purchasePrice: string;
      quantity: number;
      effectiveDate: string;
      sourceType: string;
      sourceRef: string | null;
    }>();
    for (const h of history) {
      const cents = Math.round((parseFloat(String(h.purchasePrice ?? 0)) || 0) * 100);
      const histQty = Math.max(0, parseFloat(String(h.quantity ?? 0)) || 0);
      if (cents === basePriceCents && histQty <= 0) continue;
      const existing = byPrice.get(cents);
      if (existing) {
        existing.quantity += histQty;
        if (String(h.effectiveDate || "") >= existing.effectiveDate) {
          existing.effectiveDate = String(h.effectiveDate || "");
          existing.sourceRef = h.sourceRef ?? existing.sourceRef;
          existing.id = h.id;
          existing.sourceType = h.sourceType;
        }
      } else {
        byPrice.set(cents, {
          id: h.id,
          purchasePrice: Number(h.purchasePrice).toFixed(2),
          quantity: histQty,
          effectiveDate: String(h.effectiveDate || ""),
          sourceType: h.sourceType,
          sourceRef: h.sourceRef ?? null,
        });
      }
    }

    const priceRows = Array.from(byPrice.values()).sort((a, b) => {
      const d = b.effectiveDate.localeCompare(a.effectiveDate);
      return d !== 0 ? d : b.id - a.id;
    });

    let historyQtySum = 0;
    const historyRows: any[] = [];
    for (const h of priceRows) {
      historyQtySum += h.quantity;
      const newCost = parseFloat(h.purchasePrice) || 0;
      const computedSell = sellFromCatalogueMarkup(baseCost, baseSell, newCost);
      historyRows.push({
        ...item,
        rowKey: `${item.id}-p-${h.purchasePrice}`,
        historyId: h.id,
        displayPurchasePrice: h.purchasePrice,
        displaySellingPrice: computedSell != null ? computedSell : item.unitPrice,
        displayStockQty: h.quantity,
        priceDate: h.effectiveDate || null,
        isHistoryRow: true,
        priceSource: h.sourceType,
        priceSourceRef: h.sourceRef,
      });
    }

    const baseStockQty = Math.max(0, Math.round((totalQty - historyQtySum) * 1000) / 1000);

    historyRows.push({
      ...item,
      rowKey: `${item.id}-base`,
      historyId: null as number | null,
      displayPurchasePrice: item.purchasePrice,
      displaySellingPrice: item.unitPrice,
      displayStockQty: baseStockQty,
      priceDate: null as string | null,
      isHistoryRow: false,
    });

    historyRows.forEach((row, index) => {
      row.isPrimaryRow = index === 0;
      row.showStockQty = true;
    });
    for (const row of historyRows) out.push(row);
  }
  return out;
}

export default function StockList() {
  const { canManage } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [barcodePreview, setBarcodePreview] = useState<BarcodePreviewItem | null>(null);
  const [barcodePrint, setBarcodePrint] = useState<BarcodePrintSource | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<null | {
    kind: "item" | "history";
    stockItemId: number;
    historyId?: number;
    label?: string;
  }>(null);

  const stockParams = { search: search || undefined } as any;
  const { data: items = [], refetch } = useListStockItems(stockParams, {
    query: { queryKey: getListStockItemsQueryKey(stockParams), refetchOnWindowFocus: false },
  });

  const deleteMutation = useDeleteStockItem();
  const queryClient = useQueryClient();

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const item of items as any[]) {
      if (item.category?.trim()) set.add(item.category.trim());
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const filtered = useMemo(() => {
    const base = (items as any[]).filter((item: any) => {
      const q = search.trim().toLowerCase();
      const matchesSearch =
        !q ||
        item.code?.toLowerCase().includes(q) ||
        item.name?.toLowerCase().includes(q) ||
        String(item.barcode || "").toLowerCase().includes(q) ||
        String(item.category || "").toLowerCase().includes(q) ||
        String(item.brand || "").toLowerCase().includes(q);
      const matchesType =
        typeFilter === "all" ||
        item.type === typeFilter ||
        (typeFilter === "stock_item" && item.type === "product") ||
        (typeFilter === "service_item" && item.type === "service");
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && item.isActive) ||
        (statusFilter === "inactive" && !item.isActive);
      const matchesCategory =
        categoryFilter === "all" ||
        String(item.category || "").toLowerCase() === categoryFilter.toLowerCase();
      return matchesSearch && matchesType && matchesStatus && matchesCategory;
    });
    return expandPurchasePriceRows(base);
  }, [items, search, typeFilter, statusFilter, categoryFilter]);

  const { page, setPage, totalPages, paginatedItems } = usePagination(filtered);

  const allSelected =
    paginatedItems.length > 0 && paginatedItems.every((i: any) => selected.has(i.id));
  const someSelected = paginatedItems.some((i: any) => selected.has(i.id)) && !allSelected;

  function toggleAll(checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const item of paginatedItems as any[]) {
        if (checked) next.add(item.id);
        else next.delete(item.id);
      }
      return next;
    });
  }

  function toggleOne(id: number, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function handleDelete() {
    const target = deleteTarget;
    if (!target) return;
    try {
      if (target.kind === "history" && target.historyId) {
        const res = await fetch(
          `/api/stock-items/${target.stockItemId}/purchase-prices/${target.historyId}`,
          { method: "DELETE", credentials: "include" },
        );
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "Failed to delete price row");
        }
        toast({ title: "Deleted", description: "Purchase price row removed." });
      } else {
        await new Promise<void>((resolve, reject) => {
          deleteMutation.mutate(
            { id: target.stockItemId },
            {
              onSuccess: () => resolve(),
              onError: (e: any) => reject(e),
            },
          );
        });
        toast({ title: "Deleted", description: "Item deleted." });
        setSelected((prev) => {
          const next = new Set(prev);
          next.delete(target.stockItemId);
          return next;
        });
      }
      setDeleteTarget(null);
      refetch();
      void queryClient.invalidateQueries({ queryKey: ["stock-items-picker"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/stock-items"] });
      void queryClient.invalidateQueries({ queryKey: getListStockItemsQueryKey() });
    } catch (e: any) {
      toast({ title: "Error", description: e?.message || "Delete failed", variant: "destructive" });
    }
  }

  function exportCsv() {
    const rows = [
      ["Item Code", "Item Name", "Category", "Brand", "UOM", "Purchase Price", "Selling Price", "Stock Qty", "Status"],
      ...filtered.map((i: any) => [
        i.code,
        i.name,
        i.category || "",
        i.brand || "",
        i.uom || "",
        parseFloat(i.purchasePrice ?? "0").toFixed(2),
        parseFloat(i.unitPrice ?? "0").toFixed(2),
        parseFloat(i.stockQty ?? "0").toFixed(3),
        i.isActive ? "Active" : "Inactive",
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "item-master.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[#2563EB]">Item Master</h1>
          <p className="mt-1 text-muted-foreground">Manage your products and services.</p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0 sm:justify-end">
          <Button
            variant="outline"
            className="gap-2 border-[#2563EB] text-[#2563EB] hover:bg-blue-50"
            onClick={() => setAdjustOpen(true)}
          >
            <ArrowUpDown className="h-4 w-4" />
            Adjust stock
          </Button>
          <Button className="gap-2" onClick={() => setLocation("/stock/new")}>
            <Plus className="h-4 w-4" />
            New Stock Item
          </Button>
        </div>
      </div>

      <AdjustStockDialog open={adjustOpen} onOpenChange={setAdjustOpen} />
      <BarcodePreviewDialog
        item={barcodePreview}
        open={!!barcodePreview}
        onOpenChange={(open) => {
          if (!open) setBarcodePreview(null);
        }}
      />
      <BarcodePrintDialog
        item={barcodePrint}
        open={!!barcodePrint}
        onOpenChange={(open) => {
          if (!open) setBarcodePrint(null);
        }}
      />

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by item code, name, barcode..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-10"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[160px] h-10">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px] h-10">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[140px] h-10">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="stock_item">Stock Item</SelectItem>
                <SelectItem value="non_stock_item">Non-Stock Item</SelectItem>
                <SelectItem value="service_item">Service Item</SelectItem>
                <SelectItem value="combo_item">Combo Item</SelectItem>
                <SelectItem value="serialized_item">Serialized Item</SelectItem>
                <SelectItem value="batch_item">Batch Item</SelectItem>
                <SelectItem value="gift_card">Gift Card</SelectItem>
                <SelectItem value="others">Others</SelectItem>
              </SelectContent>
            </Select>
            <Button type="button" variant="outline" className="h-10 gap-2" onClick={exportCsv}>
              <Download className="h-4 w-4" />
              Export
            </Button>
            <Button type="button" variant="outline" className="h-10 gap-2" disabled title="Filters applied above">
              <SlidersHorizontal className="h-4 w-4" />
              Filter
            </Button>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/80">
                <th className="w-12 px-4 py-3 text-left">
                  <Checkbox
                    checked={allSelected ? true : someSelected ? "indeterminate" : false}
                    onCheckedChange={(c) => toggleAll(c === true)}
                    aria-label="Select all"
                  />
                </th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Item Code</th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Item Name</th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Barcode</th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Category</th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Brand</th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">UOM</th>
                <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Purchase Price</th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Effective from</th>
                <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Selling Price</th>
                <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Stock Qty</th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Status</th>
                <th className="w-20 px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={13} className="px-4 py-16 text-center text-muted-foreground">
                    No items found. Create your first stock item.
                  </td>
                </tr>
              ) : (
                paginatedItems.map((item: any) => {
                  const isService = item.type === "service" || item.type === "service_item";
                  const qty = parseFloat(String(item.displayStockQty ?? item.stockQty ?? "0")) || 0;
                  const low = !isService && item.showStockQty && qty > 0 && qty <= parseFloat(item.minStockLevel ?? "0");
                  const empty = !isService && item.showStockQty && qty <= 0;
                  const priceDateLabel = formatPriceDate(item.priceDate);
                  return (
                    <tr
                      key={item.rowKey || item.id}
                      className={cn(
                        "border-b border-gray-100 transition-colors hover:bg-blue-50/40 cursor-pointer",
                        item.isHistoryRow && "bg-slate-50/60",
                      )}
                      onClick={() => setLocation(`/stock/${item.id}/edit`)}
                    >
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selected.has(item.id)}
                          onCheckedChange={(c) => toggleOne(item.id, c === true)}
                          aria-label={`Select ${item.code}`}
                        />
                      </td>
                      <td className="px-3 py-3 text-sm text-gray-800">{item.code}</td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-3 min-w-[180px]">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
                            {(item.itemImage || item.item_image) ? (
                              <img src={item.itemImage || item.item_image} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <Package className="h-4 w-4 text-gray-400" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium text-gray-900 truncate">{item.name}</div>
                            {item.isHistoryRow ? (
                              <div className="text-[11px] text-muted-foreground">
                                {item.priceSource === "vendor_invoice"
                                  ? (item.priceSourceRef ? `Vendor Invoice ${item.priceSourceRef}` : "Vendor Invoice price")
                                  : "Price change"}
                              </div>
                            ) : (item.type === "service" || item.type === "service_item") ? (
                              <div className="text-[11px] text-muted-foreground">Service Item</div>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                        {item.barcode ? (
                          <button
                            type="button"
                            className="group inline-flex max-w-[160px] items-center gap-1.5 rounded-md px-1 py-0.5 text-left hover:bg-blue-50"
                            title="View barcode label"
                            onClick={() =>
                              setBarcodePreview({
                                name: item.name,
                                code: item.code,
                                barcode: String(item.barcode),
                                brand: item.brand,
                                uom: item.uom,
                                stockQty: item.displayStockQty ?? item.stockQty,
                                unitPrice: item.displaySellingPrice ?? item.unitPrice,
                                mrpPrice: item.mrpPrice,
                              })
                            }
                          >
                            <Barcode className="h-3.5 w-3.5 shrink-0 text-slate-400 group-hover:text-blue-600" />
                            <span className="truncate font-mono text-sm font-medium text-blue-700 underline-offset-2 group-hover:underline">
                              {item.barcode}
                            </span>
                          </button>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {item.category ? (
                          <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium", categoryPillClass(item.category))}>
                            {item.category}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-gray-700">{item.brand || "—"}</td>
                      <td className="px-3 py-3 text-gray-600">{item.uom || "—"}</td>
                      <td className="px-3 py-3 text-right font-medium tabular-nums">
                        {fmtMoney(item.displayPurchasePrice ?? item.purchasePrice)}
                      </td>
                      <td className="px-3 py-3 text-sm text-gray-600">
                        {priceDateLabel || (item.isHistoryRow ? "—" : "—")}
                      </td>
                      <td className="px-3 py-3 text-right font-medium tabular-nums">
                        {fmtMoney(item.displaySellingPrice ?? item.unitPrice)}
                      </td>
                      <td className={cn(
                        "px-3 py-3 text-right font-semibold tabular-nums",
                        item.showStockQty && empty && "text-red-600",
                        item.showStockQty && low && !empty && "text-orange-500",
                      )}>
                        {isService
                          ? "—"
                          : qty.toLocaleString("en-SG", { maximumFractionDigits: 3 })}
                      </td>
                      <td className="px-3 py-3">
                        {isService ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (item.isHistoryRow ? qty > 0 : item.isActive) ? (
                          <Badge className="border-0 bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Active</Badge>
                        ) : item.isHistoryRow ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <Badge variant="secondary" className="border-0">Inactive</Badge>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {item.barcode ? (
                              <DropdownMenuItem
                                className="gap-2"
                                onClick={() =>
                                  setBarcodePrint({
                                    name: item.name,
                                    code: item.code,
                                    barcode: String(item.barcode),
                                    brand: item.brand,
                                    uom: item.uom,
                                    alternateUom: item.alternateUom,
                                    isWeightBased: Boolean(item.isWeightBased),
                                    stockQty: item.displayStockQty ?? item.stockQty,
                                    unitPrice: item.displaySellingPrice ?? item.unitPrice,
                                    mrpPrice: item.mrpPrice,
                                  })
                                }
                              >
                                <Printer className="h-3.5 w-3.5" /> Print
                              </DropdownMenuItem>
                            ) : null}
                            {item.barcode ? (
                              <DropdownMenuItem
                                className="gap-2"
                                onClick={() =>
                                  setBarcodePreview({
                                    name: item.name,
                                    code: item.code,
                                    barcode: String(item.barcode),
                                    brand: item.brand,
                                    uom: item.uom,
                                    stockQty: item.displayStockQty ?? item.stockQty,
                                    unitPrice: item.displaySellingPrice ?? item.unitPrice,
                                    mrpPrice: item.mrpPrice,
                                  })
                                }
                              >
                                <Barcode className="h-3.5 w-3.5" /> Barcode Label
                              </DropdownMenuItem>
                            ) : null}
                            <DropdownMenuItem className="gap-2" onClick={() => setLocation(`/stock/${item.id}/edit`)}>
                              <Pencil className="h-3.5 w-3.5" /> Edit
                            </DropdownMenuItem>
                            {canManage && (
                              <DropdownMenuItem
                                className="gap-2 text-red-600 focus:text-red-600"
                                onClick={() => setDeleteTarget(
                                  item.isHistoryRow && item.historyId
                                    ? {
                                        kind: "history",
                                        stockItemId: item.id,
                                        historyId: item.historyId,
                                        label: `${item.code} · ${fmtMoney(item.displayPurchasePrice ?? item.purchasePrice)}`,
                                      }
                                    : {
                                        kind: "item",
                                        stockItemId: item.id,
                                        label: item.code,
                                      },
                                )}
                              >
                                <Trash2 className="h-3.5 w-3.5" /> Delete
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <ListPagination page={page} totalPages={totalPages} onPageChange={setPage} />
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteTarget?.kind === "history" ? "Delete price row?" : "Delete Item?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.kind === "history"
                ? `Only this purchase price row${deleteTarget.label ? ` (${deleteTarget.label})` : ""} will be removed. The item and other prices stay.`
                : "This action cannot be undone. The item and all related price history will be permanently deleted."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={(e) => {
                e.preventDefault();
                void handleDelete();
              }}
              disabled={deleteMutation.isPending}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
