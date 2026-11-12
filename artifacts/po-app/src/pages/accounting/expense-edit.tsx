import { useState, useCallback, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { useGetSettings } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Upload, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { readReturnTo, withReturnTo } from "@/lib/return-to";
import { BankAccountField } from "@/components/bank-account-field";
import { LedgerCombobox, type LedgerAccount } from "@/components/ledger-combobox";
import { VendorPayeeField } from "@/components/vendor-payee-field";

interface ExpenseForm {
  expenseDate: string;
  vendorName: string;
  description: string;
  category: string;
  accountId: number | null;
  amount: string;
  gstAmount: string;
  gstClaimable: boolean;
  isDeductible: boolean;
  deductiblePct: number;
  currency: string;
  paymentMethod: string;
  notes: string;
  receiptData: string;
  receiptMimeType: string;
  status: string;
}

const PAYMENT_METHODS = [
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "cash", label: "Cash" },
  { value: "credit_card", label: "Credit Card" },
  { value: "cheque", label: "Cheque" },
  { value: "paynow", label: "PayNow" },
  { value: "nets", label: "NETS" },
];

const CURRENCIES = ["SGD", "USD", "EUR", "GBP", "MYR", "INR"];

function numericOnly(val: string): string {
  const cleaned = val.replace(/[^0-9.]/g, "");
  const parts = cleaned.split(".");
  if (parts.length > 2) return parts[0] + "." + parts.slice(1).join("");
  return cleaned;
}

