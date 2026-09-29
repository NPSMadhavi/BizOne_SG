import { useState, useEffect, useRef, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Check, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export interface LedgerAccount {
  id: number;
  code: string;
  name: string;
  type: string;
  isActive: boolean;
}

const TYPE_ORDER = ["asset", "liability", "equity", "revenue", "expense"] as const;
type AccountType = typeof TYPE_ORDER[number];

const TYPE_LABELS: Record<string, string> = {
  asset: "Assets",
  liability: "Liabilities",
  equity: "Equity",
  revenue: "Revenue",
  expense: "Expenses",
};

const SUB_TYPES: Record<AccountType, { value: string; label: string }[]> = {
  asset:     [{ value: "current_asset", label: "Current Asset" }, { value: "fixed_asset", label: "Fixed Asset" }],
  liability: [{ value: "current_liability", label: "Current Liability" }, { value: "long_term_liability", label: "Long-term Liability" }],
  equity:    [{ value: "share_capital", label: "Share Capital" }, { value: "retained_earnings", label: "Retained Earnings" }],
  revenue:   [{ value: "sales", label: "Sales Revenue" }, { value: "other_income", label: "Other Income" }],
  expense:   [{ value: "cost_of_sales", label: "Cost of Sales" }, { value: "operating_expense", label: "Operating Expense" }],
};

interface AccountCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (account: LedgerAccount) => void;
  defaultType?: AccountType;
}

function AccountCreateDialog({ open, onOpenChange, onCreated, defaultType = "expense" }: AccountCreateDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>(defaultType);
  const [subType, setSubType] = useState(SUB_TYPES[defaultType][0].value);
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (open) {
      setCode("");
      setName("");
      setType(defaultType);
      setSubType(SUB_TYPES[defaultType][0].value);
      setDescription("");
    }
  }, [open, defaultType]);

  async function handleSave() {
    if (!code.trim() || !name.trim()) {
      toast({ title: "Code and name are required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          code: code.trim(),
          name: name.trim(),
          type,
          subType,
          description: description.trim() || null,
          isActive: true,
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Failed to create account");
      }
      const created = await res.json();
      await queryClient.invalidateQueries({ queryKey: ["accounts"] });
      toast({ title: "Ledger created." });
      onCreated(created);
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: e.message || "Failed to create ledger", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Ledger</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Account Code <span className="text-destructive">*</span></Label>
            <Input placeholder="" value={code} onChange={e => setCode(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Account Name <span className="text-destructive">*</span></Label>
            <Input placeholder="" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Account Type <span className="text-destructive">*</span></Label>
            <Select
              value={type}
              onValueChange={v => {
                const t = v as AccountType;
                setType(t);
                setSubType(SUB_TYPES[t][0].value);
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TYPE_ORDER.map(t => (
                  <SelectItem key={t} value={t}>{TYPE_LABELS[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Sub-type</Label>
            <Select value={subType} onValueChange={setSubType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(SUB_TYPES[type] || []).map(s => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Description <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
            <Textarea
              rows={2}
              placeholder=""
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="resize-none"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Create Ledger"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface LedgerComboboxProps {
  accounts: LedgerAccount[];
  value: number | null;
  onChange: (account: LedgerAccount) => void;
}

export function LedgerCombobox({ accounts, value, onChange }: LedgerComboboxProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const selected = accounts.find(a => a.id === value);
  const selectedLabel = selected ? `${selected.code} — ${selected.name}` : "";
  const displayValue = open ? query : selectedLabel;

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    const active = accounts.filter(a => a.isActive);
    if (!q) return active;
    return active.filter(a =>
      a.code.toLowerCase().includes(q) ||
      a.name.toLowerCase().includes(q) ||
      (TYPE_LABELS[a.type] || a.type).toLowerCase().includes(q)
    );
  }, [accounts, query]);

  const grouped = useMemo(() =>
    TYPE_ORDER
      .map(type => ({ type, accs: filtered.filter(a => a.type === type) }))
      .filter(g => g.accs.length > 0),
  [filtered]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <>
      <div ref={wrapperRef} className="relative">
        <Input
          placeholder=""
          value={displayValue}
          onFocus={() => { setOpen(true); setQuery(""); }}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onKeyDown={e => { if (e.key === "Escape") { setOpen(false); setQuery(""); } }}
          autoComplete="off"
        />
        {open && (
          <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-md max-h-64 overflow-y-auto">
            <div
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-primary cursor-pointer hover:bg-accent sticky top-0 bg-popover border-b z-10"
              onMouseDown={e => {
                e.preventDefault();
                setOpen(false);
                setQuery("");
                setCreateOpen(true);
              }}
            >
              <Plus className="h-4 w-4 shrink-0" />
              Create
            </div>
            {grouped.length === 0 ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">No ledgers found</div>
            ) : (
              grouped.map(({ type, accs }) => (
                <div key={type}>
                  <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground bg-muted/40 sticky top-9">
                    {TYPE_LABELS[type] || type}
                  </div>
                  {accs.map(a => (
                    <div
                      key={a.id}
                      className={cn(
                        "flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground",
                        value === a.id && "bg-accent/60 font-medium"
                      )}
                      onMouseDown={e => {
                        e.preventDefault();
                        onChange(a);
                        setOpen(false);
                        setQuery("");
                      }}
                    >
                      {value === a.id ? <Check className="h-3.5 w-3.5 shrink-0 text-primary" /> : <span className="w-3.5 shrink-0" />}
                      <span className="font-mono text-xs text-muted-foreground w-12 shrink-0">{a.code}</span>
                      <span className="truncate">{a.name}</span>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <AccountCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        defaultType="expense"
        onCreated={(account) => onChange(account)}
      />
    </>
  );
}
