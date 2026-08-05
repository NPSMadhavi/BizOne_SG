import dayjs from "dayjs";
import { and, desc, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { employeePayroll, employees, payrollRecords } from "@shared/schema";
import {
  calculateProcessPayroll,
  calculateAgeFromDob,
  mapEmployeeResidency,
} from "@shared/singapore-payroll";

export type PayrollProcessAction = "created" | "updated" | "skipped";

export function parseForceOverwriteFlag(value: unknown): boolean {
  if (value === true || value === 1) return true;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "true" || normalized === "1" || normalized === "yes";
  }
  return false;
}

export interface PayrollProcessResult {
  action: PayrollProcessAction;
  record?: typeof payrollRecords.$inferSelect;
  reason?: string;
}

export interface BatchPayrollSummary {
  totalEmployees: number;
  processedNew: number;
  updated: number;
  skipped: number;
  failures: { employeeName: string; message: string }[];
}

export function getPayPeriodForMonth(year: number, month: number) {
  const payPeriodStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const payPeriodEnd = dayjs(payPeriodStart).endOf("month").format("YYYY-MM-DD");
  return { payPeriodStart, payPeriodEnd, year, month };
}

export function formatPayrollMonthLabel(year: number, month: number) {
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return `${monthNames[month - 1]} ${year}`;
}

