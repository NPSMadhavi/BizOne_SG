import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

type VendorRow = {
  id: number;
  name: string;
  isActive?: boolean;
  currency?: string | null;
};

export function VendorPayeeField({
  id,
  value,
  onChange,
  kind = "vendor",
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  kind?: "vendor" | "customer";
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const isCustomer = kind === "customer";
  const endpoint = isCustomer ? "/api/customers" : "/api/vendors";
  const noun = isCustomer ? "customer" : "vendor";

  const { data: vendors = [] } = useQuery<VendorRow[]>({
    queryKey: [endpoint],
    queryFn: async () => {
      const res = await fetch(endpoint, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const active = useMemo(
    () => vendors.filter((vendor) => vendor.isActive !== false && vendor.name?.trim()),
    [vendors],
  );

  const query = value.trim().toLowerCase();
  const matches = useMemo(() => {
    const filtered = query
      ? active.filter((vendor) => vendor.name.toLowerCase().includes(query))
      : active;
    return filtered.slice(0, 50);
  }, [active, query]);

  const exact = active.find((vendor) => vendor.name.trim().toLowerCase() === query);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  return (
    <div ref={wrapRef} className="relative">
      <Input
        id={id}
        value={value}
        placeholder={isCustomer ? "Search customers or type a name" : "Search vendors or type a name"}
        autoComplete="off"
        className={cn(exact && "border-primary/40 bg-primary/5")}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
      />
      {open && (
        <div className="absolute z-50 mt-1 max-h-52 w-full overflow-y-auto rounded-md border bg-popover shadow-lg">
          {matches.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              {query ? `No ${noun}s matching "${value.trim()}"` : `No ${noun}s in directory`}
            </div>
          ) : (
            matches.map((vendor) => (
              <button
                key={vendor.id}
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                onMouseDown={(event) => {
                  event.preventDefault();
                  onChange(vendor.name);
                  setOpen(false);
                }}
              >
                <Check className={cn("h-3.5 w-3.5 shrink-0", exact?.id === vendor.id ? "opacity-100" : "opacity-0")} />
                <span className="min-w-0 flex-1 truncate">{vendor.name}</span>
                {vendor.currency ? <span className="text-xs text-muted-foreground">{vendor.currency}</span> : null}
              </button>
            ))
          )}
        </div>
      )}
      {query && !exact && (
        <p className="mt-1 text-xs text-muted-foreground">Not in the {noun} list — this name will be saved as typed.</p>
      )}
    </div>
  );
}
