import { useState, useMemo } from "react";
import { useListPurchaseOrders, getListPurchaseOrdersQueryKey } from "@workspace/api-client-react";
import type { PurchaseOrder, POItem } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, ArrowLeft, FileInput, PackageOpen } from "lucide-react";
import { cn } from "@/lib/utils";

export interface InvoiceImportItem {
  type: "item";
  sectionLabel: string;
  sectionAlign: "left";
  partNumber: string;
  description: string;
  qty: number;
  uom: string;
  unitPrice: number;
  discount: number;
  isFoc: boolean;
  isStockItem: boolean;
  stockItemId?: number;
  warehouseId?: number;
  selectedSerials: string[];
  selectedSerialIds: number[];
  itemImage: string;
}

export interface DOImportItem {
  partNumber: string;
  description: string;
  qty: number;
  uom: string;
  itemImage: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "invoice" | "do";
  onImport: (items: InvoiceImportItem[] | DOImportItem[]) => void;
}

const STATUS_COLOR: Record<string, string> = {
  confirmed: "bg-green-100 text-green-700 border-green-200",
  draft: "bg-yellow-100 text-yellow-700 border-yellow-200",
};

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function ImportFromPODialog({ open, onOpenChange, mode, onImport }: Props) {
  const [search, setSearch] = useState("");
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);
  const [checked, setChecked] = useState<Set<number>>(new Set());

  const { data: allPOs = [], isLoading } = useListPurchaseOrders({
    query: { queryKey: getListPurchaseOrdersQueryKey() },
  });

  const filteredPOs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (allPOs as PurchaseOrder[]).filter(
      p => p.status !== "cancelled" &&
        (!q || p.poNumber.toLowerCase().includes(q) || p.vendorName.toLowerCase().includes(q))
    );
  }, [allPOs, search]);

  const poItems: POItem[] = useMemo(() =>
    selectedPO
      ? ((selectedPO.items as unknown as POItem[]) || []).filter(i => i.description?.trim())
      : [],
    [selectedPO]
  );

  function pickPO(po: PurchaseOrder) {
    const items = ((po.items as unknown as POItem[]) || []).filter(i => i.description?.trim());
    setSelectedPO(po);
    setChecked(new Set(items.map((_, i) => i)));
  }

  function toggleAll() {
    setChecked(prev => prev.size === poItems.length ? new Set() : new Set(poItems.map((_, i) => i)));
  }

  function toggle(i: number) {
    setChecked(prev => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  }

  function handleImport() {
    const selected = poItems.filter((_, i) => checked.has(i));
    if (!selected.length) return;

    if (mode === "invoice") {
      onImport(selected.map<InvoiceImportItem>(it => ({
        type: "item",
        sectionLabel: "",
        sectionAlign: "left",
        partNumber: it.partNumber ?? "",
        description: it.description ?? "",
        qty: Number(it.qty) || 1,
        uom: it.uom ?? "",
        unitPrice: Number(it.unitPrice) || 0,
        discount: 0,
        isFoc: false,
        isStockItem: it.isStockItem === true,
        stockItemId: it.stockItemId,
        warehouseId: it.warehouseId,
        selectedSerials: [],
        selectedSerialIds: [],
        itemImage: "",
      })));
    } else {
      onImport(selected.map<DOImportItem>(it => ({
        partNumber: it.partNumber ?? "",
        description: it.description ?? "",
        qty: Number(it.qty) || 1,
        uom: it.uom ?? "",
        itemImage: "",
      })));
    }
    handleClose();
  }

  function handleClose() {
    setSearch("");
    setSelectedPO(null);
    setChecked(new Set());
    onOpenChange(false);
  }

  const allChecked = poItems.length > 0 && checked.size === poItems.length;
  const someChecked = checked.size > 0 && !allChecked;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <FileInput className="h-4 w-4 text-primary" />
            Import Items from Purchase Order
          </DialogTitle>
          <DialogDescription className="text-xs">
            {selectedPO
              ? `Select the line items you want to import from ${selectedPO.poNumber}`
              : "Pick a PO to pull its line items into this document. Prices are copied for Invoices; Delivery Orders import description and quantity only."}
          </DialogDescription>
        </DialogHeader>

        {/* ── Step 1: PO list ── */}
        {!selectedPO && (
          <div className="flex flex-col flex-1 min-h-0">
            <div className="px-4 pt-3 pb-2 shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search by PO number or vendor name…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-9 h-8 text-sm"
                  autoFocus
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 pb-4">
              {isLoading ? (
                <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">Loading…</div>
              ) : filteredPOs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 gap-2 text-muted-foreground">
                  <PackageOpen className="h-8 w-8 opacity-30" />
                  <p className="text-sm">No purchase orders found</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {filteredPOs.map(po => (
                    <button
                      key={po.id}
                      type="button"
                      onClick={() => pickPO(po)}
                      className="w-full text-left rounded-lg border px-4 py-3 hover:bg-muted/50 hover:border-primary/40 transition-colors group"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="font-mono text-sm font-semibold text-primary shrink-0">{po.poNumber}</span>
                          <span className="text-sm text-foreground truncate">{po.vendorName}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 capitalize", STATUS_COLOR[po.status] ?? "")}>
                            {po.status}
                          </Badge>
                          <span className="text-xs text-muted-foreground">{fmtDate(po.createdAt)}</span>
                          <span className="text-xs text-muted-foreground">
                            {((po.items as unknown as POItem[]) || []).filter(i => i.description?.trim()).length} item{((po.items as unknown as POItem[]) || []).filter(i => i.description?.trim()).length !== 1 ? "s" : ""}
                          </span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Step 2: Item selection ── */}
        {selectedPO && (
          <div className="flex flex-col flex-1 min-h-0">
            <div className="px-4 pt-3 pb-2 border-b shrink-0 flex items-center gap-2 bg-muted/20">
              <button type="button" onClick={() => { setSelectedPO(null); setChecked(new Set()); }} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                <ArrowLeft className="h-3 w-3" /> Back
              </button>
              <span className="text-xs text-muted-foreground">|</span>
              <span className="text-xs font-medium">{selectedPO.poNumber}</span>
              <span className="text-xs text-muted-foreground">— {selectedPO.vendorName}</span>
            </div>

            {/* column headers */}
            <div className="px-4 py-2 shrink-0">
              <div className="flex items-center gap-3 text-xs text-muted-foreground uppercase font-medium border-b pb-2">
                <Checkbox
                  checked={allChecked}
                  ref={el => { if (el) (el as any).indeterminate = someChecked; }}
                  onCheckedChange={toggleAll}
                  className="shrink-0"
                />
                <span className="w-28 shrink-0">Part No.</span>
                <span className="flex-1">Description</span>
                <span className="w-12 text-right shrink-0">Qty</span>
                <span className="w-10 shrink-0 text-center">UOM</span>
                {mode === "invoice" && <span className="w-20 text-right shrink-0">Unit Price</span>}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 pb-2">
              {poItems.length === 0 ? (
                <div className="flex items-center justify-center h-24 text-sm text-muted-foreground">No line items on this PO</div>
              ) : (
                <div className="space-y-0.5">
                  {poItems.map((item, i) => (
                    <label
                      key={i}
                      className={cn(
                        "flex items-start gap-3 rounded-md px-1 py-2 cursor-pointer hover:bg-muted/40 transition-colors",
                        checked.has(i) && "bg-primary/5"
                      )}
                    >
                      <Checkbox
                        checked={checked.has(i)}
                        onCheckedChange={() => toggle(i)}
                        className="mt-0.5 shrink-0"
                      />
                      <span className="w-28 shrink-0 font-mono text-xs text-muted-foreground truncate">{item.partNumber || "—"}</span>
                      <span className="flex-1 text-sm leading-snug">{item.description}</span>
                      <span className="w-12 text-right text-sm shrink-0">{item.qty}</span>
                      <span className="w-10 text-center text-xs text-muted-foreground shrink-0">{item.uom || "—"}</span>
                      {mode === "invoice" && (
                        <span className="w-20 text-right text-sm shrink-0">{Number(item.unitPrice).toFixed(2)}</span>
                      )}
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t shrink-0 flex items-center justify-between gap-3 bg-muted/10">
              <p className="text-xs text-muted-foreground">
                {checked.size} of {poItems.length} item{poItems.length !== 1 ? "s" : ""} selected
                {mode === "do" && <span className="ml-1 text-muted-foreground/70">(pricing excluded for Delivery Orders)</span>}
              </p>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={handleClose}>Cancel</Button>
                <Button type="button" size="sm" disabled={checked.size === 0} onClick={handleImport}>
                  <FileInput className="h-3.5 w-3.5 mr-1.5" />
                  Import {checked.size > 0 ? `${checked.size} Item${checked.size !== 1 ? "s" : ""}` : ""}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Footer for step 1 (no PO selected yet) */}
        {!selectedPO && (
          <div className="px-6 py-3 border-t shrink-0 flex justify-end">
            <Button type="button" variant="outline" size="sm" onClick={handleClose}>Cancel</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
