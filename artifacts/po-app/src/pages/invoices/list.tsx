import { useState, useMemo } from "react";
import { useListInvoices, getListInvoicesQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link, useLocation } from "wouter";
import { Search, Plus, ArrowRight, MailCheck, Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { fmtDate } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

function SentToCell({ emailSentTo }: { emailSentTo?: string | null }) {
  if (!emailSentTo) return <span className="text-muted-foreground">—</span>;
  const emails = emailSentTo.split(",").map(e => e.trim()).filter(Boolean);
  if (emails.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex items-center gap-1.5" title={emails.join(", ")}>
      <MailCheck className="h-3.5 w-3.5 text-violet-500 shrink-0" />
      <span className="truncate max-w-[140px] text-xs text-muted-foreground">{emails[0]}</span>
      {emails.length > 1 && (
        <Badge variant="secondary" className="text-xs py-0 px-1 shrink-0">+{emails.length - 1}</Badge>
      )}
    </div>
  );
}

function fmt(amount: number, currency = "SGD") {
  return new Intl.NumberFormat("en-SG", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
}

const QUARTERS = [
  { label: "Q1", months: [0, 1, 2] },
  { label: "Q2", months: [3, 4, 5] },
  { label: "Q3", months: [6, 7, 8] },
  { label: "Q4", months: [9, 10, 11] },
];

type FilterMode = "all" | "q1" | "q2" | "q3" | "q4" | "custom";

const ACTIVE_STATUSES = new Set(["confirmed", "sent", "draft", "partial"]);

export default function InvoiceList() {
  const [, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const { data: docs = [], isLoading } = useListInvoices({
    query: { queryKey: getListInvoicesQueryKey() },
  });

  const currentYear = new Date().getFullYear();

  // Apply date filter using issueDate (falls back to createdAt)
  const filteredByDate = useMemo(() => {
    if (filterMode === "all") return docs;
    if (filterMode === "custom") {
      if (!customFrom && !customTo) return docs;
      return docs.filter(d => {
        const dateStr = ((d as any).issueDate || d.createdAt || "").slice(0, 10);
        if (!dateStr) return false;
        if (customFrom && dateStr < customFrom) return false;
        if (customTo && dateStr > customTo) return false;
        return true;
      });
    }
    const qIdx = ["q1", "q2", "q3", "q4"].indexOf(filterMode);
    const months = QUARTERS[qIdx].months;
    return docs.filter(d => {
      const dateStr = (d as any).issueDate || d.createdAt;
      if (!dateStr) return false;
      const date = new Date(dateStr);
      return date.getFullYear() === filterYear && months.includes(date.getMonth());
    });
  }, [docs, filterMode, filterYear, customFrom, customTo]);

  // Search on top of date filter
  const filtered = useMemo(() =>
    filteredByDate.filter(d => {
      const t = searchTerm.toLowerCase();
      return d.invNumber.toLowerCase().includes(t) || d.customerName.toLowerCase().includes(t);
    }), [filteredByDate, searchTerm]);

  // Multi-currency stats from date-filtered set
  const stats = useMemo(() => {
    const byCurrency: Record<string, { total: number; outstanding: number }> = {};
    for (const d of filteredByDate) {
      if (["cancelled", "void"].includes(d.status)) continue;
      const c = (d as any).currency || "SGD";
      if (!byCurrency[c]) byCurrency[c] = { total: 0, outstanding: 0 };
      byCurrency[c].total += Number(d.totalAmount);
      byCurrency[c].outstanding += Number((d as any).balance ?? 0);
    }
    return Object.entries(byCurrency).sort((a, b) => b[1].total - a[1].total);
  }, [filteredByDate]);

  const statusCounts = useMemo(() => ({
    confirmed: filteredByDate.filter(d => ["confirmed", "sent"].includes(d.status)).length,
    partial:   filteredByDate.filter(d => d.status === "partial").length,
    paid:      filteredByDate.filter(d => d.status === "paid").length,
  }), [filteredByDate]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "confirmed": return <Badge className="bg-emerald-600 hover:bg-emerald-700">Confirmed</Badge>;
      case "sent":      return <Badge className="bg-violet-600 hover:bg-violet-700">Sent</Badge>;
      case "draft":     return <Badge variant="secondary">Draft</Badge>;
      case "cancelled": return <Badge variant="destructive">Cancelled</Badge>;
      case "void":      return <Badge className="bg-gray-500 hover:bg-gray-600">Void</Badge>;
      case "partial":   return <Badge className="bg-amber-500 hover:bg-amber-600">Partial</Badge>;
      case "paid":      return <Badge className="bg-blue-600 hover:bg-blue-700">Paid</Badge>;
      default:          return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Invoices</h1>
          <p className="text-muted-foreground mt-1">Manage and track all invoices.</p>
        </div>
        <Link href="/invoices/new">
          <Button className="gap-2"><Plus className="h-4 w-4" />New Invoice</Button>
        </Link>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1">
          <button
            onClick={() => setFilterMode("all")}
            className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${filterMode === "all" ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            All Time
          </button>
          {QUARTERS.map((q) => {
            const key = q.label.toLowerCase() as FilterMode;
            return (
              <button
                key={key}
                onClick={() => setFilterMode(key)}
                className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${filterMode === key ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                {q.label}
              </button>
            );
          })}
          <button
            onClick={() => setFilterMode("custom")}
            className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors flex items-center gap-1 ${filterMode === "custom" ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Calendar className="h-3.5 w-3.5" />
            Custom
          </button>
        </div>

        {/* Year stepper for quarter modes */}
        {filterMode !== "all" && filterMode !== "custom" && (
          <div className="flex items-center gap-1 border rounded-lg px-2 py-1.5 bg-background text-sm">
            <button onClick={() => setFilterYear(y => y - 1)} className="text-muted-foreground hover:text-foreground p-0.5">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="font-medium w-12 text-center">{filterYear}</span>
            <button onClick={() => setFilterYear(y => y + 1)} disabled={filterYear >= currentYear} className="text-muted-foreground hover:text-foreground p-0.5 disabled:opacity-30">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Custom date inputs */}
        {filterMode === "custom" && (
          <div className="flex items-center gap-2">
            <Input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="h-9 w-36 text-sm" />
            <span className="text-muted-foreground text-sm">to</span>
            <Input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className="h-9 w-36 text-sm" />
          </div>
        )}

        {filterMode !== "all" && (
          <span className="text-xs text-muted-foreground ml-1">
            {filteredByDate.length} invoice{filteredByDate.length !== 1 ? "s" : ""}
            {filterMode !== "custom" ? ` in ${filterMode.toUpperCase()} ${filterYear}` : ""}
          </span>
        )}
      </div>

      {/* Dashboard cards */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Invoice Summary */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Invoice Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-end justify-between">
              <span className="text-3xl font-bold">{filteredByDate.length}</span>
              <span className="text-sm text-muted-foreground mb-1">total invoices</span>
            </div>
            <div className="grid grid-cols-3 gap-2 pt-1 border-t">
              <div className="text-center">
                <div className="text-lg font-semibold text-emerald-600">{statusCounts.confirmed}</div>
                <div className="text-xs text-muted-foreground">Confirmed</div>
              </div>
              <div className="text-center border-x">
                <div className="text-lg font-semibold text-amber-500">{statusCounts.partial}</div>
                <div className="text-xs text-muted-foreground">Partial</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-semibold text-blue-600">{statusCounts.paid}</div>
                <div className="text-xs text-muted-foreground">Paid</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Total INV Amount */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total INV Amount</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : stats.length === 0 ? (
              <p className="text-muted-foreground text-sm">No invoices</p>
            ) : (
              <div className="space-y-1.5">
                {stats.map(([currency, s]) => (
                  <div key={currency} className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{currency}</span>
                    <span className="font-semibold text-base font-mono">{fmt(s.total, currency)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Outstanding Balance */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Outstanding Balance</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : stats.length === 0 ? (
              <p className="text-muted-foreground text-sm">No invoices</p>
            ) : (
              <div className="space-y-1.5">
                {stats.map(([currency, s]) => (
                  <div key={currency} className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{currency}</span>
                    <span className={`font-semibold text-base font-mono ${s.outstanding > 0 ? "text-orange-600" : "text-emerald-600"}`}>
                      {fmt(s.outstanding, currency)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <div className="p-4 border-b">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by INV Number or Customer..."
              className="pl-9"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-y">
              <tr>
                <th className="px-6 py-4 font-medium">INV Number</th>
                <th className="px-6 py-4 font-medium">Date</th>
                <th className="px-6 py-4 font-medium">Customer</th>
                <th className="px-6 py-4 font-medium text-right">Amount</th>
                <th className="px-6 py-4 font-medium text-right">Outstanding</th>
                <th className="px-6 py-4 font-medium text-center">Status</th>
                <th className="px-6 py-4 font-medium">Sent To</th>
                <th className="px-6 py-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {[...Array(8)].map((_, j) => (
                      <td key={j} className="px-6 py-4"><Skeleton className="h-4 w-full" /></td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-muted-foreground">
                    <div className="flex flex-col items-center space-y-3">
                      <Search className="h-8 w-8 text-muted-foreground/50" />
                      <p>{docs.length === 0 ? "No invoices yet." : "No invoices match your filters."}</p>
                      {searchTerm && <Button variant="link" onClick={() => setSearchTerm("")}>Clear search</Button>}
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((doc) => {
                  const balance = Number((doc as any).balance ?? 0);
                  const isSettled = ["cancelled", "void", "paid"].includes(doc.status);
                  return (
                    <tr
                      key={doc.id}
                      className="hover:bg-muted/50 transition-colors cursor-pointer"
                      onClick={() => setLocation(`/invoices/${doc.id}`)}
                    >
                      <td className="px-6 py-4 font-medium text-primary">{doc.invNumber}</td>
                      <td className="px-6 py-4 text-muted-foreground">{fmtDate((doc as any).issueDate || doc.createdAt)}</td>
                      <td className="px-6 py-4 font-medium">{doc.customerName}</td>
                      <td className="px-6 py-4 text-right font-medium">{fmt(Number(doc.totalAmount), (doc as any).currency || "SGD")}</td>
                      <td className="px-6 py-4 text-right font-medium">
                        {isSettled
                          ? <span className="text-muted-foreground">—</span>
                          : <span className={balance > 0 ? "text-orange-600" : "text-emerald-600"}>{fmt(balance, (doc as any).currency || "SGD")}</span>
                        }
                      </td>
                      <td className="px-6 py-4 text-center">{getStatusBadge(doc.status)}</td>
                      <td className="px-6 py-4"><SentToCell emailSentTo={(doc as any).emailSentTo} /></td>
                      <td className="px-6 py-4 text-right">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                          <ArrowRight className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
