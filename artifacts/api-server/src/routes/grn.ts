import { Router, type IRouter } from "express";
import {
  db,
  grnTable,
  purchaseOrdersTable,
  stockItemsTable,
  stockMovementsTable,
  stockSerialsTable,
  warehousesTable,
} from "@workspace/db";
import { eq, desc, and, ilike, or, sql } from "drizzle-orm";
import { nextDocNumber } from "../lib/running-numbers.js";
import { adjustWarehouseQuantity, applyMovement, getWarehouseBalance, getDefaultWarehouseId, ensureDefaultWarehouse } from "../lib/inventory-service.js";
import { requireWarehouseId } from "../lib/document-stock-sync.js";

declare module "express-session" {
  interface SessionData {
    userId?: number;
    companyId?: number;
    isAdmin?: boolean;
    userRole?: string;
    username?: string;
  }
}

const router: IRouter = Router();

function requireAuth(req: any, res: any): boolean {
  if (!req.session.userId) { res.status(401).json({ error: "Not authenticated" }); return false; }
  return true;
}

function computeGrnStatus(items: any[]): "draft" | "partial" | "complete" {
  if (!items || items.length === 0) return "draft";
  const receivedCount = items.filter((i: any) => i.received).length;
  if (receivedCount === 0) return "draft";
  if (receivedCount === items.length) return "complete";
  return "partial";
}

export async function autoCreateGrn(po: any, userId: number): Promise<void> {
  const existing = await db.select().from(grnTable).where(eq(grnTable.poId, po.id));
  if (existing.length > 0) return;

  const grnItems = ((po.items as any[]) || []).map((item: any) => ({
    ...item,
    received: false,
    serialNumbers: "",
  }));

  const grnNumber = await nextDocNumber("grn", po.companyId);

  await db.insert(grnTable).values({
    grnNumber,
    poId: po.id,
    poNumber: po.poNumber,
    vendorName: po.vendorName,
    companyId: po.companyId,
    status: "draft",
    items: grnItems,
    createdBy: userId,
  });
}

