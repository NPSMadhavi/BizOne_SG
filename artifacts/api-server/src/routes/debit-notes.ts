import { Router, type IRouter } from "express";
import { db, debitNotesTable, usersTable, customersTable, settingsTable } from "@workspace/db";
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

// ── GET /debit-notes/stats ───────────────────────────────────────────────────
router.get("/debit-notes/stats", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const companyId = req.session.companyId;
  const userId = req.session.userId!;
  const isAdmin = req.session.isAdmin ?? false;
  const all = companyId
    ? await db.select().from(debitNotesTable).where(eq(debitNotesTable.companyId, companyId))
    : await db.select().from(debitNotesTable);
  const visible = visibilityFilter(all, userId, isAdmin);
  res.json({
    total: visible.length,
    confirmed: visible.filter(x => x.status === "confirmed").length,
    draft: visible.filter(x => x.status === "draft").length,
    void: visible.filter(x => x.status === "void").length,
    totalValue: visible.filter(x => x.status !== "void").reduce((s, x) => s + parseFloat(x.totalAmount ?? "0"), 0),
  });
});

// ── GET /debit-notes ─────────────────────────────────────────────────────────
router.get("/debit-notes", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const companyId = req.session.companyId;
  const userId = req.session.userId!;
  const isAdmin = req.session.isAdmin ?? false;

  const all = companyId
    ? await db.select().from(debitNotesTable).where(eq(debitNotesTable.companyId, companyId)).orderBy(desc(debitNotesTable.createdAt))
    : await db.select().from(debitNotesTable).orderBy(desc(debitNotesTable.createdAt));

  const visible = visibilityFilter(all, userId, isAdmin);
  const withNames = await withUsernames(visible);
  res.json(withNames.map(parseDoc));
});

// ── POST /debit-notes ────────────────────────────────────────────────────────
router.post("/debit-notes", async (req, res): Promise<void> => {
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

  const dnNumber = await nextDocNumber("dn", companyId);

  const [doc] = await db.insert(debitNotesTable).values({
    dnNumber,
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
  logAudit({ req, action: "create", entityType: "debit_note", entityId: doc.id, entityLabel: doc.dnNumber });
  res.status(201).json(parseDoc(doc));
});

// ── GET /debit-notes/:id ─────────────────────────────────────────────────────
router.get("/debit-notes/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [doc] = await db.select().from(debitNotesTable).where(eq(debitNotesTable.id, id));
  if (!doc) { res.status(404).json({ error: "Debit note not found" }); return; }

  const userId = req.session.userId!;
  const isAdmin = req.session.isAdmin ?? false;
  if (doc.isPrivate && doc.createdBy !== userId && !isAdmin) {
    res.status(403).json({ error: "Access denied" }); return;
  }

  const [creator] = await db.select({ username: usersTable.username }).from(usersTable).where(eq(usersTable.id, doc.createdBy));
  res.json({ ...parseDoc(doc), createdByUsername: creator?.username || null });
});

// ── PUT /debit-notes/:id ─────────────────────────────────────────────────────
router.put("/debit-notes/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [existing] = await db.select().from(debitNotesTable).where(eq(debitNotesTable.id, id));
  if (!existing) { res.status(404).json({ error: "Debit note not found" }); return; }

  const userId = req.session.userId!;
  const isAdmin = req.session.isAdmin ?? false;
  if (existing.status === "confirmed" && !isAdmin) {
    res.status(403).json({ error: "Only admins can edit confirmed debit notes" }); return;
  }
  if (existing.isPrivate && existing.createdBy !== userId && !isAdmin) {
    res.status(403).json({ error: "Access denied" }); return;
  }

  const {
    customerName, customerAddress, contactPerson, contactEmail,
    refInvNumber, reason, issueDate, currency,
    paymentTerms, notes, isPrivate,
    items, subtotal, discountAmount, taxRate, tax, totalAmount,
    status,
  } = req.body;

  if (!customerName?.trim()) { res.status(400).json({ error: "Customer name is required" }); return; }

  const [doc] = await db.update(debitNotesTable).set({
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
    isPrivate: isPrivate ?? existing.isPrivate,
    items: items ?? existing.items,
    subtotal: String(subtotal ?? 0),
    discountAmount: String(discountAmount ?? 0),
    taxRate: String(taxRate ?? 9),
    tax: String(tax ?? 0),
    totalAmount: String(totalAmount ?? 0),
    status: status === "confirmed" ? "confirmed" : (status === "void" ? "void" : "draft"),
  }).where(eq(debitNotesTable.id, id)).returning();

  await upsertCustomer(existing.companyId, customerName, customerAddress, contactPerson, contactEmail);
  logAudit({ req, action: "update", entityType: "debit_note", entityId: doc.id, entityLabel: doc.dnNumber });
  res.json(parseDoc(doc));
});

