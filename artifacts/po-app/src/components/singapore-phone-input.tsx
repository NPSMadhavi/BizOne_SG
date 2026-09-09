import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  parseSingaporePhoneDigits,
  SG_PHONE_DIGITS,
  SG_PHONE_PREFIX,
} from "@/lib/singapore-phone";

type SingaporePhoneInputProps = {
  value: string;
  onChange: (localDigits: string) => void;
  className?: string;
  id?: string;
  disabled?: boolean;
};

/** Split phone field: fixed +65 prefix + local number (matches register / design mock). */
export function SingaporePhoneInput({
  value,
  onChange,
  className,
  id,
  disabled,
}: SingaporePhoneInputProps) {
  const digits = parseSingaporePhoneDigits(value || "");

  return (
    <div
      className={cn(
        "flex h-9 w-full overflow-hidden rounded-md border border-input bg-background shadow-sm",
        disabled && "opacity-50",
        className,
      )}
    >
      <span className="flex shrink-0 items-center border-r border-input bg-muted/60 px-3 text-sm font-semibold text-foreground">
        {SG_PHONE_PREFIX}
      </span>
      <Input
        id={id}
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        placeholder="9123 4567"
        maxLength={SG_PHONE_DIGITS}
        disabled={disabled}
        value={digits}
        onChange={(e) => onChange(parseSingaporePhoneDigits(e.target.value))}
        className="h-full flex-1 rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
      />
    </div>
  );
}
