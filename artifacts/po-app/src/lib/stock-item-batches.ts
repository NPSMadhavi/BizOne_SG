export type ItemBatch = {
  batchNo: string;
  expiryDate?: string | null;
  manufacturingDate?: string | null;
  createdAt?: string | null;
  availableQty?: number;
};

export const CREATE_BATCH_VALUE = "__create_batch__";
const BATCH_EXPIRY_STORAGE_KEY = "inventory-batch-expiry-rows";
export const ITEM_BATCHES_STORAGE_KEY = "stock-item-batches-v1";

export type BatchSourceItem = {
  id?: number | string;
  code?: string | null;
  stockQty?: string | number | null;
  displayStockQty?: number | null;
  batchNo?: string | null;
  expiryDate?: string | null;
  manufacturingDate?: string | null;
  batches?: ItemBatch[] | null;
};

function readItemBatchesStore(): Record<string, ItemBatch[]> {
  try {
    const raw = localStorage.getItem(ITEM_BATCHES_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function loadLocalItemBatches(stockItemId: number | string): ItemBatch[] {
  const rows = readItemBatchesStore()[String(stockItemId)];
  return Array.isArray(rows) ? rows.filter((b) => String(b?.batchNo || "").trim()) : [];
}

export function saveLocalItemBatches(stockItemId: number | string, batches: ItemBatch[]) {
  try {
    const store = readItemBatchesStore();
    const cleaned = batches
      .map((b) => ({
        batchNo: String(b.batchNo || "").trim(),
        expiryDate: b.expiryDate || null,
        manufacturingDate: b.manufacturingDate || null,
        createdAt: b.createdAt || new Date().toISOString(),
        availableQty: Number(b.availableQty) || 0,
      }))
      .filter((b) => b.batchNo);
    store[String(stockItemId)] = cleaned;
    localStorage.setItem(ITEM_BATCHES_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // ignore
  }
}

export function mergeBatchMaps(...lists: ItemBatch[][]): ItemBatch[] {
  const map = new Map<string, ItemBatch>();
  for (const list of lists) {
    for (const b of list) {
      const no = String(b?.batchNo || "").trim();
      if (!no) continue;
      const key = no.toLowerCase();
      const prev = map.get(key);
      map.set(key, {
        batchNo: no,
        expiryDate: b.expiryDate || prev?.expiryDate || null,
        manufacturingDate: b.manufacturingDate || prev?.manufacturingDate || null,
        createdAt: b.createdAt || prev?.createdAt || null,
        availableQty:
          typeof b.availableQty === "number"
            ? b.availableQty
            : (prev?.availableQty ?? 0),
      });
    }
  }
  return Array.from(map.values()).sort((a, b) =>
    String(b.createdAt || "").localeCompare(String(a.createdAt || "")) ||
    a.batchNo.localeCompare(b.batchNo, undefined, { numeric: true, sensitivity: "base" }),
  );
}

function loadBatchQtyByCode(productCode: string): Map<string, number> {
  const map = new Map<string, number>();
  const code = String(productCode || "").trim().toLowerCase();
  if (!code) return map;
  try {
    const raw = localStorage.getItem(BATCH_EXPIRY_STORAGE_KEY);
    if (!raw) return map;
    const rows = JSON.parse(raw);
    if (!Array.isArray(rows)) return map;
    for (const r of rows) {
      if (String(r?.productCode || "").trim().toLowerCase() !== code) continue;
      const no = String(r?.batchNo || "").trim().toLowerCase();
      if (!no) continue;
      map.set(no, (map.get(no) || 0) + (Number(r?.qty) || 0));
    }
  } catch {
    // ignore
  }
  return map;
}

export function collectBatchesFromItem(item: BatchSourceItem | null | undefined): ItemBatch[] {
  if (!item) return [];
  const qtyByBatch = loadBatchQtyByCode(String(item.code || ""));
  const fallbackQty = Math.max(0, Number(item.displayStockQty ?? item.stockQty) || 0);
  const fromApi: ItemBatch[] = [];
  for (const b of Array.isArray(item.batches) ? item.batches : []) {
    const no = String(b?.batchNo || "").trim();
    if (!no) continue;
    const key = no.toLowerCase();
    fromApi.push({
      batchNo: no,
      expiryDate: b.expiryDate || null,
      manufacturingDate: b.manufacturingDate || null,
      createdAt: b.createdAt || null,
      availableQty: qtyByBatch.has(key)
        ? qtyByBatch.get(key)!
        : (typeof b.availableQty === "number" ? b.availableQty : undefined),
    });
  }
  const primary = String(item.batchNo || "").trim();
  if (primary) {
    const key = primary.toLowerCase();
    fromApi.push({
      batchNo: primary,
      expiryDate: item.expiryDate || null,
      manufacturingDate: item.manufacturingDate || null,
      availableQty: qtyByBatch.has(key) ? qtyByBatch.get(key)! : fallbackQty,
    });
  }
  const fromExpiryStore: ItemBatch[] = [];
  try {
    const raw = localStorage.getItem(BATCH_EXPIRY_STORAGE_KEY);
    const rows = raw ? JSON.parse(raw) : [];
    if (Array.isArray(rows)) {
      const code = String(item.code || "").trim().toLowerCase();
      for (const r of rows) {
        if (String(r?.productCode || "").trim().toLowerCase() !== code) continue;
        const no = String(r?.batchNo || "").trim();
        if (!no) continue;
        fromExpiryStore.push({
          batchNo: no,
          expiryDate: r.expiryDate || null,
          manufacturingDate: r.mfgDate || null,
          availableQty: Number(r.qty) || 0,
        });
      }
    }
  } catch {
    // ignore
  }
  const fromLocal = item.id != null ? loadLocalItemBatches(item.id) : [];
  return mergeBatchMaps(fromLocal, fromApi, fromExpiryStore).map((b) => ({
    ...b,
    availableQty: b.availableQty ?? (qtyByBatch.get(b.batchNo.toLowerCase()) ?? 0),
  }));
}

export function formatAvailLabel(availableQty: number | undefined, uom?: string) {
  const qtyLabel = Number.isFinite(Number(availableQty)) ? Number(availableQty) : 0;
  const unit = (uom || "").trim();
  return `avl. ${qtyLabel}${unit ? ` ${unit}` : ""}`;
}
