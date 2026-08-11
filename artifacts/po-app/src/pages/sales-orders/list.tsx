import { useState, useMemo } from "react";
import { useListSalesOrders, getListSalesOrdersQueryKey, useListQuotations, getListQuotationsQueryKey } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link, useLocation } from "wouter";
import { Search, Plus, Eye, Pencil, Trash2, X } from "lucide-react";
import { fmtDate } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
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

  const { data: quotations, isLoading: qtLoading } = useListQuotations({
    query: { queryKey: getListQuotationsQueryKey() },
  });

  const { data: salesOrders, isLoading: soLoading } = useListSalesOrders({
    query: { queryKey: getListSalesOrdersQueryKey() },
  });

  const deleteMutation = useDeleteSalesOrder();

  const convertedQuotations = useMemo(
    () => (quotations ?? []).filter((q) => q.status === "converted_to_so"),
    [quotations],
  );

  const filteredOrders = useMemo(() => {
    const t = searchTerm.toLowerCase().trim();
    const all = salesOrders ?? [];
    if (!t) return all;
    return all.filter(
      (d) =>
        d.soNumber.toLowerCase().includes(t) ||
        d.customerName.toLowerCase().includes(t) ||
        ((d as any).qtNumber || "").toLowerCase().includes(t),
    );
  }, [salesOrders, searchTerm]);

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
          <p className="text-muted-foreground mt-1">Manage quotations converted to sales orders and saved orders.</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search sales orders..."
              className="pl-9 pr-9"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button type="button" onClick={() => setSearchTerm("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <Link href="/sales-orders/new">
            <Button className="gap-2 w-full sm:w-auto"><Plus className="h-4 w-4" />Create Sales Order</Button>
          </Link>
        </div>
      </div>

      {/* Converted Quotations */}
      <div className="space-y-3">
        <div>
          <h2 className="text-xl font-semibold">Quotations</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Quotations marked as &quot;Converted to SO&quot; appear here.
          </p>
        </div>
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b">
                <tr>
                  <th className="px-6 py-4 font-medium">Quotation No.</th>
                  <th className="px-6 py-4 font-medium">Customer</th>
                  <th className="px-6 py-4 font-medium">Date</th>
                  <th className="px-6 py-4 font-medium">Valid Till</th>
                  <th className="px-6 py-4 font-medium text-right">Amount</th>
                  <th className="px-6 py-4 font-medium text-center">Status</th>
                  <th className="px-6 py-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {qtLoading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i}>{Array.from({ length: 7 }).map((_, j) => <td key={j} className="px-6 py-4"><Skeleton className="h-4 w-full" /></td>)}</tr>
                  ))
                ) : convertedQuotations.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-muted-foreground">
                      No converted quotations found. Convert a quotation to &quot;Converted to SO&quot; to see it here.
                    </td>
                  </tr>
                ) : (
                  convertedQuotations.map((qt) => (
                    <tr key={qt.id} className="hover:bg-muted/50 transition-colors">
                      <td className="px-6 py-4 font-medium font-mono">{qt.qtNumber}</td>
                      <td className="px-6 py-4">{qt.customerName}</td>
                      <td className="px-6 py-4">{fmtDate((qt as any).issueDate || qt.createdAt)}</td>
                      <td className="px-6 py-4">{fmtDate((qt as any).validTill)}</td>
                      <td className="px-6 py-4 text-right font-medium">{fmt(qt.totalAmount, (qt as any).currency || "SGD")}</td>
                      <td className="px-6 py-4 text-center">
                        <Badge className="bg-sky-600 hover:bg-sky-700">Converted to SO</Badge>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="View Quotation" onClick={() => setLocation(`/quotations/${qt.id}`)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Edit Quotation" onClick={() => setLocation(`/quotations/${qt.id}/edit`)}>
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
        </Card>
      </div>

      {/* Sales Orders */}
      <div className="space-y-3">
        <div>
          <h2 className="text-xl font-semibold">Sales Order</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Saved sales orders from the Generate Sales Order form.</p>
        </div>
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b">
                <tr>
                  <th className="px-6 py-4 font-medium">Sales Order No.</th>
                  <th className="px-6 py-4 font-medium">Date</th>
                  <th className="px-6 py-4 font-medium">Quotation</th>
                  <th className="px-6 py-4 font-medium">Customer</th>
                  <th className="px-6 py-4 font-medium text-right">Amount</th>
                  <th className="px-6 py-4 font-medium text-center">Status</th>
                  <th className="px-6 py-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {soLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>{Array.from({ length: 7 }).map((_, j) => <td key={j} className="px-6 py-4"><Skeleton className="h-4 w-full" /></td>)}</tr>
                  ))
                ) : filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-muted-foreground">
                      {searchTerm ? "No sales orders match your search." : 'No sales orders found. Click "Generate Sales Order" to create one.'}
                    </td>
                  </tr>
                ) : (
                  filteredOrders.map((doc) => (
                    <tr key={doc.id} className="hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => setLocation(`/sales-orders/${doc.id}`)}>
                      <td className="px-6 py-4 font-medium font-mono">{doc.soNumber}</td>
                      <td className="px-6 py-4">{fmtDate((doc as any).issueDate || doc.createdAt)}</td>
                      <td className="px-6 py-4 font-mono text-muted-foreground">{(doc as any).qtNumber || "—"}</td>
                      <td className="px-6 py-4">{doc.customerName}</td>
                      <td className="px-6 py-4 text-right font-medium">{fmt(doc.totalAmount, (doc as any).currency || "SGD")}</td>
                      <td className="px-6 py-4 text-center">{getSoStatusBadge(doc.status)}</td>
                      <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="View" onClick={() => setLocation(`/sales-orders/${doc.id}`)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Edit" onClick={() => setLocation(`/sales-orders/${doc.id}/edit`)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" title="Delete" onClick={() => setDeleteTarget({ id: Number(doc.id), soNumber: doc.soNumber })}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

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
