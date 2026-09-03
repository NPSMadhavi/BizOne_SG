import { Router, type IRouter } from "express";
import {
  db,
  invoicesTable,
  invoicePaymentsTable,
  usersTable,
  customersTable,
  deliveryOrdersTable,
  stockSerialsTable,
  stockItemsTable,
  salesOrdersTable,
  warehousesTable,
} from "@workspace/db";
import { eq, desc, inArray, ilike, and } from "drizzle-orm";
import { nextDocNumber } from "../lib/running-numbers.js";
import { logAudit } from "../lib/audit.js";
import { postInvoiceJE, reverseInvoiceJE } from "../lib/invoice-auto-post.js";
import { postARPaymentJE, reverseARPaymentJE } from "../lib/invoice-payment-je.js";
import {
  deductInvoiceStock,
  restoreInvoiceStock,
  syncInvoiceStock,
  loadInvoiceNetDeducted,
  alignInvoiceItemsToIssuedWarehouse,
} from "../lib/invoice-stock.js";

declare module "express-session" {
  interface SessionData {
    userId?: number;
    companyId?: number;
    isAdmin?: boolean;
    userRole?: string;
    username?: string;
  }
}

const router: IRouter = Router();

/**
 * Preserve stockItemId when the client omits it on resave.
 * Warehouse MUST come from the client (cube picker) for that same stock item.
 * Part-number text matching stock codes does NOT auto-bind inventory — use the cube icon.
 */
export async function mergeInvoiceStockMeta(
  companyId: number,
  incoming: any[] | undefined,
  previous: any[] | undefined,
  invoiceId?: number,
): Promise<any[]> {
  const items = Array.isArray(incoming) ? incoming : [];
  const prev = Array.isArray(previous) ? previous : [];

  const allStockItems = await db
    .select({ id: stockItemsTable.id })
    .from(stockItemsTable)
    .where(and(eq(stockItemsTable.companyId, companyId), eq(stockItemsTable.type, "product")));

  const validStockIds = new Set<number>();
  for (const s of allStockItems) {
    validStockIds.add(s.id);
  }

  const netQtyByStockItem = new Map<number, number>();
  if (invoiceId) {
    const netMap = await loadInvoiceNetDeducted(db, companyId, invoiceId);
    for (const line of netMap.values()) {
      netQtyByStockItem.set(
        line.stockItemId,
        (netQtyByStockItem.get(line.stockItemId) ?? 0) + line.qty,
      );
    }
  }

  const pickValidStockId = (...candidates: Array<number | undefined>): number | undefined => {
    for (const id of candidates) {
      if (id && validStockIds.has(id)) return id;
    }
    return undefined;
  };

  return items.map((item) => {
    if (!item || item.type === "section") return item;

    const qty = Number(item.qty) || 0;
    const cleanPart = String(item.partNumber || "").replace(/<[^>]*>/g, "").trim().toLowerCase();

    const rawIncomingStockId = Number(item.stockItemId) > 0 ? Number(item.stockItemId) : undefined;
    const incomingStockId = rawIncomingStockId && validStockIds.has(rawIncomingStockId)
      ? rawIncomingStockId
      : undefined;

    const prevLine =
      (rawIncomingStockId
        ? prev.find((p) => p && p.type !== "section" && Number(p.stockItemId) === rawIncomingStockId)
        : undefined)
      ?? (cleanPart
        ? prev.find((p) =>
          p && p.type !== "section"
          && String(p.partNumber || "").replace(/<[^>]*>/g, "").trim().toLowerCase() === cleanPart
        )
        : undefined);

    const prevStockId = Number(prevLine?.stockItemId) > 0 ? Number(prevLine.stockItemId) : undefined;

    // Only bind stock when the client explicitly picked via cube (incomingStockId)
    // or stock was already issued on this invoice. Do NOT auto-link by part-number code match.
    let stockItemId = pickValidStockId(incomingStockId);

    if (!stockItemId && prevStockId && validStockIds.has(prevStockId) && Number(prevLine?.warehouseId) > 0) {
      const issuedQty = netQtyByStockItem.get(prevStockId) ?? 0;
      if (issuedQty > 0.0005) stockItemId = prevStockId;
    }

    if (!stockItemId) {
      return {
        ...item,
        qty,
        isStockItem: false,
        stockItemId: undefined,
        warehouseId: undefined,
        warehouseName: undefined,
      };
    }

    const incomingWh = Number(item.warehouseId) > 0 ? Number(item.warehouseId) : undefined;
    // Only reuse previous warehouse when it belongs to the SAME stock item.
    const prevSameItem = prevStockId === stockItemId;
    const prevWh = prevSameItem && Number(prevLine?.warehouseId) > 0
      ? Number(prevLine.warehouseId)
      : undefined;
    const warehouseId = incomingWh ?? prevWh;

    if (qty > 0 && !warehouseId) {
      throw new Error(
        `Warehouse is required for ${cleanPart || `stock item #${stockItemId}`}. `
        + `Pick the item again with the cube icon and select the warehouse to reduce.`,
      );
    }

    return {
      ...item,
      qty,
      isStockItem: true,
      stockItemId,
      warehouseId,
      warehouseName: incomingWh
        ? (item.warehouseName || (incomingWh === prevWh ? prevLine?.warehouseName : undefined))
        : (item.warehouseName || prevLine?.warehouseName),
    };
  });
}

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

