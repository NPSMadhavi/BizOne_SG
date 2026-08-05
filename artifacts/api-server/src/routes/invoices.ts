import { Router, type IRouter } from "express";
import { db, invoicesTable, invoicePaymentsTable, usersTable, customersTable, deliveryOrdersTable, stockSerialsTable, stockItemsTable } from "@workspace/db";
import { eq, desc, inArray, ilike, and, sql } from "drizzle-orm";
import { nextDocNumber } from "../lib/running-numbers.js";
import { logAudit } from "../lib/audit.js";
import { postInvoiceJE, reverseInvoiceJE } from "../lib/invoice-auto-post.js";
import { postARPaymentJE, reverseARPaymentJE } from "../lib/invoice-payment-je.js";

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

router.get("/invoices/stats", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const companyId = req.session.companyId;
  const userId = req.session.userId!;
  const isAdmin = req.session.isAdmin ?? false;
  const isExternal = req.session.userRole === "external";

  const all = companyId
    ? await db.select().from(invoicesTable).where(eq(invoicesTable.companyId, companyId))
    : await db.select().from(invoicesTable);
  const visible = visibilityFilter(all, userId, isAdmin, isExternal);
  const confirmedInvoices = visible.filter(x => x.status === "confirmed");
  res.json({
    total: visible.length,
    confirmed: confirmedInvoices.length,
    draft: visible.filter(x => x.status === "draft").length,
    cancelled: visible.filter(x => x.status === "cancelled").length,
    totalValue: visible.reduce((s, x) => s + parseFloat(x.totalAmount ?? "0"), 0),
    confirmedValue: confirmedInvoices.reduce((s, x) => s + parseFloat(x.totalAmount ?? "0"), 0),
  });
});

router.get("/invoices", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const companyId = req.session.companyId;
  const userId = req.session.userId!;
  const isAdmin = req.session.isAdmin ?? false;
  const isExternal = req.session.userRole === "external";

  const docs = companyId
    ? await db.select().from(invoicesTable).where(eq(invoicesTable.companyId, companyId)).orderBy(desc(invoicesTable.createdAt))
    : await db.select().from(invoicesTable).orderBy(desc(invoicesTable.createdAt));

  const visible = visibilityFilter(docs, userId, isAdmin, isExternal).map(parseDoc);

  // Fetch all payments for visible invoices and attach paidAmount + balance
  const invoiceIds = visible.map(d => d.id);
  let paymentsByInvoice: Record<number, number> = {};
  if (invoiceIds.length > 0) {
    const payments = await db.select().from(invoicePaymentsTable)
      .where(inArray(invoicePaymentsTable.invoiceId, invoiceIds));
    for (const p of payments) {
      paymentsByInvoice[p.invoiceId] = (paymentsByInvoice[p.invoiceId] ?? 0) + parseFloat(p.amount ?? "0");
    }
  }

  const withBalances = visible.map(d => {
    const paidAmount = paymentsByInvoice[d.id] ?? 0;
    const balance = ["cancelled", "void"].includes(d.status) ? 0 : Math.max(0, d.totalAmount - paidAmount);
    return { ...d, paidAmount, balance };
  });

  res.json(await withUsernames(withBalances));
});

