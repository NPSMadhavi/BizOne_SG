import { AlertTriangle, Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface IssueDateFieldProps {
  value: string;
  onChange: (val: string) => void;
  label?: string;
  className?: string;
  hideHints?: boolean;
}

function today(): string {
  return new Date().toISOString().split("T")[0];
}

function daysDiff(dateStr: string): number {
  const d = new Date(dateStr);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
}

export function IssueDateField({ value, onChange, label = "Document Date", className, hideHints = false }: IssueDateFieldProps) {
  const effectiveValue = value || today();
  const diff = daysDiff(effectiveValue);
  const isBackdated = diff > 0;
  const isFuture = diff < 0;
  const isStale = diff > 30;

  return (
    <div className={cn("space-y-1.5", className)}>
      <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
        {label}
      </label>
      <input
        type="date"
        value={effectiveValue}
        onChange={e => onChange(e.target.value)}
        max={today()}
        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      />
      {!hideHints && isFuture && (
        <p className="flex items-center gap-1.5 text-xs text-amber-600">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          Future dates are not recommended for issued documents.
        </p>
      )}
      {!hideHints && isBackdated && !isStale && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Info className="h-3 w-3 shrink-0" />
          Backdated {diff} day{diff !== 1 ? "s" : ""} — acceptable if work/goods were supplied on this date.
        </p>
      )}
      {!hideHints && isStale && (
        <p className="flex items-center gap-1.5 text-xs text-amber-600">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          Backdated {diff} days. IRAS recommends invoices be issued within 30 days of supply.
          Verify the invoice date is correct before issuing.
        </p>
      )}
    </div>
  );
}

export { today as getToday };
