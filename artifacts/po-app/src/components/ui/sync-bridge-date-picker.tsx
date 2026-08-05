/**
 * SyncBridge date picker — month/year/decade views matching product design.
 * Full-date mode adds a day grid after month selection.
 */
import * as React from "react";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const;

const TEAL = "hsl(180 45% 22%)";
const TEAL_MUTED = "hsl(180 20% 55%)";
const PILL_BG = "hsl(0 0% 96%)";

export type DatePickerMode = "date" | "month";

export interface SyncBridgeDatePickerProps {
  value?: string | null;
  onChange: (value: string) => void;
  mode?: DatePickerMode;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  min?: string;
  max?: string;
  disabledDate?: (date: Date) => boolean;
}

function parseYmd(v?: string | null): Date | null {
  if (!v) return null;
  const raw = v.includes("T") ? v.split("T")[0] : v;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  const [y, m, day] = raw.split("-").map(Number);
  return new Date(y, m - 1, day);
}

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDisplay(value: string | null | undefined, mode: DatePickerMode): string {
  const d = parseYmd(value);
  if (!d) return "";
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  if (mode === "month") return `${mm}/${yyyy}`;
  const dd = String(d.getDate()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy}`;
}

function isDisabled(
  d: Date,
  min?: string,
  max?: string,
  disabledDate?: (date: Date) => boolean
): boolean {
  if (disabledDate?.(d)) return true;
  const minD = parseYmd(min);
  const maxD = parseYmd(max);
  if (minD && d < startOfDay(minD)) return true;
  if (maxD && d > startOfDay(maxD)) return true;
  return false;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

type PanelView = "month" | "year" | "day";

interface DatePickerPanelProps {
  viewYear: number;
  viewMonth: number;
  selected: Date | null;
  mode: DatePickerMode;
  panelView: PanelView;
  onPanelViewChange: (v: PanelView) => void;
  onViewYearChange: (y: number) => void;
  onViewMonthChange: (m: number) => void;
  onSelect: (d: Date) => void;
  onClear: () => void;
  min?: string;
  max?: string;
  disabledDate?: (date: Date) => boolean;
}

function NavButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-full transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-40"
      )}
      style={{ backgroundColor: PILL_BG, color: TEAL }}
    >
      {children}
    </button>
  );
}

function YearPill({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "span";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "rounded-full px-5 py-1.5 text-sm font-semibold",
        onClick && "cursor-pointer hover:opacity-90"
      )}
      style={{ backgroundColor: PILL_BG, color: TEAL }}
    >
      {children}
    </Tag>
  );
}

export function DatePickerPanel({
  viewYear,
  viewMonth,
  selected,
  mode,
  panelView,
  onPanelViewChange,
  onViewYearChange,
  onViewMonthChange,
  onSelect,
  onClear,
  min,
  max,
  disabledDate,
}: DatePickerPanelProps) {
  const decadeStart = Math.floor(viewYear / 10) * 10;

  const trySelect = (d: Date) => {
    if (!isDisabled(d, min, max, disabledDate)) onSelect(d);
  };

  if (panelView === "year") {
    const years: number[] = [];
    for (let i = -1; i <= 10; i++) years.push(decadeStart + i);

    return (
      <div className="w-[280px] select-none p-4">
        <div className="mb-5 flex items-center justify-between">
          <NavButton onClick={() => onViewYearChange(viewYear - 10)}>
            <ChevronLeft className="h-4 w-4" />
          </NavButton>
          <YearPill>
            {decadeStart}–{decadeStart + 9}
          </YearPill>
          <NavButton onClick={() => onViewYearChange(viewYear + 10)}>
            <ChevronRight className="h-4 w-4" />
          </NavButton>
        </div>
        <div className="grid grid-cols-3 gap-y-4 gap-x-2">
          {years.map((y) => {
            const inDecade = y >= decadeStart && y <= decadeStart + 9;
            const isSelected = selected?.getFullYear() === y;
            return (
              <button
                key={y}
                type="button"
                onClick={() => {
                  onViewYearChange(y);
                  onPanelViewChange("month");
                }}
                className={cn(
                  "rounded-full py-2 text-sm font-medium transition-colors",
                  isSelected && inDecade && "border bg-white"
                )}
                style={{
                  color: inDecade ? TEAL : TEAL_MUTED,
                  borderColor: isSelected && inDecade ? "hsl(0 0% 82%)" : "transparent",
                }}
              >
                {y}
              </button>
            );
          })}
        </div>
        <ClearFooter onClear={onClear} />
      </div>
    );
  }

  if (panelView === "day" && mode === "date") {
    const first = new Date(viewYear, viewMonth, 1);
    const startPad = first.getDay();
    const total = daysInMonth(viewYear, viewMonth);
    const cells: (number | null)[] = [];
    for (let i = 0; i < startPad; i++) cells.push(null);
    for (let d = 1; d <= total; d++) cells.push(d);

    return (
      <div className="w-[280px] select-none p-4">
        <div className="mb-4 flex items-center justify-between">
          <NavButton
            onClick={() => {
              if (viewMonth === 0) {
                onViewMonthChange(11);
                onViewYearChange(viewYear - 1);
              } else {
                onViewMonthChange(viewMonth - 1);
              }
            }}
          >
            <ChevronLeft className="h-4 w-4" />
          </NavButton>
          <YearPill onClick={() => onPanelViewChange("month")}>
            {MONTHS[viewMonth]} {viewYear}
          </YearPill>
          <NavButton
            onClick={() => {
              if (viewMonth === 11) {
                onViewMonthChange(0);
                onViewYearChange(viewYear + 1);
              } else {
                onViewMonthChange(viewMonth + 1);
              }
            }}
          >
            <ChevronRight className="h-4 w-4" />
          </NavButton>
        </div>
        <div className="mb-2 grid grid-cols-7 gap-1">
          {WEEKDAYS.map((w) => (
            <div
              key={w}
              className="py-1 text-center text-xs font-medium"
              style={{ color: TEAL_MUTED }}
            >
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((day, idx) => {
            if (day === null) return <div key={`e-${idx}`} />;
            const d = new Date(viewYear, viewMonth, day);
            const disabled = isDisabled(d, min, max, disabledDate);
            const isSelected =
              selected &&
              selected.getFullYear() === viewYear &&
              selected.getMonth() === viewMonth &&
              selected.getDate() === day;
            return (
              <button
                key={day}
                type="button"
                disabled={disabled}
                onClick={() => trySelect(d)}
                className={cn(
                  "rounded-full py-1.5 text-sm font-medium transition-colors",
                  "disabled:cursor-not-allowed disabled:opacity-35",
                  isSelected && "border bg-white"
                )}
                style={{
                  color: TEAL,
                  borderColor: isSelected ? "hsl(0 0% 82%)" : "transparent",
                }}
              >
                {day}
              </button>
            );
          })}
        </div>
        <ClearFooter onClear={onClear} />
      </div>
    );
  }

  return (
    <div className="w-[280px] select-none p-4">
      <div className="mb-5 flex items-center justify-between">
        <NavButton onClick={() => onViewYearChange(viewYear - 1)}>
          <ChevronLeft className="h-4 w-4" />
        </NavButton>
        <YearPill onClick={() => onPanelViewChange("year")}>{viewYear}</YearPill>
        <NavButton onClick={() => onViewYearChange(viewYear + 1)}>
          <ChevronRight className="h-4 w-4" />
        </NavButton>
      </div>
      <div className="grid grid-cols-3 gap-y-3 gap-x-2">
        {MONTHS.map((label, mi) => {
          const isSelected =
            selected &&
            selected.getFullYear() === viewYear &&
            selected.getMonth() === mi;
          return (
            <button
              key={label}
              type="button"
              onClick={() => {
                onViewMonthChange(mi);
                if (mode === "month") {
                  trySelect(new Date(viewYear, mi, 1));
                } else {
                  onPanelViewChange("day");
                }
              }}
              className={cn(
                "rounded-full py-2.5 text-sm font-medium transition-colors",
                isSelected && "border bg-white"
              )}
              style={{
                color: TEAL,
                borderColor: isSelected ? "hsl(0 0% 82%)" : "transparent",
              }}
            >
              {label}
            </button>
          );
        })}
      </div>
      <ClearFooter onClear={onClear} />
    </div>
  );
}

function ClearFooter({ onClear }: { onClear: () => void }) {
  return (
    <button
      type="button"
      onClick={onClear}
      className="mt-5 flex items-center gap-2 text-sm font-semibold transition-opacity hover:opacity-80"
      style={{ color: TEAL }}
    >
      Clear Selection
      <RotateCcw className="h-3.5 w-3.5" />
    </button>
  );
}

export function SyncBridgeDatePicker({
  value,
  onChange,
  mode = "date",
  placeholder,
  className,
  disabled,
  min,
  max,
  disabledDate,
}: SyncBridgeDatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const selected = parseYmd(value);
  const today = new Date();

  const [viewYear, setViewYear] = React.useState(
    selected?.getFullYear() ?? today.getFullYear()
  );
  const [viewMonth, setViewMonth] = React.useState(
    selected?.getMonth() ?? today.getMonth()
  );
  const [panelView, setPanelView] = React.useState<PanelView>("month");

  React.useEffect(() => {
    if (open) {
      setViewYear(selected?.getFullYear() ?? today.getFullYear());
      setViewMonth(selected?.getMonth() ?? today.getMonth());
      setPanelView("month");
    }
  }, [open]);

  const displayPlaceholder =
    placeholder ?? (mode === "month" ? "MM/YYYY" : "DD/MM/YYYY");

  const handleSelect = (d: Date) => {
    onChange(toYmd(d));
    setOpen(false);
  };

  const handleClear = () => {
    onChange("");
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "flex h-10 w-full items-center rounded-md border bg-white px-3 text-left text-sm",
            "disabled:cursor-not-allowed disabled:opacity-50",
            className
          )}
          style={{ borderColor: TEAL, color: TEAL }}
        >
          <span
            className={cn("flex-1", !value && "font-normal")}
            style={!value ? { color: TEAL_MUTED } : undefined}
          >
            {value ? formatDisplay(value, mode) : displayPlaceholder}
          </span>
          <CalendarIcon className="h-4 w-4 shrink-0 opacity-80" style={{ color: TEAL }} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto border bg-white p-0 shadow-lg"
        align="start"
        sideOffset={6}
        style={{ borderColor: "hsl(0 0% 85%)" }}
      >
        <DatePickerPanel
          viewYear={viewYear}
          viewMonth={viewMonth}
          selected={selected}
          mode={mode}
          panelView={panelView}
          onPanelViewChange={setPanelView}
          onViewYearChange={setViewYear}
          onViewMonthChange={setViewMonth}
          onSelect={handleSelect}
          onClear={handleClear}
          min={min}
          max={max}
          disabledDate={disabledDate}
        />
      </PopoverContent>
    </Popover>
  );
}

export interface SyncBridgeDateObjectPickerProps {
  value?: Date | null;
  onChange: (value?: Date) => void;
  mode?: DatePickerMode;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  min?: string;
  max?: string;
  disabledDate?: (date: Date) => boolean;
}

export function SyncBridgeDateObjectPicker({
  value,
  onChange,
  ...rest
}: SyncBridgeDateObjectPickerProps) {
  const str = value ? toYmd(value) : "";
  return (
    <SyncBridgeDatePicker
      {...rest}
      value={str}
      onChange={(v) => {
        if (!v) {
          onChange(undefined);
          return;
        }
        const d = parseYmd(v);
        onChange(d ?? undefined);
      }}
    />
  );
}

export { parseYmd, toYmd, formatDisplay };
