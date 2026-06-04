import { useState } from "react";
import { Input } from "@/components/ui/input";
import { ChevronDown } from "lucide-react";

const PRESET_TERMS = [
  "Immediate",
  "7 Days Net",
  "14 Days Net",
  "30 Days Net",
  "45 Days Net",
  "60 Days Net",
  "Cash On Delivery",
  "Advance Payment",
];

interface PaymentTermsSelectProps {
  value?: string;
  onChange: (val: string) => void;
}

export function PaymentTermsSelect({ value = "", onChange }: PaymentTermsSelectProps) {
  // Custom mode: value is non-empty and not in the preset list
  const isCustomValue = !!value && !PRESET_TERMS.includes(value);
  const [customMode, setCustomMode] = useState(isCustomValue);

  // When value changes externally (form.reset), sync custom mode
  // Using derived state is safe here — we only override the user's
  // explicit toggle when the value is clearly a preset.
  const effectiveCustomMode = isCustomValue || customMode;

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value;
    if (v === "__custom__") {
      setCustomMode(true);
      onChange("");
    } else {
      setCustomMode(false);
      onChange(v);
    }
  };

  if (effectiveCustomMode) {
    return (
      <div className="flex gap-2">
        <Input
          placeholder="e.g. 90 Days Net"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="flex-1"
        />
        <button
          type="button"
          className="text-xs text-muted-foreground underline shrink-0"
          onClick={() => { setCustomMode(false); onChange(""); }}
        >
          Use preset
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <select
        value={value || ""}
        onChange={handleSelectChange}
        className="flex h-10 w-full appearance-none items-center rounded-md border border-input bg-background px-3 py-2 pr-8 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 cursor-pointer"
      >
        <option value="" disabled>Select payment terms</option>
        {PRESET_TERMS.map(t => (
          <option key={t} value={t}>{t}</option>
        ))}
        <option value="__custom__">Custom...</option>
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}
