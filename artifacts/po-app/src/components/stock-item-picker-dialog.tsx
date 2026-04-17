import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, Package, ArrowLeft, Loader2 } from "lucide-react";

interface StockItem {
  id: number;
  code: string;
  name: string;
  description?: string;
  uom: string;
  unitPrice: string;
  stockQty: string;
}

interface Serial {
  id: number;
  serialNumber: string;
  grnNumber?: string;
}

export interface StockItemSelection {
  item: StockItem;
  selectedSerials: string[];
}

interface StockItemPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (selection: StockItemSelection) => void;
}

export function StockItemPickerDialog({ open, onOpenChange, onSelect }: StockItemPickerDialogProps) {
  const [step, setStep] = useState<"items" | "serials">("items");
  const [search, setSearch] = useState("");
  const [selectedItem, setSelectedItem] = useState<StockItem | null>(null);
  const [serials, setSerials] = useState<Serial[]>([]);
  const [serialsLoading, setSerialsLoading] = useState(false);
  const [serialSearch, setSerialSearch] = useState("");
  const [chosen, setChosen] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) {
      setStep("items");
      setSearch("");
      setSelectedItem(null);
      setSerials([]);
      setSerialSearch("");
      setChosen(new Set());
    }
  }, [open]);

  const { data: items = [], isLoading } = useQuery<StockItem[]>({
    queryKey: ["stock-items-picker", search],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      const res = await fetch(`/api/stock-items?${params}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: open && step === "items",
  });

  async function handleItemClick(item: StockItem) {
    setSelectedItem(item);
    setSerialsLoading(true);
    setStep("serials");
    setSerialSearch("");
    setChosen(new Set());

    try {
      const res = await fetch(
        `/api/stock-serials?stockItemId=${item.id}&status=available`,
        { credentials: "include" }
      );
      const data: Serial[] = res.ok ? await res.json() : [];
      setSerials(data);
    } finally {
      setSerialsLoading(false);
    }
  }

  function toggleSerial(sn: string) {
    setChosen(prev => {
      const next = new Set(prev);
      if (next.has(sn)) next.delete(sn);
      else next.add(sn);
      return next;
    });
  }

  function selectAll() {
    setChosen(new Set(filteredSerials.map(s => s.serialNumber)));
  }

  function selectNone() {
    setChosen(new Set());
  }

  function handleConfirm() {
    if (!selectedItem) return;
    onSelect({ item: selectedItem, selectedSerials: Array.from(chosen) });
    onOpenChange(false);
  }

  const filteredSerials = serials.filter(s =>
    !serialSearch || s.serialNumber.toLowerCase().includes(serialSearch.toLowerCase())
  );

  const allSelected = filteredSerials.length > 0 && filteredSerials.every(s => chosen.has(s.serialNumber));

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); }}>
      <DialogContent className="max-w-lg">

        {step === "items" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Select Stock Item
              </DialogTitle>
            </DialogHeader>

            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search by code or name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
              />
            </div>

            <div className="max-h-80 overflow-y-auto divide-y rounded-md border">
              {isLoading && (
                <div className="py-8 text-center text-sm text-muted-foreground">Loading...</div>
              )}
              {!isLoading && items.length === 0 && (
                <div className="py-8 text-center text-sm text-muted-foreground">No stock items found.</div>
              )}
              {items.map((item) => {
                const qty = Number(item.stockQty) || 0;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors flex items-center justify-between gap-3"
                    onClick={() => handleItemClick(item)}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground">{item.code}</span>
                        <Badge variant={qty > 0 ? "default" : "secondary"} className="text-xs px-1.5 py-0">
                          Qty: {qty} {item.uom}
                        </Badge>
                      </div>
                      <div className="font-medium text-sm truncate mt-0.5">{item.name}</div>
                      {item.description && (
                        <div className="text-xs text-muted-foreground truncate">{item.description}</div>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-medium">{Number(item.unitPrice).toFixed(2)}</div>
                      <div className="text-xs text-muted-foreground">per {item.uom}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {step === "serials" && selectedItem && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setStep("items")}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <span className="truncate">{selectedItem.name}</span>
                <span className="font-mono text-sm font-normal text-muted-foreground shrink-0">
                  {selectedItem.code}
                </span>
              </DialogTitle>
            </DialogHeader>

            {serialsLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : serials.length === 0 ? (
              <div className="py-4 text-center text-sm text-muted-foreground">
                No available serial numbers for this item.
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Search serial numbers..."
                    value={serialSearch}
                    onChange={(e) => setSerialSearch(e.target.value)}
                    autoFocus
                  />
                </div>

                <div className="flex items-center justify-between px-1">
                  <span className="text-xs text-muted-foreground">
                    {chosen.size} of {serials.length} selected
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="text-xs text-primary hover:underline"
                      onClick={allSelected ? selectNone : selectAll}
                    >
                      {allSelected ? "Deselect All" : "Select All"}
                    </button>
                  </div>
                </div>

                <div className="max-h-64 overflow-y-auto space-y-1 border rounded-md p-2">
                  {filteredSerials.map(s => (
                    <label
                      key={s.id}
                      className="flex items-center gap-3 px-2 py-1.5 rounded cursor-pointer hover:bg-muted/50"
                    >
                      <Checkbox
                        checked={chosen.has(s.serialNumber)}
                        onCheckedChange={() => toggleSerial(s.serialNumber)}
                      />
                      <span className="text-sm font-mono flex-1">{s.serialNumber}</span>
                      {s.grnNumber && (
                        <Badge variant="outline" className="text-xs">{s.grnNumber}</Badge>
                      )}
                    </label>
                  ))}
                </div>
              </>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={handleConfirm}>
                {serials.length === 0
                  ? "Add Item"
                  : `Confirm${chosen.size > 0 ? ` (${chosen.size})` : ""}`}
              </Button>
            </DialogFooter>
          </>
        )}

      </DialogContent>
    </Dialog>
  );
}
