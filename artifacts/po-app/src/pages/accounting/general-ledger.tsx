import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/contexts/auth-context";
import { Download, Loader2, BookOpen, Search } from "lucide-react";
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

/** Lower score = better match (exact code → name starts with → name includes → code). */
function matchRank(account: GLAccount, q: string): number {
  const code = account.code.toLowerCase();
  const name = account.name.toLowerCase();
  if (code === q) return 0;
  if (name === q) return 1;
  if (code.startsWith(q)) return 2;
  if (name.startsWith(q)) return 3;
  if (name.includes(q)) return 4;
  if (code.includes(q)) return 5;
  return 90;
}

export default function GeneralLedgerPage() {
  const { selectedCompany } = useAuth();
  const today = new Date().toISOString().split("T")[0];
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const [from, setFrom] = useState(today.slice(0, 7) + "-01");
  const [to, setTo]     = useState(today);
  const [search, setSearch] = useState("");
  const [pdfLoading, setPdfLoading] = useState(false);
  const [cachedAccounts, setCachedAccounts] = useState<GLAccount[]>([]);

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

  // Keep the full Chart of Accounts available for search even when query key changes
  useEffect(() => {
    if (data?.accounts?.length) setCachedAccounts(data.accounts);
  }, [data?.accounts]);

  const accounts = cachedAccounts.length > 0 ? cachedAccounts : (data?.accounts ?? []);
  const searchQuery = search.trim().toLowerCase();
  const isSearching = searchQuery.length > 0;

  const filteredAccounts = useMemo(() => {
    if (!isSearching) return [] as GLAccount[];
    return accounts
      .filter(a =>
        a.code.toLowerCase().includes(searchQuery) ||
        a.name.toLowerCase().includes(searchQuery) ||
        (TYPE_LABEL[a.type] || a.type).toLowerCase().includes(searchQuery)
      )
      .slice()
      .sort((a, b) => {
        const ra = matchRank(a, searchQuery);
        const rb = matchRank(b, searchQuery);
        if (ra !== rb) return ra - rb;
        return a.code.localeCompare(b.code, undefined, { numeric: true });
      });
  }, [accounts, isSearching, searchQuery]);

  const bestMatchId = filteredAccounts[0]?.id ?? null;

  // Any search hit → open best-match ledger immediately (e.g. "cash at bank" → 1010)
  useEffect(() => {
    if (!isSearching) return;
    setSelectedAccountId(bestMatchId);
  }, [isSearching, searchQuery, bestMatchId]);

  const dropdownAccounts = accounts;
  const dropdownGrouped = useMemo(() =>
    TYPE_ORDER.reduce<Record<string, GLAccount[]>>((acc, t) => {
      acc[t] = dropdownAccounts.filter(a => a.type === t);
      return acc;
    }, {}),
  [dropdownAccounts]);

  function selectAccount(id: number) {
    setSelectedAccountId(id);
    setSearch("");
  }

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
    <div className="space-y-6 pb-12">

      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-4 pb-4 border-b border-border">
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1">General Ledger</p>
          <h1 className="text-2xl font-bold text-[#2563EB]">Account Ledger</h1>
          <p className="text-sm text-muted-foreground mt-0.5">View posted journal entries by account</p>
        </div>
        {data?.account && data.transactions.length > 0 && (
          <Button variant="outline" size="sm" onClick={handleDownloadPDF} disabled={pdfLoading}>
            {pdfLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
            Download PDF
          </Button>
        )}
      </div>

      {/* Top filters: search + chart of accounts + date range */}
      <Card>
        <CardContent className="pt-5 pb-5">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-end">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Search</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search by code or name…"
                  className="pl-9 text-sm"
                />
              </div>
            </div>

            <div className="space-y-1.5 md:col-span-1 xl:col-span-1">
              <Label className="text-xs text-muted-foreground">Chart of Accounts</Label>
              <Select
                value={selectedAccountId != null ? String(selectedAccountId) : undefined}
                onValueChange={(v) => {
                  if (v) selectAccount(Number(v));
                  else setSelectedAccountId(null);
                }}
                disabled={isLoading && !data}
              >
                <SelectTrigger className="w-full text-sm">
                  <SelectValue placeholder={isLoading && !data ? "Loading accounts…" : "Select an account"} />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {dropdownAccounts.length === 0 ? (
                    <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                      No accounts found
                    </div>
                  ) : (
                    TYPE_ORDER.map(type =>
                      dropdownGrouped[type]?.length > 0 ? (
                        <SelectGroup key={type}>
                          <SelectLabel className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                            {TYPE_LABEL[type]}
                          </SelectLabel>
                          {dropdownGrouped[type].map(acct => (
                            <SelectItem key={acct.id} value={String(acct.id)}>
                              <span className="font-mono text-xs text-muted-foreground mr-2">{acct.code}</span>
                              {acct.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      ) : null
                    )
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">From</Label>
              <Input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)} className="text-sm" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">To</Label>
              <Input type="date" value={to} min={from} max={today} onChange={e => setTo(e.target.value)} className="text-sm" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Ledger / empty / no-match */}
      <div className="space-y-4">
        {isSearching && filteredAccounts.length === 0 && (
          <div className="text-center py-16 text-sm text-muted-foreground border rounded-lg bg-muted/10">
            No accounts match “{search.trim()}”
          </div>
        )}

        {!selectedAccountId && !isSearching && (
          <div className="flex flex-col items-center justify-center py-24 text-center border rounded-lg bg-muted/10">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
              <BookOpen className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground mb-1">Select an account</p>
            <p className="text-xs text-muted-foreground">Search by code/name above, or pick from Chart of Accounts</p>
          </div>
        )}

        {isError && <div className="text-center py-12 text-red-600 text-sm">{(error as Error).message}</div>}
        {isLoading && selectedAccountId && <div className="text-center py-12 text-muted-foreground text-sm">Loading…</div>}

        {data?.account && selectedAccountId && (
          <div className="space-y-4">
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
  );
}
