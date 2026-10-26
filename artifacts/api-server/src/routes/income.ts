import { Router, type IRouter } from "express";
import { db, companyDbContext, pool, incomeRecordsTable, incomeAttachmentsTable, companiesTable, accountsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { logAudit } from "../lib/audit.js";
import { postIncomeJE, reverseIncomeJE } from "../lib/income-auto-post.js";
import { isSingaporeCountry } from "../lib/singapore.js";
import { assertPeriodWritable } from "../lib/financial-year.js";
import { sanitizeErrorMessage, logServerError } from "../lib/safe-error.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

const incomeSchemaHealed = new WeakSet<object>();

/** Ensure income_records and income_attachments exist and have full column shape on current pool. */
export async function ensureIncomeSchema(): Promise<void> {
  const currentPool: any = companyDbContext.getStore() ?? pool;
  if (currentPool && incomeSchemaHealed.has(currentPool)) return;

  await currentPool.query(`
    CREATE TABLE IF NOT EXISTS income_records (
      id              serial PRIMARY KEY,
      company_id      integer NOT NULL,
      income_date     text NOT NULL,
      payer_name      text NOT NULL,
      description     text NOT NULL,
      category        text NOT NULL,
      amount          numeric(15,2) NOT NULL,
      gst_amount      numeric(15,2) NOT NULL DEFAULT 0,
      gst_treatment   text NOT NULL DEFAULT 'standard_rated',
      gst_claimable   boolean NOT NULL DEFAULT false,
      is_deductible   boolean NOT NULL DEFAULT true,
      deductible_pct  integer NOT NULL DEFAULT 100,
      currency        text NOT NULL DEFAULT 'SGD',
      exchange_rate   numeric(10,6) NOT NULL DEFAULT 1.000000,
      payment_method  text DEFAULT 'bank_transfer',
      account_id      integer,
      reference       text,
      notes           text,
      status          text NOT NULL DEFAULT 'draft',
      journal_entry_id integer,
      created_by      integer NOT NULL,
      created_at      timestamptz NOT NULL DEFAULT now(),
      updated_at      timestamptz NOT NULL DEFAULT now()
    )
  `).catch(() => undefined);

  for (const stmt of [
    `ALTER TABLE income_records ADD COLUMN IF NOT EXISTS exchange_rate numeric(10,6) NOT NULL DEFAULT 1.000000`,
    `ALTER TABLE income_records ADD COLUMN IF NOT EXISTS gst_amount numeric(15,2) NOT NULL DEFAULT 0`,
    `ALTER TABLE income_records ADD COLUMN IF NOT EXISTS gst_treatment text NOT NULL DEFAULT 'standard_rated'`,
    `ALTER TABLE income_records ADD COLUMN IF NOT EXISTS gst_claimable boolean NOT NULL DEFAULT false`,
    `ALTER TABLE income_records ADD COLUMN IF NOT EXISTS is_deductible boolean NOT NULL DEFAULT true`,
    `ALTER TABLE income_records ADD COLUMN IF NOT EXISTS deductible_pct integer NOT NULL DEFAULT 100`,
    `ALTER TABLE income_records ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'SGD'`,
    `ALTER TABLE income_records ADD COLUMN IF NOT EXISTS payment_method text DEFAULT 'bank_transfer'`,
    `ALTER TABLE income_records ADD COLUMN IF NOT EXISTS account_id integer`,
    `ALTER TABLE income_records ADD COLUMN IF NOT EXISTS reference text`,
    `ALTER TABLE income_records ADD COLUMN IF NOT EXISTS notes text`,
    `ALTER TABLE income_records ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft'`,
    `ALTER TABLE income_records ADD COLUMN IF NOT EXISTS journal_entry_id integer`,
    `ALTER TABLE income_records ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()`,
    `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS exchange_rate numeric(10,6) NOT NULL DEFAULT 1.000000`,
    `ALTER TABLE vendor_invoices ADD COLUMN IF NOT EXISTS exchange_rate numeric(10,6) NOT NULL DEFAULT 1.000000`,
    `CREATE TABLE IF NOT EXISTS income_attachments (
      id          serial PRIMARY KEY,
      income_id   integer NOT NULL,
      file_name   text NOT NULL DEFAULT 'attachment',
      mime_type   text NOT NULL DEFAULT 'application/octet-stream',
      file_data   text NOT NULL,
      created_at  timestamptz NOT NULL DEFAULT now()
    )`,
  ]) {
    await currentPool.query(stmt).catch(() => undefined);
  }

  if (currentPool) incomeSchemaHealed.add(currentPool);
}

function requireAuth(req: any, res: any): boolean {
  if (!req.session.userId) { res.status(401).json({ error: "Not authenticated" }); return false; }
  return true;
}
function requireCompany(req: any, res: any): boolean {
  if (!req.session.companyId) { res.status(400).json({ error: "No company selected" }); return false; }
  return true;
}
async function requireSingapore(req: any, res: any): Promise<boolean> {
  const companyId = req.session.companyId;
  if (!companyId) { res.status(400).json({ error: "No company selected" }); return false; }
  const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, companyId)).limit(1);
  if (!company || !isSingaporeCountry(company.country)) {
    res.status(403).json({ error: "Income module is only available for Singapore companies." });
    return false;
  }
  return true;
}

