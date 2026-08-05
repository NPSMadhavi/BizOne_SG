import { Router, type IRouter, type Request, type Response } from "express";
import {
  db,
  goodsReceiptsTable,
  goodsReceiptItemsTable,
  goodsIssuesTable,
  goodsIssueItemsTable,
  stockTransfersTable,
  stockTransferItemsTable,
  stockAdjustmentsTable,
  stockMovementsTable,
  stockItemsTable,
  warehouseStockTable,
  warehousesTable,
} from "@workspace/db";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { logAudit } from "../../lib/audit";
import { nextDocNumber } from "../../lib/running-numbers.js";
import { applyMovement, assertSufficientStock, getLedgerSummary, getWarehouseBalance, getWarehouseStockSummary, resolveWarehouseId } from "../../lib/inventory-service";

const router: IRouter = Router();

function requireSession(req: Request, res: Response): { companyId: number; userId: number; username?: string } | null {
  if (!req.session.userId) { res.status(401).json({ error: "Not authenticated" }); return null; }
  const companyId = req.session.companyId;
  if (!companyId) { res.status(400).json({ error: "No company selected" }); return null; }
  return { companyId, userId: req.session.userId, username: req.session.username };
}

async function loadReceipt(id: number, companyId: number) {
  const [header] = await db.select().from(goodsReceiptsTable)
    .where(and(eq(goodsReceiptsTable.id, id), eq(goodsReceiptsTable.companyId, companyId)));
  if (!header) return null;
  const items = await db.select({
    id: goodsReceiptItemsTable.id,
    stockItemId: goodsReceiptItemsTable.stockItemId,
    quantity: goodsReceiptItemsTable.quantity,
    unitCost: goodsReceiptItemsTable.unitCost,
    itemCode: stockItemsTable.code,
    itemName: stockItemsTable.name,
  })
    .from(goodsReceiptItemsTable)
    .innerJoin(stockItemsTable, eq(goodsReceiptItemsTable.stockItemId, stockItemsTable.id))
    .where(eq(goodsReceiptItemsTable.goodsReceiptId, id));
  return { ...header, items };
}

// ─── Goods Receipts ───────────────────────────────────────────────────────────

router.get("/inventory/goods-receipts", async (req, res) => {
  const ctx = requireSession(req, res); if (!ctx) return;
  const rows = await db.select({
    id: goodsReceiptsTable.id,
    grnNumber: goodsReceiptsTable.grnNumber,
    warehouseId: goodsReceiptsTable.warehouseId,
    supplier: goodsReceiptsTable.supplier,
    referenceNumber: goodsReceiptsTable.referenceNumber,
    receiptDate: goodsReceiptsTable.receiptDate,
    status: goodsReceiptsTable.status,
    warehouseName: warehousesTable.name,
  })
    .from(goodsReceiptsTable)
    .innerJoin(warehousesTable, eq(goodsReceiptsTable.warehouseId, warehousesTable.id))
    .where(eq(goodsReceiptsTable.companyId, ctx.companyId))
    .orderBy(desc(goodsReceiptsTable.receiptDate));
  res.json(rows);
});

router.get("/inventory/goods-receipts/:id", async (req, res) => {
  const ctx = requireSession(req, res); if (!ctx) return;
  const doc = await loadReceipt(parseInt(req.params.id), ctx.companyId);
  if (!doc) { res.status(404).json({ error: "Not found" }); return; }
  res.json(doc);
});

router.post("/inventory/goods-receipts", async (req, res) => {
  const ctx = requireSession(req, res); if (!ctx) return;
  const { warehouseId, supplier, referenceNumber, receiptDate, remarks, items } = req.body;
  if (!warehouseId || !Array.isArray(items) || items.length === 0) {
    res.status(400).json({ error: "Warehouse and items are required" });
    return;
  }

  try {
    const doc = await db.transaction(async (tx) => {
      const grnNumber = await nextDocNumber("igr", ctx.companyId);
      const [header] = await tx.insert(goodsReceiptsTable).values({
        companyId: ctx.companyId,
        grnNumber,
        warehouseId,
        supplier: supplier || null,
        referenceNumber: referenceNumber || null,
        receiptDate: receiptDate || new Date().toISOString().slice(0, 10),
        remarks: remarks || null,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      }).returning();

      for (const line of items) {
        const qty = Number(line.quantity);
        if (!line.stockItemId || !qty || qty <= 0) throw new Error("Invalid line item");
        await tx.insert(goodsReceiptItemsTable).values({
          goodsReceiptId: header.id,
          stockItemId: line.stockItemId,
          quantity: String(qty),
          unitCost: String(line.unitCost ?? 0),
        });
        await applyMovement(tx, {
          companyId: ctx.companyId,
          warehouseId,
          stockItemId: line.stockItemId,
          transactionType: "goods_receipt",
          documentNumber: grnNumber,
          referenceType: "goods_receipt",
          referenceId: header.id,
          quantityIn: qty,
          reference: supplier || referenceNumber,
          userId: ctx.userId,
          username: ctx.username,
          movementDate: new Date(receiptDate || Date.now()),
        });
      }
      return header;
    });
    logAudit({ req, action: "create", entityType: "goods_receipt", entityId: doc.id, entityLabel: doc.grnNumber });
    res.status(201).json(await loadReceipt(doc.id, ctx.companyId));
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Failed to create goods receipt" });
  }
});