router.post("/invoices", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  const companyId = req.session.companyId!;

  const {
    customerName, customerAddress, customerContact, customerContactEmail,
    deliveryAddress, issueDate, deliveryDate, paymentTerms, notes, items, tax,
    currency, discountAmount, isPrivate, status, poRefNo, exchangeRate,
  } = req.body;

  if (!customerName || !items) { res.status(400).json({ error: "customerName and items are required" }); return; }

  const subtotal = (items as any[]).reduce((s: number, item: any) => (item.type === "section" || item.isFoc) ? s : s + parseFloat(item.amount || "0"), 0);
  const docDiscount = Number(discountAmount) || 0;
  const taxableAmount = subtotal - docDiscount;
  const taxAmt = typeof tax === "number" ? (taxableAmount * tax) / 100 : 0;
  const totalAmount = taxableAmount + taxAmt;

  const invNumber = await nextDocNumber("inv", companyId);

  const [doc] = await db.insert(invoicesTable).values({
    invNumber, companyId: req.session.companyId!, customerName, customerAddress, customerContact,
    customerContactEmail, deliveryAddress, issueDate: issueDate || new Date().toISOString().split("T")[0], deliveryDate, paymentTerms, notes, items,
    currency: currency || "SGD",
    exchangeRate: parseFloat(exchangeRate ?? "1").toFixed(6) as any,
    isPrivate: isPrivate === true,
    poRefNo: poRefNo || null,
    subtotal: subtotal.toFixed(2), discountAmount: docDiscount.toFixed(2), tax: taxAmt.toFixed(2),
    totalAmount: totalAmount.toFixed(2), status: status || "draft", createdBy: req.session.userId!,
  }).returning();
  await upsertCustomerByName(companyId, customerName, customerAddress, customerContact, customerContactEmail);

  // Deduct stockQty for non-serial stock items immediately on invoice save
  for (const item of (items as any[])) {
    const selectedSerials: string[] = item.selectedSerials || [];
    if (!item.isStockItem || selectedSerials.length > 0) continue;
    const partNumber = (item.partNumber || "").trim();
    if (!partNumber) continue;
    const qty = Number(item.qty) || 0;
    if (qty <= 0) continue;
    const [stockItem] = await db.select({ id: stockItemsTable.id })
      .from(stockItemsTable)
      .where(and(eq(stockItemsTable.companyId, companyId), ilike(stockItemsTable.code, partNumber)))
      .limit(1);
    if (!stockItem) continue;
    await db.update(stockItemsTable)
      .set({ stockQty: sql`GREATEST(0, ${stockItemsTable.stockQty} - ${qty})` })
      .where(eq(stockItemsTable.id, stockItem.id));
  }

  logAudit({ req, action: "create", entityType: "invoice", entityId: doc.id, entityLabel: doc.invNumber });
  res.status(201).json(parseDoc(doc));
});

async function getPaymentsForInvoice(invoiceId: number) {
  return db.select().from(invoicePaymentsTable)
    .where(eq(invoicePaymentsTable.invoiceId, invoiceId))
    .orderBy(desc(invoicePaymentsTable.createdAt));
}

function parsePayment(p: any) {
  return { ...p, amount: parseFloat(p.amount ?? "0"), createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : p.createdAt };
}

async function recomputeInvoiceStatus(invoiceId: number): Promise<void> {
  const [inv] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, invoiceId));
  if (!inv || inv.status === "void" || inv.status === "draft") return;

  const payments = await getPaymentsForInvoice(invoiceId);
  const paidAmount = payments.reduce((s, p) => s + parseFloat(p.amount ?? "0"), 0);
  const totalAmount = parseFloat(inv.totalAmount ?? "0");

  let newStatus: string;
  if (paidAmount >= totalAmount - 0.005) newStatus = "paid";
  else if (paidAmount > 0.004) newStatus = "partial";
  else newStatus = inv.status === "sent" ? "sent" : "confirmed";

  if (newStatus !== inv.status) {
    await db.update(invoicesTable).set({ status: newStatus }).where(eq(invoicesTable.id, invoiceId));
  }
}

router.get("/invoices/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [doc] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, id));
  if (!doc) { res.status(404).json({ error: "Invoice not found" }); return; }

  const userId = req.session.userId!;
  const isAdmin = req.session.isAdmin ?? false;
  const isExternal = req.session.userRole === "external";
  if (isExternal && doc.createdBy !== userId) {
    res.status(403).json({ error: "Access denied" }); return;
  }
  if (doc.isPrivate && doc.createdBy !== userId && !isAdmin) {
    res.status(403).json({ error: "Access denied" }); return;
  }

  const payments = await getPaymentsForInvoice(id);
  const paidAmount = payments.reduce((s, p) => s + parseFloat(p.amount ?? "0"), 0);
  const totalAmount = parseFloat(doc.totalAmount ?? "0");
  const balance = Math.max(0, totalAmount - paidAmount);

  res.json({
    ...parseDoc(doc),
    payments: payments.map(parsePayment),
    paidAmount,
    balance,
  });
});

