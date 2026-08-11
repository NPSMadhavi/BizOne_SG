import { Router, type IRouter } from "express";
import { db, quotationsTable, invoicesTable, proformaInvoicesTable, usersTable, customersTable } from "@workspace/db";
import { eq, desc, inArray, ilike, and } from "drizzle-orm";
import { nextDocNumber } from "../lib/running-numbers.js";
import { logAudit } from "../lib/audit.js";

declare module "express-session" {
  interface SessionData {
    userId?: number;
    companyId?: number;
    isAdmin?: boolean;
  }
}

const router: IRouter = Router();

function requireAuth(req: any, res: any): boolean {
  if (!req.session.userId) { res.status(401).json({ error: "Not authenticated" }); return false; }
  return true;
}

function requireCompany(req: any, res: any): boolean {
  if (!req.session.companyId) {
    res.status(400).json({ error: "No company selected. Please select a company first." });
    return false;
  }
  return true;
}

async function upsertCustomerByName(companyId: number, name: string, address?: string | null, contactPerson?: string | null, contactEmail?: string | null) {
  if (!name?.trim()) return;
  const existing = await db.select({ id: customersTable.id }).from(customersTable)
    .where(and(eq(customersTable.companyId, companyId), ilike(customersTable.name, name.trim())))
    .limit(1);
  if (existing.length === 0) {
    await db.insert(customersTable).values({
      companyId, name: name.trim(),
      address: address || null, contactPerson: contactPerson || null, contactEmail: contactEmail || null,
    });
  }
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

function visibilityFilter(docs: any[], userId: number, isAdmin: boolean, isExternal: boolean) {
  if (isExternal) return docs.filter(d => d.createdBy === userId);
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

router.get("/quotations/stats", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const companyId = req.session.companyId;
  const userId = req.session.userId!;
  const isAdmin = req.session.isAdmin ?? false;
  const isExternal = req.session.userRole === "external";

  const all = companyId
    ? await db.select().from(quotationsTable).where(eq(quotationsTable.companyId, companyId))
    : await db.select().from(quotationsTable);
  const visible = visibilityFilter(all, userId, isAdmin, isExternal);
  res.json({
    total: visible.length,
    confirmed: visible.filter(x => x.status === "confirmed").length,
    draft: visible.filter(x => x.status === "draft").length,
    cancelled: visible.filter(x => x.status === "cancelled").length,
    totalValue: visible.reduce((s, x) => s + parseFloat(x.totalAmount ?? "0"), 0),
  });
});

router.get("/quotations", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const companyId = req.session.companyId;
  const userId = req.session.userId!;
  const isAdmin = req.session.isAdmin ?? false;
  const isExternal = req.session.userRole === "external";

  const docs = companyId
    ? await db.select().from(quotationsTable).where(eq(quotationsTable.companyId, companyId)).orderBy(desc(quotationsTable.createdAt))
    : await db.select().from(quotationsTable).orderBy(desc(quotationsTable.createdAt));
  const visible = visibilityFilter(docs, userId, isAdmin, isExternal).map(parseDoc);
  res.json(await withUsernames(visible));
});

router.post("/quotations", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  const companyId = req.session.companyId!;

  const {
    customerName, customerAddress, customerContact, customerContactEmail,
    deliveryAddress, issueDate, deliveryDate, paymentTerms, notes, items, tax,
    currency, discountAmount, isPrivate, status,
  } = req.body;

  if (!customerName || !items) { res.status(400).json({ error: "customerName and items are required" }); return; }

  const subtotal = (items as any[]).reduce((s: number, item: any) => (item.type === "section" || item.isFoc) ? s : s + parseFloat(item.amount || "0"), 0);
  const docDiscount = Number(discountAmount) || 0;
  const taxableAmount = subtotal - docDiscount;
  const taxAmt = typeof tax === "number" ? (taxableAmount * tax) / 100 : 0;
  const totalAmount = taxableAmount + taxAmt;

  const qtNumber = await nextDocNumber("qt", companyId);

  const [doc] = await db.insert(quotationsTable).values({
    qtNumber, companyId: req.session.companyId!, customerName, customerAddress, customerContact,
    customerContactEmail, deliveryAddress, issueDate: issueDate || new Date().toISOString().split("T")[0], deliveryDate, paymentTerms, notes, items,
    currency: currency || "SGD",
    isPrivate: isPrivate === true,
    subtotal: subtotal.toFixed(2), discountAmount: docDiscount.toFixed(2), tax: taxAmt.toFixed(2),
    totalAmount: totalAmount.toFixed(2), status: status || "draft", createdBy: req.session.userId!,
  }).returning();
  await upsertCustomerByName(companyId, customerName, customerAddress, customerContact, customerContactEmail);
  logAudit({ req, action: "create", entityType: "quotation", entityId: doc.id, entityLabel: doc.qtNumber });
  res.status(201).json(parseDoc(doc));
});

