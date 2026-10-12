/**
 * vendor-invoice-auto-post.ts
 *
 * Accrual-basis journal entries for the AP (vendor invoice) module.
 *
 * ON VENDOR INVOICE CREATED (when expenseAccountId is set):
 *   DR <expenseAccount>                 = totalAmount   → expense recognised
 *   CR 2000 Accounts Payable (AP)       = totalAmount   → liability to vendor
 *
 * ON PAYMENT RECORDED:
 *   DR 2000 Accounts Payable            = paymentAmount → liability settled
 *   CR 1010 Cash at Bank - SGD          = paymentAmount → cash paid out
 *
 * ON VENDOR INVOICE DELETED  → reverse the expense JE
 * ON PAYMENT DELETED         → reverse the payment JE
 *
 * All functions are idempotent (safe to call multiple times).
 */

import { db, accountsTable, journalEntriesTable, journalLinesTable, vendorInvoicesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { ensureAccountsSeeded } from "./accounts-seed.js";
import { assertPeriodWritable } from "./financial-year.js";

async function getAccountByCode(companyId: number, code: string) {
  const [acct] = await db.select()
    .from(accountsTable)
    .where(and(eq(accountsTable.companyId, companyId), eq(accountsTable.code, code)))
    .limit(1);
  return acct ?? null;
}

async function getAccountById(id: number) {
  const [acct] = await db.select().from(accountsTable).where(eq(accountsTable.id, id)).limit(1);
  return acct ?? null;
}

async function resolveVendorDebitAccount(pi: {
  id: number;
  companyId: number;
  expenseAccountId?: number | null;
  items?: Array<{ stockItemId?: number | null }> | null;
}) {
  if (pi.expenseAccountId) {
    const chosen = await getAccountById(pi.expenseAccountId);
    if (chosen) return chosen;
  }
  let items = pi.items;
  if (!items) {
    const [row] = await db.select({ items: vendorInvoicesTable.items })
      .from(vendorInvoicesTable)
      .where(and(eq(vendorInvoicesTable.id, pi.id), eq(vendorInvoicesTable.companyId, pi.companyId)))
      .limit(1);
    items = (row?.items as Array<{ stockItemId?: number | null }> | null) ?? null;
  }
  const hasStock = Array.isArray(items) && items.some((item) => Number(item?.stockItemId) > 0);
  if (hasStock) {
    const inventory = await getAccountByCode(pi.companyId, "1200");
    if (inventory) return inventory;
  }
  return await getAccountByCode(pi.companyId, "5000")
    ?? await getAccountByCode(pi.companyId, "1200");
}

// ── Vendor Invoice Created ────────────────────────────────────────────────────

export async function postVendorInvoiceJE(
  pi: {
    id: number;
    companyId: number;
    piNumber: string;
    vendorName: string;
    piDate?: string | null;
    totalAmount: number | string;
    gstAmount?: number | string;
    gstTreatment?: string;
    expenseAccountId?: number | null;
    items?: Array<{ stockItemId?: number | null }> | null;
  },
  userId: number,
  log?: any,
): Promise<void> {
  await ensureAccountsSeeded(pi.companyId);

  const entryDate = pi.piDate || new Date().toISOString().split("T")[0];
  const periodCheck = await assertPeriodWritable(pi.companyId, entryDate);
  if (!periodCheck.ok) throw new Error(periodCheck.error);

  const [existing] = await db.select({ id: journalEntriesTable.id })
    .from(journalEntriesTable)
    .where(and(
      eq(journalEntriesTable.companyId, pi.companyId),
      eq(journalEntriesTable.refType, "vendor_invoice"),
      eq(journalEntriesTable.refId, pi.id),
    ))
    .limit(1);
  if (existing) return;

  const apAcct = await getAccountByCode(pi.companyId, "2000");
  const expAcct = await resolveVendorDebitAccount(pi);
  if (!apAcct || !expAcct) {
    if (log) log.warn({ companyId: pi.companyId, piNumber: pi.piNumber }, "vendor-invoice-auto-post: AP or debit account not found");
    return;
  }

  const total    = parseFloat(String(pi.totalAmount));
  const gst      = parseFloat(String(pi.gstAmount ?? "0"));
  const net      = total - gst;
  const isSR     = !pi.gstTreatment || pi.gstTreatment === "standard_rated";
  const desc     = `Vendor PI ${pi.piNumber} — ${pi.vendorName}`;

  try {
    const [entry] = await db.insert(journalEntriesTable).values({
      companyId:   pi.companyId,
      entryDate,
      description: desc,
      refType:     "vendor_invoice",
      refId:       pi.id,
      refNumber:   pi.piNumber,
      status:      "posted",
      createdBy:   userId,
    }).returning();

    if (isSR && gst > 0) {
      // Split JE: DR Expense (net excl. GST) + DR Input Tax 1110 (GST) + CR AP (total)
      const inputTaxAcct = await getAccountByCode(pi.companyId, "1110");
      if (inputTaxAcct) {
        await db.insert(journalLinesTable).values([
          { journalEntryId: entry.id, accountId: expAcct.id,      description: desc, debit: net.toFixed(2),   credit: "0.00" },
          { journalEntryId: entry.id, accountId: inputTaxAcct.id, description: desc, debit: gst.toFixed(2),   credit: "0.00" },
          { journalEntryId: entry.id, accountId: apAcct.id,       description: desc, debit: "0.00",           credit: total.toFixed(2) },
        ]);
      } else {
        // Fallback: no 1110 account seeded yet — post full total to expense
        await db.insert(journalLinesTable).values([
          { journalEntryId: entry.id, accountId: expAcct.id, description: desc, debit: total.toFixed(2), credit: "0.00" },
          { journalEntryId: entry.id, accountId: apAcct.id,  description: desc, debit: "0.00",           credit: total.toFixed(2) },
        ]);
      }
    } else {
      // No GST split: DR Expense (full amount) + CR AP
      await db.insert(journalLinesTable).values([
        { journalEntryId: entry.id, accountId: expAcct.id, description: desc, debit: total.toFixed(2), credit: "0.00" },
        { journalEntryId: entry.id, accountId: apAcct.id,  description: desc, debit: "0.00",           credit: total.toFixed(2) },
      ]);
    }
  } catch (err) {
    if (log) log.error({ err, piNumber: pi.piNumber }, "vendor-invoice-auto-post: JE insert failed (non-fatal)");
  }
}

// ── Vendor Invoice Deleted ────────────────────────────────────────────────────

export async function reverseVendorInvoiceJE(
  piId: number,
  companyId: number,
  piNumber: string,
  vendorName: string,
  userId: number,
  log?: any,
): Promise<void> {
  const [original] = await db.select()
    .from(journalEntriesTable)
    .where(and(
      eq(journalEntriesTable.companyId, companyId),
      eq(journalEntriesTable.refType, "vendor_invoice"),
      eq(journalEntriesTable.refId, piId),
    ))
    .limit(1);

  if (!original || original.status === "reversed") return;

  const [existingReversal] = await db.select({ id: journalEntriesTable.id })
    .from(journalEntriesTable)
    .where(eq(journalEntriesTable.reversalOfId, original.id))
    .limit(1);
  if (existingReversal) return;

  const originalLines = await db.select()
    .from(journalLinesTable)
    .where(eq(journalLinesTable.journalEntryId, original.id));

  try {
    const [reversal] = await db.insert(journalEntriesTable).values({
      companyId,
      entryDate:   new Date().toISOString().split("T")[0],
      description: `VOID — Vendor PI ${piNumber} — ${vendorName}`,
      refType:     "vendor_invoice",
      refId:       piId,
      refNumber:   piNumber,
      status:      "posted",
      reversalOfId: original.id,
      createdBy:   userId,
    }).returning();

    await db.insert(journalLinesTable).values(
      originalLines.map(l => ({
        journalEntryId: reversal.id,
        accountId:      l.accountId,
        description:    `REVERSAL: ${l.description ?? ""}`,
        debit:          l.credit,
        credit:         l.debit,
      }))
    );

    await db.update(journalEntriesTable)
      .set({ status: "reversed" })
      .where(eq(journalEntriesTable.id, original.id));
  } catch (err) {
    if (log) log.error({ err, piNumber }, "vendor-invoice-auto-post: reversal failed (non-fatal)");
  }
}

// ── Payment Recorded ──────────────────────────────────────────────────────────

export async function postPaymentJE(
  payment: {
    id: number;
    vendorInvoiceId: number;
    companyId: number;
    paymentDate: string;
    amount: number | string;
    reference?: string | null;
  },
  piNumber: string,
  vendorName: string,
  userId: number,
  log?: any,
): Promise<void> {
  await ensureAccountsSeeded(payment.companyId);

  const [existing] = await db.select({ id: journalEntriesTable.id })
    .from(journalEntriesTable)
    .where(and(
      eq(journalEntriesTable.companyId, payment.companyId),
      eq(journalEntriesTable.refType, "vendor_payment"),
      eq(journalEntriesTable.refId, payment.id),
    ))
    .limit(1);
  if (existing) return;

  const [apAcct, bankAcct] = await Promise.all([
    getAccountByCode(payment.companyId, "2000"),
    getAccountByCode(payment.companyId, "1010"),
  ]);
  if (!apAcct || !bankAcct) {
    if (log) log.warn({ companyId: payment.companyId }, "vendor-invoice-auto-post: AP or bank account not found");
    return;
  }

  const amount = parseFloat(String(payment.amount)).toFixed(2);
  const ref    = payment.reference ? ` (Ref: ${payment.reference})` : "";
  const desc   = `Payment — Vendor PI ${piNumber} — ${vendorName}${ref}`;

  try {
    const [entry] = await db.insert(journalEntriesTable).values({
      companyId:   payment.companyId,
      entryDate:   payment.paymentDate,
      description: desc,
      refType:     "vendor_payment",
      refId:       payment.id,
      refNumber:   piNumber,
      status:      "posted",
      createdBy:   userId,
    }).returning();

    await db.insert(journalLinesTable).values([
      { journalEntryId: entry.id, accountId: apAcct.id,  description: desc, debit: amount,  credit: "0.00" },
      { journalEntryId: entry.id, accountId: bankAcct.id, description: desc, debit: "0.00", credit: amount  },
    ]);
  } catch (err) {
    if (log) log.error({ err }, "vendor-invoice-auto-post: payment JE failed (non-fatal)");
  }
}

// ── Payment Deleted ───────────────────────────────────────────────────────────

export async function reversePaymentJE(
  paymentId: number,
  companyId: number,
  piNumber: string,
  vendorName: string,
  userId: number,
  log?: any,
): Promise<void> {
  const [original] = await db.select()
    .from(journalEntriesTable)
    .where(and(
      eq(journalEntriesTable.companyId, companyId),
      eq(journalEntriesTable.refType, "vendor_payment"),
      eq(journalEntriesTable.refId, paymentId),
    ))
    .limit(1);

  if (!original || original.status === "reversed") return;

  const [existingReversal] = await db.select({ id: journalEntriesTable.id })
    .from(journalEntriesTable)
    .where(eq(journalEntriesTable.reversalOfId, original.id))
    .limit(1);
  if (existingReversal) return;

  const originalLines = await db.select()
    .from(journalLinesTable)
    .where(eq(journalLinesTable.journalEntryId, original.id));

  try {
    const [reversal] = await db.insert(journalEntriesTable).values({
      companyId,
      entryDate:    new Date().toISOString().split("T")[0],
      description:  `REVERSAL: Payment — Vendor PI ${piNumber}`,
      refType:      "vendor_payment",
      refId:        paymentId,
      refNumber:    piNumber,
      status:       "posted",
      reversalOfId: original.id,
      createdBy:    userId,
    }).returning();

    await db.insert(journalLinesTable).values(
      originalLines.map(l => ({
        journalEntryId: reversal.id,
        accountId:      l.accountId,
        description:    `REVERSAL: ${l.description ?? ""}`,
        debit:          l.credit,
        credit:         l.debit,
      }))
    );

    await db.update(journalEntriesTable)
      .set({ status: "reversed" })
      .where(eq(journalEntriesTable.id, original.id));
  } catch (err) {
    if (log) log.error({ err }, "vendor-invoice-auto-post: payment reversal failed (non-fatal)");
  }
}

/** Post journal entries for vendor invoices that were saved without one. */
export async function backfillVendorInvoiceJEs(companyId: number, userId: number, log?: any): Promise<number> {
  const rows = await db.select().from(vendorInvoicesTable)
    .where(eq(vendorInvoicesTable.companyId, companyId));

  let posted = 0;
  for (const pi of rows) {
    const status = String(pi.status || "").toLowerCase();
    if (status === "void" || status === "cancelled" || status === "draft") continue;
    const before = await db.select({ id: journalEntriesTable.id })
      .from(journalEntriesTable)
      .where(and(
        eq(journalEntriesTable.companyId, companyId),
        eq(journalEntriesTable.refType, "vendor_invoice"),
        eq(journalEntriesTable.refId, pi.id),
      ))
      .limit(1);
    if (before.length > 0) continue;
    try {
      await postVendorInvoiceJE({
        id: pi.id,
        companyId: pi.companyId,
        piNumber: pi.piNumber,
        vendorName: pi.vendorName,
        piDate: pi.piDate,
        totalAmount: pi.totalAmount,
        gstAmount: pi.gstAmount,
        gstTreatment: pi.gstTreatment ?? undefined,
        expenseAccountId: pi.expenseAccountId,
        items: (pi.items as Array<{ stockItemId?: number | null }> | null) ?? null,
      }, userId, log);
      posted++;
    } catch (err) {
      if (log) log.warn({ err, piNumber: pi.piNumber }, "vendor-invoice-auto-post: backfill skipped");
    }
  }
  return posted;
}