function toStockQty(value: string | number | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function isStockHoldingPoStatus(status: unknown): boolean {
  return status === "confirmed" || status === "sent";
}

async function lookupWarehouseIdByName(
  tx: any,
  companyId: number,
  warehouseName: unknown,
): Promise<number | undefined> {
  const cleanWhName = String(warehouseName || "").trim();
  if (!cleanWhName) return undefined;
  const [whRow] = await tx
    .select({ id: warehousesTable.id })
    .from(warehousesTable)
    .where(and(eq(warehousesTable.companyId, companyId), ilike(warehousesTable.name, cleanWhName)))
    .limit(1);
  return whRow?.id;
}

async function resolveGrnLineWarehouseId(
  tx: any,
  companyId: number,
  item: any,
  poLine: any | undefined,
  itemLabel: string,
): Promise<number> {
  let warehouseId = Number(item.warehouseId) > 0 ? Number(item.warehouseId) : undefined;

  if (!warehouseId) {
    warehouseId = await lookupWarehouseIdByName(tx, companyId, item.warehouseName);
  }

  if (!warehouseId && poLine) {
    warehouseId = Number(poLine.warehouseId) > 0 ? Number(poLine.warehouseId) : undefined;
    if (!warehouseId) {
      warehouseId = await lookupWarehouseIdByName(tx, companyId, poLine.warehouseName);
    }
  }

  if (!warehouseId) {
    warehouseId = (await getDefaultWarehouseId(companyId)) ?? (await ensureDefaultWarehouse(companyId));
  }

  return requireWarehouseId(warehouseId, itemLabel);
}

/**
 * Preserve stockItemId / warehouseId when the edit payload omits them.
 * Without this, PO edit can save qty changes but skip warehouse stock sync.
 */
export function mergePurchaseOrderStockMeta(
  incoming: any[] | undefined,
  previous: any[] | undefined,
): any[] {
  const items = Array.isArray(incoming) ? incoming.map((i) => (i && typeof i === "object" ? { ...i } : i)) : [];
  const prev = Array.isArray(previous) ? previous : [];

  return items.map((item, idx) => {
    if (!item || item.type === "section") return item;

    const cleanPart = String(item.partNumber || "").replace(/<[^>]*>/g, "").trim().toLowerCase();
    let stockItemId = Number(item.stockItemId) > 0 ? Number(item.stockItemId) : undefined;
    let warehouseId = Number(item.warehouseId) > 0 ? Number(item.warehouseId) : undefined;
    let warehouseName = item.warehouseName || undefined;
    let isStockItem = item.isStockItem === true || !!stockItemId;

    const prevLine =
      (stockItemId
        ? prev.find((p) => p && p.type !== "section" && Number(p.stockItemId) === stockItemId)
        : undefined)
      ?? (cleanPart
        ? prev.find((p) =>
          p && p.type !== "section"
          && String(p.partNumber || "").replace(/<[^>]*>/g, "").trim().toLowerCase() === cleanPart
        )
        : undefined)
      ?? (prev[idx] && prev[idx].type !== "section" ? prev[idx] : undefined);

    if (prevLine) {
      if (!stockItemId && Number(prevLine.stockItemId) > 0) {
        stockItemId = Number(prevLine.stockItemId);
      }
      if (!warehouseId && Number(prevLine.warehouseId) > 0) {
        warehouseId = Number(prevLine.warehouseId);
        warehouseName = warehouseName || prevLine.warehouseName;
      }
      if (!isStockItem && (prevLine.isStockItem === true || Number(prevLine.stockItemId) > 0 || prevLine.warehouseStockPosted === true)) {
        isStockItem = true;
      }
    }

    return {
      ...item,
      isStockItem,
      stockItemId,
      warehouseId,
      warehouseName,
      qty: toStockQty(item.qty),
    };
  });
}

/**
 * Net qty already posted for this PO into warehouse (IN − reversals).
 * JSON flag warehouseStockPosted alone is not trusted — item deletes wipe movements
 * and leave orphaned flags that blocked re-posting.
 */
async function loadPurchaseOrderNetPosted(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  companyId: number,
  poId: number,
): Promise<Map<string, { warehouseId: number; stockItemId: number; qty: number }>> {
  const movements = await tx
    .select()
    .from(stockMovementsTable)
    .where(and(
      eq(stockMovementsTable.companyId, companyId),
      eq(stockMovementsTable.referenceId, poId),
      or(
        eq(stockMovementsTable.referenceType, "purchase_order"),
        eq(stockMovementsTable.referenceType, "purchase_order_reversal"),
        eq(stockMovementsTable.transactionType, "purchase_order"),
      ),
    ));

  const netMap = new Map<string, { warehouseId: number; stockItemId: number; qty: number }>();
  for (const m of movements) {
    const key = `${m.warehouseId}:${m.stockItemId}`;
    const net = toStockQty(m.quantityIn) - toStockQty(m.quantityOut);
    const cur = netMap.get(key) || { warehouseId: m.warehouseId, stockItemId: m.stockItemId, qty: 0 };
    cur.qty += net;
    netMap.set(key, cur);
  }
  return netMap;
}

async function clearPurchaseOrderItemMovements(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  companyId: number,
  poId: number,
  stockItemId: number,
): Promise<void> {
  await tx.delete(stockMovementsTable).where(and(
    eq(stockMovementsTable.companyId, companyId),
    eq(stockMovementsTable.referenceId, poId),
    eq(stockMovementsTable.stockItemId, stockItemId),
    or(
      eq(stockMovementsTable.referenceType, "purchase_order"),
      eq(stockMovementsTable.referenceType, "purchase_order_reversal"),
      eq(stockMovementsTable.transactionType, "purchase_order"),
    ),
  ));
}

/** Write/replace one canonical Purchase Order movement (quantity_in = absolute PO qty). */
async function upsertPurchaseOrderMovement(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  params: {
    companyId: number;
    poId: number;
    poNumber: string;
    warehouseId: number;
    stockItemId: number;
    quantityIn: number;
    balance: number;
    reference?: string;
    userId?: number;
    username?: string;
  },
): Promise<void> {
  await clearPurchaseOrderItemMovements(tx, params.companyId, params.poId, params.stockItemId);
  if (params.quantityIn <= 0.0005) return;

  await tx.insert(stockMovementsTable).values({
    companyId: params.companyId,
    warehouseId: params.warehouseId,
    stockItemId: params.stockItemId,
    transactionType: "purchase_order",
    documentNumber: params.poNumber,
    referenceType: "purchase_order",
    referenceId: params.poId,
    quantityIn: String(params.quantityIn),
    quantityOut: "0",
    balance: String(params.balance),
    reference: params.reference || `Purchase Order ${params.poNumber}`,
    userId: params.userId ?? null,
    username: params.username ?? null,
    movementDate: new Date(),
  });
}

/**
 * On PO confirm: STOCK IN to the selected warehouse.
 *
 * - Create: add qty, write one purchase_order movement (qty_in = absolute PO qty)
 * - Edit same WH: apply only the delta to warehouse_stock, rewrite movement to absolute qty
 * - Edit WH change: reverse old WH, apply new WH, rewrite movement
 * - Unconfirm: reverse all nets and clear movements
 *
 * Marks warehouseStockPosted so GRN receive will not double-add.
 */
export async function postPurchaseOrderWarehouseStock(params: {
  po: any;
  userId?: number;
  username?: string;
}): Promise<any> {
  const { po, userId, username } = params;
  const companyId = po.companyId as number;
  const items = Array.isArray(po.items) ? [...(po.items as any[])] : [];
  const shouldHoldStock = isStockHoldingPoStatus(po.status);

  let changed = false;

  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${companyId}, ${po.id + 800000})`);

    const netPostedMap = await loadPurchaseOrderNetPosted(tx, companyId, po.id);
    const desiredByItem = new Map<number, { warehouseId: number; stockItemId: number; qty: number }>();
    const lineIndexesByItem = new Map<number, number[]>();

    if (shouldHoldStock) {
      for (let idx = 0; idx < items.length; idx++) {
        const item = items[idx];
        if (!item || item.type === "section") continue;

        const stockItemIdHint = Number(item.stockItemId) || 0;
        const isStockLine = item.isStockItem === true || stockItemIdHint > 0;
        if (!isStockLine) continue;

        const partNumber = String(item.partNumber || "").trim();
        if (!partNumber && !stockItemIdHint) continue;

        const desiredQty = toStockQty(item.qty);
        if (desiredQty <= 0) continue;

        let stockItemId = stockItemIdHint;
        let [stockItem] = stockItemId
          ? await tx
              .select()
              .from(stockItemsTable)
              .where(and(eq(stockItemsTable.id, stockItemId), eq(stockItemsTable.companyId, companyId)))
              .limit(1)
          : [];

        if (!stockItem && partNumber) {
          [stockItem] = await tx
            .select()
            .from(stockItemsTable)
            .where(and(eq(stockItemsTable.companyId, companyId), ilike(stockItemsTable.code, partNumber)))
            .limit(1);
        }

        if (!stockItem) {
          if (!partNumber) continue;
          const rawName = String(item.description || partNumber).replace(/<[^>]*>/g, "").trim();
          const [created] = await tx.insert(stockItemsTable).values({
            companyId,
            code: partNumber,
            name: rawName || partNumber,
            uom: item.uom || "pcs",
            type: "product",
            unitPrice: String(item.unitPrice || "0"),
            stockQty: "0",
            isActive: true,
          }).returning();
          stockItem = created;
        }

        stockItemId = stockItem.id;

        let warehouseId = Number(item.warehouseId) > 0 ? Number(item.warehouseId) : undefined;
        if (!warehouseId && item.warehouseName) {
          const cleanWhName = String(item.warehouseName).trim();
          if (cleanWhName) {
            const [whRow] = await tx
              .select({ id: warehousesTable.id })
              .from(warehousesTable)
              .where(and(eq(warehousesTable.companyId, companyId), ilike(warehousesTable.name, cleanWhName)))
              .limit(1);
            if (whRow) warehouseId = whRow.id;
          }
        }

        const effectiveWarehouseId = requireWarehouseId(
          warehouseId,
          partNumber || stockItem.name || `item #${stockItemId}`,
        );

        const existingDesired = desiredByItem.get(stockItemId);
        if (existingDesired) {
          if (existingDesired.warehouseId !== effectiveWarehouseId) {
            throw new Error(
              `Keep a single warehouse per stock item on ${po.poNumber}.`,
            );
          }
          existingDesired.qty += desiredQty;
        } else {
          desiredByItem.set(stockItemId, {
            warehouseId: effectiveWarehouseId,
            stockItemId,
            qty: desiredQty,
          });
        }

        const idxs = lineIndexesByItem.get(stockItemId) ?? [];
        idxs.push(idx);
        lineIndexesByItem.set(stockItemId, idxs);

        items[idx] = {
          ...item,
          isStockItem: true,
          stockItemId,
          warehouseId: effectiveWarehouseId,
        };
      }
    }

    const previouslyApplied = Array.from(netPostedMap.values()).filter((e) => e.qty > 0.0005);
    const previousByItem = new Map<number, { warehouseId: number; stockItemId: number; qty: number }[]>();
    for (const line of previouslyApplied) {
      const list = previousByItem.get(line.stockItemId) ?? [];
      list.push(line);
      previousByItem.set(line.stockItemId, list);
    }

    const stockItemIds = new Set<number>([
      ...desiredByItem.keys(),
      ...previousByItem.keys(),
    ]);

    for (const stockItemId of stockItemIds) {
      const desired = desiredByItem.get(stockItemId);
      const previousList = previousByItem.get(stockItemId) ?? [];
      const previousTotal = previousList.reduce((s, l) => s + l.qty, 0);
      const previousPrimary = previousList.slice().sort((a, b) => b.qty - a.qty)[0];

      // Unconfirm / line removed → reverse all previous nets.
      if (!desired) {
        for (const prev of previousList) {
          if (prev.qty <= 0.0005) continue;
          await adjustWarehouseQuantity(tx, {
            companyId,
            warehouseId: prev.warehouseId,
            stockItemId,
            quantityOut: prev.qty,
          });
        }
        await clearPurchaseOrderItemMovements(tx, companyId, po.id, stockItemId);
        continue;
      }

      const warehouseChanged =
        !!previousPrimary
        && previousPrimary.warehouseId !== desired.warehouseId;

      if (warehouseChanged) {
        for (const prev of previousList) {
          if (prev.qty <= 0.0005) continue;
          await adjustWarehouseQuantity(tx, {
            companyId,
            warehouseId: prev.warehouseId,
            stockItemId,
            quantityOut: prev.qty,
          });
        }
        const after = await adjustWarehouseQuantity(tx, {
          companyId,
          warehouseId: desired.warehouseId,
          stockItemId,
          quantityIn: desired.qty,
        });
        await upsertPurchaseOrderMovement(tx, {
          companyId,
          poId: po.id,
          poNumber: po.poNumber,
          warehouseId: desired.warehouseId,
          stockItemId,
          quantityIn: desired.qty,
          balance: after,
          reference: po.vendorName || po.poNumber,
          userId,
          username,
        });
        continue;
      }

      // Same warehouse — apply quantity difference only.
      const currentQty = previousTotal;
      const adjustment = desired.qty - currentQty;

      console.log("[PO STOCK SYNC]", JSON.stringify({
        poId: po.id,
        poNumber: po.poNumber,
        stockItemId,
        warehouseId: desired.warehouseId,
        previouslyAppliedQty: currentQty,
        desiredQty: desired.qty,
        adjustment,
      }));

      if (Math.abs(adjustment) < 0.0005) {
        const balance = await getWarehouseBalance(tx, desired.warehouseId, stockItemId);
        await upsertPurchaseOrderMovement(tx, {
          companyId,
          poId: po.id,
          poNumber: po.poNumber,
          warehouseId: desired.warehouseId,
          stockItemId,
          quantityIn: desired.qty,
          balance,
          reference: po.vendorName || po.poNumber,
          userId,
          username,
        });
        continue;
      }

      let after: number;
      if (adjustment > 0) {
        after = await adjustWarehouseQuantity(tx, {
          companyId,
          warehouseId: desired.warehouseId,
          stockItemId,
          quantityIn: adjustment,
        });
      } else {
        after = await adjustWarehouseQuantity(tx, {
          companyId,
          warehouseId: desired.warehouseId,
          stockItemId,
          quantityOut: -adjustment,
        });
      }

      await upsertPurchaseOrderMovement(tx, {
        companyId,
        poId: po.id,
        poNumber: po.poNumber,
        warehouseId: desired.warehouseId,
        stockItemId,
        quantityIn: desired.qty,
        balance: after,
        reference: po.vendorName || po.poNumber,
        userId,
        username,
      });
    }

    if (shouldHoldStock) {
      for (const idxs of lineIndexesByItem.values()) {
        for (const idx of idxs) {
          items[idx] = { ...items[idx], warehouseStockPosted: true };
        }
      }
    } else {
      for (let i = 0; i < items.length; i++) {
        if (items[i] && typeof items[i] === "object") {
          items[i] = { ...items[i], warehouseStockPosted: false };
        }
      }
    }
    changed = desiredByItem.size > 0 || previouslyApplied.length > 0;
  });

  if (!changed) return po;

  const [updatedPo] = await db
    .update(purchaseOrdersTable)
    .set({ items })
    .where(eq(purchaseOrdersTable.id, po.id))
    .returning();

  // Keep GRN in sync so receive won't double-post
  const [grn] = await db.select().from(grnTable).where(eq(grnTable.poId, po.id)).limit(1);
  if (grn) {
    const grnItems = ((grn.items as any[]) || []).map((gi: any, idx: number) => {
      const poItem = items[idx];
      if (!poItem?.warehouseStockPosted) return gi;
      return {
        ...gi,
        ...poItem,
        received: gi.received === true,
        serialNumbers: gi.serialNumbers || "",
        warehouseStockPosted: true,
      };
    });
    await db.update(grnTable).set({ items: grnItems, updatedAt: new Date() }).where(eq(grnTable.id, grn.id));
  }

  return updatedPo || { ...po, items };
}

