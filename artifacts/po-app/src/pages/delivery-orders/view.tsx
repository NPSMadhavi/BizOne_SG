import { useGetDeliveryOrder, getGetDeliveryOrderQueryKey, useDeleteDeliveryOrder } from "@workspace/api-client-react";
import { useParams, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Trash2, Pencil, Eye, Lock } from "lucide-react";
import { fmtDate } from "@/lib/utils";
import { generateDO_PDF } from "@/lib/pdf";
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
  return fmtDate(dateStr);
}

export default function DeliveryOrderView() {
  const params = useParams();
  const id = Number(params.id);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { selectedCompany, isAdmin } = useAuth();
  const [previewOpen, setPreviewOpen] = useState(false);

  const { data: doc, isLoading } = useGetDeliveryOrder(id, {
    query: { queryKey: getGetDeliveryOrderQueryKey(id), enabled: !!id },
  });

  const deleteMutation = useDeleteDeliveryOrder();

  const getStatusBadge = (s: string) => {
    switch (s) {
      case "confirmed": return <Badge className="bg-emerald-600 hover:bg-emerald-700 text-sm py-1">Confirmed</Badge>;
      case "draft": return <Badge variant="secondary" className="text-sm py-1">Draft</Badge>;
      case "cancelled": return <Badge variant="destructive" className="text-sm py-1">Cancelled</Badge>;
      default: return <Badge variant="outline" className="text-sm py-1">{s}</Badge>;
    }
  };

  if (isLoading) return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-48" />
      <div className="grid md:grid-cols-2 gap-6"><Skeleton className="h-48" /><Skeleton className="h-48" /></div>
      <Skeleton className="h-48" />
    </div>
  );

  if (!doc) return <div className="text-center py-20 text-muted-foreground">Delivery order not found.</div>;

  const items = (doc.items as any[]) || [];

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/delivery-orders")}><ArrowLeft className="h-4 w-4" /></Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">{doc.doNumber}</h1>
              {getStatusBadge(doc.status)}
            </div>
            <p className="text-muted-foreground text-sm mt-0.5">Created {fmtDate(doc.createdAt)}</p>
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
          <Button variant="outline" className="gap-2" onClick={() => setLocation(`/delivery-orders/${id}/edit`)}>
            <Pencil className="h-4 w-4" />Edit
          </Button>
          {isAdmin && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="icon"><Trash2 className="h-4 w-4" /></Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Delivery Order?</AlertDialogTitle>
                  <AlertDialogDescription>This will permanently delete {doc.doNumber}.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => deleteMutation.mutate({ id }, {
                    onSuccess: () => { toast({ title: "Deleted" }); setLocation("/delivery-orders"); },
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
          <CardHeader><CardTitle className="text-base">Deliver To</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div><span className="font-medium text-base">{doc.customerName}</span></div>
            {doc.customerAddress && <p className="text-muted-foreground whitespace-pre-line">{doc.customerAddress}</p>}
            {doc.customerContact && <p className="text-muted-foreground">{doc.customerContact}</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Delivery Details</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            {doc.deliveryDate && <div className="flex justify-between"><span className="text-muted-foreground">Delivery Date</span><span>{isoToReadable(doc.deliveryDate)}</span></div>}
            {(doc as any).paymentTerms && <div className="flex justify-between"><span className="text-muted-foreground">Payment Terms</span><span>{(doc as any).paymentTerms}</span></div>}
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
                {items.some((item: any) => item.partNumber) && <th className="px-6 py-3 text-left w-32">Item No.</th>}
                <th className="px-6 py-3 text-left">Description</th>
                <th className="px-6 py-3 text-right w-24">Qty</th>
                {items.some((item: any) => item.uom && String(item.uom).trim() !== "") && <th className="px-6 py-3 text-center w-16">UOM</th>}
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((item: any, i: number) => (
                <tr key={i} className="hover:bg-muted/30">
                  <td className="px-6 py-3 text-muted-foreground">{i + 1}</td>
                  {items.some((it: any) => it.partNumber) && <td className="px-6 py-3 font-mono text-xs text-muted-foreground">{item.partNumber || "—"}</td>}
                  <td className="px-6 py-3 font-medium">
                    <div className="flex gap-3 items-start">
                      <div className="flex-1 min-w-0" dangerouslySetInnerHTML={{ __html: item.description }} />
                      {(item as any).itemImage && <img src={(item as any).itemImage} alt="" className="w-24 h-20 object-contain rounded border border-border flex-shrink-0" />}
                    </div>
                  </td>
                  <td className="px-6 py-3 text-right">{item.qty}</td>
                  {items.some((it: any) => it.uom && String(it.uom).trim() !== "") && <td className="px-6 py-3 text-center text-muted-foreground">{item.uom || "—"}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <PdfPreviewModal
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        title={`Delivery Order ${doc.doNumber}`}
        generatePdf={(opts) => generateDO_PDF(doc, selectedCompany, opts)}
        pdfFilename={`${doc.doNumber}.pdf`}
        defaultEmailTo=""
        defaultEmailSubject={`Delivery Order ${doc.doNumber}`}
        defaultEmailBody={`Dear ${doc.customerContact || "Sir/Madam"},\n\nPlease find attached Delivery Order ${doc.doNumber}.\n\nThank you.`}
        onEdit={() => { setPreviewOpen(false); setLocation(`/delivery-orders/${id}/edit`); }}
      />
    </div>
  );
}
