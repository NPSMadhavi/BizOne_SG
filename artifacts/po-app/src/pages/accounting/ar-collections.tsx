import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { CreditCard, Search, Loader2, CheckCircle2, Coins, Wallet, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

interface OpenInvoice {
  id: number; invNumber: string; issueDate: string | null;
  totalAmount: number; paidAmount: number; outstanding: number;
  currency: string; status: string;
}
interface DepositInfo { id: number; available: number; currency: string; paymentDate: string; bankRef: string | null }
interface AgingCustomer { customerName: string; total: number }
interface AgingData { customers: AgingCustomer[]; totals: { total: number } }

function fmtAmt(n: number) {
  return new Intl.NumberFormat("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}
function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("en-SG", { day: "2-digit", month: "short", year: "numeric" });
}
function computeFifo(invoices: OpenInvoice[], total: number): Record<number, number> {
  let rem = total;
  const out: Record<number, number> = {};
  for (const inv of invoices) {
    if (rem <= 0.004) break;
    const alloc = Math.min(inv.outstanding, rem);
    if (alloc > 0.004) { out[inv.id] = alloc; rem -= alloc; }
  }
  return out;
}

// ── Inline invoice list shown when customer row is expanded ──────────────────
function CustomerInvoiceDetail({ customerName }: { customerName: string }) {
  const { data, isLoading } = useQuery<{ invoices: OpenInvoice[] }>({
    queryKey: ["ar-customer-invoices", customerName],
    queryFn: async () => {
      const r = await fetch(`/api/ar/customer-invoices?customerName=${encodeURIComponent(customerName)}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load");
      return r.json();
    },
    staleTime: 30_000,
  });

  if (isLoading) return <div className="py-3 text-center text-xs text-gray-400"><Loader2 className="h-3.5 w-3.5 animate-spin inline mr-1.5" />Loading invoices…</div>;
  const invoices = data?.invoices ?? [];
  if (invoices.length === 0) return <div className="py-3 text-center text-xs text-gray-400">No open invoices.</div>;

  const totalOutstanding = invoices.reduce((s, i) => s + i.outstanding, 0);
  const totalInvoice     = invoices.reduce((s, i) => s + i.totalAmount, 0);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50/80">
            <th className="text-left px-4 py-2 font-semibold text-gray-500 uppercase tracking-wider pl-12">Invoice</th>
            <th className="text-left px-4 py-2 font-semibold text-gray-500 uppercase tracking-wider">Date</th>
            <th className="text-right px-4 py-2 font-semibold text-gray-500 uppercase tracking-wider">Invoice Amt</th>
            <th className="text-right px-4 py-2 font-semibold text-gray-500 uppercase tracking-wider">Paid</th>
            <th className="text-right px-4 py-2 font-semibold text-gray-500 uppercase tracking-wider">Outstanding</th>
          </tr>
        </thead>
        <tbody>
          {invoices.map(inv => (
            <tr key={inv.id} className="border-b border-gray-100 hover:bg-gray-50/40">
              <td className="px-4 py-2.5 pl-12 font-mono font-semibold text-gray-700">{inv.invNumber}</td>
              <td className="px-4 py-2.5 text-gray-500">{fmtDate(inv.issueDate)}</td>
              <td className="px-4 py-2.5 text-right font-mono text-gray-600">{fmtAmt(inv.totalAmount)}</td>
              <td className="px-4 py-2.5 text-right font-mono text-gray-400">{fmtAmt(inv.paidAmount)}</td>
              <td className="px-4 py-2.5 text-right font-mono font-semibold text-orange-600">{fmtAmt(inv.outstanding)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-gray-50 border-t-2 border-gray-200">
            <td className="px-4 py-2.5 pl-12 text-xs font-bold text-gray-600 uppercase tracking-wider" colSpan={2}>
              Total ({invoices.length} invoice{invoices.length !== 1 ? "s" : ""})
            </td>
            <td className="px-4 py-2.5 text-right font-mono font-bold text-gray-700">{fmtAmt(totalInvoice)}</td>
            <td className="px-4 py-2.5 text-right font-mono font-bold text-gray-400">{fmtAmt(totalInvoice - totalOutstanding)}</td>
            <td className="px-4 py-2.5 text-right font-mono font-bold text-orange-700">{fmtAmt(totalOutstanding)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ── Bulk Payment Dialog ──────────────────────────────────────────────────────
interface BulkPaymentDialogProps {
  open: boolean; onClose: () => void; customerName: string; onSuccess: () => void;
}

function BulkPaymentDialog({ open, onClose, customerName, onSuccess }: BulkPaymentDialogProps) {
  const today = new Date().toISOString().split("T")[0];
  const { toast } = useToast();
  const [payDate, setPayDate] = useState(today);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("bank_transfer");
  const [bankRef, setBankRef] = useState("");
  const [payNotes, setPayNotes] = useState("");
  const [mode, setMode] = useState<"auto" | "manual">("auto");
  const [manualAmounts, setManualAmounts] = useState<Record<number, string>>({});
  const [manualChecked, setManualChecked] = useState<Set<number>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  const { data: invData, isLoading: invLoading } = useQuery<{ invoices: OpenInvoice[] }>({
    queryKey: ["ar-customer-invoices", customerName],
    queryFn: async () => {
      const r = await fetch(`/api/ar/customer-invoices?customerName=${encodeURIComponent(customerName)}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load invoices");
      return r.json();
    },
    enabled: open && !!customerName,
    staleTime: 10_000,
  });

  const { data: depositData } = useQuery<{ totalBalance: number; deposits: DepositInfo[] }>({
    queryKey: ["ar-customer-deposit", customerName],
    queryFn: async () => {
      const r = await fetch(`/api/ar/customer-deposit?customerName=${encodeURIComponent(customerName)}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    enabled: open && !!customerName,
    staleTime: 10_000,
  });

  const invoices = invData?.invoices ?? [];
  const depositBalance = depositData?.totalBalance ?? 0;
  const totalAmountNum = parseFloat(payAmount) || 0;
  const isCash = payMethod === "cash";

  const fifoAllocations = computeFifo(invoices, totalAmountNum);
  const effectiveAllocations: Record<number, number> = mode === "auto"
    ? fifoAllocations
    : Object.fromEntries([...manualChecked].map(id => [id, parseFloat(manualAmounts[id] || "0") || 0]).filter(([, v]) => (v as number) > 0));

  const totalAllocated = Object.values(effectiveAllocations).reduce((s, v) => s + v, 0);
  const excess = Math.max(0, totalAmountNum - totalAllocated);
  const shortfall = Math.max(0, totalAllocated - totalAmountNum);

  function toggleManual(invId: number, outstanding: number) {
    setManualChecked(prev => {
      const s = new Set(prev);
      if (s.has(invId)) { s.delete(invId); }
      else { s.add(invId); if (!manualAmounts[invId]) setManualAmounts(a => ({ ...a, [invId]: outstanding.toFixed(2) })); }
      return s;
    });
  }

  function reset() {
    setPayDate(today); setPayAmount(""); setPayMethod("bank_transfer");
    setBankRef(""); setPayNotes(""); setMode("auto");
    setManualAmounts({}); setManualChecked(new Set());
  }

  async function handleSubmit() {
    if (!totalAmountNum || totalAmountNum <= 0) { toast({ title: "Enter payment amount", variant: "destructive" }); return; }
    if (totalAllocated < 0.004 && excess < 0.004) { toast({ title: "Nothing to allocate", variant: "destructive" }); return; }
    if (shortfall > 0.004) { toast({ title: "Allocation exceeds payment amount", variant: "destructive" }); return; }
    if (!isCash && !bankRef.trim()) { toast({ title: "Bank reference required for non-cash payments", variant: "destructive" }); return; }

    const allocations = Object.entries(effectiveAllocations)
      .filter(([, amt]) => amt > 0.004)
      .map(([invoiceId, amount]) => ({ invoiceId: parseInt(invoiceId), amount }));

    setSubmitting(true);
    try {
      const r = await fetch("/api/ar/bulk-payment", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ customerName, paymentDate: payDate, paymentMethod: payMethod, bankRef: bankRef.trim() || null, totalAmount: totalAmountNum, allocations, notes: payNotes.trim() || null }),
      });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || "Failed"); }
      const result = await r.json();
      const msgs: string[] = [];
      if (result.processed > 0) msgs.push(`${result.processed} invoice(s) knocked off`);
      if (result.excess > 0.004) msgs.push(`S$${fmtAmt(result.excess)} recorded as customer credit`);
      toast({ title: "Payment recorded", description: msgs.join(" · ") });
      reset(); onSuccess(); onClose();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-emerald-600" />
            Receive Payment — {customerName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Payment Date <span className="text-destructive">*</span></Label>
              <Input type="date" value={payDate} max={today} onChange={e => setPayDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Amount Received (SGD) <span className="text-destructive">*</span></Label>
              <Input type="text" inputMode="decimal" placeholder="0.00" value={payAmount} onChange={e => setPayAmount(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Payment Method</Label>
              <Select value={payMethod} onValueChange={setPayMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                  <SelectItem value="online">Online Payment</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {!isCash && (
              <div className="space-y-1.5">
                <Label>Bank Reference / Transaction ID <span className="text-destructive">*</span></Label>
                <Input placeholder="e.g. OCBC-2026-001234" value={bankRef} onChange={e => setBankRef(e.target.value)} />
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Notes (optional)</Label>
            <Input placeholder="Internal notes" value={payNotes} onChange={e => setPayNotes(e.target.value)} />
          </div>

          <div className="border-t pt-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-gray-700">Allocate to Invoices</p>
              <div className="flex rounded-md border border-gray-200 overflow-hidden text-xs">
                <button className={cn("px-3 py-1.5 font-medium transition-colors", mode === "auto" ? "bg-emerald-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50")} onClick={() => setMode("auto")}>Auto (FIFO)</button>
                <button className={cn("px-3 py-1.5 font-medium transition-colors border-l border-gray-200", mode === "manual" ? "bg-emerald-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50")} onClick={() => setMode("manual")}>Manual</button>
              </div>
            </div>

            {invLoading && <div className="text-center py-4 text-sm text-gray-400"><Loader2 className="h-4 w-4 animate-spin inline mr-2" />Loading invoices…</div>}
            {!invLoading && invoices.length === 0 && <div className="text-center py-6 text-sm text-gray-400">No open invoices for this customer.</div>}

            {!invLoading && invoices.length > 0 && (
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      {mode === "manual" && <th className="w-8 px-3 py-2"></th>}
                      <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Invoice</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Date</th>
                      <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Invoice Amt</th>
                      <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Outstanding</th>
                      <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Allocating</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map(inv => {
                      const alloc = effectiveAllocations[inv.id] ?? 0;
                      const isChecked = manualChecked.has(inv.id);
                      return (
                        <tr key={inv.id} className={cn("border-b border-gray-100", mode === "manual" && isChecked ? "bg-emerald-50" : "")}>
                          {mode === "manual" && (
                            <td className="px-3 py-2">
                              <input type="checkbox" checked={isChecked} onChange={() => toggleManual(inv.id, inv.outstanding)} className="rounded border-gray-300 accent-emerald-600" />
                            </td>
                          )}
                          <td className="px-3 py-2 font-mono font-semibold text-gray-800">{inv.invNumber}</td>
                          <td className="px-3 py-2 text-gray-500">{fmtDate(inv.issueDate)}</td>
                          <td className="px-3 py-2 text-right font-mono text-gray-700">{fmtAmt(inv.totalAmount)}</td>
                          <td className="px-3 py-2 text-right font-mono text-orange-600 font-medium">{fmtAmt(inv.outstanding)}</td>
                          <td className="px-3 py-2 text-right">
                            {mode === "auto" ? (
                              <span className={cn("font-mono font-semibold",
                                alloc <= 0 ? "text-gray-300" :
                                alloc < inv.outstanding ? "text-orange-500" :
                                "text-emerald-700"
                              )}>{alloc > 0 ? fmtAmt(alloc) : "—"}</span>
                            ) : isChecked ? (() => {
                              const manualVal = parseFloat(manualAmounts[inv.id] ?? "0") || 0;
                              const isPartial = manualVal > 0 && manualVal < inv.outstanding;
                              return <Input type="text" inputMode="decimal" className={cn("w-28 h-7 text-xs text-right font-mono ml-auto", isPartial ? "text-orange-500 border-orange-300 focus-visible:ring-orange-400" : "")} value={manualAmounts[inv.id] ?? ""} onChange={e => setManualAmounts(a => ({ ...a, [inv.id]: e.target.value }))} />;
                            })() : (
                              <span className="text-gray-300 font-mono">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {totalAmountNum > 0 && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Total Payment Received</span>
                <span className="font-mono font-semibold text-gray-900">S$ {fmtAmt(totalAmountNum)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Allocated to Invoices</span>
                <span className={cn("font-mono font-semibold", totalAllocated > 0 ? "text-emerald-700" : "text-gray-400")}>
                  S$ {fmtAmt(totalAllocated)}{Object.keys(effectiveAllocations).length > 0 ? ` (${Object.keys(effectiveAllocations).length} inv)` : ""}
                </span>
              </div>
              {excess > 0.004 && (
                <div className="flex justify-between border-t pt-2 mt-1">
                  <span className="text-amber-700 font-medium flex items-center gap-1.5"><Coins className="h-4 w-4" />Customer Credit (A/c 2035)</span>
                  <span className="font-mono font-semibold text-amber-700">S$ {fmtAmt(excess)}</span>
                </div>
              )}
              {shortfall > 0.004 && (
                <div className="flex justify-between border-t pt-2 mt-1">
                  <span className="text-red-600 font-medium">Allocation exceeds payment!</span>
                  <span className="font-mono font-semibold text-red-600">-S$ {fmtAmt(shortfall)}</span>
                </div>
              )}
              <p className="text-xs text-gray-400 border-t pt-2 mt-1">
                {isCash ? "Cash: separate JEs posted per invoice." : "Bank: single combined JE posted (DR Bank / CR AR)."}
              </p>
            </div>
          )}

          {depositBalance > 0.004 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center gap-2 text-sm">
              <Wallet className="h-4 w-4 text-amber-600 shrink-0" />
              <span className="text-amber-800 font-medium">Available Credit Balance: S$ {fmtAmt(depositBalance)}</span>
              <span className="text-amber-600 text-xs">(from previous overpayment — apply via Apply Credit)</span>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => { reset(); onClose(); }}>Cancel</Button>
          <Button className="bg-emerald-600 hover:bg-emerald-700 gap-2" onClick={handleSubmit} disabled={submitting || invLoading}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Record Payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function ArCollectionsPage() {
  const today = new Date().toISOString().split("T")[0];
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [payingCustomer, setPayingCustomer] = useState<string | null>(null);
  const qc = useQueryClient();

  const { data, isLoading, isError, error, refetch } = useQuery<AgingData>({
    queryKey: ["ar-aging", today],
    queryFn: async () => {
      const r = await fetch(`/api/ar-aging?asOf=${today}`, { credentials: "include" });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || "Failed to load"); }
      return r.json();
    },
    staleTime: 30_000,
  });

  const customers = (data?.customers ?? []).filter(c =>
    !search.trim() || c.customerName.toLowerCase().includes(search.trim().toLowerCase())
  );
  const grandTotal = data?.totals?.total ?? 0;

  function toggleExpanded(name: string) {
    setExpanded(prev => { const s = new Set(prev); s.has(name) ? s.delete(name) : s.add(name); return s; });
  }

  function handleSuccess() {
    qc.invalidateQueries({ queryKey: ["ar-aging"] });
    qc.invalidateQueries({ queryKey: ["ar-customer-invoices"] });
    qc.invalidateQueries({ queryKey: ["ar-customer-deposit"] });
    refetch();
  }

  return (
    <div className="space-y-5 pb-20 animate-in fade-in duration-300">

      <div className="flex items-end justify-between flex-wrap gap-4 pb-4 border-b border-gray-200">
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">Accounts Receivable</p>
          <h1 className="text-2xl font-bold text-[#2563EB]">Collections</h1>
          <p className="text-sm text-gray-500 mt-0.5">Record customer payments and knock off open invoices</p>
        </div>
        {grandTotal > 0 && (
          <div className="bg-gray-900 text-white rounded-lg px-5 py-3">
            <p className="text-xs text-gray-400 mb-0.5">Total Outstanding</p>
            <p className="text-xl font-bold font-mono tabular-nums">S$ {fmtAmt(grandTotal)}</p>
          </div>
        )}
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Search customer…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {isLoading && <div className="text-center py-16 text-sm text-gray-400"><Loader2 className="h-5 w-5 animate-spin inline mr-2" />Loading…</div>}
      {isError   && <div className="text-center py-16 text-sm text-red-500">{(error as Error).message}</div>}

      {data && (
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-gray-200 bg-gray-50">
                <th className="text-left px-5 py-3 text-xs font-bold text-gray-600 uppercase tracking-wider">Customer</th>
                <th className="text-right px-5 py-3 text-xs font-bold text-gray-600 uppercase tracking-wider">Outstanding (SGD)</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {customers.length === 0 && (
                <tr>
                  <td colSpan={3} className="text-center py-16 text-sm text-gray-400">
                    {search ? "No customers match your search." : "No outstanding receivables."}
                  </td>
                </tr>
              )}
              {customers.map(c => {
                const isOpen = expanded.has(c.customerName);
                return (
                  <>
                    <tr key={c.customerName} className={cn("border-b border-gray-100 transition-colors", isOpen ? "bg-emerald-50/40" : "hover:bg-gray-50/60")}>
                      <td className="px-5 py-3.5">
                        <button
                          className="flex items-center gap-2 text-left font-medium text-gray-800 hover:text-emerald-700 transition-colors group"
                          onClick={() => toggleExpanded(c.customerName)}
                        >
                          {isOpen
                            ? <ChevronDown className="h-4 w-4 text-emerald-600 shrink-0" />
                            : <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-emerald-500 shrink-0" />
                          }
                          {c.customerName}
                        </button>
                      </td>
                      <td className="px-5 py-3.5 text-right font-mono font-semibold text-orange-600 tabular-nums">
                        S$ {fmtAmt(c.total)}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <Button
                          size="sm"
                          className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 gap-1.5"
                          onClick={() => setPayingCustomer(c.customerName)}
                        >
                          <CreditCard className="h-3.5 w-3.5" />Receive Payment
                        </Button>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr key={`${c.customerName}-detail`} className="bg-white border-b border-gray-100">
                        <td colSpan={3} className="p-0">
                          <div className="border-l-4 border-emerald-300 ml-5 my-1 rounded">
                            <CustomerInvoiceDetail customerName={c.customerName} />
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-gray-400">Click a customer name to view their open invoices. Use the aging report for historical snapshots.</p>

      {payingCustomer && (
        <BulkPaymentDialog
          open={!!payingCustomer}
          onClose={() => setPayingCustomer(null)}
          customerName={payingCustomer}
          onSuccess={handleSuccess}
        />
      )}
    </div>
  );
}
