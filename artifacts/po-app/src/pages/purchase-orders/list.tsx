import { useState } from "react";
import { useListPurchaseOrders, getListPurchaseOrdersQueryKey } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link, useLocation } from "wouter";
import { Search, Plus, ArrowRight } from "lucide-react";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";

export default function PurchaseOrderList() {
  const [, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  
  const { data: pos, isLoading } = useListPurchaseOrders({
    query: {
      queryKey: getListPurchaseOrdersQueryKey(),
    }
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-SG', {
      style: 'currency',
      currency: 'SGD'
    }).format(value);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'confirmed': return <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-700">Confirmed</Badge>;
      case 'draft': return <Badge variant="secondary">Draft</Badge>;
      case 'cancelled': return <Badge variant="destructive">Cancelled</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const filteredPOs = pos?.filter(po => {
    const term = searchTerm.toLowerCase();
    return po.poNumber.toLowerCase().includes(term) || 
           po.vendorName.toLowerCase().includes(term);
  });

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Purchase Orders</h1>
          <p className="text-muted-foreground mt-1">Manage and track all purchase orders.</p>
        </div>
        <Link href="/purchase-orders/new">
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            Create PO
          </Button>
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
                <th className="px-6 py-4 font-medium text-right">Amount</th>
                <th className="px-6 py-4 font-medium text-center">Status</th>
                <th className="px-6 py-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td className="px-6 py-4"><Skeleton className="h-4 w-24" /></td>
                    <td className="px-6 py-4"><Skeleton className="h-4 w-24" /></td>
                    <td className="px-6 py-4"><Skeleton className="h-4 w-48" /></td>
                    <td className="px-6 py-4"><Skeleton className="h-4 w-20 ml-auto" /></td>
                    <td className="px-6 py-4"><Skeleton className="h-6 w-20 mx-auto" /></td>
                    <td className="px-6 py-4"><Skeleton className="h-8 w-8 ml-auto rounded-md" /></td>
                  </tr>
                ))
              ) : !filteredPOs || filteredPOs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                    <div className="flex flex-col items-center justify-center space-y-3">
                      <Search className="h-8 w-8 text-muted-foreground/50" />
                      <p>No purchase orders found.</p>
                      {searchTerm && (
                        <Button variant="link" onClick={() => setSearchTerm("")}>
                          Clear search
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredPOs.map((po) => (
                  <tr 
                    key={po.id} 
                    className="hover:bg-muted/50 transition-colors group cursor-pointer"
                    onClick={() => setLocation(`/purchase-orders/${po.id}`)}
                  >
                    <td className="px-6 py-4 font-medium text-primary">
                      {po.poNumber}
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">
                      {format(new Date(po.createdAt), "MMM d, yyyy")}
                    </td>
                    <td className="px-6 py-4 font-medium">{po.vendorName}</td>
                    <td className="px-6 py-4 text-right font-medium">
                      {formatCurrency(po.totalAmount)}
                    </td>
                    <td className="px-6 py-4 text-center">
                      {getStatusBadge(po.status)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground group-hover:text-foreground">
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
