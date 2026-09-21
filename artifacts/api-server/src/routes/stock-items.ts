import { Router, type IRouter } from "express";
import { db, stockItemsTable, warehouseStockTable, vendorInvoicesTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { adjustItemStockInWarehouse, deleteStockItem, resolveWarehouseId } from "../lib/inventory-service.js";
import { nextDocNumber } from "../lib/running-numbers.js";
import {
  listCompanyPurchasePrices,
  listStockPurchasePrices,
  recordStockPurchasePrice,
  deleteStockPurchasePrice,
  recomputeVendorInvoicePriceLots,
} from "../lib/stock-purchase-price.js";

const router: IRouter = Router();

function normalizeAlternateFields(body: {
  alternateUom?: unknown;
  alternateQty?: unknown;
  mainQty?: unknown;
}) {
  const alternateUom =
    typeof body.alternateUom === "string" && body.alternateUom.trim()
      ? body.alternateUom.trim()
      : null;
  const alternateQty = alternateUom
    ? String(Math.max(0, Number(body.alternateQty) || 0))
    : "0";
  const mainQty = alternateUom
    ? String(Math.max(0, Number(body.mainQty) || 0))
    : "0";
  return { alternateUom, alternateQty, mainQty };
}

router.get("/stock-items", async (req, res): Promise<void> => {
  if (!req.session.userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const companyId = req.session.companyId;
  if (!companyId) { res.status(400).json({ error: "No company selected" }); return; }

  const search = typeof req.query.search === "string" ? req.query.search : "";
  const typeFilter = typeof req.query.type === "string" ? req.query.type : "";

  let items = await db.select().from(stockItemsTable)
    .where(eq(stockItemsTable.companyId, companyId))
    .orderBy(stockItemsTable.code);

  if (search) {
    const lower = search.toLowerCase();
    items = items.filter(i =>
      i.code.toLowerCase().includes(lower) ||
      i.name.toLowerCase().includes(lower) ||
      (i.description || "").toLowerCase().includes(lower) ||
      String((i as any).barcode || "").toLowerCase().includes(lower) ||
      String((i as any).category || "").toLowerCase().includes(lower) ||
      String((i as any).brand || "").toLowerCase().includes(lower)
    );
  }

  if (typeFilter === "product") {
    // UI uses "product"; DB stores "stock_item" (legacy rows may still say "product")
    items = items.filter((i) => {
      const t = String(i.type || "").toLowerCase();
      return t === "product" || t === "stock_item" || t === "";
    });
  } else if (typeFilter === "service") {
    items = items.filter((i) => {
      const t = String(i.type || "").toLowerCase();
      return t === "service" || t === "service_item";
    });
  } else if (typeFilter) {
    items = items.filter((i) => i.type === typeFilter);
  }

  // Assign barcodes for older items created before barcode running numbers
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.barcode != null && String(item.barcode).trim()) continue;
    try {
      const bc = await nextDocNumber("bc", companyId);
      await db.update(stockItemsTable)
        .set({ barcode: bc })
        .where(and(eq(stockItemsTable.id, item.id), eq(stockItemsTable.companyId, companyId)));
      items[i] = { ...item, barcode: bc };
    } catch {
      // leave blank if sequence unavailable
    }
  }

  // Avail. Qty must mirror warehouse on-hand (never a stale stock_items.stock_qty).
  const totals = await db
    .select({
      stockItemId: warehouseStockTable.stockItemId,
      total: sql<string>`coalesce(sum(${warehouseStockTable.quantity}::numeric), 0)`,
    })
    .from(warehouseStockTable)
    .where(eq(warehouseStockTable.companyId, companyId))
    .groupBy(warehouseStockTable.stockItemId);
  const totalByItem = new Map(totals.map((row) => [row.stockItemId, String(row.total)]));

  // Rebuild VI price lots (different unit price → Item Master row with qty)
  const vis = await db
    .select({ items: vendorInvoicesTable.items })
    .from(vendorInvoicesTable)
    .where(eq(vendorInvoicesTable.companyId, companyId));
  const viItemIds = new Set<number>();
  for (const vi of vis) {
    for (const line of (vi.items as any[]) || []) {
      if (line?.type === "section") continue;
      const sid = Number(line.stockItemId);
      if (Number.isFinite(sid) && sid > 0) viItemIds.add(sid);
    }
  }
  let priceHistory = await listCompanyPurchasePrices(companyId);
  for (const h of priceHistory) {
    if (h.sourceType === "vendor_invoice") viItemIds.add(h.stockItemId);
  }
  if (viItemIds.size > 0) {
    for (const stockItemId of viItemIds) {
      await recomputeVendorInvoicePriceLots({ companyId, stockItemId });
    }
    priceHistory = await listCompanyPurchasePrices(companyId);
  }

  const historyByItem = new Map<number, typeof priceHistory>();
  for (const row of priceHistory) {
    const list = historyByItem.get(row.stockItemId) || [];
    list.push(row);
    historyByItem.set(row.stockItemId, list);
  }

  res.json(items.map((item) => {
    const history = historyByItem.get(item.id) || [];
    if (item.type === "service") {
      return { ...item, stockQty: "0", purchasePriceHistory: history };
    }
    if (totalByItem.has(item.id)) {
      return { ...item, stockQty: totalByItem.get(item.id)!, purchasePriceHistory: history };
    }
    const legacy = item.stockQty != null && item.stockQty !== "" ? String(item.stockQty) : "0";
    return { ...item, stockQty: legacy, purchasePriceHistory: history };
  }));
});

