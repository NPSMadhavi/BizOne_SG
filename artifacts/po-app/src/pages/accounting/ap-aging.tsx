import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/auth-context";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface PiLine { id: number; piNumber: string; piDate: string | null; balance: number; daysPastDue: number; status: string }
interface AgingRow { vendorName: string; current: number; b1_30: number; b31_60: number; b61_90: number; b91plus: number; total: number; invoices: PiLine[] }
interface AgingData { asOf: string; vendors: AgingRow[]; totals: { current: number; b1_30: number; b31_60: number; b61_90: number; b91plus: number; total: number } }

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

export default function ApAgingPage() {
  useAuth();
  const today = new Date().toISOString().split("T")[0];
  const [asOf, setAsOf] = useState(today);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { data, isLoading, isError, error } = useQuery<AgingData>({
    queryKey: ["ap-aging", asOf],
    queryFn: async () => {
      const r = await fetch(`/api/ap-aging?asOf=${asOf}`, { credentials: "include" });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || "Failed to load"); }
      return r.json();
    },
    staleTime: 30_000,
  });

  function toggle(name: string) {
    setExpanded(prev => { const s = new Set(prev); s.has(name) ? s.delete(name) : s.add(name); return s; });
  }

  const t = data?.totals;

  return (
    <div className="max-w-7xl mx-auto space-y-5 pb-20 animate-in fade-in duration-300">

      <div className="flex items-end justify-between flex-wrap gap-4 pb-4 border-b border-gray-200">
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">Accounts Payable</p>
          <h1 className="text-2xl font-bold text-gray-900">Aging Report</h1>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-gray-500">As of Date</Label>
          <Input type="date" value={asOf} max={today} onChange={e => setAsOf(e.target.value)} className="w-40 text-sm h-8 border-gray-200" />
        </div>
      </div>

      {t && (
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 divide-y sm:divide-y-0 divide-x-0 sm:divide-x divide-gray-100">
            <div className="px-5 py-4 bg-gray-900 text-white rounded-l-lg">
              <p className="text-xs text-gray-400 mb-1">Total Payable</p>
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
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wider">Vendor</th>
                  {COLS.map(c => (
                    <th key={c.key} className={cn("text-right px-4 py-3 text-xs font-bold uppercase tracking-wider",
                      (c as any).danger ? "text-red-400" : (c as any).warn ? "text-orange-400" : "text-gray-600"
                    )}>{c.label}</th>
                  ))}
                  <th className="text-right px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wider">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.vendors.length === 0 && (
                  <tr><td colSpan={8} className="text-center py-16 text-sm text-gray-400">No outstanding payables as of {fmtDate(asOf)}.</td></tr>
                )}
                {data.vendors.map(v => (
                  <>
                    <tr
                      key={v.vendorName}
                      className="border-b border-gray-100 hover:bg-gray-50/70 cursor-pointer"
                      onClick={() => toggle(v.vendorName)}
                    >
                      <td className="px-3 py-3 text-gray-300">
                        {expanded.has(v.vendorName)
                          ? <ChevronDown className="h-3.5 w-3.5" />
                          : <ChevronRight className="h-3.5 w-3.5" />}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-800">{v.vendorName}</td>
                      {COLS.map(col => (
                        <td key={col.key} className={cn("text-right px-4 py-3", amountCls(col.key, (v as any)[col.key]))}>
                          {fmt((v as any)[col.key]) ?? "—"}
                        </td>
                      ))}
                      <td className="text-right px-4 py-3 font-semibold text-sm font-mono tabular-nums text-gray-900">
                        S$ {fmt(v.total) ?? "0.00"}
                      </td>
                    </tr>
                    {expanded.has(v.vendorName) && v.invoices.map(pi => (
                      <tr key={pi.id} className="border-b border-gray-100 bg-gray-50/50">
                        <td></td>
                        <td className="px-4 py-2 pl-10 text-xs text-gray-500 space-x-2">
                          <span className="font-mono font-semibold text-gray-700">{pi.piNumber}</span>
                          <span>{fmtDate(pi.piDate)}</span>
                          {pi.daysPastDue > 0
                            ? <span className="text-red-500">{pi.daysPastDue}d overdue</span>
                            : <span className="text-gray-400">not yet due</span>}
                          {pi.status === "partial" && <span className="text-gray-400">(partial)</span>}
                        </td>
                        <td colSpan={5} />
                        <td className="text-right px-4 py-2 text-xs font-mono tabular-nums text-gray-500">
                          S$ {fmt(pi.balance) ?? "0.00"}
                        </td>
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
              {data.vendors.length > 0 && t && (
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
                    <td className="text-right px-4 py-3 text-base font-bold font-mono tabular-nums text-white">
                      S$ {fmt(t.total) ?? "0.00"}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      <p className="text-xs text-gray-400">Balance = total − paid. Due date = PI date + 30 days. Only pending and partial vendor invoices are included.</p>
    </div>
  );
}