export function normalizePayPeriodDate(value: string | Date | null | undefined): string {
  if (value == null || value === "") return "";
  if (typeof value === "string") {
    const iso = value.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return String(value).slice(0, 10);
}

export function derivePayrollMonthYear(payPeriodStart: string | Date | null | undefined) {
  const normalized = normalizePayPeriodDate(payPeriodStart);
  const [yearStr, monthStr] = normalized.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  return {
    year: Number.isFinite(year) ? year : 0,
    month: Number.isFinite(month) ? month : 0,
    monthLabel:
      Number.isFinite(month) && Number.isFinite(year)
        ? formatPayrollMonthLabel(year, month)
        : "",
  };
}

export function getBatchZipNameFromPeriod(payPeriodStart: string) {
  const { monthLabel } = derivePayrollMonthYear(payPeriodStart);
  return `Payslips_${monthLabel.replace(" ", "_")}.zip`;
}

export function resolvePayrollMonthYearFromRecord(record: {
  payrollMonth?: number | null;
  payrollYear?: number | null;
  payPeriodStart: string | Date | null | undefined;
}) {
  if (record.payrollMonth && record.payrollYear) {
    return {
      year: record.payrollYear,
      month: record.payrollMonth,
      monthLabel: formatPayrollMonthLabel(record.payrollYear, record.payrollMonth),
    };
  }
  return derivePayrollMonthYear(record.payPeriodStart);
}

function normalizePayrollComponentMap(value: unknown): string {
  const obj = (
    value && typeof value === "object" && !Array.isArray(value) ? value : {}
  ) as Record<string, unknown>;
  const entries = Object.entries(obj)
    .map(([key, val]) => [key, Number(val) || 0] as const)
    .filter(([, num]) => num !== 0)
    .sort(([a], [b]) => a.localeCompare(b));

  return JSON.stringify(Object.fromEntries(entries));
}

function calculatePayrollAmounts(params: {
  baseSalary: number;
  overtimeHours: number;
  overtimeRate: number;
  allowances: Record<string, number>;
  deductions: Record<string, number>;
  age: number;
  nationality?: string | null;
  prStatus?: string | null;
}) {
  const allowancesTotal = Object.values(params.allowances || {}).reduce(
    (sum, v) => sum + (Number(v) || 0),
    0
  );
  const deductionsTotal = Object.values(params.deductions || {}).reduce(
    (sum, v) => sum + (Number(v) || 0),
    0
  );
  const overtimePay = params.overtimeHours * params.overtimeRate;
  const { residencyType, prYear } = mapEmployeeResidency({
    nationality: params.nationality,
    prStatus: params.prStatus,
  });

  const calc = calculateProcessPayroll({
    monthlySalary: params.baseSalary,
    age: params.age,
    residencyType,
    prYear,
    monthlyAllowances: allowancesTotal,
    monthlyDeductions: deductionsTotal,
    overtimePay,
  });

  return {
    grossPay: calc.grossSalary,
    employeeCpf: calc.monthlyEmployeeCpf,
    employerCpf: calc.monthlyEmployerCpf,
    netPay: calc.netSalary,
    overtimePay: calc.overtimePay,
    allowancesTotal: calc.allowancesTotal,
    deductionsTotal: calc.deductionsTotal,
    employeeCpfRate: calc.employeeCpfRate,
    employerCpfRate: calc.employerCpfRate,
  };
}

export async function findPayrollRecordForPeriod(
  tenantDb: NodePgDatabase,
  employeeId: number,
  payPeriodStart: string,
  payPeriodEnd: string
) {
  const start = normalizePayPeriodDate(payPeriodStart);
  const end = normalizePayPeriodDate(payPeriodEnd);
  const { year, month } = derivePayrollMonthYear(start);

  const [record] = await tenantDb
    .select()
    .from(payrollRecords)
    .where(
      and(
        eq(payrollRecords.employeeId, employeeId),
        sql`(
          (${payrollRecords.payrollMonth} = ${month} AND ${payrollRecords.payrollYear} = ${year})
          OR (
            (${payrollRecords.payrollYear} IS NULL OR ${payrollRecords.payrollMonth} IS NULL)
            AND EXTRACT(YEAR FROM ${payrollRecords.payPeriodStart}::date) = ${year}
            AND EXTRACT(MONTH FROM ${payrollRecords.payPeriodStart}::date) = ${month}
          )
        )`
      )
    )
    .orderBy(desc(payrollRecords.updatedAt), desc(payrollRecords.createdAt))
    .limit(1);

  if (record) return record;

  const [overlapRecord] = await tenantDb
    .select()
    .from(payrollRecords)
    .where(
      and(
        eq(payrollRecords.employeeId, employeeId),
        sql`${payrollRecords.payPeriodStart}::date <= ${end}::date`,
        sql`${payrollRecords.payPeriodEnd}::date >= ${start}::date`
      )
    )
    .orderBy(desc(payrollRecords.updatedAt), desc(payrollRecords.createdAt))
    .limit(1);

  return overlapRecord;
}

export function hasPayrollConfigChanged(
  config: typeof employeePayroll.$inferSelect,
  record: typeof payrollRecords.$inferSelect,
  requestedOvertimeHours = 0
) {
  if (Number(record.payrollConfigId) !== Number(config.id)) return true;
  if (Number(record.baseSalary) !== Number(config.baseSalary)) return true;
  if (
    normalizePayrollComponentMap(record.allowances) !==
    normalizePayrollComponentMap(config.allowances)
  ) {
    return true;
  }
  if (
    normalizePayrollComponentMap(record.deductions) !==
    normalizePayrollComponentMap(config.deductions)
  ) {
    return true;
  }
  if (Number(requestedOvertimeHours) !== Number(record.overtimeHours ?? 0)) return true;
  if (config.updatedAt && record.updatedAt) {
    return new Date(config.updatedAt).getTime() > new Date(record.updatedAt).getTime();
  }
  return false;
}

export function buildPayrollRecordPayload(
  config: typeof employeePayroll.$inferSelect,
  employee: typeof employees.$inferSelect,
  payPeriodStart: string,
  payPeriodEnd: string,
  userId: number,
  tenantId: number,
  tenantSlug: string,
  notes = "",
  overtimeHours = 0
) {
  const age = calculateAgeFromDob(employee.dateOfBirth);
  const allowances = (config.allowances as Record<string, number>) || {};
  const deductions = (config.deductions as Record<string, number>) || {};
  const overtimeRate = Number(config.overtimeRate) || 0;
  const baseSalary = Number(config.baseSalary) || 0;

  const amounts = calculatePayrollAmounts({
    baseSalary,
    overtimeHours: Number(overtimeHours) || 0,
    overtimeRate,
    allowances,
    deductions,
    age,
    nationality: employee.nationality,
    prStatus: employee.prStatus,
  });

  const normalizedStart = normalizePayPeriodDate(payPeriodStart);
  const normalizedEnd = normalizePayPeriodDate(payPeriodEnd);
  const { month: payrollMonth, year: payrollYear } = derivePayrollMonthYear(normalizedStart);

  return {
    tenantId,
    tenantSlug,
    employeeId: employee.id,
    payrollConfigId: config.id,
    payPeriodStart: normalizedStart,
    payPeriodEnd: normalizedEnd,
    payrollMonth,
    payrollYear,
    baseSalary: String(baseSalary),
    overtimeHours: String(overtimeHours || 0),
    overtimePay: String(amounts.overtimePay),
    allowances,
    deductions,
    grossPay: String(amounts.grossPay),
    taxDeduction: "0.00",
    cpfDeduction: String(amounts.employeeCpf),
    netPay: String(amounts.netPay),
    status: "pending" as const,
    notes,
    createdBy: userId,
    employerCpfAmount: String(amounts.employerCpf),
  };
}

export async function upsertPayrollRecord(
  tenantDb: NodePgDatabase,
  config: typeof employeePayroll.$inferSelect,
  employee: typeof employees.$inferSelect,
  payPeriodStart: string,
  payPeriodEnd: string,
  userId: number,
  tenantId: number,
  tenantSlug: string,
  options: {
    notes?: string;
    overtimeHours?: number;
    allowReprocess?: boolean;
    forceUpdate?: boolean;
    requireForceForReprocess?: boolean;
  } = {}
): Promise<PayrollProcessResult> {
  const existing = await findPayrollRecordForPeriod(
    tenantDb,
    employee.id,
    normalizePayPeriodDate(payPeriodStart),
    normalizePayPeriodDate(payPeriodEnd)
  );

  const payload = buildPayrollRecordPayload(
    config,
    employee,
    normalizePayPeriodDate(payPeriodStart),
    normalizePayPeriodDate(payPeriodEnd),
    userId,
    tenantId,
    tenantSlug,
    options.notes ?? "",
    options.overtimeHours ?? 0
  );

  const { employerCpfAmount: _employerCpf, ...insertPayload } = payload;

  if (!existing) {
    const [record] = await tenantDb.insert(payrollRecords).values(insertPayload).returning();
    return { action: "created", record };
  }

  const forceUpdate = parseForceOverwriteFlag(options.forceUpdate);
  const configChanged = hasPayrollConfigChanged(config, existing, options.overtimeHours ?? 0);

  if (!forceUpdate) {
    if (!configChanged) {
      return { action: "skipped", record: existing, reason: "already_processed" };
    }
    if (options.requireForceForReprocess) {
      return { action: "skipped", record: existing, reason: "data_changed" };
    }
    if (!options.allowReprocess) {
      return { action: "skipped", record: existing, reason: "already_processed" };
    }
  }

  const { createdBy, tenantSlug: _slug, ...updateFields } = insertPayload;

  const [record] = await tenantDb
    .update(payrollRecords)
    .set({ ...updateFields, updatedAt: new Date() })
    .where(eq(payrollRecords.id, existing.id))
    .returning();

  return { action: "updated", record };
}

export function computeEmployerCpfForRecord(
  record: typeof payrollRecords.$inferSelect,
  employee: typeof employees.$inferSelect,
  config: typeof employeePayroll.$inferSelect
): number {
  const storedAmount = Number(config.employerCpfAmount);
  if (Number.isFinite(storedAmount) && storedAmount >= 0) {
    return storedAmount;
  }

  const age = calculateAgeFromDob(employee.dateOfBirth);
  const amounts = calculatePayrollAmounts({
    baseSalary: Number(record.baseSalary),
    overtimeHours: Number(record.overtimeHours) || 0,
    overtimeRate: Number(config.overtimeRate) || 0,
    allowances: (record.allowances as Record<string, number>) || {},
    deductions: (record.deductions as Record<string, number>) || {},
    age,
    nationality: employee.nationality,
    prStatus: employee.prStatus,
  });
  return amounts.employerCpf;
}