router.post("/stock-items", async (req, res): Promise<void> => {
  if (!req.session.userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const companyId = req.session.companyId;
  if (!companyId) { res.status(400).json({ error: "No company selected" }); return; }

  const {
    code, name, description, uom, type, unitPrice, mrpPrice, purchasePrice, stockQty, warehouseId,
    batchNo, isActive, alternateUom, alternateQty, mainQty,
    category, brand, barcode, salesPerson, itemImage,
    trackInventory, showInPos, pricingMethod,
    minStockLevel, reorderLevel, maxStockLevel,
    purchasePriceDate,
  } = req.body;
  if (!name) { res.status(400).json({ error: "name is required" }); return; }

  // Always allocate from Settings → Running Numbers (Stock Item Code)
  let resolvedCode: string;
  try {
    resolvedCode = await nextDocNumber("si", companyId);
  } catch (err) {
    const fallback = typeof code === "string" ? code.trim() : "";
    if (!fallback) {
      res.status(500).json({
        error: err instanceof Error ? err.message : "Failed to generate item code",
      });
      return;
    }
    resolvedCode = fallback;
  }

  // Always allocate from Settings → Barcode Number
  let resolvedBarcode: string | null = null;
  try {
    resolvedBarcode = await nextDocNumber("bc", companyId);
  } catch (err) {
    const fallback = typeof barcode === "string" ? barcode.trim() : "";
    if (fallback) {
      resolvedBarcode = fallback;
    } else {
      res.status(500).json({
        error: err instanceof Error ? err.message : "Failed to generate barcode",
      });
      return;
    }
  }

  const isService = type === "service" || type === "service_item";
  const openingQty = !isService ? Math.max(0, Number(stockQty) || 0) : 0;
  const alt = normalizeAlternateFields({ alternateUom, alternateQty, mainQty });

  let item;
  try {
    [item] = await db.insert(stockItemsTable).values({
      companyId,
      code: resolvedCode,
      name,
      description: description || null,
      uom: uom || "Pcs",
      type: typeof type === "string" && type.trim()
        ? (type === "product" ? "stock_item" : type === "service" ? "service_item" : type.trim())
        : "stock_item",
      category: typeof category === "string" && category.trim() ? category.trim() : null,
      brand: typeof brand === "string" && brand.trim() ? brand.trim() : null,
      barcode: resolvedBarcode,
      salesPerson: typeof salesPerson === "string" && salesPerson.trim() ? salesPerson.trim() : null,
      itemImage: typeof itemImage === "string" && itemImage.trim() ? itemImage.trim() : null,
      purchasePrice: purchasePrice != null ? String(purchasePrice) : "0",
      unitPrice: unitPrice != null ? String(unitPrice) : "0",
      mrpPrice: mrpPrice != null ? String(mrpPrice) : "0",
      stockQty: "0",
      minStockLevel: minStockLevel != null ? String(minStockLevel) : "0",
      reorderLevel: reorderLevel != null ? String(reorderLevel) : "0",
      maxStockLevel: maxStockLevel != null ? String(maxStockLevel) : "0",
      batchNo: typeof batchNo === "string" && batchNo.trim() ? batchNo.trim() : null,
      alternateUom: alt.alternateUom,
      alternateQty: alt.alternateQty,
      mainQty: alt.mainQty,
      trackInventory: trackInventory === undefined ? true : Boolean(trackInventory),
      showInPos: showInPos === undefined ? true : Boolean(showInPos),
      pricingMethod: typeof pricingMethod === "string" ? pricingMethod : "fixed",
      isActive: isActive === undefined ? true : Boolean(isActive),
    }).returning();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create stock item";
    const isDup = /unique|duplicate/i.test(message);
    res.status(isDup ? 409 : 500).json({
      error: isDup
        ? `Item code "${resolvedCode}" already exists. Use a different code.`
        : message,
    });
    return;
  }

  // Opening stock is booked as a warehouse movement so warehouse_stock, the item
  // total and the stock reports all start out in agreement.
  if (openingQty > 0) {
    const targetWarehouseId = Number(warehouseId) || await resolveWarehouseId(companyId);
    if (targetWarehouseId) {
      try {
        await adjustItemStockInWarehouse({
          companyId,
          stockItemId: item.id,
          warehouseId: targetWarehouseId,
          newTotalQty: openingQty,
          userId: req.session.userId,
          reference: "Opening stock",
        });
      } catch (err) {
        await db.delete(stockItemsTable).where(eq(stockItemsTable.id, item.id));
        res.status(400).json({ error: err instanceof Error ? err.message : "Failed to set opening stock" });
        return;
      }
    }
  }

  const openingPurchase = Number(purchasePrice);
  if (Number.isFinite(openingPurchase) && openingPurchase > 0) {
    const today = new Date();
    const ymd = typeof purchasePriceDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(purchasePriceDate.trim())
      ? purchasePriceDate.trim()
      : `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    try {
      await recordStockPurchasePrice({
        companyId,
        stockItemId: item.id,
        purchasePrice: openingPurchase,
        effectiveDate: ymd,
        sourceType: "item_master",
        notes: "Opening purchase cost",
        userId: req.session.userId,
        updateMasterPrice: false,
      });
    } catch {
      // non-fatal — item already created
    }
  }

  const [created] = await db.select().from(stockItemsTable).where(eq(stockItemsTable.id, item.id));
  res.status(201).json(created ?? item);
});

router.get("/stock-items/:id/purchase-prices", async (req, res): Promise<void> => {
  if (!req.session.userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const companyId = req.session.companyId;
  if (!companyId) { res.status(400).json({ error: "No company selected" }); return; }
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [item] = await db.select({ id: stockItemsTable.id })
    .from(stockItemsTable)
    .where(and(eq(stockItemsTable.id, id), eq(stockItemsTable.companyId, companyId)));
  if (!item) { res.status(404).json({ error: "Not found" }); return; }

  const rows = await listStockPurchasePrices(id, companyId);
  res.json(rows);
});

router.delete("/stock-items/:id/purchase-prices/:priceId", async (req, res): Promise<void> => {
  if (!req.session.userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const companyId = req.session.companyId;
  if (!companyId) { res.status(400).json({ error: "No company selected" }); return; }

  const id = parseInt(req.params.id);
  const priceId = parseInt(req.params.priceId);
  if (isNaN(id) || isNaN(priceId)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [item] = await db.select({ id: stockItemsTable.id })
    .from(stockItemsTable)
    .where(and(eq(stockItemsTable.id, id), eq(stockItemsTable.companyId, companyId)));
  if (!item) { res.status(404).json({ error: "Not found" }); return; }

  const deleted = await deleteStockPurchasePrice({
    companyId,
    stockItemId: id,
    priceId,
  });
  if (!deleted) { res.status(404).json({ error: "Price history row not found" }); return; }
  res.json({ success: true });
});

router.get("/stock-items/:id", async (req, res): Promise<void> => {
  if (!req.session.userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const [item] = await db.select().from(stockItemsTable).where(eq(stockItemsTable.id, id));
  if (!item) { res.status(404).json({ error: "Not found" }); return; }
  res.json(item);
});

router.put("/stock-items/:id", async (req, res): Promise<void> => {
  if (!req.session.userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [before] = await db.select().from(stockItemsTable).where(eq(stockItemsTable.id, id));
  if (!before) { res.status(404).json({ error: "Not found" }); return; }

  const {
    code, name, description, uom, type, unitPrice, mrpPrice, purchasePrice, stockQty, isActive, warehouseId,
    batchNo, alternateUom, alternateQty, mainQty,
    category, brand, barcode, salesPerson, itemImage,
    trackInventory, showInPos, pricingMethod,
    minStockLevel, reorderLevel, maxStockLevel,
    purchasePriceDate,
  } = req.body;
  const update: Record<string, any> = {};
  if (code !== undefined) update.code = code;
  if (name !== undefined) update.name = name;
  if (description !== undefined) update.description = description || null;
  if (uom !== undefined) update.uom = uom;
  if (type !== undefined) {
    const t = typeof type === "string" ? type.trim() : "";
    update.type = !t || t === "product" ? "stock_item" : t === "service" ? "service_item" : t;
  }
  if (unitPrice !== undefined) update.unitPrice = String(unitPrice);
  if (mrpPrice !== undefined) update.mrpPrice = String(mrpPrice);
  if (purchasePrice !== undefined) update.purchasePrice = String(purchasePrice);
  if (isActive !== undefined) update.isActive = Boolean(isActive);
  if (category !== undefined) update.category = typeof category === "string" && category.trim() ? category.trim() : null;
  if (brand !== undefined) update.brand = typeof brand === "string" && brand.trim() ? brand.trim() : null;
  if (barcode !== undefined) update.barcode = typeof barcode === "string" && barcode.trim() ? barcode.trim() : null;
  if (salesPerson !== undefined) update.salesPerson = typeof salesPerson === "string" && salesPerson.trim() ? salesPerson.trim() : null;
  if (itemImage !== undefined) update.itemImage = typeof itemImage === "string" && itemImage.trim() ? itemImage.trim() : null;
  if (trackInventory !== undefined) update.trackInventory = Boolean(trackInventory);
  if (showInPos !== undefined) update.showInPos = Boolean(showInPos);
  if (pricingMethod !== undefined) update.pricingMethod = pricingMethod || "fixed";
  if (minStockLevel !== undefined) update.minStockLevel = String(minStockLevel);
  if (reorderLevel !== undefined) update.reorderLevel = String(reorderLevel);
  if (maxStockLevel !== undefined) update.maxStockLevel = String(maxStockLevel);
  if (batchNo !== undefined) update.batchNo = typeof batchNo === "string" && batchNo.trim() ? batchNo.trim() : null;
  if (alternateUom !== undefined || alternateQty !== undefined || mainQty !== undefined) {
    const alt = normalizeAlternateFields({
      alternateUom: alternateUom !== undefined ? alternateUom : undefined,
      alternateQty,
      mainQty,
    });
    // When only qty fields are sent without clearing uom, keep existing uom from body if provided.
    if (alternateUom !== undefined) {
      update.alternateUom = alt.alternateUom;
      update.alternateQty = alt.alternateQty;
      update.mainQty = alt.mainQty;
    } else {
      update.alternateQty = String(Math.max(0, Number(alternateQty) || 0));
      update.mainQty = String(Math.max(0, Number(mainQty) || 0));
    }
  }

  const [updated] = Object.keys(update).length > 0
    ? await db.update(stockItemsTable).set(update).where(eq(stockItemsTable.id, id)).returning()
    : [before];
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }

  // A quantity edit is a stock adjustment: book the difference in a warehouse instead of
  // overwriting stock_qty, which would drift away from warehouse_stock.
  if (stockQty !== undefined && updated.type !== "service") {
    const targetWarehouseId = Number(warehouseId) || await resolveWarehouseId(updated.companyId);
    if (targetWarehouseId) {
      try {
        await adjustItemStockInWarehouse({
          companyId: updated.companyId,
          stockItemId: updated.id,
          warehouseId: targetWarehouseId,
          newTotalQty: Number(stockQty) || 0,
          userId: req.session.userId,
          reference: "Stock quantity updated",
        });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : "Failed to update stock quantity" });
        return;
      }
    } else {
      await db.update(stockItemsTable)
        .set({ stockQty: String(Number(stockQty) || 0) })
        .where(eq(stockItemsTable.id, id));
    }
  }

  // Item Master path: keep old cost as history, add new row, update catalogue cost
  const priceDate =
    typeof purchasePriceDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(purchasePriceDate.trim())
      ? purchasePriceDate.trim()
      : null;
  if (priceDate && purchasePrice !== undefined) {
    const cost = Number(purchasePrice);
    const prev = Number(before.purchasePrice);
    if (Number.isFinite(cost) && cost >= 0 && Math.round(cost * 100) !== Math.round((Number.isFinite(prev) ? prev : 0) * 100)) {
      try {
        if (Number.isFinite(prev) && prev > 0) {
          await recordStockPurchasePrice({
            companyId: updated.companyId,
            stockItemId: updated.id,
            purchasePrice: prev,
            effectiveDate: priceDate,
            sourceType: "item_master",
            notes: "Previous purchase cost",
            userId: req.session.userId,
            updateMasterPrice: false,
            skipIfUnchanged: true,
          });
        }
        await recordStockPurchasePrice({
          companyId: updated.companyId,
          stockItemId: updated.id,
          purchasePrice: cost,
          effectiveDate: priceDate,
          sourceType: "item_master",
          notes: "Updated from Item Master",
          userId: req.session.userId,
          updateMasterPrice: true,
        });
      } catch (err) {
        req.log?.warn?.({ err }, "Failed to record purchase price history from item master");
      }
    }
  }

  const [refreshed] = await db.select().from(stockItemsTable).where(eq(stockItemsTable.id, id));
  res.json(refreshed ?? updated);
});

router.delete("/stock-items/:id", async (req, res): Promise<void> => {
  if (!req.session.userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const companyId = req.session.companyId;
  if (!companyId) { res.status(400).json({ error: "No company selected" }); return; }

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [existing] = await db.select({ id: stockItemsTable.id })
    .from(stockItemsTable)
    .where(and(eq(stockItemsTable.id, id), eq(stockItemsTable.companyId, companyId)));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  try {
    // Clears warehouse balances, movements, serials and related inventory lines
    // before removing the item — a bare DELETE hits FK constraints (HTTP 500).
    await deleteStockItem(companyId, id);
    res.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete stock item";
    if (message === "Stock item not found") {
      res.status(404).json({ error: message });
      return;
    }
    res.status(400).json({ error: message });
  }
});

export default router;
