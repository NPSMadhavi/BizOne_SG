import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/auth-context";

export type InvoiceRefOption = {
  id: number;
  invNumber: string;
  customerName: string;
  customerAddress?: string | null;
  customerContact?: string | null;
  customerContactEmail?: string | null;
  currency?: string;
  paymentTerms?: string | null;
  notes?: string | null;
  subtotal?: number | string;
  discountAmount?: number | string;
  tax?: number | string;
  totalAmount?: number | string;
  status?: string;
  issueDate?: string | null;
  items?: any[];
};

export type InvoiceRefSource = "sales" | "vendor";

interface InvoiceRefPickerProps {
  value: string;
  onChange: (invNumber: string) => void;
  onSelectInvoice: (invoice: InvoiceRefOption) => void;
  /** Called when user finishes typing (Enter / blur) without picking a list row */
  onCommitTyped?: (invNumber: string) => void;
  /** sales = customer invoices (credit notes); vendor = vendor invoices (debit notes) */
  source?: InvoiceRefSource;
  disabled?: boolean;
  loading?: boolean;
  placeholder?: string;
}

function mapVendorInvoiceToOption(row: any): InvoiceRefOption {
  return {
    id: row.id,
    invNumber: row.piNumber || "",
    customerName: row.vendorName || "",
    customerAddress: row.vendorAddress || null,
    customerContact: row.vendorContact || row.contactPerson || null,
    customerContactEmail: row.vendorContactEmail || row.contactEmail || null,
    currency: row.currency || "SGD",
    paymentTerms: row.paymentTerms || null,
    notes: row.notes || null,
    subtotal: row.subtotal,
    discountAmount: row.discountAmount,
    tax: row.tax ?? row.gstAmount,
    totalAmount: row.totalAmount,
    status: row.status,
    issueDate: row.piDate || null,
    items: Array.isArray(row.items) ? row.items : [],
  };
}

export function InvoiceRefPicker({
  value,
  onChange,
  onSelectInvoice,
  onCommitTyped,
  source = "sales",
  disabled,
  loading,
  placeholder = "Type or search invoice no…",
}: InvoiceRefPickerProps) {
  const { selectedCompany } = useAuth();
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const skipBlurCommit = useRef(false);
  const isVendor = source === "vendor";

  const { data: invoices = [], isLoading } = useQuery<InvoiceRefOption[]>({
    queryKey: [isVendor ? "vendor-invoices-for-dn-ref" : "invoices-for-cn-ref", selectedCompany?.id],
    queryFn: async () => {
      if (isVendor) {
        const res = await fetch("/api/vendor-invoices", { credentials: "include" });
        if (!res.ok) return [];
        const rows = await res.json();
        return (Array.isArray(rows) ? rows : [])
          .filter((row: any) => row.status !== "cancelled" && row.status !== "void")
          .map(mapVendorInvoiceToOption);
      }
      const res = await fetch("/api/invoices", { credentials: "include" });
      if (!res.ok) return [];
      const rows = await res.json();
      return (rows as InvoiceRefOption[]).filter(
        (inv) => inv.status !== "cancelled" && inv.status !== "void"
      );
    },
  });

  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return invoices;
    return invoices.filter(
      (inv) =>
        inv.invNumber.toLowerCase().includes(q) ||
        (inv.customerName || "").toLowerCase().includes(q)
    );
  }, [invoices, value]);

  useEffect(() => {
    setHighlighted(0);
  }, [filtered.length, value]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function pick(inv: InvoiceRefOption) {
    skipBlurCommit.current = true;
    onChange(inv.invNumber);
    onSelectInvoice(inv);
    setOpen(false);
  }

  function commitTyped() {
    const v = value.trim();
    if (!v) return;
    const exact = invoices.find((inv) => inv.invNumber.toLowerCase() === v.toLowerCase());
    if (exact) {
      onSelectInvoice(exact);
      return;
    }
    onCommitTyped?.(v);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      if (filtered.length > 0) {
        setHighlighted((h) => Math.min(h + 1, filtered.length - 1));
      }
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (filtered.length > 0) {
        setHighlighted((h) => Math.max(h - 1, 0));
      }
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (open && filtered[highlighted]) {
        pick(filtered[highlighted]);
      } else {
        setOpen(false);
        commitTyped();
      }
      return;
    }
    if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const emptyLabel = isVendor ? "No vendor invoices found" : "No invoices found";
  const loadingLabel = isVendor ? "Loading vendor invoices…" : "Loading invoices…";

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative w-full">
        <Input
          value={value}
          disabled={disabled || loading}
          placeholder={placeholder}
          className="h-10 w-full pr-10 text-sm"
          autoComplete="nope"
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onBlur={() => {
            // Allow click on list item before blur commit
            window.setTimeout(() => {
              if (skipBlurCommit.current) {
                skipBlurCommit.current = false;
                return;
              }
              setOpen(false);
              commitTyped();
            }, 150);
          }}
          onKeyDown={handleKeyDown}
        />
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled || loading}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-muted-foreground hover:text-foreground disabled:opacity-50"
          onMouseDown={(e) => {
            e.preventDefault();
            setOpen((o) => !o);
          }}
          aria-label={isVendor ? "Toggle vendor invoice list" : "Toggle invoice list"}
        >
          {loading || isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ChevronsUpDown className="h-4 w-4 opacity-60" />
          )}
        </button>
      </div>

      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-[280px] max-h-64 overflow-auto rounded-md border bg-popover text-popover-foreground shadow-md">
          {isLoading ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">{loadingLabel}</div>
          ) : filtered.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              {value.trim()
                ? "No match — keep typing and press Enter to load"
                : emptyLabel}
            </div>
          ) : (
            <ul className="py-1">
              {filtered.slice(0, 50).map((inv, idx) => {
                const active = idx === highlighted;
                const isSelected = value.trim().toLowerCase() === inv.invNumber.toLowerCase();
                return (
                  <li key={inv.id}>
                    <button
                      type="button"
                      className={cn(
                        "flex w-full items-start gap-2 px-3 py-2 text-left text-sm",
                        active ? "bg-accent text-accent-foreground" : "hover:bg-muted/60"
                      )}
                      onMouseEnter={() => setHighlighted(idx)}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        pick(inv);
                      }}
                    >
                      <div className="flex min-w-0 flex-1 flex-col">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-medium">{inv.invNumber}</span>
                          {inv.status ? (
                            <span className="text-[10px] uppercase text-muted-foreground">{inv.status}</span>
                          ) : null}
                        </div>
                        <span className="truncate text-xs text-muted-foreground">{inv.customerName}</span>
                      </div>
                      {isSelected ? <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