// ── List ──────────────────────────────────────────────────────────────────────
router.get("/income", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  if (!(await requireSingapore(req, res))) return;

  try {
    await ensureIncomeSchema();
    const companyId = req.session.companyId!;
    const records = await db.select()
      .from(incomeRecordsTable)
      .where(eq(incomeRecordsTable.companyId, companyId))
      .orderBy(desc(incomeRecordsTable.incomeDate), desc(incomeRecordsTable.createdAt));

    res.json(records);
  } catch (err) {
    logServerError(logger, err, { route: "GET /api/income", companyId: req.session.companyId });
    res.status(500).json({ error: sanitizeErrorMessage(err, "Failed to load income records") });
  }
});

// ── Get one ───────────────────────────────────────────────────────────────────
router.get("/income/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  if (!(await requireSingapore(req, res))) return;

  try {
    await ensureIncomeSchema();
    const id = parseInt(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

    const [record] = await db.select()
      .from(incomeRecordsTable)
      .where(and(eq(incomeRecordsTable.id, id), eq(incomeRecordsTable.companyId, req.session.companyId!)))
      .limit(1);
    if (!record) { res.status(404).json({ error: "Income record not found" }); return; }

    // Fetch account name if linked
    let accountName: string | null = null;
    if (record.accountId) {
      const [acct] = await db.select({ name: accountsTable.name, code: accountsTable.code })
        .from(accountsTable).where(eq(accountsTable.id, record.accountId)).limit(1);
      if (acct) accountName = `${acct.code} ${acct.name}`;
    }

    // Attachment count
    const attachments = await db.select({
      id: incomeAttachmentsTable.id,
      fileName: incomeAttachmentsTable.fileName,
      mimeType: incomeAttachmentsTable.mimeType,
      createdAt: incomeAttachmentsTable.createdAt,
    }).from(incomeAttachmentsTable).where(eq(incomeAttachmentsTable.incomeId, id))
      .orderBy(incomeAttachmentsTable.createdAt);

    res.json({ ...record, accountName, attachmentCount: attachments.length });
  } catch (err) {
    logServerError(logger, err, { route: "GET /api/income/:id", companyId: req.session.companyId, id: req.params.id });
    res.status(500).json({ error: sanitizeErrorMessage(err, "Failed to fetch income record") });
  }
});

