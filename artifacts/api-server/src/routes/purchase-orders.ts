import { Router, type IRouter } from "express";
import { db, purchaseOrdersTable, usersTable, vendorsTable, vendorInvoicesTable } from "@workspace/db";
import { eq, desc, and, inArray, ilike } from "drizzle-orm";
import { nextDocNumber } from "../lib/running-numbers.js";
import { autoCreateGrn, autoDeleteGrnIfEmpty } from "./grn.js";
import { logAudit } from "../lib/audit.js";

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
  if (!req.session.companyId) {
    res.status(400).json({ error: "No company selected. Please select a company first." });
    return false;
  }
  return true;
}

async function upsertVendorByName(companyId: number, name: string, address?: string | null, contactPerson?: string | null, contactEmail?: string | null) {
  if (!name?.trim()) return;
  const existing = await db.select({ id: vendorsTable.id }).from(vendorsTable)
    .where(and(eq(vendorsTable.companyId, companyId), ilike(vendorsTable.name, name.trim())))
    .limit(1);
  if (existing.length === 0) {
    await db.insert(vendorsTable).values({
      companyId, name: name.trim(),
      address: address || null, contactPerson: contactPerson || null, contactEmail: contactEmail || null,
    });
  }
}

function parsePO(po: any) {
  return {
    ...po,
    subtotal: parseFloat(po.subtotal ?? "0"),
    tax: parseFloat(po.tax ?? "0"),
    totalAmount: parseFloat(po.totalAmount ?? "0"),
    createdAt: po.createdAt instanceof Date ? po.createdAt.toISOString() : po.createdAt,
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

router.get("/purchase-orders/stats", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const companyId = req.session.companyId;
  const userId = req.session.userId!;
  const isAdmin = req.session.isAdmin ?? false;
  const isExternal = req.session.userRole === "external";

  const all = companyId
    ? await db.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.companyId, companyId))
    : await db.select().from(purchaseOrdersTable);

  const visible = visibilityFilter(all, userId, isAdmin, isExternal);
  res.json({
    total: visible.length,
    confirmed: visible.filter(p => p.status === "confirmed").length,
    draft: visible.filter(p => p.status === "draft").length,
    cancelled: visible.filter(p => p.status === "cancelled").length,
    totalValue: visible.reduce((sum, p) => sum + parseFloat(p.totalAmount ?? "0"), 0),
  });
});

router.get("/purchase-orders", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const companyId = req.session.companyId;
  const userId = req.session.userId!;
  const isAdmin = req.session.isAdmin ?? false;
  const isExternal = req.session.userRole === "external";
  const excludeLinked = req.query.excludeLinked === "true";

  const pos = companyId
    ? await db.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.companyId, companyId)).orderBy(desc(purchaseOrdersTable.createdAt))
    : await db.select().from(purchaseOrdersTable).orderBy(desc(purchaseOrdersTable.createdAt));

  let visible = visibilityFilter(pos, userId, isAdmin, isExternal).map(parsePO);

  if (excludeLinked && companyId) {
    const vendorInvoices = await db.select({ poIds: vendorInvoicesTable.poIds })
      .from(vendorInvoicesTable)
      .where(eq(vendorInvoicesTable.companyId, companyId));
    const linkedPoIds = new Set<number>(
      vendorInvoices.flatMap(vi => (vi.poIds as number[]) || [])
    );
    visible = visible.filter(po => !linkedPoIds.has(po.id));
  }

  res.json(await withUsernames(visible));
});

router.post("/purchase-orders", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  const companyId = req.session.companyId!;

  const {
    vendorName, vendorAddress, vendorContact, vendorContactEmail,
    deliveryAddress, issueDate, deliveryDate, paymentTerms, quoteRefNo, notes,
    items, tax = 0, currency, isPrivate, status,
  } = req.body;

  if (!vendorName || !items) { res.status(400).json({ error: "vendorName and items are required" }); return; }

  const itemsWithAmounts = (items as any[]).map((item: any) => ({
    ...item,
    amount: (item.qty || 0) * (item.unitPrice || 0),
  }));

  const subtotal = itemsWithAmounts.reduce((sum: number, item: any) => sum + (item.amount || 0), 0);
  const taxAmount = (subtotal * (Number(tax) || 0)) / 100;
  const totalAmount = subtotal + taxAmount;

  const poNumber = await nextDocNumber("po", companyId);

  const [po] = await db.insert(purchaseOrdersTable).values({
    poNumber,
    companyId: req.session.companyId!,
    vendorName, vendorAddress, vendorContact, vendorContactEmail,
    deliveryAddress, issueDate: issueDate || new Date().toISOString().split("T")[0], deliveryDate, paymentTerms, quoteRefNo, notes,
    items: itemsWithAmounts,
    currency: currency || "SGD",
    isPrivate: isPrivate === true,
    subtotal: subtotal.toFixed(2),
    tax: taxAmount.toFixed(2),
    totalAmount: totalAmount.toFixed(2),
    status: status || "draft",
    createdBy: req.session.userId!,
  }).returning();
  await upsertVendorByName(companyId, vendorName, vendorAddress, vendorContact, vendorContactEmail);

  if (po.status === "confirmed") {
    await autoCreateGrn(po, req.session.userId!);
  }

  logAudit({ req, action: "create", entityType: "purchase_order", entityId: po.id, entityLabel: po.poNumber });
  res.status(201).json(parsePO(po));
});

