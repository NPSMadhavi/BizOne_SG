import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/auth-context";
import { Printer, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";

interface StmtEntry { id: number; invNumber: string; issueDate: string | null; amount: number; status: string; paymentTerms: string | null }
interface StmtData { customer: string; customerNames: string[]; entries: StmtEntry[]; totalBilled: number; totalPaid: number; balance: number }

const STATUS_BADGE: Record<string, { label: string; class: string }> = {
  active: { label: "Outstanding", class: "bg-blue-100 text-blue-800 border-blue-200" },
  paid:   { label: "Paid",        class: "bg-green-100 text-green-800 border-green-200" },
};

function fmtAmt(n: number) { return new Intl.NumberFormat("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n); }
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

  const { data, isLoading, isError, error, refetch } = useQuery<StmtData>({
    queryKey: ["customer-statement", customer, from, to],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (customer) params.set("customer", customer);
      if (from) params.set("from", from);
      if (to)   params.set("to", to);
      const r = await fetch(`/api/customer-statement?${params}`, { credentials: "include" });
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

  function handlePrint() { window.print(); }

  return (
    <div className="space-y-6 max-w-7xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20 print:p-0 print:space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Customer Statement</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Invoice history and outstanding balance for a customer</p>
        </div>
        {customer && data && data.entries.length > 0 && (
          <Button variant="outline" size="sm" onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-2" />Print Statement
          </Button>
        )}
      </div>

      {/* Filters */}
      <Card className="print:hidden">
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-52 space-y-1 relative">
              <Label className="text-xs">Customer Name</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={e => { setSearch(e.target.value); setShowSuggestions(true); if (!e.target.value) setCustomer(""); }}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                  placeholder="Search customer…"
                  className="pl-8 text-sm"
                />
              </div>
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 z-10 bg-background border rounded-md shadow-lg mt-1 max-h-48 overflow-y-auto">
                  {suggestions.map(n => (
                    <button key={n} className="w-full text-left px-3 py-2 text-sm hover:bg-muted" onMouseDown={() => selectCustomer(n)}>{n}</button>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-xs">From</Label>
              <Input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)} className="w-36 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">To</Label>
              <Input type="date" value={to} min={from} max={today} onChange={e => setTo(e.target.value)} className="w-36 text-sm" />
            </div>
          </div>
        </CardContent>
      </Card>

      {!customer && !isLoading && (
        <div className="text-center py-16 text-muted-foreground">
          <Search className="h-10 w-10 mx-auto mb-3 opacity-20" />
          <p className="text-sm">Search for a customer above to view their statement.</p>
        </div>
      )}

      {isLoading && <div className="text-center py-12 text-muted-foreground text-sm">Loading…</div>}
      {isError   && <div className="text-center py-12 text-red-600 text-sm">{(error as Error).message}</div>}

      {data && customer && (
        <>
          {/* Print header */}
          <div className="hidden print:block mb-4">
            <h2 className="text-lg font-bold">{selectedCompany?.name}</h2>
            <p className="text-sm text-gray-600">Customer Statement of Account</p>
            <p className="text-sm font-medium mt-2">Customer: {customer}</p>
            <p className="text-xs text-gray-500">Period: {fmtDate(from)} – {fmtDate(to)}</p>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground font-medium mb-1">Total Billed</p>
                <p className="font-mono font-bold text-lg">S$ {fmtAmt(data.totalBilled)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-emerald-700 font-medium mb-1">Total Paid</p>
                <p className="font-mono font-bold text-lg text-emerald-700">S$ {fmtAmt(data.totalPaid)}</p>
              </CardContent>
            </Card>
            <Card className={cn("border-2", data.balance > 0 ? "border-orange-300" : "border-green-300")}>
              <CardContent className="p-4">
                <p className={cn("text-xs font-medium mb-1", data.balance > 0 ? "text-orange-700" : "text-green-700")}>Balance Due</p>
                <p className={cn("font-mono font-bold text-lg", data.balance > 0 ? "text-orange-700" : "text-green-700")}>S$ {fmtAmt(data.balance)}</p>
              </CardContent>
            </Card>
          </div>

          {/* Invoice table */}
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/40 border-b">
                    <th className="text-left px-4 py-2.5 font-semibold text-xs text-muted-foreground">Date</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-xs text-muted-foreground">Invoice No.</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-xs text-muted-foreground">Payment Terms</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-xs text-muted-foreground">Status</th>
                    <th className="text-right px-4 py-2.5 font-semibold text-xs text-muted-foreground">Amount (SGD)</th>
                  </tr>
                </thead>
                <tbody>
                  {data.entries.length === 0 && (
                    <tr><td colSpan={5} className="text-center py-12 text-muted-foreground text-sm">No invoices found for {customer} in this period.</td></tr>
                  )}
                  {data.entries.map(e => (
                    <tr
                      key={e.id}
                      className="border-b hover:bg-muted/30 cursor-pointer print:hover:bg-transparent"
                      onClick={() => navigate(`/invoices/${e.id}`)}
                    >
                      <td className="px-4 py-2.5 tabular-nums text-xs">{fmtDate(e.issueDate)}</td>
                      <td className="px-4 py-2.5 font-mono font-medium text-xs">{e.invNumber}</td>
                      <td className="px-4 py-2.5 text-muted-foreground text-xs">{e.paymentTerms || "—"}</td>
                      <td className="px-4 py-2.5">
                        <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border", STATUS_BADGE[e.status]?.class ?? "bg-gray-100 text-gray-700 border-gray-200")}>
                          {STATUS_BADGE[e.status]?.label ?? e.status}
                        </span>
                      </td>
                      <td className="text-right px-4 py-2.5 font-mono tabular-nums">S$ {fmtAmt(e.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                {data.entries.length > 0 && (
                  <tfoot>
                    <tr className="bg-muted/50 border-t-2 font-semibold">
                      <td colSpan={4} className="px-4 py-2.5 text-xs text-muted-foreground uppercase tracking-wider">Total Outstanding Balance</td>
                      <td className={cn("text-right px-4 py-2.5 font-mono text-sm tabular-nums", data.balance > 0 ? "text-orange-700" : "text-green-700")}>
                        S$ {fmtAmt(data.balance)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
