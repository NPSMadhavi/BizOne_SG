import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { ArrowLeft, Edit, Trash2, CheckCircle2, ReceiptText, Image, FileText, AlertTriangle } from "lucide-react";
import { fmtDate } from "@/lib/utils";

interface Expense {
  id: number;
  expenseDate: string;
  vendorName: string;
  description: string;
  category: string;
  amount: string;
  gstAmount: string;
  gstClaimable: boolean;
  isDeductible: boolean;
  deductiblePct: number;
  currency: string;
  paymentMethod: string | null;
  receiptData: string | null;
  receiptMimeType: string | null;
  status: string;
  notes: string | null;
  createdBy: number;
  createdAt: string;
  updatedAt: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  staff_costs: "Staff Costs",
  rental: "Rental",
  professional_fees: "Professional Fees",
  advertising: "Advertising & Marketing",
  office_supplies: "Office Supplies",
  utilities: "Utilities",
  travel: "Travel & Transport",
  entertainment: "Entertainment (S14C)",
  motor_vehicle_private: "Motor Vehicle (Private Car)",
  motor_vehicle_commercial: "Motor Vehicle (Commercial)",
  training: "Training & Development",
  insurance: "Insurance",
  bank_charges: "Bank Charges",
  other: "Other Expenses",
};

const PAYMENT_LABELS: Record<string, string> = {
  bank_transfer: "Bank Transfer",
  cash: "Cash",
  credit_card: "Credit Card",
  cheque: "Cheque",
  paynow: "PayNow",
  nets: "NETS",
};