// ── Create ────────────────────────────────────────────────────────────────────
router.post("/income", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  if (!(await requireSingapore(req, res))) return;

  try {
    await ensureIncomeSchema();
    const companyId = req.session.companyId!;
    const {
      incomeDate, payerName, description, category,
      amount, gstAmount, gstTreatment, gstClaimable, isDeductible, deductiblePct,
      currency, exchangeRate,
      paymentMethod, accountId, reference, notes, status,
    } = req.body;

    if (!incomeDate) { res.status(400).json({ error: "Income date is required" }); return; }
    const periodCheck = await assertPeriodWritable(companyId, incomeDate);
    if (!periodCheck.ok) { res.status(periodCheck.status).json({ error: periodCheck.error }); return; }
    if (!category) { res.status(400).json({ error: "Category is required" }); return; }
    if (!amount || isNaN(parseFloat(amount))) { res.status(400).json({ error: "Amount is required" }); return; }

    const [created] = await db.insert(incomeRecordsTable).values({
      companyId,
      incomeDate,
      payerName:    String(payerName ?? "").trim(),
      description:  String(description ?? "").trim(),
      category,
      amount:       parseFloat(amount).toFixed(2),
      gstAmount:    (parseFloat(gstAmount) || 0).toFixed(2),
      gstTreatment: gstTreatment || "standard_rated",
      gstClaimable: !!gstClaimable,
      isDeductible: isDeductible !== false,
      deductiblePct: deductiblePct ?? 100,
      currency:     currency || "SGD",
      exchangeRate: parseFloat(exchangeRate ?? "1").toFixed(6) as any,
      paymentMethod: paymentMethod || "bank_transfer",
      accountId:    accountId ? parseInt(accountId) : null,
      reference:    reference?.trim() || null,
      notes:        notes || null,
      status:       status || "draft",
      createdBy:    req.session.userId!,
    }).returning();

    logAudit({ req, action: "create", entityType: "income_record", entityId: created.id, entityLabel: `${created.category} — ${created.payerName}` });
    res.status(201).json(created);
  } catch (err) {
    logServerError(logger, err, { route: "POST /api/income", companyId: req.session.companyId });
    res.status(500).json({ error: sanitizeErrorMessage(err, "Failed to create income record") });
  }
});

// ── Update ────────────────────────────────────────────────────────────────────
router.put("/income/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  if (!(await requireSingapore(req, res))) return;

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [existing] = await db.select().from(incomeRecordsTable)
    .where(and(eq(incomeRecordsTable.id, id), eq(incomeRecordsTable.companyId, req.session.companyId!)))
    .limit(1);
  if (!existing) { res.status(404).json({ error: "Income record not found" }); return; }
  if (existing.status === "confirmed" && !req.session.isAdmin && req.session.userRole !== "accountant") {
    res.status(403).json({ error: "Only admins and accountants can edit confirmed income records." }); return;
  }
  if (existing.status === "void") {
    res.status(400).json({ error: "Cannot edit a voided income record." }); return;
  }

  const {
    incomeDate, payerName, description, category,
    amount, gstAmount, gstTreatment, gstClaimable, isDeductible, deductiblePct,
    currency, exchangeRate,
    paymentMethod, accountId, reference, notes, status,
  } = req.body;

  const updateData: any = { updatedAt: new Date() };
  if (incomeDate !== undefined)     updateData.incomeDate    = incomeDate;
  if (payerName !== undefined)      updateData.payerName     = String(payerName ?? "").trim();
  if (description !== undefined)    updateData.description   = String(description ?? "").trim();
  if (category !== undefined)       updateData.category      = category;
  if (amount !== undefined)         updateData.amount        = parseFloat(amount).toFixed(2);
  if (gstAmount !== undefined)      updateData.gstAmount     = (parseFloat(gstAmount) || 0).toFixed(2);
  if (gstTreatment !== undefined)   updateData.gstTreatment  = gstTreatment;
  if (gstClaimable !== undefined)   updateData.gstClaimable  = !!gstClaimable;
  if (isDeductible !== undefined)   updateData.isDeductible  = !!isDeductible;
  if (deductiblePct !== undefined)  updateData.deductiblePct = deductiblePct;
  if (currency !== undefined)       updateData.currency      = currency;
  if (exchangeRate !== undefined)   updateData.exchangeRate  = parseFloat(exchangeRate).toFixed(6);
  if (paymentMethod !== undefined)  updateData.paymentMethod = paymentMethod;
  if (accountId !== undefined)      updateData.accountId     = accountId ? parseInt(accountId) : null;
  if (reference !== undefined)      updateData.reference     = reference?.trim() || null;
  if (notes !== undefined)          updateData.notes         = notes || null;
  if (status !== undefined)         updateData.status        = status;

  const [updated] = await db.update(incomeRecordsTable).set(updateData)
    .where(eq(incomeRecordsTable.id, id)).returning();

  logAudit({ req, action: "update", entityType: "income_record", entityId: id, entityLabel: updated.payerName });
  res.json(updated);
});

