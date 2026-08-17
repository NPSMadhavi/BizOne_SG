import { Router, type IRouter } from "express";
import {
  db,
  purchaseQuotationsTable,
  purchaseOrdersTable,
  vendorInvoicesTable,
  usersTable,
  vendorsTable,
} from "@workspace/db";
import { and, desc, eq, ilike, inArray } from "drizzle-orm";
import { nextDocNumber } from "../lib/running-numbers.js";
import { logAudit } from "../lib/audit.js";
import { postVendorInvoiceJE } from "../lib/vendor-invoice-auto-post.js";

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
    res.status(400).json({ error: "No company selected. Please select a company first." });
    return false;
  }
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

function canSee(doc: any, userId: number, isAdmin: boolean, isExternal: boolean) {
  if (isExternal && doc.createdBy !== userId) return false;
  return !doc.isPrivate || doc.createdBy === userId || isAdmin;
}

async function withUsernames(docs: any[]) {
  const ids = [...new Set(docs.map((doc) => doc.createdBy).filter(Boolean))];
  if (ids.length === 0) return docs;
  const users = await db
    .select({ id: usersTable.id, username: usersTable.username })
    .from(usersTable)
    .where(inArray(usersTable.id, ids));
  const names = Object.fromEntries(users.map((user) => [user.id, user.username]));
  return docs.map((doc) => ({ ...doc, createdByUsername: names[doc.createdBy] || null }));
}

async function upsertVendor(
  companyId: number,
  name: string,
  address?: string | null,
  contact?: string | null,
  email?: string | null,
) {
  const normalized = name?.trim();
  if (!normalized) return;
  const existing = await db
    .select({ id: vendorsTable.id })
    .from(vendorsTable)
    .where(and(eq(vendorsTable.companyId, companyId), ilike(vendorsTable.name, normalized)))
    .limit(1);
  if (existing.length === 0) {
    await db.insert(vendorsTable).values({
      companyId,
      name: normalized,
      address: address || null,
      contactPerson: contact || null,
      contactEmail: email || null,
    });
  }
}

function calculate(body: any) {
  const items = Array.isArray(body.items) ? body.items : [];
  const subtotal = items.reduce((sum: number, item: any) => {
    if (item.type === "section" || item.isFoc) return sum;
    const fallback = (Number(item.qty) || 0) * (Number(item.unitPrice) || 0) * (1 - (Number(item.discount) || 0) / 100);
    return sum + (Number.isFinite(Number(item.amount)) ? Number(item.amount) : fallback);
  }, 0);
  const discountAmount = Math.min(Math.max(Number(body.discountAmount) || 0, 0), subtotal);
  const taxable = subtotal - discountAmount;
  const tax = taxable * ((Number(body.tax) || 0) / 100);
  return { subtotal, discountAmount, tax, totalAmount: taxable + tax };
}

router.get("/purchase-quotations/stats", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const companyId = req.session.companyId;
  const all = companyId
    ? await db.select().from(purchaseQuotationsTable).where(eq(purchaseQuotationsTable.companyId, companyId))
    : await db.select().from(purchaseQuotationsTable);
  const visible = all.filter((doc) =>
    canSee(doc, req.session.userId!, req.session.isAdmin ?? false, req.session.userRole === "external"),
  );
  res.json({
    total: visible.length,
    confirmed: visible.filter((doc) => doc.status === "confirmed").length,
    draft: visible.filter((doc) => doc.status === "draft").length,
    cancelled: visible.filter((doc) => doc.status === "cancelled").length,
    totalValue: visible.reduce((sum, doc) => sum + Number(doc.totalAmount || 0), 0),
  });
});

router.get("/purchase-quotations", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const companyId = req.session.companyId;
  const docs = companyId
    ? await db
        .select()
        .from(purchaseQuotationsTable)
        .where(eq(purchaseQuotationsTable.companyId, companyId))
        .orderBy(desc(purchaseQuotationsTable.createdAt))
    : await db.select().from(purchaseQuotationsTable).orderBy(desc(purchaseQuotationsTable.createdAt));
  const visible = docs
    .filter((doc) => canSee(doc, req.session.userId!, req.session.isAdmin ?? false, req.session.userRole === "external"))
    .map(parseDoc);
  res.json(await withUsernames(visible));
});

