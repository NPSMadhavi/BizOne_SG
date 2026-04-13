import { useGetInvoice, getGetInvoiceQueryKey, useDeleteInvoice } from "@workspace/api-client-react";
import { useParams, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Printer, Trash2, Pencil } from "lucide-react";
import { format } from "date-fns";
import { generateInvoice_PDF } from "@/lib/pdf";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

function isoToReadable(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr + (dateStr.includes("T") ? "" : "T00:00:00"));
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-SG", { day: "2-digit", month: "short", year: "numeric" });
}

export default function InvoiceView() {
  const params = useParams();
  const id = Number(params.id);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: doc, isLoading } = useGetInvoice(id, {
    query: { queryKey: getGetInvoiceQueryKey(id), enabled: !!id },
  });

  const deleteMutation = useDeleteInvoice();
  const fmt = (v: number) => new Intl.NumberFormat("en-SG", { style: "currency", currency: "SGD" }).format(v);

  const getStatusBadge = (s: string) => {
    switch (s) {
      case "confirmed": return <Badge className="bg-emerald-600 hover:bg-emerald-700 text-sm py-1">Confirmed</Badge>;
      case "draft": return <Badge variant="secondary" className="text-sm py-1">Draft</Badge>;
      case "cancelled": return <Badge variant="destructive" className="text-sm py-1">Cancelled</Badge>;
      default: return <Badge variant="outline" className="text-sm py-1">{s}</Badge>;
    }
  };

  if (isLoading) return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <Skeleton className="h-10 w-48" />
      <div className="grid md:grid-cols-2 gap-6"><Skeleton className="h-48" /><Skeleton className="h-48" /></div>
      <Skeleton className="h-64" />
    </div>
  );

  if (!doc) return <div className="text-center py-20 text-muted-foreground">Invoice not found.</div>;

  const items = (doc.items as any[]) || [];
  const subtotal = Number(doc.subtotal) || 0;
  const tax = Number(doc.tax) || 0;
  const total = Number(doc.totalAmount) || 0;

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/invoices")}><ArrowLeft className="h-4 w-4" /></Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">{doc.invNumber}</h1>
              {getStatusBadge(doc.status)}
            </div>
            <p className="text-muted-foreground text-sm mt-0.5">Created {format(new Date(doc.createdAt), "d MMM yyyy")}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-2" onClick={() => generateInvoice_PDF(doc).catch(() => toast({ title: "Error", description: "PDF failed", variant: "destructive" }))}>
            <Printer className="h-4 w-4" />Download PDF
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => setLocation(`/invoices/${id}/edit`)}>
            <Pencil className="h-4 w-4" />Edit
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="icon"><Trash2 className="h-4 w-4" /></Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Invoice?</AlertDialogTitle>
                <AlertDialogDescription>This will permanently delete {doc.invNumber}.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => deleteMutation.mutate({ id }, {
                  onSuccess: () => { toast({ title: "Deleted" }); setLocation("/invoices"); },
                  onError: () => toast({ title: "Error", description: "Failed to delete", variant: "destructive" }),
                })}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Bill To</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div><span className="font-medium text-base">{doc.customerName}</span></div>
            {doc.customerAddress && <p className="text-muted-foreground whitespace-pre-line">{doc.customerAddress}</p>}
            {doc.customerContact && <p className="text-muted-foreground">{doc.customerContact}</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Invoice Details</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            {doc.deliveryAddress && <div><span className="text-muted-foreground">Deliver To:</span><p className="whitespace-pre-line mt-0.5">{doc.deliveryAddress}</p></div>}
            {doc.deliveryDate && <div className="flex justify-between"><span className="text-muted-foreground">Delivery Date</span><span>{isoToReadable(doc.deliveryDate)}</span></div>}
            {doc.paymentTerms && <div className="flex justify-between"><span className="text-muted-foreground">Payment Terms</span><span>{doc.paymentTerms}</span></div>}
            {doc.notes && <div><span className="text-muted-foreground">Notes:</span><p className="mt-0.5 whitespace-pre-line">{doc.notes}</p></div>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b text-xs text-muted-foreground uppercase">
              <tr>
                <th className="px-6 py-3 text-left w-8">#</th>
                <th className="px-6 py-3 text-left">Item / Part Number</th>
                <th className="px-6 py-3 text-left">Description</th>
                <th className="px-6 py-3 text-right">Qty</th>
                <th className="px-6 py-3 text-right">Unit Price</th>
                <th className="px-6 py-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((item: any, i: number) => (
                <tr key={i} className="hover:bg-muted/30">
                  <td className="px-6 py-3 text-muted-foreground">{i + 1}</td>
                  <td className="px-6 py-3 text-muted-foreground">{item.partNumber || "—"}</td>
                  <td className="px-6 py-3 font-medium">{item.description}</td>
                  <td className="px-6 py-3 text-right">{item.qty}</td>
                  <td className="px-6 py-3 text-right">{fmt(Number(item.unitPrice) || 0)}</td>
                  <td className="px-6 py-3 text-right">{fmt(Number(item.amount) || (Number(item.qty) * Number(item.unitPrice)))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t p-6 flex justify-end bg-muted/10">
          <div className="w-64 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{fmt(subtotal)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">GST</span><span>{fmt(tax)}</span></div>
            <div className="flex justify-between font-semibold text-base border-t pt-2"><span>Total</span><span>{fmt(total)}</span></div>
          </div>
        </div>
      </Card>
    </div>
  );
}
