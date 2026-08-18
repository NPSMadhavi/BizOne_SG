import { useState, useMemo } from "react";
import { useListPurchaseQuotations, getListPurchaseQuotationsQueryKey } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link, useLocation } from "wouter";
import { Search, Plus, MailCheck, CheckCircle2, MoreHorizontal, Eye, Pencil, ShoppingBag, Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { fmtDate } from "@/lib/utils";
import { usePagination } from "@/hooks/use-pagination";
import { ListPagination } from "@/components/list-pagination";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { useGetSettings, getGetSettingsQueryKey } from "@workspace/api-client-react";
import { useBulkPartyEmail } from "@/hooks/use-bulk-party-email";
import { BulkEmailBar, BulkSelectHeader, BulkSelectCell, ListBulkEmailDialog, markDocsSent } from "@/components/bulk-email-bar";
import { generatePurchaseQuotation_PDF } from "@/lib/pdf";

const QUARTERS = [
  { label: "Q1", months: [0,1,2] }, { label: "Q2", months: [3,4,5] },
  { label: "Q3", months: [6,7,8] }, { label: "Q4", months: [9,10,11] },
];
type FilterMode = "all"|"q1"|"q2"|"q3"|"q4"|"custom";

function SentToCell({ emailSentTo }: { emailSentTo?: string | null }) {
  if (!emailSentTo) return <span className="text-muted-foreground">—</span>;
  const emails = emailSentTo.split(",").map(e => e.trim()).filter(Boolean);
  if (emails.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex items-center gap-1.5" title={emails.join(", ")}>
      <MailCheck className="h-3.5 w-3.5 text-violet-500 shrink-0" />
      <span className="truncate max-w-[140px] text-xs text-muted-foreground">{emails[0]}</span>
      {emails.length > 1 && <Badge variant="secondary" className="text-xs py-0 px-1 shrink-0">+{emails.length - 1}</Badge>}
    </div>
  );
}

export default function PurchaseQuotationList() {
  const [, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { selectedCompany } = useAuth();
  const currentYear = new Date().getFullYear();
  const { data: settings } = useGetSettings({ query: { queryKey: getGetSettingsQueryKey() } });

  const { data: docs, isLoading } = useListPurchaseQuotations({
    query: { queryKey: getListPurchaseQuotationsQueryKey() },
  });

  const confirmMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/purchase-quotations/${id}/mark-confirmed`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || "Failed to confirm"); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getListPurchaseQuotationsQueryKey() });
      toast({ title: "Purchase quotation confirmed." });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const filteredByDate = useMemo(() => {
    const all = docs ?? [];
    if (filterMode === "all") return all;
    if (filterMode === "custom") {
      if (!customFrom && !customTo) return all;
      return all.filter(d => {
        const s = (d.createdAt || "").slice(0, 10);
        if (customFrom && s < customFrom) return false;
        if (customTo && s > customTo) return false;
        return true;
      });
    }
    const qIdx = ["q1","q2","q3","q4"].indexOf(filterMode);
    const months = QUARTERS[qIdx].months;
    return all.filter(d => {
      if (!d.createdAt) return false;
      const dt = new Date(d.createdAt);
      return dt.getFullYear() === filterYear && months.includes(dt.getMonth());
    });
  }, [docs, filterMode, filterYear, customFrom, customTo]);

  const getPartyName = (d: { vendorName?: string }) => d.vendorName || "";
  const bulk = useBulkPartyEmail({
    allDocs: docs ?? [],
    dateFiltered: filteredByDate,
    getPartyName,
  });

  const filtered = useMemo(() => filteredByDate.filter((d) => {
    if (!bulk.matchesParty(d)) return false;
    const t = searchTerm.toLowerCase();
    return d.pqNumber.toLowerCase().includes(t) || d.vendorName.toLowerCase().includes(t);
  }), [filteredByDate, searchTerm, bulk.partyFilter, bulk.matchesParty]);

  const { page, setPage, totalPages, paginatedItems } = usePagination(filtered);
  const { sendable, allSelected, someSelected } = bulk.selectionState(filtered);
  const companyName = (selectedCompany as any)?.name || "RSV Infotech";

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "confirmed": return <Badge className="bg-emerald-600 hover:bg-emerald-700">Confirmed</Badge>;
      case "sent":      return <Badge className="bg-violet-600 hover:bg-violet-700">Sent</Badge>;
      case "draft":     return <Badge variant="secondary">Draft</Badge>;
      case "cancelled": return <Badge variant="destructive">Cancelled</Badge>;
      case "converted_to_po": return <Badge className="bg-sky-600 hover:bg-sky-700">Converted to PO</Badge>;
      default:          return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[#2563EB]">Purchase Quotations</h1>
          <p className="text-muted-foreground mt-1">Manage and track all purchase quotations.</p>
        </div>
        <Link href="/purchase-quotations/new">
          <Button className="gap-2"><Plus className="h-4 w-4" />Create Purchase Quotation</Button>
        </Link>
      </div>

      {/* Quarter filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1">
          {(["all","q1","q2","q3","q4"] as FilterMode[]).map(m => (
            <button key={m} onClick={() => setFilterMode(m)}
              className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${filterMode===m?"bg-background shadow text-foreground":"text-muted-foreground hover:text-foreground"}`}
            >{m==="all"?"All Time":m.toUpperCase()}</button>
          ))}
          <button onClick={() => setFilterMode("custom")}
            className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors flex items-center gap-1 ${filterMode==="custom"?"bg-background shadow text-foreground":"text-muted-foreground hover:text-foreground"}`}
          ><Calendar className="h-3.5 w-3.5"/>Custom</button>
        </div>
        {filterMode!=="all"&&filterMode!=="custom"&&(
          <div className="flex items-center gap-1 border rounded-lg px-2 py-1.5 bg-background text-sm">
            <button onClick={()=>setFilterYear(y=>y-1)} className="text-muted-foreground hover:text-foreground p-0.5"><ChevronLeft className="h-4 w-4"/></button>
            <span className="font-medium w-12 text-center">{filterYear}</span>
            <button onClick={()=>setFilterYear(y=>y+1)} disabled={filterYear>=currentYear} className="text-muted-foreground hover:text-foreground p-0.5 disabled:opacity-30"><ChevronRight className="h-4 w-4"/></button>
          </div>
        )}
        {filterMode==="custom"&&(
          <div className="flex items-center gap-2">
            <Input type="date" value={customFrom} onChange={e=>setCustomFrom(e.target.value)} className="h-9 w-36 text-sm"/>
            <span className="text-muted-foreground text-sm">to</span>
            <Input type="date" value={customTo} onChange={e=>setCustomTo(e.target.value)} className="h-9 w-36 text-sm"/>
          </div>
        )}
        {filterMode!=="all"&&(
          <span className="text-xs text-muted-foreground ml-1">
            {filteredByDate.length} purchase quotation{filteredByDate.length!==1?"s":""}
            {filterMode!=="custom"?` in ${filterMode.toUpperCase()} ${filterYear}`:""}
          </span>
        )}
      </div>

      <BulkEmailBar
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Search by PQ Number or Vendor..."
        partyLabel="Vendor"
        partyFilter={bulk.partyFilter}
        partyNames={bulk.partyNames}
        onPartyChange={bulk.onPartyChange}
        selectedCount={bulk.selectedDocs.length}
        onSend={() => bulk.setEmailOpen(true)}
      />

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b">
              <tr>
                <BulkSelectHeader
                  allSelected={allSelected}
                  someSelected={someSelected}
                  disabled={sendable.length === 0}
                  onToggle={(checked) => bulk.toggleSelectAll(filtered, checked)}
                  label="Select all purchase quotations"
                />
                <th className="px-6 py-4 font-medium">PQ Number</th>
                <th className="px-6 py-4 font-medium">Date</th>
                <th className="px-6 py-4 font-medium">Vendor</th>
                <th className="px-6 py-4 font-medium">Amount</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium">Sent To</th>
                <th className="px-6 py-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>{[...Array(8)].map((_, j) => <td key={j} className="px-6 py-4"><Skeleton className="h-4 w-full"/></td>)}</tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-muted-foreground">
                    <div className="flex flex-col items-center space-y-3">
                      <Search className="h-8 w-8 text-muted-foreground/50"/>
                      <p>No purchase quotations found.</p>
                      {searchTerm && <Button variant="link" onClick={() => setSearchTerm("")}>Clear search</Button>}
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedItems.map((doc) => (
                  <tr key={doc.id} className="hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => setLocation(`/purchase-quotations/${doc.id}`)}>
                    <BulkSelectCell
                      checked={bulk.selectedIds.has(doc.id)}
                      disabled={!bulk.isSendable(doc)}
                      onToggle={(checked) => bulk.toggleRow(doc.id, checked)}
                      label={`Select ${doc.pqNumber}`}
                    />
                    <td className="px-6 py-4 font-medium">{doc.pqNumber}</td>
                    <td className="px-6 py-4 font-medium">{fmtDate(doc.createdAt)}</td>
                    <td className="px-6 py-4 font-medium">{doc.vendorName}</td>
                    <td className="px-6 py-4 font-medium">{new Intl.NumberFormat("en-SG",{style:"currency",currency:"SGD"}).format(Number(doc.totalAmount))}</td>
                    <td className="px-6 py-4">{getStatusBadge(doc.status)}</td>
                    <td className="px-6 py-4"><SentToCell emailSentTo={(doc as any).emailSentTo}/></td>
                    <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                            <MoreHorizontal className="h-4 w-4"/>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                          {["draft", "sent"].includes(doc.status) ? (
                            <DropdownMenuItem className="gap-2 text-emerald-700 focus:text-emerald-700" onClick={() => confirmMutation.mutate(Number(doc.id))} disabled={confirmMutation.isPending}>
                              <CheckCircle2 className="h-4 w-4"/>Mark as Confirmed
                            </DropdownMenuItem>
                          ) : (doc.status as string) !== "converted_to_po" ? (
                            <DropdownMenuItem className="gap-2" onClick={() => setLocation(`/purchase-quotations/${doc.id}`)}>
                              <ShoppingBag className="h-4 w-4"/>Convert to Purchase Order
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem className="gap-2" disabled>
                              <ShoppingBag className="h-4 w-4"/>Converted to Purchase Order
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator/>
                          <DropdownMenuItem className="gap-2" onClick={() => setLocation(`/purchase-quotations/${doc.id}`)}>
                            <Eye className="h-4 w-4"/>View
                          </DropdownMenuItem>
                          <DropdownMenuItem className="gap-2" onClick={() => setLocation(`/purchase-quotations/${doc.id}/edit`)}>
                            <Pencil className="h-4 w-4"/>Edit
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <ListPagination page={page} totalPages={totalPages} onPageChange={setPage} />
      </Card>

      <ListBulkEmailDialog
        open={bulk.emailOpen}
        onOpenChange={bulk.setEmailOpen}
        companyName={companyName}
        partyName={bulk.partyFilter !== "all" ? bulk.partyFilter : (bulk.selectedDocs[0]?.vendorName || "vendor")}
        contactName={bulk.selectedDocs.find(d => d.vendorContact)?.vendorContact || "Sir/Madam"}
        email={bulk.selectedDocs.find(d => (d as any).vendorContactEmail)?.vendorContactEmail || ""}
        docLabel="Purchase Quotations"
        numbers={bulk.selectedDocs.map(d => d.pqNumber)}
        generateAttachments={async () => {
          const attachments: { filename: string; content: string }[] = [];
          for (const doc of bulk.selectedDocs) {
            const content = await generatePurchaseQuotation_PDF(doc, selectedCompany, settings as any, { returnBase64: true });
            if (typeof content !== "string" || !content) throw new Error(`Could not generate PDF for ${doc.pqNumber}.`);
            attachments.push({ filename: `${doc.pqNumber}.pdf`, content });
          }
          return attachments;
        }}
        onSuccess={async (recipients) => {
          await markDocsSent("purchase-quotations", bulk.selectedDocs.map(d => d.id), recipients);
          await queryClient.invalidateQueries({ queryKey: getListPurchaseQuotationsQueryKey() });
          bulk.setSelectedIds(new Set());
        }}
      />
    </div>
  );
}
