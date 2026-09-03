import { useMemo, useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, PackageCheck, PackagePlus, Plus, Trash2 } from "lucide-react";
import { fmtDate } from "@/lib/utils";

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}

interface GrnItem {
  partNumber?: string;
  description: string;
  qty: number;
  unitPrice: number;
  amount: number;
  received: boolean;
  isStockItem: boolean;
  serialNumbers: string;
  warehouseName?: string;
  warehouseId?: number;
  stockItemId?: number;
}

interface Grn {
  id: number;
  grnNumber: string;
  poId: number | null;
  poNumber: string;
  vendorName: string;
  companyId: number;
  status: string;
  items: GrnItem[];
  createdBy: number;
  createdAt: string;
  updatedAt: string;
}

function emptyItem(): GrnItem {
  return {
    partNumber: "",
    description: "",
    qty: 1,
    unitPrice: 0,
    amount: 0,
    received: false,
    isStockItem: false,
    serialNumbers: "",
  };
}

async function receiveGrn(id: number, items: GrnItem[]): Promise<Grn> {
  const res = await fetch(`/api/grn/${id}/receive`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ items }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to confirm goods received");
  }
  return res.json();
}

async function createManualGrn(payload: {
  vendorName: string;
  poNumber: string;
  poId?: number | null;
  items: GrnItem[];
}): Promise<Grn> {
  const res = await fetch("/api/grn", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({} as any));
    throw new Error(err.error || err.message || `Failed to create GRN (${res.status})`);
  }
  return res.json();
}

