import { Router, type IRouter } from "express";
import { db, companyDbContext, pool, expensesTable, companiesTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { logAudit } from "../lib/audit.js";
import { postExpenseJE, reverseExpenseJE, backfillExpenseJEs } from "../lib/expense-auto-post.js";
import { isSingaporeCountry } from "../lib/singapore.js";
import { assertPeriodWritable } from "../lib/financial-year.js";
import { sanitizeErrorMessage, logServerError } from "../lib/safe-error.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

const expensesSchemaHealed = new WeakSet<object>();

/** Ensure expenses table exists and has all columns on the active company pool. */
export async function ensureExpensesSchema(): Promise<void> {
  const currentPool: any = companyDbContext.getStore() ?? pool;
  if (currentPool && expensesSchemaHealed.has(currentPool)) return;

  await currentPool.query(`
    CREATE TABLE IF NOT EXISTS expenses (
      id              serial PRIMARY KEY,
      company_id      integer NOT NULL,
      expense_date    text NOT NULL,
      vendor_name     text NOT NULL,
      description     text NOT NULL,
      category        text NOT NULL,
      account_id      integer,
      amount          numeric(15,2) NOT NULL,
      gst_amount      numeric(15,2) NOT NULL DEFAULT 0,
      gst_claimable   boolean NOT NULL DEFAULT false,
      is_deductible   boolean NOT NULL DEFAULT true,
      deductible_pct  integer NOT NULL DEFAULT 100,
      currency        text NOT NULL DEFAULT 'SGD',
      payment_method  text DEFAULT 'bank_transfer',
      receipt_data    text,
      receipt_mime_type text,
      vendor_id       integer,
      project_id      integer,
      voucher_id      integer,
      journal_entry_id integer,
      status          text NOT NULL DEFAULT 'draft',
      notes           text,
      created_by      integer NOT NULL,
      created_at      timestamptz NOT NULL DEFAULT now(),
      updated_at      timestamptz NOT NULL DEFAULT now()
    )
  `).catch(() => undefined);

  for (const stmt of [
    `ALTER TABLE expenses ADD COLUMN IF NOT EXISTS account_id integer`,
    `ALTER TABLE expenses ADD COLUMN IF NOT EXISTS gst_amount numeric(15,2) NOT NULL DEFAULT 0`,
    `ALTER TABLE expenses ADD COLUMN IF NOT EXISTS gst_claimable boolean NOT NULL DEFAULT false`,
    `ALTER TABLE expenses ADD COLUMN IF NOT EXISTS is_deductible boolean NOT NULL DEFAULT true`,
    `ALTER TABLE expenses ADD COLUMN IF NOT EXISTS deductible_pct integer NOT NULL DEFAULT 100`,
    `ALTER TABLE expenses ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'SGD'`,
    `ALTER TABLE expenses ADD COLUMN IF NOT EXISTS payment_method text DEFAULT 'bank_transfer'`,
    `ALTER TABLE expenses ADD COLUMN IF NOT EXISTS receipt_data text`,
    `ALTER TABLE expenses ADD COLUMN IF NOT EXISTS receipt_mime_type text`,
    `ALTER TABLE expenses ADD COLUMN IF NOT EXISTS vendor_id integer`,
    `ALTER TABLE expenses ADD COLUMN IF NOT EXISTS project_id integer`,
    `ALTER TABLE expenses ADD COLUMN IF NOT EXISTS voucher_id integer`,
    `ALTER TABLE expenses ADD COLUMN IF NOT EXISTS journal_entry_id integer`,
    `ALTER TABLE expenses ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft'`,
    `ALTER TABLE expenses ADD COLUMN IF NOT EXISTS notes text`,
    `ALTER TABLE expenses ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()`,
  ]) {
    await currentPool.query(stmt).catch(() => undefined);
  }

  if (currentPool) expensesSchemaHealed.add(currentPool);
}

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
  if (!company || !isSingaporeCountry(company.country)) {
    res.status(403).json({ error: "Expenses module is only available for Singapore companies (IRAS rules)." });
    return false;
  }
  return true;
}

// ── List ──────────────────────────────────────────────────────────────────────
router.get("/expenses", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  if (!(await requireSingapore(req, res))) return;

  try {
    await ensureExpensesSchema();
    const companyId = req.session.companyId!;
    const expenses = await db.select()
      .from(expensesTable)
      .where(eq(expensesTable.companyId, companyId))
      .orderBy(desc(expensesTable.expenseDate), desc(expensesTable.createdAt));

    res.json(expenses.map(e => ({ ...e, receiptData: undefined })));
  } catch (err) {
    logServerError(logger, "Failed to list expenses", err);
    res.status(500).json({ error: sanitizeErrorMessage(err, "Failed to load expenses") });
  }
});