export async function autoDeleteGrnIfEmpty(poId: number): Promise<{ blocked: boolean; grnNumber?: string }> {
  const [grn] = await db.select().from(grnTable).where(eq(grnTable.poId, poId));
  if (!grn) return { blocked: false };

  const items = (grn.items as any[]) || [];
  const hasReceived = items.some((i: any) => i.received);
  if (hasReceived) {
    return { blocked: true, grnNumber: grn.grnNumber };
  }

  await db.delete(grnTable).where(eq(grnTable.id, grn.id));
  return { blocked: false };
}

router.post("/grn/from-po/:poId", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const poId = parseInt(req.params.poId);
  if (isNaN(poId)) { res.status(400).json({ error: "Invalid PO ID" }); return; }

  const [po] = await db.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, poId));
  if (!po) { res.status(404).json({ error: "Purchase order not found" }); return; }
  if (!["confirmed", "sent"].includes(po.status)) {
    res.status(400).json({ error: "PO must be confirmed to create a GRN" }); return;
  }

  const existing = await db.select().from(grnTable).where(eq(grnTable.poId, poId));
  if (existing.length > 0) {
    res.json(existing[0]);
    return;
  }

  await autoCreateGrn(po, req.session.userId!);
  const [created] = await db.select().from(grnTable).where(eq(grnTable.poId, poId));
  res.status(201).json(created);
});

