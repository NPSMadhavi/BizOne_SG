import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { FileInput, Search, Plus, ArrowUpRight } from "lucide-react";
import { fmtDate } from "@/lib/utils";
import { useAuth } from "@/contexts/auth-context";
import NewVendorInvoiceDialog from "./new-dialog";

function statusBadge(status: string) {
  switch (status) {
    case "paid": return <Badge className="bg-emerald-600 hover:bg-emerald-700">Paid</Badge>;
    case "partial": return <Badge className="bg-amber-500 hover:bg-amber-600 text-white">Partial</Badge>;
    default: return <Badge variant="outline" className="text-orange-600 border-orange-300">Pending</Badge>;
  }
}

function formatCurrency(amount: number, currency = "SGD") {
  return new Intl.NumberFormat("en-SG", { style: "currency", currency }).format(amount);
}

export default function VendorInvoiceList() {
  const [, setLocation] = useLocation();
  const { selectedCompany } = useAuth();
  const [search, setSearch] = useState("");
  const [newOpen, setNewOpen] = useState(false);

  const { data: pis = [], isLoading, refetch } = useQuery<any[]>({
    queryKey: ["vendor-invoices", selectedCompany?.id],
    queryFn: async () => {
      const res = await fetch("/api/vendor-invoices", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load vendor invoices");
      return res.json();
    },
  });

  const filtered = pis.filter(pi =>
    pi.piNumber.toLowerCase().includes(search.toLowerCase()) ||
    pi.vendorName.toLowerCase().includes(search.toLowerCase()) ||
    (pi.poNumbers || "").toLowerCase().includes(search.toLowerCase())
  );

  const totalOutstanding = pis.filter(p => p.status !== "paid").reduce((s: number, p: any) => s + p.balance, 0);
  const totalPaid = pis.filter(p => p.status === "paid").length;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Vendor Invoices</h1>
          <p className="text-muted-foreground mt-1">Track vendor purchase invoices and payments</p>
        </div>
        <Button onClick={() => setNewOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Record Vendor PI
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total PIs</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{pis.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Fully Paid</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-emerald-600">{totalPaid}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Outstanding Balance</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-orange-600">{formatCurrency(totalOutstanding)}</div></CardContent>
        </Card>
      </div>

      <Card>
        <div className="p-4 border-b">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by PI number, vendor or PO..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="p-6 space-y-3">
            {[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <FileInput className="h-10 w-10 text-muted-foreground mb-4" />
            <p className="font-medium text-muted-foreground">No vendor invoices yet</p>
            <p className="text-sm text-muted-foreground mt-1">Record a vendor PI to start tracking payments</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-y">
                <tr>
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
                {filtered.map((pi: any) => (
                  <tr key={pi.id} className="bg-card hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => setLocation(`/vendor-invoices/${pi.id}`)}>
                    <td className="px-4 py-3 font-medium font-mono">{pi.piNumber}</td>
                    <td className="px-4 py-3">{pi.vendorName}</td>
                    <td className="px-4 py-3 text-muted-foreground">{pi.poNumbers || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{pi.piDate ? fmtDate(pi.piDate) : "—"}</td>
                    <td className="px-4 py-3 text-right font-medium">{formatCurrency(pi.totalAmount, pi.currency)}</td>
                    <td className="px-4 py-3 text-right text-emerald-600">{formatCurrency(pi.paidAmount, pi.currency)}</td>
                    <td className="px-4 py-3 text-right font-medium text-orange-600">{formatCurrency(pi.balance, pi.currency)}</td>
                    <td className="px-4 py-3">{statusBadge(pi.status)}</td>
                    <td className="px-4 py-3">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={e => { e.stopPropagation(); setLocation(`/vendor-invoices/${pi.id}`); }}>
                        <ArrowUpRight className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <NewVendorInvoiceDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        onCreated={() => { refetch(); }}
      />
    </div>
  );
}
