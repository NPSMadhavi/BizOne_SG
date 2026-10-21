import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  type PeriodPreset,
  startOfYear,
  endOfYear,
  fromInputDate,
  toInputDate,
} from "@/lib/date-range";
import { useAuth } from "@/contexts/auth-context";

/** FY shape from GET /api/financial-years (Drizzle JSON: camelCase). */
export type FinancialYearSummary = {
  id?: number;
  label?: string;
  startDate: string;
  endDate: string;
  status: string;
};

type StoredDateRange = {
  companyId: number;
  preset: PeriodPreset;
  from: string;
  to: string;
};

type DateRangeContextValue = {
  periodPreset: PeriodPreset;
  rangeFrom: Date;
  rangeTo: Date;
  rangeFromStr: string;
  rangeToStr: string;
  applyDateRange: (preset: PeriodPreset, from: Date, to: Date) => void;
  /** Align to calendar This Year for the current company (not hardcoded). */
  applyThisYear: () => void;
  /** Align to an active FY from the API (caller supplies the year). */
  applyFinancialYear: (fy: FinancialYearSummary) => void;
  /**
   * If the persisted/custom range exactly matches an inactive FY and an active FY exists,
   * switch to the active FY once. Closed-year ranges are preserved.
   */
  reconcileAgainstFinancialYears: (
    years: FinancialYearSummary[],
    active: FinancialYearSummary | null,
  ) => void;
};

const DateRangeContext = createContext<DateRangeContextValue | null>(null);

/** v3: company-scoped; legacy v2 blobs without companyId are ignored. */
const STORAGE_KEY = "bizone.dashboard.dateRange.v3";
const LEGACY_STORAGE_KEY = "bizone.dashboard.dateRange.v2";

function loadStoredForCompany(companyId: number | null): StoredDateRange | null {
  if (companyId == null) return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      // Drop legacy unscoped v2 so an inactive 2027 range cannot resurrect across companies.
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<StoredDateRange>;
    if (typeof parsed.companyId !== "number") {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    if (parsed.companyId !== companyId) return null;
    if (!parsed.from || !parsed.to || !parsed.preset) return null;
    return parsed as StoredDateRange;
  } catch {
    return null;
  }
}

