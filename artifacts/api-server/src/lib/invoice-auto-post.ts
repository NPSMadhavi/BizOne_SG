/**
 * invoice-auto-post.ts
 *
 * IRAS-compliant automatic journal entry creation when a Singapore invoice
 * is confirmed or voided.
 *
 * IRAS GST F5 mapping (standard-rated supply):
 *   DR 1100  Accounts Receivable          = total amount (incl. GST)   → receivable
 *   CR 4000  Sales Revenue                = taxable amount (ex-GST)    → IRAS Box 1
 *   CR 2010  GST Output Tax Payable       = GST dollar amount          → IRAS Box 6
 *
 * Zero-rated / no GST (overseas customer or 0% rate):
 *   DR 1100  Accounts Receivable          = total amount
 *   CR 4000  Sales Revenue                = total amount
 */

import { db, accountsTable, journalEntriesTable, journalLinesTable, companiesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { ensureAccountsSeeded } from "./accounts-seed.js";

interface InvoiceSnap {
  id: number;
  companyId: number;
  invNumber: string;
  customerName: string;
  issueDate?: string | null;
  totalAmount: string;   // dollar amount incl. GST
  subtotal: string;      // sum of line items before overall discount
  discountAmount: string;// overall invoice discount
  tax: string;           // GST dollar amount (NOT the %)
}

async function isSingapore(companyId: number): Promise<boolean> {
  const [co] = await db.select({ country: companiesTable.country })
    .from(companiesTable)
    .where(eq(companiesTable.id, companyId))
    .limit(1);
  return co?.country?.toLowerCase() === "singapore";
}

async function getAccountByCode(companyId: number, code: string) {
  const [acct] = await db.select()
    .from(accountsTable)
    .where(and(eq(accountsTable.companyId, companyId), eq(accountsTable.code, code)))
    .limit(1);
  return acct ?? null;
}

/**
 * Called when an invoice is newly confirmed.
 * Creates an IRAS-compliant double-entry journal entry.
 * Safe to call multiple times — idempotent.
 */
export async function postInvoiceJE(invoice: InvoiceSnap, userId: number, log?: any): Promise<void> {
  const { id, companyId, invNumber, customerName, issueDate } = invoice;

  if (!(await isSingapore(companyId))) return;

  // Idempotency: skip if a JE was already posted for this invoice
  const [existing] = await db.select({ id: journalEntriesTable.id })
    .from(journalEntriesTable)
    .where(and(
      eq(journalEntriesTable.companyId, companyId),
      eq(journalEntriesTable.refType, "invoice"),
      eq(journalEntriesTable.refId, id),
    ))
    .limit(1);
  if (existing) return;

  // Ensure Chart of Accounts is seeded
  await ensureAccountsSeeded(companyId);

  const [arAcct, revenueAcct, gstAcct] = await Promise.all([
    getAccountByCode(companyId, "1100"), // Trade Debtors / AR
    getAccountByCode(companyId, "4000"), // Sales Revenue
    getAccountByCode(companyId, "2010"), // GST Output Tax Payable
  ]);

  if (!arAcct || !revenueAcct) {
    if (log) log.error({ companyId, invNumber }, "invoice-auto-post: required accounts (1100 / 4000) not found");
    return;
  }

  const totalAmt   = parseFloat(invoice.totalAmount)    || 0;
  const subtotalAmt= parseFloat(invoice.subtotal)        || 0;
  const discAmt    = parseFloat(invoice.discountAmount)  || 0;
  const taxableAmt = parseFloat((subtotalAmt - discAmt).toFixed(2));
  const gstAmt     = parseFloat(invoice.tax)             || 0; // already in dollars

  const entryDate = (issueDate || new Date().toISOString().split("T")[0]);
  const desc = `Invoice ${invNumber} — ${customerName}`;

  const lines: Array<{ accountId: number; description: string; debit: string; credit: string }> = [];

  // DR: Trade Debtors — full receivable (incl. GST)
  lines.push({ accountId: arAcct.id, description: desc, debit: totalAmt.toFixed(2), credit: "0.00" });

  if (gstAmt > 0.004 && gstAcct) {
    // CR: Sales Revenue (taxable amount ex-GST) — IRAS Box 1 supply value
    lines.push({ accountId: revenueAcct.id, description: `Sales — ${invNumber}`, debit: "0.00", credit: taxableAmt.toFixed(2) });
    // CR: GST Output Tax Payable — IRAS Box 6 output tax
    lines.push({ accountId: gstAcct.id,     description: `GST Output Tax (9%) — ${invNumber}`, debit: "0.00", credit: gstAmt.toFixed(2) });
  } else {
    // Zero-rated / no GST: full amount credited to revenue
    lines.push({ accountId: revenueAcct.id, description: `Sales — ${invNumber}`, debit: "0.00", credit: totalAmt.toFixed(2) });
  }

  try {
    const [entry] = await db.insert(journalEntriesTable).values({
      companyId,
      entryDate,
      description: desc,
      refType: "invoice",
      refId: id,
      refNumber: invNumber,
      status: "posted",
      createdBy: userId,
    }).returning();

    await db.insert(journalLinesTable).values(
      lines.map(l => ({
        journalEntryId: entry.id,
        accountId: l.accountId,
        description: l.description,
        debit: l.debit,
        credit: l.credit,
      }))
    );
  } catch (err) {
    if (log) log.error({ err, invNumber }, "invoice-auto-post: DB insert failed (non-fatal)");
  }
}

/**
 * Called when a confirmed invoice is voided.
 * Creates a reversing journal entry and marks the original as reversed.
 * Safe to call multiple times — idempotent.
 */
export async function reverseInvoiceJE(
  invoice: Pick<InvoiceSnap, "id" | "companyId" | "invNumber" | "customerName">,
  userId: number,
  log?: any,
): Promise<void> {
  const { id, companyId, invNumber, customerName } = invoice;

  if (!(await isSingapore(companyId))) return;

  // Find the original posted JE
  const [original] = await db.select()
    .from(journalEntriesTable)
    .where(and(
      eq(journalEntriesTable.companyId, companyId),
      eq(journalEntriesTable.refType, "invoice"),
      eq(journalEntriesTable.refId, id),
    ))
    .limit(1);

  // Nothing to reverse if no JE was ever posted (e.g. voiding a draft)
  if (!original || original.status === "reversed") return;

  // Idempotency: skip if a reversal already exists
  const [existingReversal] = await db.select({ id: journalEntriesTable.id })
    .from(journalEntriesTable)
    .where(eq(journalEntriesTable.reversalOfId, original.id))
    .limit(1);
  if (existingReversal) return;

  const originalLines = await db.select()
    .from(journalLinesTable)
    .where(eq(journalLinesTable.journalEntryId, original.id));

  const today = new Date().toISOString().split("T")[0];

  try {
    const [reversal] = await db.insert(journalEntriesTable).values({
      companyId,
      entryDate: today,
      description: `VOID — Invoice ${invNumber} — ${customerName}`,
      refType: "invoice",
      refId: id,
      refNumber: invNumber,
      status: "posted",
      reversalOfId: original.id,
      createdBy: userId,
    }).returning();

    await db.insert(journalLinesTable).values(
      originalLines.map(l => ({
        journalEntryId: reversal.id,
        accountId: l.accountId,
        description: `REVERSAL: ${l.description ?? ""}`,
        debit: l.credit,  // flip debit ↔ credit
        credit: l.debit,
      }))
    );

    // Mark original as reversed
    await db.update(journalEntriesTable)
      .set({ status: "reversed" })
      .where(eq(journalEntriesTable.id, original.id));
  } catch (err) {
    if (log) log.error({ err, invNumber }, "invoice-auto-post: reversal failed (non-fatal)");
  }
}
