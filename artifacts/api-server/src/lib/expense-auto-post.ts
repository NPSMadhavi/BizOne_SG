/**
 * expense-auto-post.ts
 *
 * Cash-basis journal entries for the Expenses module.
 *
 * ON EXPENSE CONFIRMED:
 *   DR <category expense account>     = net amount  → expense recognised
 *   DR 1110 GST Input Tax Recoverable = gstAmount   → only if gstClaimable & gstAmount > 0
 *   CR 1010 Cash at Bank - SGD        = total paid  → cash / bank paid out
 *
 * ON EXPENSE DELETED (if was confirmed) → reverse the JE
 *
 * backfillExpenseJEs() → idempotent catch-up for confirmed expenses missing a JE.
 */

import { db, accountsTable, journalEntriesTable, journalLinesTable, expensesTable } from "@workspace/db";
import { eq, and, isNull } from "drizzle-orm";
import { ensureAccountsSeeded } from "./accounts-seed.js";

// Expense category → GL account code (from the default chart of accounts)
const CATEGORY_ACCOUNT: Record<string, string> = {
  staff_costs:              "6000", // Salaries and Wages
  rental:                   "6100", // Rent and Utilities
  utilities:                "6110", // Electricity and Water
  office_supplies:          "6200", // Office Supplies
  professional_fees:        "6400", // Professional Fees
  advertising:              "6500", // Marketing and Advertising
  travel:                   "6600", // Travel and Entertainment
  entertainment:            "6600", // Travel and Entertainment
  bank_charges:             "6800", // Bank Charges and Fees
  insurance:                "6900", // Insurance
  motor_vehicle_private:    "7200", // Miscellaneous Expenses
  motor_vehicle_commercial: "7200", // Miscellaneous Expenses
  training:                 "6020", // Employee Benefits
  other:                    "7200", // Miscellaneous Expenses
};

async function getAccountByCode(companyId: number, code: string) {
  const [acct] = await db.select()
    .from(accountsTable)
    .where(and(eq(accountsTable.companyId, companyId), eq(accountsTable.code, code)))
    .limit(1);
  return acct ?? null;
}

// ── Expense Confirmed ─────────────────────────────────────────────────────────

