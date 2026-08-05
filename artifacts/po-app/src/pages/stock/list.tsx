import { useState } from "react";
import { useListStockItems, useCreateStockItem, useUpdateStockItem, useDeleteStockItem, getListStockItemsQueryKey, useGetSettings, getGetSettingsQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Search, Package, Wrench } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { previewRunningNumber } from "@/lib/running-number";

const EMPTY_FORM = {
  code: "", name: "", description: "", uom: "pcs",
  type: "product" as "product" | "service",
  unitPrice: 0, stockQty: 0, isActive: true,
};

export default function StockList() {
  const { canManage } = useAuth();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"" | "product" | "service">("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const stockParams = { search: search || undefined, type: typeFilter || undefined } as any;
  const { data: items = [], refetch } = useListStockItems(
    stockParams,
    { query: { queryKey: getListStockItemsQueryKey(stockParams), refetchOnWindowFocus: false } }
  );

  const createMutation = useCreateStockItem();
  const updateMutation = useUpdateStockItem();
  const deleteMutation = useDeleteStockItem();
  const { data: settings } = useGetSettings({ query: { queryKey: getGetSettingsQueryKey() } });
  const nextStockCode = previewRunningNumber(
    (settings as any)?.siPrefix ?? "STK",
    (settings as any)?.siCounter,
    (settings as any)?.siSuffix ?? "",
  );
  function openCreate() {
    setEditItem(null);
    setForm({ ...EMPTY_FORM });
    setDialogOpen(true);
  }

  function openEdit(item: any) {
    setEditItem(item);
    setForm({
      code: item.code || "",
      name: item.name || "",
      description: item.description || "",
      uom: item.uom || "pcs",
      type: item.type === "service" ? "service" : "product",
      unitPrice: parseFloat(item.unitPrice ?? "0"),
      stockQty: parseFloat(item.stockQty ?? "0"),
      isActive: item.isActive ?? true,
    });
    setDialogOpen(true);
  }

  function handleSave() {
    if (!form.name.trim()) {
      toast({ title: "Error", description: "Name is required.", variant: "destructive" });
      return;
    }
    if (editItem && !form.code.trim()) {
      toast({ title: "Error", description: "Code is required.", variant: "destructive" });
      return;
    }

    const payload = {
      code: form.code.trim() || undefined,
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      uom: form.uom.trim() || "pcs",
      type: form.type,
      unitPrice: Number(form.unitPrice) || 0,
      stockQty: Number(form.stockQty) || 0,
      isActive: form.isActive,
    };

    if (editItem) {
      updateMutation.mutate(
        { id: editItem.id, data: payload as any },
        {
          onSuccess: () => {
            toast({ title: "Updated", description: "Stock item updated." });
            setDialogOpen(false);
            refetch();
          },
          onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
        }
      );
    } else {
      createMutation.mutate(
        { data: payload as any },
        {
          onSuccess: () => {
            toast({ title: "Created", description: "Stock item created." });
            setDialogOpen(false);
            refetch();
          },
          onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
        }
      );
    }
  }

  function handleDelete() {
    if (!deleteId) return;
    deleteMutation.mutate(
      { id: deleteId },
      {
        onSuccess: () => {
          toast({ title: "Deleted", description: "Stock item deleted." });
          setDeleteId(null);
          refetch();
        },
        onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
      }
    );
  }

  const filtered = (items as any[]).filter((item: any) => {
    const matchesSearch = !search ||
      item.code.toLowerCase().includes(search.toLowerCase()) ||
      item.name.toLowerCase().includes(search.toLowerCase());
    const matchesType = !typeFilter || item.type === typeFilter;
    return matchesSearch && matchesType;
  });

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Stock Items</h1>
          <p className="text-muted-foreground mt-1">Manage your product and service catalogue.</p>
        </div>
        <Button className="gap-2" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          New Item
        </Button>
      </div>

      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by code or name..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex gap-2">
              {(["", "product", "service"] as const).map(t => (
                <Button
                  key={t}
                  variant={typeFilter === t ? "default" : "outline"}
                  size="sm"
                  onClick={() => setTypeFilter(t)}
                >
                  {t === "" ? "All" : t === "product" ? "Products" : "Services"}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {filtered.length} item{filtered.length !== 1 ? "s" : ""}
          </CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground uppercase text-xs border-y">
              <tr>
                <th className="px-4 py-3 text-left font-medium w-32">Code</th>
                <th className="px-4 py-3 text-left font-medium">Name</th>
                <th className="px-4 py-3 text-left font-medium w-24">Type</th>
                <th className="px-4 py-3 text-left font-medium w-16">UOM</th>
                <th className="px-4 py-3 text-right font-medium w-28">Unit Price</th>
                <th className="px-4 py-3 text-right font-medium w-28">Stock Qty</th>
                <th className="px-4 py-3 text-center font-medium w-20">Status</th>
                <th className="px-4 py-3 w-20"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                    No stock items found. Create your first item.
                  </td>
                </tr>
              ) : (
                filtered.map((item: any) => (
                  <tr key={item.id} className="bg-card hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 font-mono text-sm font-medium">{item.code}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{item.name}</div>
                      {item.description && (
                        <div className="text-xs text-muted-foreground truncate max-w-xs">{item.description}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="gap-1 text-xs font-normal">
                        {item.type === "service" ? (
                          <Wrench className="h-3 w-3" />
                        ) : (
                          <Package className="h-3 w-3" />
                        )}
                        {item.type}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{item.uom}</td>
                    <td className="px-4 py-3 text-right font-medium">
                      {parseFloat(item.unitPrice ?? "0").toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={parseFloat(item.stockQty ?? "0") <= 0 ? "text-destructive font-medium" : "text-foreground"}>
                        {parseFloat(item.stockQty ?? "0").toFixed(3)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {item.isActive ? (
                        <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-700 text-xs">Active</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">Inactive</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(item)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        {canManage && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => setDeleteId(item.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>{editItem ? "Edit Stock Item" : "New Stock Item"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Code {!editItem ? "" : <span className="text-destructive">*</span>}</Label>
                <Input
                  placeholder={editItem ? "SKU-001" : `Auto: ${nextStockCode}`}
                  value={form.code}
                  onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                />
                {!editItem && (
                  <p className="text-[11px] text-muted-foreground">Leave blank to auto-generate from Settings → Running Numbers.</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>UOM</Label>
                <Input
                  placeholder="pcs"
                  value={form.uom}
                  onChange={e => setForm(f => ({ ...f, uom: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Name <span className="text-destructive">*</span></Label>
              <Input
                placeholder="Item name"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                placeholder="Optional description..."
                className="resize-none"
                rows={2}
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <div className="flex gap-2">
                {(["product", "service"] as const).map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, type: t }))}
                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium border transition-colors ${
                      form.type === t
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border hover:bg-muted"
                    }`}
                  >
                    {t === "product" ? <Package className="h-4 w-4" /> : <Wrench className="h-4 w-4" />}
                    {t === "product" ? "Product" : "Service"}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Unit Price</Label>
                <Input
                  type="text" inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={form.unitPrice}
                  onChange={e => setForm(f => ({ ...f, unitPrice: parseFloat(e.target.value) || 0 }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Stock Quantity</Label>
                <Input
                  type="text" inputMode="decimal"
                  min="0"
                  step="0.001"
                  value={form.stockQty}
                  onChange={e => setForm(f => ({ ...f, stockQty: parseFloat(e.target.value) || 0 }))}
                />
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-lg border px-4 py-3">
              <div className="flex-1">
                <p className="text-sm font-medium">Active</p>
                <p className="text-xs text-muted-foreground">Whether this item is available for use in documents</p>
              </div>
              <Switch
                checked={form.isActive}
                onCheckedChange={v => setForm(f => ({ ...f, isActive: v }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleSave}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {createMutation.isPending || updateMutation.isPending ? "Saving..." : editItem ? "Save Changes" : "Create Item"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Stock Item?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The item will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