/** Create a GRN manually (no linked PO required). */
router.post("/grn", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!req.session.companyId) {
    res.status(400).json({ error: "No company selected. Please select a company first." });
    return;
  }

  try {
    const companyId = req.session.companyId;
    const userId = req.session.userId!;
    const { vendorName, poNumber, poId, items } = req.body;

    if (!vendorName || !String(vendorName).trim()) {
      res.status(400).json({ error: "vendorName is required" }); return;
    }
    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: "At least one item is required" }); return;
    }

    const normalizedItems = items.map((item: any) => ({
      partNumber: item.partNumber || "",
      description: item.description || "",
      qty: Number(item.qty) || 0,
      unitPrice: Number(item.unitPrice) || 0,
      amount: Number(item.amount) || ((Number(item.qty) || 0) * (Number(item.unitPrice) || 0)),
      received: item.received === true,
      isStockItem: item.isStockItem === true,
      serialNumbers: item.serialNumbers || "",
      warehouseName: item.warehouseName || undefined,
      warehouseId: item.warehouseId || undefined,
      stockItemId: item.stockItemId || undefined,
    }));

    const linkedPoId = poId != null && poId !== "" ? Number(poId) : null;
    if (linkedPoId && !Number.isNaN(linkedPoId)) {
      const existing = await db.select().from(grnTable).where(eq(grnTable.poId, linkedPoId));
      if (existing.length > 0) {
        res.status(400).json({ error: "A GRN already exists for this purchase order", grn: existing[0] });
        return;
      }
    }

    const grnNumber = await nextDocNumber("grn", companyId);
    const [created] = await db.insert(grnTable).values({
      grnNumber,
      poId: linkedPoId && !Number.isNaN(linkedPoId) ? linkedPoId : null,
      poNumber: String(poNumber || "").trim(),
      vendorName: String(vendorName).trim(),
      companyId,
      status: computeGrnStatus(normalizedItems),
      items: normalizedItems,
      createdBy: userId,
    }).returning();

    res.status(201).json(created);
  } catch (e: any) {
    const msg = e?.message || "Failed to create GRN";
    // Common when DB still has NOT NULL on po_id (migration not applied yet)
    if (/po_id|null value|not-null/i.test(msg)) {
      res.status(500).json({
        error: "Database needs update for manual GRN (po_id nullable). Restart the API server and try again.",
      });
      return;
    }
    res.status(500).json({ error: msg });
  }
});

