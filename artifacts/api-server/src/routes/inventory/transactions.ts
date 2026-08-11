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
import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
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

async function loadWarehouseNameMap(companyId: number, ids: number[]): Promise<Map<number, string>> {
  const unique = [...new Set(ids.filter((id) => Number.isFinite(id) && id > 0))];
  const map = new Map<number, string>();
  if (unique.length === 0) return map;
  const rows = await db
    .select({ id: warehousesTable.id, name: warehousesTable.name })
    .from(warehousesTable)
    .where(and(eq(warehousesTable.companyId, companyId), inArray(warehousesTable.id, unique)));
  for (const row of rows) map.set(row.id, row.name);
  return map;
}

function normalizeTransferLines(items: unknown): { stockItemId: number; qty: number }[] {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("Items are required");
  }
  const normalizedLines: { stockItemId: number; qty: number }[] = [];
  for (const line of items) {
    const stockItemId = Number((line as any)?.stockItemId);
    const qty = Number((line as any)?.quantity);
    if (!Number.isFinite(stockItemId) || stockItemId <= 0) {
      throw new Error("Invalid stock item on transfer line.");
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      throw new Error("Transfer quantity must be greater than zero.");
    }
    normalizedLines.push({ stockItemId, qty });
  }
  return normalizedLines;
}

router.get("/inventory/stock-transfers", async (req, res) => {
  const ctx = requireSession(req, res); if (!ctx) return;
  const rows = await db.select().from(stockTransfersTable)
    .where(eq(stockTransfersTable.companyId, ctx.companyId))
    .orderBy(desc(stockTransfersTable.transferDate), desc(stockTransfersTable.id));

  const whMap = await loadWarehouseNameMap(
    ctx.companyId,
    rows.flatMap((r) => [r.fromWarehouseId, r.toWarehouseId]),
  );

  const transferIds = rows.map((r) => r.id);
  const itemRows = transferIds.length
    ? await db.select({
      stockTransferId: stockTransferItemsTable.stockTransferId,
      stockItemId: stockTransferItemsTable.stockItemId,
      quantity: stockTransferItemsTable.quantity,
      itemCode: stockItemsTable.code,
      itemName: stockItemsTable.name,
    })
      .from(stockTransferItemsTable)
      .innerJoin(stockItemsTable, eq(stockTransferItemsTable.stockItemId, stockItemsTable.id))
      .where(inArray(stockTransferItemsTable.stockTransferId, transferIds))
    : [];

  const itemsByTransfer = new Map<number, typeof itemRows>();
  for (const item of itemRows) {
    const list = itemsByTransfer.get(item.stockTransferId) ?? [];
    list.push(item);
    itemsByTransfer.set(item.stockTransferId, list);
  }

  res.json(rows.map((r) => ({
    ...r,
    fromWarehouseName: whMap.get(r.fromWarehouseId) ?? `Warehouse #${r.fromWarehouseId}`,
    toWarehouseName: whMap.get(r.toWarehouseId) ?? `Warehouse #${r.toWarehouseId}`,
    items: (itemsByTransfer.get(r.id) ?? []).map((item) => ({
      stockItemId: item.stockItemId,
      quantity: Number(item.quantity),
      itemCode: item.itemCode,
      itemName: item.itemName,
    })),
  })));
});

/**
 * Unified stock history for the Stock Transfer page:
 * Purchase Order (IN), Tax Invoice (OUT), and Stock Transfer (OUT+IN).
 * Tax Invoice rows are aggregated by invoice+item so edits show the latest absolute qty
 * (e.g. -20) instead of leftover delta rows (-10 then -10).
 */
