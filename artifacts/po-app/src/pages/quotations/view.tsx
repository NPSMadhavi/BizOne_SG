import { useGetQuotation, getGetQuotationQueryKey, useDeleteQuotation } from "@workspace/api-client-react";
import { useParams, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Trash2, Pencil, Eye, Lock } from "lucide-react";
import { format } from "date-fns";
import { generateQuotation_PDF } from "@/lib/pdf";
import { PdfPreviewModal } from "@/components/pdf-preview-modal";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { useState } from "react";
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

export default function QuotationView() {
  const params = useParams();
  const id = Number(params.id);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { selectedCompany, isAdmin } = useAuth();
  const [previewOpen, setPreviewOpen] = useState(false);

  const { data: doc, isLoading } = useGetQuotation(id, {
    query: { queryKey: getGetQuotationQueryKey(id), enabled: !!id },
  });

  const deleteMutation = useDeleteQuotation();

  const fmt = (v: number) => new Intl.NumberFormat("en-SG", { style: "currency", currency: (doc as any)?.currency || "SGD" }).format(v);

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
      <div className="grid md:grid-cols-2 gap-6">
        <Skeleton className="h-48" /><Skeleton className="h-48" />
      </div>
      <Skeleton className="h-64" />
    </div>
  );

  if (!doc) return <div className="text-center py-20 text-muted-foreground">Quotation not found.</div>;

  const items = (doc.items as any[]) || [];
  const subtotal = Number(doc.subtotal) || 0;
  const tax = Number(doc.tax) || 0;
  const total = Number(doc.totalAmount) || 0;
  const discountAmt = Number((doc as any).discountAmount) || 0;
  const hasItemDiscount = items.some((item: any) => Number(item.discount) > 0);

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/quotations")}><ArrowLeft className="h-4 w-4" /></Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">{doc.qtNumber}</h1>
              {getStatusBadge(doc.status)}
            </div>
            <p className="text-muted-foreground text-sm mt-0.5">Created {format(new Date(doc.createdAt), "d MMM yyyy")}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {(doc as any).isPrivate && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground border rounded-md px-2 py-1">
              <Lock className="h-3 w-3" />Private
            </span>
          )}
          <Button variant="outline" className="gap-2" onClick={() => setPreviewOpen(true)}>
            <Eye className="h-4 w-4" />Preview & Download
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => setLocation(`/quotations/${id}/edit`)}>
            <Pencil className="h-4 w-4" />Edit
          </Button>
          {isAdmin && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="icon"><Trash2 className="h-4 w-4" /></Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Quotation?</AlertDialogTitle>
                  <AlertDialogDescription>This will permanently delete {doc.qtNumber}.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => deleteMutation.mutate({ id }, {
                    onSuccess: () => { toast({ title: "Deleted" }); setLocation("/quotations"); },
                    onError: () => toast({ title: "Error", description: "Failed to delete", variant: "destructive" }),
                  })}>Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Customer</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div><span className="font-medium text-base">{doc.customerName}</span></div>
            {doc.customerAddress && <p className="text-muted-foreground whitespace-pre-line">{doc.customerAddress}</p>}
            {doc.customerContact && (
              <div className="text-sm">
                <span className="text-muted-foreground">Contact: </span>
                <span>{doc.customerContact}</span>
              </div>
            )}
            {(doc as any).customerContactEmail && (
              <div className="text-sm">
                <span className="text-muted-foreground">Email: </span>
                <a href={`mailto:${(doc as any).customerContactEmail}`} className="text-primary hover:underline">
                  {(doc as any).customerContactEmail}
                </a>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Quotation Details</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
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
                {hasItemDiscount && <th className="px-6 py-3 text-right">Disc %</th>}
                <th className="px-6 py-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((item: any, i: number) => (
                <tr key={i} className="hover:bg-muted/30">
                  <td className="px-6 py-3 text-muted-foreground">{i + 1}</td>
                  <td className="px-6 py-3 text-muted-foreground">{item.partNumber || "—"}</td>
                  <td className="px-6 py-3 font-medium prose prose-sm max-w-none [&_p]:my-0 [&_ul]:my-0 [&_ol]:my-0" dangerouslySetInnerHTML={{ __html: item.description }} />
                  <td className="px-6 py-3 text-right">{item.qty}</td>
                  <td className="px-6 py-3 text-right">{fmt(Number(item.unitPrice) || 0)}</td>
                  {hasItemDiscount && <td className="px-6 py-3 text-right text-muted-foreground">{Number(item.discount) > 0 ? `${item.discount}%` : "—"}</td>}
                  <td className="px-6 py-3 text-right">{fmt(Number(item.amount) || (Number(item.qty) * Number(item.unitPrice)))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t p-6 flex justify-end bg-muted/10">
          <div className="w-72 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{fmt(subtotal)}</span></div>
            {discountAmt > 0 && <div className="flex justify-between text-red-600"><span>Discount</span><span>-{fmt(discountAmt)}</span></div>}
            {discountAmt > 0 && <div className="flex justify-between text-xs text-muted-foreground"><span>Net Amount</span><span>{fmt(subtotal - discountAmt)}</span></div>}
            <div className="flex justify-between"><span className="text-muted-foreground">GST</span><span>{fmt(tax)}</span></div>
            <div className="flex justify-between font-semibold text-base border-t pt-2"><span>Total</span><span>{fmt(total)}</span></div>
          </div>
        </div>
      </Card>

      <PdfPreviewModal
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        title={`Quotation ${doc.qtNumber}`}
        generatePdf={(opts) => generateQuotation_PDF(doc, selectedCompany, opts)}
        pdfFilename={`${doc.qtNumber}.pdf`}
        defaultEmailTo={(doc as any).customerContactEmail || ""}
        defaultEmailSubject={`Quotation ${doc.qtNumber}`}
        defaultEmailBody={`Dear ${doc.customerContact || "Sir/Madam"},\n\nPlease find attached our Quotation ${doc.qtNumber} for your consideration.\n\nDo not hesitate to contact us if you have any questions.\n\nThank you.`}
        onEdit={() => { setPreviewOpen(false); setLocation(`/quotations/${id}/edit`); }}
      />
    </div>
  );
}
