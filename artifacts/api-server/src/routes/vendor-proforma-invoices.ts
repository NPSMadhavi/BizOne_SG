import { Router, type IRouter } from "express";
import { companyDbContext, db, pool, vendorProformaInvoicesTable, usersTable, vendorsTable } from "@workspace/db";
import { eq, desc, inArray, ilike, and } from "drizzle-orm";
import { nextDocNumber } from "../lib/running-numbers.js";
import { logAudit } from "../lib/audit.js";

const router: IRouter = Router();

/**
 * Per-pool ensure: each company database has its own pg.Pool via companyDbContext.
 * A single process-wide Promise would skip CREATE on other tenant DBs.
 */
const vpiReadyByPool = new WeakMap<object, Promise<void>>();
const VPI_SHARED_SENTINEL = { kind: "shared-vpi-ensure" };

async function ensureVendorProformaTable(): Promise<void> {
  const cacheKey = companyDbContext.getStore() ?? VPI_SHARED_SENTINEL;
  let ready = vpiReadyByPool.get(cacheKey);
  if (!ready) {
    ready = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS vendor_proforma_invoices (
          id serial PRIMARY KEY,
          vpi_number text NOT NULL,
          company_id integer NOT NULL DEFAULT 1,
          vendor_name text NOT NULL,
          vendor_address text,
          vendor_contact text,
          vendor_contact_email text,
          delivery_address text,
          issue_date text,
          delivery_date text,
          payment_terms text,
          notes text,
          is_private boolean NOT NULL DEFAULT false,
          items jsonb NOT NULL DEFAULT '[]',
          subtotal numeric(15,2) NOT NULL DEFAULT 0,
          discount_amount numeric(15,2) NOT NULL DEFAULT 0,
          tax numeric(15,2) NOT NULL DEFAULT 0,
          total_amount numeric(15,2) NOT NULL DEFAULT 0,
          currency text NOT NULL DEFAULT 'SGD',
          pq_ref_no text,
          status text NOT NULL DEFAULT 'draft',
          email_sent_to text,
          terms_and_conditions text,
          delivery_instructions text,
          customer_note text,
          authorised_signature text,
          created_by integer NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now()
        )`);
      await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS vendor_proforma_invoices_company_vpi_number_unique
        ON vendor_proforma_invoices (company_id, vpi_number)`);
      for (const stmt of [
        `ALTER TABLE settings ADD COLUMN IF NOT EXISTS vpi_prefix text DEFAULT 'VPI'`,
        `ALTER TABLE settings ADD COLUMN IF NOT EXISTS vpi_counter integer NOT NULL DEFAULT 0`,
        `ALTER TABLE settings ADD COLUMN IF NOT EXISTS vpi_suffix text DEFAULT ''`,
      ]) {
        try { await pool.query(stmt); } catch { /* ignore */ }
      }
    })().catch((err) => {
      vpiReadyByPool.delete(cacheKey);
      throw err;
    });
    vpiReadyByPool.set(cacheKey, ready);
  }
  await ready;
}