// ── Delete ────────────────────────────────────────────────────────────────────
router.delete("/income/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  if (!(await requireSingapore(req, res))) return;

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [existing] = await db.select().from(incomeRecordsTable)
    .where(and(eq(incomeRecordsTable.id, id), eq(incomeRecordsTable.companyId, req.session.companyId!)))
    .limit(1);
  if (!existing) { res.status(404).json({ error: "Income record not found" }); return; }

  if (!req.session.isAdmin && req.session.userRole !== "accountant") {
    res.status(403).json({ error: "Only admins and accountants can delete income records." }); return;
  }

  await db.delete(incomeRecordsTable).where(eq(incomeRecordsTable.id, id));
  logAudit({ req, action: "delete", entityType: "income_record", entityId: id, entityLabel: existing.payerName });
  res.json({ success: true });
});

// ── Confirm ───────────────────────────────────────────────────────────────────
router.post("/income/:id/confirm", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  if (!(await requireSingapore(req, res))) return;

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [existing] = await db.select().from(incomeRecordsTable)
    .where(and(eq(incomeRecordsTable.id, id), eq(incomeRecordsTable.companyId, req.session.companyId!)))
    .limit(1);
  if (!existing) { res.status(404).json({ error: "Income record not found" }); return; }
  if (existing.status === "confirmed") { res.status(400).json({ error: "Already confirmed." }); return; }
  if (existing.status === "void") { res.status(400).json({ error: "Cannot confirm a voided record." }); return; }

  const [updated] = await db.update(incomeRecordsTable)
    .set({ status: "confirmed", updatedAt: new Date() })
    .where(eq(incomeRecordsTable.id, id)).returning();

  // Auto-post journal entry
  await postIncomeJE(
    {
      id:           updated.id,
      companyId:    updated.companyId,
      incomeDate:   updated.incomeDate,
      description:  updated.description,
      amount:       updated.amount,
      gstAmount:    updated.gstAmount,
      gstTreatment: updated.gstTreatment,
      accountId:    updated.accountId,
    },
    req.session.userId!,
    req.log,
  );

  logAudit({ req, action: "status:confirmed", entityType: "income_record", entityId: id, entityLabel: updated.payerName });
  res.json(updated);
});

// ── Void ──────────────────────────────────────────────────────────────────────
router.post("/income/:id/void", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  if (!(await requireSingapore(req, res))) return;

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [existing] = await db.select().from(incomeRecordsTable)
    .where(and(eq(incomeRecordsTable.id, id), eq(incomeRecordsTable.companyId, req.session.companyId!)))
    .limit(1);
  if (!existing) { res.status(404).json({ error: "Income record not found" }); return; }
  if (existing.status === "void") { res.status(400).json({ error: "Already voided." }); return; }

  if (!req.session.isAdmin) {
    res.status(403).json({ error: "Only admins can void income records." }); return;
  }

  const [updated] = await db.update(incomeRecordsTable)
    .set({ status: "void", updatedAt: new Date() })
    .where(eq(incomeRecordsTable.id, id)).returning();

  // Reverse JE if it was confirmed
  if (existing.status === "confirmed") {
    await reverseIncomeJE(id, existing.companyId, existing.description, req.session.userId!, req.log);
  }

  logAudit({ req, action: "status:void", entityType: "income_record", entityId: id, entityLabel: updated.payerName });
  res.json(updated);
});

