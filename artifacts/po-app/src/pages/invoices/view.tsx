import { useGetInvoice, getGetInvoiceQueryKey, getListInvoicesQueryKey, useVoidInvoice, useKnockOffInvoice, useGetSettings, getGetSettingsQueryKey } from "@workspace/api-client-react";
import { useParams, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Pencil, Eye, Lock, Ban, CheckCircle2, Trash2, Plus, DollarSign, Loader2, Mail } from "lucide-react";
import { fmtDate, cn } from "@/lib/utils";
import { generateInvoice_PDF } from "@/lib/pdf";
import { generateInvoicePdfSmart, listInvoiceReportTemplates } from "@/lib/report-designer/api";
import { PdfPreviewModal } from "@/components/pdf-preview-modal";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { invalidateInventoryQueries } from "@/lib/invalidate-inventory";
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

const PAYMENT_METHODS = [
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "cheque",        label: "Cheque" },
  { value: "cash",          label: "Cash" },
  { value: "paynow",        label: "PayNow / PayLah" },
  { value: "swift",         label: "SWIFT / TT" },
  { value: "credit_card",   label: "Credit Card" },
  { value: "other",         label: "Other" },
];

function methodLabel(val: string) {
  return PAYMENT_METHODS.find(m => m.value === val)?.label ?? val;
}

