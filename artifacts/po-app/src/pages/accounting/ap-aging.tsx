import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/auth-context";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface PiLine { id: number; piNumber: string; piDate: string | null; balance: number; daysPastDue: number; status: string }
interface AgingRow { vendorName: string; current: number; b1_30: number; b31_60: number; b61_90: number; b91plus: number; total: number; invoices: PiLine[] }
interface AgingData { asOf: string; vendors: AgingRow[]; totals: { current: number; b1_30: number; b31_60: number; b61_90: number; b91plus: number; total: number } }

const BUCKETS = [
  { key: "current",  label: "Current",    color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" },
  { key: "b1_30",    label: "1–30 days",  color: "text-amber-700",   bg: "bg-amber-50 border-amber-200" },
  { key: "b31_60",   label: "31–60 days", color: "text-orange-700",  bg: "bg-orange-50 border-orange-200" },
  { key: "b61_90",   label: "61–90 days", color: "text-red-600",     bg: "bg-red-50 border-red-200" },
  { key: "b91plus",  label: "91+ days",   color: "text-red-900",     bg: "bg-red-100 border-red-300" },
] as const;

function fmtAmt(n: number) { return new Intl.NumberFormat("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n); }
function fmtDate(d: string | null) { if (!d) return "—"; return new Date(d + "T00:00:00").toLocaleDateString("en-SG", { day: "2-digit", month: "short", year: "numeric" }); }

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
    <div className="space-y-6 max-w-7xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">AP Aging Report</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Outstanding payables grouped by overdue age bucket (30-day terms assumed)</p>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">As of Date</Label>
          <Input type="date" value={asOf} max={today} onChange={e => setAsOf(e.target.value)} className="w-40 text-sm" />
        </div>
      </div>

      {t && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {BUCKETS.map(b => (
            <Card key={b.key} className={cn("border", b.bg)}>
              <CardContent className="p-3">
                <p className={cn("text-xs font-semibold mb-1", b.color)}>{b.label}</p>
                <p className={cn("font-mono font-bold text-sm", b.color)}>S$ {fmtAmt((t as any)[b.key])}</p>
              </CardContent>
            </Card>
          ))}
          <Card className="border bg-slate-50 border-slate-200">
            <CardContent className="p-3">
              <p className="text-xs font-semibold text-slate-700 mb-1">Total Payable</p>
              <p className="font-mono font-bold text-sm text-slate-900">S$ {fmtAmt(t.total)}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {isLoading && <div className="text-center py-12 text-muted-foreground text-sm">Loading…</div>}
      {isError   && <div className="text-center py-12 text-red-600 text-sm">{(error as Error).message}</div>}

      {data && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/40 border-b">
                  <th className="text-left px-4 py-2.5 font-semibold text-xs text-muted-foreground w-8"></th>
                  <th className="text-left px-4 py-2.5 font-semibold text-xs text-muted-foreground">Vendor</th>
                  {BUCKETS.map(b => <th key={b.key} className={cn("text-right px-4 py-2.5 font-semibold text-xs", b.color)}>{b.label}</th>)}
                  <th className="text-right px-4 py-2.5 font-semibold text-xs text-muted-foreground">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.vendors.length === 0 && (
                  <tr><td colSpan={8} className="text-center py-12 text-muted-foreground">No outstanding payables as of {fmtDate(asOf)}.</td></tr>
                )}
                {data.vendors.map(v => (
                  <>
                    <tr key={v.vendorName} className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => toggle(v.vendorName)}>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {expanded.has(v.vendorName) ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      </td>
                      <td className="px-4 py-2.5 font-medium">{v.vendorName}</td>
                      {BUCKETS.map(b => (
                        <td key={b.key} className={cn("text-right px-4 py-2.5 font-mono text-xs tabular-nums", (v as any)[b.key] > 0 ? b.color : "text-muted-foreground/30")}>
                          {(v as any)[b.key] > 0 ? fmtAmt((v as any)[b.key]) : "—"}
                        </td>
                      ))}
                      <td className="text-right px-4 py-2.5 font-mono font-semibold text-sm tabular-nums">S$ {fmtAmt(v.total)}</td>
                    </tr>
                    {expanded.has(v.vendorName) && v.invoices.map(pi => (
                      <tr key={pi.id} className="bg-muted/10 border-b text-xs">
                        <td></td>
                        <td className="px-4 py-1.5 pl-8 text-muted-foreground">
                          <span className="font-mono font-medium text-foreground">{pi.piNumber}</span>
                          <span className="ml-2">· {fmtDate(pi.piDate)}</span>
                          {pi.daysPastDue > 0 && <span className="ml-2 text-red-600">{pi.daysPastDue}d overdue</span>}
                          {pi.daysPastDue <= 0 && <span className="ml-2 text-emerald-600">not yet due</span>}
                          {pi.status === "partial" && <span className="ml-2 text-blue-600 capitalize">(partial)</span>}
                        </td>
                        <td colSpan={4} />
                        <td className="text-right px-4 py-1.5 font-mono tabular-nums text-muted-foreground">S$ {fmtAmt(pi.balance)}</td>
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
              {data.vendors.length > 0 && (
                <tfoot>
                  <tr className="bg-muted/50 border-t-2 font-semibold">
                    <td></td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground uppercase tracking-wider">Total</td>
                    {BUCKETS.map(b => (
                      <td key={b.key} className={cn("text-right px-4 py-2.5 font-mono text-xs tabular-nums", b.color)}>
                        {(t as any)[b.key] > 0 ? fmtAmt((t as any)[b.key]) : "—"}
                      </td>
                    ))}
                    <td className="text-right px-4 py-2.5 font-mono text-sm tabular-nums">S$ {fmtAmt(t!.total)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </Card>
      )}

      <p className="text-xs text-muted-foreground">Balance = total amount − amount paid. Due date = PI date + 30 days. Only pending/partial vendor invoices are shown.</p>
    </div>
  );
}
