import { Router, type IRouter } from "express";
import { db, deliveryOrdersTable, usersTable, customersTable, stockSerialsTable, stockItemsTable, salesOrdersTable } from "@workspace/db";
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

async function upsertCustomerByName(companyId: number, name: string, address?: string | null, contactPerson?: string | null) {
  if (!name?.trim()) return;
  const existing = await db.select({ id: customersTable.id }).from(customersTable)
    .where(and(eq(customersTable.companyId, companyId), ilike(customersTable.name, name.trim())))
    .limit(1);
  if (existing.length === 0) {
    await db.insert(customersTable).values({
      companyId, name: name.trim(),
      address: address || null, contactPerson: contactPerson || null,
    });
  }
}

function parseDoc(doc: any) {
  return {
    ...doc,
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

router.get("/delivery-orders/stats", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const companyId = req.session.companyId;
  const userId = req.session.userId!;
  const isAdmin = req.session.isAdmin ?? false;
  const isExternal = req.session.userRole === "external";

  const all = companyId
    ? await db.select().from(deliveryOrdersTable).where(eq(deliveryOrdersTable.companyId, companyId))
    : await db.select().from(deliveryOrdersTable);
  const visible = visibilityFilter(all, userId, isAdmin, isExternal);
  res.json({
    total: visible.length,
    confirmed: visible.filter(x => x.status === "confirmed").length,
    draft: visible.filter(x => x.status === "draft").length,
    cancelled: visible.filter(x => x.status === "cancelled").length,
    totalValue: 0,
  });
});

router.get("/delivery-orders", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const companyId = req.session.companyId;
  const userId = req.session.userId!;
  const isAdmin = req.session.isAdmin ?? false;
  const isExternal = req.session.userRole === "external";

  const docs = companyId
    ? await db.select().from(deliveryOrdersTable).where(eq(deliveryOrdersTable.companyId, companyId)).orderBy(desc(deliveryOrdersTable.createdAt))
    : await db.select().from(deliveryOrdersTable).orderBy(desc(deliveryOrdersTable.createdAt));
  const visible = visibilityFilter(docs, userId, isAdmin, isExternal).map(parseDoc);
  res.json(await withUsernames(visible));
});

router.post("/delivery-orders", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  const companyId = req.session.companyId!;

  const { customerName, customerAddress, customerContact, issueDate, deliveryDate, paymentTerms, notes, items, isPrivate, status } = req.body;
  if (!customerName || !items) { res.status(400).json({ error: "customerName and items are required" }); return; }

  const doNumber = await nextDocNumber("do", companyId);

  const [doc] = await db.insert(deliveryOrdersTable).values({
    doNumber, companyId: req.session.companyId!, customerName, customerAddress, customerContact,
    issueDate: issueDate || new Date().toISOString().split("T")[0], deliveryDate, paymentTerms, notes, items,
    isPrivate: isPrivate === true,
    status: status || "draft", createdBy: req.session.userId!,
  }).returning();
  await upsertCustomerByName(companyId, customerName, customerAddress, customerContact);
  logAudit({ req, action: "create", entityType: "delivery_order", entityId: doc.id, entityLabel: doc.doNumber });
  res.status(201).json(parseDoc(doc));
});

