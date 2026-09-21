import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import {
  useCreateStockItem,
  useUpdateStockItem,
  useDeleteStockItem,
  useListStockItems,
  getListStockItemsQueryKey,
} from "@workspace/api-client-react";
import { useSalesPersons } from "@/hooks/use-sales-persons";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { previewRunningNumber } from "@/lib/running-number";
import { FormPageShell } from "@/operations-8june/components/layout/FormPageShell";
import {
  ModalCancelButton,
  ModalSaveButton,
  ModalSectionHeader,
} from "@/operations-8june/components/forms/FormModalShell";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Camera, Info, Package, Plus, ScanLine, Trash2 } from "lucide-react";
import { SyncBridgeDatePicker } from "@/components/ui/sync-bridge-date-picker";
import { useQuery } from "@tanstack/react-query";

function todayYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDisplayDate(ymd: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd;
  const [y, m, day] = ymd.split("-");
  return `${day}/${m}/${y}`;
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

const ITEM_TYPE_OPTIONS = [
  { value: "stock_item", label: "Stock Item" },
  { value: "non_stock_item", label: "Non-Stock Item" },
  { value: "service_item", label: "Service Item" },
  { value: "combo_item", label: "Combo Item" },
  { value: "serialized_item", label: "Serialized Item" },
  { value: "batch_item", label: "Batch Item" },
  { value: "gift_card", label: "Gift Card" },
  { value: "others", label: "Others" },
];

const CUSTOM_UOM_STORAGE_KEY = "stock-custom-uoms";
const CUSTOM_ITEM_TYPE_STORAGE_KEY = "stock-custom-item-types";
const PRICE_LEVELS_STORAGE_KEY = "multi-price-levels-v1";
const PRICE_MAP_STORAGE_KEY = "multi-price-prices-v1";

type PriceLevelOption = { id: string; name: string; description?: string; color?: string; active?: boolean };
type LevelPricing = { markupPct: string | number; marginPct: string | number; unitPrice: string | number };

const FIXED_PRICE_LEVELS: PriceLevelOption[] = [
  { id: "retail", name: "Retail Price", description: "Standard retail selling price", color: "bg-orange-500", active: true },
  { id: "wholesale", name: "Wholesale Price", description: "For wholesale customers", color: "bg-amber-500", active: true },
  { id: "dealer", name: "Dealer Price", description: "For dealers", color: "bg-blue-500", active: true },
];

function loadPriceLevels(): PriceLevelOption[] {
  return [...FIXED_PRICE_LEVELS];
}

function purgeExtraPriceLevels() {
  try {
    localStorage.setItem(PRICE_LEVELS_STORAGE_KEY, JSON.stringify(FIXED_PRICE_LEVELS));
  } catch {
    // ignore
  }
}

function loadPriceMap(): Record<string, Record<string, string>> {
  try {
    const raw = localStorage.getItem(PRICE_MAP_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveItemLevelPrices(itemId: string | number, pricing: Record<string, LevelPricing>) {
  try {
    const map = loadPriceMap();
    const nextEntry: Record<string, string> = { ...(map[String(itemId)] || {}) };
    for (const [levelId, row] of Object.entries(pricing)) {
      const sell = String(row.unitPrice ?? "").trim();
      if (sell !== "" && Number.isFinite(Number(sell))) nextEntry[levelId] = String(Number(sell));
      else delete nextEntry[levelId];
    }
    map[String(itemId)] = nextEntry;
    localStorage.setItem(PRICE_MAP_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

function emptyLevelPricing(): LevelPricing {
  return { markupPct: "", marginPct: "", unitPrice: "" };
}

function loadCustomUoms(): string[] {
  try {
    const raw = localStorage.getItem(CUSTOM_UOM_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((v) => String(v).trim()).filter(Boolean) : [];
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

function loadCustomItemTypes(): { value: string; label: string }[] {
  try {
    const raw = localStorage.getItem(CUSTOM_ITEM_TYPE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((v) => {
        if (typeof v === "string") {
          const label = v.trim();
          return label ? { value: label.toLowerCase().replace(/\s+/g, "_"), label } : null;
        }
        if (v && typeof v === "object" && typeof (v as any).label === "string") {
          const label = String((v as any).label).trim();
          const value = String((v as any).value || label).trim().toLowerCase().replace(/\s+/g, "_");
          return label && value ? { value, label } : null;
        }
        return null;
      })
      .filter(Boolean) as { value: string; label: string }[];
  } catch {
    return [];
  }
}

function saveCustomItemTypes(values: { value: string; label: string }[]) {
  try {
    localStorage.setItem(CUSTOM_ITEM_TYPE_STORAGE_KEY, JSON.stringify(values));
  } catch {
    // ignore
  }
}

function normalizeUom(raw?: string | null) {
  const value = (raw || "").trim();
  if (!value) return "Pcs";
  return UOM_OPTIONS.find((o) => o.value.toLowerCase() === value.toLowerCase())?.value ?? value;
}

function normalizeItemType(raw?: string | null) {
  const value = (raw || "").trim();
  if (!value || value === "product") return "stock_item";
  if (value === "service") return "service_item";
  return value;
}

const EMPTY_FORM = {
  code: "",
  name: "",
  uom: "Pcs",
  type: "stock_item",
  category: "",
  brand: "",
  barcode: "",
  salesPerson: "",
  selectedPriceLevel: "retail",
  levelPricing: {} as Record<string, LevelPricing>,
  itemImage: "",
  purchasePrice: "" as string | number,
  purchasePriceDate: todayYmd(),
  unitPrice: "" as string | number,
  markupPct: "" as string | number,
  marginPct: "" as string | number,
  isActive: true,
  trackInventory: true,
  showInPos: true,
  pricingMethod: "fixed",
  autoUpdateSelling: true,
  alternateUom: "",
  alternateQty: "" as string | number,
  mainQty: "" as string | number,
};

function fmtPct(n: number) {
  if (!Number.isFinite(n)) return "";
  return (Math.round(n * 100) / 100).toFixed(2);
}

function fmtMoney(n: number) {
  if (!Number.isFinite(n)) return "";
  return (Math.round(n * 100) / 100).toFixed(2);
}

function calcMarkup(cost: number, sell: number) {
  if (!(cost > 0)) return "";
  return fmtPct(((sell - cost) / cost) * 100);
}

function calcMargin(cost: number, sell: number) {
  if (!(sell > 0)) return "";
  return fmtPct(((sell - cost) / sell) * 100);
}

function sellFromMarkup(cost: number, markup: number) {
  return fmtMoney(cost * (1 + markup / 100));
}

function sellFromMargin(cost: number, margin: number) {
  if (margin >= 100) return "";
  return fmtMoney(cost / (1 - margin / 100));
}

export default function StockItemFormPage() {
  const params = useParams<{ id?: string }>();
  const editId = params.id ? Number(params.id) : NaN;
  const isEdit = Number.isFinite(editId) && editId > 0;
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const imageInputRef = useRef<HTMLInputElement>(null);
  const { canManage } = useAuth();

  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [customUoms, setCustomUoms] = useState<string[]>(() => loadCustomUoms());
  const [customItemTypes, setCustomItemTypes] = useState<{ value: string; label: string }[]>(() => loadCustomItemTypes());
  const [priceLevels] = useState<PriceLevelOption[]>(() => {
    purgeExtraPriceLevels();
    return loadPriceLevels();
  });
  const [createUomOpen, setCreateUomOpen] = useState(false);
  const [newUomName, setNewUomName] = useState("");
  const [createItemTypeOpen, setCreateItemTypeOpen] = useState(false);
  const [newItemTypeName, setNewItemTypeName] = useState("");
  const [createPriceLevelOpen, setCreatePriceLevelOpen] = useState(false);
  const [newPriceLevelName, setNewPriceLevelName] = useState("");
  const [altUnitsOpen, setAltUnitsOpen] = useState(false);
  const [altDraft, setAltDraft] = useState({ alternateUom: "", alternateQty: "", mainQty: "" });
  const [loaded, setLoaded] = useState(!isEdit);

  const createMutation = useCreateStockItem();
  const updateMutation = useUpdateStockItem();
  const deleteMutation = useDeleteStockItem();
  const saving = createMutation.isPending || updateMutation.isPending;
  const deleting = deleteMutation.isPending;
  const { salesPersons } = useSalesPersons();

  const { data: items = [] } = useListStockItems(
    {} as any,
    { query: { queryKey: getListStockItemsQueryKey({} as any), enabled: isEdit } },
  );

  const { data: priceHistory = [], refetch: refetchPriceHistory } = useQuery({
    queryKey: ["stock-item-purchase-prices", editId],
    enabled: isEdit,
    queryFn: async () => {
      const res = await fetch(`/api/stock-items/${editId}/purchase-prices`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json() as Promise<Array<{
        id: number;
        purchasePrice: string;
        effectiveDate: string;
        sourceType: string;
        sourceRef: string | null;
        notes: string | null;
      }>>;
    },
  });

  useEffect(() => {
    if (!isEdit) return;
    const item = (items as any[]).find((i) => Number(i.id) === editId);
    if (!item) return;
    const cost = parseFloat(String(item.purchasePrice)) || 0;
    const sell = parseFloat(String(item.unitPrice)) || 0;
    const savedMap = loadPriceMap()[String(editId)] || {};
    const levelPricing: Record<string, LevelPricing> = {};
    for (const level of loadPriceLevels()) {
      const levelSellRaw = savedMap[level.id];
      const levelSell = levelSellRaw != null && levelSellRaw !== "" ? parseFloat(String(levelSellRaw)) : NaN;
      if (level.id === "retail") {
        const retailSell = Number.isFinite(levelSell) && levelSell > 0 ? levelSell : sell;
        levelPricing.retail = {
          unitPrice: retailSell > 0 ? String(retailSell) : "",
          markupPct: cost > 0 && retailSell > 0 ? calcMarkup(cost, retailSell) : "",
          marginPct: cost > 0 && retailSell > 0 ? calcMargin(cost, retailSell) : "",
        };
      } else if (Number.isFinite(levelSell) && levelSell > 0) {
        levelPricing[level.id] = {
          unitPrice: String(levelSell),
          markupPct: cost > 0 ? calcMarkup(cost, levelSell) : "",
          marginPct: calcMargin(cost, levelSell),
        };
      } else {
        levelPricing[level.id] = emptyLevelPricing();
      }
    }
    const retail = levelPricing.retail || emptyLevelPricing();
    const selectedId = FIXED_PRICE_LEVELS.some((l) => l.id === "retail") ? "retail" : FIXED_PRICE_LEVELS[0].id;
    setForm({
      code: item.code || "",
      name: item.name || "",
      uom: normalizeUom(item.uom),
      type: normalizeItemType(item.type),
      category: item.category || "",
      brand: item.brand || "",
      barcode: item.barcode || "",
      salesPerson: item.salesPerson || "",
      selectedPriceLevel: selectedId,
      levelPricing,
      itemImage: item.itemImage || item.item_image || "",
      purchasePrice: cost > 0 ? String(item.purchasePrice) : "",
      purchasePriceDate: todayYmd(),
      unitPrice: retail.unitPrice !== "" ? retail.unitPrice : (sell > 0 ? String(item.unitPrice) : ""),
      markupPct: retail.markupPct !== "" ? retail.markupPct : (cost > 0 && sell > 0 ? calcMarkup(cost, sell) : ""),
      marginPct: retail.marginPct !== "" ? retail.marginPct : (cost > 0 && sell > 0 ? calcMargin(cost, sell) : ""),
      isActive: item.isActive ?? true,
      trackInventory: item.trackInventory ?? true,
      showInPos: item.showInPos ?? true,
      pricingMethod: item.pricingMethod || "fixed",
      autoUpdateSelling: true,
      alternateUom: item.alternateUom || "",
      alternateQty: item.alternateQty != null && item.alternateQty !== "" ? String(item.alternateQty) : "",
      mainQty: item.mainQty != null && item.mainQty !== "" ? String(item.mainQty) : "",
    });
    setLoaded(true);
  }, [isEdit, editId, items]);

  useEffect(() => {
    if (isEdit) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/settings", { credentials: "include" });
        if (!r.ok) return;
        const s = await r.json();
        if (cancelled) return;
        const next = previewRunningNumber(
          (s as any).siPrefix ?? "STK",
          (s as any).siCounter ?? 0,
          (s as any).siSuffix ?? "",
        );
        const nextBc = previewRunningNumber(
          (s as any).bcPrefix ?? "BC",
          (s as any).bcCounter ?? 0,
          (s as any).bcSuffix ?? "",
        );
        setForm((f) => ({
          ...f,
          code: f.code || next,
          barcode: f.barcode || nextBc,
        }));
      } catch {
        // server allocates
      }
    })();
    return () => { cancelled = true; };
  }, [isEdit]);

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
    for (const item of items as any[]) {
      addExtra(item?.uom);
      addExtra(item?.alternateUom);
    }
    addExtra(form.uom);
    addExtra(form.alternateUom);
    return [...UOM_OPTIONS, ...extras];
  }, [customUoms, form.uom, form.alternateUom, items]);

  const itemTypeOptions = useMemo(() => {
    const seen = new Set(ITEM_TYPE_OPTIONS.map((o) => o.value.toLowerCase()));
    const extras: { value: string; label: string }[] = [];
    for (const t of customItemTypes) {
      const key = t.value.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      extras.push(t);
    }
    const current = normalizeItemType(form.type);
    if (current && !seen.has(current.toLowerCase())) {
      extras.push({ value: current, label: current.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) });
    }
    return [...ITEM_TYPE_OPTIONS, ...extras];
  }, [customItemTypes, form.type]);

  function setField<K extends keyof typeof EMPTY_FORM>(key: K, value: (typeof EMPTY_FORM)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function handleImage(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file", description: "Please choose a PNG or JPG image.", variant: "destructive" });
      return;
    }
    if (file.size > 5_000_000) {
      toast({ title: "Image too large", description: "Keep image under 5 MB.", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const raw = String(reader.result || "");
      if (!raw) return;
      const img = new Image();
      img.onload = () => {
        const maxSide = 320;
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          setField("itemImage", raw);
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        const compressed = canvas.toDataURL("image/jpeg", 0.72);
        setField("itemImage", compressed || raw);
      };
      img.onerror = () => setField("itemImage", raw);
      img.src = raw;
    };
    reader.readAsDataURL(file);
  }

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
    setField("uom", selected);
    setCreateUomOpen(false);
    setNewUomName("");
  }

  function handleCreateItemType() {
    const name = newItemTypeName.trim();
    if (!name) {
      toast({ title: "Name required", description: "Enter an item type name.", variant: "destructive" });
      return;
    }
    const value = name.toLowerCase().replace(/\s+/g, "_");
    const existing = itemTypeOptions.find(
      (o) => o.value.toLowerCase() === value || o.label.toLowerCase() === name.toLowerCase(),
    );
    const selected = existing?.value ?? value;
    if (!existing) {
      setCustomItemTypes((current) => {
        const next = [...current, { value, label: name }];
        saveCustomItemTypes(next);
        return next;
      });
    }
    setField("type", selected);
    setCreateItemTypeOpen(false);
    setNewItemTypeName("");
  }

  function flushActiveLevelPricing(f: typeof form): Record<string, LevelPricing> {
    const levelPricing = { ...f.levelPricing };
    const key = f.selectedPriceLevel || "retail";
    levelPricing[key] = {
      markupPct: f.markupPct,
      marginPct: f.marginPct,
      unitPrice: f.unitPrice,
    };
    return levelPricing;
  }

  function selectPriceLevel(nextId: string) {
    if (nextId === "__create") {
      setNewPriceLevelName("");
      setCreatePriceLevelOpen(true);
      return;
    }
    setForm((f) => {
      const levelPricing = flushActiveLevelPricing(f);
      const next = levelPricing[nextId] || emptyLevelPricing();
      const cost = parseFloat(String(f.purchasePrice)) || 0;
      let markupPct = next.markupPct;
      let marginPct = next.marginPct;
      let unitPrice = next.unitPrice;
      const sell = parseFloat(String(unitPrice)) || 0;
      if (cost > 0 && sell > 0) {
        if (markupPct === "" || markupPct == null) markupPct = calcMarkup(cost, sell);
        if (marginPct === "" || marginPct == null) marginPct = calcMargin(cost, sell);
      }
      return {
        ...f,
        selectedPriceLevel: nextId,
        levelPricing,
        markupPct,
        marginPct,
        unitPrice,
      };
    });
  }

  function handleCreatePriceLevel() {
    const name = newPriceLevelName.trim();
    if (!name) {
      toast({ title: "Name required", description: "Enter a price level name.", variant: "destructive" });
      return;
    }
    const id = name.toLowerCase().replace(/\s+/g, "_");
    const fixedHit = FIXED_PRICE_LEVELS.find(
      (l) => l.id === id || l.name.toLowerCase() === name.toLowerCase(),
    );
    if (fixedHit) {
      selectPriceLevel(fixedHit.id);
      setCreatePriceLevelOpen(false);
      setNewPriceLevelName("");
      toast({ title: "Already exists", description: `${fixedHit.name} is already available.` });
      return;
    }
    toast({
      title: "Fixed price levels only",
      description: "Use Retail Price, Wholesale Price, or Dealer Price.",
      variant: "destructive",
    });
    setCreatePriceLevelOpen(false);
    setNewPriceLevelName("");
  }

  function saveAdditionalUnits() {
    const alt = altDraft.alternateUom.trim();
    if (alt && alt.toLowerCase() === form.uom.toLowerCase()) {
      toast({ title: "Invalid units", description: "Alternate unit must differ from main UOM.", variant: "destructive" });
      return;
    }
    setForm((f) => ({
      ...f,
      alternateUom: alt,
      alternateQty: alt ? Number(altDraft.alternateQty) || 0 : "",
      mainQty: alt ? Number(altDraft.mainQty) || 0 : "",
    }));
    setAltUnitsOpen(false);
  }

  function invalidateStockViews() {
    void queryClient.invalidateQueries({ queryKey: ["/api/stock-items"] });
    void queryClient.invalidateQueries({ queryKey: ["stock-items-picker"] });
    void queryClient.invalidateQueries({ queryKey: ["invoice-warehouse-stock"] });
    void queryClient.invalidateQueries({ queryKey: ["inventory"] });
    void queryClient.invalidateQueries({ queryKey: getListStockItemsQueryKey() });
  }

  function handleSave() {
    if (isEdit && !form.code.trim()) {
      toast({ title: "Error", description: "Item code is required.", variant: "destructive" });
      return;
    }
    if (!form.name.trim()) {
      toast({ title: "Error", description: "Item name is required.", variant: "destructive" });
      return;
    }

    const levelPricing = flushActiveLevelPricing(form);
    const retailSell = levelPricing.retail?.unitPrice;
    const resolvedUnitPrice =
      retailSell !== undefined && retailSell !== ""
        ? Number(retailSell) || 0
        : Number(form.unitPrice) || 0;

    const payload = {
      code: form.code.trim(),
      name: form.name.trim(),
      uom: form.uom.trim() || "Pcs",
      type: form.type,
      category: form.category.trim() || null,
      brand: form.brand.trim() || null,
      barcode: form.barcode.trim() || null,
      salesPerson: form.salesPerson.trim() || null,
      itemImage: form.itemImage || null,
      purchasePrice: Number(form.purchasePrice) || 0,
      purchasePriceDate: form.purchasePriceDate || todayYmd(),
      unitPrice: resolvedUnitPrice,
      isActive: form.isActive,
      trackInventory: form.trackInventory,
      showInPos: form.showInPos,
      pricingMethod: form.pricingMethod,
      alternateUom: form.alternateUom.trim() || null,
      alternateQty: form.alternateUom.trim() ? Number(form.alternateQty) || 0 : 0,
      mainQty: form.alternateUom.trim() ? Number(form.mainQty) || 0 : 0,
    };

    const opts = {
      onSuccess: (created?: any) => {
        const itemId = isEdit ? editId : (created?.id ?? created?.data?.id);
        if (itemId != null) saveItemLevelPrices(itemId, levelPricing);
        toast({ title: isEdit ? "Updated" : "Created", description: isEdit ? "Item updated." : "Item created." });
        invalidateStockViews();
        void refetchPriceHistory();
        void queryClient.invalidateQueries({ queryKey: ["stock-item-purchase-prices"] });
        setLocation("/stock");
      },
      onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
    };

    if (isEdit) updateMutation.mutate({ id: editId, data: payload as any }, opts);
    else createMutation.mutate({ data: payload as any }, opts);
  }

  function handleDelete() {
    if (!isEdit) return;
    deleteMutation.mutate(
      { id: editId },
      {
        onSuccess: () => {
          toast({ title: "Deleted", description: "Item deleted." });
          invalidateStockViews();
          setLocation("/stock");
        },
        onError: (e: any) => toast({ title: "Error", description: e.message || "Failed to delete.", variant: "destructive" }),
      },
    );
  }

  if (isEdit && !loaded) {
    return <div className="py-20 text-center text-muted-foreground">Loading item…</div>;
  }

  if (isEdit && loaded && !(items as any[]).some((i) => Number(i.id) === editId)) {
    return (
      <div className="space-y-4 py-10 text-center">
        <p className="text-muted-foreground">Item not found.</p>
        <Button variant="outline" onClick={() => setLocation("/stock")}>Back to Item Master</Button>
      </div>
    );
  }

  return (
    <FormPageShell
      title={isEdit ? "Edit Stock Item" : "Create Stock Item"}
      description={isEdit ? "Update product or service details." : "Add a new product or service to Item Master."}
      backHref="/stock"
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <div>
            {isEdit && canManage && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    disabled={deleting || saving}
                    title="Delete"
                    aria-label="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Item?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This action cannot be undone. The item will be permanently deleted.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-red-600 hover:bg-red-700"
                      onClick={handleDelete}
                      disabled={deleting}
                    >
                      {deleting ? "Deleting..." : "Delete"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
          <div className="flex gap-3">
            <ModalCancelButton onClick={() => setLocation("/stock")} />
            <ModalSaveButton
              type="button"
              onClick={handleSave}
              loading={saving}
              label="Save"
              loadingLabel="Saving..."
            />
          </div>
        </div>
      }
    >
      <div className="space-y-8">
        {/* Basic Information (includes pricing — no separate sidebar/tabs) */}
        <section className="space-y-4">
          <ModalSectionHeader icon={Package} title="Basic Information" />
          <div className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-4">
            <div className="space-y-1.5 md:col-span-2">
              <Label className="text-sm font-medium text-[#111827]">
                Item Code <span className="text-destructive">*</span>
              </Label>
              <Input
                value={form.code}
                readOnly={!isEdit}
                className={!isEdit ? "bg-muted/40" : ""}
                onChange={(e) => setField("code", e.target.value)}
              />
            </div>

            <div className="space-y-1.5 md:col-span-2">
              <Label className="text-sm font-medium text-[#111827]">
                Item Name <span className="text-destructive">*</span>
              </Label>
              <Input
                value={form.name}
                onChange={(e) => setField("name", e.target.value)}
              />
            </div>

            <div className="space-y-1.5 md:col-span-2">
              <Label className="text-sm font-medium text-[#111827]">
                Item Type <span className="text-destructive">*</span>
              </Label>
              <Select
                value={form.type}
                onValueChange={(v) => setField("type", v)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-60">
                  <div
                    className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm font-medium text-primary hover:bg-accent"
                    onClick={(e) => { e.preventDefault(); setNewItemTypeName(""); setCreateItemTypeOpen(true); }}
                  >
                    <Plus className="h-4 w-4" /> Create Item Type
                  </div>
                  <div className="my-1 border-t" />
                  {itemTypeOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5 md:col-span-1">
              <Label className="text-sm font-medium text-[#111827]">Category</Label>
              <Input
                value={form.category}
                onChange={(e) => setField("category", e.target.value)}
              />
            </div>

            <div className="space-y-1.5 md:col-span-1">
              <Label className="text-sm font-medium text-[#111827]">Brand</Label>
              <Input
                value={form.brand}
                onChange={(e) => setField("brand", e.target.value)}
              />
            </div>

            <div className="space-y-1.5 md:col-span-2">
              <Label className="text-sm font-medium text-[#111827]">Sales Person</Label>
              <Select
                value={form.salesPerson || "__none"}
                onValueChange={(v) => setField("salesPerson", v === "__none" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">— None —</SelectItem>
                  {salesPersons.map((sp) => (
                    <SelectItem key={sp.id} value={sp.name}>{sp.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

              <div className="space-y-1.5 md:col-span-2">
                <Label className="text-sm font-medium text-[#111827]">Price Levels</Label>
                <Select
                  value={
                    FIXED_PRICE_LEVELS.some((l) => l.id === form.selectedPriceLevel)
                      ? form.selectedPriceLevel
                      : "retail"
                  }
                  onValueChange={(v) => selectPriceLevel(v)}
                >
                <SelectTrigger>
                  <SelectValue placeholder="Select price level" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  <div
                    className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm font-medium text-primary hover:bg-accent"
                    onClick={(e) => {
                      e.preventDefault();
                      setNewPriceLevelName("");
                      setCreatePriceLevelOpen(true);
                    }}
                  >
                    <Plus className="h-4 w-4" /> Create
                  </div>
                  <div className="my-1 border-t" />
                  {priceLevels.filter((l) => l.active !== false).map((level) => (
                    <SelectItem key={level.id} value={level.id}>{level.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5 md:col-span-2">
              <Label className="text-sm font-medium text-[#111827]">UOM</Label>
              <Select value={form.uom} onValueChange={(v) => setField("uom", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-48">
                  <div
                    className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm font-medium text-primary hover:bg-accent"
                    onClick={(e) => { e.preventDefault(); setNewUomName(""); setCreateUomOpen(true); }}
                  >
                    <Plus className="h-4 w-4" /> Create New UOM
                  </div>
                  <div className="my-1 border-t" />
                  {uomOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <button
                type="button"
                className="text-sm font-medium text-[#2563EB] hover:underline"
                onClick={() => {
                  setAltDraft({
                    alternateUom: form.alternateUom || "",
                    alternateQty: form.alternateQty !== "" ? String(form.alternateQty) : "0",
                    mainQty: form.mainQty !== "" ? String(form.mainQty) : "0",
                  });
                  setAltUnitsOpen(true);
                }}
              >
                Additional units
              </button>
            </div>

            <div className="space-y-1.5 md:col-span-2">
              <Label className="text-sm font-medium text-[#111827]">Barcode</Label>
              <div className="flex gap-2">
                <Input
                  value={form.barcode}
                  readOnly={!isEdit}
                  className={!isEdit ? "bg-muted/40" : ""}
                  onChange={(e) => setField("barcode", e.target.value)}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="shrink-0 gap-1.5"
                  onClick={() => toast({ title: "Scan", description: "Type the barcode or use a USB scanner." })}
                >
                  <ScanLine className="h-4 w-4" /> Scan
                </Button>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-8">
            <div className="w-[140px] shrink-0 space-y-1.5">
              <Label className="text-sm font-medium text-[#111827]">Item Image</Label>
              <button
                type="button"
                className="flex h-[72px] w-full cursor-pointer flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed border-[#CBD5E1] bg-[#F8FAFC] px-2 hover:border-[#2563EB]/50"
                onClick={() => imageInputRef.current?.click()}
              >
                {form.itemImage ? (
                  <img src={form.itemImage} alt="" className="h-12 w-12 rounded-md border object-cover" />
                ) : (
                  <>
                    <Camera className="h-5 w-5 text-[#2563EB]" />
                    <span className="text-xs font-semibold text-[#1E293B]">Add Image</span>
                  </>
                )}
              </button>
              {form.itemImage && (
                <button
                  type="button"
                  className="text-xs font-medium text-red-600 hover:underline"
                  onClick={() => setField("itemImage", "")}
                >
                  Remove
                </button>
              )}
              <input
                ref={imageInputRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp"
                className="hidden"
                onChange={(e) => handleImage(e.target.files?.[0] || null)}
              />
            </div>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-3 pb-2">
              <label className="flex items-center gap-2 text-sm text-[#111827]">
                <Checkbox checked={form.trackInventory} onCheckedChange={(c) => setField("trackInventory", c === true)} />
                Track Inventory
              </label>
              <label className="flex items-center gap-2 text-sm text-[#111827]">
                <Checkbox checked={form.showInPos} onCheckedChange={(c) => setField("showInPos", c === true)} />
                Show in POS
              </label>
              <label className="flex items-center gap-2 text-sm text-[#111827]">
                <Checkbox checked={form.isActive} onCheckedChange={(c) => setField("isActive", c === true)} />
                Active
              </label>
            </div>
          </div>
        </section>

        {/* Purchase & Pricing — matches design */}
        <section className="space-y-4">
          <div>
            <h3 className="text-base font-semibold text-[#2563EB]">Purchase & Pricing</h3>
            {form.selectedPriceLevel ? (
              <p className="mt-1 text-xs text-[#6B7280]">
                Editing margin / markup for{" "}
                <span className="font-medium text-[#111827]">
                  {priceLevels.find((l) => l.id === form.selectedPriceLevel)?.name || form.selectedPriceLevel}
                </span>
              </p>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-[#111827]">
                Purchase Cost <span className="text-destructive">*</span>
              </Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={form.purchasePrice}
                onChange={(e) => {
                  const v = e.target.value;
                  setForm((f) => {
                    const next = { ...f, purchasePrice: v };
                    const cost = parseFloat(v) || 0;
                    if (!f.autoUpdateSelling || !(cost > 0)) return next;
                    const markup = parseFloat(String(f.markupPct));
                    const margin = parseFloat(String(f.marginPct));
                    if (Number.isFinite(markup) && String(f.markupPct).trim() !== "") {
                      const sell = sellFromMarkup(cost, markup);
                      next.unitPrice = sell;
                      next.marginPct = sell ? calcMargin(cost, parseFloat(sell)) : f.marginPct;
                    } else if (Number.isFinite(margin) && String(f.marginPct).trim() !== "" && margin < 100) {
                      const sell = sellFromMargin(cost, margin);
                      next.unitPrice = sell;
                      next.markupPct = sell ? calcMarkup(cost, parseFloat(sell)) : f.markupPct;
                    }
                    return next;
                  });
                }}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-[#111827]">
                Pricing Method <span className="text-destructive">*</span>
              </Label>
              <Select value={form.pricingMethod} onValueChange={(v) => setField("pricingMethod", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed">Fixed Price</SelectItem>
                  <SelectItem value="markup">Markup based</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-[#111827]">
                {form.selectedPriceLevel
                  ? `${priceLevels.find((l) => l.id === form.selectedPriceLevel)?.name || "Level"} Selling Price`
                  : "Selling Price"}{" "}
                <span className="text-destructive">*</span>
              </Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                className={form.pricingMethod === "markup" && form.autoUpdateSelling ? "bg-muted/40" : ""}
                readOnly={form.pricingMethod === "markup" && form.autoUpdateSelling}
                value={form.unitPrice}
                onChange={(e) => {
                  const v = e.target.value;
                  setForm((f) => {
                    const cost = parseFloat(String(f.purchasePrice)) || 0;
                    const sell = parseFloat(v) || 0;
                    return {
                      ...f,
                      unitPrice: v,
                      markupPct: cost > 0 && v !== "" ? calcMarkup(cost, sell) : f.markupPct,
                      marginPct: sell > 0 && v !== "" ? calcMargin(cost, sell) : f.marginPct,
                    };
                  });
                }}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-[#111827]">
                {form.selectedPriceLevel ? "Markup % (selected level)" : "Markup %"}
              </Label>
              <div className="relative">
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  className="pr-8"
                  value={form.markupPct}
                  onChange={(e) => {
                    const v = e.target.value;
                    setForm((f) => {
                      const cost = parseFloat(String(f.purchasePrice)) || 0;
                      const markup = parseFloat(v);
                      const next = { ...f, markupPct: v };
                      if (cost > 0 && v !== "" && Number.isFinite(markup)) {
                        const sell = sellFromMarkup(cost, markup);
                        next.unitPrice = sell;
                        next.marginPct = sell ? calcMargin(cost, parseFloat(sell)) : "";
                      }
                      return next;
                    });
                  }}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[#6B7280]">%</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-[#111827]">
                {form.selectedPriceLevel ? "Margin % (selected level)" : "Margin %"}
              </Label>
              <div className="relative">
                <Input
                  type="number"
                  min={0}
                  max={99.99}
                  step="0.01"
                  className="pr-8"
                  value={form.marginPct}
                  onChange={(e) => {
                    const v = e.target.value;
                    setForm((f) => {
                      const cost = parseFloat(String(f.purchasePrice)) || 0;
                      const margin = parseFloat(v);
                      const next = { ...f, marginPct: v };
                      if (cost > 0 && v !== "" && Number.isFinite(margin) && margin < 100) {
                        const sell = sellFromMargin(cost, margin);
                        next.unitPrice = sell;
                        next.markupPct = sell ? calcMarkup(cost, parseFloat(sell)) : "";
                      }
                      return next;
                    });
                  }}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[#6B7280]">%</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-[#111827]">Effective from</Label>
              <SyncBridgeDatePicker
                value={form.purchasePriceDate || todayYmd()}
                onChange={(v) => setField("purchasePriceDate", v || todayYmd())}
              />
              <p className="text-xs text-[#6B7280]">
                Used when you change Purchase Cost here (same history as Vendor Invoice).
              </p>
            </div>
          </div>

          <TooltipProvider>
            <label className="flex items-center gap-2 text-sm text-[#111827]">
              <Checkbox
                checked={form.autoUpdateSelling}
                onCheckedChange={(c) => setField("autoUpdateSelling", c === true)}
              />
              Auto update selling price when purchase cost changes
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="text-[#2563EB] hover:opacity-80">
                    <Info className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  When enabled with Markup based pricing, selling price recalculates from purchase cost.
                </TooltipContent>
              </Tooltip>
            </label>
          </TooltipProvider>

          {isEdit && (
            <div className="space-y-2 pt-2">
              <h4 className="text-sm font-semibold text-[#111827]">Purchase Price History</h4>
              <div className="overflow-hidden rounded-md border border-[#E5E7EB]">
                <table className="w-full text-sm">
                  <thead className="bg-[#F9FAFB] text-left text-[#6B7280]">
                    <tr>
                      <th className="px-3 py-2 font-medium">Date</th>
                      <th className="px-3 py-2 font-medium">Purchase Cost</th>
                      <th className="px-3 py-2 font-medium">Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {priceHistory.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-3 py-4 text-center text-[#6B7280]">
                          No price changes yet. Save a new purchase cost with a date, or post a Vendor Invoice.
                        </td>
                      </tr>
                    ) : (
                      priceHistory.map((row) => (
                        <tr key={row.id} className="border-t border-[#E5E7EB]">
                          <td className="px-3 py-2 text-[#111827]">{formatDisplayDate(row.effectiveDate)}</td>
                          <td className="px-3 py-2 tabular-nums text-[#111827]">
                            {Number(row.purchasePrice).toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </td>
                          <td className="px-3 py-2 text-[#6B7280]">
                            {row.sourceType === "vendor_invoice"
                              ? (row.sourceRef ? `Vendor Invoice ${row.sourceRef}` : "Vendor Invoice")
                              : "Item Master"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </div>

      <Dialog open={createUomOpen} onOpenChange={setCreateUomOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create New UOM</DialogTitle></DialogHeader>
          <Input value={newUomName} onChange={(e) => setNewUomName(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateUomOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateUom}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createItemTypeOpen} onOpenChange={setCreateItemTypeOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Item Type</DialogTitle></DialogHeader>
          <Input
            value={newItemTypeName}
            onChange={(e) => setNewItemTypeName(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateItemTypeOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateItemType}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createPriceLevelOpen} onOpenChange={setCreatePriceLevelOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Price Level</DialogTitle></DialogHeader>
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input
              value={newPriceLevelName}
              onChange={(e) => setNewPriceLevelName(e.target.value)}
              placeholder="e.g. Distributor Price"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleCreatePriceLevel();
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreatePriceLevelOpen(false)}>Cancel</Button>
            <Button onClick={handleCreatePriceLevel}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={altUnitsOpen} onOpenChange={setAltUnitsOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Additional Units</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label>Alternate UOM</Label>
              <Input value={altDraft.alternateUom} onChange={(e) => setAltDraft((d) => ({ ...d, alternateUom: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Alternate Qty</Label>
                <Input type="number" value={altDraft.alternateQty} onChange={(e) => setAltDraft((d) => ({ ...d, alternateQty: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Equals Main Qty ({form.uom})</Label>
                <Input type="number" value={altDraft.mainQty} onChange={(e) => setAltDraft((d) => ({ ...d, mainQty: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => {
              setAltDraft({ alternateUom: "", alternateQty: "0", mainQty: "0" });
              setForm((f) => ({ ...f, alternateUom: "", alternateQty: "", mainQty: "" }));
              setAltUnitsOpen(false);
            }}>Clear</Button>
            <Button variant="outline" onClick={() => setAltUnitsOpen(false)}>Cancel</Button>
            <Button onClick={saveAdditionalUnits}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </FormPageShell>
  );
}
