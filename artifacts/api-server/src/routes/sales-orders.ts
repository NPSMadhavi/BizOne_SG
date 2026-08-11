import { Router, type IRouter } from "express";
import { db, salesOrdersTable, usersTable, customersTable, invoicesTable, deliveryOrdersTable } from "@workspace/db";
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

router.get("/sales-orders/stats", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const companyId = req.session.companyId;
  const userId = req.session.userId!;
  const isAdmin = req.session.isAdmin ?? false;
  const isExternal = req.session.userRole === "external";

  const all = companyId
    ? await db.select().from(salesOrdersTable).where(eq(salesOrdersTable.companyId, companyId))
    : await db.select().from(salesOrdersTable);
  const visible = visibilityFilter(all, userId, isAdmin, isExternal);
  res.json({
    total: visible.length,
    confirmed: visible.filter(x => x.status === "confirmed").length,
    draft: visible.filter(x => x.status === "draft").length,
    cancelled: visible.filter(x => x.status === "cancelled").length,
    totalValue: visible.reduce((s, x) => s + parseFloat(x.totalAmount ?? "0"), 0),
  });
});

router.get("/sales-orders", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const companyId = req.session.companyId;
  const userId = req.session.userId!;
  const isAdmin = req.session.isAdmin ?? false;
  const isExternal = req.session.userRole === "external";

  const docs = companyId
    ? await db.select().from(salesOrdersTable).where(eq(salesOrdersTable.companyId, companyId)).orderBy(desc(salesOrdersTable.createdAt))
    : await db.select().from(salesOrdersTable).orderBy(desc(salesOrdersTable.createdAt));
  const visible = visibilityFilter(docs, userId, isAdmin, isExternal).map(parseDoc);
  res.json(await withUsernames(visible));
});

router.post("/sales-orders", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  const companyId = req.session.companyId!;

  const {
    qtId, qtNumber, customerName, customerAddress, customerContact, customerContactEmail,
    deliveryAddress, issueDate, deliveryDate, paymentTerms, notes, items, tax,
    currency, discountAmount, isPrivate, status,
  } = req.body;

  if (!customerName || !items) { res.status(400).json({ error: "customerName and items are required" }); return; }

  const subtotal = (items as any[]).reduce((s: number, item: any) => (item.type === "section" || item.isFoc) ? s : s + parseFloat(item.amount || "0"), 0);
  const docDiscount = Number(discountAmount) || 0;
  const taxableAmount = subtotal - docDiscount;
  const taxAmt = typeof tax === "number" ? (taxableAmount * tax) / 100 : 0;
  const totalAmount = taxableAmount + taxAmt;

  const soNumber = await nextDocNumber("so", companyId);

  const [doc] = await db.insert(salesOrdersTable).values({
    soNumber,
    companyId,
    qtId: qtId ? Number(qtId) : null,
    qtNumber: qtNumber || null,
    customerName,
    customerAddress,
    customerContact,
    customerContactEmail,
    deliveryAddress,
    issueDate: issueDate || new Date().toISOString().split("T")[0],
    deliveryDate,
    paymentTerms,
    notes,
    items,
    currency: currency || "SGD",
    isPrivate: isPrivate === true,
    subtotal: subtotal.toFixed(2),
    discountAmount: docDiscount.toFixed(2),
    tax: taxAmt.toFixed(2),
    totalAmount: totalAmount.toFixed(2),
    status: status || "draft",
    createdBy: req.session.userId!,
  }).returning();
  await upsertCustomerByName(companyId, customerName, customerAddress, customerContact, customerContactEmail);
  logAudit({ req, action: "create", entityType: "sales_order", entityId: doc.id, entityLabel: doc.soNumber });
  res.status(201).json(parseDoc(doc));
});

