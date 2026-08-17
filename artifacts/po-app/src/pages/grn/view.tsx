import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { ArrowLeft, PackageCheck, ClipboardList, PackagePlus, Trash2, Package } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StockItemPickerDialog, type StockItemSelection } from "@/components/stock-item-picker-dialog";
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

interface WarehouseOption {
  id: number;
  name: string;
  code: string;
  isDefault?: boolean;
  isActive?: boolean;
}

interface Grn {
  id: number;
  grnNumber: string;
  poId: number;
  poNumber: string;
  vendorName: string;
  companyId: number;
  status: string;
  items: GrnItem[];
  createdBy: number;
  createdAt: string;
  updatedAt: string;
}

async function fetchGrn(id: string): Promise<Grn> {
  const res = await fetch(`/api/grn/${id}`, { credentials: "include" });
  if (!res.ok) throw new Error("GRN not found");
  return res.json();
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

function getStatusBadge(status: string) {
  switch (status) {
    case "complete":
      return <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white">Complete</Badge>;
    case "partial":
      return <Badge className="bg-amber-500 hover:bg-amber-600 text-white">Partial</Badge>;
    case "draft":
      return <Badge variant="secondary">Draft</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export default function GrnView() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { canManage } = useAuth();
  const queryClient = useQueryClient();

  const { data: grn, isLoading, error } = useQuery({
    queryKey: ["grn", params.id],
    queryFn: () => fetchGrn(params.id!),
    enabled: !!params.id,
  });

  const [items, setItems] = useState<GrnItem[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [stockPickerIndex, setStockPickerIndex] = useState<number | null>(null);

  const { data: warehouses = [] } = useQuery<WarehouseOption[]>({
    queryKey: ["warehouses"],
    queryFn: async () => {
      const res = await fetch("/api/warehouses", { credentials: "include" });
      if (!res.ok) return [];
      const rows: WarehouseOption[] = await res.json();
      return rows
        .filter((warehouse) => warehouse.isActive !== false)
        .sort((a, b) => {
          if (!!a.isDefault !== !!b.isDefault) return a.isDefault ? -1 : 1;
          return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
        });
    },
  });

  const defaultWarehouse = warehouses.find((warehouse) => warehouse.isDefault) ?? warehouses[0];

  useEffect(() => {
    if (grn) {
      setItems(grn.items.map((item) => ({ ...item, isStockItem: (item as any).isStockItem ?? false })));
      setIsDirty(false);
    }
  }, [grn]);

  useEffect(() => {
    if (!defaultWarehouse) return;
    setItems((prev) => {
      let changed = false;
      const next = prev.map((item) => {
        if (!item.isStockItem || Number(item.warehouseId) > 0) return item;
        changed = true;
        return {
          ...item,
          warehouseId: defaultWarehouse.id,
          warehouseName: defaultWarehouse.name,
        };
      });
      if (changed) setIsDirty(true);
      return changed ? next : prev;
    });
  }, [defaultWarehouse?.id]);

  const mutation = useMutation({
    mutationFn: (updatedItems: GrnItem[]) => receiveGrn(grn!.id, updatedItems),
    onSuccess: (updated) => {
      queryClient.setQueryData(["grn", params.id], updated);
      queryClient.invalidateQueries({ queryKey: ["grns"] });
      queryClient.invalidateQueries({ queryKey: ["stock-items"] });
      setIsDirty(false);
      setConfirmOpen(false);
      toast({ title: "Goods Received", description: "GRN confirmed and stock updated successfully." });
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
      const updated: GrnItem = { ...next[index], isStockItem: checked };
      if (checked && !(Number(updated.warehouseId) > 0) && defaultWarehouse) {
        updated.warehouseId = defaultWarehouse.id;
        updated.warehouseName = defaultWarehouse.name;
      }
      next[index] = updated;
      return next;
    });
    setIsDirty(true);
  };

  const handleWarehouseChange = (index: number, warehouseId: string) => {
    const warehouse = warehouses.find((row) => row.id === Number(warehouseId));
    if (!warehouse) return;
    setItems((prev) => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        warehouseId: warehouse.id,
        warehouseName: warehouse.name,
      };
      return next;
    });
    setIsDirty(true);
  };

  const handleStockPickerSelect = ({ item, warehouseId, warehouseName, qty }: StockItemSelection) => {
    if (stockPickerIndex === null || !warehouseId) return;
    setItems((prev) => {
      const next = [...prev];
      next[stockPickerIndex] = {
        ...next[stockPickerIndex],
        partNumber: item.code,
        description: next[stockPickerIndex].description || item.name,
        isStockItem: true,
        stockItemId: item.id,
        warehouseId,
        warehouseName: warehouseName ?? "",
        qty: qty > 0 ? qty : next[stockPickerIndex].qty,
      };
      return next;
    });
    setStockPickerIndex(null);
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

  const handleReceiveClick = () => {
    const receivedItems = items.filter((i) => i.received);
    if (receivedItems.length === 0) {
      toast({ title: "No items selected", description: "Please check at least one item as received.", variant: "destructive" });
      return;
    }
    const missingWarehouse = receivedItems.filter(
      (item) => item.isStockItem && !(Number(item.warehouseId) > 0),
    );
    if (missingWarehouse.length > 0) {
      toast({
        title: "Warehouse required",
        description: `Select a warehouse for ${missingWarehouse.map((item) => item.partNumber || "stock item").join(", ")} using the cube icon.`,
        variant: "destructive",
      });
      return;
    }
    setConfirmOpen(true);
  };

  const handleDelete = async () => {
    if (!grn) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/grn/${grn.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to delete GRN");
      }
      queryClient.invalidateQueries({ queryKey: ["grns"] });
      queryClient.invalidateQueries({ queryKey: ["stock-items"] });
      toast({ title: "GRN Deleted", description: `${grn.grnNumber} has been deleted.` });
      setLocation("/grn");
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const receivedItems = items.filter((i) => i.received);
  const missingSerials = receivedItems.filter((i) => i.isStockItem && !i.serialNumbers.trim());

  if (isLoading) {
    return (
      <div className="space-y-6 animate-in fade-in duration-500">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (error || !grn) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4">
        <ClipboardList className="h-12 w-12 text-muted-foreground/40" />
        <p className="text-muted-foreground">GRN not found.</p>
        <Button variant="outline" onClick={() => setLocation("/grn")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to GRN List
        </Button>
      </div>
    );
  }

  const receivedCount = items.filter((i) => i.received).length;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/grn")} className="h-9 w-9">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl font-bold tracking-tight text-[#2563EB]">{grn.grnNumber}</h1>
            {getStatusBadge(grn.status)}
          </div>
          <p className="text-muted-foreground mt-1">
            Goods Receipt Note{grn.poNumber ? <> for <strong>{grn.poNumber}</strong></> : null}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canManage && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="icon" disabled={deleting} title="Delete GRN">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Goods Receipt Note?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete {grn.grnNumber}. Stock posted only by this GRN will be reversed. This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDelete}
                    disabled={deleting}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {deleting ? "Deleting..." : "Delete"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          <Button
            onClick={handleReceiveClick}
            disabled={!isDirty || mutation.isPending}
            className="gap-2"
          >
            <PackagePlus className="h-4 w-4" />
            {mutation.isPending ? "Confirming..." : "Goods Received"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">PO Reference</p>
          <p className="font-semibold">{grn.poNumber || "—"}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Vendor</p>
          <p className="font-semibold">{grn.vendorName}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Created</p>
          <p className="font-semibold">{fmtDate(grn.createdAt)}</p>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <PackageCheck className="h-5 w-5 text-primary" />
              Items
            </CardTitle>
            <span className="text-sm text-muted-foreground">
              {receivedCount} of {items.length} received
              {isDirty && <span className="ml-2 text-amber-500 font-medium">· Unsaved changes</span>}
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse table-fixed">
              <colgroup>
                <col className="w-[88px]" />
                <col className="w-[180px]" />
                <col />
                <col className="w-[72px]" />
                <col className="w-[88px]" />
                <col className="w-[240px]" />
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
                      <div className="min-w-0 flex flex-col justify-center gap-1">
                        <div className="flex items-center gap-1">
                          <p className="truncate font-mono text-xs text-foreground leading-tight">
                            {item.partNumber || "—"}
                          </p>
                          {item.isStockItem ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 shrink-0 text-muted-foreground hover:text-primary"
                              title="Select warehouse"
                              onClick={() => setStockPickerIndex(index)}
                            >
                              <Package className="h-3.5 w-3.5" />
                            </Button>
                          ) : null}
                        </div>
                        {item.isStockItem ? (
                          warehouses.length > 0 ? (
                            <Select
                              value={item.warehouseId ? String(item.warehouseId) : undefined}
                              onValueChange={(value) => handleWarehouseChange(index, value)}
                            >
                              <SelectTrigger className="h-7 border-gray-200 bg-white text-[10px]">
                                <SelectValue placeholder="Select warehouse" />
                              </SelectTrigger>
                              <SelectContent>
                                {warehouses.map((warehouse) => (
                                  <SelectItem key={warehouse.id} value={String(warehouse.id)}>
                                    {warehouse.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : item.warehouseName ? (
                            <p className="truncate text-[10px] text-muted-foreground leading-tight">
                              → {item.warehouseName}
                            </p>
                          ) : (
                            <p className="text-[10px] font-medium text-amber-600 leading-tight">
                              Select warehouse
                            </p>
                          )
                        ) : item.warehouseName ? (
                          <p className="truncate text-[10px] text-muted-foreground leading-tight">
                            → {item.warehouseName}
                          </p>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-left align-middle">
                      <p className={`truncate text-sm ${item.received ? "font-medium text-emerald-900" : "text-foreground"}`}>
                        {stripHtml(item.description || "") || (
                          <span className="text-muted-foreground/50">—</span>
                        )}
                      </p>
                    </td>
                    <td className="px-2 py-2 text-center align-middle">
                      <span className="inline-flex items-center justify-center font-bold text-foreground tabular-nums leading-none">{item.qty}</span>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {items.length === 0 && (
            <div className="px-6 py-12 text-center text-muted-foreground">
              No items found in this GRN.
            </div>
          )}
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
                  You are confirming receipt of <strong className="text-foreground">{receivedItems.length} item{receivedItems.length !== 1 ? "s" : ""}</strong> from <strong className="text-foreground">{grn.vendorName}</strong>. Stock quantities will be updated for matched items.
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
            <AlertDialogCancel disabled={mutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                mutation.mutate(
                  items.map((i) => ({
                    ...i,
                    serialNumbers: String(i.serialNumbers || "")
                      .split(/[\n,]+/)
                      .map((s) => s.trim())
                      .filter(Boolean)
                      .join("\n"),
                  })),
                )
              }
              disabled={mutation.isPending}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {mutation.isPending ? "Confirming..." : "Goods Received"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <StockItemPickerDialog
        open={stockPickerIndex !== null}
        onOpenChange={(open) => !open && setStockPickerIndex(null)}
        mode="receive"
        onSelect={handleStockPickerSelect}
      />
    </div>
  );
}