export async function postExpenseJE(
  expense: {
    id: number;
    companyId: number;
    expenseDate: string;
    vendorName: string;
    description: string;
    category: string;
    amount: string | number;
    gstAmount: string | number;
    gstClaimable: boolean;
  },
  userId: number,
  log?: any,
): Promise<number | null> {
  await ensureAccountsSeeded(expense.companyId);

  // Idempotency: skip if a JE already exists for this expense
  const [existing] = await db.select({ id: journalEntriesTable.id })
    .from(journalEntriesTable)
    .where(and(
      eq(journalEntriesTable.companyId, expense.companyId),
      eq(journalEntriesTable.refType,   "expense"),
      eq(journalEntriesTable.refId,     expense.id),
    ))
    .limit(1);
  if (existing) return existing.id;

  const netAmount = parseFloat(String(expense.amount));
  const gstAmount = parseFloat(String(expense.gstAmount ?? "0"));
  const claimGst  = expense.gstClaimable && gstAmount > 0.001;
  const totalPaid = claimGst ? netAmount + gstAmount : netAmount;

  const expenseCode = CATEGORY_ACCOUNT[expense.category] ?? "7200";
  const [bankAcct, expAcct, inputTaxAcct] = await Promise.all([
    getAccountByCode(expense.companyId, "1010"),
    getAccountByCode(expense.companyId, expenseCode),
    claimGst ? getAccountByCode(expense.companyId, "1110") : Promise.resolve(null),
  ]);

  if (!bankAcct || !expAcct) {
    if (log) log.warn({ companyId: expense.companyId, expenseId: expense.id }, "expense-auto-post: bank or expense account not found");
    return null;
  }

  const desc = `Expense — ${expense.vendorName} — ${expense.description}`;

  try {
    const [entry] = await db.insert(journalEntriesTable).values({
      companyId:   expense.companyId,
      entryDate:   expense.expenseDate,
      description: desc,
      refType:     "expense",
      refId:       expense.id,
      refNumber:   `EXP-${expense.id}`,
      status:      "posted",
      createdBy:   userId,
    }).returning();

    if (claimGst && inputTaxAcct) {
      // Split: DR Expense (net) + DR Input Tax (GST) + CR Bank (total)
      await db.insert(journalLinesTable).values([
        { journalEntryId: entry.id, accountId: expAcct.id,      description: desc, debit: netAmount.toFixed(2), credit: "0.00"            },
        { journalEntryId: entry.id, accountId: inputTaxAcct.id, description: desc, debit: gstAmount.toFixed(2), credit: "0.00"            },
        { journalEntryId: entry.id, accountId: bankAcct.id,     description: desc, debit: "0.00",               credit: totalPaid.toFixed(2) },
      ]);
    } else {
      await db.insert(journalLinesTable).values([
        { journalEntryId: entry.id, accountId: expAcct.id,  description: desc, debit: netAmount.toFixed(2), credit: "0.00"            },
        { journalEntryId: entry.id, accountId: bankAcct.id, description: desc, debit: "0.00",               credit: netAmount.toFixed(2) },
      ]);
    }

    // Write journalEntryId back so the expense record knows its JE
    await db.update(expensesTable)
      .set({ journalEntryId: entry.id, updatedAt: new Date() })
      .where(eq(expensesTable.id, expense.id));

    return entry.id;
  } catch (err) {
    if (log) log.error({ err, expenseId: expense.id }, "expense-auto-post: JE insert failed (non-fatal)");
    return null;
  }
}

// ── Expense Deleted (was confirmed) ──────────────────────────────────────────

export async function reverseExpenseJE(
  expenseId: number,
  companyId: number,
  vendorName: string,
  userId: number,
  log?: any,
): Promise<void> {
  const [original] = await db.select()
    .from(journalEntriesTable)
    .where(and(
      eq(journalEntriesTable.companyId, companyId),
      eq(journalEntriesTable.refType,   "expense"),
      eq(journalEntriesTable.refId,     expenseId),
    ))
    .limit(1);

  if (!original || original.status === "reversed") return;

  // Guard against double-reversal
  const [alreadyReversed] = await db.select({ id: journalEntriesTable.id })
    .from(journalEntriesTable)
    .where(eq(journalEntriesTable.reversalOfId, original.id))
    .limit(1);
  if (alreadyReversed) return;

  const originalLines = await db.select()
    .from(journalLinesTable)
    .where(eq(journalLinesTable.journalEntryId, original.id));

  try {
    const [reversal] = await db.insert(journalEntriesTable).values({
      companyId,
      entryDate:    new Date().toISOString().split("T")[0],
      description:  `VOID — Expense — ${vendorName}`,
      refType:      "expense",
      refId:        expenseId,
      refNumber:    `EXP-${expenseId}`,
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
    if (log) log.error({ err, expenseId }, "expense-auto-post: reversal failed (non-fatal)");
  }
}

// ── Backfill: post JEs for confirmed expenses that don't have one yet ─────────

export async function backfillExpenseJEs(
  companyId: number,
  fallbackUserId: number,
  log?: any,
): Promise<number> {
  const pending = await db.select()
    .from(expensesTable)
    .where(and(
      eq(expensesTable.companyId, companyId),
      eq(expensesTable.status, "confirmed"),
      isNull(expensesTable.journalEntryId),
    ));

  let posted = 0;
  for (const exp of pending) {
    const jeId = await postExpenseJE(exp, fallbackUserId, log);
    if (jeId) posted++;
  }

  if (posted > 0 && log) {
    log.info({ companyId, posted }, "expense-auto-post: backfilled JEs for confirmed expenses");
  }
  return posted;
}
