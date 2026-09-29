import { useState, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { BankAccountField } from "@/components/bank-account-field";
import { LedgerCombobox, type LedgerAccount } from "@/components/ledger-combobox";

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

function today() {
  return new Date().toISOString().slice(0, 10);
}

function numericOnly(val: string): string {
  const cleaned = val.replace(/[^0-9.]/g, "");
  const parts = cleaned.split(".");
  if (parts.length > 2) return parts[0] + "." + parts.slice(1).join("");
  return cleaned;
}

export default function ExpenseNew() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [receiptFileName, setReceiptFileName] = useState<string | null>(null);
  const [selectedBank, setSelectedBank] = useState("");

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

  const form = useForm<ExpenseForm>({
    defaultValues: {
      expenseDate: today(),
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

  const { register, handleSubmit, watch, setValue, formState: { errors } } = form;
  const accountId = watch("accountId");
  const gstClaimable = watch("gstClaimable");
  const isDeductible = watch("isDeductible");
  const deductiblePct = watch("deductiblePct");
  const amount = watch("amount");
  const gstAmount = watch("gstAmount");
  const currency = watch("currency");

  function autoCalcGst(netAmount: string, claimable: boolean) {
    const net = parseFloat(netAmount);
    if (!claimable || isNaN(net) || net <= 0) {
      setValue("gstAmount", "");
      return;
    }
    const gst = net * gstRate / 100;
    setValue("gstAmount", gst.toFixed(2));
  }

  function onLedgerChange(account: LedgerAccount) {
    setValue("accountId", account.id);
    setValue("category", account.code);
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const vendor = params.get("vendor");
    if (vendor) setValue("vendorName", vendor);
    const description = params.get("description");
    if (description) setValue("description", description);
    const reference = params.get("reference");
    if (reference) setValue("notes", `Invoice ref: ${reference}`);
    const ledgerCode = params.get("ledger") || params.get("category");
    if (ledgerCode && accounts.length) {
      const match = accounts.find(a => a.code === ledgerCode || String(a.id) === ledgerCode);
      if (match) onLedgerChange(match);
    }
  }, [accounts]);

  function onAmountChange(raw: string) {
    const cleaned = numericOnly(raw);
    setValue("amount", cleaned);
    autoCalcGst(cleaned, gstClaimable);
  }

  function onGstClaimableChange(checked: boolean) {
    setValue("gstClaimable", checked);
    if (!checked) { setValue("gstAmount", ""); return; }
    autoCalcGst(amount, checked);
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

  function calcTotal() {
    return (parseFloat(amount) || 0) + (parseFloat(gstAmount) || 0);
  }

  function calcDeductibleAmount() {
    if (!isDeductible) return 0;
    return (parseFloat(amount) || 0) * deductiblePct / 100;
  }

  async function onSubmit(data: ExpenseForm, statusOverride?: string) {
    if (!data.accountId) { toast({ title: "Please select a ledger", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const payload = {
        ...data,
        accountId: data.accountId,
        category: data.category || String(data.accountId),
        status: "draft",
      };
      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || "Failed to save"); }
      const created = await res.json();

      if (statusOverride === "confirmed") {
        const confirmRes = await fetch(`/api/expenses/${created.id}/confirm`, { method: "POST", credentials: "include" });
        if (!confirmRes.ok) { const e = await confirmRes.json(); throw new Error(e.error || "Failed to confirm"); }
      }

      toast({ title: statusOverride === "confirmed" ? "Expense confirmed and posted." : "Expense saved as draft." });
      await queryClient.invalidateQueries({ queryKey: ["expenses"] });
      setLocation("/accounting/expenses");
    } catch (e: any) {
      toast({ title: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/accounting/expenses")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-bold text-[#2563EB]">New Expense</h1>
      </div>

      <form onSubmit={handleSubmit(d => onSubmit(d))} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Expense Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="expenseDate">Expense Date <span className="text-destructive">*</span></Label>
                  <Input id="expenseDate" type="date" {...register("expenseDate", { required: true })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Currency</Label>
                  <Select value={currency} onValueChange={v => setValue("currency", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="vendorName">Vendor / Payee Name <span className="text-destructive">*</span></Label>
                <Input id="vendorName" placeholder="Type to search category…" {...register("vendorName", { required: true })} />
                {errors.vendorName && <p className="text-xs text-destructive">Required</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="description">Description <span className="text-destructive">*</span></Label>
                <Input id="description" placeholder="e.g. ACME Pte. Ltd." {...register("description", { required: true })} />
                {errors.description && <p className="text-xs text-destructive">Required</p>}
              </div>

              <div className="space-y-1.5">
                <Label>Ledger <span className="text-destructive">*</span></Label>
                <LedgerCombobox accounts={accounts} value={accountId} onChange={onLedgerChange} />
              </div>

              <BankAccountField
                paymentMethod={watch("paymentMethod")}
                onPaymentMethodChange={(v) => setValue("paymentMethod", v)}
                selectedBankAccount={selectedBank}
                onBankAccountChange={setSelectedBank}
                paymentMethods={PAYMENT_METHODS}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Amounts & GST</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="amount">Net Amount (excl. GST) <span className="text-destructive">*</span></Label>
                  <Input
                    id="amount"
                    inputMode="decimal"
                    placeholder="e.g. Office rental for October 2025"
                    value={amount}
                    onChange={e => onAmountChange(e.target.value)}
                    className="[appearance:textfield]"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="gstAmount">
                    GST Amount
                    {gstClaimable && <span className="ml-1 text-xs text-muted-foreground font-normal">(auto @ {gstRate}%)</span>}
                  </Label>
                  <Input
                    id="gstAmount"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={gstAmount}
                    onChange={e => setValue("gstAmount", numericOnly(e.target.value))}
                    className={cn("[appearance:textfield]", gstClaimable && "bg-muted/50 text-muted-foreground")}
                    readOnly={gstClaimable}
                  />
                </div>
              </div>

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

              {isDeductible && (
                <div className="space-y-1.5">
                  <Label>Deductible Percentage</Label>
                  <Select value={String(deductiblePct)} onValueChange={v => setValue("deductiblePct", parseInt(v))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="100">100% — Fully deductible</SelectItem>
                      <SelectItem value="50">50% — Entertainment (S14C)</SelectItem>
                      <SelectItem value="0">0% — Non-deductible</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Notes & Receipt</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="notes">Internal Notes</Label>
                <Textarea id="notes" placeholder="0.00" rows={3} {...register("notes")} />
              </div>
              <div className="space-y-1.5">
                <Label>Receipt / Invoice Upload</Label>
                <label className="flex items-center gap-2 border-2 border-dashed rounded-lg p-4 cursor-pointer hover:bg-muted/30 transition-colors">
                  <Upload className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-sm text-muted-foreground">{receiptFileName ?? "Click to upload receipt (PDF, PNG, JPG)"}</span>
                  <input type="file" accept="image/*,application/pdf" className="hidden" onChange={onReceiptChange} />
                </label>
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
                <span className="font-mono font-medium">{currency} {(parseFloat(amount) || 0).toLocaleString("en-SG", { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">GST ({gstRate}%)</span>
                <span className="font-mono text-blue-600">{currency} {(parseFloat(gstAmount) || 0).toLocaleString("en-SG", { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between border-t pt-2 font-medium">
                <span>Total (incl. GST)</span>
                <span className="font-mono">{currency} {calcTotal().toLocaleString("en-SG", { minimumFractionDigits: 2 })}</span>
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
                <span className="font-mono font-bold text-green-700">{currency} {calcDeductibleAmount().toLocaleString("en-SG", { minimumFractionDigits: 2 })}</span>
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
    </div>
  );
}
