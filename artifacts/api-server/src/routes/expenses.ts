import { Router, type IRouter } from "express";
import { db, expensesTable, companiesTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { logAudit } from "../lib/audit.js";

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

  const companyId = req.session.companyId!;
  const expenses = await db.select()
    .from(expensesTable)
    .where(eq(expensesTable.companyId, companyId))
    .orderBy(desc(expensesTable.expenseDate), desc(expensesTable.createdAt));

  res.json(expenses.map(e => ({ ...e, receiptData: undefined })));
});

// ── Get one ───────────────────────────────────────────────────────────────────
router.get("/expenses/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  if (!(await requireSingapore(req, res))) return;

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [expense] = await db.select().from(expensesTable)
    .where(and(eq(expensesTable.id, id), eq(expensesTable.companyId, req.session.companyId!)))
    .limit(1);
  if (!expense) { res.status(404).json({ error: "Expense not found" }); return; }

  res.json(expense);
});

// ── Create ────────────────────────────────────────────────────────────────────
router.post("/expenses", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  if (!(await requireSingapore(req, res))) return;

  const companyId = req.session.companyId!;
  const {
    expenseDate, vendorName, description, category,
    amount, gstAmount, gstClaimable, isDeductible, deductiblePct,
    currency, paymentMethod, receiptData, receiptMimeType,
    vendorId, projectId, voucherId, notes, status,
  } = req.body;

  if (!expenseDate) { res.status(400).json({ error: "Expense date is required" }); return; }
  if (!vendorName?.trim()) { res.status(400).json({ error: "Vendor / payee name is required" }); return; }
  if (!description?.trim()) { res.status(400).json({ error: "Description is required" }); return; }
  if (!category) { res.status(400).json({ error: "Category is required" }); return; }
  if (!amount || isNaN(parseFloat(amount))) { res.status(400).json({ error: "Amount is required" }); return; }

  const [created] = await db.insert(expensesTable).values({
    companyId,
    expenseDate,
    vendorName: vendorName.trim(),
    description: description.trim(),
    category,
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
});

// ── Update ────────────────────────────────────────────────────────────────────
router.put("/expenses/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  if (!(await requireSingapore(req, res))) return;

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [existing] = await db.select().from(expensesTable)
    .where(and(eq(expensesTable.id, id), eq(expensesTable.companyId, req.session.companyId!)))
    .limit(1);
  if (!existing) { res.status(404).json({ error: "Expense not found" }); return; }
  if (existing.status === "confirmed" && !req.session.isAdmin && req.session.userRole !== "accountant") {
    res.status(403).json({ error: "Only admins and accountants can edit confirmed expenses." }); return;
  }

  const {
    expenseDate, vendorName, description, category,
    amount, gstAmount, gstClaimable, isDeductible, deductiblePct,
    currency, paymentMethod, receiptData, receiptMimeType,
    vendorId, projectId, voucherId, notes, status,
  } = req.body;

  const updateData: any = { updatedAt: new Date() };
  if (expenseDate !== undefined) updateData.expenseDate = expenseDate;
  if (vendorName !== undefined) updateData.vendorName = vendorName.trim();
  if (description !== undefined) updateData.description = description.trim();
  if (category !== undefined) updateData.category = category;
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
});

// ── Delete ────────────────────────────────────────────────────────────────────
router.delete("/expenses/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  if (!(await requireSingapore(req, res))) return;

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [existing] = await db.select().from(expensesTable)
    .where(and(eq(expensesTable.id, id), eq(expensesTable.companyId, req.session.companyId!)))
    .limit(1);
  if (!existing) { res.status(404).json({ error: "Expense not found" }); return; }

  if (!req.session.isAdmin && req.session.userRole !== "accountant") {
    res.status(403).json({ error: "Only admins and accountants can delete expenses." }); return;
  }
  if (existing.status === "confirmed") {
    res.status(400).json({ error: "Cannot delete a confirmed expense. Void it instead." }); return;
  }

  await db.delete(expensesTable).where(eq(expensesTable.id, id));
  logAudit({ req, action: "delete", entityType: "expense", entityId: id, entityLabel: existing.vendorName });
  res.json({ success: true });
});

// ── Confirm ───────────────────────────────────────────────────────────────────
router.post("/expenses/:id/confirm", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  if (!(await requireSingapore(req, res))) return;

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [existing] = await db.select().from(expensesTable)
    .where(and(eq(expensesTable.id, id), eq(expensesTable.companyId, req.session.companyId!)))
    .limit(1);
  if (!existing) { res.status(404).json({ error: "Expense not found" }); return; }
  if (existing.status === "confirmed") { res.status(400).json({ error: "Already confirmed." }); return; }

  const [updated] = await db.update(expensesTable)
    .set({ status: "confirmed", updatedAt: new Date() })
    .where(eq(expensesTable.id, id)).returning();

  logAudit({ req, action: "status:confirmed", entityType: "expense", entityId: id, entityLabel: updated.vendorName });
  res.json({ ...updated, receiptData: undefined });
});

// ── Get receipt ───────────────────────────────────────────────────────────────
router.get("/expenses/:id/receipt", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [expense] = await db.select({ receiptData: expensesTable.receiptData, receiptMimeType: expensesTable.receiptMimeType })
    .from(expensesTable)
    .where(and(eq(expensesTable.id, id), eq(expensesTable.companyId, req.session.companyId!)))
    .limit(1);
  if (!expense) { res.status(404).json({ error: "Expense not found" }); return; }
  if (!expense.receiptData) { res.status(404).json({ error: "No receipt attached" }); return; }

  res.json({ receiptData: expense.receiptData, receiptMimeType: expense.receiptMimeType });
});

export default router;
