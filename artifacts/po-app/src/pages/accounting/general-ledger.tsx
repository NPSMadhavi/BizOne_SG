import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/auth-context";
import { Download, Loader2, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { generateGeneralLedger_PDF } from "@/lib/pdf";

interface GLAccount { id: number; code: string; name: string; type: string }
interface GLTransaction { journalEntryId: number; date: string; reference: string | null; description: string | null; debit: number; credit: number; balance: number }
interface GLData { account: { id: number; code: string; name: string; type: string; subType: string | null } | null; accounts: GLAccount[]; openingBalance: number; closingBalance: number; transactions: GLTransaction[] }

const TYPE_ORDER = ["asset", "liability", "equity", "revenue", "expense"];
const TYPE_LABEL: Record<string, string> = { asset: "Assets", liability: "Liabilities", equity: "Equity", revenue: "Revenue", expense: "Expenses" };

function fmtAmt(n: number) {
  if (Math.abs(n) < 0.005) return null;
  return new Intl.NumberFormat("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(n));
}
function fmtBal(n: number) {
  const s = new Intl.NumberFormat("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(n));
  return n < 0 ? `(${s})` : s;
}
function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("en-SG", { day: "2-digit", month: "short", year: "numeric" });
}

export default function GeneralLedgerPage() {
  const { selectedCompany } = useAuth();
  const today = new Date().toISOString().split("T")[0];
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const [from, setFrom] = useState(today.slice(0, 7) + "-01");
  const [to, setTo]     = useState(today);
  const [pdfLoading, setPdfLoading] = useState(false);

  const { data, isLoading, isError, error } = useQuery<GLData>({
    queryKey: ["general-ledger", selectedAccountId, from, to],
    queryFn: async () => {
      const p = new URLSearchParams();
      if (selectedAccountId) p.set("accountId", String(selectedAccountId));
      if (from) p.set("from", from);
      if (to)   p.set("to", to);
      const r = await fetch(`/api/general-ledger?${p}`, { credentials: "include" });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || "Failed to load"); }
      return r.json();
    },
    staleTime: 30_000,
  });

  const grouped = TYPE_ORDER.reduce<Record<string, GLAccount[]>>((acc, t) => {
    acc[t] = data?.accounts.filter(a => a.type === t) ?? [];
    return acc;
  }, {});

  async function handleDownloadPDF() {
    if (!data || !data.account) return;
    setPdfLoading(true);
    try {
      await generateGeneralLedger_PDF(selectedCompany as any, data.account, from || null, to || null, data.openingBalance, data.closingBalance, data.transactions);
    } finally {
      setPdfLoading(false);
    }
  }

  return (
    <div className="max-w-7xl mx-auto space-y-5 pb-20 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-4 pb-4 border-b border-gray-200">
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">General Ledger</p>
          <h1 className="text-2xl font-bold text-gray-900">Account Ledger</h1>
        </div>
        {data?.account && data.transactions.length > 0 && (
          <Button variant="outline" size="sm" onClick={handleDownloadPDF} disabled={pdfLoading} className="border-gray-200 text-gray-600 hover:text-gray-900">
            {pdfLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
            Download PDF
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-5">
        {/* Account selector */}
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Chart of Accounts</p>
          </div>
          <div className="overflow-y-auto max-h-[calc(100vh-280px)]">
            {isLoading && !data && <div className="text-center py-8 text-sm text-gray-400">Loading…</div>}
            {TYPE_ORDER.map(type =>
              grouped[type]?.length > 0 ? (
                <div key={type}>
                  <div className="px-3 py-2 bg-gray-50 border-b border-t border-gray-100">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{TYPE_LABEL[type]}</span>
                  </div>
                  {grouped[type].map(acct => (
                    <button
                      key={acct.id}
                      onClick={() => setSelectedAccountId(acct.id)}
                      className={cn("w-full text-left px-3 py-2.5 border-b border-gray-50 flex items-center gap-3 hover:bg-gray-50 transition-colors",
                        selectedAccountId === acct.id ? "bg-gray-900 text-white hover:bg-gray-900" : ""
                      )}
                    >
                      <span className={cn("font-mono text-xs w-10 shrink-0", selectedAccountId === acct.id ? "text-gray-400" : "text-gray-400")}>{acct.code}</span>
                      <span className={cn("text-sm truncate", selectedAccountId === acct.id ? "text-white font-medium" : "text-gray-700")}>{acct.name}</span>
                    </button>
                  ))}
                </div>
              ) : null
            )}
          </div>
        </div>

        {/* Ledger detail */}
        <div className="space-y-4">
          {/* Date range */}
          <div className="flex flex-wrap items-end gap-3 p-4 bg-white border border-gray-200 rounded-lg shadow-sm">
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">From</Label>
              <Input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)} className="w-36 text-sm h-8 border-gray-200" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">To</Label>
              <Input type="date" value={to} min={from} max={today} onChange={e => setTo(e.target.value)} className="w-36 text-sm h-8 border-gray-200" />
            </div>
          </div>

          {!selectedAccountId && (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-4">
                <BookOpen className="h-5 w-5 text-gray-400" />
              </div>
              <p className="text-sm font-medium text-gray-600 mb-1">Select an account</p>
              <p className="text-xs text-gray-400">Choose an account from the list to view its ledger</p>
            </div>
          )}

          {isError && <div className="text-center py-16 text-sm text-red-500">{(error as Error).message}</div>}
          {isLoading && selectedAccountId && <div className="text-center py-16 text-sm text-gray-400">Loading…</div>}

          {data?.account && (
            <>
              {/* Account header + summary */}
              <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
                <div className="grid grid-cols-3 divide-x divide-gray-100">
                  <div className="px-5 py-4 col-span-1 bg-gray-900 text-white rounded-l-lg">
                    <p className="text-xs text-gray-400 mb-0.5">{data.account.code} · {data.account.type}</p>
                    <p className="text-base font-bold">{data.account.name}</p>
                  </div>
                  <div className="px-5 py-4">
                    <p className="text-xs text-gray-400 mb-1">Opening Balance</p>
                    <p className={cn("text-sm font-semibold font-mono tabular-nums", data.openingBalance < 0 ? "text-red-600" : "text-gray-800")}>{fmtBal(data.openingBalance)}</p>
                  </div>
                  <div className="px-5 py-4">
                    <p className="text-xs text-gray-400 mb-1">Closing Balance</p>
                    <p className={cn("text-sm font-bold font-mono tabular-nums", data.closingBalance < 0 ? "text-red-600" : "text-gray-900")}>{fmtBal(data.closingBalance)}</p>
                  </div>
                </div>
              </div>

              {/* Transactions table */}
              <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="border-b-2 border-gray-200 bg-gray-50">
                        <th className="text-left px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wider w-28">Date</th>
                        <th className="text-left px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wider w-28">Reference</th>
                        <th className="text-left px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wider">Description</th>
                        <th className="text-right px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wider w-36">Debit</th>
                        <th className="text-right px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wider w-36">Credit</th>
                        <th className="text-right px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wider w-36">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Opening balance row */}
                      <tr className="border-b border-gray-100 bg-gray-50/50">
                        <td className="px-4 py-2.5 text-xs text-gray-400 italic">{fmtDate(from)}</td>
                        <td className="px-4 py-2.5 text-xs text-gray-400 italic">B/F</td>
                        <td className="px-4 py-2.5 text-xs text-gray-400 italic">Opening Balance</td>
                        <td className="px-4 py-2.5 text-right text-xs text-gray-400 font-mono tabular-nums">—</td>
                        <td className="px-4 py-2.5 text-right text-xs text-gray-400 font-mono tabular-nums">—</td>
                        <td className={cn("px-4 py-2.5 text-right text-xs font-mono tabular-nums font-semibold", data.openingBalance < 0 ? "text-red-600" : "text-gray-700")}>{fmtBal(data.openingBalance)}</td>
                      </tr>

                      {data.transactions.length === 0 && (
                        <tr><td colSpan={6} className="text-center py-12 text-sm text-gray-400">No transactions for this account in this period.</td></tr>
                      )}

                      {data.transactions.map((tx, i) => (
                        <tr key={`${tx.journalEntryId}-${i}`} className="border-b border-gray-100 hover:bg-gray-50/60">
                          <td className="px-4 py-2.5 text-sm text-gray-500">{fmtDate(tx.date)}</td>
                          <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{tx.reference || "—"}</td>
                          <td className="px-4 py-2.5 text-sm text-gray-700 max-w-xs truncate">{tx.description || "—"}</td>
                          <td className="text-right px-4 py-2.5 font-mono text-sm tabular-nums text-gray-800">
                            {fmtAmt(tx.debit) ?? <span className="text-gray-300">—</span>}
                          </td>
                          <td className="text-right px-4 py-2.5 font-mono text-sm tabular-nums text-gray-800">
                            {fmtAmt(tx.credit) ?? <span className="text-gray-300">—</span>}
                          </td>
                          <td className={cn("text-right px-4 py-2.5 font-mono text-sm tabular-nums font-semibold", tx.balance < 0 ? "text-red-600" : "text-gray-900")}>{fmtBal(tx.balance)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-900 text-white">
                        <td colSpan={5} className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-gray-300">Closing Balance</td>
                        <td className={cn("text-right px-4 py-3 font-mono text-base font-bold tabular-nums", data.closingBalance < 0 ? "text-red-300" : "text-white")}>{fmtBal(data.closingBalance)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
