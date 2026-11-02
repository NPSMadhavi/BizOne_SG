import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  Package,
  DollarSign,
  Send,
  Search,
  Plus,
  ArrowLeftRight,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { useToast } from "@/hooks/use-toast";
import { useSalesPersons } from "@/hooks/use-sales-persons";
import { inventoryApi } from "@/lib/inventory-api";
import { invalidateInventoryQueries, inventoryQueryKeys } from "@/lib/invalidate-inventory";
import { usePagination } from "@/hooks/use-pagination";
import { ListPagination } from "@/components/list-pagination";
import { cn } from "@/lib/utils";
import {
  InventoryPageHeader,
  InventoryKpiCard,
  InventorySectionCard,
  InventoryStatusBadge,
  formatCurrency,
} from "./inventory-page-ui";

type StockRow = {
  warehouseId: number;
  warehouseName: string;
  stockItemId: number;
  quantity: number;
  itemCode: string;
  itemName: string;
  uom: string;
  unitPrice: number;
  salesPerson?: string | null;
};

type TransferItem = {
  stockItemId: number;
  quantity: number;
  itemCode?: string;
  itemName?: string;
};

type StockTransferRecord = {
  id: number;
  companyId: number;
  transferNumber: string;
  fromWarehouseId: number;
  toWarehouseId: number;
  fromWarehouseName: string;
  toWarehouseName: string;
  transferDate: string;
  remarks?: string | null;
  status: string;
  salesPerson?: string | null;
  items: TransferItem[];
};

const EMPTY_FORM = {
  transferDate: new Date().toISOString().slice(0, 10),
  fromWarehouseId: "",
  toWarehouseId: "",
  stockItemId: "",
  salesPerson: "",
  quantity: "",
  remarks: "",
};

function formatActivityDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    return String(value).slice(0, 10);
  }
  return d.toISOString().slice(0, 10);
}

