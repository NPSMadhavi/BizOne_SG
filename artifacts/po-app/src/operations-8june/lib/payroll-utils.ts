/**
 * Singapore Payroll Utilities — SyncBridge-aligned via shared/singapore-payroll
 */
import {
  CPF_WAGE_CEILING,
  calculateSingaporePayrollSnapshot,
  getCpfRates,
  mapEmployeeResidency,
  mapPrStatusToYear,
  type ResidencyType,
} from "@/operations-8june/types/singapore-payroll";

export const CPF_ORDINARY_WAGE_CEILING = CPF_WAGE_CEILING;

export function isEmployeeCpfEligible(nationality?: string): boolean {
  const { residencyType } = mapEmployeeResidency({ nationality });
  return residencyType !== "foreigner";
}

export function formatTaxRate(taxRate: string | number, nationality?: string): string {
  const rate = typeof taxRate === "string" ? parseFloat(taxRate) : taxRate;
  if (nationality?.toLowerCase() === "foreigner") {
    return `${rate.toFixed(2)}%`;
  }
  return `${rate.toFixed(2)}%`;
}

export function formatCpfRate(cpfRate: string | number, nationality?: string): string {
  if (!nationality || nationality.toLowerCase() === "foreigner") {
    return "-";
  }
  const rate = typeof cpfRate === "string" ? parseFloat(cpfRate) : cpfRate;
  return `${rate.toFixed(0)}%`;
}

function resolveResidency(
  citizenshipStatus: ResidencyType,
  prStatus?: string | null
): { residencyType: ResidencyType; prYear: ReturnType<typeof mapPrStatusToYear> } {
  if (citizenshipStatus === "foreigner") {
    return { residencyType: "foreigner", prYear: null };
  }
  if (citizenshipStatus === "pr") {
    return { residencyType: "pr", prYear: mapPrStatusToYear(prStatus) ?? 3 };
  }
  return { residencyType: "citizen", prYear: null };
}

export function getSyncBridgeCpfRates(
  citizenshipStatus: ResidencyType,
  prStatus?: string | null,
  age = 30
): { employeeRate: number; employerRate: number } {
  const { residencyType, prYear } = resolveResidency(citizenshipStatus, prStatus);
  const rates = getCpfRates(age, residencyType, prYear);
  return {
    employeeRate: rates.employeeRate * 100,
    employerRate: rates.employerRate * 100,
  };
}

export interface SyncBridgePayrollPreview {
  monthlySalary: number;
  annualSalary: number;
  allowancesTotal: number;
  deductionsTotal: number;
  grossBeforeDeductions: number;
  grossPay: number;
  employeeRate: number;
  employerRate: number;
  employeeCpf: number;
  employerCpf: number;
  totalCpf: number;
  netPay: number;
}

/**
 * SyncBridge payroll preview:
 * - Gross = monthly salary + allowances − deductions (+ overtime when provided)
 * - CPF on min(gross, $8,000 wage ceiling)
 * - Net = gross − employee CPF
 */
export function calculateSyncBridgePayrollPreview(params: {
  monthlySalary: number;
  age: number;
  citizenshipStatus: ResidencyType;
  prStatus?: string | null;
  overtimePay?: number;
  allowances?: {
    transport?: number;
    meal?: number;
    phone?: number;
    others?: number;
  };
  deductions?: {
    medical?: number;
    advance?: number;
    others?: number;
  };
}): SyncBridgePayrollPreview {
  const monthlySalary = Number(params.monthlySalary) || 0;
  const allowancesTotal = Object.values(params.allowances || {}).reduce(
    (sum, value) => sum + (Number(value) || 0),
    0
  );
  const deductionsTotal = Object.values(params.deductions || {}).reduce(
    (sum, value) => sum + (Number(value) || 0),
    0
  );
  const overtimePay = Number(params.overtimePay) || 0;
  const { residencyType, prYear } = resolveResidency(
    params.citizenshipStatus,
    params.prStatus
  );

  const snapshot = calculateSingaporePayrollSnapshot({
    monthlySalary,
    age: params.age,
    residencyType,
    prYear,
    monthlyAllowances: allowancesTotal,
    monthlyDeductions: deductionsTotal,
    overtimePay,
  });

  const grossBeforeDeductions = monthlySalary + allowancesTotal + overtimePay;
  const grossPay = grossBeforeDeductions;

  return {
    monthlySalary: snapshot.monthlySalary,
    annualSalary: snapshot.annualSalary,
    allowancesTotal,
    deductionsTotal,
    grossBeforeDeductions,
    grossPay,
    employeeRate: snapshot.employeeCpfRate,
    employerRate: snapshot.employerCpfRate,
    employeeCpf: snapshot.monthlyEmployeeCpf,
    employerCpf: snapshot.monthlyEmployerCpf,
    totalCpf: snapshot.monthlyTotalCpf,
    netPay: snapshot.netSalary,
  };
}

export { mapEmployeeResidency, mapPrStatusToYear, getCpfRates, CPF_WAGE_CEILING };
