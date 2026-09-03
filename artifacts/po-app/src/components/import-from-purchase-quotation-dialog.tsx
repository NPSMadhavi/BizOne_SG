import { useState, useEffect, useMemo } from "react";
import { Search, Copy, CheckSquare, Square, Loader2, AlertTriangle } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import type { VendorInvoiceLineItem } from "@/lib/vendor-invoice-items";

interface PqSummary {
  id: number;
  pqNumber: string;
  issueDate: string;
  vendorName: string;
  totalAmount: string | number;
  status: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onImport: (items: VendorInvoiceLineItem[]) => void;
  currentItems?: VendorInvoiceLineItem[];
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  sent: "bg-blue-100 text-blue-700",
  confirmed: "bg-green-100 text-green-700",
  void: "bg-red-100 text-red-600",
};

function fmtDate(d: string) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}-${m}-${y}`;
}

function itemKey(i: VendorInvoiceLineItem) {
  return `${(i.description || "").trim().toLowerCase()}||${Number(i.unitPrice) || 0}`;
}

export function ImportFromPurchaseQuotationDialog({ open, onClose, onImport, currentItems = [] }: Props) {
  const { toast } = useToast();
  const [quotations, setQuotations] = useState<PqSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [importing, setImporting] = useState(false);
  const [pendingItems, setPendingItems] = useState<VendorInvoiceLineItem[] | null>(null);
  const [dupCount, setDupCount] = useState(0);

  useEffect(() => {
    if (!open) return;
    setSelected(new Set());
    setSearch("");
    setLoading(true);
    fetch("/api/purchase-quotations", { credentials: "include" })
      .then((r) => r.json())
      .then((data: PqSummary[]) => setQuotations(Array.isArray(data) ? data : []))
      .catch(() => toast({ title: "Failed to load purchase quotations", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [open, toast]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return quotations;
    return quotations.filter((pq) =>
      pq.pqNumber.toLowerCase().includes(q) ||
      pq.vendorName?.toLowerCase().includes(q)
    );
  }, [quotations, search]);

  const allFilteredSelected = filtered.length > 0 && filtered.every((pq) => selected.has(pq.id));

  const toggleAll = () => {
    if (allFilteredSelected) {
      setSelected((prev) => { const s = new Set(prev); filtered.forEach((pq) => s.delete(pq.id)); return s; });
    } else {
      setSelected((prev) => { const s = new Set(prev); filtered.forEach((pq) => s.add(pq.id)); return s; });
    }
  };

  const toggle = (id: number) => {
    setSelected((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  };

  const mapItem = (item: any): VendorInvoiceLineItem => ({
    type: "item",
    sectionLabel: "",
    sectionAlign: "left",
    partNumber: item.partNumber || "",
    description: item.description || "",
    qty: Number(item.qty) || 1,
    uom: item.uom || "",
    unitPrice: Number(item.unitPrice) || 0,
    discount: Number(item.discount) || 0,
    isFoc: !!(item.isFoc),
  });

  const handleImport = async () => {
    if (selected.size === 0) {
      toast({ title: "Nothing selected", description: "Select at least one purchase quotation.", variant: "destructive" });
      return;
    }
    setImporting(true);
    try {
      const details = await Promise.all(
        [...selected].map((id) =>
          fetch(`/api/purchase-quotations/${id}`, { credentials: "include" }).then((r) => r.json())
        )
      );
      const collected: VendorInvoiceLineItem[] = [];
      for (const pq of details) {
        for (const item of (pq.items || []) as any[]) {
          if (item.type === "section") continue;
          collected.push(mapItem(item));
        }
      }
      const existingKeys = new Set(currentItems.filter((i) => i.type !== "section").map(itemKey));
      const seenInCollected = new Set<string>();
      let dups = 0;
      for (const item of collected) {
        const k = itemKey(item);
        if (existingKeys.has(k) || seenInCollected.has(k)) dups++;
        seenInCollected.add(k);
      }
      if (dups > 0) {
        setPendingItems(collected);
        setDupCount(dups);
      } else {
        onImport(collected);
        onClose();
        toast({ title: `${collected.length} item${collected.length !== 1 ? "s" : ""} imported` });
      }
    } catch {
      toast({ title: "Import failed", variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  const confirmKeepAll = () => {
    if (!pendingItems) return;
    onImport(pendingItems);
    setPendingItems(null);
    onClose();
    toast({ title: `${pendingItems.length} items imported` });
  };

  const confirmSkipDups = () => {
    if (!pendingItems) return;
    const existingKeys = new Set(currentItems.filter((i) => i.type !== "section").map(itemKey));
    const seenInCollected = new Set<string>();
    const deduped = pendingItems.filter((item) => {
      const k = itemKey(item);
      if (existingKeys.has(k) || seenInCollected.has(k)) return false;
      seenInCollected.add(k);
      return true;
    });
    onImport(deduped);
    setPendingItems(null);
    onClose();
    toast({ title: `${deduped.length} items imported`, description: `${dupCount} duplicate(s) skipped.` });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Copy className="h-4 w-4" />
              Import from Purchase Quotation
            </DialogTitle>
            <DialogDescription>Select purchase quotation(s) to import line items.</DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search by PQ number or vendor..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <div className="border rounded-md max-h-72 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading...
              </div>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No purchase quotations found.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 w-8">
                      <button type="button" onClick={toggleAll} className="text-muted-foreground hover:text-foreground">
                        {allFilteredSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                      </button>
                    </th>
                    <th className="px-3 py-2 text-left">PQ Number</th>
                    <th className="px-3 py-2 text-left">Vendor</th>
                    <th className="px-3 py-2 text-left">Date</th>
                    <th className="px-3 py-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((pq) => (
                    <tr key={pq.id} className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => toggle(pq.id)}>
                      <td className="px-3 py-2">
                        <Checkbox checked={selected.has(pq.id)} onCheckedChange={() => toggle(pq.id)} />
                      </td>
                      <td className="px-3 py-2 font-mono font-medium">{pq.pqNumber}</td>
                      <td className="px-3 py-2">{pq.vendorName}</td>
                      <td className="px-3 py-2 text-muted-foreground">{fmtDate(pq.issueDate)}</td>
                      <td className="px-3 py-2">
                        <Badge variant="secondary" className={STATUS_COLORS[pq.status] || ""}>{pq.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleImport} disabled={importing || selected.size === 0}>
              {importing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Import {selected.size > 0 ? `(${selected.size})` : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={pendingItems !== null} onOpenChange={(v) => !v && setPendingItems(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Duplicate items detected
            </AlertDialogTitle>
            <AlertDialogDescription>
              {dupCount} item(s) appear to be duplicates. Import all or skip duplicates?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmSkipDups}>Skip duplicates</AlertDialogAction>
            <AlertDialogAction onClick={confirmKeepAll}>Import all</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
