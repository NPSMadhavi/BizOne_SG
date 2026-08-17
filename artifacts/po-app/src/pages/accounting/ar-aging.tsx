import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/auth-context";
import { ChevronDown, ChevronRight, Download, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePagination } from "@/hooks/use-pagination";
import { ListPagination } from "@/components/list-pagination";
import { generateARAgingReport_PDF } from "@/lib/pdf";

interface InvLine { id: number; invNumber: string; issueDate: string | null; amount: number; daysPastDue: number }
interface AgingRow { customerName: string; current: number; b1_30: number; b31_60: number; b61_90: number; b91plus: number; total: number; invoices: InvLine[] }
interface AgingData { asOf: string; customers: AgingRow[]; totals: { current: number; b1_30: number; b31_60: number; b61_90: number; b91plus: number; total: number } }

function fmt(n: number) {
  if (Math.abs(n) < 0.005) return null;
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

export default function ArAgingPage() {
  const { selectedCompany } = useAuth();
  const today = new Date().toISOString().split("T")[0];
  const [asOf, setAsOf] = useState(today);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [pdfLoading, setPdfLoading] = useState(false);

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

  const t = data?.totals;
  const { page, setPage, totalPages, paginatedItems } = usePagination(data?.customers ?? []);

  return (
    <div className="space-y-5 pb-20 animate-in fade-in duration-300">

      <div className="flex items-end justify-between flex-wrap gap-4 pb-4 border-b border-gray-200">
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">Accounts Receivable</p>
          <h1 className="text-2xl font-bold text-[#2563EB]">Aging Report</h1>
          <p className="text-sm text-gray-500 mt-0.5">Read-only snapshot of outstanding receivables by age bucket</p>
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
                </tr>
              </thead>
              <tbody>
                {data.customers.length === 0 && (
                  <tr><td colSpan={8} className="text-center py-16 text-sm text-gray-400">No outstanding receivables as of {fmtDate(asOf)}.</td></tr>
                )}
                {paginatedItems.map(c => (
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
                  </tr>
                </tfoot>
              )}
            </table>
            <ListPagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        </div>
      )}

      <p className="text-xs text-gray-400">Due date = invoice date + payment terms (default 30 days). Only active (non-void, non-paid) invoices included. To record a payment, use <strong>AR Collections</strong>.</p>
    </div>
  );
}
