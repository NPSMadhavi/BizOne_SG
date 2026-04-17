import { Router, type IRouter } from "express";
import { db, stockSerialsTable, stockItemsTable } from "@workspace/db";
import { eq, and, inArray, sql, ilike } from "drizzle-orm";

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