router.put("/invoices/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const {
    customerName, customerAddress, customerContact, customerContactEmail,
    deliveryAddress, issueDate, deliveryDate, paymentTerms, notes, items, tax, status,
    currency, discountAmount, isPrivate, poRefNo, exchangeRate,
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
    poRefNo: poRefNo ?? null,
  };
  if (currency !== undefined) updateData.currency = currency;
  if (exchangeRate !== undefined) updateData.exchangeRate = parseFloat(exchangeRate).toFixed(6);
  if (isPrivate !== undefined) updateData.isPrivate = isPrivate === true;
  if (status) updateData.status = status;

  const [existing] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, id));
  if (!existing) { res.status(404).json({ error: "Invoice not found" }); return; }

  const [updated] = await db.update(invoicesTable).set(updateData).where(eq(invoicesTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Invoice not found" }); return; }

  const companyId = updated.companyId;
  const isNewlyConfirmed = status === "confirmed" && existing.status !== "confirmed";

  if (isNewlyConfirmed) {
    try {
      const existingDo = await db.select({ id: deliveryOrdersTable.id })
        .from(deliveryOrdersTable)
        .where(and(eq(deliveryOrdersTable.companyId, companyId), eq(deliveryOrdersTable.invId, id)))
        .limit(1);

      if (existingDo.length === 0) {
        const doNumber = await nextDocNumber("do", companyId);
        const doItems = ((updated.items as any[]) || []).map((item: any) => ({
          partNumber: item.partNumber || "",
          description: item.description || "",
          qty: item.qty,
          serialNumbers: item.selectedSerials ? item.selectedSerials.join("\n") : "",
        }));
        await db.insert(deliveryOrdersTable).values({
          doNumber, companyId,
          customerName: updated.customerName,
          customerAddress: updated.customerAddress || null,
          customerContact: updated.customerContact || null,
          issueDate: updated.issueDate || new Date().toISOString().split("T")[0],
          deliveryDate: updated.deliveryDate || null,
          paymentTerms: updated.paymentTerms || null,
          notes: `Auto-created from Invoice ${updated.invNumber}`,
          items: doItems,
          isPrivate: updated.isPrivate,
          status: "draft",
          invId: id,
          invNumber: updated.invNumber,
          createdBy: req.session.userId!,
        });
      }

      const invoiceItems = (updated.items as any[]) || [];
      for (const item of invoiceItems) {
        const selectedSerials: string[] = item.selectedSerials || [];
        if (selectedSerials.length === 0) continue;
        const partNumber = (item.partNumber || "").trim();
        if (!partNumber) continue;
        const [stockItem] = await db.select({ id: stockItemsTable.id })
          .from(stockItemsTable)
          .where(and(eq(stockItemsTable.companyId, companyId), ilike(stockItemsTable.code, partNumber)))
          .limit(1);
        if (!stockItem) continue;
        for (const sn of selectedSerials) {
          await db.update(stockSerialsTable)
            .set({ status: "reserved", invoiceId: id, invoiceNumber: updated.invNumber })
            .where(and(
              eq(stockSerialsTable.companyId, companyId),
              eq(stockSerialsTable.stockItemId, stockItem.id),
              eq(stockSerialsTable.serialNumber, sn),
              eq(stockSerialsTable.status, "available")
            ));
        }
      }
    } catch (autoDoErr: any) {
      req.log.error({ err: autoDoErr }, "Auto-DO / serial reservation failed (non-fatal)");
    }

    // Auto-post IRAS-compliant journal entry for Singapore companies
    await postInvoiceJE(
      {
        id: updated.id,
        companyId,
        invNumber: updated.invNumber,
        customerName: updated.customerName,
        issueDate: updated.issueDate,
        totalAmount: updated.totalAmount,
        subtotal: updated.subtotal,
        discountAmount: updated.discountAmount,
        tax: updated.tax,
      },
      req.session.userId!,
      req.log,
    );
  }

  logAudit({ req, action: isNewlyConfirmed ? "status:confirmed" : "update", entityType: "invoice", entityId: id, entityLabel: updated.invNumber });
  res.json(parseDoc(updated));
});

