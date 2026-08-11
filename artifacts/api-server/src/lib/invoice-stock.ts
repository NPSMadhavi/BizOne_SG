import {
  db,
  stockItemsTable,
  stockMovementsTable,
  warehousesTable,
} from "@workspace/db";
import { and, eq, or, sql } from "drizzle-orm";
import { adjustWarehouseQuantity, getWarehouseBalance } from "./inventory-service.js";
import { requireWarehouseId, type DocumentStockLine } from "./document-stock-sync.js";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

type InvoiceLineItem = {
  type?: string;
  partNumber?: string;
  stockItemId?: number;
  isStockItem?: boolean;
  qty?: number;
  selectedSerials?: string[];
  warehouseId?: number;
  warehouseName?: string;
};

type StockLine = DocumentStockLine;

export type InvoiceStockApplyResult = {
  /** Qty actually reduced from warehouses on THIS save (0 = already issued / no-op). */
  reducedThisSave: Array<{
    warehouseId: number;
    warehouseName?: string;
    stockItemId: number;
    quantity: number;
  }>;
  /** Qty put back when invoice qty was lowered or warehouse remapped. */
  putBackThisSave: Array<{
    warehouseId: number;
    warehouseName?: string;
    stockItemId: number;
    quantity: number;
  }>;
  alreadyIssued: Array<{
    warehouseId: number;
    stockItemId: number;
    quantity: number;
  }>;
};

