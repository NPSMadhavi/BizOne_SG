import { Router, type IRouter } from "express";
import { db, financialYearsTable, companiesTable } from "@workspace/db";
import { eq, and, asc, desc } from "drizzle-orm";
import { logAudit } from "../lib/audit.js";
import { isSingaporeCountry } from "../lib/singapore.js";
import {
  ensureFinancialYears,
  buildClosingChecklist,
  previewOpeningBalances,
  generateOpeningBalancesIdempotent,
  nextFyBounds,
  assertPeriodWritable,
  findFyForDate,
  getActiveFinancialYear,
} from "../lib/financial-year.js";

const router: IRouter = Router();

function requireAuth(req: any, res: any): boolean {
  if (!req.session.userId) {
    res.status(401).json({ error: "Not authenticated" });
    return false;
  }
  return true;
}

function requireCompany(req: any, res: any): boolean {
  if (!req.session.companyId) {
    res.status(400).json({ error: "No company selected" });
    return false;
  }
  return true;
}

async function requireSingapore(req: any, res: any): Promise<boolean> {
  const companyId = req.session.companyId;
  if (!companyId) {
    res.status(400).json({ error: "No company selected" });
    return false;
  }
  const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, companyId)).limit(1);
  if (!company || !isSingaporeCountry(company.country)) {
    res.status(403).json({ error: "Accounting features are only available for Singapore companies." });
    return false;
  }
  return true;
}

function canCloseActivate(req: any): boolean {
  return !!(req.session.isAdmin || req.session.role === "accountant" || req.session.role === "Administrator");
}

// GET /financial-years
router.get("/financial-years", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  if (!(await requireSingapore(req, res))) return;
  const companyId = req.session.companyId!;
  const years = await ensureFinancialYears(companyId);
  const active = years.find((y) => y.status === "active") || null;
  res.json({ years, active });
});

// GET /financial-years/for-date?date=YYYY-MM-DD
router.get("/financial-years/for-date", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  if (!(await requireSingapore(req, res))) return;
  const companyId = req.session.companyId!;
  await ensureFinancialYears(companyId);
  const date = String(req.query.date || "");
  const fy = await findFyForDate(companyId, date);
  const active = await getActiveFinancialYear(companyId);
  res.json({
    financialYear: fy,
    active,
    readOnly: fy?.status === "closed",
    access: fy?.status === "closed" ? "VIEW_ONLY" : "FULL",
  });
});

// GET /financial-years/:id/checklist
router.get("/financial-years/:id/checklist", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  if (!(await requireSingapore(req, res))) return;
  const id = Number(req.params.id);
  const checklist = await buildClosingChecklist(req.session.companyId!, id);
  if (!checklist) {
    res.status(404).json({ error: "Financial year not found" });
    return;
  }
  res.json(checklist);
});

// POST /financial-years/:id/mark-audit-completed
router.post("/financial-years/:id/mark-audit-completed", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  if (!(await requireSingapore(req, res))) return;
  if (!canCloseActivate(req)) {
    res.status(403).json({ error: "Only admin/accountant can update audit status" });
    return;
  }
  const id = Number(req.params.id);
  const companyId = req.session.companyId!;
  const [fy] = await db
    .select()
    .from(financialYearsTable)
    .where(and(eq(financialYearsTable.id, id), eq(financialYearsTable.companyId, companyId)))
    .limit(1);
  if (!fy) {
    res.status(404).json({ error: "Financial year not found" });
    return;
  }
  const [updated] = await db
    .update(financialYearsTable)
    .set({ auditStatus: "completed" })
    .where(eq(financialYearsTable.id, id))
    .returning();
  logAudit({
    req,
    action: "update",
    entityType: "financial_year",
    entityId: id,
    entityLabel: `${fy.label} audit completed`,
    details: { previousStatus: fy.auditStatus, newStatus: "completed" },
  });
  res.json(updated);
});

// POST /financial-years/:id/close
router.post("/financial-years/:id/close", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  if (!(await requireSingapore(req, res))) return;
  if (!canCloseActivate(req)) {
    res.status(403).json({ error: "Only admin/accountant can close a financial year" });
    return;
  }
  const id = Number(req.params.id);
  const companyId = req.session.companyId!;
  const checklist = await buildClosingChecklist(companyId, id);
  if (!checklist) {
    res.status(404).json({ error: "Financial year not found" });
    return;
  }
  if (!checklist.canClose) {
    const backupFailed = (checklist.items || []).some((i: any) => i.key === "backup" && !i.ok);
    res.status(400).json({
      error: backupFailed
        ? "Financial year closing cannot continue because the required backup was not completed successfully."
        : "Year-end validation failed. Complete the checklist before closing.",
      checklist,
    });
    return;
  }

  const fy = checklist.financialYear;
  const next = nextFyBounds(fy.startDate);

  const result = await db.transaction(async (tx) => {
    const [closed] = await tx
      .update(financialYearsTable)
      .set({
        status: "closed",
        closedAt: new Date(),
        closedBy: req.session.userId,
        closedByUsername: req.session.username || null,
      })
      .where(eq(financialYearsTable.id, id))
      .returning();

    let [nextFy] = await tx
      .select()
      .from(financialYearsTable)
      .where(
        and(
          eq(financialYearsTable.companyId, companyId),
          eq(financialYearsTable.startDate, next.start),
          eq(financialYearsTable.endDate, next.end),
        ),
      )
      .limit(1);

    if (!nextFy) {
      [nextFy] = await tx
        .insert(financialYearsTable)
        .values({
          companyId,
          label: next.label,
          startDate: next.start,
          endDate: next.end,
          status: "inactive",
          auditStatus: "pending",
        })
        .returning();
    }

    return { closed, nextFy };
  });

  logAudit({
    req,
    action: "close",
    entityType: "financial_year",
    entityId: id,
    entityLabel: fy.label,
    details: {
      previousStatus: fy.status,
      newStatus: "closed",
      nextYear: result.nextFy.label,
    },
  });

  res.json({
    message: `${fy.label} closed. ${result.nextFy.label} is inactive until activated.`,
    closed: result.closed,
    next: result.nextFy,
  });
});

