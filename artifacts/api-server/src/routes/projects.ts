import { Router, type IRouter } from "express";
import { db, projectsTable, vouchersTable, voucherAttachmentsTable, usersTable, settingsTable, userCompaniesTable } from "@workspace/db";
import { eq, desc, and, inArray, sql, or } from "drizzle-orm";
import { nextDocNumber } from "../lib/running-numbers.js";
import { logAudit } from "../lib/audit.js";
import {
  sendVoucherEmail, buildVerifyEmail, buildApproveEmail,
  buildPayEmail, buildPaidConfirmEmail,
} from "../lib/voucher-email.js";

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

function fmtAmount(amount: any): string {
  return parseDecimal(amount).toFixed(2);
}

async function withCreatorNames(docs: any[]): Promise<any[]> {
  const userIds = [...new Set(docs.map((d: any) => d.createdBy))].filter(Boolean) as number[];
  if (userIds.length === 0) return docs;
  const users = await db.select({ id: usersTable.id, username: usersTable.username })
    .from(usersTable).where(inArray(usersTable.id, userIds));
  const map: Record<number, string> = Object.fromEntries(users.map(u => [u.id, u.username]));
  return docs.map((d: any) => ({ ...d, createdByUsername: map[d.createdBy] || null }));
}

async function resolveUserMap(ids: (number | null | undefined)[]): Promise<Record<number, { username: string; email: string | null }>> {
  const unique = [...new Set(ids.filter((x): x is number => !!x))];
  if (unique.length === 0) return {};
  const users = await db.select({ id: usersTable.id, username: usersTable.username, email: usersTable.email })
    .from(usersTable).where(inArray(usersTable.id, unique));
  return Object.fromEntries(users.map(u => [u.id, { username: u.username, email: u.email }]));
}

/** Determine initial workflow status based on assigned signatories vs creator */
function computeInitialStatus(createdBy: number, verifierId: number | null, approverId: number | null): string {
  if (verifierId && verifierId !== createdBy) return "pending_verification";
  if (approverId && approverId !== createdBy) return "pending_approval";
  return "approved";
}

function appUrl(req: any, voucherId: number): string {
  const origin = req.get("origin") || `https://${req.get("host")}`;
  return `${origin}/projects/${req._voucherProjectId || ""}/vouchers/${voucherId}`;
}

// ── COMPANY USERS (for dropdowns) ─────────────────────────────────────────────

