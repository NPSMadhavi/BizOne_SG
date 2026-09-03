import { Router, type IRouter } from "express";
import { db, proformaInvoicesTable, usersTable, customersTable, settingsTable } from "@workspace/db";
import { eq, desc, inArray, ilike, and } from "drizzle-orm";
import { nextDocNumber } from "../lib/running-numbers.js";
import { logAudit } from "../lib/audit.js";

const router: IRouter = Router();

function requireAuth(req: any, res: any): boolean {
  if (!req.session.userId) { res.status(401).json({ error: "Not authenticated" }); return false; }
  return true;
}
function requireCompany(req: any, res: any): boolean {
  if (!req.session.companyId) { res.status(400).json({ error: "No company selected." }); return false; }
  return true;
}

function parseDoc(doc: any) {
  return {
    ...doc,
    subtotal: parseFloat(doc.subtotal ?? "0"),
    discountAmount: parseFloat(doc.discountAmount ?? "0"),
    tax: parseFloat(doc.tax ?? "0"),
    totalAmount: parseFloat(doc.totalAmount ?? "0"),
    createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : doc.createdAt,
  };
}

function lineItemAmount(item: any): number {
  if (item?.type === "section" || item?.isFoc) return 0;
  const parsed = parseFloat(String(item?.amount ?? ""));
  if (!Number.isNaN(parsed) && parsed > 0) return parsed;
  const disc = Number(item?.discount) || 0;
  return (Number(item?.qty) || 0) * (Number(item?.unitPrice) || 0) * (1 - disc / 100);
}

function calcProformaFinancials(items: any[], discountAmount: number, taxRatePercent: number) {
  const subtotal = (items ?? []).reduce((s: number, item: any) => s + lineItemAmount(item), 0);
  const docDiscount = Number(discountAmount) || 0;
  const taxableAmount = subtotal - docDiscount;
  const taxAmt = (taxableAmount * (Number(taxRatePercent) || 0)) / 100;
  const totalAmount = taxableAmount + taxAmt;
  return {
    subtotal,
    docDiscount,
    taxAmt,
    totalAmount,
  };
}

function inferTaxRatePercent(doc: { subtotal?: string | number; discountAmount?: string | number; tax?: string | number }) {
  const storedSubtotal = Number(doc.subtotal ?? 0);
  const storedTax = Number(doc.tax ?? 0);
  const taxable = storedSubtotal - Number(doc.discountAmount ?? 0);
  if (storedTax <= 0) return 0;
  if (storedTax <= 100 && taxable <= 0) return storedTax;
  if (storedTax <= 100 && storedTax < taxable * 0.5) return storedTax;
  if (taxable > 0) return (storedTax / taxable) * 100;
  if (storedTax <= 100) return storedTax;
  return 0;
}

function deriveTaxRatePercent(doc: { subtotal?: string | number; discountAmount?: string | number; tax?: string | number }) {
  return inferTaxRatePercent(doc);
}

function withComputedTotals(doc: any) {
  const parsed = parseDoc(doc);
  const items = (parsed.items as any[]) ?? [];
  if (!items.length) return parsed;

  const storedSubtotal = Number(parsed.subtotal) || 0;
  const lineSubtotal = items.reduce((s, item) => s + lineItemAmount(item), 0);
  const storedTax = Number(parsed.tax) || 0;
  const needsRecompute =
    lineSubtotal > 0 &&
    (storedSubtotal <= 0 || Math.abs(storedSubtotal - lineSubtotal) > 0.01);
  const needsTaxFix =
    storedSubtotal <= 0 && storedTax > 0 && storedTax <= 100 && lineSubtotal > 0;

  if (!needsRecompute && !needsTaxFix) return parsed;

  const rate = inferTaxRatePercent(parsed);
  const { subtotal, docDiscount, taxAmt, totalAmount } = calcProformaFinancials(
    items,
    Number(parsed.discountAmount) || 0,
    rate,
  );
  if (subtotal <= 0) return parsed;
  return { ...parsed, subtotal, discountAmount: docDiscount, tax: taxAmt, totalAmount };
}

function visibilityFilter(docs: any[], userId: number, isAdmin: boolean) {
  return docs.filter(d => !d.isPrivate || d.createdBy === userId || isAdmin);
}

async function withUsernames(docs: any[]): Promise<any[]> {
  const userIds = [...new Set(docs.map(d => d.createdBy))].filter(Boolean);
  let usernameMap: Record<number, string> = {};
  if (userIds.length > 0) {
    const users = await db.select({ id: usersTable.id, username: usersTable.username })
      .from(usersTable).where(inArray(usersTable.id, userIds));
    usernameMap = Object.fromEntries(users.map(u => [u.id, u.username]));
  }
  return docs.map(d => ({ ...d, createdByUsername: usernameMap[d.createdBy] || null }));
}