router.get("/delivery-orders/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [doc] = await db.select().from(deliveryOrdersTable).where(eq(deliveryOrdersTable.id, id));
  if (!doc) { res.status(404).json({ error: "Delivery order not found" }); return; }

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

router.put("/delivery-orders/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const { customerName, customerAddress, customerContact, issueDate, deliveryDate, paymentTerms, notes, items, status, isPrivate } = req.body;

  const updateData: any = { customerName, customerAddress, customerContact, issueDate, deliveryDate, paymentTerms, notes, items };
  if (isPrivate !== undefined) updateData.isPrivate = isPrivate === true;
  if (status) updateData.status = status;

  const [existing] = await db.select().from(deliveryOrdersTable).where(eq(deliveryOrdersTable.id, id));
  if (!existing) { res.status(404).json({ error: "Delivery order not found" }); return; }

  const [updated] = await db.update(deliveryOrdersTable).set(updateData).where(eq(deliveryOrdersTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Delivery order not found" }); return; }

  const isNewlyConfirmed = status === "confirmed" && existing.status !== "confirmed";
  if (isNewlyConfirmed) {
    const companyId = updated.companyId;
    const doItems = (updated.items as any[]) || [];
    // Stock for an invoice-linked DO was already issued from the warehouse when
    // the invoice was saved. Standalone DOs must NOT touch stock_items.stock_qty
    // directly — that drifted from warehouse_stock and broke Stock Transfer
    // availability. Warehouse qty changes only via applyMovement (invoice / GRN / WMS).
    for (const item of doItems) {
      const serialLines = (item.serialNumbers || "").split("\n").map((s: string) => s.trim()).filter(Boolean);
      if (serialLines.length === 0) continue;
      const partNumber = (item.partNumber || "").trim();
      if (!partNumber) continue;
      const [stockItem] = await db.select({ id: stockItemsTable.id })
        .from(stockItemsTable)
        .where(and(eq(stockItemsTable.companyId, companyId), ilike(stockItemsTable.code, partNumber)))
        .limit(1);
      if (!stockItem) continue;
      for (const sn of serialLines) {
        await db.update(stockSerialsTable)
          .set({ status: "shipped", doId: id, doNumber: updated.doNumber })
          .where(and(
            eq(stockSerialsTable.companyId, companyId),
            eq(stockSerialsTable.stockItemId, stockItem.id),
            eq(stockSerialsTable.serialNumber, sn)
          ));
      }
    }
  }

  logAudit({ req, action: isNewlyConfirmed ? "status:confirmed" : "update", entityType: "delivery_order", entityId: id, entityLabel: updated.doNumber });
  res.json(parseDoc(updated));
});

router.post("/delivery-orders/:id/mark-sent", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const companyId = req.session.companyId!;
  const [existing] = await db.select().from(deliveryOrdersTable).where(eq(deliveryOrdersTable.id, id));
  if (!existing) { res.status(404).json({ error: "Delivery order not found" }); return; }
  if (existing.companyId !== companyId) { res.status(403).json({ error: "Forbidden" }); return; }

  const sentTo: string[] = Array.isArray(req.body.sentTo) ? req.body.sentTo : [];
  const updateData: Record<string, any> = {};
  if (["draft", "confirmed"].includes(existing.status)) updateData.status = "sent";
  if (sentTo.length > 0) updateData.emailSentTo = sentTo.join(", ");

  if (Object.keys(updateData).length > 0) {
    await db.update(deliveryOrdersTable).set(updateData).where(eq(deliveryOrdersTable.id, id));
  }

  const [updated] = await db.select().from(deliveryOrdersTable).where(eq(deliveryOrdersTable.id, id));
  logAudit({ req, action: "mark-sent", entityType: "delivery_order", entityId: id, entityLabel: updated.doNumber });
  res.json(updated);
});

router.delete("/delivery-orders/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const isAdmin = req.session.isAdmin ?? false;
  const isExternal = req.session.userRole === "external";
  if (!isAdmin) { res.status(403).json({ error: "Only administrators can delete delivery orders" }); return; }
  const id = parseInt(req.params.id);
  const [deleted] = await db.delete(deliveryOrdersTable).where(eq(deliveryOrdersTable.id, id)).returning();
  try {
    await db.update(salesOrdersTable).set({
      doId: null,
      doNumber: null,
    } as any).where(eq(salesOrdersTable.doId, id));
  } catch (linkErr: any) {
    req.log?.warn?.({ err: linkErr }, "Failed to clear sales_order do link after DO delete");
  }
  logAudit({ req, action: "delete", entityType: "delivery_order", entityId: id, entityLabel: deleted?.doNumber });
  res.json({ success: true });
});

export default router;