router.get("/company-users", async (req: any, res: any) => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  const companyId = req.session.companyId!;
  try {
    const companyUsers = await db.select({
      id: usersTable.id, username: usersTable.username,
      email: usersTable.email, role: usersTable.role,
    }).from(usersTable)
      .innerJoin(userCompaniesTable, eq(userCompaniesTable.userId, usersTable.id))
      .where(eq(userCompaniesTable.companyId, companyId));

    const admins = await db.select({
      id: usersTable.id, username: usersTable.username,
      email: usersTable.email, role: usersTable.role,
    }).from(usersTable).where(eq(usersTable.role, "admin"));

    const seen = new Set<number>();
    const all = [...companyUsers, ...admins].filter(u => {
      if (seen.has(u.id)) return false;
      seen.add(u.id);
      return true;
    }).sort((a, b) => a.username.localeCompare(b.username));

    res.json(all);
  } catch (err: any) {
    req.log.error({ err }, "GET /company-users error");
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// ── PENDING ACTION (dashboard + notifications) ─────────────────────────────────

router.get("/vouchers/pending-action", async (req: any, res: any) => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  const companyId = req.session.companyId!;
  const userId = req.session.userId!;
  try {
    const rows = await db.select({
      id: vouchersTable.id,
      voucherNumber: vouchersTable.voucherNumber,
      projectId: vouchersTable.projectId,
      type: vouchersTable.type,
      payee: vouchersTable.payee,
      totalAmount: vouchersTable.totalAmount,
      currency: vouchersTable.currency,
      status: vouchersTable.status,
      verifierId: vouchersTable.verifierId,
      approverId: vouchersTable.approverId,
      paidById: vouchersTable.paidById,
    }).from(vouchersTable)
      .where(and(
        eq(vouchersTable.companyId, companyId),
        or(
          and(eq(vouchersTable.status, "pending_verification"), eq(vouchersTable.verifierId, userId)),
          and(eq(vouchersTable.status, "pending_approval"), eq(vouchersTable.approverId, userId)),
          and(eq(vouchersTable.status, "approved"), eq(vouchersTable.paidById, userId)),
        )
      ))
      .orderBy(desc(vouchersTable.createdAt));

    res.json(rows.map(v => ({
      ...v,
      totalAmount: parseDecimal(v.totalAmount),
      action: v.status === "pending_verification" ? "verify"
        : v.status === "pending_approval" ? "approve"
        : "pay",
    })));
  } catch (err: any) {
    req.log.error({ err }, "GET /vouchers/pending-action error");
    res.status(500).json({ error: "Failed" });
  }
});

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

    // Resolve all user IDs in vouchers
    const allUserIds = vouchers.flatMap(v => [v.createdBy, v.verifierId, v.approverId, v.paidById]);
    const userMap = await resolveUserMap(allUserIds);

    const named = await withCreatorNames([project]);
    const spent = vouchers.reduce((s, v) => s + parseDecimal(v.totalAmount), 0);

    res.json({
      ...named[0],
      budget: project.budget ? parseDecimal(project.budget) : null,
      spent,
      vouchers: vouchers.map(v => ({
        ...v,
        totalAmount: parseDecimal(v.totalAmount),
        createdByUsername: userMap[v.createdBy]?.username || null,
        verifierName: v.verifierId ? (userMap[v.verifierId]?.username || null) : null,
        approverName: v.approverId ? (userMap[v.approverId]?.username || null) : null,
        paidByName: v.paidById ? (userMap[v.paidById]?.username || null) : null,
      })),
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
  const createdBy = req.session.userId!;
  const projectId = parseInt(req.params.projectId);

  try {
    const [project] = await db.select({ id: projectsTable.id }).from(projectsTable)
      .where(and(eq(projectsTable.id, projectId), eq(projectsTable.companyId, companyId)));
    if (!project) return res.status(404).json({ error: "Project not found" });

    // Fetch settings for defaults + company name for emails
    const [settings] = await db.select().from(settingsTable).where(eq(settingsTable.companyId, companyId)).limit(1);

    const {
      type, payee, payeeContact, issueDate, description, items, currency, notes,
      verifierId: bodyVerifierId, approverId: bodyApproverId, paidById: bodyPaidById,
    } = req.body;
    if (!payee?.trim()) return res.status(400).json({ error: "Payee is required" });

    const verifierId = bodyVerifierId ? Number(bodyVerifierId) : (settings?.defaultVerifierId ?? null);
    const approverId = bodyApproverId ? Number(bodyApproverId) : (settings?.defaultApproverId ?? null);
    const paidById = bodyPaidById ? Number(bodyPaidById) : (settings?.defaultPaidById ?? null);

    const itemsArr: any[] = Array.isArray(items) ? items : [];
    const total = itemsArr.reduce((s: number, it: any) => s + (parseFloat(it.amount) || 0), 0);
    const voucherNumber = await nextDocNumber("pv", companyId);
    const status = computeInitialStatus(createdBy, verifierId, approverId);

    // Get creator's name for preparedByName
    const [creator] = await db.select({ username: usersTable.username }).from(usersTable).where(eq(usersTable.id, createdBy));
    const preparedByName = creator?.username || null;

    const [voucher] = await db.insert(vouchersTable).values({
      voucherNumber,
      companyId,
      projectId,
      type: type || "payment",
      payee: payee.trim(),
      payeeContact: payeeContact?.trim() || null,
      issueDate: issueDate || null,
      description: description?.trim() || null,
      status,
      items: itemsArr,
      totalAmount: String(total),
      currency: currency || "SGD",
      notes: notes?.trim() || null,
      createdBy,
      preparedByName,
      verifierId: verifierId || null,
      approverId: approverId || null,
      paidById: paidById || null,
    }).returning();

    logAudit({ req, action: "create", entityType: "voucher", entityId: voucher.id });

    // ── Send notification email based on initial status ───────────────────────
    const vId = voucher.id;
    const url = `${req.get("origin") || `https://${req.get("host")}`}/projects/${projectId}/vouchers/${vId}`;
    const amtStr = fmtAmount(total);
    const curr = currency || "SGD";

    const [company] = await db.execute(sql`SELECT name FROM companies WHERE id = ${companyId}`) as any[];
    const companyName = Array.isArray(company) ? (company[0]?.name || "") : (company as any)?.rows?.[0]?.name || "";

    if (status === "pending_verification" && verifierId) {
      const [verifier] = await db.select({ username: usersTable.username, email: usersTable.email })
        .from(usersTable).where(eq(usersTable.id, verifierId));
      if (verifier) {
        sendVoucherEmail({
          companyId, companyName,
          toEmail: verifier.email, toName: verifier.username,
          subject: `[Action Required] Verify Voucher ${voucherNumber}`,
          body: buildVerifyEmail({ voucherNumber, payee: payee.trim(), amount: amtStr, currency: curr, preparedBy: preparedByName || "System", appUrl: url }),
        });
      }
    } else if (status === "pending_approval" && approverId) {
      const [approver] = await db.select({ username: usersTable.username, email: usersTable.email })
        .from(usersTable).where(eq(usersTable.id, approverId));
      if (approver) {
        sendVoucherEmail({
          companyId, companyName,
          toEmail: approver.email, toName: approver.username,
          subject: `[Action Required] Approve Voucher ${voucherNumber}`,
          body: buildApproveEmail({ voucherNumber, payee: payee.trim(), amount: amtStr, currency: curr, verifiedBy: preparedByName || "System", appUrl: url }),
        });
      }
    } else if (status === "approved" && paidById && paidById !== createdBy) {
      const [payer] = await db.select({ username: usersTable.username, email: usersTable.email })
        .from(usersTable).where(eq(usersTable.id, paidById));
      if (payer) {
        sendVoucherEmail({
          companyId, companyName,
          toEmail: payer.email, toName: payer.username,
          subject: `[Action Required] Process Payment for Voucher ${voucherNumber}`,
          body: buildPayEmail({ voucherNumber, payee: payee.trim(), amount: amtStr, currency: curr, approvedBy: preparedByName || "System", appUrl: url }),
        });
      }
    }

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

    const userMap = await resolveUserMap([voucher.createdBy, voucher.verifierId, voucher.approverId, voucher.paidById]);

    const countRows = await db.execute(
      sql`SELECT COUNT(*)::int AS cnt FROM voucher_attachments WHERE voucher_id = ${id}`
    ) as any[];
    const cnt = Array.isArray(countRows) ? countRows[0]?.cnt : (countRows as any).rows?.[0]?.cnt;
    const attachmentCount = Number(cnt || 0);

    res.json({
      ...voucher,
      totalAmount: parseDecimal(voucher.totalAmount),
      project: project || null,
      attachmentCount,
      createdByUsername: userMap[voucher.createdBy]?.username || null,
      verifierName: voucher.verifierId ? (userMap[voucher.verifierId]?.username || null) : null,
      approverName: voucher.approverId ? (userMap[voucher.approverId]?.username || null) : null,
      paidByName: voucher.paidById ? (userMap[voucher.paidById]?.username || null) : null,
    });
  } catch (err: any) {
    req.log.error({ err }, "GET /vouchers/:id error");
    res.status(500).json({ error: "Failed to fetch voucher" });
  }
});

// List attachment metadata
router.get("/vouchers/:id/attachments", async (req: any, res: any) => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  const companyId = req.session.companyId!;
  const id = parseInt(req.params.id);
  try {
    const [voucher] = await db.select({ id: vouchersTable.id }).from(vouchersTable)
      .where(and(eq(vouchersTable.id, id), eq(vouchersTable.companyId, companyId)));
    if (!voucher) return res.status(404).json({ error: "Not found" });

    const rows = await db.select({
      id: voucherAttachmentsTable.id,
      fileName: voucherAttachmentsTable.fileName,
      mimeType: voucherAttachmentsTable.mimeType,
      createdAt: voucherAttachmentsTable.createdAt,
    }).from(voucherAttachmentsTable)
      .where(eq(voucherAttachmentsTable.voucherId, id))
      .orderBy(voucherAttachmentsTable.createdAt);

    res.json(rows);
  } catch (err: any) {
    req.log.error({ err }, "GET /vouchers/:id/attachments error");
    res.status(500).json({ error: "Failed to fetch attachments" });
  }
});