router.post("/purchase-quotations", async (req, res): Promise<void> => {
  if (!requireAuth(req, res) || !requireCompany(req, res)) return;
  const { vendorName, vendorAddress, vendorContact, vendorContactEmail, deliveryAddress, issueDate,
    deliveryDate, paymentTerms, notes, items, currency, isPrivate, status } = req.body;
  if (!vendorName || !Array.isArray(items)) {
    res.status(400).json({ error: "vendorName and items are required" });
    return;
  }
  const totals = calculate(req.body);
  const pqNumber = await nextDocNumber("pq", req.session.companyId!);
  const [doc] = await db.insert(purchaseQuotationsTable).values({
    pqNumber,
    companyId: req.session.companyId!,
    vendorName,
    vendorAddress,
    vendorContact,
    vendorContactEmail,
    deliveryAddress,
    issueDate: issueDate || new Date().toISOString().slice(0, 10),
    deliveryDate,
    paymentTerms,
    notes,
    items,
    currency: currency || "SGD",
    isPrivate: isPrivate === true,
    subtotal: totals.subtotal.toFixed(2),
    discountAmount: totals.discountAmount.toFixed(2),
    tax: totals.tax.toFixed(2),
    totalAmount: totals.totalAmount.toFixed(2),
    status: status || "draft",
    createdBy: req.session.userId!,
  }).returning();
  await upsertVendor(req.session.companyId!, vendorName, vendorAddress, vendorContact, vendorContactEmail);
  logAudit({ req, action: "create", entityType: "purchase_quotation", entityId: doc.id, entityLabel: doc.pqNumber });
  res.status(201).json(parseDoc(doc));
});

router.get("/purchase-quotations/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }
  const [doc] = await db.select().from(purchaseQuotationsTable).where(eq(purchaseQuotationsTable.id, id));
  if (!doc || (req.session.companyId && doc.companyId !== req.session.companyId)) {
    res.status(404).json({ error: "Purchase quotation not found" });
    return;
  }
  if (!canSee(doc, req.session.userId!, req.session.isAdmin ?? false, req.session.userRole === "external")) {
    res.status(403).json({ error: "Access denied" });
    return;
  }
  res.json(parseDoc(doc));
});

router.put("/purchase-quotations/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res) || !requireCompany(req, res)) return;
  const id = Number(req.params.id);
  const [existing] = await db.select().from(purchaseQuotationsTable).where(and(
    eq(purchaseQuotationsTable.id, id),
    eq(purchaseQuotationsTable.companyId, req.session.companyId!),
  ));
  if (!existing) {
    res.status(404).json({ error: "Purchase quotation not found" });
    return;
  }
  if (existing.status === "converted_to_po") {
    res.status(409).json({ error: "Converted purchase quotations cannot be edited" });
    return;
  }
  const totals = calculate(req.body);
  const data: any = {
    vendorName: req.body.vendorName,
    vendorAddress: req.body.vendorAddress,
    vendorContact: req.body.vendorContact,
    vendorContactEmail: req.body.vendorContactEmail,
    deliveryAddress: req.body.deliveryAddress,
    issueDate: req.body.issueDate,
    deliveryDate: req.body.deliveryDate,
    paymentTerms: req.body.paymentTerms,
    notes: req.body.notes,
    items: req.body.items,
    subtotal: totals.subtotal.toFixed(2),
    discountAmount: totals.discountAmount.toFixed(2),
    tax: totals.tax.toFixed(2),
    totalAmount: totals.totalAmount.toFixed(2),
  };
  if (req.body.currency !== undefined) data.currency = req.body.currency;
  if (req.body.isPrivate !== undefined) data.isPrivate = req.body.isPrivate === true;
  if (req.body.status) data.status = req.body.status;
  const [updated] = await db.update(purchaseQuotationsTable).set(data)
    .where(eq(purchaseQuotationsTable.id, id)).returning();
  await upsertVendor(req.session.companyId!, data.vendorName, data.vendorAddress, data.vendorContact, data.vendorContactEmail);
  logAudit({ req, action: data.status ? `status:${data.status}` : "update", entityType: "purchase_quotation", entityId: id, entityLabel: updated.pqNumber });
  res.json(parseDoc(updated));
});

