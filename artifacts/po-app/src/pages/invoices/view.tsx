import { useGetInvoice, getGetInvoiceQueryKey, useVoidInvoice, useKnockOffInvoice } from "@workspace/api-client-react";
import { useParams, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Pencil, Eye, Lock, Ban, CheckCircle2 } from "lucide-react";
import { fmtDate } from "@/lib/utils";
import { generateInvoice_PDF } from "@/lib/pdf";
import { PdfPreviewModal } from "@/components/pdf-preview-modal";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { useState } from "react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

function isoToReadable(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  return fmtDate(dateStr);
}

export default function InvoiceView() {
  const params = useParams();
  const id = Number(params.id);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { selectedCompany } = useAuth();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [voidDialogOpen, setVoidDialogOpen] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [voidSubmitting, setVoidSubmitting] = useState(false);

  const { data: doc, isLoading, refetch } = useGetInvoice(id, {
    query: { queryKey: getGetInvoiceQueryKey(id), enabled: !!id },
  });

  const voidMutation = useVoidInvoice();
  const knockOffMutation = useKnockOffInvoice();

  const fmt = (v: number) => new Intl.NumberFormat("en-SG", { style: "currency", currency: (doc as any)?.currency || "SGD" }).format(v);

  const getStatusBadge = (s: string) => {
    switch (s) {
      case "confirmed": return <Badge className="bg-emerald-600 hover:bg-emerald-700 text-sm py-1">Confirmed</Badge>;
      case "draft": return <Badge variant="secondary" className="text-sm py-1">Draft</Badge>;
      case "cancelled": return <Badge variant="destructive" className="text-sm py-1">Cancelled</Badge>;
      case "void": return <Badge className="bg-gray-500 hover:bg-gray-600 text-sm py-1">Void</Badge>;
      case "paid": return <Badge className="bg-blue-600 hover:bg-blue-700 text-sm py-1">Paid (Knocked Off)</Badge>;
      default: return <Badge variant="outline" className="text-sm py-1">{s}</Badge>;
    }
  };

  const handleVoid = async () => {
    if (!voidReason.trim()) return;
    setVoidSubmitting(true);
    voidMutation.mutate({ id, data: { voidReason: voidReason.trim() } }, {
      onSuccess: () => {
        toast({ title: "Invoice Voided", description: "The invoice has been voided." });
        setVoidDialogOpen(false);
        setVoidReason("");
        refetch();
      },
      onError: (err: any) => {
        toast({ title: "Error", description: err.message || "Failed to void invoice", variant: "destructive" });
      },
      onSettled: () => setVoidSubmitting(false),
    });
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
  const discountAmt = Number((doc as any).discountAmount) || 0;
  const hasItemDiscount = items.some((item: any) => Number(item.discount) > 0);
  const isVoided = doc.status === "void";
  const isPaid = doc.status === "paid";
  const canVoid = !isVoided && !isPaid;
  const canKnockOff = !isVoided && !isPaid;

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
            <p className="text-muted-foreground text-sm mt-0.5">Created {fmtDate(doc.createdAt)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {(doc as any).isPrivate && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground border rounded-md px-2 py-1">
              <Lock className="h-3 w-3" />Private
            </span>
          )}
          <Button variant="outline" className="gap-2" onClick={() => setPreviewOpen(true)}>
            <Eye className="h-4 w-4" />Preview
          </Button>
          {!isVoided && !isPaid && (
            <Button variant="outline" className="gap-2" onClick={() => setLocation(`/invoices/${id}/edit`)}>
              <Pencil className="h-4 w-4" />Edit
            </Button>
          )}
          {canKnockOff && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="gap-2 border-blue-300 text-blue-700 hover:bg-blue-50">
                  <CheckCircle2 className="h-4 w-4" />Invoice Knock-Off
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Mark as Paid?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will mark {doc.invNumber} as paid / knocked off. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-blue-600 hover:bg-blue-700"
                    onClick={() => knockOffMutation.mutate({ id }, {
                      onSuccess: () => {
                        toast({ title: "Knocked Off", description: "Invoice marked as paid." });
                        refetch();
                      },
                      onError: (err: any) => toast({ title: "Error", description: err.message || "Failed", variant: "destructive" }),
                    })}
                  >
                    Confirm Knock-Off
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          {canVoid && (
            <Button variant="outline" className="gap-2 border-orange-300 text-orange-700 hover:bg-orange-50" onClick={() => setVoidDialogOpen(true)}>
              <Ban className="h-4 w-4" />Void Invoice
            </Button>
          )}
        </div>
      </div>

      {isVoided && (doc as any).voidReason && (
        <div className="flex items-start gap-3 bg-gray-50 border border-gray-200 rounded-lg p-4">
          <Ban className="h-5 w-5 text-gray-500 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-semibold text-gray-700">This invoice has been voided</p>
            <p className="text-sm text-gray-500 mt-0.5">Reason: {(doc as any).voidReason}</p>
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Bill To</CardTitle></CardHeader>
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
          <CardHeader><CardTitle className="text-base">Invoice Details</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            {doc.paymentTerms && <div className="flex justify-between"><span className="text-muted-foreground">Payment Terms</span><span>{doc.paymentTerms}</span></div>}
            {doc.deliveryDate && <div className="flex justify-between"><span className="text-muted-foreground">Delivery Date</span><span>{isoToReadable(doc.deliveryDate)}</span></div>}
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
        title={`Invoice ${doc.invNumber}`}
        generatePdf={(opts) => generateInvoice_PDF(doc, selectedCompany, opts)}
        pdfFilename={`${doc.invNumber}.pdf`}
        defaultEmailTo={(doc as any).customerContactEmail || ""}
        defaultEmailSubject={`Invoice ${doc.invNumber}`}
        defaultEmailBody={`Dear ${doc.customerContact || "Sir/Madam"},\n\nPlease find attached Invoice ${doc.invNumber} for your records.\n\nPlease arrange payment as per the agreed terms.\n\nThank you.`}
        onEdit={() => { setPreviewOpen(false); setLocation(`/invoices/${id}/edit`); }}
      />

      <Dialog open={voidDialogOpen} onOpenChange={setVoidDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Void Invoice {doc.invNumber}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Voiding an invoice cannot be undone. Please provide a reason for voiding.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="void-reason">Reason for Voiding <span className="text-destructive">*</span></Label>
              <Textarea
                id="void-reason"
                placeholder="e.g. Duplicate invoice, wrong customer, etc."
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setVoidDialogOpen(false); setVoidReason(""); }}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={!voidReason.trim() || voidSubmitting}
              onClick={handleVoid}
            >
              {voidSubmitting ? "Voiding..." : "Void Invoice"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