// Get single attachment with fileData
router.get("/vouchers/:id/attachments/:attId", async (req: any, res: any) => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  const companyId = req.session.companyId!;
  const voucherId = parseInt(req.params.id);
  const attId = parseInt(req.params.attId);
  try {
    const [voucher] = await db.select({ id: vouchersTable.id }).from(vouchersTable)
      .where(and(eq(vouchersTable.id, voucherId), eq(vouchersTable.companyId, companyId)));
    if (!voucher) return res.status(404).json({ error: "Not found" });

    const [att] = await db.select().from(voucherAttachmentsTable)
      .where(and(eq(voucherAttachmentsTable.id, attId), eq(voucherAttachmentsTable.voucherId, voucherId)));
    if (!att) return res.status(404).json({ error: "Attachment not found" });

    res.json({ id: att.id, fileName: att.fileName, mimeType: att.mimeType, fileData: att.fileData });
  } catch (err: any) {
    req.log.error({ err }, "GET /vouchers/:id/attachments/:attId error");
    res.status(500).json({ error: "Failed to fetch attachment" });
  }
});

// Upload attachment
router.post("/vouchers/:id/attachments", async (req: any, res: any) => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  const companyId = req.session.companyId!;
  const voucherId = parseInt(req.params.id);
  try {
    const [voucher] = await db.select({ id: vouchersTable.id }).from(vouchersTable)
      .where(and(eq(vouchersTable.id, voucherId), eq(vouchersTable.companyId, companyId)));
    if (!voucher) return res.status(404).json({ error: "Not found" });

    const { fileName, mimeType, fileData } = req.body;
    if (!fileData || !mimeType) return res.status(400).json({ error: "fileData and mimeType are required" });

    const [att] = await db.insert(voucherAttachmentsTable).values({
      voucherId, fileName: fileName || "attachment", mimeType, fileData,
    }).returning({ id: voucherAttachmentsTable.id, fileName: voucherAttachmentsTable.fileName, mimeType: voucherAttachmentsTable.mimeType });

    res.json(att);
  } catch (err: any) {
    req.log.error({ err }, "POST /vouchers/:id/attachments error");
    res.status(500).json({ error: "Failed to upload attachment" });
  }
});

