import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import {
  useCreateStockItem,
  useUpdateStockItem,
  useListStockItems,
  getListStockItemsQueryKey,
} from "@workspace/api-client-react";
import { inventoryApi } from "@/lib/inventory-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Package, Plus, Wrench } from "lucide-react";

const UOM_OPTIONS = [
  { value: "Nos", label: "Nos (Numbers)" },
  { value: "Pcs", label: "Pcs (Pieces)" },
  { value: "Unit", label: "Unit" },
  { value: "Pair", label: "Pair" },
  { value: "Set", label: "Set" },
  { value: "Dozen", label: "Dozen" },
  { value: "Box", label: "Box" },
  { value: "Pack", label: "Pack" },
  { value: "Packet", label: "Packet" },
  { value: "Bundle", label: "Bundle" },
  { value: "Roll", label: "Roll" },
  { value: "Carton", label: "Carton" },
  { value: "Case", label: "Case" },
];

const CUSTOM_UOM_STORAGE_KEY = "stock-custom-uoms";

function loadCustomUoms(): string[] {
  try {
    const raw = localStorage.getItem(CUSTOM_UOM_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.map((v) => String(v).trim()).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

function saveCustomUoms(values: string[]) {
  try {
    localStorage.setItem(CUSTOM_UOM_STORAGE_KEY, JSON.stringify(values));
  } catch {
    // ignore
  }
}

function normalizeUom(raw?: string | null) {
  const value = (raw || "").trim();
  if (!value) return "Pcs";
  return UOM_OPTIONS.find((o) => o.value.toLowerCase() === value.toLowerCase())?.value ?? value;
}

const EMPTY_FORM = {
  code: "",
  name: "",
  description: "",
  uom: "Pcs",
  type: "product" as "product" | "service",
  unitPrice: "" as string | number,
  stockQty: "" as string | number,
  batchNo: "",
  isActive: true,
  warehouseId: "" as string,
};

export default function StockItemFormPage() {
  const params = useParams<{ id?: string }>();
  const editId = params.id ? Number(params.id) : NaN;
  const isEdit = Number.isFinite(editId) && editId > 0;
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [customUoms, setCustomUoms] = useState<string[]>(() => loadCustomUoms());
  const [createUomOpen, setCreateUomOpen] = useState(false);
  const [newUomName, setNewUomName] = useState("");
  const [loaded, setLoaded] = useState(!isEdit);

  const createMutation = useCreateStockItem();
  const updateMutation = useUpdateStockItem();

  const { data: items = [] } = useListStockItems(
    {} as any,
    { query: { queryKey: getListStockItemsQueryKey({} as any), enabled: isEdit } },
  );

  const { data: warehouses = [] } = useQuery<any[]>({
    queryKey: ["stock-item-warehouses"],
    queryFn: () => inventoryApi.getWarehouses(),
    staleTime: 30_000,
  });

  const warehouseOptions = useMemo(
    () =>
      warehouses
        .filter((w) => w.isActive !== false)
        .sort((a, b) => {
          if (!!a.isDefault !== !!b.isDefault) return a.isDefault ? -1 : 1;
          return String(a.name).localeCompare(String(b.name), undefined, {
            numeric: true,
            sensitivity: "base",
          });
        }),
    [warehouses],
  );

  const defaultWarehouseId = warehouseOptions.find((w) => w.isDefault)?.id ?? warehouseOptions[0]?.id;
  const selectedWarehouseId =
    form.warehouseId || (defaultWarehouseId != null ? String(defaultWarehouseId) : "");

  useEffect(() => {
    if (!isEdit) return;
    const item = (items as any[]).find((i) => Number(i.id) === editId);
    if (!item) return;
    setForm({
      code: item.code || "",
      name: item.name || "",
      description: item.description || "",
      uom: normalizeUom(item.uom),
      type: item.type === "service" ? "service" : "product",
      unitPrice: item.unitPrice != null && item.unitPrice !== "" ? String(item.unitPrice) : "",
      stockQty: item.stockQty != null && item.stockQty !== "" ? String(item.stockQty) : "",
      batchNo: item.batchNo || "",
      isActive: item.isActive ?? true,
      warehouseId: "",
    });
    setLoaded(true);
  }, [isEdit, editId, items]);

  const uomOptions = useMemo(() => {
    const seen = new Set(UOM_OPTIONS.map((o) => o.value.toLowerCase()));
    const extras: { value: string; label: string }[] = [];
    const addExtra = (raw?: string | null) => {
      const value = (raw || "").trim();
      if (!value) return;
      const key = value.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      extras.push({ value, label: value });
    };
    for (const uom of customUoms) addExtra(uom);
    for (const item of items as any[]) addExtra(item?.uom);
    addExtra(form.uom);
    return [...UOM_OPTIONS, ...extras];
  }, [customUoms, form.uom, items]);

  function handleCreateUom() {
    const name = newUomName.trim();
    if (!name) {
      toast({ title: "Name required", description: "Enter a UOM name.", variant: "destructive" });
      return;
    }
    const existing = uomOptions.find((o) => o.value.toLowerCase() === name.toLowerCase());
    const selected = existing?.value ?? name;
    if (!existing) {
      setCustomUoms((current) => {
        const next = [...current, name];
        saveCustomUoms(next);
        return next;
      });
    }
    setForm((f) => ({ ...f, uom: selected }));
    setCreateUomOpen(false);
    setNewUomName("");
  }

  function invalidateStockViews() {
    void queryClient.invalidateQueries({ queryKey: ["stock-items-picker"] });
    void queryClient.invalidateQueries({ queryKey: ["invoice-warehouse-stock"] });
    void queryClient.invalidateQueries({ queryKey: ["inventory"] });
    void queryClient.invalidateQueries({ queryKey: ["inventory", "current-stock"] });
    void queryClient.invalidateQueries({ queryKey: getListStockItemsQueryKey() });
  }

  function handleSave() {
    if (!form.code.trim()) {
      toast({ title: "Error", description: "Item code is required.", variant: "destructive" });
      return;
    }
    if (!form.name.trim()) {
      toast({ title: "Error", description: "Name is required.", variant: "destructive" });
      return;
    }
    if (form.type === "product" && Number(form.stockQty) > 0 && !selectedWarehouseId) {
      toast({
        title: "Error",
        description: "Select a warehouse for the stock quantity.",
        variant: "destructive",
      });
      return;
    }

    const payload = {
      code: form.code.trim(),
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      uom: form.uom.trim() || "Pcs",
      type: form.type,
      unitPrice: Number(form.unitPrice) || 0,
      stockQty: Number(form.stockQty) || 0,
      batchNo: form.batchNo.trim() || undefined,
      isActive: form.isActive,
      warehouseId:
        form.type === "product" && selectedWarehouseId ? Number(selectedWarehouseId) : undefined,
    };

    if (isEdit) {
      updateMutation.mutate(
        { id: editId, data: payload as any },
        {
          onSuccess: () => {
            toast({ title: "Updated", description: "Stock item updated." });
            invalidateStockViews();
            setLocation("/stock");
          },
          onError: (e: any) =>
            toast({ title: "Error", description: e.message, variant: "destructive" }),
        },
      );
    } else {
      createMutation.mutate(
        { data: payload as any },
        {
          onSuccess: () => {
            toast({ title: "Created", description: "Stock item created." });
            invalidateStockViews();
            setLocation("/stock");
          },
          onError: (e: any) =>
            toast({ title: "Error", description: e.message, variant: "destructive" }),
        },
      );
    }
  }

  if (isEdit && !loaded) {
    return <div className="py-20 text-center text-muted-foreground">Loading stock item…</div>;
  }

  if (isEdit && loaded && !(items as any[]).some((i) => Number(i.id) === editId)) {
    return (
      <div className="space-y-4 py-10 text-center">
        <p className="text-muted-foreground">Stock item not found.</p>
        <Button variant="outline" onClick={() => setLocation("/stock")}>
          Back to Stock Items
        </Button>
      </div>
    );
  }

  const saving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-16 animate-in fade-in duration-300">
      <div className="flex items-center gap-3 border-b border-gray-200 pb-4">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={() => setLocation("/stock")}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-[#2563EB]">
            {isEdit ? "Edit Stock Item" : "New Stock Item"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isEdit ? "Update catalogue item details." : "Add a product or service to your catalogue."}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Item Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>
                Item Code <span className="text-destructive">*</span>
              </Label>
              <Input
                placeholder="e.g. STK-001"
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>UOM</Label>
              <Select value={form.uom} onValueChange={(v) => setForm((f) => ({ ...f, uom: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select UOM" />
                </SelectTrigger>
                <SelectContent className="max-h-48 overflow-y-auto">
                  <div
                    className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm font-medium text-primary hover:bg-accent"
                    onClick={(event) => {
                      event.preventDefault();
                      setNewUomName("");
                      setCreateUomOpen(true);
                    }}
                  >
                    <Plus className="h-4 w-4" />
                    Create New UOM
                  </div>
                  <div className="my-1 border-t" />
                  {uomOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className={`space-y-1.5 ${form.type !== "product" ? "sm:col-span-2" : ""}`}>
              <Label>
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                placeholder="Item name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            {form.type === "product" && (
              <div className="space-y-1.5">
                <Label>Warehouse</Label>
                <Select
                  value={selectedWarehouseId || undefined}
                  onValueChange={(v) => setForm((f) => ({ ...f, warehouseId: v }))}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={warehouseOptions.length ? "Select warehouse" : "No warehouse found"}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {warehouseOptions.map((w) => (
                      <SelectItem key={w.id} value={String(w.id)}>
                        {w.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  {isEdit
                    ? "Quantity changes are booked in this warehouse."
                    : "Opening stock quantity is added to this warehouse."}
                </p>
              </div>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Batch No</Label>
              <Input
                placeholder="e.g. BT-001"
                value={form.batchNo}
                onChange={(e) => setForm((f) => ({ ...f, batchNo: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <div className="flex gap-2">
                {(["product", "service"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, type: t }))}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                      form.type === t
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border hover:bg-muted"
                    }`}
                  >
                    {t === "product" ? <Package className="h-4 w-4" /> : <Wrench className="h-4 w-4" />}
                    {t === "product" ? "Product" : "Service"}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Unit Price</Label>
              <Input
                type="text"
                inputMode="decimal"
                placeholder="0"
                value={form.unitPrice}
                onChange={(e) => setForm((f) => ({ ...f, unitPrice: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Stock Quantity</Label>
              <Input
                type="text"
                inputMode="decimal"
                placeholder="0"
                value={form.stockQty}
                onChange={(e) => setForm((f) => ({ ...f, stockQty: e.target.value }))}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea
              placeholder="Optional description..."
              className="resize-none"
              rows={3}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>

          <div className="flex items-center gap-3 rounded-lg border px-4 py-3">
            <div className="flex-1">
              <p className="text-sm font-medium">Active</p>
              <p className="text-xs text-muted-foreground">
                Whether this item is available for use in documents
              </p>
            </div>
            <Switch
              checked={form.isActive}
              onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => setLocation("/stock")}>
          Cancel
        </Button>
        <Button type="button" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : isEdit ? "Save Changes" : "Create Item"}
        </Button>
      </div>

      <Dialog open={createUomOpen} onOpenChange={setCreateUomOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Create New UOM</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5 py-2">
            <Label>UOM Name</Label>
            <Input
              value={newUomName}
              onChange={(e) => setNewUomName(e.target.value)}
              placeholder="e.g. Litre"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleCreateUom();
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCreateUomOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleCreateUom}>
              Add UOM
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
