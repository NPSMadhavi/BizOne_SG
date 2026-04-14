import { useState } from "react";
import { useListInvoices, getListInvoicesQueryKey } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link, useLocation } from "wouter";
import { Search, Plus, ArrowRight } from "lucide-react";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";

export default function InvoiceList() {
  const [, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");

  const { data: docs, isLoading } = useListInvoices({
    query: { queryKey: getListInvoicesQueryKey() },
  });

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("en-SG", { style: "currency", currency: "SGD" }).format(value);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "confirmed": return <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-700">Confirmed</Badge>;
      case "draft": return <Badge variant="secondary">Draft</Badge>;
      case "cancelled": return <Badge variant="destructive">Cancelled</Badge>;
      case "void": return <Badge className="bg-gray-500 hover:bg-gray-600">Void</Badge>;
      case "paid": return <Badge className="bg-blue-600 hover:bg-blue-700">Paid</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const filtered = docs?.filter((d) => {
    const t = searchTerm.toLowerCase();
    return d.invNumber.toLowerCase().includes(t) || d.customerName.toLowerCase().includes(t);
  });

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Invoices</h1>
          <p className="text-muted-foreground mt-1">Manage and track all invoices.</p>
        </div>
        <Link href="/invoices/new">
          <Button className="gap-2"><Plus className="h-4 w-4" />New Invoice</Button>
        </Link>
      </div>

      <Card className="p-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by INV Number or Customer..."
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
                <th className="px-6 py-4 font-medium">INV Number</th>
                <th className="px-6 py-4 font-medium">Date</th>
                <th className="px-6 py-4 font-medium">Customer</th>
                <th className="px-6 py-4 font-medium">Created By</th>
                <th className="px-6 py-4 font-medium text-right">Amount</th>
                <th className="px-6 py-4 font-medium text-center">Status</th>
                <th className="px-6 py-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {[...Array(7)].map((_, j) => (
                      <td key={j} className="px-6 py-4"><Skeleton className="h-4 w-full" /></td>
                    ))}
                  </tr>
                ))
              ) : !filtered || filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-muted-foreground">
                    <div className="flex flex-col items-center space-y-3">
                      <Search className="h-8 w-8 text-muted-foreground/50" />
                      <p>No invoices found.</p>
                      {searchTerm && <Button variant="link" onClick={() => setSearchTerm("")}>Clear search</Button>}
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((doc) => (
                  <tr key={doc.id} className="hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => setLocation(`/invoices/${doc.id}`)}>
                    <td className="px-6 py-4 font-medium text-primary">{doc.invNumber}</td>
                    <td className="px-6 py-4 text-muted-foreground">{format(new Date(doc.createdAt), "MMM d, yyyy")}</td>
                    <td className="px-6 py-4 font-medium">{doc.customerName}</td>
                    <td className="px-6 py-4 text-muted-foreground">{(doc as any).createdByUsername || "—"}</td>
                    <td className="px-6 py-4 text-right font-medium">{formatCurrency(doc.totalAmount)}</td>
                    <td className="px-6 py-4 text-center">{getStatusBadge(doc.status)}</td>
                    <td className="px-6 py-4 text-right">
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
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