// ── Attachments: List ─────────────────────────────────────────────────────────
router.get("/income/:id/attachments", async (req: any, res: any): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  const companyId = req.session.companyId!;
  const id = parseInt(req.params.id);
  try {
    const [record] = await db.select({ id: incomeRecordsTable.id })
      .from(incomeRecordsTable)
      .where(and(eq(incomeRecordsTable.id, id), eq(incomeRecordsTable.companyId, companyId)));
    if (!record) { res.status(404).json({ error: "Not found" }); return; }

    const rows = await db.select({
      id: incomeAttachmentsTable.id,
      fileName: incomeAttachmentsTable.fileName,
      mimeType: incomeAttachmentsTable.mimeType,
      createdAt: incomeAttachmentsTable.createdAt,
    }).from(incomeAttachmentsTable)
      .where(eq(incomeAttachmentsTable.incomeId, id))
      .orderBy(incomeAttachmentsTable.createdAt);

    res.json(rows);
  } catch (err: any) {
    req.log.error({ err }, "GET /income/:id/attachments error");
    res.status(500).json({ error: "Failed to fetch attachments" });
  }
});

// ── Attachments: Get one (with fileData) ─────────────────────────────────────
router.get("/income/:id/attachments/:attId", async (req: any, res: any): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  const companyId = req.session.companyId!;
  const incomeId = parseInt(req.params.id);
  const attId = parseInt(req.params.attId);
  try {
    const [record] = await db.select({ id: incomeRecordsTable.id })
      .from(incomeRecordsTable)
      .where(and(eq(incomeRecordsTable.id, incomeId), eq(incomeRecordsTable.companyId, companyId)));
    if (!record) { res.status(404).json({ error: "Not found" }); return; }

    const [att] = await db.select().from(incomeAttachmentsTable)
      .where(and(eq(incomeAttachmentsTable.id, attId), eq(incomeAttachmentsTable.incomeId, incomeId)));
    if (!att) { res.status(404).json({ error: "Attachment not found" }); return; }

    res.json({ id: att.id, fileName: att.fileName, mimeType: att.mimeType, fileData: att.fileData });
  } catch (err: any) {
    req.log.error({ err }, "GET /income/:id/attachments/:attId error");
    res.status(500).json({ error: "Failed to fetch attachment" });
  }
});

// ── Attachments: Upload ───────────────────────────────────────────────────────
router.post("/income/:id/attachments", async (req: any, res: any): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  const companyId = req.session.companyId!;
  const incomeId = parseInt(req.params.id);
  try {
    const [record] = await db.select({ id: incomeRecordsTable.id })
      .from(incomeRecordsTable)
      .where(and(eq(incomeRecordsTable.id, incomeId), eq(incomeRecordsTable.companyId, companyId)));
    if (!record) { res.status(404).json({ error: "Not found" }); return; }

    const { fileName, mimeType, fileData } = req.body;
    if (!fileData || !mimeType) { res.status(400).json({ error: "fileData and mimeType are required" }); return; }

    const [att] = await db.insert(incomeAttachmentsTable).values({
      incomeId, fileName: fileName || "attachment", mimeType, fileData,
    }).returning({
      id: incomeAttachmentsTable.id,
      fileName: incomeAttachmentsTable.fileName,
      mimeType: incomeAttachmentsTable.mimeType,
      createdAt: incomeAttachmentsTable.createdAt,
    });

    res.json(att);
  } catch (err: any) {
    req.log.error({ err }, "POST /income/:id/attachments error");
    res.status(500).json({ error: "Failed to upload attachment" });
  }
});

// ── Attachments: Delete ───────────────────────────────────────────────────────
router.delete("/income/:id/attachments/:attId", async (req: any, res: any): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  const companyId = req.session.companyId!;
  const incomeId = parseInt(req.params.id);
  const attId = parseInt(req.params.attId);
  try {
    const [record] = await db.select({ id: incomeRecordsTable.id })
      .from(incomeRecordsTable)
      .where(and(eq(incomeRecordsTable.id, incomeId), eq(incomeRecordsTable.companyId, companyId)));
    if (!record) { res.status(404).json({ error: "Not found" }); return; }

    await db.delete(incomeAttachmentsTable)
      .where(and(eq(incomeAttachmentsTable.id, attId), eq(incomeAttachmentsTable.incomeId, incomeId)));
    res.json({ ok: true });
  } catch (err: any) {
    req.log.error({ err }, "DELETE /income/:id/attachments/:attId error");
    res.status(500).json({ error: "Failed to delete attachment" });
  }
});

export default router;
