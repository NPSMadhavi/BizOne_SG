import { Router, type IRouter } from "express";
import { db, vendorInvoicesTable, vendorPaymentsTable, usersTable } from "@workspace/db";
import { logAudit } from "../lib/audit.js";
import { eq, and, desc, inArray, sql } from "drizzle-orm";
import {
  postVendorInvoiceJE,
  reverseVendorInvoiceJE,
  postPaymentJE,
  reversePaymentJE,
} from "../lib/vendor-invoice-auto-post.js";
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

function requireCompany(req: any, res: any): boolean {
  if (!req.session.companyId) { res.status(400).json({ error: "No company selected" }); return false; }
  return true;
}

function parsePI(doc: any) {
  return {
    ...doc,
    totalAmount: parseFloat(doc.totalAmount ?? "0"),
    paidAmount: parseFloat(doc.paidAmount ?? "0"),
    balance: parseFloat(doc.totalAmount ?? "0") - parseFloat(doc.paidAmount ?? "0"),
    createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : doc.createdAt,
    updatedAt: doc.updatedAt instanceof Date ? doc.updatedAt.toISOString() : doc.updatedAt,
  };
}

async function recalcPI(piId: number, companyId: number): Promise<void> {
  const payments = await db.select().from(vendorPaymentsTable)
    .where(and(eq(vendorPaymentsTable.vendorInvoiceId, piId), eq(vendorPaymentsTable.companyId, companyId)));
  const paidAmount = payments.reduce((s, p) => s + parseFloat(p.amount ?? "0"), 0);
  const [pi] = await db.select({ totalAmount: vendorInvoicesTable.totalAmount })
    .from(vendorInvoicesTable).where(eq(vendorInvoicesTable.id, piId));
  const total = parseFloat(pi?.totalAmount ?? "0");
  let status = "pending";
  if (paidAmount >= total && total > 0) status = "paid";
  else if (paidAmount > 0) status = "partial";
  await db.update(vendorInvoicesTable)
    .set({ paidAmount: paidAmount.toFixed(2), status, updatedAt: new Date() })
    .where(eq(vendorInvoicesTable.id, piId));
}

router.get("/vendor-invoices", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const companyId = req.session.companyId;
  if (!companyId) { res.status(400).json({ error: "No company selected" }); return; }

  const poId = req.query.poId ? parseInt(req.query.poId as string) : undefined;

  let rows = await db.select().from(vendorInvoicesTable)
    .where(eq(vendorInvoicesTable.companyId, companyId))
    .orderBy(desc(vendorInvoicesTable.createdAt));

  if (poId) {
    rows = rows.filter(r => ((r.poIds as number[]) || []).includes(poId));
  }

  const userIds = [...new Set(rows.map(r => r.createdBy))].filter(Boolean);
  let usernameMap: Record<number, string> = {};
  if (userIds.length > 0) {
    const users = await db.select({ id: usersTable.id, username: usersTable.username })
      .from(usersTable).where(inArray(usersTable.id, userIds));
    usernameMap = Object.fromEntries(users.map(u => [u.id, u.username]));
  }

  res.json(rows.map(r => ({ ...parsePI(r), createdByUsername: usernameMap[r.createdBy] || null })));
});

