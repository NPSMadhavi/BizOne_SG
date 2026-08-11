import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/auth-context";
import { Download, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { generateTrialBalance_PDF } from "@/lib/pdf";

interface TBRow { id: number; code: string; name: string; type: string; subType: string | null; totalDebit: number; totalCredit: number; balance: number }
interface TBData { fromDate: string | null; toDate: string | null; rows: TBRow[]; grandDebit: number; grandCredit: number; balanced: boolean }

const TYPE_ORDER = ["asset", "liability", "equity", "revenue", "expense"];
const TYPE_LABEL: Record<string, string> = {
  asset: "Assets", liability: "Liabilities", equity: "Equity", revenue: "Revenue", expense: "Expenses",
};

function fmtAmt(n: number) {
  if (Math.abs(n) < 0.005) return null;
  return new Intl.NumberFormat("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}
function fmtBig(n: number) {
  return new Intl.NumberFormat("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

export default function TrialBalancePage() {
  const { selectedCompany } = useAuth();
  const today = new Date().toISOString().split("T")[0];
  const [from, setFrom] = useState(today.slice(0, 7) + "-01");
  const [to, setTo]     = useState(today);
  const [pdfLoading, setPdfLoading] = useState(false);

  const { data, isLoading, isError, error } = useQuery<TBData>({
    queryKey: ["trial-balance", from, to],
    queryFn: async () => {
      const p = new URLSearchParams();
      if (from) p.set("from", from);
      if (to)   p.set("to", to);
      const r = await fetch(`/api/trial-balance?${p}`, { credentials: "include" });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || "Failed to load"); }
      return r.json();
    },
    staleTime: 30_000,
  });

  const grouped = TYPE_ORDER.reduce<Record<string, TBRow[]>>((acc, t) => {
    acc[t] = data?.rows.filter(r => r.type === t && (r.totalDebit > 0.005 || r.totalCredit > 0.005)) ?? [];
    return acc;
  }, {});

  const hasData = data?.rows.some(r => r.totalDebit > 0.005 || r.totalCredit > 0.005);

  async function handleDownloadPDF() {
    if (!data) return;
    setPdfLoading(true);
    try {
      await generateTrialBalance_PDF(
        selectedCompany as any,
        from || null, to || null,
        data.rows,
        data.grandDebit, data.grandCredit, data.balanced
      );
    } finally {
      setPdfLoading(false);
    }
  }

  return (
    <div className="space-y-5 pb-20 animate-in fade-in duration-300">
      <div className="flex items-end justify-between flex-wrap gap-4 pb-4 border-b border-gray-200">
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">General Ledger</p>
          <h1 className="text-2xl font-bold text-[#2563EB]">Trial Balance</h1>
        </div>
        <div className="flex items-end gap-3 flex-wrap">
          <div className="space-y-1">
            <Label className="text-xs text-gray-500">From</Label>
            <Input type="date" value={from} max={to || today} onChange={e => setFrom(e.target.value)} className="w-36 text-sm h-8 border-gray-200" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-gray-500">To</Label>
            <Input type="date" value={to} min={from} max={today} onChange={e => setTo(e.target.value)} className="w-36 text-sm h-8 border-gray-200" />
          </div>
          {data && (
            <span className={cn(
              "text-xs font-semibold px-2.5 py-1 rounded border mb-0.5",
              data.balanced ? "border-green-200 text-green-700 bg-green-50" : "border-red-200 text-red-700 bg-red-50"
            )}>
              {data.balanced ? "Balanced ✓" : "Out of balance"}
            </span>
          )}
          {hasData && (
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
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b-2 border-gray-200 bg-gray-50">
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wider w-24">Code</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wider">Account Name</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wider w-44">Debit</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wider w-44">Credit</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wider w-44">Balance</th>
                </tr>
              </thead>
              <tbody>
                {!hasData && (
                  <tr><td colSpan={5} className="text-center py-16 text-sm text-gray-400">No journal entries for this period.</td></tr>
                )}
                {TYPE_ORDER.map(type =>
                  grouped[type].length > 0 ? (
                    <>
                      <tr key={`hdr-${type}`}>
                        <td colSpan={5} className="px-4 py-2.5 border-b border-t border-gray-100 bg-gray-50">
                          <div className="flex items-center gap-2.5">
                            <div className="w-0.5 h-3.5 bg-gray-400 rounded-full" />
                            <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">{TYPE_LABEL[type]}</span>
                          </div>
                        </td>
                      </tr>
                      {grouped[type].map(row => (
                        <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50/60">
                          <td className="px-4 py-2.5 font-mono text-xs text-gray-400">{row.code}</td>
                          <td className="px-4 py-2.5 text-sm text-gray-700">{row.name}</td>
                          <td className="text-right px-4 py-2.5 font-mono text-sm tabular-nums text-gray-800">
                            {fmtAmt(row.totalDebit) ?? <span className="text-gray-300">—</span>}
                          </td>
                          <td className="text-right px-4 py-2.5 font-mono text-sm tabular-nums text-gray-800">
                            {fmtAmt(row.totalCredit) ?? <span className="text-gray-300">—</span>}
                          </td>
                          <td className={cn("text-right px-4 py-2.5 font-mono text-sm tabular-nums", row.balance < 0 ? "text-red-600" : "text-gray-800")}>
                            {fmtAmt(Math.abs(row.balance))
                              ? <>{row.balance < 0 ? `(${fmtAmt(Math.abs(row.balance))})` : fmtAmt(row.balance)}</>
                              : <span className="text-gray-300">—</span>}
                          </td>
                        </tr>
                      ))}
                    </>
                  ) : null
                )}
              </tbody>
              <tfoot>
                <tr className="bg-gray-900 text-white">
                  <td colSpan={2} className="px-4 py-3 text-xs font-bold uppercase tracking-widest text-gray-300">Grand Total</td>
                  <td className="text-right px-4 py-3 font-mono text-base font-bold tabular-nums text-white">{fmtBig(data.grandDebit)}</td>
                  <td className="text-right px-4 py-3 font-mono text-base font-bold tabular-nums text-white">{fmtBig(data.grandCredit)}</td>
                  <td className={cn("text-right px-4 py-3 font-mono text-base font-bold tabular-nums", !data.balanced ? "text-red-300" : "text-gray-500")}>
                    {!data.balanced ? `(${fmtBig(Math.abs(data.grandDebit - data.grandCredit))})` : "—"}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
