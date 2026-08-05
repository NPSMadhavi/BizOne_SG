import { Router, type IRouter } from "express";
import { db, taxFilingsTable, invoicesTable } from "@workspace/db";
import { eq, and, gte, lte, inArray, sql } from "drizzle-orm";

declare module "express-session" {
  interface SessionData { userId?: number; companyId?: number; isAdmin?: boolean; }
}

const router: IRouter = Router();

function requireAuth(req: any, res: any): boolean {
  if (!req.session.userId) { res.status(401).json({ error: "Not authenticated" }); return false; }
  return true;
}
function requireCompany(req: any, res: any): boolean {
  if (!req.session.companyId) { res.status(400).json({ error: "No company selected" }); return false; }
  return true;
}

function parseRec(r: any) {
  return {
    ...r,
    revenue:          r.revenue          != null ? parseFloat(r.revenue)          : null,
    chargeableIncome: r.chargeableIncome != null ? parseFloat(r.chargeableIncome) : null,
    taxPayable:       r.taxPayable       != null ? parseFloat(r.taxPayable)       : null,
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
    updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : r.updatedAt,
  };
}

// Fetch total invoice revenue for a company within a date range
async function fetchRevenue(companyId: number, from: string, to: string): Promise<number> {
  const rows = await db.select({ totalAmount: invoicesTable.totalAmount })
    .from(invoicesTable)
    .where(and(
      eq(invoicesTable.companyId, companyId),
      inArray(invoicesTable.status, ["confirmed", "paid", "partial"]),
      gte(sql`coalesce(${invoicesTable.issueDate}, ${invoicesTable.createdAt}::text::date::text)`, from),
      lte(sql`coalesce(${invoicesTable.issueDate}, ${invoicesTable.createdAt}::text::date::text)`, to),
    ));
  return rows.reduce((s, r) => s + parseFloat(r.totalAmount ?? "0"), 0);
}

// ── GET /tax-filings?type=eci&year=2024 ───────────────────────────────────────

router.get("/tax-filings", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  try {
    const companyId = req.session.companyId!;
    const type = (req.query.type as string) || "eci";
    const year = parseInt(req.query.year as string) || new Date().getFullYear() - 1;

    // Determine FY date range (assume Dec year-end unless fyEndDate stored)
    const fyStart = `${year}-01-01`;
    const fyEnd   = `${year}-12-31`;

    // Auto-fetch revenue from invoices
    const computedRevenue = await fetchRevenue(companyId, fyStart, fyEnd);

    // Check if there's a saved filing
    const [existing] = await db.select().from(taxFilingsTable)
      .where(and(
        eq(taxFilingsTable.companyId, companyId),
        eq(taxFilingsTable.type, type),
        eq(taxFilingsTable.financialYear, year),
      )).limit(1);

    res.json({
      filing: existing ? parseRec(existing) : null,
      computedRevenue: +computedRevenue.toFixed(2),
      fyStart,
      fyEnd,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to fetch tax filing" });
  }
});

// ── POST /tax-filings ─────────────────────────────────────────────────────────

router.post("/tax-filings", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  try {
    const companyId = req.session.companyId!;
    const { type, financialYear, fyEndDate, revenue, chargeableIncome, taxPayable,
            status, filedDate, referenceNo, data, notes } = req.body;

    if (!type || !financialYear) {
      res.status(400).json({ error: "type and financialYear are required" }); return;
    }

    // Upsert: delete existing and re-insert
    await db.delete(taxFilingsTable).where(and(
      eq(taxFilingsTable.companyId, companyId),
      eq(taxFilingsTable.type, type),
      eq(taxFilingsTable.financialYear, parseInt(financialYear)),
    ));

    const [rec] = await db.insert(taxFilingsTable).values({
      companyId,
      type,
      financialYear:    parseInt(financialYear),
      fyEndDate:        fyEndDate || null,
      revenue:          revenue    != null ? String(parseFloat(revenue).toFixed(2))    : null,
      chargeableIncome: chargeableIncome != null ? String(parseFloat(chargeableIncome).toFixed(2)) : null,
      taxPayable:       taxPayable != null ? String(parseFloat(taxPayable).toFixed(2)) : null,
      status:           status || "draft",
      filedDate:        filedDate || null,
      referenceNo:      referenceNo || null,
      data:             data || {},
      notes:            notes || null,
      createdBy:        req.session.userId,
    }).returning();

    res.status(201).json(parseRec(rec));
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to save tax filing" });
  }
});

// ── PUT /tax-filings/:id ──────────────────────────────────────────────────────

router.put("/tax-filings/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  try {
    const companyId = req.session.companyId!;
    const id = parseInt(req.params.id);
    const [existing] = await db.select().from(taxFilingsTable)
      .where(and(eq(taxFilingsTable.id, id), eq(taxFilingsTable.companyId, companyId))).limit(1);
    if (!existing) { res.status(404).json({ error: "Filing not found" }); return; }

    const { revenue, chargeableIncome, taxPayable, status, filedDate,
            referenceNo, data, notes, fyEndDate } = req.body;

    const [updated] = await db.update(taxFilingsTable).set({
      fyEndDate:        fyEndDate        ?? existing.fyEndDate,
      revenue:          revenue    != null ? String(parseFloat(revenue).toFixed(2))    : existing.revenue,
      chargeableIncome: chargeableIncome != null ? String(parseFloat(chargeableIncome).toFixed(2)) : existing.chargeableIncome,
      taxPayable:       taxPayable != null ? String(parseFloat(taxPayable).toFixed(2)) : existing.taxPayable,
      status:           status           ?? existing.status,
      filedDate:        filedDate        ?? existing.filedDate,
      referenceNo:      referenceNo      ?? existing.referenceNo,
      data:             data             ?? existing.data,
      notes:            notes            ?? existing.notes,
      updatedAt:        new Date(),
    }).where(eq(taxFilingsTable.id, id)).returning();

    res.json(parseRec(updated));
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to update tax filing" });
  }
});

export default router;
