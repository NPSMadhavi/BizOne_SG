/**
 * invoice-payment-je.ts
 *
 * Journal entries for AR (customer invoice) payment recording.
 *
 * ON PAYMENT RECEIVED:
 *   DR 1010 Cash at Bank - SGD   = paymentAmount → cash received
 *   CR 1100 Accounts Receivable  = paymentAmount → AR settled
 *
 * ON PAYMENT DELETED → reverse the payment JE
 *
 * Only posts for Singapore companies (same rule as invoice-auto-post).
 */

import { db, accountsTable, journalEntriesTable, journalLinesTable, companiesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { ensureAccountsSeeded } from "./accounts-seed.js";
import { isSingaporeCountry } from "./singapore.js";

async function isSingapore(companyId: number): Promise<boolean> {
  const [co] = await db.select({ country: companiesTable.country })
    .from(companiesTable)
    .where(eq(companiesTable.id, companyId))
    .limit(1);
  return isSingaporeCountry(co?.country);
}

async function getAccountByCode(companyId: number, code: string) {
  const [acct] = await db.select()
    .from(accountsTable)
    .where(and(eq(accountsTable.companyId, companyId), eq(accountsTable.code, code)))
    .limit(1);
  return acct ?? null;
}

export async function postARPaymentJE(
  payment: {
    id: number;
    invoiceId: number;
    companyId: number;
    paymentDate: string;
    amount: number | string;
    reference?: string | null;
  },
  invNumber: string,
  customerName: string,
  userId: number,
  log?: any,
): Promise<void> {
  if (!(await isSingapore(payment.companyId))) return;

  await ensureAccountsSeeded(payment.companyId);

  const [existing] = await db.select({ id: journalEntriesTable.id })
    .from(journalEntriesTable)
    .where(and(
      eq(journalEntriesTable.companyId, payment.companyId),
      eq(journalEntriesTable.refType, "invoice_payment"),
      eq(journalEntriesTable.refId, payment.id),
    ))
    .limit(1);
  if (existing) return;

  const [bankAcct, arAcct] = await Promise.all([
    getAccountByCode(payment.companyId, "1010"),
    getAccountByCode(payment.companyId, "1100"),
  ]);
  if (!bankAcct || !arAcct) {
    if (log) log.warn({ companyId: payment.companyId }, "invoice-payment-je: bank (1010) or AR (1100) account not found");
    return;
  }

  const amount = parseFloat(String(payment.amount)).toFixed(2);
  const ref    = payment.reference ? ` (Ref: ${payment.reference})` : "";
  const desc   = `Payment received — Invoice ${invNumber} — ${customerName}${ref}`;

  try {
    const [entry] = await db.insert(journalEntriesTable).values({
      companyId:   payment.companyId,
      entryDate:   payment.paymentDate,
      description: desc,
      refType:     "invoice_payment",
      refId:       payment.id,
      refNumber:   invNumber,
      status:      "posted",
      createdBy:   userId,
    }).returning();

    await db.insert(journalLinesTable).values([
      { journalEntryId: entry.id, accountId: bankAcct.id, description: desc, debit: amount,  credit: "0.00" },
      { journalEntryId: entry.id, accountId: arAcct.id,   description: desc, debit: "0.00", credit: amount  },
    ]);
  } catch (err) {
    if (log) log.error({ err, invNumber }, "invoice-payment-je: JE insert failed (non-fatal)");
  }
}

export async function reverseARPaymentJE(
  paymentId: number,
  companyId: number,
  invNumber: string,
  customerName: string,
  userId: number,
  log?: any,
): Promise<void> {
  const [original] = await db.select()
    .from(journalEntriesTable)
    .where(and(
      eq(journalEntriesTable.companyId, companyId),
      eq(journalEntriesTable.refType, "invoice_payment"),
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

  const today = new Date().toISOString().split("T")[0];

  try {
    const [reversal] = await db.insert(journalEntriesTable).values({
      companyId,
      entryDate:   today,
      description: `REVERSAL — Payment — Invoice ${invNumber} — ${customerName}`,
      refType:     "invoice_payment",
      refId:       paymentId,
      refNumber:   invNumber,
      status:      "posted",
      reversalOfId: original.id,
      createdBy:   userId,
    }).returning();

    await db.insert(journalLinesTable).values(
      originalLines.map(l => ({
        journalEntryId: reversal.id,
        accountId: l.accountId,
        description: `REVERSAL: ${l.description ?? ""}`,
        debit: l.credit,
        credit: l.debit,
      }))
    );

    await db.update(journalEntriesTable)
      .set({ status: "reversed" })
      .where(eq(journalEntriesTable.id, original.id));
  } catch (err) {
    if (log) log.error({ err, invNumber }, "invoice-payment-je: reversal failed (non-fatal)");
  }
}
