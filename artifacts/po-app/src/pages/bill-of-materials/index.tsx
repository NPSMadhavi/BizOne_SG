import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { inventoryApi } from "@/lib/inventory-api";
import { invalidateInventoryQueries } from "@/lib/invalidate-inventory";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { usePagination } from "@/hooks/use-pagination";
import { ListPagination } from "@/components/list-pagination";
import {
  Info,
  Plus,
  Pencil,
  Trash2,
  GripVertical,
  Save,
  Check,
  ArrowLeft,
  ChevronDown,
} from "lucide-react";

type CustomBomCost = {
  id: string;
  name: string;
  amount: number;
};

type ManagedBomCost = CustomBomCost & {
  /** Built-in Labour / Machine / Other rows (can still be renamed or removed). */
  builtin?: boolean;
};

const DEFAULT_MANAGED_COSTS: ManagedBomCost[] = [
  { id: "labour", name: "Labour Cost", amount: 0, builtin: true },
  { id: "machine", name: "Machine Cost", amount: 0, builtin: true },
  { id: "other", name: "Other Exp", amount: 0, builtin: true },
];

function splitManagedCosts(costs: ManagedBomCost[]) {
  const labourCost = costs.find((c) => c.id === "labour")?.amount ?? 0;
  const machineCost = costs.find((c) => c.id === "machine")?.amount ?? 0;
  const overhead = costs.find((c) => c.id === "other")?.amount ?? 0;
  const customCosts = costs
    .filter((c) => c.id !== "labour" && c.id !== "machine" && c.id !== "other")
    .map(({ id, name, amount }) => ({ id, name, amount }));
  return { labourCost, machineCost, overhead, customCosts };
}

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
  { value: "Strip", label: "Strip" },
  { value: "Kg", label: "Kg" },
  { value: "Litre", label: "Litre" },
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
  salesPerson?: string;
  description?: string;
  components: BomComponent[];
  labourCost: number;
  machineCost: number;
  overhead: number;
  customCosts?: CustomBomCost[];
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

function managedCostsFromBom(bom: Pick<BomRecord, "labourCost" | "machineCost" | "overhead" | "customCosts">): ManagedBomCost[] {
  const customs = Array.isArray(bom.customCosts) ? bom.customCosts : [];
  return [
    { id: "labour", name: "Labour Cost", amount: Number(bom.labourCost) || 0, builtin: true },
    { id: "machine", name: "Machine Cost", amount: Number(bom.machineCost) || 0, builtin: true },
    { id: "other", name: "Other Exp", amount: Number(bom.overhead) || 0, builtin: true },
    ...customs.map((c) => ({ id: c.id, name: c.name, amount: Number(c.amount) || 0, builtin: false })),
  ];
}

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
  const factor = Math.max(0, Number(outputQty) || 0);
  const effectiveQty = (Number(c.qty) || 0) * (1 + (Number(c.wastagePct) || 0) / 100) * factor;
  return round2(effectiveQty * (Number(c.unitCost) || 0));
}

/** Wastage % applies to material only; labour / machine / other / custom are added as-is. */
function computeBomTotal(
  materialCost: number,
  labourCost: number,
  machineCost: number,
  overhead: number,
  wastagePct: number,
  customCosts: CustomBomCost[] = [],
) {
  const wastageAmt = round2(materialCost * ((Number(wastagePct) || 0) / 100));
  const customSum = customCosts.reduce((s, c) => s + (Number(c.amount) || 0), 0);
  return round2(materialCost + wastageAmt + labourCost + machineCost + overhead + customSum);
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
  stockGroup?: string;
  category?: string;
};

function parseLinkedStockId(productId: string): number | null {
  if (!productId || productId.startsWith("manual-") || productId.startsWith("bom-")) return null;
  const n = Number(productId);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function generateStockCode(label: string, taken: Set<string>) {
  const base = label.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24) || "BOM-PRODUCT";
  let code = base;
  let i = 1;
  while (taken.has(code.toLowerCase())) {
    code = `${base}-${i++}`;
  }
  return code;
}

