import { emptyEarningsSplit, splitEarnings, type EarningsSplit } from "@/operations-8june/lib/payroll-earnings";
import { recordPayrollMonthYear } from "@/operations-8june/lib/payroll-batch-utils";
import { mapEmployeeResidency } from "@/operations-8june/types/singapore-payroll";

export type Ir8aStatus = "Ready" | "Check" | "Pending" | "Submitted";

export type Ir8aEmployeeRow = {
  id: number;
  employeeId?: string | null;
  name?: string | null;
  designation?: string | null;
  department?: string | null;
  nricNumber?: string | null;
  salary?: string | number | null;
  annualSalary?: string | number | null;
  nationality?: string | null;
  prStatus?: string | null;
  dateOfBirth?: string | null;
  joinDate?: string | null;
  status?: string | null;
};

export type Ir8aPayrollRecord = {
  id: number;
  employeeId: number;
  payrollYear?: number | string | null;
  payPeriodStart?: string | null;
  baseSalary?: string | number | null;
  allowances?: unknown;
  overtimePay?: string | number | null;
  grossPay?: string | number | null;
  cpfDeduction?: string | number | null;
  cpfEmployer?: string | number | null;
  netPay?: string | number | null;
  payrollMonth?: string | number | null;
};

export type Ir8aPayrollConfigRow = {
  employeeId: number;
  isActive?: boolean | null;
  allowances?: unknown;
  baseSalary?: string | number | null;
};

export type Ir8aLine = {
  employee: Ir8aEmployeeRow;
  monthlySalary: number;
  grossSalary: number;
  bonus: number;
  allowances: number;
  directorsFees: number;
  fees: number;
  otherPayments: number;
  gross: number;
  benefitsInKind: number;
  shareOption: number;
  retirementBenefits: number;
  incomeTaxBorneByEmployee: number;
  employeeCpf: number;
  employerCpf: number;
  status: Ir8aStatus;
  checks: { label: string; ok: boolean }[];
};

export function num(value: unknown) {
  const n = parseFloat(String(value ?? 0));
  return Number.isFinite(n) ? n : 0;
}

export function money(value: number) {
  return value.toLocaleString("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function addSplit(left: EarningsSplit, right: EarningsSplit): EarningsSplit {
  const next = emptyEarningsSplit();
  for (const key of Object.keys(next) as (keyof EarningsSplit)[]) {
    next[key] = left[key] + right[key];
  }
  return next;
}

function monthPayrollAmount(record: Ir8aPayrollRecord) {
  const earnings = splitEarnings(record.allowances);
  const overtime = num(record.overtimePay) > 0 ? num(record.overtimePay) : earnings.overtime;
  const classified =
    earnings.allowances +
    earnings.bonus +
    earnings.directorsFees +
    earnings.fees +
    earnings.otherPayments +
    earnings.benefitsInKind +
    earnings.shareOption +
    earnings.retirementBenefits +
    earnings.incomeTaxBorneByEmployee +
    earnings.genericOtherIncome +
    overtime;
  const basic = num(record.baseSalary);
  const grossPay = num(record.grossPay);
  if (basic > 0) return { basic, overtime, earnings };
  if (grossPay > 0 && classified > 0 && grossPay + 0.009 >= classified) {
    return { basic: Math.max(0, grossPay - classified), overtime, earnings };
  }
  return { basic: grossPay, overtime: 0, earnings: emptyEarningsSplit() };
}

export function buildIr8aLine(
  employee: Ir8aEmployeeRow,
  records: Ir8aPayrollRecord[],
  _config: Ir8aPayrollConfigRow | undefined,
  year: number,
  submitted: boolean,
): Ir8aLine {
  const byMonth = new Map<string, Ir8aPayrollRecord>();
  for (const record of records) {
    if (Number(record.employeeId) !== Number(employee.id)) continue;
    const period = recordPayrollMonthYear(record);
    if (period.year !== year || period.month < 1 || period.month > 12) continue;
    const key = `${period.year}-${period.month}`;
    const current = byMonth.get(key);
    if (!current || Number(record.id) >= Number(current.id)) byMonth.set(key, record);
  }
  const months = [...byMonth.values()];
  const { residencyType } = mapEmployeeResidency({
    nationality: employee.nationality,
    prStatus: employee.prStatus,
  });

  let grossSalary = 0;
  let components = emptyEarningsSplit();
  let employeeCpf = 0;
  let employerCpf = 0;
  for (const record of months) {
    const month = monthPayrollAmount(record);
    grossSalary += month.basic + month.overtime;
    components = addSplit(components, month.earnings);
    employeeCpf += num(record.cpfDeduction);
    employerCpf += num(record.cpfEmployer);
  }
  const monthlySalary = months.length > 0 ? grossSalary / months.length : num(employee.salary);
  const allowances = components.allowances;
  const bonus = components.bonus;
  const directorsFees = components.directorsFees;
  const fees = components.fees;
  const otherPayments = components.otherPayments;
  const gross = grossSalary + bonus + directorsFees + fees + allowances + otherPayments;
  const nric = String(employee.nricNumber || "").trim();
  const checks = [
    { label: "Payroll records matched", ok: months.length > 0 },
    { label: "CPF calculations completed", ok: employeeCpf > 0 || residencyType === "foreigner" || monthlySalary > 0 },
    { label: "Employee particulars available", ok: Boolean(employee.name && employee.employeeId && nric) },
    { label: "IR8A data ready", ok: Boolean(nric) && gross > 0 },
  ];

  let status: Ir8aStatus = "Ready";
  if (submitted) status = "Submitted";
  else if (!nric) status = "Check";
  else if (gross <= 0) status = "Pending";

  return {
    employee,
    monthlySalary,
    grossSalary,
    bonus,
    allowances,
    directorsFees,
    fees,
    otherPayments,
    gross,
    benefitsInKind: components.benefitsInKind,
    shareOption: components.shareOption + components.genericOtherIncome,
    retirementBenefits: components.retirementBenefits,
    incomeTaxBorneByEmployee: components.incomeTaxBorneByEmployee,
    employeeCpf,
    employerCpf,
    status,
    checks,
  };
}

export function ir8aStatusClass(status: Ir8aStatus) {
  if (status === "Ready") return "bg-emerald-50 text-emerald-700";
  if (status === "Check") return "bg-amber-50 text-amber-700";
  if (status === "Submitted") return "bg-blue-50 text-blue-700";
  return "bg-orange-50 text-orange-700";
}
