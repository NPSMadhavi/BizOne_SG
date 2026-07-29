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

export interface ImportedQuotItem {
  type: "item";
  sectionLabel: string;
  sectionAlign: "left" | "center";
  partNumber: string;
  description: string;
  qty: number;
  uom: string;
  unitPrice: number;
  discount: number;
  isFoc: boolean;
  itemImage: string;
}

interface QuotationSummary {
  id: number;
  qtNumber: string;
  issueDate: string;
  customerName: string;
  totalAmount: string | number;
  status: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onImport: (items: ImportedQuotItem[]) => void;
  currentItems?: any[];
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

function itemKey(i: any) {
  return `${(i.description || "").trim().toLowerCase()}||${Number(i.unitPrice) || 0}`;
}

export function ImportFromQuotationDialog({ open, onClose, onImport, currentItems = [] }: Props) {
  const { toast } = useToast();
  const [quotations, setQuotations] = useState<QuotationSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [importing, setImporting] = useState(false);
  const [pendingItems, setPendingItems] = useState<ImportedQuotItem[] | null>(null);
  const [dupCount, setDupCount] = useState(0);

  // Fetch quotations on open
  useEffect(() => {
    if (!open) return;
    setSelected(new Set());
    setSearch("");
    setLoading(true);
    fetch("/api/quotations", { credentials: "include" })
      .then(r => r.json())
      .then((data: QuotationSummary[]) => setQuotations(Array.isArray(data) ? data : []))
      .catch(() => toast({ title: "Failed to load quotations", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return quotations;
    return quotations.filter(qt =>
      qt.qtNumber.toLowerCase().includes(q) ||
      qt.customerName.toLowerCase().includes(q)
    );
  }, [quotations, search]);

  const allFilteredSelected = filtered.length > 0 && filtered.every(qt => selected.has(qt.id));

  const toggleAll = () => {
    if (allFilteredSelected) {
      setSelected(prev => { const s = new Set(prev); filtered.forEach(qt => s.delete(qt.id)); return s; });
    } else {
      setSelected(prev => { const s = new Set(prev); filtered.forEach(qt => s.add(qt.id)); return s; });
    }
  };

  const toggle = (id: number) => {
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  };

  const handleImport = async () => {
    if (selected.size === 0) {
      toast({ title: "Nothing selected", description: "Select at least one quotation to import from.", variant: "destructive" });
      return;
    }
    setImporting(true);
    try {
      // Fetch full detail for each selected quotation
      const details = await Promise.all(
        [...selected].map(id =>
          fetch(`/api/quotations/${id}`, { credentials: "include" }).then(r => r.json())
        )
      );

      // Collect all non-section line items, preserving order (QT1 items, then QT2 items, ...)
      const collected: ImportedQuotItem[] = [];
      for (const qt of details) {
        const items: any[] = Array.isArray(qt.items) ? qt.items : [];
        for (const item of items) {
          if (item.type === "section") continue;
          collected.push({
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
            itemImage: item.itemImage || "",
          });
        }
      }

      // Detect duplicates: same description+price already in form OR duplicates within collected
      const existingKeys = new Set(
        currentItems.filter(i => i.type !== "section").map(itemKey)
      );
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
        toast({ title: `${collected.length} item${collected.length !== 1 ? "s" : ""} imported`, description: `From ${selected.size} quotation${selected.size !== 1 ? "s" : ""}.` });
      }
    } catch {
      toast({ title: "Import failed", description: "Could not fetch quotation details.", variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  const confirmKeepAll = () => {
    if (!pendingItems) return;
    onImport(pendingItems);
    setPendingItems(null);
    onClose();
    toast({ title: `${pendingItems.length} items imported`, description: "All items including duplicates were added." });
  };

  const confirmSkipDups = () => {
    if (!pendingItems) return;
    const existingKeys = new Set(currentItems.filter(i => i.type !== "section").map(itemKey));
    const seenInCollected = new Set<string>();
    const deduped = pendingItems.filter(item => {
      const k = itemKey(item);
      if (existingKeys.has(k) || seenInCollected.has(k)) return false;
      seenInCollected.add(k);
      return true;
    });
    onImport(deduped);
    setPendingItems(null);
    onClose();
    toast({ title: `${deduped.length} items imported`, description: `${pendingItems.length - deduped.length} duplicate(s) were skipped.` });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
        <DialogContent className="sm:max-w-[680px] max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Copy className="h-4 w-4" />
              Import from Previous Quotation
            </DialogTitle>
            <DialogDescription>
              Select one or more past quotations — all their line items will be appended to this quotation.
            </DialogDescription>
          </DialogHeader>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              className="pl-8 h-8 text-sm"
              placeholder="Search by QT number or customer name…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {/* Table */}
          <div className="flex-1 overflow-auto border rounded-md min-h-0">
            {loading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading quotations…
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
                {search ? "No quotations match your search." : "No quotations found."}
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted/50 sticky top-0 z-10">
                  <tr>
                    <th className="w-10 px-3 py-2.5 text-left">
                      <Checkbox
                        checked={allFilteredSelected}
                        onCheckedChange={toggleAll}
                        aria-label="Select all"
                      />
                    </th>
                    <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">QT Number</th>
                    <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Date</th>
                    <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Customer</th>
                    <th className="px-3 py-2.5 text-right font-medium text-muted-foreground">Total</th>
                    <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((qt, idx) => (
                    <tr
                      key={qt.id}
                      className={`border-t cursor-pointer transition-colors ${selected.has(qt.id) ? "bg-primary/5" : idx % 2 === 0 ? "bg-background" : "bg-muted/20"} hover:bg-primary/10`}
                      onClick={() => toggle(qt.id)}
                    >
                      <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                        <Checkbox
                          checked={selected.has(qt.id)}
                          onCheckedChange={() => toggle(qt.id)}
                        />
                      </td>
                      <td className="px-3 py-2.5 font-medium text-primary">{qt.qtNumber}</td>
                      <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{fmtDate(qt.issueDate)}</td>
                      <td className="px-3 py-2.5 max-w-[180px] truncate">{qt.customerName}</td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap font-mono text-xs">
                        {Number(qt.totalAmount).toLocaleString("en", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium capitalize ${STATUS_COLORS[qt.status] || "bg-gray-100 text-gray-600"}`}>
                          {qt.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <DialogFooter className="gap-2 items-center">
            <span className="text-xs text-muted-foreground mr-auto">
              {selected.size > 0 ? `${selected.size} quotation${selected.size !== 1 ? "s" : ""} selected` : "No quotations selected"}
            </span>
            <Button variant="outline" onClick={onClose} disabled={importing}>Cancel</Button>
            <Button onClick={handleImport} disabled={importing || selected.size === 0} className="gap-2">
              {importing ? <><Loader2 className="h-4 w-4 animate-spin" />Importing…</> : <><Copy className="h-4 w-4" />Import Selected</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Duplicate resolution dialog */}
      <AlertDialog open={!!pendingItems} onOpenChange={v => { if (!v) setPendingItems(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Duplicate Items Found
            </AlertDialogTitle>
            <AlertDialogDescription>
              {dupCount} item{dupCount !== 1 ? "s" : ""} in the selected quotation{selected.size !== 1 ? "s" : ""} already exist{dupCount === 1 ? "s" : ""} in this quotation (matched by description and price). How would you like to proceed?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingItems(null)}>Cancel</AlertDialogCancel>
            <Button variant="outline" onClick={confirmSkipDups}>Skip Duplicates</Button>
            <AlertDialogAction onClick={confirmKeepAll}>Keep All</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