function persistForCompany(
  companyId: number | null,
  preset: PeriodPreset,
  from: Date,
  to: Date,
) {
  if (companyId == null) return;
  try {
    const payload: StoredDateRange = {
      companyId,
      preset,
      from: toInputDate(from),
      to: toInputDate(to),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    /* ignore quota / private mode */
  }
}

function rangeExactlyMatchesFy(
  from: Date,
  to: Date,
  fy: FinancialYearSummary,
): boolean {
  return toInputDate(from) === fy.startDate && toInputDate(to) === fy.endDate;
}

/**
 * Decide whether a restored custom/this-year range should be replaced by the active FY.
 * Never auto-activates years — only reads status from the API payload.
 */
export function shouldReplaceInactiveRange(
  rangeFrom: Date,
  rangeTo: Date,
  years: FinancialYearSummary[],
  active: FinancialYearSummary | null,
): FinancialYearSummary | null {
  if (!active || active.status !== "active") return null;
  const exact = years.find((y) => rangeExactlyMatchesFy(rangeFrom, rangeTo, y));
  if (!exact) return null;
  if (exact.status === "closed") return null; // intentional closed-year review
  if (exact.status === "active") return null;
  if (exact.status === "inactive") return active;
  return null;
}

export function DateRangeProvider({ children }: { children: ReactNode }) {
  const { selectedCompany } = useAuth();
  const companyId = selectedCompany?.id ?? null;
  const companyIdRef = useRef(companyId);
  companyIdRef.current = companyId;

  const initial = loadStoredForCompany(companyId);
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>(
    initial?.preset || "this-year",
  );
  const [rangeFrom, setRangeFrom] = useState(
    () => (initial?.from && fromInputDate(initial.from)) || startOfYear(),
  );
  const [rangeTo, setRangeTo] = useState(
    () => (initial?.to && fromInputDate(initial.to)) || endOfYear(),
  );
  /** Allow one inactive→active correction after company load / storage restore — not after user picks a range. */
  const allowInactiveReconcileRef = useRef(true);
  const reconciledKeyRef = useRef<string | null>(null);

  // When company changes, load that company's range (or calendar This Year).
  useEffect(() => {
    reconciledKeyRef.current = null;
    allowInactiveReconcileRef.current = true;
    const stored = loadStoredForCompany(companyId);
    if (stored) {
      const from = fromInputDate(stored.from);
      const to = fromInputDate(stored.to);
      setPeriodPreset(stored.preset);
      setRangeFrom(from || startOfYear());
      setRangeTo(to || endOfYear());
    } else {
      setPeriodPreset("this-year");
      setRangeFrom(startOfYear());
      setRangeTo(endOfYear());
    }
  }, [companyId]);

  const applyDateRange = useCallback((preset: PeriodPreset, from: Date, to: Date) => {
    allowInactiveReconcileRef.current = false;
    setPeriodPreset(preset);
    setRangeFrom(from);
    setRangeTo(to);
    persistForCompany(companyIdRef.current, preset, from, to);
  }, []);

  const applyThisYear = useCallback(() => {
    applyDateRange("this-year", startOfYear(), endOfYear());
  }, [applyDateRange]);

  const applyFinancialYear = useCallback(
    (fy: FinancialYearSummary) => {
      const from = fromInputDate(fy.startDate);
      const to = fromInputDate(fy.endDate);
      if (!from || !to) return;
      applyDateRange("custom", from, to);
    },
    [applyDateRange],
  );

  const reconcileAgainstFinancialYears = useCallback(
    (years: FinancialYearSummary[], active: FinancialYearSummary | null) => {
      if (!allowInactiveReconcileRef.current) return;
      const key = `${companyIdRef.current}:${toInputDate(rangeFrom)}:${toInputDate(rangeTo)}:${active?.startDate ?? ""}`;
      if (reconciledKeyRef.current === key) return;
      reconciledKeyRef.current = key;
      const replacement = shouldReplaceInactiveRange(rangeFrom, rangeTo, years, active);
      if (!replacement) return;
      const from = fromInputDate(replacement.startDate);
      const to = fromInputDate(replacement.endDate);
      if (!from || !to) return;
      // Keep allowInactiveReconcile briefly so this correction isn't treated as a user apply.
      allowInactiveReconcileRef.current = false;
      setPeriodPreset("custom");
      setRangeFrom(from);
      setRangeTo(to);
      persistForCompany(companyIdRef.current, "custom", from, to);
    },
    [rangeFrom, rangeTo],
  );

  const value = useMemo(
    () => ({
      periodPreset,
      rangeFrom,
      rangeTo,
      rangeFromStr: toInputDate(rangeFrom),
      rangeToStr: toInputDate(rangeTo),
      applyDateRange,
      applyThisYear,
      applyFinancialYear,
      reconcileAgainstFinancialYears,
    }),
    [
      periodPreset,
      rangeFrom,
      rangeTo,
      applyDateRange,
      applyThisYear,
      applyFinancialYear,
      reconcileAgainstFinancialYears,
    ],
  );

  return <DateRangeContext.Provider value={value}>{children}</DateRangeContext.Provider>;
}

export function useDateRange() {
  const ctx = useContext(DateRangeContext);
  if (!ctx) {
    throw new Error("useDateRange must be used within DateRangeProvider");
  }
  return ctx;
}

/** Safe hook when provider may be absent — falls back to this year (SG FY). */
export function useDateRangeOptional(): DateRangeContextValue {
  const ctx = useContext(DateRangeContext);
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>("this-year");
  const [rangeFrom, setRangeFrom] = useState(() => startOfYear());
  const [rangeTo, setRangeTo] = useState(() => endOfYear());
  if (ctx) return ctx;
  const applyDateRange = (preset: PeriodPreset, from: Date, to: Date) => {
    setPeriodPreset(preset);
    setRangeFrom(from);
    setRangeTo(to);
  };
  return {
    periodPreset,
    rangeFrom,
    rangeTo,
    rangeFromStr: toInputDate(rangeFrom),
    rangeToStr: toInputDate(rangeTo),
    applyDateRange,
    applyThisYear: () => applyDateRange("this-year", startOfYear(), endOfYear()),
    applyFinancialYear: (fy) => {
      const from = fromInputDate(fy.startDate);
      const to = fromInputDate(fy.endDate);
      if (from && to) applyDateRange("custom", from, to);
    },
    reconcileAgainstFinancialYears: () => {},
  };
}
