/**
 * Debit Note (vendor return) → warehouse STOCK OUT.
 * Confirmed DN reduces Purchase Qty in stock reports (not Adjust).
 */

import {
  db,
  stockItemsTable,
  stockMovementsTable,
  warehouseStockTable,
} from "@workspace/db";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import {
  syncDocumentWarehouseStock,
  type DocumentStockLine,
} from "./document-stock-sync.js";
import { resolveWarehouseId } from "./inventory-service.js";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

type DnLine = {
  type?: string;
  partNumber?: string;
  stockItemId?: number | null;
  warehouseId?: number | null;
  qty?: number;
};

function toQty(value: string | number | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function normalizeId(raw: unknown): number | undefined {
  if (raw == null || raw === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function cleanPartNumber(raw: unknown): string {
  return String(raw ?? "").replace(/<[^>]*>/g, "").trim();
}

function lineKey(warehouseId: number, stockItemId: number): string {
  return `${warehouseId}:${stockItemId}`;
}

async function resolveStockItemId(
  tx: Tx,
  companyId: number,
  item: DnLine,
): Promise<number | undefined> {
  const direct = normalizeId(item.stockItemId);
  if (direct) {
    const [row] = await tx
      .select({ id: stockItemsTable.id, type: stockItemsTable.type })
      .from(stockItemsTable)
      .where(and(eq(stockItemsTable.companyId, companyId), eq(stockItemsTable.id, direct)));
    if (row && row.type !== "service" && row.type !== "service_item") return row.id;
    return undefined;
  }

  const code = cleanPartNumber(item.partNumber);
  if (!code) return undefined;
  const [row] = await tx
    .select({ id: stockItemsTable.id, type: stockItemsTable.type })
    .from(stockItemsTable)
    .where(and(
      eq(stockItemsTable.companyId, companyId),
      ilike(stockItemsTable.code, code),
    ))
    .limit(1);
  if (row && row.type !== "service" && row.type !== "service_item") return row.id;
  return undefined;
}

async function resolveLineWarehouse(
  tx: Tx,
  companyId: number,
  stockItemId: number,
  item: DnLine,
): Promise<number | undefined> {
  const direct = normalizeId(item.warehouseId);
  if (direct) return direct;

  const [withStock] = await tx
    .select({
      warehouseId: warehouseStockTable.warehouseId,
      quantity: warehouseStockTable.quantity,
    })
    .from(warehouseStockTable)
    .where(and(
      eq(warehouseStockTable.companyId, companyId),
      eq(warehouseStockTable.stockItemId, stockItemId),
      sql`${warehouseStockTable.quantity}::numeric > 0`,
    ))
    .orderBy(desc(sql`${warehouseStockTable.quantity}::numeric`))
    .limit(1);
  if (withStock?.warehouseId) return withStock.warehouseId;

  return (await resolveWarehouseId(companyId)) || undefined;
}

export async function loadDebitNoteNetReturned(
  tx: Tx | typeof db,
  companyId: number,
  debitNoteId: number,
): Promise<DocumentStockLine[]> {
  const movements = await tx
    .select()
    .from(stockMovementsTable)
    .where(and(
      eq(stockMovementsTable.companyId, companyId),
      eq(stockMovementsTable.referenceId, debitNoteId),
      or(
        eq(stockMovementsTable.referenceType, "debit_note"),
        eq(stockMovementsTable.referenceType, "debit_note_reversal"),
      ),
    ));

  const net = new Map<string, DocumentStockLine>();
  for (const m of movements) {
    const warehouseId = Number(m.warehouseId);
    const stockItemId = Number(m.stockItemId);
    if (!warehouseId || !stockItemId) continue;
    // Outbound purchase return: quantity_out increases returned qty
    const delta = toQty(m.quantityOut) - toQty(m.quantityIn);
    const key = lineKey(warehouseId, stockItemId);
    const existing = net.get(key);
    if (existing) existing.qty += delta;
    else net.set(key, { warehouseId, stockItemId, qty: delta });
  }

  return Array.from(net.values())
    .map((l) => ({ ...l, qty: Math.max(0, l.qty) }))
    .filter((l) => l.qty > 0.0005);
}

async function collectDesiredLines(
  tx: Tx,
  companyId: number,
  items: DnLine[],
): Promise<DocumentStockLine[]> {
  const map = new Map<string, DocumentStockLine>();

  for (const item of items || []) {
    if (item?.type === "section") continue;
    const qty = toQty(item.qty);
    if (qty <= 0) continue;

    const stockItemId = await resolveStockItemId(tx, companyId, item);
    if (!stockItemId) continue;

    const warehouseId = await resolveLineWarehouse(tx, companyId, stockItemId, item);
    if (!warehouseId) {
      throw new Error(
        `Warehouse is required to return stock for "${cleanPartNumber(item.partNumber) || "item"}".`,
      );
    }

    const key = lineKey(warehouseId, stockItemId);
    const existing = map.get(key);
    if (existing) existing.qty += qty;
    else map.set(key, { warehouseId, stockItemId, qty });
  }

  return Array.from(map.values());
}

export async function syncDebitNoteStock(params: {
  companyId: number;
  debitNoteId: number;
  dnNumber: string;
  items: DnLine[];
  userId?: number;
  username?: string;
  /** Document / issue date so Stock Summary date filters pick up the return. */
  issueDate?: string | null;
}): Promise<void> {
  const movementDate = params.issueDate && /^\d{4}-\d{2}-\d{2}/.test(params.issueDate)
    ? new Date(`${params.issueDate.slice(0, 10)}T12:00:00`)
    : undefined;

  await db.transaction(async (tx) => {
    const desiredLines = await collectDesiredLines(tx, params.companyId, params.items);
    const previouslyApplied = await loadDebitNoteNetReturned(
      tx,
      params.companyId,
      params.debitNoteId,
    );

    const hasQtyLines = (params.items || []).some((it) => {
      if (it?.type === "section") return false;
      return toQty(it.qty) > 0;
    });
    if (desiredLines.length === 0 && previouslyApplied.length === 0) {
      if (hasQtyLines) {
        throw new Error(
          "Could not update stock for debit note — select Item Master part numbers on each line.",
        );
      }
      return;
    }

    await syncDocumentWarehouseStock(tx, {
      companyId: params.companyId,
      direction: "out",
      documentKind: "debit_note",
      documentId: params.debitNoteId,
      documentNumber: params.dnNumber,
      desiredLines,
      previouslyApplied,
      allowWarehouseRemap: true,
      reference: `Debit Note ${params.dnNumber}`,
      userId: params.userId,
      username: params.username,
      applyReferenceType: "debit_note",
      reverseReferenceType: "debit_note_reversal",
      applyOutTransactionType: "purchase_return",
      reverseInTransactionType: "goods_receipt",
      movementDate,
    });
  });
}

export async function reverseDebitNoteStock(params: {
  companyId: number;
  debitNoteId: number;
  dnNumber: string;
  userId?: number;
  username?: string;
}): Promise<void> {
  await db.transaction(async (tx) => {
    const previouslyApplied = await loadDebitNoteNetReturned(
      tx,
      params.companyId,
      params.debitNoteId,
    );
    if (previouslyApplied.length === 0) return;

    await syncDocumentWarehouseStock(tx, {
      companyId: params.companyId,
      direction: "out",
      documentKind: "debit_note",
      documentId: params.debitNoteId,
      documentNumber: params.dnNumber,
      desiredLines: [],
      previouslyApplied,
      allowWarehouseRemap: true,
      reference: `Debit Note ${params.dnNumber} voided`,
      userId: params.userId,
      username: params.username,
      applyReferenceType: "debit_note",
      reverseReferenceType: "debit_note_reversal",
      applyOutTransactionType: "purchase_return",
      reverseInTransactionType: "goods_receipt",
    });
  });
}
