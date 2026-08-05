import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/contexts/auth-context";
import { Download, Loader2, Search, X } from "lucide-react";
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
interface VendorSummaryRow {
  name: string;
  billed: number;
  paid: number;
  balance: number;
  invoices: number;
}
interface VendorStmtData {
  vendor: string;
  vendorNames: string[];
  vendorSummary: VendorSummaryRow[];
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

  const today       = new Date().toISOString().split("T")[0];
  const currentYear = new Date().getFullYear();
  // Default: full current year
  const defaultFrom = `${currentYear}-01-01`;

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
  function clearVendor()              { setVendor(""); setSearch(""); }

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

  const summary = data?.vendorSummary ?? [];
  const grandBilled  = summary.reduce((s, r) => s + r.billed,  0);
  const grandPaid    = summary.reduce((s, r) => s + r.paid,    0);
  const grandBalance = summary.reduce((s, r) => s + r.balance, 0);

  return (
    <div className="space-y-6 pb-12">

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
      <Card className="p-4">
        <div className="flex flex-wrap gap-4 items-end">
          {/* Vendor search */}
          <div className="flex-1 min-w-52 space-y-1 relative">
            <Label className="text-xs text-muted-foreground">Vendor Name</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground/50" />
              <Input
                value={search}
                onChange={e => { setSearch(e.target.value); setShowSuggestions(true); if (!e.target.value) setVendor(""); }}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                placeholder="Search vendors… or leave blank to see all"
                className="pl-8 pr-8 text-sm"
              />
              {vendor && (
                <button
                  onClick={clearVendor}
                  className="absolute right-2.5 top-2 text-muted-foreground/50 hover:text-muted-foreground"
                  title="Clear vendor filter"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
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
            <Label className="text-xs text-muted-foreground">From</Label>
            <Input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)} className="w-40 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">To</Label>
            <Input type="date" value={to} min={from} max={today} onChange={e => setTo(e.target.value)} className="w-40 text-sm" />
          </div>
        </div>
      </Card>

      {isLoading && <div className="text-center py-12 text-muted-foreground text-sm">Loading…</div>}
      {isError   && <div className="text-center py-12 text-red-600 text-sm">{(error as Error).message}</div>}

      {/* ── All-vendors summary (when no vendor selected) ── */}
      {!vendor && !isLoading && data && (
        summary.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
              <Search className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground mb-1">No vendor invoices found</p>
            <p className="text-xs text-muted-foreground">Try widening the date range above.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Showing all {summary.length} vendor{summary.length !== 1 ? "s" : ""} with invoices in this period.
              Click a row to drill into a vendor's statement.
            </p>
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b-2 border-border bg-muted/40">
                      <th className="text-left px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">Vendor</th>
                      <th className="text-right px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider w-16">Invoices</th>
                      <th className="text-right px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">Total Billed</th>
                      <th className="text-right px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">Total Paid</th>
                      <th className="text-right px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">Balance Owing</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.map((v, i) => (
                      <tr
                        key={v.name}
                        className={cn("border-b border-border cursor-pointer transition-colors hover:bg-blue-50/60", i % 2 === 0 ? "" : "bg-muted/20")}
                        onClick={() => selectVendor(v.name)}
                      >
                        <td className="px-4 py-3 font-medium text-sm">{v.name}</td>
                        <td className="px-4 py-3 text-right text-sm text-muted-foreground tabular-nums">{v.invoices}</td>
                        <td className="px-4 py-3 text-right font-mono text-sm tabular-nums">S$ {fmtAmt(v.billed)}</td>
                        <td className="px-4 py-3 text-right font-mono text-sm tabular-nums text-muted-foreground">S$ {fmtAmt(v.paid)}</td>
                        <td className={cn("px-4 py-3 text-right font-mono text-sm tabular-nums font-semibold", v.balance > 0.005 ? "text-foreground" : "text-muted-foreground/40")}>
                          S$ {fmtAmt(v.balance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-[#1a365d] text-white">
                      <td className="px-4 py-3 text-xs font-bold uppercase tracking-widest opacity-70">Total — {summary.length} vendor{summary.length !== 1 ? "s" : ""}</td>
                      <td className="px-4 py-3 text-right font-mono text-sm tabular-nums opacity-70">{summary.reduce((s, v) => s + v.invoices, 0)}</td>
                      <td className="px-4 py-3 text-right font-mono text-sm tabular-nums">S$ {fmtAmt(grandBilled)}</td>
                      <td className="px-4 py-3 text-right font-mono text-sm tabular-nums opacity-80">S$ {fmtAmt(grandPaid)}</td>
                      <td className="px-4 py-3 text-right font-mono text-base font-bold tabular-nums">S$ {fmtAmt(grandBalance)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </Card>
          </div>
        )
      )}

      {/* ── Single vendor detail ── */}
      {data && vendor && (
        <div className="space-y-4">
          {/* Back link + summary strip */}
          <button onClick={clearVendor} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-3.5 w-3.5" />
            Back to all vendors
          </button>

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
          <Card className="overflow-hidden">
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
                        No vendor invoices found for <span className="font-medium">{vendor}</span> in this period.
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
