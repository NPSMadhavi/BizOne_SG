import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useForm, Controller } from "react-hook-form";
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
import { ArrowLeft, Info, RefreshCw, Paperclip, X, FileText, FileImage, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { BankAccountField } from "@/components/bank-account-field";

interface IncomeForm {
  incomeDate: string;
  payerName: string;
  description: string;
  category: string;
  amount: string;
  gstTreatment: string;
  gstAmount: string;
  gstClaimable: boolean;
  isDeductible: boolean;
  deductiblePct: number;
  currency: string;
  paymentMethod: string;
  accountId: string;
  reference: string;
  notes: string;
  status: string;
}

interface Account { id: number; code: string; name: string; }

interface AttachFile {
  data: string;
  mimeType: string;
  name: string;
  sizeKB: number;
}

const CATEGORY_CONFIG: Record<string, { label: string; defaultGst: string; note: string; deductible: boolean; pct: number; gstClaimable: boolean }> = {
  rental_income:     { label: "Rental Income",                  defaultGst: "standard_rated", note: "Standard-rated if you charge GST on rent. Residential rent is exempt.", deductible: true,  pct: 100, gstClaimable: true },
  interest_income:   { label: "Interest Income",                defaultGst: "exempt",          note: "Bank interest and loan interest received are GST-exempt.", deductible: true,  pct: 100, gstClaimable: false },
  dividend_income:   { label: "Dividend Income",                defaultGst: "exempt",          note: "Singapore one-tier dividends are exempt from GST.", deductible: true,  pct: 100, gstClaimable: false },
  grant_subsidy:     { label: "Government Grant / Subsidy",     defaultGst: "out_of_scope",    note: "Government grants (EDG, SkillsFuture, etc.) are out of scope of GST.", deductible: false, pct: 0,   gstClaimable: false },
  commission_income: { label: "Commission Income",              defaultGst: "standard_rated", note: "Commission for services rendered — standard-rated.", deductible: true,  pct: 100, gstClaimable: true },
  service_fee:       { label: "Service Fee (Non-trade)",        defaultGst: "standard_rated", note: "Non-recurring service fees — standard-rated.", deductible: true,  pct: 100, gstClaimable: true },
  royalty_income:    { label: "Royalty Income",                 defaultGst: "standard_rated", note: "Royalties for use of IP in Singapore — standard-rated.", deductible: true,  pct: 100, gstClaimable: true },
  gain_on_disposal:  { label: "Gain on Disposal of Asset",      defaultGst: "out_of_scope",    note: "Capital gains from asset sales are generally out of scope of GST.", deductible: false, pct: 0,   gstClaimable: false },
  forex_gain:        { label: "Foreign Exchange Gain",          defaultGst: "out_of_scope",    note: "Realised FX gains are out of scope of GST.", deductible: true,  pct: 100, gstClaimable: false },
  other_income:      { label: "Other Income",                   defaultGst: "standard_rated", note: "Review GST treatment before confirming.", deductible: true,  pct: 100, gstClaimable: true },
};

const GST_OPTIONS = [
  { value: "standard_rated", label: "Standard-Rated (9%)" },
  { value: "zero_rated",     label: "Zero-Rated (0%)" },
  { value: "exempt",         label: "Exempt" },
  { value: "out_of_scope",   label: "Out of Scope" },
];

const PAYMENT_METHODS = [
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "cash",          label: "Cash" },
  { value: "cheque",        label: "Cheque" },
  { value: "paynow",        label: "PayNow" },
  { value: "nets",          label: "NETS" },
];

const CURRENCIES = ["SGD", "USD", "EUR", "GBP", "MYR"];
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_FILES = 10;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"];

function today() { return new Date().toISOString().slice(0, 10); }

function numericOnly(val: string): string {
  const cleaned = val.replace(/[^0-9.]/g, "");
  const parts = cleaned.split(".");
  if (parts.length > 2) return parts[0] + "." + parts.slice(1).join("");
  return cleaned;
}

