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

import { db, pool, accountsTable, journalEntriesTable, journalLinesTable } from "@workspace/db";
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

const MONTH_MAP: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

export function toIsoDate(val: unknown, fallbackYear = 2026): string {
  if (!val) return new Date().toISOString().slice(0, 10);
  if (val instanceof Date && !isNaN(val.getTime())) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, "0");
    const d = String(val.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof val === "string") {
    const s = val.trim();
    const mIso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (mIso) return `${mIso[1]}-${mIso[2]}-${mIso[3]}`;
    const mDmy = s.match(/^(\d{2})[-/](\d{2})[-/](\d{4})/);
    if (mDmy) return `${mDmy[3]}-${mDmy[2]}-${mDmy[1]}`;
    const mNamed = s.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})(?:[^\d]+(\d{4}))?/i);
    if (mNamed) {
      const mon = MONTH_MAP[mNamed[1].toLowerCase().slice(0, 3)] || "01";
      const day = mNamed[2].padStart(2, "0");
      const yr = mNamed[3] || fallbackYear;
      return `${yr}-${mon}-${day}`;
    }
  }
  return new Date().toISOString().slice(0, 10);
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
  await ensureAccountsSeeded(payroll.companyId);

  const startStr = toIsoDate(payroll.payPeriodStart);
  const endStr = toIsoDate(payroll.payPeriodEnd);
  const entryDate = endStr;
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

  let expAcct =
    payroll.expenseAccountId && Number(payroll.expenseAccountId) > 0
      ? await getAccountById(Number(payroll.expenseAccountId))
      : null;
  if (!expAcct) {
    expAcct =
      (await getAccountByCode(payroll.companyId, "6000")) ??
      (await getAccountByCode(payroll.companyId, "6020"));
  }

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

  const desc = `Payroll — ${payroll.employeeName || "Employee"} — ${startStr} to ${endStr}`;
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

// ── Backfill: post JEs for processed payroll records that don't have one yet ───

export async function backfillPayrollJEs(
  companyId: number,
  fallbackUserId: number,
  log?: any,
): Promise<number> {
  await ensureAccountsSeeded(companyId);

  const result = await pool.query(
    `SELECT pr.*, e.name as employee_name
     FROM payroll_records pr
     LEFT JOIN employees e ON e.id = pr.employee_id
     WHERE pr.company_id = $1
       AND NOT EXISTS (
         SELECT 1 FROM journal_entries je
         WHERE je.company_id = pr.company_id
           AND je.ref_type = 'payroll'
           AND je.ref_id = pr.id
           AND je.status = 'posted'
       )`,
    [companyId],
  ).catch(() => ({ rows: [] }));

  let posted = 0;
  for (const row of result.rows) {
    try {
      await postPayrollCreatedJE({
        id: row.id,
        companyId,
        employeeId: row.employee_id,
        employeeName: row.employee_name || "Employee",
        payPeriodStart: toIsoDate(row.pay_period_start),
        payPeriodEnd: toIsoDate(row.pay_period_end),
        grossPay: row.gross_pay,
        netPay: row.net_pay,
        cpfEmployee: row.cpf_employee,
        cpfEmployer: row.cpf_employer,
        expenseAccountId: row.expense_account_id ? Number(row.expense_account_id) : null,
      }, fallbackUserId, log);
      posted++;
    } catch (e) {
      if (log) log.warn({ err: e, recordId: row.id }, "backfillPayrollJEs: failed to post JE");
    }
  }

  if (posted > 0 && log) {
    log.info({ companyId, posted }, "payroll-auto-post: backfilled JEs for payroll records");
  }
  return posted;
}


