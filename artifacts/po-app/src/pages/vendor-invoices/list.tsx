import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { FileInput, Plus, ArrowUpRight, Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { fmtDate } from "@/lib/utils";
import { useAuth } from "@/contexts/auth-context";
import { usePagination } from "@/hooks/use-pagination";
import { ListPagination } from "@/components/list-pagination";
import { useBulkPartyEmail } from "@/hooks/use-bulk-party-email";
import { BulkEmailBar, BulkSelectHeader, BulkSelectCell, ListBulkEmailDialog, fetchDocJson } from "@/components/bulk-email-bar";
import { generateVendorInvoice_PDF } from "@/lib/pdf";

function statusBadge(status: string) {
  switch (status) {
    case "paid": return <Badge className="bg-emerald-600 hover:bg-emerald-700">Paid</Badge>;
    case "partial": return <Badge className="bg-amber-500 hover:bg-amber-600 text-white">Partial</Badge>;
    default: return <Badge variant="outline" className="text-orange-600 border-orange-300">Pending</Badge>;
  }
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

export default function VendorInvoiceList() {
  const [, setLocation] = useLocation();
  const { selectedCompany } = useAuth();
  const [search, setSearch] = useState("");

  // Filter state
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const { data: pis = [], isLoading } = useQuery<any[]>({
    queryKey: ["vendor-invoices", selectedCompany?.id],
    queryFn: async () => {
      const res = await fetch("/api/vendor-invoices", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load vendor invoices");
      return res.json();
    },
  });

  // Apply date filter
  const filteredByDate = useMemo(() => {
    if (filterMode === "all") return pis;
    if (filterMode === "custom") {
      if (!customFrom && !customTo) return pis;
      return pis.filter(pi => {
        if (!pi.piDate) return false;
        const d = pi.piDate.slice(0, 10);
        if (customFrom && d < customFrom) return false;
        if (customTo && d > customTo) return false;
        return true;
      });
    }
    const qIdx = ["q1", "q2", "q3", "q4"].indexOf(filterMode);
    const months = QUARTERS[qIdx].months;
    return pis.filter(pi => {
      if (!pi.piDate) return false;
      const d = new Date(pi.piDate);
      return d.getFullYear() === filterYear && months.includes(d.getMonth());
    });
  }, [pis, filterMode, filterYear, customFrom, customTo]);

  const getPartyName = (d: any) => d.vendorName || "";
  const bulk = useBulkPartyEmail<any>({ allDocs: pis, dateFiltered: filteredByDate, getPartyName });

  const filtered = useMemo(() =>
    filteredByDate.filter(pi => {
      if (!bulk.matchesParty(pi)) return false;
      const t = search.toLowerCase();
      return pi.piNumber.toLowerCase().includes(t) ||
        pi.vendorName.toLowerCase().includes(t) ||
        (pi.poNumbers || "").toLowerCase().includes(t);
    }), [filteredByDate, search, bulk.partyFilter, bulk.matchesParty]);

  const { page, setPage, totalPages, paginatedItems } = usePagination(filtered);
  const { sendable, allSelected, someSelected } = bulk.selectionState(filtered);
  const companyName = (selectedCompany as any)?.name || "RSV Infotech";

  // Multi-currency stats from date-filtered set
  const stats = useMemo(() => {
    const byCurrency: Record<string, { total: number; outstanding: number; count: number }> = {};
    for (const pi of filteredByDate) {
      const c = pi.currency || "SGD";
      if (!byCurrency[c]) byCurrency[c] = { total: 0, outstanding: 0, count: 0 };
      byCurrency[c].total += pi.totalAmount;
      byCurrency[c].outstanding += pi.balance;
      byCurrency[c].count += 1;
    }
    return Object.entries(byCurrency).sort((a, b) => b[1].total - a[1].total);
  }, [filteredByDate]);

  const statusCounts = useMemo(() => ({
    pending: filteredByDate.filter(p => p.status === "pending").length,
    partial: filteredByDate.filter(p => p.status === "partial").length,
    paid: filteredByDate.filter(p => p.status === "paid").length,
  }), [filteredByDate]);

  const currentYear = new Date().getFullYear();

  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[#2563EB]">Vendor Invoices</h1>
          <p className="text-muted-foreground mt-1">Track vendor purchase invoices and payments</p>
        </div>
        <Button onClick={() => setLocation("/vendor-invoices/new")} className="gap-2">
          <Plus className="h-4 w-4" />
          Create Vendor Invoice 
        </Button>
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
          {QUARTERS.map((q, i) => {
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

        {/* Year stepper (shown for quarter modes) */}
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

        {/* Custom date range inputs */}
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
        {/* Status summary */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Invoice Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-end justify-between">
              <span className="text-3xl font-bold">{filteredByDate.length}</span>
              <span className="text-sm text-muted-foreground mb-1">total PIs</span>
            </div>
            <div className="grid grid-cols-3 gap-2 pt-1 border-t">
              <div className="text-center">
                <div className="text-lg font-semibold text-orange-600">{statusCounts.pending}</div>
                <div className="text-xs text-muted-foreground">Pending</div>
              </div>
              <div className="text-center border-x">
                <div className="text-lg font-semibold text-amber-500">{statusCounts.partial}</div>
                <div className="text-xs text-muted-foreground">Partial</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-semibold text-emerald-600">{statusCounts.paid}</div>
                <div className="text-xs text-muted-foreground">Paid</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Total PI Amount by currency */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total PI Amount</CardTitle>
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

        {/* Outstanding Balance by currency */}
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

      <BulkEmailBar
        searchTerm={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by PI number, vendor or PO..."
        partyLabel="Vendor"
        partyFilter={bulk.partyFilter}
        partyNames={bulk.partyNames}
        onPartyChange={bulk.onPartyChange}
        selectedCount={bulk.selectedDocs.length}
        onSend={() => bulk.setEmailOpen(true)}
      />

      <Card>
        {isLoading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <FileInput className="h-10 w-10 text-muted-foreground mb-4" />
            <p className="font-medium text-muted-foreground">
              {pis.length === 0 ? "No vendor invoices yet" : "No invoices match your filters"}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {pis.length === 0 ? "Record a vendor PI to start tracking payments" : "Try adjusting the date range or search"}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-y">
                <tr>
                  <BulkSelectHeader allSelected={allSelected} someSelected={someSelected} disabled={sendable.length === 0} onToggle={(checked) => bulk.toggleSelectAll(filtered, checked)} label="Select all vendor invoices" />
                  <th className="px-4 py-3 font-medium">Vendor PI #</th>
                  <th className="px-4 py-3 font-medium">Vendor</th>
                  <th className="px-4 py-3 font-medium">Linked PO(s)</th>
                  <th className="px-4 py-3 font-medium">PI Date</th>
                  <th className="px-4 py-3 font-medium text-right">PI Amount</th>
                  <th className="px-4 py-3 font-medium text-right">Paid</th>
                  <th className="px-4 py-3 font-medium text-right">Balance</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {paginatedItems.map((pi: any) => (
                  <tr
                    key={pi.id}
                    className="bg-card hover:bg-muted/30 transition-colors cursor-pointer"
                    onClick={() => setLocation(`/vendor-invoices/${pi.id}`)}
                  >
                    <BulkSelectCell checked={bulk.selectedIds.has(pi.id)} disabled={!bulk.isSendable(pi)} onToggle={(checked) => bulk.toggleRow(pi.id, checked)} label={`Select ${pi.piNumber}`} />
                    <td className="px-4 py-3 font-medium font-mono">{pi.piNumber}</td>
                    <td className="px-4 py-3">{pi.vendorName}</td>
                    <td className="px-4 py-3 text-muted-foreground">{pi.poNumbers || "—"}</td>
                    <td className="px-4 py-3 font-medium">{pi.piDate ? fmtDate(pi.piDate) : "—"}</td>
                    <td className="px-4 py-3 text-right font-medium">{fmt(pi.totalAmount, pi.currency)}</td>
                    <td className="px-4 py-3 text-right text-emerald-600">{fmt(pi.paidAmount, pi.currency)}</td>
                    <td className="px-4 py-3 text-right font-medium text-orange-600">{fmt(pi.balance, pi.currency)}</td>
                    <td className="px-4 py-3">{statusBadge(pi.status)}</td>
                    <td className="px-4 py-3">
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7"
                        onClick={e => { e.stopPropagation(); setLocation(`/vendor-invoices/${pi.id}`); }}
                      >
                        <ArrowUpRight className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <ListPagination page={page} totalPages={totalPages} onPageChange={setPage} />
      </Card>

      <ListBulkEmailDialog
        open={bulk.emailOpen}
        onOpenChange={bulk.setEmailOpen}
        companyName={companyName}
        partyName={bulk.partyFilter !== "all" ? bulk.partyFilter : (bulk.selectedDocs[0]?.vendorName || "vendor")}
        contactName={bulk.selectedDocs.find(d => d.vendorContact)?.vendorContact || "Sir/Madam"}
        email={bulk.selectedDocs.map(d => d.vendorEmail || d.vendorContactEmail).find(Boolean) || ""}
        docLabel="Vendor Invoices"
        numbers={bulk.selectedDocs.map(d => d.piNumber)}
        generateAttachments={async () => {
          const attachments: { filename: string; content: string }[] = [];
          for (const doc of bulk.selectedDocs) {
            const full = await fetchDocJson("vendor-invoices", doc.id).catch(() => doc);
            const content = await generateVendorInvoice_PDF(full, selectedCompany, { returnBase64: true });
            if (typeof content !== "string" || !content) throw new Error(`Could not generate PDF for ${doc.piNumber}.`);
            attachments.push({ filename: `${doc.piNumber}.pdf`, content });
          }
          return attachments;
        }}
        onSuccess={async () => {
          bulk.setSelectedIds(new Set());
        }}
      />
    </div>
  );
}