// Delete attachment
router.delete("/vouchers/:id/attachments/:attId", async (req: any, res: any) => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  const companyId = req.session.companyId!;
  const voucherId = parseInt(req.params.id);
  const attId = parseInt(req.params.attId);
  try {
    const [voucher] = await db.select({ id: vouchersTable.id }).from(vouchersTable)
      .where(and(eq(vouchersTable.id, voucherId), eq(vouchersTable.companyId, companyId)));
    if (!voucher) return res.status(404).json({ error: "Not found" });

    await db.delete(voucherAttachmentsTable)
      .where(and(eq(voucherAttachmentsTable.id, attId), eq(voucherAttachmentsTable.voucherId, voucherId)));
    res.json({ ok: true });
  } catch (err: any) {
    req.log.error({ err }, "DELETE /vouchers/:id/attachments/:attId error");
    res.status(500).json({ error: "Failed to delete attachment" });
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
    if (existing.status === "approved" && !req.session.isAdmin) return res.status(400).json({ error: "Voucher already approved — contact an admin to make changes" });

    const {
      type, payee, payeeContact, issueDate, description, items, currency, notes,
      verifierId: bodyVerifierId, approverId: bodyApproverId, paidById: bodyPaidById,
    } = req.body;
    const itemsArr: any[] = Array.isArray(items) ? items : (existing.items as any[]);
    const total = itemsArr.reduce((s: number, it: any) => s + (parseFloat(it.amount) || 0), 0);

    // Recompute status if signatories changed
    const createdBy = existing.createdBy;
    const verifierId = bodyVerifierId !== undefined ? (bodyVerifierId ? Number(bodyVerifierId) : null) : existing.verifierId;
    const approverId = bodyApproverId !== undefined ? (bodyApproverId ? Number(bodyApproverId) : null) : existing.approverId;
    const paidById = bodyPaidById !== undefined ? (bodyPaidById ? Number(bodyPaidById) : null) : existing.paidById;

    // Only reset status if signatories changed and voucher hasn't been verified/approved yet
    let newStatus = existing.status;
    const signatoryChanged = bodyVerifierId !== undefined || bodyApproverId !== undefined;
    if (signatoryChanged && (existing.status === "pending_verification" || existing.status === "pending_approval")) {
      newStatus = computeInitialStatus(createdBy, verifierId, approverId);
    }

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
      verifierId,
      approverId,
      paidById,
      status: newStatus,
    }).where(eq(vouchersTable.id, id)).returning();

    logAudit({ req, action: "update", entityType: "voucher", entityId: id });
    res.json({ ...updated, totalAmount: parseDecimal(updated.totalAmount) });
  } catch (err: any) {
    req.log.error({ err }, "PUT /vouchers/:id error");
    res.status(500).json({ error: "Failed to update voucher" });
  }
});

