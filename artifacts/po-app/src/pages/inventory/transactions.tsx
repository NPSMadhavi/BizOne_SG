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

type Line = { stockItemId: string; quantity: string; unitCost: string };

function TransactionPage({
  title, createLabel, listFn, createFn, showUnitCost = false, showSupplier = false, showReason = false, showTransfer = false,
}: {
  title: string; createLabel: string;
  listFn: () => Promise<any[]>;
  createFn: (data: any) => Promise<any>;
  showUnitCost?: boolean; showSupplier?: boolean; showReason?: boolean; showTransfer?: boolean;
}) {
  const { toast } = useToast();
  const [rows, setRows] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [header, setHeader] = useState<any>({});
  const [lines, setLines] = useState<Line[]>([{ stockItemId: "", quantity: "", unitCost: "" }]);
  const { data: items = [] } = useListStockItems({} as any);

  async function load() {
    try {
      const [data, wh] = await Promise.all([listFn(), inventoryApi.getWarehouses()]);
      setRows(data); setWarehouses(wh);
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  }
  useEffect(() => { load(); }, []);

  async function save() {
    try {
      let payload: any;
      if (title.includes("Adjustment")) {
        payload = {
          warehouseId: Number(header.warehouseId),
          stockItemId: Number(header.stockItemId),
          actualQuantity: Number(header.actualQuantity),
          reason: header.reason,
          remarks: header.remarks,
        };
      } else {
        payload = {
          ...header,
          warehouseId: Number(header.warehouseId || header.fromWarehouseId),
          fromWarehouseId: header.fromWarehouseId ? Number(header.fromWarehouseId) : undefined,
          toWarehouseId: header.toWarehouseId ? Number(header.toWarehouseId) : undefined,
          items: lines.filter(l => l.stockItemId && Number(l.quantity) > 0).map(l => ({
            stockItemId: Number(l.stockItemId),
            quantity: Number(l.quantity),
            unitCost: Number(l.unitCost) || 0,
          })),
        };
      }
      await createFn(payload);
      toast({ title: "Saved", description: `${title} created.` });
      setOpen(false); setLines([{ stockItemId: "", quantity: "", unitCost: "" }]); setHeader({});
      load();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  }

  const numCol = showTransfer ? "transferNumber" : title.includes("Issue") ? "ginNumber" : title.includes("Receipt") ? "grnNumber" : "adjustmentNumber";

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div><p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1">Inventory</p><h1 className="text-2xl font-bold">{title}</h1></div>
        <Button onClick={() => setOpen(true)} className="gap-2"><Plus className="h-4 w-4" /> {createLabel}</Button>
      </div>
      <Card><CardContent className="pt-6">
        <table className="w-full text-sm">
          <thead><tr className="border-b text-muted-foreground text-left">
            <th className="py-2">Number</th><th className="py-2">Date</th>
            {!showTransfer && <th className="py-2">Warehouse</th>}
            {showTransfer && <><th className="py-2">From</th><th className="py-2">To</th></>}
            {showSupplier && <th className="py-2">Supplier</th>}
            {showReason && <th className="py-2">Reason</th>}
          </tr></thead>
          <tbody>{rows.map(r => (
            <tr key={r.id} className="border-b border-border/50">
              <td className="py-2 font-mono">{r[numCol] || r.grnNumber || r.ginNumber || r.transferNumber || r.adjustmentNumber}</td>
              <td className="py-2">{r.receiptDate || r.issueDate || r.transferDate || r.adjustmentDate}</td>
              {!showTransfer && <td className="py-2">{r.warehouseName || "-"}</td>}
              {showTransfer && <><td className="py-2">WH #{r.fromWarehouseId}</td><td className="py-2">WH #{r.toWarehouseId}</td></>}
              {showSupplier && <td className="py-2">{r.supplier || "-"}</td>}
              {showReason && <td className="py-2">{r.reason || "-"}</td>}
            </tr>
          ))}</tbody>
        </table>
      </CardContent></Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{createLabel}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            {showTransfer ? (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5"><Label>From Warehouse</Label>
                  <Select value={header.fromWarehouseId || ""} onValueChange={v => setHeader((h: any) => ({ ...h, fromWarehouseId: v }))}>
                    <SelectTrigger><SelectValue placeholder="From" /></SelectTrigger>
                    <SelectContent>{warehouses.map(w => <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5"><Label>To Warehouse</Label>
                  <Select value={header.toWarehouseId || ""} onValueChange={v => setHeader((h: any) => ({ ...h, toWarehouseId: v }))}>
                    <SelectTrigger><SelectValue placeholder="To" /></SelectTrigger>
                    <SelectContent>{warehouses.map(w => <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
            ) : (
              <div className="space-y-1.5"><Label>Warehouse</Label>
                <Select value={header.warehouseId || ""} onValueChange={v => setHeader((h: any) => ({ ...h, warehouseId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select warehouse" /></SelectTrigger>
                  <SelectContent>{warehouses.map(w => <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            {showSupplier && <div className="space-y-1.5"><Label>Supplier</Label><Input value={header.supplier || ""} onChange={e => setHeader((h: any) => ({ ...h, supplier: e.target.value }))} /></div>}
            {showReason && <div className="space-y-1.5"><Label>Reason</Label><Input value={header.reason || ""} onChange={e => setHeader((h: any) => ({ ...h, reason: e.target.value }))} /></div>}
            {title.includes("Adjustment") ? (
              <>
                <div className="space-y-1.5"><Label>Item</Label>
                  <Select value={header.stockItemId || ""} onValueChange={v => setHeader((h: any) => ({ ...h, stockItemId: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select item" /></SelectTrigger>
                    <SelectContent>{items.map((i: any) => <SelectItem key={i.id} value={String(i.id)}>{i.code} — {i.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5"><Label>Actual Quantity (Physical Count)</Label><Input value={header.actualQuantity || ""} onChange={e => setHeader((h: any) => ({ ...h, actualQuantity: e.target.value }))} /></div>
                <div className="space-y-1.5"><Label>Reason</Label>
                  <Select value={header.reason || ""} onValueChange={v => setHeader((h: any) => ({ ...h, reason: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select reason" /></SelectTrigger>
                    <SelectContent>
                      {["Damage", "Lost", "Expired", "Found", "Manual Correction"].map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5"><Label>Remarks</Label><Input value={header.remarks || ""} onChange={e => setHeader((h: any) => ({ ...h, remarks: e.target.value }))} /></div>
              </>
            ) : lines.map((line, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-end border rounded-lg p-3">
                <div className="col-span-5 space-y-1"><Label>Item</Label>
                  <Select value={line.stockItemId} onValueChange={v => setLines(ls => ls.map((l, i) => i === idx ? { ...l, stockItemId: v } : l))}>
                    <SelectTrigger><SelectValue placeholder="Item" /></SelectTrigger>
                    <SelectContent>{items.filter((i: any) => i.type === "product").map((i: any) => <SelectItem key={i.id} value={String(i.id)}>{i.code}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="col-span-3 space-y-1"><Label>Qty</Label><Input value={line.quantity} onChange={e => setLines(ls => ls.map((l, i) => i === idx ? { ...l, quantity: e.target.value } : l))} /></div>
                {showUnitCost && <div className="col-span-3 space-y-1"><Label>Cost</Label><Input value={line.unitCost} onChange={e => setLines(ls => ls.map((l, i) => i === idx ? { ...l, unitCost: e.target.value } : l))} /></div>}
                <div className="col-span-1"><Button size="icon" variant="ghost" onClick={() => setLines(ls => ls.filter((_, i) => i !== idx))}><Trash2 className="h-4 w-4" /></Button></div>
              </div>
            ))}
            {!title.includes("Adjustment") && <Button variant="outline" size="sm" onClick={() => setLines(ls => [...ls, { stockItemId: "", quantity: "", unitCost: "" }])}>Add Line</Button>}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save}>Post</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function GoodsReceiptsPage() {
  return <TransactionPage title="Goods Receipt (GRN)" createLabel="New Goods Receipt" listFn={inventoryApi.getGoodsReceipts} createFn={inventoryApi.createGoodsReceipt} showUnitCost showSupplier />;
}
export function GoodsIssuesPage() {
  return <TransactionPage title="Goods Issue (GIN)" createLabel="New Goods Issue" listFn={inventoryApi.getGoodsIssues} createFn={inventoryApi.createGoodsIssue} showReason />;
}
export function TransfersPage() {
  return <TransactionPage title="Stock Transfer" createLabel="New Transfer" listFn={inventoryApi.getTransfers} createFn={inventoryApi.createTransfer} showTransfer />;
}
export function AdjustmentsPage() {
  return <TransactionPage title="Stock Adjustment" createLabel="New Adjustment" listFn={inventoryApi.getAdjustments} createFn={inventoryApi.createAdjustment} showReason />;
}