router.get("/quotations/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [doc] = await db.select().from(quotationsTable).where(eq(quotationsTable.id, id));
  if (!doc) { res.status(404).json({ error: "Quotation not found" }); return; }

  const userId = req.session.userId!;
  const isAdmin = req.session.isAdmin ?? false;
  const isExternal = req.session.userRole === "external";
  if (isExternal && doc.createdBy !== userId) {
    res.status(403).json({ error: "Access denied" }); return;
  }
  if (doc.isPrivate && doc.createdBy !== userId && !isAdmin) {
    res.status(403).json({ error: "Access denied" }); return;
  }

  // Include customer's custom quotation terms (if set) so the PDF can use them
  let customerQuotationTerms: string | null = null;
  if (doc.customerName && doc.companyId) {
    const [cust] = await db
      .select({ quotationTerms: customersTable.quotationTerms })
      .from(customersTable)
      .where(and(eq(customersTable.companyId, doc.companyId), ilike(customersTable.name, doc.customerName)));
    customerQuotationTerms = cust?.quotationTerms || null;
  }

  res.json({ ...parseDoc(doc), customerQuotationTerms });
});

router.put("/quotations/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const {
    customerName, customerAddress, customerContact, customerContactEmail,
    deliveryAddress, issueDate, deliveryDate, paymentTerms, notes, items, tax, status,
    currency, discountAmount, isPrivate,
  } = req.body;

  const subtotal = (items as any[]).reduce((s: number, item: any) => (item.type === "section" || item.isFoc) ? s : s + parseFloat(item.amount || "0"), 0);
  const docDiscount = Number(discountAmount) || 0;
  const taxableAmount = subtotal - docDiscount;
  const taxAmt = typeof tax === "number" ? (taxableAmount * tax) / 100 : 0;
  const totalAmount = taxableAmount + taxAmt;

  const updateData: any = {
    customerName, customerAddress, customerContact, customerContactEmail,
    deliveryAddress, issueDate, deliveryDate, paymentTerms, notes, items,
    subtotal: subtotal.toFixed(2), discountAmount: docDiscount.toFixed(2),
    tax: taxAmt.toFixed(2), totalAmount: totalAmount.toFixed(2),
  };
  if (currency !== undefined) updateData.currency = currency;
  if (isPrivate !== undefined) updateData.isPrivate = isPrivate === true;
  if (status) updateData.status = status;

  const [updated] = await db.update(quotationsTable).set(updateData).where(eq(quotationsTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Quotation not found" }); return; }
  logAudit({ req, action: updateData.status ? `status:${updateData.status}` : "update", entityType: "quotation", entityId: id, entityLabel: updated.qtNumber });
  res.json(parseDoc(updated));
});