router.post("/vendor-invoices", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  const companyId = req.session.companyId!;
  const userId = req.session.userId!;

    const { piNumber, piDate, vendorName, poIds, poNumbers, currency, totalAmount, notes, expenseAccountId,
      gstTreatment, gstRate, gstAmount, gstInclusive, exchangeRate, paymentTerms, dueDate,
      plannedPaymentDate, remindersEnabled, reminderStartAfterDay, reminderEmails, salesPerson } = req.body;
  if (!vendorName?.trim()) { res.status(400).json({ error: "Vendor name is required" }); return; }
  if (!totalAmount || isNaN(Number(totalAmount)) || Number(totalAmount) <= 0) {
    res.status(400).json({ error: "Valid total amount is required" }); return;
  }

  const resolvedPiNumber = (typeof piNumber === "string" && piNumber.trim())
    ? piNumber.trim()
    : await nextDocNumber("pi", companyId);

  const parsedExpenseAccountId = (() => {
    if (expenseAccountId == null || expenseAccountId === "" || expenseAccountId === "none") return null;
    const n = typeof expenseAccountId === "number" ? expenseAccountId : parseInt(String(expenseAccountId), 10);
    return Number.isFinite(n) ? n : null;
  })();

  const netAmount = Math.max(0, parseFloat(String(totalAmount)) - parseFloat(String(gstAmount ?? "0")));

  try {
    const [doc] = await db.insert(vendorInvoicesTable).values({
      companyId,
      piNumber: resolvedPiNumber,
      piDate: piDate || new Date().toISOString().split("T")[0],
      paymentTerms: paymentTerms || "30 Days Net",
      dueDate: dueDate || null,
      plannedPaymentDate: plannedPaymentDate || null,
      remindersEnabled: !!remindersEnabled,
      reminderStartAfterDay: reminderStartAfterDay == null || reminderStartAfterDay === "" ? null : Number(reminderStartAfterDay),
      reminderEmails: Array.isArray(reminderEmails) ? reminderEmails : [],
      vendorName: vendorName.trim(),
      poIds: Array.isArray(poIds) ? poIds : [],
      poNumbers: poNumbers || null,
      currency: currency || "SGD",
      totalAmount: parseFloat(totalAmount).toFixed(2),
      paidAmount: "0",
      status: "pending",
      notes: notes || null,
      expenseAccountId: parsedExpenseAccountId,
      salesPerson: salesPerson || null,
      items: [],
      subtotal: netAmount.toFixed(2),
      tax: parseFloat(String(gstAmount ?? "0")).toFixed(2),
      gstTreatment: gstTreatment || "standard_rated",
      gstRate: parseFloat(String(gstRate ?? "9")).toFixed(2),
      gstAmount: parseFloat(String(gstAmount ?? "0")).toFixed(2),
      gstInclusive: !!gstInclusive,
      exchangeRate: parseFloat(String(exchangeRate ?? "1")).toFixed(6) as any,
      createdBy: userId,
    }).returning();

    logAudit({ req, action: "create", entityType: "vendor_invoice", entityId: doc.id, entityLabel: doc.piNumber });

    await postVendorInvoiceJE(
      {
        id: doc.id, companyId, piNumber: doc.piNumber, vendorName: doc.vendorName,
        piDate: doc.piDate, totalAmount: parseFloat(totalAmount),
        gstAmount: parseFloat(String(gstAmount ?? "0")),
        gstTreatment: gstTreatment || "standard_rated",
        expenseAccountId: doc.expenseAccountId,
      },
      userId,
      req.log,
    );

    res.status(201).json(parsePI(doc));
  } catch (err: any) {
    const message = err?.cause?.message || err?.message || "Failed to create vendor invoice";
    res.status(500).json({ error: message });
  }
});

router.get("/vendor-invoices/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [doc] = await db.select().from(vendorInvoicesTable).where(eq(vendorInvoicesTable.id, id));
  if (!doc) { res.status(404).json({ error: "Vendor invoice not found" }); return; }

  const payments = await db.select().from(vendorPaymentsTable)
    .where(eq(vendorPaymentsTable.vendorInvoiceId, id))
    .orderBy(desc(vendorPaymentsTable.createdAt));

  res.json({ ...parsePI(doc), payments: payments.map(p => ({
    ...p,
    amount: parseFloat(p.amount ?? "0"),
    createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : p.createdAt,
  })) });
});

