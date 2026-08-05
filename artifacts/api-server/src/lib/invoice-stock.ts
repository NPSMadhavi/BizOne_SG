import {
  db,
  stockItemsTable,
  stockMovementsTable,
  warehouseStockTable,
  warehousesTable,
} from "@workspace/db";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import {
  applyMovement,
  ensureDefaultWarehouse,
  getItemTotalStock,
  getWarehouseBalance,
} from "./inventory-service.js";

type InvoiceLineItem = {
  type?: string;
  partNumber?: string;
  stockItemId?: number;
  isStockItem?: boolean;
  qty?: number;
  selectedSerials?: string[];
  isFoc?: boolean;
  warehouseId?: number;
};

type StockDeductionLine = {
  stockItemId: number;
  warehouseId?: number;
  qty: number;
};

function toQty(value: string | number | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function cleanPartNumber(raw: unknown): string {
  return String(raw ?? "").replace(/<[^>]*>/g, "").trim();
}

function normalizeCode(value: string): string {
  return value.trim().replace(/\s+/g, "").toLowerCase();
}

async function resolveStockItemId(
  companyId: number,
  item: InvoiceLineItem,
): Promise<number | null> {
  if (item.stockItemId) {
    const [row] = await db
      .select({ id: stockItemsTable.id, type: stockItemsTable.type })
      .from(stockItemsTable)
      .where(and(eq(stockItemsTable.companyId, companyId), eq(stockItemsTable.id, item.stockItemId)));
    if (!row || row.type === "service") return null;
    return row.id;
  }

  const partNumber = cleanPartNumber(item.partNumber);
  if (!partNumber) return null;

  const [exact] = await db
    .select({ id: stockItemsTable.id, type: stockItemsTable.type })
    .from(stockItemsTable)
    .where(and(eq(stockItemsTable.companyId, companyId), ilike(stockItemsTable.code, partNumber)))
    .limit(1);
  if (exact) return exact.type === "service" ? null : exact.id;

  const normalizedPart = normalizeCode(partNumber);
  const items = await db
    .select({ id: stockItemsTable.id, code: stockItemsTable.code, type: stockItemsTable.type })
    .from(stockItemsTable)
    .where(eq(stockItemsTable.companyId, companyId));

  const match = items.find((row) => row.type !== "service" && normalizeCode(row.code) === normalizedPart);
  return match?.id ?? null;
}

async function bootstrapWarehouseStockIfNeeded(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  companyId: number,
  warehouseId: number,
  stockItemId: number,
): Promise<void> {
  const warehouseTotal = await getItemTotalStock(tx, companyId, stockItemId);
  if (warehouseTotal > 0) return;

  const [item] = await tx
    .select({ stockQty: stockItemsTable.stockQty })
    .from(stockItemsTable)
    .where(and(eq(stockItemsTable.id, stockItemId), eq(stockItemsTable.companyId, companyId)));
  const legacyQty = toQty(item?.stockQty);
  if (legacyQty <= 0) return;

  await applyMovement(tx, {
    companyId,
    warehouseId,
    stockItemId,
    transactionType: "opening_stock",
    documentNumber: `BOOT-${stockItemId}`,
    referenceType: "stock_bootstrap",
    referenceId: stockItemId,
    quantityIn: legacyQty,
    reference: "Synced from stock item quantity",
  });
}

async function collectInvoiceStockLines(
  companyId: number,
  items: InvoiceLineItem[],
): Promise<StockDeductionLine[]> {
  const lines = new Map<string, StockDeductionLine>();

  for (const item of items) {
    if (item.type === "section" || item.isFoc) continue;

    const qty = Number(item.qty) || 0;
    if (qty <= 0) continue;

    const stockItemId = await resolveStockItemId(companyId, item);
    const partNumber = cleanPartNumber(item.partNumber);

    if (!stockItemId) {
      if (item.isStockItem || item.stockItemId) {
        throw new Error(`Stock item not found for part number "${partNumber || "unknown"}". Pick the item from stock using the cube icon.`);
      }
      if (partNumber) {
        const [maybe] = await db
          .select({ id: stockItemsTable.id })
          .from(stockItemsTable)
          .where(and(eq(stockItemsTable.companyId, companyId), ilike(stockItemsTable.code, partNumber)))
          .limit(1);
        if (maybe) {
          throw new Error(`Could not link invoice line "${partNumber}" to stock. Re-select the item using the cube icon.`);
        }
      }
      continue;
    }

    const warehouseId = item.warehouseId;
    const key = `${stockItemId}:${warehouseId ?? "auto"}`;
    const existing = lines.get(key);
    if (existing) {
      existing.qty += qty;
    } else {
      lines.set(key, { stockItemId, warehouseId, qty });
    }
  }

  return Array.from(lines.values());
}

async function deductQtyFromWarehouses(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  params: {
    companyId: number;
    stockItemId: number;
    qty: number;
    invoiceId: number;
    invNumber: string;
    warehouseId?: number;
    userId?: number;
    username?: string;
  },
): Promise<void> {
  const defaultWarehouseId = await ensureDefaultWarehouse(params.companyId);

  if (params.warehouseId) {
    await bootstrapWarehouseStockIfNeeded(tx, params.companyId, params.warehouseId, params.stockItemId);
    const available = await getWarehouseBalance(tx, params.warehouseId, params.stockItemId);
    if (params.qty > available) {
      const [item] = await tx
        .select({ code: stockItemsTable.code })
        .from(stockItemsTable)
        .where(and(eq(stockItemsTable.id, params.stockItemId), eq(stockItemsTable.companyId, params.companyId)));
      const [wh] = await tx
        .select({ name: warehousesTable.name })
        .from(warehousesTable)
        .where(and(eq(warehousesTable.id, params.warehouseId), eq(warehousesTable.companyId, params.companyId)));
      throw new Error(
        `Insufficient stock for ${item?.code ?? "item"} in ${wh?.name ?? "warehouse"}. Available: ${available}, requested: ${params.qty}`,
      );
    }

    await applyMovement(tx, {
      companyId: params.companyId,
      warehouseId: params.warehouseId,
      stockItemId: params.stockItemId,
      transactionType: "goods_issue",
      documentNumber: params.invNumber,
      referenceType: "invoice",
      referenceId: params.invoiceId,
      quantityOut: params.qty,
      reference: `Invoice ${params.invNumber}`,
      userId: params.userId,
      username: params.username,
    });
    return;
  }

  await bootstrapWarehouseStockIfNeeded(tx, params.companyId, defaultWarehouseId, params.stockItemId);

  let remaining = params.qty;

  const warehouseRows = await tx
    .select({
      warehouseId: warehouseStockTable.warehouseId,
      quantity: warehouseStockTable.quantity,
    })
    .from(warehouseStockTable)
    .where(and(
      eq(warehouseStockTable.companyId, params.companyId),
      eq(warehouseStockTable.stockItemId, params.stockItemId),
    ))
    .orderBy(desc(warehouseStockTable.quantity));

  for (const row of warehouseRows) {
    if (remaining <= 0) break;
    const available = toQty(row.quantity);
    if (available <= 0) continue;
    const take = Math.min(available, remaining);

    await applyMovement(tx, {
      companyId: params.companyId,
      warehouseId: row.warehouseId,
      stockItemId: params.stockItemId,
      transactionType: "goods_issue",
      documentNumber: params.invNumber,
      referenceType: "invoice",
      referenceId: params.invoiceId,
      quantityOut: take,
      reference: `Invoice ${params.invNumber}`,
      userId: params.userId,
      username: params.username,
    });

    remaining -= take;
  }

  if (remaining > 0) {
    const total = await getItemTotalStock(tx, params.companyId, params.stockItemId);
    const [item] = await tx
      .select({ code: stockItemsTable.code })
      .from(stockItemsTable)
      .where(and(eq(stockItemsTable.id, params.stockItemId), eq(stockItemsTable.companyId, params.companyId)));
    throw new Error(
      `Insufficient stock for ${item?.code ?? "item"}. Available: ${total}, requested: ${params.qty}`,
    );
  }
}

export async function invoiceStockAlreadyDeducted(companyId: number, invoiceId: number): Promise<boolean> {
  const rows = await db
    .select({ id: stockMovementsTable.id })
    .from(stockMovementsTable)
    .where(and(
      eq(stockMovementsTable.companyId, companyId),
      eq(stockMovementsTable.referenceType, "invoice"),
      eq(stockMovementsTable.referenceId, invoiceId),
      eq(stockMovementsTable.transactionType, "goods_issue"),
    ))
    .limit(1);
  return rows.length > 0;
}

/** Replace invoice stock deductions to match current line items. */
export async function syncInvoiceStock(params: {
  companyId: number;
  invoiceId: number;
  invNumber: string;
  items: InvoiceLineItem[];
  userId?: number;
  username?: string;
}): Promise<void> {
  const lines = await collectInvoiceStockLines(params.companyId, params.items);

  await db.transaction(async (tx) => {
    const existingMovements = await tx
      .select()
      .from(stockMovementsTable)
      .where(and(
        eq(stockMovementsTable.companyId, params.companyId),
        or(
          and(
            eq(stockMovementsTable.referenceType, "invoice"),
            eq(stockMovementsTable.referenceId, params.invoiceId),
          ),
          and(
            eq(stockMovementsTable.referenceType, "invoice_reversal"),
            eq(stockMovementsTable.referenceId, params.invoiceId),
          )
        )
      ));

    const netDeductedMap = new Map<string, { warehouseId: number; stockItemId: number; qty: number }>();
    for (const m of existingMovements) {
      const key = `${m.warehouseId}:${m.stockItemId}`;
      const qtyOut = toQty(m.quantityOut);
      const qtyIn = toQty(m.quantityIn);
      const net = qtyOut - qtyIn;
      const cur = netDeductedMap.get(key) || { warehouseId: m.warehouseId, stockItemId: m.stockItemId, qty: 0 };
      cur.qty += net;
      netDeductedMap.set(key, cur);
    }

    for (const entry of netDeductedMap.values()) {
      if (entry.qty <= 0) continue;
      await applyMovement(tx, {
        companyId: params.companyId,
        warehouseId: entry.warehouseId,
        stockItemId: entry.stockItemId,
        transactionType: "adjustment_in",
        documentNumber: params.invNumber,
        referenceType: "invoice_reversal",
        referenceId: params.invoiceId,
        quantityIn: entry.qty,
        reference: `Reversed before updating invoice ${params.invNumber}`,
        userId: params.userId,
        username: params.username,
      });
    }

    await tx.delete(stockMovementsTable).where(and(
      eq(stockMovementsTable.companyId, params.companyId),
      or(
        and(
          eq(stockMovementsTable.referenceType, "invoice"),
          eq(stockMovementsTable.referenceId, params.invoiceId),
        ),
        and(
          eq(stockMovementsTable.referenceType, "invoice_reversal"),
          eq(stockMovementsTable.referenceId, params.invoiceId),
        )
      )
    ));

    for (const line of lines) {
      await deductQtyFromWarehouses(tx, {
        companyId: params.companyId,
        stockItemId: line.stockItemId,
        qty: line.qty,
        warehouseId: line.warehouseId,
        invoiceId: params.invoiceId,
        invNumber: params.invNumber,
        userId: params.userId,
        username: params.username,
      });
    }
  });
}

export async function deductInvoiceStock(params: {
  companyId: number;
  invoiceId: number;
  invNumber: string;
  items: InvoiceLineItem[];
  userId?: number;
  username?: string;
}): Promise<void> {
  if (await invoiceStockAlreadyDeducted(params.companyId, params.invoiceId)) return;
  await syncInvoiceStock(params);
}

export async function restoreInvoiceStock(params: {
  companyId: number;
  invoiceId: number;
  invNumber: string;
  userId?: number;
  username?: string;
}): Promise<void> {
  const movements = await db
    .select()
    .from(stockMovementsTable)
    .where(and(
      eq(stockMovementsTable.companyId, params.companyId),
      eq(stockMovementsTable.referenceType, "invoice"),
      eq(stockMovementsTable.referenceId, params.invoiceId),
      eq(stockMovementsTable.transactionType, "goods_issue"),
    ));

  if (movements.length === 0) return;

  await db.transaction(async (tx) => {
    for (const movement of movements) {
      const qtyOut = toQty(movement.quantityOut);
      if (qtyOut <= 0) continue;

      await applyMovement(tx, {
        companyId: params.companyId,
        warehouseId: movement.warehouseId,
        stockItemId: movement.stockItemId,
        transactionType: "adjustment_in",
        documentNumber: params.invNumber,
        referenceType: "invoice_void",
        referenceId: params.invoiceId,
        quantityIn: qtyOut,
        reference: `Restored from invoice ${params.invNumber}`,
        userId: params.userId,
        username: params.username,
      });
    }
  });
}
