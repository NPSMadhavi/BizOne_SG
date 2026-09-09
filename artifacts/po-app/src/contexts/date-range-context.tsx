import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import {
  type PeriodPreset,
  startOfMonth,
  endOfMonth,
  toInputDate,
} from "@/lib/date-range";

type DateRangeContextValue = {
  periodPreset: PeriodPreset;
  rangeFrom: Date;
  rangeTo: Date;
  rangeFromStr: string;
  rangeToStr: string;
  applyDateRange: (preset: PeriodPreset, from: Date, to: Date) => void;
};

const DateRangeContext = createContext<DateRangeContextValue | null>(null);

const STORAGE_KEY = "bizone.dashboard.dateRange";

function loadStored(): { preset: PeriodPreset; from: string; to: string } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function DateRangeProvider({ children }: { children: ReactNode }) {
  const stored = typeof window !== "undefined" ? loadStored() : null;
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>(stored?.preset || "this-month");
  const [rangeFrom, setRangeFrom] = useState(() =>
    stored?.from ? new Date(stored.from + "T00:00:00") : startOfMonth(),
  );
  const [rangeTo, setRangeTo] = useState(() =>
    stored?.to ? new Date(stored.to + "T00:00:00") : endOfMonth(),
  );

  function applyDateRange(preset: PeriodPreset, from: Date, to: Date) {
    setPeriodPreset(preset);
    setRangeFrom(from);
    setRangeTo(to);
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ preset, from: toInputDate(from), to: toInputDate(to) }),
      );
    } catch {
      /* ignore */
    }
  }

  const value = useMemo(
    () => ({
      periodPreset,
      rangeFrom,
      rangeTo,
      rangeFromStr: toInputDate(rangeFrom),
      rangeToStr: toInputDate(rangeTo),
      applyDateRange,
    }),
    [periodPreset, rangeFrom, rangeTo],
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

/** Safe hook when provider may be absent — falls back to this month. */
export function useDateRangeOptional(): DateRangeContextValue {
  const ctx = useContext(DateRangeContext);
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>("this-month");
  const [rangeFrom, setRangeFrom] = useState(() => startOfMonth());
  const [rangeTo, setRangeTo] = useState(() => endOfMonth());
  if (ctx) return ctx;
  return {
    periodPreset,
    rangeFrom,
    rangeTo,
    rangeFromStr: toInputDate(rangeFrom),
    rangeToStr: toInputDate(rangeTo),
    applyDateRange: (preset, from, to) => {
      setPeriodPreset(preset);
      setRangeFrom(from);
      setRangeTo(to);
    },
  };
}