// GET /financial-years/:id/opening-balance-preview  (previous year id)
router.get("/financial-years/:id/opening-balance-preview", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  if (!(await requireSingapore(req, res))) return;
  try {
    const preview = await previewOpeningBalances(req.session.companyId!, Number(req.params.id));
    res.json(preview);
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Failed to preview opening balances" });
  }
});

// POST /financial-years/:id/activate  — id is the NEW (inactive) year
router.post("/financial-years/:id/activate", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  if (!(await requireSingapore(req, res))) return;
  if (!canCloseActivate(req)) {
    res.status(403).json({ error: "Only admin/accountant can activate a financial year" });
    return;
  }
  const companyId = req.session.companyId!;
  const newId = Number(req.params.id);

  const [newFy] = await db
    .select()
    .from(financialYearsTable)
    .where(and(eq(financialYearsTable.id, newId), eq(financialYearsTable.companyId, companyId)))
    .limit(1);
  if (!newFy) {
    res.status(404).json({ error: "Financial year not found" });
    return;
  }
  if (newFy.status === "active") {
    res.json({ message: "Already active", financialYear: newFy });
    return;
  }
  if (newFy.status === "closed") {
    res.status(400).json({ error: "Cannot activate a closed year" });
    return;
  }

  // Previous year must be closed
  const years = await db
    .select()
    .from(financialYearsTable)
    .where(eq(financialYearsTable.companyId, companyId))
    .orderBy(asc(financialYearsTable.startDate));
  const prev = years.filter((y) => y.endDate < newFy.startDate).sort((a, b) => b.endDate.localeCompare(a.endDate))[0];
  if (prev && prev.status !== "closed") {
    res.status(400).json({
      error: `Close ${prev.label} before activating ${newFy.label}.`,
    });
    return;
  }

  try {
    if (prev) {
      await generateOpeningBalancesIdempotent({
        companyId,
        previousFyId: prev.id,
        newFyId: newId,
        userId: req.session.userId!,
      });
    }

    // Deactivate any other active year, activate this one
    await db
      .update(financialYearsTable)
      .set({ status: "inactive" })
      .where(and(eq(financialYearsTable.companyId, companyId), eq(financialYearsTable.status, "active")));

    const [activated] = await db
      .update(financialYearsTable)
      .set({
        status: "active",
        activatedAt: new Date(),
        activatedBy: req.session.userId,
        activatedByUsername: req.session.username || null,
      })
      .where(eq(financialYearsTable.id, newId))
      .returning();

    logAudit({
      req,
      action: "activate",
      entityType: "financial_year",
      entityId: newId,
      entityLabel: newFy.label,
      details: {
        previousStatus: newFy.status,
        newStatus: "active",
        previousYear: prev?.label,
        openingBalancesGenerated: true,
      },
    });

    res.json({
      message: `${activated.label} is now ACTIVE. New transactions are allowed.`,
      financialYear: activated,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Activation failed" });
  }
});

// POST /financial-years/:id/reopen
router.post("/financial-years/:id/reopen", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  if (!(await requireSingapore(req, res))) return;
  if (!req.session.isAdmin) {
    res.status(403).json({ error: "Only administrators can reopen a closed financial year" });
    return;
  }
  const id = Number(req.params.id);
  const companyId = req.session.companyId!;
  const [fy] = await db
    .select()
    .from(financialYearsTable)
    .where(and(eq(financialYearsTable.id, id), eq(financialYearsTable.companyId, companyId)))
    .limit(1);
  if (!fy) {
    res.status(404).json({ error: "Financial year not found" });
    return;
  }
  if (fy.status !== "closed") {
    res.status(400).json({ error: "Only closed years can be reopened" });
    return;
  }

  // Set other actives to inactive, reopen this as active
  await db
    .update(financialYearsTable)
    .set({ status: "inactive" })
    .where(and(eq(financialYearsTable.companyId, companyId), eq(financialYearsTable.status, "active")));

  const [reopened] = await db
    .update(financialYearsTable)
    .set({
      status: "active",
      reopenedAt: new Date(),
      reopenedBy: req.session.userId,
      closedAt: null,
      closedBy: null,
      closedByUsername: null,
    })
    .where(eq(financialYearsTable.id, id))
    .returning();

  logAudit({
    req,
    action: "reopen",
    entityType: "financial_year",
    entityId: id,
    entityLabel: fy.label,
    details: { previousStatus: "closed", newStatus: "active" },
  });

  res.json({ message: `${reopened.label} reopened (ACTIVE).`, financialYear: reopened });
});

// POST /financial-years/assert-writable  { date }
router.post("/financial-years/assert-writable", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  const result = await assertPeriodWritable(req.session.companyId!, req.body?.date);
  if (!result.ok) {
    res.status(result.status).json({ error: result.error, writable: false });
    return;
  }
  res.json({ writable: true });
});

export default router;