router.post("/invoices/:id/void", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const { voidReason } = req.body;
  if (!voidReason || !String(voidReason).trim()) {
    res.status(400).json({ error: "Void reason is required" }); return;
  }

  const [existing] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, id));
  if (!existing) { res.status(404).json({ error: "Invoice not found" }); return; }
  if (existing.status === "void") { res.status(400).json({ error: "Invoice is already voided" }); return; }

  const [updated] = await db.update(invoicesTable)
    .set({ status: "void", voidReason: String(voidReason).trim() })
    .where(eq(invoicesTable.id, id))
    .returning();

  // Reverse the accounting entry if one was posted (Singapore companies only)
  await reverseInvoiceJE(
    { id, companyId: existing.companyId, invNumber: existing.invNumber, customerName: existing.customerName },
    req.session.userId!,
    req.log,
  );

  logAudit({ req, action: "void", entityType: "invoice", entityId: id, entityLabel: updated.invNumber, details: { voidReason } });
  res.json(parseDoc(updated));
});

router.post("/invoices/:id/knock-off", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [existing] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, id));
  if (!existing) { res.status(404).json({ error: "Invoice not found" }); return; }
  if (existing.status === "void") { res.status(400).json({ error: "Cannot knock off a voided invoice" }); return; }
  if (existing.status === "paid") { res.status(400).json({ error: "Invoice is already marked as paid" }); return; }

  const companyId = existing.companyId;
  const existingPayments = await getPaymentsForInvoice(id);
  const alreadyPaid = existingPayments.reduce((s, p) => s + parseFloat(p.amount ?? "0"), 0);
  const totalAmount = parseFloat(existing.totalAmount ?? "0");
  const balance = Math.max(0, totalAmount - alreadyPaid);

  const today = new Date().toISOString().split("T")[0];

  if (balance > 0.004) {
    const [payment] = await db.insert(invoicePaymentsTable).values({
      companyId,
      invoiceId: id,
      paymentDate: today,
      amount: balance.toFixed(2),
      reference: "Knocked off",
      paymentMethod: "knock_off",
      createdBy: req.session.userId!,
    }).returning();

    await postARPaymentJE(
      { id: payment.id, invoiceId: id, companyId, paymentDate: today, amount: balance, reference: "Knocked off" },
      existing.invNumber, existing.customerName, req.session.userId!, req.log,
    );
  }

  const [updated] = await db.update(invoicesTable)
    .set({ status: "paid" })
    .where(eq(invoicesTable.id, id))
    .returning();

  logAudit({ req, action: "knock-off", entityType: "invoice", entityId: id, entityLabel: updated.invNumber });
  res.json(parseDoc(updated));
});

// ── Mark Sent ─────────────────────────────────────────────────────────────────

router.post("/invoices/:id/mark-sent", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const companyId = req.session.companyId!;
  const [existing] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, id));
  if (!existing) { res.status(404).json({ error: "Invoice not found" }); return; }
  if (existing.companyId !== companyId) { res.status(403).json({ error: "Forbidden" }); return; }
  if (existing.status === "void") { res.status(400).json({ error: "Cannot mark a voided invoice as sent" }); return; }

  const sentTo: string[] = Array.isArray(req.body.sentTo) ? req.body.sentTo : [];
  const updateData: Record<string, any> = {};
  if (["draft", "confirmed"].includes(existing.status)) updateData.status = "sent";
  if (sentTo.length > 0) updateData.emailSentTo = sentTo.join(", ");

  if (Object.keys(updateData).length > 0) {
    await db.update(invoicesTable).set(updateData).where(eq(invoicesTable.id, id));
  }

  const [updated] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, id));
  logAudit({ req, action: "mark-sent", entityType: "invoice", entityId: id, entityLabel: updated.invNumber });
  res.json(parseDoc(updated));
});

// ── AR Payment CRUD ───────────────────────────────────────────────────────────

