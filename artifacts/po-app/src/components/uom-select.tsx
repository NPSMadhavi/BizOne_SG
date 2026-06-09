import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const UOM_OPTIONS = [
  "Unit", "Nos", "Pcs", "Set", "Pair", "Lot",
  "Box", "Carton", "Roll", "Sheet",
  "Kg", "g", "L", "mL", "m", "cm",
];

interface UomSelectProps {
  value: string;
  onChange: (value: string) => void;
}

export function UomSelect({ value, onChange }: UomSelectProps) {
  const isKnown = UOM_OPTIONS.includes(value);
  const displayValue = value && !isKnown ? "__custom__" : (value || "");

  return (
    <div className="space-y-1">
      <Select
        value={displayValue}
        onValueChange={(v) => {
          if (v === "__custom__") return;
          onChange(v);
        }}
      >
        <SelectTrigger className="h-8 text-sm w-full">
          <SelectValue placeholder="UOM" />
        </SelectTrigger>
        <SelectContent>
          {UOM_OPTIONS.map((opt) => (
            <SelectItem key={opt} value={opt}>{opt}</SelectItem>
          ))}
          {value && !isKnown && (
            <SelectItem value="__custom__">{value}</SelectItem>
          )}
        </SelectContent>
      </Select>
    </div>
  );
}
