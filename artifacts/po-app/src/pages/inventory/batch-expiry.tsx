import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useListStockItems, getListStockItemsQueryKey } from "@workspace/api-client-react";
import { inventoryApi } from "@/lib/inventory-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
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
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { usePagination } from "@/hooks/use-pagination";
import { ListPagination } from "@/components/list-pagination";
import {
  Package,
  Layers,
  Hourglass,
  AlertTriangle,
  Search,
  Filter,
  Calendar,
  Eye,
  Pencil,
  Copy,
  Plus,
  ChevronLeft,
  ChevronRight,
  Warehouse,
  Barcode,
  Truck,
  Trash2,
} from "lucide-react";

type BatchStatus = "fresh" | "expiring_30" | "expiring_7" | "expired";

type BatchRow = {
  id: string;
  productName: string;
  productCode: string;
  category: string;
  batchNo: string;
  barcode: string;
  supplier: string;
  warehouse: string;
  purchaseDate: string;
  mfgDate: string;
  expiryDate: string;
  qty: number;
  unitPrice: number;
  imageHue: number;
};

const STORAGE_KEY = "inventory-batch-expiry-rows";

function money(n: number) {
  return `S$ ${n.toLocaleString("en-SG", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function parseDate(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function daysUntil(iso: string, today = new Date()) {
  const d = parseDate(iso);
  if (!d) return 0;
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const end = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}

function statusOf(expiryDate: string): BatchStatus {
  const days = daysUntil(expiryDate);
  if (days < 0) return "expired";
  if (days <= 7) return "expiring_7";
  if (days <= 30) return "expiring_30";
  return "fresh";
}

function statusMeta(status: BatchStatus, expiryDate?: string) {
  const days = expiryDate != null ? daysUntil(expiryDate) : 0;
  switch (status) {
    case "fresh":
      return { label: "Fresh", className: "bg-[#DCFCE7] text-[#15803D]" };
    case "expiring_30":
      return { label: "Expiring Soon", className: "bg-[#FEF3C7] text-[#B45309]" };
    case "expiring_7":
      return {
        label: days > 0 ? `Expiring in ${days} Days` : "Expiring Soon",
        className: "bg-[#FFEDD5] text-[#C2410C]",
      };
    case "expired":
      return { label: "Expired", className: "bg-[#FEE2E2] text-[#B91C1C]" };
  }
}

function formatDisplayDate(iso: string) {
  const d = parseDate(iso);
  if (!d) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function addDays(base: Date, days: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function loadBatches(): BatchRow[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveBatches(rows: BatchRow[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
  } catch {
    // ignore
  }
}

function Kpi({
  label,
  value,
  hint,
  icon: Icon,
  iconClass,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: ComponentType<{ className?: string }>;
  iconClass: string;
}) {
  return (
    <div className="rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-[#6B7280]">{label}</p>
          <p className="mt-2 text-2xl font-bold text-[#111827]">{value}</p>
          {hint ? <p className="mt-1 text-xs text-[#9CA3AF]">{hint}</p> : null}
        </div>
        <div className={cn("rounded-lg p-2.5", iconClass)}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

const EMPTY_FORM = {
  stockItemId: "",
  productName: "",
  productCode: "",
  batchNo: "",
  barcode: "",
  supplier: "",
  warehouse: "",
  purchaseDate: "",
  mfgDate: "",
  expiryDate: "",
  qty: 0,
  unitPrice: 0,
  category: "General",
};

export default function BatchExpiryPage() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [warehouse, setWarehouse] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [viewBatchId, setViewBatchId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [rows, setRows] = useState<BatchRow[]>(() => loadBatches());

  const { data: warehouses = [] } = useQuery<any[]>({
    queryKey: ["batch-expiry-warehouses"],
    queryFn: () => inventoryApi.getWarehouses(),
    staleTime: 60_000,
  });

  const { data: stockItems = [] } = useListStockItems(
    {} as any,
    { query: { queryKey: getListStockItemsQueryKey({} as any), refetchOnWindowFocus: false } },
  );

  const stockOptions = useMemo(() => {
    return (stockItems as any[])
      .filter((i) => i.isActive !== false)
      .map((i) => ({
        id: String(i.id),
        label: `${i.code || "ITEM"} - ${i.name || "Item"}`,
        code: String(i.code || ""),
        name: String(i.name || ""),
        batchNo: String(i.batchNo || ""),
        unitPrice: Number(i.unitPrice) || 0,
        category: String(i.category || i.type || "General"),
      }));
  }, [stockItems]);

  // One-time: remove previously seeded demo medicine rows from localStorage
  useEffect(() => {
    try {
      const flag = `${STORAGE_KEY}-cleared-demo`;
      if (localStorage.getItem(flag)) return;
      const demoNames = ["Paracetamol", "Amoxicillin", "Vitamin C", "Ibuprofen", "Cough Syrup", "Hand Sanitizer"];
      const current = loadBatches();
      const next = current.filter((r) => !demoNames.some((n) => r.productName.includes(n)));
      if (next.length !== current.length) {
        setRows(next);
        saveBatches(next);
      }
      localStorage.setItem(flag, "1");
    } catch {
      // ignore
    }
  }, []);

  const warehouseOptions = useMemo(() => {
    const fromRows = Array.from(new Set(rows.map((r) => r.warehouse).filter(Boolean)));
    const fromApi = warehouses.filter((w) => w.isActive !== false).map((w) => String(w.name));
    return Array.from(new Set([...fromApi, ...fromRows]));
  }, [rows, warehouses]);

  const enriched = useMemo(
    () =>
      rows.map((r) => {
        const status = statusOf(r.expiryDate);
        return { ...r, status, daysLeft: daysUntil(r.expiryDate) };
      }),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return enriched.filter((r) => {
      if (category !== "all" && r.category !== category) return false;
      if (warehouse !== "all" && r.warehouse !== warehouse) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!q) return true;
      return (
        r.productName.toLowerCase().includes(q) ||
        r.batchNo.toLowerCase().includes(q) ||
        r.productCode.toLowerCase().includes(q)
      );
    });
  }, [enriched, search, category, warehouse, statusFilter]);

  const totals = useMemo(() => {
    const stockValue = enriched.reduce((s, r) => s + r.qty * r.unitPrice, 0);
    const active = enriched.filter((r) => r.status !== "expired").length;
    const expiringSoon = enriched.filter((r) => r.status === "expiring_30" || r.status === "expiring_7").length;
    const expired = enriched.filter((r) => r.status === "expired").length;
    return { stockValue, active, expiringSoon, expired };
  }, [enriched]);

  const { page, setPage, totalPages, paginatedItems } = usePagination(filtered);
  const viewBatch = enriched.find((r) => r.id === viewBatchId) ?? null;

  function persist(next: BatchRow[]) {
    setRows(next);
    saveBatches(next);
  }

  function openAdd() {
    const today = new Date();
    setEditingId(null);
    setForm({
      ...EMPTY_FORM,
      warehouse: warehouseOptions[0] || "",
      purchaseDate: today.toISOString().slice(0, 10),
      mfgDate: today.toISOString().slice(0, 10),
      expiryDate: addDays(today, 180),
      batchNo: "",
      barcode: `8901${Math.floor(100000 + Math.random() * 899999)}`,
    });
    setDialogOpen(true);
  }

  function openEdit(row: BatchRow) {
    const match = stockOptions.find(
      (i) => i.code === row.productCode || i.name === row.productName,
    );
    setEditingId(row.id);
    setForm({
      stockItemId: match?.id || "",
      productName: row.productName,
      productCode: row.productCode,
      batchNo: row.batchNo,
      barcode: row.barcode,
      supplier: row.supplier,
      warehouse: row.warehouse,
      purchaseDate: row.purchaseDate,
      mfgDate: row.mfgDate,
      expiryDate: row.expiryDate,
      qty: row.qty,
      unitPrice: row.unitPrice,
      category: row.category || "General",
    });
    setDialogOpen(true);
  }

  function openView(id: string) {
    setViewBatchId(id);
  }

  function handleDeleteBatch() {
    if (!editingId) return;
    const removed = rows.find((r) => r.id === editingId);
    persist(rows.filter((r) => r.id !== editingId));
    setDialogOpen(false);
    setEditingId(null);
    toast({ title: "Batch deleted", description: removed ? `${removed.batchNo} removed.` : undefined });
  }

  function handleSaveBatch() {
    if (!form.stockItemId || !form.productName.trim() || !form.batchNo.trim() || !form.expiryDate) {
      toast({ title: "Required fields missing", description: "Stock item, batch no. and expiry date are required." });
      return;
    }

    if (editingId) {
      const next = rows.map((r) =>
        r.id === editingId
          ? {
              ...r,
              productName: form.productName.trim(),
              productCode: form.productCode.trim() || r.productCode,
              category: form.category || "General",
              batchNo: form.batchNo.trim(),
              barcode: form.barcode.trim() || r.barcode,
              supplier: form.supplier.trim() || "—",
              warehouse: form.warehouse || warehouseOptions[0] || "Main Warehouse",
              purchaseDate: form.purchaseDate || form.mfgDate,
              mfgDate: form.mfgDate || form.purchaseDate,
              expiryDate: form.expiryDate,
              qty: Number(form.qty) || 0,
              unitPrice: Number(form.unitPrice) || 0,
            }
          : r,
      );
      persist(next);
      setDialogOpen(false);
      setEditingId(null);
      toast({ title: "Batch updated", description: `${form.batchNo.trim()} saved.` });
      return;
    }

    const row: BatchRow = {
      id: `batch-${Date.now()}`,
      productName: form.productName.trim(),
      productCode: form.productCode.trim() || `SKU-${Date.now().toString().slice(-4)}`,
      category: form.category || "General",
      batchNo: form.batchNo.trim(),
      barcode: form.barcode.trim() || `8901${Date.now().toString().slice(-8)}`,
      supplier: form.supplier.trim() || "—",
      warehouse: form.warehouse || warehouseOptions[0] || "Main Warehouse",
      purchaseDate: form.purchaseDate || form.mfgDate,
      mfgDate: form.mfgDate || form.purchaseDate,
      expiryDate: form.expiryDate,
      qty: Number(form.qty) || 0,
      unitPrice: Number(form.unitPrice) || 0,
      imageHue: Math.floor(Math.random() * 360),
    };
    persist([row, ...rows]);
    setDialogOpen(false);
    toast({ title: "Batch added", description: `${row.batchNo} saved.` });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[#2563EB]">Batch & Expiry</h1>
          <p className="mt-1 text-muted-foreground">Track product batches, manufacturing and expiry dates across warehouses.</p>
        </div>
        <Button type="button" className="gap-2 bg-[#2563EB] hover:bg-[#1D4ED8]" onClick={openAdd}>
          <Plus className="h-4 w-4" /> Create Batch
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Total Stock Value"
          value={money(totals.stockValue)}
          icon={Package}
          iconClass="bg-[#DBEAFE] text-[#2563EB]"
        />
        <Kpi
          label="Active Batches"
          value={String(totals.active)}
          icon={Layers}
          iconClass="bg-[#DBEAFE] text-[#2563EB]"
        />
        <Kpi
          label="Expiring Soon"
          value={String(totals.expiringSoon)}
          hint="Within next 30 days"
          icon={Hourglass}
          iconClass="bg-[#FFEDD5] text-[#EA580C]"
        />
        <Kpi
          label="Expired Stock"
          value={String(totals.expired)}
          hint="Immediate action required"
          icon={AlertTriangle}
          iconClass="bg-[#FEE2E2] text-[#DC2626]"
        />
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9CA3AF]" />
          <Input
            className="pl-9"
            placeholder="Search by product or batch no..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <Select value={category} onValueChange={(v) => { setCategory(v); setPage(1); }}>
          <SelectTrigger className="w-full lg:w-40"><SelectValue placeholder="All Categories" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            <SelectItem value="General">General</SelectItem>
          </SelectContent>
        </Select>
        <Select value={warehouse} onValueChange={(v) => { setWarehouse(v); setPage(1); }}>
          <SelectTrigger className="w-full lg:w-44"><SelectValue placeholder="All Warehouses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Warehouses</SelectItem>
            {warehouseOptions.map((w) => (
              <SelectItem key={w} value={w}>{w}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-full lg:w-40"><SelectValue placeholder="All Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="fresh">Fresh</SelectItem>
            <SelectItem value="expiring_30">Expiring Soon</SelectItem>
            <SelectItem value="expiring_7">Expiring in 7 Days</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
          </SelectContent>
        </Select>
        <Button type="button" variant="outline" className="gap-2">
          <Calendar className="h-4 w-4" /> Select Date Range
        </Button>
        <Button type="button" variant="outline" className="gap-2">
          <Filter className="h-4 w-4" /> Filters
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-[#E5E7EB] bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-sm">
              <thead>
                <tr className="border-b border-[#E5E7EB] bg-[#F9FAFB] text-left text-xs uppercase tracking-wide text-[#6B7280]">
                  <th className="px-4 py-3 font-semibold">Product</th>
                  <th className="px-4 py-3 font-semibold">Batch No.</th>
                  <th className="px-4 py-3 font-semibold">Warehouse</th>
                  <th className="px-4 py-3 font-semibold">Mfg. Date</th>
                  <th className="px-4 py-3 font-semibold">Expiry Date</th>
                  <th className="px-4 py-3 font-semibold text-right">Available Qty</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedItems.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-[#6B7280]">
                      No batches found. Click Create Batch to create one.
                    </td>
                  </tr>
                ) : (
                  paginatedItems.map((row) => {
                    const meta = statusMeta(row.status, row.expiryDate);
                    const expiryClass =
                      row.status === "expired"
                        ? "text-[#DC2626] font-medium"
                        : row.status === "expiring_7" || row.status === "expiring_30"
                          ? "text-[#EA580C] font-medium"
                          : "text-[#111827]";
                    return (
                      <tr
                        key={row.id}
                        className="border-b border-[#F3F4F6] hover:bg-[#F8FAFC]"
                      >
                        <td className="px-4 py-3">
                          <div className="min-w-0">
                            <p className="truncate font-medium text-[#111827]">{row.productName}</p>
                            <p className="truncate text-xs text-[#9CA3AF]">{row.productCode}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-medium text-[#111827]">{row.batchNo}</td>
                        <td className="px-4 py-3 text-[#4B5563]">{row.warehouse}</td>
                        <td className="px-4 py-3 text-[#4B5563]">{formatDisplayDate(row.mfgDate)}</td>
                        <td className={cn("px-4 py-3", expiryClass)}>{formatDisplayDate(row.expiryDate)}</td>
                        <td className="px-4 py-3 text-right font-medium text-[#111827]">{row.qty.toLocaleString()}</td>
                        <td className="px-4 py-3">
                          <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold", meta.className)}>
                            {meta.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              className="rounded-md p-1.5 text-[#2563EB] hover:bg-[#EFF6FF]"
                              onClick={() => openView(row.id)}
                              title="View"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              className="rounded-md p-1.5 text-[#6B7280] hover:bg-[#F3F4F6]"
                              title="Edit"
                              onClick={() => openEdit(row)}
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                          </div>
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

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditingId(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Batch" : "Create Batch"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Stock Item *</Label>
              <Select
                value={form.stockItemId}
                onValueChange={(id) => {
                  const item = stockOptions.find((p) => p.id === id);
                  if (!item) return;
                  setForm((f) => ({
                    ...f,
                    stockItemId: item.id,
                    productName: item.name,
                    productCode: item.code,
                    batchNo: item.batchNo || "",
                    unitPrice: item.unitPrice || f.unitPrice,
                    category: item.category || f.category,
                  }));
                }}
                disabled={!stockOptions.length}
              >
                <SelectTrigger>
                  <SelectValue placeholder={stockOptions.length ? "Select stock item" : "No stock items found"} />
                </SelectTrigger>
                <SelectContent>
                  {stockOptions.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Product Code</Label>
              <Input value={form.productCode} readOnly className="bg-[#F9FAFB]" placeholder="SKU" />
            </div>
            <div className="space-y-1.5">
              <Label>Batch No. *</Label>
              <Input value={form.batchNo} onChange={(e) => setForm((f) => ({ ...f, batchNo: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Warehouse</Label>
              <Select value={form.warehouse} onValueChange={(v) => setForm((f) => ({ ...f, warehouse: v }))}>
                <SelectTrigger><SelectValue placeholder="Select warehouse" /></SelectTrigger>
                <SelectContent>
                  {warehouseOptions.map((w) => (
                    <SelectItem key={w} value={w}>{w}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Supplier</Label>
              <Input value={form.supplier} onChange={(e) => setForm((f) => ({ ...f, supplier: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Mfg. Date</Label>
              <Input type="date" value={form.mfgDate} onChange={(e) => setForm((f) => ({ ...f, mfgDate: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Expiry Date *</Label>
              <Input type="date" value={form.expiryDate} onChange={(e) => setForm((f) => ({ ...f, expiryDate: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Available Qty</Label>
              <Input type="number" value={form.qty || ""} onChange={(e) => setForm((f) => ({ ...f, qty: Number(e.target.value) || 0 }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Unit Price (SGD)</Label>
              <Input type="number" step="0.01" value={form.unitPrice || ""} onChange={(e) => setForm((f) => ({ ...f, unitPrice: Number(e.target.value) || 0 }))} />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            {editingId ? (
              <Button type="button" variant="destructive" className="gap-2" onClick={handleDeleteBatch}>
                <Trash2 className="h-4 w-4" /> Delete
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="button" className="bg-[#2563EB] hover:bg-[#1D4ED8]" onClick={handleSaveBatch}>
                {editingId ? "Save Changes" : "Save Batch"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewBatch} onOpenChange={(open) => { if (!open) setViewBatchId(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Batch Details</DialogTitle>
          </DialogHeader>
          {viewBatch && (
            <div className="space-y-4">
              <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold", statusMeta(viewBatch.status, viewBatch.expiryDate).className)}>
                {statusMeta(viewBatch.status, viewBatch.expiryDate).label}
              </span>
              <DetailRow icon={Package} label="Stock Item" value={viewBatch.productName} />
              <DetailRow icon={Layers} label="Batch Number" value={viewBatch.batchNo} />
              <DetailRow
                icon={Barcode}
                label="Barcode"
                value={viewBatch.barcode}
                action={
                  <button
                    type="button"
                    className="text-[#2563EB]"
                    onClick={() => {
                      void navigator.clipboard?.writeText(viewBatch.barcode);
                      toast({ title: "Barcode copied" });
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                }
              />
              <DetailRow icon={Truck} label="Supplier" value={viewBatch.supplier} />
              <DetailRow icon={Warehouse} label="Warehouse" value={viewBatch.warehouse} />
              <DetailRow icon={Calendar} label="Purchase Date" value={formatDisplayDate(viewBatch.purchaseDate)} />
              <DetailRow icon={Calendar} label="Manufacture Date" value={formatDisplayDate(viewBatch.mfgDate)} />
              <DetailRow
                icon={Hourglass}
                label="Expiry Date"
                value={`${formatDisplayDate(viewBatch.expiryDate)}${
                  viewBatch.daysLeft >= 0 ? ` · ${viewBatch.daysLeft} days left` : " · expired"
                }`}
              />
              <DetailRow icon={Package} label="Remaining Qty" value={viewBatch.qty.toLocaleString()} />
              <DialogFooter className="gap-2 sm:justify-between">
                <Button type="button" variant="outline" className="gap-2" onClick={() => setViewBatchId(null)}>
                  Close
                </Button>
                <Button
                  type="button"
                  className="gap-2 bg-[#2563EB] hover:bg-[#1D4ED8]"
                  onClick={() => {
                    setViewBatchId(null);
                    openEdit(viewBatch);
                  }}
                >
                  <Pencil className="h-4 w-4" /> Edit
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value,
  action,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 rounded-md bg-[#EFF6FF] p-1.5 text-[#2563EB]">
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-[#9CA3AF]">{label}</p>
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-[#111827]">{value}</p>
          {action}
        </div>
      </div>
    </div>
  );
}
