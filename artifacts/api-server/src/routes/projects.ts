import { Router, type IRouter } from "express";
import { db, projectsTable, vouchersTable, usersTable } from "@workspace/db";
import { eq, desc, and, inArray } from "drizzle-orm";
import { nextDocNumber } from "../lib/running-numbers.js";
import { logAudit } from "../lib/audit.js";

const router: IRouter = Router();

function requireAuth(req: any, res: any): boolean {
  if (!req.session.userId) { res.status(401).json({ error: "Not authenticated" }); return false; }
  return true;
}

function requireCompany(req: any, res: any): boolean {
  if (!req.session.companyId) { res.status(400).json({ error: "No company selected." }); return false; }
  return true;
}

function parseDecimal(v: any): number {
  return parseFloat(v ?? "0") || 0;
}

async function withCreatorNames(docs: any[]): Promise<any[]> {
  const userIds = [...new Set(docs.map((d: any) => d.createdBy))].filter(Boolean) as number[];
  if (userIds.length === 0) return docs;
  const users = await db.select({ id: usersTable.id, username: usersTable.username })
    .from(usersTable).where(inArray(usersTable.id, userIds));
  const map: Record<number, string> = Object.fromEntries(users.map(u => [u.id, u.username]));
  return docs.map((d: any) => ({ ...d, createdByUsername: map[d.createdBy] || null }));
}

// ── PROJECTS ──────────────────────────────────────────────────────────────────

router.get("/projects", async (req: any, res: any) => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  const companyId = req.session.companyId!;
  try {
    const projects = await db.select().from(projectsTable)
      .where(eq(projectsTable.companyId, companyId))
      .orderBy(desc(projectsTable.createdAt));

    const projectIds = projects.map(p => p.id);
    const spentMap: Record<number, number> = {};
    if (projectIds.length > 0) {
      const vouchers = await db.select({
        projectId: vouchersTable.projectId,
        totalAmount: vouchersTable.totalAmount,
      }).from(vouchersTable).where(
        and(eq(vouchersTable.companyId, companyId), inArray(vouchersTable.projectId, projectIds))
      );
      for (const v of vouchers) {
        spentMap[v.projectId] = (spentMap[v.projectId] || 0) + parseDecimal(v.totalAmount);
      }
    }

    const named = await withCreatorNames(projects);
    res.json(named.map(p => ({
      ...p,
      budget: p.budget ? parseDecimal(p.budget) : null,
      spent: spentMap[p.id] || 0,
    })));
  } catch (err: any) {
    req.log.error({ err }, "GET /projects error");
    res.status(500).json({ error: "Failed to fetch projects" });
  }
});

router.post("/projects", async (req: any, res: any) => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  const companyId = req.session.companyId!;
  try {
    const { name, code, description, status, budget, startDate, endDate } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: "Project name is required" });

    const [project] = await db.insert(projectsTable).values({
      companyId,
      name: name.trim(),
      code: code?.trim() || null,
      description: description?.trim() || null,
      status: status || "active",
      budget: budget ? String(budget) : null,
      startDate: startDate || null,
      endDate: endDate || null,
      createdBy: req.session.userId!,
    }).returning();

    logAudit({ req, action: "create", entityType: "project", entityId: project.id });
    res.status(201).json(project);
  } catch (err: any) {
    req.log.error({ err }, "POST /projects error");
    res.status(500).json({ error: "Failed to create project" });
  }
});

router.get("/projects/:id", async (req: any, res: any) => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  const companyId = req.session.companyId!;
  const id = parseInt(req.params.id);
  try {
    const [project] = await db.select().from(projectsTable)
      .where(and(eq(projectsTable.id, id), eq(projectsTable.companyId, companyId)));
    if (!project) return res.status(404).json({ error: "Project not found" });

    const vouchers = await db.select().from(vouchersTable)
      .where(and(eq(vouchersTable.projectId, id), eq(vouchersTable.companyId, companyId)))
      .orderBy(desc(vouchersTable.createdAt));

    const named = await withCreatorNames([project]);
    const namedVouchers = await withCreatorNames(vouchers);
    const spent = vouchers.reduce((s, v) => s + parseDecimal(v.totalAmount), 0);

    res.json({
      ...named[0],
      budget: project.budget ? parseDecimal(project.budget) : null,
      spent,
      vouchers: namedVouchers.map(v => ({ ...v, totalAmount: parseDecimal(v.totalAmount) })),
    });
  } catch (err: any) {
    req.log.error({ err }, "GET /projects/:id error");
    res.status(500).json({ error: "Failed to fetch project" });
  }
});

