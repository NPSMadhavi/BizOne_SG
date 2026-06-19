import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/auth-context";
import { cn } from "@/lib/utils";

interface AcctLine { code: string; name: string; subType: string | null; amount: number }
interface BSData {
  asOf: string;
  assets: AcctLine[]; totalAssets: number;
  liabilities: AcctLine[]; totalLiabilities: number;
  equity: AcctLine[]; retainedEarnings: number; totalEquity: number;
  totalLiabilitiesAndEquity: number;
  balanced: boolean;
}

function fmtAmt(n: number) { return new Intl.NumberFormat("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(n)); }
function sign(n: number) { return n < 0 ? "(" : ""; }
function signClose(n: number) { return n < 0 ? ")" : ""; }

function Section({ title, rows, subtotalLabel, subtotal, highlight = false }: {
  title: string; rows: AcctLine[]; subtotalLabel: string; subtotal: number; highlight?: boolean;
}) {
  const nonZero = rows.filter(r => Math.abs(r.amount) > 0.005);
  return (
    <div className="mb-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-4 py-2 bg-muted/30 border-b">{title}</h3>
      {nonZero.map(r => (
        <div key={r.code} className="flex justify-between px-4 py-1.5 border-b border-dashed text-sm">
          <span className="text-muted-foreground">
            <span className="font-mono text-xs mr-2">{r.code}</span>{r.name}
          </span>
          <span className={cn("font-mono tabular-nums text-sm", r.amount < 0 ? "text-red-600" : "")}>
            {sign(r.amount)}{fmtAmt(r.amount)}{signClose(r.amount)}
          </span>
        </div>
      ))}
      {nonZero.length === 0 && (
        <div className="px-4 py-2 text-xs text-muted-foreground italic">No entries</div>
      )}
      <div className={cn("flex justify-between px-4 py-2 font-semibold text-sm border-t-2", highlight ? "bg-slate-800 text-white" : "bg-muted/50")}>
        <span>{subtotalLabel}</span>
        <span className="font-mono tabular-nums">{sign(subtotal)}{fmtAmt(subtotal)}{signClose(subtotal)}</span>
      </div>
    </div>
  );
}

export default function BalanceSheetPage() {
  useAuth();
  const today = new Date().toISOString().split("T")[0];
  const [asOf, setAsOf] = useState(today);

  const { data, isLoading, isError, error } = useQuery<BSData>({
    queryKey: ["balance-sheet", asOf],
    queryFn: async () => {
      const r = await fetch(`/api/balance-sheet?asOf=${asOf}`, { credentials: "include" });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || "Failed to load"); }
      return r.json();
    },
    staleTime: 30_000,
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Balance Sheet</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Assets, liabilities, and equity as of a given date</p>
        </div>
        <div className="flex items-end gap-4">
          <div className="space-y-1">
            <Label className="text-xs">As of Date</Label>
            <Input type="date" value={asOf} max={today} onChange={e => setAsOf(e.target.value)} className="w-40 text-sm" />
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Assets */}
          <Card className="overflow-hidden">
            <div className="bg-blue-700 text-white px-4 py-2.5 font-semibold text-sm tracking-wide">ASSETS</div>
            <Section title="Non-Current Assets" rows={data.assets.filter(a => a.subType === "non_current_asset")} subtotalLabel="Total Non-Current Assets" subtotal={data.assets.filter(a => a.subType === "non_current_asset").reduce((s, a) => s + a.amount, 0)} />
            <Section title="Current Assets" rows={data.assets.filter(a => a.subType !== "non_current_asset")} subtotalLabel="Total Current Assets" subtotal={data.assets.filter(a => a.subType !== "non_current_asset").reduce((s, a) => s + a.amount, 0)} />
            <div className="flex justify-between px-4 py-3 font-bold bg-blue-700 text-white">
              <span className="text-sm tracking-wide">TOTAL ASSETS</span>
              <span className="font-mono tabular-nums">{fmtAmt(data.totalAssets)}</span>
            </div>
          </Card>

          {/* Liabilities + Equity */}
          <Card className="overflow-hidden">
            <div className="bg-slate-700 text-white px-4 py-2.5 font-semibold text-sm tracking-wide">LIABILITIES & EQUITY</div>
            <Section title="Current Liabilities" rows={data.liabilities.filter(a => a.subType !== "non_current_liability")} subtotalLabel="Total Current Liabilities" subtotal={data.liabilities.filter(a => a.subType !== "non_current_liability").reduce((s, a) => s + a.amount, 0)} />
            <Section title="Non-Current Liabilities" rows={data.liabilities.filter(a => a.subType === "non_current_liability")} subtotalLabel="Total Non-Current Liabilities" subtotal={data.liabilities.filter(a => a.subType === "non_current_liability").reduce((s, a) => s + a.amount, 0)} />
            <div className="flex justify-between px-4 py-2 font-semibold text-sm border-t bg-muted/50">
              <span>Total Liabilities</span>
              <span className="font-mono tabular-nums">{fmtAmt(data.totalLiabilities)}</span>
            </div>

            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-4 py-2 bg-muted/30 border-b border-t mt-2">Equity</h3>
            {data.equity.filter(e => Math.abs(e.amount) > 0.005).map(e => (
              <div key={e.code} className="flex justify-between px-4 py-1.5 border-b border-dashed text-sm">
                <span className="text-muted-foreground"><span className="font-mono text-xs mr-2">{e.code}</span>{e.name}</span>
                <span className="font-mono tabular-nums">{sign(e.amount)}{fmtAmt(e.amount)}{signClose(e.amount)}</span>
              </div>
            ))}
            <div className="flex justify-between px-4 py-1.5 border-b border-dashed text-sm">
              <span className="text-muted-foreground italic">Retained Earnings (net P&L to date)</span>
              <span className={cn("font-mono tabular-nums", data.retainedEarnings < 0 ? "text-red-600" : "text-emerald-700")}>
                {sign(data.retainedEarnings)}{fmtAmt(data.retainedEarnings)}{signClose(data.retainedEarnings)}
              </span>
            </div>
            <div className="flex justify-between px-4 py-2 font-semibold text-sm border-t bg-muted/50">
              <span>Total Equity</span>
              <span className="font-mono tabular-nums">{sign(data.totalEquity)}{fmtAmt(data.totalEquity)}{signClose(data.totalEquity)}</span>
            </div>

            <div className="flex justify-between px-4 py-3 font-bold bg-slate-700 text-white">
              <span className="text-sm tracking-wide">TOTAL LIABILITIES & EQUITY</span>
              <span className="font-mono tabular-nums">{fmtAmt(data.totalLiabilitiesAndEquity)}</span>
            </div>
          </Card>
        </div>
      )}

      <p className="text-xs text-muted-foreground">Retained Earnings is computed as cumulative net P&L (Revenue − Expenses) from all posted journal entries up to the selected date. Accounts with zero balance are hidden.</p>
    </div>
  );
}
