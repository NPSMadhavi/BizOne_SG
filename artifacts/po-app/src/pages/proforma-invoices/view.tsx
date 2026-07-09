import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useGetSettings, getGetSettingsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Pencil, Eye, Lock, Trash2 } from "lucide-react";
import { fmtDate, cn } from "@/lib/utils";
import { generatePI_PDF } from "@/lib/pdf";
import { PdfPreviewModal } from "@/components/pdf-preview-modal";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { useState } from "react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { SentToCell } from "@/components/sent-to-cell";

function isoToReadable(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  return fmtDate(dateStr);
}

export default function ProformaInvoiceView() {
  const params = useParams();
  const id = Number(params.id);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { selectedCompany, isAdmin } = useAuth();
  const qc = useQueryClient();

  const [previewOpen, setPreviewOpen] = useState(false);

  const { data: doc, isLoading } = useQuery<any>({
    queryKey: ["proforma-invoices", id],
    queryFn: async () => {
      const res = await fetch(`/api/proforma-invoices/${id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load proforma invoice");
      return res.json();
    },
    enabled: !!id,
  });

  const { data: settings } = useGetSettings({ query: { queryKey: getGetSettingsQueryKey() } });

  const markSentMutation = useMutation({
    mutationFn: async (sentTo: string[]) => {
      const res = await fetch(`/api/proforma-invoices/${id}/mark-sent`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sentTo }),
      });
      if (!res.ok) throw new Error("Failed to mark as sent");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["proforma-invoices"] });
      qc.invalidateQueries({ queryKey: ["proforma-invoices", id] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/proforma-invoices/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Delete failed");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Proforma Invoice deleted." });
      setLocation("/proforma-invoices");
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("en-SG", { style: "currency", currency: doc?.currency || "SGD" }).format(value);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "sent":      return <Badge className="bg-violet-600 hover:bg-violet-700 text-sm py-1">Sent</Badge>;
      case "draft":     return <Badge variant="secondary" className="text-sm py-1">Draft</Badge>;
      case "cancelled": return <Badge variant="destructive" className="text-sm py-1">Cancelled</Badge>;
      default:          return <Badge variant="outline" className="text-sm py-1">{status}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-32" />)}
        </div>
      </div>
    );
  }
  if (!doc) return <div className="text-center py-12 text-muted-foreground">Proforma invoice not found.</div>;

  const hasItems = (doc.items as any[]).some((it: any) => it.type !== "section");
  const hasPart = (doc.items as any[]).some((it: any) => it.type !== "section" && it.partNumber);
  const hasUom  = (doc.items as any[]).some((it: any) => it.type !== "section" && it.uom);
  const tax = Number(doc.tax);
  const subtotal = Number(doc.subtotal);
  const discount = Number(doc.discountAmount);
  const total = Number(doc.totalAmount);

  return (
    <div className="max-w-[1600px] mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/proforma-invoices")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{doc.piNumber}</h1>
              {doc.isPrivate && <span title="Private"><Lock className="h-4 w-4 text-muted-foreground" /></span>}
              {getStatusBadge(doc.status)}
            </div>
            <p className="text-sm text-muted-foreground">Proforma Invoice</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" className="gap-2" onClick={() => setPreviewOpen(true)}>
            <Eye className="h-4 w-4" />
            Preview PDF
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => setLocation(`/proforma-invoices/${id}/edit`)}>
            <Pencil className="h-4 w-4" />
            Edit
          </Button>
          {isAdmin && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="icon">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Proforma Invoice?</AlertDialogTitle>
                  <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => deleteMutation.mutate()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {/* Sent To display */}
      {doc.emailSentTo && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Sent to:</span>
          <SentToCell emailSentTo={doc.emailSentTo} />
        </div>
      )}

      {/* Details grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-sm">Customer Details</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div><span className="text-muted-foreground">Name:</span> <span className="font-medium">{doc.customerName}</span></div>
            {doc.customerAddress && <div><span className="text-muted-foreground">Address:</span> <span>{doc.customerAddress}</span></div>}
            {doc.customerContact && <div><span className="text-muted-foreground">Contact:</span> <span>{doc.customerContact}</span></div>}
            {doc.customerContactEmail && <div><span className="text-muted-foreground">Email:</span> <span>{doc.customerContactEmail}</span></div>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Invoice Details</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div><span className="text-muted-foreground">Issue Date:</span> <span>{isoToReadable(doc.issueDate || doc.createdAt)}</span></div>
            {doc.deliveryDate && <div><span className="text-muted-foreground">Delivery Date:</span> <span>{doc.deliveryDate}</span></div>}
            {doc.paymentTerms && <div><span className="text-muted-foreground">Payment Terms:</span> <span>{doc.paymentTerms}</span></div>}
            {doc.qtRefNo && <div><span className="text-muted-foreground">QT Ref No:</span> <span>{doc.qtRefNo}</span></div>}
            <div><span className="text-muted-foreground">Currency:</span> <span>{doc.currency}</span></div>
          </CardContent>
        </Card>
      </div>

      {/* Items Table */}
      {hasItems && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Items</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left">No.</th>
                    {hasPart && <th className="px-4 py-3 text-left">Part No.</th>}
                    <th className="px-4 py-3 text-left">Description</th>
                    <th className="px-4 py-3 text-right">Qty</th>
                    {hasUom && <th className="px-4 py-3 text-left">UOM</th>}
                    <th className="px-4 py-3 text-right">Unit Price</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(doc.items as any[]).map((item: any, idx: number) => {
                    if (item.type === "section") {
                      return (
                        <tr key={idx} className="bg-muted/30">
                          <td colSpan={hasPart ? (hasUom ? 7 : 6) : (hasUom ? 6 : 5)} className={cn("px-4 py-2 font-semibold text-sm", item.sectionAlign === "center" ? "text-center" : "text-left")}
                            dangerouslySetInnerHTML={{ __html: item.sectionLabel || "" }} />
                        </tr>
                      );
                    }
                    const lineQty = Number(item.qty || 0);
                    const linePrice = item.isFoc ? 0 : Number(item.unitPrice || 0);
                    const discPct = Number(item.discount || 0);
                    const lineAmount = lineQty * linePrice * (1 - discPct / 100);
                    return (
                      <tr key={idx} className="hover:bg-muted/30">
                        <td className="px-4 py-3 text-muted-foreground">{idx + 1}</td>
                        {hasPart && <td className="px-4 py-3 text-muted-foreground">{item.partNumber || "—"}</td>}
                        <td className="px-4 py-3">
                          <div dangerouslySetInnerHTML={{ __html: item.description || "" }} className="prose prose-sm max-w-none [&_p]:my-0" />
                          {item.isFoc && <Badge variant="secondary" className="text-xs mt-1">FOC</Badge>}
                        </td>
                        <td className="px-4 py-3 text-right">{lineQty}</td>
                        {hasUom && <td className="px-4 py-3">{item.uom || ""}</td>}
                        <td className="px-4 py-3 text-right">{item.isFoc ? "FOC" : formatCurrency(linePrice)}</td>
                        <td className="px-4 py-3 text-right font-medium">{formatCurrency(lineAmount)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Totals */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex justify-end">
            <div className="space-y-2 min-w-[200px]">
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
              {discount > 0 && <div className="flex justify-between text-sm"><span className="text-muted-foreground">Discount</span><span>−{formatCurrency(discount)}</span></div>}
              {tax > 0 && <div className="flex justify-between text-sm"><span className="text-muted-foreground">Tax ({tax}%)</span><span>{formatCurrency((subtotal - discount) * tax / 100)}</span></div>}
              <div className="flex justify-between text-sm font-bold border-t pt-2"><span>Total</span><span>{formatCurrency(total)}</span></div>
            </div>
          </div>
        </CardContent>
      </Card>

      {doc.notes && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Notes</CardTitle></CardHeader>
          <CardContent>
            <div className="text-sm text-muted-foreground prose prose-sm max-w-none [&_p]:my-1" dangerouslySetInnerHTML={{ __html: doc.notes }} />
          </CardContent>
        </Card>
      )}

      <PdfPreviewModal
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        title={`Proforma Invoice ${doc.piNumber}`}
        generatePdf={(opts) => generatePI_PDF(doc, selectedCompany, settings, opts)}
        pdfFilename={`${doc.piNumber}.pdf`}
        defaultEmailTo={(doc as any).customerContactEmail || ""}
        defaultEmailSubject={`Proforma Invoice ${doc.piNumber}`}
        defaultEmailBody={`Dear ${(doc as any).customerContact || "Sir/Madam"},\n\nPlease find attached our Proforma Invoice ${doc.piNumber} for your consideration.\n\nThank you.`}
        onEdit={() => setLocation(`/proforma-invoices/${id}/edit`)}
        onEmailSent={(recipients) => markSentMutation.mutate(recipients)}
      />
    </div>
  );
}
