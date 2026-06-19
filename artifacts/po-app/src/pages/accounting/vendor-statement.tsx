import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/auth-context";
import { Download, Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { generateVendorStatement_PDF } from "@/lib/pdf";

interface VendorEntry { id: number; piNumber: string; piDate: string | null; amount: number; paidAmount: number; balance: number; status: string; currency: string }
interface VendorStmtData { vendor: string; vendorNames: string[]; entries: VendorEntry[]; totalBilled: number; totalPaid: number; balance: number }

function fmtAmt(n: number) {
  return new Intl.NumberFormat("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}
function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("en-SG", { day: "2-digit", month: "short", year: "numeric" });
}

export default function VendorStatementPage() {
  const { selectedCompany } = useAuth();

  const today = new Date().toISOString().split("T")[0];
  const threeMonthsAgo = new Date(); threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  const defaultFrom = threeMonthsAgo.toISOString().split("T")[0];

  const [vendor, setVendor] = useState("");
  const [search, setSearch] = useState("");
  const [from, setFrom]     = useState(defaultFrom);
  const [to, setTo]         = useState(today);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  const { data, isLoading, isError, error } = useQuery<VendorStmtData>({
    queryKey: ["vendor-statement", vendor, from, to],
    queryFn: async () => {
      const p = new URLSearchParams();
      if (vendor) p.set("vendor", vendor);
      if (from) p.set("from", from);
      if (to)   p.set("to", to);
      const r = await fetch(`/api/vendor-statement?${p}`, { credentials: "include" });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || "Failed to load"); }
      return r.json();
    },
    staleTime: 30_000,
  });

  const suggestions = (data?.vendorNames ?? []).filter(n => n.toLowerCase().includes(search.toLowerCase()) && n !== vendor);

  function selectVendor(name: string) { setVendor(name); setSearch(name); setShowSuggestions(false); }

  async function handleDownloadPDF() {
    if (!data || !vendor) return;
    setPdfLoading(true);
    try {
      await generateVendorStatement_PDF(
        selectedCompany as any, vendor, from || null, to || null,
        data.entries, { totalBilled: data.totalBilled, totalPaid: data.totalPaid, balance: data.balance }
      );
    } finally {
      setPdfLoading(false);
    }
  }

  return (
    <div className="max-w-7xl mx-auto space-y-5 pb-20 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-4 pb-4 border-b border-gray-200">
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">Accounts Payable</p>
          <h1 className="text-2xl font-bold text-gray-900">Vendor Statement</h1>
        </div>
        {vendor && data && data.entries.length > 0 && (
          <Button variant="outline" size="sm" onClick={handleDownloadPDF} disabled={pdfLoading} className="border-gray-200 text-gray-600 hover:text-gray-900">
            {pdfLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
            Download PDF Statement
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-end p-4 bg-white border border-gray-200 rounded-lg shadow-sm">
        <div className="flex-1 min-w-52 space-y-1 relative">
          <Label className="text-xs text-gray-500">Vendor Name</Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-2 h-4 w-4 text-gray-300" />
            <Input value={search} onChange={e => { setSearch(e.target.value); setShowSuggestions(true); if (!e.target.value) setVendor(""); }}
              onFocus={() => setShowSuggestions(true)} onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              placeholder="Type to search vendors…" className="pl-8 text-sm h-8 border-gray-200" />
          </div>
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 z-10 bg-white border border-gray-200 rounded-md shadow-lg mt-1 max-h-48 overflow-y-auto">
              {suggestions.map(n => (
                <button key={n} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 text-gray-700" onMouseDown={() => selectVendor(n)}>{n}</button>
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

      {!vendor && !isLoading && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-4">
            <Search className="h-5 w-5 text-gray-400" />
          </div>
          <p className="text-sm font-medium text-gray-600 mb-1">No vendor selected</p>
          <p className="text-xs text-gray-400">Search for a vendor above to view their statement</p>
        </div>
      )}

      {isLoading && vendor && <div className="text-center py-16 text-sm text-gray-400">Loading…</div>}
      {isError && <div className="text-center py-16 text-sm text-red-500">{(error as Error).message}</div>}

      {data && vendor && (
        <>
          {/* Summary strip */}
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
            <div className="grid grid-cols-3 divide-x divide-gray-100">
              <div className="px-5 py-4 bg-gray-900 text-white rounded-l-lg">
                <p className="text-xs text-gray-400 mb-1">Total Billed</p>
                <p className="text-xl font-bold font-mono tabular-nums">S$&nbsp;{fmtAmt(data.totalBilled)}</p>
              </div>
              <div className="px-5 py-4">
                <p className="text-xs text-gray-400 mb-1">Total Paid</p>
                <p className="text-sm font-semibold font-mono tabular-nums text-gray-600">S$&nbsp;{fmtAmt(data.totalPaid)}</p>
              </div>
              <div className="px-5 py-4">
                <p className="text-xs text-gray-400 mb-1">Balance Owing</p>
                <p className={cn("text-sm font-semibold font-mono tabular-nums", data.balance > 0 ? "text-gray-900" : "text-gray-300")}>
                  S$&nbsp;{fmtAmt(data.balance)}
                </p>
              </div>
            </div>
          </div>

          {/* PI table */}
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b-2 border-gray-200 bg-gray-50">
                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wider w-32">Date</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wider">PI Number</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wider w-24">Currency</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wider w-28">Status</th>
                    <th className="text-right px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wider">Total</th>
                    <th className="text-right px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wider">Paid</th>
                    <th className="text-right px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wider">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {data.entries.length === 0 && (
                    <tr><td colSpan={7} className="text-center py-16 text-sm text-gray-400">No vendor invoices found for {vendor} in this period.</td></tr>
                  )}
                  {data.entries.map(e => (
                    <tr key={e.id} className="border-b border-gray-100 hover:bg-gray-50/70">
                      <td className="px-4 py-3 text-sm text-gray-500">{fmtDate(e.piDate)}</td>
                      <td className="px-4 py-3 font-mono text-sm font-semibold text-gray-800">{e.piNumber}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">{e.currency || "SGD"}</td>
                      <td className="px-4 py-3">
                        <span className={cn("inline-block px-2 py-0.5 rounded text-xs font-semibold",
                          e.status === "paid"    ? "bg-gray-100 text-gray-500" :
                          e.status === "partial" ? "bg-blue-50 text-blue-700 border border-blue-100" :
                                                   "bg-amber-50 text-amber-700 border border-amber-100"
                        )}>
                          {e.status === "paid" ? "Paid" : e.status === "partial" ? "Partial" : "Pending"}
                        </span>
                      </td>
                      <td className="text-right px-4 py-3 font-mono text-sm tabular-nums text-gray-800">S$ {fmtAmt(e.amount)}</td>
                      <td className="text-right px-4 py-3 font-mono text-sm tabular-nums text-gray-500">S$ {fmtAmt(e.paidAmount)}</td>
                      <td className={cn("text-right px-4 py-3 font-mono text-sm tabular-nums font-semibold", e.balance > 0.005 ? "text-gray-900" : "text-gray-300")}>
                        S$ {fmtAmt(e.balance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {data.entries.length > 0 && (
                  <tfoot>
                    <tr className="bg-gray-900 text-white">
                      <td colSpan={6} className="px-4 py-3 text-xs font-bold uppercase tracking-widest text-gray-300">Outstanding Balance</td>
                      <td className={cn("text-right px-4 py-3 font-mono text-base font-bold tabular-nums", data.balance > 0 ? "text-white" : "text-gray-500")}>
                        S$ {fmtAmt(data.balance)}
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
