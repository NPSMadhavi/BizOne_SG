import { SyncBridgeDateObjectPicker, toYmd } from "@/components/ui/sync-bridge-date-picker";
import type { SyncBridgeDateObjectPickerProps } from "@/components/ui/sync-bridge-date-picker";

export interface SimpleDatePickerProps extends Omit<SyncBridgeDateObjectPickerProps, "value" | "onChange"> {
  date?: Date | null;
  setDate: (date?: Date | null) => void;
  placeholder?: string;
}

export function SimpleDatePicker({
  date,
  setDate,
  placeholder,
  ...props
}: SimpleDatePickerProps) {
  return (
    <SyncBridgeDateObjectPicker
      value={date ?? undefined}
      onChange={(d) => setDate(d ?? null)}
      placeholder={placeholder}
      mode="date"
      {...props}
    />
  );
}

export { toYmd };
