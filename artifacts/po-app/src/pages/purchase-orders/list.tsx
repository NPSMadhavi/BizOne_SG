import { useState } from "react";
import { useListPurchaseOrders, getListPurchaseOrdersQueryKey } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link, useLocation } from "wouter";
import { Search, Plus, ArrowRight } from "lucide-react";
import { fmtDate } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/auth-context";

function piStatusBadge(status: string) {
  switch (status) {
    case "paid":    return <Badge className="bg-emerald-600 hover:bg-emerald-700 text-xs py-0 px-1.5">Paid</Badge>;
    case "partial": return <Badge className="bg-amber-500 hover:bg-amber-600 text-white text-xs py-0 px-1.5">Partial</Badge>;
    default:        return <Badge variant="outline" className="text-orange-600 border-orange-300 text-xs py-0 px-1.5">Pending</Badge>;
  }
}

export default function PurchaseOrderList() {
  const [, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const { selectedCompany } = useAuth();

  const { data: pos, isLoading } = useListPurchaseOrders({
    query: { queryKey: getListPurchaseOrdersQueryKey() },
  });

  const { data: vendorInvoices = [] } = useQuery<any[]>({
    queryKey: ["vendor-invoices", selectedCompany?.id],
    queryFn: async () => {
      const res = await fetch("/api/vendor-invoices", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const pisByPoId = vendorInvoices.reduce((acc: Record<number, any[]>, pi: any) => {
    const ids: number[] = pi.poIds || [];
    for (const poId of ids) {
      if (!acc[poId]) acc[poId] = [];
      acc[poId].push(pi);
    }
    return acc;
  }, {});

  const formatCurrency = (value: number, currency = "SGD") =>
    new Intl.NumberFormat("en-SG", { style: "currency", currency }).format(value);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "confirmed": return <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-700">Confirmed</Badge>;
      case "draft":     return <Badge variant="secondary">Draft</Badge>;
      case "cancelled": return <Badge variant="destructive">Cancelled</Badge>;
      default:          return <Badge variant="outline">{status}</Badge>;
    }
  };

  const filteredPOs = pos?.filter(po => {
    const term = searchTerm.toLowerCase();
    return po.poNumber.toLowerCase().includes(term) || po.vendorName.toLowerCase().includes(term);
  });

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Purchase Orders</h1>
          <p className="text-muted-foreground mt-1">Manage and track all purchase orders.</p>
        </div>
        <Link href="/purchase-orders/new">
          <Button className="gap-2"><Plus className="h-4 w-4" />Create PO</Button>
        </Link>
      </div>

      <Card className="p-4 flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by PO Number or Vendor..."
            className="pl-9"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b">
              <tr>
                <th className="px-6 py-4 font-medium">PO Number</th>
                <th className="px-6 py-4 font-medium">Date</th>
                <th className="px-6 py-4 font-medium">Vendor</th>
                <th className="px-6 py-4 font-medium">Created By</th>
                <th className="px-6 py-4 font-medium text-right">Amount</th>
                <th className="px-6 py-4 font-medium text-center">Status</th>
                <th className="px-6 py-4 font-medium">Vendor PI</th>
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
              ) : !filteredPOs || filteredPOs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-muted-foreground">
                    <div className="flex flex-col items-center justify-center space-y-3">
                      <Search className="h-8 w-8 text-muted-foreground/50" />
                      <p>No purchase orders found.</p>
                      {searchTerm && <Button variant="link" onClick={() => setSearchTerm("")}>Clear search</Button>}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredPOs.map((po) => {
                  const pis: any[] = pisByPoId[po.id] || [];
                  const overallStatus = pis.length === 0 ? null
                    : pis.every(p => p.status === "paid") ? "paid"
                    : pis.some(p => p.status === "paid" || p.status === "partial") ? "partial"
                    : "pending";

                  return (
                    <tr
                      key={po.id}
                      className="hover:bg-muted/50 transition-colors group cursor-pointer"
                      onClick={() => setLocation(`/purchase-orders/${po.id}`)}
                    >
                      <td className="px-6 py-4 font-medium text-primary">{po.poNumber}</td>
                      <td className="px-6 py-4 text-muted-foreground">{fmtDate(po.createdAt)}</td>
                      <td className="px-6 py-4 font-medium">{po.vendorName}</td>
                      <td className="px-6 py-4 text-muted-foreground">{(po as any).createdByUsername || "—"}</td>
                      <td className="px-6 py-4 text-right font-medium">{formatCurrency(po.totalAmount, (po as any).currency || "SGD")}</td>
                      <td className="px-6 py-4 text-center">{getStatusBadge(po.status)}</td>
                      <td className="px-6 py-4">
                        {pis.length === 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : pis.length === 1 ? (
                          <div className="flex items-center gap-2">
                            <span
                              className="font-mono text-xs font-medium text-primary hover:underline cursor-pointer"
                              onClick={e => { e.stopPropagation(); setLocation(`/vendor-invoices/${pis[0].id}`); }}
                            >
                              {pis[0].piNumber}
                            </span>
                            {piStatusBadge(pis[0].status)}
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span
                              className="font-mono text-xs font-medium text-primary hover:underline cursor-pointer"
                              onClick={e => { e.stopPropagation(); setLocation(`/vendor-invoices`); }}
                            >
                              {pis.length} PIs
                            </span>
                            {overallStatus && piStatusBadge(overallStatus)}
                          </div>
                        )}
                      </td>
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