router.put("/projects/:id", async (req: any, res: any) => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  const companyId = req.session.companyId!;
  const id = parseInt(req.params.id);
  try {
    const [existing] = await db.select().from(projectsTable)
      .where(and(eq(projectsTable.id, id), eq(projectsTable.companyId, companyId)));
    if (!existing) return res.status(404).json({ error: "Project not found" });

    const { name, code, description, status, budget, startDate, endDate } = req.body;
    const [updated] = await db.update(projectsTable).set({
      name: name?.trim() || existing.name,
      code: code?.trim() || null,
      description: description?.trim() || null,
      status: status || existing.status,
      budget: budget !== undefined ? (budget ? String(budget) : null) : existing.budget,
      startDate: startDate !== undefined ? (startDate || null) : existing.startDate,
      endDate: endDate !== undefined ? (endDate || null) : existing.endDate,
    }).where(eq(projectsTable.id, id)).returning();

    logAudit({ req, action: "update", entityType: "project", entityId: id });
    res.json(updated);
  } catch (err: any) {
    req.log.error({ err }, "PUT /projects/:id error");
    res.status(500).json({ error: "Failed to update project" });
  }
});

router.delete("/projects/:id", async (req: any, res: any) => {
  if (!requireAuth(req, res)) return;
  if (!req.session.isAdmin) return res.status(403).json({ error: "Admin only" });
  const companyId = req.session.companyId!;
  const id = parseInt(req.params.id);
  try {
    const [existing] = await db.select().from(projectsTable)
      .where(and(eq(projectsTable.id, id), eq(projectsTable.companyId, companyId)));
    if (!existing) return res.status(404).json({ error: "Project not found" });

    await db.delete(vouchersTable).where(eq(vouchersTable.projectId, id));
    await db.delete(projectsTable).where(eq(projectsTable.id, id));
    logAudit({ req, action: "delete", entityType: "project", entityId: id });
    res.json({ ok: true });
  } catch (err: any) {
    req.log.error({ err }, "DELETE /projects/:id error");
    res.status(500).json({ error: "Failed to delete project" });
  }
});

// ── VOUCHERS ──────────────────────────────────────────────────────────────────

router.post("/projects/:projectId/vouchers", async (req: any, res: any) => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  const companyId = req.session.companyId!;
  const projectId = parseInt(req.params.projectId);
  try {
    const [project] = await db.select({ id: projectsTable.id }).from(projectsTable)
      .where(and(eq(projectsTable.id, projectId), eq(projectsTable.companyId, companyId)));
    if (!project) return res.status(404).json({ error: "Project not found" });

    const { type, payee, payeeContact, issueDate, description, items, currency, notes, proofData, proofMimeType } = req.body;
    if (!payee?.trim()) return res.status(400).json({ error: "Payee is required" });

    const itemsArr: any[] = Array.isArray(items) ? items : [];
    const total = itemsArr.reduce((s: number, it: any) => s + (parseFloat(it.amount) || 0), 0);
    const voucherNumber = await nextDocNumber("pv", companyId);

    const [voucher] = await db.insert(vouchersTable).values({
      voucherNumber,
      companyId,
      projectId,
      type: type || "payment",
      payee: payee.trim(),
      payeeContact: payeeContact?.trim() || null,
      issueDate: issueDate || null,
      description: description?.trim() || null,
      status: "draft",
      items: itemsArr,
      totalAmount: String(total),
      currency: currency || "SGD",
      notes: notes?.trim() || null,
      proofData: proofData || null,
      proofMimeType: proofMimeType || null,
      createdBy: req.session.userId!,
    }).returning();

    logAudit({ req, action: "create", entityType: "voucher", entityId: voucher.id });
    res.status(201).json({ ...voucher, totalAmount: parseDecimal(voucher.totalAmount) });
  } catch (err: any) {
    req.log.error({ err }, "POST /projects/:id/vouchers error");
    res.status(500).json({ error: "Failed to create voucher" });
  }
});

router.get("/vouchers/:id", async (req: any, res: any) => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  const companyId = req.session.companyId!;
  const id = parseInt(req.params.id);
  try {
    const [voucher] = await db.select().from(vouchersTable)
      .where(and(eq(vouchersTable.id, id), eq(vouchersTable.companyId, companyId)));
    if (!voucher) return res.status(404).json({ error: "Voucher not found" });

    const [project] = await db.select({ id: projectsTable.id, name: projectsTable.name, code: projectsTable.code })
      .from(projectsTable).where(eq(projectsTable.id, voucher.projectId));

    const named = await withCreatorNames([voucher]);
    res.json({ ...named[0], totalAmount: parseDecimal(voucher.totalAmount), project: project || null });
  } catch (err: any) {
    req.log.error({ err }, "GET /vouchers/:id error");
    res.status(500).json({ error: "Failed to fetch voucher" });
  }
});

