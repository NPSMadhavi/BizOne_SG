import { Router, type IRouter } from "express";
import { db, creditNotesTable, usersTable, customersTable, settingsTable } from "@workspace/db";
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
    res.status(400).json({ error: "No company selected." });
    return false;
  }
  return true;
}

function parseDoc(doc: any) {
  return {
    ...doc,
    subtotal: parseFloat(doc.subtotal ?? "0"),
    discountAmount: parseFloat(doc.discountAmount ?? "0"),
    taxRate: parseFloat(doc.taxRate ?? "0"),
    tax: parseFloat(doc.tax ?? "0"),
    totalAmount: parseFloat(doc.totalAmount ?? "0"),
    createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : doc.createdAt,
  };
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

async function upsertCustomer(companyId: number, name: string, address?: string | null, contactPerson?: string | null, contactEmail?: string | null) {
  if (!name?.trim()) return;
  const existing = await db.select({ id: customersTable.id }).from(customersTable)
    .where(and(eq(customersTable.companyId, companyId), ilike(customersTable.name, name.trim())))
    .limit(1);
  if (existing.length === 0) {
    await db.insert(customersTable).values({ companyId, name: name.trim(), address: address || null, contactPerson: contactPerson || null, contactEmail: contactEmail || null });
  }
}

// ── GET /credit-notes/stats ──────────────────────────────────────────────────
router.get("/credit-notes/stats", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const companyId = req.session.companyId;
  const userId = req.session.userId!;
  const isAdmin = req.session.isAdmin ?? false;
  const all = companyId
    ? await db.select().from(creditNotesTable).where(eq(creditNotesTable.companyId, companyId))
    : await db.select().from(creditNotesTable);
  const visible = visibilityFilter(all, userId, isAdmin);
  res.json({
    total: visible.length,
    confirmed: visible.filter(x => x.status === "confirmed").length,
    draft: visible.filter(x => x.status === "draft").length,
    void: visible.filter(x => x.status === "void").length,
    totalValue: visible.filter(x => x.status !== "void").reduce((s, x) => s + parseFloat(x.totalAmount ?? "0"), 0),
  });
});

// ── GET /credit-notes ────────────────────────────────────────────────────────
router.get("/credit-notes", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const companyId = req.session.companyId;
  const userId = req.session.userId!;
  const isAdmin = req.session.isAdmin ?? false;

  const all = companyId
    ? await db.select().from(creditNotesTable).where(eq(creditNotesTable.companyId, companyId)).orderBy(desc(creditNotesTable.createdAt))
    : await db.select().from(creditNotesTable).orderBy(desc(creditNotesTable.createdAt));

  const visible = visibilityFilter(all, userId, isAdmin);
  const withNames = await withUsernames(visible);
  res.json(withNames.map(parseDoc));
});

// ── POST /credit-notes ───────────────────────────────────────────────────────
router.post("/credit-notes", async (req, res): Promise<void> => {
  if (!requireAuth(req, res) || !requireCompany(req, res)) return;
  const companyId = req.session.companyId!;
  const userId = req.session.userId!;

  const {
    customerName, customerAddress, contactPerson, contactEmail,
    refInvNumber, reason, issueDate, currency,
    paymentTerms, notes, isPrivate,
    items, subtotal, discountAmount, taxRate, tax, totalAmount,
    status,
  } = req.body;

  if (!customerName?.trim()) { res.status(400).json({ error: "Customer name is required" }); return; }

  const cnNumber = await nextDocNumber("cn", companyId);

  const [doc] = await db.insert(creditNotesTable).values({
    cnNumber,
    companyId,
    customerName: customerName.trim(),
    customerAddress: customerAddress || null,
    contactPerson: contactPerson || null,
    contactEmail: contactEmail || null,
    refInvNumber: refInvNumber || null,
    reason: reason || null,
    issueDate: issueDate || null,
    currency: currency || "SGD",
    paymentTerms: paymentTerms || null,
    notes: notes || null,
    isPrivate: isPrivate ?? false,
    items: items ?? [],
    subtotal: String(subtotal ?? 0),
    discountAmount: String(discountAmount ?? 0),
    taxRate: String(taxRate ?? 9),
    tax: String(tax ?? 0),
    totalAmount: String(totalAmount ?? 0),
    status: status === "confirmed" ? "confirmed" : "draft",
    createdBy: userId,
  }).returning();

  await upsertCustomer(companyId, customerName, customerAddress, contactPerson, contactEmail);
  logAudit({ req, action: "create", entityType: "credit_note", entityId: doc.id, entityLabel: doc.cnNumber });
  res.status(201).json(parseDoc(doc));
});

// ── GET /credit-notes/:id ────────────────────────────────────────────────────
router.get("/credit-notes/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [doc] = await db.select().from(creditNotesTable).where(eq(creditNotesTable.id, id));
  if (!doc) { res.status(404).json({ error: "Credit note not found" }); return; }

  const userId = req.session.userId!;
  const isAdmin = req.session.isAdmin ?? false;
  if (doc.isPrivate && doc.createdBy !== userId && !isAdmin) {
    res.status(403).json({ error: "Access denied" }); return;
  }

  const [creator] = await db.select({ username: usersTable.username }).from(usersTable).where(eq(usersTable.id, doc.createdBy));
  res.json({ ...parseDoc(doc), createdByUsername: creator?.username || null });
});

