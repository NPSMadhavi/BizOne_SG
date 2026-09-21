/**
 * Purchase-price history for stock items.
 *
 * Rules:
 * - Vendor Invoice with unit price ≠ catalogue purchase price → Item Master price row
 *   (purchase price + selling from markup + qty). Same price across VIs → one row, qty summed.
 * - Same unit price as catalogue → no extra row; qty only adds to warehouse / Active stock.
 * - Item Master can also record price history when purchase price is changed with a date.
 * - stock_items.purchase_price is never overwritten by Vendor Invoice.
 */

import {
  db,
  stockItemsTable,
  stockItemPurchasePricesTable,
  vendorInvoicesTable,
  stockMovementsTable,
} from "@workspace/db";
import { and, desc, eq, or, sql } from "drizzle-orm";

export type PurchasePriceSourceType = "vendor_invoice" | "item_master";

function toMoney(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

function toQty(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 1000) / 1000;
}

function toYmd(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

function moneyEq(a: number, b: number) {
  return Math.round(a * 100) === Math.round(b * 100);
}

function moneyKey(price: number) {
  return price.toFixed(2);
}

function cleanPartNumber(raw: unknown): string {
  return String(raw ?? "").replace(/<[^>]*>/g, "").trim();
}

/** Net warehouse qty this VI actually posted for one stock item. */
async function netStockFromVendorInvoice(opts: {
  companyId: number;
  vendorInvoiceId: number;
  stockItemId: number;
}): Promise<number> {
  const [row] = await db
    .select({
      net: sql<string>`coalesce(sum(${stockMovementsTable.quantityIn}::numeric - ${stockMovementsTable.quantityOut}::numeric), 0)`,
    })
    .from(stockMovementsTable)
    .where(and(
      eq(stockMovementsTable.companyId, opts.companyId),
      eq(stockMovementsTable.stockItemId, opts.stockItemId),
      eq(stockMovementsTable.referenceId, opts.vendorInvoiceId),
      or(
        eq(stockMovementsTable.referenceType, "vendor_invoice"),
        eq(stockMovementsTable.referenceType, "vendor_invoice_reversal"),
      ),
    ));
  return Math.max(0, toQty(row?.net));
}

/**
 * Rebuild vendor_invoice price lots for one stock item.
 * Qty = stock actually posted by each VI (so catalogue-price receipts can show on Active).
 * New row only when VI unit price differs from catalogue purchase price.
 */
export async function recomputeVendorInvoicePriceLots(opts: {
  companyId: number;
  stockItemId: number;
  userId?: number | null;
}): Promise<void> {
  const [item] = await db
    .select({
      id: stockItemsTable.id,
      code: stockItemsTable.code,
      purchasePrice: stockItemsTable.purchasePrice,
    })
    .from(stockItemsTable)
    .where(and(
      eq(stockItemsTable.id, opts.stockItemId),
      eq(stockItemsTable.companyId, opts.companyId),
    ));
  if (!item) return;

  const master = toMoney(item.purchasePrice) ?? 0;
  const itemCode = String(item.code || "").trim().toLowerCase();

  const vis = await db
    .select({
      id: vendorInvoicesTable.id,
      piNumber: vendorInvoicesTable.piNumber,
      piDate: vendorInvoicesTable.piDate,
      items: vendorInvoicesTable.items,
    })
    .from(vendorInvoicesTable)
    .where(eq(vendorInvoicesTable.companyId, opts.companyId));

  type Lot = {
    qty: number;
    effectiveDate: string;
    sourceRef: string;
    sourceId: number;
    refs: string[];
  };
  const lots = new Map<string, Lot>();

  for (const vi of vis) {
    const date = toYmd(vi.piDate) || "1970-01-01";
    const piLabel = String(vi.piNumber || `VI-${vi.id}`).trim();

    const stockPosted = await netStockFromVendorInvoice({
      companyId: opts.companyId,
      vendorInvoiceId: vi.id,
      stockItemId: opts.stockItemId,
    });
    if (stockPosted <= 0) continue;

    // Weights: only lines at prices ≠ catalogue (catalogue stock stays on Active)
    const weights = new Map<string, number>();
    let weightSum = 0;
    let hasMatchingLine = false;
    for (const line of (vi.items as any[]) || []) {
      if (line?.type === "section") continue;
      const sid = Number(line.stockItemId);
      const part = cleanPartNumber(line.partNumber).toLowerCase();
      const matchesItem =
        (Number.isFinite(sid) && sid > 0 && sid === opts.stockItemId)
        || (!!itemCode && !!part && part === itemCode);
      if (!matchesItem) continue;
      hasMatchingLine = true;

      const price = toMoney(line.unitPrice);
      const qty = toQty(line.qty);
      if (price == null || price <= 0 || qty <= 0) continue;
      if (moneyEq(price, master)) continue;

      const key = moneyKey(price);
      weights.set(key, (weights.get(key) || 0) + qty);
      weightSum += qty;
    }

    // Entire VI at catalogue price → stock stays on Active (no price lot)
    if (!hasMatchingLine || weightSum <= 0) continue;

    let attributed = 0;
    const entries = Array.from(weights.entries());
    for (let i = 0; i < entries.length; i++) {
      const [key, w] = entries[i];
      const share = i === entries.length - 1
        ? Math.round((stockPosted - attributed) * 1000) / 1000
        : Math.round((stockPosted * (w / weightSum)) * 1000) / 1000;
      if (share <= 0) continue;
      attributed += share;

      const existing = lots.get(key);
      if (existing) {
        existing.qty += share;
        if (!existing.refs.includes(piLabel)) existing.refs.push(piLabel);
        if (date >= existing.effectiveDate) {
          existing.effectiveDate = date;
          existing.sourceId = vi.id;
        }
      } else {
        lots.set(key, {
          qty: share,
          effectiveDate: date,
          sourceRef: piLabel,
          sourceId: vi.id,
          refs: [piLabel],
        });
      }
    }
  }

  await db
    .delete(stockItemPurchasePricesTable)
    .where(and(
      eq(stockItemPurchasePricesTable.companyId, opts.companyId),
      eq(stockItemPurchasePricesTable.stockItemId, opts.stockItemId),
      eq(stockItemPurchasePricesTable.sourceType, "vendor_invoice"),
    ));

  for (const [priceStr, lot] of lots) {
    if (lot.qty <= 0) continue;
    const ref = lot.refs.length > 1
      ? `${lot.refs[lot.refs.length - 1]} (+${lot.refs.length - 1} more)`
      : (lot.refs[0] || lot.sourceRef);
    await db.insert(stockItemPurchasePricesTable).values({
      companyId: opts.companyId,
      stockItemId: opts.stockItemId,
      purchasePrice: priceStr,
      quantity: lot.qty.toFixed(3),
      effectiveDate: lot.effectiveDate,
      sourceType: "vendor_invoice",
      sourceId: lot.sourceId,
      sourceRef: ref,
      notes: lot.refs.length > 1
        ? `Vendors/invoices: ${lot.refs.join(", ")}`
        : `Purchase price ${priceStr}`,
      createdBy: opts.userId ?? null,
    });
  }
}

export async function recordStockPurchasePrice(opts: {
  companyId: number;
  stockItemId: number;
  purchasePrice: number | string;
  effectiveDate: string;
  sourceType: PurchasePriceSourceType;
  sourceId?: number | null;
  sourceRef?: string | null;
  notes?: string | null;
  userId?: number | null;
  quantity?: number | string | null;
  skipIfUnchanged?: boolean;
  updateMasterPrice?: boolean;
}): Promise<{ recorded: boolean; id?: number }> {
  if (opts.sourceType === "vendor_invoice") {
    // VI lots are rebuilt via recomputeVendorInvoicePriceLots
    return { recorded: false };
  }

  const price = toMoney(opts.purchasePrice);
  const effectiveDate = toYmd(opts.effectiveDate);
  if (price == null || !effectiveDate || !(opts.stockItemId > 0)) {
    return { recorded: false };
  }
  const money = price.toFixed(2);
  const qty = toQty(opts.quantity);
  const qtyStr = qty.toFixed(3);
  const updateMaster = opts.updateMasterPrice === true;

  const [item] = await db
    .select({
      id: stockItemsTable.id,
      companyId: stockItemsTable.companyId,
      purchasePrice: stockItemsTable.purchasePrice,
    })
    .from(stockItemsTable)
    .where(and(
      eq(stockItemsTable.id, opts.stockItemId),
      eq(stockItemsTable.companyId, opts.companyId),
    ));
  if (!item) return { recorded: false };

  if (opts.sourceType === "item_master") {
    const existingRows = await db
      .select()
      .from(stockItemPurchasePricesTable)
      .where(and(
        eq(stockItemPurchasePricesTable.stockItemId, opts.stockItemId),
        eq(stockItemPurchasePricesTable.companyId, opts.companyId),
        eq(stockItemPurchasePricesTable.sourceType, "item_master"),
      ));
    const samePrice = existingRows.find((r) => moneyEq(Number(r.purchasePrice), price));
    if (samePrice) {
      if (opts.skipIfUnchanged && moneyEq(Number(samePrice.purchasePrice), price)
        && samePrice.effectiveDate === effectiveDate) {
        if (updateMaster) {
          await db.update(stockItemsTable)
            .set({ purchasePrice: money, updatedAt: new Date() })
            .where(eq(stockItemsTable.id, opts.stockItemId));
        }
        return { recorded: false, id: samePrice.id };
      }
      await db.update(stockItemPurchasePricesTable)
        .set({
          purchasePrice: money,
          effectiveDate,
          quantity: qty > 0 ? qtyStr : samePrice.quantity,
          sourceRef: opts.sourceRef ?? samePrice.sourceRef,
          notes: opts.notes ?? samePrice.notes,
        })
        .where(eq(stockItemPurchasePricesTable.id, samePrice.id));
      if (updateMaster) {
        await db.update(stockItemsTable)
          .set({ purchasePrice: money, updatedAt: new Date() })
          .where(eq(stockItemsTable.id, opts.stockItemId));
      }
      return { recorded: true, id: samePrice.id };
    }
  }

  if (opts.skipIfUnchanged) {
    const [latest] = await db
      .select({
        purchasePrice: stockItemPurchasePricesTable.purchasePrice,
        effectiveDate: stockItemPurchasePricesTable.effectiveDate,
      })
      .from(stockItemPurchasePricesTable)
      .where(and(
        eq(stockItemPurchasePricesTable.stockItemId, opts.stockItemId),
        eq(stockItemPurchasePricesTable.sourceType, "item_master"),
      ))
      .orderBy(desc(stockItemPurchasePricesTable.effectiveDate), desc(stockItemPurchasePricesTable.id))
      .limit(1);
    if (
      latest
      && moneyEq(Number(latest.purchasePrice), price)
      && latest.effectiveDate === effectiveDate
    ) {
      return { recorded: false };
    }
  }

  const [row] = await db
    .insert(stockItemPurchasePricesTable)
    .values({
      companyId: opts.companyId,
      stockItemId: opts.stockItemId,
      purchasePrice: money,
      quantity: qtyStr,
      effectiveDate,
      sourceType: opts.sourceType,
      sourceId: opts.sourceId ?? null,
      sourceRef: opts.sourceRef ?? null,
      notes: opts.notes ?? null,
      createdBy: opts.userId ?? null,
    })
    .returning({ id: stockItemPurchasePricesTable.id });

  if (updateMaster) {
    await db
      .update(stockItemsTable)
      .set({ purchasePrice: money, updatedAt: new Date() })
      .where(eq(stockItemsTable.id, opts.stockItemId));
  }

  return { recorded: true, id: row?.id };
}

type ViPriceLine = {
  type?: string;
  stockItemId?: number | null;
  unitPrice?: number | string | null;
  qty?: number | string | null;
};

/** After VI create/update: rebuild price lots for affected items. */
export async function syncVendorInvoicePurchasePrices(opts: {
  companyId: number;
  vendorInvoiceId: number;
  piNumber: string;
  piDate: string;
  items: ViPriceLine[];
  userId?: number | null;
}): Promise<void> {
  void opts.piNumber;
  void opts.piDate;

  const stockItemIds = new Set<number>();
  for (const line of opts.items || []) {
    if (line?.type === "section") continue;
    const stockItemId = Number(line.stockItemId);
    if (Number.isFinite(stockItemId) && stockItemId > 0) stockItemIds.add(stockItemId);
  }

  const prior = await db
    .select({ stockItemId: stockItemPurchasePricesTable.stockItemId })
    .from(stockItemPurchasePricesTable)
    .where(and(
      eq(stockItemPurchasePricesTable.companyId, opts.companyId),
      eq(stockItemPurchasePricesTable.sourceType, "vendor_invoice"),
      eq(stockItemPurchasePricesTable.sourceId, opts.vendorInvoiceId),
    ));
  for (const p of prior) stockItemIds.add(p.stockItemId);

  for (const stockItemId of stockItemIds) {
    await recomputeVendorInvoicePriceLots({
      companyId: opts.companyId,
      stockItemId,
      userId: opts.userId,
    });
  }
}

/** After VI delete — rebuild lots for affected items. */
export async function recomputePriceLotsAfterVendorInvoiceRemoved(opts: {
  companyId: number;
  vendorInvoiceId: number;
  stockItemIds: number[];
  userId?: number | null;
}): Promise<void> {
  const ids = new Set(opts.stockItemIds.filter((id) => id > 0));
  const prior = await db
    .select({ stockItemId: stockItemPurchasePricesTable.stockItemId })
    .from(stockItemPurchasePricesTable)
    .where(and(
      eq(stockItemPurchasePricesTable.companyId, opts.companyId),
      eq(stockItemPurchasePricesTable.sourceType, "vendor_invoice"),
      eq(stockItemPurchasePricesTable.sourceId, opts.vendorInvoiceId),
    ));
  for (const p of prior) ids.add(p.stockItemId);

  for (const stockItemId of ids) {
    await recomputeVendorInvoicePriceLots({
      companyId: opts.companyId,
      stockItemId,
      userId: opts.userId,
    });
  }
}

export async function listStockPurchasePrices(stockItemId: number, companyId: number) {
  return db
    .select()
    .from(stockItemPurchasePricesTable)
    .where(and(
      eq(stockItemPurchasePricesTable.stockItemId, stockItemId),
      eq(stockItemPurchasePricesTable.companyId, companyId),
    ))
    .orderBy(desc(stockItemPurchasePricesTable.effectiveDate), desc(stockItemPurchasePricesTable.id));
}

export async function listCompanyPurchasePrices(companyId: number) {
  return db
    .select()
    .from(stockItemPurchasePricesTable)
    .where(eq(stockItemPurchasePricesTable.companyId, companyId))
    .orderBy(
      stockItemPurchasePricesTable.stockItemId,
      stockItemPurchasePricesTable.effectiveDate,
      stockItemPurchasePricesTable.id,
    );
}

export async function deleteStockPurchasePrice(opts: {
  companyId: number;
  stockItemId: number;
  priceId: number;
}): Promise<boolean> {
  const [row] = await db
    .select({ id: stockItemPurchasePricesTable.id })
    .from(stockItemPurchasePricesTable)
    .where(and(
      eq(stockItemPurchasePricesTable.id, opts.priceId),
      eq(stockItemPurchasePricesTable.stockItemId, opts.stockItemId),
      eq(stockItemPurchasePricesTable.companyId, opts.companyId),
    ));
  if (!row) return false;
  await db
    .delete(stockItemPurchasePricesTable)
    .where(eq(stockItemPurchasePricesTable.id, opts.priceId));
  return true;
}