export default function GrnNew() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [poPickerOpen, setPoPickerOpen] = useState(false);
  const [poSearch, setPoSearch] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [grn, setGrn] = useState<Grn | null>(null);
  const [items, setItems] = useState<GrnItem[]>([emptyItem()]);
  const [isDirty, setIsDirty] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const poInputRef = useRef<HTMLInputElement>(null);
  const poDropdownRef = useRef<HTMLDivElement>(null);

  const { data: pos = [], isLoading: posLoading } = useQuery<any[]>({
    queryKey: ["purchase-orders-for-grn"],
    queryFn: async () => {
      const res = await fetch("/api/purchase-orders", { credentials: "include" });
      if (!res.ok) return [];
      const all = await res.json();
      return all.filter((p: any) => ["confirmed", "sent"].includes(p.status));
    },
  });

  const { data: existingGrns = [] } = useQuery<any[]>({
    queryKey: ["grns"],
    queryFn: async () => {
      const res = await fetch("/api/grn", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const grnByPoId = useMemo(() => {
    const map = new Map<number, any>();
    for (const g of existingGrns) {
      if (g.poId != null) map.set(g.poId, g);
    }
    return map;
  }, [existingGrns]);

  const availablePos = useMemo(
    () => pos.filter((p: any) => !grnByPoId.has(p.id)),
    [pos, grnByPoId],
  );

  const filteredPos = useMemo(() => {
    const q = poSearch.trim().toLowerCase();
    if (!q) return availablePos;
    return availablePos.filter(
      (p: any) =>
        String(p.poNumber || "").toLowerCase().includes(q) ||
        String(p.vendorName || "").toLowerCase().includes(q),
    );
  }, [availablePos, poSearch]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (
        poDropdownRef.current && !poDropdownRef.current.contains(t) &&
        poInputRef.current && !poInputRef.current.contains(t)
      ) {
        setPoPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const resolveAndCreatePo = (raw: string) => {
    const typed = raw.trim().toLowerCase();
    if (!typed) {
      toast({ title: "Enter a PO reference", variant: "destructive" });
      return;
    }
    const match =
      availablePos.find((p: any) => String(p.poNumber || "").toLowerCase() === typed) ||
      availablePos.find((p: any) => String(p.poNumber || "").toLowerCase().includes(typed));
    if (!match) {
      // Keep as free-text PO reference for manual GRN
      setPoSearch(raw.trim());
      setPoPickerOpen(false);
      toast({
        title: "Manual PO reference",
        description: "No matching PO found — you can enter items manually.",
      });
      return;
    }
    createFromPo(match.id);
  };

  useEffect(() => {
    if (grn) {
      setItems(grn.items.map((item) => ({ ...item, isStockItem: (item as any).isStockItem ?? false })));
      setVendorName(grn.vendorName || "");
      setPoSearch(grn.poNumber || "");
      setIsDirty(false);
    }
  }, [grn]);

  const createFromPo = async (poId: number) => {
    setCreating(true);
    try {
      const res = await fetch(`/api/grn/from-po/${poId}`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to create GRN");
      }
      const created = await res.json();
      queryClient.invalidateQueries({ queryKey: ["grns"] });
      setGrn(created);
      toast({
        title: "GRN Created",
        description: `${created.grnNumber} ready — mark items received and confirm.`,
      });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setCreating(false);
      setPoPickerOpen(false);
    }
  };

  const receiveMutation = useMutation({
    mutationFn: (updatedItems: GrnItem[]) => receiveGrn(grn!.id, updatedItems),
    onSuccess: (updated) => {
      queryClient.setQueryData(["grn", String(updated.id)], updated);
      queryClient.invalidateQueries({ queryKey: ["grns"] });
      queryClient.invalidateQueries({ queryKey: ["stock-items"] });
      setGrn(updated);
      setIsDirty(false);
      setConfirmOpen(false);
      toast({ title: "Goods Received", description: "GRN confirmed and stock updated successfully." });
      setLocation("/grn");
    },
    onError: (err: any) => {
      setConfirmOpen(false);
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const allReceived = items.length > 0 && items.every((i) => i.received);
  const someReceived = items.some((i) => i.received) && !allReceived;
  const allStockItems = items.length > 0 && items.every((i) => i.isStockItem);
  const someStockItems = items.some((i) => i.isStockItem) && !allStockItems;
  const receivedCount = items.filter((i) => i.received).length;
  const receivedItems = items.filter((i) => i.received);
  const missingSerials = receivedItems.filter((i) => i.isStockItem && !i.serialNumbers.trim());
  const linkedFromPo = !!grn?.poId;

  const handleSelectAll = (checked: boolean) => {
    setItems((prev) => prev.map((item) => ({ ...item, received: checked })));
    setIsDirty(true);
  };

  const handleSelectAllStockItems = (checked: boolean) => {
    setItems((prev) => prev.map((item) => ({ ...item, isStockItem: checked })));
    setIsDirty(true);
  };

  const handleToggleReceived = (index: number, checked: boolean) => {
    setItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], received: checked };
      return next;
    });
    setIsDirty(true);
  };

  const handleToggleIsStockItem = (index: number, checked: boolean) => {
    setItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], isStockItem: checked };
      return next;
    });
    setIsDirty(true);
  };

  const handleSerialNumbers = (index: number, value: string) => {
    setItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], serialNumbers: value };
      return next;
    });
    setIsDirty(true);
  };

  const updateItemField = (index: number, field: keyof GrnItem, value: string | number) => {
    setItems((prev) => {
      const next = [...prev];
      const row = { ...next[index], [field]: value };
      if (field === "qty" || field === "unitPrice") {
        row.amount = (Number(row.qty) || 0) * (Number(row.unitPrice) || 0);
      }
      next[index] = row;
      return next;
    });
    setIsDirty(true);
  };

  const addItem = () => {
    setItems((prev) => [...prev, emptyItem()]);
    setIsDirty(true);
  };

  const removeItem = (index: number) => {
    setItems((prev) => (prev.length <= 1 ? [emptyItem()] : prev.filter((_, i) => i !== index)));
    setIsDirty(true);
  };

  const handleReceiveClick = () => {
    const usableItems = items.filter(
      (i) => (i.description || "").trim() || (i.partNumber || "").trim(),
    );
    if (usableItems.length === 0) {
      toast({
        title: "No items",
        description: "Add at least one item with a description or part number.",
        variant: "destructive",
      });
      return;
    }
    if (!vendorName.trim()) {
      toast({
        title: "Vendor required",
        description: "Enter a vendor name (or select a PO to load one).",
        variant: "destructive",
      });
      return;
    }
    if (receivedItems.length === 0) {
      toast({ title: "No items selected", description: "Please check at least one item as received.", variant: "destructive" });
      return;
    }
    setConfirmOpen(true);
  };

  const confirmReceive = async () => {
    setSubmitting(true);
    try {
      let current = grn;
      const payloadItems = items
        .filter((i) => (i.description || "").trim() || (i.partNumber || "").trim())
        .map((i) => ({
          ...i,
          // Keep backend newline split working when user types commas in the single-line field
          serialNumbers: String(i.serialNumbers || "")
            .split(/[\n,]+/)
            .map((s) => s.trim())
            .filter(Boolean)
            .join("\n"),
        }));

      if (!current) {
        current = await createManualGrn({
          vendorName: vendorName.trim(),
          poNumber: poSearch.trim(),
          items: payloadItems,
        });
        queryClient.invalidateQueries({ queryKey: ["grns"] });
        setGrn(current);
      }

      const updated = await receiveGrn(current.id, payloadItems);
      queryClient.setQueryData(["grn", String(updated.id)], updated);
      queryClient.invalidateQueries({ queryKey: ["grns"] });
      queryClient.invalidateQueries({ queryKey: ["stock-items"] });
      setConfirmOpen(false);
      toast({ title: "Goods Received", description: "GRN confirmed and stock updated successfully." });
      setLocation("/grn");
    } catch (err: any) {
      setConfirmOpen(false);
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const statusBadge = grn ? (
    grn.status === "complete" ? (
      <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white">Confirmed</Badge>
    ) : grn.status === "partial" ? (
      <Badge className="bg-amber-500 hover:bg-amber-600 text-white">Partial</Badge>
    ) : (
      <Badge variant="secondary">Draft</Badge>
    )
  ) : (
    <Badge variant="secondary">Draft</Badge>
  );

  const busy = creating || submitting || receiveMutation.isPending;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/grn")} className="h-9 w-9">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl font-bold tracking-tight text-[#2563EB]">
              {grn?.grnNumber || "Create Goods Receipt Note"}
            </h1>
            {statusBadge}
          </div>
          <p className="text-muted-foreground mt-1">
            {grn?.poNumber
              ? <>Goods Receipt Note for <strong>{grn.poNumber}</strong></>
              : "Select a PO to load items, or enter vendor and items manually."}
          </p>
        </div>
        <Button
          onClick={handleReceiveClick}
          disabled={busy || (!isDirty && !!grn)}
          className="gap-2"
        >
          <PackagePlus className="h-4 w-4" />
          {busy ? "Confirming..." : "Goods Received"}
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">PO Reference</p>
          {linkedFromPo ? (
            <p className="font-semibold">{grn?.poNumber}</p>
          ) : (
            <div className="relative mt-0.5">
              <Input
                ref={poInputRef}
                value={poSearch}
                disabled={creating || posLoading || !!grn}
                placeholder={posLoading ? "Loading…" : "Optional — type or select PO…"}
                className="font-semibold h-9"
                onFocus={() => setPoPickerOpen(true)}
                onChange={(e) => {
                  setPoSearch(e.target.value);
                  setPoPickerOpen(true);
                  setIsDirty(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    resolveAndCreatePo(poSearch);
                  }
                  if (e.key === "Escape") setPoPickerOpen(false);
                }}
              />
              {poPickerOpen && !grn && (
                <div
                  ref={poDropdownRef}
                  className="absolute z-50 left-0 right-0 mt-1 bg-popover border rounded-md shadow-lg max-h-56 overflow-y-auto"
                >
                  {filteredPos.length === 0 ? (
                    <p className="text-sm text-muted-foreground px-3 py-2">
                      {availablePos.length === 0
                        ? pos.length === 0
                          ? "No confirmed purchase orders — enter items manually"
                          : "All confirmed POs already have a GRN"
                        : `No PO matching "${poSearch.trim()}" — press Enter to keep as manual reference`}
                    </p>
                  ) : (
                    filteredPos.map((po: any) => (
                      <button
                        key={po.id}
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm rounded-md hover:bg-accent"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setPoSearch(po.poNumber || "");
                          createFromPo(po.id);
                        }}
                      >
                        <span className="font-mono font-medium">{po.poNumber}</span>
                        <span className="text-muted-foreground ml-2">{po.vendorName}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
              <p className="text-[11px] text-muted-foreground mt-1.5">
                Optional. Pick a PO to load items, or type a reference and enter items below.
              </p>
            </div>
          )}
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Vendor</p>
          {linkedFromPo ? (
            <p className="font-semibold">{grn?.vendorName || "—"}</p>
          ) : (
            <Input
              value={vendorName}
              disabled={!!grn}
              onChange={(e) => {
                setVendorName(e.target.value);
                setIsDirty(true);
              }}
              placeholder="Vendor name"
              className="font-semibold h-9 mt-0.5"
            />
          )}
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Created</p>
          <p className="font-semibold">{grn ? fmtDate(grn.createdAt) : "—"}</p>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="flex items-center gap-2 text-base">
              <PackageCheck className="h-5 w-5 text-primary" />
              Items
            </CardTitle>
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">
                {receivedCount} of {items.length} received
                {isDirty && <span className="ml-2 text-amber-500 font-medium">· Unsaved changes</span>}
              </span>
              {!linkedFromPo && (
                <Button type="button" variant="outline" size="sm" className="gap-1.5 h-8" onClick={addItem} disabled={!!grn && linkedFromPo}>
                  <Plus className="h-3.5 w-3.5" />
                  Add Item
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse table-fixed">
              <colgroup>
                <col className="w-[88px]" />
                <col className="w-[140px]" />
                <col />
                <col className="w-[72px]" />
                <col className="w-[88px]" />
                <col className="w-[240px]" />
                {!linkedFromPo ? <col className="w-[48px]" /> : null}
              </colgroup>
              <thead>
                <tr className="border-y border-emerald-100 bg-[#F0FDFA] text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  <th className="px-2 py-2.5 text-center align-middle whitespace-nowrap">
                    <div className="flex flex-row flex-nowrap items-center justify-center gap-1.5 leading-none">
                      <Checkbox
                        checked={allReceived}
                        data-state={someReceived ? "indeterminate" : allReceived ? "checked" : "unchecked"}
                        onCheckedChange={(checked) => handleSelectAll(checked === true)}
                        className="shrink-0 border-emerald-500 data-[state=checked]:border-emerald-600 data-[state=checked]:bg-emerald-600 data-[state=indeterminate]:border-emerald-500 data-[state=indeterminate]:bg-emerald-500"
                        aria-label="Select all received"
                      />
                      <span className="leading-none">Recv</span>
                    </div>
                  </th>
                  <th className="px-3 py-2.5 text-left whitespace-nowrap align-middle">Part No.</th>
                  <th className="px-3 py-2.5 text-left whitespace-nowrap align-middle">Description</th>
                  <th className="px-2 py-2.5 text-center whitespace-nowrap align-middle">Qty</th>
                  <th className="px-2 py-2.5 text-center align-middle whitespace-nowrap">
                    <div className="flex flex-row flex-nowrap items-center justify-center gap-1.5 leading-none">
                      <Checkbox
                        checked={allStockItems}
                        data-state={someStockItems ? "indeterminate" : allStockItems ? "checked" : "unchecked"}
                        onCheckedChange={(checked) => handleSelectAllStockItems(checked === true)}
                        className="shrink-0"
                        aria-label="Select all stock items"
                      />
                      <span className="leading-none">Stock</span>
                    </div>
                  </th>
                  <th className="px-3 py-2.5 text-left whitespace-nowrap align-middle">Serial Numbers</th>
                  {!linkedFromPo && <th className="px-1 py-2.5" />}
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <tr
                    key={index}
                    className={`border-b border-emerald-100/80 last:border-b-0 ${
                      item.received ? "bg-[#ECFDF5]" : "bg-white"
                    }`}
                  >
                    <td className="px-2 py-2 text-center align-middle">
                      <div className="flex flex-row items-center justify-center leading-none">
                        <Checkbox
                          checked={item.received}
                          onCheckedChange={(checked) =>
                            handleToggleReceived(index, checked === true)
                          }
                          className="shrink-0 border-emerald-500 data-[state=checked]:border-emerald-600 data-[state=checked]:bg-emerald-600"
                          aria-label="Received"
                        />
                      </div>
                    </td>
                    <td className="px-3 py-2 text-left align-middle">
                      {linkedFromPo ? (
                        <div className="min-w-0 flex flex-col justify-center">
                          <p className="truncate font-mono text-xs text-foreground leading-tight">
                            {item.partNumber || "—"}
                          </p>
                          {item.warehouseName ? (
                            <p className="truncate text-[10px] text-muted-foreground leading-tight">
                              → {item.warehouseName}
                            </p>
                          ) : null}
                        </div>
                      ) : (
                        <Input
                          value={item.partNumber || ""}
                          onChange={(e) => updateItemField(index, "partNumber", e.target.value)}
                          placeholder="Part no."
                          className="h-8 font-mono text-xs"
                        />
                      )}
                    </td>
                    <td className="px-3 py-2 text-left align-middle">
                      {linkedFromPo ? (
                        <p className={`truncate text-sm ${item.received ? "font-medium text-emerald-900" : "text-foreground"}`}>
                          {stripHtml(item.description || "") || (
                            <span className="text-muted-foreground/50">—</span>
                          )}
                        </p>
                      ) : (
                        <Input
                          value={stripHtml(item.description || "")}
                          onChange={(e) => updateItemField(index, "description", e.target.value)}
                          placeholder="Description"
                          className="h-8 text-sm"
                        />
                      )}
                    </td>
                    <td className="px-2 py-2 text-center align-middle">
                      {linkedFromPo ? (
                        <span className="inline-flex items-center justify-center font-bold text-foreground tabular-nums leading-none">{item.qty}</span>
                      ) : (
                        <Input
                          type="number"
                          min={0}
                          step="any"
                          value={item.qty}
                          onChange={(e) => updateItemField(index, "qty", parseFloat(e.target.value) || 0)}
                          className="h-8 w-16 mx-auto text-center font-semibold"
                        />
                      )}
                    </td>
                    <td className="px-2 py-2 text-center align-middle">
                      <div className="flex flex-row items-center justify-center leading-none">
                        <Checkbox
                          checked={item.isStockItem}
                          onCheckedChange={(checked) => handleToggleIsStockItem(index, checked === true)}
                          className="shrink-0"
                          aria-label="Stock item"
                        />
                      </div>
                    </td>
                    <td className="px-3 py-2 text-left align-middle">
                      <Textarea
                        value={item.serialNumbers}
                        onChange={(e) => handleSerialNumbers(index, e.target.value)}
                        disabled={!item.isStockItem}
                        rows={3}
                        placeholder={item.isStockItem ? "Serial nos (one per line or comma)" : "—"}
                        className="min-h-[4.5rem] resize-y font-mono text-xs disabled:opacity-50 disabled:bg-muted/30"
                      />
                    </td>
                    {!linkedFromPo && (
                      <td className="px-1 py-2 text-center align-middle">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => removeItem(index)}
                          title="Remove item"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <PackagePlus className="h-5 w-5 text-emerald-600" />
              Confirm Goods Received
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  You are confirming receipt of{" "}
                  <strong className="text-foreground">
                    {receivedItems.length} item{receivedItems.length !== 1 ? "s" : ""}
                  </strong>{" "}
                  from <strong className="text-foreground">{vendorName || grn?.vendorName}</strong>. Stock quantities will be updated for matched items.
                </p>
                {missingSerials.length > 0 && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5">
                    <p className="font-medium text-amber-800 mb-1">⚠ Serial numbers not entered</p>
                    <p className="text-amber-700 text-xs">
                      {missingSerials.length === 1
                        ? `1 item has no serial numbers:`
                        : `${missingSerials.length} items have no serial numbers:`}
                    </p>
                    <ul className="mt-1 text-xs text-amber-700 list-disc list-inside">
                      {missingSerials.map((i, idx) => (
                        <li key={idx}>{i.partNumber || i.description} (Qty: {i.qty})</li>
                      ))}
                    </ul>
                    <p className="text-xs text-amber-600 mt-1">You can continue without serial numbers.</p>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                const payloadItems = items
                  .filter((i) => (i.description || "").trim() || (i.partNumber || "").trim())
                  .map((i) => ({
                    ...i,
                    serialNumbers: String(i.serialNumbers || "")
                      .split(/[\n,]+/)
                      .map((s) => s.trim())
                      .filter(Boolean)
                      .join("\n"),
                  }));
                if (grn) {
                  receiveMutation.mutate(payloadItems);
                } else {
                  confirmReceive();
                }
              }}
              disabled={busy}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {busy ? "Confirming..." : "Goods Received"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