router.get("/inventory/stock-activity", async (req, res) => {
  const ctx = requireSession(req, res); if (!ctx) return;
  const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? "50"), 10) || 50, 1), 200);

  const transfers = await db.select().from(stockTransfersTable)
    .where(eq(stockTransfersTable.companyId, ctx.companyId))
    .orderBy(desc(stockTransfersTable.transferDate), desc(stockTransfersTable.id))
    .limit(limit);

  const whMap = await loadWarehouseNameMap(
    ctx.companyId,
    transfers.flatMap((r) => [r.fromWarehouseId, r.toWarehouseId]),
  );

  const transferActivity = transfers.map((t) => ({
    id: `transfer-${t.id}`,
    activityType: "transfer" as const,
    documentNumber: t.transferNumber,
    date: t.transferDate,
    fromWarehouse: whMap.get(t.fromWarehouseId) ?? `Warehouse #${t.fromWarehouseId}`,
    toWarehouse: whMap.get(t.toWarehouseId) ?? `Warehouse #${t.toWarehouseId}`,
    referenceId: t.id,
    quantity: null as number | null,
    stockItemCode: null as string | null,
    stockItemName: null as string | null,
  }));

  const docMovements = await db.select({
    id: stockMovementsTable.id,
    movementDate: stockMovementsTable.movementDate,
    documentNumber: stockMovementsTable.documentNumber,
    referenceType: stockMovementsTable.referenceType,
    referenceId: stockMovementsTable.referenceId,
    transactionType: stockMovementsTable.transactionType,
    warehouseId: stockMovementsTable.warehouseId,
    stockItemId: stockMovementsTable.stockItemId,
    quantityIn: stockMovementsTable.quantityIn,
    quantityOut: stockMovementsTable.quantityOut,
    warehouseName: warehousesTable.name,
    itemCode: stockItemsTable.code,
    itemName: stockItemsTable.name,
  })
    .from(stockMovementsTable)
    .innerJoin(warehousesTable, eq(stockMovementsTable.warehouseId, warehousesTable.id))
    .innerJoin(stockItemsTable, eq(stockMovementsTable.stockItemId, stockItemsTable.id))
    .where(and(
      eq(stockMovementsTable.companyId, ctx.companyId),
      or(
        eq(stockMovementsTable.referenceType, "purchase_order"),
        eq(stockMovementsTable.referenceType, "invoice"),
        eq(stockMovementsTable.transactionType, "tax_invoice"),
        eq(stockMovementsTable.transactionType, "purchase_order"),
      ),
    ))
    .orderBy(desc(stockMovementsTable.movementDate), desc(stockMovementsTable.id))
    .limit(500);

  type Agg = {
    id: string;
    activityType: "purchase" | "sale";
    documentNumber: string;
    date: Date | string;
    fromWarehouse: string | null;
    toWarehouse: string | null;
    referenceId: number | null;
    quantity: number;
    stockItemCode: string | null;
    stockItemName: string | null;
    sortTs: number;
  };

  const purchaseAgg = new Map<string, Agg>();
  const saleAgg = new Map<string, Agg>();

  for (const m of docMovements) {
    const qtyIn = Number(m.quantityIn || 0);
    const qtyOut = Number(m.quantityOut || 0);
    const isPurchase =
      m.referenceType === "purchase_order"
      || m.transactionType === "purchase_order";
    const key = `${m.referenceId ?? 0}:${m.stockItemId}`;
    const sortTs = new Date(m.movementDate as any).getTime();

    if (isPurchase) {
      const existing = purchaseAgg.get(key);
      if (m.transactionType === "purchase_order") {
        purchaseAgg.set(key, {
          id: `po-${m.referenceId}-${m.stockItemId}`,
          activityType: "purchase",
          documentNumber: m.documentNumber || `PO#${m.referenceId}`,
          date: m.movementDate,
          fromWarehouse: null,
          toWarehouse: m.warehouseName,
          referenceId: m.referenceId,
          quantity: qtyIn,
          stockItemCode: m.itemCode,
          stockItemName: m.itemName,
          sortTs,
        });
        continue;
      }

      if (existing?.id.startsWith("po-") && !existing.id.startsWith("po-net-")) {
        continue;
      }

      purchaseAgg.set(key, {
        id: `po-net-${m.referenceId}-${m.stockItemId}`,
        activityType: "purchase",
        documentNumber: m.documentNumber || `PO#${m.referenceId}`,
        date: existing && existing.sortTs >= sortTs ? existing.date : m.movementDate,
        fromWarehouse: null,
        toWarehouse: m.warehouseName,
        referenceId: m.referenceId,
        quantity: (existing?.quantity ?? 0) + qtyIn - qtyOut,
        stockItemCode: m.itemCode,
        stockItemName: m.itemName,
        sortTs: existing ? Math.max(existing.sortTs, sortTs) : sortTs,
      });
      continue;
    }

    // Tax Invoice: prefer canonical tax_invoice absolute qty_out; else net legacy deltas.
    const existing = saleAgg.get(key);
    if (m.transactionType === "tax_invoice") {
      saleAgg.set(key, {
        id: `inv-${m.referenceId}-${m.stockItemId}`,
        activityType: "sale",
        documentNumber: m.documentNumber || `INV#${m.referenceId}`,
        date: m.movementDate,
        fromWarehouse: m.warehouseName,
        toWarehouse: null,
        referenceId: m.referenceId,
        quantity: qtyOut,
        stockItemCode: m.itemCode,
        stockItemName: m.itemName,
        sortTs,
      });
      continue;
    }

    if (existing?.id.startsWith("inv-") && !existing.id.startsWith("inv-net-")) {
      // Canonical tax_invoice already set absolute qty — ignore legacy delta rows.
      continue;
    }

    saleAgg.set(key, {
      id: `inv-net-${m.referenceId}-${m.stockItemId}`,
      activityType: "sale",
      documentNumber: m.documentNumber || `INV#${m.referenceId}`,
      date: existing && existing.sortTs >= sortTs ? existing.date : m.movementDate,
      fromWarehouse: m.warehouseName,
      toWarehouse: null,
      referenceId: m.referenceId,
      quantity: (existing?.quantity ?? 0) + qtyOut - qtyIn,
      stockItemCode: m.itemCode,
      stockItemName: m.itemName,
      sortTs: existing ? Math.max(existing.sortTs, sortTs) : sortTs,
    });
  }

  const documentActivity = [...purchaseAgg.values(), ...saleAgg.values()]
    .filter((row) => Math.abs(row.quantity) > 0.0005)
    .map(({ sortTs: _s, ...row }) => row);

  const merged = [...transferActivity, ...documentActivity]
    .sort((a, b) => {
      const da = new Date(a.date as any).getTime();
      const db_ = new Date(b.date as any).getTime();
      return db_ - da;
    })
    .slice(0, limit);

  res.json(merged);
});