async function syncFinishedProductStock(record: BomRecord, stockOptions: StockItemOption[]): Promise<string> {
  const qty = Math.max(0, Number(record.outputQty) || 0);
  const materialCost = round2(record.components.reduce((s, c) => s + lineTotal(c, 1), 0));
  const managed = round2(
    (Number(record.labourCost) || 0) +
      (Number(record.machineCost) || 0) +
      (Number(record.overhead) || 0) +
      (record.customCosts || []).reduce((s, c) => s + (Number(c.amount) || 0), 0),
  );
  const total = round2(materialCost + managed);
  const unitPrice = qty > 0 ? round2(total / qty) : 0;
  const label = record.productLabel.trim();
  const taken = new Set(stockOptions.map((o) => o.code.toLowerCase()));

  const linkedId = parseLinkedStockId(record.productId);
  const byName = stockOptions.find((o) => o.name.trim().toLowerCase() === label.toLowerCase());
  const byId = linkedId ? stockOptions.find((o) => o.id === String(linkedId)) : undefined;
  const existing = byId || byName;

  const body = {
    name: label,
    description: record.description?.trim() || `BOM ${record.version}`,
    uom: record.outputUom?.trim() || "Pcs",
    type: "product",
    unitPrice,
    purchasePrice: unitPrice,
    stockQty: Math.max(0, Number(record.outputQty) || 0),
    isActive: record.status === "active",
  };

  if (existing) {
    const res = await fetch(`/api/stock-items/${existing.id}`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, code: existing.code }),
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.error || "Failed to update stock item");
    }
    return existing.id;
  }

  const code = generateStockCode(label, taken);
  const res = await fetch("/api/stock-items", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, code }),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error || "Failed to create stock item");
  }
  const created = await res.json();
  return String(created.id);
}

