import { Router, type IRouter } from "express";
import { db, whtRecordsTable, vendorsTable, companiesTable } from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { logAudit } from "../lib/audit.js";

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

// Calculate filing deadline: 1 calendar month from payment date
function filingDeadline(paymentDate: string): string {
  const d = new Date(paymentDate);
  d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 10);
}

function parseRec(r: any) {
  return {
    ...r,
    grossAmount: parseFloat(r.grossAmount ?? "0"),
    whtRate:     parseFloat(r.whtRate ?? "0"),
    whtAmount:   parseFloat(r.whtAmount ?? "0"),
    netAmount:   parseFloat(r.netAmount ?? "0"),
    createdAt:   r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
  };
}

// ── GET /wht ─────────────────────────────────────────────────────────────────

router.get("/wht", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  try {
    const companyId = req.session.companyId!;
    const rows = await db.select().from(whtRecordsTable)
      .where(eq(whtRecordsTable.companyId, companyId))
      .orderBy(desc(whtRecordsTable.paymentDate), desc(whtRecordsTable.id));

    // Summary
    const total    = rows.length;
    const pending  = rows.filter(r => r.status === "pending").length;
    const filed    = rows.filter(r => r.status === "filed").length;
    const totalWht = rows.reduce((s, r) => s + parseFloat(r.whtAmount ?? "0"), 0);
    const overdue  = rows.filter(r =>
      r.status === "pending" && r.filingDeadline && r.filingDeadline < new Date().toISOString().slice(0, 10)
    ).length;

    // Pre-fill vendor list for the form
    const vendors = await db.select({ name: vendorsTable.name, country: vendorsTable.country })
      .from(vendorsTable)
      .where(and(eq(vendorsTable.companyId, companyId), eq(vendorsTable.isActive, true)))
      .orderBy(vendorsTable.name);

    res.json({
      records: rows.map(parseRec),
      summary: { total, pending, filed, overdue, totalWht: +totalWht.toFixed(2) },
      vendors,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to fetch WHT records" });
  }
});

// ── POST /wht ─────────────────────────────────────────────────────────────────

router.post("/wht", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  try {
    const companyId = req.session.companyId!;
    const { vendorName, vendorCountry, paymentDate, nature, paymentType, currency,
            grossAmount, whtRate, notes } = req.body;

    if (!vendorName || !paymentDate || !nature || !paymentType || grossAmount == null || whtRate == null) {
      res.status(400).json({ error: "Missing required fields" }); return;
    }

    const gross   = parseFloat(grossAmount);
    const rate    = parseFloat(whtRate);
    const whtAmt  = +(gross * rate / 100).toFixed(2);
    const netAmt  = +(gross - whtAmt).toFixed(2);
    const deadline = filingDeadline(paymentDate);

    const [rec] = await db.insert(whtRecordsTable).values({
      companyId,
      vendorName,
      vendorCountry: vendorCountry || null,
      paymentDate,
      nature,
      paymentType,
      currency:       currency || "SGD",
      grossAmount:    gross.toFixed(2),
      whtRate:        rate.toFixed(2),
      whtAmount:      whtAmt.toFixed(2),
      netAmount:      netAmt.toFixed(2),
      filingDeadline: deadline,
      status:         "pending",
      notes:          notes || null,
      createdBy:      req.session.userId,
    }).returning();

    await logAudit(req.session.userId!, companyId, "WHT", rec.id, "CREATE", null, rec);
    res.status(201).json(parseRec(rec));
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to create WHT record" });
  }
});

// ── PUT /wht/:id ──────────────────────────────────────────────────────────────

router.put("/wht/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  try {
    const companyId = req.session.companyId!;
    const id = parseInt(req.params.id);
    const [existing] = await db.select().from(whtRecordsTable)
      .where(and(eq(whtRecordsTable.id, id), eq(whtRecordsTable.companyId, companyId))).limit(1);
    if (!existing) { res.status(404).json({ error: "Record not found" }); return; }

    const { action, referenceNo, filedDate, vendorName, vendorCountry, paymentDate,
            nature, paymentType, currency, grossAmount, whtRate, notes } = req.body;

    if (action === "mark_filed") {
      const [updated] = await db.update(whtRecordsTable)
        .set({ status: "filed", filedDate: filedDate || new Date().toISOString().slice(0, 10), referenceNo: referenceNo || null })
        .where(eq(whtRecordsTable.id, id)).returning();
      await logAudit(req.session.userId!, companyId, "WHT", id, "UPDATE", existing, updated);
      res.json(parseRec(updated));
      return;
    }

    if (action === "unfile") {
      const [updated] = await db.update(whtRecordsTable)
        .set({ status: "pending", filedDate: null, referenceNo: null })
        .where(eq(whtRecordsTable.id, id)).returning();
      res.json(parseRec(updated));
      return;
    }

    // Full update
    const gross  = parseFloat(grossAmount ?? existing.grossAmount);
    const rate   = parseFloat(whtRate    ?? existing.whtRate);
    const whtAmt = +(gross * rate / 100).toFixed(2);
    const netAmt = +(gross - whtAmt).toFixed(2);
    const pDate  = paymentDate || existing.paymentDate;

    const [updated] = await db.update(whtRecordsTable).set({
      vendorName:     vendorName     || existing.vendorName,
      vendorCountry:  vendorCountry  ?? existing.vendorCountry,
      paymentDate:    pDate,
      nature:         nature         || existing.nature,
      paymentType:    paymentType    || existing.paymentType,
      currency:       currency       || existing.currency,
      grossAmount:    gross.toFixed(2),
      whtRate:        rate.toFixed(2),
      whtAmount:      whtAmt.toFixed(2),
      netAmount:      netAmt.toFixed(2),
      filingDeadline: filingDeadline(pDate),
      notes:          notes ?? existing.notes,
    }).where(eq(whtRecordsTable.id, id)).returning();

    await logAudit(req.session.userId!, companyId, "WHT", id, "UPDATE", existing, updated);
    res.json(parseRec(updated));
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to update WHT record" });
  }
});

// ── DELETE /wht/:id ───────────────────────────────────────────────────────────

router.delete("/wht/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  if (!req.session.isAdmin) { res.status(403).json({ error: "Admin only" }); return; }
  try {
    const companyId = req.session.companyId!;
    const id = parseInt(req.params.id);
    const [existing] = await db.select().from(whtRecordsTable)
      .where(and(eq(whtRecordsTable.id, id), eq(whtRecordsTable.companyId, companyId))).limit(1);
    if (!existing) { res.status(404).json({ error: "Record not found" }); return; }
    await db.delete(whtRecordsTable).where(eq(whtRecordsTable.id, id));
    await logAudit(req.session.userId!, companyId, "WHT", id, "DELETE", existing, null);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to delete WHT record" });
  }
});

export default router;