router.post("/inventory/stock-transfers", async (req, res) => {
  const ctx = requireSession(req, res); if (!ctx) return;
  const fromWarehouseId = Number(req.body?.fromWarehouseId);
  const toWarehouseId = Number(req.body?.toWarehouseId);
  const { transferDate, remarks, items } = req.body ?? {};

  if (!Number.isFinite(fromWarehouseId) || fromWarehouseId <= 0
    || !Number.isFinite(toWarehouseId) || toWarehouseId <= 0) {
    res.status(400).json({ error: "Select both From and To warehouses." });
    return;
  }
  if (fromWarehouseId === toWarehouseId) {
    res.status(400).json({ error: "From and To warehouse must be different." });
    return;
  }

  try {
    const normalizedLines = normalizeTransferLines(items);
    const doc = await db.transaction(async (tx) => {
      // Ensure both warehouses belong to this company (prevents silent no-op / wrong WH).
      const whRows = await tx
        .select({ id: warehousesTable.id, name: warehousesTable.name })
        .from(warehousesTable)
        .where(and(
          eq(warehousesTable.companyId, ctx.companyId),
          inArray(warehousesTable.id, [fromWarehouseId, toWarehouseId]),
        ));
      if (whRows.length !== 2) {
        throw new Error("From/To warehouse not found for this company.");
      }

      for (const line of normalizedLines) {
        await assertSufficientStock(tx, fromWarehouseId, line.stockItemId, line.qty);
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

      for (const line of normalizedLines) {
        await tx.insert(stockTransferItemsTable).values({
          stockTransferId: header.id,
          stockItemId: line.stockItemId,
          quantity: String(line.qty),
        });
        // Source warehouse STOCK OUT
        await applyMovement(tx, {
          companyId: ctx.companyId,
          warehouseId: fromWarehouseId,
          stockItemId: line.stockItemId,
          transactionType: "transfer_out",
          documentNumber: transferNumber,
          referenceType: "stock_transfer",
          referenceId: header.id,
          quantityOut: line.qty,
          reference: remarks || `Transfer ${transferNumber}`,
          userId: ctx.userId,
          username: ctx.username,
        });
        // Destination warehouse STOCK IN
        await applyMovement(tx, {
          companyId: ctx.companyId,
          warehouseId: toWarehouseId,
          stockItemId: line.stockItemId,
          transactionType: "transfer_in",
          documentNumber: transferNumber,
          referenceType: "stock_transfer",
          referenceId: header.id,
          quantityIn: line.qty,
          reference: remarks || `Transfer ${transferNumber}`,
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

/**
 * Edit stock transfer: reverse previous OUT/IN, then apply the new transfer.
 * Uses referenceId so the same transfer cannot double-post.
 */
router.put("/inventory/stock-transfers/:id", async (req, res) => {
  const ctx = requireSession(req, res); if (!ctx) return;
  const transferId = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(transferId) || transferId <= 0) {
    res.status(400).json({ error: "Invalid stock transfer id" });
    return;
  }

  const fromWarehouseId = Number(req.body?.fromWarehouseId);
  const toWarehouseId = Number(req.body?.toWarehouseId);
  const { transferDate, remarks, items } = req.body ?? {};

  if (!Number.isFinite(fromWarehouseId) || fromWarehouseId <= 0
    || !Number.isFinite(toWarehouseId) || toWarehouseId <= 0) {
    res.status(400).json({ error: "Select both From and To warehouses." });
    return;
  }
  if (fromWarehouseId === toWarehouseId) {
    res.status(400).json({ error: "From and To warehouse must be different." });
    return;
  }

  try {
    const normalizedLines = normalizeTransferLines(items);
    const doc = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${ctx.companyId}, ${transferId + 900000})`);

      const [existing] = await tx.select().from(stockTransfersTable)
        .where(and(
          eq(stockTransfersTable.id, transferId),
          eq(stockTransfersTable.companyId, ctx.companyId),
        ))
        .limit(1);
      if (!existing) throw new Error("Stock transfer not found");

      const whRows = await tx
        .select({ id: warehousesTable.id })
        .from(warehousesTable)
        .where(and(
          eq(warehousesTable.companyId, ctx.companyId),
          inArray(warehousesTable.id, [fromWarehouseId, toWarehouseId]),
        ));
      if (whRows.length !== 2) {
        throw new Error("From/To warehouse not found for this company.");
      }

      const previousItems = await tx.select().from(stockTransferItemsTable)
        .where(eq(stockTransferItemsTable.stockTransferId, transferId));

      // Reverse previous transfer: put back to source, remove from destination.
      for (const line of previousItems) {
        const qty = Number(line.quantity);
        if (qty <= 0) continue;
        await applyMovement(tx, {
          companyId: ctx.companyId,
          warehouseId: existing.toWarehouseId,
          stockItemId: line.stockItemId,
          transactionType: "transfer_out",
          documentNumber: existing.transferNumber,
          referenceType: "stock_transfer_reversal",
          referenceId: existing.id,
          quantityOut: qty,
          reference: `Reverse transfer ${existing.transferNumber}`,
          userId: ctx.userId,
          username: ctx.username,
        });
        await applyMovement(tx, {
          companyId: ctx.companyId,
          warehouseId: existing.fromWarehouseId,
          stockItemId: line.stockItemId,
          transactionType: "transfer_in",
          documentNumber: existing.transferNumber,
          referenceType: "stock_transfer_reversal",
          referenceId: existing.id,
          quantityIn: qty,
          reference: `Reverse transfer ${existing.transferNumber}`,
          userId: ctx.userId,
          username: ctx.username,
        });
      }

      for (const line of normalizedLines) {
        await assertSufficientStock(tx, fromWarehouseId, line.stockItemId, line.qty);
      }

      const [header] = await tx.update(stockTransfersTable)
        .set({
          fromWarehouseId,
          toWarehouseId,
          transferDate: transferDate || existing.transferDate,
          remarks: remarks ?? existing.remarks,
          updatedBy: ctx.userId,
          updatedAt: new Date(),
        })
        .where(eq(stockTransfersTable.id, transferId))
        .returning();

      await tx.delete(stockTransferItemsTable)
        .where(eq(stockTransferItemsTable.stockTransferId, transferId));

      for (const line of normalizedLines) {
        await tx.insert(stockTransferItemsTable).values({
          stockTransferId: transferId,
          stockItemId: line.stockItemId,
          quantity: String(line.qty),
        });
        await applyMovement(tx, {
          companyId: ctx.companyId,
          warehouseId: fromWarehouseId,
          stockItemId: line.stockItemId,
          transactionType: "transfer_out",
          documentNumber: header.transferNumber,
          referenceType: "stock_transfer",
          referenceId: header.id,
          quantityOut: line.qty,
          reference: remarks || `Transfer ${header.transferNumber}`,
          userId: ctx.userId,
          username: ctx.username,
        });
        await applyMovement(tx, {
          companyId: ctx.companyId,
          warehouseId: toWarehouseId,
          stockItemId: line.stockItemId,
          transactionType: "transfer_in",
          documentNumber: header.transferNumber,
          referenceType: "stock_transfer",
          referenceId: header.id,
          quantityIn: line.qty,
          reference: remarks || `Transfer ${header.transferNumber}`,
          userId: ctx.userId,
          username: ctx.username,
        });
      }

      return header;
    });
    logAudit({ req, action: "update", entityType: "stock_transfer", entityId: doc.id, entityLabel: doc.transferNumber });
    res.json(doc);
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Failed to update stock transfer" });
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
    referenceType: stockMovementsTable.referenceType,
    referenceId: stockMovementsTable.referenceId,
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

  // Count live stock movements for "today" (calendar date), not only WMS goods_receipts/issues tables.
  // PO confirm + Tax Invoice are the main in/out paths in this app.
  const [todayReceipts] = await db.select({ count: sql<number>`count(*)::int` }).from(stockMovementsTable)
    .where(and(
      eq(stockMovementsTable.companyId, ctx.companyId),
      sql`${stockMovementsTable.movementDate}::date = CURRENT_DATE`,
      sql`${stockMovementsTable.transactionType} IN ('goods_receipt', 'purchase_order', 'grn')`,
    ));
  const [todayIssues] = await db.select({ count: sql<number>`count(*)::int` }).from(stockMovementsTable)
    .where(and(
      eq(stockMovementsTable.companyId, ctx.companyId),
      sql`${stockMovementsTable.movementDate}::date = CURRENT_DATE`,
      sql`${stockMovementsTable.transactionType} IN ('goods_issue', 'tax_invoice')`,
    ));

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
    .orderBy(desc(stockMovementsTable.movementDate), desc(stockMovementsTable.id))
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
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
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
      // Always show real on-hand warehouse qty (never inflate with invoice credits).
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

  // No warehouse_stock rows for this item. Do NOT invent availability from
  // stock_items.stock_qty — that inflated Stock Transfer / cube-picker qty and
  // made later invoice issues look like wrong-warehouse / double deductions.
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
