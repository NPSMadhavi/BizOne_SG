import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { FileText } from "lucide-react";

interface ActivityTx {
  journalEntryId: number;
  date: string;
  reference: string | null;
  description: string | null;
  debit: number;
  credit: number;
  sourcePath?: string;
}

function fmtMoney(n: number) {
  if (Math.abs(n) < 0.005) return "—";
  return new Intl.NumberFormat("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("en-SG", { day: "2-digit", month: "short", year: "numeric" });
}

/** Expandable account lines. Selecting a line opens the source document, same as Profit & Loss. */
export function AccountActivityPanel({
  accountId,
  accountCode,
  from,
  to,
  returnTo,
}: {
  accountId?: number | null;
  accountCode?: string | null;
  from?: string | null;
  to?: string | null;
  returnTo?: string | null;
}) {
  const [, setLocation] = useLocation();

  function openSource(path: string) {
    if (!returnTo) {
      setLocation(path);
      return;
    }
    const join = path.includes("?") ? "&" : "?";
    setLocation(`${path}${join}returnTo=${encodeURIComponent(returnTo)}`);
  }
  const { data, isLoading, isError } = useQuery<{ transactions: ActivityTx[] }>({
    queryKey: ["account-activity", accountId ?? null, accountCode ?? null, from ?? "", to ?? ""],
    queryFn: async () => {
      const p = new URLSearchParams();
      if (accountId) p.set("accountId", String(accountId));
      else if (accountCode) p.set("accountCode", accountCode);
      if (from) p.set("from", from);
      if (to) p.set("to", to);
      const r = await fetch(`/api/general-ledger?${p}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load");
      return r.json();
    },
    enabled: Boolean(accountId || accountCode),
  });

  const rows = data?.transactions ?? [];

  return (
    <div className="m-2 border border-blue-200 rounded-lg bg-blue-50/20 overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-3 py-2 bg-blue-50/60 border-b border-blue-100 text-xs">
        <span className="font-semibold text-blue-900 flex items-center gap-1.5">
          <FileText className="h-3.5 w-3.5 text-blue-600" />
          Account activity — select a row to open it
        </span>
        <span className="text-gray-500">{rows.length} line{rows.length === 1 ? "" : "s"}</span>
      </div>
      {isLoading && <div className="py-4 text-center text-xs text-gray-400">Loading…</div>}
      {isError && <div className="py-4 text-center text-xs text-red-500">Could not load this account.</div>}
      {!isLoading && !isError && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-100 border-b border-slate-200 uppercase font-semibold text-slate-700">
              <tr>
                <th className="py-2.5 px-3 text-left whitespace-nowrap">Date</th>
                <th className="py-2.5 px-3 text-left whitespace-nowrap">Reference</th>
                <th className="py-2.5 px-3 text-left whitespace-nowrap">Description</th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap">Debit (S$)</th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap">Credit (S$)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-gray-400 italic">No transactions in this period.</td>
                </tr>
              ) : (
                rows.map((tx) => (
                  <tr
                    key={tx.journalEntryId}
                    className="hover:bg-blue-50 transition-colors cursor-pointer"
                    onClick={() => openSource(tx.sourcePath || `/accounting/journal-entries/${tx.journalEntryId}`)}
                  >
                    <td className="py-2 px-3 text-gray-600 whitespace-nowrap">{fmtDate(tx.date)}</td>
                    <td className="py-2 px-3 font-mono font-medium text-blue-700 whitespace-nowrap">{tx.reference || "—"}</td>
                    <td className="py-2 px-3 text-gray-800">{tx.description || "—"}</td>
                    <td className="py-2 px-3 text-right font-mono whitespace-nowrap">{fmtMoney(tx.debit)}</td>
                    <td className="py-2 px-3 text-right font-mono whitespace-nowrap">{fmtMoney(tx.credit)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