router.delete("/inventory/goods-receipts/:id", async (req, res) => {
  res.status(409).json({ error: "Posted goods receipts cannot be deleted. Create an adjustment instead." });
});

// ─── Goods Issues ─────────────────────────────────────────────────────────────

router.get("/inventory/goods-issues", async (req, res) => {
  const ctx = requireSession(req, res); if (!ctx) return;
  const rows = await db.select({
    id: goodsIssuesTable.id,
    ginNumber: goodsIssuesTable.ginNumber,
    warehouseId: goodsIssuesTable.warehouseId,
    reason: goodsIssuesTable.reason,
    issueDate: goodsIssuesTable.issueDate,
    warehouseName: warehousesTable.name,
  })
    .from(goodsIssuesTable)
    .innerJoin(warehousesTable, eq(goodsIssuesTable.warehouseId, warehousesTable.id))
    .where(eq(goodsIssuesTable.companyId, ctx.companyId))
    .orderBy(desc(goodsIssuesTable.issueDate));
  res.json(rows);
});

router.post("/inventory/goods-issues", async (req, res) => {
  const ctx = requireSession(req, res); if (!ctx) return;
  const { warehouseId, reason, issueDate, remarks, items } = req.body;
  if (!warehouseId || !Array.isArray(items) || items.length === 0) {
    res.status(400).json({ error: "Warehouse and items are required" });
    return;
  }

  try {
    const doc = await db.transaction(async (tx) => {
      for (const line of items) {
        const qty = Number(line.quantity);
        if (!line.stockItemId || !qty || qty <= 0) throw new Error("Invalid line item");
        await assertSufficientStock(tx, warehouseId, line.stockItemId, qty);
      }

      const ginNumber = await nextDocNumber("gin", ctx.companyId);
      const [header] = await tx.insert(goodsIssuesTable).values({
        companyId: ctx.companyId,
        ginNumber,
        warehouseId,
        reason: reason || null,
        issueDate: issueDate || new Date().toISOString().slice(0, 10),
        remarks: remarks || null,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      }).returning();

      for (const line of items) {
        const qty = Number(line.quantity);
        await tx.insert(goodsIssueItemsTable).values({
          goodsIssueId: header.id,
          stockItemId: line.stockItemId,
          quantity: String(qty),
        });
        await applyMovement(tx, {
          companyId: ctx.companyId,
          warehouseId,
          stockItemId: line.stockItemId,
          transactionType: "goods_issue",
          documentNumber: ginNumber,
          referenceType: "goods_issue",
          referenceId: header.id,
          quantityOut: qty,
          reference: reason,
          userId: ctx.userId,
          username: ctx.username,
          movementDate: new Date(issueDate || Date.now()),
        });
      }
      return header;
    });
    logAudit({ req, action: "create", entityType: "goods_issue", entityId: doc.id, entityLabel: doc.ginNumber });
    res.status(201).json(doc);
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Failed to create goods issue" });
  }
});

// ─── Stock Transfers ──────────────────────────────────────────────────────────

router.get("/inventory/stock-transfers", async (req, res) => {
  const ctx = requireSession(req, res); if (!ctx) return;
  const rows = await db.select().from(stockTransfersTable)
    .where(eq(stockTransfersTable.companyId, ctx.companyId))
    .orderBy(desc(stockTransfersTable.transferDate));
  res.json(rows);
});