export default function ExpenseEdit() {
  const params = useParams<{ id: string }>();
  const id = parseInt(params.id);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [showIncludingTax, setShowIncludingTax] = useState(false);
  const [amountFocused, setAmountFocused] = useState(false);
  const [grossText, setGrossText] = useState("");
  const [receiptFileName, setReceiptFileName] = useState<string | null>(null);
  const [selectedBank, setSelectedBank] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/expenses/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      toast({ title: "Expense deleted." });
      setLocation(readReturnTo() || "/accounting/expenses");
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const { data: settings } = useGetSettings({});
  const gstRate = settings?.gstRate ?? 9;

  const { data: accounts = [] } = useQuery<LedgerAccount[]>({
    queryKey: ["accounts"],
    queryFn: async () => {
      const res = await fetch("/api/accounts", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: expense, isLoading } = useQuery({
    queryKey: ["expense", id],
    queryFn: async () => {
      const res = await fetch(`/api/expenses/${id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    enabled: !isNaN(id),
    staleTime: 0,
    refetchOnMount: "always",
  });

  const form = useForm<ExpenseForm>({
    defaultValues: {
      expenseDate: "",
      vendorName: "",
      description: "",
      category: "",
      accountId: null,
      amount: "",
      gstAmount: "",
      gstClaimable: false,
      isDeductible: true,
      deductiblePct: 100,
      currency: "SGD",
      paymentMethod: "bank_transfer",
      notes: "",
      receiptData: "",
      receiptMimeType: "",
      status: "draft",
    },
  });

  const { register, handleSubmit, watch, setValue, reset } = form;
  const expenseDate = watch("expenseDate");
  const vendorName = watch("vendorName");

  useEffect(() => {
    if (!expense || loaded) return;
    const needsLookup = !expense.accountId && !!expense.category;
    if (needsLookup && accounts.length === 0) return;

    let resolvedAccountId: number | null = expense.accountId ?? null;
    if (!resolvedAccountId && expense.category && accounts.length) {
      const byCode = accounts.find(a => a.code === expense.category);
      if (byCode) resolvedAccountId = byCode.id;
    }
    reset({
      expenseDate: expense.expenseDate,
      vendorName: expense.vendorName,
      description: expense.description,
      category: expense.category,
      accountId: resolvedAccountId,
      amount: String(expense.amount),
      gstAmount: String(expense.gstAmount),
      gstClaimable: expense.gstClaimable,
      isDeductible: expense.isDeductible,
      deductiblePct: expense.deductiblePct,
      currency: expense.currency,
      paymentMethod: expense.paymentMethod || "bank_transfer",
      notes: expense.notes || "",
      receiptData: "",
      receiptMimeType: "",
      status: expense.status,
    });
    setLoaded(true);
  }, [expense, loaded, reset, accounts]);

  const accountId = watch("accountId");
  const gstClaimable = watch("gstClaimable");
  const isDeductible = watch("isDeductible");
  const deductiblePct = watch("deductiblePct");
  const amount = watch("amount");
  const gstAmount = watch("gstAmount");
  const currency = watch("currency");

  function round2(n: number) {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }

  function splitInclusive(grossRaw: string) {
    const gross = parseFloat(grossRaw);
    if (!Number.isFinite(gross) || gross <= 0) return { gross: 0, gst: 0, net: 0 };
    const rate = Number(gstRate) || 0;
    const grossCents = Math.round(gross * 100);
    const gstCents = Math.round((grossCents * rate) / (100 + rate));
    const netCents = grossCents - gstCents;
    return { gross: grossCents / 100, gst: gstCents / 100, net: netCents / 100 };
  }

  function syncGst(netAmount: string, claimable: boolean) {
    const net = parseFloat(netAmount);
    if (claimable && !isNaN(net) && net > 0) {
      setValue("gstAmount", ((net * gstRate) / 100).toFixed(2));
      return;
    }
    setValue("gstAmount", "");
  }

  function applyInclusive(grossRaw: string) {
    const split = splitInclusive(grossRaw);
    setValue("gstAmount", split.gross > 0 ? split.gst.toFixed(2) : "");
  }

  function onLedgerChange(account: LedgerAccount) {
    setValue("accountId", account.id);
    setValue("category", account.code);
  }

  function onAmountChange(raw: string) {
    const cleaned = numericOnly(raw);
    if (showIncludingTax) {
      setGrossText(cleaned);
      setValue("amount", cleaned);
      applyInclusive(cleaned);
      return;
    }
    setValue("amount", cleaned);
    syncGst(cleaned, gstClaimable);
  }

  function onIncludingTaxChange(checked: boolean) {
    if (checked) {
      const gross = amount;
      setGrossText(gross);
      setShowIncludingTax(true);
      applyInclusive(gross);
      return;
    }
    const gross = grossText || amount;
    setShowIncludingTax(false);
    setGrossText("");
    setValue("amount", gross);
    syncGst(gross, gstClaimable);
  }

  function onGstClaimableChange(checked: boolean) {
    setValue("gstClaimable", checked);
    if (showIncludingTax) {
      applyInclusive(grossText || amount);
      return;
    }
    syncGst(amount, checked);
  }

  const onReceiptChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setReceiptFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setValue("receiptData", dataUrl.split(",")[1]);
      setValue("receiptMimeType", file.type);
    };
    reader.readAsDataURL(file);
  }, [setValue]);

  const inclusiveSplit = showIncludingTax ? splitInclusive(grossText || amount) : null;
  const netValue = inclusiveSplit ? inclusiveSplit.net : (parseFloat(amount) || 0);
  const gstValue = inclusiveSplit ? inclusiveSplit.gst : (parseFloat(gstAmount) || 0);
  const totalValue = inclusiveSplit ? inclusiveSplit.gross : netValue + gstValue;
  const amountShown = showIncludingTax
    ? (amountFocused ? grossText : (inclusiveSplit && inclusiveSplit.gross > 0 ? inclusiveSplit.net.toFixed(2) : ""))
    : amount;

  function calcDeductibleAmount() {
    if (!isDeductible) return 0;
    return round2((netValue * deductiblePct) / 100);
  }

  async function onSubmit(data: ExpenseForm, statusOverride?: string) {
    if (!data.vendorName?.trim()) { toast({ title: "Vendor / Payee Name is required", variant: "destructive" }); return; }
    if (!data.accountId) { toast({ title: "Please select a ledger", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const payload: any = {
        ...data,
        amount: netValue.toFixed(2),
        gstAmount: gstValue ? gstValue.toFixed(2) : "",
        accountId: data.accountId,
        category: data.category || String(data.accountId),
        status: statusOverride ?? data.status,
      };
      if (!payload.receiptData) { delete payload.receiptData; delete payload.receiptMimeType; }
      const res = await fetch(`/api/expenses/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || "Failed to save"); }
      queryClient.invalidateQueries({ queryKey: ["expense", id] });
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      toast({ title: "Expense updated." });
      setLocation(withReturnTo(`/accounting/expenses/${id}`));
    } catch (e: any) {
      toast({ title: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  if (isLoading || !loaded) return <div className="max-w-[1600px] mx-auto px-4 py-12 text-center text-muted-foreground">Loading…</div>;

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" type="button" onClick={() => setLocation(withReturnTo(`/accounting/expenses/${id}`))}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold text-[#2563EB]">Edit Expense</h1>
        </div>

        <Button
          type="button"
          variant="destructive"
          size="icon"
          className="h-9 w-9"
          onClick={() => setDeleteOpen(true)}
          disabled={saving || deleteMutation.isPending}
          title="Delete"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <form onSubmit={handleSubmit(d => onSubmit(d))} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Expense Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="expenseDate">Expense Date <span className="text-destructive">*</span></Label>
                  <Input
                    id="expenseDate"
                    type="date"
                    value={expenseDate || ""}
                    onChange={(e) => setValue("expenseDate", e.target.value, { shouldDirty: true, shouldValidate: true })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Currency</Label>
                  <Select value={currency} onValueChange={v => setValue("currency", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="vendorName">Vendor / Payee Name <span className="text-destructive">*</span></Label>
                  <VendorPayeeField
                    id="vendorName"
                    value={vendorName || ""}
                    onChange={(value) => setValue("vendorName", value, { shouldDirty: true, shouldValidate: true })}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Ledger <span className="text-destructive">*</span></Label>
                  <LedgerCombobox accounts={accounts} value={accountId} onChange={onLedgerChange} />
                </div>
              </div>

              <BankAccountField
                paymentMethod={watch("paymentMethod")}
                onPaymentMethodChange={(v) => setValue("paymentMethod", v)}
                selectedBankAccount={selectedBank}
                onBankAccountChange={setSelectedBank}
                paymentMethods={PAYMENT_METHODS}
              />

              <div className="space-y-1.5">
                <Label>Description <span className="text-destructive">*</span></Label>
                <Input {...register("description", { required: true })} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Amounts & GST</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <div className="flex min-h-6 items-center justify-between gap-2">
                    <Label htmlFor="amount" className="leading-none">Taxable Amount <span className="text-destructive">*</span></Label>
                    <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      Including Tax
                      <Switch checked={showIncludingTax} onCheckedChange={onIncludingTaxChange} />
                    </label>
                  </div>
                  <Input
                    id="amount"
                    inputMode="decimal"
                    placeholder=""
                    value={amountShown}
                    onFocus={() => {
                      setAmountFocused(true);
                      if (showIncludingTax) setGrossText(grossText || amount);
                    }}
                    onBlur={() => setAmountFocused(false)}
                    onChange={e => onAmountChange(e.target.value)}
                    className="[appearance:textfield]"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="gstAmount" className="flex min-h-6 items-center leading-none">
                    GST Amount
                    {(gstClaimable || showIncludingTax) && <span className="ml-1 text-xs text-muted-foreground font-normal">(auto @ {gstRate}%)</span>}
                  </Label>
                  <Input
                    id="gstAmount"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={gstAmount}
                    onChange={e => setValue("gstAmount", numericOnly(e.target.value))}
                    className={cn("[appearance:textfield]", (gstClaimable || showIncludingTax) && "bg-muted/50 text-muted-foreground")}
                    readOnly={gstClaimable || showIncludingTax}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium">GST Input Tax Claimable</p>
                    <p className="text-xs text-muted-foreground">Claim GST back from IRAS if vendor is GST-registered</p>
                  </div>
                  <Switch checked={gstClaimable} onCheckedChange={onGstClaimableChange} />
                </div>

                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium">Tax Deductible</p>
                    <p className="text-xs text-muted-foreground">Allowable business deduction under IRAS rules</p>
                  </div>
                  <Switch checked={isDeductible} onCheckedChange={v => setValue("isDeductible", v)} />
                </div>

                <div className="space-y-1.5">
                  <Label>Deductible Percentage</Label>
                  <Select
                    value={String(deductiblePct)}
                    onValueChange={v => setValue("deductiblePct", parseInt(v))}
                    disabled={!isDeductible}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="100">100% — Fully deductible</SelectItem>
                      <SelectItem value="50">50% — Entertainment (S14C)</SelectItem>
                      <SelectItem value="0">0% — Non-deductible</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Notes & Receipt</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Internal Notes</Label>
                <Textarea rows={3} {...register("notes")} />
              </div>
              <div className="space-y-1.5">
                <Label>Replace Receipt (optional)</Label>
                <label className="flex h-[88px] items-center gap-2 border-2 border-dashed rounded-lg p-4 cursor-pointer hover:bg-muted/30 transition-colors">
                  <Upload className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-sm text-muted-foreground">{receiptFileName ?? "Click to upload new receipt (PDF, PNG, JPG)"}</span>
                  <input type="file" accept="image/*,application/pdf" className="hidden" onChange={onReceiptChange} />
                </label>
                {expense?.receiptData && !receiptFileName && (
                  <p className="text-xs text-muted-foreground">Existing receipt will be kept unless you upload a new one.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className={!isDeductible ? "border-red-200 bg-red-50/30" : deductiblePct === 50 ? "border-amber-200 bg-amber-50/30" : "border-green-200 bg-green-50/30"}>
            <CardHeader><CardTitle className="text-sm">IRAS Summary</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Net Amount</span>
                <span className="font-mono font-medium">{currency} {netValue.toLocaleString("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">GST ({gstRate}%)</span>
                <span className="font-mono text-blue-600">{currency} {gstValue.toLocaleString("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between border-t pt-2 font-medium">
                <span>Total (incl. GST)</span>
                <span className="font-mono">{currency} {totalValue.toLocaleString("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">GST Input Tax</span>
                <Badge variant="outline" className={gstClaimable ? "text-blue-700 border-blue-300" : "text-muted-foreground"}>
                  {gstClaimable ? "Claimable" : "Not claimable"}
                </Badge>
              </div>
              <div className="flex justify-between items-center border-t pt-2">
                <span className="text-muted-foreground">Tax Deductible</span>
                {isDeductible ? (
                  <Badge className="bg-green-100 text-green-800 hover:bg-green-100">{deductiblePct}%</Badge>
                ) : (
                  <Badge variant="outline" className="text-red-600 border-red-300">Non-deductible</Badge>
                )}
              </div>
              <div className="flex justify-between border-t pt-2">
                <span className="font-medium">Allowable Deduction</span>
                <span className="font-mono font-bold text-green-700">{currency} {calcDeductibleAmount().toLocaleString("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-col gap-2">
            <Button type="button" variant="outline" disabled={saving}
              onClick={handleSubmit(d => onSubmit(d, "draft"))}>
              Save as Draft
            </Button>
            <Button type="button" disabled={saving}
              onClick={handleSubmit(d => onSubmit(d, "confirmed"))}>
              Save & Confirm
            </Button>
          </div>
        </div>
      </form>
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete expense record?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
