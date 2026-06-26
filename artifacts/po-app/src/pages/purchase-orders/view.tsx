import { useGetPurchaseOrder, getGetPurchaseOrderQueryKey, useDeletePurchaseOrder } from "@workspace/api-client-react";
import { useParams, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Trash2, Pencil, Calendar, MapPin, Building, CreditCard, Tag, Lock, Eye, ClipboardList, FileInput, ArrowUpRight, Users } from "lucide-react";
import { fmtDate } from "@/lib/utils";
import { generatePO_PDF } from "@/lib/pdf";
import { PdfPreviewModal } from "@/components/pdf-preview-modal";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import NewVendorInvoiceDialog from "@/pages/vendor-invoices/new-dialog";

export default function PurchaseOrderView() {
  const params = useParams();
  const id = Number(params.id);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { selectedCompany, isAdmin } = useAuth();
  const [previewOpen, setPreviewOpen] = useState(false);

  const queryClient = useQueryClient();

  const { data: po, isLoading, refetch: refetchPO } = useGetPurchaseOrder(id, {
    query: { queryKey: getGetPurchaseOrderQueryKey(id), enabled: !!id }
  });

  const [piDialogOpen, setPiDialogOpen] = useState(false);

  const { data: grns } = useQuery<any[]>({
    queryKey: ["grns"],
    queryFn: async () => {
      const res = await fetch("/api/grn", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!po && po.status === "confirmed",
  });
  const linkedGrn = grns?.find((g: any) => g.poId === id);

  const { data: linkedPIs = [], refetch: refetchPIs } = useQuery<any[]>({
    queryKey: ["vendor-invoices-po", id],
    queryFn: async () => {
      const res = await fetch(`/api/vendor-invoices?poId=${id}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!po && po.status === "confirmed",
  });

  const createGrnMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/grn/from-po/${id}`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create GRN");
      }
      return res.json();
    },
    onSuccess: (grn: any) => {
      queryClient.invalidateQueries({ queryKey: ["grns"] });
      toast({ title: "GRN Created", description: `${grn.grnNumber} has been created.` });
      setLocation(`/grn/${grn.id}`);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useDeletePurchaseOrder();

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-SG', { style: 'currency', currency: (po as any)?.currency || 'SGD' }).format(value);

  const hasPOUom = !!(po && (po.items as any[]).some((item: any) => item.uom && String(item.uom).trim() !== ""));

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'confirmed': return <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-700 text-sm py-1">Confirmed</Badge>;
      case 'draft': return <Badge variant="secondary" className="text-sm py-1">Draft</Badge>;
      case 'cancelled': return <Badge variant="destructive" className="text-sm py-1">Cancelled</Badge>;
      default: return <Badge variant="outline" className="text-sm py-1">{status}</Badge>;
    }
  };

  const handleDelete = () => {
    deleteMutation.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Success", description: "Purchase order deleted." });
        setLocation("/purchase-orders");
      },
      onError: (err: any) => {
        toast({ title: "Error", description: err.message || "Failed to delete", variant: "destructive" });
      }
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  if (!po) return <div>Purchase order not found.</div>;

  const formatDeliveryDate = (d: string) => fmtDate(d);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/purchase-orders")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl font-bold tracking-tight">{po.poNumber}</h1>
            {getStatusBadge(po.status)}
            {(po as any).isPrivate && (
              <Badge variant="outline" className="gap-1 text-muted-foreground">
                <Lock className="h-3 w-3" />
                Private
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground mt-1">
            Created on {fmtDate(po.createdAt)}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {linkedGrn ? (
            <Button
              variant="outline"
              className="gap-2 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
              onClick={() => setLocation(`/grn/${linkedGrn.id}`)}
            >
              <ClipboardList className="h-4 w-4" />
              {linkedGrn.grnNumber}
            </Button>
          ) : po.status === "confirmed" && (
            <Button
              variant="outline"
              className="gap-2 border-amber-300 text-amber-700 hover:bg-amber-50"
              onClick={() => createGrnMutation.mutate()}
              disabled={createGrnMutation.isPending}
            >
              <ClipboardList className="h-4 w-4" />
              {createGrnMutation.isPending ? "Creating..." : "Create GRN"}
            </Button>
          )}
          {po.status === "confirmed" && (
            <Button
              variant="outline"
              className="gap-2 border-blue-300 text-blue-700 hover:bg-blue-50"
              onClick={() => setPiDialogOpen(true)}
            >
              <FileInput className="h-4 w-4" />
              Record Vendor PI
            </Button>
          )}
          <Button variant="outline" className="gap-2" onClick={() => setLocation(`/purchase-orders/${id}/edit`)}>
            <Pencil className="h-4 w-4" />
            Edit
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => setPreviewOpen(true)}>
            <Eye className="h-4 w-4" />
            Preview
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
                  <AlertDialogTitle>Delete Purchase Order?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete the purchase order {po.poNumber}.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Building className="h-5 w-5 text-muted-foreground" />
              Vendor Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="font-semibold text-base">{po.vendorName}</div>
              <div className="text-sm text-muted-foreground whitespace-pre-wrap mt-1">
                {po.vendorAddress || "No address provided"}
              </div>
            </div>
            {po.vendorContact && (
              <div className="text-sm">
                <span className="text-muted-foreground">Contact: </span>
                <span className="font-medium">{po.vendorContact}</span>
              </div>
            )}
            {(po as any).vendorContactEmail && (
              <div className="text-sm">
                <span className="text-muted-foreground">Email: </span>
                <a href={`mailto:${(po as any).vendorContactEmail}`} className="font-medium text-primary hover:underline">
                  {(po as any).vendorContactEmail}
                </a>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Tag className="h-5 w-5 text-muted-foreground" />
              Order Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {(po as any).customerName && (
              <div className="flex items-center gap-3">
                <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <span className="text-sm font-medium">Customer: </span>
                  <span className="text-sm text-muted-foreground">{(po as any).customerName}</span>
                </div>
              </div>
            )}
            {(po as any).customerPoRef && (
              <div className="flex items-center gap-3">
                <Tag className="h-4 w-4 text-blue-400 shrink-0" />
                <div>
                  <span className="text-sm font-medium">Customer PO Ref: </span>
                  <span className="text-sm text-muted-foreground font-mono">{(po as any).customerPoRef}</span>
                </div>
              </div>
            )}
            {(po as any).quoteRefNo && (
              <div className="flex items-center gap-3">
                <Tag className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <span className="text-sm font-medium">Sales Quote Ref: </span>
                  <span className="text-sm text-muted-foreground">{(po as any).quoteRefNo}</span>
                </div>
              </div>
            )}
            <div className="flex items-start gap-3">
              <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <div className="text-sm font-medium">Delivery Address</div>
                <div className="text-sm text-muted-foreground mt-0.5 whitespace-pre-wrap">
                  {po.deliveryAddress || "RSV Infotech Office"}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
              <div>
                <span className="text-sm font-medium">Delivery Date: </span>
                <span className="text-sm text-muted-foreground">{formatDeliveryDate(po.deliveryDate || "")}</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <CreditCard className="h-4 w-4 text-muted-foreground shrink-0" />
              <div>
                <span className="text-sm font-medium">Payment Terms: </span>
                <span className="text-sm text-muted-foreground">{po.paymentTerms || "Standard"}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Line Items</CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-y">
              <tr>
                <th className="px-6 py-3 font-medium w-12 text-center">#</th>
                <th className="px-6 py-3 font-medium">Item / Part Number</th>
                <th className="px-6 py-3 font-medium">Description</th>
                <th className="px-6 py-3 font-medium text-center">Qty</th>
                {hasPOUom && <th className="px-6 py-3 font-medium text-center">UOM</th>}
                <th className="px-6 py-3 font-medium text-right">Unit Price</th>
                <th className="px-6 py-3 font-medium text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y border-b">
              {po.items.map((item, index) => (
                <tr key={index} className="bg-card">
                  <td className="px-6 py-4 text-center text-muted-foreground">{index + 1}</td>
                  <td className="px-6 py-4 font-medium">{item.partNumber}</td>
                  <td className="px-6 py-4 text-muted-foreground">
                    <div className="flex gap-3 items-start">
                      <div className="flex-1 min-w-0 prose prose-sm max-w-none [&_p]:my-0 [&_ul]:my-0 [&_ol]:my-0" dangerouslySetInnerHTML={{ __html: item.description }} />
                      {(item as any).itemImage && <img src={(item as any).itemImage} alt="" className="w-24 h-20 object-contain rounded border border-border flex-shrink-0" />}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center font-medium">{item.qty}</td>
                  {hasPOUom && <td className="px-6 py-4 text-center text-muted-foreground">{(item as any).uom || "—"}</td>}
                  <td className="px-6 py-4 text-right text-muted-foreground">{formatCurrency(item.unitPrice)}</td>
                  <td className="px-6 py-4 text-right font-medium">{formatCurrency(item.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="p-6 bg-muted/20">
          <div className="flex justify-end">
            <div className="w-64 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-medium">{formatCurrency(po.subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Tax</span>
                <span className="font-medium">{formatCurrency(po.totalAmount - po.subtotal)}</span>
              </div>
              <div className="h-px bg-border my-2" />
              <div className="flex justify-between text-lg font-bold text-primary">
                <span>Total Amount</span>
                <span>{formatCurrency(po.totalAmount)}</span>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {po.notes && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Notes</CardTitle></CardHeader>
          <CardContent>
            <div className="text-sm text-muted-foreground prose prose-sm max-w-none [&_p]:my-1 [&_ul]:pl-5 [&_ul]:my-1 [&_ol]:pl-5 [&_ol]:my-1 [&_li]:my-0.5" dangerouslySetInnerHTML={{ __html: (po as any).notes || "" }} />
          </CardContent>
        </Card>
      )}

      {po.status === "confirmed" && linkedPIs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                <FileInput className="h-4 w-4 text-muted-foreground" />
                Vendor Purchase Invoices
              </span>
              <Button variant="outline" size="sm" className="gap-1.5 text-blue-700 border-blue-300 hover:bg-blue-50" onClick={() => setPiDialogOpen(true)}>
                <FileInput className="h-3.5 w-3.5" />
                Add PI
              </Button>
            </CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-y">
                <tr>
                  <th className="px-4 py-2 font-medium">Vendor PI #</th>
                  <th className="px-4 py-2 font-medium">PI Date</th>
                  <th className="px-4 py-2 font-medium text-right">PI Amount</th>
                  <th className="px-4 py-2 font-medium text-right">Paid</th>
                  <th className="px-4 py-2 font-medium text-right">Balance</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {linkedPIs.map((pi: any) => {
                  const piStatus = pi.status;
                  return (
                    <tr key={pi.id} className="bg-card">
                      <td className="px-4 py-2 font-medium font-mono">{pi.piNumber}</td>
                      <td className="px-4 py-2 text-muted-foreground">{pi.piDate ? fmtDate(pi.piDate) : "—"}</td>
                      <td className="px-4 py-2 text-right">{formatCurrency(pi.totalAmount)}</td>
                      <td className="px-4 py-2 text-right text-emerald-600">{formatCurrency(pi.paidAmount)}</td>
                      <td className="px-4 py-2 text-right font-medium text-orange-600">{formatCurrency(pi.balance)}</td>
                      <td className="px-4 py-2">
                        {piStatus === "paid" ? <Badge className="bg-emerald-600 hover:bg-emerald-700">Paid</Badge>
                          : piStatus === "partial" ? <Badge className="bg-amber-500 hover:bg-amber-600 text-white">Partial</Badge>
                          : <Badge variant="outline" className="text-orange-600 border-orange-300">Pending</Badge>}
                      </td>
                      <td className="px-4 py-2">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setLocation(`/vendor-invoices/${pi.id}`)}>
                          <ArrowUpRight className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <NewVendorInvoiceDialog
        open={piDialogOpen}
        onOpenChange={setPiDialogOpen}
        prefillPoId={id}
        prefillPoNumber={(po as any).poNumber}
        prefillVendorName={po.vendorName}
        prefillAmount={po.totalAmount}
        prefillCurrency={(po as any).currency}
        onCreated={() => refetchPIs()}
      />

      <PdfPreviewModal
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        title={`Purchase Order ${po.poNumber}`}
        generatePdf={(opts) => generatePO_PDF(po, selectedCompany, opts)}
        pdfFilename={`${po.poNumber}.pdf`}
        defaultEmailTo={(po as any).vendorContactEmail || ""}
        defaultEmailSubject={`Purchase Order ${po.poNumber}`}
        defaultEmailBody={`Dear ${po.vendorContact || "Sir/Madam"},\n\nPlease find attached our Purchase Order ${po.poNumber}${(po as any).quoteRefNo ? ` with the sales reference number ${(po as any).quoteRefNo}` : ""}.\n\nKindly acknowledge receipt and confirm acceptance.\n\nThank you.`}
        onEdit={() => { setPreviewOpen(false); setLocation(`/purchase-orders/${id}/edit`); }}
        onEmailSent={async (recipients) => {
          await fetch(`/api/purchase-orders/${id}/mark-sent`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sentTo: recipients }) });
          await refetchPO();
        }}
      />
    </div>
  );
}
