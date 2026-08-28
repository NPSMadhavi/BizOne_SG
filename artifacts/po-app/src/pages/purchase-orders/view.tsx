import { useGetPurchaseOrder, getGetPurchaseOrderQueryKey, getListPurchaseOrdersQueryKey, useDeletePurchaseOrder } from "@workspace/api-client-react";
import { useParams, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Trash2, Pencil, Calendar, MapPin, Building, CreditCard, Tag, Lock, Eye, ClipboardList, FileInput, ArrowUpRight, Users, Mail, CheckCircle2, TrendingUp, Copy } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { fmtDate } from "@/lib/utils";
import { generatePO_PDF } from "@/lib/pdf";
import { PdfPreviewModal } from "@/components/pdf-preview-modal";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

function shouldUseCompactPoHeader() {
  if (typeof window === "undefined") return false;
  const w = window.innerWidth;
  const dpr = window.devicePixelRatio || 1;
  // 150% Windows display scale shrinks CSS viewport; high DPR catches large monitors at 150%
  return w < 1700 || (dpr >= 1.35 && w < 2100);
}

function buildPurchaseOrderCopyPrefill(doc: any) {
  const poItems = (doc.items as any[]) ?? [];
  const sub = Number(doc.subtotal) || 0;
  const taxAmt = Number(doc.tax) || 0;
  const taxable = sub;
  const taxPct = taxable > 0 && taxAmt > 0
    ? Math.round((taxAmt / taxable) * 1000) / 10
    : 9;

  return {
    vendorName: doc.vendorName || "",
    vendorAddress: doc.vendorAddress || "",
    vendorContact: doc.vendorContact || "",
    vendorContactEmail: doc.vendorContactEmail || "",
    quoteRefNo: doc.quoteRefNo || "",
    deliveryAddress: doc.deliveryAddress || "",
    deliveryDate: doc.deliveryDate || "",
    paymentTerms: doc.paymentTerms || "30 Days Net",
    notes: doc.notes || "",
    currency: doc.currency || "SGD",
    customerId: doc.customerId ?? null,
    customerName: doc.customerName || "",
    customerPoRef: doc.customerPoRef || "",
    tax: taxPct,
    sourcePoNumber: doc.poNumber,
    items: poItems.map((it: any) => ({
      type: it.type || "item",
      sectionLabel: it.sectionLabel || "",
      sectionAlign: it.sectionAlign || "left",
      partNumber: it.partNumber || "",
      uom: it.uom || "",
      description: it.description || "",
      qty: Number(it.qty) || 1,
      unitPrice: Number(it.unitPrice) || 0,
      itemImage: it.itemImage || "",
    })),
  };
}

