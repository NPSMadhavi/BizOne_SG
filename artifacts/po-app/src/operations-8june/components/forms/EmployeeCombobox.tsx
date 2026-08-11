import { useRef, useState } from "react";
import { Check } from "lucide-react";
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

export type EmployeeComboboxOption = {
  id: number | string;
  name?: string | null;
  employeeId?: string | null;
  designation?: string | null;
  department?: string | null;
};

function employeeLabel(employee: EmployeeComboboxOption) {
  const name = employee.name || "Employee";
  const code = employee.employeeId ? ` (${employee.employeeId})` : "";
  const designation = employee.designation ? ` — ${employee.designation}` : "";
  return `${name}${code}${designation}`;
}

function employeeSearchValue(employee: EmployeeComboboxOption) {
  return [
    employee.name,
    employee.employeeId,
    employee.designation,
    employee.department,
  ]
    .filter(Boolean)
    .join(" ");
}

type EmployeeComboboxProps = {
  employees: EmployeeComboboxOption[];
  value?: number | string | null;
  onChange: (id: number) => void;
  disabled?: boolean;
  loading?: boolean;
  placeholder?: string;
  searchPlaceholder?: string;
  className?: string;
};

/** Keep wheel/touch scroll inside the list when rendered inside a Dialog/page */
const keepScrollInList = (e: React.WheelEvent | React.TouchEvent) => {
  e.stopPropagation();
};

export function EmployeeCombobox({
  employees,
  value,
  onChange,
  disabled = false,
  loading = false,
  placeholder = "Select employee",
  searchPlaceholder = "Search employee...",
  className,
}: EmployeeComboboxProps) {
  const [open, setOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const selected = employees.find((e) => Number(e.id) === Number(value));
  const display = selected ? employeeLabel(selected) : "";

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          disabled={disabled || loading}
          className={cn(
            "flex h-10 w-full items-center justify-between rounded-md border border-[#E5E7EB] bg-white px-3 py-2 text-sm text-[#111827] shadow-sm",
            "hover:bg-white focus:outline-none focus-visible:ring-0",
            "disabled:cursor-not-allowed disabled:opacity-50",
            className
          )}
        >
          <span className={cn("truncate text-left", !display && "text-[#9CA3AF]")}>
            {loading ? "Loading employees..." : display || placeholder}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="z-[200] w-[var(--radix-popover-trigger-width)] p-0"
        align="start"
        onWheel={keepScrollInList}
        onTouchMove={keepScrollInList}
      >
        <Command className="overflow-visible">
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList
            ref={listRef}
            className="max-h-[14rem] overflow-y-auto overflow-x-hidden overscroll-y-contain touch-pan-y [scrollbar-width:thin]"
            onWheel={(e) => {
              e.stopPropagation();
              e.preventDefault();
              const list = listRef.current;
              if (list) list.scrollTop += e.deltaY;
            }}
            onTouchMove={keepScrollInList}
          >
            <CommandEmpty>No employee found.</CommandEmpty>
            <CommandGroup className="overflow-visible">
              {employees.map((employee) => {
                const id = Number(employee.id);
                const selectedId = Number(value);
                return (
                  <CommandItem
                    key={String(employee.id)}
                    value={employeeSearchValue(employee)}
                    onSelect={() => {
                      onChange(id);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4 shrink-0",
                        selectedId === id ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <span className="truncate">{employeeLabel(employee)}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