router.post("/inventory/stock-transfers", async (req, res) => {
  const ctx = requireSession(req, res); if (!ctx) return;
  const { fromWarehouseId, toWarehouseId, transferDate, remarks, items } = req.body;
  if (!fromWarehouseId || !toWarehouseId || fromWarehouseId === toWarehouseId) {
    res.status(400).json({ error: "Valid from and to warehouses are required" });
    return;
  }
  if (!Array.isArray(items) || items.length === 0) {
    res.status(400).json({ error: "Items are required" });
    return;
  }

  try {
    const doc = await db.transaction(async (tx) => {
      for (const line of items) {
        const qty = Number(line.quantity);
        if (!line.stockItemId || !qty || qty <= 0) throw new Error("Invalid line item");
        await assertSufficientStock(tx, fromWarehouseId, line.stockItemId, qty);
      }

      const transferNumber = await nextDocNumber("st", ctx.companyId);
      const [header] = await tx.insert(stockTransfersTable).values({
        companyId: ctx.companyId,
        transferNumber,
        fromWarehouseId,
        toWarehouseId,
        transferDate: transferDate || new Date().toISOString().slice(0, 10),
        remarks: remarks || null,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      }).returning();

      for (const line of items) {
        const qty = Number(line.quantity);
        await tx.insert(stockTransferItemsTable).values({
          stockTransferId: header.id,
          stockItemId: line.stockItemId,
          quantity: String(qty),
        });
        await applyMovement(tx, {
          companyId: ctx.companyId,
          warehouseId: fromWarehouseId,
          stockItemId: line.stockItemId,
          transactionType: "transfer_out",
          documentNumber: transferNumber,
          referenceType: "stock_transfer",
          referenceId: header.id,
          quantityOut: qty,
          reference: remarks,
          userId: ctx.userId,
          username: ctx.username,
        });
        await applyMovement(tx, {
          companyId: ctx.companyId,
          warehouseId: toWarehouseId,
          stockItemId: line.stockItemId,
          transactionType: "transfer_in",
          documentNumber: transferNumber,
          referenceType: "stock_transfer",
          referenceId: header.id,
          quantityIn: qty,
          reference: remarks,
          userId: ctx.userId,
          username: ctx.username,
        });
      }
      return header;
    });
    logAudit({ req, action: "create", entityType: "stock_transfer", entityId: doc.id, entityLabel: doc.transferNumber });
    res.status(201).json(doc);
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Failed to create stock transfer" });
  }
});

// ─── Stock Adjustments ────────────────────────────────────────────────────────

router.get("/inventory/stock-adjustments", async (req, res) => {
  const ctx = requireSession(req, res); if (!ctx) return;
  const rows = await db.select({
    id: stockAdjustmentsTable.id,
    adjustmentNumber: stockAdjustmentsTable.adjustmentNumber,
    warehouseId: stockAdjustmentsTable.warehouseId,
    stockItemId: stockAdjustmentsTable.stockItemId,
    adjustmentType: stockAdjustmentsTable.adjustmentType,
    reason: stockAdjustmentsTable.reason,
    currentQuantity: stockAdjustmentsTable.currentQuantity,
    actualQuantity: stockAdjustmentsTable.actualQuantity,
    difference: stockAdjustmentsTable.difference,
    adjustmentDate: stockAdjustmentsTable.adjustmentDate,
    itemCode: stockItemsTable.code,
    itemName: stockItemsTable.name,
    warehouseName: warehousesTable.name,
  })
    .from(stockAdjustmentsTable)
    .innerJoin(stockItemsTable, eq(stockAdjustmentsTable.stockItemId, stockItemsTable.id))
    .innerJoin(warehousesTable, eq(stockAdjustmentsTable.warehouseId, warehousesTable.id))
    .where(eq(stockAdjustmentsTable.companyId, ctx.companyId))
    .orderBy(desc(stockAdjustmentsTable.adjustmentDate));
  res.json(rows);
});

