import { useRef, useState } from "react";
import { Check, ChevronsUpDown, ChevronDown } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { COUNTRIES } from "@/operations-8june/lib/countries";

type CountrySelectProps = {
  value?: string;
  onChange: (value: string) => void;
  /** Use a single chevron (e.g. company modals) instead of up/down pair */
  singleChevron?: boolean;
  /** Hide the trigger chevron icon */
  hideChevron?: boolean;
  /** Override trigger styling so the control matches the host form's inputs */
  className?: string;
};

/** Keep wheel/touch scroll inside the list when rendered inside a Dialog */
const keepScrollInList = (e: React.WheelEvent | React.TouchEvent) => {
  e.stopPropagation();
};

export function CountrySelect({ value, onChange, singleChevron = false, hideChevron = false, className }: CountrySelectProps) {
  const [open, setOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const displayValue = value?.trim() || "";

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm",
            "hover:bg-background focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0",
            "disabled:cursor-not-allowed disabled:opacity-50",
            className
          )}
        >
          <span className={cn("truncate text-left", !displayValue && "text-muted-foreground")}>
            {displayValue || "Select Country"}
          </span>
          {!hideChevron && (
            singleChevron ? (
              <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            ) : (
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            )
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="z-[200] w-[var(--radix-popover-trigger-width)] p-0"
        align="start"
        onWheel={keepScrollInList}
        onTouchMove={keepScrollInList}
      >
        <Command className="overflow-visible">
          <CommandInput placeholder="Search country..." />
          <CommandList
            ref={listRef}
            className="max-h-[280px] overflow-y-auto overflow-x-hidden overscroll-y-contain touch-pan-y [scrollbar-width:thin]"
            onWheel={(e) => {
              e.stopPropagation();
              e.preventDefault();
              const list = listRef.current;
              if (list) {
                list.scrollTop += e.deltaY;
              }
            }}
            onTouchMove={keepScrollInList}
          >
            <CommandEmpty>No country found.</CommandEmpty>
            <CommandGroup className="overflow-visible">
              {COUNTRIES.map((country) => (
                <CommandItem
                  key={country}
                  value={country}
                  onSelect={() => {
                    onChange(country);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4 shrink-0",
                      displayValue === country ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {country}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
