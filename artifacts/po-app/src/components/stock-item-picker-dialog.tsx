import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Package } from "lucide-react";

interface StockItem {
  id: number;
  code: string;
  name: string;
  description?: string;
  uom: string;
  unitPrice: string;
  stockQty: string;
}

interface StockItemPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (item: StockItem) => void;
}

export function StockItemPickerDialog({ open, onOpenChange, onSelect }: StockItemPickerDialogProps) {
  const [search, setSearch] = useState("");

  const { data: items = [], isLoading } = useQuery<StockItem[]>({
    queryKey: ["stock-items-picker", search],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      const res = await fetch(`/api/stock-items?${params}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: open,
  });

  function handleSelect(item: StockItem) {
    onSelect(item);
    onOpenChange(false);
    setSearch("");
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setSearch(""); }}>
      <DialogContent className="max-w-lg">
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
                onClick={() => handleSelect(item)}
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
      </DialogContent>
    </Dialog>
  );
}
