import { Router, type IRouter } from "express";
import { db, grnTable, purchaseOrdersTable, stockItemsTable, stockSerialsTable } from "@workspace/db";
import { eq, desc, and, ilike } from "drizzle-orm";
import { nextDocNumber } from "../lib/running-numbers.js";
import { applyMovement, ensureDefaultWarehouse } from "../lib/inventory-service.js";

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

/**
 * On PO confirm: post stock-item lines into warehouse_stock so they appear in Stock Transfer.
 * Marks each posted line with warehouseStockPosted to avoid double-post on GRN receive.
 */
export async function postPurchaseOrderWarehouseStock(params: {
  po: any;
  userId?: number;
  username?: string;
}): Promise<any> {
  const { po, userId, username } = params;
  const companyId = po.companyId as number;
  const items = Array.isArray(po.items) ? [...(po.items as any[])] : [];
  if (items.length === 0) return po;

  const defaultWarehouseId = await ensureDefaultWarehouse(companyId);
  let changed = false;

  await db.transaction(async (tx) => {
    for (let idx = 0; idx < items.length; idx++) {
      const item = items[idx];
      if (!item || item.type === "section") continue;
      if (item.isStockItem !== true) continue;
      if (item.warehouseStockPosted === true) continue;

      const partNumber = String(item.partNumber || "").trim();
      if (!partNumber) continue;

      const addQty = Number(item.qty) || 0;
      if (addQty <= 0) continue;

      let stockItemId = Number(item.stockItemId) || 0;
      let [stockItem] = stockItemId
        ? await tx
            .select()
            .from(stockItemsTable)
            .where(and(eq(stockItemsTable.id, stockItemId), eq(stockItemsTable.companyId, companyId)))
            .limit(1)
        : [];

      if (!stockItem) {
        [stockItem] = await tx
          .select()
          .from(stockItemsTable)
          .where(and(eq(stockItemsTable.companyId, companyId), ilike(stockItemsTable.code, partNumber)))
          .limit(1);
      }

      if (!stockItem) {
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
      const warehouseId = Number(item.warehouseId) || defaultWarehouseId;

      await applyMovement(tx, {
        companyId,
        warehouseId,
        stockItemId,
        transactionType: "goods_receipt",
        documentNumber: po.poNumber,
        referenceType: "purchase_order",
        referenceId: po.id,
        quantityIn: addQty,
        reference: po.vendorName || po.poNumber,
        userId,
        username,
      });

      items[idx] = {
        ...item,
        stockItemId,
        warehouseId,
        warehouseStockPosted: true,
      };
      changed = true;
    }
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
  if (po.status !== "confirmed") { res.status(400).json({ error: "PO must be confirmed to create a GRN" }); return; }

  const existing = await db.select().from(grnTable).where(eq(grnTable.poId, poId));
  if (existing.length > 0) {
    res.json(existing[0]);
    return;
  }

  await autoCreateGrn(po, req.session.userId!);
  const [created] = await db.select().from(grnTable).where(eq(grnTable.poId, poId));
  res.status(201).json(created);
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
      const [row] = await tx
        .update(grnTable)
        .set({ items, status: newStatus, updatedAt: new Date() })
        .where(eq(grnTable.id, id))
        .returning();

      const defaultWarehouseId = await ensureDefaultWarehouse(companyId);

      // Only post stock for lines newly marked received (avoid double-counting)
      for (let idx = 0; idx < items.length; idx++) {
        const item = items[idx];
        if (!item?.received) continue;
        if (prevItems[idx]?.received) continue;
        // Already posted into warehouse when PO was confirmed
        if (item.warehouseStockPosted === true || prevItems[idx]?.warehouseStockPosted === true) continue;

        const partNumber = (item.partNumber || "").trim();
        const isStockItem = item.isStockItem === true;
        if (!isStockItem || !partNumber) continue;

        let stockItemId = Number(item.stockItemId) || 0;
        let [stockItem] = stockItemId
          ? await tx
              .select()
              .from(stockItemsTable)
              .where(and(eq(stockItemsTable.id, stockItemId), eq(stockItemsTable.companyId, companyId)))
              .limit(1)
          : [];

        if (!stockItem) {
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

        const warehouseId = Number(item.warehouseId) || defaultWarehouseId;

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

        // Post into warehouse stock — then Stock Transfer can see it
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
      }

      return row;
    });

    res.json(updated);
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Failed to receive GRN" });
  }
});

export default router;
