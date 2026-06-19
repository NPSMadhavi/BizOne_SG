import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/auth-context";
import { Download, Loader2, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { generateGeneralLedger_PDF } from "@/lib/pdf";

interface GLAccount { id: number; code: string; name: string; type: string }
interface GLTransaction {
  journalEntryId: number;
  date: string;
  reference: string | null;
  description: string | null;
  debit: number;
  credit: number;
  balance: number;
}
interface GLData {
  account: { id: number; code: string; name: string; type: string; subType: string | null } | null;
  accounts: GLAccount[];
  openingBalance: number;
  closingBalance: number;
  transactions: GLTransaction[];
}

const TYPE_ORDER = ["asset", "liability", "equity", "revenue", "expense"];
const TYPE_LABEL: Record<string, string> = {
  asset: "Assets", liability: "Liabilities", equity: "Equity",
  revenue: "Revenue", expense: "Expenses",
};

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
      await generateGeneralLedger_PDF(
        selectedCompany as any, data.account, from || null, to || null,
        data.openingBalance, data.closingBalance, data.transactions
      );
    } finally {
      setPdfLoading(false);
    }
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-12">

      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-4 pb-4 border-b border-border">
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1">General Ledger</p>
          <h1 className="text-2xl font-bold text-foreground">Account Ledger</h1>
          <p className="text-sm text-muted-foreground mt-0.5">View posted journal entries by account</p>
        </div>
        {data?.account && data.transactions.length > 0 && (
          <Button variant="outline" size="sm" onClick={handleDownloadPDF} disabled={pdfLoading}>
            {pdfLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
            Download PDF
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-5">

        {/* Account selector panel */}
        <Card className="overflow-hidden">
          <CardHeader className="pb-0 px-4 py-3 border-b border-border bg-muted/30">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Chart of Accounts</CardTitle>
          </CardHeader>
          <div className="overflow-y-auto max-h-[calc(100vh-280px)]">
            {isLoading && !data && <div className="text-center py-8 text-sm text-muted-foreground">Loading…</div>}
            {TYPE_ORDER.map(type =>
              grouped[type]?.length > 0 ? (
                <div key={type}>
                  <div className="px-3 py-2 bg-muted/50 border-b border-t border-border">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{TYPE_LABEL[type]}</span>
                  </div>
                  {grouped[type].map(acct => (
                    <button
                      key={acct.id}
                      onClick={() => setSelectedAccountId(acct.id)}
                      className={cn(
                        "w-full text-left px-3 py-2.5 border-b border-border/50 flex items-center gap-3 transition-colors",
                        selectedAccountId === acct.id
                          ? "bg-primary text-primary-foreground hover:bg-primary/90"
                          : "hover:bg-muted",
                      )}
                    >
                      <span className={cn("font-mono text-xs w-10 shrink-0", selectedAccountId === acct.id ? "text-primary-foreground/60" : "text-muted-foreground")}>
                        {acct.code}
                      </span>
                      <span className={cn("text-sm truncate", selectedAccountId === acct.id ? "text-primary-foreground font-medium" : "text-foreground")}>
                        {acct.name}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null
            )}
          </div>
        </Card>

        {/* Ledger detail */}
        <div className="space-y-4">

          {/* Date range filter */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Date Range</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-end gap-4">
                <div className="space-y-1">
                  <Label className="text-xs">From</Label>
                  <Input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)} className="w-40 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">To</Label>
                  <Input type="date" value={to} min={from} max={today} onChange={e => setTo(e.target.value)} className="w-40 text-sm" />
                </div>
              </div>
            </CardContent>
          </Card>

          {!selectedAccountId && (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
                <BookOpen className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground mb-1">Select an account</p>
              <p className="text-xs text-muted-foreground">Choose an account from the list to view its ledger</p>
            </div>
          )}

          {isError && <div className="text-center py-12 text-red-600 text-sm">{(error as Error).message}</div>}
          {isLoading && selectedAccountId && <div className="text-center py-12 text-muted-foreground text-sm">Loading…</div>}

          {data?.account && (
            <div className="space-y-4">
              {/* Account header + summary */}
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-[#1a365d] text-white px-5 py-3">
                  <p className="text-[10px] tracking-widest uppercase opacity-70 mb-0.5">{data.account.code} · {data.account.type}</p>
                  <p className="text-base font-bold">{data.account.name}</p>
                </div>
                <div className="grid grid-cols-2 divide-x divide-border bg-muted/30">
                  <div className="px-5 py-4">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Opening Balance</p>
                    <p className={cn("text-sm font-semibold font-mono tabular-nums", data.openingBalance < 0 ? "text-red-600" : "text-foreground")}>
                      {fmtBal(data.openingBalance)}
                    </p>
                  </div>
                  <div className="px-5 py-4">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Closing Balance</p>
                    <p className={cn("text-sm font-bold font-mono tabular-nums", data.closingBalance < 0 ? "text-red-600" : "text-foreground")}>
                      {fmtBal(data.closingBalance)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Transactions table */}
              <Card>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="border-b-2 border-border bg-muted/40">
                        <th className="text-left px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider w-28">Date</th>
                        <th className="text-left px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider w-28">Reference</th>
                        <th className="text-left px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">Description</th>
                        <th className="text-right px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider w-36">Debit</th>
                        <th className="text-right px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider w-36">Credit</th>
                        <th className="text-right px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider w-36">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-border bg-muted/20">
                        <td className="px-4 py-2.5 text-xs text-muted-foreground italic">{fmtDate(from)}</td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground italic">B/F</td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground italic">Opening Balance</td>
                        <td className="px-4 py-2.5 text-right text-xs text-muted-foreground/50 font-mono tabular-nums">—</td>
                        <td className="px-4 py-2.5 text-right text-xs text-muted-foreground/50 font-mono tabular-nums">—</td>
                        <td className={cn("px-4 py-2.5 text-right text-xs font-mono tabular-nums font-semibold", data.openingBalance < 0 ? "text-red-600" : "text-foreground")}>
                          {fmtBal(data.openingBalance)}
                        </td>
                      </tr>

                      {data.transactions.length === 0 && (
                        <tr>
                          <td colSpan={6} className="text-center py-12 text-sm text-muted-foreground">
                            No transactions for this account in this period.
                          </td>
                        </tr>
                      )}

                      {data.transactions.map((tx, i) => (
                        <tr key={`${tx.journalEntryId}-${i}`} className="border-b border-border hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-2.5 text-sm text-muted-foreground">{fmtDate(tx.date)}</td>
                          <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{tx.reference || "—"}</td>
                          <td className="px-4 py-2.5 text-sm text-foreground max-w-xs truncate">{tx.description || "—"}</td>
                          <td className="text-right px-4 py-2.5 font-mono text-sm tabular-nums text-foreground">
                            {fmtAmt(tx.debit) ?? <span className="text-muted-foreground/40">—</span>}
                          </td>
                          <td className="text-right px-4 py-2.5 font-mono text-sm tabular-nums text-foreground">
                            {fmtAmt(tx.credit) ?? <span className="text-muted-foreground/40">—</span>}
                          </td>
                          <td className={cn("text-right px-4 py-2.5 font-mono text-sm tabular-nums font-semibold", tx.balance < 0 ? "text-red-600" : "text-foreground")}>
                            {fmtBal(tx.balance)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-[#1a365d] text-white">
                        <td colSpan={5} className="px-4 py-3 text-xs font-bold uppercase tracking-wider opacity-70">Closing Balance</td>
                        <td className={cn("text-right px-4 py-3 font-mono text-base font-bold tabular-nums", data.closingBalance < 0 ? "text-red-300" : "text-white")}>
                          {fmtBal(data.closingBalance)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
