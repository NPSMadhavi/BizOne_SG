import { useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";

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
  const [mode, setMode] = useState<"preset" | "custom">(() =>
    value && !PRESET_TERMS.includes(value) ? "custom" : "preset"
  );

  // Sync mode when value is reset externally (e.g. form.reset() on edit pages)
  useEffect(() => {
    if (PRESET_TERMS.includes(value)) {
      setMode("preset");
    } else if (value !== "") {
      // Non-empty value that isn't a preset → show in custom input
      setMode("custom");
    }
  }, [value]);

  const handleSelect = (v: string) => {
    if (v === "__custom__") {
      setMode("custom");
      onChange("");
    } else {
      setMode("preset");
      onChange(v);
    }
  };

  if (mode === "custom") {
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
          onClick={() => { setMode("preset"); onChange(""); }}
        >
          Use preset
        </button>
      </div>
    );
  }

  return (
    <Select value={value || "__placeholder__"} onValueChange={handleSelect}>
      <SelectTrigger>
        <SelectValue placeholder="Select payment terms" />
      </SelectTrigger>
      <SelectContent>
        {PRESET_TERMS.map(t => (
          <SelectItem key={t} value={t}>{t}</SelectItem>
        ))}
        <SelectItem value="__custom__">Custom...</SelectItem>
      </SelectContent>
    </Select>
  );
}
