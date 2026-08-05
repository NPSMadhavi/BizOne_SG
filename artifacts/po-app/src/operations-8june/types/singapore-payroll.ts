/**
 * Singapore CPF calculator — SyncBridge-aligned shared logic.
 */
import { calculateSingaporeAnnualTax } from "./singapore-tax";

export const CPF_WAGE_CEILING = 8000;

export type ResidencyType = "citizen" | "pr" | "foreigner";
export type PrYear = 1 | 2 | 3;

export interface TaxSlabBreakdownRow {
  slabLabel: string;
  ratePercent: number;
  taxableAmount: number;
  tax: number;
}

export interface SingaporePayrollSnapshot {
  monthlySalary: number;
  annualSalary: number;
  cpfApplicableSalary: number;
  employeeCpfRate: number;
  employerCpfRate: number;
  monthlyEmployeeCpf: number;
  monthlyEmployerCpf: number;
  monthlyTotalCpf: number;
  annualEmployeeCpf: number;
  annualEmployerCpf: number;
  annualTotalCpf: number;
  chargeableIncome: number;
  annualIncomeTax: number;
  monthlyIncomeTax: number;
  effectiveTaxRate: number;
  netSalary: number;
  taxBreakdown: TaxSlabBreakdownRow[];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Employer rate, employee rate (decimals e.g. 0.20 = 20%) */
export function getCpfRates(
  age: number,
  residencyType: ResidencyType,
  prYear?: PrYear | null
): { employerRate: number; employeeRate: number } {
  if (residencyType === "foreigner") {
    return { employerRate: 0, employeeRate: 0 };
  }
  if (residencyType === "pr" && prYear === 1) {
    return { employerRate: 0.04, employeeRate: 0.05 };
  }
  if (residencyType === "pr" && prYear === 2) {
    return { employerRate: 0.09, employeeRate: 0.15 };
  }
  // Citizen and PR 3rd year onwards
  if (age <= 55) return { employerRate: 0.17, employeeRate: 0.2 };
  if (age <= 60) return { employerRate: 0.16, employeeRate: 0.18 };
  if (age <= 65) return { employerRate: 0.125, employeeRate: 0.125 };
  if (age <= 70) return { employerRate: 0.09, employeeRate: 0.075 };
  return { employerRate: 0.075, employeeRate: 0.05 };
}

const TAX_BRACKET_LIMITS: { limit: number; rate: number }[] = [
  { limit: 20000, rate: 0 },
  { limit: 30000, rate: 0.02 },
  { limit: 40000, rate: 0.035 },
  { limit: 80000, rate: 0.07 },
  { limit: 120000, rate: 0.115 },
  { limit: 160000, rate: 0.15 },
  { limit: 200000, rate: 0.18 },
  { limit: 240000, rate: 0.19 },
  { limit: 280000, rate: 0.195 },
  { limit: 320000, rate: 0.2 },
  { limit: 500000, rate: 0.22 },
  { limit: 1000000, rate: 0.23 },
  { limit: Infinity, rate: 0.24 },
];

export function calculateResidentIncomeTax(chargeableIncome: number): number {
  const income = Math.max(0, chargeableIncome);
  let tax = 0;
  let previousLimit = 0;
  for (const { limit: currentLimit, rate } of TAX_BRACKET_LIMITS) {
    if (income > previousLimit) {
      const taxableAmount = Math.min(income, currentLimit) - previousLimit;
      tax += taxableAmount * rate;
      previousLimit = currentLimit;
    } else {
      break;
    }
  }
  return round2(tax);
}

export function getIncomeTaxBreakdown(chargeableIncome: number): TaxSlabBreakdownRow[] {
  const income = Math.max(0, chargeableIncome);
  const rows: TaxSlabBreakdownRow[] = [];
  let previousLimit = 0;

  for (const { limit: currentLimit, rate } of TAX_BRACKET_LIMITS) {
    if (income <= previousLimit) break;
    const taxableAmount = Math.min(income, currentLimit) - previousLimit;
    const slabTax = round2(taxableAmount * rate);
    let slabLabel: string;
    if (previousLimit === 0) {
      slabLabel = `First ${currentLimit.toLocaleString()}`;
    } else if (currentLimit === Infinity) {
      slabLabel = `Above ${previousLimit.toLocaleString()}`;
    } else {
      slabLabel = `Next ${(currentLimit - previousLimit).toLocaleString()}`;
    }
    rows.push({
      slabLabel,
      ratePercent: round2(rate * 100),
      taxableAmount: round2(taxableAmount),
      tax: slabTax,
    });
    previousLimit = currentLimit;
  }
  return rows;
}

export function mapPrStatusToYear(prStatus?: string | null): PrYear | null {
  if (!prStatus) return null;
  const normalized = prStatus.trim().toLowerCase();
  if (normalized === "year_1" || normalized === "1 year" || normalized === "1_year") return 1;
  if (normalized === "year_2" || normalized === "2 years" || normalized === "2 year" || normalized === "2_year") {
    return 2;
  }
  if (
    normalized === "year_3_plus" ||
    normalized === "3 years and above" ||
    normalized === "3+ year" ||
    normalized.includes("3 year")
  ) {
    return 3;
  }
  return 3;
}

/** Map legacy nationality + residency fields (SyncBridge + BizOne formats) */
export function mapEmployeeResidency(employee: {
  nationality?: string | null;
  residencyType?: string | null;
  prStatus?: string | null;
}): { residencyType: ResidencyType; prYear: PrYear | null } {
  const raw = (employee.residencyType || employee.nationality || "citizen").toLowerCase().trim();
  if (raw === "foreigner") return { residencyType: "foreigner", prYear: null };
  if (raw === "pr" || raw.includes("permanent resident") || raw === "singaporean_pr") {
    return { residencyType: "pr", prYear: mapPrStatusToYear(employee.prStatus) ?? 3 };
  }
  if (raw === "singapore" || raw === "singaporean" || raw === "citizen") {
    return { residencyType: "citizen", prYear: null };
  }
  return { residencyType: "citizen", prYear: null };
}

export function calculateAgeFromDob(dateOfBirth?: string | Date | null): number {
  if (!dateOfBirth) return 30;
  const birth = new Date(dateOfBirth);
  if (isNaN(birth.getTime())) return 30;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return Math.max(16, age);
}

export interface CalculatePayrollParams {
  monthlySalary: number;
  age: number;
  residencyType: ResidencyType;
  prYear?: PrYear | null;
  monthlyAllowances?: number;
  monthlyDeductions?: number;
  overtimePay?: number;
}

export function calculateSingaporePayrollSnapshot(
  params: CalculatePayrollParams
): SingaporePayrollSnapshot {
  const monthlySalary = round2(Math.max(0, params.monthlySalary));
  const allowances = round2(params.monthlyAllowances ?? 0);
  const deductions = round2(params.monthlyDeductions ?? 0);
  const overtimePay = round2(params.overtimePay ?? 0);

  const annualSalary = round2(monthlySalary * 12);
  const grossSalary = round2(
    Math.max(0, monthlySalary + allowances + overtimePay - deductions)
  );
  const cpfApplicableSalary = round2(Math.min(grossSalary, CPF_WAGE_CEILING));

  const { employerRate, employeeRate } = getCpfRates(
    params.age,
    params.residencyType,
    params.prYear
  );

  const monthlyEmployeeCpf = round2(cpfApplicableSalary * employeeRate);
  const monthlyEmployerCpf = round2(cpfApplicableSalary * employerRate);
  const monthlyTotalCpf = round2(monthlyEmployeeCpf + monthlyEmployerCpf);
  const annualEmployeeCpf = round2(monthlyEmployeeCpf * 12);
  const annualEmployerCpf = round2(monthlyEmployerCpf * 12);
  const annualTotalCpf = round2(monthlyTotalCpf * 12);

  const chargeableIncome = 0;
  const annualIncomeTax = 0;
  const monthlyIncomeTax = 0;
  const taxBreakdown: TaxSlabBreakdownRow[] = [];
  const effectiveTaxRate = 0;

  const netSalary = round2(grossSalary - monthlyEmployeeCpf);

  return {
    monthlySalary,
    annualSalary,
    cpfApplicableSalary,
    employeeCpfRate: round2(employeeRate * 100),
    employerCpfRate: round2(employerRate * 100),
    monthlyEmployeeCpf,
    monthlyEmployerCpf,
    monthlyTotalCpf,
    annualEmployeeCpf,
    annualEmployerCpf,
    annualTotalCpf,
    chargeableIncome,
    annualIncomeTax,
    monthlyIncomeTax,
    effectiveTaxRate,
    netSalary,
    taxBreakdown,
  };
}

/** Process-payroll gross line items */
export function calculateProcessPayroll(params: CalculatePayrollParams & {
  overtimeHours?: number;
  overtimeRate?: number;
}) {
  const overtimePay =
    params.overtimePay ??
    round2((params.overtimeHours ?? 0) * (params.overtimeRate ?? 0));
  const allowances = round2(params.monthlyAllowances ?? 0);
  const deductions = round2(params.monthlyDeductions ?? 0);
  const snapshot = calculateSingaporePayrollSnapshot({
    ...params,
    overtimePay,
    monthlyAllowances: allowances,
    monthlyDeductions: deductions,
  });
  const grossSalary = round2(
    Math.max(0, snapshot.monthlySalary + allowances + overtimePay - deductions)
  );

  return {
    ...snapshot,
    grossSalary,
    allowancesTotal: allowances,
    deductionsTotal: deductions,
    overtimePay,
    taxRatePercent: snapshot.effectiveTaxRate,
    taxAmount: snapshot.monthlyIncomeTax,
    cpfEmployeeRate: snapshot.employeeCpfRate,
    cpfEmployeeAmount: snapshot.monthlyEmployeeCpf,
    cpfEmployerRate: snapshot.employerCpfRate,
    cpfEmployerAmount: snapshot.monthlyEmployerCpf,
  };
}

export function residencyLabel(nationality?: string | null, prStatus?: string | null): string {
  const { residencyType } = mapEmployeeResidency({ nationality, prStatus });
  if (residencyType === "foreigner") return "Foreigner";
  if (residencyType === "pr") {
    const labels: Record<string, string> = {
      year_1: "PR (1 Year)",
      year_2: "PR (2 Year)",
      year_3_plus: "PR (3 Year+)",
      "1 Year": "PR (1 Year)",
      "2 Years": "PR (2 Year)",
      "3 Years and Above": "PR (3 Year+)",
    };
    return labels[prStatus || ""] || "Permanent Resident";
  }
  return "Singapore Citizen";
}

export { calculateSingaporeAnnualTax };