function requireAuth(req: any, res: any): boolean {
  if (!req.session.userId) { res.status(401).json({ error: "Not authenticated" }); return false; }
  return true;
}
function requireCompany(req: any, res: any): boolean {
  if (!req.session.companyId) { res.status(400).json({ error: "No company selected." }); return false; }
  return true;
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

function lineItemAmount(item: any): number {
  if (item?.type === "section" || item?.isFoc) return 0;
  const parsed = parseFloat(String(item?.amount ?? ""));
  if (!Number.isNaN(parsed) && parsed > 0) return parsed;
  const disc = Number(item?.discount) || 0;
  return (Number(item?.qty) || 0) * (Number(item?.unitPrice) || 0) * (1 - disc / 100);
}

function calcProformaFinancials(items: any[], discountAmount: number, taxRatePercent: number) {
  const subtotal = (items ?? []).reduce((s: number, item: any) => s + lineItemAmount(item), 0);
  const docDiscount = Number(discountAmount) || 0;
  const taxableAmount = subtotal - docDiscount;
  const taxAmt = (taxableAmount * (Number(taxRatePercent) || 0)) / 100;
  const totalAmount = taxableAmount + taxAmt;
  return {
    subtotal,
    docDiscount,
    taxAmt,
    totalAmount,
  };
}

function inferTaxRatePercent(doc: { subtotal?: string | number; discountAmount?: string | number; tax?: string | number }) {
  const storedSubtotal = Number(doc.subtotal ?? 0);
  const storedTax = Number(doc.tax ?? 0);
  const taxable = storedSubtotal - Number(doc.discountAmount ?? 0);
  if (storedTax <= 0) return 0;
  if (storedTax <= 100 && taxable <= 0) return storedTax;
  if (storedTax <= 100 && storedTax < taxable * 0.5) return storedTax;
  if (taxable > 0) return (storedTax / taxable) * 100;
  if (storedTax <= 100) return storedTax;
  return 0;
}

function deriveTaxRatePercent(doc: { subtotal?: string | number; discountAmount?: string | number; tax?: string | number }) {
  return inferTaxRatePercent(doc);
}

function withComputedTotals(doc: any) {
  const parsed = parseDoc(doc);
  const items = (parsed.items as any[]) ?? [];
  if (!items.length) return parsed;

  const storedSubtotal = Number(parsed.subtotal) || 0;
  const lineSubtotal = items.reduce((s, item) => s + lineItemAmount(item), 0);
  const storedTax = Number(parsed.tax) || 0;
  const needsRecompute =
    lineSubtotal > 0 &&
    (storedSubtotal <= 0 || Math.abs(storedSubtotal - lineSubtotal) > 0.01);
  const needsTaxFix =
    storedSubtotal <= 0 && storedTax > 0 && storedTax <= 100 && lineSubtotal > 0;

  if (!needsRecompute && !needsTaxFix) return parsed;

  const rate = inferTaxRatePercent(parsed);
  const { subtotal, docDiscount, taxAmt, totalAmount } = calcProformaFinancials(
    items,
    Number(parsed.discountAmount) || 0,
    rate,
  );
  if (subtotal <= 0) return parsed;
  return { ...parsed, subtotal, discountAmount: docDiscount, tax: taxAmt, totalAmount };
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

async function upsertVendorByName(companyId: number, name: string, address?: string | null, contactPerson?: string | null, contactEmail?: string | null) {
  if (!name?.trim()) return;
  const existing = await db.select({ id: vendorsTable.id }).from(vendorsTable)
    .where(and(eq(vendorsTable.companyId, companyId), ilike(vendorsTable.name, name.trim()))).limit(1);
  if (existing.length === 0) {
    await db.insert(vendorsTable).values({ companyId, name: name.trim(), address: address || null, contactPerson: contactPerson || null, contactEmail: contactEmail || null });
  }
}

router.use(async (_req, res, next) => {
  try {
    await ensureVendorProformaTable();
    next();
  } catch (err) {
    console.error("[vendor-proforma-invoices] schema ensure failed:", err);
    res.status(500).json({ error: "Vendor proforma schema is not ready" });
  }
});

// ── List ───────────────────────────────────────────────────────────────────────
router.get("/vendor-proforma-invoices", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  try {
    const companyId = req.session.companyId;
    const userId = req.session.userId!;
    const isAdmin = req.session.isAdmin ?? false;

    const all = companyId
      ? await db.select().from(vendorProformaInvoicesTable).where(eq(vendorProformaInvoicesTable.companyId, companyId)).orderBy(desc(vendorProformaInvoicesTable.createdAt))
      : await db.select().from(vendorProformaInvoicesTable).orderBy(desc(vendorProformaInvoicesTable.createdAt));

    const visible = visibilityFilter(all, userId, isAdmin);
    const withNames = await withUsernames(visible);
    res.json(withNames.map(withComputedTotals));
  } catch (err) {
    req.log?.error?.({ err }, "GET /api/vendor-proforma-invoices failed");
    console.error("[vendor-proforma-invoices] list failed:", err);
    const message = err instanceof Error ? err.message : "Failed to list vendor proforma invoices";
    res.status(500).json({ error: "Failed to list vendor proforma invoices", detail: message });
  }
});

// ── Get one ────────────────────────────────────────────────────────────────────
router.get("/vendor-proforma-invoices/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [doc] = await db.select().from(vendorProformaInvoicesTable).where(eq(vendorProformaInvoicesTable.id, id));
  if (!doc) { res.status(404).json({ error: "Vendor proforma invoice not found" }); return; }

  const userId = req.session.userId!;
  const isAdmin = req.session.isAdmin ?? false;
  if (doc.isPrivate && doc.createdBy !== userId && !isAdmin) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  res.json(withComputedTotals(doc));
});

