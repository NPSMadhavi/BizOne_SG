/**
 * Vendor Invoice → warehouse STOCK IN (purchase / inward).
 * Mirrors Tax Invoice outward, using shared document-stock-sync (direction: "in").
 *
 * Lines need stockItemId + warehouseId (from Item Master picker).
 * If stockItemId is missing, resolve by partNumber → stock_items.code and
 * fall back to the company default warehouse.
 *
 * When the VI is linked to POs (poIds), stock is assumed already posted via
 * PO confirm / GRN — skip to avoid double-counting.
 */

import {
  db,
  stockItemsTable,
  stockMovementsTable,
} from "@workspace/db";
import { and, eq, ilike, or } from "drizzle-orm";
import {
  syncDocumentWarehouseStock,
  type DocumentStockLine,
} from "./document-stock-sync.js";
import { resolveWarehouseId } from "./inventory-service.js";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

type ViLine = {
  type?: string;
  partNumber?: string;
  stockItemId?: number | null;
  warehouseId?: number | null;
  warehouseName?: string | null;
  isStockItem?: boolean;
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
  item: ViLine,
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

export async function loadVendorInvoiceNetReceived(
  tx: Tx | typeof db,
  companyId: number,
  vendorInvoiceId: number,
): Promise<DocumentStockLine[]> {
  const movements = await tx
    .select()
    .from(stockMovementsTable)
    .where(and(
      eq(stockMovementsTable.companyId, companyId),
      eq(stockMovementsTable.referenceId, vendorInvoiceId),
      or(
        eq(stockMovementsTable.referenceType, "vendor_invoice"),
        eq(stockMovementsTable.referenceType, "vendor_invoice_reversal"),
      ),
    ));

  const net = new Map<string, DocumentStockLine>();
  for (const m of movements) {
    const warehouseId = Number(m.warehouseId);
    const stockItemId = Number(m.stockItemId);
    if (!warehouseId || !stockItemId) continue;
    const key = lineKey(warehouseId, stockItemId);
    const delta = toQty(m.quantityIn) - toQty(m.quantityOut);
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
  items: ViLine[],
): Promise<DocumentStockLine[]> {
  const defaultWh = await resolveWarehouseId(companyId);
  const map = new Map<string, DocumentStockLine>();

  for (const item of items || []) {
    if (item?.type === "section") continue;
    const qty = toQty(item.qty);
    if (qty <= 0) continue;

    const stockItemId = await resolveStockItemId(tx, companyId, item);
    if (!stockItemId) continue;

    const warehouseId = normalizeId(item.warehouseId) || defaultWh || undefined;
    if (!warehouseId) {
      throw new Error(
        `Warehouse is required to receive stock for "${cleanPartNumber(item.partNumber) || "item"}".`,
      );
    }

    const key = lineKey(warehouseId, stockItemId);
    const existing = map.get(key);
    if (existing) existing.qty += qty;
    else map.set(key, { warehouseId, stockItemId, qty });
  }

  return Array.from(map.values());
}

export async function syncVendorInvoiceStock(params: {
  companyId: number;
  vendorInvoiceId: number;
  piNumber: string;
  items: ViLine[];
  /** Deprecated — stock is always posted from Vendor Invoice into Item Master. */
  skipBecauseOfPo?: boolean;
  userId?: number;
  username?: string;
}): Promise<void> {
  // Intentionally ignore skipBecauseOfPo: VI qty must always update warehouse / Item Master.
  void params.skipBecauseOfPo;

  await db.transaction(async (tx) => {
    const desiredLines = await collectDesiredLines(tx, params.companyId, params.items);
    const previouslyApplied = await loadVendorInvoiceNetReceived(
      tx,
      params.companyId,
      params.vendorInvoiceId,
    );

    // Lines have qty but none mapped to a stock item / warehouse → fail loudly
    const hasQtyLines = (params.items || []).some((it) => {
      if (it?.type === "section") return false;
      return toQty(it.qty) > 0;
    });
    if (desiredLines.length === 0 && previouslyApplied.length === 0) {
      if (hasQtyLines) {
        throw new Error(
          "Could not update Item Master stock — select stock items from Item Master picker (with warehouse) on each line.",
        );
      }
      return;
    }

    await syncDocumentWarehouseStock(tx, {
      companyId: params.companyId,
      direction: "in",
      documentKind: "vendor_invoice",
      documentId: params.vendorInvoiceId,
      documentNumber: params.piNumber,
      desiredLines,
      previouslyApplied,
      allowWarehouseRemap: true,
      reference: `Vendor Invoice ${params.piNumber}`,
      userId: params.userId,
      username: params.username,
      applyReferenceType: "vendor_invoice",
      reverseReferenceType: "vendor_invoice_reversal",
      applyInTransactionType: "goods_receipt",
      reverseOutTransactionType: "adjustment_out",
    });
  });
}

export async function reverseVendorInvoiceStock(params: {
  companyId: number;
  vendorInvoiceId: number;
  piNumber: string;
  userId?: number;
  username?: string;
}): Promise<void> {
  await db.transaction(async (tx) => {
    const previouslyApplied = await loadVendorInvoiceNetReceived(
      tx,
      params.companyId,
      params.vendorInvoiceId,
    );
    if (previouslyApplied.length === 0) return;

    await syncDocumentWarehouseStock(tx, {
      companyId: params.companyId,
      direction: "in",
      documentKind: "vendor_invoice",
      documentId: params.vendorInvoiceId,
      documentNumber: params.piNumber,
      desiredLines: [],
      previouslyApplied,
      allowWarehouseRemap: true,
      reference: `Vendor Invoice ${params.piNumber} deleted`,
      userId: params.userId,
      username: params.username,
      applyReferenceType: "vendor_invoice",
      reverseReferenceType: "vendor_invoice_reversal",
      applyInTransactionType: "goods_receipt",
      reverseOutTransactionType: "adjustment_out",
    });
  });
}
