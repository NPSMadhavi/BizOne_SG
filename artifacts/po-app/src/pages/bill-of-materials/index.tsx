import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useListStockItems, getListStockItemsQueryKey } from "@workspace/api-client-react";
import { inventoryApi } from "@/lib/inventory-api";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  Upload,
  HelpCircle,
  Info,
  Plus,
  Pencil,
  Trash2,
  GripVertical,
  Save,
  Check,
  ArrowRight,
  ArrowLeft,
} from "lucide-react";

type BomComponent = {
  id: string;
  itemCode: string;
  itemName: string;
  qty: number;
  uom: string;
  wastagePct: number;
  unitCost: number;
  availableQty: number;
};

type BomRecord = {
  id: string;
  productId: string;
  productLabel: string;
  version: string;
  outputQty: number;
  outputUom: string;
  status: "active" | "draft" | "inactive";
  category: string;
  effectiveDate: string;
  warehouse: string;
  description: string;
  components: BomComponent[];
  labourCost: number;
  machineCost: number;
  overhead: number;
  wastagePct: number;
  autoConsume: boolean;
  allowSubstitute: boolean;
  approvalRequired: boolean;
  allowNegativeStock: boolean;
  notes: string;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
};

const STORAGE_KEY = "bom-records-v1";
const DRAFT_KEY = "bom-draft-v1";

