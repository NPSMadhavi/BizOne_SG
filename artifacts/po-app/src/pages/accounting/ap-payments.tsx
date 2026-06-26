import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Banknote, Search, Loader2, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

interface OpenPi {
  id: number; piNumber: string; piDate: string | null;
  totalAmount: number; paidAmount: number; outstanding: number;
  currency: string; status: string;
}
interface AgingVendor { vendorName: string; total: number }
interface AgingData { vendors: AgingVendor[]; totals: { total: number } }

function fmtAmt(n: number) {
  return new Intl.NumberFormat("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}
function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("en-SG", { day: "2-digit", month: "short", year: "numeric" });
}
function computeFifo(pis: OpenPi[], total: number): Record<number, number> {
  let rem = total;
  const out: Record<number, number> = {};
  for (const pi of pis) {
    if (rem <= 0.004) break;
    const alloc = Math.min(pi.outstanding, rem);
    if (alloc > 0.004) { out[pi.id] = alloc; rem -= alloc; }
  }
  return out;
}

interface BulkVendorPaymentDialogProps {
  open: boolean; onClose: () => void; vendorName: string; onSuccess: () => void;
}

function BulkVendorPaymentDialog({ open, onClose, vendorName, onSuccess }: BulkVendorPaymentDialogProps) {
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

  const { data: piData, isLoading: piLoading } = useQuery<{ invoices: OpenPi[] }>({
    queryKey: ["ap-vendor-invoices", vendorName],
    queryFn: async () => {
      const r = await fetch(`/api/ap/vendor-invoices?vendorName=${encodeURIComponent(vendorName)}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load vendor invoices");
      return r.json();
    },
    enabled: open && !!vendorName,
    staleTime: 10_000,
  });

  const pis = piData?.invoices ?? [];
  const totalAmountNum = parseFloat(payAmount) || 0;
  const isCash = payMethod === "cash";

  const fifoAllocations = computeFifo(pis, totalAmountNum);
  const effectiveAllocations: Record<number, number> = mode === "auto"
    ? fifoAllocations
    : Object.fromEntries([...manualChecked].map(id => [id, parseFloat(manualAmounts[id] || "0") || 0]).filter(([, v]) => (v as number) > 0));

  const totalAllocated = Object.values(effectiveAllocations).reduce((s, v) => s + v, 0);
  const shortfall = Math.max(0, totalAllocated - totalAmountNum);

  function toggleManual(piId: number, outstanding: number) {
    setManualChecked(prev => {
      const s = new Set(prev);
      if (s.has(piId)) { s.delete(piId); }
      else { s.add(piId); if (!manualAmounts[piId]) setManualAmounts(a => ({ ...a, [piId]: outstanding.toFixed(2) })); }
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
    if (totalAllocated < 0.004) { toast({ title: "Select at least one PI to pay", variant: "destructive" }); return; }
    if (shortfall > 0.004) { toast({ title: "Allocation exceeds payment amount", variant: "destructive" }); return; }
    if (!isCash && !bankRef.trim()) { toast({ title: "Bank reference required for non-cash payments", variant: "destructive" }); return; }

    const allocations = Object.entries(effectiveAllocations)
      .filter(([, amt]) => amt > 0.004)
      .map(([vendorInvoiceId, amount]) => ({ vendorInvoiceId: parseInt(vendorInvoiceId), amount }));

    setSubmitting(true);
    try {
      const r = await fetch("/api/ap/bulk-payment", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ vendorName, paymentDate: payDate, paymentMethod: payMethod, bankRef: bankRef.trim() || null, totalAmount: totalAmountNum, allocations, notes: payNotes.trim() || null }),
      });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || "Failed"); }
      const result = await r.json();
      toast({ title: "Payment recorded", description: `${result.processed} vendor invoice(s) paid — S$${fmtAmt(result.totalPaid)} total` });
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
            <Banknote className="h-5 w-5 text-blue-600" />
            Pay Vendor — {vendorName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Payment Date <span className="text-destructive">*</span></Label>
              <Input type="date" value={payDate} max={today} onChange={e => setPayDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Amount Paid (SGD) <span className="text-destructive">*</span></Label>
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
                <Label>Bank Reference / UTR <span className="text-destructive">*</span></Label>
                <Input placeholder="e.g. OCBC-2026-001234, UTR12345678" value={bankRef} onChange={e => setBankRef(e.target.value)} />
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Notes (optional)</Label>
            <Input placeholder="Internal notes" value={payNotes} onChange={e => setPayNotes(e.target.value)} />
          </div>

          <div className="border-t pt-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-gray-700">Allocate to Vendor Invoices (PIs)</p>
              <div className="flex rounded-md border border-gray-200 overflow-hidden text-xs">
                <button className={cn("px-3 py-1.5 font-medium transition-colors", mode === "auto" ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50")} onClick={() => setMode("auto")}>Auto (FIFO)</button>
                <button className={cn("px-3 py-1.5 font-medium transition-colors border-l border-gray-200", mode === "manual" ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50")} onClick={() => setMode("manual")}>Manual</button>
              </div>
            </div>

            {piLoading && <div className="text-center py-4 text-sm text-gray-400"><Loader2 className="h-4 w-4 animate-spin inline mr-2" />Loading…</div>}
            {!piLoading && pis.length === 0 && <div className="text-center py-6 text-sm text-gray-400">No open vendor invoices for this vendor.</div>}

            {!piLoading && pis.length > 0 && (
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      {mode === "manual" && <th className="w-8 px-3 py-2"></th>}
                      <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase">PI Number</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Date</th>
                      <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Total</th>
                      <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Outstanding</th>
                      <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Paying</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pis.map(pi => {
                      const alloc = effectiveAllocations[pi.id] ?? 0;
                      const isChecked = manualChecked.has(pi.id);
                      return (
                        <tr key={pi.id} className={cn("border-b border-gray-100", mode === "manual" && isChecked ? "bg-blue-50" : "")}>
                          {mode === "manual" && (
                            <td className="px-3 py-2">
                              <input type="checkbox" checked={isChecked} onChange={() => toggleManual(pi.id, pi.outstanding)} className="rounded border-gray-300 accent-blue-600" />
                            </td>
                          )}
                          <td className="px-3 py-2 font-mono font-semibold text-gray-800">{pi.piNumber}</td>
                          <td className="px-3 py-2 text-gray-500">{fmtDate(pi.piDate)}</td>
                          <td className="px-3 py-2 text-right font-mono text-gray-700">{fmtAmt(pi.totalAmount)}</td>
                          <td className="px-3 py-2 text-right font-mono text-orange-600 font-medium">{fmtAmt(pi.outstanding)}</td>
                          <td className="px-3 py-2 text-right">
                            {mode === "auto" ? (
                              <span className={cn("font-mono font-semibold", alloc > 0 ? "text-blue-700" : "text-gray-300")}>{alloc > 0 ? fmtAmt(alloc) : "—"}</span>
                            ) : isChecked ? (
                              <Input type="text" inputMode="decimal" className="w-28 h-7 text-xs text-right font-mono ml-auto" value={manualAmounts[pi.id] ?? ""} onChange={e => setManualAmounts(a => ({ ...a, [pi.id]: e.target.value }))} />
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

          {totalAmountNum > 0 && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Total Payment Amount</span>
                <span className="font-mono font-semibold text-gray-900">S$ {fmtAmt(totalAmountNum)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Allocated to Vendor Invoices</span>
                <span className={cn("font-mono font-semibold", totalAllocated > 0 ? "text-blue-700" : "text-gray-400")}>
                  S$ {fmtAmt(totalAllocated)}{Object.keys(effectiveAllocations).length > 0 ? ` (${Object.keys(effectiveAllocations).length} PI)` : ""}
                </span>
              </div>
              {shortfall > 0.004 && (
                <div className="flex justify-between border-t pt-2 mt-1">
                  <span className="text-red-600 font-medium">Allocation exceeds payment!</span>
                  <span className="font-mono font-semibold text-red-600">-S$ {fmtAmt(shortfall)}</span>
                </div>
              )}
              <p className="text-xs text-gray-400 border-t pt-2 mt-1">
                {isCash ? "Cash: separate JEs posted per PI." : "Bank: single combined JE posted (DR AP / CR Bank)."}
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => { reset(); onClose(); }}>Cancel</Button>
          <Button className="bg-blue-600 hover:bg-blue-700 gap-2" onClick={handleSubmit} disabled={submitting || piLoading}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Record Payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ApPaymentsPage() {
  const today = new Date().toISOString().split("T")[0];
  const [search, setSearch] = useState("");
  const [payingVendor, setPayingVendor] = useState<string | null>(null);
  const qc = useQueryClient();

  const { data, isLoading, isError, error, refetch } = useQuery<AgingData>({
    queryKey: ["ap-aging", today],
    queryFn: async () => {
      const r = await fetch(`/api/ap-aging?asOf=${today}`, { credentials: "include" });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || "Failed to load"); }
      return r.json();
    },
    staleTime: 30_000,
  });

  const vendors = (data?.vendors ?? []).filter(v =>
    !search.trim() || v.vendorName.toLowerCase().includes(search.trim().toLowerCase())
  );
  const grandTotal = data?.totals?.total ?? 0;

  function handleSuccess() {
    qc.invalidateQueries({ queryKey: ["ap-aging"] });
    qc.invalidateQueries({ queryKey: ["ap-vendor-invoices"] });
    refetch();
  }

  return (
    <div className="space-y-5 pb-20 animate-in fade-in duration-300">

      <div className="flex items-end justify-between flex-wrap gap-4 pb-4 border-b border-gray-200">
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">Accounts Payable</p>
          <h1 className="text-2xl font-bold text-gray-900">Payments</h1>
          <p className="text-sm text-gray-500 mt-0.5">Record payments to vendors and settle open vendor invoices</p>
        </div>
        {grandTotal > 0 && (
          <div className="bg-gray-900 text-white rounded-lg px-5 py-3">
            <p className="text-xs text-gray-400 mb-0.5">Total Payable</p>
            <p className="text-xl font-bold font-mono tabular-nums">S$ {fmtAmt(grandTotal)}</p>
          </div>
        )}
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Search vendor…"
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
                <th className="text-left px-5 py-3 text-xs font-bold text-gray-600 uppercase tracking-wider">Vendor</th>
                <th className="text-right px-5 py-3 text-xs font-bold text-gray-600 uppercase tracking-wider">Outstanding (SGD)</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {vendors.length === 0 && (
                <tr>
                  <td colSpan={3} className="text-center py-16 text-sm text-gray-400">
                    {search ? "No vendors match your search." : "No outstanding payables."}
                  </td>
                </tr>
              )}
              {vendors.map(v => (
                <tr key={v.vendorName} className="border-b border-gray-100 hover:bg-gray-50/60 transition-colors">
                  <td className="px-5 py-3.5 font-medium text-gray-800">{v.vendorName}</td>
                  <td className="px-5 py-3.5 text-right font-mono font-semibold text-orange-600 tabular-nums">
                    S$ {fmtAmt(v.total)}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <Button
                      size="sm"
                      className="h-8 text-xs bg-blue-600 hover:bg-blue-700 gap-1.5"
                      onClick={() => setPayingVendor(v.vendorName)}
                    >
                      <Banknote className="h-3.5 w-3.5" />Pay Vendor
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-gray-400">Shows all vendors with open (pending/partial) vendor invoices as of today. Use the aging report for historical snapshots.</p>

      {payingVendor && (
        <BulkVendorPaymentDialog
          open={!!payingVendor}
          onClose={() => setPayingVendor(null)}
          vendorName={payingVendor}
          onSuccess={handleSuccess}
        />
      )}
    </div>
  );
}
