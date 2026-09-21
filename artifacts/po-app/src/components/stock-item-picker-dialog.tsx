import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Search, Package, ArrowLeft, Loader2, Lock, MoreVertical } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface PurchasePriceHistoryRow {
  id: number;
  purchasePrice: string;
  effectiveDate: string;
  sourceType: string;
  sourceRef?: string | null;
  quantity?: string | number | null;
}

interface StockItem {
  id: number;
  code: string;
  name: string;
  description?: string;
  uom: string;
  unitPrice: string;
  purchasePrice?: string;
  stockQty: string;
  purchasePriceHistory?: PurchasePriceHistoryRow[];
  /** Set on expanded picker rows */
  priceDate?: string | null;
  priceSource?: string;
  priceSourceRef?: string | null;
  isHistoryRow?: boolean;
  rowKey?: string;
  displayStockQty?: number;
}

function sellFromCatalogueMarkup(oldCost: number, oldSell: number, newCost: number): number | null {
  if (!(oldCost > 0) || !(newCost >= 0) || !Number.isFinite(oldSell)) return null;
  const markupPct = ((oldSell - oldCost) / oldCost) * 100;
  return Math.round(newCost * (1 + markupPct / 100) * 100) / 100;
}

function formatPriceDate(ymd?: string | null) {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
}

/**
 * Picker: price rows from VI / Item Master when purchase price differs;
 * Avail. Qty = lot qty on price rows, remaining on Active/catalogue.
 */
function expandPickerPriceRows(items: StockItem[]): StockItem[] {
  const out: StockItem[] = [];
  for (const item of items) {
    const history = Array.isArray(item.purchasePriceHistory) ? [...item.purchasePriceHistory] : [];
    const baseCost = parseFloat(String(item.purchasePrice ?? 0)) || 0;
    const baseSell = parseFloat(String(item.unitPrice ?? 0)) || 0;
    const baseCents = Math.round(baseCost * 100);
    const totalQty = parseFloat(String(item.stockQty ?? 0)) || 0;

    const byPrice = new Map<number, {
      id: number;
      purchasePrice: string;
      quantity: number;
      effectiveDate: string;
      sourceType: string;
      sourceRef: string | null;
    }>();
    for (const h of history) {
      const cents = Math.round((parseFloat(String(h.purchasePrice ?? 0)) || 0) * 100);
      const histQty = Math.max(0, parseFloat(String(h.quantity ?? 0)) || 0);
      if (cents === baseCents && histQty <= 0) continue;
      const existing = byPrice.get(cents);
      if (existing) {
        existing.quantity += histQty;
        if (String(h.effectiveDate || "") >= existing.effectiveDate) {
          existing.effectiveDate = String(h.effectiveDate || "");
          existing.sourceRef = h.sourceRef ?? existing.sourceRef;
          existing.id = h.id;
          existing.sourceType = h.sourceType;
        }
      } else {
        byPrice.set(cents, {
          id: h.id,
          purchasePrice: Number(h.purchasePrice).toFixed(2),
          quantity: histQty,
          effectiveDate: String(h.effectiveDate || ""),
          sourceType: h.sourceType,
          sourceRef: h.sourceRef ?? null,
        });
      }
    }

    const priceRows = Array.from(byPrice.values()).sort((a, b) =>
      b.effectiveDate.localeCompare(a.effectiveDate) || b.id - a.id,
    );

    let historyQtySum = 0;
    const group: StockItem[] = [];
    for (const h of priceRows) {
      historyQtySum += h.quantity;
      const newCost = parseFloat(h.purchasePrice) || 0;
      const computedSell = sellFromCatalogueMarkup(baseCost, baseSell, newCost);
      group.push({
        ...item,
        rowKey: `${item.id}-p-${h.purchasePrice}`,
        purchasePrice: h.purchasePrice,
        unitPrice: computedSell != null ? String(computedSell) : item.unitPrice,
        stockQty: String(h.quantity),
        displayStockQty: h.quantity,
        priceDate: h.effectiveDate || null,
        isHistoryRow: true,
        priceSource: h.sourceType,
        priceSourceRef: h.sourceRef,
      });
    }

    const baseStockQty = Math.max(0, Math.round((totalQty - historyQtySum) * 1000) / 1000);
    group.push({
      ...item,
      rowKey: `${item.id}-base`,
      purchasePrice: item.purchasePrice ?? "0",
      unitPrice: item.unitPrice,
      stockQty: String(baseStockQty),
      displayStockQty: baseStockQty,
      priceDate: null,
      isHistoryRow: false,
    });

    for (const row of group) out.push(row);
  }
  return out;
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
  quantity?: number;
  isDefault?: boolean;
  isActive?: boolean;
}

