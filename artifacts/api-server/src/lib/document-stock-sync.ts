/**
 * SHARED DOCUMENT → WAREHOUSE STOCK SYNC
 * --------------------------------------
 * Root-cause fix for the "Tax Invoice / Purchase Order looks like Stock Transfer" bug.
 *
 * Inventory is ALWAYS addressed by (warehouseId + stockItemId).
 *
 * PURCHASE / GOODS RECEIPT (direction: "in"):
 *   ONE warehouse, STOCK IN (+qty). Never reduces another warehouse.
 *
 * TAX INVOICE (direction: "out"):
 *   ONE warehouse, STOCK OUT (−qty). Never increases another warehouse
 *   except:
 *     - same-warehouse qty reduction put-back
 *     - explicit warehouse remap on the document line (TEST 7)
 *
 * STOCK TRANSFER is a separate API and must NOT be used here.
 *
 * The previous bug used keyed delta sync over union(oldKeys, newKeys):
 *   when warehouse A → B, it reversed A and posted B in one save
 *   (= transfer lookalike). That pattern is gone.
 */

import { applyMovement, getWarehouseBalance, type MovementType } from "./inventory-service.js";
import { db, stockItemsTable, warehousesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type DocumentStockDirection = "in" | "out";

export type DocumentStockLine = {
  warehouseId: number;
  stockItemId: number;
  qty: number;
};

export type AppliedStockLine = DocumentStockLine;

function toQty(value: string | number | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function lineKey(warehouseId: number, stockItemId: number): string {
  return `${warehouseId}:${stockItemId}`;
}

function inventoryLog(_payload: Record<string, unknown>): void {
  // Debug logging removed
}

function aggregateByWarehouseItem(lines: DocumentStockLine[]): Map<string, DocumentStockLine> {
  const map = new Map<string, DocumentStockLine>();
  for (const line of lines) {
    const warehouseId = Number(line.warehouseId);
    const stockItemId = Number(line.stockItemId);
    const qty = toQty(line.qty);
    if (!warehouseId || !stockItemId || qty <= 0) continue;
    const key = lineKey(warehouseId, stockItemId);
    const existing = map.get(key);
    if (existing) existing.qty += qty;
    else map.set(key, { warehouseId, stockItemId, qty });
  }
  return map;
}

function groupByStockItem(map: Map<string, DocumentStockLine>): Map<number, DocumentStockLine[]> {
  const byItem = new Map<number, DocumentStockLine[]>();
  for (const line of map.values()) {
    const list = byItem.get(line.stockItemId) ?? [];
    list.push(line);
    byItem.set(line.stockItemId, list);
  }
  return byItem;
}

async function applyIn(
  tx: Tx,
  params: {
    companyId: number;
    warehouseId: number;
    stockItemId: number;
    qty: number;
    documentNumber: string;
    referenceType: string;
    referenceId: number;
    reference?: string;
    userId?: number;
    username?: string;
    transactionType?: MovementType;
  },
): Promise<void> {
  if (params.qty <= 0) return;
  inventoryLog({
    transactionType: params.referenceType,
    transactionId: params.referenceId,
    warehouseId: params.warehouseId,
    stockItemId: params.stockItemId,
    quantity: params.qty,
    movementType: "IN",
  });
  await applyMovement(tx, {
    companyId: params.companyId,
    warehouseId: params.warehouseId,
    stockItemId: params.stockItemId,
    transactionType: params.transactionType ?? "goods_receipt",
    documentNumber: params.documentNumber,
    referenceType: params.referenceType,
    referenceId: params.referenceId,
    quantityIn: params.qty,
    reference: params.reference,
    userId: params.userId,
    username: params.username,
  });
}

async function applyOut(
  tx: Tx,
  params: {
    companyId: number;
    warehouseId: number;
    stockItemId: number;
    qty: number;
    documentNumber: string;
    referenceType: string;
    referenceId: number;
    reference?: string;
    userId?: number;
    username?: string;
    transactionType?: MovementType;
    allowNegative?: boolean;
  },
): Promise<void> {
  if (params.qty <= 0) return;
  const available = await getWarehouseBalance(tx, params.warehouseId, params.stockItemId);
  if (!params.allowNegative && params.qty > available) {
    const [wh] = await tx.select({ name: warehousesTable.name }).from(warehousesTable).where(eq(warehousesTable.id, params.warehouseId)).limit(1);
    const [item] = await tx.select({ code: stockItemsTable.code, name: stockItemsTable.name }).from(stockItemsTable).where(eq(stockItemsTable.id, params.stockItemId)).limit(1);
    const whName = wh?.name ? `"${wh.name}"` : `warehouse #${params.warehouseId}`;
    const itemLabel = item ? `${item.name} (${item.code})` : `item #${params.stockItemId}`;
    throw new Error(
      `Insufficient stock for ${itemLabel} in ${whName}. Available: ${available}, requested: ${params.qty}`,
    );
  }
  inventoryLog({
    transactionType: params.referenceType,
    transactionId: params.referenceId,
    warehouseId: params.warehouseId,
    stockItemId: params.stockItemId,
    quantity: params.qty,
    movementType: "OUT",
  });
  await applyMovement(tx, {
    companyId: params.companyId,
    warehouseId: params.warehouseId,
    stockItemId: params.stockItemId,
    transactionType: params.transactionType ?? "goods_issue",
    documentNumber: params.documentNumber,
    referenceType: params.referenceType,
    referenceId: params.referenceId,
    quantityOut: params.qty,
    reference: params.reference,
    userId: params.userId,
    username: params.username,
  });
}

export type SyncDocumentStockParams = {
  companyId: number;
  direction: DocumentStockDirection;
  /** Human / log label: purchase_order | invoice | grn */
  documentKind: string;
  documentId: number;
  documentNumber: string;
  /** Desired absolute applied qty per warehouse+item after this sync. */
  desiredLines: DocumentStockLine[];
  /** Net already applied for this document (from stock_movements). */
  previouslyApplied: AppliedStockLine[];
  /**
   * When true (Tax Invoice): if the line warehouse changes, reverse the old
   * warehouse fully and apply on the new warehouse (TEST 7).
   * When false (Purchase Order): warehouse change after posting is rejected —
   * never auto-transfer between warehouses.
   */
  allowWarehouseRemap: boolean;
  reference?: string;
  userId?: number;
  username?: string;
  /** Movement referenceType for the primary apply (e.g. purchase_order / invoice). */
  applyReferenceType: string;
  /** Movement referenceType for reversals / put-backs. */
  reverseReferenceType: string;
  applyInTransactionType?: MovementType;
  applyOutTransactionType?: MovementType;
  reverseInTransactionType?: MovementType;
  reverseOutTransactionType?: MovementType;
};

/**
 * Sync document stock so the net movements for this document match desiredLines.
 *
 * CRITICAL: processing is per stockItemId.
 * - Same warehouse: qty delta only
 * - Clean warehouse change (allowWarehouseRemap): reverse ALL previous WH nets
 *   for the item, then apply full desired qty on the new warehouse
 * - Purchase (allowWarehouseRemap=false): refuse warehouse change
 */
export async function syncDocumentWarehouseStock(
  tx: Tx,
  params: SyncDocumentStockParams,
): Promise<void> {
  const desiredMap = aggregateByWarehouseItem(params.desiredLines);
  const previousMap = aggregateByWarehouseItem(
    params.previouslyApplied.map((l) => ({
      warehouseId: l.warehouseId,
      stockItemId: l.stockItemId,
      qty: Math.max(0, toQty(l.qty)),
    })),
  );

  const desiredByItem = groupByStockItem(desiredMap);
  const previousByItem = groupByStockItem(previousMap);
  const stockItemIds = new Set<number>([
    ...desiredByItem.keys(),
    ...previousByItem.keys(),
  ]);

  for (const stockItemId of stockItemIds) {
    const desiredList = desiredByItem.get(stockItemId) ?? [];
    const previousList = previousByItem.get(stockItemId) ?? [];

    const desiredWhIds = new Set(desiredList.map((l) => l.warehouseId));
    const previousWhIds = new Set(previousList.map((l) => l.warehouseId));

    const shared = [...desiredWhIds].filter((id) => previousWhIds.has(id));
    const onlyPrevious = [...previousWhIds].filter((id) => !desiredWhIds.has(id));
    const onlyDesired = [...desiredWhIds].filter((id) => !previousWhIds.has(id));

    // Explicit warehouse change on the document (e.g. invoice WH1 → WH2):
    // reverse every previous warehouse for this item, then apply desired warehouse(s).
    const isWarehouseChange =
      previousList.length > 0
      && desiredList.length > 0
      && onlyPrevious.length > 0
      && onlyDesired.length > 0
      && shared.length === 0;

    if (isWarehouseChange) {
      if (!params.allowWarehouseRemap) {
        throw new Error(
          `Warehouse cannot be changed after stock was posted for this ${params.documentKind} `
          + `(item #${stockItemId}). Use Stock Transfer to move stock between warehouses.`,
        );
      }
      if (desiredWhIds.size !== 1) {
        throw new Error(
          `Ambiguous warehouse change for item #${stockItemId} on ${params.documentKind}. `
          + `Keep a single warehouse per stock item on the document.`,
        );
      }

      const to = desiredList[0]!;
      inventoryLog({
        event: "warehouse_remap",
        documentKind: params.documentKind,
        transactionId: params.documentId,
        stockItemId,
        fromWarehouseIds: previousList.map((l) => l.warehouseId),
        toWarehouseId: to.warehouseId,
        previousQty: previousList.reduce((s, l) => s + l.qty, 0),
        desiredQty: to.qty,
      });

      // 1) Fully reverse stock on every previously applied warehouse for this item.
      for (const from of previousList) {
        if (from.qty <= 0.0005) continue;
        if (params.direction === "in") {
          await applyOut(tx, {
            companyId: params.companyId,
            warehouseId: from.warehouseId,
            stockItemId,
            qty: from.qty,
            documentNumber: params.documentNumber,
            referenceType: params.reverseReferenceType,
            referenceId: params.documentId,
            reference: params.reference ?? `${params.documentNumber} warehouse change`,
            userId: params.userId,
            username: params.username,
            transactionType: params.reverseOutTransactionType ?? "adjustment_out",
          });
        } else {
          // Invoice OUT → put stock back to the old warehouse, then OUT from new.
          await applyIn(tx, {
            companyId: params.companyId,
            warehouseId: from.warehouseId,
            stockItemId,
            qty: from.qty,
            documentNumber: params.documentNumber,
            referenceType: params.reverseReferenceType,
            referenceId: params.documentId,
            reference: params.reference ?? `${params.documentNumber} warehouse change`,
            userId: params.userId,
            username: params.username,
            transactionType: params.reverseInTransactionType ?? "adjustment_in",
          });
        }
      }

      // 2) Apply full desired qty on the new warehouse only.
      if (params.direction === "in") {
        await applyIn(tx, {
          companyId: params.companyId,
          warehouseId: to.warehouseId,
          stockItemId,
          qty: to.qty,
          documentNumber: params.documentNumber,
          referenceType: params.applyReferenceType,
          referenceId: params.documentId,
          reference: params.reference,
          userId: params.userId,
          username: params.username,
          transactionType: params.applyInTransactionType ?? "goods_receipt",
        });
      } else {
        await applyOut(tx, {
          companyId: params.companyId,
          warehouseId: to.warehouseId,
          stockItemId,
          qty: to.qty,
          documentNumber: params.documentNumber,
          referenceType: params.applyReferenceType,
          referenceId: params.documentId,
          reference: params.reference,
          userId: params.userId,
          username: params.username,
          transactionType: params.applyOutTransactionType ?? "goods_issue",
        });
      }
      continue;
    }

    if (onlyDesired.length > 0 && onlyPrevious.length > 0 && !params.allowWarehouseRemap) {
      throw new Error(
        `Warehouse cannot be changed after stock was posted for this ${params.documentKind} `
        + `(item #${stockItemId}). Use Stock Transfer to move stock between warehouses.`,
      );
    }

    // Same-warehouse qty deltas, pure adds, and pure line removals only.
    const itemStillDesired = desiredList.length > 0;
    const warehouseIds = new Set<number>([...desiredWhIds, ...previousWhIds]);
    for (const warehouseId of warehouseIds) {
      const desiredQty = desiredMap.get(lineKey(warehouseId, stockItemId))?.qty ?? 0;
      const currentQty = previousMap.get(lineKey(warehouseId, stockItemId))?.qty ?? 0;
      const delta = desiredQty - currentQty;
      if (Math.abs(delta) < 0.0005) continue;

      // Leftover net on a non-desired warehouse while item remains elsewhere:
      // only possible with corrupt multi-WH history — never silent put-back.
      if (desiredQty <= 0 && currentQty > 0 && itemStillDesired && !desiredWhIds.has(warehouseId)) {
        inventoryLog({
          event: "orphan_net_skipped",
          documentKind: params.documentKind,
          transactionId: params.documentId,
          warehouseId,
          stockItemId,
          orphanQty: currentQty,
          note: "Corrupt multi-warehouse net; void document to restore. Not auto-balancing.",
        });
        continue;
      }

      const previousBal = await getWarehouseBalance(tx, warehouseId, stockItemId);
      inventoryLog({
        documentKind: params.documentKind,
        transactionId: params.documentId,
        warehouseId,
        stockItemId,
        previousWarehouseQty: previousBal,
        desiredDocumentQty: desiredQty,
        previouslyAppliedQty: currentQty,
        adjustmentQty: delta,
        movementType: params.direction === "in"
          ? (delta > 0 ? "IN" : "OUT")
          : (delta > 0 ? "OUT" : "PUT_BACK_SAME_WAREHOUSE"),
      });

      if (params.direction === "in") {
        if (delta > 0) {
          await applyIn(tx, {
            companyId: params.companyId,
            warehouseId,
            stockItemId,
            qty: delta,
            documentNumber: params.documentNumber,
            referenceType: params.applyReferenceType,
            referenceId: params.documentId,
            reference: params.reference,
            userId: params.userId,
            username: params.username,
            transactionType: params.applyInTransactionType ?? "goods_receipt",
          });
        } else {
          await applyOut(tx, {
            companyId: params.companyId,
            warehouseId,
            stockItemId,
            qty: -delta,
            documentNumber: params.documentNumber,
            referenceType: params.reverseReferenceType,
            referenceId: params.documentId,
            reference: params.reference ?? `${params.documentNumber} qty set to ${desiredQty}`,
            userId: params.userId,
            username: params.username,
            transactionType: params.reverseOutTransactionType ?? "adjustment_out",
          });
        }
      } else {
        if (delta > 0) {
          await applyOut(tx, {
            companyId: params.companyId,
            warehouseId,
            stockItemId,
            qty: delta,
            documentNumber: params.documentNumber,
            referenceType: params.applyReferenceType,
            referenceId: params.documentId,
            reference: params.reference,
            userId: params.userId,
            username: params.username,
            transactionType: params.applyOutTransactionType ?? "goods_issue",
          });
        } else {
          // Same-warehouse invoice qty decrease only (never a different warehouse).
          await applyIn(tx, {
            companyId: params.companyId,
            warehouseId,
            stockItemId,
            qty: -delta,
            documentNumber: params.documentNumber,
            referenceType: params.reverseReferenceType,
            referenceId: params.documentId,
            reference: params.reference ?? `${params.documentNumber} qty reduced (same warehouse)`,
            userId: params.userId,
            username: params.username,
            transactionType: params.reverseInTransactionType ?? "adjustment_in",
          });
        }
      }

      // Safety: Tax Invoice / OUT docs must not increase this warehouse when
      // desired qty is greater than or equal to what was already applied.
      if (params.direction === "out" && desiredQty >= currentQty) {
        const afterBal = await getWarehouseBalance(tx, warehouseId, stockItemId);
        if (afterBal > previousBal + 0.0005) {
          throw new Error(
            `Tax Invoice must reduce stock, not increase it `
            + `(warehouse #${warehouseId}, item #${stockItemId}: ${previousBal} → ${afterBal}).`,
          );
        }
      }
    }
  }
}

export function requireWarehouseId(
  warehouseId: unknown,
  itemLabel: string,
): number {
  const n = Number(warehouseId);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(
      `Warehouse is required for inventory transaction (${itemLabel}). Select a warehouse using the cube icon.`,
    );
  }
  return n;
}