// ── Create ─────────────────────────────────────────────────────────────────────
router.post("/vendor-proforma-invoices", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;

  const companyId = req.session.companyId!;
  const userId = req.session.userId!;
  const { vendorName, vendorAddress, vendorContact, vendorContactEmail, deliveryAddress, issueDate, deliveryDate, paymentTerms, notes, items, discountAmount, tax, currency, pqRefNo, status, isPrivate, termsAndConditions, deliveryInstructions, customerNote, authorisedSignature } = req.body;

  if (!vendorName?.trim()) { res.status(400).json({ error: "Vendor name is required" }); return; }

  const vpiNumber = await nextDocNumber("vpi", companyId);
  const { subtotal, docDiscount, taxAmt, totalAmount } = calcProformaFinancials(
    items || [],
    Number(discountAmount) || 0,
    Number(tax) || 0,
  );

  try {
    const [doc] = await db.insert(vendorProformaInvoicesTable).values({
      vpiNumber, companyId, vendorName: vendorName.trim(),
      vendorAddress: vendorAddress || null,
      vendorContact: vendorContact || null,
      vendorContactEmail: vendorContactEmail || null,
      deliveryAddress: deliveryAddress || null,
      issueDate: issueDate || null,
      deliveryDate: deliveryDate || null,
      paymentTerms: paymentTerms || null,
      notes: notes || null,
      items: items || [],
      subtotal: subtotal.toFixed(2),
      discountAmount: docDiscount.toFixed(2),
      tax: taxAmt.toFixed(2),
      totalAmount: totalAmount.toFixed(2),
      currency: currency || "SGD",
      pqRefNo: pqRefNo || null,
      status: status || "draft",
      isPrivate: isPrivate ?? false,
      createdBy: userId,
      termsAndConditions: termsAndConditions || null,
      deliveryInstructions: deliveryInstructions || null,
      customerNote: customerNote || null,
      authorisedSignature: authorisedSignature || null,
    }).returning();

    await upsertVendorByName(companyId, vendorName, vendorAddress, vendorContact, vendorContactEmail);
    logAudit({ req, action: "create", entityType: "vendor_proforma_invoice", entityId: doc.id, entityLabel: doc.vpiNumber });
    res.status(201).json(withComputedTotals(doc));
  } catch (err: any) {
    if (err.code === "23505") {
      res.status(400).json({ error: `VPI number "${vpiNumber}" already exists` });
    } else {
      req.log?.error({ err }, "Failed to create VPI"); res.status(500).json({ error: "Failed to create vendor proforma invoice" });
    }
  }
});

// ── Update ─────────────────────────────────────────────────────────────────────
router.put("/vendor-proforma-invoices/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const companyId = req.session.companyId!;
  const isAdmin = req.session.isAdmin ?? false;

  const [existing] = await db.select().from(vendorProformaInvoicesTable).where(eq(vendorProformaInvoicesTable.id, id));
  if (!existing) { res.status(404).json({ error: "Vendor proforma invoice not found" }); return; }
  if (existing.companyId !== companyId) { res.status(403).json({ error: "Forbidden" }); return; }

  const { vendorName, vendorAddress, vendorContact, vendorContactEmail, deliveryAddress, issueDate, deliveryDate, paymentTerms, notes, items, discountAmount, tax, currency, pqRefNo, status, isPrivate, termsAndConditions, deliveryInstructions, customerNote, authorisedSignature } = req.body;

  const updates: any = {};
  if (vendorName !== undefined) updates.vendorName = vendorName.trim();
  if (vendorAddress !== undefined) updates.vendorAddress = vendorAddress || null;
  if (vendorContact !== undefined) updates.vendorContact = vendorContact || null;
  if (vendorContactEmail !== undefined) updates.vendorContactEmail = vendorContactEmail || null;
  if (deliveryAddress !== undefined) updates.deliveryAddress = deliveryAddress || null;
  if (issueDate !== undefined) updates.issueDate = issueDate || null;
  if (deliveryDate !== undefined) updates.deliveryDate = deliveryDate || null;
  if (paymentTerms !== undefined) updates.paymentTerms = paymentTerms || null;
  if (notes !== undefined) updates.notes = notes || null;
  if (items !== undefined) updates.items = items;
  if (currency !== undefined) updates.currency = currency;
  if (pqRefNo !== undefined) updates.pqRefNo = pqRefNo || null;
  if (status !== undefined) updates.status = status;
  if (isPrivate !== undefined) updates.isPrivate = isPrivate;
  if (termsAndConditions !== undefined) updates.termsAndConditions = termsAndConditions || null;
  if (deliveryInstructions !== undefined) updates.deliveryInstructions = deliveryInstructions || null;
  if (customerNote !== undefined) updates.customerNote = customerNote || null;
  if (authorisedSignature !== undefined) updates.authorisedSignature = authorisedSignature || null;

  if (items !== undefined || discountAmount !== undefined || tax !== undefined) {
    const itemsToUse = items !== undefined ? items : (existing.items as any[]) ?? [];
    const disc = discountAmount !== undefined ? Number(discountAmount) : Number(existing.discountAmount ?? 0);
    const taxRate = tax !== undefined ? Number(tax) : deriveTaxRatePercent(existing);
    const { subtotal, docDiscount, taxAmt, totalAmount } = calcProformaFinancials(itemsToUse, disc, taxRate);
    updates.items = itemsToUse;
    updates.subtotal = subtotal.toFixed(2);
    updates.discountAmount = docDiscount.toFixed(2);
    updates.tax = taxAmt.toFixed(2);
    updates.totalAmount = totalAmount.toFixed(2);
  }

  const [updated] = await db.update(vendorProformaInvoicesTable).set(updates).where(eq(vendorProformaInvoicesTable.id, id)).returning();
  if (vendorName !== undefined) {
    await upsertVendorByName(companyId, vendorName, vendorAddress ?? existing.vendorAddress, vendorContact ?? existing.vendorContact, vendorContactEmail ?? existing.vendorContactEmail);
  }
  logAudit({ req, action: "update", entityType: "vendor_proforma_invoice", entityId: id, entityLabel: updated.vpiNumber });
  res.json(withComputedTotals(updated));
});