export default function PurchaseOrderView() {
  const params = useParams();
  const id = Number(params.id);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { selectedCompany, canManage } = useAuth();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [compactHeader, setCompactHeader] = useState(shouldUseCompactPoHeader);

  useEffect(() => {
    const update = () => setCompactHeader(shouldUseCompactPoHeader());
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const queryClient = useQueryClient();

  const { data: po, isLoading, refetch: refetchPO } = useGetPurchaseOrder(id, {
    query: { queryKey: getGetPurchaseOrderQueryKey(id), enabled: !!id }
  });

  const { data: grns } = useQuery<any[]>({
    queryKey: ["grns"],
    queryFn: async () => {
      const res = await fetch("/api/grn", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!po && ["confirmed", "sent"].includes(po.status),
  });
  const linkedGrn = grns?.find((g: any) => g.poId === id);

  const { data: linkedPIs = [] } = useQuery<any[]>({
    queryKey: ["vendor-invoices-po", id],
    queryFn: async () => {
      const res = await fetch(`/api/vendor-invoices?poId=${id}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!po && ["confirmed", "sent"].includes(po.status),
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

  const getStatusBadge = (status: string, compact = false) => {
    const size = compact ? "text-xs py-0 px-1.5" : "text-sm py-1";
    switch (status) {
      case 'confirmed': return <Badge variant="default" className={`bg-emerald-600 hover:bg-emerald-700 ${size}`}>Confirmed</Badge>;
      case 'draft': return <Badge variant="secondary" className={size}>Draft</Badge>;
      case 'cancelled': return <Badge variant="destructive" className={size}>Cancelled</Badge>;
      case 'sent': return <Badge className={`bg-violet-600 hover:bg-violet-700 ${size}`}>Sent</Badge>;
      default: return <Badge variant="outline" className={size}>{status}</Badge>;
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

  const handleCopyToNew = () => {
    if (!po) return;
    (window as any).__vedaPrefill = buildPurchaseOrderCopyPrefill(po);
    setLocation("/purchase-orders/new");
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

  const allActionButtons = (compact = false) => {
    const btnClass = compact ? "gap-2 px-3 text-sm h-9 shrink-0" : "gap-2 shrink-0";
    const iconClass = "h-4 w-4";

    return (
    <>
      {linkedGrn ? (
        <Button
          variant="outline"
          className={`${btnClass} border-emerald-300 text-emerald-700 hover:bg-emerald-50`}
          onClick={() => setLocation(`/grn/${linkedGrn.id}`)}
        >
          <ClipboardList className={iconClass} />
          {linkedGrn.grnNumber}
        </Button>
      ) : ["confirmed", "sent"].includes(po.status) && (
        <Button
          variant="outline"
          className={`${btnClass} border-amber-300 text-amber-700 hover:bg-amber-50`}
          onClick={() => createGrnMutation.mutate()}
          disabled={createGrnMutation.isPending}
        >
          <ClipboardList className={iconClass} />
          {createGrnMutation.isPending ? "Creating..." : "GRN"}
        </Button>
      )}
      {["confirmed", "sent"].includes(po.status) && (
        <Button
          variant="outline"
          className={`${btnClass} border-blue-300 text-blue-700 hover:bg-blue-50`}
          title="Vendor Invoice"
          onClick={() => setLocation(
            `/vendor-invoices/new?poId=${id}&poNumber=${encodeURIComponent(po.poNumber)}&vendorName=${encodeURIComponent(po.vendorName)}&amount=${po.totalAmount}&currency=${encodeURIComponent((po as any).currency || "SGD")}`
          )}
        >
          <FileInput className={iconClass} />
          Vendor Invoice
        </Button>
      )}
      <Button variant="outline" className={btnClass} onClick={() => setLocation(`/purchase-orders/${id}/edit`)}>
        <Pencil className={iconClass} />
        Edit
      </Button>
      <Button variant="outline" className={btnClass} title="Copy to New PO" onClick={handleCopyToNew}>
        <Copy className={iconClass} />
        Copy to New PO
      </Button>
      <Button variant="outline" className={btnClass} onClick={() => setPreviewOpen(true)}>
        <Eye className={iconClass} />
        Preview
      </Button>
      {canManage && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="icon" className={compact ? "h-9 w-9 shrink-0" : "shrink-0"}>
              <Trash2 className={iconClass} />
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
    </>
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {compactHeader ? (
        /* 150% scale — two lines */
        <div className="space-y-2 min-w-0">
          <div className="flex items-start gap-2 min-w-0">
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 mt-0.5" onClick={() => setLocation("/purchase-orders")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex flex-col gap-0.5 min-w-0">
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                <h1 className="text-lg font-bold tracking-tight text-[#2563EB] leading-tight shrink-0">{po.poNumber}</h1>
                {getStatusBadge(po.status, true)}
                {(po as any).isPrivate && (
                  <Badge variant="outline" className="gap-0.5 text-muted-foreground text-xs py-0 px-1.5 shrink-0">
                    <Lock className="h-3 w-3" />
                    Private
                  </Badge>
                )}
                {(po as any).emailSentTo && (
                  <div className="flex items-center gap-1 text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5 shrink-0 max-w-[200px]">
                    <Mail className="h-3 w-3 shrink-0" />
                    <span className="truncate">Emailed to: {(po as any).emailSentTo}</span>
                  </div>
                )}
                {(po as any).ackAt && (
                  <div className="flex items-center gap-1 text-[10px] text-violet-700 bg-violet-50 border border-violet-200 rounded px-1.5 py-0.5 shrink-0 max-w-[120px]">
                    <CheckCircle2 className="h-3 w-3 shrink-0" />
                    <span className="truncate">Acknowledged</span>
                  </div>
                )}
              </div>
              <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                Created on {fmtDate(po.createdAt)}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {allActionButtons(true)}
          </div>
        </div>
      ) : (
        /* 100% scale — one line */
        <div className="flex items-start gap-3 min-w-0 w-full">
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 mt-1" onClick={() => setLocation("/purchase-orders")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex flex-col gap-1 min-w-0 shrink-0">
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              <h1 className="text-3xl font-bold tracking-tight text-[#2563EB] leading-tight shrink-0">{po.poNumber}</h1>
              {getStatusBadge(po.status)}
              {(po as any).isPrivate && (
                <Badge variant="outline" className="gap-1 text-muted-foreground shrink-0">
                  <Lock className="h-3 w-3" />
                  Private
                </Badge>
              )}
              {(po as any).emailSentTo && (
                <div className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-2.5 py-1 shrink-0">
                  <Mail className="h-3 w-3 shrink-0" />
                  <span>Emailed to: {(po as any).emailSentTo}</span>
                </div>
              )}
              {(po as any).ackAt && (
                <div className="flex items-center gap-1.5 text-xs text-violet-700 bg-violet-50 border border-violet-200 rounded-md px-2.5 py-1 shrink-0">
                  <CheckCircle2 className="h-3 w-3 shrink-0" />
                  <span>Supplier acknowledged: {(po as any).ackNote} — {fmtDate((po as any).ackAt)}</span>
                </div>
              )}
            </div>
            <span className="text-sm text-muted-foreground whitespace-nowrap">
              Created on {fmtDate(po.createdAt)}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap ml-auto shrink-0 self-center">
            {allActionButtons(false)}
          </div>
        </div>
      )}

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
                <th className="px-6 py-3 font-medium whitespace-nowrap min-w-[140px]">Item / Part Number</th>
                <th className="px-6 py-3 font-medium">Description</th>
                <th className="px-6 py-3 font-medium text-center whitespace-nowrap">Qty</th>
                {hasPOUom && <th className="px-6 py-3 font-medium text-center whitespace-nowrap">UOM</th>}
                <th className="px-6 py-3 font-medium text-right whitespace-nowrap">Unit Price</th>
                <th className="px-6 py-3 font-medium text-right whitespace-nowrap">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y border-b">
              {(() => {
                let itemNo = 0;
                return (po.items as any[]).map((item: any, index: number) => {
                  if (item.type === "section") {
                    const colSpan = 6 + (hasPOUom ? 1 : 0);
                    return (
                      <tr key={index} className="bg-muted/30">
                        <td colSpan={colSpan} className={`px-6 py-2 font-semibold text-sm text-foreground ${item.sectionAlign === "center" ? "text-center" : "text-left"}`}>
                          {item.sectionLabel || ""}
                        </td>
                      </tr>
                    );
                  }
                  itemNo++;
                  return (
                    <tr key={index} className="bg-card">
                      <td className="px-6 py-4 text-center text-muted-foreground align-top">{itemNo}</td>
                      <td className="px-6 py-4 text-muted-foreground align-top break-all">{item.partNumber}</td>
                      <td className="px-6 py-4 text-muted-foreground align-top">
                        <div className="flex gap-3 items-start">
                          <div className="flex-1 min-w-0 prose prose-sm max-w-none [&_p]:my-0 [&_ul]:my-0 [&_ol]:my-0" dangerouslySetInnerHTML={{ __html: item.description }} />
                          {item.itemImage && <img src={item.itemImage} alt="" className="w-24 h-20 object-contain rounded border border-border flex-shrink-0" />}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center font-medium align-top">{item.qty}</td>
                      {hasPOUom && <td className="px-6 py-4 text-center text-muted-foreground align-top">{item.uom || "—"}</td>}
                      <td className="px-6 py-4 text-right text-muted-foreground align-top">{formatCurrency(item.unitPrice)}</td>
                      <td className="px-6 py-4 text-right font-medium align-top">{formatCurrency(item.amount)}</td>
                    </tr>
                  );
                });
              })()}
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

      {["confirmed", "sent"].includes(po.status) && (() => {
        const totalInvoiced = linkedPIs.reduce((sum: number, pi: any) => sum + Number(pi.totalAmount || 0), 0);
        const poTotal = Number(po.totalAmount) || 0;
        const remaining = poTotal - totalInvoiced;
        const pct = poTotal > 0 ? Math.min(100, Math.round((totalInvoiced / poTotal) * 100)) : 0;
        const fmtSGD = (v: number) =>
          new Intl.NumberFormat("en-SG", { style: "currency", currency: (po as any).currency || "SGD" }).format(v);

        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-base">
                <span className="flex items-center gap-2">
                  <FileInput className="h-4 w-4 text-muted-foreground" />
                  Vendor Invoices
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-blue-700 border-blue-300 hover:bg-blue-50"
                  onClick={() => {
                    const q = new URLSearchParams({
                      poId: String(id),
                      poNumber: po.poNumber || "",
                      vendorName: po.vendorName || "",
                      amount: String(Math.max(0, remaining)),
                      currency: (po as any).currency || "SGD",
                    });
                    setLocation(`/vendor-invoices/new?${q.toString()}`);
                  }}
                >
                  <FileInput className="h-3.5 w-3.5" />
                  Record PI
                </Button>
              </CardTitle>
            </CardHeader>

            {/* Progress / Summary */}
            <div className="px-6 pb-4 space-y-3">
              <div className="flex items-end justify-between text-sm">
                <div>
                  <span className="text-muted-foreground">Invoiced </span>
                  <span className="font-semibold text-foreground">{fmtSGD(totalInvoiced)}</span>
                  <span className="text-muted-foreground"> of </span>
                  <span className="font-semibold text-foreground">{fmtSGD(poTotal)}</span>
                  <span className="ml-2 text-xs text-muted-foreground">({pct}%)</span>
                </div>
                <div className="text-right">
                  <div className="text-xs text-muted-foreground mb-0.5">Remaining to invoice</div>
                  <div className={`text-base font-bold ${remaining > 0 ? "text-orange-600" : "text-emerald-600"}`}>
                    {fmtSGD(remaining)}
                  </div>
                </div>
              </div>
              <Progress
                value={pct}
                className="h-2"
              />
              {remaining <= 0 && totalInvoiced > 0 && (
                <div className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-2.5 py-1 w-fit">
                  <TrendingUp className="h-3 w-3" />
                  Fully invoiced
                </div>
              )}
            </div>

            {linkedPIs.length > 0 ? (
              <div className="overflow-x-auto border-t">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b">
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
                        <tr key={pi.id} className="bg-card hover:bg-muted/30 cursor-pointer" onClick={() => setLocation(`/vendor-invoices/${pi.id}`)}>
                          <td className="px-4 py-2.5 font-medium font-mono">{pi.piNumber}</td>
                          <td className="px-4 py-2.5 text-muted-foreground">{pi.piDate ? fmtDate(pi.piDate) : "—"}</td>
                          <td className="px-4 py-2.5 text-right font-medium">{fmtSGD(pi.totalAmount)}</td>
                          <td className="px-4 py-2.5 text-right text-emerald-600">{fmtSGD(pi.paidAmount)}</td>
                          <td className="px-4 py-2.5 text-right font-medium text-orange-600">{fmtSGD(pi.balance)}</td>
                          <td className="px-4 py-2.5">
                            {piStatus === "paid"
                              ? <Badge className="bg-emerald-600 hover:bg-emerald-700">Paid</Badge>
                              : piStatus === "partial"
                              ? <Badge className="bg-amber-500 hover:bg-amber-600 text-white">Partial</Badge>
                              : <Badge variant="outline" className="text-orange-600 border-orange-300">Pending</Badge>}
                          </td>
                          <td className="px-4 py-2.5">
                            <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="px-6 pb-6 text-sm text-muted-foreground italic border-t pt-4">
                No vendor invoices recorded yet.
              </div>
            )}
          </Card>
        );
      })()}

      <PdfPreviewModal
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        title={`Purchase Order ${po.poNumber}`}
        generatePdf={(opts) => generatePO_PDF(po, selectedCompany, opts)}
        pdfFilename={`${po.poNumber}.pdf`}
        defaultEmailTo={(po as any).vendorContactEmail || ""}
        defaultEmailSubject={`${po.poNumber} for ${po.vendorName} | ${(selectedCompany as any)?.name || "RSV Infotech"}`}
        defaultEmailBody={`Dear ${po.vendorContact || "Sir/Madam"},\n\nPlease find attached our Purchase Order ${po.poNumber}.\n\nKindly acknowledge receipt and confirm acceptance.\n\nThank you.`}
        docInfo={{
          docType: "Purchase Order",
          docNumber: po.poNumber,
          customerName: po.vendorName,
          companyName: (selectedCompany as any)?.name || "RSV Infotech",
          items: ((po.items as any[]) || []).filter((i: any) => i.type !== "section"),
          currency: (po as any).currency || "SGD",
          totalAmount: Number(po.totalAmount) || 0,
        }}
        onEdit={() => { setPreviewOpen(false); setLocation(`/purchase-orders/${id}/edit`); }}
        poId={po.id}
        onEmailSent={async (recipients) => {
          await fetch(`/api/purchase-orders/${id}/mark-sent`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sentTo: recipients }) });
          await queryClient.invalidateQueries({ queryKey: getListPurchaseOrdersQueryKey() });
          await refetchPO();
        }}
      />
    </div>
  );
}