export default function InvoiceView() {
  const params = useParams();
  const id = Number(params.id);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { selectedCompany, canManage } = useAuth();
  const qc = useQueryClient();

  const [previewOpen, setPreviewOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("active");
  const [voidDialogOpen, setVoidDialogOpen] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [voidSubmitting, setVoidSubmitting] = useState(false);

  const [paymentOpen, setPaymentOpen] = useState(false);
  const [payDate, setPayDate] = useState(new Date().toISOString().split("T")[0]);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("bank_transfer");
  const [payRef, setPayRef] = useState("");
  const [payNotes, setPayNotes] = useState("");
  const [paySubmitting, setPaySubmitting] = useState(false);

  const [editPaymentOpen, setEditPaymentOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState<any>(null);
  const [epDate, setEpDate] = useState("");
  const [epAmount, setEpAmount] = useState("");
  const [epMethod, setEpMethod] = useState("bank_transfer");
  const [epRef, setEpRef] = useState("");
  const [epNotes, setEpNotes] = useState("");
  const [epSubmitting, setEpSubmitting] = useState(false);

  const { data: doc, isLoading, refetch } = useGetInvoice(id, {
    query: { queryKey: getGetInvoiceQueryKey(id), enabled: !!id },
  });

  const { data: reportTemplates = [] } = useQuery({
    queryKey: ["invoice-report-templates", selectedCompany?.id],
    queryFn: listInvoiceReportTemplates,
    enabled: !!selectedCompany?.id,
  });

  const { data: docSettings } = useGetSettings({
    query: { queryKey: getGetSettingsQueryKey() },
  });

  const voidMutation = useVoidInvoice();
  const knockOffMutation = useKnockOffInvoice();

  const fmt = (v: number) => new Intl.NumberFormat("en-SG", { style: "currency", currency: (doc as any)?.currency || "SGD" }).format(v);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getGetInvoiceQueryKey(id) });
    void invalidateInventoryQueries(qc);
    refetch();
  };

  const getStatusBadge = (s: string) => {
    switch (s) {
      case "confirmed": return <Badge className="bg-emerald-600 hover:bg-emerald-700 text-sm py-1">Confirmed</Badge>;
      case "sent":      return <Badge className="bg-violet-600 hover:bg-violet-700 text-sm py-1">Sent</Badge>;
      case "draft":     return <Badge variant="secondary" className="text-sm py-1">Draft</Badge>;
      case "cancelled": return <Badge variant="destructive" className="text-sm py-1">Cancelled</Badge>;
      case "void":      return <Badge className="bg-gray-500 hover:bg-gray-600 text-sm py-1">Void</Badge>;
      case "partial":   return <Badge className="bg-amber-500 hover:bg-amber-600 text-sm py-1">Partial</Badge>;
      case "paid":      return <Badge className="bg-blue-600 hover:bg-blue-700 text-sm py-1">Paid</Badge>;
      default:          return <Badge variant="outline" className="text-sm py-1">{s}</Badge>;
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
        invalidate();
      },
      onError: (err: any) => {
        toast({ title: "Error", description: err.message || "Failed to void invoice", variant: "destructive" });
      },
      onSettled: () => setVoidSubmitting(false),
    });
  };

  const openPaymentDialog = () => {
    const balance = (doc as any)?.balance ?? 0;
    setPayDate(new Date().toISOString().split("T")[0]);
    setPayAmount(balance > 0 ? balance.toFixed(2) : "");
    setPayMethod("bank_transfer");
    setPayRef("");
    setPayNotes("");
    setPaymentOpen(true);
  };

  const handleAddPayment = async () => {
    const amtNum = parseFloat(payAmount);
    if (isNaN(amtNum) || amtNum <= 0) {
      toast({ title: "Error", description: "Enter a valid payment amount", variant: "destructive" }); return;
    }
    setPaySubmitting(true);
    try {
      const res = await fetch(`/api/invoices/${id}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ paymentDate: payDate, amount: amtNum, reference: payRef || null, paymentMethod: payMethod, notes: payNotes || null }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || "Failed"); }
      toast({ title: "Payment Recorded", description: `${fmt(amtNum)} recorded.` });
      setPaymentOpen(false);
      invalidate();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setPaySubmitting(false);
    }
  };

  const openEditPayment = (p: any) => {
    setEditingPayment(p);
    setEpDate(p.paymentDate ? p.paymentDate.split("T")[0] : new Date().toISOString().split("T")[0]);
    setEpAmount(String(p.amount));
    setEpMethod(p.paymentMethod || "bank_transfer");
    setEpRef(p.reference || "");
    setEpNotes(p.notes || "");
    setEditPaymentOpen(true);
  };

  const handleEditPaymentSave = async () => {
    setEpSubmitting(true);
    try {
      const res = await fetch(`/api/invoices/${id}/payments/${editingPayment.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ paymentDate: epDate, amount: parseFloat(epAmount), reference: epRef || null, paymentMethod: epMethod, notes: epNotes || null }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || "Failed"); }
      toast({ title: "Payment Updated" });
      setEditPaymentOpen(false);
      invalidate();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setEpSubmitting(false);
    }
  };

  const handleDeletePayment = async (paymentId: number) => {
    try {
      const res = await fetch(`/api/invoices/${id}/payments/${paymentId}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Failed to delete payment");
      toast({ title: "Payment Deleted" });
      invalidate();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  if (isLoading) return (
    <div className="space-y-6">
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
  const regularItems = items.filter((item: any) => item.type !== "section");
  const hasItemDiscount = regularItems.some((item: any) => Number(item.discount) > 0);
  const hasPartNo = regularItems.some((item: any) => item.partNumber && String(item.partNumber).trim() !== "");
  const hasInvUom = regularItems.some((item: any) => item.uom && String(item.uom).trim() !== "");
  const totalViewCols = 3 + (hasPartNo ? 1 : 0) + (hasItemDiscount ? 1 : 0) + (hasInvUom ? 1 : 0) + 2;

  const payments: any[] = (doc as any).payments || [];
  const paidAmount: number = (doc as any).paidAmount ?? 0;
  const balance: number = (doc as any).balance ?? total;
  const progress = total > 0 ? Math.min(100, (paidAmount / total) * 100) : 0;

  const docStatus = (doc as any).status as string;
  const isVoided = docStatus === "void";
  const isPaid = docStatus === "paid";
  const isPartial = docStatus === "partial";
  const canVoid = !isVoided && !isPaid;
  const canKnockOff = !isVoided && !isPaid;
  const canRecordPayment = !isVoided && !isPaid && docStatus !== "draft";

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/invoices")}><ArrowLeft className="h-4 w-4" /></Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-[#2563EB]">{doc.invNumber}</h1>
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
        <div className="flex items-center gap-2 flex-wrap">
          {(doc as any).isPrivate && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground border rounded-md px-2 py-1">
              <Lock className="h-3 w-3" />Private
            </span>
          )}
          {reportTemplates.length > 0 && (
            <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
              <SelectTrigger className="w-[220px] h-9">
                <SelectValue placeholder="Use Active Template" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Use Active Template</SelectItem>
                {reportTemplates.map((tpl) => (
                  <SelectItem key={tpl.id} value={String(tpl.id)}>
                    {tpl.name}{tpl.isActive ? " (Active)" : tpl.isSystemTemplate ? " (System)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button variant="outline" className="gap-2" onClick={() => setPreviewOpen(true)}>
            <Eye className="h-4 w-4" />Preview
          </Button>
          {!isVoided && !isPaid && !isPartial && (
            <Button variant="outline" className="gap-2" onClick={() => setLocation(`/invoices/${id}/edit`)}>
              <Pencil className="h-4 w-4" />Edit
            </Button>
          )}
          {canRecordPayment && (
            <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={openPaymentDialog}>
              <Plus className="h-4 w-4" />Record Payment
            </Button>
          )}
          {canVoid && (
            <Button variant="outline" className="gap-2 border-orange-300 text-orange-700 hover:bg-orange-50" onClick={() => setVoidDialogOpen(true)}>
              <Ban className="h-4 w-4" />Void Invoice
            </Button>
          )}
          {canManage && doc.status === "draft" && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="gap-2 border-red-300 text-red-700 hover:bg-red-50">
                  <Trash2 className="h-4 w-4" />Delete Draft
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this draft invoice?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete draft invoice <strong>{doc.invNumber}</strong>. This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-red-600 hover:bg-red-700"
                    onClick={async () => {
                      try {
                        const res = await fetch(`/api/invoices/${id}`, { method: "DELETE", credentials: "include" });
                        const raw = await res.text();
                        let e: any = null;
                        try { e = raw ? JSON.parse(raw) : null; } catch { /* ignore */ }
                        if (!res.ok) {
                          // Stale page after invoice already gone — leave the view
                          if (res.status === 404) {
                            toast({ title: "Invoice already deleted." });
                            setLocation("/invoices");
                            return;
                          }
                          throw new Error(e?.error || "Failed");
                        }
                        toast({ title: "Invoice deleted." });
                        qc.invalidateQueries({ queryKey: getListInvoicesQueryKey() });
                        setLocation("/invoices");
                      } catch (err: any) {
                        toast({ title: "Error", description: err.message, variant: "destructive" });
                      }
                    }}
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
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
            {(doc as any).poRefNo && <div className="flex justify-between"><span className="text-muted-foreground">PO Reference</span><span className="font-mono">{(doc as any).poRefNo}</span></div>}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Sales Order</span>
              {(doc as any).soNumber ? (
                <button
                  type="button"
                  className="font-mono text-primary hover:underline"
                  onClick={() => (doc as any).soId && setLocation(`/sales-orders/${(doc as any).soId}`)}
                >
                  {(doc as any).soNumber}
                </button>
              ) : (
                <span className="font-mono text-muted-foreground">—</span>
              )}
            </div>
            {doc.deliveryDate && <div className="flex justify-between"><span className="text-muted-foreground">Delivery Date</span><span>{isoToReadable(doc.deliveryDate)}</span></div>}
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
                {hasPartNo && <th className="px-6 py-3 text-left whitespace-nowrap min-w-[140px]">Item / Part Number</th>}
                <th className="px-6 py-3 text-left">Description</th>
                <th className="px-6 py-3 text-right whitespace-nowrap">Qty</th>
                {hasInvUom && <th className="px-6 py-3 text-center whitespace-nowrap">UOM</th>}
                <th className="px-6 py-3 text-right whitespace-nowrap">Unit Price</th>
                {hasItemDiscount && <th className="px-6 py-3 text-right whitespace-nowrap">Disc %</th>}
                <th className="px-6 py-3 text-right whitespace-nowrap">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {(() => {
                let seq = 0;
                return items.map((item: any, i: number) => {
                  if (item.type === "section") {
                    return (
                      <tr key={i} className="bg-muted/40">
                        <td colSpan={totalViewCols} className={cn("px-6 py-2 font-semibold text-sm text-foreground prose prose-sm max-w-none [&_p]:my-0.5 [&_ul]:my-0.5 [&_ol]:my-0.5", item.sectionAlign === "center" ? "text-center" : "text-left")} dangerouslySetInnerHTML={{ __html: item.sectionLabel || "Section" }} />
                      </tr>
                    );
                  }
                  seq++;
                  const isFocItem = !!(item as any).isFoc;
                  const displayAmount = isFocItem
                    ? (Number(item.amount) > 0 ? Number(item.amount) : Number(item.qty) * Number(item.unitPrice) * (1 - (Number(item.discount) || 0) / 100))
                    : (Number(item.amount) || (Number(item.qty) * Number(item.unitPrice)));
                  return (
                    <tr key={i} className="hover:bg-muted/30">
                      <td className="px-6 py-3 text-muted-foreground align-top">{seq}</td>
                      {hasPartNo && <td className="px-6 py-3 text-muted-foreground align-top break-all">{item.partNumber || "—"}</td>}
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
                      {hasInvUom && <td className="px-6 py-3 text-center text-muted-foreground align-top">{item.uom || "—"}</td>}
                      <td className={`px-6 py-3 text-right align-top ${isFocItem ? "text-amber-600 font-medium" : ""}`}>{fmt(Number(item.unitPrice) || 0)}</td>
                      {hasItemDiscount && <td className="px-6 py-3 text-right text-muted-foreground align-top">{Number(item.discount) > 0 ? `${item.discount}%` : "—"}</td>}
                      <td className={`px-6 py-3 text-right align-top ${isFocItem ? "text-amber-600 font-medium" : ""}`}>{fmt(displayAmount)}</td>
                    </tr>
                  );
                });
              })()}
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

      {/* ── Payment Tracking Panel ── */}
      {doc.status !== "draft" && doc.status !== "void" && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-base">Payment Tracking</CardTitle>
              <span className="text-sm font-normal text-muted-foreground">{payments.length} payment{payments.length !== 1 ? "s" : ""}</span>
            </div>
            {canRecordPayment && (
              <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700" onClick={openPaymentDialog}>
                <Plus className="h-3.5 w-3.5" />Record Payment
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Summary row */}
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div className="bg-muted/40 rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground mb-1">Invoice Total</p>
                <p className="font-semibold">{fmt(total)}</p>
              </div>
              <div className="bg-emerald-50 rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground mb-1">Amount Received</p>
                <p className="font-semibold text-emerald-700">{fmt(paidAmount)}</p>
              </div>
              <div className={cn("rounded-lg p-3 text-center", balance > 0.004 ? "bg-amber-50" : "bg-blue-50")}>
                <p className="text-xs text-muted-foreground mb-1">Outstanding Balance</p>
                <p className={cn("font-semibold", balance > 0.004 ? "text-amber-700" : "text-blue-600")}>{fmt(balance)}</p>
              </div>
            </div>

            {total > 0 && (
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Payment Progress</span>
                  <span>{Math.round(progress)}%</span>
                </div>
                <Progress value={progress} className="h-2" />
              </div>
            )}

            {/* Payment history */}
            {payments.length > 0 ? (
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b text-xs text-muted-foreground uppercase">
                    <tr>
                      <th className="px-4 py-2.5 text-left">Date</th>
                      <th className="px-4 py-2.5 text-left">Method</th>
                      <th className="px-4 py-2.5 text-left">Reference</th>
                      <th className="px-4 py-2.5 text-right">Amount</th>
                      {canManage && <th className="px-4 py-2.5 text-right">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {payments.map((p: any) => (
                      <tr key={p.id} className="hover:bg-muted/20">
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{isoToReadable(p.paymentDate)}</td>
                        <td className="px-4 py-3">{methodLabel(p.paymentMethod || "bank_transfer")}</td>
                        <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{p.reference || "—"}</td>
                        <td className="px-4 py-3 text-right font-semibold text-emerald-700">{fmt(p.amount)}</td>
                        {canManage && (
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => openEditPayment(p)}>Edit</Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-50">Delete</Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete this payment?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      This will delete the {fmt(p.amount)} payment and reverse the accounting entry. Invoice status will be recalculated.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => handleDeletePayment(p.id)}>
                                      Delete
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-6 text-muted-foreground text-sm border rounded-lg bg-muted/20">
                No payments recorded yet.
                {canRecordPayment && <span className="block mt-1">Click <strong>Record Payment</strong> to log a receipt.</span>}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <PdfPreviewModal
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        title={`Invoice ${doc.invNumber}`}
        generatePdf={(opts) => generateInvoicePdfSmart(
          id,
          () => generateInvoice_PDF(doc, selectedCompany, docSettings as any, opts),
          {
            ...opts,
            filename: `${doc.invNumber}.pdf`,
            templateId: selectedTemplateId === "active" ? null : Number(selectedTemplateId),
          },
        )}
        pdfFilename={`${doc.invNumber}.pdf`}
        defaultEmailTo={(doc as any).customerContactEmail || ""}
        defaultEmailSubject={`Invoice ${doc.invNumber}`}
        defaultEmailBody={`Dear ${doc.customerContact || "Sir/Madam"},\n\nPlease find attached Invoice ${doc.invNumber} for your records.\n\nPlease arrange payment as per the agreed terms.\n\nThank you.`}
        docInfo={{
          docType: "Tax Invoice",
          docNumber: doc.invNumber,
          customerName: doc.customerName,
          companyName: (selectedCompany as any)?.name || "RSV Infotech",
          items: ((doc.items as any[]) || []).filter((i: any) => i.type !== "section"),
          currency: (doc as any).currency || "SGD",
          totalAmount: Number(doc.totalAmount) || 0,
        }}
        onEdit={() => { setPreviewOpen(false); setLocation(`/invoices/${id}/edit`); }}
        onEmailSent={async (recipients) => {
          await fetch(`/api/invoices/${id}/mark-sent`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sentTo: recipients }) });
          await qc.invalidateQueries({ queryKey: getListInvoicesQueryKey() });
          await qc.refetchQueries({ queryKey: getGetInvoiceQueryKey(id) });
        }}
      />

      {/* Record Payment Dialog */}
      <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Record Payment — {doc.invNumber}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Payment Date <span className="text-destructive">*</span></Label>
                <Input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Amount ({(doc as any).currency || "SGD"}) <span className="text-destructive">*</span></Label>
                <Input type="text" inputMode="decimal" placeholder="0.00" value={payAmount} onChange={e => setPayAmount(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Payment Method</Label>
              <Select value={payMethod} onValueChange={setPayMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Reference / Bank Ref</Label>
              <Input placeholder="e.g. CHQ0012345, UTR12345678" value={payRef} onChange={e => setPayRef(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea placeholder="Optional notes" rows={2} value={payNotes} onChange={e => setPayNotes(e.target.value)} />
            </div>
            <div className="flex justify-between text-sm text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
              <span>Outstanding balance</span>
              <span className="font-semibold text-amber-700">{fmt(balance)}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentOpen(false)}>Cancel</Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              disabled={paySubmitting || !payDate || !payAmount}
              onClick={handleAddPayment}
            >
              {paySubmitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</> : "Record Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Payment Dialog */}
      <Dialog open={editPaymentOpen} onOpenChange={setEditPaymentOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Payment Date</Label>
                <Input type="date" value={epDate} onChange={e => setEpDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Amount</Label>
                <Input type="text" inputMode="decimal" placeholder="0.00" value={epAmount} onChange={e => setEpAmount(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Payment Method</Label>
              <Select value={epMethod} onValueChange={setEpMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Reference</Label>
              <Input placeholder="Bank reference / cheque no." value={epRef} onChange={e => setEpRef(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea placeholder="Optional notes" rows={2} value={epNotes} onChange={e => setEpNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditPaymentOpen(false)}>Cancel</Button>
            <Button disabled={epSubmitting} onClick={handleEditPaymentSave}>
              {epSubmitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</> : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Void Invoice Dialog */}
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
