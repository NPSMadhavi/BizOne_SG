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

function fmt(n: number) { return new Intl.NumberFormat("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n); }
function fmtDate(d: string | null) { if (!d) return "—"; return new Date(d + "T00:00:00").toLocaleDateString("en-SG", { day: "2-digit", month: "short", year: "numeric" }); }

function Stat({ label, value, warn, danger }: { label: string; value: string; warn?: boolean; danger?: boolean }) {
  return (
    <div>
      <p className="text-xs text-gray-400 mb-0.5 whitespace-nowrap">{label}</p>
      <p className={cn("font-mono text-sm font-medium tabular-nums", warn && "text-orange-600", danger && "text-red-600", !warn && !danger && "text-gray-900")}>{value}</p>
    </div>
  );
}

const COLS = [
  { key: "current",  label: "Current",    hClass: "" },
  { key: "b1_30",    label: "1–30 days",  hClass: "" },
  { key: "b31_60",   label: "31–60 days", hClass: "" },
  { key: "b61_90",   label: "61–90 days", hClass: "text-orange-500" },
  { key: "b91plus",  label: "91+ days",   hClass: "text-red-500" },
] as const;

function cellClass(key: string, val: number) {
  if (val <= 0) return "text-gray-200";
  if (key === "b61_90") return "text-orange-600";
  if (key === "b91plus") return "text-red-600 font-medium";
  return "text-gray-800";
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
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <p className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-1">Accounts Payable</p>
          <h1 className="text-xl font-semibold text-gray-900">Aging Report</h1>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-gray-500">As of Date</Label>
          <Input type="date" value={asOf} max={today} onChange={e => setAsOf(e.target.value)} className="w-40 text-sm h-8 border-gray-200" />
        </div>
      </div>

      {t && (
        <div className="flex flex-wrap items-center gap-6 px-5 py-4 bg-white border border-gray-200 rounded-lg">
          <div>
            <p className="text-xs text-gray-400 mb-0.5">Total Payable</p>
            <p className="font-mono text-base font-semibold text-gray-900 tabular-nums">S$ {fmt(t.total)}</p>
          </div>
          <div className="w-px h-8 bg-gray-200 self-stretch hidden sm:block" />
          <Stat label="Current" value={`S$ ${fmt(t.current)}`} />
          <Stat label="1–30 days" value={`S$ ${fmt(t.b1_30)}`} />
          <Stat label="31–60 days" value={`S$ ${fmt(t.b31_60)}`} />
          <Stat label="61–90 days" value={`S$ ${fmt(t.b61_90)}`} warn={t.b61_90 > 0} />
          <Stat label="91+ days" value={`S$ ${fmt(t.b91plus)}`} danger={t.b91plus > 0} />
        </div>
      )}

      {isLoading && <div className="text-center py-16 text-sm text-gray-400">Loading…</div>}
      {isError   && <div className="text-center py-16 text-sm text-red-500">{(error as Error).message}</div>}

      {data && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="w-8 px-4 py-3"></th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Vendor</th>
                  {COLS.map(c => (
                    <th key={c.key} className={cn("text-right px-4 py-3 text-xs font-medium uppercase tracking-wider", c.hClass || "text-gray-500")}>{c.label}</th>
                  ))}
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
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
                      <td className="px-4 py-3 text-gray-300">
                        {expanded.has(v.vendorName) ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-800">{v.vendorName}</td>
                      {COLS.map(col => (
                        <td key={col.key} className={cn("text-right px-4 py-3 font-mono tabular-nums", cellClass(col.key, (v as any)[col.key]))}>
                          {(v as any)[col.key] > 0 ? fmt((v as any)[col.key]) : "—"}
                        </td>
                      ))}
                      <td className="text-right px-4 py-3 font-mono font-semibold text-gray-900 tabular-nums">S$ {fmt(v.total)}</td>
                    </tr>
                    {expanded.has(v.vendorName) && v.invoices.map(pi => (
                      <tr key={pi.id} className="border-b border-gray-100 bg-gray-50/40">
                        <td></td>
                        <td className="px-4 py-2 pl-9 text-xs text-gray-500">
                          <span className="font-mono font-medium text-gray-700 mr-2">{pi.piNumber}</span>
                          <span className="mr-2">{fmtDate(pi.piDate)}</span>
                          {pi.daysPastDue > 0 && <span className="text-red-500">{pi.daysPastDue}d overdue</span>}
                          {pi.daysPastDue <= 0 && <span className="text-gray-400">not yet due</span>}
                          {pi.status === "partial" && <span className="ml-2 text-gray-400">(partial payment)</span>}
                        </td>
                        <td colSpan={5} />
                        <td className="text-right px-4 py-2 font-mono text-xs text-gray-500 tabular-nums">S$ {fmt(pi.balance)}</td>
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
              {data.vendors.length > 0 && t && (
                <tfoot>
                  <tr className="bg-gray-50 border-t border-gray-200">
                    <td></td>
                    <td className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Total</td>
                    {COLS.map(col => (
                      <td key={col.key} className={cn("text-right px-4 py-3 font-mono font-semibold tabular-nums", col.key === "b91plus" && t.b91plus > 0 ? "text-red-600" : col.key === "b61_90" && t.b61_90 > 0 ? "text-orange-600" : "text-gray-700")}>
                        {(t as any)[col.key] > 0 ? fmt((t as any)[col.key]) : "—"}
                      </td>
                    ))}
                    <td className="text-right px-4 py-3 font-mono font-bold text-gray-900 tabular-nums">S$ {fmt(t.total)}</td>
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