export default function StockTransferPage() {
  const { toast } = useToast();
  const { salesPersons } = useSalesPersons();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeView, setActiveView] = useState<"all" | "transfers" | "inventory">("all");
  const [warehouseFilter, setWarehouseFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [transferSearch, setTransferSearch] = useState("");
  const [transferWarehouseFilter, setTransferWarehouseFilter] = useState<string>("all");
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState(() => new Date());

  const dashboardQuery = useQuery({
    queryKey: inventoryQueryKeys.dashboard,
    queryFn: () => inventoryApi.getDashboard(),
  });

  const warehousesQuery = useQuery({
    queryKey: inventoryQueryKeys.warehouses,
    queryFn: () => inventoryApi.getWarehouses(),
  });

  const stockQuery = useQuery({
    queryKey: inventoryQueryKeys.currentStock,
    queryFn: () => inventoryApi.getCurrentStockReport(),
  });

  const transfersQuery = useQuery({
    queryKey: inventoryQueryKeys.stockTransfers,
    queryFn: () => inventoryApi.getStockTransfers(),
  });

  const warehouses = warehousesQuery.data ?? [];
  const stockRows = (stockQuery.data ?? []) as StockRow[];
  const transfers = (transfersQuery.data ?? []) as StockTransferRecord[];

  // Filtered Stock Inventory
  const filteredStock = useMemo(() => {
    const q = search.trim().toLowerCase();
    const whId = warehouseFilter !== "all" ? Number(warehouseFilter) : null;
    return stockRows
      .filter((row) => Number(row.quantity) > 0)
      .filter((row) => (whId ? row.warehouseId === whId : true))
      .filter((row) => {
        if (!q) return true;
        return (
          String(row.itemCode || "").toLowerCase().includes(q)
          || String(row.itemName || "").toLowerCase().includes(q)
          || String(row.warehouseName || "").toLowerCase().includes(q)
          || String(row.salesPerson || "").toLowerCase().includes(q)
        );
      });
  }, [stockRows, search, warehouseFilter]);

  // Filtered Stock Transfers
  const filteredTransfers = useMemo(() => {
    const q = transferSearch.trim().toLowerCase();
    const whId = transferWarehouseFilter !== "all" ? Number(transferWarehouseFilter) : null;
    return transfers
      .filter((tr) => {
        if (!whId) return true;
        return tr.fromWarehouseId === whId || tr.toWarehouseId === whId;
      })
      .filter((tr) => {
        if (!q) return true;
        const inItems = tr.items?.some(
          (it) =>
            String(it.itemCode || "").toLowerCase().includes(q)
            || String(it.itemName || "").toLowerCase().includes(q)
        );
        return (
          String(tr.transferNumber || "").toLowerCase().includes(q)
          || String(tr.fromWarehouseName || "").toLowerCase().includes(q)
          || String(tr.toWarehouseName || "").toLowerCase().includes(q)
          || String(tr.salesPerson || "").toLowerCase().includes(q)
          || String(tr.remarks || "").toLowerCase().includes(q)
          || inItems
        );
      });
  }, [transfers, transferSearch, transferWarehouseFilter]);

  const {
    page: stockPage,
    setPage: setStockPage,
    totalPages: stockTotalPages,
    paginatedItems: paginatedStock,
  } = usePagination(filteredStock);

  const {
    page: transferPage,
    setPage: setTransferPage,
    totalPages: transferTotalPages,
    paginatedItems: paginatedTransfers,
  } = usePagination(filteredTransfers);

  const sourceItems = useMemo(() => {
    const fromId = Number(form.fromWarehouseId);
    if (!fromId) return [] as StockRow[];
    return stockRows.filter(
      (row) => row.warehouseId === fromId && Number(row.quantity) > 0,
    );
  }, [stockRows, form.fromWarehouseId]);

  const selectedSourceItem = sourceItems.find(
    (row) => String(row.stockItemId) === form.stockItemId,
  );

  async function refreshAll() {
    await invalidateInventoryQueries(queryClient);
    await Promise.all([
      dashboardQuery.refetch(),
      warehousesQuery.refetch(),
      stockQuery.refetch(),
      transfersQuery.refetch(),
    ]);
    setLastRefreshed(new Date());
  }

  function resetForm() {
    setForm({
      ...EMPTY_FORM,
      transferDate: new Date().toISOString().slice(0, 10),
    });
  }

  async function handleTransfer() {
    const fromWarehouseId = Number(form.fromWarehouseId);
    const toWarehouseId = Number(form.toWarehouseId);
    const stockItemId = Number(form.stockItemId);
    const quantity = Number(form.quantity);

    if (!fromWarehouseId || !toWarehouseId) {
      toast({
        title: "Select warehouses",
        description: "Choose both source and destination warehouses.",
        variant: "destructive",
      });
      return;
    }
    if (fromWarehouseId === toWarehouseId) {
      toast({
        title: "Invalid warehouses",
        description: "From and To warehouse must be different.",
        variant: "destructive",
      });
      return;
    }
    if (!stockItemId) {
      toast({
        title: "Select item",
        description: "Choose a stock item from the source warehouse.",
        variant: "destructive",
      });
      return;
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      toast({
        title: "Invalid quantity",
        description: "Enter a transfer quantity greater than zero.",
        variant: "destructive",
      });
      return;
    }
    if (selectedSourceItem && quantity > Number(selectedSourceItem.quantity)) {
      toast({
        title: "Insufficient stock",
        description: `Only ${selectedSourceItem.quantity} available in ${selectedSourceItem.warehouseName}.`,
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      await inventoryApi.createStockTransfer({
        fromWarehouseId,
        toWarehouseId,
        transferDate: form.transferDate,
        remarks: form.remarks || undefined,
        salesPerson: form.salesPerson || undefined,
        items: [{ stockItemId, quantity }],
      });
      toast({
        title: "Stock transferred successfully",
        description: `Transferred ${quantity} ${selectedSourceItem?.uom || "Pcs"} to destination warehouse.`,
      });
      resetForm();
      setDialogOpen(false);
      await refreshAll();
    } catch (e: any) {
      toast({
        title: "Transfer failed",
        description: e.message || "Could not transfer stock",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  const dash = dashboardQuery.data;
  const refreshedLabel = lastRefreshed.toLocaleTimeString();

  return (
    <div className="space-y-6">
      <InventoryPageHeader
        title="Stock Transfer & Warehouse Management"
        action={
          <Button
            onClick={() => setDialogOpen(true)}
            className="gap-2 bg-[#1265d8] hover:bg-[#0d55b8] shadow-sm h-9"
          >
            <Plus className="h-4 w-4" /> Create Stock Transfer
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <InventoryKpiCard
          label="Total Warehouses"
          value={dash?.totalWarehouses ?? warehouses.length}
          icon={Building2}
          tone="blue"
        />
        <InventoryKpiCard
          label="Stock Transfers"
          value={transfers.length}
          icon={ArrowLeftRight}
          tone="purple"
        />
        <InventoryKpiCard
          label="Total Stock Items"
          value={dash?.totalItems ?? 0}
          icon={Package}
          tone="green"
        />
        <InventoryKpiCard
          label="Total Stock Value"
          value={formatCurrency(Number(dash?.totalStockValue ?? 0))}
          icon={DollarSign}
          tone="orange"
        />
      </div>

      {/* View Switcher Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E5E7EB] pb-3">
        <div className="flex items-center gap-1.5 bg-[#F3F4F6] p-1 rounded-lg text-xs font-medium">
          <button
            type="button"
            onClick={() => setActiveView("all")}
            className={cn(
              "px-3 py-1.5 rounded-md transition-colors",
              activeView === "all"
                ? "bg-white text-[#111827] shadow-sm font-semibold"
                : "text-[#6B7280] hover:text-[#111827]"
            )}
          >
            All Sections
          </button>
          <button
            type="button"
            onClick={() => setActiveView("transfers")}
            className={cn(
              "px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5",
              activeView === "transfers"
                ? "bg-white text-[#111827] shadow-sm font-semibold"
                : "text-[#6B7280] hover:text-[#111827]"
            )}
          >
            <ArrowLeftRight className="h-3.5 w-3.5" />
            Stock Transfers
            <span className="rounded-full bg-[#EDE9FE] px-1.5 py-0.2 text-[10px] font-bold text-[#7C3AED]">
              {transfers.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveView("inventory")}
            className={cn(
              "px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5",
              activeView === "inventory"
                ? "bg-white text-[#111827] shadow-sm font-semibold"
                : "text-[#6B7280] hover:text-[#111827]"
            )}
          >
            <Package className="h-3.5 w-3.5" />
            Item Inventory
            <span className="rounded-full bg-[#DEF7EC] px-1.5 py-0.2 text-[10px] font-bold text-[#0E9F6E]">
              {filteredStock.length}
            </span>
          </button>
        </div>
        <p className="text-xs text-[#6B7280]">
          Last refreshed: <span className="font-medium text-[#111827]">{refreshedLabel}</span>
        </p>
      </div>

      <div className="space-y-6">
        {/* Section 1: Stock Transfers Table */}
        {(activeView === "all" || activeView === "transfers") && (
          <InventorySectionCard
            title="Stock Transfers"
            subtitle="Records of all inventory transfers between warehouses."
          >
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Select value={transferWarehouseFilter} onValueChange={setTransferWarehouseFilter}>
                <SelectTrigger className="h-10 w-full sm:w-[200px] shrink-0">
                  <SelectValue placeholder="All Warehouses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Warehouses</SelectItem>
                  {warehouses.map((wh: any) => (
                    <SelectItem key={wh.id} value={String(wh.id)}>
                      {wh.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9CA3AF]" />
                <Input
                  className="h-10 pl-9"
                  placeholder="Search transfer #, warehouse, item, or remarks..."
                  value={transferSearch}
                  onChange={(e) => setTransferSearch(e.target.value)}
                />
              </div>
            </div>

            <div className="overflow-x-auto -mx-5 -mb-5">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-y border-[#E5E7EB] bg-[#F9FAFB] text-left text-xs font-semibold uppercase tracking-wide text-[#6B7280]">
                    <th className="px-5 py-3">Transfer #</th>
                    <th className="px-5 py-3">Date</th>
                    <th className="px-5 py-3">From Warehouse</th>
                    <th className="px-5 py-3">To Warehouse</th>
                    <th className="px-5 py-3">Transferred Items</th>
                    <th className="px-5 py-3">Sales Person</th>
                    <th className="px-5 py-3">Remarks</th>
                    <th className="px-5 py-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {transfersQuery.isLoading ? (
                    <tr>
                      <td colSpan={8} className="px-5 py-8 text-center text-muted-foreground">
                        Loading stock transfers…
                      </td>
                    </tr>
                  ) : filteredTransfers.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-5 py-8 text-center text-muted-foreground">
                        No stock transfers recorded yet. Click &quot;Create Stock Transfer&quot; to transfer items.
                      </td>
                    </tr>
                  ) : (
                    paginatedTransfers.map((tr) => (
                      <tr
                        key={tr.id}
                        className="border-b border-[#F3F4F6] last:border-0 hover:bg-[#F9FAFB]/60 transition-colors"
                      >
                        <td className="px-5 py-3 font-semibold text-[#1265d8]">
                          {tr.transferNumber}
                        </td>
                        <td className="px-5 py-3 text-[#374151]">
                          {formatActivityDate(tr.transferDate)}
                        </td>
                        <td className="px-5 py-3 text-[#374151] font-medium">
                          {tr.fromWarehouseName}
                        </td>
                        <td className="px-5 py-3 text-[#374151] font-medium">
                          <div className="flex items-center gap-1.5">
                            <ArrowRight className="h-3.5 w-3.5 text-[#9CA3AF] shrink-0" />
                            <span>{tr.toWarehouseName}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-[#111827]">
                          {tr.items && tr.items.length > 0 ? (
                            <div className="space-y-1">
                              {tr.items.map((it, idx) => (
                                <div key={idx} className="flex items-center gap-1.5 text-xs">
                                  <span className="font-semibold text-[#111827]">{it.itemCode}</span>
                                  <span className="text-[#6B7280]">({it.itemName})</span>
                                  <span className="ml-auto font-bold text-[#0E9F6E]">
                                    {it.quantity} Pcs
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="text-[#9CA3AF]">—</span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-[#374151]">
                          {tr.salesPerson || "—"}
                        </td>
                        <td className="px-5 py-3 text-[#6B7280] max-w-[200px] truncate" title={tr.remarks || ""}>
                          {tr.remarks || "—"}
                        </td>
                        <td className="px-5 py-3 text-center">
                          <InventoryStatusBadge status={tr.status || "Completed"} />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              <ListPagination
                page={transferPage}
                totalPages={transferTotalPages}
                onPageChange={setTransferPage}
              />
            </div>
          </InventorySectionCard>
        )}

        {/* Section 2: Item Inventory Table */}
        {(activeView === "all" || activeView === "inventory") && (
          <InventorySectionCard
            title="Item Inventory"
            subtitle="Per-warehouse qty from warehouse_stock (updated when Tax Invoice or Transfer is saved)."
          >
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Select value={warehouseFilter} onValueChange={setWarehouseFilter}>
                <SelectTrigger className="h-10 w-full sm:w-[200px] shrink-0">
                  <SelectValue placeholder="All Warehouses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Warehouses</SelectItem>
                  {warehouses.map((wh: any) => (
                    <SelectItem key={wh.id} value={String(wh.id)}>
                      {wh.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9CA3AF]" />
                <Input
                  className="h-10 pl-9"
                  placeholder="Search item code or name..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>

            <div className="overflow-x-auto -mx-5 -mb-5">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-y border-[#E5E7EB] bg-[#F9FAFB] text-left text-xs font-semibold uppercase tracking-wide text-[#6B7280]">
                    <th className="px-5 py-3">Item Code</th>
                    <th className="px-5 py-3">Item Name</th>
                    <th className="px-5 py-3">Warehouse</th>
                    <th className="px-5 py-3">Sales Person</th>
                    <th className="px-5 py-3">Availability</th>
                    <th className="px-5 py-3">Unit</th>
                    <th className="px-5 py-3 text-right">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {stockQuery.isLoading ? (
                    <tr>
                      <td colSpan={7} className="px-5 py-8 text-center text-muted-foreground">
                        Loading inventory…
                      </td>
                    </tr>
                  ) : filteredStock.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-5 py-8 text-center text-muted-foreground">
                        No warehouse stock found.
                      </td>
                    </tr>
                  ) : (
                    paginatedStock.map((row) => (
                      <tr
                        key={`${row.warehouseId}-${row.stockItemId}`}
                        className="border-b border-[#F3F4F6] last:border-0 hover:bg-[#F9FAFB]/60 transition-colors"
                      >
                        <td className="px-5 py-3 font-medium text-[#111827]">{row.itemCode}</td>
                        <td className="px-5 py-3 text-[#374151]">{row.itemName}</td>
                        <td className="px-5 py-3 text-[#374151]">{row.warehouseName}</td>
                        <td className="px-5 py-3 text-[#374151]">{row.salesPerson || "—"}</td>
                        <td className="px-5 py-3 font-semibold text-[#0E9F6E]">
                          {Number(row.quantity)} {row.uom || "Pcs"}
                        </td>
                        <td className="px-5 py-3 text-[#6B7280]">{row.uom || "Pcs"}</td>
                        <td className="px-5 py-3 text-right text-[#111827]">
                          {formatCurrency(Number(row.quantity) * Number(row.unitPrice || 0))}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              <ListPagination
                page={stockPage}
                totalPages={stockTotalPages}
                onPageChange={setStockPage}
              />
            </div>
          </InventorySectionCard>
        )}
      </div>

      {/* Popup Modal / Dialog for Create Stock Transfer */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-[#132d52] flex items-center gap-2">
              <ArrowLeftRight className="h-5 w-5 text-[#1265d8]" />
              Create Stock Transfer
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Transfer Date</Label>
              <Input
                type="date"
                value={form.transferDate}
                onChange={(e) => setForm((f) => ({ ...f, transferDate: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">From Warehouse *</Label>
                <Select
                  value={form.fromWarehouseId || undefined}
                  onValueChange={(value) =>
                    setForm((f) => ({
                      ...f,
                      fromWarehouseId: value,
                      stockItemId: "",
                      quantity: "",
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select source" />
                  </SelectTrigger>
                  <SelectContent>
                    {warehouses.map((wh: any) => (
                      <SelectItem key={wh.id} value={String(wh.id)}>
                        {wh.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">To Warehouse *</Label>
                <Select
                  value={form.toWarehouseId || undefined}
                  onValueChange={(value) => setForm((f) => ({ ...f, toWarehouseId: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select destination" />
                  </SelectTrigger>
                  <SelectContent>
                    {warehouses
                      .filter((wh: any) => String(wh.id) !== form.fromWarehouseId)
                      .map((wh: any) => (
                        <SelectItem key={wh.id} value={String(wh.id)}>
                          {wh.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Item *</Label>
                <Select
                  value={form.stockItemId || undefined}
                  onValueChange={(value) => setForm((f) => ({ ...f, stockItemId: value }))}
                  disabled={!form.fromWarehouseId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={form.fromWarehouseId ? "Select stock item" : "Select from warehouse first"} />
                  </SelectTrigger>
                  <SelectContent>
                    {sourceItems.map((row) => (
                      <SelectItem key={row.stockItemId} value={String(row.stockItemId)}>
                        {row.itemCode} — {row.itemName} ({row.quantity} {row.uom || "Pcs"})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedSourceItem ? (
                  <p className="text-[11px] text-[#0E9F6E]">
                    Available: {selectedSourceItem.quantity} {selectedSourceItem.uom || "Pcs"}
                  </p>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Transfer Qty *</Label>
                <Input
                  type="number"
                  min={0}
                  step="any"
                  placeholder="Enter quantity"
                  value={form.quantity}
                  onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Sales Person</Label>
              <Select
                value={form.salesPerson || ""}
                onValueChange={(value) => setForm((f) => ({ ...f, salesPerson: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select Sales Person" />
                </SelectTrigger>
                <SelectContent>
                  {salesPersons.map((sp) => (
                    <SelectItem key={sp.id} value={sp.name}>
                      {sp.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Remarks</Label>
              <Textarea
                placeholder="Stock transfer remarks..."
                rows={2}
                value={form.remarks}
                onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setDialogOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button type="button" size="sm" className="gap-2 bg-[#1265d8] hover:bg-[#0d55b8]" onClick={() => void handleTransfer()} disabled={saving}>
                <Send className="h-3.5 w-3.5" />
                {saving ? "Transferring…" : "Transfer"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