router.get("/grn", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const companyId = req.session.companyId;

  const rows = companyId
    ? await db.select().from(grnTable).where(eq(grnTable.companyId, companyId)).orderBy(desc(grnTable.createdAt))
    : await db.select().from(grnTable).orderBy(desc(grnTable.createdAt));

  res.json(rows);
});

router.get("/grn/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [grn] = await db.select().from(grnTable).where(eq(grnTable.id, id));
  if (!grn) { res.status(404).json({ error: "GRN not found" }); return; }

  res.json(grn);
});

router.put("/grn/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const { items } = req.body;
  if (!Array.isArray(items)) { res.status(400).json({ error: "items array is required" }); return; }

  const [existing] = await db.select().from(grnTable).where(eq(grnTable.id, id));
  if (!existing) { res.status(404).json({ error: "GRN not found" }); return; }

  const newStatus = computeGrnStatus(items);

  const [updated] = await db
    .update(grnTable)
    .set({ items, status: newStatus, updatedAt: new Date() })
    .where(eq(grnTable.id, id))
    .returning();

  res.json(updated);
});

router.post("/grn/:id/receive", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const { items } = req.body;
  if (!Array.isArray(items)) { res.status(400).json({ error: "items array is required" }); return; }

  const [existing] = await db.select().from(grnTable).where(eq(grnTable.id, id));
  if (!existing) { res.status(404).json({ error: "GRN not found" }); return; }

  const companyId = existing.companyId;
  const prevItems = (existing.items as any[]) || [];
  const newStatus = computeGrnStatus(items);

  try {
    const updated = await db.transaction(async (tx) => {
      let poItems: any[] = [];
      if (existing.poId) {
        const [poRow] = await tx
          .select({ items: purchaseOrdersTable.items })
          .from(purchaseOrdersTable)
          .where(eq(purchaseOrdersTable.id, existing.poId))
          .limit(1);
        poItems = (poRow?.items as any[]) || [];
      }

      // Only post stock for lines newly marked received (avoid double-counting)
      for (let idx = 0; idx < items.length; idx++) {
        const item = items[idx];
        if (!item?.received) continue;
        if (prevItems[idx]?.received) continue;
        // Already posted into warehouse when PO was confirmed
        if (item.warehouseStockPosted === true || prevItems[idx]?.warehouseStockPosted === true) continue;

        const partNumber = (item.partNumber || "").trim();
        const isStockItem = item.isStockItem === true || Number(item.stockItemId) > 0;
        if (!isStockItem || (!partNumber && !(Number(item.stockItemId) > 0))) continue;

        let stockItemId = Number(item.stockItemId) || 0;
        let [stockItem] = stockItemId
          ? await tx
              .select()
              .from(stockItemsTable)
              .where(and(eq(stockItemsTable.id, stockItemId), eq(stockItemsTable.companyId, companyId)))
              .limit(1)
          : [];

        if (!stockItem && partNumber) {
          [stockItem] = await tx
            .select()
            .from(stockItemsTable)
            .where(and(eq(stockItemsTable.companyId, companyId), ilike(stockItemsTable.code, partNumber)))
            .limit(1);
        }

        if (!stockItem) {
          const rawName = (item.description || partNumber).replace(/<[^>]*>/g, "").trim();
          const [created] = await tx.insert(stockItemsTable).values({
            companyId,
            code: partNumber,
            name: rawName || partNumber,
            uom: item.uom || "pcs",
            type: "product",
            unitPrice: String(item.unitPrice || "0"),
            stockQty: "0",
            isActive: true,
          }).returning();
          stockItem = created;
        }

        stockItemId = stockItem.id;
        const serialLines = (item.serialNumbers || "").split("\n").map((s: string) => s.trim()).filter(Boolean);
        const addQty = serialLines.length > 0 ? serialLines.length : (Number(item.qty) || 0);
        if (addQty <= 0) continue;

        const warehouseId = await resolveGrnLineWarehouseId(
          tx,
          companyId,
          item,
          poItems[idx],
          partNumber || stockItem.name || `item #${stockItemId}`,
        );

        // Defense in depth: if PO confirm already posted warehouse stock for this
        // item, never add again even when warehouseStockPosted JSON flag is missing.
        if (existing.poId) {
          const poNet = await loadPurchaseOrderNetPosted(tx, companyId, existing.poId);
          const alreadyFromPo = Array.from(poNet.values()).some(
            (entry) => entry.stockItemId === stockItemId && entry.qty > 0.0005,
          );
          if (alreadyFromPo) {
            items[idx] = { ...item, warehouseStockPosted: true, stockItemId, warehouseId };
            continue;
          }
        }

        // Also skip if this GRN already has a goods_receipt movement for the item
        // (idempotent re-receive / race).
        const [existingGrnMove] = await tx
          .select({ id: stockMovementsTable.id })
          .from(stockMovementsTable)
          .where(and(
            eq(stockMovementsTable.companyId, companyId),
            eq(stockMovementsTable.referenceType, "grn"),
            eq(stockMovementsTable.referenceId, id),
            eq(stockMovementsTable.stockItemId, stockItemId),
            eq(stockMovementsTable.transactionType, "goods_receipt"),
          ))
          .limit(1);
        if (existingGrnMove) {
          items[idx] = { ...item, warehouseStockPosted: true, stockItemId, warehouseId };
          continue;
        }

        if (serialLines.length > 0) {
          for (const sn of serialLines) {
            const exists = await tx.select({ id: stockSerialsTable.id })
              .from(stockSerialsTable)
              .where(and(
                eq(stockSerialsTable.companyId, companyId),
                eq(stockSerialsTable.stockItemId, stockItemId),
                eq(stockSerialsTable.serialNumber, sn)
              ))
              .limit(1);
            if (exists.length === 0) {
              await tx.insert(stockSerialsTable).values({
                companyId, stockItemId, serialNumber: sn,
                status: "available", grnId: id, grnNumber: existing.grnNumber,
              });
            }
          }
        }

        // STOCK IN to selected warehouse only — never touches another warehouse.
        console.log("[INVENTORY UPDATE]", JSON.stringify({
          transactionType: "grn",
          transactionId: id,
          warehouseId,
          stockItemId,
          quantity: addQty,
          movementType: "IN",
        }));
        await applyMovement(tx, {
          companyId,
          warehouseId,
          stockItemId,
          transactionType: "goods_receipt",
          documentNumber: existing.grnNumber,
          referenceType: "grn",
          referenceId: id,
          quantityIn: addQty,
          reference: existing.vendorName || existing.poNumber,
          userId: req.session.userId,
          username: req.session.username,
        });
        items[idx] = { ...item, warehouseStockPosted: true, stockItemId, warehouseId };
      }

      const [row] = await tx
        .update(grnTable)
        .set({ items, status: newStatus, updatedAt: new Date() })
        .where(eq(grnTable.id, id))
        .returning();

      return row;
    });

    res.json(updated);
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Failed to receive GRN" });
  }
});

