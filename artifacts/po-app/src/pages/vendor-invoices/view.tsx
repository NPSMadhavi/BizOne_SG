import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Plus, Trash2, Building, Calendar, CreditCard, FileText, Pencil } from "lucide-react";
import { fmtDate } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { BankAccountField } from "@/components/bank-account-field";
import { calcViLineAmount } from "@/lib/vendor-invoice-items";

function statusBadge(status: string) {
  switch (status) {
    case "paid": return <Badge className="bg-emerald-600 hover:bg-emerald-700 text-sm py-1">Paid</Badge>;
    case "partial": return <Badge className="bg-amber-500 hover:bg-amber-600 text-white text-sm py-1">Partial</Badge>;
    default: return <Badge variant="outline" className="text-orange-600 border-orange-300 text-sm py-1">Pending</Badge>;
  }
}

function formatCurrency(amount: number, currency = "SGD") {
  return new Intl.NumberFormat("en-SG", { style: "currency", currency }).format(amount);
}

const PAYMENT_METHODS_LIST = [
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "cheque", label: "Cheque" },
  { value: "cash", label: "Cash" },
  { value: "online", label: "Online Payment" },
  { value: "other", label: "Other" },
];

export default function VendorInvoiceView() {
  const { id: paramsId } = useParams<{ id: string }>();
  const id = Number(paramsId);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { isAdmin, canManage } = useAuth();
  const queryClient = useQueryClient();

  const [paymentOpen, setPaymentOpen] = useState(false);
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [payAmount, setPayAmount] = useState("");
  const [payRef, setPayRef] = useState("");
  const [payMethod, setPayMethod] = useState("bank_transfer");
  const [payBank, setPayBank] = useState("");
  const [payNotes, setPayNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const [editPaymentOpen, setEditPaymentOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState<any>(null);
  const [epDate, setEpDate] = useState("");
  const [epAmount, setEpAmount] = useState("");
  const [epMethod, setEpMethod] = useState("bank_transfer");
  const [epBank, setEpBank] = useState("");
  const [epRef, setEpRef] = useState("");
  const [epNotes, setEpNotes] = useState("");
  const [epSaving, setEpSaving] = useState(false);

  const { data: pi, isLoading, refetch } = useQuery<any>({
    queryKey: ["vendor-invoice", id],
    queryFn: async () => {
      const res = await fetch(`/api/vendor-invoices/${id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    enabled: !!id,
  });

  const handleAddPayment = async () => {
    if (!payAmount || isNaN(Number(payAmount)) || Number(payAmount) <= 0) {
      toast({ title: "Error", description: "Enter a valid payment amount", variant: "destructive" }); return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/vendor-invoices/${id}/payments`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentDate: payDate,
          amount: parseFloat(payAmount),
          reference: payRef || null,
          paymentMethod: payMethod,
          notes: payNotes || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to record payment");
      }
      toast({ title: "Payment Recorded", description: `${formatCurrency(Number(payAmount), pi?.currency)} recorded.` });
      setPaymentOpen(false);
      setPayAmount(""); setPayRef(""); setPayNotes("");
      refetch();
      queryClient.invalidateQueries({ queryKey: ["vendor-invoices"] });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePayment = async (paymentId: number) => {
    try {
      const res = await fetch(`/api/vendor-invoices/${id}/payments/${paymentId}`, {
        method: "DELETE", credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete payment");
      toast({ title: "Payment Deleted" });
      refetch();
      queryClient.invalidateQueries({ queryKey: ["vendor-invoices"] });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const openEditPayment = (p: any) => {
    setEditingPayment(p);
    setEpDate(p.paymentDate ? p.paymentDate.split("T")[0] : new Date().toISOString().split("T")[0]);
    setEpAmount(String(p.amount ?? ""));
    setEpMethod(p.paymentMethod || "bank_transfer");
    setEpRef(p.reference || "");
    setEpNotes(p.notes || "");
    setEditPaymentOpen(true);
  };

  const handleEditPaymentSave = async () => {
    if (!epAmount || isNaN(Number(epAmount)) || Number(epAmount) <= 0) {
      toast({ title: "Error", description: "Enter a valid amount", variant: "destructive" }); return;
    }
    setEpSaving(true);
    try {
      const res = await fetch(`/api/vendor-invoices/${id}/payments/${editingPayment.id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentDate: epDate,
          amount: parseFloat(epAmount),
          reference: epRef || null,
          paymentMethod: epMethod,
          notes: epNotes || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update payment");
      }
      toast({ title: "Payment Updated" });
      setEditPaymentOpen(false);
      refetch();
      queryClient.invalidateQueries({ queryKey: ["vendor-invoices"] });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setEpSaving(false);
    }
  };

  const handleDeletePI = async () => {
    try {
      const res = await fetch(`/api/vendor-invoices/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Failed to delete");
      toast({ title: "Vendor PI Deleted" });
      queryClient.invalidateQueries({ queryKey: ["vendor-invoices"] });
      setLocation("/vendor-invoices");
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  if (isLoading) return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-64 w-full" />
    </div>
  );

  if (!pi) return <div className="p-6 text-muted-foreground">Vendor invoice not found.</div>;

  const payments: any[] = pi.payments || [];
  const balance = pi.totalAmount - pi.paidAmount;
  const progress = pi.totalAmount > 0 ? Math.min(100, (pi.paidAmount / pi.totalAmount) * 100) : 0;
  const lineItems: any[] = Array.isArray(pi.items) ? pi.items : [];
  const hasLineItems = lineItems.some((it) => it.type !== "section" && (Number(it.amount) > 0 || Number(it.qty) * Number(it.unitPrice) > 0));
  const hasPartNo = lineItems.some((it) => it.partNumber);
  const fmtAmt = (n: number) => new Intl.NumberFormat("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/vendor-invoices")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl font-bold tracking-tight text-[#2563EB] font-mono">{pi.piNumber}</h1>
            {statusBadge(pi.status)}
          </div>
          <p className="text-muted-foreground mt-1">Recorded on {fmtDate(pi.createdAt)}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" onClick={() => setLocation(`/vendor-invoices/${id}/edit`)} className="gap-2">
            <Pencil className="h-4 w-4" />
            Edit
          </Button>
          {pi.status !== "paid" && (
            <Button onClick={() => setPaymentOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Record Payment
            </Button>
          )}
          {canManage && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="icon">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Vendor PI?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will also delete all payment records for this PI. This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDeletePI} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
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
          <CardContent className="space-y-3">
            <div className="font-semibold text-base">{pi.vendorName}</div>
            {pi.piDate && (
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">PI Date:</span>
                <span className="font-medium">{fmtDate(pi.piDate)}</span>
              </div>
            )}
            {pi.poNumbers && (
              <div className="flex items-start gap-2 text-sm">
                <FileText className="h-4 w-4 text-muted-foreground mt-0.5" />
                <span className="text-muted-foreground">Linked PO(s):</span>
                <span className="font-medium font-mono">{pi.poNumbers}</span>
              </div>
            )}
            <div className="text-sm pt-2 border-t">
              <span className="text-muted-foreground">Currency: </span>
              <span className="font-medium">{pi.currency || "SGD"}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <CreditCard className="h-5 w-5 text-muted-foreground" />
              Payment Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              {(pi as any).gstAmount > 0 && (pi as any).gstTreatment === "standard_rated" && (
                <>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Net Amount (excl. GST)</span>
                    <span className="font-mono">{formatCurrency(pi.totalAmount - (pi as any).gstAmount, pi.currency)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-primary">
                    <span>GST ({parseFloat((pi as any).gstRate ?? "9")}%)</span>
                    <span className="font-mono">+ {formatCurrency((pi as any).gstAmount, pi.currency)}</span>
                  </div>
                  <div className="h-px bg-border" />
                </>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">PI Total</span>
                <span className="font-semibold">{formatCurrency(pi.totalAmount, pi.currency)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Amount Paid</span>
                <span className="font-semibold text-emerald-600">{formatCurrency(pi.paidAmount, pi.currency)}</span>
              </div>
              <div className="h-px bg-border" />
              <div className="flex justify-between text-base font-bold">
                <span className={balance > 0 ? "text-orange-600" : "text-emerald-600"}>Balance Due</span>
                <span className={balance > 0 ? "text-orange-600" : "text-emerald-600"}>{formatCurrency(balance, pi.currency)}</span>
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Payment Progress</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${progress >= 100 ? "bg-emerald-500" : "bg-primary"}`}
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {hasLineItems && (
        <Card>
          <CardHeader>
            <CardTitle>Line Items</CardTitle>
          </CardHeader>
          {hasLineItems && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-y">
                  <tr>
                    <th className="px-6 py-3 font-medium w-12 text-center">#</th>
                    {hasPartNo && <th className="px-6 py-3 font-medium whitespace-nowrap">Part No.</th>}
                    <th className="px-6 py-3 font-medium">Description</th>
                    <th className="px-6 py-3 font-medium text-center whitespace-nowrap">Qty</th>
                    <th className="px-6 py-3 font-medium text-right whitespace-nowrap">Unit Price</th>
                    <th className="px-6 py-3 font-medium text-right whitespace-nowrap">Disc %</th>
                    <th className="px-6 py-3 font-medium text-right whitespace-nowrap">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y border-b">
                  {lineItems.map((item: any, idx: number) => {
                    if (item.type === "section") {
                      const colSpan = 6 + (hasPartNo ? 1 : 0);
                      return (
                        <tr key={idx} className="bg-muted/30">
                          <td colSpan={colSpan} className="px-6 py-2 font-semibold text-sm text-foreground">
                            {item.sectionLabel}
                          </td>
                        </tr>
                      );
                    }
                    let lineNum = 0;
                    lineItems.slice(0, idx + 1).forEach((i: any) => { if (i.type !== "section") lineNum++; });
                    const lineAmount = Number(item.amount) || calcViLineAmount(Number(item.qty) || 0, Number(item.unitPrice) || 0, Number(item.discount) || 0, item.isFoc);
                    return (
                      <tr key={idx} className="bg-card">
                        <td className="px-6 py-4 text-center text-muted-foreground align-top">{lineNum}</td>
                        {hasPartNo && <td className="px-6 py-4 text-muted-foreground align-top font-mono text-xs">{item.partNumber || "—"}</td>}
                        <td className="px-6 py-4 text-muted-foreground align-top">{item.description}</td>
                        <td className="px-6 py-4 text-center font-medium align-top">{item.qty}</td>
                        <td className="px-6 py-4 text-right text-muted-foreground align-top">{fmtAmt(Number(item.unitPrice))}</td>
                        <td className="px-6 py-4 text-right text-muted-foreground align-top">{Number(item.discount) > 0 ? `${item.discount}%` : "—"}</td>
                        <td className="px-6 py-4 text-right font-medium align-top">{fmtAmt(lineAmount)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="p-6 bg-muted/20">
            <div className="flex justify-end">
              <div className="w-full md:w-64 space-y-3 shrink-0">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span className="font-medium">{formatCurrency(Number(pi.subtotal ?? 0), pi.currency)}</span>
                  </div>
                  {Number((pi as any).discountAmount) > 0 && (
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>Discount</span>
                      <span>- {formatCurrency(Number((pi as any).discountAmount), pi.currency)}</span>
                    </div>
                  )}
                  {(pi as any).gstAmount > 0 && (pi as any).gstTreatment === "standard_rated" && (
                    <>
                      <div className="flex justify-between text-sm text-muted-foreground">
                        <span>Net Amount (excl. GST)</span>
                        <span className="font-mono">{formatCurrency(pi.totalAmount - (pi as any).gstAmount, pi.currency)}</span>
                      </div>
                      <div className="flex justify-between text-sm text-primary">
                        <span>GST ({parseFloat((pi as any).gstRate ?? "9")}%)</span>
                        <span className="font-mono">+ {formatCurrency(Number((pi as any).gstAmount ?? pi.tax ?? 0), pi.currency)}</span>
                      </div>
                    </>
                  )}
                  <div className="h-px bg-border my-2" />
                  <div className="flex justify-between text-lg font-bold text-primary">
                    <span>Total Amount</span>
                    <span>{formatCurrency(pi.totalAmount, pi.currency)}</span>
                  </div>
                </div>
              </div>
            </div>
        </Card>
      )}

      {(pi.notes || (pi as any).customerNote || (pi as any).deliveryInstructions || (pi as any).termsAndConditions || (pi as any).authorisedSignature) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Additional Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {pi.notes && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Internal Notes</p>
                <div className="text-sm text-muted-foreground prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: pi.notes }} />
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(pi as any).customerNote && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Customer Note</p>
                  <p className="text-sm whitespace-pre-line">{(pi as any).customerNote}</p>
                </div>
              )}
              {(pi as any).deliveryInstructions && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Delivery Instructions</p>
                  <p className="text-sm whitespace-pre-line">{(pi as any).deliveryInstructions}</p>
                </div>
              )}
              {(pi as any).termsAndConditions && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Terms & Conditions</p>
                  <p className="text-sm whitespace-pre-line">{(pi as any).termsAndConditions}</p>
                </div>
              )}
              {(pi as any).authorisedSignature && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Authorised Signature</p>
                  <img src={(pi as any).authorisedSignature} alt="Signature" className="max-h-16 object-contain border rounded p-2 bg-white" />
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Payment History
            <span className="text-sm font-normal text-muted-foreground">{payments.length} payment{payments.length !== 1 ? "s" : ""}</span>
          </CardTitle>
        </CardHeader>
        {payments.length === 0 ? (
          <CardContent>
            <p className="text-sm text-muted-foreground text-center py-6">No payments recorded yet.</p>
          </CardContent>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-y">
                <tr>
                  <th className="px-4 py-3 font-medium">#</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Method</th>
                  <th className="px-4 py-3 font-medium">Reference / UTR</th>
                  <th className="px-4 py-3 font-medium text-right">Amount</th>
                  <th className="px-4 py-3 font-medium">Notes</th>
                  <th className="px-4 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {payments.map((p: any, idx: number) => (
                  <tr key={p.id} className="bg-card">
                    <td className="px-4 py-3 text-muted-foreground">{payments.length - idx}</td>
                    <td className="px-4 py-3 font-medium">{fmtDate(p.paymentDate)}</td>
                    <td className="px-4 py-3 text-muted-foreground capitalize">
                      {(p.paymentMethod || "bank_transfer").replace(/_/g, " ")}
                    </td>
                    <td className="px-4 py-3 font-mono text-sm">{p.reference || "—"}</td>
                    <td className="px-4 py-3 text-right font-semibold text-emerald-600">{formatCurrency(p.amount, pi.currency)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{p.notes || "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditPayment(p)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        {canManage && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive">
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete this payment?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will remove the payment of {formatCurrency(p.amount, pi.currency)} and recalculate the balance.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeletePayment(p.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-muted/30 border-t">
                <tr>
                  <td colSpan={canManage ? 4 : 4} className="px-4 py-2 text-sm font-medium text-right">Total Paid</td>
                  <td className="px-4 py-2 text-right font-bold text-emerald-600">{formatCurrency(pi.paidAmount, pi.currency)}</td>
                  <td colSpan={canManage ? 2 : 1}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>

      <Dialog open={editPaymentOpen} onOpenChange={setEditPaymentOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Payment Date</Label>
                <Input type="date" value={epDate} onChange={e => setEpDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Amount <span className="text-destructive">*</span></Label>
                <Input type="text" inputMode="decimal" placeholder="0.00" value={epAmount} onChange={e => setEpAmount(e.target.value)} />
              </div>
            </div>
            <BankAccountField
              paymentMethod={epMethod}
              onPaymentMethodChange={setEpMethod}
              selectedBankAccount={epBank}
              onBankAccountChange={setEpBank}
              paymentMethods={PAYMENT_METHODS_LIST}
            />
            <div className="space-y-1.5">
              <Label>Bank Reference / UTR</Label>
              <Input placeholder="Transaction reference number" value={epRef} onChange={e => setEpRef(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea placeholder="Optional notes..." value={epNotes} onChange={e => setEpNotes(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditPaymentOpen(false)}>Cancel</Button>
            <Button onClick={handleEditPaymentSave} disabled={epSaving}>{epSaving ? "Saving..." : "Save Changes"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="p-3 bg-muted/50 rounded-lg text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">PI Total</span>
                <span className="font-medium">{formatCurrency(pi.totalAmount, pi.currency)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Already Paid</span>
                <span className="font-medium text-emerald-600">{formatCurrency(pi.paidAmount, pi.currency)}</span>
              </div>
              <div className="flex justify-between border-t pt-1 font-semibold">
                <span>Balance Due</span>
                <span className="text-orange-600">{formatCurrency(balance, pi.currency)}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Payment Date</Label>
                <Input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Amount <span className="text-destructive">*</span></Label>
                <Input
                  type="text" inputMode="decimal" placeholder="0.00"
                  value={payAmount} onChange={e => setPayAmount(e.target.value)}
                />
              </div>
            </div>

            <BankAccountField
              paymentMethod={payMethod}
              onPaymentMethodChange={setPayMethod}
              selectedBankAccount={payBank}
              onBankAccountChange={setPayBank}
              paymentMethods={PAYMENT_METHODS_LIST}
            />

            <div className="space-y-1.5">
              <Label>Bank Reference / UTR</Label>
              <Input placeholder="Transaction reference number" value={payRef} onChange={e => setPayRef(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea placeholder="Optional notes..." value={payNotes} onChange={e => setPayNotes(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentOpen(false)}>Cancel</Button>
            <Button onClick={handleAddPayment} disabled={saving}>{saving ? "Saving..." : "Record Payment"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
