import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, Package, ArrowLeft, Loader2, Lock } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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

interface Warehouse {
  id: number;
  name: string;
  code: string;
  quantity: number;
  isDefault?: boolean;
}

export interface StockItemSelection {
  item: StockItem;
  selectedSerials: string[];
  selectedSerialIds: number[];
  qty?: number;
  warehouseId?: number;
  warehouseName?: string;
}

interface StockItemPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (selection: StockItemSelection) => void;
  currentInvoiceId?: number;
  /**
   * "issue"   (default) — for sales invoices: only shows warehouses that have stock,
   *                        enforces qty ≤ available, button says "Confirm".
   * "receive"           — for vendor invoices: shows ALL warehouses (we're adding stock),
   *                        no qty upper limit, button says "Receive".
   */
  mode?: "issue" | "receive";
}

export function StockItemPickerDialog({ open, onOpenChange, onSelect, currentInvoiceId, mode = "issue" }: StockItemPickerDialogProps) {
  const isReceiveMode = mode === "receive";
  const [step, setStep] = useState<"items" | "serials" | "qty">("items");
  const [search, setSearch] = useState("");
  const [selectedItem, setSelectedItem] = useState<StockItem | null>(null);
  const [serials, setSerials] = useState<Serial[]>([]);
  const [serialsLoading, setSerialsLoading] = useState(false);
  const [serialSearch, setSerialSearch] = useState("");
  const [chosen, setChosen] = useState<Set<number>>(new Set());
  const [qtyInput, setQtyInput] = useState("1");
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>("");
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
      setSelectedWarehouseId("");
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

  const { data: warehouses = [] } = useQuery<Warehouse[]>({
    queryKey: ["warehouse-stock", selectedItem?.id, isReceiveMode],
    queryFn: async () => {
      if (!selectedItem) return [];

      // Always load all active warehouses + balances so Main Warehouse
      // (and others) appear whether stock was transferred or not.
      const [allRes, balRes] = await Promise.all([
        fetch("/api/warehouses", { credentials: "include" }),
        fetch(
          `/api/inventory/warehouse-stock?stockItemId=${selectedItem.id}`,
          { credentials: "include" }
        ),
      ]);
      if (!allRes.ok) return [];
      const all: any[] = await allRes.json();
      const balances: Warehouse[] = balRes.ok ? await balRes.json() : [];
      const balMap = new Map(balances.map((b) => [b.id, Number(b.quantity) || 0]));

      const byId = new Map(
        all
          .filter((w: any) => w.isActive !== false)
          .map((w: any) => [
            w.id,
            {
              id: w.id as number,
              name: String(w.name),
              code: String(w.code),
              quantity: balMap.has(w.id) ? (balMap.get(w.id) as number) : 0,
              isDefault: !!w.isDefault,
            } satisfies Warehouse,
          ])
      );

      // Merge stock API balances (includes Main / legacy qty fallback)
      for (const b of balances) {
        const existing = byId.get(b.id);
        if (existing) {
          existing.quantity = Number(b.quantity) || 0;
          existing.isDefault = existing.isDefault || !!b.isDefault;
        } else {
          byId.set(b.id, {
            id: b.id,
            name: b.name,
            code: b.code,
            quantity: Number(b.quantity) || 0,
            isDefault: !!b.isDefault,
          });
        }
      }

      // Show every active warehouse (Main included even at 0 pcs)
      return Array.from(byId.values()).sort((a, b) => {
        if (a.isDefault && !b.isDefault) return -1;
        if (!a.isDefault && b.isDefault) return 1;
        if (a.code === "MAIN" && b.code !== "MAIN") return -1;
        if (a.code !== "MAIN" && b.code === "MAIN") return 1;
        return b.quantity - a.quantity;
      });
    },
    enabled: open && step === "qty" && selectedItem !== null,
  });

  useEffect(() => {
    if (warehouses.length > 0 && !selectedWarehouseId) {
      // Prefer default warehouse when it has stock; otherwise first warehouse with stock; else Main.
      const defaultWh =
        warehouses.find((w) => w.isDefault && w.quantity > 0) ??
        warehouses.find((w) => w.quantity > 0) ??
        warehouses.find((w) => w.isDefault) ??
        warehouses[0];
      setSelectedWarehouseId(String(defaultWh.id));
    }
  }, [warehouses, selectedWarehouseId]);

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
    if (!isReceiveMode && qty > maxQty) return;
    
    const selectedWarehouse = warehouses.find(w => String(w.id) === selectedWarehouseId);
    if (!selectedWarehouse) return;
    
    onSelect({
      item: selectedItem,
      selectedSerials: [],
      selectedSerialIds: [],
      qty,
      warehouseId: selectedWarehouse.id,
      warehouseName: selectedWarehouse.name,
    });
    onOpenChange(false);
  }

  const filteredSerials = serials.filter(s =>
    !serialSearch || s.serialNumber.toLowerCase().includes(serialSearch.toLowerCase())
  );

  const availableCount = serials.filter(s => s.status === "available").length;
  const allAvailableSelected = availableCount > 0 && filteredSerials.filter(s => s.status === "available").every(s => chosen.has(s.id));

  const selectedWarehouse = warehouses.find(w => String(w.id) === selectedWarehouseId);
  const maxQty = selectedWarehouse
    ? Number(selectedWarehouse.quantity) || 0
    : selectedItem
      ? Number(selectedItem.stockQty) || 0
      : 0;
  const parsedQty = parseInt(qtyInput, 10);
  // In receive mode there is no upper-bound (we are adding stock)
  const qtyIsValid = !isNaN(parsedQty) && parsedQty >= 1 && (isReceiveMode || parsedQty <= maxQty);
  const qtyOverMax = !isReceiveMode && !isNaN(parsedQty) && parsedQty > maxQty;

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

            <div className="py-4 space-y-4">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">
                  {isReceiveMode ? (
                    <>
                      QTY TO RECEIVE /{" "}
                      <span className="text-foreground">
                        {selectedWarehouse
                          ? `currently ${maxQty} ${selectedItem.uom} in ${selectedWarehouse.name}`
                          : `enter quantity to receive`}
                      </span>
                    </>
                  ) : (
                    <>
                      QTY / <span className="text-foreground">
                        {selectedWarehouse
                          ? `${maxQty} ${selectedItem.uom} in ${selectedWarehouse.name}`
                          : `${maxQty} ${selectedItem.uom} available`}
                      </span>
                    </>
                  )}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Quantity</label>
                  <Input
                    ref={qtyInputRef}
                    type="number"
                    min={1}
                    max={isReceiveMode ? undefined : maxQty}
                    value={qtyInput}
                    onChange={(e) => setQtyInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && qtyIsValid && selectedWarehouseId) handleConfirmQty();
                    }}
                    className={`text-lg font-semibold ${qtyOverMax ? "border-red-500 text-red-600 focus-visible:ring-red-500" : ""}`}
                    placeholder="Enter qty"
                    autoFocus
                  />
                  {qtyOverMax && (
                    <p className="text-xs text-red-600">
                      Qty cannot exceed available stock ({maxQty} {selectedItem.uom})
                    </p>
                  )}
                </div>

                  {!isNaN(parsedQty) && parsedQty < 1 && qtyInput !== "" && (
                    <p className="text-xs text-red-600">Qty must be at least 1</p>
                  )}

                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {isReceiveMode ? "Receive Into Warehouse" : "Warehouse"}
                  </label>
                  <Select value={selectedWarehouseId} onValueChange={setSelectedWarehouseId}>
                    <SelectTrigger className="h-10">
                      <SelectValue placeholder="Select warehouse" />
                    </SelectTrigger>
                    <SelectContent>
                      {warehouses.length === 0 ? (
                        <div className="px-2 py-1.5 text-xs text-muted-foreground">
                          {isReceiveMode ? "No warehouses found" : "No warehouses with stock"}
                        </div>
                      ) : (
                        warehouses.map(wh => (
                          <SelectItem key={wh.id} value={String(wh.id)}>
                            <span className="font-medium">{wh.name}</span>
                            <span className="text-xs text-muted-foreground ml-2">
                              {isReceiveMode
                                ? `(current: ${Number(wh.quantity).toFixed(0)} ${selectedItem.uom})`
                                : `(${Number(wh.quantity).toFixed(0)} ${selectedItem.uom})`}
                            </span>
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={handleConfirmQty} disabled={!qtyIsValid || !selectedWarehouseId}>
                {isReceiveMode
                  ? `Receive (${qtyIsValid ? parsedQty : "—"} ${selectedItem.uom})`
                  : `Confirm (${qtyIsValid ? parsedQty : "—"} ${selectedItem.uom})`}
              </Button>
            </DialogFooter>
          </>
        )}

      </DialogContent>
    </Dialog>
  );
}
