import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { ChevronDown, ChevronRight, Download, Loader2, CreditCard, Wallet, CheckCircle2, Coins } from "lucide-react";
import { cn } from "@/lib/utils";
import { generateARAgingReport_PDF } from "@/lib/pdf";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

interface InvLine { id: number; invNumber: string; issueDate: string | null; amount: number; daysPastDue: number }
interface AgingRow { customerName: string; current: number; b1_30: number; b31_60: number; b61_90: number; b91plus: number; total: number; invoices: InvLine[] }
interface AgingData { asOf: string; customers: AgingRow[]; totals: { current: number; b1_30: number; b31_60: number; b61_90: number; b91plus: number; total: number } }
interface OpenInvoice { id: number; invNumber: string; issueDate: string | null; totalAmount: number; paidAmount: number; outstanding: number; currency: string; paymentTerms: string | null; status: string }
interface DepositInfo { id: number; available: number; currency: string; paymentDate: string; bankRef: string | null }

function fmt(n: number) {
  if (Math.abs(n) < 0.005) return null;
  return new Intl.NumberFormat("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}
function fmtAmt(n: number) {
  return new Intl.NumberFormat("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}
function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("en-SG", { day: "2-digit", month: "short", year: "numeric" });
}

const COLS = [
  { key: "current",  label: "Current"    },
  { key: "b1_30",    label: "1–30 days"  },
  { key: "b31_60",   label: "31–60 days" },
  { key: "b61_90",   label: "61–90 days", warn: true   },
  { key: "b91plus",  label: "91+ days",   danger: true },
] as const;

function amountCls(key: string, val: number) {
  if (!val || val <= 0) return "text-gray-300 text-sm font-mono tabular-nums";
  if (key === "b61_90") return "text-orange-600 text-sm font-mono tabular-nums";
  if (key === "b91plus") return "text-red-600 font-semibold text-sm font-mono tabular-nums";
  return "text-gray-900 text-sm font-mono tabular-nums";
}

function computeFifo(invoices: OpenInvoice[], totalAmount: number): Record<number, number> {
  let remaining = totalAmount;
  const result: Record<number, number> = {};
  for (const inv of invoices) {
    if (remaining <= 0.004) break;
    const alloc = Math.min(inv.outstanding, remaining);
    if (alloc > 0.004) { result[inv.id] = alloc; remaining -= alloc; }
  }
  return result;
}

interface BulkPaymentDialogProps {
  open: boolean;
  onClose: () => void;
  customerName: string;
  onSuccess: () => void;
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
      if (!r.ok) throw new Error("Failed to load deposit");
      return r.json();
    },
    enabled: open && !!customerName,
    staleTime: 10_000,
  });

  const invoices = invData?.invoices ?? [];
  const depositBalance = depositData?.totalBalance ?? 0;
  const firstDeposit = depositData?.deposits?.[0];

  const totalAmountNum = parseFloat(payAmount) || 0;
  const isCash = payMethod === "cash";

  const fifoAllocations = computeFifo(invoices, totalAmountNum);

  const effectiveAllocations: Record<number, number> = mode === "auto"
    ? fifoAllocations
    : Object.fromEntries(
        [...manualChecked].map(id => [id, parseFloat(manualAmounts[id] || "0") || 0]).filter(([, v]) => (v as number) > 0)
      );

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
    if (!isCash && !bankRef.trim()) { toast({ title: "Bank reference is required for non-cash payments", variant: "destructive" }); return; }

    const allocations = Object.entries(effectiveAllocations)
      .filter(([, amt]) => amt > 0.004)
      .map(([invoiceId, amount]) => ({ invoiceId: parseInt(invoiceId), amount }));

    if (allocations.length === 0 && excess < totalAmountNum - 0.004) {
      toast({ title: "Select at least one invoice to allocate", variant: "destructive" }); return;
    }

    setSubmitting(true);
    try {
      const r = await fetch("/api/ar/bulk-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ customerName, paymentDate: payDate, paymentMethod: payMethod, bankRef: bankRef.trim() || null, totalAmount: totalAmountNum, allocations, notes: payNotes.trim() || null }),
      });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || "Failed"); }
      const result = await r.json();
      const msgs: string[] = [];
      if (result.processed > 0) msgs.push(`${result.processed} invoice(s) knocked off`);
      if (result.excess > 0.004) msgs.push(`S$${fmtAmt(result.excess)} recorded as customer credit`);
      toast({ title: "Payment recorded", description: msgs.join(" · ") });
      reset();
      onSuccess();
      onClose();
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
          {/* Payment Details */}
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
                <Input placeholder="e.g. OCBC-2026-001234, UTR12345678" value={bankRef} onChange={e => setBankRef(e.target.value)} />
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Notes (optional)</Label>
            <Input placeholder="Internal notes" value={payNotes} onChange={e => setPayNotes(e.target.value)} />
          </div>

          {/* Mode tabs */}
          <div className="border-t pt-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-gray-700">Allocate to Invoices</p>
              <div className="flex rounded-md border border-gray-200 overflow-hidden text-xs">
                <button
                  className={cn("px-3 py-1.5 font-medium transition-colors", mode === "auto" ? "bg-emerald-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50")}
                  onClick={() => setMode("auto")}
                >Auto (FIFO)</button>
                <button
                  className={cn("px-3 py-1.5 font-medium transition-colors border-l border-gray-200", mode === "manual" ? "bg-emerald-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50")}
                  onClick={() => setMode("manual")}
                >Manual</button>
              </div>
            </div>

            {invLoading && <div className="text-center py-4 text-sm text-gray-400"><Loader2 className="h-4 w-4 animate-spin inline mr-2" />Loading invoices…</div>}

            {!invLoading && invoices.length === 0 && (
              <div className="text-center py-6 text-sm text-gray-400">No open invoices for this customer.</div>
            )}

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
                              <span className={cn("font-mono font-semibold", alloc > 0 ? "text-emerald-700" : "text-gray-300")}>
                                {alloc > 0 ? fmtAmt(alloc) : "—"}
                              </span>
                            ) : isChecked ? (
                              <Input
                                type="text" inputMode="decimal"
                                className="w-28 h-7 text-xs text-right font-mono ml-auto"
                                value={manualAmounts[inv.id] ?? ""}
                                onChange={e => setManualAmounts(a => ({ ...a, [inv.id]: e.target.value }))}
                              />
                            ) : (
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

          {/* Summary */}
          {totalAmountNum > 0 && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Total Payment Received</span>
                <span className="font-mono font-semibold text-gray-900">S$ {fmtAmt(totalAmountNum)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Allocated to Invoices</span>
                <span className={cn("font-mono font-semibold", totalAllocated > 0 ? "text-emerald-700" : "text-gray-400")}>
                  S$ {fmtAmt(totalAllocated)} {Object.keys(effectiveAllocations).length > 0 ? `(${Object.keys(effectiveAllocations).length} invoice${Object.keys(effectiveAllocations).length > 1 ? "s" : ""})` : ""}
                </span>
              </div>
              {excess > 0.004 && (
                <div className="flex justify-between border-t pt-2 mt-1">
                  <span className="text-amber-700 font-medium flex items-center gap-1.5">
                    <Coins className="h-4 w-4" />Customer Credit (Deposit — A/c 2035)
                  </span>
                  <span className="font-mono font-semibold text-amber-700">S$ {fmtAmt(excess)}</span>
                </div>
              )}
              {shortfall > 0.004 && (
                <div className="flex justify-between border-t pt-2 mt-1">
                  <span className="text-red-600 font-medium">Allocation exceeds payment!</span>
                  <span className="font-mono font-semibold text-red-600">-S$ {fmtAmt(shortfall)}</span>
                </div>
              )}
              {isCash && (
                <p className="text-xs text-blue-600 border-t pt-2 mt-1">
                  Cash payment: separate journal entries will be posted per invoice (IRAS compliant).
                </p>
              )}
              {!isCash && (
                <p className="text-xs text-gray-500 border-t pt-2 mt-1">
                  Single combined journal entry will be posted (DR Bank / CR AR{excess > 0.004 ? " / CR Customer Deposit" : ""}). Suitable for bank reconciliation.
                </p>
              )}
            </div>
          )}

          {/* Existing Credit Balance */}
          {depositBalance > 0.004 && firstDeposit && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <Wallet className="h-4 w-4 text-amber-600" />
                <span className="text-amber-800 font-medium">Available Credit Balance: S$ {fmtAmt(depositBalance)}</span>
                <span className="text-amber-600 text-xs">(from previous overpayment)</span>
              </div>
              <Button size="sm" variant="outline" className="border-amber-300 text-amber-700 hover:bg-amber-100 text-xs h-7"
                onClick={() => {
                  reset();
                  onClose();
                  setTimeout(() => onSuccess(), 100);
                }}
              >
                Apply Credit Separately
              </Button>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => { reset(); onClose(); }}>Cancel</Button>
          <Button
            className="bg-emerald-600 hover:bg-emerald-700 gap-2"
            onClick={handleSubmit}
            disabled={submitting || invLoading}
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Record Payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ArAgingPage() {
  const { selectedCompany } = useAuth();
  const today = new Date().toISOString().split("T")[0];
  const [asOf, setAsOf] = useState(today);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [pdfLoading, setPdfLoading] = useState(false);
  const [payingCustomer, setPayingCustomer] = useState<string | null>(null);
  const qc = useQueryClient();

  const { data, isLoading, isError, error } = useQuery<AgingData>({
    queryKey: ["ar-aging", asOf],
    queryFn: async () => {
      const r = await fetch(`/api/ar-aging?asOf=${asOf}`, { credentials: "include" });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || "Failed to load"); }
      return r.json();
    },
    staleTime: 30_000,
  });

  function toggle(name: string) {
    setExpanded(prev => { const s = new Set(prev); s.has(name) ? s.delete(name) : s.add(name); return s; });
  }

  async function handleDownloadPDF() {
    if (!data) return;
    setPdfLoading(true);
    try {
      await generateARAgingReport_PDF(
        selectedCompany as any,
        asOf,
        data.customers.map(c => ({ name: c.customerName, current: c.current, b1_30: c.b1_30, b31_60: c.b31_60, b61_90: c.b61_90, b91plus: c.b91plus, total: c.total })),
        data.totals
      );
    } finally {
      setPdfLoading(false);
    }
  }

  function handlePaymentSuccess() {
    qc.invalidateQueries({ queryKey: ["ar-aging"] });
    qc.invalidateQueries({ queryKey: ["ar-customer-invoices"] });
    qc.invalidateQueries({ queryKey: ["ar-customer-deposit"] });
  }

  const t = data?.totals;

  return (
    <div className="space-y-5 pb-20 animate-in fade-in duration-300">

      <div className="flex items-end justify-between flex-wrap gap-4 pb-4 border-b border-gray-200">
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">Accounts Receivable</p>
          <h1 className="text-2xl font-bold text-gray-900">Aging Report</h1>
        </div>
        <div className="flex items-end gap-3">
          <div className="space-y-1">
            <Label className="text-xs text-gray-500">As of Date</Label>
            <Input type="date" value={asOf} max={today} onChange={e => setAsOf(e.target.value)} className="w-40 text-sm h-8 border-gray-200" />
          </div>
          {data && data.customers.length > 0 && (
            <Button variant="outline" size="sm" onClick={handleDownloadPDF} disabled={pdfLoading} className="border-gray-200 text-gray-600 hover:text-gray-900">
              {pdfLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
              Download PDF
            </Button>
          )}
        </div>
      </div>

      {t && (
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 divide-y sm:divide-y-0 divide-x-0 sm:divide-x divide-gray-100">
            <div className="px-5 py-4 lg:col-span-1 bg-gray-900 text-white rounded-l-lg">
              <p className="text-xs text-gray-400 mb-1">Total Outstanding</p>
              <p className="text-xl font-bold font-mono tabular-nums">S$&nbsp;{fmt(t.total) ?? "0.00"}</p>
            </div>
            {([
              { label: "Current",    val: t.current,  cls: "text-gray-900" },
              { label: "1–30 days",  val: t.b1_30,    cls: "text-gray-900" },
              { label: "31–60 days", val: t.b31_60,   cls: "text-gray-900" },
              { label: "61–90 days", val: t.b61_90,   cls: t.b61_90 > 0 ? "text-orange-600" : "text-gray-300" },
              { label: "91+ days",   val: t.b91plus,  cls: t.b91plus > 0 ? "text-red-600 font-bold" : "text-gray-300" },
            ] as const).map(s => (
              <div key={s.label} className="px-5 py-4">
                <p className="text-xs text-gray-400 mb-1">{s.label}</p>
                <p className={cn("text-sm font-semibold font-mono tabular-nums", s.cls)}>
                  {fmt(s.val) ?? <span className="text-gray-300 font-normal">—</span>}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {isLoading && <div className="text-center py-16 text-sm text-gray-400">Loading…</div>}
      {isError   && <div className="text-center py-16 text-sm text-red-500">{(error as Error).message}</div>}

      {data && (
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b-2 border-gray-200 bg-gray-50">
                  <th className="w-8 px-3 py-3"></th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wider">Customer</th>
                  {COLS.map(c => (
                    <th key={c.key} className={cn("text-right px-4 py-3 text-xs font-bold uppercase tracking-wider",
                      (c as any).danger ? "text-red-400" : (c as any).warn ? "text-orange-400" : "text-gray-600"
                    )}>{c.label}</th>
                  ))}
                  <th className="text-right px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wider">Total</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {data.customers.length === 0 && (
                  <tr><td colSpan={9} className="text-center py-16 text-sm text-gray-400">No outstanding receivables as of {fmtDate(asOf)}.</td></tr>
                )}
                {data.customers.map(c => (
                  <>
                    <tr
                      key={c.customerName}
                      className="border-b border-gray-100 hover:bg-gray-50/70 cursor-pointer"
                      onClick={() => toggle(c.customerName)}
                    >
                      <td className="px-3 py-3 text-gray-300">
                        {expanded.has(c.customerName) ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-800">{c.customerName}</td>
                      {COLS.map(col => (
                        <td key={col.key} className={cn("text-right px-4 py-3", amountCls(col.key, (c as any)[col.key]))}>
                          {fmt((c as any)[col.key]) ?? "—"}
                        </td>
                      ))}
                      <td className="text-right px-4 py-3 font-semibold text-sm font-mono tabular-nums text-gray-900">
                        S$ {fmt(c.total) ?? "0.00"}
                      </td>
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <Button
                          size="sm"
                          className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 gap-1.5"
                          onClick={() => setPayingCustomer(c.customerName)}
                        >
                          <CreditCard className="h-3.5 w-3.5" />Receive Payment
                        </Button>
                      </td>
                    </tr>
                    {expanded.has(c.customerName) && c.invoices.map(inv => (
                      <tr key={inv.id} className="border-b border-gray-100 bg-gray-50/50">
                        <td></td>
                        <td className="px-4 py-2 pl-10 text-xs text-gray-500 space-x-2">
                          <span className="font-mono font-semibold text-gray-700">{inv.invNumber}</span>
                          <span>{fmtDate(inv.issueDate)}</span>
                          {inv.daysPastDue > 0 ? <span className="text-red-500">{inv.daysPastDue}d overdue</span> : <span className="text-gray-400">not yet due</span>}
                        </td>
                        <td colSpan={5} />
                        <td className="text-right px-4 py-2 text-xs font-mono tabular-nums text-gray-500">S$ {fmt(inv.amount) ?? "0.00"}</td>
                        <td></td>
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
              {data.customers.length > 0 && t && (
                <tfoot>
                  <tr className="bg-gray-900 text-white">
                    <td></td>
                    <td className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-gray-300">Grand Total</td>
                    {COLS.map(col => (
                      <td key={col.key} className={cn("text-right px-4 py-3 text-sm font-semibold font-mono tabular-nums",
                        col.key === "b91plus" && t.b91plus > 0 ? "text-red-300" :
                        col.key === "b61_90" && t.b61_90 > 0 ? "text-orange-300" :
                        (t as any)[col.key] > 0 ? "text-white" : "text-gray-600"
                      )}>
                        {fmt((t as any)[col.key]) ?? "—"}
                      </td>
                    ))}
                    <td className="text-right px-4 py-3 text-base font-bold font-mono tabular-nums text-white">S$ {fmt(t.total) ?? "0.00"}</td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      <p className="text-xs text-gray-400">Due date = invoice date + payment terms (default 30 days). Only active (non-void, non-paid) invoices are included. Click a customer row to expand invoices. Use "Receive Payment" to knock off invoices.</p>

      {payingCustomer && (
        <BulkPaymentDialog
          open={!!payingCustomer}
          onClose={() => setPayingCustomer(null)}
          customerName={payingCustomer}
          onSuccess={handlePaymentSuccess}
        />
      )}
    </div>
  );
}