router.post("/inventory/stock-adjustments", async (req, res) => {
  const ctx = requireSession(req, res); if (!ctx) return;
  const { warehouseId, stockItemId, actualQuantity, reason, adjustmentType, remarks, adjustmentDate } = req.body;
  if (!warehouseId || !stockItemId || actualQuantity == null) {
    res.status(400).json({ error: "Warehouse, item and actual quantity are required" });
    return;
  }

  try {
    const doc = await db.transaction(async (tx) => {
      const currentQty = await getWarehouseBalance(tx, warehouseId, stockItemId);
      const actual = Number(actualQuantity);
      const diff = actual - currentQty;
      if (diff === 0) throw new Error("No adjustment needed — actual equals current stock");

      const adjustmentNumber = await nextDocNumber("sa", ctx.companyId);
      const type = diff > 0 ? "increase" : "decrease";

      const [header] = await tx.insert(stockAdjustmentsTable).values({
        companyId: ctx.companyId,
        adjustmentNumber,
        warehouseId,
        stockItemId,
        adjustmentType: adjustmentType || type,
        reason: reason || null,
        currentQuantity: String(currentQty),
        actualQuantity: String(actual),
        difference: String(diff),
        remarks: remarks || null,
        adjustmentDate: adjustmentDate || new Date().toISOString().slice(0, 10),
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      }).returning();

      if (diff > 0) {
        await applyMovement(tx, {
          companyId: ctx.companyId,
          warehouseId,
          stockItemId,
          transactionType: "adjustment_in",
          documentNumber: adjustmentNumber,
          referenceType: "stock_adjustment",
          referenceId: header.id,
          quantityIn: diff,
          reference: reason || remarks,
          userId: ctx.userId,
          username: ctx.username,
        });
      } else {
        await assertSufficientStock(tx, warehouseId, stockItemId, Math.abs(diff));
        await applyMovement(tx, {
          companyId: ctx.companyId,
          warehouseId,
          stockItemId,
          transactionType: "adjustment_out",
          documentNumber: adjustmentNumber,
          referenceType: "stock_adjustment",
          referenceId: header.id,
          quantityOut: Math.abs(diff),
          reference: reason || remarks,
          userId: ctx.userId,
          username: ctx.username,
        });
      }
      return header;
    });
    logAudit({ req, action: "create", entityType: "stock_adjustment", entityId: doc.id, entityLabel: doc.adjustmentNumber });
    res.status(201).json(doc);
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Failed to create adjustment" });
  }
});

// ─── Movements, Ledger, Dashboard, Reports, Search ───────────────────────────

router.get("/inventory/movements", async (req, res) => {
  const ctx = requireSession(req, res); if (!ctx) return;
  const warehouseId = req.query.warehouseId ? parseInt(String(req.query.warehouseId)) : undefined;
  const stockItemId = req.query.stockItemId ? parseInt(String(req.query.stockItemId)) : undefined;
  const transactionType = typeof req.query.transactionType === "string" ? req.query.transactionType : undefined;
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";

  const conditions = [eq(stockMovementsTable.companyId, ctx.companyId)];
  if (warehouseId) conditions.push(eq(stockMovementsTable.warehouseId, warehouseId));
  if (stockItemId) conditions.push(eq(stockMovementsTable.stockItemId, stockItemId));
  if (transactionType) conditions.push(eq(stockMovementsTable.transactionType, transactionType));

  let rows = await db.select({
    id: stockMovementsTable.id,
    movementDate: stockMovementsTable.movementDate,
    transactionType: stockMovementsTable.transactionType,
    documentNumber: stockMovementsTable.documentNumber,
    warehouseId: stockMovementsTable.warehouseId,
    stockItemId: stockMovementsTable.stockItemId,
    quantityIn: stockMovementsTable.quantityIn,
    quantityOut: stockMovementsTable.quantityOut,
    balance: stockMovementsTable.balance,
    reference: stockMovementsTable.reference,
    username: stockMovementsTable.username,
    itemCode: stockItemsTable.code,
    itemName: stockItemsTable.name,
    warehouseName: warehousesTable.name,
  })
    .from(stockMovementsTable)
    .innerJoin(stockItemsTable, eq(stockMovementsTable.stockItemId, stockItemsTable.id))
    .innerJoin(warehousesTable, eq(stockMovementsTable.warehouseId, warehousesTable.id))
    .where(and(...conditions))
    .orderBy(desc(stockMovementsTable.movementDate), desc(stockMovementsTable.id))
    .limit(500);

  if (search) {
    const q = search.toLowerCase();
    rows = rows.filter(r =>
      (r.documentNumber || "").toLowerCase().includes(q) ||
      r.itemCode.toLowerCase().includes(q) ||
      r.itemName.toLowerCase().includes(q) ||
      (r.reference || "").toLowerCase().includes(q)
    );
  }
  res.json(rows);
});

router.get("/inventory/ledger", async (req, res) => {
  const ctx = requireSession(req, res); if (!ctx) return;
  const summary = await getLedgerSummary(ctx.companyId, {
    warehouseId: req.query.warehouseId ? parseInt(String(req.query.warehouseId)) : undefined,
    stockItemId: req.query.stockItemId ? parseInt(String(req.query.stockItemId)) : undefined,
    from: typeof req.query.from === "string" ? req.query.from : undefined,
    to: typeof req.query.to === "string" ? req.query.to : undefined,
  });
  res.json(summary);
});