router.put("/vouchers/:id", async (req: any, res: any) => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  const companyId = req.session.companyId!;
  const id = parseInt(req.params.id);
  try {
    const [existing] = await db.select().from(vouchersTable)
      .where(and(eq(vouchersTable.id, id), eq(vouchersTable.companyId, companyId)));
    if (!existing) return res.status(404).json({ error: "Voucher not found" });
    if (existing.status === "paid") return res.status(400).json({ error: "Cannot edit a paid voucher" });

    const { type, payee, payeeContact, issueDate, description, items, currency, notes, proofData, proofMimeType } = req.body;
    const itemsArr: any[] = Array.isArray(items) ? items : (existing.items as any[]);
    const total = itemsArr.reduce((s: number, it: any) => s + (parseFloat(it.amount) || 0), 0);

    const [updated] = await db.update(vouchersTable).set({
      type: type || existing.type,
      payee: payee?.trim() || existing.payee,
      payeeContact: payeeContact?.trim() || null,
      issueDate: issueDate !== undefined ? (issueDate || null) : existing.issueDate,
      description: description?.trim() || null,
      items: itemsArr,
      totalAmount: String(total),
      currency: currency || existing.currency,
      notes: notes?.trim() || null,
      proofData: proofData !== undefined ? (proofData || null) : existing.proofData,
      proofMimeType: proofMimeType !== undefined ? (proofMimeType || null) : existing.proofMimeType,
    }).where(eq(vouchersTable.id, id)).returning();

    logAudit({ req, action: "update", entityType: "voucher", entityId: id });
    res.json({ ...updated, totalAmount: parseDecimal(updated.totalAmount) });
  } catch (err: any) {
    req.log.error({ err }, "PUT /vouchers/:id error");
    res.status(500).json({ error: "Failed to update voucher" });
  }
});

router.post("/vouchers/:id/mark-paid", async (req: any, res: any) => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  const companyId = req.session.companyId!;
  const id = parseInt(req.params.id);
  try {
    const [existing] = await db.select().from(vouchersTable)
      .where(and(eq(vouchersTable.id, id), eq(vouchersTable.companyId, companyId)));
    if (!existing) return res.status(404).json({ error: "Voucher not found" });
    if (existing.status === "paid") return res.status(400).json({ error: "Already paid" });

    const { paidDate, bankRef } = req.body;
    const today = new Date().toISOString().split("T")[0];
    const [updated] = await db.update(vouchersTable).set({
      status: "paid",
      paidDate: paidDate || today,
      bankRef: bankRef?.trim() || null,
    }).where(eq(vouchersTable.id, id)).returning();

    logAudit({ req, action: "update", entityType: "voucher", entityId: id, details: { status: "paid" } });
    res.json({ ...updated, totalAmount: parseDecimal(updated.totalAmount) });
  } catch (err: any) {
    req.log.error({ err }, "POST /vouchers/:id/mark-paid error");
    res.status(500).json({ error: "Failed to mark voucher as paid" });
  }
});

router.post("/vouchers/:id/mark-draft", async (req: any, res: any) => {
  if (!requireAuth(req, res)) return;
  if (!req.session.isAdmin) return res.status(403).json({ error: "Admin only" });
  const companyId = req.session.companyId!;
  const id = parseInt(req.params.id);
  try {
    const [existing] = await db.select().from(vouchersTable)
      .where(and(eq(vouchersTable.id, id), eq(vouchersTable.companyId, companyId)));
    if (!existing) return res.status(404).json({ error: "Voucher not found" });

    const [updated] = await db.update(vouchersTable).set({
      status: "draft",
      paidDate: null,
      bankRef: null,
    }).where(eq(vouchersTable.id, id)).returning();

    logAudit({ req, action: "update", entityType: "voucher", entityId: id, details: { status: "draft" } });
    res.json({ ...updated, totalAmount: parseDecimal(updated.totalAmount) });
  } catch (err: any) {
    req.log.error({ err }, "POST /vouchers/:id/mark-draft error");
    res.status(500).json({ error: "Failed to revert voucher" });
  }
});

router.delete("/vouchers/:id", async (req: any, res: any) => {
  if (!requireAuth(req, res)) return;
  if (!req.session.isAdmin) return res.status(403).json({ error: "Admin only" });
  const companyId = req.session.companyId!;
  const id = parseInt(req.params.id);
  try {
    const [existing] = await db.select().from(vouchersTable)
      .where(and(eq(vouchersTable.id, id), eq(vouchersTable.companyId, companyId)));
    if (!existing) return res.status(404).json({ error: "Voucher not found" });

    await db.delete(vouchersTable).where(eq(vouchersTable.id, id));
    logAudit({ req, action: "delete", entityType: "voucher", entityId: id });
    res.json({ ok: true });
  } catch (err: any) {
    req.log.error({ err }, "DELETE /vouchers/:id error");
    res.status(500).json({ error: "Failed to delete voucher" });
  }
});

export default router;
