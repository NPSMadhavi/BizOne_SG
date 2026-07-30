import { Router, type IRouter } from "express";
import { db, incomeRecordsTable, companiesTable, accountsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { logAudit } from "../lib/audit.js";
import { postIncomeJE, reverseIncomeJE } from "../lib/income-auto-post.js";

const router: IRouter = Router();

function requireAuth(req: any, res: any): boolean {
  if (!req.session.userId) { res.status(401).json({ error: "Not authenticated" }); return false; }
  return true;
}
function requireCompany(req: any, res: any): boolean {
  if (!req.session.companyId) { res.status(400).json({ error: "No company selected" }); return false; }
  return true;
}
async function requireSingapore(req: any, res: any): Promise<boolean> {
  const companyId = req.session.companyId;
  if (!companyId) { res.status(400).json({ error: "No company selected" }); return false; }
  const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, companyId)).limit(1);
  if (!company || company.country?.toLowerCase() !== "singapore") {
    res.status(403).json({ error: "Income module is only available for Singapore companies." });
    return false;
  }
  return true;
}

// ── List ──────────────────────────────────────────────────────────────────────
router.get("/income", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  if (!(await requireSingapore(req, res))) return;

  const companyId = req.session.companyId!;
  const records = await db.select()
    .from(incomeRecordsTable)
    .where(eq(incomeRecordsTable.companyId, companyId))
    .orderBy(desc(incomeRecordsTable.incomeDate), desc(incomeRecordsTable.createdAt));

  res.json(records);
});

// ── Get one ───────────────────────────────────────────────────────────────────
router.get("/income/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  if (!(await requireSingapore(req, res))) return;

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [record] = await db.select()
    .from(incomeRecordsTable)
    .where(and(eq(incomeRecordsTable.id, id), eq(incomeRecordsTable.companyId, req.session.companyId!)))
    .limit(1);
  if (!record) { res.status(404).json({ error: "Income record not found" }); return; }

  // Fetch account name if linked
  let accountName: string | null = null;
  if (record.accountId) {
    const [acct] = await db.select({ name: accountsTable.name, code: accountsTable.code })
      .from(accountsTable).where(eq(accountsTable.id, record.accountId)).limit(1);
    if (acct) accountName = `${acct.code} ${acct.name}`;
  }

  res.json({ ...record, accountName });
});

// ── Create ────────────────────────────────────────────────────────────────────
router.post("/income", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  if (!(await requireSingapore(req, res))) return;

  const companyId = req.session.companyId!;
  const {
    incomeDate, payerName, description, category,
    amount, gstAmount, gstTreatment, currency, exchangeRate,
    paymentMethod, accountId, reference, notes, status,
  } = req.body;

  if (!incomeDate) { res.status(400).json({ error: "Income date is required" }); return; }
  if (!payerName?.trim()) { res.status(400).json({ error: "Payer name is required" }); return; }
  if (!description?.trim()) { res.status(400).json({ error: "Description is required" }); return; }
  if (!category) { res.status(400).json({ error: "Category is required" }); return; }
  if (!amount || isNaN(parseFloat(amount))) { res.status(400).json({ error: "Amount is required" }); return; }

  const [created] = await db.insert(incomeRecordsTable).values({
    companyId,
    incomeDate,
    payerName:    payerName.trim(),
    description:  description.trim(),
    category,
    amount:       parseFloat(amount).toFixed(2),
    gstAmount:    parseFloat(gstAmount ?? 0).toFixed(2),
    gstTreatment: gstTreatment || "standard_rated",
    currency:     currency || "SGD",
    exchangeRate: parseFloat(exchangeRate ?? "1").toFixed(6) as any,
    paymentMethod: paymentMethod || "bank_transfer",
    accountId:    accountId ? parseInt(accountId) : null,
    reference:    reference?.trim() || null,
    notes:        notes || null,
    status:       status || "draft",
    createdBy:    req.session.userId!,
  }).returning();

  logAudit({ req, action: "create", entityType: "income_record", entityId: created.id, entityLabel: `${created.category} — ${created.payerName}` });
  res.status(201).json(created);
});

