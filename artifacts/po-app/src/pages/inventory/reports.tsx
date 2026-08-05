import { useEffect, useMemo, useState } from "react";
import { inventoryApi, exportCsv } from "@/lib/inventory-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Package,
  Boxes,
  AlertTriangle,
  XCircle,
  Download,
  Printer,
  Filter,
  Search,
} from "lucide-react";
import {
  InventoryPageHeader,
  InventoryKpiCard,
  InventorySectionCard,
  formatCurrency,
} from "./inventory-page-ui";

const LOW_STOCK_THRESHOLD = 20;

export default function ReportsPage() {
  const [stock, setStock] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [warehouseFilter, setWarehouseFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [asOnDate, setAsOnDate] = useState(new Date().toISOString().slice(0, 10));
  const [reportType, setReportType] = useState("detailed");

  useEffect(() => {
    Promise.all([
      inventoryApi.getWarehouses(),
      inventoryApi.getCurrentStockReport(),
    ]).then(([wh, rows]) => {
      setWarehouses(wh);
      setStock(rows);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const whId = warehouseFilter === "all" ? undefined : Number(warehouseFilter);
    inventoryApi.getCurrentStockReport(whId).then(setStock).catch(() => {});
  }, [warehouseFilter]);

  const filtered = useMemo(() => {
    if (!search.trim()) return stock;
    const q = search.toLowerCase();
    return stock.filter(
      (r) =>
        String(r.itemCode ?? "").toLowerCase().includes(q) ||
        String(r.itemName ?? "").toLowerCase().includes(q),
    );
  }, [stock, search]);

  const totals = useMemo(() => {
    let qty = 0;
    let value = 0;
    for (const row of filtered) {
      qty += Number(row.quantity);
      value += Number(row.quantity) * Number(row.unitPrice ?? 0);
    }
    return { qty, value };
  }, [filtered]);

  const aggregatedProducts = useMemo(() => {
    const map = new Map<string, any>();
    for (const row of filtered) {
      const key = String(row.stockItemId ?? row.itemCode ?? `${row.itemCode}:${row.itemName}`);
      const qty = Number(row.quantity);
      const existing = map.get(key);
      if (existing) {
        existing.quantity += qty;
      } else {
        map.set(key, { ...row, quantity: qty });
      }
    }
    return Array.from(map.values());
  }, [filtered]);

  const inStockProducts = useMemo(
    () => aggregatedProducts.filter((r) => Number(r.quantity) > 0),
    [aggregatedProducts],
  );

  const lowStockItems = useMemo(
    () =>
      aggregatedProducts.filter((r) => {
        const qty = Number(r.quantity);
        return qty > 0 && qty < LOW_STOCK_THRESHOLD;
      }),
    [aggregatedProducts],
  );

  const outOfStockItems = useMemo(
    () => aggregatedProducts.filter((r) => Number(r.quantity) <= 0),
    [aggregatedProducts],
  );

  const topValueItems = useMemo(
    () =>
      [...aggregatedProducts]
        .map((r) => ({
          ...r,
          stockValue: Number(r.quantity) * Number(r.unitPrice ?? 0),
        }))
        .sort((a, b) => b.stockValue - a.stockValue)
        .slice(0, 5),
    [aggregatedProducts],
  );

  function handlePrint() {
    window.print();
  }

  return (
    <div className="space-y-6 pb-8">
      <InventoryPageHeader
        title="Complete Stock Report"
        subtitle="View current stock availability, value and low-stock alerts across warehouses."
        action={
          <>
            <Button variant="outline" className="gap-2" onClick={() => exportCsv("complete-stock-report.csv", filtered)}>
              <Download className="h-4 w-4" /> Export
            </Button>
            <Button variant="outline" className="gap-2" onClick={handlePrint}>
              <Printer className="h-4 w-4" /> Print
            </Button>
          </>
        }
      />

      <InventorySectionCard>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-[#6B7280]">Warehouse</p>
            <Select value={warehouseFilter} onValueChange={setWarehouseFilter}>
              <SelectTrigger>
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
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-[#6B7280]">As On Date</p>
            <Input type="date" value={asOnDate} onChange={(e) => setAsOnDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-[#6B7280]">Report Type</p>
            <Select value={reportType} onValueChange={setReportType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="detailed">Detailed</SelectItem>
                <SelectItem value="summary">Summary</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <p className="text-xs font-medium text-[#6B7280]">Search</p>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9CA3AF]" />
              <Input
                className="pl-10"
                placeholder="Search item code or name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>
      </InventorySectionCard>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <InventoryKpiCard label="Total Stock Items" value={aggregatedProducts.length} icon={Package} tone="purple" />
        <InventoryKpiCard label="Total Quantity" value={totals.qty.toFixed(0)} icon={Boxes} tone="green" />
        <InventoryKpiCard label="Total Stock Value" value={formatCurrency(totals.value)} icon={Package} tone="blue" />
        <InventoryKpiCard label="Low Stock Items" value={lowStockItems.length} icon={AlertTriangle} tone="orange" />
        <InventoryKpiCard label="Out of Stock Items" value={outOfStockItems.length} icon={XCircle} tone="red" />
      </div>

      <InventorySectionCard
        title="Stock Items Details"
        action={
          <Button variant="outline" size="sm" className="gap-2">
            <Filter className="h-4 w-4" /> Filter
          </Button>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-[#6B7280]">
                <th className="py-3 pr-3">#</th>
                <th className="py-3 pr-3">Item Code</th>
                <th className="py-3 pr-3">Item Name</th>
                <th className="py-3 pr-3">Unit</th>
                <th className="py-3 pr-3 text-right">Availability</th>
                <th className="py-3 text-right">Stock Value</th>
              </tr>
            </thead>
            <tbody>
              {aggregatedProducts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-[#6B7280]">
                    No stock records found.
                  </td>
                </tr>
              ) : (
                aggregatedProducts.map((row, idx) => {
                  const value = Number(row.quantity) * Number(row.unitPrice ?? 0);
                  return (
                    <tr key={`${row.stockItemId ?? row.itemCode}-${idx}`} className="border-b border-[#F3F4F6]">
                      <td className="py-3 pr-3 text-[#6B7280]">{idx + 1}</td>
                      <td className="py-3 pr-3 font-medium text-[#111827]">{row.itemCode}</td>
                      <td className="py-3 pr-3 text-[#444651]">{row.itemName}</td>
                      <td className="py-3 pr-3 text-[#6B7280]">{row.uom || "Nos"}</td>
                      <td className="py-3 pr-3 text-right font-semibold text-[#0E9F6E]">
                        {Number(row.quantity).toFixed(0)}
                      </td>
                      <td className="py-3 text-right text-[#111827]">{formatCurrency(value)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {aggregatedProducts.length > 0 ? (
              <tfoot>
                <tr className="border-t bg-[#F9FAFB] font-semibold text-[#111827]">
                  <td className="py-3 pr-3" colSpan={4}>
                    Total
                  </td>
                  <td className="py-3 pr-3 text-right">{totals.qty.toFixed(0)}</td>
                  <td className="py-3 text-right">{formatCurrency(totals.value)}</td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </InventorySectionCard>

      <div className="grid gap-6 lg:grid-cols-3">
        <InventorySectionCard title="Stock Value Summary">
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-[#6B7280]">Current Stock Value</span>
              <span className="font-semibold text-[#111827]">{formatCurrency(totals.value)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#6B7280]">Total Quantity</span>
              <span className="font-semibold text-[#111827]">{totals.qty.toFixed(0)}</span>
            </div>
            <div className="flex justify-between border-t pt-3">
              <span className="font-medium text-[#111827]">Items Tracked</span>
              <span className="font-bold text-[#2563EB]">{filtered.length}</span>
            </div>
          </div>
        </InventorySectionCard>

        <InventorySectionCard title="Top 5 Stock Value Items">
          <div className="space-y-3">
            {topValueItems.length === 0 ? (
              <p className="text-sm text-[#6B7280]">No items available.</p>
            ) : (
              topValueItems.map((item, idx) => (
                <div key={item.stockItemId} className="flex items-center justify-between text-sm">
                  <div>
                    <p className="font-medium text-[#111827]">
                      {idx + 1}. {item.itemName}
                    </p>
                    <p className="text-xs text-[#6B7280]">{item.itemCode}</p>
                  </div>
                  <span className="font-semibold text-[#2563EB]">{formatCurrency(item.stockValue)}</span>
                </div>
              ))
            )}
          </div>
        </InventorySectionCard>

        <InventorySectionCard title="Stock Availability Summary">
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-[#6B7280]">In Stock</span>
              <span className="font-semibold text-[#0E9F6E]">
                {inStockProducts.length}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#6B7280]">Low Stock</span>
              <span className="font-semibold text-[#D97706]">{lowStockItems.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#6B7280]">Out of Stock</span>
              <span className="font-semibold text-[#E02424]">{outOfStockItems.length}</span>
            </div>
          </div>
        </InventorySectionCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <InventorySectionCard title="Low Stock Items">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-[#6B7280]">
                  <th className="py-2 pr-3">Item Code</th>
                  <th className="py-2 pr-3">Item Name</th>
                  <th className="py-2 pr-3 text-right">Available</th>
                  <th className="py-2 text-right">Threshold</th>
                </tr>
              </thead>
              <tbody>
                {lowStockItems.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-[#6B7280]">
                      No low stock items.
                    </td>
                  </tr>
                ) : (
                  lowStockItems.slice(0, 6).map((row, idx) => (
                    <tr key={`${row.warehouseId}-${row.stockItemId}-${idx}`} className="border-b border-[#F3F4F6]">
                      <td className="py-2 pr-3">{row.itemCode}</td>
                      <td className="py-2 pr-3">{row.itemName}</td>
                      <td className="py-2 pr-3 text-right text-[#D97706]">{Number(row.quantity).toFixed(0)}</td>
                      <td className="py-2 text-right">{LOW_STOCK_THRESHOLD}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </InventorySectionCard>

        <InventorySectionCard title="Out of Stock Items">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-[#6B7280]">
                  <th className="py-2 pr-3">Item Code</th>
                  <th className="py-2 pr-3">Item Name</th>
                  <th className="py-2 text-right">Available</th>
                </tr>
              </thead>
              <tbody>
                {outOfStockItems.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-6 text-center text-[#6B7280]">
                      No out of stock items.
                    </td>
                  </tr>
                ) : (
                  outOfStockItems.slice(0, 6).map((row, idx) => (
                    <tr key={`${row.warehouseId}-${row.stockItemId}-${idx}`} className="border-b border-[#F3F4F6]">
                      <td className="py-2 pr-3">{row.itemCode}</td>
                      <td className="py-2 pr-3">{row.itemName}</td>
                      <td className="py-2 text-right text-[#E02424]">0</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </InventorySectionCard>
      </div>
    </div>
  );
}