// ── WORKFLOW ACTIONS ───────────────────────────────────────────────────────────

router.post("/vouchers/:id/verify", async (req: any, res: any) => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  const companyId = req.session.companyId!;
  const userId = req.session.userId!;
  const id = parseInt(req.params.id);
  try {
    const [existing] = await db.select().from(vouchersTable)
      .where(and(eq(vouchersTable.id, id), eq(vouchersTable.companyId, companyId)));
    if (!existing) return res.status(404).json({ error: "Voucher not found" });
    if (existing.status !== "pending_verification") return res.status(400).json({ error: "Voucher is not pending verification" });

    const isAdmin = (req.session as any).isAdmin;
    if (existing.verifierId && existing.verifierId !== userId && !isAdmin) {
      return res.status(403).json({ error: "Only the assigned verifier (or an admin) can verify this voucher" });
    }

    const verifiedAt = new Date().toISOString().split("T")[0];
    const nextStatus = computeInitialStatus(existing.createdBy, null, existing.approverId);
    const [verifier] = await db.select({ username: usersTable.username }).from(usersTable).where(eq(usersTable.id, userId));

    const [updated] = await db.update(vouchersTable).set({
      status: nextStatus,
      verifiedAt,
      verifierId: userId, // record who actually verified
    }).where(eq(vouchersTable.id, id)).returning();

    logAudit({ req, action: "update", entityType: "voucher", entityId: id, details: { status: nextStatus, action: "verify" } });

    // Notify approver if moving to pending_approval
    if (nextStatus === "pending_approval" && existing.approverId) {
      const [appUrl2] = [existing.approverId];
      const [approver] = await db.select({ username: usersTable.username, email: usersTable.email })
        .from(usersTable).where(eq(usersTable.id, existing.approverId));
      const [companyRow] = await db.execute(sql`SELECT name FROM companies WHERE id = ${companyId}`) as any[];
      const cName = Array.isArray(companyRow) ? (companyRow[0]?.name || "") : (companyRow as any)?.rows?.[0]?.name || "";
      if (approver) {
        const url = `${req.get("origin") || `https://${req.get("host")}`}/projects/${existing.projectId}/vouchers/${id}`;
        sendVoucherEmail({
          companyId, companyName: cName,
          toEmail: approver.email, toName: approver.username,
          subject: `[Action Required] Approve Voucher ${existing.voucherNumber}`,
          body: buildApproveEmail({
            voucherNumber: existing.voucherNumber, payee: existing.payee,
            amount: fmtAmount(existing.totalAmount), currency: existing.currency,
            verifiedBy: verifier?.username || "Verifier", appUrl: url,
          }),
        });
      }
    } else if (nextStatus === "approved" && existing.paidById && existing.paidById !== userId) {
      const [payer] = await db.select({ username: usersTable.username, email: usersTable.email })
        .from(usersTable).where(eq(usersTable.id, existing.paidById));
      const [companyRow] = await db.execute(sql`SELECT name FROM companies WHERE id = ${companyId}`) as any[];
      const cName = Array.isArray(companyRow) ? (companyRow[0]?.name || "") : (companyRow as any)?.rows?.[0]?.name || "";
      if (payer) {
        const url = `${req.get("origin") || `https://${req.get("host")}`}/projects/${existing.projectId}/vouchers/${id}`;
        sendVoucherEmail({
          companyId, companyName: cName,
          toEmail: payer.email, toName: payer.username,
          subject: `[Action Required] Process Payment for Voucher ${existing.voucherNumber}`,
          body: buildPayEmail({
            voucherNumber: existing.voucherNumber, payee: existing.payee,
            amount: fmtAmount(existing.totalAmount), currency: existing.currency,
            approvedBy: verifier?.username || "Verifier", appUrl: url,
          }),
        });
      }
    }

    res.json({ ...updated, totalAmount: parseDecimal(updated.totalAmount) });
  } catch (err: any) {
    req.log.error({ err }, "POST /vouchers/:id/verify error");
    res.status(500).json({ error: "Failed to verify voucher" });
  }
});

