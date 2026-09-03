import { Router, type IRouter } from "express";
import { db, stockItemsTable, warehouseStockTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { adjustItemStockInWarehouse, deleteStockItem, resolveWarehouseId } from "../lib/inventory-service.js";

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
      (i.description || "").toLowerCase().includes(lower)
    );
  }

  if (typeFilter === "product" || typeFilter === "service") {
    items = items.filter(i => i.type === typeFilter);
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

  res.json(items.map((item) => {
    if (item.type === "service") {
      return { ...item, stockQty: "0" };
    }
    if (totalByItem.has(item.id)) {
      return { ...item, stockQty: totalByItem.get(item.id)! };
    }
    // No warehouse row yet — keep legacy catalogue qty so Avail. Qty still shows.
    const legacy = item.stockQty != null && item.stockQty !== "" ? String(item.stockQty) : "0";
    return { ...item, stockQty: legacy };
  }));
});

router.post("/stock-items", async (req, res): Promise<void> => {
  if (!req.session.userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const companyId = req.session.companyId;
  if (!companyId) { res.status(400).json({ error: "No company selected" }); return; }

  const { code, name, description, uom, type, unitPrice, mrpPrice, stockQty, warehouseId, batchNo, isActive, alternateUom, alternateQty, mainQty } = req.body;
  if (!name) { res.status(400).json({ error: "name is required" }); return; }

  const resolvedCode = typeof code === "string" ? code.trim() : "";
  if (!resolvedCode) { res.status(400).json({ error: "code is required" }); return; }

  const isProduct = type !== "service";
  const openingQty = isProduct ? Math.max(0, Number(stockQty) || 0) : 0;
  const alt = normalizeAlternateFields({ alternateUom, alternateQty, mainQty });

  let item;
  try {
    [item] = await db.insert(stockItemsTable).values({
      companyId,
      code: resolvedCode,
      name,
      description: description || null,
      uom: uom || "Pcs",
      type: isProduct ? "product" : "service",
      unitPrice: unitPrice != null ? String(unitPrice) : "0",
      mrpPrice: mrpPrice != null ? String(mrpPrice) : "0",
      stockQty: "0",
      batchNo: typeof batchNo === "string" && batchNo.trim() ? batchNo.trim() : null,
      alternateUom: alt.alternateUom,
      alternateQty: alt.alternateQty,
      mainQty: alt.mainQty,
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

  const [created] = await db.select().from(stockItemsTable).where(eq(stockItemsTable.id, item.id));
  res.status(201).json(created ?? item);
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

  const { code, name, description, uom, type, unitPrice, mrpPrice, stockQty, isActive, warehouseId, batchNo, alternateUom, alternateQty, mainQty } = req.body;
  const update: Record<string, any> = {};
  if (code !== undefined) update.code = code;
  if (name !== undefined) update.name = name;
  if (description !== undefined) update.description = description || null;
  if (uom !== undefined) update.uom = uom;
  if (type !== undefined) update.type = type === "service" ? "service" : "product";
  if (unitPrice !== undefined) update.unitPrice = String(unitPrice);
  if (mrpPrice !== undefined) update.mrpPrice = String(mrpPrice);
  if (isActive !== undefined) update.isActive = Boolean(isActive);
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
    : await db.select().from(stockItemsTable).where(eq(stockItemsTable.id, id));
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
