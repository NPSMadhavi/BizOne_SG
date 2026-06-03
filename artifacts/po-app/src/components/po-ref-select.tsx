import { useState } from "react";
import { useListPurchaseOrders } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface PORefSelectProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function PORefSelect({ value, onChange, placeholder = "e.g. PO-0001" }: PORefSelectProps) {
  const [open, setOpen] = useState(false);
  const { data: pos = [] } = useListPurchaseOrders();
  const allPoNumbers: string[] = (pos as any[]).map((po: any) => po.poNumber).filter(Boolean);
  const filtered = value
    ? allPoNumbers.filter(pn => pn.toLowerCase().includes(value.toLowerCase()))
    : allPoNumbers;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div className="relative">
          <Input
            placeholder={placeholder}
            value={value}
            onChange={e => onChange(e.target.value)}
            onFocus={() => setOpen(true)}
            className="pr-8"
          />
          <button
            type="button"
            tabIndex={-1}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            onClick={() => setOpen(v => !v)}
          >
            <ChevronsUpDown className="h-3.5 w-3.5" />
          </button>
        </div>
      </PopoverTrigger>
      <PopoverContent
        className="p-0"
        style={{ width: "var(--radix-popover-trigger-width)" }}
        align="start"
        onOpenAutoFocus={e => e.preventDefault()}
      >
        <Command>
          <CommandList>
            {filtered.length === 0 ? (
              <CommandEmpty className="py-2 text-center text-xs text-muted-foreground">
                No existing POs match — typed value will be used.
              </CommandEmpty>
            ) : (
              <CommandGroup heading={`${allPoNumbers.length} Purchase Order${allPoNumbers.length !== 1 ? "s" : ""}`}>
                {filtered.map(pn => (
                  <CommandItem
                    key={pn}
                    value={pn}
                    onSelect={() => {
                      onChange(pn);
                      setOpen(false);
                    }}
                  >
                    <Check className={cn("mr-2 h-3.5 w-3.5 shrink-0", value === pn ? "opacity-100" : "opacity-0")} />
                    {pn}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