router.post("/quotations/:id/mark-sent", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const companyId = req.session.companyId!;
  const [existing] = await db.select().from(quotationsTable).where(eq(quotationsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Quotation not found" }); return; }
  if (existing.companyId !== companyId) { res.status(403).json({ error: "Forbidden" }); return; }

  const sentTo: string[] = Array.isArray(req.body.sentTo) ? req.body.sentTo : [];
  const updateData: Record<string, any> = {};
  if (["draft", "confirmed"].includes(existing.status)) updateData.status = "sent";
  if (sentTo.length > 0) updateData.emailSentTo = sentTo.join(", ");

  if (Object.keys(updateData).length > 0) {
    await db.update(quotationsTable).set(updateData).where(eq(quotationsTable.id, id));
  }

  const [updated] = await db.select().from(quotationsTable).where(eq(quotationsTable.id, id));
  logAudit({ req, action: "mark-sent", entityType: "quotation", entityId: id, entityLabel: updated.qtNumber });
  res.json(updated);
});

router.post("/quotations/:id/mark-confirmed", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const companyId = req.session.companyId!;
  const [existing] = await db.select().from(quotationsTable).where(eq(quotationsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Quotation not found" }); return; }
  if (existing.companyId !== companyId) { res.status(403).json({ error: "Forbidden" }); return; }
  if (!["draft", "sent"].includes(existing.status)) {
    res.status(400).json({ error: "Only draft or sent quotations can be confirmed" }); return;
  }

  const [updated] = await db.update(quotationsTable).set({ status: "confirmed" }).where(eq(quotationsTable.id, id)).returning();
  logAudit({ req, action: "status:confirmed", entityType: "quotation", entityId: id, entityLabel: updated.qtNumber });
  res.json(updated);
});

router.post("/quotations/:id/mark-converted-to-so", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const companyId = req.session.companyId!;
  const [existing] = await db.select().from(quotationsTable).where(eq(quotationsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Quotation not found" }); return; }
  if (existing.companyId !== companyId) { res.status(403).json({ error: "Forbidden" }); return; }
  if (existing.status === "converted_to_so") {
    res.status(400).json({ error: "Quotation is already converted to Sales Order" }); return;
  }

  const [updated] = await db.update(quotationsTable).set({ status: "converted_to_so" }).where(eq(quotationsTable.id, id)).returning();
  logAudit({ req, action: "status:converted_to_so", entityType: "quotation", entityId: id, entityLabel: updated.qtNumber });
  res.json(parseDoc(updated));
});

// ── Convert quotation → Proforma Invoice or Tax Invoice ───────────────────────
router.post("/quotations/:id/convert", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const { type } = req.body; // "proforma" | "tax"
  if (!["proforma", "tax"].includes(type)) {
    res.status(400).json({ error: "type must be 'proforma' or 'tax'" }); return;
  }

  const companyId = req.session.companyId!;
  const userId    = req.session.userId!;

  const [qt] = await db.select().from(quotationsTable)
    .where(and(eq(quotationsTable.id, id), eq(quotationsTable.companyId, companyId)));
  if (!qt) { res.status(404).json({ error: "Quotation not found" }); return; }

  const today = new Date().toISOString().split("T")[0];

  if (type === "proforma") {
    const piNumber = await nextDocNumber("pi", companyId);
    const [doc] = await db.insert(proformaInvoicesTable).values({
      piNumber, companyId,
      customerName: qt.customerName,
      customerAddress: qt.customerAddress ?? null,
      customerContact: qt.customerContact ?? null,
      customerContactEmail: qt.customerContactEmail ?? null,
      issueDate: today,
      deliveryDate: qt.deliveryDate ?? null,
      paymentTerms: qt.paymentTerms ?? null,
      notes: qt.notes ?? null,
      items: (qt.items ?? []) as any,
      subtotal: String(qt.subtotal ?? 0),
      discountAmount: String(qt.discountAmount ?? 0),
      tax: String(qt.tax ?? 0),
      totalAmount: String(qt.totalAmount ?? 0),
      currency: qt.currency || "SGD",
      qtRefNo: qt.qtNumber,
      status: "draft",
      isPrivate: qt.isPrivate ?? false,
      createdBy: userId,
    }).returning();
    logAudit({ req, action: "convert-to-pi", entityType: "quotation", entityId: id, entityLabel: qt.qtNumber });
    res.status(201).json({ type: "proforma", id: doc.id, number: doc.piNumber });
  } else {
    // type === "tax"
    const invNumber = await nextDocNumber("inv", companyId);
    const subtotal     = parseFloat(String(qt.subtotal   ?? 0));
    const discountAmt  = parseFloat(String(qt.discountAmount ?? 0));
    const taxAmt       = parseFloat(String(qt.tax        ?? 0));
    const totalAmount  = parseFloat(String(qt.totalAmount ?? 0));
    const [doc] = await db.insert(invoicesTable).values({
      invNumber, companyId,
      customerName: qt.customerName,
      customerAddress: qt.customerAddress ?? null,
      customerContact: qt.customerContact ?? null,
      customerContactEmail: qt.customerContactEmail ?? null,
      issueDate: today,
      deliveryDate: qt.deliveryDate ?? null,
      paymentTerms: qt.paymentTerms ?? null,
      notes: qt.notes ?? null,
      items: (qt.items ?? []) as any,
      subtotal: subtotal.toFixed(2),
      discountAmount: discountAmt.toFixed(2),
      tax: taxAmt.toFixed(2),
      totalAmount: totalAmount.toFixed(2),
      currency: qt.currency || "SGD",
      poRefNo: qt.qtNumber,
      status: "draft",
      isPrivate: qt.isPrivate ?? false,
      createdBy: userId,
    }).returning();
    logAudit({ req, action: "convert-to-invoice", entityType: "quotation", entityId: id, entityLabel: qt.qtNumber });
    res.status(201).json({ type: "tax", id: doc.id, number: doc.invNumber });
  }
});

router.delete("/quotations/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const isAdmin = req.session.isAdmin ?? false;
  const isExternal = req.session.userRole === "external";
  if (!isAdmin) { res.status(403).json({ error: "Only administrators can delete quotations" }); return; }
  const id = parseInt(req.params.id);
  const [deleted] = await db.delete(quotationsTable).where(eq(quotationsTable.id, id)).returning();
  logAudit({ req, action: "delete", entityType: "quotation", entityId: id, entityLabel: deleted?.qtNumber });
  res.json({ success: true });
});

export default router;