function AttachmentIcon({ mimeType, className }: { mimeType: string; className?: string }) {
  if (mimeType === "application/pdf") return <FileText className={className} />;
  return <FileImage className={className} />;
}

export default function IncomeNew() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [selectedBank, setSelectedBank] = useState("");
  const [revenueAccounts, setRevenueAccounts] = useState<Account[]>([]);
  const [exchangeRate, setExchangeRate] = useState("1.000000");
  const [fetchingRate, setFetchingRate] = useState(false);
  const [attachments, setAttachments] = useState<AttachFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: settings } = useGetSettings({});
  const gstRate = settings?.gstRate ?? 9;

  const form = useForm<IncomeForm>({
    defaultValues: {
      incomeDate:    today(),
      payerName:     "",
      description:   "",
      category:      "",
      amount:        "",
      gstTreatment:  "standard_rated",
      gstAmount:     "",
      gstClaimable:  false,
      isDeductible:  true,
      deductiblePct: 100,
      currency:      "SGD",
      paymentMethod: "bank_transfer",
      accountId:     "",
      reference:     "",
      notes:         "",
      status:        "draft",
    },
  });

  const { watch, setValue, register, handleSubmit, formState: { errors } } = form;
  const watchedCategory    = watch("category");
  const watchedGstTreatment = watch("gstTreatment");
  const watchedAmount      = watch("amount");
  const watchedGstAmount   = watch("gstAmount");
  const gstClaimable       = watch("gstClaimable");
  const isDeductible       = watch("isDeductible");
  const deductiblePct      = watch("deductiblePct");
  const watchedCurrency    = watch("currency");
  const watchedDate        = watch("incomeDate");
  const cfg = watchedCategory ? CATEGORY_CONFIG[watchedCategory] : null;

  const fetchExchangeRateIncome = async (curr: string, date: string) => {
    if (curr === "SGD") { setExchangeRate("1.000000"); return; }
    setFetchingRate(true);
    try {
      const res = await fetch(`/api/exchange-rate?currency=${curr}&date=${date}`, { credentials: "include" });
      if (res.ok) { const d = await res.json(); setExchangeRate(d.rateSGD.toFixed(6)); }
    } catch { /* silently ignore */ } finally { setFetchingRate(false); }
  };

  useEffect(() => {
    if (watchedCurrency !== "SGD") fetchExchangeRateIncome(watchedCurrency, watchedDate);
    else setExchangeRate("1.000000");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedCurrency, watchedDate]);

  // Fetch revenue accounts
  useEffect(() => {
    fetch("/api/accounting/accounts", { credentials: "include" })
      .then(r => r.ok ? r.json() : [])
      .then((all: any[]) => setRevenueAccounts(all.filter((a: any) => a.type === "revenue" && a.isActive)))
      .catch(() => {});
  }, []);

  function autoCalcGst(netAmount: string, claimable: boolean, treatment: string) {
    const net = parseFloat(netAmount);
    if (!claimable || treatment !== "standard_rated" || isNaN(net) || net <= 0) {
      setValue("gstAmount", "");
      return;
    }
    setValue("gstAmount", (net * gstRate / 100).toFixed(2));
  }

  function onCategoryChange(key: string) {
    setValue("category", key);
    const c = CATEGORY_CONFIG[key];
    if (c) {
      setValue("gstTreatment", c.defaultGst);
      setValue("isDeductible", c.deductible);
      setValue("deductiblePct", c.pct);
      setValue("gstClaimable", c.gstClaimable);
      autoCalcGst(watchedAmount, c.gstClaimable, c.defaultGst);
    }
  }

  function onAmountChange(raw: string) {
    const cleaned = numericOnly(raw);
    setValue("amount", cleaned);
    autoCalcGst(cleaned, gstClaimable, watchedGstTreatment);
  }

  function onGstClaimableChange(checked: boolean) {
    setValue("gstClaimable", checked);
    const treatment = checked && watchedGstTreatment !== "standard_rated" ? "standard_rated" : watchedGstTreatment;
    if (checked && watchedGstTreatment !== "standard_rated") setValue("gstTreatment", "standard_rated");
    if (!checked) { setValue("gstAmount", ""); return; }
    autoCalcGst(watchedAmount, checked, treatment);
  }

  function onGstTreatmentChange(v: string) {
    setValue("gstTreatment", v);
    if (v !== "standard_rated") {
      setValue("gstClaimable", false);
      setValue("gstAmount", "");
      return;
    }
    autoCalcGst(watchedAmount, gstClaimable, v);
  }

  function calcTotal() {
    return (parseFloat(watchedAmount) || 0) + (parseFloat(watchedGstAmount) || 0);
  }

  function calcDeductibleAmount() {
    if (!isDeductible) return 0;
    return (parseFloat(watchedAmount) || 0) * deductiblePct / 100;
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const remaining = MAX_FILES - attachments.length;
    if (remaining <= 0) { toast({ title: `Max ${MAX_FILES} files allowed`, variant: "destructive" }); return; }
    files.slice(0, remaining).forEach(file => {
      if (!ACCEPTED_TYPES.includes(file.type)) {
        toast({ title: `${file.name}: unsupported type. Use PDF, JPG, PNG, or WebP.`, variant: "destructive" });
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        toast({ title: `${file.name}: exceeds 5 MB limit`, variant: "destructive" });
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        const base64 = dataUrl.split(",")[1];
        setAttachments(prev => [...prev, { data: base64, mimeType: file.type, name: file.name, sizeKB: Math.round(file.size / 1024) }]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  };

  const removeAttachment = (i: number) => setAttachments(prev => prev.filter((_, idx) => idx !== i));

  const onSubmit = async (data: IncomeForm, status: "draft" | "confirmed") => {
    if (!data.amount || isNaN(parseFloat(data.amount))) {
      toast({ title: "Net amount is required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      // Always create as draft first so that confirmation can be processed cleanly and auto-post the journal entry
      const body = { ...data, status: "draft", exchangeRate: watchedCurrency !== "SGD" ? parseFloat(exchangeRate) || 1 : 1 };
      const res = await fetch("/api/income", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || "Failed to save"); }
      const created = await res.json();

      // Upload attachments
      for (const att of attachments) {
        await fetch(`/api/income/${created.id}/attachments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ fileName: att.name, mimeType: att.mimeType, fileData: att.data }),
        });
      }

      if (status === "confirmed") {
        const confirmRes = await fetch(`/api/income/${created.id}/confirm`, { method: "POST", credentials: "include" });
        if (!confirmRes.ok) { const e = await confirmRes.json(); throw new Error(e.error || "Failed to confirm"); }
      }

      toast({ title: status === "confirmed" ? "Income confirmed and posted." : "Income saved as draft." });
      await queryClient.invalidateQueries({ queryKey: ["income"] });
      setLocation("/accounting/income");
    } catch (e: any) {
      toast({ title: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const categoryNote = watchedCategory ? CATEGORY_CONFIG[watchedCategory]?.note : null;

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/accounting/income")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-[#2563EB]">New Income Entry</h1>
          <p className="text-sm text-muted-foreground">Record non-trade income — Singapore IRAS-aligned</p>
        </div>
      </div>

      <form onSubmit={e => e.preventDefault()}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader><CardTitle className="text-base">Income Details</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="incomeDate">Income Date <span className="text-destructive">*</span></Label>
                    <Input id="incomeDate" type="date" {...register("incomeDate", { required: true })} />
                    {errors.incomeDate && <p className="text-xs text-destructive">Date is required</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="currency">Currency</Label>
                    <Controller name="currency" control={form.control} render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                      </Select>
                    )} />
                  </div>
                </div>

                {watchedCurrency !== "SGD" && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 space-y-1.5">
                    <Label className="text-amber-800 font-medium text-xs flex items-center gap-1.5">
                      <Info className="h-3 w-3" />
                      Exchange Rate to SGD <span className="font-normal">(required for IRAS GST reporting)</span>
                    </Label>
                    <div className="flex gap-2 items-center">
                      <div className="flex items-center gap-1.5 flex-1 text-xs text-amber-700">
                        <span className="font-mono">1 {watchedCurrency} =</span>
                        <Input type="text" inputMode="decimal" value={exchangeRate}
                          onChange={e => setExchangeRate(e.target.value)}
                          className="h-7 font-mono text-xs w-32 bg-white" />
                        <span className="font-mono">SGD</span>
                      </div>
                      <button type="button" onClick={() => fetchExchangeRateIncome(watchedCurrency, watchedDate)}
                        disabled={fetchingRate}
                        className="flex items-center gap-1 text-xs text-amber-800 border border-amber-300 rounded px-2 h-7 bg-white hover:bg-amber-50 disabled:opacity-50">
                        <RefreshCw className={`h-3 w-3 ${fetchingRate ? "animate-spin" : ""}`} /> Fetch Rate
                      </button>
                    </div>
                    <p className="text-[10px] text-amber-600">Auto-fetched from public exchange rates for {watchedDate}. Verify with MAS for IRAS compliance.</p>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="payerName">Payer Name <span className="text-destructive">*</span></Label>
                  <Input id="payerName" placeholder="Who paid you?" {...register("payerName", { required: true })} />
                  {errors.payerName && <p className="text-xs text-destructive">Payer name is required</p>}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="description">Description <span className="text-destructive">*</span></Label>
                  <Input id="description" placeholder="Brief description of income" {...register("description", { required: true })} />
                  {errors.description && <p className="text-xs text-destructive">Description is required</p>}
                </div>

                <div className="space-y-1.5">
                  <Label>Category <span className="text-destructive">*</span></Label>
                  <Controller name="category" control={form.control} rules={{ required: true }} render={({ field }) => (
                    <Select value={field.value} onValueChange={onCategoryChange}>
                      <SelectTrigger><SelectValue placeholder="Select income category…" /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(CATEGORY_CONFIG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )} />
                  {errors.category && <p className="text-xs text-destructive">Category is required</p>}
                  {categoryNote && (
                    <p className="flex items-start gap-1.5 text-xs text-muted-foreground bg-muted/40 px-3 py-2 rounded">
                      <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-blue-500" />{categoryNote}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label>Revenue Account</Label>
                  <Controller name="accountId" control={form.control} render={({ field }) => (
                    <Select value={field.value || "none"} onValueChange={v => field.onChange(v === "none" ? "" : v)}>
                      <SelectTrigger><SelectValue placeholder="Select account…" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— None (defaults to 4200) —</SelectItem>
                        {revenueAccounts.map(a => <SelectItem key={a.id} value={String(a.id)}>{a.code} {a.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )} />
                  <p className="text-xs text-muted-foreground">Account to credit when income is confirmed. Defaults to 4200 Other Operating Revenue.</p>
                </div>
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
                      placeholder="0.00"
                      value={watchedAmount}
                      onChange={e => onAmountChange(e.target.value)}
                      className="[appearance:textfield]"
                    />
                    {errors.amount && <p className="text-xs text-destructive">Amount is required</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="gstAmount">
                      GST Amount
                      {gstClaimable && watchedGstTreatment === "standard_rated" && (
                        <span className="ml-1 text-xs text-muted-foreground font-normal">(auto @ {gstRate}%)</span>
                      )}
                    </Label>
                    <Input
                      id="gstAmount"
                      inputMode="decimal"
                      placeholder="0.00"
                      value={watchedGstAmount}
                      onChange={e => setValue("gstAmount", numericOnly(e.target.value))}
                      className={cn("[appearance:textfield]", gstClaimable && watchedGstTreatment === "standard_rated" && "bg-muted/50 text-muted-foreground")}
                      readOnly={gstClaimable && watchedGstTreatment === "standard_rated"}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>GST Treatment</Label>
                  <Controller name="gstTreatment" control={form.control} render={({ field }) => (
                    <Select value={field.value} onValueChange={onGstTreatmentChange}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{GST_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                    </Select>
                  )} />
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
              <CardHeader><CardTitle className="text-base">Payment Details</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <BankAccountField
                  paymentMethod={watch("paymentMethod")}
                  onPaymentMethodChange={(v) => setValue("paymentMethod", v)}
                  selectedBankAccount={selectedBank}
                  onBankAccountChange={setSelectedBank}
                  paymentMethods={PAYMENT_METHODS}
                />

                <div className="space-y-1.5">
                  <Label htmlFor="reference">Reference / Bank Ref</Label>
                  <Input id="reference" placeholder="Bank ref, grant approval no., cheque no." {...register("reference")} />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea id="notes" placeholder="Any additional notes" rows={3} {...register("notes")} />
                </div>
              </CardContent>
            </Card>

            {/* Attachments card */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Paperclip className="h-4 w-4" />
                    Attachments
                    {attachments.length > 0 && (
                      <span className="text-xs font-normal bg-primary/10 text-primary rounded-full px-2 py-0.5">
                        {attachments.length}
                      </span>
                    )}
                  </CardTitle>
                  {attachments.length < MAX_FILES && (
                    <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                      <Upload className="h-3.5 w-3.5 mr-1.5" />Add Files
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={handleFileChange}
                />

                {attachments.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 text-center hover:border-primary/40 hover:bg-muted/20 transition-colors"
                  >
                    <Paperclip className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                    <p className="text-sm font-medium text-muted-foreground">Click to attach receipts or bills</p>
                    <p className="text-xs text-muted-foreground/70 mt-1">PDF, JPG, PNG, WebP — up to 5 MB each, max {MAX_FILES} files</p>
                  </button>
                ) : (
                  <div className="space-y-2">
                    {attachments.map((att, i) => (
                      <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg border bg-muted/30">
                        <AttachmentIcon mimeType={att.mimeType} className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{att.name}</p>
                          <p className="text-xs text-muted-foreground">{att.sizeKB} KB</p>
                        </div>
                        <button type="button" onClick={() => removeAttachment(i)}
                          className="shrink-0 text-muted-foreground hover:text-destructive transition-colors p-1 rounded">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                    {attachments.length < MAX_FILES && (
                      <button type="button" onClick={() => fileInputRef.current?.click()}
                        className="w-full flex items-center justify-center gap-2 p-2 rounded-lg border-2 border-dashed border-muted-foreground/20 text-xs text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors">
                        <Upload className="h-3 w-3" /> Add more files
                      </button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right column */}
          <div className="space-y-6">
            <Card className={cfg && !cfg.deductible ? "border-red-200 bg-red-50/30" : cfg?.pct === 50 ? "border-amber-200 bg-amber-50/30" : "border-green-200 bg-green-50/30"}>
              <CardHeader><CardTitle className="text-sm">IRAS Summary</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Net Amount</span>
                  <span className="font-mono font-medium">{watchedCurrency} {(parseFloat(watchedAmount) || 0).toLocaleString("en-SG", { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">GST ({gstRate}%)</span>
                  <span className="font-mono text-blue-600">{watchedCurrency} {(parseFloat(watchedGstAmount) || 0).toLocaleString("en-SG", { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between border-t pt-2 font-medium">
                  <span>Total (incl. GST)</span>
                  <span className="font-mono">{watchedCurrency} {calcTotal().toLocaleString("en-SG", { minimumFractionDigits: 2 })}</span>
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
                  <span className="font-mono font-bold text-green-700">{watchedCurrency} {calcDeductibleAmount().toLocaleString("en-SG", { minimumFractionDigits: 2 })}</span>
                </div>
              </CardContent>
            </Card>

            <div className="flex flex-col gap-3">
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={saving}
                onClick={handleSubmit(data => onSubmit(data, "draft"))}
              >
                Save as Draft
              </Button>
              <Button
                type="button"
                className="w-full"
                disabled={saving}
                onClick={handleSubmit(data => onSubmit(data, "confirmed"))}
              >
                Confirm & Post
              </Button>
            </div>
            <p className="text-xs text-muted-foreground text-center">
              "Confirm & Post" will create a journal entry and include this income in GST F5.
            </p>
          </div>
        </div>
      </form>
    </div>
  );
}