// ── Update ────────────────────────────────────────────────────────────────────
router.put("/income/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  if (!(await requireSingapore(req, res))) return;

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [existing] = await db.select().from(incomeRecordsTable)
    .where(and(eq(incomeRecordsTable.id, id), eq(incomeRecordsTable.companyId, req.session.companyId!)))
    .limit(1);
  if (!existing) { res.status(404).json({ error: "Income record not found" }); return; }
  if (existing.status === "confirmed" && !req.session.isAdmin && req.session.userRole !== "accountant") {
    res.status(403).json({ error: "Only admins and accountants can edit confirmed income records." }); return;
  }
  if (existing.status === "void") {
    res.status(400).json({ error: "Cannot edit a voided income record." }); return;
  }

  const {
    incomeDate, payerName, description, category,
    amount, gstAmount, gstTreatment, currency, exchangeRate,
    paymentMethod, accountId, reference, notes, status,
  } = req.body;

  const updateData: any = { updatedAt: new Date() };
  if (incomeDate !== undefined)     updateData.incomeDate    = incomeDate;
  if (payerName !== undefined)      updateData.payerName     = payerName.trim();
  if (description !== undefined)    updateData.description   = description.trim();
  if (category !== undefined)       updateData.category      = category;
  if (amount !== undefined)         updateData.amount        = parseFloat(amount).toFixed(2);
  if (gstAmount !== undefined)      updateData.gstAmount     = parseFloat(gstAmount ?? 0).toFixed(2);
  if (gstTreatment !== undefined)   updateData.gstTreatment  = gstTreatment;
  if (currency !== undefined)       updateData.currency      = currency;
  if (exchangeRate !== undefined)   updateData.exchangeRate  = parseFloat(exchangeRate).toFixed(6);
  if (paymentMethod !== undefined)  updateData.paymentMethod = paymentMethod;
  if (accountId !== undefined)      updateData.accountId     = accountId ? parseInt(accountId) : null;
  if (reference !== undefined)      updateData.reference     = reference?.trim() || null;
  if (notes !== undefined)          updateData.notes         = notes || null;
  if (status !== undefined)         updateData.status        = status;

  const [updated] = await db.update(incomeRecordsTable).set(updateData)
    .where(eq(incomeRecordsTable.id, id)).returning();

  logAudit({ req, action: "update", entityType: "income_record", entityId: id, entityLabel: updated.payerName });
  res.json(updated);
});

// ── Delete ────────────────────────────────────────────────────────────────────
router.delete("/income/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  if (!(await requireSingapore(req, res))) return;

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [existing] = await db.select().from(incomeRecordsTable)
    .where(and(eq(incomeRecordsTable.id, id), eq(incomeRecordsTable.companyId, req.session.companyId!)))
    .limit(1);
  if (!existing) { res.status(404).json({ error: "Income record not found" }); return; }

  if (!req.session.isAdmin && req.session.userRole !== "accountant") {
    res.status(403).json({ error: "Only admins and accountants can delete income records." }); return;
  }

  await db.delete(incomeRecordsTable).where(eq(incomeRecordsTable.id, id));
  logAudit({ req, action: "delete", entityType: "income_record", entityId: id, entityLabel: existing.payerName });
  res.json({ success: true });
});

// ── Confirm ───────────────────────────────────────────────────────────────────
router.post("/income/:id/confirm", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  if (!(await requireSingapore(req, res))) return;

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [existing] = await db.select().from(incomeRecordsTable)
    .where(and(eq(incomeRecordsTable.id, id), eq(incomeRecordsTable.companyId, req.session.companyId!)))
    .limit(1);
  if (!existing) { res.status(404).json({ error: "Income record not found" }); return; }
  if (existing.status === "confirmed") { res.status(400).json({ error: "Already confirmed." }); return; }
  if (existing.status === "void") { res.status(400).json({ error: "Cannot confirm a voided record." }); return; }

  const [updated] = await db.update(incomeRecordsTable)
    .set({ status: "confirmed", updatedAt: new Date() })
    .where(eq(incomeRecordsTable.id, id)).returning();

  // Auto-post journal entry
  await postIncomeJE(
    {
      id:           updated.id,
      companyId:    updated.companyId,
      incomeDate:   updated.incomeDate,
      description:  updated.description,
      amount:       updated.amount,
      gstAmount:    updated.gstAmount,
      gstTreatment: updated.gstTreatment,
      accountId:    updated.accountId,
    },
    req.session.userId!,
    req.log,
  );

  logAudit({ req, action: "status:confirmed", entityType: "income_record", entityId: id, entityLabel: updated.payerName });
  res.json(updated);
});

// ── Void ──────────────────────────────────────────────────────────────────────
router.post("/income/:id/void", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  if (!(await requireSingapore(req, res))) return;

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [existing] = await db.select().from(incomeRecordsTable)
    .where(and(eq(incomeRecordsTable.id, id), eq(incomeRecordsTable.companyId, req.session.companyId!)))
    .limit(1);
  if (!existing) { res.status(404).json({ error: "Income record not found" }); return; }
  if (existing.status === "void") { res.status(400).json({ error: "Already voided." }); return; }

  if (!req.session.isAdmin) {
    res.status(403).json({ error: "Only admins can void income records." }); return;
  }

  const [updated] = await db.update(incomeRecordsTable)
    .set({ status: "void", updatedAt: new Date() })
    .where(eq(incomeRecordsTable.id, id)).returning();

  // Reverse JE if it was confirmed
  if (existing.status === "confirmed") {
    await reverseIncomeJE(id, existing.companyId, existing.description, req.session.userId!, req.log);
  }

  logAudit({ req, action: "status:void", entityType: "income_record", entityId: id, entityLabel: updated.payerName });
  res.json(updated);
});

export default router;