router.post("/vouchers/:id/approve", async (req: any, res: any) => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  const companyId = req.session.companyId!;
  const userId = req.session.userId!;
  const id = parseInt(req.params.id);
  try {
    const [existing] = await db.select().from(vouchersTable)
      .where(and(eq(vouchersTable.id, id), eq(vouchersTable.companyId, companyId)));
    if (!existing) return res.status(404).json({ error: "Voucher not found" });
    if (existing.status !== "pending_approval") return res.status(400).json({ error: "Voucher is not pending approval" });

    const isAdmin = (req.session as any).isAdmin;
    if (existing.approverId && existing.approverId !== userId && !isAdmin) {
      return res.status(403).json({ error: "Only the assigned approver (or an admin) can approve this voucher" });
    }

    const approvedAt = new Date().toISOString().split("T")[0];
    const [approver] = await db.select({ username: usersTable.username }).from(usersTable).where(eq(usersTable.id, userId));

    const [updated] = await db.update(vouchersTable).set({
      status: "approved",
      approvedAt,
      approverId: userId,
    }).where(eq(vouchersTable.id, id)).returning();

    logAudit({ req, action: "update", entityType: "voucher", entityId: id, details: { status: "approved" } });

    // Notify paidBy
    if (existing.paidById && existing.paidById !== userId) {
      const [payer] = await db.select({ username: usersTable.username, email: usersTable.email })
        .from(usersTable).where(eq(usersTable.id, existing.paidById));
      const [companyRow] = await db.execute(sql`SELECT name FROM companies WHERE id = ${companyId}`) as any[];
      const cName = Array.isArray(companyRow) ? (companyRow[0]?.name || "") : (companyRow as any)?.rows?.[0]?.name || "";
      if (payer) {
        const url = `${req.get("origin") || `https://${req.get("host")}`}/projects/${existing.projectId}/vouchers/${id}`;
        sendVoucherEmail({
          companyId, companyName: cName,
          toEmail: payer.email, toName: payer.username,
          subject: `[Action Required] Process Payment for Voucher ${existing.voucherNumber}`,
          body: buildPayEmail({
            voucherNumber: existing.voucherNumber, payee: existing.payee,
            amount: fmtAmount(existing.totalAmount), currency: existing.currency,
            approvedBy: approver?.username || "Approver", appUrl: url,
          }),
        });
      }
    }

    res.json({ ...updated, totalAmount: parseDecimal(updated.totalAmount) });
  } catch (err: any) {
    req.log.error({ err }, "POST /vouchers/:id/approve error");
    res.status(500).json({ error: "Failed to approve voucher" });
  }
});

