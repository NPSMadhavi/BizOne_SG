/**
 * DatePicker — ISO / YYYY-MM-DD strings with SyncBridge calendar UI.
 */
import { SyncBridgeDatePicker, type SyncBridgeDatePickerProps } from "@/components/ui/sync-bridge-date-picker";
import { SyncBridgeDateObjectPicker } from "@/components/ui/sync-bridge-date-picker";

export interface StringDatePickerProps extends Omit<SyncBridgeDatePickerProps, "value" | "onChange"> {
  value?: string | null;
  onChange: (value?: string | null) => void;
}

export function StringDatePicker({ value, onChange, ...props }: StringDatePickerProps) {
  return (
    <SyncBridgeDatePicker
      value={value ?? ""}
      onChange={(v) => onChange(v || null)}
      mode="date"
      {...props}
    />
  );
}

/** Date object variant for react-hook-form fields that use Date */
export interface DatePickerProps {
  date?: Date | null;
  setDate: (date?: Date | null) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  min?: string;
  max?: string;
  disabledDate?: (date: Date) => boolean;
}

export function DatePicker({ date, setDate, ...props }: DatePickerProps) {
  return (
    <SyncBridgeDateObjectPicker
      value={date ?? undefined}
      onChange={(d) => setDate(d ?? null)}
      mode="date"
      {...props}
    />
  );
}

export { SyncBridgeDatePicker, SyncBridgeDateObjectPicker, parseYmd, toYmd, formatDisplay } from "@/components/ui/sync-bridge-date-picker";
