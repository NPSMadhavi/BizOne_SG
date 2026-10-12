/**
 * Splits payroll earnings so bonus and other income are not rolled into allowances.
 * Allowance keys stay allowances. Bonus, AWS, and other income / benefits stay in their own totals.
 */

export interface EarningsSplit {
  allowances: number;
  bonus: number;
  overtime: number;
  otherIncome: number;
  incomeTaxBorneByEmployee: number;
  benefitsInKind: number;
  shareOption: number;
  retirementBenefits: number;
  directorsFees: number;
  otherPayments: number;
  fees: number;
  genericOtherIncome: number;
}

type EarningBucket = keyof EarningsSplit;

export function emptyEarningsSplit(): EarningsSplit {
  return {
    allowances: 0,
    bonus: 0,
    overtime: 0,
    otherIncome: 0,
    incomeTaxBorneByEmployee: 0,
    benefitsInKind: 0,
    shareOption: 0,
    retirementBenefits: 0,
    directorsFees: 0,
    otherPayments: 0,
    fees: 0,
    genericOtherIncome: 0,
  };
}

export function normalizeEarningKey(key: string): string {
  return String(key || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function tokens(id: string): string[] {
  return id.split("_").filter(Boolean);
}

function isBonusKey(id: string): boolean {
  if (id === "bonus" || id === "aws" || id === "bonus_aws" || id === "annual_wage_supplement") return true;
  const parts = tokens(id);
  return parts.includes("bonus") || parts.includes("aws");
}

function isIncomeTaxKey(id: string): boolean {
  return id.includes("income_tax") || id.includes("tax_borne");
}

function isBenefitsKey(id: string): boolean {
  return id === "bik" || id.includes("benefit");
}

function isShareKey(id: string): boolean {
  return id.includes("share_option") || id.includes("stock_option") || id.includes("esop");
}

function isRetirementKey(id: string): boolean {
  return id.includes("retirement");
}

function isDirectorKey(id: string): boolean {
  return id.includes("director");
}

function isOtherPaymentKey(id: string): boolean {
  return id.includes("other_payment");
}

function isFeesKey(id: string): boolean {
  const parts = tokens(id);
  return parts.includes("fee") || parts.includes("fees") || parts.includes("commission") || parts.includes("commissions");
}

function isGenericOtherIncomeKey(id: string): boolean {
  return id.includes("other_income") || id.includes("other_benefit");
}

export function classifyEarningKey(key: string): EarningBucket {
  const id = normalizeEarningKey(key);
  if (!id || id === "overtime") return "overtime";
  if (isBonusKey(id)) return "bonus";
  if (id === "others" || id === "other" || id.includes("allowance")) return "allowances";
  if (isIncomeTaxKey(id)) return "incomeTaxBorneByEmployee";
  if (isBenefitsKey(id)) return "benefitsInKind";
  if (isShareKey(id)) return "shareOption";
  if (isRetirementKey(id)) return "retirementBenefits";
  if (isDirectorKey(id)) return "directorsFees";
  if (isOtherPaymentKey(id)) return "otherPayments";
  if (isFeesKey(id)) return "fees";
  if (isGenericOtherIncomeKey(id)) return "otherIncome";
  return "allowances";
}

export function earningDisplayGroup(key: string): "allowance" | "bonus" | "other" {
  const bucket = classifyEarningKey(key);
  if (bucket === "bonus") return "bonus";
  if (bucket === "allowances" || bucket === "overtime") return "allowance";
  return "other";
}

function readAmount(value: unknown): number {
  const amount = typeof value === "number" ? value : parseFloat(String(value ?? 0));
  return Number.isFinite(amount) ? amount : 0;
}

export function asEarningMap(value: unknown): Record<string, unknown> {
  if (value == null) return {};
  if (typeof value === "number") return Number.isFinite(value) ? { others: value } : {};
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return {};
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        return asEarningMap(JSON.parse(trimmed));
      } catch {
        return {};
      }
    }
    const amount = parseFloat(trimmed);
    return Number.isFinite(amount) ? { others: amount } : {};
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export function splitEarnings(value: unknown): EarningsSplit {
  const split = emptyEarningsSplit();
  let genericOtherIncome = 0;
  for (const [key, raw] of Object.entries(asEarningMap(value))) {
    const amount = readAmount(raw);
    if (!amount) continue;
    const bucket = classifyEarningKey(key);
    if (bucket === "otherIncome") genericOtherIncome += amount;
    else split[bucket] += amount;
  }
  split.genericOtherIncome = genericOtherIncome;
  split.otherIncome =
    genericOtherIncome +
    split.incomeTaxBorneByEmployee +
    split.benefitsInKind +
    split.shareOption +
    split.retirementBenefits +
    split.directorsFees +
    split.otherPayments;
  return split;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function resolvePayrollEarnings(input: {
  allowances?: unknown;
  overtimePay?: number;
  overtimeHours?: number;
  overtimeRate?: number;
}) {
  const split = splitEarnings(input.allowances);
  const explicitOvertime = round2(Number(input.overtimePay) || 0);
  const hoursOvertime = round2((Number(input.overtimeHours) || 0) * (Number(input.overtimeRate) || 0));
  const overtimePay = explicitOvertime > 0 ? explicitOvertime : hoursOvertime > 0 ? hoursOvertime : round2(split.overtime);
  const allowances = round2(split.allowances);
  const bonus = round2(split.bonus);
  const fees = round2(split.fees);
  const otherIncome = round2(split.otherIncome);
  return {
    ...split,
    allowances,
    bonus,
    overtime: round2(split.overtime),
    otherIncome,
    incomeTaxBorneByEmployee: round2(split.incomeTaxBorneByEmployee),
    benefitsInKind: round2(split.benefitsInKind),
    shareOption: round2(split.shareOption),
    retirementBenefits: round2(split.retirementBenefits),
    directorsFees: round2(split.directorsFees),
    otherPayments: round2(split.otherPayments),
    fees,
    genericOtherIncome: round2(split.genericOtherIncome),
    overtimePay,
    taxableEarnings: round2(allowances + bonus + otherIncome + fees),
  };
}
