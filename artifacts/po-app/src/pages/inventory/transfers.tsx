import { useEffect, useMemo, useState } from "react";
import { useListStockItems } from "@workspace/api-client-react";
import { inventoryApi } from "@/lib/inventory-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Warehouse,
  Package,
  AlertTriangle,
  Send,
  Search,
  Filter,
} from "lucide-react";
import {
  InventoryPageHeader,
  InventoryKpiCard,
  InventorySectionCard,
  InventoryStatusBadge,
  formatCurrency,
} from "./inventory-page-ui";

const LOW_STOCK_THRESHOLD = 20;

export default function TransfersPage() {
  const { toast } = useToast();
  const [dashboard, setDashboard] = useState<any>(null);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [transfers, setTransfers] = useState<any[]>([]);
  const [stock, setStock] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [warehouseFilter, setWarehouseFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({
    transferDate: new Date().toISOString().slice(0, 10),
    fromWarehouseId: "",
    toWarehouseId: "",
    stockItemId: "",
    quantity: "",
    remarks: "",
  });

  const { data: items = [] } = useListStockItems({} as any);

  async function load() {
    setLoading(true);
    try {
      const [dash, wh, tr, st] = await Promise.all([
        inventoryApi.getDashboard(),
        inventoryApi.getWarehouses(),
        inventoryApi.getTransfers(),
        inventoryApi.getCurrentStockReport(),
      ]);
      setDashboard(dash);
      setWarehouses(wh);
      setTransfers(tr);
      setStock(st);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const warehouseMap = useMemo(
    () => Object.fromEntries(warehouses.map((w) => [w.id, w])),
    [warehouses],
  );

  const mainWarehouseId = useMemo(() => {
    const main =
      warehouses.find((w) => w.isDefault) ||
      warehouses.find((w) => String(w.name).toLowerCase() === "main warehouse") ||
      warehouses[0];
    return main ? String(main.id) : "";
  }, [warehouses]);

  function resolveWarehouseId(selectedId: string) {
    return selectedId || mainWarehouseId;
  }

  const aggregateRows = (rows: any[]) => {
    const map = new Map<string, any>();
    for (const row of rows) {
      const key = String(row.stockItemId ?? `${row.itemCode}:${row.itemName}`);
      const existing = map.get(key);
      const qty = Number(row.quantity);
      if (existing) {
        existing.quantity += qty;
      } else {
        map.set(key, { ...row, quantity: qty });
      }
    }
    return Array.from(map.values());
  };

  const filteredStock = useMemo(() => {
    let rows = stock;
    if (warehouseFilter !== "all") {
      rows = rows.filter((r) => String(r.warehouseId) === warehouseFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(
        (r) =>
          String(r.itemCode ?? "").toLowerCase().includes(q) ||
          String(r.itemName ?? "").toLowerCase().includes(q),
      );
    }
    // Filter out items with 0 quantity
    rows = rows.filter((r) => Number(r.quantity) > 0);
    
    if (warehouseFilter === "all") {
      return aggregateRows(rows);
    }
    return rows;
  }, [stock, warehouseFilter, search]);

  const lowStockCount = useMemo(() => {
    return filteredStock.filter((r) => {
      const qty = Number(r.quantity);
      return qty > 0 && qty < LOW_STOCK_THRESHOLD;
    }).length;
  }, [filteredStock]);

  const effectiveFromWarehouseId = resolveWarehouseId(form.fromWarehouseId);

  const selectedAvailability = useMemo(() => {
    if (!effectiveFromWarehouseId || !form.stockItemId) return null;
    const row = stock.find(
      (r) =>
        String(r.warehouseId) === effectiveFromWarehouseId &&
        String(r.stockItemId) === form.stockItemId,
    );
    return row ? Number(row.quantity) : 0;
  }, [stock, effectiveFromWarehouseId, form.stockItemId]);

  const fromWarehouseName =
    warehouseMap[Number(effectiveFromWarehouseId)]?.name || "Source warehouse";

  async function handleTransfer() {
    if (!form.stockItemId) {
      toast({
        title: "Missing fields",
        description: "Item is required.",
        variant: "destructive",
      });
      return;
    }
    const fromWarehouseId = resolveWarehouseId(form.fromWarehouseId);
    const toWarehouseId = resolveWarehouseId(form.toWarehouseId);
    if (!fromWarehouseId || !toWarehouseId) {
      toast({
        title: "Missing warehouse",
        description: "No Main Warehouse found. Please select From and To warehouse.",
        variant: "destructive",
      });
      return;
    }
    if (fromWarehouseId === toWarehouseId) {
      toast({
        title: "Invalid transfer",
        description: "From and to warehouse must be different.",
        variant: "destructive",
      });
      return;
    }
    const qty = Number(form.quantity);
    if (!qty || qty <= 0) {
      toast({
        title: "Invalid quantity",
        description: "Enter a valid transfer quantity.",
        variant: "destructive",
      });
      return;
    }
    if (selectedAvailability != null && qty > selectedAvailability) {
      toast({
        title: "Insufficient stock",
        description: `Only ${selectedAvailability} available in ${fromWarehouseName}.`,
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      await inventoryApi.createTransfer({
        fromWarehouseId: Number(fromWarehouseId),
        toWarehouseId: Number(toWarehouseId),
        transferDate: form.transferDate,
        remarks: form.remarks,
        items: [{ stockItemId: Number(form.stockItemId), quantity: qty }],
      });
      toast({ title: "Transfer completed", description: "Stock transferred successfully." });
      setForm({
        transferDate: new Date().toISOString().slice(0, 10),
        fromWarehouseId: "",
        toWarehouseId: "",
        stockItemId: "",
        quantity: "",
        remarks: "",
      });
      load();
    } catch (e: any) {
      toast({ title: "Transfer failed", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  if (loading && !dashboard) {
    return <div className="py-16 text-center text-[#6B7280]">Loading warehouse management...</div>;
  }

  return (
    <div className="space-y-6 pb-8">
      <InventoryPageHeader
        title="Warehouse Management"
        subtitle="Manage stock availability and transfer inventory between warehouses."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <InventoryKpiCard
          label="Total Warehouses"
          value={dashboard?.totalWarehouses ?? 0}
          icon={Warehouse}
          tone="blue"
        />
        <InventoryKpiCard
          label="Total Stock Items"
          value={dashboard?.totalItems ?? 0}
          icon={Package}
          tone="green"
        />
        <InventoryKpiCard
          label="Total Stock Value"
          value={formatCurrency(Number(dashboard?.totalStockValue ?? 0))}
          icon={Package}
          tone="purple"
        />
        <InventoryKpiCard
          label="Low Stock Items"
          value={lowStockCount}
          icon={AlertTriangle}
          tone="orange"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <InventorySectionCard title="Item Inventory">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Select value={warehouseFilter} onValueChange={setWarehouseFilter}>
                <SelectTrigger className="sm:w-56">
                  <SelectValue placeholder="All Warehouses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Warehouses</SelectItem>
                  {warehouses.map((w) => (
                    <SelectItem key={w.id} value={String(w.id)}>
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9CA3AF]" />
                <Input
                  className="pl-10"
                  placeholder="Search item code or name..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Button variant="outline" size="icon" aria-label="Filter">
                <Filter className="h-4 w-4" />
              </Button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-[#6B7280]">
                    <th className="py-3 pr-4">Item Code</th>
                    <th className="py-3 pr-4">Item Name</th>
                    <th className="py-3 pr-4 text-right">Availability</th>
                    <th className="py-3 pr-4">Unit</th>
                    <th className="py-3 text-right">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStock.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-[#6B7280]">
                        No stock items found.
                      </td>
                    </tr>
                  ) : (
                    filteredStock.slice(0, 10).map((row, idx) => {
                      const value = Number(row.quantity) * Number(row.unitPrice ?? 0);
                      return (
                        <tr key={`${row.warehouseId}-${row.stockItemId}-${idx}`} className="border-b border-[#F3F4F6]">
                          <td className="py-3 pr-4 font-medium text-[#111827]">{row.itemCode}</td>
                          <td className="py-3 pr-4 text-[#444651]">{row.itemName}</td>
                          <td className="py-3 pr-4 text-right font-semibold text-[#0E9F6E]">
                            {Number(row.quantity).toFixed(0)} {row.uom || "Nos"}
                          </td>
                          <td className="py-3 pr-4 text-[#6B7280]">{row.uom || "Nos"}</td>
                          <td className="py-3 text-right text-[#111827]">{formatCurrency(value)}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </InventorySectionCard>

          <InventorySectionCard title="Recent Stock Transfers">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-[#6B7280]">
                    <th className="py-3 pr-4">Transfer No.</th>
                    <th className="py-3 pr-4">Date</th>
                    <th className="py-3 pr-4">From Warehouse</th>
                    <th className="py-3 pr-4">To Warehouse</th>
                    <th className="py-3 pr-4">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {transfers.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-[#6B7280]">
                        No transfers yet.
                      </td>
                    </tr>
                  ) : (
                    transfers.slice(0, 8).map((t) => (
                      <tr key={t.id} className="border-b border-[#F3F4F6]">
                        <td className="py-3 pr-4 font-mono text-[#111827]">{t.transferNumber}</td>
                        <td className="py-3 pr-4 text-[#444651]">{t.transferDate}</td>
                        <td className="py-3 pr-4">{warehouseMap[t.fromWarehouseId]?.name || `#${t.fromWarehouseId}`}</td>
                        <td className="py-3 pr-4">{warehouseMap[t.toWarehouseId]?.name || `#${t.toWarehouseId}`}</td>
                        <td className="py-3 pr-4">
                          <InventoryStatusBadge status={t.status || "completed"} />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </InventorySectionCard>
        </div>

        <InventorySectionCard title="Stock Transfer">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Date</Label>
              <Input
                type="date"
                value={form.transferDate}
                onChange={(e) => setForm((f) => ({ ...f, transferDate: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>From Warehouse</Label>
              <Select
                value={form.fromWarehouseId || undefined}
                onValueChange={(v) => setForm((f) => ({ ...f, fromWarehouseId: v, stockItemId: "" }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Main Warehouse (default)" />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.map((w) => (
                    <SelectItem key={w.id} value={String(w.id)}>
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>To Warehouse</Label>
              <Select
                value={form.toWarehouseId || undefined}
                onValueChange={(v) => setForm((f) => ({ ...f, toWarehouseId: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Main Warehouse (default)" />
                </SelectTrigger>
                <SelectContent>
                  {warehouses
                    .filter((w) => String(w.id) !== (form.fromWarehouseId || mainWarehouseId))
                    .map((w) => (
                      <SelectItem key={w.id} value={String(w.id)}>
                        {w.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Item</Label>
              <Select
                value={form.stockItemId || undefined}
                onValueChange={(v) => setForm((f) => ({ ...f, stockItemId: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select item" />
                </SelectTrigger>
                <SelectContent>
                  {items
                    .filter((i: any) => {
                      if (i.type !== "product") return false;
                      // Only show items that have stock in the effective source warehouse
                      if (!effectiveFromWarehouseId) return true;
                      const itemStock = stock.find((s: any) =>
                        String(s.warehouseId) === effectiveFromWarehouseId && String(s.stockItemId) === String(i.id)
                      );
                      return itemStock && Number(itemStock.quantity) > 0;
                    })
                    .map((i: any) => (
                      <SelectItem key={i.id} value={String(i.id)}>
                        {i.name} ({i.code})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {effectiveFromWarehouseId && form.stockItemId ? (
              <div className="rounded-lg border border-[#BFDBFE] bg-[#EFF6FF] px-4 py-3 text-sm text-[#1D4ED8]">
                Availability ({fromWarehouseName}):{" "}
                <strong>
                  {selectedAvailability ?? 0} Nos
                </strong>
              </div>
            ) : null}

            <div className="space-y-2">
              <Label>Transfer Qty</Label>
              <Input
                type="number"
                min="0"
                step="1"
                placeholder="Enter quantity"
                value={form.quantity}
                onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Remarks</Label>
              <Textarea
                rows={3}
                placeholder="Stock transfer remarks..."
                value={form.remarks}
                onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))}
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() =>
                  setForm({
                    transferDate: new Date().toISOString().slice(0, 10),
                    fromWarehouseId: "",
                    toWarehouseId: "",
                    stockItemId: "",
                    quantity: "",
                    remarks: "",
                  })
                }
              >
                Cancel
              </Button>
              <Button
                className="flex-1 gap-2 bg-[#2563EB] hover:bg-[#1D4ED8]"
                onClick={handleTransfer}
                disabled={saving}
              >
                <Send className="h-4 w-4" />
                {saving ? "Transferring..." : "Transfer"}
              </Button>
            </div>
          </div>
        </InventorySectionCard>
      </div>
    </div>
  );
}