router.get("/sales-orders/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [doc] = await db.select().from(salesOrdersTable).where(eq(salesOrdersTable.id, id));
  if (!doc) { res.status(404).json({ error: "Sales order not found" }); return; }

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

router.put("/sales-orders/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const {
    qtId, qtNumber, customerName, customerAddress, customerContact, customerContactEmail,
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
  if (qtId !== undefined) updateData.qtId = qtId ? Number(qtId) : null;
  if (qtNumber !== undefined) updateData.qtNumber = qtNumber || null;
  if (currency !== undefined) updateData.currency = currency;
  if (isPrivate !== undefined) updateData.isPrivate = isPrivate === true;
  if (status) updateData.status = status;

  const [updated] = await db.update(salesOrdersTable).set(updateData).where(eq(salesOrdersTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Sales order not found" }); return; }
  logAudit({ req, action: updateData.status ? `status:${updateData.status}` : "update", entityType: "sales_order", entityId: id, entityLabel: updated.soNumber });
  res.json(parseDoc(updated));
});

router.post("/sales-orders/:id/mark-sent", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const companyId = req.session.companyId!;
  const [existing] = await db.select().from(salesOrdersTable).where(eq(salesOrdersTable.id, id));
  if (!existing) { res.status(404).json({ error: "Sales order not found" }); return; }
  if (existing.companyId !== companyId) { res.status(403).json({ error: "Forbidden" }); return; }

  const sentTo: string[] = Array.isArray(req.body.sentTo) ? req.body.sentTo : [];
  const updateData: Record<string, any> = {};
  if (["draft", "confirmed"].includes(existing.status)) updateData.status = "sent";
  if (sentTo.length > 0) updateData.emailSentTo = sentTo.join(", ");

  if (Object.keys(updateData).length > 0) {
    await db.update(salesOrdersTable).set(updateData).where(eq(salesOrdersTable.id, id));
  }

  const [updated] = await db.select().from(salesOrdersTable).where(eq(salesOrdersTable.id, id));
  logAudit({ req, action: "mark-sent", entityType: "sales_order", entityId: id, entityLabel: updated.soNumber });
  res.json(updated);
});

router.post("/sales-orders/:id/convert", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const { type } = req.body; // "tax" | "do"
  if (!["tax", "do"].includes(type)) {
    res.status(400).json({ error: "type must be 'tax' or 'do'" }); return;
  }

  try {
    const companyId = req.session.companyId!;
    const userId = req.session.userId!;

    const [so] = await db.select().from(salesOrdersTable)
      .where(and(eq(salesOrdersTable.id, id), eq(salesOrdersTable.companyId, companyId)));
    if (!so) { res.status(404).json({ error: "Sales order not found" }); return; }

    const today = new Date().toISOString().split("T")[0];

    if (type === "tax") {
      // Stale link: SO points at an invoice that was deleted — clear and allow reconvert
      if ((so as any).invId) {
        const [existingInv] = await db.select({ id: invoicesTable.id })
          .from(invoicesTable)
          .where(eq(invoicesTable.id, (so as any).invId))
          .limit(1);
        if (existingInv) {
          res.status(400).json({
            error: "Sales order is already converted to Tax Invoice",
            id: (so as any).invId,
            number: (so as any).invNumber,
          });
          return;
        }
        await db.update(salesOrdersTable).set({
          invId: null,
          invNumber: null,
        } as any).where(eq(salesOrdersTable.id, id));
      }
      const invNumber = await nextDocNumber("inv", companyId);
      const [doc] = await db.insert(invoicesTable).values({
        invNumber, companyId,
        customerName: so.customerName,
        customerAddress: so.customerAddress ?? null,
        customerContact: so.customerContact ?? null,
        customerContactEmail: so.customerContactEmail ?? null,
        deliveryAddress: so.deliveryAddress ?? null,
        issueDate: today,
        deliveryDate: so.deliveryDate ?? null,
        paymentTerms: so.paymentTerms ?? null,
        notes: so.notes ?? null,
        items: (so.items ?? []) as any,
        subtotal: String(so.subtotal ?? 0),
        discountAmount: String(so.discountAmount ?? 0),
        tax: String(so.tax ?? 0),
        totalAmount: String(so.totalAmount ?? 0),
        currency: so.currency || "SGD",
        soId: so.id,
        soNumber: so.soNumber,
        status: "draft",
        isPrivate: so.isPrivate ?? false,
        createdBy: userId,
      }).returning();

      try {
        await db.update(salesOrdersTable).set({
          invId: doc.id,
          invNumber: doc.invNumber,
        } as any).where(eq(salesOrdersTable.id, id));
      } catch (linkErr: any) {
        req.log?.warn?.({ err: linkErr }, "SO convert: failed to store inv link (columns may be missing)");
      }

      // Ensure SO fields landed (handles older DBs / partial column issues)
      if (doc && (!(doc as any).soId || !(doc as any).soNumber)) {
        try {
          await db.update(invoicesTable).set({
            soId: so.id,
            soNumber: so.soNumber,
          } as any).where(eq(invoicesTable.id, doc.id));
          (doc as any).soId = so.id;
          (doc as any).soNumber = so.soNumber;
        } catch (soLinkErr: any) {
          req.log?.warn?.({ err: soLinkErr }, "SO convert: failed to store so_id/so_number on invoice");
        }
      }

      logAudit({ req, action: "convert-to-invoice", entityType: "sales_order", entityId: id, entityLabel: so.soNumber });
      res.status(201).json({ type: "tax", id: doc.id, number: doc.invNumber });
      return;
    }

    // type === "do"
    if ((so as any).doId) {
      const [existingDo] = await db.select({ id: deliveryOrdersTable.id })
        .from(deliveryOrdersTable)
        .where(eq(deliveryOrdersTable.id, (so as any).doId))
        .limit(1);
      if (existingDo) {
        res.status(400).json({
          error: "Sales order is already converted to Delivery Order",
          id: (so as any).doId,
          number: (so as any).doNumber,
        });
        return;
      }
      await db.update(salesOrdersTable).set({
        doId: null,
        doNumber: null,
      } as any).where(eq(salesOrdersTable.id, id));
    }
    const doNumber = await nextDocNumber("do", companyId);
    const doItems = ((so.items as any[]) || [])
      .filter((item: any) => item.type !== "section")
      .map((item: any) => ({
        partNumber: item.partNumber || "",
        description: item.description || "",
        qty: item.qty,
        serialNumbers: item.selectedSerials ? item.selectedSerials.join("\n") : (item.serialNumbers || ""),
      }));

    const [doc] = await db.insert(deliveryOrdersTable).values({
      doNumber,
      companyId,
      customerName: so.customerName,
      customerAddress: so.customerAddress ?? null,
      customerContact: so.customerContact ?? null,
      issueDate: today,
      deliveryDate: so.deliveryDate ?? null,
      paymentTerms: so.paymentTerms ?? null,
      notes: so.notes ? so.notes : `Created from Sales Order ${so.soNumber}`,
      items: doItems,
      isPrivate: so.isPrivate ?? false,
      status: "draft",
      soId: so.id,
      soNumber: so.soNumber,
      createdBy: userId,
    }).returning();

    try {
      await db.update(salesOrdersTable).set({
        doId: doc.id,
        doNumber: doc.doNumber,
      } as any).where(eq(salesOrdersTable.id, id));
    } catch (linkErr: any) {
      req.log?.warn?.({ err: linkErr }, "SO convert: failed to store do link (columns may be missing)");
    }

    logAudit({ req, action: "convert-to-do", entityType: "sales_order", entityId: id, entityLabel: so.soNumber });
    res.status(201).json({ type: "do", id: doc.id, number: doc.doNumber });
  } catch (e: any) {
    const msg = e?.message || "Failed to convert sales order";
    req.log?.error?.({ err: e }, "sales-order convert failed");
    res.status(500).json({ error: msg });
  }
});

router.delete("/sales-orders/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const isAdmin = req.session.isAdmin ?? false;
  if (!isAdmin) { res.status(403).json({ error: "Only administrators can delete sales orders" }); return; }
  const id = parseInt(req.params.id);
  const [deleted] = await db.delete(salesOrdersTable).where(eq(salesOrdersTable.id, id)).returning();
  logAudit({ req, action: "delete", entityType: "sales_order", entityId: id, entityLabel: deleted?.soNumber });
  res.json({ success: true });
});

export default router;