router.delete("/grn/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [existing] = await db.select().from(grnTable).where(eq(grnTable.id, id));
  if (!existing) { res.status(404).json({ error: "GRN not found" }); return; }

  const companyId = existing.companyId;
  const items = (existing.items as any[]) || [];

  // Best-effort stock reverse in its own transaction (must not abort GRN delete)
  try {
    await db.transaction(async (tx) => {
      for (const item of items) {
        if (!item?.received) continue;
        if (item.warehouseStockPosted === true) continue;
        if (item.isStockItem !== true) continue;

        const partNumber = String(item.partNumber || "").trim();
        let stockItemId = Number(item.stockItemId) || 0;
        if (!stockItemId && partNumber) {
          const [stockItem] = await tx
            .select()
            .from(stockItemsTable)
            .where(and(eq(stockItemsTable.companyId, companyId), ilike(stockItemsTable.code, partNumber)))
            .limit(1);
          stockItemId = stockItem?.id || 0;
        }
        if (!stockItemId) continue;

        const serialLines = String(item.serialNumbers || "")
          .split("\n")
          .map((s: string) => s.trim())
          .filter(Boolean);
        const qty = serialLines.length > 0 ? serialLines.length : Number(item.qty) || 0;
        if (qty <= 0) continue;

        const warehouseId = Number(item.warehouseId);
        if (!warehouseId) {
          // Do not guess another warehouse — skip reverse rather than hit the wrong WH.
          continue;
        }
        await applyMovement(tx, {
          companyId,
          warehouseId,
          stockItemId,
          transactionType: "adjustment_out",
          documentNumber: existing.grnNumber,
          referenceType: "grn",
          referenceId: id,
          quantityOut: qty,
          reference: `Delete GRN ${existing.grnNumber}`,
          userId: req.session.userId,
          username: req.session.username,
        });
      }
    });
  } catch (stockErr: any) {
    req.log?.warn?.(
      { err: stockErr, grnId: id },
      "GRN delete: stock reverse skipped",
    );
  }

  try {
    await db.transaction(async (tx) => {
      await tx.delete(stockSerialsTable).where(eq(stockSerialsTable.grnId, id));
      await tx.delete(grnTable).where(eq(grnTable.id, id));
    });
    res.json({ success: true });
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Failed to delete GRN" });
  }
});

export default router;