function fmtMoney(currency: string, amount: string) {
  return `${currency} ${parseFloat(amount).toLocaleString("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function ExpenseView() {
  const params = useParams<{ id: string }>();
  const id = parseInt(params.id);
  const [, setLocation] = useLocation();
  const { canManage } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);

  const { data: expense, isLoading, error } = useQuery<Expense>({
    queryKey: ["expense", id],
    queryFn: async () => {
      const res = await fetch(`/api/expenses/${id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    enabled: !isNaN(id),
  });

  const confirmMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/expenses/${id}/confirm`, { method: "POST", credentials: "include" });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expense", id] });
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      toast({ title: "Expense confirmed." });
      setConfirmOpen(false);
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/expenses/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      toast({ title: "Expense deleted." });
      setLocation("/accounting/expenses");
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  if (isLoading) return <div className="max-w-7xl mx-auto px-4 py-12 text-center text-muted-foreground">Loading…</div>;
  if (error || !expense) return <div className="max-w-7xl mx-auto px-4 py-12 text-center text-destructive">Expense not found.</div>;

  const netAmount = parseFloat(expense.amount) - parseFloat(expense.gstAmount);
  const deductibleAmount = expense.isDeductible ? netAmount * expense.deductiblePct / 100 : 0;

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/accounting/expenses")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ReceiptText className="h-5 w-5" />
              {expense.vendorName}
            </h1>
            <p className="text-sm text-muted-foreground">{fmtDate(expense.expenseDate)} · {CATEGORY_LABELS[expense.category] ?? expense.category}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {expense.status === "draft" && (
            <>
              <Button variant="outline" onClick={() => setLocation(`/accounting/expenses/${id}/edit`)}>
                <Edit className="h-4 w-4 mr-2" /> Edit
              </Button>
              <Button onClick={() => setConfirmOpen(true)}>
                <CheckCircle2 className="h-4 w-4 mr-2" /> Confirm
              </Button>
              {canManage && (
                <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setDeleteOpen(true)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </>
          )}
          {expense.status === "confirmed" && canManage && (
            <Button variant="outline" onClick={() => setLocation(`/accounting/expenses/${id}/edit`)}>
              <Edit className="h-4 w-4 mr-2" /> Edit (Admin)
            </Button>
          )}
        </div>
      </div>

      {expense.status === "confirmed" && (
        <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-2.5">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          <span className="text-sm font-medium text-emerald-800">Confirmed expense — locked for editing</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Expense Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs uppercase tracking-wide mb-0.5">Date</p>
                  <p className="font-medium">{fmtDate(expense.expenseDate)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs uppercase tracking-wide mb-0.5">Status</p>
                  {expense.status === "confirmed" ? (
                    <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Confirmed</Badge>
                  ) : (
                    <Badge variant="outline">Draft</Badge>
                  )}
                </div>
                <div>
                  <p className="text-muted-foreground text-xs uppercase tracking-wide mb-0.5">Vendor / Payee</p>
                  <p className="font-medium">{expense.vendorName}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs uppercase tracking-wide mb-0.5">Payment Method</p>
                  <p className="font-medium">{PAYMENT_LABELS[expense.paymentMethod ?? ""] ?? expense.paymentMethod ?? "—"}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-muted-foreground text-xs uppercase tracking-wide mb-0.5">Description</p>
                  <p className="font-medium">{expense.description}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs uppercase tracking-wide mb-0.5">Category</p>
                  <Badge variant="outline">{CATEGORY_LABELS[expense.category] ?? expense.category}</Badge>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs uppercase tracking-wide mb-0.5">Currency</p>
                  <p className="font-medium">{expense.currency}</p>
                </div>
              </div>

              {expense.notes && (
                <>
                  <Separator />
                  <div>
                    <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Notes</p>
                    <p className="text-sm whitespace-pre-wrap">{expense.notes}</p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {expense.category === "motor_vehicle_private" && (
            <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 p-3">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800">Private car expenses are <strong>non-deductible</strong> and GST input tax cannot be claimed under IRAS Section 14(1)(c).</p>
            </div>
          )}

          {expense.receiptData && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Receipt</CardTitle>
                  <Button variant="outline" size="sm" onClick={() => setShowReceipt(!showReceipt)}>
                    {showReceipt ? "Hide" : "View Receipt"}
                  </Button>
                </div>
              </CardHeader>
              {showReceipt && (
                <CardContent>
                  {expense.receiptMimeType?.startsWith("image/") ? (
                    <img
                      src={`data:${expense.receiptMimeType};base64,${expense.receiptData}`}
                      alt="Receipt"
                      className="max-w-full rounded border"
                    />
                  ) : expense.receiptMimeType === "application/pdf" ? (
                    <iframe
                      src={`data:application/pdf;base64,${expense.receiptData}`}
                      className="w-full h-[600px] rounded border"
                      title="Receipt PDF"
                    />
                  ) : (
                    <div className="flex items-center gap-2 text-muted-foreground text-sm">
                      <FileText className="h-4 w-4" />
                      Receipt attached (unsupported preview)
                    </div>
                  )}
                </CardContent>
              )}
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card className={!expense.isDeductible ? "border-red-200 bg-red-50/30" : expense.deductiblePct === 50 ? "border-amber-200 bg-amber-50/30" : "border-green-200 bg-green-50/30"}>
            <CardHeader><CardTitle className="text-sm">IRAS Tax Summary</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Gross Amount</span>
                <span className="font-mono font-medium">{fmtMoney(expense.currency, expense.amount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">GST Amount</span>
                <span className="font-mono text-blue-600">{fmtMoney(expense.currency, expense.gstAmount)}</span>
              </div>
              <div className="flex justify-between border-t pt-2">
                <span className="text-muted-foreground">Net (excl. GST)</span>
                <span className="font-mono font-medium">{expense.currency} {netAmount.toLocaleString("en-SG", { minimumFractionDigits: 2 })}</span>
              </div>
              <Separator />
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">GST Input Tax</span>
                <Badge variant="outline" className={expense.gstClaimable ? "text-blue-700 border-blue-300" : "text-muted-foreground"}>
                  {expense.gstClaimable ? "Claimable" : "Not claimable"}
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Deductibility</span>
                {expense.isDeductible ? (
                  <Badge className="bg-green-100 text-green-800 hover:bg-green-100">{expense.deductiblePct}% deductible</Badge>
                ) : (
                  <Badge variant="outline" className="text-red-600 border-red-300">Non-deductible</Badge>
                )}
              </div>
              <div className="flex justify-between border-t pt-2">
                <span className="font-medium">Allowable Deduction</span>
                <span className="font-mono font-bold text-green-700">{expense.currency} {deductibleAmount.toLocaleString("en-SG", { minimumFractionDigits: 2 })}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4 space-y-2 text-xs text-muted-foreground">
              <p><span className="font-medium">Created:</span> {fmtDate(expense.createdAt)}</p>
              <p><span className="font-medium">Updated:</span> {fmtDate(expense.updatedAt)}</p>
            </CardContent>
          </Card>
        </div>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm this expense?</AlertDialogTitle>
            <AlertDialogDescription>
              Confirming will lock the expense from further editing (unless you are an admin). This records it as an approved business expense.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmMutation.mutate()} disabled={confirmMutation.isPending}>
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this expense?</AlertDialogTitle>
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
    </div>
  );
}
