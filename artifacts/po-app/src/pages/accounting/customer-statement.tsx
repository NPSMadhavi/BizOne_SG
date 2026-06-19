import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/auth-context";
import { Printer, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";

interface StmtEntry { id: number; invNumber: string; issueDate: string | null; amount: number; status: string; paymentTerms: string | null }
interface StmtData { customer: string; customerNames: string[]; entries: StmtEntry[]; totalBilled: number; totalPaid: number; balance: number }

function fmt(n: number) { return new Intl.NumberFormat("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n); }
function fmtDate(d: string | null) { if (!d) return "—"; return new Date(d + "T00:00:00").toLocaleDateString("en-SG", { day: "2-digit", month: "short", year: "numeric" }); }

export default function CustomerStatementPage() {
  const { selectedCompany } = useAuth();
  const [, navigate] = useLocation();

  const today = new Date().toISOString().split("T")[0];
  const threeMonthsAgo = new Date(); threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  const defaultFrom = threeMonthsAgo.toISOString().split("T")[0];

  const [customer, setCustomer] = useState("");
  const [search, setSearch]     = useState("");
  const [from, setFrom]         = useState(defaultFrom);
  const [to, setTo]             = useState(today);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const { data, isLoading, isError, error } = useQuery<StmtData>({
    queryKey: ["customer-statement", customer, from, to],
    queryFn: async () => {
      const p = new URLSearchParams();
      if (customer) p.set("customer", customer);
      if (from) p.set("from", from);
      if (to)   p.set("to", to);
      const r = await fetch(`/api/customer-statement?${p}`, { credentials: "include" });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || "Failed to load"); }
      return r.json();
    },
    staleTime: 30_000,
  });

  const suggestions = (data?.customerNames ?? []).filter(n => n.toLowerCase().includes(search.toLowerCase()) && n !== customer);

  function selectCustomer(name: string) {
    setCustomer(name);
    setSearch(name);
    setShowSuggestions(false);
  }

  return (
    <div className="max-w-7xl mx-auto space-y-5 pb-20 animate-in fade-in duration-300 print:p-0 print:space-y-4">
      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-4 print:hidden">
        <div>
          <p className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-1">Accounts Receivable</p>
          <h1 className="text-xl font-semibold text-gray-900">Customer Statement</h1>
        </div>
        {customer && data && data.entries.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => window.print()} className="border-gray-200 text-gray-600 hover:text-gray-900">
            <Printer className="h-4 w-4 mr-2" />Print Statement
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-end p-4 bg-white border border-gray-200 rounded-lg print:hidden">
        <div className="flex-1 min-w-52 space-y-1 relative">
          <Label className="text-xs text-gray-500">Customer</Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-2 h-4 w-4 text-gray-300" />
            <Input
              value={search}
              onChange={e => { setSearch(e.target.value); setShowSuggestions(true); if (!e.target.value) setCustomer(""); }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              placeholder="Type to search…"
              className="pl-8 text-sm h-8 border-gray-200"
            />
          </div>
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 z-10 bg-white border border-gray-200 rounded-md shadow-lg mt-1 max-h-48 overflow-y-auto">
              {suggestions.map(n => (
                <button key={n} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 text-gray-700" onMouseDown={() => selectCustomer(n)}>{n}</button>
              ))}
            </div>
          )}
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-gray-500">From</Label>
          <Input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)} className="w-36 text-sm h-8 border-gray-200" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-gray-500">To</Label>
          <Input type="date" value={to} min={from} max={today} onChange={e => setTo(e.target.value)} className="w-36 text-sm h-8 border-gray-200" />
        </div>
      </div>

      {/* Empty state */}
      {!customer && !isLoading && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Search className="h-8 w-8 text-gray-200 mb-3" />
          <p className="text-sm text-gray-400">Search for a customer to view their statement</p>
        </div>
      )}

      {isLoading && <div className="text-center py-16 text-sm text-gray-400">Loading…</div>}
      {isError   && <div className="text-center py-16 text-sm text-red-500">{(error as Error).message}</div>}

      {data && customer && (
        <>
          {/* Print header */}
          <div className="hidden print:block mb-4">
            <h2 className="text-base font-semibold">{selectedCompany?.name}</h2>
            <p className="text-xs text-gray-500 mt-0.5">Statement of Account · {customer}</p>
            <p className="text-xs text-gray-400 mt-0.5">Period: {fmtDate(from)} – {fmtDate(to)}</p>
          </div>

          {/* Summary strip */}
          <div className="flex flex-wrap gap-8 px-5 py-4 bg-white border border-gray-200 rounded-lg print:border-0 print:px-0">
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Total Billed</p>
              <p className="font-mono text-base font-semibold text-gray-900 tabular-nums">S$ {fmt(data.totalBilled)}</p>
            </div>
            <div className="w-px h-8 bg-gray-200 self-stretch hidden sm:block" />
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Total Paid</p>
              <p className="font-mono text-base font-medium text-gray-600 tabular-nums">S$ {fmt(data.totalPaid)}</p>
            </div>
            <div className="w-px h-8 bg-gray-200 self-stretch hidden sm:block" />
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Balance Due</p>
              <p className={cn("font-mono text-base font-semibold tabular-nums", data.balance > 0 ? "text-gray-900" : "text-gray-400")}>
                S$ {fmt(data.balance)}
              </p>
            </div>
          </div>

          {/* Invoice table */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden print:border-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Invoice No.</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Terms</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Amount (SGD)</th>
                  </tr>
                </thead>
                <tbody>
                  {data.entries.length === 0 && (
                    <tr><td colSpan={5} className="text-center py-16 text-sm text-gray-400">No invoices found for {customer} in this period.</td></tr>
                  )}
                  {data.entries.map(e => (
                    <tr
                      key={e.id}
                      className="border-b border-gray-100 hover:bg-gray-50/70 cursor-pointer print:hover:bg-transparent"
                      onClick={() => navigate(`/invoices/${e.id}`)}
                    >
                      <td className="px-4 py-3 text-gray-600 tabular-nums text-xs">{fmtDate(e.issueDate)}</td>
                      <td className="px-4 py-3 font-mono text-xs font-medium text-gray-800">{e.invNumber}</td>
                      <td className="px-4 py-3 text-xs text-gray-400">{e.paymentTerms || "—"}</td>
                      <td className="px-4 py-3">
                        <span className={cn(
                          "inline-block px-2 py-0.5 rounded text-xs font-medium",
                          e.status === "paid"   ? "bg-gray-100 text-gray-500" :
                          e.status === "active" ? "bg-blue-50 text-blue-700 border border-blue-100" :
                                                  "bg-gray-50 text-gray-400"
                        )}>
                          {e.status === "paid" ? "Paid" : e.status === "active" ? "Outstanding" : e.status}
                        </span>
                      </td>
                      <td className="text-right px-4 py-3 font-mono tabular-nums text-gray-800">S$ {fmt(e.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                {data.entries.length > 0 && (
                  <tfoot>
                    <tr className="bg-gray-50 border-t border-gray-200">
                      <td colSpan={4} className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Outstanding Balance</td>
                      <td className={cn("text-right px-4 py-3 font-mono font-semibold text-sm tabular-nums", data.balance > 0 ? "text-gray-900" : "text-gray-400")}>
                        S$ {fmt(data.balance)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