router.post("/purchase-quotations/:id/mark-sent", async (req, res): Promise<void> => {
  if (!requireAuth(req, res) || !requireCompany(req, res)) return;
  const id = Number(req.params.id);
  const [existing] = await db.select().from(purchaseQuotationsTable).where(and(
    eq(purchaseQuotationsTable.id, id),
    eq(purchaseQuotationsTable.companyId, req.session.companyId!),
  ));
  if (!existing) {
    res.status(404).json({ error: "Purchase quotation not found" });
    return;
  }
  const sentTo = Array.isArray(req.body.sentTo) ? req.body.sentTo.filter(Boolean).join(", ") : null;
  const [updated] = await db.update(purchaseQuotationsTable).set({
    status: ["draft", "confirmed"].includes(existing.status) ? "sent" : existing.status,
    ...(sentTo ? { emailSentTo: sentTo } : {}),
  }).where(eq(purchaseQuotationsTable.id, id)).returning();
  logAudit({ req, action: "mark-sent", entityType: "purchase_quotation", entityId: id, entityLabel: updated.pqNumber });
  res.json(parseDoc(updated));
});

router.post("/purchase-quotations/:id/mark-confirmed", async (req, res): Promise<void> => {
  if (!requireAuth(req, res) || !requireCompany(req, res)) return;
  const id = Number(req.params.id);
  const [updated] = await db.update(purchaseQuotationsTable).set({ status: "confirmed" }).where(and(
    eq(purchaseQuotationsTable.id, id),
    eq(purchaseQuotationsTable.companyId, req.session.companyId!),
  )).returning();
  if (!updated) {
    res.status(404).json({ error: "Purchase quotation not found" });
    return;
  }
  logAudit({ req, action: "status:confirmed", entityType: "purchase_quotation", entityId: id, entityLabel: updated.pqNumber });
  res.json(parseDoc(updated));
});

router.post("/purchase-quotations/:id/convert-to-po", async (req, res): Promise<void> => {
  if (!requireAuth(req, res) || !requireCompany(req, res)) return;
  const id = Number(req.params.id);
  const [quotation] = await db.select().from(purchaseQuotationsTable).where(and(
    eq(purchaseQuotationsTable.id, id),
    eq(purchaseQuotationsTable.companyId, req.session.companyId!),
  ));
  if (!quotation) {
    res.status(404).json({ error: "Purchase quotation not found" });
    return;
  }
  if (quotation.convertedPoId) {
    res.status(409).json({ error: "Purchase quotation is already converted", id: quotation.convertedPoId });
    return;
  }
  if (!["confirmed", "sent"].includes(quotation.status)) {
    res.status(409).json({ error: "Confirm the purchase quotation before converting it" });
    return;
  }

  const sourceItems = (quotation.items as any[]) || [];
  const subtotal = Number(quotation.subtotal) || 0;
  const discountRatio = subtotal > 0 ? Math.max(0, (subtotal - Number(quotation.discountAmount || 0)) / subtotal) : 1;
  const poItems = sourceItems.map((item: any) => {
    if (item.type === "section") return item;
    if (item.isFoc) return { ...item, isFoc: undefined, discount: undefined, unitPrice: 0, amount: 0 };
    const unitPrice = (Number(item.unitPrice) || 0) * (1 - (Number(item.discount) || 0) / 100) * discountRatio;
    return { ...item, discount: undefined, unitPrice, amount: (Number(item.qty) || 0) * unitPrice };
  });
  const poSubtotal = poItems.reduce((sum: number, item: any) => item.type === "section" || item.isFoc ? sum : sum + Number(item.amount || 0), 0);
  const taxRate = Math.max(0, Number(quotation.subtotal) - Number(quotation.discountAmount)) > 0
    ? Number(quotation.tax) / (Number(quotation.subtotal) - Number(quotation.discountAmount)) * 100
    : 0;
  const poTax = poSubtotal * taxRate / 100;
  const poNumber = await nextDocNumber("po", req.session.companyId!);
  const [po] = await db.insert(purchaseOrdersTable).values({
    poNumber,
    companyId: req.session.companyId!,
    vendorName: quotation.vendorName,
    vendorAddress: quotation.vendorAddress,
    vendorContact: quotation.vendorContact,
    vendorContactEmail: quotation.vendorContactEmail,
    deliveryAddress: quotation.deliveryAddress,
    issueDate: new Date().toISOString().slice(0, 10),
    deliveryDate: quotation.deliveryDate,
    paymentTerms: quotation.paymentTerms,
    quoteRefNo: quotation.pqNumber,
    notes: quotation.notes,
    items: poItems,
    subtotal: poSubtotal.toFixed(2),
    tax: poTax.toFixed(2),
    totalAmount: (poSubtotal + poTax).toFixed(2),
    currency: quotation.currency,
    status: "draft",
    isPrivate: quotation.isPrivate,
    createdBy: req.session.userId!,
  }).returning();
  await db.update(purchaseQuotationsTable).set({
    status: "converted_to_po",
    convertedPoId: po.id,
    convertedPoNumber: po.poNumber,
  }).where(eq(purchaseQuotationsTable.id, id));
  logAudit({ req, action: "convert-to-po", entityType: "purchase_quotation", entityId: id, entityLabel: quotation.pqNumber });
  res.status(201).json({ id: po.id, number: po.poNumber });
});