/** Returns the DO number that now exists for this invoice, or null when creation was skipped. */
async function createDeliveryOrderFromInvoice(invoice: any, userId: number): Promise<string | null> {
  const existingDo = await db.select({ doNumber: deliveryOrdersTable.doNumber })
    .from(deliveryOrdersTable)
    .where(and(
      eq(deliveryOrdersTable.companyId, invoice.companyId),
      eq(deliveryOrdersTable.invId, invoice.id),
    ))
    .limit(1);
  if (existingDo.length > 0) return existingDo[0].doNumber;

  const doNumber = await nextDocNumber("do", invoice.companyId);
  const doItems = ((invoice.items as any[]) || [])
    .filter((item: any) => item.type !== "section")
    .map((item: any) => ({
      partNumber: item.partNumber || "",
      description: item.description || "",
      qty: item.qty,
      serialNumbers: item.selectedSerials ? item.selectedSerials.join("\n") : "",
    }));

  await db.insert(deliveryOrdersTable).values({
    doNumber,
    companyId: invoice.companyId,
    customerName: invoice.customerName,
    customerAddress: invoice.customerAddress || null,
    customerContact: invoice.customerContact || null,
    issueDate: invoice.issueDate || new Date().toISOString().split("T")[0],
    deliveryDate: invoice.deliveryDate || null,
    paymentTerms: invoice.paymentTerms || null,
    notes: `Created from Invoice ${invoice.invNumber}`,
    items: doItems,
    isPrivate: invoice.isPrivate,
    status: "draft",
    invId: invoice.id,
    invNumber: invoice.invNumber,
    soId: invoice.soId ?? null,
    soNumber: invoice.soNumber ?? null,
    createdBy: userId,
  });

  return doNumber;
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
    deliveryAddress, issueDate, deliveryDate, paymentTerms, salesPerson, notes, items, tax,
    currency, discountAmount, isPrivate, status, poRefNo, exchangeRate,
    createDeliveryOrder,
    termsAndConditions, deliveryInstructions, customerNote, authorisedSignature,
  } = req.body;

  if (!customerName || !items) { res.status(400).json({ error: "customerName and items are required" }); return; }

  const subtotal = (items as any[]).reduce((s: number, item: any) => (item.type === "section" || item.isFoc) ? s : s + parseFloat(item.amount || "0"), 0);
  const docDiscount = Number(discountAmount) || 0;
  const taxableAmount = subtotal - docDiscount;
  const taxAmt = typeof tax === "number" ? (taxableAmount * tax) / 100 : 0;
  const totalAmount = taxableAmount + taxAmt;

  const invNumber = await nextDocNumber("inv", companyId);
  const createdStatus = status || "draft";
  const stockItems = await mergeInvoiceStockMeta(companyId, items as any[], items as any[]);

  let doc: any;
  let stockApply: { reducedThisSave: any[]; putBackThisSave: any[]; alreadyIssued: any[] } = {
    reducedThisSave: [],
    putBackThisSave: [],
    alreadyIssued: [],
  };
  try {
    // Invoice row + stock movements must commit together (no orphan invoice / partial issue).
    doc = await db.transaction(async (tx) => {
      const [created] = await tx.insert(invoicesTable).values({
        invNumber, companyId: req.session.companyId!, customerName, customerAddress, customerContact,
        customerContactEmail, deliveryAddress, issueDate: issueDate || new Date().toISOString().split("T")[0], deliveryDate, paymentTerms, salesPerson: salesPerson || null, notes,
        items: stockItems,
        currency: currency || "SGD",
        exchangeRate: parseFloat(exchangeRate ?? "1").toFixed(6) as any,
        isPrivate: isPrivate === true,
        poRefNo: poRefNo || null,
        subtotal: subtotal.toFixed(2), discountAmount: docDiscount.toFixed(2), tax: taxAmt.toFixed(2),
        totalAmount: totalAmount.toFixed(2), status: createdStatus, createdBy: req.session.userId!,
        termsAndConditions: termsAndConditions || null,
        deliveryInstructions: deliveryInstructions || null,
        customerNote: customerNote || null,
        authorisedSignature: authorisedSignature || null,
      }).returning();

      // Tax Invoice with cube-picked stock always reduces warehouse qty on confirm.
      // Draft create skips stock; UI now confirms on both Save buttons.
      if (createdStatus === "confirmed") {
        stockApply = await deductInvoiceStock({
          companyId,
          invoiceId: created.id,
          invNumber: created.invNumber,
          items: stockItems,
          userId: req.session.userId!,
          username: req.session.username,
        }, tx);
        const netMap = await loadInvoiceNetDeducted(tx, companyId, created.id);
        const whIds = [...new Set(Array.from(netMap.values()).map((l) => l.warehouseId))];
        const whNameMap = new Map<number, string>();
        if (whIds.length > 0) {
          const whRows = await tx
            .select({ id: warehousesTable.id, name: warehousesTable.name })
            .from(warehousesTable)
            .where(and(eq(warehousesTable.companyId, companyId), inArray(warehousesTable.id, whIds)));
          for (const w of whRows) whNameMap.set(w.id, w.name);
        }
        const alignedItems = alignInvoiceItemsToIssuedWarehouse(stockItems, netMap, whNameMap);
        const [aligned] = await tx.update(invoicesTable)
          .set({ items: alignedItems })
          .where(eq(invoicesTable.id, created.id))
          .returning();
        return aligned ?? created;
      }
      return created;
    });
  } catch (stockErr: any) {
    res.status(400).json({ error: stockErr?.message || "Failed to create invoice / deduct stock" });
    return;
  }

  await upsertCustomerByName(companyId, customerName, customerAddress, customerContact, customerContactEmail);

  let deliveryOrderNumber: string | null = null;
  if (createDeliveryOrder === true) {
    try {
      deliveryOrderNumber = await createDeliveryOrderFromInvoice(doc, req.session.userId!);
    } catch (deliveryOrderErr: any) {
      req.log?.error({ err: deliveryOrderErr }, "Invoice saved but delivery order creation failed");
    }
  }

  if (createdStatus === "confirmed") {
    try {
      const invoiceItems = (doc.items as any[]) || [];
      for (const item of invoiceItems) {
        const selectedSerials: string[] = item.selectedSerials || [];
        if (selectedSerials.length === 0) continue;
        const stockItemId = Number(item.stockItemId) > 0 ? Number(item.stockItemId) : 0;
        let resolvedStockId = stockItemId;
        if (!resolvedStockId) {
          const partNumber = (item.partNumber || "").trim();
          if (!partNumber) continue;
          const [stockItem] = await db.select({ id: stockItemsTable.id })
            .from(stockItemsTable)
            .where(and(eq(stockItemsTable.companyId, companyId), ilike(stockItemsTable.code, partNumber)))
            .limit(1);
          if (!stockItem) continue;
          resolvedStockId = stockItem.id;
        }
        for (const sn of selectedSerials) {
          await db.update(stockSerialsTable)
            .set({ status: "reserved", invoiceId: doc.id, invoiceNumber: doc.invNumber })
            .where(and(
              eq(stockSerialsTable.companyId, companyId),
              eq(stockSerialsTable.stockItemId, resolvedStockId),
              eq(stockSerialsTable.serialNumber, sn),
              eq(stockSerialsTable.status, "available")
            ));
        }
      }
    } catch (serialErr: any) {
      req.log?.error({ err: serialErr }, "Serial reservation failed on create (non-fatal)");
    }

    await postInvoiceJE(
      {
        id: doc.id,
        companyId,
        invNumber: doc.invNumber,
        customerName: doc.customerName,
        issueDate: doc.issueDate,
        totalAmount: doc.totalAmount,
        subtotal: doc.subtotal,
        discountAmount: doc.discountAmount,
        tax: doc.tax,
      },
      req.session.userId!,
      req.log,
    );
  }

  logAudit({ req, action: "create", entityType: "invoice", entityId: doc.id, entityLabel: doc.invNumber });
  res.status(201).json({ ...parseDoc(doc), deliveryOrderNumber, stockApply });
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
    deliveryAddress, issueDate, deliveryDate, paymentTerms, salesPerson, notes, items, tax, status,
    currency, discountAmount, isPrivate, poRefNo, exchangeRate, createDeliveryOrder,
    termsAndConditions, deliveryInstructions, customerNote, authorisedSignature,
  } = req.body;

  const subtotal = (items as any[]).reduce((s: number, item: any) => (item.type === "section" || item.isFoc) ? s : s + parseFloat(item.amount || "0"), 0);
  const docDiscount = Number(discountAmount) || 0;
  const taxableAmount = subtotal - docDiscount;
  const taxAmt = typeof tax === "number" ? (taxableAmount * tax) / 100 : 0;
  const totalAmount = taxableAmount + taxAmt;

  const updateData: any = {
    customerName, customerAddress, customerContact, customerContactEmail,
    deliveryAddress, issueDate, deliveryDate, paymentTerms, salesPerson: salesPerson !== undefined ? (salesPerson || null) : undefined, notes, items,
    subtotal: subtotal.toFixed(2), discountAmount: docDiscount.toFixed(2),
    tax: taxAmt.toFixed(2), totalAmount: totalAmount.toFixed(2),
    poRefNo: poRefNo ?? null,
  };
  if (currency !== undefined) updateData.currency = currency;
  if (exchangeRate !== undefined) updateData.exchangeRate = parseFloat(exchangeRate).toFixed(6);
  if (isPrivate !== undefined) updateData.isPrivate = isPrivate === true;
  if (status) updateData.status = status;
  if (termsAndConditions !== undefined) updateData.termsAndConditions = termsAndConditions || null;
  if (deliveryInstructions !== undefined) updateData.deliveryInstructions = deliveryInstructions || null;
  if (customerNote !== undefined) updateData.customerNote = customerNote || null;
  if (authorisedSignature !== undefined) updateData.authorisedSignature = authorisedSignature || null;

  const [existing] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, id));
  if (!existing) { res.status(404).json({ error: "Invoice not found" }); return; }

  // Only mark modified when saving an invoice that was already confirmed (not first draft→confirmed save).
  const wasAlreadyConfirmed = !["draft"].includes(String(existing.status));
  if (wasAlreadyConfirmed) {
    updateData.isModified = true;
  }

  const nextStatus = status || existing.status;
  // Confirmed invoices keep stock issued. Draft/void/cancelled do not issue.
  // Never restore stock by flipping back to draft — only Void restores.
  const stockTrackedStatus = !["draft", "void", "cancelled"].includes(String(nextStatus));
  const wasStockTracked = !["draft", "void", "cancelled"].includes(String(existing.status));

  if (wasStockTracked && nextStatus === "draft") {
    res.status(400).json({
      error: "Cannot move a stock-issued invoice back to draft. Void the invoice to restore stock.",
    });
    return;
  }

  let updated: any;
  let stockApply: { reducedThisSave: any[]; putBackThisSave: any[]; alreadyIssued: any[] } = {
    reducedThisSave: [],
    putBackThisSave: [],
    alreadyIssued: [],
  };
  try {
    updated = await db.transaction(async (tx) => {
      if (wasStockTracked || stockTrackedStatus) {
        const stockItems = stockTrackedStatus ? await mergeInvoiceStockMeta(existing.companyId, items as any[], existing.items as any[], id) : [];
        stockApply = await syncInvoiceStock({
          companyId: existing.companyId,
          invoiceId: id,
          invNumber: existing.invNumber,
          items: stockItems,
          userId: req.session.userId!,
          username: req.session.username,
        }, tx);
        if (stockTrackedStatus) {
          const netMap = await loadInvoiceNetDeducted(tx, existing.companyId, id);
          const whIds = [...new Set([
            ...Array.from(netMap.values()).map((l) => l.warehouseId),
            ...stockItems.map((i: any) => Number(i.warehouseId)).filter((n: number) => n > 0),
          ])];
          const whNameMap = new Map<number, string>();
          if (whIds.length > 0) {
            const whRows = await tx
              .select({ id: warehousesTable.id, name: warehousesTable.name })
              .from(warehousesTable)
              .where(and(eq(warehousesTable.companyId, existing.companyId), inArray(warehousesTable.id, whIds)));
            for (const w of whRows) whNameMap.set(w.id, w.name);
          }
          // Persist the warehouse from this save (desired), with resolved names.
          updateData.items = alignInvoiceItemsToIssuedWarehouse(stockItems, netMap, whNameMap);
        }
      }

      const [row] = await tx.update(invoicesTable).set(updateData).where(eq(invoicesTable.id, id)).returning();
      return row;
    });
  } catch (stockErr: any) {
    res.status(400).json({ error: stockErr?.message || "Failed to update stock for this invoice" });
    return;
  }
  if (!updated) { res.status(404).json({ error: "Invoice not found" }); return; }

  const companyId = updated.companyId;
  const isNewlyConfirmed = status === "confirmed" && existing.status !== "confirmed";

  let deliveryOrderNumber: string | null = null;
  if (createDeliveryOrder === true) {
    try {
      deliveryOrderNumber = await createDeliveryOrderFromInvoice(updated, req.session.userId!);
    } catch (deliveryOrderErr: any) {
      req.log?.error({ err: deliveryOrderErr }, "Invoice updated but delivery order creation failed");
    }
  }

  if (isNewlyConfirmed) {
    try {
      const invoiceItems = (updated.items as any[]) || [];
      for (const item of invoiceItems) {
        const selectedSerials: string[] = item.selectedSerials || [];
        if (selectedSerials.length === 0) continue;
        const stockItemId = Number(item.stockItemId) > 0 ? Number(item.stockItemId) : 0;
        let resolvedStockId = stockItemId;
        if (!resolvedStockId) {
          const partNumber = (item.partNumber || "").trim();
          if (!partNumber) continue;
          const [stockItem] = await db.select({ id: stockItemsTable.id })
            .from(stockItemsTable)
            .where(and(eq(stockItemsTable.companyId, companyId), ilike(stockItemsTable.code, partNumber)))
            .limit(1);
          if (!stockItem) continue;
          resolvedStockId = stockItem.id;
        }
        for (const sn of selectedSerials) {
          await db.update(stockSerialsTable)
            .set({ status: "reserved", invoiceId: id, invoiceNumber: updated.invNumber })
            .where(and(
              eq(stockSerialsTable.companyId, companyId),
              eq(stockSerialsTable.stockItemId, resolvedStockId),
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
  res.json({ ...parseDoc(updated), deliveryOrderNumber, stockApply });
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

  let updated: any;
  try {
    // Void status + stock restore must be atomic.
    updated = await db.transaction(async (tx) => {
      const [row] = await tx.update(invoicesTable)
        .set({ status: "void", voidReason: String(voidReason).trim() })
        .where(eq(invoicesTable.id, id))
        .returning();

      await restoreInvoiceStock({
        companyId: existing.companyId,
        invoiceId: id,
        invNumber: existing.invNumber,
        userId: req.session.userId!,
        username: req.session.username,
      }, tx);

      return row;
    });
  } catch (stockErr: any) {
    res.status(400).json({ error: stockErr?.message || "Failed to void invoice / restore stock" });
    return;
  }

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
  const role = req.session.userRole;
  const canDelete = (req.session.isAdmin ?? false) || role === "accountant";
  if (!canDelete) { res.status(403).json({ error: "Only administrators or accountants can delete invoices." }); return; }
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const [existing] = await db.select({ id: invoicesTable.id, status: invoicesTable.status, invNumber: invoicesTable.invNumber, companyId: invoicesTable.companyId })
    .from(invoicesTable).where(eq(invoicesTable.id, id));
  if (!existing) { res.status(404).json({ error: "Invoice not found" }); return; }
  if (existing.status !== "draft") { res.status(400).json({ error: "Only draft invoices can be deleted. Confirmed invoices must be Voided." }); return; }

  try {
    await restoreInvoiceStock({
      companyId: existing.companyId,
      invoiceId: id,
      invNumber: existing.invNumber,
      userId: req.session.userId!,
      username: req.session.username,
    });
  } catch (stockErr: any) {
    req.log.error({ err: stockErr }, "Failed to restore stock for deleted invoice");
  }

  await db.delete(invoicesTable).where(eq(invoicesTable.id, id));

  // Clear reverse links on sales orders so convert can be retried
  try {
    await db.update(salesOrdersTable).set({
      invId: null,
      invNumber: null,
    } as any).where(eq(salesOrdersTable.invId, id));
  } catch (linkErr: any) {
    req.log?.warn?.({ err: linkErr }, "Failed to clear sales_order inv link after invoice delete");
  }

  logAudit({ req, action: "delete", entityType: "invoice", entityId: id, entityLabel: existing.invNumber });
  res.json({ success: true });
});

export default router;
