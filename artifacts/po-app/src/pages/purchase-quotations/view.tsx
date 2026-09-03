import { useGetPurchaseQuotation, getGetPurchaseQuotationQueryKey, getListPurchaseQuotationsQueryKey, useDeletePurchaseQuotation, useGetSettings, getGetSettingsQueryKey } from "@workspace/api-client-react";
import { useParams, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Trash2, Pencil, Eye, Lock, Mail, ShoppingBag } from "lucide-react";
import { fmtDate } from "@/lib/utils";
import { generatePurchaseQuotation_PDF } from "@/lib/pdf";
import { PdfPreviewModal } from "@/components/pdf-preview-modal";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { invalidateDocumentList } from "@/lib/invalidate-document-lists";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

function isoToReadable(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  return fmtDate(dateStr);
}

export default function PurchaseQuotationView() {
  const params = useParams();
  const id = Number(params.id);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { selectedCompany, canManage } = useAuth();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [converting, setConverting] = useState<"po" | "vendor-invoice" | null>(null);
  const qc = useQueryClient();

  const handleConvertToPo = async () => {
    setConverting("po");
    try {
      const res = await fetch(`/api/purchase-quotations/${id}/convert-to-po`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || "Failed"); }
      const result = await res.json();

      await Promise.all([
        qc.invalidateQueries({ queryKey: getGetPurchaseQuotationQueryKey(id) }),
        qc.invalidateQueries({ queryKey: getListPurchaseQuotationsQueryKey() }),
        invalidateDocumentList(qc, "purchase-orders"),
      ]);

      toast({ title: "Purchase Order Created", description: `${result.number} created as a draft.` });
      setLocation(`/purchase-orders/${result.id}/edit`);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setConverting(null);
    }
  };

  const handleConvertToVendorInvoice = async () => {
    setConverting("vendor-invoice");
    try {
      const res = await fetch(`/api/purchase-quotations/${id}/convert-to-vendor-invoice`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || "Failed"); }
      const result = await res.json();

      await Promise.all([
        qc.invalidateQueries({ queryKey: getGetPurchaseQuotationQueryKey(id) }),
        qc.invalidateQueries({ queryKey: getListPurchaseQuotationsQueryKey() }),
        qc.invalidateQueries({ queryKey: ["vendor-invoices"] }),
      ]);

      toast({ title: "Vendor Invoice Created", description: `${result.number} created successfully.` });
      setLocation(`/vendor-invoices/${result.id}`);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setConverting(null);
    }
  };

  const { data: doc, isLoading, refetch } = useGetPurchaseQuotation(id, {
    query: { queryKey: getGetPurchaseQuotationQueryKey(id), enabled: !!id },
  });

  const { data: docSettings } = useGetSettings({
    query: { queryKey: getGetSettingsQueryKey() },
  });

  const deleteMutation = useDeletePurchaseQuotation();

  const fmt = (v: number) => new Intl.NumberFormat("en-SG", { style: "currency", currency: (doc as any)?.currency || "SGD" }).format(v);

  const getStatusBadge = (s: string) => {
    switch (s) {
      case "confirmed": return <Badge className="bg-emerald-600 hover:bg-emerald-700 text-sm py-1">Confirmed</Badge>;
      case "draft": return <Badge variant="secondary" className="text-sm py-1">Draft</Badge>;
      case "cancelled": return <Badge variant="destructive" className="text-sm py-1">Cancelled</Badge>;
      case "sent": return <Badge className="bg-violet-600 hover:bg-violet-700 text-sm py-1">Sent</Badge>;
      case "converted_to_po": return <Badge className="bg-sky-600 hover:bg-sky-700 text-sm py-1">Converted to PO</Badge>;
      default: return <Badge variant="outline" className="text-sm py-1">{s}</Badge>;
    }
  };

  if (isLoading) return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-48" />
      <div className="grid md:grid-cols-2 gap-6">
        <Skeleton className="h-48" /><Skeleton className="h-48" />
      </div>
      <Skeleton className="h-64" />
    </div>
  );

  if (!doc) return <div className="text-center py-20 text-muted-foreground">Purchase quotation not found.</div>;

  const canConvert = ["confirmed", "sent"].includes(doc.status);

  const items = (doc.items as any[]) || [];
  const subtotal = Number(doc.subtotal) || 0;
  const tax = Number(doc.tax) || 0;
  const total = Number(doc.totalAmount) || 0;
  const discountAmt = Number((doc as any).discountAmount) || 0;
  const regularQtItems = items.filter((item: any) => item.type !== "section");
  const hasItemDiscount = regularQtItems.some((item: any) => Number(item.discount) > 0);
  const hasQtUom = regularQtItems.some((item: any) => item.uom && String(item.uom).trim() !== "");
  const hasQtPartNo = regularQtItems.some((item: any) => item.partNumber && String(item.partNumber).trim() !== "");
  const qtColCount = 2 + (hasQtPartNo ? 1 : 0) + (hasQtUom ? 1 : 0) + (hasItemDiscount ? 1 : 0) + 3;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/purchase-quotations")}><ArrowLeft className="h-4 w-4" /></Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-[#2563EB]">{doc.pqNumber}</h1>
              {getStatusBadge(doc.status)}
            </div>
            <p className="text-muted-foreground text-sm mt-0.5">Created {fmtDate(doc.createdAt)}</p>
            {(doc as any).emailSentTo && (
              <div className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-2.5 py-1 w-fit mt-1">
                <Mail className="h-3 w-3 shrink-0" />
                <span>Emailed to: {(doc as any).emailSentTo}</span>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {(doc as any).isPrivate && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground border rounded-md px-2 py-1">
              <Lock className="h-3 w-3" />Private
            </span>
          )}
          <Button variant="outline" className="gap-2" onClick={() => setPreviewOpen(true)}>
            <Eye className="h-4 w-4" />Preview
          </Button>
          <Button
            variant="outline"
            className="gap-2 border-sky-300 text-sky-700 hover:bg-sky-50"
            onClick={handleConvertToPo}
            disabled={!!converting || doc.status === "converted_to_po" || !canConvert}
            title={doc.status === "converted_to_po"
              ? "Already converted to Purchase Order"
              : !canConvert
                ? "Confirm the purchase quotation before converting"
                : undefined}
          >
            {converting === "po" ? <span className="h-4 w-4 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" /> : <ShoppingBag className="h-4 w-4" />}
            Convert to PO
          </Button>
          <Button
            variant="outline"
            className="gap-2 border-blue-300 text-blue-700 hover:bg-blue-50"
            onClick={handleConvertToVendorInvoice}
            disabled={!!converting || !canConvert}
            title={!canConvert ? "Confirm the purchase quotation before converting" : undefined}
          >
            {converting === "vendor-invoice" ? "Converting..." : "Convert to Vendor Invoice"}
          </Button>
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => setLocation(`/purchase-quotations/${id}/edit`)}
            disabled={(doc as any).status === "sent"}
            title={(doc as any).status === "sent" ? "Purchase quotation has been sent — editing is disabled" : undefined}
          >
            <Pencil className="h-4 w-4" />Edit
          </Button>
          {canManage && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="icon"><Trash2 className="h-4 w-4" /></Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Purchase Quotation?</AlertDialogTitle>
                  <AlertDialogDescription>This will permanently delete {doc.pqNumber}.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => deleteMutation.mutate({ id }, {
                    onSuccess: async () => {
                      qc.setQueryData(getListPurchaseQuotationsQueryKey(), (old: any) =>
                        Array.isArray(old) ? old.filter((d: any) => d.id !== id) : old,
                      );
                      await invalidateDocumentList(qc, "purchase-quotations");
                      toast({ title: "Deleted" });
                      setLocation("/purchase-quotations");
                    },
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
          <CardHeader><CardTitle className="text-base">Vendor</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div><span className="font-medium text-base">{doc.vendorName}</span></div>
            {doc.vendorAddress && <p className="text-muted-foreground whitespace-pre-line">{doc.vendorAddress}</p>}
            {doc.vendorContact && (
              <div className="text-sm">
                <span className="text-muted-foreground">Contact: </span>
                <span>{doc.vendorContact}</span>
              </div>
            )}
            {(doc as any).vendorContactEmail && (
              <div className="text-sm">
                <span className="text-muted-foreground">Email: </span>
                <a href={`mailto:${(doc as any).vendorContactEmail}`} className="text-primary hover:underline">
                  {(doc as any).vendorContactEmail}
                </a>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Purchase Quotation Details</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            {doc.paymentTerms && <div className="flex justify-between"><span className="text-muted-foreground">Payment Terms</span><span>{doc.paymentTerms}</span></div>}
            {doc.notes && <div><span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Notes</span><div className="mt-1 text-sm prose prose-sm max-w-none [&_p]:my-1 [&_ul]:pl-5 [&_ul]:my-1 [&_ol]:pl-5 [&_ol]:my-1 [&_li]:my-0.5" dangerouslySetInnerHTML={{ __html: (doc as any).notes || "" }} /></div>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b text-xs text-muted-foreground uppercase">
              <tr>
                <th className="px-6 py-3 text-left w-8">#</th>
                {hasQtPartNo && <th className="px-6 py-3 text-left whitespace-nowrap min-w-[140px]">Item / Part No.</th>}
                <th className="px-6 py-3 text-left">Description</th>
                <th className="px-6 py-3 text-right whitespace-nowrap">Qty</th>
                {hasQtUom && <th className="px-6 py-3 text-center whitespace-nowrap">UOM</th>}
                <th className="px-6 py-3 text-right whitespace-nowrap">Unit Price</th>
                {hasItemDiscount && <th className="px-6 py-3 text-right whitespace-nowrap">Disc %</th>}
                <th className="px-6 py-3 text-right whitespace-nowrap">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {(() => { let _n = 0; return items.map((item: any, i: number) => {
                if (item.type === "section") {
                  return (
                    <tr key={i} className="bg-muted/40 border-b">
                      <td colSpan={qtColCount} className={`px-6 py-2 font-semibold text-sm text-foreground prose prose-sm max-w-none [&_p]:my-0.5 [&_ul]:my-0.5 [&_ol]:my-0.5 ${item.sectionAlign === "center" ? "text-center" : "text-left"}`} dangerouslySetInnerHTML={{ __html: item.sectionLabel || "Section" }} />
                    </tr>
                  );
                }
                _n++;
                const isFocItem = !!(item as any).isFoc;
                const qtDisplayAmount = isFocItem
                  ? (Number(item.amount) > 0 ? Number(item.amount) : Number(item.qty) * Number(item.unitPrice) * (1 - (Number(item.discount) || 0) / 100))
                  : (Number(item.amount) || (Number(item.qty) * Number(item.unitPrice)));
                return (
                  <tr key={i} className="hover:bg-muted/30">
                    <td className="px-6 py-3 text-muted-foreground align-top">{_n}</td>
                    {hasQtPartNo && <td className="px-6 py-3 text-muted-foreground align-top break-all">{item.partNumber || "—"}</td>}
                    <td className="px-6 py-3 font-medium align-top">
                      <div className="flex gap-3 items-start">
                        <div className="flex-1 min-w-0">
                          <div className="prose prose-sm max-w-none [&_p]:my-0 [&_ul]:my-0 [&_ol]:my-0" dangerouslySetInnerHTML={{ __html: item.description }} />
                          {isFocItem && <span className="inline-block mt-1 text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">FOC</span>}
                        </div>
                        {(item as any).itemImage && <img src={(item as any).itemImage} alt="" className="w-24 h-20 object-contain rounded border border-border flex-shrink-0" />}
                      </div>
                    </td>
                    <td className={`px-6 py-3 text-right align-top ${isFocItem ? "text-amber-600 font-medium" : ""}`}>{item.qty}</td>
                    {hasQtUom && <td className="px-6 py-3 text-center text-muted-foreground">{item.uom || "—"}</td>}
                    <td className={`px-6 py-3 text-right align-top ${isFocItem ? "text-amber-600 font-medium" : ""}`}>{fmt(Number(item.unitPrice) || 0)}</td>
                    {hasItemDiscount && <td className="px-6 py-3 text-right text-muted-foreground">{Number(item.discount) > 0 ? `${item.discount}%` : "—"}</td>}
                    <td className={`px-6 py-3 text-right align-top ${isFocItem ? "text-amber-600 font-medium" : ""}`}>{fmt(qtDisplayAmount)}</td>
                  </tr>
                );
              }); })()}
            </tbody>
          </table>
        </div>
        <div className="border-t p-6 flex justify-end bg-muted/10">
          <div className="w-72 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{fmt(subtotal)}</span></div>
            {discountAmt > 0 && <div className="flex justify-between text-red-600"><span>Discount{subtotal > 0 ? ` (${Math.round(discountAmt / subtotal * 1000) / 10}%)` : ""}</span><span>-{fmt(discountAmt)}</span></div>}
            {discountAmt > 0 && <div className="flex justify-between text-xs text-muted-foreground"><span>Net Amount</span><span>{fmt(subtotal - discountAmt)}</span></div>}
            <div className="flex justify-between"><span className="text-muted-foreground">GST</span><span>{fmt(tax)}</span></div>
            <div className="flex justify-between font-semibold text-base border-t pt-2"><span>Total</span><span>{fmt(total)}</span></div>
          </div>
        </div>
      </Card>

      <PdfPreviewModal
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        title={`Purchase Quotation ${doc.pqNumber}`}
        generatePdf={(opts) => generatePurchaseQuotation_PDF(
          doc,
          selectedCompany,
          {
            ...(docSettings as any),
            // Company quotation terms are reused for purchase quotation PDFs.
            quotationTerms: (doc as any).customerQuotationTerms || (docSettings as any)?.quotationTerms || "",
          },
          opts
        )}
        pdfFilename={`${doc.pqNumber}.pdf`}
        defaultEmailTo={(doc as any).vendorContactEmail || ""}
        defaultEmailSubject={`Purchase Quotation ${doc.pqNumber}`}
        defaultEmailBody={`Dear ${doc.vendorContact || "Sir/Madam"},\n\nPlease find attached our Purchase Quotation ${doc.pqNumber} for your consideration.\n\nDo not hesitate to contact us if you have any questions.\n\nThank you.`}
        docInfo={{
          docType: "Purchase Quotation",
          docNumber: doc.pqNumber,
          customerName: doc.vendorName,
          companyName: (selectedCompany as any)?.name || "RSV Infotech",
          items: ((doc.items as any[]) || []).filter((i: any) => i.type !== "section"),
          currency: (doc as any).currency || "SGD",
          totalAmount: Number(doc.totalAmount) || 0,
        }}
        onEdit={(doc as any).status === "sent" ? undefined : () => { setPreviewOpen(false); setLocation(`/purchase-quotations/${id}/edit`); }}
        onEmailSent={async (recipients) => {
          await fetch(`/api/purchase-quotations/${id}/mark-sent`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sentTo: recipients }) });
          await qc.invalidateQueries({ queryKey: getListPurchaseQuotationsQueryKey() });
          await refetch();
        }}
      />
    </div>
  );
}
