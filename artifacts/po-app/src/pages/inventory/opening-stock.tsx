import { useEffect, useState } from "react";
import { useListStockItems } from "@workspace/api-client-react";
import { inventoryApi } from "@/lib/inventory-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2 } from "lucide-react";
import { usePagination } from "@/hooks/use-pagination";
import { ListPagination } from "@/components/list-pagination";

export default function OpeningStockPage() {
  const { toast } = useToast();
  const [rows, setRows] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ warehouseId: "", stockItemId: "", quantity: "", unitCost: "", entryDate: new Date().toISOString().slice(0, 10), remarks: "" });
  const { data: items = [] } = useListStockItems({} as any);

  async function load() {
    try {
      const [os, wh] = await Promise.all([inventoryApi.getOpeningStock(), inventoryApi.getWarehouses()]);
      setRows(os); setWarehouses(wh);
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  }
  useEffect(() => { load(); }, []);

  const { page, setPage, totalPages, paginatedItems } = usePagination(rows);

  async function save() {
    try {
      await inventoryApi.createOpeningStock({
        warehouseId: Number(form.warehouseId),
        stockItemId: Number(form.stockItemId),
        quantity: Number(form.quantity),
        unitCost: Number(form.unitCost) || 0,
        entryDate: form.entryDate,
        remarks: form.remarks,
      });
      toast({ title: "Saved", description: "Opening stock recorded." });
      setOpen(false); load();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div><p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1">Inventory</p><h1 className="text-2xl font-bold">Opening Stock</h1></div>
        <Button onClick={() => setOpen(true)} className="gap-2"><Plus className="h-4 w-4" /> Add Opening Stock</Button>
      </div>
      <Card><CardHeader><CardTitle>Opening Stock Entries</CardTitle></CardHeader><CardContent>
        <table className="w-full text-sm">
          <thead><tr className="border-b text-muted-foreground text-left"><th className="py-2">Date</th><th className="py-2">Warehouse</th><th className="py-2">Item</th><th className="py-2 text-right">Qty</th><th className="py-2 text-right">Unit Cost</th><th className="py-2"></th></tr></thead>
          <tbody>{paginatedItems.map(r => (
            <tr key={r.id} className="border-b border-border/50">
              <td className="py-2">{r.entryDate}</td><td className="py-2">{r.warehouseName}</td>
              <td className="py-2">{r.itemCode} — {r.itemName}</td>
              <td className="py-2 text-right">{Number(r.quantity).toFixed(3)}</td>
              <td className="py-2 text-right">{Number(r.unitCost).toFixed(2)}</td>
              <td className="py-2 text-right"><Button size="icon" variant="ghost" onClick={async () => { try { await inventoryApi.deleteOpeningStock(r.id); load(); } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); } }}><Trash2 className="h-4 w-4 text-destructive" /></Button></td>
            </tr>
          ))}</tbody>
        </table>
        <ListPagination page={page} totalPages={totalPages} onPageChange={setPage} />
      </CardContent></Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Opening Stock Entry</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-1.5"><Label>Warehouse</Label>
              <Select value={form.warehouseId} onValueChange={v => setForm(f => ({ ...f, warehouseId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select warehouse" /></SelectTrigger>
                <SelectContent>{warehouses.map(w => <SelectItem key={w.id} value={String(w.id)}>{w.code} — {w.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Item</Label>
              <Select value={form.stockItemId} onValueChange={v => setForm(f => ({ ...f, stockItemId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select item" /></SelectTrigger>
                <SelectContent>{items.filter((i: any) => i.type === "product").map((i: any) => <SelectItem key={i.id} value={String(i.id)}>{i.code} — {i.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label>Quantity</Label><Input value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>Unit Cost</Label><Input value={form.unitCost} onChange={e => setForm(f => ({ ...f, unitCost: e.target.value }))} /></div>
            </div>
            <div className="space-y-1.5"><Label>Date</Label><Input type="date" value={form.entryDate} onChange={e => setForm(f => ({ ...f, entryDate: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>Remarks</Label><Input value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
