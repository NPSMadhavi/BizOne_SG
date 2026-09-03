import {
  db,
  warehouseStockTable,
  stockItemsTable,
  stockMovementsTable,
  warehousesTable,
  openingStockTable,
  goodsReceiptItemsTable,
  goodsIssueItemsTable,
  stockTransferItemsTable,
  stockAdjustmentsTable,
  stockSerialsTable,
} from "@workspace/db";
import { and, eq, ilike, ne, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type MovementType =
  | "opening_stock"
  | "goods_receipt"
  | "goods_issue"
  | "transfer_in"
  | "transfer_out"
  | "adjustment_in"
  | "adjustment_out"
  | "tax_invoice"
  | "purchase_order";

export interface ApplyMovementInput {
  companyId: number;
  warehouseId: number;
  stockItemId: number;
  transactionType: MovementType;
  documentNumber?: string;
  referenceType?: string;
  referenceId?: number;
  quantityIn?: number;
  quantityOut?: number;
  reference?: string;
  userId?: number;
  username?: string;
  movementDate?: Date;
}

function toQty(value: string | number | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export async function getWarehouseBalance(
  tx: Tx,
  warehouseId: number,
  stockItemId: number,
): Promise<number> {
  const [row] = await tx
    .select({ quantity: warehouseStockTable.quantity })
    .from(warehouseStockTable)
    .where(and(
      eq(warehouseStockTable.warehouseId, warehouseId),
      eq(warehouseStockTable.stockItemId, stockItemId),
    ));
  return toQty(row?.quantity);
}

export async function getItemTotalStock(
  tx: Tx | typeof db,
  companyId: number,
  stockItemId: number,
): Promise<number> {
  const rows = await tx
    .select({ quantity: warehouseStockTable.quantity })
    .from(warehouseStockTable)
    .where(and(
      eq(warehouseStockTable.companyId, companyId),
      eq(warehouseStockTable.stockItemId, stockItemId),
    ));
  return rows.reduce((sum, r) => sum + toQty(r.quantity), 0);
}

export async function syncItemTotalStock(
  tx: Tx,
  companyId: number,
  stockItemId: number,
): Promise<number> {
  const total = await getItemTotalStock(tx, companyId, stockItemId);
  await tx
    .update(stockItemsTable)
    .set({ stockQty: String(total), updatedAt: new Date() })
    .where(and(eq(stockItemsTable.id, stockItemId), eq(stockItemsTable.companyId, companyId)));
  return total;
}

export async function assertSufficientStock(
  tx: Tx,
  warehouseId: number,
  stockItemId: number,
  qtyOut: number,
): Promise<void> {
  const available = await getWarehouseBalance(tx, warehouseId, stockItemId);
  if (qtyOut > available) {
    throw new Error(`Insufficient stock. Available: ${available}, requested: ${qtyOut}`);
  }
}

export async function applyMovement(
  tx: Tx,
  input: ApplyMovementInput,
): Promise<{ balance: number; totalStock: number }> {
  const qtyIn = Number(input.quantityIn ?? 0);
  const qtyOut = Number(input.quantityOut ?? 0);
  if (qtyIn < 0 || qtyOut < 0) throw new Error("Quantity cannot be negative");
  if (qtyIn === 0 && qtyOut === 0) throw new Error("Movement quantity required");

  const next = await adjustWarehouseQuantity(tx, {
    companyId: input.companyId,
    warehouseId: input.warehouseId,
    stockItemId: input.stockItemId,
    quantityIn: qtyIn,
    quantityOut: qtyOut,
  });

  await tx.insert(stockMovementsTable).values({
    companyId: input.companyId,
    warehouseId: input.warehouseId,
    stockItemId: input.stockItemId,
    transactionType: input.transactionType,
    documentNumber: input.documentNumber ?? null,
    referenceType: input.referenceType ?? null,
    referenceId: input.referenceId ?? null,
    quantityIn: String(qtyIn),
    quantityOut: String(qtyOut),
    balance: String(next),
    reference: input.reference ?? null,
    userId: input.userId ?? null,
    username: input.username ?? null,
    movementDate: input.movementDate ?? new Date(),
  });

  const totalStock = await syncItemTotalStock(tx, input.companyId, input.stockItemId);
  return { balance: next, totalStock };
}

/**
 * Change warehouse_stock only (no stock_movements row).
 * Used by Tax Invoice upsert so edits update one movement instead of appending deltas.
 */
export async function adjustWarehouseQuantity(
  tx: Tx,
  input: {
    companyId: number;
    warehouseId: number;
    stockItemId: number;
    quantityIn?: number;
    quantityOut?: number;
  },
): Promise<number> {
  const qtyIn = Number(input.quantityIn ?? 0);
  const qtyOut = Number(input.quantityOut ?? 0);
  if (qtyIn < 0 || qtyOut < 0) throw new Error("Quantity cannot be negative");
  if (qtyIn === 0 && qtyOut === 0) throw new Error("Movement quantity required");

  const [wh] = await tx
    .select({ id: warehousesTable.id })
    .from(warehousesTable)
    .where(and(eq(warehousesTable.id, input.warehouseId), eq(warehousesTable.companyId, input.companyId)));
  if (!wh) throw new Error("Warehouse not found");

  const [item] = await tx
    .select({ id: stockItemsTable.id })
    .from(stockItemsTable)
    .where(and(eq(stockItemsTable.id, input.stockItemId), eq(stockItemsTable.companyId, input.companyId)));
  if (!item) throw new Error("Stock item not found");

  await tx
    .insert(warehouseStockTable)
    .values({
      companyId: input.companyId,
      warehouseId: input.warehouseId,
      stockItemId: input.stockItemId,
      quantity: "0",
    })
    .onConflictDoNothing({
      target: [warehouseStockTable.warehouseId, warehouseStockTable.stockItemId],
    });

  const [updatedBalance] = await tx
    .update(warehouseStockTable)
    .set({
      quantity: sql`${warehouseStockTable.quantity} + ${qtyIn} - ${qtyOut}`,
      updatedAt: new Date(),
    })
    .where(and(
      eq(warehouseStockTable.companyId, input.companyId),
      eq(warehouseStockTable.warehouseId, input.warehouseId),
      eq(warehouseStockTable.stockItemId, input.stockItemId),
      sql`${warehouseStockTable.quantity} + ${qtyIn} - ${qtyOut} >= 0`,
    ))
    .returning({ quantity: warehouseStockTable.quantity });

  if (!updatedBalance) {
    const available = await getWarehouseBalance(tx, input.warehouseId, input.stockItemId);
    throw new Error(`Insufficient stock in warehouse. Available: ${available}, required out: ${qtyOut}`);
  }

  const next = toQty(updatedBalance.quantity);
  await syncItemTotalStock(tx, input.companyId, input.stockItemId);
  return next;
}

export async function warehouseHasStock(
  tx: Tx | typeof db,
  warehouseId: number,
): Promise<boolean> {
  const rows = await tx
    .select({ quantity: warehouseStockTable.quantity })
    .from(warehouseStockTable)
    .where(eq(warehouseStockTable.warehouseId, warehouseId));
  return rows.some(r => toQty(r.quantity) > 0);
}

export async function itemHasTransactions(
  tx: Tx | typeof db,
  stockItemId: number,
): Promise<boolean> {
  const rows = await tx
    .select({ id: stockMovementsTable.id })
    .from(stockMovementsTable)
    .where(eq(stockMovementsTable.stockItemId, stockItemId))
    .limit(1);
  return rows.length > 0;
}

export async function getDefaultWarehouseId(companyId: number): Promise<number | null> {
  const [row] = await db
    .select({ id: warehousesTable.id })
    .from(warehousesTable)
    .where(and(eq(warehousesTable.companyId, companyId), eq(warehousesTable.isDefault, true), eq(warehousesTable.isActive, true)));
  return row?.id ?? null;
}

/**
 * Ensures a "Main Warehouse" (code MAIN) exists for the company.
 * Creates it when missing — even if other warehouses already exist.
 */
export async function ensureDefaultWarehouse(companyId: number): Promise<number> {
  const [byCode] = await db
    .select({ id: warehousesTable.id })
    .from(warehousesTable)
    .where(and(
      eq(warehousesTable.companyId, companyId),
      eq(warehousesTable.code, "MAIN"),
    ))
    .limit(1);
  if (byCode) {
    await db.update(warehousesTable)
      .set({ isDefault: true, isActive: true, name: "Main Warehouse" })
      .where(eq(warehousesTable.id, byCode.id));
    await db.update(warehousesTable)
      .set({ isDefault: false })
      .where(and(
        eq(warehousesTable.companyId, companyId),
        ne(warehousesTable.id, byCode.id),
      ));
    return byCode.id;
  }

  const [byName] = await db
    .select({ id: warehousesTable.id })
    .from(warehousesTable)
    .where(and(
      eq(warehousesTable.companyId, companyId),
      ilike(warehousesTable.name, "main warehouse"),
    ))
    .limit(1);
  if (byName) {
    await db.update(warehousesTable)
      .set({ isDefault: true, isActive: true, code: "MAIN", name: "Main Warehouse" })
      .where(eq(warehousesTable.id, byName.id));
    await db.update(warehousesTable)
      .set({ isDefault: false })
      .where(and(
        eq(warehousesTable.companyId, companyId),
        ne(warehousesTable.id, byName.id),
      ));
    return byName.id;
  }

  const [wh] = await db
    .insert(warehousesTable)
    .values({
      companyId,
      code: "MAIN",
      name: "Main Warehouse",
      isDefault: true,
      isActive: true,
    })
    .returning({ id: warehousesTable.id });

  await db.update(warehousesTable)
    .set({ isDefault: false })
    .where(and(
      eq(warehousesTable.companyId, companyId),
      ne(warehousesTable.id, wh.id),
    ));

  return wh.id;
}

export async function resolveWarehouseId(companyId: number): Promise<number | null> {
  const ensured = await ensureDefaultWarehouse(companyId);
  return ensured;
}

/** Set item stock to an absolute quantity (warehouse adjustment or direct stockQty update). */
export async function setItemStockQuantity(params: {
  companyId: number;
  stockItemId: number;
  newQty: number;
  userId?: number;
  username?: string;
  reference?: string;
}): Promise<number> {
  const newQty = Math.max(0, Number(params.newQty) || 0);
  const warehouseId = await resolveWarehouseId(params.companyId);

  const [item] = await db
    .select({ stockQty: stockItemsTable.stockQty })
    .from(stockItemsTable)
    .where(and(eq(stockItemsTable.id, params.stockItemId), eq(stockItemsTable.companyId, params.companyId)));
  if (!item) throw new Error("Stock item not found");

  const warehouseTotal = warehouseId
    ? await getItemTotalStock(db, params.companyId, params.stockItemId)
    : 0;
  const currentQty = warehouseTotal > 0 ? warehouseTotal : toQty(item.stockQty);
  const delta = newQty - currentQty;

  if (delta === 0) {
    if (!warehouseId) {
      await db
        .update(stockItemsTable)
        .set({ stockQty: String(newQty), updatedAt: new Date() })
        .where(and(eq(stockItemsTable.id, params.stockItemId), eq(stockItemsTable.companyId, params.companyId)));
    }
    return newQty;
  }

  if (!warehouseId) {
    await db
      .update(stockItemsTable)
      .set({ stockQty: String(newQty), updatedAt: new Date() })
      .where(and(eq(stockItemsTable.id, params.stockItemId), eq(stockItemsTable.companyId, params.companyId)));
    return newQty;
  }

  const reference = params.reference ?? "Stock quantity updated";
  const documentNumber = `SQ-${params.stockItemId}-${Date.now()}`;

  await db.transaction(async (tx) => {
    if (delta > 0) {
      await applyMovement(tx, {
        companyId: params.companyId,
        warehouseId,
        stockItemId: params.stockItemId,
        transactionType: "adjustment_in",
        documentNumber,
        referenceType: "stock_item_qty",
        referenceId: params.stockItemId,
        quantityIn: delta,
        reference,
        userId: params.userId,
        username: params.username,
      });
    } else {
      await applyMovement(tx, {
        companyId: params.companyId,
        warehouseId,
        stockItemId: params.stockItemId,
        transactionType: "adjustment_out",
        documentNumber,
        referenceType: "stock_item_qty",
        referenceId: params.stockItemId,
        quantityOut: Math.abs(delta),
        reference,
        userId: params.userId,
        username: params.username,
      });
    }
  });

  return getItemTotalStock(db, params.companyId, params.stockItemId);
}

/**
 * Bring an item's total stock to `newTotalQty`, booking the difference as a movement
 * in one warehouse. Used for opening stock and for quantity edits on the item itself.
 */
export async function adjustItemStockInWarehouse(params: {
  companyId: number;
  stockItemId: number;
  warehouseId: number;
  newTotalQty: number;
  userId?: number;
  username?: string;
  reference?: string;
}): Promise<number> {
  const newQty = Math.max(0, Number(params.newTotalQty) || 0);
  const currentTotal = await getItemTotalStock(db, params.companyId, params.stockItemId);
  const delta = newQty - currentTotal;
  if (delta === 0) return currentTotal;

  const documentNumber = `SQ-${params.stockItemId}-${Date.now()}`;
  const reference = params.reference ?? "Stock quantity updated";

  await db.transaction(async (tx) => {
    await applyMovement(tx, {
      companyId: params.companyId,
      warehouseId: params.warehouseId,
      stockItemId: params.stockItemId,
      transactionType: delta > 0 ? "adjustment_in" : "adjustment_out",
      documentNumber,
      referenceType: "stock_item_qty",
      referenceId: params.stockItemId,
      ...(delta > 0 ? { quantityIn: delta } : { quantityOut: Math.abs(delta) }),
      reference,
      userId: params.userId,
      username: params.username,
    });
  });

  return getItemTotalStock(db, params.companyId, params.stockItemId);
}

async function itemHasDocumentReferences(tx: Tx | typeof db, stockItemId: number): Promise<boolean> {
  const checks = await Promise.all([
    tx.select({ id: goodsReceiptItemsTable.id }).from(goodsReceiptItemsTable)
      .where(eq(goodsReceiptItemsTable.stockItemId, stockItemId)).limit(1),
    tx.select({ id: goodsIssueItemsTable.id }).from(goodsIssueItemsTable)
      .where(eq(goodsIssueItemsTable.stockItemId, stockItemId)).limit(1),
    tx.select({ id: stockTransferItemsTable.id }).from(stockTransferItemsTable)
      .where(eq(stockTransferItemsTable.stockItemId, stockItemId)).limit(1),
    tx.select({ id: stockAdjustmentsTable.id }).from(stockAdjustmentsTable)
      .where(eq(stockAdjustmentsTable.stockItemId, stockItemId)).limit(1),
  ]);
  return checks.some((rows) => rows.length > 0);
}

/** Delete stock item and all its inventory history and document line references. */
export async function deleteStockItem(companyId: number, stockItemId: number): Promise<void> {
  const [item] = await db.select({ id: stockItemsTable.id })
    .from(stockItemsTable)
    .where(and(eq(stockItemsTable.id, stockItemId), eq(stockItemsTable.companyId, companyId)));
  if (!item) throw new Error("Stock item not found");

  await db.transaction(async (tx) => {
    // Use raw SQL deletes so a missing optional WMS table cannot break the whole delete.
    await tx.execute(sql`
      DELETE FROM goods_receipt_items
      WHERE stock_item_id = ${stockItemId}
    `);
    await tx.execute(sql`
      DELETE FROM goods_issue_items
      WHERE stock_item_id = ${stockItemId}
    `);
    await tx.execute(sql`
      DELETE FROM stock_transfer_items
      WHERE stock_item_id = ${stockItemId}
    `);
    await tx.execute(sql`
      DELETE FROM stock_adjustments
      WHERE stock_item_id = ${stockItemId} AND company_id = ${companyId}
    `);
    await tx.execute(sql`
      DELETE FROM stock_movements
      WHERE stock_item_id = ${stockItemId} AND company_id = ${companyId}
    `);
    await tx.execute(sql`
      DELETE FROM opening_stock
      WHERE stock_item_id = ${stockItemId} AND company_id = ${companyId}
    `);
    await tx.execute(sql`
      DELETE FROM warehouse_stock
      WHERE stock_item_id = ${stockItemId} AND company_id = ${companyId}
    `);
    await tx.execute(sql`
      DELETE FROM stock_serials
      WHERE stock_item_id = ${stockItemId}
    `);
    await tx.delete(stockItemsTable).where(and(
      eq(stockItemsTable.id, stockItemId),
      eq(stockItemsTable.companyId, companyId),
    ));
  });
}

export async function getWarehouseStockSummary(companyId: number, warehouseId?: number) {
  const conditions = [eq(warehouseStockTable.companyId, companyId)];
  if (warehouseId) conditions.push(eq(warehouseStockTable.warehouseId, warehouseId));

  const rows = await db
    .select({
      warehouseId: warehouseStockTable.warehouseId,
      warehouseName: warehousesTable.name,
      stockItemId: warehouseStockTable.stockItemId,
      quantity: warehouseStockTable.quantity,
      itemCode: stockItemsTable.code,
      itemName: stockItemsTable.name,
      uom: stockItemsTable.uom,
      unitPrice: stockItemsTable.unitPrice,
      minStockLevel: stockItemsTable.minStockLevel,
      reorderLevel: stockItemsTable.reorderLevel,
      maxStockLevel: stockItemsTable.maxStockLevel,
    })
    .from(warehouseStockTable)
    .innerJoin(stockItemsTable, eq(warehouseStockTable.stockItemId, stockItemsTable.id))
    .innerJoin(warehousesTable, eq(warehouseStockTable.warehouseId, warehousesTable.id))
    .where(and(...conditions));

  // Always return live numeric qty from warehouse_stock (same source Tax Invoice updates).
  // Never use stock_items.stock_qty here — that is only a company rollup.
  return rows.map((r) => ({
    ...r,
    warehouseId: Number(r.warehouseId),
    stockItemId: Number(r.stockItemId),
    quantity: toQty(r.quantity),
    unitPrice: toQty(r.unitPrice),
    warehouseName: r.warehouseName,
  }));
}

/** Classify a movement into stock-summary buckets (period activity). */
function classifyMovementQty(
  transactionType: string | null | undefined,
  qtyIn: number,
  qtyOut: number,
): {
  opening: number;
  received: number;
  issued: number;
  transferredIn: number;
  transferredOut: number;
  adjustedIn: number;
  adjustedOut: number;
} {
  const z = { opening: 0, received: 0, issued: 0, transferredIn: 0, transferredOut: 0, adjustedIn: 0, adjustedOut: 0 };
  const t = String(transactionType || "").toLowerCase();

  // Purchases / inbound receipts
  if (t === "goods_receipt" || t === "purchase_order" || t === "grn") {
    return { ...z, received: qtyIn };
  }
  // Sales / outbound issues
  if (t === "goods_issue" || t === "tax_invoice") {
    return { ...z, issued: qtyOut };
  }
  // Invoice void / credit put-back → treat as negative sales (stock returns in)
  if (t === "invoice_void" || t === "invoice_reversal") {
    if (qtyIn > 0) return { ...z, issued: -qtyIn };
    if (qtyOut > 0) return { ...z, issued: qtyOut };
  }
  if (t === "transfer_in") return { ...z, transferredIn: qtyIn };
  if (t === "transfer_out") return { ...z, transferredOut: qtyOut };
  if (t === "opening_stock") return { ...z, opening: qtyIn };
  if (t === "adjustment_in") return { ...z, adjustedIn: qtyIn };
  if (t === "adjustment_out") return { ...z, adjustedOut: qtyOut };

  // Unknown types: keep equation balanced via adjust
  if (qtyIn > 0) return { ...z, adjustedIn: qtyIn };
  if (qtyOut > 0) return { ...z, adjustedOut: qtyOut };
  return z;
}

/**
 * Stock summary for a date range:
 * - Opening = net qty of all movements before `from` (calendar date)
 * - Period buckets = movements whose movement_date::date is in [from, to]
 * - Closing = opening + period net
 *
 * Uses ::date (not timestamptz midnight) so same-day movements are not dropped.
 */
export async function getLedgerSummary(
  companyId: number,
  filters: { warehouseId?: number; stockItemId?: number; from?: string; to?: string },
) {
  const conditions = [eq(stockMovementsTable.companyId, companyId)];
  if (filters.warehouseId) conditions.push(eq(stockMovementsTable.warehouseId, filters.warehouseId));
  if (filters.stockItemId) conditions.push(eq(stockMovementsTable.stockItemId, filters.stockItemId));
  // Inclusive end date: compare calendar dates so evening movements on `to` are included.
  if (filters.to) {
    conditions.push(sql`${stockMovementsTable.movementDate}::date <= ${filters.to}::date`);
  }

  const movements = await db
    .select({
      stockItemId: stockMovementsTable.stockItemId,
      transactionType: stockMovementsTable.transactionType,
      quantityIn: stockMovementsTable.quantityIn,
      quantityOut: stockMovementsTable.quantityOut,
      moveDay: sql<string>`to_char(${stockMovementsTable.movementDate}::date, 'YYYY-MM-DD')`,
    })
    .from(stockMovementsTable)
    .where(and(...conditions))
    .orderBy(stockMovementsTable.movementDate, stockMovementsTable.id);

  const fromDate = filters.from ? String(filters.from).slice(0, 10) : null;

  const summary: Record<number, {
    stockItemId: number;
    opening: number;
    received: number;
    issued: number;
    transferredIn: number;
    transferredOut: number;
    adjustedIn: number;
    adjustedOut: number;
    closing: number;
  }> = {};

  const ensure = (itemId: number) => {
    if (!summary[itemId]) {
      summary[itemId] = {
        stockItemId: itemId,
        opening: 0,
        received: 0,
        issued: 0,
        transferredIn: 0,
        transferredOut: 0,
        adjustedIn: 0,
        adjustedOut: 0,
        closing: 0,
      };
    }
    return summary[itemId];
  };

  for (const m of movements) {
    const s = ensure(m.stockItemId);
    const qtyIn = toQty(m.quantityIn);
    const qtyOut = toQty(m.quantityOut);
    const net = qtyIn - qtyOut;
    const moveDay = String(m.moveDay || "").slice(0, 10);

    const beforePeriod = fromDate != null && moveDay !== "" && moveDay < fromDate;
    if (beforePeriod) {
      s.opening += net;
      continue;
    }

    const bucket = classifyMovementQty(m.transactionType, qtyIn, qtyOut);
    s.opening += bucket.opening;
    s.received += bucket.received;
    s.issued += bucket.issued;
    s.transferredIn += bucket.transferredIn;
    s.transferredOut += bucket.transferredOut;
    s.adjustedIn += bucket.adjustedIn;
    s.adjustedOut += bucket.adjustedOut;
  }

  for (const s of Object.values(summary)) {
    s.closing =
      s.opening +
      s.received -
      s.issued +
      s.transferredIn -
      s.transferredOut +
      s.adjustedIn -
      s.adjustedOut;
  }

  return Object.values(summary);
}
