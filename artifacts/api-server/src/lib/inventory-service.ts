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
  | "adjustment_out";

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

  const [existing] = await tx
    .select()
    .from(warehouseStockTable)
    .where(and(
      eq(warehouseStockTable.warehouseId, input.warehouseId),
      eq(warehouseStockTable.stockItemId, input.stockItemId),
    ));

  const current = toQty(existing?.quantity);
  const next = current + qtyIn - qtyOut;
  if (next < 0) {
    throw new Error(`Insufficient stock in warehouse. Available: ${current}, required out: ${qtyOut}`);
  }

  if (existing) {
    await tx
      .update(warehouseStockTable)
      .set({ quantity: String(next), updatedAt: new Date() })
      .where(eq(warehouseStockTable.id, existing.id));
  } else {
    await tx.insert(warehouseStockTable).values({
      companyId: input.companyId,
      warehouseId: input.warehouseId,
      stockItemId: input.stockItemId,
      quantity: String(next),
    });
  }

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
    await tx.delete(goodsReceiptItemsTable).where(eq(goodsReceiptItemsTable.stockItemId, stockItemId));
    await tx.delete(goodsIssueItemsTable).where(eq(goodsIssueItemsTable.stockItemId, stockItemId));
    await tx.delete(stockTransferItemsTable).where(eq(stockTransferItemsTable.stockItemId, stockItemId));
    await tx.delete(stockAdjustmentsTable).where(and(
      eq(stockAdjustmentsTable.stockItemId, stockItemId),
      eq(stockAdjustmentsTable.companyId, companyId),
    ));
    await tx.delete(stockMovementsTable).where(and(
      eq(stockMovementsTable.stockItemId, stockItemId),
      eq(stockMovementsTable.companyId, companyId),
    ));
    await tx.delete(openingStockTable).where(and(
      eq(openingStockTable.stockItemId, stockItemId),
      eq(openingStockTable.companyId, companyId),
    ));
    await tx.delete(warehouseStockTable).where(and(
      eq(warehouseStockTable.stockItemId, stockItemId),
      eq(warehouseStockTable.companyId, companyId),
    ));
    await tx.delete(stockSerialsTable).where(eq(stockSerialsTable.stockItemId, stockItemId));
    await tx.delete(stockItemsTable).where(and(
      eq(stockItemsTable.id, stockItemId),
      eq(stockItemsTable.companyId, companyId),
    ));
  });
}

export async function getWarehouseStockSummary(companyId: number, warehouseId?: number) {
  const conditions = [eq(warehouseStockTable.companyId, companyId)];
  if (warehouseId) conditions.push(eq(warehouseStockTable.warehouseId, warehouseId));

  return db
    .select({
      warehouseId: warehouseStockTable.warehouseId,
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
    .where(and(...conditions));
}

export async function getLedgerSummary(
  companyId: number,
  filters: { warehouseId?: number; stockItemId?: number; from?: string; to?: string },
) {
  const conditions = [eq(stockMovementsTable.companyId, companyId)];
  if (filters.warehouseId) conditions.push(eq(stockMovementsTable.warehouseId, filters.warehouseId));
  if (filters.stockItemId) conditions.push(eq(stockMovementsTable.stockItemId, filters.stockItemId));
  if (filters.from) conditions.push(sql`${stockMovementsTable.movementDate} >= ${filters.from}::timestamptz`);
  if (filters.to) conditions.push(sql`${stockMovementsTable.movementDate} <= ${filters.to}::timestamptz`);

  const movements = await db
    .select()
    .from(stockMovementsTable)
    .where(and(...conditions))
    .orderBy(stockMovementsTable.movementDate, stockMovementsTable.id);

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

  for (const m of movements) {
    const itemId = m.stockItemId;
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
    const s = summary[itemId];
    const qtyIn = toQty(m.quantityIn);
    const qtyOut = toQty(m.quantityOut);
    switch (m.transactionType) {
      case "opening_stock":
        s.opening += qtyIn;
        break;
      case "goods_receipt":
        s.received += qtyIn;
        break;
      case "goods_issue":
        s.issued += qtyOut;
        break;
      case "transfer_in":
        s.transferredIn += qtyIn;
        break;
      case "transfer_out":
        s.transferredOut += qtyOut;
        break;
      case "adjustment_in":
        s.adjustedIn += qtyIn;
        break;
      case "adjustment_out":
        s.adjustedOut += qtyOut;
        break;
    }
    s.closing = toQty(m.balance);
  }

  return Object.values(summary);
}
