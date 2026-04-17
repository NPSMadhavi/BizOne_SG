import { Router, type IRouter } from "express";
import { db, grnTable, purchaseOrdersTable, stockItemsTable, stockSerialsTable } from "@workspace/db";
import { eq, desc, and, ilike, sql } from "drizzle-orm";
import { nextDocNumber } from "../lib/running-numbers.js";

declare module "express-session" {
  interface SessionData {
    userId?: number;
    companyId?: number;
    isAdmin?: boolean;
    userRole?: string;
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
  const newStatus = computeGrnStatus(items);

  const [updated] = await db
    .update(grnTable)
    .set({ items, status: newStatus, updatedAt: new Date() })
    .where(eq(grnTable.id, id))
    .returning();

  const receivedItems = items.filter((i: any) => i.received);
  for (const item of receivedItems) {
    const partNumber = (item.partNumber || "").trim();
    const isStockItem = item.isStockItem === true;

    if (!isStockItem) continue;
    if (!partNumber) continue;

    let [stockItem] = await db
      .select()
      .from(stockItemsTable)
      .where(and(eq(stockItemsTable.companyId, companyId), ilike(stockItemsTable.code, partNumber)))
      .limit(1);

    if (!stockItem) {
      const rawName = (item.description || partNumber).replace(/<[^>]*>/g, "").trim();
      const [created] = await db.insert(stockItemsTable).values({
        companyId,
        code: partNumber,
        name: rawName || partNumber,
        uom: "pcs",
        type: "product",
        unitPrice: String(item.unitPrice || "0"),
        stockQty: "0",
        isActive: true,
      }).returning();
      stockItem = created;
    }

    const addQty = Number(item.qty) || 0;

    const serialLines = (item.serialNumbers || "").split("\n").map((s: string) => s.trim()).filter(Boolean);
    if (serialLines.length > 0) {
      for (const sn of serialLines) {
        const exists = await db.select({ id: stockSerialsTable.id })
          .from(stockSerialsTable)
          .where(and(
            eq(stockSerialsTable.companyId, companyId),
            eq(stockSerialsTable.stockItemId, stockItem.id),
            eq(stockSerialsTable.serialNumber, sn)
          ))
          .limit(1);
        if (exists.length === 0) {
          await db.insert(stockSerialsTable).values({
            companyId, stockItemId: stockItem.id, serialNumber: sn,
            status: "available", grnId: id, grnNumber: existing.grnNumber,
          });
        }
      }
      await db.update(stockItemsTable)
        .set({ stockQty: sql`${stockItemsTable.stockQty} + ${serialLines.length}` })
        .where(eq(stockItemsTable.id, stockItem.id));
    } else {
      await db.update(stockItemsTable)
        .set({ stockQty: sql`${stockItemsTable.stockQty} + ${addQty}` })
        .where(eq(stockItemsTable.id, stockItem.id));
    }
  }

  res.json(updated);
});

export default router;