export interface StockItemSelection {
  item: StockItem;
  selectedSerials: string[];
  selectedSerialIds: number[];
  /** Always the warehouse quantity to issue — never inferred from serial count alone. */
  qty: number;
  warehouseId?: number;
  warehouseName?: string;
}

interface StockItemPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (selection: StockItemSelection) => void;
  currentInvoiceId?: number;
  /** Present on some callers; stock deduction always uses entered qty. */
  mode?: string;
  /** Skip available-stock cap (quotations, orders, etc. that do not issue stock). */
  ignoreStockLimit?: boolean;
  /** Show warehouse dropdown on qty step (default true). */
  showWarehouse?: boolean;
  /** Require warehouse before import (invoices, delivery orders, GRN). */
  requireWarehouse?: boolean;
  skipSerialSelection?: boolean;
}

export function StockItemPickerDialog({
  open,
  onOpenChange,
  onSelect,
  mode,
  ignoreStockLimit: ignoreStockLimitProp,
  showWarehouse: showWarehouseProp,
  requireWarehouse: requireWarehouseProp,
  skipSerialSelection = false,
}: StockItemPickerDialogProps) {
  const ignoreStockLimit = ignoreStockLimitProp ?? mode === "receive";
  const showWarehouse = showWarehouseProp ?? true;
  const requireWarehouse =
    showWarehouse && (requireWarehouseProp ?? (!ignoreStockLimit || mode === "receive"));
  const [step, setStep] = useState<"items" | "qty" | "serials">("items");
  const [search, setSearch] = useState("");
  const [selectedItem, setSelectedItem] = useState<StockItem | null>(null);
  const [serials, setSerials] = useState<Serial[]>([]);
  const [serialsLoading, setSerialsLoading] = useState(false);
  const [serialSearch, setSerialSearch] = useState("");
  const [chosen, setChosen] = useState<Set<number>>(new Set());
  const [qtyInput, setQtyInput] = useState("1");
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<number | null>(null);
  /** Once the user picks a warehouse, never auto-switch (that caused A OUT + B IN lookalikes). */
  const [warehouseLockedByUser, setWarehouseLockedByUser] = useState(false);
  /** Confirmed invoice qty from the qty step — serial picking must not replace this. */
  const [confirmedQty, setConfirmedQty] = useState<number | null>(null);
  const qtyInputRef = useRef<HTMLInputElement>(null);
  const warehouseTriggerRef = useRef<HTMLButtonElement>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!open) {
      setStep("items");
      setSearch("");
      setSelectedItem(null);
      setSerials([]);
      setSerialSearch("");
      setChosen(new Set());
      setQtyInput("1");
      setSelectedWarehouseId(null);
      setWarehouseLockedByUser(false);
      setConfirmedQty(null);
      return;
    }
    // Balances move whenever another document is saved, so start each visit
    // from the server instead of showing what was cached last time.
    queryClient.removeQueries({ queryKey: ["stock-items-picker"] });
    queryClient.removeQueries({ queryKey: ["invoice-warehouses"] });
    queryClient.removeQueries({ queryKey: ["invoice-warehouse-stock"] });
  }, [open, queryClient]);

  useEffect(() => {
    if (step !== "qty") return;
    setTimeout(() => {
      if (showWarehouse) warehouseTriggerRef.current?.focus();
      else {
        qtyInputRef.current?.focus();
        qtyInputRef.current?.select();
      }
    }, 50);
  }, [step, showWarehouse]);

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
    // Quantities change with every document, so never show a cached balance.
    staleTime: 0,
    refetchOnMount: "always",
  });

  const displayItems = useMemo(() => expandPickerPriceRows(items), [items]);

  const { data: warehouses = [], isFetching: warehousesFetching } = useQuery<Warehouse[]>({
    queryKey: ["invoice-warehouses"],
    queryFn: async () => {
      const res = await fetch("/api/warehouses", { credentials: "include" });
      if (!res.ok) return [];
      const rows: Warehouse[] = await res.json();
      return rows
        .filter((warehouse) => warehouse.isActive !== false)
        .sort((a, b) => {
          if (!!a.isDefault !== !!b.isDefault) return a.isDefault ? -1 : 1;
          return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
        });
    },
    enabled: open,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const { data: warehouseStock = [], isFetching: warehouseStockFetching } = useQuery<Warehouse[]>({
    queryKey: ["invoice-warehouse-stock", selectedItem?.id],
    queryFn: async () => {
      const res = await fetch(
        `/api/inventory/warehouse-stock?stockItemId=${selectedItem!.id}`,
        { credentials: "include" },
      );
      return res.ok ? res.json() : [];
    },
    enabled: open && !!selectedItem,
    staleTime: 0,
    refetchOnMount: "always",
  });

  // Cap warehouse Avail by the selected price-lot qty (same as Item Master / picker list).
  // Catalogue row with 0 must not show Main Warehouse (12) on the next step.
  const lotAvailQty = selectedItem
    ? Math.max(0, Number(selectedItem.displayStockQty ?? selectedItem.stockQty) || 0)
    : null;

  const warehouseOptions = useMemo(() => {
    let remaining = lotAvailQty;
    return warehouses.map((warehouse) => {
      const physical = Number(
        warehouseStock.find((stock) => stock.id === warehouse.id)?.quantity ?? 0,
      ) || 0;
      if (remaining == null) {
        return { ...warehouse, quantity: physical };
      }
      const take = Math.min(physical, remaining);
      remaining = Math.round((remaining - take) * 1000) / 1000;
      return { ...warehouse, quantity: take };
    });
  }, [warehouses, warehouseStock, lotAvailQty]);

  // Warehouse is NEVER auto-selected (highest qty / default caused wrong-WH Tax Invoice OUTs).
  // User must pick the warehouse explicitly before confirming.

  async function handleItemClick(item: StockItem) {
    setSelectedItem(item);
    setSelectedWarehouseId(null);
    setWarehouseLockedByUser(false);
    setQtyInput("1");
    setConfirmedQty(null);
    setChosen(new Set());
    setSerialSearch("");
    setSerials([]);
    // Always enter quantity first. Serial count must never become the invoice qty.
    setStep("qty");
    setSerialsLoading(true);
    try {
      const res = await fetch(
        `/api/stock-serials?stockItemId=${item.id}`,
        { credentials: "include" },
      );
      const data: Serial[] = res.ok ? await res.json() : [];
      setSerials(data);
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
    const limit = confirmedQty ?? available.length;
    setChosen(new Set(available.slice(0, limit).map(s => s.id)));
  }

  function selectNone() {
    setChosen(new Set());
  }

  function emitSelection(selectedSerials: string[], selectedSerialIds: number[], qty: number) {
    if (!selectedItem) return;
    if (requireWarehouse && !selectedWarehouseId) return;
    const warehouse = selectedWarehouseId
      ? warehouseOptions.find((item) => item.id === selectedWarehouseId)
      : undefined;
    onSelect({
      item: selectedItem,
      selectedSerials,
      selectedSerialIds,
      qty,
      warehouseId: warehouse?.id,
      warehouseName: warehouse?.name,
    });
    onOpenChange(false);
  }

  function handleConfirmQty() {
    if (!selectedItem) return;
    const qty = Number(qtyInput);
    if (!Number.isFinite(qty) || qty <= 0) return;
    const warehouse = warehouseOptions.find((item) => item.id === selectedWarehouseId);
    const maxAllowed = selectedWarehouseId
      ? Number(warehouse?.quantity) || 0
      : Number(selectedItem.stockQty) || 0;
    if (!ignoreStockLimit && qty > maxAllowed) return;

    const availableSerials = serials.filter((s) => s.status === "available");
    // Optional serial tracking: only prompt when serials exist. Qty stays authoritative.
    if (availableSerials.length > 0 && !skipSerialSelection) {
      setConfirmedQty(qty);
      setChosen(new Set());
      setSerialSearch("");
      setStep("serials");
      return;
    }

    emitSelection([], [], qty);
  }

  function handleConfirmSerials() {
    if (!selectedItem || confirmedQty == null) return;
    if (chosen.size > 0 && chosen.size !== confirmedQty) return;
    const chosenSerials = serials.filter(s => chosen.has(s.id));
    emitSelection(
      chosenSerials.map(s => s.serialNumber),
      chosenSerials.map(s => s.id),
      confirmedQty,
    );
  }

  function handleSkipSerials() {
    if (confirmedQty == null) return;
    emitSelection([], [], confirmedQty);
  }

  const filteredSerials = serials.filter(s =>
    !serialSearch || s.serialNumber.toLowerCase().includes(serialSearch.toLowerCase())
  );

  const availableCount = serials.filter(s => s.status === "available").length;
  const allAvailableSelected = availableCount > 0 && filteredSerials.filter(s => s.status === "available").every(s => chosen.has(s.id));

  const selectedWarehouse = warehouseOptions.find((warehouse) => warehouse.id === selectedWarehouseId);
  const stockLoading = warehousesFetching || warehouseStockFetching;
  const maxQty = selectedItem
    ? (selectedWarehouseId
      ? Number(selectedWarehouse?.quantity) || 0
      : Number(selectedItem.stockQty) || 0)
    : 0;
  const parsedQty = Number(qtyInput);
  const qtyWithinStock = ignoreStockLimit || parsedQty <= maxQty;
  const qtyIsValid = (!showWarehouse || !stockLoading) && Number.isFinite(parsedQty) && parsedQty > 0 && qtyWithinStock;
  const warehouseOk = !requireWarehouse || !!selectedWarehouseId;
  const serialSelectionOk = chosen.size === 0 || (confirmedQty != null && chosen.size === confirmedQty);

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); }}>
      <DialogContent className="max-w-4xl">

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
                    <TableHead className="w-32 min-w-[7.5rem] text-right whitespace-nowrap">Avail. Qty</TableHead>
                    <TableHead className="w-28 text-right whitespace-nowrap">Purchase Price</TableHead>
                    <TableHead className="w-28 text-right whitespace-nowrap">Selling Price</TableHead>
                    <TableHead className="w-20 text-center whitespace-nowrap">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        <Loader2 className="h-5 w-5 animate-spin mx-auto mb-1" />
                        Loading...
                      </TableCell>
                    </TableRow>
                  )}
                  {!isLoading && displayItems.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No stock items found.</TableCell>
                    </TableRow>
                  )}
                  {!isLoading && displayItems.map((item) => {
                    const qty = Number(item.displayStockQty ?? item.stockQty);
                    const avail = Number.isFinite(qty) ? qty : 0;
                    const availLabel = Number.isInteger(avail)
                      ? String(avail)
                      : avail.toFixed(3).replace(/\.?0+$/, "");
                    const purchase = Number(item.purchasePrice ?? 0);
                    const unit = Number(item.unitPrice || 0);
                    const dateLabel = formatPriceDate(item.priceDate);
                    return (
                      <TableRow
                        key={item.rowKey || String(item.id)}
                        className="cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => handleItemClick(item)}
                      >
                        <TableCell className="font-mono text-xs">{item.code}</TableCell>
                        <TableCell>
                          <div className="font-medium text-sm">{item.name}</div>
                          {item.isHistoryRow ? (
                            <div className="text-xs text-muted-foreground">
                              {item.priceSource === "vendor_invoice"
                                ? (item.priceSourceRef ? `Vendor Invoice ${item.priceSourceRef}` : "Vendor Invoice price")
                                : "Price change"}
                              {dateLabel ? ` · ${dateLabel}` : ""}
                            </div>
                          ) : item.description ? (
                            <div className="text-xs text-muted-foreground">{item.description}</div>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge
                            variant={avail > 0 ? "default" : "secondary"}
                            className="text-xs font-semibold tabular-nums"
                          >
                            {availLabel} {item.uom || ""}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right text-sm font-medium tabular-nums">
                          {purchase.toFixed(2)}
                          <span className="text-xs text-muted-foreground ml-1">/{item.uom || "—"}</span>
                        </TableCell>
                        <TableCell className="text-right text-sm font-medium tabular-nums">
                          {unit.toFixed(2)}
                          <span className="text-xs text-muted-foreground ml-1">/{item.uom || "—"}</span>
                        </TableCell>
                        <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button type="button" variant="ghost" size="icon" className="h-8 w-8">
                                <MoreVertical className="h-4 w-4" />
                                <span className="sr-only">Actions</span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleItemClick(item)}>
                                Select
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
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
              {showWarehouse ? (
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Warehouse{requireWarehouse ? <span className="text-destructive"> *</span> : " (optional)"}
                  </label>
                  <Select
                    value={selectedWarehouseId != null ? String(selectedWarehouseId) : ""}
                    onValueChange={(value) => {
                      if (!value) return;
                      setSelectedWarehouseId(Number(value));
                      setWarehouseLockedByUser(true);
                      setQtyInput("1");
                      setTimeout(() => {
                        qtyInputRef.current?.focus();
                        qtyInputRef.current?.select();
                      }, 0);
                    }}
                  >
                    <SelectTrigger ref={warehouseTriggerRef} className="w-full">
                      <SelectValue placeholder="Select warehouse" />
                    </SelectTrigger>
                    <SelectContent>
                      {warehouseOptions.map((warehouse) => (
                        <SelectItem key={warehouse.id} value={String(warehouse.id)}>
                          {warehouse.name} ({stockLoading ? "…" : `${Number(warehouse.quantity) || 0} ${selectedItem.uom}`})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}

              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">
                  QTY / <span className="text-foreground">
                    {showWarehouse
                      ? (stockLoading
                        ? "Checking availability…"
                        : selectedWarehouseId
                          ? `${maxQty} ${selectedItem.uom} available in warehouse`
                          : `${Number(selectedItem.stockQty) || 0} ${selectedItem.uom} available${requireWarehouse ? " (select warehouse)" : ""}`)
                      : `${Number(selectedItem.stockQty) || 0} ${selectedItem.uom} available`}
                  </span>
                </span>
              </div>

              <div className="space-y-1">
                <Input
                  ref={qtyInputRef}
                  type="text" inputMode="decimal"
                  min={1}
                  max={ignoreStockLimit ? undefined : maxQty}
                  value={qtyInput}
                  onChange={(e) => setQtyInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && qtyIsValid && warehouseOk) handleConfirmQty();
                  }}
                  className="text-lg font-semibold w-36"
                  placeholder="Enter qty"
                />
                {serialsLoading && (
                  <p className="text-xs text-muted-foreground">Checking serial numbers…</p>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={handleConfirmQty} disabled={!qtyIsValid || !warehouseOk || serialsLoading}>
                {availableCount > 0
                  ? `Next · Pick serials (${qtyIsValid ? parsedQty : "—"} ${selectedItem.uom})`
                  : `Import (${qtyIsValid ? parsedQty : "—"} ${selectedItem.uom})`}
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "serials" && selectedItem && confirmedQty != null && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 min-w-0">
                <button
                  type="button"
                  onClick={() => setStep("qty")}
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
                <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                  Invoice quantity: <span className="font-semibold">{confirmedQty} {selectedItem.uom}</span>
                  <span className="text-muted-foreground"> — stock will reduce by this amount. Serials are optional.</span>
                </div>

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
                  {chosen.size > 0 && chosen.size !== confirmedQty && (
                    <span className="text-red-600 ml-2">
                      Select exactly {confirmedQty} serials, or skip serials.
                    </span>
                  )}
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

            <DialogFooter className="gap-2 sm:gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button variant="secondary" onClick={handleSkipSerials} disabled={serialsLoading || stockLoading}>
                Skip serials · Import {confirmedQty}
              </Button>
              <Button
                onClick={handleConfirmSerials}
                disabled={serialsLoading || stockLoading || !warehouseOk || !serialSelectionOk || chosen.size === 0}
              >
                {`Import with serials (${chosen.size}/${confirmedQty})`}
              </Button>
            </DialogFooter>
          </>
        )}

      </DialogContent>
    </Dialog>
  );
}