// ── POST /debit-notes/:id/confirm ────────────────────────────────────────────
router.post("/debit-notes/:id/confirm", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [existing] = await db.select().from(debitNotesTable).where(eq(debitNotesTable.id, id));
  if (!existing) { res.status(404).json({ error: "Debit note not found" }); return; }
  if (existing.status === "confirmed") { res.status(400).json({ error: "Already confirmed" }); return; }
  if (existing.status === "void") { res.status(400).json({ error: "Cannot confirm a voided debit note" }); return; }

  const [doc] = await db.update(debitNotesTable).set({ status: "confirmed" }).where(eq(debitNotesTable.id, id)).returning();
  logAudit({ req, action: "update", entityType: "debit_note", entityId: doc.id, entityLabel: `${doc.dnNumber} confirmed` });
  res.json(parseDoc(doc));
});

// ── POST /debit-notes/:id/void ───────────────────────────────────────────────
router.post("/debit-notes/:id/void", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const isAdmin = req.session.isAdmin ?? false;
  if (!isAdmin) { res.status(403).json({ error: "Only admins can void debit notes" }); return; }

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [existing] = await db.select().from(debitNotesTable).where(eq(debitNotesTable.id, id));
  if (!existing) { res.status(404).json({ error: "Debit note not found" }); return; }
  if (existing.status === "void") { res.status(400).json({ error: "Already voided" }); return; }

  const { reason } = req.body;
  const [doc] = await db.update(debitNotesTable).set({ status: "void", voidReason: reason || null }).where(eq(debitNotesTable.id, id)).returning();
  logAudit({ req, action: "update", entityType: "debit_note", entityId: doc.id, entityLabel: `${doc.dnNumber} voided` });
  res.json(parseDoc(doc));
});

// ── DELETE /debit-notes/:id (admin + draft only) ─────────────────────────────
router.delete("/debit-notes/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const isAdmin = req.session.isAdmin ?? false;
  if (!isAdmin) { res.status(403).json({ error: "Only admins can delete debit notes" }); return; }

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [existing] = await db.select().from(debitNotesTable).where(eq(debitNotesTable.id, id));
  if (!existing) { res.status(404).json({ error: "Debit note not found" }); return; }
  if (existing.status === "confirmed") { res.status(400).json({ error: "Cannot delete a confirmed debit note. Void it instead." }); return; }

  await db.delete(debitNotesTable).where(eq(debitNotesTable.id, id));
  logAudit({ req, action: "delete", entityType: "debit_note", entityId: id, entityLabel: existing.dnNumber });
  res.json({ ok: true });
});

// ── POST /debit-notes/:id/mark-sent ─────────────────────────────────────────
router.post("/debit-notes/:id/mark-sent", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const { sentTo } = req.body;
  const emailStr = Array.isArray(sentTo) ? sentTo.join(", ") : (sentTo || null);
  const [doc] = await db.update(debitNotesTable).set({ emailSentTo: emailStr }).where(eq(debitNotesTable.id, id)).returning();
  if (!doc) { res.status(404).json({ error: "Not found" }); return; }
  logAudit({ req, action: "update", entityType: "debit_note", entityId: id, entityLabel: `${doc.dnNumber} marked sent` });
  res.json(parseDoc(doc));
});

// ── GET /debit-notes/:id/settings ────────────────────────────────────────────
router.get("/debit-notes/:id/settings", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const [doc] = await db.select().from(debitNotesTable).where(eq(debitNotesTable.id, id));
  if (!doc) { res.status(404).json({ error: "Not found" }); return; }
  const [settings] = await db.select().from(settingsTable).where(eq(settingsTable.companyId, doc.companyId));
  res.json(settings ?? {});
});

export default router;
