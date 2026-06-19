import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/auth-context";
import { Download, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { generateBalanceSheet_PDF } from "@/lib/pdf";

interface AcctLine { code: string; name: string; subType: string | null; amount: number }
interface BSData {
  asOf: string;
  assets: AcctLine[]; totalAssets: number;
  liabilities: AcctLine[]; totalLiabilities: number;
  equity: AcctLine[]; retainedEarnings: number; totalEquity: number;
  totalLiabilitiesAndEquity: number;
  balanced: boolean;
}

function fmtAmt(n: number) {
  const abs = Math.abs(n);
  const s = new Intl.NumberFormat("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(abs);
  return n < 0 ? `(${s})` : s;
}
function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-SG", { day: "2-digit", month: "long", year: "numeric" });
}

function GroupLabel({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 px-5 py-2.5 bg-gray-50 border-b border-gray-100">
      <div className="w-0.5 h-4 bg-gray-300 rounded-full" />
      <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">{label}</span>
    </div>
  );
}

interface SectionProps { groupLabel?: string; rows: AcctLine[]; subtotalLabel: string; subtotal: number; isGrandTotal?: boolean }

function Section({ groupLabel, rows, subtotalLabel, subtotal, isGrandTotal }: SectionProps) {
  const active = rows.filter(r => Math.abs(r.amount) > 0.005);
  return (
    <>
      {groupLabel && <GroupLabel label={groupLabel} />}
      {active.map(r => (
        <div key={r.code} className="flex items-baseline justify-between px-5 py-2 border-b border-gray-100 hover:bg-gray-50/60">
          <span className="flex items-baseline gap-3 text-sm text-gray-600">
            <span className="font-mono text-xs text-gray-400 w-10 shrink-0">{r.code}</span>
            {r.name}
          </span>
          <span className={cn("font-mono text-sm tabular-nums ml-6 shrink-0", r.amount < 0 ? "text-red-600" : "text-gray-800")}>{fmtAmt(r.amount)}</span>
        </div>
      ))}
      {active.length === 0 && <div className="px-5 py-3 text-xs text-gray-300 italic pl-[4.5rem]">No entries</div>}
      <div className={cn("flex items-baseline justify-between px-5 py-3", isGrandTotal ? "bg-gray-900 text-white" : "bg-gray-50 border-t border-gray-200")}>
        <span className={cn("text-xs font-bold uppercase tracking-wider", isGrandTotal ? "text-gray-300" : "text-gray-500")}>{subtotalLabel}</span>
        <span className={cn("font-mono tabular-nums shrink-0 ml-6", isGrandTotal ? "text-white text-base font-bold" : subtotal < 0 ? "text-red-600 text-sm font-semibold" : "text-gray-900 text-sm font-semibold")}>
          {fmtAmt(subtotal)}
        </span>
      </div>
    </>
  );
}

function SubtotalBar({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="flex items-baseline justify-between px-5 py-2.5 bg-gray-100 border-t-2 border-gray-200">
      <span className="text-xs font-bold uppercase tracking-wider text-gray-500">{label}</span>
      <span className={cn("font-mono text-sm font-semibold tabular-nums ml-6", amount < 0 ? "text-red-600" : "text-gray-900")}>{fmtAmt(amount)}</span>
    </div>
  );
}

export default function BalanceSheetPage() {
  const { selectedCompany } = useAuth();
  const today = new Date().toISOString().split("T")[0];
  const [asOf, setAsOf] = useState(today);
  const [pdfLoading, setPdfLoading] = useState(false);

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

  async function handleDownloadPDF() {
    if (!data) return;
    setPdfLoading(true);
    try {
      await generateBalanceSheet_PDF(
        selectedCompany as any, asOf,
        data.assets, data.totalAssets,
        data.liabilities, data.totalLiabilities,
        data.equity, data.retainedEarnings, data.totalEquity,
        data.totalLiabilitiesAndEquity, data.balanced
      );
    } finally {
      setPdfLoading(false);
    }
  }

  return (
    <div className="max-w-7xl mx-auto space-y-5 pb-20 animate-in fade-in duration-300">
      <div className="flex items-end justify-between flex-wrap gap-4 pb-4 border-b border-gray-200">
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">Financial Statements</p>
          <h1 className="text-2xl font-bold text-gray-900">Balance Sheet</h1>
        </div>
        <div className="flex items-end gap-4 flex-wrap">
          <div className="space-y-1">
            <Label className="text-xs text-gray-500">As of Date</Label>
            <Input type="date" value={asOf} max={today} onChange={e => setAsOf(e.target.value)} className="w-40 text-sm h-8 border-gray-200" />
          </div>
          {data && (
            <span className={cn("text-xs font-semibold px-2.5 py-1 rounded border mb-0.5", data.balanced ? "border-green-200 text-green-700 bg-green-50" : "border-red-200 text-red-700 bg-red-50")}>
              {data.balanced ? "Balanced ✓" : "Out of balance"}
            </span>
          )}
          {data && (
            <Button variant="outline" size="sm" onClick={handleDownloadPDF} disabled={pdfLoading} className="border-gray-200 text-gray-600 hover:text-gray-900 mb-0.5">
              {pdfLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
              Download PDF
            </Button>
          )}
        </div>
      </div>

      {isLoading && <div className="text-center py-16 text-sm text-gray-400">Loading…</div>}
      {isError   && <div className="text-center py-16 text-sm text-red-500">{(error as Error).message}</div>}

      {data && (
        <>
          <p className="text-xs text-gray-400">As at {fmtDate(data.asOf)} · All amounts in SGD · Accounts with zero balance are hidden.</p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-200 bg-white">
                <h2 className="text-sm font-bold uppercase tracking-widest text-gray-800">Assets</h2>
              </div>
              <Section groupLabel="Non-Current Assets" rows={ncAssets} subtotalLabel="Total Non-Current Assets" subtotal={ncAssets.reduce((s, a) => s + a.amount, 0)} />
              <Section groupLabel="Current Assets" rows={curAssets} subtotalLabel="Total Current Assets" subtotal={curAssets.reduce((s, a) => s + a.amount, 0)} />
              <Section rows={[]} subtotalLabel="Total Assets" subtotal={data.totalAssets} isGrandTotal />
            </div>

            <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-200 bg-white">
                <h2 className="text-sm font-bold uppercase tracking-widest text-gray-800">Liabilities &amp; Equity</h2>
              </div>
              <Section groupLabel="Current Liabilities" rows={curLiab} subtotalLabel="Total Current Liabilities" subtotal={curLiab.reduce((s, a) => s + a.amount, 0)} />
              <Section groupLabel="Non-Current Liabilities" rows={ncLiab} subtotalLabel="Total Non-Current Liabilities" subtotal={ncLiab.reduce((s, a) => s + a.amount, 0)} />
              <SubtotalBar label="Total Liabilities" amount={data.totalLiabilities} />

              <GroupLabel label="Equity" />
              {data.equity.filter(e => Math.abs(e.amount) > 0.005).map(e => (
                <div key={e.code} className="flex items-baseline justify-between px-5 py-2 border-b border-gray-100 hover:bg-gray-50/60">
                  <span className="flex items-baseline gap-3 text-sm text-gray-600">
                    <span className="font-mono text-xs text-gray-400 w-10 shrink-0">{e.code}</span>
                    {e.name}
                  </span>
                  <span className={cn("font-mono text-sm tabular-nums ml-6 shrink-0", e.amount < 0 ? "text-red-600" : "text-gray-800")}>{fmtAmt(e.amount)}</span>
                </div>
              ))}
              <div className="flex items-baseline justify-between px-5 py-2 border-b border-gray-100 hover:bg-gray-50/60">
                <span className="flex items-baseline gap-3 text-sm text-gray-500 italic">
                  <span className="w-10 shrink-0" />Retained Earnings
                </span>
                <span className={cn("font-mono text-sm tabular-nums ml-6 shrink-0", data.retainedEarnings < 0 ? "text-red-600" : "text-gray-800")}>{fmtAmt(data.retainedEarnings)}</span>
              </div>
              <SubtotalBar label="Total Equity" amount={data.totalEquity} />

              <div className="flex items-baseline justify-between px-5 py-3 bg-gray-900">
                <span className="text-xs font-bold uppercase tracking-widest text-gray-300">Total Liabilities &amp; Equity</span>
                <span className="font-mono text-base font-bold text-white tabular-nums ml-6">{fmtAmt(data.totalLiabilitiesAndEquity)}</span>
              </div>
            </div>
          </div>

          {!data.balanced && (
            <p className="text-xs text-red-500">Difference: {fmtAmt(Math.abs(data.totalAssets - data.totalLiabilitiesAndEquity))} — check for unposted journal entries or missing account classifications.</p>
          )}
        </>
      )}
    </div>
  );
}
