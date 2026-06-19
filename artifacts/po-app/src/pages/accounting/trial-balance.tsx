import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/auth-context";
import { cn } from "@/lib/utils";

interface TBRow { id: number; code: string; name: string; type: string; subType: string | null; totalDebit: number; totalCredit: number; balance: number }
interface TBData { fromDate: string | null; toDate: string | null; rows: TBRow[]; grandDebit: number; grandCredit: number; balanced: boolean }

const TYPE_ORDER = ["asset", "liability", "equity", "revenue", "expense"];
const TYPE_LABEL: Record<string, string> = { asset: "Assets", liability: "Liabilities", equity: "Equity", revenue: "Revenue", expense: "Expenses" };
const TYPE_COLOR: Record<string, string> = { asset: "text-blue-700", liability: "text-slate-700", equity: "text-purple-700", revenue: "text-emerald-700", expense: "text-red-700" };

function fmtAmt(n: number) { return n === 0 ? "—" : new Intl.NumberFormat("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n); }

export default function TrialBalancePage() {
  useAuth();
  const today = new Date().toISOString().split("T")[0];
  const thisMonth = today.slice(0, 7);
  const [from, setFrom] = useState(thisMonth + "-01");
  const [to, setTo]     = useState(today);

  const { data, isLoading, isError, error } = useQuery<TBData>({
    queryKey: ["trial-balance", from, to],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to)   params.set("to", to);
      const r = await fetch(`/api/trial-balance?${params}`, { credentials: "include" });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || "Failed to load"); }
      return r.json();
    },
    staleTime: 30_000,
  });

  const grouped = TYPE_ORDER.reduce<Record<string, TBRow[]>>((acc, t) => {
    acc[t] = data?.rows.filter(r => r.type === t && (Math.abs(r.totalDebit) > 0.005 || Math.abs(r.totalCredit) > 0.005)) ?? [];
    return acc;
  }, {});

  return (
    <div className="space-y-6 max-w-7xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Trial Balance</h1>
          <p className="text-muted-foreground text-sm mt-0.5">All accounts with total debits, credits, and net balance for the period</p>
        </div>
        <div className="flex items-end gap-3 flex-wrap">
          <div className="space-y-1">
            <Label className="text-xs">From</Label>
            <Input type="date" value={from} max={to || today} onChange={e => setFrom(e.target.value)} className="w-36 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">To</Label>
            <Input type="date" value={to} min={from} max={today} onChange={e => setTo(e.target.value)} className="w-36 text-sm" />
          </div>
          {data && (
            <Badge variant={data.balanced ? "default" : "destructive"} className="mb-0.5">
              {data.balanced ? "✓ Balanced" : "⚠ Out of balance"}
            </Badge>
          )}
        </div>
      </div>

      {isLoading && <div className="text-center py-12 text-muted-foreground text-sm">Loading…</div>}
      {isError   && <div className="text-center py-12 text-red-600 text-sm">{(error as Error).message}</div>}

      {data && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/40 border-b">
                  <th className="text-left px-4 py-2.5 font-semibold text-xs text-muted-foreground w-24">Code</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-xs text-muted-foreground">Account Name</th>
                  <th className="text-right px-4 py-2.5 font-semibold text-xs text-muted-foreground w-36">Debit (SGD)</th>
                  <th className="text-right px-4 py-2.5 font-semibold text-xs text-muted-foreground w-36">Credit (SGD)</th>
                  <th className="text-right px-4 py-2.5 font-semibold text-xs text-muted-foreground w-36">Balance</th>
                </tr>
              </thead>
              <tbody>
                {TYPE_ORDER.map(type => (
                  grouped[type].length > 0 && (
                    <>
                      <tr key={`hdr-${type}`} className="bg-muted/20">
                        <td colSpan={5} className={cn("px-4 py-1.5 text-xs font-semibold uppercase tracking-wider", TYPE_COLOR[type])}>
                          {TYPE_LABEL[type]}
                        </td>
                      </tr>
                      {grouped[type].map(row => (
                        <tr key={row.id} className="border-b hover:bg-muted/20">
                          <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{row.code}</td>
                          <td className="px-4 py-2">{row.name}</td>
                          <td className="text-right px-4 py-2 font-mono tabular-nums text-xs">{fmtAmt(row.totalDebit)}</td>
                          <td className="text-right px-4 py-2 font-mono tabular-nums text-xs">{fmtAmt(row.totalCredit)}</td>
                          <td className={cn("text-right px-4 py-2 font-mono tabular-nums text-xs", row.balance < 0 ? "text-red-600" : row.balance > 0 ? "text-foreground" : "text-muted-foreground")}>
                            {row.balance !== 0 ? (row.balance < 0 ? `(${new Intl.NumberFormat("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(row.balance))})` : new Intl.NumberFormat("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(row.balance)) : "—"}
                          </td>
                        </tr>
                      ))}
                    </>
                  )
                ))}
                {data.rows.every(r => Math.abs(r.totalDebit) < 0.005 && Math.abs(r.totalCredit) < 0.005) && (
                  <tr><td colSpan={5} className="text-center py-12 text-muted-foreground">No journal entries found for this period.</td></tr>
                )}
              </tbody>
              <tfoot>
                <tr className="bg-muted/50 border-t-2 font-semibold">
                  <td colSpan={2} className="px-4 py-2.5 text-xs text-muted-foreground uppercase tracking-wider">Grand Total</td>
                  <td className="text-right px-4 py-2.5 font-mono tabular-nums text-sm">
                    {new Intl.NumberFormat("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(data.grandDebit)}
                  </td>
                  <td className="text-right px-4 py-2.5 font-mono tabular-nums text-sm">
                    {new Intl.NumberFormat("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(data.grandCredit)}
                  </td>
                  <td className={cn("text-right px-4 py-2.5 font-mono tabular-nums text-sm", !data.balanced ? "text-red-600" : "text-muted-foreground")}>
                    {!data.balanced
                      ? `Diff: ${new Intl.NumberFormat("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(data.grandDebit - data.grandCredit))}`
                      : "0.00"}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
