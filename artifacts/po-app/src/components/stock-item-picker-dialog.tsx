import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, Package, ArrowLeft, Loader2, Lock } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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
  status: string;
  grnNumber?: string;
  invoiceNumber?: string;
  reservedByUser?: string;
}

export interface StockItemSelection {
  item: StockItem;
  selectedSerials: string[];
  selectedSerialIds: number[];
  qty?: number;
}

interface StockItemPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (selection: StockItemSelection) => void;
  currentInvoiceId?: number;
}

export function StockItemPickerDialog({ open, onOpenChange, onSelect, currentInvoiceId }: StockItemPickerDialogProps) {
  const [step, setStep] = useState<"items" | "serials" | "qty">("items");
  const [search, setSearch] = useState("");
  const [selectedItem, setSelectedItem] = useState<StockItem | null>(null);
  const [serials, setSerials] = useState<Serial[]>([]);
  const [serialsLoading, setSerialsLoading] = useState(false);
  const [serialSearch, setSerialSearch] = useState("");
  const [chosen, setChosen] = useState<Set<number>>(new Set());
  const [qtyInput, setQtyInput] = useState("1");
  const qtyInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setStep("items");
      setSearch("");
      setSelectedItem(null);
      setSerials([]);
      setSerialSearch("");
      setChosen(new Set());
      setQtyInput("1");
    }
  }, [open]);

  useEffect(() => {
    if (step === "qty") {
      setTimeout(() => qtyInputRef.current?.select(), 50);
    }
  }, [step]);

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
        `/api/stock-serials?stockItemId=${item.id}`,
        { credentials: "include" }
      );
      const data: Serial[] = res.ok ? await res.json() : [];
      setSerials(data);
      if (data.length === 0) {
        setQtyInput("1");
        setStep("qty");
      }
    } finally {
      setSerialsLoading(false);
    }
  }

  function toggleSerial(id: number, status: string) {
    if (status === "reserved") return;
    setChosen(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    const available = filteredSerials.filter(s => s.status === "available");
    setChosen(new Set(available.map(s => s.id)));
  }

  function selectNone() {
    setChosen(new Set());
  }

  function handleConfirmSerials() {
    if (!selectedItem) return;
    const chosenSerials = serials.filter(s => chosen.has(s.id));
    onSelect({
      item: selectedItem,
      selectedSerials: chosenSerials.map(s => s.serialNumber),
      selectedSerialIds: chosenSerials.map(s => s.id),
    });
    onOpenChange(false);
  }

  function handleConfirmQty() {
    if (!selectedItem) return;
    const qty = parseInt(qtyInput, 10);
    if (!qty || qty < 1) return;
    const maxQty = Number(selectedItem.stockQty) || 0;
    if (qty > maxQty) return;
    onSelect({
      item: selectedItem,
      selectedSerials: [],
      selectedSerialIds: [],
      qty,
    });
    onOpenChange(false);
  }

  const filteredSerials = serials.filter(s =>
    !serialSearch || s.serialNumber.toLowerCase().includes(serialSearch.toLowerCase())
  );

  const availableCount = serials.filter(s => s.status === "available").length;
  const allAvailableSelected = availableCount > 0 && filteredSerials.filter(s => s.status === "available").every(s => chosen.has(s.id));

  const maxQty = selectedItem ? Number(selectedItem.stockQty) || 0 : 0;
  const parsedQty = parseInt(qtyInput, 10);
  const qtyIsValid = !isNaN(parsedQty) && parsedQty >= 1 && parsedQty <= maxQty;
  const qtyOverMax = !isNaN(parsedQty) && parsedQty > maxQty;

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); }}>
      <DialogContent className="max-w-2xl">

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

            <div className="border rounded-md overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-28">Code</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead className="w-24 text-right">Avail. Qty</TableHead>
                    <TableHead className="w-28 text-right">Unit Price</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                        <Loader2 className="h-5 w-5 animate-spin mx-auto mb-1" />
                        Loading...
                      </TableCell>
                    </TableRow>
                  )}
                  {!isLoading && items.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No stock items found.</TableCell>
                    </TableRow>
                  )}
                  {items.map((item) => {
                    const qty = Number(item.stockQty) || 0;
                    return (
                      <TableRow
                        key={item.id}
                        className="cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => handleItemClick(item)}
                      >
                        <TableCell className="font-mono text-xs">{item.code}</TableCell>
                        <TableCell>
                          <div className="font-medium text-sm">{item.name}</div>
                          {item.description && (
                            <div className="text-xs text-muted-foreground">{item.description}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant={qty > 0 ? "default" : "secondary"} className="text-xs">
                            {qty} {item.uom}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right text-sm font-medium">
                          {Number(item.unitPrice).toFixed(2)}
                          <span className="text-xs text-muted-foreground ml-1">/{item.uom}</span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        )}

        {step === "serials" && selectedItem && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 min-w-0">
                <button
                  type="button"
                  onClick={() => setStep("items")}
                  className="text-muted-foreground hover:text-foreground shrink-0"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <span className="truncate min-w-0" title={selectedItem.name}>{selectedItem.name}</span>
                <span className="font-mono text-sm font-normal text-muted-foreground shrink-0">
                  {selectedItem.code}
                </span>
              </DialogTitle>
            </DialogHeader>

            {serialsLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      className="pl-9"
                      placeholder="Search serial numbers..."
                      value={serialSearch}
                      onChange={(e) => setSerialSearch(e.target.value)}
                      autoFocus
                    />
                  </div>
                  <div className="flex gap-2 text-xs shrink-0">
                    <button
                      type="button"
                      className="text-primary hover:underline"
                      onClick={allAvailableSelected ? selectNone : selectAll}
                    >
                      {allAvailableSelected ? "Deselect All" : "Select All"}
                    </button>
                  </div>
                </div>

                <div className="text-xs text-muted-foreground px-1">
                  {chosen.size} selected · {availableCount} available · {serials.length - availableCount} reserved
                </div>

                <div className="border rounded-md overflow-hidden max-h-72 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="w-10"></TableHead>
                        <TableHead>Serial Number</TableHead>
                        <TableHead className="w-28">GRN #</TableHead>
                        <TableHead className="w-48">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredSerials.map(s => {
                        const isReserved = s.status === "reserved";
                        return (
                          <TableRow
                            key={s.id}
                            className={isReserved ? "opacity-60 bg-muted/20" : "cursor-pointer hover:bg-muted/50"}
                            onClick={() => toggleSerial(s.id, s.status)}
                          >
                            <TableCell>
                              {isReserved ? (
                                <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                              ) : (
                                <Checkbox
                                  checked={chosen.has(s.id)}
                                  onCheckedChange={() => toggleSerial(s.id, s.status)}
                                  onClick={e => e.stopPropagation()}
                                />
                              )}
                            </TableCell>
                            <TableCell className="font-mono text-sm">{s.serialNumber}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{s.grnNumber || "—"}</TableCell>
                            <TableCell>
                              {isReserved ? (
                                <div>
                                  <Badge variant="secondary" className="text-xs mb-0.5">Reserved</Badge>
                                  <div className="text-xs text-muted-foreground leading-tight">
                                    {s.invoiceNumber && <span>for {s.invoiceNumber}</span>}
                                    {s.reservedByUser && <span className="ml-1">by {s.reservedByUser}</span>}
                                  </div>
                                </div>
                              ) : (
                                <Badge variant="outline" className="text-xs text-green-600 border-green-300">Available</Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={handleConfirmSerials} disabled={serialsLoading}>
                {`Confirm${chosen.size > 0 ? ` (${chosen.size})` : ""}`}
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "qty" && selectedItem && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 min-w-0">
                <button
                  type="button"
                  onClick={() => setStep("items")}
                  className="text-muted-foreground hover:text-foreground shrink-0"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <span className="truncate min-w-0" title={selectedItem.name}>{selectedItem.name}</span>
                <span className="font-mono text-sm font-normal text-muted-foreground shrink-0">
                  {selectedItem.code}
                </span>
              </DialogTitle>
            </DialogHeader>

            <div className="py-4 space-y-4">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">
                  QTY / <span className="text-foreground">{maxQty} {selectedItem.uom} available</span>
                </span>
              </div>

              <div className="space-y-1">
                <Input
                  ref={qtyInputRef}
                  type="number"
                  min={1}
                  max={maxQty}
                  value={qtyInput}
                  onChange={(e) => setQtyInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && qtyIsValid) handleConfirmQty();
                  }}
                  className={`text-lg font-semibold w-36 ${qtyOverMax ? "border-red-500 text-red-600 focus-visible:ring-red-500" : ""}`}
                  placeholder="Enter qty"
                  autoFocus
                />
                {qtyOverMax && (
                  <p className="text-xs text-red-600">
                    Qty cannot exceed available stock ({maxQty} {selectedItem.uom})
                  </p>
                )}
                {!isNaN(parsedQty) && parsedQty < 1 && qtyInput !== "" && (
                  <p className="text-xs text-red-600">Qty must be at least 1</p>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={handleConfirmQty} disabled={!qtyIsValid}>
                Import ({qtyIsValid ? parsedQty : "—"} {selectedItem.uom})
              </Button>
            </DialogFooter>
          </>
        )}

      </DialogContent>
    </Dialog>
  );
}
