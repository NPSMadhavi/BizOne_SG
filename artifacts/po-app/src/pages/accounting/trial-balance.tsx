import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/auth-context";
import { ChevronDown, Download, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { generateTrialBalance_PDF } from "@/lib/pdf";
import { AccountActivityPanel } from "@/pages/accounting/account-activity";

interface TBRow {
  id: number; code: string; name: string; type: string; subType: string | null;
  totalDebit: number; totalCredit: number;
  openingBalance: number; closingBalance: number; balance: number;
}
interface TBData {
  fromDate: string | null; toDate: string | null; rows: TBRow[];
  grandDebit: number; grandCredit: number;
  grandOpening: number; grandClosing: number; balanced: boolean;
}

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
function rowHasActivity(r: TBRow) {
  return r.totalDebit > 0.005 || r.totalCredit > 0.005
    || Math.abs(r.openingBalance || 0) > 0.005
    || Math.abs(r.closingBalance ?? r.balance) > 0.005;
}
function initialTbFilters() {
  const today = new Date().toISOString().split("T")[0];
  const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const expand = Number(params.get("expand") || "");
  return {
    from: params.get("from") || today.slice(0, 7) + "-01",
    to: params.get("to") || today,
    expand: Number.isFinite(expand) && expand > 0 ? expand : null,
  };
}

function tbReturnPath(from: string, to: string, accountId: number) {
  const q = new URLSearchParams();
  if (from) q.set("from", from);
  if (to) q.set("to", to);
  q.set("expand", String(accountId));
  return `/accounting/trial-balance?${q.toString()}`;
}

function SignedAmount({ value, strong = false }: { value: number; strong?: boolean }) {
  const shown = strong ? fmtBig(Math.abs(value)) : fmtAmt(Math.abs(value));
  if (!shown) return <span className={strong ? "text-gray-500" : "text-gray-300"}>—</span>;
  return (
    <span className={value < 0 ? (strong ? "text-red-300" : "text-red-600") : undefined}>
      {value < 0 ? `(${shown})` : shown}
    </span>
  );
}

export default function TrialBalancePage() {
  const { selectedCompany } = useAuth();
  const today = new Date().toISOString().split("T")[0];
  const [boot] = useState(initialTbFilters);
  const [from, setFrom] = useState(boot.from);
  const [to, setTo]     = useState(boot.to);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [expanded, setExpanded] = useState<Record<number, boolean>>(
    boot.expand ? { [boot.expand]: true } : {},
  );

  function toggleRow(id: number) {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  }

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
    acc[t] = data?.rows.filter(r => r.type === t && rowHasActivity(r)) ?? [];
    return acc;
  }, {});

  const hasData = data?.rows.some(rowHasActivity);

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
                  <th className="text-right px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wider w-40">Opening Balance</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wider w-36">Debit</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wider w-36">Credit</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wider w-40">Closing Balance</th>
                </tr>
              </thead>
              <tbody>
                {!hasData && (
                  <tr><td colSpan={6} className="text-center py-16 text-sm text-gray-400">No journal entries for this period.</td></tr>
                )}
                {TYPE_ORDER.map(type =>
                  grouped[type].length > 0 ? (
                    <Fragment key={type}>
                      <tr>
                        <td colSpan={6} className="px-4 py-2.5 border-b border-t border-gray-100 bg-gray-50">
                          <div className="flex items-center gap-2.5">
                            <div className="w-0.5 h-3.5 bg-gray-400 rounded-full" />
                            <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">{TYPE_LABEL[type]}</span>
                          </div>
                        </td>
                      </tr>
                      {grouped[type].map(row => {
                        const open = Boolean(expanded[row.id]);
                        return (
                          <Fragment key={row.id}>
                            <tr
                              className={cn("border-b border-gray-100 cursor-pointer hover:bg-blue-50/70", open && "bg-blue-50/40")}
                              onClick={() => toggleRow(row.id)}
                            >
                              <td className="px-4 py-2.5 font-mono text-xs text-gray-400">{row.code}</td>
                              <td className="px-4 py-2.5 text-sm text-gray-700">
                                <span className="inline-flex items-center gap-2">
                                  <span className={cn(open && "text-blue-700 font-medium")}>{row.name}</span>
                                  <ChevronDown className={cn("h-3.5 w-3.5 text-gray-400 transition-transform", open && "rotate-180 text-blue-600")} />
                                </span>
                              </td>
                              <td className="text-right px-4 py-2.5 font-mono text-sm tabular-nums text-gray-800">
                                <SignedAmount value={row.openingBalance || 0} />
                              </td>
                              <td className="text-right px-4 py-2.5 font-mono text-sm tabular-nums text-gray-800">
                                {fmtAmt(row.totalDebit) ?? <span className="text-gray-300">—</span>}
                              </td>
                              <td className="text-right px-4 py-2.5 font-mono text-sm tabular-nums text-gray-800">
                                {fmtAmt(row.totalCredit) ?? <span className="text-gray-300">—</span>}
                              </td>
                              <td className="text-right px-4 py-2.5 font-mono text-sm tabular-nums text-gray-800">
                                <SignedAmount value={row.closingBalance ?? row.balance} />
                              </td>
                            </tr>
                            {open && (
                              <tr className="border-b border-gray-100">
                                <td colSpan={6} className="p-0 bg-slate-50/80">
                                  <AccountActivityPanel accountId={row.id} from={from} to={to} returnTo={tbReturnPath(from, to, row.id)} />
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </Fragment>
                  ) : null
                )}
              </tbody>
              <tfoot>
                <tr className="bg-gray-900 text-white">
                  <td colSpan={2} className="px-4 py-3 text-xs font-bold uppercase tracking-widest text-gray-300">Grand Total</td>
                  <td className="text-right px-4 py-3 font-mono text-base font-bold tabular-nums">
                    <SignedAmount value={data.grandOpening || 0} strong />
                  </td>
                  <td className="text-right px-4 py-3 font-mono text-base font-bold tabular-nums text-white">{fmtBig(data.grandDebit)}</td>
                  <td className="text-right px-4 py-3 font-mono text-base font-bold tabular-nums text-white">{fmtBig(data.grandCredit)}</td>
                  <td className="text-right px-4 py-3 font-mono text-base font-bold tabular-nums">
                    <SignedAmount value={data.grandClosing ?? (data.grandDebit - data.grandCredit)} strong />
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
