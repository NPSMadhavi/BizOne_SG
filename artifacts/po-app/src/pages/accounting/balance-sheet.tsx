import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

function fmt(n: number) {
  const abs = Math.abs(n);
  const s = new Intl.NumberFormat("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(abs);
  return n < 0 ? `(${s})` : s;
}

function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-SG", { day: "2-digit", month: "long", year: "numeric" });
}

interface SectionProps {
  label: string;
  rows: AcctLine[];
  subtotalLabel: string;
  subtotal: number;
  isTotal?: boolean;
}

function Section({ label, rows, subtotalLabel, subtotal, isTotal }: SectionProps) {
  const active = rows.filter(r => Math.abs(r.amount) > 0.005);
  return (
    <div className="mb-1">
      <div className="px-5 py-2 text-xs font-semibold uppercase tracking-widest text-gray-400">{label}</div>
      {active.map(r => (
        <div key={r.code} className="flex justify-between items-baseline px-5 py-1.5 border-b border-gray-100 last:border-0">
          <span className="text-sm text-gray-600 flex items-baseline gap-2">
            <span className="font-mono text-xs text-gray-400 w-10 shrink-0">{r.code}</span>
            {r.name}
          </span>
          <span className={cn("font-mono text-sm tabular-nums ml-4 shrink-0", r.amount < 0 ? "text-red-600" : "text-gray-800")}>
            {fmt(r.amount)}
          </span>
        </div>
      ))}
      {active.length === 0 && (
        <div className="px-5 py-2 text-xs text-gray-300 italic">No entries</div>
      )}
      <div className={cn(
        "flex justify-between items-baseline px-5 py-2 border-t border-gray-300",
        isTotal ? "bg-gray-900 text-white" : "bg-gray-50"
      )}>
        <span className={cn("text-xs font-semibold uppercase tracking-wide", isTotal ? "text-gray-300" : "text-gray-500")}>{subtotalLabel}</span>
        <span className={cn("font-mono text-sm font-semibold tabular-nums", isTotal ? "text-white" : subtotal < 0 ? "text-red-600" : "text-gray-900")}>
          {fmt(subtotal)}
        </span>
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

  const ncAssets  = data?.assets.filter(a => a.subType === "non_current_asset") ?? [];
  const curAssets = data?.assets.filter(a => a.subType !== "non_current_asset") ?? [];
  const curLiab   = data?.liabilities.filter(a => a.subType !== "non_current_liability") ?? [];
  const ncLiab    = data?.liabilities.filter(a => a.subType === "non_current_liability") ?? [];

  return (
    <div className="max-w-7xl mx-auto space-y-5 pb-20 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <p className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-1">Financial Statements</p>
          <h1 className="text-xl font-semibold text-gray-900">Balance Sheet</h1>
        </div>
        <div className="flex items-end gap-4">
          <div className="space-y-1">
            <Label className="text-xs text-gray-500">As of Date</Label>
            <Input type="date" value={asOf} max={today} onChange={e => setAsOf(e.target.value)} className="w-40 text-sm h-8 border-gray-200" />
          </div>
          {data && (
            <span className={cn("text-xs font-medium px-2.5 py-1 rounded border mb-0.5", data.balanced ? "border-green-200 text-green-700 bg-green-50" : "border-red-200 text-red-700 bg-red-50")}>
              {data.balanced ? "Balanced" : "Out of balance"}
            </span>
          )}
        </div>
      </div>

      {isLoading && <div className="text-center py-16 text-sm text-gray-400">Loading…</div>}
      {isError   && <div className="text-center py-16 text-sm text-red-500">{(error as Error).message}</div>}

      {data && (
        <>
          {/* Period label */}
          <p className="text-xs text-gray-400">As at {fmtDate(data.asOf)} · All amounts in SGD</p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* ASSETS */}
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-200">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-900">Assets</h2>
              </div>
              <Section
                label="Non-Current Assets"
                rows={ncAssets}
                subtotalLabel="Total Non-Current Assets"
                subtotal={ncAssets.reduce((s, a) => s + a.amount, 0)}
              />
              <div className="border-t border-gray-100 mt-1" />
              <Section
                label="Current Assets"
                rows={curAssets}
                subtotalLabel="Total Current Assets"
                subtotal={curAssets.reduce((s, a) => s + a.amount, 0)}
              />
              <Section
                label=""
                rows={[]}
                subtotalLabel="Total Assets"
                subtotal={data.totalAssets}
                isTotal
              />
            </div>

            {/* LIABILITIES + EQUITY */}
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-200">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-900">Liabilities &amp; Equity</h2>
              </div>
              <Section
                label="Current Liabilities"
                rows={curLiab}
                subtotalLabel="Total Current Liabilities"
                subtotal={curLiab.reduce((s, a) => s + a.amount, 0)}
              />
              <div className="border-t border-gray-100 mt-1" />
              <Section
                label="Non-Current Liabilities"
                rows={ncLiab}
                subtotalLabel="Total Non-Current Liabilities"
                subtotal={ncLiab.reduce((s, a) => s + a.amount, 0)}
              />
              <div className="flex justify-between px-5 py-2 bg-gray-50 border-t border-gray-200">
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Total Liabilities</span>
                <span className="font-mono text-sm font-semibold tabular-nums text-gray-900">{fmt(data.totalLiabilities)}</span>
              </div>

              {/* Equity */}
              <div className="border-t border-gray-200 mt-2" />
              <div className="px-5 py-2 text-xs font-semibold uppercase tracking-widest text-gray-400">Equity</div>
              {data.equity.filter(e => Math.abs(e.amount) > 0.005).map(e => (
                <div key={e.code} className="flex justify-between items-baseline px-5 py-1.5 border-b border-gray-100">
                  <span className="text-sm text-gray-600 flex items-baseline gap-2">
                    <span className="font-mono text-xs text-gray-400 w-10 shrink-0">{e.code}</span>
                    {e.name}
                  </span>
                  <span className={cn("font-mono text-sm tabular-nums ml-4", e.amount < 0 ? "text-red-600" : "text-gray-800")}>{fmt(e.amount)}</span>
                </div>
              ))}
              <div className="flex justify-between items-baseline px-5 py-1.5 border-b border-gray-100">
                <span className="text-sm text-gray-600 italic">Retained Earnings (cumulative P&amp;L)</span>
                <span className={cn("font-mono text-sm tabular-nums ml-4", data.retainedEarnings < 0 ? "text-red-600" : "text-gray-800")}>{fmt(data.retainedEarnings)}</span>
              </div>
              <div className="flex justify-between px-5 py-2 bg-gray-50 border-t border-gray-200">
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Total Equity</span>
                <span className={cn("font-mono text-sm font-semibold tabular-nums", data.totalEquity < 0 ? "text-red-600" : "text-gray-900")}>{fmt(data.totalEquity)}</span>
              </div>

              {/* Grand total */}
              <div className="flex justify-between items-baseline px-5 py-3 bg-gray-900 border-t border-gray-200">
                <span className="text-xs font-semibold uppercase tracking-widest text-gray-300">Total Liabilities &amp; Equity</span>
                <span className="font-mono text-sm font-semibold text-white tabular-nums">{fmt(data.totalLiabilitiesAndEquity)}</span>
              </div>
            </div>
          </div>

          {!data.balanced && (
            <p className="text-xs text-red-500">
              Difference: {fmt(Math.abs(data.totalAssets - data.totalLiabilitiesAndEquity))} — check for unposted journal entries or missing account classifications.
            </p>
          )}
          <p className="text-xs text-gray-400">Retained Earnings = cumulative net P&amp;L from all posted journal entries up to the selected date. Accounts with zero balance are hidden.</p>
        </>
      )}
    </div>
  );
}