router.post("/vouchers/:id/mark-paid", async (req: any, res: any) => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  const companyId = req.session.companyId!;
  const userId = req.session.userId!;
  const id = parseInt(req.params.id);
  try {
    const [existing] = await db.select().from(vouchersTable)
      .where(and(eq(vouchersTable.id, id), eq(vouchersTable.companyId, companyId)));
    if (!existing) return res.status(404).json({ error: "Voucher not found" });
    if (existing.status === "paid") return res.status(400).json({ error: "Already paid" });
    if (existing.status !== "approved") return res.status(400).json({ error: "Voucher must be approved before marking as paid" });

    const isAdmin = (req.session as any).isAdmin;
    if (existing.paidById && existing.paidById !== userId && !isAdmin) {
      return res.status(403).json({ error: "Only the assigned payer (or an admin) can mark this voucher as paid" });
    }

    const { paidDate, bankRef } = req.body;
    const today = new Date().toISOString().split("T")[0];
    const [payer] = await db.select({ username: usersTable.username }).from(usersTable).where(eq(usersTable.id, userId));

    const [updated] = await db.update(vouchersTable).set({
      status: "paid",
      paidDate: paidDate || today,
      bankRef: bankRef?.trim() || null,
      paidById: userId,
    }).where(eq(vouchersTable.id, id)).returning();

    logAudit({ req, action: "update", entityType: "voucher", entityId: id, details: { status: "paid" } });

    // Notify creator that their voucher was paid
    if (existing.createdBy !== userId) {
      const [creator] = await db.select({ username: usersTable.username, email: usersTable.email })
        .from(usersTable).where(eq(usersTable.id, existing.createdBy));
      const [companyRow] = await db.execute(sql`SELECT name FROM companies WHERE id = ${companyId}`) as any[];
      const cName = Array.isArray(companyRow) ? (companyRow[0]?.name || "") : (companyRow as any)?.rows?.[0]?.name || "";
      if (creator) {
        const url = `${req.get("origin") || `https://${req.get("host")}`}/projects/${existing.projectId}/vouchers/${id}`;
        sendVoucherEmail({
          companyId, companyName: cName,
          toEmail: creator.email, toName: creator.username,
          subject: `Payment Confirmed — Voucher ${existing.voucherNumber}`,
          body: buildPaidConfirmEmail({
            voucherNumber: existing.voucherNumber, payee: existing.payee,
            amount: fmtAmount(existing.totalAmount), currency: existing.currency,
            paidBy: payer?.username || "System",
            paidDate: paidDate || today, bankRef: bankRef?.trim() || null, appUrl: url,
          }),
        });
      }
    }

    res.json({ ...updated, totalAmount: parseDecimal(updated.totalAmount) });
  } catch (err: any) {
    req.log.error({ err }, "POST /vouchers/:id/mark-paid error");
    res.status(500).json({ error: "Failed to mark voucher as paid" });
  }
});

router.post("/vouchers/:id/mark-draft", async (req: any, res: any) => {
  if (!requireAuth(req, res)) return;
  if (!(req.session as any).isAdmin) return res.status(403).json({ error: "Admin only" });
  const companyId = req.session.companyId!;
  const id = parseInt(req.params.id);
  try {
    const [existing] = await db.select().from(vouchersTable)
      .where(and(eq(vouchersTable.id, id), eq(vouchersTable.companyId, companyId)));
    if (!existing) return res.status(404).json({ error: "Voucher not found" });

    // Recompute the initial status (effectively restarting the workflow)
    const status = computeInitialStatus(existing.createdBy, existing.verifierId, existing.approverId);

    const [updated] = await db.update(vouchersTable).set({
      status,
      paidDate: null,
      bankRef: null,
      verifiedAt: null,
      approvedAt: null,
    }).where(eq(vouchersTable.id, id)).returning();

    logAudit({ req, action: "update", entityType: "voucher", entityId: id, details: { status: "reverted" } });
    res.json({ ...updated, totalAmount: parseDecimal(updated.totalAmount) });
  } catch (err: any) {
    req.log.error({ err }, "POST /vouchers/:id/mark-draft error");
    res.status(500).json({ error: "Failed to revert voucher" });
  }
});

router.delete("/vouchers/:id", async (req: any, res: any) => {
  if (!requireAuth(req, res)) return;
  if (!(req.session as any).isAdmin) return res.status(403).json({ error: "Admin only" });
  const companyId = req.session.companyId!;
  const id = parseInt(req.params.id);
  try {
    const [existing] = await db.select().from(vouchersTable)
      .where(and(eq(vouchersTable.id, id), eq(vouchersTable.companyId, companyId)));
    if (!existing) return res.status(404).json({ error: "Voucher not found" });

    await db.delete(voucherAttachmentsTable).where(eq(voucherAttachmentsTable.voucherId, id));
    await db.delete(vouchersTable).where(eq(vouchersTable.id, id));
    logAudit({ req, action: "delete", entityType: "voucher", entityId: id });
    res.json({ ok: true });
  } catch (err: any) {
    req.log.error({ err }, "DELETE /vouchers/:id error");
    res.status(500).json({ error: "Failed to delete voucher" });
  }
});

export default router;
