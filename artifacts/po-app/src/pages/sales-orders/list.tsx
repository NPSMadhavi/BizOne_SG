import { useState, useMemo } from "react";
import { useListSalesOrders, getListSalesOrdersQueryKey } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link, useLocation } from "wouter";
import { Search, Plus, Eye, Pencil, Trash2, X } from "lucide-react";
import { fmtDate } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { usePagination } from "@/hooks/use-pagination";
import { ListPagination } from "@/components/list-pagination";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { useGetSettings, getGetSettingsQueryKey } from "@workspace/api-client-react";
import { useBulkPartyEmail } from "@/hooks/use-bulk-party-email";
import { BulkEmailBar, BulkSelectHeader, BulkSelectCell, ListBulkEmailDialog, markDocsSent } from "@/components/bulk-email-bar";
import { generateSalesOrder_PDF } from "@/lib/pdf";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useDeleteSalesOrder } from "@workspace/api-client-react";

export default function SalesOrderList() {
  const [, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; soNumber: string } | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { selectedCompany } = useAuth();
  const { data: settings } = useGetSettings({ query: { queryKey: getGetSettingsQueryKey() } });

  const { data: salesOrders, isLoading: soLoading } = useListSalesOrders({
    query: { queryKey: getListSalesOrdersQueryKey() },
  });

  const deleteMutation = useDeleteSalesOrder();

  const getPartyName = (d: { customerName?: string }) => d.customerName || "";
  const bulk = useBulkPartyEmail({ allDocs: salesOrders ?? [], dateFiltered: salesOrders ?? [], getPartyName });

  const filteredOrders = useMemo(() => {
    const t = searchTerm.toLowerCase().trim();
    const all = (salesOrders ?? []).filter(d => bulk.matchesParty(d));
    if (!t) return all;
    return all.filter(
      (d) =>
        d.soNumber.toLowerCase().includes(t) ||
        d.customerName.toLowerCase().includes(t) ||
        ((d as any).qtNumber || "").toLowerCase().includes(t),
    );
  }, [salesOrders, searchTerm, bulk.partyFilter, bulk.matchesParty]);

  const { page, setPage, totalPages, paginatedItems } = usePagination(filteredOrders);
  const { sendable, allSelected, someSelected } = bulk.selectionState(filteredOrders);
  const companyName = (selectedCompany as any)?.name || "RSV Infotech";

  const getSoStatusBadge = (status: string) => {
    switch (status) {
      case "confirmed": return <Badge className="bg-emerald-600 hover:bg-emerald-700">Confirmed</Badge>;
      case "sent": return <Badge className="bg-violet-600 hover:bg-violet-700">Sent</Badge>;
      case "draft": return <Badge variant="secondary">Draft</Badge>;
      case "cancelled": return <Badge variant="destructive">Cancelled</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteMutation.mutate(
      { id: deleteTarget.id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListSalesOrdersQueryKey() });
          toast({ title: "Sales order deleted." });
          setDeleteTarget(null);
        },
        onError: (err: any) => toast({ title: "Error", description: err?.message || "Failed to delete.", variant: "destructive" }),
      },
    );
  };

  const fmt = (v: number | string, currency = "SGD") =>
    new Intl.NumberFormat("en-SG", { style: "currency", currency }).format(Number(v) || 0);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[#2563EB]">Sales Orders</h1>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <Link href="/sales-orders/new">
            <Button className="gap-2 w-full sm:w-auto"><Plus className="h-4 w-4" />Create Sales Order</Button>
          </Link>
        </div>
      </div>

      {/* Sales Orders */}
      <div className="space-y-3">
        <BulkEmailBar
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          searchPlaceholder="Search sales orders..."
          partyLabel="Customer"
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
                  <BulkSelectHeader allSelected={allSelected} someSelected={someSelected} disabled={sendable.length === 0} onToggle={(checked) => bulk.toggleSelectAll(filteredOrders, checked)} label="Select all sales orders" />
                  <th className="px-6 py-4 font-medium">Sales Order No.</th>
                  <th className="px-6 py-4 font-medium">Date</th>
                  <th className="px-6 py-4 font-medium">Quotation</th>
                  <th className="px-6 py-4 font-medium">Customer</th>
                  <th className="px-6 py-4 font-medium">Amount</th>
                  <th className="px-6 py-4 font-medium">Status</th>
                  <th className="px-6 py-4 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {soLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>{Array.from({ length: 8 }).map((_, j) => <td key={j} className="px-6 py-4"><Skeleton className="h-4 w-full" /></td>)}</tr>
                  ))
                ) : filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-muted-foreground">
                      {searchTerm ? "No sales orders match your search." : 'No sales orders found. Click "Generate Sales Order" to create one.'}
                    </td>
                  </tr>
                ) : (
                  paginatedItems.map((doc) => (
                    <tr key={doc.id} className="hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => setLocation(`/sales-orders/${doc.id}`)}>
                      <BulkSelectCell checked={bulk.selectedIds.has(doc.id)} disabled={!bulk.isSendable(doc)} onToggle={(checked) => bulk.toggleRow(doc.id, checked)} label={`Select ${doc.soNumber}`} />
                      <td className="px-6 py-4 font-medium font-mono">{doc.soNumber}</td>
                      <td className="px-6 py-4">{fmtDate((doc as any).issueDate || doc.createdAt)}</td>
                      <td className="px-6 py-4 font-mono text-muted-foreground">{(doc as any).qtNumber || "—"}</td>
                      <td className="px-6 py-4">{doc.customerName}</td>
                      <td className="px-6 py-4 font-medium">{fmt(doc.totalAmount, (doc as any).currency || "SGD")}</td>
                      <td className="px-6 py-4">{getSoStatusBadge(doc.status)}</td>
                      <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-start gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="View" onClick={() => setLocation(`/sales-orders/${doc.id}`)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Edit" onClick={() => setLocation(`/sales-orders/${doc.id}/edit`)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <ListPagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </Card>
      </div>

      <ListBulkEmailDialog
        open={bulk.emailOpen}
        onOpenChange={bulk.setEmailOpen}
        companyName={companyName}
        partyName={bulk.partyFilter !== "all" ? bulk.partyFilter : (bulk.selectedDocs[0]?.customerName || "customer")}
        contactName={bulk.selectedDocs.find(d => d.customerContact)?.customerContact || "Sir/Madam"}
        email={bulk.selectedDocs.find(d => (d as any).customerContactEmail)?.customerContactEmail || ""}
        docLabel="Sales Orders"
        numbers={bulk.selectedDocs.map(d => d.soNumber)}
        generateAttachments={async () => {
          const attachments: { filename: string; content: string }[] = [];
          for (const doc of bulk.selectedDocs) {
            const content = await generateSalesOrder_PDF(doc as any, selectedCompany, settings as any, { returnBase64: true });
            if (typeof content !== "string" || !content) throw new Error(`Could not generate PDF for ${doc.soNumber}.`);
            attachments.push({ filename: `${doc.soNumber}.pdf`, content });
          }
          return attachments;
        }}
        onSuccess={async (recipients) => {
          await markDocsSent("sales-orders", bulk.selectedDocs.map(d => d.id), recipients);
          await queryClient.invalidateQueries({ queryKey: getListSalesOrdersQueryKey() });
          bulk.setSelectedIds(new Set());
        }}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Sales Order?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete sales order &quot;{deleteTarget?.soNumber}&quot;.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleteMutation.isPending} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
