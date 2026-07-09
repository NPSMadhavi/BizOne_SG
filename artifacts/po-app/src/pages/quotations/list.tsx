import { useState } from "react";
import { useListQuotations, getListQuotationsQueryKey } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link, useLocation } from "wouter";
import { Search, Plus, MailCheck, CheckCircle2, MoreHorizontal, Eye, Pencil, FileText, Receipt } from "lucide-react";
import { fmtDate } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

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

export default function QuotationList() {
  const [, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: docs, isLoading } = useListQuotations({
    query: { queryKey: getListQuotationsQueryKey() },
  });

  const confirmMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/quotations/${id}/mark-confirmed`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || "Failed to confirm"); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getListQuotationsQueryKey() });
      toast({ title: "Quotation confirmed." });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("en-SG", { style: "currency", currency: "SGD" }).format(value);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "confirmed": return <Badge className="bg-emerald-600 hover:bg-emerald-700">Confirmed</Badge>;
      case "sent":      return <Badge className="bg-violet-600 hover:bg-violet-700">Sent</Badge>;
      case "draft":     return <Badge variant="secondary">Draft</Badge>;
      case "cancelled": return <Badge variant="destructive">Cancelled</Badge>;
      default:          return <Badge variant="outline">{status}</Badge>;
    }
  };

  const filtered = docs?.filter((d) => {
    const t = searchTerm.toLowerCase();
    return d.qtNumber.toLowerCase().includes(t) || d.customerName.toLowerCase().includes(t);
  });

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Quotations</h1>
          <p className="text-muted-foreground mt-1">Manage and track all quotations.</p>
        </div>
        <Link href="/quotations/new">
          <Button className="gap-2"><Plus className="h-4 w-4" />New Quotation</Button>
        </Link>
      </div>

      <Card className="p-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by QT Number or Customer..."
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
                <th className="px-6 py-4 font-medium">QT Number</th>
                <th className="px-6 py-4 font-medium">Date</th>
                <th className="px-6 py-4 font-medium">Customer</th>
                <th className="px-6 py-4 font-medium text-right">Amount</th>
                <th className="px-6 py-4 font-medium text-center">Status</th>
                <th className="px-6 py-4 font-medium">Sent To</th>
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
                      <p>No quotations found.</p>
                      {searchTerm && <Button variant="link" onClick={() => setSearchTerm("")}>Clear search</Button>}
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((doc) => (
                  <tr key={doc.id} className="hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => setLocation(`/quotations/${doc.id}`)}>
                    <td className="px-6 py-4 font-medium text-primary">{doc.qtNumber}</td>
                    <td className="px-6 py-4 text-muted-foreground">{fmtDate(doc.createdAt)}</td>
                    <td className="px-6 py-4 font-medium">{doc.customerName}</td>
                    <td className="px-6 py-4 text-right font-medium">{formatCurrency(Number(doc.totalAmount))}</td>
                    <td className="px-6 py-4 text-center">{getStatusBadge(doc.status)}</td>
                    <td className="px-6 py-4"><SentToCell emailSentTo={(doc as any).emailSentTo} /></td>
                    <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                          {doc.status !== "confirmed" ? (
                            <DropdownMenuItem
                              className="gap-2 text-emerald-700 focus:text-emerald-700"
                              onClick={() => confirmMutation.mutate(Number(doc.id))}
                              disabled={confirmMutation.isPending}
                            >
                              <CheckCircle2 className="h-4 w-4" />
                              Mark as Confirmed
                            </DropdownMenuItem>
                          ) : (
                            <>
                              <DropdownMenuItem
                                className="gap-2"
                                onClick={() => setLocation(`/proforma-invoices/new?from=qt&qtId=${doc.id}&qtNumber=${encodeURIComponent(doc.qtNumber)}&customer=${encodeURIComponent(doc.customerName)}`)}
                              >
                                <FileText className="h-4 w-4" />
                                Prepare Proforma Invoice
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="gap-2"
                                onClick={() => setLocation(`/invoices/new?from=qt&qtId=${doc.id}&qtNumber=${encodeURIComponent(doc.qtNumber)}&customer=${encodeURIComponent(doc.customerName)}`)}
                              >
                                <Receipt className="h-4 w-4" />
                                Prepare Tax Invoice
                              </DropdownMenuItem>
                            </>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="gap-2" onClick={() => setLocation(`/quotations/${doc.id}`)}>
                            <Eye className="h-4 w-4" />
                            View
                          </DropdownMenuItem>
                          <DropdownMenuItem className="gap-2" onClick={() => setLocation(`/quotations/${doc.id}/edit`)}>
                            <Pencil className="h-4 w-4" />
                            Edit
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
      </Card>
    </div>
  );
}
