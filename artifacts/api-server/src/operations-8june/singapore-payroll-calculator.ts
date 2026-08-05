/**
 * Singapore Payroll Calculator — server adapter using shared logic.
 */
import {
  calculateProcessPayroll,
  calculateSingaporePayrollSnapshot,
  mapEmployeeResidency,
  type ResidencyType,
  type PrYear,
} from "@shared/singapore-payroll";

export interface PayrollCalculationInput {
  grossSalary: number;
  age: number;
  citizenshipStatus: ResidencyType;
  prYear?: PrYear | null;
  cpfStatus?: string;
  monthlyAllowances?: Record<string, number>;
  monthlyDeductions?: Record<string, number>;
  overtimeHours?: number;
  overtimeRate?: number;
}

export interface PayrollCalculationResult {
  grossPay: number;
  allowancesTotal: number;
  deductionsTotal: number;
  adjustedGrossPay: number;
  employeeCpf: number;
  employerCpf: number;
  totalCpf: number;
  cpfOrdinaryAccount: number;
  cpfSpecialAccount: number;
  cpfMediSave: number;
  monthlyTaxDeduction: number;
  annualTaxableIncome: number;
  annualTax: number;
  monthlyTax: number;
  taxRatePercent: number;
  otherDeductions: number;
  netPay: number;
  chargeableIncome: number;
  cpfApplicableSalary: number;
  employeeCpfRate: number;
  employerCpfRate: number;
  annualSalary: number;
  taxBreakdown: { slabLabel: string; ratePercent: number; taxableAmount: number; tax: number }[];
  breakdown: {
    baseSalary: number;
    overtimePay: number;
    allowances: Record<string, number>;
    deductions: Record<string, number>;
    taxBracket: string;
  };
}

export function calculateSingaporePayroll(
  input: PayrollCalculationInput
): PayrollCalculationResult {
  const allowancesTotal = Object.values(input.monthlyAllowances ?? {}).reduce(
    (s, v) => s + Number(v),
    0
  );
  const deductionsTotal = Object.values(input.monthlyDeductions ?? {}).reduce(
    (s, v) => s + Number(v),
    0
  );

  const calc = calculateProcessPayroll({
    monthlySalary: Number(input.grossSalary),
    age: input.age,
    residencyType: input.citizenshipStatus,
    prYear: input.prYear ?? null,
    monthlyAllowances: allowancesTotal,
    monthlyDeductions: deductionsTotal,
    overtimeHours: input.overtimeHours,
    overtimeRate: input.overtimeRate,
  });

  const grossPay = calc.grossSalary;

  return {
    grossPay,
    allowancesTotal: calc.allowancesTotal,
    deductionsTotal: calc.deductionsTotal,
    adjustedGrossPay: grossPay,
    employeeCpf: calc.monthlyEmployeeCpf,
    employerCpf: calc.monthlyEmployerCpf,
    totalCpf: calc.monthlyTotalCpf,
    cpfOrdinaryAccount: 0,
    cpfSpecialAccount: 0,
    cpfMediSave: 0,
    monthlyTaxDeduction: calc.monthlyIncomeTax,
    annualTaxableIncome: calc.annualSalary,
    annualTax: calc.annualIncomeTax,
    monthlyTax: calc.monthlyIncomeTax,
    taxRatePercent: calc.taxRatePercent,
    otherDeductions: 0,
    netPay: calc.netSalary,
    chargeableIncome: calc.chargeableIncome,
    cpfApplicableSalary: calc.cpfApplicableSalary,
    employeeCpfRate: calc.employeeCpfRate,
    employerCpfRate: calc.employerCpfRate,
    annualSalary: calc.annualSalary,
    taxBreakdown: calc.taxBreakdown,
    breakdown: {
      baseSalary: calc.monthlySalary,
      overtimePay: calc.overtimePay,
      allowances: input.monthlyAllowances ?? {},
      deductions: input.monthlyDeductions ?? {},
      taxBracket: `${calc.effectiveTaxRate}% effective`,
    },
  };
}

export function validatePayrollInput(input: PayrollCalculationInput): string[] {
  const errors: string[] = [];
  if (input.grossSalary < 0) errors.push("Gross salary cannot be negative");
  if (input.age < 16) errors.push("Employee must be at least 16 years old");
  if (input.overtimeHours && input.overtimeHours > 72) {
    errors.push("Overtime hours exceed MOM limit of 72 hours per month");
  }
  return errors;
}

export function formatSGD(amount: number): string {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export { mapEmployeeResidency, calculateSingaporePayrollSnapshot };
