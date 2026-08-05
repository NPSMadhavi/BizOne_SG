import { useEffect, useState } from "react";
import { inventoryApi } from "@/lib/inventory-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Package, Warehouse, AlertTriangle, TrendingDown, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";

export default function InventoryDashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    inventoryApi.getDashboard()
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-8 text-muted-foreground">Loading dashboard...</div>;
  if (!data) return <div className="p-8 text-destructive">Failed to load inventory dashboard.</div>;

  const cards = [
    { label: "Total Warehouses", value: data.totalWarehouses, icon: Warehouse },
    { label: "Total Items", value: data.totalItems, icon: Package },
    { label: "Stock Value", value: `$${Number(data.totalStockValue || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, icon: Package },
    { label: "Low Stock", value: data.lowStock, icon: AlertTriangle, variant: "warning" as const },
    { label: "Out of Stock", value: data.outOfStock, icon: TrendingDown, variant: "destructive" as const },
    { label: "Near Reorder", value: data.nearReorder, icon: AlertTriangle, variant: "secondary" as const },
    { label: "Today's Receipts", value: data.todayReceipts, icon: ArrowDownToLine },
    { label: "Today's Issues", value: data.todayIssues, icon: ArrowUpFromLine },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1">Inventory</p>
        <h1 className="text-2xl font-bold">Inventory Dashboard</h1>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(c => (
          <Card key={c.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{c.label}</CardTitle>
              <c.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{c.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle>Recent Movements</CardTitle></CardHeader>
        <CardContent>
          {!data.recentMovements?.length ? (
            <p className="text-sm text-muted-foreground">No movements yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-4">Date</th>
                    <th className="py-2 pr-4">Type</th>
                    <th className="py-2 pr-4">Document</th>
                    <th className="py-2 pr-4">Item</th>
                    <th className="py-2 pr-4">Warehouse</th>
                    <th className="py-2 pr-4 text-right">In</th>
                    <th className="py-2 text-right">Out</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentMovements.map((m: any) => (
                    <tr key={m.id} className="border-b border-border/50">
                      <td className="py-2 pr-4">{new Date(m.movementDate).toLocaleDateString()}</td>
                      <td className="py-2 pr-4"><Badge variant="outline">{m.transactionType}</Badge></td>
                      <td className="py-2 pr-4 font-mono">{m.documentNumber}</td>
                      <td className="py-2 pr-4">{m.itemCode}</td>
                      <td className="py-2 pr-4">{m.warehouseName}</td>
                      <td className="py-2 pr-4 text-right text-green-600">{Number(m.quantityIn) || "-"}</td>
                      <td className="py-2 text-right text-red-600">{Number(m.quantityOut) || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
