import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Plus, Trash2, CheckCircle2, AlertTriangle, ChevronsUpDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface Account {
  id: number;
  code: string;
  name: string;
  type: string;
  subType: string;
  isActive: boolean;
}

interface JournalLine {
  accountId: number | null;
  description: string;
  debit: string;
  credit: string;
}

const TYPE_ORDER = ["asset", "liability", "equity", "revenue", "expense"];
const TYPE_LABELS: Record<string, string> = {
  asset: "Assets", liability: "Liabilities", equity: "Equity",
  revenue: "Revenue", expense: "Expenses",
};

const blankLine = (): JournalLine => ({ accountId: null, description: "", debit: "", credit: "" });

function getToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function parseAmt(s: string): number {
  const n = parseFloat(s.replace(/,/g, ""));
  return isNaN(n) ? 0 : n;
}

async function fetchAccounts(): Promise<Account[]> {
  const res = await fetch("/api/accounts", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch accounts");
  return res.json();
}

async function createEntry(payload: {
  entryDate: string;
  description: string;
  lines: { accountId: number; description: string; debit: number; credit: number }[];
}): Promise<{ id: number }> {
  const res = await fetch("/api/journal-entries", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  if (!res.ok) { const e = await res.json(); throw new Error(e.error || "Failed to create journal entry"); }
  return res.json();
}

function AccountPicker({
  accounts, value, onChange,
}: {
  accounts: Account[];
  value: number | null;
  onChange: (id: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = accounts.find(a => a.id === value);

  const grouped = TYPE_ORDER
    .map(type => ({ type, accs: accounts.filter(a => a.type === type && a.isActive) }))
    .filter(g => g.accs.length > 0);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between font-normal text-left h-9 px-3",
            !selected && "text-muted-foreground"
          )}
        >
          <span className="truncate">
            {selected
              ? <span><span className="font-mono text-xs mr-2 text-muted-foreground">{selected.code}</span>{selected.name}</span>
              : "Select account…"}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search accounts…" className="h-9" />
          <CommandList>
            <CommandEmpty>No account found.</CommandEmpty>
            {grouped.map(({ type, accs }) => (
              <CommandGroup key={type} heading={TYPE_LABELS[type]}>
                {accs.map(a => (
                  <CommandItem
                    key={a.id}
                    value={`${a.code} ${a.name}`}
                    onSelect={() => { onChange(a.id); setOpen(false); }}
                    className="gap-2"
                  >
                    <span className="font-mono text-xs text-muted-foreground w-10 shrink-0">{a.code}</span>
                    <span className="flex-1">{a.name}</span>
                    {a.id === value && <Check className="h-3.5 w-3.5 shrink-0" />}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default function JournalEntryNew() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [entryDate, setEntryDate] = useState(getToday());
  const [description, setDescription] = useState("");
  const [lines, setLines] = useState<JournalLine[]>([blankLine(), blankLine()]);
  const [submitting, setSubmitting] = useState(false);

  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts"],
    queryFn: fetchAccounts,
  });

  const createMutation = useMutation({
    mutationFn: createEntry,
    onSuccess: (data) => {
      toast({ title: "Journal entry created." });
      setLocation(`/accounting/journal-entries/${data.id}`);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
      setSubmitting(false);
    },
  });

  const setLine = useCallback((idx: number, patch: Partial<JournalLine>) => {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, ...patch } : l));
  }, []);

  const addLine = () => setLines(prev => [...prev, blankLine()]);

  const removeLine = (idx: number) => {
    if (lines.length <= 2) return;
    setLines(prev => prev.filter((_, i) => i !== idx));
  };

  const totalDebit  = lines.reduce((s, l) => s + parseAmt(l.debit),  0);
  const totalCredit = lines.reduce((s, l) => s + parseAmt(l.credit), 0);
  const diff        = Math.abs(totalDebit - totalCredit);
  const isBalanced  = diff < 0.005;
  const fmtAmt      = (n: number) => n > 0
    ? new Intl.NumberFormat("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
    : "—";

  // Auto-fill the other side when a line has one amount and nothing on the other
  function handleAmountBlur(idx: number, side: "debit" | "credit") {
    const line = lines[idx];
    const val = parseAmt(line[side]);
    if (val <= 0) return;
    // If only one line has the opposite side empty and the balance needs it, fill
    const otherSide = side === "debit" ? "credit" : "debit";
    const remaining = side === "debit" ? totalDebit - totalCredit : totalCredit - totalDebit;
    const emptyOthers = lines.filter((l, i) => i !== idx && parseAmt(l[otherSide]) === 0 && parseAmt(l[side]) === 0);
    if (emptyOthers.length === 1 && Math.abs(remaining) > 0.005) {
      const emptyIdx = lines.findIndex((l, i) => i !== idx && parseAmt(l[otherSide]) === 0 && parseAmt(l[side]) === 0);
      if (emptyIdx >= 0) {
        setLine(emptyIdx, { [otherSide]: Math.abs(remaining).toFixed(2) });
      }
    }
  }

  async function handleSubmit() {
    if (!entryDate) { toast({ title: "Entry date is required", variant: "destructive" }); return; }
    if (!description.trim()) { toast({ title: "Description is required", variant: "destructive" }); return; }

    const filledLines = lines.filter(l => l.accountId !== null && (parseAmt(l.debit) > 0 || parseAmt(l.credit) > 0));
    if (filledLines.length < 2) {
      toast({ title: "At least 2 filled lines are required", variant: "destructive" }); return;
    }
    if (!isBalanced) {
      toast({ title: "Entry is not balanced", description: `Difference: ${diff.toFixed(2)}`, variant: "destructive" }); return;
    }
    const invalidLine = filledLines.find(l => parseAmt(l.debit) > 0 && parseAmt(l.credit) > 0);
    if (invalidLine) {
      toast({ title: "A line cannot have both debit and credit", variant: "destructive" }); return;
    }

    setSubmitting(true);
    createMutation.mutate({
      entryDate,
      description: description.trim(),
      lines: filledLines.map(l => ({
        accountId:   l.accountId!,
        description: l.description.trim(),
        debit:       parseAmt(l.debit),
        credit:      parseAmt(l.credit),
      })),
    });
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/accounting/journal-entries")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">New Journal Entry</h1>
          <p className="text-muted-foreground mt-1">Create a balanced double-entry journal.</p>
        </div>
      </div>

      {/* Entry details */}
      <Card>
        <CardHeader className="pb-4"><CardTitle className="text-lg">Entry Details</CardTitle></CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="entry-date">Entry Date <span className="text-destructive">*</span></Label>
            <Input
              id="entry-date"
              type="date"
              value={entryDate}
              max={getToday()}
              onChange={e => setEntryDate(e.target.value)}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="entry-desc">Description <span className="text-destructive">*</span></Label>
            <Textarea
              id="entry-desc"
              placeholder="e.g. Record sales revenue for June 2026"
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              className="resize-none"
            />
          </div>
        </CardContent>
      </Card>

      {/* Lines */}
      <Card className="overflow-hidden">
        <CardHeader className="pb-4 border-b bg-muted/20">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Journal Lines</CardTitle>
            {/* Balance indicator */}
            {(totalDebit > 0 || totalCredit > 0) && (
              <div className={cn(
                "flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-md",
                isBalanced ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
              )}>
                {isBalanced
                  ? <><CheckCircle2 className="h-4 w-4" /> Balanced</>
                  : <><AlertTriangle className="h-4 w-4" /> Off by {diff.toFixed(2)}</>
                }
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {/* Column headers */}
          <div className="grid grid-cols-[1fr_1fr_120px_120px_40px] gap-2 px-4 py-2 bg-muted/30 border-b text-xs font-medium text-muted-foreground uppercase tracking-wide">
            <span>Account</span>
            <span>Note (optional)</span>
            <span className="text-right">Debit (SGD)</span>
            <span className="text-right">Credit (SGD)</span>
            <span />
          </div>

          <div className="divide-y">
            {lines.map((line, idx) => (
              <div
                key={idx}
                className="grid grid-cols-[1fr_1fr_120px_120px_40px] gap-2 px-4 py-3 items-center"
              >
                {/* Account picker */}
                <AccountPicker
                  accounts={accounts}
                  value={line.accountId}
                  onChange={id => setLine(idx, { accountId: id })}
                />

                {/* Note */}
                <Input
                  placeholder="Optional note…"
                  value={line.description}
                  onChange={e => setLine(idx, { description: e.target.value })}
                  className="h-9"
                />

                {/* Debit */}
                <Input
                  placeholder="0.00"
                  value={line.debit}
                  onChange={e => setLine(idx, { debit: e.target.value, credit: e.target.value ? "" : line.credit })}
                  onBlur={() => handleAmountBlur(idx, "debit")}
                  className={cn("h-9 text-right font-mono", parseAmt(line.debit) > 0 && "bg-blue-50")}
                  disabled={parseAmt(line.credit) > 0}
                />

                {/* Credit */}
                <Input
                  placeholder="0.00"
                  value={line.credit}
                  onChange={e => setLine(idx, { credit: e.target.value, debit: e.target.value ? "" : line.debit })}
                  onBlur={() => handleAmountBlur(idx, "credit")}
                  className={cn("h-9 text-right font-mono", parseAmt(line.credit) > 0 && "bg-amber-50")}
                  disabled={parseAmt(line.debit) > 0}
                />

                {/* Remove */}
                <Button
                  variant="ghost" size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => removeLine(idx)}
                  disabled={lines.length <= 2}
                  tabIndex={-1}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>

          {/* Totals row */}
          <div className="grid grid-cols-[1fr_1fr_120px_120px_40px] gap-2 px-4 py-3 border-t bg-muted/30 items-center">
            <div className="col-span-2">
              <Button
                type="button" variant="ghost" size="sm"
                className="gap-1.5 h-7 text-xs text-muted-foreground hover:text-foreground"
                onClick={addLine}
              >
                <Plus className="h-3.5 w-3.5" /> Add Line
              </Button>
            </div>
            <div className="text-right font-mono font-semibold text-sm">{fmtAmt(totalDebit)}</div>
            <div className="text-right font-mono font-semibold text-sm">{fmtAmt(totalCredit)}</div>
            <div />
          </div>
        </CardContent>
      </Card>

      {/* Action buttons */}
      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={() => setLocation("/accounting/journal-entries")}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={submitting || !isBalanced || totalDebit === 0}
          className="gap-2 min-w-36"
        >
          {submitting ? "Posting…" : "Post Journal Entry"}
        </Button>
      </div>
    </div>
  );
}