router.post("/purchase-quotations/:id/convert-to-vendor-invoice", async (req, res): Promise<void> => {
  if (!requireAuth(req, res) || !requireCompany(req, res)) return;
  const id = Number(req.params.id);
  const [quotation] = await db.select().from(purchaseQuotationsTable).where(and(
    eq(purchaseQuotationsTable.id, id),
    eq(purchaseQuotationsTable.companyId, req.session.companyId!),
  ));
  if (!quotation) {
    res.status(404).json({ error: "Purchase quotation not found" });
    return;
  }
  if (!["confirmed", "sent"].includes(quotation.status)) {
    res.status(409).json({ error: "Confirm the purchase quotation before converting it" });
    return;
  }

  const subtotal = Number(quotation.subtotal) || 0;
  const discountAmount = Number(quotation.discountAmount) || 0;
  const tax = Number(quotation.tax) || 0;
  const totalAmount = Number(quotation.totalAmount) || 0;
  const netAmount = Math.max(0, subtotal - discountAmount);
  const gstRate = netAmount > 0 ? (tax / netAmount) * 100 : 9;
  const today = new Date().toISOString().slice(0, 10);
  const piNumber = await nextDocNumber("pi", req.session.companyId!);

  try {
    const [doc] = await db.insert(vendorInvoicesTable).values({
      companyId: req.session.companyId!,
      piNumber,
      piDate: today,
      vendorName: quotation.vendorName,
      poIds: quotation.convertedPoId ? [quotation.convertedPoId] : [],
      poNumbers: quotation.convertedPoNumber || quotation.pqNumber,
      currency: quotation.currency || "SGD",
      totalAmount: totalAmount.toFixed(2),
      paidAmount: "0",
      status: "pending",
      notes: quotation.notes
        ? `${quotation.notes}\n\nFrom ${quotation.pqNumber}`
        : `From ${quotation.pqNumber}`,
      items: (quotation.items ?? []) as any,
      subtotal: netAmount.toFixed(2),
      tax: tax.toFixed(2),
      gstTreatment: "standard_rated",
      gstRate: gstRate.toFixed(2),
      gstAmount: tax.toFixed(2),
      gstInclusive: false,
      exchangeRate: "1.000000",
      createdBy: req.session.userId!,
    }).returning();

    logAudit({
      req,
      action: "convert-to-vendor-invoice",
      entityType: "purchase_quotation",
      entityId: id,
      entityLabel: quotation.pqNumber,
    });

    await postVendorInvoiceJE(
      {
        id: doc.id,
        companyId: doc.companyId,
        piNumber: doc.piNumber,
        vendorName: doc.vendorName,
        piDate: doc.piDate,
        totalAmount,
        gstAmount: tax,
        gstTreatment: "standard_rated",
        expenseAccountId: doc.expenseAccountId,
      },
      req.session.userId!,
      req.log,
    );

    res.status(201).json({ id: doc.id, number: doc.piNumber });
  } catch (err: any) {
    const message = err?.cause?.message || err?.message || "Failed to create vendor invoice";
    res.status(500).json({ error: message });
  }
});

router.delete("/purchase-quotations/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res) || !requireCompany(req, res)) return;
  if (!req.session.isAdmin) {
    res.status(403).json({ error: "Only administrators can delete purchase quotations" });
    return;
  }
  const id = Number(req.params.id);
  const [deleted] = await db.delete(purchaseQuotationsTable).where(and(
    eq(purchaseQuotationsTable.id, id),
    eq(purchaseQuotationsTable.companyId, req.session.companyId!),
  )).returning();
  if (!deleted) {
    res.status(404).json({ error: "Purchase quotation not found" });
    return;
  }
  logAudit({ req, action: "delete", entityType: "purchase_quotation", entityId: id, entityLabel: deleted.pqNumber });
  res.json({ success: true });
});

export default router;