async function upsertCustomerByName(companyId: number, name: string, address?: string | null, contactPerson?: string | null, contactEmail?: string | null) {
  if (!name?.trim()) return;
  const existing = await db.select({ id: customersTable.id }).from(customersTable)
    .where(and(eq(customersTable.companyId, companyId), ilike(customersTable.name, name.trim()))).limit(1);
  if (existing.length === 0) {
    await db.insert(customersTable).values({ companyId, name: name.trim(), address: address || null, contactPerson: contactPerson || null, contactEmail: contactEmail || null });
  }
}

// ── List ───────────────────────────────────────────────────────────────────────
router.get("/proforma-invoices", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const companyId = req.session.companyId;
  const userId = req.session.userId!;
  const isAdmin = req.session.isAdmin ?? false;

  const all = companyId
    ? await db.select().from(proformaInvoicesTable).where(eq(proformaInvoicesTable.companyId, companyId)).orderBy(desc(proformaInvoicesTable.createdAt))
    : await db.select().from(proformaInvoicesTable).orderBy(desc(proformaInvoicesTable.createdAt));

  const visible = visibilityFilter(all, userId, isAdmin);
  const withNames = await withUsernames(visible);
  res.json(withNames.map(withComputedTotals));
});

// ── Get one ────────────────────────────────────────────────────────────────────
router.get("/proforma-invoices/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [doc] = await db.select().from(proformaInvoicesTable).where(eq(proformaInvoicesTable.id, id));
  if (!doc) { res.status(404).json({ error: "Proforma invoice not found" }); return; }

  const userId = req.session.userId!;
  const isAdmin = req.session.isAdmin ?? false;
  if (doc.isPrivate && doc.createdBy !== userId && !isAdmin) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  res.json(withComputedTotals(doc));
});

// ── Create ─────────────────────────────────────────────────────────────────────
router.post("/proforma-invoices", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;

  const companyId = req.session.companyId!;
  const userId = req.session.userId!;
  const { customerName, customerAddress, customerContact, customerContactEmail, deliveryAddress, issueDate, deliveryDate, paymentTerms, notes, items, discountAmount, tax, currency, qtRefNo, status, isPrivate, termsAndConditions, deliveryInstructions, customerNote, authorisedSignature } = req.body;

  if (!customerName?.trim()) { res.status(400).json({ error: "Customer name is required" }); return; }

  const piNumber = await nextDocNumber("pi", companyId);
  const { subtotal, docDiscount, taxAmt, totalAmount } = calcProformaFinancials(
    items || [],
    Number(discountAmount) || 0,
    Number(tax) || 0,
  );

  try {
    const [doc] = await db.insert(proformaInvoicesTable).values({
      piNumber, companyId, customerName: customerName.trim(),
      customerAddress: customerAddress || null,
      customerContact: customerContact || null,
      customerContactEmail: customerContactEmail || null,
      deliveryAddress: deliveryAddress || null,
      issueDate: issueDate || null,
      deliveryDate: deliveryDate || null,
      paymentTerms: paymentTerms || null,
      notes: notes || null,
      items: items || [],
      subtotal: subtotal.toFixed(2),
      discountAmount: docDiscount.toFixed(2),
      tax: taxAmt.toFixed(2),
      totalAmount: totalAmount.toFixed(2),
      currency: currency || "SGD",
      qtRefNo: qtRefNo || null,
      status: status || "draft",
      isPrivate: isPrivate ?? false,
      createdBy: userId,
      termsAndConditions: termsAndConditions || null,
      deliveryInstructions: deliveryInstructions || null,
      customerNote: customerNote || null,
      authorisedSignature: authorisedSignature || null,
    }).returning();

    await upsertCustomerByName(companyId, customerName, customerAddress, customerContact, customerContactEmail);
    logAudit({ req, action: "create", entityType: "proforma_invoice", entityId: doc.id, entityLabel: doc.piNumber });
    res.status(201).json(withComputedTotals(doc));
  } catch (err: any) {
    if (err.code === "23505") {
      res.status(400).json({ error: `PI number "${piNumber}" already exists` });
    } else {
      req.log?.error({ err }, "Failed to create PI"); res.status(500).json({ error: "Failed to create proforma invoice" });
    }
  }
});

