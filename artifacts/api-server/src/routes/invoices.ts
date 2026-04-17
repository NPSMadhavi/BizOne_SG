import { Router, type IRouter } from "express";
import { db, invoicesTable, usersTable, customersTable, deliveryOrdersTable, stockSerialsTable, stockItemsTable } from "@workspace/db";
import { eq, desc, inArray, ilike, and, sql } from "drizzle-orm";
import { nextDocNumber } from "../lib/running-numbers.js";

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
  res.json({
    total: visible.length,
    confirmed: visible.filter(x => x.status === "confirmed").length,
    draft: visible.filter(x => x.status === "draft").length,
    cancelled: visible.filter(x => x.status === "cancelled").length,
    totalValue: visible.reduce((s, x) => s + parseFloat(x.totalAmount ?? "0"), 0),
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
  res.json(await withUsernames(visible));
});

router.post("/invoices", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  const companyId = req.session.companyId!;

  const {
    customerName, customerAddress, customerContact, customerContactEmail,
    deliveryAddress, issueDate, deliveryDate, paymentTerms, notes, items, tax,
    currency, discountAmount, isPrivate, status,
  } = req.body;

  if (!customerName || !items) { res.status(400).json({ error: "customerName and items are required" }); return; }

  const subtotal = (items as any[]).reduce((s: number, item: any) => s + parseFloat(item.amount || "0"), 0);
  const docDiscount = Number(discountAmount) || 0;
  const taxableAmount = subtotal - docDiscount;
  const taxAmt = typeof tax === "number" ? (taxableAmount * tax) / 100 : 0;
  const totalAmount = taxableAmount + taxAmt;

  const invNumber = await nextDocNumber("inv", companyId);

  const [doc] = await db.insert(invoicesTable).values({
    invNumber, companyId: req.session.companyId!, customerName, customerAddress, customerContact,
    customerContactEmail, deliveryAddress, issueDate: issueDate || new Date().toISOString().split("T")[0], deliveryDate, paymentTerms, notes, items,
    currency: currency || "SGD",
    isPrivate: isPrivate === true,
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

  res.status(201).json(parseDoc(doc));
});

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

  res.json(parseDoc(doc));
});

router.put("/invoices/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const {
    customerName, customerAddress, customerContact, customerContactEmail,
    deliveryAddress, issueDate, deliveryDate, paymentTerms, notes, items, tax, status,
    currency, discountAmount, isPrivate,
  } = req.body;

  const subtotal = (items as any[]).reduce((s: number, item: any) => s + parseFloat(item.amount || "0"), 0);
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

  const [existing] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, id));
  if (!existing) { res.status(404).json({ error: "Invoice not found" }); return; }

  const [updated] = await db.update(invoicesTable).set(updateData).where(eq(invoicesTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Invoice not found" }); return; }

  const companyId = updated.companyId;
  const isNewlyConfirmed = status === "confirmed" && existing.status !== "confirmed";

  if (isNewlyConfirmed) {
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
  }

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

  const [updated] = await db.update(invoicesTable)
    .set({ status: "paid" })
    .where(eq(invoicesTable.id, id))
    .returning();
  res.json(parseDoc(updated));
});

router.delete("/invoices/:id", async (req, res): Promise<void> => {
  res.status(403).json({ error: "Invoices cannot be deleted. Use Void or Knock-Off instead." });
});

export default router;
