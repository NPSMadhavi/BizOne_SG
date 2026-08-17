import { useEffect, useState } from "react";
import { inventoryApi, exportCsv } from "@/lib/inventory-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Download } from "lucide-react";
import { usePagination } from "@/hooks/use-pagination";
import { ListPagination } from "@/components/list-pagination";

export default function MovementsPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  useEffect(() => { inventoryApi.getMovements(search ? { search } : undefined).then(setRows).catch(() => setRows([])); }, [search]);
  const { page, setPage, totalPages, paginatedItems } = usePagination(rows);
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div><p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1">Inventory</p><h1 className="text-2xl font-bold">Stock Movement History</h1></div>
        <Button variant="outline" className="gap-2" onClick={() => exportCsv("stock-movements.csv", rows)}><Download className="h-4 w-4" /> Export CSV</Button>
      </div>
      <Input placeholder="Search document, item..." value={search} onChange={e => setSearch(e.target.value)} className="max-w-sm" />
      <Card><CardContent className="pt-6 overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b text-muted-foreground text-left">
            <th className="py-2">Date</th><th className="py-2">Type</th><th className="py-2">Document</th>
            <th className="py-2">Warehouse</th><th className="py-2">Item</th><th className="py-2 text-right">In</th><th className="py-2 text-right">Out</th><th className="py-2 text-right">Balance</th><th className="py-2">User</th>
          </tr></thead>
          <tbody>{paginatedItems.map(r => (
            <tr key={r.id} className="border-b border-border/50">
              <td className="py-2">{new Date(r.movementDate).toLocaleDateString()}</td>
              <td className="py-2"><Badge variant="outline">{r.transactionType}</Badge></td>
              <td className="py-2 font-mono">{r.documentNumber}</td>
              <td className="py-2">{r.warehouseName}</td>
              <td className="py-2">{r.itemCode}</td>
              <td className="py-2 text-right text-green-600">{Number(r.quantityIn) || "-"}</td>
              <td className="py-2 text-right text-red-600">{Number(r.quantityOut) || "-"}</td>
              <td className="py-2 text-right font-medium">{Number(r.balance).toFixed(3)}</td>
              <td className="py-2">{r.username || "-"}</td>
            </tr>
          ))}</tbody>
        </table>
        <ListPagination page={page} totalPages={totalPages} onPageChange={setPage} />
      </CardContent></Card>
    </div>
  );
}