function toQty(value: string | number | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function cleanPartNumber(raw: unknown): string {
  return String(raw ?? "").replace(/<[^>]*>/g, "").trim();
}

function normalizeId(raw: unknown): number | undefined {
  if (raw == null || raw === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function lineKey(warehouseId: number, stockItemId: number): string {
  return `${warehouseId}:${stockItemId}`;
}

function inventoryLog(payload: Record<string, unknown>): void {
  console.log("[INVENTORY UPDATE]", JSON.stringify(payload));
}

async function assertStockItem(
  tx: Tx,
  companyId: number,
  stockItemId: number,
): Promise<void> {
  const [row] = await tx
    .select({ id: stockItemsTable.id, type: stockItemsTable.type })
    .from(stockItemsTable)
    .where(and(eq(stockItemsTable.companyId, companyId), eq(stockItemsTable.id, stockItemId)));
  if (!row || row.type === "service") {
    throw new Error(
      `Stock item #${stockItemId} not found. Pick the item again using the cube icon.`,
    );
  }
}

async function assertWarehouse(
  tx: Tx,
  companyId: number,
  warehouseId: number,
): Promise<{ id: number; name: string }> {
  const [row] = await tx
    .select({ id: warehousesTable.id, name: warehousesTable.name })
    .from(warehousesTable)
    .where(and(eq(warehousesTable.id, warehouseId), eq(warehousesTable.companyId, companyId)));
  if (!row) {
    throw new Error(`Warehouse #${warehouseId} not found for this company.`);
  }
  return row;
}

async function collectDesiredLines(
  tx: Tx,
  companyId: number,
  items: InvoiceLineItem[],
): Promise<StockLine[]> {
  const lines = new Map<string, StockLine>();

  for (const item of items) {
    if (item?.type === "section") continue;

    const stockItemId = normalizeId(item.stockItemId);
    if (!stockItemId) continue;

    const warehouseId = requireWarehouseId(
      item.warehouseId,
      cleanPartNumber(item.partNumber) || "stock item",
    );

    const qty = Number(item.qty) || 0;
    if (qty <= 0) continue;

    const serialQty = Array.isArray(item.selectedSerials)
      ? item.selectedSerials.filter((s) => String(s).trim()).length
      : 0;
    if (serialQty > 0 && serialQty !== qty) {
      throw new Error(
        `Selected serial count (${serialQty}) must match invoice quantity (${qty}).`,
      );
    }

    await assertStockItem(tx, companyId, stockItemId);
    const wh = await assertWarehouse(tx, companyId, warehouseId);

    inventoryLog({
      transactionType: "tax_invoice",
      warehouseId,
      warehouseName: wh.name,
      stockItemId,
      quantity: qty,
      movementType: "OUT",
    });

    const key = lineKey(warehouseId, stockItemId);
    const existing = lines.get(key);
    if (existing) existing.qty += qty;
    else lines.set(key, { warehouseId, stockItemId, qty });
  }

  return Array.from(lines.values());
}

export async function loadInvoiceNetDeducted(
  tx: Tx | typeof db,
  companyId: number,
  invoiceId: number,
): Promise<Map<string, StockLine>> {
  const movements = await tx
    .select()
    .from(stockMovementsTable)
    .where(and(
      eq(stockMovementsTable.companyId, companyId),
      eq(stockMovementsTable.referenceId, invoiceId),
      or(
        eq(stockMovementsTable.referenceType, "invoice"),
        eq(stockMovementsTable.referenceType, "invoice_reversal"),
        eq(stockMovementsTable.referenceType, "invoice_void"),
        eq(stockMovementsTable.transactionType, "tax_invoice"),
      ),
    ));

  const net = new Map<string, StockLine>();
  for (const m of movements) {
    const warehouseId = Number(m.warehouseId);
    const stockItemId = Number(m.stockItemId);
    if (!warehouseId || !stockItemId) continue;
    const key = lineKey(warehouseId, stockItemId);
    const delta = toQty(m.quantityOut) - toQty(m.quantityIn);
    const cur = net.get(key) ?? { warehouseId, stockItemId, qty: 0 };
    cur.qty += delta;
    net.set(key, cur);
  }
  return net;
}

/**
 * Persist the warehouse stock was actually issued from.
 */
export function alignInvoiceItemsToIssuedWarehouse(
  items: InvoiceLineItem[] | undefined,
  netMap: Map<string, StockLine>,
  warehouseNames: Map<number, string>,
): InvoiceLineItem[] {
  const list = Array.isArray(items) ? items : [];

  const netByItem = new Map<number, StockLine>();
  for (const line of netMap.values()) {
    if (line.qty <= 0.0005) continue;
    const prev = netByItem.get(line.stockItemId);
    if (!prev || line.qty > prev.qty) netByItem.set(line.stockItemId, line);
  }

  return list.map((item) => {
    if (!item || item.type === "section") return item;
    const stockItemId = normalizeId(item.stockItemId);
    if (!stockItemId) return item;

    const issued = netByItem.get(stockItemId);
    const lineWh = normalizeId(item.warehouseId);
    const warehouseId = issued?.warehouseId ?? lineWh;
    if (!warehouseId) return item;

    return {
      ...item,
      warehouseId,
      warehouseName: warehouseNames.get(warehouseId) || item.warehouseName,
    };
  });
}

/** Remove prior Tax Invoice movement rows for one stock item on this invoice. */
async function clearInvoiceItemMovements(
  tx: Tx,
  companyId: number,
  invoiceId: number,
  stockItemId: number,
): Promise<void> {
  await tx.delete(stockMovementsTable).where(and(
    eq(stockMovementsTable.companyId, companyId),
    eq(stockMovementsTable.referenceId, invoiceId),
    eq(stockMovementsTable.stockItemId, stockItemId),
    or(
      eq(stockMovementsTable.referenceType, "invoice"),
      eq(stockMovementsTable.referenceType, "invoice_reversal"),
      eq(stockMovementsTable.transactionType, "tax_invoice"),
    ),
  ));
}

/**
 * Write/replace the single canonical Tax Invoice movement for this line.
 * quantity_out always stores the absolute invoice qty (not a delta).
 */
async function upsertTaxInvoiceMovement(
  tx: Tx,
  params: {
    companyId: number;
    invoiceId: number;
    invNumber: string;
    warehouseId: number;
    stockItemId: number;
    quantityOut: number;
    balance: number;
    userId?: number;
    username?: string;
  },
): Promise<void> {
  await clearInvoiceItemMovements(tx, params.companyId, params.invoiceId, params.stockItemId);

  if (params.quantityOut <= 0.0005) return;

  await tx.insert(stockMovementsTable).values({
    companyId: params.companyId,
    warehouseId: params.warehouseId,
    stockItemId: params.stockItemId,
    transactionType: "tax_invoice",
    documentNumber: params.invNumber,
    referenceType: "invoice",
    referenceId: params.invoiceId,
    quantityIn: "0",
    quantityOut: String(params.quantityOut),
    balance: String(params.balance),
    reference: `Tax Invoice ${params.invNumber}`,
    userId: params.userId ?? null,
    username: params.username ?? null,
    movementDate: new Date(),
  });
}

/**
 * TAX INVOICE STOCK
 * -----------------
 * - Create: reduce warehouse by qty, write one tax_invoice movement (qty_out = invoice qty)
 * - Edit same WH: apply only the delta to warehouse_stock, rewrite movement qty_out to absolute qty
 * - Edit WH change: reverse old WH fully, apply new WH fully, rewrite movement
 * - Same qty again: no-op on warehouse; ensure movement shows absolute qty
 */
async function syncInvoiceStockInTx(
  tx: Tx,
  params: {
    companyId: number;
    invoiceId: number;
    invNumber: string;
    items: InvoiceLineItem[];
    userId?: number;
    username?: string;
  },
): Promise<InvoiceStockApplyResult> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(${params.companyId}, ${params.invoiceId})`);

  const desiredLines = await collectDesiredLines(tx, params.companyId, params.items);
  const netMap = await loadInvoiceNetDeducted(tx, params.companyId, params.invoiceId);

  const previouslyApplied: StockLine[] = [];
  for (const line of netMap.values()) {
    if (line.qty > 0.0005) previouslyApplied.push({ ...line });
  }

  const previousByItem = new Map<number, StockLine[]>();
  for (const line of previouslyApplied) {
    const list = previousByItem.get(line.stockItemId) ?? [];
    list.push(line);
    previousByItem.set(line.stockItemId, list);
  }

  const desiredByItem = new Map<number, StockLine>();
  for (const desired of desiredLines) {
    const existing = desiredByItem.get(desired.stockItemId);
    if (existing) {
      if (existing.warehouseId !== desired.warehouseId) {
        throw new Error(
          `Keep a single warehouse per stock item on ${params.invNumber}.`,
        );
      }
      existing.qty += desired.qty;
    } else {
      desiredByItem.set(desired.stockItemId, { ...desired });
    }
  }

  const stockIntent = (params.items || []).some((item) => {
    if (!item || item.type === "section") return false;
    const sid = normalizeId(item.stockItemId);
    const qty = Number(item.qty) || 0;
    return !!sid && qty > 0;
  });
  if (stockIntent && desiredByItem.size === 0) {
    throw new Error(
      `No warehouse stock lines to issue on ${params.invNumber}. `
      + `Pick each stock item with the cube icon and select a warehouse.`,
    );
  }

  console.log("[TAX INVOICE SAVE]", JSON.stringify({
    invoiceId: params.invoiceId,
    invNumber: params.invNumber,
    step: "upsert_tax_invoice_movement",
    desired: Array.from(desiredByItem.values()),
    previouslyApplied,
  }));

  const result: InvoiceStockApplyResult = {
    reducedThisSave: [],
    putBackThisSave: [],
    alreadyIssued: [],
  };

  const stockItemIds = new Set<number>([
    ...desiredByItem.keys(),
    ...previousByItem.keys(),
  ]);

  for (const stockItemId of stockItemIds) {
    const desired = desiredByItem.get(stockItemId);
    const previousList = previousByItem.get(stockItemId) ?? [];
    const previousTotal = previousList.reduce((s, l) => s + l.qty, 0);
    const previousPrimary = previousList
      .slice()
      .sort((a, b) => b.qty - a.qty)[0];

    // Line removed from invoice → reverse all previous nets for this item.
    if (!desired) {
      for (const prev of previousList) {
        if (prev.qty <= 0.0005) continue;
        const prevWh = await assertWarehouse(tx, params.companyId, prev.warehouseId);
        await adjustWarehouseQuantity(tx, {
          companyId: params.companyId,
          warehouseId: prev.warehouseId,
          stockItemId,
          quantityIn: prev.qty,
        });
        result.putBackThisSave.push({
          warehouseId: prev.warehouseId,
          warehouseName: prevWh.name,
          stockItemId,
          quantity: prev.qty,
        });
      }
      await clearInvoiceItemMovements(tx, params.companyId, params.invoiceId, stockItemId);
      continue;
    }

    const wh = await assertWarehouse(tx, params.companyId, desired.warehouseId);
    const warehouseChanged =
      !!previousPrimary
      && previousPrimary.warehouseId !== desired.warehouseId;

    if (warehouseChanged) {
      for (const prev of previousList) {
        if (prev.qty <= 0.0005) continue;
        const prevWh = await assertWarehouse(tx, params.companyId, prev.warehouseId);
        await adjustWarehouseQuantity(tx, {
          companyId: params.companyId,
          warehouseId: prev.warehouseId,
          stockItemId,
          quantityIn: prev.qty,
        });
        result.putBackThisSave.push({
          warehouseId: prev.warehouseId,
          warehouseName: prevWh.name,
          stockItemId,
          quantity: prev.qty,
        });
      }

      const before = await getWarehouseBalance(tx, desired.warehouseId, stockItemId);
      if (desired.qty > before) {
        throw new Error(
          `Insufficient stock in ${wh.name}. Available: ${before}, requested: ${desired.qty}`,
        );
      }
      const after = await adjustWarehouseQuantity(tx, {
        companyId: params.companyId,
        warehouseId: desired.warehouseId,
        stockItemId,
        quantityOut: desired.qty,
      });
      await upsertTaxInvoiceMovement(tx, {
        companyId: params.companyId,
        invoiceId: params.invoiceId,
        invNumber: params.invNumber,
        warehouseId: desired.warehouseId,
        stockItemId,
        quantityOut: desired.qty,
        balance: after,
        userId: params.userId,
        username: params.username,
      });
      result.reducedThisSave.push({
        warehouseId: desired.warehouseId,
        warehouseName: wh.name,
        stockItemId,
        quantity: desired.qty,
      });
      continue;
    }

    // Same warehouse: apply quantity difference only.
    const currentQty = previousTotal;
    const adjustment = desired.qty - currentQty;

    if (Math.abs(adjustment) < 0.0005) {
      const balance = await getWarehouseBalance(tx, desired.warehouseId, stockItemId);
      await upsertTaxInvoiceMovement(tx, {
        companyId: params.companyId,
        invoiceId: params.invoiceId,
        invNumber: params.invNumber,
        warehouseId: desired.warehouseId,
        stockItemId,
        quantityOut: desired.qty,
        balance,
        userId: params.userId,
        username: params.username,
      });
      result.alreadyIssued.push({
        warehouseId: desired.warehouseId,
        stockItemId,
        quantity: currentQty,
      });
      continue;
    }

    const before = await getWarehouseBalance(tx, desired.warehouseId, stockItemId);

    if (adjustment > 0) {
      if (adjustment > before) {
        const [item] = await tx
          .select({ code: stockItemsTable.code, name: stockItemsTable.name })
          .from(stockItemsTable)
          .where(and(
            eq(stockItemsTable.id, stockItemId),
            eq(stockItemsTable.companyId, params.companyId),
          ));
        throw new Error(
          `Insufficient stock for ${item?.code ?? item?.name ?? "item"} in ${wh.name}. `
          + `Available: ${before}, requested: ${adjustment}`,
        );
      }

      inventoryLog({
        transactionType: "tax_invoice",
        transactionId: params.invoiceId,
        warehouseId: desired.warehouseId,
        stockItemId,
        quantity: adjustment,
        movementType: "OUT",
        previouslyAppliedQty: currentQty,
        invoiceQty: desired.qty,
      });

      const after = await adjustWarehouseQuantity(tx, {
        companyId: params.companyId,
        warehouseId: desired.warehouseId,
        stockItemId,
        quantityOut: adjustment,
      });

      await upsertTaxInvoiceMovement(tx, {
        companyId: params.companyId,
        invoiceId: params.invoiceId,
        invNumber: params.invNumber,
        warehouseId: desired.warehouseId,
        stockItemId,
        quantityOut: desired.qty,
        balance: after,
        userId: params.userId,
        username: params.username,
      });

      result.reducedThisSave.push({
        warehouseId: desired.warehouseId,
        warehouseName: wh.name,
        stockItemId,
        quantity: adjustment,
      });
    } else {
      const putBack = -adjustment;
      inventoryLog({
        transactionType: "tax_invoice",
        transactionId: params.invoiceId,
        warehouseId: desired.warehouseId,
        stockItemId,
        quantity: putBack,
        movementType: "PUT_BACK_SAME_WAREHOUSE",
        previouslyAppliedQty: currentQty,
        invoiceQty: desired.qty,
      });

      const after = await adjustWarehouseQuantity(tx, {
        companyId: params.companyId,
        warehouseId: desired.warehouseId,
        stockItemId,
        quantityIn: putBack,
      });

      await upsertTaxInvoiceMovement(tx, {
        companyId: params.companyId,
        invoiceId: params.invoiceId,
        invNumber: params.invNumber,
        warehouseId: desired.warehouseId,
        stockItemId,
        quantityOut: desired.qty,
        balance: after,
        userId: params.userId,
        username: params.username,
      });

      result.putBackThisSave.push({
        warehouseId: desired.warehouseId,
        warehouseName: wh.name,
        stockItemId,
        quantity: putBack,
      });
    }
  }

  const finalNet = await loadInvoiceNetDeducted(tx, params.companyId, params.invoiceId);
  let matchedIssued = 0;
  for (const desired of desiredByItem.values()) {
    const key = lineKey(desired.warehouseId, desired.stockItemId);
    matchedIssued += Math.max(0, finalNet.get(key)?.qty ?? 0);
  }
  const desiredTotal = Array.from(desiredByItem.values()).reduce((s, l) => s + l.qty, 0);
  if (Math.abs(desiredTotal - matchedIssued) > 0.0005) {
    throw new Error(
      `Stock must match invoice qty on ${params.invNumber}: invoice ${desiredTotal}, stock issued ${matchedIssued}.`,
    );
  }

  return result;
}

export async function syncInvoiceStock(
  params: {
    companyId: number;
    invoiceId: number;
    invNumber: string;
    items: InvoiceLineItem[];
    userId?: number;
    username?: string;
  },
  tx?: Tx,
): Promise<InvoiceStockApplyResult> {
  if (tx) {
    return syncInvoiceStockInTx(tx, params);
  }
  return db.transaction(async (inner) => {
    return syncInvoiceStockInTx(inner, params);
  });
}

export async function invoiceStockAlreadyDeducted(companyId: number, invoiceId: number): Promise<boolean> {
  const net = await loadInvoiceNetDeducted(db, companyId, invoiceId);
  return Array.from(net.values()).some((l) => l.qty > 0.0005);
}

export async function deductInvoiceStock(
  params: {
    companyId: number;
    invoiceId: number;
    invNumber: string;
    items: InvoiceLineItem[];
    userId?: number;
    username?: string;
  },
  tx?: Tx,
): Promise<InvoiceStockApplyResult> {
  return syncInvoiceStock(params, tx);
}

async function restoreInvoiceStockInTx(
  tx: Tx,
  params: {
    companyId: number;
    invoiceId: number;
    invNumber: string;
    userId?: number;
    username?: string;
  },
): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(${params.companyId}, ${params.invoiceId})`);

  const netMap = await loadInvoiceNetDeducted(tx, params.companyId, params.invoiceId);
  for (const source of netMap.values()) {
    if (source.qty <= 0) continue;

    inventoryLog({
      transactionType: "invoice_void",
      transactionId: params.invoiceId,
      warehouseId: source.warehouseId,
      stockItemId: source.stockItemId,
      quantity: source.qty,
      movementType: "IN",
    });

    await adjustWarehouseQuantity(tx, {
      companyId: params.companyId,
      warehouseId: source.warehouseId,
      stockItemId: source.stockItemId,
      quantityIn: source.qty,
    });
  }

  // Remove Tax Invoice movement rows so Stock Transfer history no longer shows this invoice.
  await tx.delete(stockMovementsTable).where(and(
    eq(stockMovementsTable.companyId, params.companyId),
    eq(stockMovementsTable.referenceId, params.invoiceId),
    or(
      eq(stockMovementsTable.referenceType, "invoice"),
      eq(stockMovementsTable.referenceType, "invoice_reversal"),
      eq(stockMovementsTable.referenceType, "invoice_void"),
      eq(stockMovementsTable.transactionType, "tax_invoice"),
    ),
  ));
}

export async function restoreInvoiceStock(
  params: {
    companyId: number;
    invoiceId: number;
    invNumber: string;
    userId?: number;
    username?: string;
  },
  tx?: Tx,
): Promise<void> {
  if (tx) {
    await restoreInvoiceStockInTx(tx, params);
    return;
  }
  await db.transaction(async (inner) => {
    await restoreInvoiceStockInTx(inner, params);
  });
}

export async function assertInvoiceWarehouseBalance(
  tx: Tx,
  warehouseId: number,
  stockItemId: number,
): Promise<number> {
  return getWarehouseBalance(tx, warehouseId, stockItemId);
}