router.get("/invoices/:id/payments", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const payments = await getPaymentsForInvoice(id);
  res.json(payments.map(parsePayment));
});

router.post("/invoices/:id/payments", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [inv] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, id));
  if (!inv) { res.status(404).json({ error: "Invoice not found" }); return; }
  if (inv.status === "void") { res.status(400).json({ error: "Cannot record payment on a voided invoice" }); return; }
  if (inv.status === "draft") { res.status(400).json({ error: "Cannot record payment on a draft invoice. Confirm it first." }); return; }

  const { paymentDate, amount, reference, paymentMethod, notes } = req.body;
  if (!paymentDate) { res.status(400).json({ error: "Payment date is required" }); return; }
  const amtNum = parseFloat(amount);
  if (isNaN(amtNum) || amtNum <= 0) { res.status(400).json({ error: "Valid payment amount is required" }); return; }

  const companyId = inv.companyId;

  const [payment] = await db.insert(invoicePaymentsTable).values({
    companyId,
    invoiceId: id,
    paymentDate,
    amount: amtNum.toFixed(2),
    reference: reference || null,
    paymentMethod: paymentMethod || "bank_transfer",
    notes: notes || null,
    createdBy: req.session.userId!,
  }).returning();

  await postARPaymentJE(
    { id: payment.id, invoiceId: id, companyId, paymentDate, amount: amtNum, reference: reference || null },
    inv.invNumber, inv.customerName, req.session.userId!, req.log,
  );

  await recomputeInvoiceStatus(id);

  logAudit({ req, action: "payment:add", entityType: "invoice", entityId: id, entityLabel: inv.invNumber, details: { amount: payment.amount, reference: payment.reference } });
  res.status(201).json({ payment: parsePayment(payment) });
});

router.put("/invoices/:id/payments/:paymentId", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const id = parseInt(req.params.id);
  const paymentId = parseInt(req.params.paymentId);
  if (isNaN(id) || isNaN(paymentId)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const { paymentDate, amount, reference, paymentMethod, notes } = req.body;
  const updates: any = {};
  if (paymentDate !== undefined) updates.paymentDate = paymentDate;
  if (amount !== undefined) updates.amount = parseFloat(amount).toFixed(2);
  if (reference !== undefined) updates.reference = reference;
  if (paymentMethod !== undefined) updates.paymentMethod = paymentMethod;
  if (notes !== undefined) updates.notes = notes;

  await db.update(invoicePaymentsTable).set(updates).where(eq(invoicePaymentsTable.id, paymentId));
  await recomputeInvoiceStatus(id);

  res.json({ success: true });
});

router.delete("/invoices/:id/payments/:paymentId", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const id = parseInt(req.params.id);
  const paymentId = parseInt(req.params.paymentId);
  if (isNaN(id) || isNaN(paymentId)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [inv] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, id));
  if (!inv) { res.status(404).json({ error: "Invoice not found" }); return; }

  await reverseARPaymentJE(paymentId, inv.companyId, inv.invNumber, inv.customerName, req.session.userId!, req.log);
  await db.delete(invoicePaymentsTable).where(eq(invoicePaymentsTable.id, paymentId));
  await recomputeInvoiceStatus(id);

  logAudit({ req, action: "payment:delete", entityType: "invoice", entityId: id, entityLabel: inv.invNumber });
  res.json({ success: true });
});

router.delete("/invoices/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!req.session.isAdmin) { res.status(403).json({ error: "Only administrators can delete invoices." }); return; }
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const [existing] = await db.select({ id: invoicesTable.id, status: invoicesTable.status, invNumber: invoicesTable.invNumber })
    .from(invoicesTable).where(eq(invoicesTable.id, id));
  if (!existing) { res.status(404).json({ error: "Invoice not found" }); return; }
  if (existing.status !== "draft") { res.status(400).json({ error: "Only draft invoices can be deleted. Confirmed invoices must be Voided." }); return; }
  await db.delete(invoicesTable).where(eq(invoicesTable.id, id));
  logAudit({ req, action: "delete", entityType: "invoice", entityId: id, entityLabel: existing.invNumber });
  res.json({ success: true });
});

export default router;