export default function BillOfMaterialsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const userName = (user as any)?.fullName || user?.username || "User";

  const [mode, setMode] = useState<"form" | "list">("list");
  const [bomList, setBomList] = useState<BomRecord[]>(() => loadList());
  const { page, setPage, totalPages, paginatedItems } = usePagination(bomList);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [productName, setProductName] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [version, setVersion] = useState("V1.0");
  const [outputQty, setOutputQty] = useState(1);
  const [outputUom, setOutputUom] = useState("");
  const [status] = useState<"active" | "draft" | "inactive">("active");
  const [category, setCategory] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [warehouse, setWarehouse] = useState("");
  const [components, setComponents] = useState<BomComponent[]>([]);
  const [managedCosts, setManagedCosts] = useState<ManagedBomCost[]>(() =>
    DEFAULT_MANAGED_COSTS.map((c) => ({ ...c })),
  );
  const [costDialog, setCostDialog] = useState<{ mode: "create" | "edit"; id?: string } | null>(null);
  const [costNameDraft, setCostNameDraft] = useState("");
  const [costAmountDraft, setCostAmountDraft] = useState("");
  const [costMenuOpen, setCostMenuOpen] = useState(false);
  const [autoConsume, setAutoConsume] = useState(true);
  const [allowSubstitute, setAllowSubstitute] = useState(true);
  const [approvalRequired, setApprovalRequired] = useState(false);
  const [allowNegativeStock, setAllowNegativeStock] = useState(false);
  const [notes, setNotes] = useState("");
  const [createdBy, setCreatedBy] = useState(userName);
  const [createdAt, setCreatedAt] = useState(() => new Date().toISOString());
  const [updatedBy, setUpdatedBy] = useState(userName);
  const [updatedAt, setUpdatedAt] = useState(() => new Date().toISOString());
  const [saving, setSaving] = useState(false);

  const [compDialogOpen, setCompDialogOpen] = useState(false);
  const [stockItemOpen, setStockItemOpen] = useState(false);
  const [stockItemQuery, setStockItemQuery] = useState("");
  const [compStockGroup, setCompStockGroup] = useState("all");
  const [editingCompId, setEditingCompId] = useState<string | null>(null);
  const [customUoms, setCustomUoms] = useState<string[]>(() => loadCustomUoms());
  const [createUomOpen, setCreateUomOpen] = useState(false);
  const [newUomName, setNewUomName] = useState("");
  const [createProductOpen, setCreateProductOpen] = useState(false);
  const [creatingProduct, setCreatingProduct] = useState(false);
  const [newProductForm, setNewProductForm] = useState({
    name: "",
    uom: "Pcs",
    category: "",
  });
  const [compForm, setCompForm] = useState({
    stockItemId: "",
    itemCode: "",
    itemName: "",
    qty: 1,
    uom: "Pcs",
    wastagePct: 0,
    unitCost: 0,
    availableQty: 0,
  });

  const { data: stockItems = [] } = useQuery<any[]>({
    queryKey: ["bom-stock-items-full"],
    staleTime: 0,
    queryFn: async () => {
      const res = await fetch("/api/stock-items", { credentials: "include" });
      if (!res.ok) return [];
      const rows = await res.json();
      return Array.isArray(rows) ? rows : [];
    },
  });
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
        stockGroup: String(i.stockGroup || "").trim(),
        category: String(i.category || "").trim(),
      }));
  }, [stockItems]);

  const stockGroupOptions = useMemo(() => {
    const set = new Set<string>();
    try {
      const raw = localStorage.getItem("stock-custom-stock-groups");
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) {
        for (const g of parsed) {
          const name = String(g || "").trim();
          if (name) set.add(name);
        }
      }
    } catch {
      // ignore
    }
    for (const i of allStockOptions) {
      if (i.stockGroup) set.add(i.stockGroup);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allStockOptions]);

  const componentOptions = useMemo(() => {
    if (compStockGroup === "all") return allStockOptions;
    return allStockOptions.filter(
      (p) => String(p.stockGroup || "").toLowerCase() === compStockGroup.toLowerCase(),
    );
  }, [allStockOptions, compStockGroup]);

  const filteredComponentOptions = useMemo(() => {
    const q = stockItemQuery.trim().toLowerCase();
    if (!q) return componentOptions;
    return componentOptions.filter((p) =>
      p.label.toLowerCase().includes(q) ||
      p.code.toLowerCase().includes(q) ||
      p.name.toLowerCase().includes(q),
    );
  }, [componentOptions, stockItemQuery]);

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
    for (const item of allStockOptions) addExtra(item.uom);
    for (const c of components) addExtra(c.uom);
    addExtra(compForm.uom);
    addExtra(outputUom);
    return [...UOM_OPTIONS, ...extras];
  }, [customUoms, allStockOptions, components, compForm.uom, outputUom]);

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
    setCompForm((f) => ({ ...f, uom: selected }));
    setOutputUom(selected);
    setCreateUomOpen(false);
    setNewUomName("");
  }

  async function handleCreateProduct() {
    const name = newProductForm.name.trim();
    if (!name) {
      toast({ title: "Name required", description: "Enter a product name.", variant: "destructive" });
      return;
    }
    setCreatingProduct(true);
    try {
      const res = await fetch("/api/stock-items", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          uom: newProductForm.uom.trim() || "Pcs",
          type: "product",
          category: newProductForm.category.trim() || null,
          unitPrice: 0,
          purchasePrice: 0,
          stockQty: 0,
          isActive: true,
          trackInventory: true,
          showInPos: true,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to create product");
      }
      const created = await res.json();
      await queryClient.invalidateQueries({ queryKey: ["bom-stock-items-full"] });
      const id = String(created.id);
      setSelectedProductId(id);
      setProductName(String(created.name || name));
      setOutputUom(normalizeUom(created.uom || newProductForm.uom));
      if (created.category || newProductForm.category) {
        setCategory(String(created.category || newProductForm.category));
      }
      setCreateProductOpen(false);
      setNewProductForm({ name: "", uom: "Pcs", category: "" });
      toast({ title: "Product created", description: `${created.code || ""} ${created.name || name}`.trim() });
    } catch (err: any) {
      toast({
        title: "Error",
        description: err?.message || "Failed to create product",
        variant: "destructive",
      });
    } finally {
      setCreatingProduct(false);
    }
  }

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
  /** Material = component line totals (qty × unit cost). Do NOT multiply by finished BOM Qty again. */
  const materialCost = useMemo(
    () => round2(components.reduce((s, c) => s + lineTotal(c, 1), 0)),
    [components],
  );
  const outputQtySafe = Math.max(0, Number(outputQty) || 0);
  const managedCostSum = useMemo(
    () => round2(managedCosts.reduce((s, c) => s + (Number(c.amount) || 0), 0)),
    [managedCosts],
  );
  const { labourCost, machineCost, overhead, customCosts } = useMemo(
    () => splitManagedCosts(managedCosts),
    [managedCosts],
  );
  /** Total BOM Cost = Material + Labour + Machine + Other + custom. */
  const totalBomCost = useMemo(
    () => round2(materialCost + managedCostSum),
    [materialCost, managedCostSum],
  );
  /** Per Item Cost = Total BOM Cost ÷ BOM Qty. */
  const perItemCost = useMemo(() => {
    if (outputQtySafe <= 0) return 0;
    return round2(totalBomCost / outputQtySafe);
  }, [totalBomCost, outputQtySafe]);

  function resetForm() {
    setEditingId(null);
    setProductName("");
    setSelectedProductId("");
    setVersion("V1.0");
    setOutputQty(1);
    setOutputUom("PCS");
    setCategory("");
    setEffectiveDate(new Date().toISOString().slice(0, 10));
    setWarehouse(warehouseOptions[0]?.name || "");
    setComponents([]);
    setManagedCosts(DEFAULT_MANAGED_COSTS.map((c) => ({ ...c })));
    setCostDialog(null);
    setCostNameDraft("");
    setCostAmountDraft("");
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
    setSelectedProductId(parseLinkedStockId(bom.productId) ? String(parseLinkedStockId(bom.productId)) : "");
    setVersion(bom.version);
    setOutputQty(bom.outputQty);
    setOutputUom(bom.outputUom);
    setCategory(bom.category || "");
    setEffectiveDate(bom.effectiveDate);
    setWarehouse(bom.warehouse);
    setComponents(bom.components);
    setManagedCosts(managedCostsFromBom(bom));
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
      productId: selectedProductId
        || (editingId ? (bomList.find((b) => b.id === editingId)?.productId || `manual-${Date.now()}`) : `manual-${Date.now()}`),
      productLabel: label,
      version,
      outputQty,
      outputUom,
      status: forceStatus || status,
      category: category.trim(),
      effectiveDate,
      warehouse,
      components,
      labourCost,
      machineCost,
      overhead,
      customCosts,
      wastagePct: 0,
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

  async function saveBom(asDraft = false) {
    if (!productName.trim() && !selectedProductId) {
      toast({ title: "Product required", description: "Select a finished product from Item Master." });
      return;
    }
    if (!components.length) {
      toast({ title: "Components required", description: "Add at least one raw material component.", variant: "destructive" });
      return;
    }
    const record = buildRecord(asDraft ? "draft" : status === "draft" && !asDraft ? "active" : status);
    if (asDraft) record.status = "draft";

    setSaving(true);
    try {
      if (!asDraft && record.status !== "draft") {
        record.productId = await syncFinishedProductStock(record, allStockOptions);
      }

      const next = editingId
        ? bomList.map((b) => (b.id === editingId ? record : b))
        : [record, ...bomList];
      setBomList(next);
      saveList(next);
      setEditingId(record.id);
      setUpdatedBy(record.updatedBy);
      setUpdatedAt(record.updatedAt);

      if (!asDraft && record.status !== "draft") {
        await queryClient.invalidateQueries({ queryKey: ["bom-stock-items-full"] });
        await invalidateInventoryQueries(queryClient);
      }

      toast({
        title: asDraft ? "Draft saved" : "BOM saved",
        description: !asDraft && record.status !== "draft"
          ? `${record.productLabel}: qty ${record.outputQty} & unit cost synced to Item Master`
          : record.productLabel,
      });
      if (!asDraft) {
        resetForm();
        setMode("list");
      }
    } catch (err: any) {
      toast({
        title: "Error",
        description: err?.message || "Failed to save BOM",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  function openAddComponent() {
    setEditingCompId(null);
    setCompForm({
      stockItemId: "",
      itemCode: "",
      itemName: "",
      qty: 1,
      uom: "Pcs",
      wastagePct: 0,
      unitCost: 0,
      availableQty: 0,
    });
    setCompStockGroup("all");
    setStockItemQuery("");
    setStockItemOpen(false);
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
      uom: normalizeUom(c.uom),
      wastagePct: c.wastagePct,
      unitCost: c.unitCost,
      availableQty: getAvailableQty(c.itemCode, c.availableQty),
    });
    setCompStockGroup(match?.stockGroup || "all");
    setStockItemQuery("");
    setStockItemOpen(false);
    setCompDialogOpen(true);
  }

  function applyStockItemToCompForm(item: StockItemOption) {
    setCompForm((f) => ({
      ...f,
      stockItemId: item.id,
      itemCode: item.code,
      itemName: item.name,
      uom: normalizeUom(item.uom),
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

  if (mode === "list") {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-[#2563EB]">Bill of Materials (BOM)</h1>
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
                paginatedItems.map((b) => {
                  const materialCost = round2(b.components.reduce((s, c) => s + lineTotal(c, 1), 0));
                  const managed = round2(
                    (Number(b.labourCost) || 0) +
                      (Number(b.machineCost) || 0) +
                      (Number(b.overhead) || 0) +
                      (b.customCosts || []).reduce((s, c) => s + (Number(c.amount) || 0), 0),
                  );
                  const total = round2(materialCost + managed);
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
          <ListPagination page={page} totalPages={totalPages} onPageChange={setPage} />
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
          </div>
        </div>
        <div className="flex shrink-0 flex-nowrap items-center gap-2">
          {editingId && (
            <Button
              type="button"
              variant="destructive"
              size="icon"
              title="Delete"
              onClick={() => {
                const next = bomList.filter((x) => x.id !== editingId);
                setBomList(next);
                saveList(next);
                toast({ title: "BOM deleted" });
                resetForm();
                setMode("list");
              }}
            >
              <Trash2 className="h-4 w-4" />
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
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-1.5 min-w-0">
                  <Label>
                    Product <span className="text-[#DC2626]">*</span>
                  </Label>
                  <Select
                    value={selectedProductId || undefined}
                    onValueChange={(id) => {
                      const item = allStockOptions.find((p) => p.id === id);
                      if (!item) return;
                      setSelectedProductId(item.id);
                      setProductName(item.name);
                      setOutputUom(normalizeUom(item.uom));
                      if (item.category) setCategory(item.category);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="PCS" />
                    </SelectTrigger>
                    <SelectContent className="max-h-60">
                      <div
                        className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm font-medium text-primary hover:bg-accent"
                        onClick={(e) => {
                          e.preventDefault();
                          setNewProductForm({
                            name: "",
                            uom: outputUom || "Pcs",
                            category: category || "",
                          });
                          setCreateProductOpen(true);
                        }}
                      >
                        <Plus className="h-4 w-4" /> Create
                      </div>
                      <div className="my-1 border-t" />
                      {allStockOptions.length === 0 ? (
                        <p className="px-2 py-2 text-sm text-muted-foreground">No items in Item Master</p>
                      ) : (
                        allStockOptions.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.label}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 min-w-0">
                  <Label>Qty</Label>
                  <Input
 type="number"
 min={0}
 step="0.01"
 value={outputQty === 0 ? "" : outputQty}
 onChange={(e) => {
                      const raw = e.target.value;
                      if (raw === "") {
                        setOutputQty(0);
                        return;
                      }
                      const n = Number(raw);
                      setOutputQty(Number.isFinite(n) && n >= 0 ? n : 0);
                    }}
 className="[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  />
                </div>
                <div className="space-y-1.5 min-w-0">
                  <Label>UOM</Label>
                  <Select
                    value={outputUom || undefined}
                    onValueChange={setOutputUom}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select sales person" />
                    </SelectTrigger>
                    <SelectContent className="max-h-48 overflow-y-auto">
                      {uomOptions.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-1.5 min-w-0">
                  <Label>Category</Label>
                  <Input
 value={category}
 onChange={(e) => setCategory(e.target.value)}
                    
                  />
                </div>
                <div className="space-y-1.5 min-w-0">
                  <Label>Date</Label>
                  <Input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
                </div>
                <div className="space-y-1.5 min-w-0">
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
              <table className="w-full min-w-[700px] text-sm">
                <thead>
                  <tr className="border-b bg-[#F9FAFB] text-left text-xs uppercase tracking-wide text-[#6B7280]">
                    <th className="px-3 py-2.5">#</th>
                    <th className="px-3 py-2.5">Item Code</th>
                    <th className="px-3 py-2.5">Item Name</th>
                    <th className="px-3 py-2.5 text-right">Qty / Unit</th>
                    <th className="px-3 py-2.5">UOM</th>
                    <th className="px-3 py-2.5 text-right">Unit Cost</th>
                    <th className="px-3 py-2.5 text-right">Line Cost</th>
                    <th className="px-3 py-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="min-h-[240px]">
                  {components.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-3 py-20 text-center text-sm text-[#6B7280]">
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
                      <td className="px-3 py-2.5 text-right">{(Number(c.unitCost) || 0).toFixed(2)}</td>
                      <td className="px-3 py-2.5 text-right font-medium">{lineTotal(c, 1).toFixed(2)}</td>
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
            <div className="mb-4 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-base font-semibold text-[#111827]">Cost Summary</h3>
              </div>
              <Select
                open={costMenuOpen}
                onOpenChange={setCostMenuOpen}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Search item" />
                </SelectTrigger>
                <SelectContent className="max-h-[14rem]">
                  <div
                    className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm font-medium text-primary hover:bg-accent"
                    onClick={(event) => {
                      event.preventDefault();
                      setCostMenuOpen(false);
                      setCostNameDraft("");
                      setCostAmountDraft("");
                      setCostDialog({ mode: "create" });
                    }}
                  >
                    <Plus className="h-4 w-4" />
                    Create New Cost
                  </div>
                  <div className="my-1 border-t" />
                  {managedCosts.length === 0 ? (
                    <p className="px-2 py-2 text-sm text-muted-foreground">No costs yet</p>
                  ) : (
                    managedCosts.map((c) => (
                      <div key={c.id} className="relative">
                        <SelectItem value={c.id} className="pr-16">
                          {c.name}
                        </SelectItem>
                        <button
                          type="button"
                          title={`Edit ${c.name}`}
                          className="absolute right-8 top-1/2 z-10 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-[#6B7280] hover:bg-gray-100 hover:text-[#111827]"
                          onPointerDown={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            setCostMenuOpen(false);
                            setCostNameDraft(c.name);
                            setCostAmountDraft(c.amount ? String(c.amount) : "");
                            setCostDialog({ mode: "edit", id: c.id });
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          title={`Delete ${c.name}`}
                          className="absolute right-2 top-1/2 z-10 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-[#DC2626] hover:bg-red-50"
                          onPointerDown={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            setCostMenuOpen(false);
                            setManagedCosts((prev) => prev.filter((x) => x.id !== c.id));
                            toast({ title: `${c.name} removed` });
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-[#6B7280]">Material Cost</span>
                <span className="font-medium">{moneyOrEmpty(materialCost)}</span>
              </div>
              {managedCosts.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-3">
                  <span className="text-[#6B7280]">{c.name}</span>
                  <Input
                    type="number"
                    className="h-8 w-28 text-right [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    value={c.amount || ""}
                    onChange={(e) => {
                      const amount = e.target.value === "" ? 0 : Number(e.target.value) || 0;
                      setManagedCosts((prev) =>
                        prev.map((x) => (x.id === c.id ? { ...x, amount } : x)),
                      );
                    }}
                  />
                </div>
              ))}
              <div className="flex items-end justify-between border-t border-[#E5E7EB] pt-3">
                <span className="font-semibold text-[#111827]">Total BOM Cost</span>
                <span className="text-xl font-bold text-[#16A34A]">{moneyOrEmpty(totalBomCost)}</span>
              </div>
              <div className="flex items-end justify-between">
                <span className="font-semibold text-[#111827]">Per Item Cost</span>
                <span className="text-lg font-bold text-[#111827]">{moneyOrEmpty(perItemCost)}</span>
              </div>
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
        <Button type="button" variant="outline" className="gap-2" onClick={() => saveBom(true)} disabled={saving}>
          <Save className="h-4 w-4" /> Save & Draft
        </Button>
        <Button type="button" className="gap-2 bg-[#2563EB] hover:bg-[#1D4ED8]" onClick={() => saveBom(false)} disabled={saving}>
          <Check className="h-4 w-4" /> {saving ? "Saving..." : "Save BOM"}
        </Button>
      </div>

      <Dialog open={compDialogOpen} onOpenChange={setCompDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingCompId ? "Edit Component" : "Add Component"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Stock Group</Label>
              <Select
                value={compStockGroup}
                onValueChange={(v) => {
                  setCompStockGroup(v);
                  setCompForm((f) => ({
                    ...f,
                    stockItemId: "",
                    itemCode: "",
                    itemName: "",
                    uom: "Pcs",
                    unitCost: 0,
                    availableQty: 0,
                  }));
                  setStockItemQuery("");
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select UOM" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Groups</SelectItem>
                  {stockGroupOptions.map((g) => (
                    <SelectItem key={g} value={g}>{g}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>
                Stock Item <span className="text-[#DC2626]">*</span>
              </Label>
              <Popover open={stockItemOpen} onOpenChange={setStockItemOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!componentOptions.length}
                    className="h-9 w-full justify-between px-3 font-normal"
                  >
                    <span className={cn("truncate", !compForm.stockItemId && "text-muted-foreground")}>
                      {componentOptions.find((p) => p.id === compForm.stockItemId)?.label || "Select stock item"}
                    </span>
                    <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                  <div className="border-b p-2">
                    <Input
                      value={stockItemQuery}
                      onChange={(e) => setStockItemQuery(e.target.value)}
                      placeholder=""
                      autoFocus
                    />
                  </div>
                  <div className="max-h-[11rem] overflow-y-auto p-1">
                    {filteredComponentOptions.length === 0 ? (
                      <p className="px-2 py-2 text-sm text-muted-foreground">No items found</p>
                    ) : (
                      filteredComponentOptions.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          className={cn(
                            "flex w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent",
                            compForm.stockItemId === p.id && "bg-accent",
                          )}
                          onClick={() => {
                            applyStockItemToCompForm(p);
                            setStockItemOpen(false);
                          }}
                        >
                          {p.label}
                        </button>
                      ))
                    )}
                  </div>
                </PopoverContent>
              </Popover>
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
              <Select
 value={compForm.uom || undefined}
 onValueChange={(v) => setCompForm((f) => ({ ...f, uom: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="" />
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
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCompDialogOpen(false)}>Cancel</Button>
            <Button type="button" className="bg-[#2563EB] hover:bg-[#1D4ED8]" onClick={saveComponent}>
              {editingCompId ? "Save Changes" : "Add Component"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

      <Dialog open={createProductOpen} onOpenChange={setCreateProductOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Product</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-1.5">
              <Label>
                Product Name <span className="text-[#DC2626]">*</span>
              </Label>
              <Input
                value={newProductForm.name}
                onChange={(e) => setNewProductForm((f) => ({ ...f, name: e.target.value }))}
                placeholder=""
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label>UOM</Label>
              <Select
                value={newProductForm.uom || undefined}
                onValueChange={(v) => setNewProductForm((f) => ({ ...f, uom: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="" />
                </SelectTrigger>
                <SelectContent className="max-h-48 overflow-y-auto">
                  {uomOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Input
                value={newProductForm.category}
                onChange={(e) => setNewProductForm((f) => ({ ...f, category: e.target.value }))}
                placeholder=""
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCreateProductOpen(false)} disabled={creatingProduct}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void handleCreateProduct()} disabled={creatingProduct}>
              {creatingProduct ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!costDialog} onOpenChange={(open) => !open && setCostDialog(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {costDialog?.mode === "edit" ? "Edit Cost" : "Create Cost"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Cost Name</Label>
              <Input
                value={costNameDraft}
                onChange={(e) => setCostNameDraft(e.target.value)}
                placeholder=""
              />
            </div>
            <div className="space-y-1.5">
              <Label>Amount (SGD)</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={costAmountDraft}
                onChange={(e) => setCostAmountDraft(e.target.value)}
                placeholder=""
                className="[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCostDialog(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (!costDialog) return;
                const name = costNameDraft.trim();
                if (!name) {
                  toast({ title: "Cost name required", variant: "destructive" });
                  return;
                }
                const amount = Math.max(0, Number(costAmountDraft) || 0);
                if (costDialog.mode === "create") {
                  setManagedCosts((prev) => [
                    ...prev,
                    { id: `cost-${Date.now()}`, name, amount, builtin: false },
                  ]);
                  toast({ title: `${name} added` });
                } else if (costDialog.id) {
                  setManagedCosts((prev) =>
                    prev.map((c) =>
                      c.id === costDialog.id ? { ...c, name, amount } : c,
                    ),
                  );
                  toast({ title: `${name} updated` });
                }
                setCostDialog(null);
                setCostNameDraft("");
                setCostAmountDraft("");
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
