import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/auth-context";
import { Download, Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { generateVendorStatement_PDF } from "@/lib/pdf";

interface VendorEntry {
  id: number;
  piNumber: string;
  piDate: string | null;
  amount: number;
  paidAmount: number;
  balance: number;
  status: string;
  currency: string;
}
interface VendorStmtData {
  vendor: string;
  vendorNames: string[];
  entries: VendorEntry[];
  totalBilled: number;
  totalPaid: number;
  balance: number;
}

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
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
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
      if (from)   p.set("from", from);
      if (to)     p.set("to", to);
      const r = await fetch(`/api/vendor-statement?${p}`, { credentials: "include" });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || "Failed to load"); }
      return r.json();
    },
    staleTime: 30_000,
  });

  const suggestions = (data?.vendorNames ?? []).filter(
    n => n.toLowerCase().includes(search.toLowerCase()) && n !== vendor
  );

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
    <div className="max-w-7xl mx-auto space-y-6 pb-12">

      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-4 pb-4 border-b border-border">
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1">Accounts Payable</p>
          <h1 className="text-2xl font-bold text-foreground">Vendor Statement</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Outstanding vendor invoice summary by period</p>
        </div>
        {vendor && data && data.entries.length > 0 && (
          <Button variant="outline" size="sm" onClick={handleDownloadPDF} disabled={pdfLoading}>
            {pdfLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
            Download PDF Statement
          </Button>
        )}
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Filter</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-52 space-y-1 relative">
              <Label className="text-xs">Vendor Name</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground/50" />
                <Input
                  value={search}
                  onChange={e => { setSearch(e.target.value); setShowSuggestions(true); if (!e.target.value) setVendor(""); }}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                  placeholder="Type to search vendors…"
                  className="pl-8 text-sm"
                />
              </div>
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 z-10 bg-background border border-border rounded-md shadow-lg mt-1 max-h-48 overflow-y-auto">
                  {suggestions.map(n => (
                    <button key={n} className="w-full text-left px-3 py-2 text-sm hover:bg-muted" onMouseDown={() => selectVendor(n)}>{n}</button>
                  ))}
                </div>
              )}
            </div>
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

      {!vendor && !isLoading && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
            <Search className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-foreground mb-1">No vendor selected</p>
          <p className="text-xs text-muted-foreground">Search for a vendor above to view their statement</p>
        </div>
      )}

      {isLoading && vendor && <div className="text-center py-12 text-muted-foreground text-sm">Loading…</div>}
      {isError && <div className="text-center py-12 text-red-600 text-sm">{(error as Error).message}</div>}

      {data && vendor && (
        <div className="space-y-4">
          {/* Summary strip */}
          <div className="border rounded-lg overflow-hidden">
            <div className="bg-[#1a365d] text-white px-5 py-3">
              <p className="text-[10px] tracking-widest uppercase opacity-70 mb-0.5">Vendor Statement</p>
              <p className="text-base font-bold">{vendor}</p>
            </div>
            <div className="grid grid-cols-3 divide-x divide-border bg-muted/30">
              <div className="px-5 py-4">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Total Billed</p>
                <p className="text-xl font-bold font-mono tabular-nums">S$&nbsp;{fmtAmt(data.totalBilled)}</p>
              </div>
              <div className="px-5 py-4">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Total Paid</p>
                <p className="text-sm font-semibold font-mono tabular-nums text-muted-foreground">S$&nbsp;{fmtAmt(data.totalPaid)}</p>
              </div>
              <div className="px-5 py-4">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Balance Owing</p>
                <p className={cn("text-sm font-semibold font-mono tabular-nums", data.balance > 0 ? "text-foreground" : "text-muted-foreground/40")}>
                  S$&nbsp;{fmtAmt(data.balance)}
                </p>
              </div>
            </div>
          </div>

          {/* PI table */}
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b-2 border-border bg-muted/40">
                    <th className="text-left px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider w-32">Date</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">PI Number</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider w-24">Currency</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider w-28">Status</th>
                    <th className="text-right px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">Total</th>
                    <th className="text-right px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">Paid</th>
                    <th className="text-right px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {data.entries.length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center py-16 text-sm text-muted-foreground">
                        No vendor invoices found for {vendor} in this period.
                      </td>
                    </tr>
                  )}
                  {data.entries.map(e => (
                    <tr key={e.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 text-sm text-muted-foreground">{fmtDate(e.piDate)}</td>
                      <td className="px-4 py-3 font-mono text-sm font-semibold">{e.piNumber}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{e.currency || "SGD"}</td>
                      <td className="px-4 py-3">
                        <span className={cn("inline-block px-2 py-0.5 rounded text-xs font-semibold",
                          e.status === "paid"    ? "bg-muted text-muted-foreground" :
                          e.status === "partial" ? "bg-blue-50 text-blue-700 border border-blue-100" :
                                                   "bg-amber-50 text-amber-700 border border-amber-100"
                        )}>
                          {e.status === "paid" ? "Paid" : e.status === "partial" ? "Partial" : "Pending"}
                        </span>
                      </td>
                      <td className="text-right px-4 py-3 font-mono text-sm tabular-nums">S$ {fmtAmt(e.amount)}</td>
                      <td className="text-right px-4 py-3 font-mono text-sm tabular-nums text-muted-foreground">S$ {fmtAmt(e.paidAmount)}</td>
                      <td className={cn("text-right px-4 py-3 font-mono text-sm tabular-nums font-semibold", e.balance > 0.005 ? "text-foreground" : "text-muted-foreground/40")}>
                        S$ {fmtAmt(e.balance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {data.entries.length > 0 && (
                  <tfoot>
                    <tr className="bg-[#1a365d] text-white">
                      <td colSpan={6} className="px-4 py-3 text-xs font-bold uppercase tracking-widest opacity-70">Outstanding Balance</td>
                      <td className={cn("text-right px-4 py-3 font-mono text-base font-bold tabular-nums", data.balance > 0 ? "text-white" : "text-white/40")}>
                        S$ {fmtAmt(data.balance)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
