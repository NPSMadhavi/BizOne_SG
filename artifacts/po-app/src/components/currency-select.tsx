import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { CURRENCIES } from "@/lib/currencies";
import { cn } from "@/lib/utils";

interface CurrencySelectProps {
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
}

export function CurrencySelect({
  value,
  onValueChange,
  disabled = false,
  className,
  placeholder = "Select currency…",
}: CurrencySelectProps) {
  const [open, setOpen] = useState(false);

  const selected = CURRENCIES.find((c) => c.code === value);
  const displayLabel = selected ? selected.label : (value || placeholder);

  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "w-full justify-between font-normal h-9 bg-background px-3 text-left",
            !selected && !value && "text-muted-foreground",
            className
          )}
        >
          <span className="truncate">{displayLabel}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] min-w-[320px] p-0"
        align="start"
      >
        <Command>
          <CommandInput placeholder="Search currency by code or name…" className="h-9" />
          <CommandList className="max-h-60 overflow-y-auto">
            <CommandEmpty>No currency found.</CommandEmpty>
            <CommandGroup>
              {CURRENCIES.map((c) => (
                <CommandItem
                  key={c.code}
                  value={`${c.code} ${c.label} ${c.name} ${c.symbol}`}
                  onSelect={() => {
                    onValueChange(c.code);
                    setOpen(false);
                  }}
                  className="flex items-center justify-between cursor-pointer py-2 px-2.5"
                >
                  <div className="flex items-center gap-2 truncate">
                    <Check
                      className={cn(
                        "h-4 w-4 shrink-0",
                        value === c.code ? "opacity-100 text-primary" : "opacity-0"
                      )}
                    />
                    <span className="font-semibold">{c.code}</span>
                    <span className="text-muted-foreground text-xs truncate">— {c.name}</span>
                  </div>
                  <span className="text-xs font-mono text-muted-foreground ml-2 shrink-0">
                    {c.symbol}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