router.get("/purchase-orders/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [po] = await db.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, id));
  if (!po) { res.status(404).json({ error: "Purchase order not found" }); return; }

  const userId = req.session.userId!;
  const isAdmin = req.session.isAdmin ?? false;
  const isExternal = req.session.userRole === "external";
  if (isExternal && po.createdBy !== userId) {
    res.status(403).json({ error: "Access denied" }); return;
  }
  if (po.isPrivate && po.createdBy !== userId && !isAdmin) {
    res.status(403).json({ error: "Access denied" }); return;
  }

  res.json(parsePO(po));
});

router.put("/purchase-orders/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const existing = await db.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, id));
  if (existing.length === 0) { res.status(404).json({ error: "Purchase order not found" }); return; }

  const {
    vendorName, vendorAddress, vendorContact, vendorContactEmail,
    deliveryAddress, issueDate, deliveryDate, paymentTerms, quoteRefNo, notes,
    items, tax = 0, currency, isPrivate, status,
  } = req.body;

  const itemsWithAmounts = (items as any[]).map((item: any) => ({
    ...item,
    amount: (item.qty || 0) * (item.unitPrice || 0),
  }));

  const subtotal = itemsWithAmounts.reduce((sum: number, item: any) => sum + (item.amount || 0), 0);
  const taxAmount = (subtotal * (Number(tax) || 0)) / 100;
  const totalAmount = subtotal + taxAmount;

  const updateData: any = {
    vendorName, vendorAddress, vendorContact, vendorContactEmail,
    deliveryAddress, issueDate, deliveryDate, paymentTerms, quoteRefNo, notes,
    items: itemsWithAmounts,
    subtotal: subtotal.toFixed(2),
    tax: taxAmount.toFixed(2),
    totalAmount: totalAmount.toFixed(2),
  };
  if (currency !== undefined) updateData.currency = currency;
  if (isPrivate !== undefined) updateData.isPrivate = isPrivate === true;
  if (status) updateData.status = status;

  const previousStatus = existing[0].status;
  const [updated] = await db.update(purchaseOrdersTable).set(updateData).where(eq(purchaseOrdersTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Purchase order not found" }); return; }

  const newStatus = updateData.status ?? previousStatus;

  if (newStatus === "confirmed") {
    await autoCreateGrn(updated, req.session.userId!);
  } else if (previousStatus === "confirmed" && newStatus !== "confirmed") {
    const result = await autoDeleteGrnIfEmpty(id);
    if (result.blocked) {
      await db.update(purchaseOrdersTable).set({ status: "confirmed" }).where(eq(purchaseOrdersTable.id, id));
      res.status(409).json({
        error: `Cannot revert PO to ${newStatus}. Goods have already been received in GRN ${result.grnNumber}. Please void the GRN first.`,
      });
      return;
    }
  }

  logAudit({ req, action: updateData.status && updateData.status !== existing[0].status ? `status:${updateData.status}` : "update", entityType: "purchase_order", entityId: id, entityLabel: updated.poNumber });
  res.json(parsePO(updated));
});

router.post("/purchase-orders/:id/mark-sent", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const companyId = req.session.companyId!;
  const [existing] = await db.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, id));
  if (!existing) { res.status(404).json({ error: "Purchase order not found" }); return; }
  if (existing.companyId !== companyId) { res.status(403).json({ error: "Forbidden" }); return; }

  const sentTo: string[] = Array.isArray(req.body.sentTo) ? req.body.sentTo : [];
  const updateData: Record<string, any> = {};
  if (existing.status === "confirmed") updateData.status = "sent";
  if (sentTo.length > 0) updateData.emailSentTo = sentTo.join(", ");

  if (Object.keys(updateData).length > 0) {
    await db.update(purchaseOrdersTable).set(updateData).where(eq(purchaseOrdersTable.id, id));
  }

  const [updated] = await db.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, id));
  logAudit({ req, action: "mark-sent", entityType: "purchase_order", entityId: id, entityLabel: updated.poNumber });
  res.json(updated);
});

router.delete("/purchase-orders/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const isAdmin = req.session.isAdmin ?? false;
  const isExternal = req.session.userRole === "external";
  if (!isAdmin) { res.status(403).json({ error: "Only administrators can delete purchase orders" }); return; }

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [po] = await db.delete(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, id)).returning();
  if (!po) { res.status(404).json({ error: "Purchase order not found" }); return; }

  logAudit({ req, action: "delete", entityType: "purchase_order", entityId: id, entityLabel: po.poNumber });
  res.json({ success: true });
});

export default router;