// ── Get one ───────────────────────────────────────────────────────────────────
router.get("/expenses/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  if (!(await requireSingapore(req, res))) return;

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  try {
    await ensureExpensesSchema();
    const [expense] = await db.select().from(expensesTable)
      .where(and(eq(expensesTable.id, id), eq(expensesTable.companyId, req.session.companyId!)))
      .limit(1);
    if (!expense) { res.status(404).json({ error: "Expense not found" }); return; }

    res.json(expense);
  } catch (err) {
    logServerError(logger, "Failed to get expense", err);
    res.status(500).json({ error: sanitizeErrorMessage(err, "Failed to load expense") });
  }
});

// ── Create ────────────────────────────────────────────────────────────────────
router.post("/expenses", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  if (!(await requireSingapore(req, res))) return;

  try {
    await ensureExpensesSchema();
    const companyId = req.session.companyId!;
    const {
      expenseDate, vendorName, description, category, accountId,
      amount, gstAmount, gstClaimable, isDeductible, deductiblePct,
      currency, paymentMethod, receiptData, receiptMimeType,
      vendorId, projectId, voucherId, notes, status,
    } = req.body;

    if (!expenseDate) { res.status(400).json({ error: "Expense date is required" }); return; }
    const periodCheck = await assertPeriodWritable(companyId, expenseDate);
    if (!periodCheck.ok) { res.status(periodCheck.status).json({ error: periodCheck.error }); return; }
    if (!vendorName?.trim()) { res.status(400).json({ error: "Vendor / payee name is required" }); return; }
    if (!description?.trim()) { res.status(400).json({ error: "Description is required" }); return; }
    const parsedAccountId = accountId != null && accountId !== "" ? parseInt(String(accountId), 10) : NaN;
    if (!Number.isFinite(parsedAccountId) && !category) {
      res.status(400).json({ error: "Ledger is required" }); return;
    }
    if (!amount || isNaN(parseFloat(amount))) { res.status(400).json({ error: "Amount is required" }); return; }

    const [created] = await db.insert(expensesTable).values({
      companyId,
      expenseDate,
      vendorName: vendorName.trim(),
      description: description.trim(),
      category: category || String(parsedAccountId),
      accountId: Number.isFinite(parsedAccountId) ? parsedAccountId : null,
      amount: parseFloat(amount).toFixed(2),
      gstAmount: parseFloat(gstAmount ?? 0).toFixed(2),
      gstClaimable: !!gstClaimable,
      isDeductible: isDeductible !== false,
      deductiblePct: deductiblePct ?? 100,
      currency: currency || "SGD",
      paymentMethod: paymentMethod || "bank_transfer",
      receiptData: receiptData || null,
      receiptMimeType: receiptMimeType || null,
      vendorId: vendorId ? parseInt(vendorId) : null,
      projectId: projectId ? parseInt(projectId) : null,
      voucherId: voucherId ? parseInt(voucherId) : null,
      notes: notes || null,
      status: status || "draft",
      createdBy: req.session.userId!,
    }).returning();

    logAudit({ req, action: "create", entityType: "expense", entityId: created.id, entityLabel: `${created.category} — ${created.vendorName}` });
    res.status(201).json({ ...created, receiptData: undefined });
  } catch (err) {
    logServerError(logger, "Failed to create expense", err);
    res.status(500).json({ error: sanitizeErrorMessage(err, "Failed to create expense") });
  }
});

// ── Update ────────────────────────────────────────────────────────────────────
router.put("/expenses/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  if (!(await requireSingapore(req, res))) return;

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  try {
    await ensureExpensesSchema();
    const [existing] = await db.select().from(expensesTable)
      .where(and(eq(expensesTable.id, id), eq(expensesTable.companyId, req.session.companyId!)))
      .limit(1);
    if (!existing) { res.status(404).json({ error: "Expense not found" }); return; }
    if (existing.status === "confirmed" && !req.session.isAdmin && req.session.userRole !== "accountant") {
      res.status(403).json({ error: "Only admins and accountants can edit confirmed expenses." }); return;
    }

    const {
      expenseDate, vendorName, description, category, accountId,
      amount, gstAmount, gstClaimable, isDeductible, deductiblePct,
      currency, paymentMethod, receiptData, receiptMimeType,
      vendorId, projectId, voucherId, notes, status,
    } = req.body;

    const updateData: any = { updatedAt: new Date() };
    if (expenseDate !== undefined) updateData.expenseDate = expenseDate;
    if (vendorName !== undefined) updateData.vendorName = vendorName.trim();
    if (description !== undefined) updateData.description = description.trim();
    if (category !== undefined) updateData.category = category;
    if (accountId !== undefined) {
      const parsedAccountId = accountId != null && accountId !== "" ? parseInt(String(accountId), 10) : NaN;
      updateData.accountId = Number.isFinite(parsedAccountId) ? parsedAccountId : null;
    }
    if (amount !== undefined) updateData.amount = parseFloat(amount).toFixed(2);
    if (gstAmount !== undefined) updateData.gstAmount = parseFloat(gstAmount ?? 0).toFixed(2);
    if (gstClaimable !== undefined) updateData.gstClaimable = !!gstClaimable;
    if (isDeductible !== undefined) updateData.isDeductible = isDeductible;
    if (deductiblePct !== undefined) updateData.deductiblePct = deductiblePct;
    if (currency !== undefined) updateData.currency = currency;
    if (paymentMethod !== undefined) updateData.paymentMethod = paymentMethod;
    if (receiptData !== undefined) updateData.receiptData = receiptData || null;
    if (receiptMimeType !== undefined) updateData.receiptMimeType = receiptMimeType || null;
    if (vendorId !== undefined) updateData.vendorId = vendorId ? parseInt(vendorId) : null;
    if (projectId !== undefined) updateData.projectId = projectId ? parseInt(projectId) : null;
    if (voucherId !== undefined) updateData.voucherId = voucherId ? parseInt(voucherId) : null;
    if (notes !== undefined) updateData.notes = notes || null;
    if (status !== undefined) updateData.status = status;

    const [updated] = await db.update(expensesTable).set(updateData)
      .where(eq(expensesTable.id, id)).returning();

    logAudit({ req, action: "update", entityType: "expense", entityId: id, entityLabel: updated.vendorName });
    res.json({ ...updated, receiptData: undefined });
  } catch (err) {
    logServerError(logger, "Failed to update expense", err);
    res.status(500).json({ error: sanitizeErrorMessage(err, "Failed to update expense") });
  }
});