function money(n: number) {
  return `SGD ${n.toLocaleString("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function moneyOrEmpty(n: number) {
  return money(Number(n) || 0);
}

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function lineTotal(c: BomComponent, outputQty = 1) {
  const factor = Math.max(0, Number(outputQty) || 0) || 1;
  const effectiveQty = (Number(c.qty) || 0) * (1 + (Number(c.wastagePct) || 0) / 100) * factor;
  return round2(effectiveQty * (Number(c.unitCost) || 0));
}

/** Wastage % applies to material only; labour / machine / other are added as-is. */
function computeBomTotal(
  materialCost: number,
  labourCost: number,
  machineCost: number,
  overhead: number,
  wastagePct: number,
) {
  const wastageAmt = round2(materialCost * ((Number(wastagePct) || 0) / 100));
  return round2(materialCost + wastageAmt + labourCost + machineCost + overhead);
}

function loadList(): BomRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveList(list: BomRecord[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
}

type StockItemOption = {
  id: string;
  label: string;
  code: string;
  name: string;
  uom: string;
  unitPrice: number;
  stockQty: number;
  type: string;
};

export default function BillOfMaterialsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const userName = (user as any)?.fullName || user?.username || "User";

  const [mode, setMode] = useState<"form" | "list">("list");
  const [helpOpen, setHelpOpen] = useState(false);
  const [bomList, setBomList] = useState<BomRecord[]>(() => loadList());
  const [editingId, setEditingId] = useState<string | null>(null);

  const [productName, setProductName] = useState("");
  const [version, setVersion] = useState("V1.0");
  const [outputQty, setOutputQty] = useState(0);
  const [outputUom, setOutputUom] = useState("");
  const [status, setStatus] = useState<"active" | "draft" | "inactive">("active");
  const [category, setCategory] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [warehouse, setWarehouse] = useState("");
  const [description, setDescription] = useState("");
  const [components, setComponents] = useState<BomComponent[]>([]);
  const [labourCost, setLabourCost] = useState(0);
  const [machineCost, setMachineCost] = useState(0);
  const [overhead, setOverhead] = useState(0);
  const [wastagePct, setWastagePct] = useState(0);
  const [autoConsume, setAutoConsume] = useState(true);
  const [allowSubstitute, setAllowSubstitute] = useState(true);
  const [approvalRequired, setApprovalRequired] = useState(false);
  const [allowNegativeStock, setAllowNegativeStock] = useState(false);
  const [notes, setNotes] = useState("");
  const [createdBy, setCreatedBy] = useState(userName);
  const [createdAt, setCreatedAt] = useState(() => new Date().toISOString());
  const [updatedBy, setUpdatedBy] = useState(userName);
  const [updatedAt, setUpdatedAt] = useState(() => new Date().toISOString());

  const [compDialogOpen, setCompDialogOpen] = useState(false);
  const [editingCompId, setEditingCompId] = useState<string | null>(null);
  const [compForm, setCompForm] = useState({
    stockItemId: "",
    itemCode: "",
    itemName: "",
    qty: 1,
    uom: "PCS",
    wastagePct: 0,
    unitCost: 0,
    availableQty: 0,
  });

  const { data: stockItems = [] } = useListStockItems(
    {} as any,
    { query: { queryKey: getListStockItemsQueryKey({} as any), refetchOnWindowFocus: false } },
  );
  const { data: warehouses = [] } = useQuery<any[]>({
    queryKey: ["bom-warehouses"],
    queryFn: () => inventoryApi.getWarehouses(),
    staleTime: 60_000,
  });

  const allStockOptions = useMemo<StockItemOption[]>(() => {
    return (stockItems as any[])
      .filter((i) => i.isActive !== false)
      .map((i) => ({
        id: String(i.id),
        label: `${i.code || "ITEM"} - ${i.name || "Item"}`,
        code: String(i.code || ""),
        name: String(i.name || ""),
        uom: String(i.uom || "pcs"),
        unitPrice: Number(i.unitPrice) || 0,
        stockQty: Number(i.stockQty) || 0,
        type: String(i.type || "product"),
      }));
  }, [stockItems]);

  const componentOptions = useMemo(() => allStockOptions, [allStockOptions]);

  const warehouseOptions = useMemo(
    () => warehouses.filter((w) => w.isActive !== false).map((w) => ({ id: Number(w.id), name: String(w.name) })),
    [warehouses],
  );

  const selectedWarehouseId = useMemo(
    () => warehouseOptions.find((w) => w.name === warehouse)?.id,
    [warehouse, warehouseOptions],
  );

  const { data: warehouseStock = [] } = useQuery<any[]>({
    queryKey: ["bom-warehouse-stock", selectedWarehouseId],
    queryFn: () => inventoryApi.getCurrentStockReport(selectedWarehouseId),
    enabled: !!selectedWarehouseId,
    staleTime: 30_000,
  });

  const stockQtyByCode = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of warehouseStock) {
      const code = String(row.itemCode ?? "").trim();
      if (!code) continue;
      map.set(code, Number(row.quantity) || 0);
    }
    return map;
  }, [warehouseStock]);

  useEffect(() => {
    if (!warehouse && warehouseOptions[0]) setWarehouse(warehouseOptions[0].name);
  }, [warehouse, warehouseOptions]);

  function getAvailableQty(itemCode: string, fallbackQty = 0) {
    if (selectedWarehouseId && stockQtyByCode.has(itemCode)) {
      return stockQtyByCode.get(itemCode) ?? 0;
    }
    const item = allStockOptions.find((i) => i.code === itemCode);
    return item?.stockQty ?? fallbackQty;
  }

  useEffect(() => {
    if (!components.length) return;
    setComponents((prev) =>
      prev.map((c) => ({
        ...c,
        availableQty: getAvailableQty(c.itemCode, c.availableQty),
      })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWarehouseId, stockQtyByCode]);
  const materialCost = useMemo(
    () => round2(components.reduce((s, c) => s + lineTotal(c, outputQty), 0)),
    [components, outputQty],
  );
  const totalBomCost = useMemo(
    () => computeBomTotal(materialCost, labourCost, machineCost, overhead, wastagePct),
    [materialCost, labourCost, machineCost, overhead, wastagePct],
  );

  function resetForm() {
    setEditingId(null);
    setProductName("");
    setVersion("V1.0");
    setOutputQty(1);
    setOutputUom("PCS");
    setStatus("active");
    setCategory("");
    setEffectiveDate(new Date().toISOString().slice(0, 10));
    setWarehouse(warehouseOptions[0]?.name || "");
    setDescription("");
    setComponents([]);
    setLabourCost(0);
    setMachineCost(0);
    setOverhead(0);
    setWastagePct(0);
    setAutoConsume(true);
    setAllowSubstitute(true);
    setApprovalRequired(false);
    setAllowNegativeStock(false);
    setNotes("");
    const now = new Date().toISOString();
    setCreatedBy(userName);
    setCreatedAt(now);
    setUpdatedBy(userName);
    setUpdatedAt(now);
  }

  function loadBom(bom: BomRecord) {
    setEditingId(bom.id);
    setProductName(bom.productLabel || "");
    setVersion(bom.version);
    setOutputQty(bom.outputQty);
    setOutputUom(bom.outputUom);
    setStatus(bom.status);
    setCategory(bom.category || "");
    setEffectiveDate(bom.effectiveDate);
    setWarehouse(bom.warehouse);
    setDescription(bom.description);
    setComponents(bom.components);
    setLabourCost(bom.labourCost);
    setMachineCost(bom.machineCost);
    setOverhead(bom.overhead);
    setWastagePct(bom.wastagePct);
    setAutoConsume(bom.autoConsume);
    setAllowSubstitute(bom.allowSubstitute);
    setApprovalRequired(bom.approvalRequired);
    setAllowNegativeStock(bom.allowNegativeStock);
    setNotes(bom.notes);
    setCreatedBy(bom.createdBy);
    setCreatedAt(bom.createdAt);
    setUpdatedBy(bom.updatedBy);
    setUpdatedAt(bom.updatedAt);
    setMode("form");
  }

  function buildRecord(forceStatus?: BomRecord["status"]): BomRecord {
    const now = new Date().toISOString();
    const label = productName.trim();
    return {
      id: editingId || `bom-${Date.now()}`,
      productId: editingId ? (bomList.find((b) => b.id === editingId)?.productId || `manual-${Date.now()}`) : `manual-${Date.now()}`,
      productLabel: label,
      version,
      outputQty,
      outputUom,
      status: forceStatus || status,
      category: category.trim(),
      effectiveDate,
      warehouse,
      description,
      components,
      labourCost,
      machineCost,
      overhead,
      wastagePct,
      autoConsume,
      allowSubstitute,
      approvalRequired,
      allowNegativeStock,
      notes,
      createdBy: editingId ? createdBy : userName,
      createdAt: editingId ? createdAt : now,
      updatedBy: userName,
      updatedAt: now,
    };
  }

  function saveBom(asDraft = false) {
    if (!productName.trim()) {
      toast({ title: "Product required", description: "Enter a finished product name." });
      return;
    }
    if (!components.length) {
      toast({ title: "Components required", description: "Add at least one raw material component.", variant: "destructive" });
      return;
    }
    const record = buildRecord(asDraft ? "draft" : status === "draft" && !asDraft ? "active" : status);
    if (asDraft) record.status = "draft";
    const next = editingId
      ? bomList.map((b) => (b.id === editingId ? record : b))
      : [record, ...bomList];
    setBomList(next);
    saveList(next);
    setEditingId(record.id);
    setStatus(record.status);
    setUpdatedBy(record.updatedBy);
    setUpdatedAt(record.updatedAt);
    toast({
      title: asDraft ? "Draft saved" : "BOM saved",
      description: record.productLabel,
    });
  }

  function openAddComponent() {
    setEditingCompId(null);
    setCompForm({
      stockItemId: "",
      itemCode: "",
      itemName: "",
      qty: 1,
      uom: "PCS",
      wastagePct: 0,
      unitCost: 0,
      availableQty: 0,
    });
    setCompDialogOpen(true);
  }

  function openEditComponent(c: BomComponent) {
    const match = allStockOptions.find((i) => i.code === c.itemCode);
    setEditingCompId(c.id);
    setCompForm({
      stockItemId: match?.id || "",
      itemCode: c.itemCode,
      itemName: c.itemName,
      qty: c.qty,
      uom: c.uom,
      wastagePct: c.wastagePct,
      unitCost: c.unitCost,
      availableQty: getAvailableQty(c.itemCode, c.availableQty),
    });
    setCompDialogOpen(true);
  }

  function applyStockItemToCompForm(item: StockItemOption) {
    setCompForm((f) => ({
      ...f,
      stockItemId: item.id,
      itemCode: item.code,
      itemName: item.name,
      uom: item.uom,
      unitCost: item.unitPrice,
      qty: f.qty > 0 ? f.qty : 1,
      availableQty: getAvailableQty(item.code, item.stockQty),
    }));
  }

  function saveComponent() {
    if (!compForm.itemCode.trim() || !compForm.itemName.trim()) {
      toast({ title: "Item required", description: "Select a stock item for this component.", variant: "destructive" });
      return;
    }
    const availableQty = getAvailableQty(compForm.itemCode.trim(), compForm.availableQty);
    if (editingCompId) {
      setComponents((prev) =>
        prev.map((c) =>
          c.id === editingCompId
            ? {
                ...c,
                itemCode: compForm.itemCode.trim(),
                itemName: compForm.itemName.trim(),
                qty: Number(compForm.qty) || 0,
                uom: compForm.uom,
                wastagePct: Number(compForm.wastagePct) || 0,
                unitCost: Number(compForm.unitCost) || 0,
                availableQty,
              }
            : c,
        ),
      );
    } else {
      setComponents((prev) => [
        ...prev,
        {
          id: `c-${Date.now()}`,
          itemCode: compForm.itemCode.trim(),
          itemName: compForm.itemName.trim(),
          qty: Number(compForm.qty) || 0,
          uom: compForm.uom,
          wastagePct: Number(compForm.wastagePct) || 0,
          unitCost: Number(compForm.unitCost) || 0,
          availableQty,
        },
      ]);
    }
    setCompDialogOpen(false);
  }

  function formatStamp(iso: string) {
    try {
      return new Date(iso).toLocaleString("en-SG", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  }

  if (mode === "list") {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-[#2563EB]">Bill of Materials (BOM)</h1>
            <p className="mt-1 text-muted-foreground">Saved BOM definitions for finished products.</p>
          </div>
          <Button type="button" className="gap-2 bg-[#2563EB] hover:bg-[#1D4ED8]" onClick={() => { resetForm(); setMode("form"); }}>
            <Plus className="h-4 w-4" /> Create BOM
          </Button>
        </div>
        <div className="overflow-hidden rounded-xl border border-[#E5E7EB] bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-[#F9FAFB] text-left text-xs uppercase text-[#6B7280]">
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Warehouse</th>
                <th className="px-4 py-3">Components</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Total Cost</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {bomList.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-[#6B7280]">
                    No BOMs saved yet.
                  </td>
                </tr>
              ) : (
                bomList.map((b) => {
                  const mat = b.components.reduce((s, c) => s + lineTotal(c, b.outputQty), 0);
                  const total = computeBomTotal(mat, b.labourCost, b.machineCost, b.overhead, b.wastagePct);
                  return (
                    <tr key={b.id} className="border-b hover:bg-[#F8FAFC]">
                      <td className="px-4 py-3 font-medium">{b.productLabel}</td>
                      <td className="px-4 py-3 text-[#4B5563]">{b.warehouse}</td>
                      <td className="px-4 py-3">{b.components.length}</td>
                      <td className="px-4 py-3">
                        <span className={cn(
                          "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                          b.status === "active" ? "bg-[#DCFCE7] text-[#15803D]" : b.status === "draft" ? "bg-[#E0E7FF] text-[#4338CA]" : "bg-[#F3F4F6] text-[#6B7280]",
                        )}>
                          {b.status === "active" ? "Active" : b.status === "draft" ? "Draft" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium">{money(total)}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <Button type="button" variant="ghost" size="icon" onClick={() => loadBom(b)} title="Edit">
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="mt-0.5 h-9 w-9 shrink-0"
            onClick={() => setMode("list")}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-[#2563EB]">
              {editingId ? "Edit BOM" : "New BOM"}
            </h1>
            <p className="mt-1 text-muted-foreground">
              Create a BOM to define raw materials and costs required for a finished product.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-nowrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            onClick={() => {
              try {
                localStorage.setItem(DRAFT_KEY, JSON.stringify(buildRecord("draft")));
              } catch {
                // ignore
              }
              toast({ title: "Import ready", description: "Use Add Component to build the BOM." });
            }}
          >
            <Upload className="h-4 w-4" /> Import BOM
          </Button>
          <Button type="button" variant="outline" className="gap-2" onClick={() => setHelpOpen(true)}>
            <HelpCircle className="h-4 w-4" /> How BOM Works?
          </Button>
          {editingId && (
            <Button
              type="button"
              variant="destructive"
              className="gap-2"
              onClick={() => {
                const next = bomList.filter((x) => x.id !== editingId);
                setBomList(next);
                saveList(next);
                toast({ title: "BOM deleted" });
                resetForm();
                setMode("list");
              }}
            >
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(300px,0.9fr)] xl:items-stretch">
        <div className="flex min-h-0 flex-col gap-4">
          {/* Section 1 */}
          <section className="rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#DBEAFE] text-xs font-bold text-[#2563EB]">1</span>
              <h2 className="text-base font-semibold text-[#111827]">Product Details (Finished Product)</h2>
            </div>
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="space-y-1.5">
                  <Label>Product</Label>
                  <Input
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                    placeholder="Enter product"
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <div className="space-y-1.5 min-w-0">
                      <Label>Quantity</Label>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={outputQty || ""}
                        onChange={(e) => setOutputQty(e.target.value === "" ? 0 : Number(e.target.value) || 0)}
                        className="[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      />
                    </div>
                    <div className="space-y-1.5 w-24">
                      <Label>UOM</Label>
                      <Input
                        value={outputUom}
                        onChange={(e) => setOutputUom(e.target.value)}
                        placeholder="PCS"
                      />
                    </div>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select value={status} onValueChange={(v) => setStatus(v as any)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Category</Label>
                  <Input
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="Enter category"
                  />
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>Effective Date</Label>
                  <Input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Warehouse</Label>
                  <Select value={warehouse} onValueChange={setWarehouse} disabled={!warehouseOptions.length}>
                    <SelectTrigger><SelectValue placeholder={warehouseOptions.length ? "Select warehouse" : "No warehouses found"} /></SelectTrigger>
                    <SelectContent>
                      {warehouseOptions.map((w) => (
                        <SelectItem key={w.id} value={w.name}>{w.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Description (Optional)</Label>
                  <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short description..." />
                </div>
              </div>
            </div>
          </section>

          {/* Section 2 */}
          <section className="flex min-h-[420px] flex-1 flex-col rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#DBEAFE] text-xs font-bold text-[#2563EB]">2</span>
                <h2 className="text-base font-semibold text-[#111827]">Components (Raw Materials Required)</h2>
                <Info className="h-4 w-4 text-[#9CA3AF]" />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" className="gap-1.5 bg-[#2563EB] hover:bg-[#1D4ED8]" onClick={openAddComponent}>
                  <Plus className="h-4 w-4" /> Add Component
                </Button>
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-[#E5E7EB]">
              <div className="flex-1 overflow-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead>
                  <tr className="border-b bg-[#F9FAFB] text-left text-xs uppercase tracking-wide text-[#6B7280]">
                    <th className="px-3 py-2.5">#</th>
                    <th className="px-3 py-2.5">Item Code</th>
                    <th className="px-3 py-2.5">Item Name</th>
                    <th className="px-3 py-2.5 text-right">Required Qty</th>
                    <th className="px-3 py-2.5">UOM</th>
                    <th className="px-3 py-2.5 text-right">Wastage %</th>
                    <th className="px-3 py-2.5 text-right">Unit Cost (SGD)</th>
                    <th className="px-3 py-2.5 text-right">Total Cost (SGD)</th>
                    <th className="px-3 py-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="min-h-[240px]">
                  {components.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-3 py-20 text-center text-sm text-[#6B7280]">
                        No components added. Click &quot;Add Component&quot; to add raw materials.
                      </td>
                    </tr>
                  ) : (
                    components.map((c, idx) => (
                    <tr key={c.id} className="border-b last:border-0">
                      <td className="px-3 py-2.5">
                        <span className="inline-flex items-center gap-1 text-[#9CA3AF]">
                          <GripVertical className="h-3.5 w-3.5" /> {idx + 1}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 font-medium text-[#111827]">{c.itemCode}</td>
                      <td className="px-3 py-2.5 text-[#111827]">{c.itemName}</td>
                      <td className="px-3 py-2.5 text-right">{c.qty}</td>
                      <td className="px-3 py-2.5">{c.uom}</td>
                      <td className="px-3 py-2.5 text-right">{c.wastagePct ? `${c.wastagePct}%` : ""}</td>
                      <td className="px-3 py-2.5 text-right">{c.unitCost ? c.unitCost.toFixed(2) : ""}</td>
                      <td className="px-3 py-2.5 text-right font-medium">{lineTotal(c, outputQty).toFixed(2)}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex justify-end gap-1">
                          <button type="button" className="rounded p-1 text-[#6B7280] hover:bg-[#F3F4F6]" onClick={() => openEditComponent(c)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            className="rounded p-1 text-[#DC2626] hover:bg-[#FEF2F2]"
                            onClick={() => setComponents((prev) => prev.filter((x) => x.id !== c.id))}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    ))
                  )}
                </tbody>
              </table>
              </div>
            </div>
          </section>
        </div>

        {/* Right panel */}
        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
            <h3 className="mb-4 text-base font-semibold text-[#111827]">Cost Summary</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-[#6B7280]">Material Cost</span>
                <span className="font-medium">{moneyOrEmpty(materialCost)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[#6B7280]">Labour Cost</span>
                <Input
                  type="number"
                  className="h-8 w-28 text-right [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  value={labourCost || ""}
                  onChange={(e) => setLabourCost(e.target.value === "" ? 0 : Number(e.target.value) || 0)}
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[#6B7280]">Machine Cost</span>
                <Input
                  type="number"
                  className="h-8 w-28 text-right [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  value={machineCost || ""}
                  onChange={(e) => setMachineCost(e.target.value === "" ? 0 : Number(e.target.value) || 0)}
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[#6B7280]">Other Exp</span>
                <Input
                  type="number"
                  className="h-8 w-28 text-right [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  value={overhead || ""}
                  onChange={(e) => setOverhead(e.target.value === "" ? 0 : Number(e.target.value) || 0)}
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[#6B7280]">Wastage %</span>
                <Input
                  type="number"
                  className="h-8 w-28 text-right [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  value={wastagePct || ""}
                  onChange={(e) => setWastagePct(e.target.value === "" ? 0 : Number(e.target.value) || 0)}
                />
              </div>
              {wastagePct > 0 && materialCost > 0 ? (
                <div className="flex justify-between text-xs text-[#9CA3AF]">
                  <span>Wastage on material</span>
                  <span>{moneyOrEmpty(round2(materialCost * (wastagePct / 100)))}</span>
                </div>
              ) : null}
              <div className="flex items-end justify-between border-t border-[#E5E7EB] pt-3">
                <span className="font-semibold text-[#111827]">Total BOM Cost</span>
                <span className="text-xl font-bold text-[#16A34A]">{moneyOrEmpty(totalBomCost)}</span>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
            <h3 className="mb-4 text-base font-semibold text-[#111827]">Stock Availability</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-left text-[#6B7280]">
                    <th className="pb-2 font-semibold">Component</th>
                    <th className="pb-2 text-right font-semibold">Req.</th>
                    <th className="pb-2 text-right font-semibold">Avail.</th>
                    <th className="pb-2 text-right font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {components.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-4 text-center text-[#6B7280]">
                        Add components to check stock availability.
                      </td>
                    </tr>
                  ) : (
                    components.map((c) => {
                    const required = round2(c.qty * (1 + c.wastagePct / 100) * outputQty);
                    const available = getAvailableQty(c.itemCode, c.availableQty);
                    const ok = available >= required;
                    return (
                      <tr key={c.id} className="border-b last:border-0">
                        <td className="py-2 pr-2 font-medium text-[#111827]">{c.itemName}</td>
                        <td className="py-2 text-right">{required}</td>
                        <td className="py-2 text-right">{available}</td>
                        <td className="py-2 text-right">
                          <span className={cn("inline-flex items-center gap-1 font-medium", ok ? "text-[#16A34A]" : "text-[#DC2626]")}>
                            <span className={cn("h-1.5 w-1.5 rounded-full", ok ? "bg-[#16A34A]" : "bg-[#DC2626]")} />
                            {ok ? "Available" : "Shortage"}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                  )}
                </tbody>
              </table>
            </div>
            <button
              type="button"
              className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-[#2563EB]"
              onClick={() => setLocation("/inventory/reports")}
            >
              View Full Stock Report <ArrowRight className="h-3 w-3" />
            </button>
          </div>

          <div className="rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
            <h3 className="mb-4 text-base font-semibold text-[#111827]">BOM Information</h3>
            <div className="space-y-3 text-sm">
              <InfoLine label="Created By" value={createdBy} />
              <InfoLine label="Created Date" value={formatStamp(createdAt)} />
              <InfoLine label="Last Updated By" value={updatedBy} />
              <InfoLine label="Last Updated" value={formatStamp(updatedAt)} />
            </div>
          </div>
        </div>
      </div>

      {/* Footer actions — same pattern as other document pages */}
      <div className="flex justify-end gap-3 pb-2 pt-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            resetForm();
            setMode("list");
          }}
        >
          Cancel
        </Button>
        <Button type="button" variant="outline" className="gap-2" onClick={() => saveBom(true)}>
          <Save className="h-4 w-4" /> Save & Draft
        </Button>
        <Button type="button" className="gap-2 bg-[#2563EB] hover:bg-[#1D4ED8]" onClick={() => saveBom(false)}>
          <Check className="h-4 w-4" /> Save BOM
        </Button>
      </div>

      <Dialog open={compDialogOpen} onOpenChange={setCompDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingCompId ? "Edit Component" : "Add Component"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Stock Item *</Label>
              <Select
                value={compForm.stockItemId}
                onValueChange={(id) => {
                  const item = componentOptions.find((p) => p.id === id);
                  if (item) applyStockItemToCompForm(item);
                }}
                disabled={!componentOptions.length}
              >
                <SelectTrigger><SelectValue placeholder="Select stock item" /></SelectTrigger>
                <SelectContent>
                  {componentOptions.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Item Code</Label>
              <Input value={compForm.itemCode} readOnly className="bg-[#F9FAFB]" />
            </div>
            <div className="space-y-1.5">
              <Label>Item Name</Label>
              <Input value={compForm.itemName} readOnly className="bg-[#F9FAFB]" />
            </div>
            <div className="space-y-1.5">
              <Label>Required Qty</Label>
              <Input
                type="number"
                className="[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                value={compForm.qty || ""}
                onChange={(e) => setCompForm((f) => ({ ...f, qty: e.target.value === "" ? 0 : Number(e.target.value) || 0 }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>UOM</Label>
              <Input value={compForm.uom} onChange={(e) => setCompForm((f) => ({ ...f, uom: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Wastage %</Label>
              <Input
                type="number"
                className="[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                value={compForm.wastagePct || ""}
                onChange={(e) => setCompForm((f) => ({ ...f, wastagePct: e.target.value === "" ? 0 : Number(e.target.value) || 0 }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Unit Cost (SGD)</Label>
              <Input
                type="number"
                step="0.01"
                className="[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                value={compForm.unitCost || ""}
                onChange={(e) => setCompForm((f) => ({ ...f, unitCost: e.target.value === "" ? 0 : Number(e.target.value) || 0 }))}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Available Qty {warehouse ? `(${warehouse})` : ""}</Label>
              <Input
                type="number"
                readOnly
                className="bg-[#F9FAFB]"
                value={compForm.itemCode ? getAvailableQty(compForm.itemCode, compForm.availableQty) || "" : ""}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCompDialogOpen(false)}>Cancel</Button>
            <Button type="button" className="bg-[#2563EB] hover:bg-[#1D4ED8]" onClick={saveComponent}>
              {editingCompId ? "Save Changes" : "Add Component"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>How BOM Works?</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm text-[#4B5563]">
            <p>1. Enter the finished product name and output quantity.</p>
            <p>2. Add raw material components with qty, wastage and unit cost.</p>
            <p>3. Review cost summary and stock availability.</p>
            <p>4. Save as Draft or Save BOM to activate.</p>
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => setHelpOpen(false)}>Got it</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-[#9CA3AF]">{label}</p>
      <p className="font-medium text-[#111827]">{value}</p>
    </div>
  );
}