// ── Update ─────────────────────────────────────────────────────────────────────
router.put("/proforma-invoices/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const companyId = req.session.companyId!;
  const isAdmin = req.session.isAdmin ?? false;

  const [existing] = await db.select().from(proformaInvoicesTable).where(eq(proformaInvoicesTable.id, id));
  if (!existing) { res.status(404).json({ error: "Proforma invoice not found" }); return; }
  if (existing.companyId !== companyId) { res.status(403).json({ error: "Forbidden" }); return; }

  const { customerName, customerAddress, customerContact, customerContactEmail, deliveryAddress, issueDate, deliveryDate, paymentTerms, notes, items, discountAmount, tax, currency, qtRefNo, status, isPrivate, termsAndConditions, deliveryInstructions, customerNote, authorisedSignature } = req.body;

  const updates: any = {};
  if (customerName !== undefined) updates.customerName = customerName.trim();
  if (customerAddress !== undefined) updates.customerAddress = customerAddress || null;
  if (customerContact !== undefined) updates.customerContact = customerContact || null;
  if (customerContactEmail !== undefined) updates.customerContactEmail = customerContactEmail || null;
  if (deliveryAddress !== undefined) updates.deliveryAddress = deliveryAddress || null;
  if (issueDate !== undefined) updates.issueDate = issueDate || null;
  if (deliveryDate !== undefined) updates.deliveryDate = deliveryDate || null;
  if (paymentTerms !== undefined) updates.paymentTerms = paymentTerms || null;
  if (notes !== undefined) updates.notes = notes || null;
  if (items !== undefined) updates.items = items;
  if (currency !== undefined) updates.currency = currency;
  if (qtRefNo !== undefined) updates.qtRefNo = qtRefNo || null;
  if (status !== undefined) updates.status = status;
  if (isPrivate !== undefined) updates.isPrivate = isPrivate;
  if (termsAndConditions !== undefined) updates.termsAndConditions = termsAndConditions || null;
  if (deliveryInstructions !== undefined) updates.deliveryInstructions = deliveryInstructions || null;
  if (customerNote !== undefined) updates.customerNote = customerNote || null;
  if (authorisedSignature !== undefined) updates.authorisedSignature = authorisedSignature || null;

  if (items !== undefined || discountAmount !== undefined || tax !== undefined) {
    const itemsToUse = items !== undefined ? items : (existing.items as any[]) ?? [];
    const disc = discountAmount !== undefined ? Number(discountAmount) : Number(existing.discountAmount ?? 0);
    const taxRate = tax !== undefined ? Number(tax) : deriveTaxRatePercent(existing);
    const { subtotal, docDiscount, taxAmt, totalAmount } = calcProformaFinancials(itemsToUse, disc, taxRate);
    updates.items = itemsToUse;
    updates.subtotal = subtotal.toFixed(2);
    updates.discountAmount = docDiscount.toFixed(2);
    updates.tax = taxAmt.toFixed(2);
    updates.totalAmount = totalAmount.toFixed(2);
  }

  const [updated] = await db.update(proformaInvoicesTable).set(updates).where(eq(proformaInvoicesTable.id, id)).returning();
  logAudit({ req, action: "update", entityType: "proforma_invoice", entityId: id, entityLabel: updated.piNumber });
  res.json(withComputedTotals(updated));
});

// ── Mark Confirmed ─────────────────────────────────────────────────────────────
router.post("/proforma-invoices/:id/mark-confirmed", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const companyId = req.session.companyId!;
  const [existing] = await db.select().from(proformaInvoicesTable).where(eq(proformaInvoicesTable.id, id));
  if (!existing) { res.status(404).json({ error: "Proforma invoice not found" }); return; }
  if (existing.companyId !== companyId) { res.status(403).json({ error: "Forbidden" }); return; }

  const [updated] = await db.update(proformaInvoicesTable).set({ status: "confirmed" }).where(eq(proformaInvoicesTable.id, id)).returning();
  logAudit({ req, action: "mark-confirmed", entityType: "proforma_invoice", entityId: id, entityLabel: updated.piNumber });
  res.json(withComputedTotals(updated));
});

// ── Mark Sent ──────────────────────────────────────────────────────────────────
router.post("/proforma-invoices/:id/mark-sent", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const companyId = req.session.companyId!;
  const [existing] = await db.select().from(proformaInvoicesTable).where(eq(proformaInvoicesTable.id, id));
  if (!existing) { res.status(404).json({ error: "Proforma invoice not found" }); return; }
  if (existing.companyId !== companyId) { res.status(403).json({ error: "Forbidden" }); return; }

  const sentTo: string[] = Array.isArray(req.body.sentTo) ? req.body.sentTo : [];
  const updateData: Record<string, any> = {};
  if (["draft", "confirmed"].includes(existing.status)) updateData.status = "sent";
  if (sentTo.length > 0) updateData.emailSentTo = sentTo.join(", ");

  if (Object.keys(updateData).length > 0) {
    await db.update(proformaInvoicesTable).set(updateData).where(eq(proformaInvoicesTable.id, id));
  }
  const [updated] = await db.select().from(proformaInvoicesTable).where(eq(proformaInvoicesTable.id, id));
  logAudit({ req, action: "mark-sent", entityType: "proforma_invoice", entityId: id, entityLabel: updated.piNumber });
  res.json(withComputedTotals(updated));
});

// ── Delete (admin only) ────────────────────────────────────────────────────────
router.delete("/proforma-invoices/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const isAdmin = req.session.isAdmin ?? false;
  if (!isAdmin) { res.status(403).json({ error: "Only administrators can delete proforma invoices" }); return; }

  const id = parseInt(req.params.id);
  const [deleted] = await db.delete(proformaInvoicesTable).where(eq(proformaInvoicesTable.id, id)).returning();
  logAudit({ req, action: "delete", entityType: "proforma_invoice", entityId: id, entityLabel: deleted?.piNumber });
  res.json({ success: true });
});

export default router;
