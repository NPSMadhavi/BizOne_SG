import { useState } from "react";
import { Input } from "@/components/ui/input";
import { addDays, addWeeks, format } from "date-fns";

const QUICK_OPTIONS = [
  { label: "1 Week", getValue: () => format(addWeeks(new Date(), 1), "dd/MM/yyyy") },
  { label: "2 Weeks", getValue: () => format(addWeeks(new Date(), 2), "dd/MM/yyyy") },
  { label: "1 Month", getValue: () => format(addDays(new Date(), 30), "dd/MM/yyyy") },
  { label: "ETA TBC", getValue: () => "ETA TBC" },
];

interface DeliveryDateFieldProps {
  value?: string;
  onChange: (val: string) => void;
}

export function DeliveryDateField({ value = "", onChange }: DeliveryDateFieldProps) {
  const isDateString = /^\d{4}-\d{2}-\d{2}$/.test(value || "");

  const nativeToDisplay = (v: string) => {
    if (!v) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
      const [y, m, d] = v.split("-");
      return `${d}/${m}/${y}`;
    }
    return v;
  };

  const displayToNative = (v: string) => {
    const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
    return v;
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {QUICK_OPTIONS.map(opt => {
          const optVal = opt.getValue();
          const isActive = nativeToDisplay(value) === optVal || value === optVal;
          return (
            <button
              key={opt.label}
              type="button"
              onClick={() => onChange(displayToNative(optVal) || optVal)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                isActive
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border hover:bg-muted"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
      <div className="flex gap-2 items-center">
        <Input
          type="date"
          value={isDateString ? value : ""}
          onChange={e => onChange(e.target.value)}
          className="flex-1"
        />
        <span className="text-muted-foreground text-xs shrink-0">or</span>
        <Input
          placeholder="Custom text (e.g. Q2 2026)"
          value={isDateString ? "" : (value || "")}
          onChange={e => onChange(e.target.value)}
          className="flex-1"
        />
      </div>
    </div>
  );
}
