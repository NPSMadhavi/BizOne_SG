/**
 * payroll-auto-post.ts
 *
 * Accrual-basis journal entries for Singapore Payroll.
 *
 * ON PAYROLL PROCESSED (when expenseAccountId is set):
 *   DR <expenseAccount> (e.g. 6000 Salaries and Wages) = gross pay
 *   DR 6010 CPF Contributions (Employer)               = employer CPF
 *   CR 2040 Staff Salaries Payable                     = net pay due to employee
 *   CR 2050 CPF Contributions Payable                  = total CPF (employee + employer)
 *
 * ON PAYROLL OVERWRITTEN / REPROCESSED / DELETED:
 *   Reverse the original payroll JE to keep the General Ledger & Balance Sheet clean.
 */

import { db, accountsTable, journalEntriesTable, journalLinesTable } from "@workspace/db";
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

export async function postPayrollCreatedJE(
  payroll: {
    id: number;
    companyId: number;
    employeeId: number;
    employeeName: string;
    payPeriodStart: string;
    payPeriodEnd: string;
    grossPay: number | string;
    netPay: number | string;
    cpfEmployee?: number | string;
    cpfEmployer?: number | string;
    expenseAccountId?: number | null;
  },
  userId: number,
  log?: any,
): Promise<void> {
  if (!payroll.expenseAccountId || Number(payroll.expenseAccountId) <= 0) {
    return;
  }

  await ensureAccountsSeeded(payroll.companyId);

  const entryDate = payroll.payPeriodEnd || new Date().toISOString().split("T")[0];
  const periodCheck = await assertPeriodWritable(payroll.companyId, entryDate);
  if (!periodCheck.ok) throw new Error(periodCheck.error);

  // If a JE already exists for this payroll record, reverse or skip
  const [existing] = await db.select({ id: journalEntriesTable.id })
    .from(journalEntriesTable)
    .where(and(
      eq(journalEntriesTable.companyId, payroll.companyId),
      eq(journalEntriesTable.refType, "payroll"),
      eq(journalEntriesTable.refId, payroll.id),
      eq(journalEntriesTable.status, "posted"),
    ))
    .limit(1);

  if (existing) {
    // Already posted for this payroll record
    return;
  }

  const expAcct = await getAccountById(Number(payroll.expenseAccountId));
  if (!expAcct) {
    if (log) log.warn({ companyId: payroll.companyId, payrollId: payroll.id }, "payroll-auto-post: expense account not found");
    return;
  }

  const salariesPayableAcct =
    (await getAccountByCode(payroll.companyId, "2040")) ??
    (await getAccountByCode(payroll.companyId, "2000"));

  if (!salariesPayableAcct) {
    if (log) log.warn({ companyId: payroll.companyId }, "payroll-auto-post: Staff Salaries Payable account not found");
    return;
  }

  const cpfPayableAcct = await getAccountByCode(payroll.companyId, "2050");
  const employerCpfAcct = await getAccountByCode(payroll.companyId, "6010");

  const gross = parseFloat(String(payroll.grossPay || 0));
  const net = parseFloat(String(payroll.netPay || 0));
  const cpfEmp = parseFloat(String(payroll.cpfEmployee || 0));
  const cpfEmpr = parseFloat(String(payroll.cpfEmployer || 0));
  const totalCpf = Math.round((cpfEmp + cpfEmpr) * 100) / 100;

  const desc = `Payroll — ${payroll.employeeName || "Employee"} — ${payroll.payPeriodStart} to ${payroll.payPeriodEnd}`;
  const refNumber = `PR-${payroll.id}`;

  try {
    const [entry] = await db.insert(journalEntriesTable).values({
      companyId:   payroll.companyId,
      entryDate,
      description: desc,
      refType:     "payroll",
      refId:       payroll.id,
      refNumber,
      status:      "posted",
      createdBy:   userId,
    }).returning();

    const lines: Array<{
      journalEntryId: number;
      accountId: number;
      description: string;
      debit: string;
      credit: string;
    }> = [];

    // DR 1: Gross Salary to chosen expense account
    lines.push({
      journalEntryId: entry.id,
      accountId: expAcct.id,
      description: `${desc} (Gross Salary)`,
      debit: gross.toFixed(2),
      credit: "0.00",
    });

    let totalDebits = gross;

    // DR 2: Employer CPF if applicable
    if (cpfEmpr > 0.005) {
      const emprTargetAcct = employerCpfAcct ?? expAcct;
      lines.push({
        journalEntryId: entry.id,
        accountId: emprTargetAcct.id,
        description: `${desc} (Employer CPF)`,
        debit: cpfEmpr.toFixed(2),
        credit: "0.00",
      });
      totalDebits += cpfEmpr;
    }

    // CR 1: Total CPF to CPF Contributions Payable
    let totalCredits = 0;
    if (cpfPayableAcct && totalCpf > 0.005) {
      lines.push({
        journalEntryId: entry.id,
        accountId: cpfPayableAcct.id,
        description: `${desc} (Total CPF Payable)`,
        debit: "0.00",
        credit: totalCpf.toFixed(2),
      });
      totalCredits += totalCpf;
    }

    // CR 2: Net Pay to Staff Salaries Payable (and absorb any small rounding difference to ensure exact balance)
    const payableCredit = Math.round((totalDebits - totalCredits) * 100) / 100;
    lines.push({
      journalEntryId: entry.id,
      accountId: salariesPayableAcct.id,
      description: `${desc} (Net Salaries Payable)`,
      debit: "0.00",
      credit: payableCredit.toFixed(2),
    });

    await db.insert(journalLinesTable).values(lines);
  } catch (err) {
    if (log) log.error({ err, payrollId: payroll.id }, "payroll-auto-post: journal entry failed");
  }
}

export async function reversePayrollJE(
  payrollId: number,
  companyId: number,
  userId: number,
  log?: any,
): Promise<void> {
  const [original] = await db.select()
    .from(journalEntriesTable)
    .where(and(
      eq(journalEntriesTable.companyId, companyId),
      eq(journalEntriesTable.refType, "payroll"),
      eq(journalEntriesTable.refId, payrollId),
      eq(journalEntriesTable.status, "posted"),
    ))
    .limit(1);

  if (!original) return;

  const originalLines = await db.select()
    .from(journalLinesTable)
    .where(eq(journalLinesTable.journalEntryId, original.id));

  try {
    const [reversal] = await db.insert(journalEntriesTable).values({
      companyId,
      entryDate:   new Date().toISOString().split("T")[0],
      description: `REVERSAL — ${original.description}`,
      refType:     "payroll",
      refId:       payrollId,
      refNumber:   original.refNumber,
      status:      "posted",
      reversalOfId: original.id,
      createdBy:   userId,
    }).returning();

    if (originalLines.length > 0) {
      await db.insert(journalLinesTable).values(
        originalLines.map((l) => ({
          journalEntryId: reversal.id,
          accountId:      l.accountId,
          description:    `REVERSAL: ${l.description ?? ""}`,
          debit:          l.credit,
          credit:         l.debit,
        })),
      );
    }

    await db.update(journalEntriesTable)
      .set({ status: "reversed" })
      .where(eq(journalEntriesTable.id, original.id));
  } catch (err) {
    if (log) log.warn({ err, payrollId }, "payroll-auto-post: reversal failed (non-fatal)");
  }
}

