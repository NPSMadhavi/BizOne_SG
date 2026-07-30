import { useState } from "react";
import { useParams, useLocation } from "wouter";
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
import { ArrowLeft, Edit, Trash2, CheckCircle2, TrendingUp, Ban } from "lucide-react";
import { fmtDate } from "@/lib/utils";

interface IncomeRecord {
  id: number;
  incomeDate: string;
  payerName: string;
  description: string;
  category: string;
  amount: string;
  gstAmount: string;
  gstTreatment: string;
  currency: string;
  paymentMethod: string | null;
  accountId: number | null;
  accountName: string | null;
  reference: string | null;
  notes: string | null;
  status: string;
  journalEntryId: number | null;
  createdAt: string;
  updatedAt: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  rental_income:    "Rental Income",
  interest_income:  "Interest Income",
  dividend_income:  "Dividend Income",
  grant_subsidy:    "Government Grant / Subsidy",
  commission_income:"Commission Income",
  service_fee:      "Service Fee (Non-trade)",
  royalty_income:   "Royalty Income",
  gain_on_disposal: "Gain on Disposal of Asset",
  forex_gain:       "Foreign Exchange Gain",
  other_income:     "Other Income",
};

const GST_LABELS: Record<string, string> = {
  standard_rated: "Standard-Rated (9%)",
  zero_rated:     "Zero-Rated (0%)",
  exempt:         "Exempt",
  out_of_scope:   "Out of Scope",
};

const GST_BOX: Record<string, string> = {
  standard_rated: "→ GST F5 Box 1 & Box 6",
  zero_rated:     "→ GST F5 Box 2",
  exempt:         "→ GST F5 Box 3",
  out_of_scope:   "→ Not reported in GST F5",
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

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4">
      <span className="w-48 shrink-0 text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}

export default function IncomeView() {
  const params = useParams<{ id: string }>();
  const id = parseInt(params.id);
  const [, setLocation] = useLocation();
  const { canManage } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data: record, isLoading, error } = useQuery<IncomeRecord>({
    queryKey: ["income", id],
    queryFn: async () => {
      const res = await fetch(`/api/income/${id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    enabled: !isNaN(id),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["income", id] });
    queryClient.invalidateQueries({ queryKey: ["income"] });
  };

  const confirmMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/income/${id}/confirm`, { method: "POST", credentials: "include" });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      return res.json();
    },
    onSuccess: () => { invalidate(); toast({ title: "Income confirmed and journal entry posted." }); setConfirmOpen(false); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const voidMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/income/${id}/void`, { method: "POST", credentials: "include" });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      return res.json();
    },
    onSuccess: () => { invalidate(); toast({ title: "Income record voided. Journal entry reversed." }); setVoidOpen(false); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/income/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["income"] }); toast({ title: "Income record deleted." }); setLocation("/accounting/income"); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  if (isLoading) return <div className="max-w-7xl mx-auto px-4 py-12 text-center text-muted-foreground">Loading…</div>;
  if (error || !record) return <div className="max-w-7xl mx-auto px-4 py-12 text-center text-destructive">Income record not found.</div>;

  const netAmount  = parseFloat(record.amount);
  const gstAmount  = parseFloat(record.gstAmount);
  const grossAmount = netAmount + gstAmount;

  const statusBadge = () => {
    if (record.status === "confirmed") return <Badge className="bg-green-100 text-green-700 border-0 text-sm px-3 py-1">Confirmed</Badge>;
    if (record.status === "void")      return <Badge className="bg-red-100 text-red-700 border-0 text-sm px-3 py-1">Void</Badge>;
    return <Badge variant="outline" className="text-sm px-3 py-1">Draft</Badge>;
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/accounting/income")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />{record.payerName}
            </h1>
            <p className="text-sm text-muted-foreground">
              {fmtDate(record.incomeDate)} · {CATEGORY_LABELS[record.category] ?? record.category}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {statusBadge()}
          {record.status === "draft" && (
            <>
              <Button variant="outline" size="sm" onClick={() => setLocation(`/accounting/income/${id}/edit`)}>
                <Edit className="h-4 w-4 mr-1.5" />Edit
              </Button>
              <Button size="sm" onClick={() => setConfirmOpen(true)}>
                <CheckCircle2 className="h-4 w-4 mr-1.5" />Confirm & Post
              </Button>
              {canManage && (
                <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
                  <Trash2 className="h-4 w-4 mr-1.5" />Delete
                </Button>
              )}
            </>
          )}
          {record.status === "confirmed" && (
            <>
              {canManage && (
                <Button variant="outline" size="sm" onClick={() => setLocation(`/accounting/income/${id}/edit`)}>
                  <Edit className="h-4 w-4 mr-1.5" />Edit (Admin)
                </Button>
              )}
              {canManage && (
                <Button variant="destructive" size="sm" onClick={() => setVoidOpen(true)}>
                  <Ban className="h-4 w-4 mr-1.5" />Void
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {record.status === "void" && (
        <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <Ban className="h-4 w-4 shrink-0" />
          This income record has been voided. If a journal entry was posted, it has been reversed.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Details */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Income Details</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Row label="Date" value={fmtDate(record.incomeDate)} />
              <Row label="Payer" value={record.payerName} />
              <Row label="Description" value={record.description} />
              <Row label="Category" value={CATEGORY_LABELS[record.category] ?? record.category} />
              {record.accountName && <Row label="Revenue Account" value={record.accountName} />}
              {record.reference && <Row label="Reference" value={record.reference} />}
              {record.paymentMethod && <Row label="Payment Method" value={PAYMENT_LABELS[record.paymentMethod] ?? record.paymentMethod} />}
              {record.notes && (
                <>
                  <Separator />
                  <Row label="Notes" value={<span className="whitespace-pre-wrap">{record.notes}</span>} />
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">GST & Accounting</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Row label="GST Treatment" value={
                <span className="flex flex-col gap-0.5">
                  <span>{GST_LABELS[record.gstTreatment] ?? record.gstTreatment}</span>
                  <span className="text-xs text-muted-foreground">{GST_BOX[record.gstTreatment]}</span>
                </span>
              } />
              {record.journalEntryId && (
                <Row label="Journal Entry" value={
                  <button className="text-primary text-sm underline" onClick={() => setLocation(`/accounting/journal-entries/${record.journalEntryId}`)}>
                    JE #{record.journalEntryId}
                  </button>
                } />
              )}
            </CardContent>
          </Card>
        </div>

        {/* Amount summary */}
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Amount Summary</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Net Amount</span>
                  <span className="font-mono font-medium">{fmtMoney(record.currency, record.amount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">GST ({record.gstTreatment === "standard_rated" ? "9%" : record.gstTreatment})</span>
                  <span className="font-mono text-muted-foreground">{fmtMoney(record.currency, record.gstAmount)}</span>
                </div>
                <Separator />
                <div className="flex justify-between font-semibold text-base">
                  <span>Total Received</span>
                  <span className="font-mono">{fmtMoney(record.currency, grossAmount.toFixed(2))}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Confirm dialog */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm income record?</AlertDialogTitle>
            <AlertDialogDescription>
              This will post a journal entry to the books and include this income in GST F5 reporting. This action cannot be undone without admin void.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmMutation.mutate()}>Confirm & Post</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Void dialog */}
      <AlertDialog open={voidOpen} onOpenChange={setVoidOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Void this income record?</AlertDialogTitle>
            <AlertDialogDescription>
              This will reverse the posted journal entry and exclude this record from GST F5. Admin only action.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => voidMutation.mutate()}>Void</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete dialog */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete income record?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deleteMutation.mutate()}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