router.put("/vendor-invoices/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [existing] = await db.select().from(vendorInvoicesTable).where(eq(vendorInvoicesTable.id, id));
  if (!existing) { res.status(404).json({ error: "Vendor invoice not found" }); return; }

    const { piNumber, piDate, vendorName, poIds, poNumbers, currency, totalAmount, notes,
      gstTreatment, gstRate, gstAmount, gstInclusive, exchangeRate, paymentTerms, dueDate,
      plannedPaymentDate, remindersEnabled, reminderStartAfterDay, reminderEmails, salesPerson } = req.body;
  const updates: any = { updatedAt: new Date() };
  if (piNumber !== undefined) updates.piNumber = piNumber.trim();
  if (piDate !== undefined) updates.piDate = piDate;
  if (paymentTerms !== undefined) updates.paymentTerms = paymentTerms || "30 Days Net";
  if (dueDate !== undefined) updates.dueDate = dueDate || null;
  if (plannedPaymentDate !== undefined) updates.plannedPaymentDate = plannedPaymentDate || null;
  if (remindersEnabled !== undefined) updates.remindersEnabled = !!remindersEnabled;
  if (reminderStartAfterDay !== undefined) updates.reminderStartAfterDay = reminderStartAfterDay === "" || reminderStartAfterDay == null ? null : Number(reminderStartAfterDay);
  if (reminderEmails !== undefined) updates.reminderEmails = Array.isArray(reminderEmails) ? reminderEmails : [];
  if (vendorName !== undefined) updates.vendorName = vendorName.trim();
  if (poIds !== undefined) updates.poIds = poIds;
  if (poNumbers !== undefined) updates.poNumbers = poNumbers;
  if (currency !== undefined) updates.currency = currency;
  if (totalAmount !== undefined) updates.totalAmount = parseFloat(totalAmount).toFixed(2);
  if (notes !== undefined) updates.notes = notes || null;
  if (gstTreatment !== undefined) updates.gstTreatment = gstTreatment;
  if (gstRate !== undefined) updates.gstRate = parseFloat(gstRate).toFixed(2);
  if (gstAmount !== undefined) updates.gstAmount = parseFloat(gstAmount).toFixed(2);
  if (gstInclusive !== undefined) updates.gstInclusive = !!gstInclusive;
  if (exchangeRate !== undefined) updates.exchangeRate = parseFloat(exchangeRate).toFixed(6);
  if (salesPerson !== undefined) updates.salesPerson = salesPerson || null;

  await db.update(vendorInvoicesTable).set(updates).where(eq(vendorInvoicesTable.id, id));
  await recalcPI(id, existing.companyId);
  const [updated] = await db.select().from(vendorInvoicesTable).where(eq(vendorInvoicesTable.id, id));
  logAudit({ req, action: "update", entityType: "vendor_invoice", entityId: id, entityLabel: updated?.piNumber });
  res.json(parsePI(updated));
});

router.delete("/vendor-invoices/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const isAdmin = req.session.isAdmin ?? false;
  if (!isAdmin) { res.status(403).json({ error: "Admin only" }); return; }
  const id = parseInt(req.params.id);
  const userId = req.session.userId!;

  const [toDelete] = await db.select().from(vendorInvoicesTable).where(eq(vendorInvoicesTable.id, id));
  if (!toDelete) { res.status(404).json({ error: "Not found" }); return; }

  await reverseVendorInvoiceJE(id, toDelete.companyId, toDelete.piNumber, toDelete.vendorName, userId, req.log);

  const [deleted] = await db.delete(vendorInvoicesTable).where(eq(vendorInvoicesTable.id, id)).returning();
  logAudit({ req, action: "delete", entityType: "vendor_invoice", entityId: id, entityLabel: deleted?.piNumber });
  res.json({ success: true });
});

router.get("/vendor-invoices/:id/payments", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const payments = await db.select().from(vendorPaymentsTable)
    .where(eq(vendorPaymentsTable.vendorInvoiceId, id))
    .orderBy(desc(vendorPaymentsTable.createdAt));

  res.json(payments.map(p => ({
    ...p,
    amount: parseFloat(p.amount ?? "0"),
    createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : p.createdAt,
  })));
});