router.get("/inventory/dashboard", async (req, res) => {
  const ctx = requireSession(req, res); if (!ctx) return;
  const today = new Date().toISOString().slice(0, 10);

  const [whCount] = await db.select({ count: sql<number>`count(*)::int` }).from(warehousesTable)
    .where(and(eq(warehousesTable.companyId, ctx.companyId), eq(warehousesTable.isActive, true)));
  const [itemCount] = await db.select({ count: sql<number>`count(*)::int` }).from(stockItemsTable)
    .where(and(eq(stockItemsTable.companyId, ctx.companyId), eq(stockItemsTable.isActive, true)));

  const stockRows = await getWarehouseStockSummary(ctx.companyId);
  const LOW_STOCK_THRESHOLD = 20;
  let totalValue = 0;
  let lowStock = 0;
  let outOfStock = 0;
  let nearReorder = 0;
  for (const r of stockRows) {
    const qty = Number(r.quantity);
    const price = Number(r.unitPrice ?? 0);
    totalValue += qty * price;
    const reorder = Number(r.reorderLevel ?? 0);
    if (qty <= 0) outOfStock++;
    else if (qty < LOW_STOCK_THRESHOLD) lowStock++;
    else if (reorder > 0 && qty <= reorder) nearReorder++;
  }

  const [todayReceipts] = await db.select({ count: sql<number>`count(*)::int` }).from(goodsReceiptsTable)
    .where(and(eq(goodsReceiptsTable.companyId, ctx.companyId), eq(goodsReceiptsTable.receiptDate, today)));
  const [todayIssues] = await db.select({ count: sql<number>`count(*)::int` }).from(goodsIssuesTable)
    .where(and(eq(goodsIssuesTable.companyId, ctx.companyId), eq(goodsIssuesTable.issueDate, today)));

  const recentMovements = await db.select({
    id: stockMovementsTable.id,
    movementDate: stockMovementsTable.movementDate,
    transactionType: stockMovementsTable.transactionType,
    documentNumber: stockMovementsTable.documentNumber,
    quantityIn: stockMovementsTable.quantityIn,
    quantityOut: stockMovementsTable.quantityOut,
    itemCode: stockItemsTable.code,
    warehouseName: warehousesTable.name,
  })
    .from(stockMovementsTable)
    .innerJoin(stockItemsTable, eq(stockMovementsTable.stockItemId, stockItemsTable.id))
    .innerJoin(warehousesTable, eq(stockMovementsTable.warehouseId, warehousesTable.id))
    .where(eq(stockMovementsTable.companyId, ctx.companyId))
    .orderBy(desc(stockMovementsTable.movementDate))
    .limit(10);

  res.json({
    totalWarehouses: whCount?.count ?? 0,
    totalItems: itemCount?.count ?? 0,
    totalStockValue: totalValue,
    lowStock,
    outOfStock,
    nearReorder,
    todayReceipts: todayReceipts?.count ?? 0,
    todayIssues: todayIssues?.count ?? 0,
    recentMovements,
  });
});

router.get("/inventory/reports/current-stock", async (req, res) => {
  const ctx = requireSession(req, res); if (!ctx) return;
  const warehouseId = req.query.warehouseId ? parseInt(String(req.query.warehouseId)) : undefined;
  res.json(await getWarehouseStockSummary(ctx.companyId, warehouseId));
});

