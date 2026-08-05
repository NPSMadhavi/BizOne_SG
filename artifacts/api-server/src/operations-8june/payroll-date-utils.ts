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

export function getLastCompletedPayPeriod(now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return getPayPeriodForMonth(d.getFullYear(), d.getMonth() + 1);
}

export const PAYROLL_CURRENT_MONTH_ERROR =
  "This month has not ended yet, so payroll cannot be processed.";

export function isPayPeriodEligibleForProcessing(
  payPeriodStart: string,
  payPeriodEnd?: string,
  now = new Date()
): boolean {
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const { year: startYear, month: startMonth } = derivePayrollMonthYear(payPeriodStart);
  if (startYear > currentYear) return false;
  if (startYear === currentYear && startMonth >= currentMonth) return false;

  if (payPeriodEnd) {
    const { year: endYear, month: endMonth } = derivePayrollMonthYear(payPeriodEnd);
    if (endYear > currentYear) return false;
    if (endYear === currentYear && endMonth >= currentMonth) return false;
  }

  return true;
}

export function getPayPeriodForMonth(year: number, month: number) {
  const payPeriodStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const payPeriodEnd = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { payPeriodStart, payPeriodEnd, year, month };
}

export function getBatchZipNameFromPeriod(payPeriodStart: string) {
  const { monthLabel } = derivePayrollMonthYear(payPeriodStart);
  return `Payslips_${monthLabel.replace(" ", "_")}.zip`;
}

export function parseForceOverwriteFlag(value: unknown): boolean {
  if (value === true || value === 1) return true;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "true" || normalized === "1" || normalized === "yes";
  }
  return false;
}