// ── Mark Confirmed ─────────────────────────────────────────────────────────────
router.post("/vendor-proforma-invoices/:id/mark-confirmed", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const companyId = req.session.companyId!;
  const [existing] = await db.select().from(vendorProformaInvoicesTable).where(eq(vendorProformaInvoicesTable.id, id));
  if (!existing) { res.status(404).json({ error: "Vendor proforma invoice not found" }); return; }
  if (existing.companyId !== companyId) { res.status(403).json({ error: "Forbidden" }); return; }

  const [updated] = await db.update(vendorProformaInvoicesTable).set({ status: "confirmed" }).where(eq(vendorProformaInvoicesTable.id, id)).returning();
  logAudit({ req, action: "mark-confirmed", entityType: "vendor_proforma_invoice", entityId: id, entityLabel: updated.vpiNumber });
  res.json(withComputedTotals(updated));
});

// ── Mark Sent ──────────────────────────────────────────────────────────────────
router.post("/vendor-proforma-invoices/:id/mark-sent", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const companyId = req.session.companyId!;
  const [existing] = await db.select().from(vendorProformaInvoicesTable).where(eq(vendorProformaInvoicesTable.id, id));
  if (!existing) { res.status(404).json({ error: "Vendor proforma invoice not found" }); return; }
  if (existing.companyId !== companyId) { res.status(403).json({ error: "Forbidden" }); return; }

  const sentTo: string[] = Array.isArray(req.body.sentTo) ? req.body.sentTo : [];
  const updateData: Record<string, any> = {};
  if (["draft", "confirmed"].includes(existing.status)) updateData.status = "sent";
  if (sentTo.length > 0) updateData.emailSentTo = sentTo.join(", ");

  if (Object.keys(updateData).length > 0) {
    await db.update(vendorProformaInvoicesTable).set(updateData).where(eq(vendorProformaInvoicesTable.id, id));
  }
  const [updated] = await db.select().from(vendorProformaInvoicesTable).where(eq(vendorProformaInvoicesTable.id, id));
  logAudit({ req, action: "mark-sent", entityType: "vendor_proforma_invoice", entityId: id, entityLabel: updated.vpiNumber });
  res.json(withComputedTotals(updated));
});

// ── Delete (admin only) ────────────────────────────────────────────────────────
router.delete("/vendor-proforma-invoices/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const isAdmin = req.session.isAdmin ?? false;
  if (!isAdmin) { res.status(403).json({ error: "Only administrators can delete vendor proforma invoices" }); return; }

  const id = parseInt(req.params.id);
  const [deleted] = await db.delete(vendorProformaInvoicesTable).where(eq(vendorProformaInvoicesTable.id, id)).returning();
  logAudit({ req, action: "delete", entityType: "vendor_proforma_invoice", entityId: id, entityLabel: deleted?.vpiNumber });
  res.json({ success: true });
});

export default router;