// ── Delete ────────────────────────────────────────────────────────────────────
router.delete("/expenses/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  if (!(await requireSingapore(req, res))) return;

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  try {
    await ensureExpensesSchema();
    const [existing] = await db.select().from(expensesTable)
      .where(and(eq(expensesTable.id, id), eq(expensesTable.companyId, req.session.companyId!)))
      .limit(1);
    if (!existing) { res.status(404).json({ error: "Expense not found" }); return; }

    if (!req.session.isAdmin && req.session.userRole !== "accountant") {
      res.status(403).json({ error: "Only admins and accountants can delete expenses." }); return;
    }

    // If confirmed, reverse the journal entry before deleting
    if (existing.status === "confirmed") {
      await reverseExpenseJE(id, existing.companyId, existing.vendorName, req.session.userId!);
    }

    await db.delete(expensesTable).where(eq(expensesTable.id, id));
    logAudit({ req, action: "delete", entityType: "expense", entityId: id, entityLabel: existing.vendorName });
    res.json({ success: true });
  } catch (err) {
    logServerError(logger, "Failed to delete expense", err);
    res.status(500).json({ error: sanitizeErrorMessage(err, "Failed to delete expense") });
  }
});

// ── Confirm ───────────────────────────────────────────────────────────────────
router.post("/expenses/:id/confirm", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  if (!(await requireSingapore(req, res))) return;

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  try {
    await ensureExpensesSchema();
    const [existing] = await db.select().from(expensesTable)
      .where(and(eq(expensesTable.id, id), eq(expensesTable.companyId, req.session.companyId!)))
      .limit(1);
    if (!existing) { res.status(404).json({ error: "Expense not found" }); return; }
    if (existing.status === "confirmed") { res.status(400).json({ error: "Already confirmed." }); return; }

    const [updated] = await db.update(expensesTable)
      .set({ status: "confirmed", updatedAt: new Date() })
      .where(eq(expensesTable.id, id)).returning();

    // Auto-post journal entry for this confirmed expense
    await postExpenseJE(updated, req.session.userId!);

    logAudit({ req, action: "status:confirmed", entityType: "expense", entityId: id, entityLabel: updated.vendorName });
    res.json({ ...updated, receiptData: undefined });
  } catch (err) {
    logServerError(logger, "Failed to confirm expense", err);
    res.status(500).json({ error: sanitizeErrorMessage(err, "Failed to confirm expense") });
  }
});

// ── Get receipt ───────────────────────────────────────────────────────────────
router.get("/expenses/:id/receipt", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  try {
    await ensureExpensesSchema();
    const [expense] = await db.select({ receiptData: expensesTable.receiptData, receiptMimeType: expensesTable.receiptMimeType })
      .from(expensesTable)
      .where(and(eq(expensesTable.id, id), eq(expensesTable.companyId, req.session.companyId!)))
      .limit(1);
    if (!expense) { res.status(404).json({ error: "Expense not found" }); return; }
    if (!expense.receiptData) { res.status(404).json({ error: "No receipt attached" }); return; }

    res.json({ receiptData: expense.receiptData, receiptMimeType: expense.receiptMimeType });
  } catch (err) {
    logServerError(logger, "Failed to get expense receipt", err);
    res.status(500).json({ error: sanitizeErrorMessage(err, "Failed to load receipt") });
  }
});

export default router;
