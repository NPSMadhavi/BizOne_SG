import { Router, type IRouter } from "express";
import { db, stockSerialsTable, stockItemsTable, grnTable } from "@workspace/db";
import { eq, and, inArray, ilike } from "drizzle-orm";

const router: IRouter = Router();

function requireAuth(req: any, res: any): boolean {
  if (!req.session.userId) { res.status(401).json({ error: "Not authenticated" }); return false; }
  return true;
}

router.get("/stock-serials", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const companyId = req.session.companyId;
  if (!companyId) { res.status(400).json({ error: "No company selected" }); return; }

  let stockItemId = req.query.stockItemId ? parseInt(req.query.stockItemId as string) : undefined;
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const partNumber = typeof req.query.partNumber === "string" ? req.query.partNumber : undefined;

  if (partNumber && !stockItemId) {
    const [found] = await db.select({ id: stockItemsTable.id })
      .from(stockItemsTable)
      .where(and(eq(stockItemsTable.companyId, companyId), ilike(stockItemsTable.code, partNumber)))
      .limit(1);
    if (found) stockItemId = found.id;
  }

  let rows = await db.select().from(stockSerialsTable).where(eq(stockSerialsTable.companyId, companyId));

  if (stockItemId) rows = rows.filter(r => r.stockItemId === stockItemId);
  if (status) rows = rows.filter(r => r.status === status);

  // Enrich older serials that have no batch columns yet: GRN line → stock item master.
  const needsBatch = rows.some((r) => !r.batchNo);
  if (needsBatch) {
    const grnIds = Array.from(new Set(rows.map((r) => r.grnId).filter((id): id is number => Number(id) > 0)));
    const grnById = new Map<number, any>();
    if (grnIds.length > 0) {
      const grns = await db.select().from(grnTable).where(eq(grnTable.companyId, companyId));
      for (const g of grns) {
        if (grnIds.includes(g.id)) grnById.set(g.id, g);
      }
    }
    const itemIds = Array.from(new Set(rows.map((r) => r.stockItemId)));
    const itemBatch = new Map<number, { batchNo?: string | null; expiryDate?: string | null; manufacturingDate?: string | null }>();
    if (itemIds.length > 0) {
      const items = await db
        .select({
          id: stockItemsTable.id,
          batchNo: stockItemsTable.batchNo,
          expiryDate: stockItemsTable.expiryDate,
          manufacturingDate: stockItemsTable.manufacturingDate,
        })
        .from(stockItemsTable)
        .where(and(eq(stockItemsTable.companyId, companyId), inArray(stockItemsTable.id, itemIds)));
      for (const it of items) itemBatch.set(it.id, it);
    }

    rows = rows.map((r) => {
      if (r.batchNo) return r;
      let batchNo: string | null = null;
      let expiryDate: string | null = null;
      let manufacturingDate: string | null = null;
      if (r.grnId && grnById.has(r.grnId)) {
        const items = (grnById.get(r.grnId).items as any[]) || [];
        const line = items.find((it) =>
          Number(it.stockItemId) === r.stockItemId
          || String(it.serialNumbers || "").split(/[\n,]+/).map((s: string) => s.trim()).includes(r.serialNumber),
        );
        if (line) {
          batchNo = typeof line.batchNo === "string" && line.batchNo.trim() ? line.batchNo.trim() : null;
          expiryDate = typeof line.expiryDate === "string" && line.expiryDate.trim() ? line.expiryDate.trim() : null;
          manufacturingDate = typeof line.manufacturingDate === "string" && line.manufacturingDate.trim()
            ? line.manufacturingDate.trim()
            : null;
        }
      }
      if (!batchNo) {
        const master = itemBatch.get(r.stockItemId);
        batchNo = master?.batchNo || null;
        expiryDate = expiryDate || master?.expiryDate || null;
        manufacturingDate = manufacturingDate || master?.manufacturingDate || null;
      }
      return { ...r, batchNo, expiryDate, manufacturingDate };
    });
  }

  res.json(rows);
});

router.put("/stock-serials/reserve", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const companyId = req.session.companyId;
  if (!companyId) { res.status(400).json({ error: "No company selected" }); return; }

  const { serialIds, invoiceId, invoiceNumber, reservedByUser } = req.body;
  if (!Array.isArray(serialIds) || serialIds.length === 0) {
    res.status(400).json({ error: "serialIds array required" }); return;
  }

  await db.update(stockSerialsTable)
    .set({ status: "reserved", invoiceId: invoiceId || null, invoiceNumber: invoiceNumber || null, reservedByUser: reservedByUser || null })
    .where(and(eq(stockSerialsTable.companyId, companyId), inArray(stockSerialsTable.id, serialIds)));

  res.json({ ok: true });
});

router.put("/stock-serials/release", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const companyId = req.session.companyId;
  if (!companyId) { res.status(400).json({ error: "No company selected" }); return; }

  const { serialIds } = req.body;
  if (!Array.isArray(serialIds) || serialIds.length === 0) {
    res.status(400).json({ error: "serialIds array required" }); return;
  }

  await db.update(stockSerialsTable)
    .set({ status: "available", invoiceId: null, invoiceNumber: null, reservedByUser: null })
    .where(and(eq(stockSerialsTable.companyId, companyId), inArray(stockSerialsTable.id, serialIds)));

  res.json({ ok: true });
});

export default router;