router.get("/inventory/warehouse-stock", async (req, res) => {
  const ctx = requireSession(req, res); if (!ctx) return;
  const stockItemId = parseInt(String(req.query.stockItemId ?? ""));
  if (!stockItemId || Number.isNaN(stockItemId)) {
    res.status(400).json({ error: "stockItemId is required" });
    return;
  }

  const rows = await db
    .select({
      id: warehousesTable.id,
      name: warehousesTable.name,
      code: warehousesTable.code,
      quantity: warehouseStockTable.quantity,
      isDefault: warehousesTable.isDefault,
    })
    .from(warehouseStockTable)
    .innerJoin(warehousesTable, eq(warehouseStockTable.warehouseId, warehousesTable.id))
    .where(and(
      eq(warehouseStockTable.companyId, ctx.companyId),
      eq(warehouseStockTable.stockItemId, stockItemId),
      eq(warehousesTable.isActive, true),
    ))
    .orderBy(desc(warehouseStockTable.quantity));

  const withStock = rows
    .map((r) => ({
      id: r.id,
      name: r.name,
      code: r.code,
      quantity: Number(r.quantity) || 0,
      isDefault: r.isDefault,
    }))
    .filter((r) => r.quantity > 0);

  // Always include Main/default warehouse (even at 0) so pickers can show availability.
  const defaultWarehouseId = await resolveWarehouseId(ctx.companyId);
  if (defaultWarehouseId && !withStock.some((r) => r.id === defaultWarehouseId)) {
    const [defaultRow] = rows.filter((r) => r.id === defaultWarehouseId);
    if (defaultRow) {
      withStock.push({
        id: defaultRow.id,
        name: defaultRow.name,
        code: defaultRow.code,
        quantity: Number(defaultRow.quantity) || 0,
        isDefault: defaultRow.isDefault,
      });
    } else {
      const [wh] = await db
        .select({
          id: warehousesTable.id,
          name: warehousesTable.name,
          code: warehousesTable.code,
          isDefault: warehousesTable.isDefault,
        })
        .from(warehousesTable)
        .where(and(eq(warehousesTable.id, defaultWarehouseId), eq(warehousesTable.companyId, ctx.companyId)));
      if (wh) {
        withStock.push({
          id: wh.id,
          name: wh.name,
          code: wh.code,
          quantity: 0,
          isDefault: wh.isDefault,
        });
      }
    }
  }

  if (withStock.length > 0) {
    res.json(withStock);
    return;
  }

  const [item] = await db
    .select({ stockQty: stockItemsTable.stockQty })
    .from(stockItemsTable)
    .where(and(eq(stockItemsTable.id, stockItemId), eq(stockItemsTable.companyId, ctx.companyId)));
  const legacyQty = Number(item?.stockQty) || 0;
  if (legacyQty <= 0) {
    // Still return Main Warehouse at 0 so UI can show it
    if (defaultWarehouseId) {
      const [wh] = await db
        .select({
          id: warehousesTable.id,
          name: warehousesTable.name,
          code: warehousesTable.code,
          isDefault: warehousesTable.isDefault,
        })
        .from(warehousesTable)
        .where(and(eq(warehousesTable.id, defaultWarehouseId), eq(warehousesTable.companyId, ctx.companyId)));
      if (wh) {
        res.json([{
          id: wh.id,
          name: wh.name,
          code: wh.code,
          quantity: 0,
          isDefault: wh.isDefault,
        }]);
        return;
      }
    }
    res.json([]);
    return;
  }

  if (!defaultWarehouseId) {
    res.json([]);
    return;
  }

  const [wh] = await db
    .select({ id: warehousesTable.id, name: warehousesTable.name, code: warehousesTable.code, isDefault: warehousesTable.isDefault })
    .from(warehousesTable)
    .where(and(eq(warehousesTable.id, defaultWarehouseId), eq(warehousesTable.companyId, ctx.companyId)));

  if (!wh) {
    res.json([]);
    return;
  }

  res.json([{
    id: wh.id,
    name: wh.name,
    code: wh.code,
    quantity: legacyQty,
    isDefault: wh.isDefault,
  }]);
});

router.get("/inventory/search", async (req, res) => {
  const ctx = requireSession(req, res); if (!ctx) return;
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (!q) { res.json({ warehouses: [], items: [], movements: [] }); return; }

  const warehouses = await db.select().from(warehousesTable)
    .where(and(
      eq(warehousesTable.companyId, ctx.companyId),
      or(ilike(warehousesTable.code, `%${q}%`), ilike(warehousesTable.name, `%${q}%`)),
    )).limit(20);

  const items = await db.select().from(stockItemsTable)
    .where(and(
      eq(stockItemsTable.companyId, ctx.companyId),
      or(ilike(stockItemsTable.code, `%${q}%`), ilike(stockItemsTable.name, `%${q}%`)),
    )).limit(20);

  const movements = await db.select({
    id: stockMovementsTable.id,
    documentNumber: stockMovementsTable.documentNumber,
    transactionType: stockMovementsTable.transactionType,
    movementDate: stockMovementsTable.movementDate,
  }).from(stockMovementsTable)
    .where(and(
      eq(stockMovementsTable.companyId, ctx.companyId),
      ilike(stockMovementsTable.documentNumber, `%${q}%`),
    )).limit(20);

  res.json({ warehouses, items, movements });
});

export default router;