// ── PUT /credit-notes/:id ────────────────────────────────────────────────────
router.put("/credit-notes/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [existing] = await db.select().from(creditNotesTable).where(eq(creditNotesTable.id, id));
  if (!existing) { res.status(404).json({ error: "Credit note not found" }); return; }

  const isAdmin = req.session.isAdmin ?? false;
  const userId = req.session.userId!;
  if (existing.status === "void") { res.status(400).json({ error: "Cannot edit a voided credit note" }); return; }
  if (existing.status === "confirmed" && !isAdmin) { res.status(403).json({ error: "Only admins can edit confirmed credit notes" }); return; }

  const {
    customerName, customerAddress, contactPerson, contactEmail,
    refInvNumber, reason, issueDate, currency,
    paymentTerms, notes, isPrivate,
    items, subtotal, discountAmount, taxRate, tax, totalAmount,
    status,
  } = req.body;

  const companyId = existing.companyId;
  const [doc] = await db.update(creditNotesTable).set({
    customerName: customerName?.trim() ?? existing.customerName,
    customerAddress: customerAddress ?? existing.customerAddress,
    contactPerson: contactPerson ?? existing.contactPerson,
    contactEmail: contactEmail ?? existing.contactEmail,
    refInvNumber: refInvNumber ?? existing.refInvNumber,
    reason: reason ?? existing.reason,
    issueDate: issueDate ?? existing.issueDate,
    currency: currency ?? existing.currency,
    paymentTerms: paymentTerms ?? existing.paymentTerms,
    notes: notes ?? existing.notes,
    isPrivate: isPrivate ?? existing.isPrivate,
    items: items ?? existing.items,
    subtotal: subtotal !== undefined ? String(subtotal) : existing.subtotal,
    discountAmount: discountAmount !== undefined ? String(discountAmount) : existing.discountAmount,
    taxRate: taxRate !== undefined ? String(taxRate) : existing.taxRate,
    tax: tax !== undefined ? String(tax) : existing.tax,
    totalAmount: totalAmount !== undefined ? String(totalAmount) : existing.totalAmount,
    status: status ?? existing.status,
  }).where(eq(creditNotesTable.id, id)).returning();

  if (customerName) await upsertCustomer(companyId, customerName, customerAddress, contactPerson, contactEmail);
  logAudit({ req, action: "update", entityType: "credit_note", entityId: doc.id, entityLabel: doc.cnNumber });
  res.json(parseDoc(doc));
});

// ── POST /credit-notes/:id/confirm ───────────────────────────────────────────
router.post("/credit-notes/:id/confirm", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [existing] = await db.select().from(creditNotesTable).where(eq(creditNotesTable.id, id));
  if (!existing) { res.status(404).json({ error: "Credit note not found" }); return; }
  if (existing.status !== "draft") { res.status(400).json({ error: "Only draft credit notes can be confirmed" }); return; }

  const [doc] = await db.update(creditNotesTable).set({ status: "confirmed" }).where(eq(creditNotesTable.id, id)).returning();
  logAudit({ req, action: "update", entityType: "credit_note", entityId: doc.id, entityLabel: `${doc.cnNumber} confirmed` });
  res.json(parseDoc(doc));
});

// ── POST /credit-notes/:id/void ──────────────────────────────────────────────
router.post("/credit-notes/:id/void", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const isAdmin = req.session.isAdmin ?? false;
  if (!isAdmin) { res.status(403).json({ error: "Only admins can void credit notes" }); return; }

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [existing] = await db.select().from(creditNotesTable).where(eq(creditNotesTable.id, id));
  if (!existing) { res.status(404).json({ error: "Credit note not found" }); return; }
  if (existing.status === "void") { res.status(400).json({ error: "Already voided" }); return; }

  const { reason } = req.body;
  const [doc] = await db.update(creditNotesTable).set({ status: "void", voidReason: reason || null }).where(eq(creditNotesTable.id, id)).returning();
  logAudit({ req, action: "update", entityType: "credit_note", entityId: doc.id, entityLabel: `${doc.cnNumber} voided` });
  res.json(parseDoc(doc));
});

// ── DELETE /credit-notes/:id (admin + draft only) ───────────────────────────
router.delete("/credit-notes/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const isAdmin = req.session.isAdmin ?? false;
  if (!isAdmin) { res.status(403).json({ error: "Only admins can delete credit notes" }); return; }

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [existing] = await db.select().from(creditNotesTable).where(eq(creditNotesTable.id, id));
  if (!existing) { res.status(404).json({ error: "Credit note not found" }); return; }
  if (existing.status === "confirmed") { res.status(400).json({ error: "Cannot delete a confirmed credit note. Void it instead." }); return; }

  await db.delete(creditNotesTable).where(eq(creditNotesTable.id, id));
  logAudit({ req, action: "delete", entityType: "credit_note", entityId: id, entityLabel: existing.cnNumber });
  res.json({ ok: true });
});

// ── GET /credit-notes/:id/settings ──────────────────────────────────────────
router.get("/credit-notes/:id/settings", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const [doc] = await db.select().from(creditNotesTable).where(eq(creditNotesTable.id, id));
  if (!doc) { res.status(404).json({ error: "Not found" }); return; }
  const [settings] = await db.select().from(settingsTable).where(eq(settingsTable.companyId, doc.companyId));
  res.json(settings ?? {});
});

export default router;
