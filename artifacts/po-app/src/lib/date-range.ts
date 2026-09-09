/** Shared date-range helpers — same logic as Dashboard Date Range filter. */

export type PeriodPreset = "this-month" | "last-month" | "this-quarter" | "this-year" | "custom";

export const PERIOD_PRESETS: { id: PeriodPreset; label: string }[] = [
  { id: "this-month", label: "This Month" },
  { id: "last-month", label: "Last Month" },
  { id: "this-quarter", label: "This Quarter" },
  { id: "this-year", label: "This Year" },
  { id: "custom", label: "Custom Range" },
];

export function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
export function endOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}
export function startOfQuarter(d = new Date()) {
  const q = Math.floor(d.getMonth() / 3) * 3;
  return new Date(d.getFullYear(), q, 1);
}
export function endOfQuarter(d = new Date()) {
  const q = Math.floor(d.getMonth() / 3) * 3;
  return new Date(d.getFullYear(), q + 3, 0);
}
export function startOfYear(d = new Date()) {
  return new Date(d.getFullYear(), 0, 1);
}
export function endOfYear(d = new Date()) {
  return new Date(d.getFullYear(), 11, 31);
}

/** Singapore financial year = calendar year: 1 Jan → 31 Dec. */
export function startOfFinancialYear(d = new Date()) {
  return new Date(d.getFullYear(), 0, 1);
}
export function endOfFinancialYear(d = new Date()) {
  return new Date(d.getFullYear(), 11, 31);
}

export function financialYearLabel(start: Date, end: Date) {
  const y1 = start.getFullYear();
  const y2 = end.getFullYear();
  // Singapore calendar FY is a single year (e.g. FY 2026)
  return y1 === y2 ? `FY ${y1}` : `FY ${y1}`;
}

export function toInputDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function fromInputDate(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

export function fmtRangeLabel(from: Date, to: Date) {
  const opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short", year: "numeric" };
  return `${from.toLocaleDateString("en-GB", opts)} - ${to.toLocaleDateString("en-GB", opts)}`;
}

export function inRange(iso: string | null | undefined, from: Date, to: Date) {
  if (!iso) return false;
  const d = new Date(iso.slice(0, 10));
  if (Number.isNaN(d.getTime())) return false;
  const t = d.getTime();
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59, 999).getTime();
  return t >= start && t <= end;
}

export function rangeForPreset(preset: PeriodPreset, customFrom: Date, customTo: Date): { from: Date; to: Date } {
  const now = new Date();
  switch (preset) {
    case "last-month": {
      const ref = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return { from: startOfMonth(ref), to: endOfMonth(ref) };
    }
    case "this-quarter":
      return { from: startOfQuarter(now), to: endOfQuarter(now) };
    case "this-year":
      return { from: startOfYear(now), to: endOfYear(now) };
    case "custom":
      return {
        from: customFrom <= customTo ? customFrom : customTo,
        to: customFrom <= customTo ? customTo : customFrom,
      };
    case "this-month":
    default:
      return { from: startOfMonth(now), to: endOfMonth(now) };
  }
}