router.post("/vendor-invoices/:id/payments", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  const companyId = req.session.companyId!;
  const userId = req.session.userId!;
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [existing] = await db.select().from(vendorInvoicesTable).where(eq(vendorInvoicesTable.id, id));
  if (!existing) { res.status(404).json({ error: "Vendor invoice not found" }); return; }

  const { paymentDate, amount, reference, paymentMethod, notes } = req.body;
  if (!paymentDate) { res.status(400).json({ error: "Payment date is required" }); return; }
  if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
    res.status(400).json({ error: "Valid payment amount is required" }); return;
  }

  const [payment] = await db.insert(vendorPaymentsTable).values({
    companyId,
    vendorInvoiceId: id,
    paymentDate,
    amount: parseFloat(amount).toFixed(2),
    reference: reference || null,
    paymentMethod: paymentMethod || "bank_transfer",
    notes: notes || null,
    createdBy: userId,
  }).returning();

  await recalcPI(id, companyId);
  const [updatedPI] = await db.select().from(vendorInvoicesTable).where(eq(vendorInvoicesTable.id, id));

  await postPaymentJE(
    { id: payment.id, vendorInvoiceId: id, companyId, paymentDate, amount: parseFloat(amount), reference: reference || null },
    existing.piNumber,
    existing.vendorName,
    userId,
    req.log,
  );

  logAudit({ req, action: "payment:add", entityType: "vendor_invoice", entityId: id, entityLabel: updatedPI?.piNumber, details: { amount: payment.amount, reference: payment.reference } });
  res.status(201).json({
    payment: { ...payment, amount: parseFloat(payment.amount ?? "0") },
    vendorInvoice: parsePI(updatedPI),
  });
});

router.put("/vendor-invoices/:id/payments/:paymentId", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const id = parseInt(req.params.id);
  const paymentId = parseInt(req.params.paymentId);
  if (isNaN(id) || isNaN(paymentId)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [existing] = await db.select().from(vendorInvoicesTable).where(eq(vendorInvoicesTable.id, id));
  if (!existing) { res.status(404).json({ error: "Vendor invoice not found" }); return; }

  const { paymentDate, amount, reference, paymentMethod, notes } = req.body;
  const updates: any = { updatedAt: new Date() };
  if (paymentDate !== undefined) updates.paymentDate = paymentDate;
  if (amount !== undefined) updates.amount = parseFloat(amount).toFixed(2);
  if (reference !== undefined) updates.reference = reference || null;
  if (paymentMethod !== undefined) updates.paymentMethod = paymentMethod;
  if (notes !== undefined) updates.notes = notes || null;

  await db.update(vendorPaymentsTable).set(updates).where(eq(vendorPaymentsTable.id, paymentId));
  await recalcPI(id, existing.companyId);
  const [updatedPI] = await db.select().from(vendorInvoicesTable).where(eq(vendorInvoicesTable.id, id));
  logAudit({ req, action: "payment:update", entityType: "vendor_invoice", entityId: id, entityLabel: existing.piNumber, details: { amount: updates.amount, reference: updates.reference } });
  res.json({ success: true, vendorInvoice: parsePI(updatedPI) });
});

router.delete("/vendor-invoices/:id/payments/:paymentId", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const isAdmin = req.session.isAdmin ?? false;
  if (!isAdmin) { res.status(403).json({ error: "Admin only" }); return; }
  const id = parseInt(req.params.id);
  const paymentId = parseInt(req.params.paymentId);
  const userId = req.session.userId!;

  const [existing] = await db.select().from(vendorInvoicesTable).where(eq(vendorInvoicesTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  await reversePaymentJE(paymentId, existing.companyId, existing.piNumber, existing.vendorName, userId, req.log);

  await db.delete(vendorPaymentsTable).where(eq(vendorPaymentsTable.id, paymentId));
  await recalcPI(id, existing.companyId);
  logAudit({ req, action: "payment:delete", entityType: "vendor_invoice", entityId: id, entityLabel: existing.piNumber });
  res.json({ success: true });
});

export default router;
