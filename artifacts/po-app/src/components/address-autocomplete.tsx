import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { AUTOFILL_BLOCK_TOKEN } from "@/lib/block-browser-suggestions";

interface AddressAutocompleteProps {
  value: string;
  onChange: (address: string) => void;
  onPostalCodeChange?: (postalCode: string) => void;
  country?: string;
  placeholder?: string;
  rows?: number;
  className?: string;
  disabled?: boolean;
}

export function AddressAutocomplete({
  value,
  onChange,
  placeholder = "",
  rows = 2,
  className,
  disabled,
}: AddressAutocompleteProps) {
  return (
    <div className="relative">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
        name="line-notes"
        autoComplete={AUTOFILL_BLOCK_TOKEN}
        autoCorrect="off"
        spellCheck={false}
        data-1p-ignore="true"
        data-lpignore="true"
        data-form-type="other"
        data-bwignore="true"
        className={cn(
          "flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-none pr-8",
          className
        )}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
