import { useEffect, useState } from "react";
import { inventoryApi, exportCsv } from "@/lib/inventory-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Download } from "lucide-react";
import { usePagination } from "@/hooks/use-pagination";
import { ListPagination } from "@/components/list-pagination";

export default function LedgerPage() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { inventoryApi.getLedger().then(setRows).catch(() => setRows([])); }, []);
  const { page, setPage, totalPages, paginatedItems } = usePagination(rows);
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div><p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1">Inventory</p><h1 className="text-2xl font-bold text-[#2563EB]">Stock Ledger</h1></div>
        <Button variant="outline" className="gap-2" onClick={() => exportCsv("stock-ledger.csv", rows)}><Download className="h-4 w-4" /> Export CSV</Button>
      </div>
      <Card><CardContent className="pt-6 overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b text-muted-foreground text-left">
            <th className="py-2">Item ID</th><th className="py-2 text-right">Opening</th><th className="py-2 text-right">Received</th>
            <th className="py-2 text-right">Issued</th><th className="py-2 text-right">Trans In</th><th className="py-2 text-right">Trans Out</th>
            <th className="py-2 text-right">Adj In</th><th className="py-2 text-right">Adj Out</th><th className="py-2 text-right">Closing</th>
          </tr></thead>
          <tbody>{paginatedItems.map(r => (
            <tr key={r.stockItemId} className="border-b border-border/50">
              <td className="py-2 font-mono">#{r.stockItemId}</td>
              <td className="py-2 text-right">{r.opening.toFixed(3)}</td>
              <td className="py-2 text-right">{r.received.toFixed(3)}</td>
              <td className="py-2 text-right">{r.issued.toFixed(3)}</td>
              <td className="py-2 text-right">{r.transferredIn.toFixed(3)}</td>
              <td className="py-2 text-right">{r.transferredOut.toFixed(3)}</td>
              <td className="py-2 text-right">{r.adjustedIn.toFixed(3)}</td>
              <td className="py-2 text-right">{r.adjustedOut.toFixed(3)}</td>
              <td className="py-2 text-right font-bold">{r.closing.toFixed(3)}</td>
            </tr>
          ))}</tbody>
        </table>
        <ListPagination page={page} totalPages={totalPages} onPageChange={setPage} />
      </CardContent></Card>
    </div>
  );
}
