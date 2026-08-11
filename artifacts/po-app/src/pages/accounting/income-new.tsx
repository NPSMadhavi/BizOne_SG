import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useForm, Controller } from "react-hook-form";
import { useGetSettings } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Info, RefreshCw, Paperclip, X, FileText, FileImage, Upload } from "lucide-react";

interface IncomeForm {
  incomeDate: string;
  payerName: string;
  description: string;
  category: string;
  amount: string;
  gstTreatment: string;
  gstAmount: string;
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

const CATEGORY_CONFIG: Record<string, { label: string; defaultGst: string; note: string }> = {
  rental_income:     { label: "Rental Income",                  defaultGst: "standard_rated", note: "Standard-rated if you charge GST on rent. Residential rent is exempt." },
  interest_income:   { label: "Interest Income",                defaultGst: "exempt",          note: "Bank interest and loan interest received are GST-exempt." },
  dividend_income:   { label: "Dividend Income",                defaultGst: "exempt",          note: "Singapore one-tier dividends are exempt from GST." },
  grant_subsidy:     { label: "Government Grant / Subsidy",     defaultGst: "out_of_scope",    note: "Government grants (EDG, SkillsFuture, etc.) are out of scope of GST." },
  commission_income: { label: "Commission Income",              defaultGst: "standard_rated", note: "Commission for services rendered — standard-rated." },
  service_fee:       { label: "Service Fee (Non-trade)",        defaultGst: "standard_rated", note: "Non-recurring service fees — standard-rated." },
  royalty_income:    { label: "Royalty Income",                 defaultGst: "standard_rated", note: "Royalties for use of IP in Singapore — standard-rated." },
  gain_on_disposal:  { label: "Gain on Disposal of Asset",      defaultGst: "out_of_scope",    note: "Capital gains from asset sales are generally out of scope of GST." },
  forex_gain:        { label: "Foreign Exchange Gain",          defaultGst: "out_of_scope",    note: "Realised FX gains are out of scope of GST." },
  other_income:      { label: "Other Income",                   defaultGst: "standard_rated", note: "Review GST treatment before confirming." },
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
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
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
  const watchedCurrency    = watch("currency");
  const watchedDate        = watch("incomeDate");

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

  // Auto-set GST treatment when category changes
  useEffect(() => {
    if (watchedCategory && CATEGORY_CONFIG[watchedCategory]) {
      setValue("gstTreatment", CATEGORY_CONFIG[watchedCategory].defaultGst);
    }
  }, [watchedCategory, setValue]);

  // Auto-calc GST amount when amount or treatment changes
  useEffect(() => {
    const amt = parseFloat(watchedAmount || "0");
    if (watchedGstTreatment === "standard_rated" && amt > 0) {
      setValue("gstAmount", (amt * gstRate / 100).toFixed(2));
    } else {
      setValue("gstAmount", "0.00");
    }
  }, [watchedAmount, watchedGstTreatment, gstRate, setValue]);

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
    setSaving(true);
    try {
      const body = { ...data, status, exchangeRate: watchedCurrency !== "SGD" ? parseFloat(exchangeRate) || 1 : 1 };
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
      setLocation(`/accounting/income/${created.id}`);
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
                    <Select value={field.value} onValueChange={field.onChange}>
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
              <CardHeader><CardTitle className="text-base">Payment Details</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Payment Method</Label>
                  <Controller name="paymentMethod" control={form.control} render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{PAYMENT_METHODS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                    </Select>
                  )} />
                </div>

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
            <Card>
              <CardHeader><CardTitle className="text-base">Amount & GST</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="amount">Net Amount (excl. GST) <span className="text-destructive">*</span></Label>
                  <Input
                    id="amount"
                    inputMode="decimal"
                    placeholder="0.00"
                    {...register("amount", { required: true })}
                    onChange={e => setValue("amount", numericOnly(e.target.value))}
                  />
                  {errors.amount && <p className="text-xs text-destructive">Amount is required</p>}
                </div>

                <div className="space-y-1.5">
                  <Label>GST Treatment</Label>
                  <Controller name="gstTreatment" control={form.control} render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{GST_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                    </Select>
                  )} />
                </div>

                {watchedGstTreatment === "standard_rated" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="gstAmount">GST Amount ({gstRate}%)</Label>
                    <Input
                      id="gstAmount"
                      inputMode="decimal"
                      placeholder="0.00"
                      {...register("gstAmount")}
                      onChange={e => setValue("gstAmount", numericOnly(e.target.value))}
                    />
                    <p className="text-xs text-muted-foreground">Auto-calculated; adjust if needed.</p>
                  </div>
                )}

                {/* Summary */}
                <div className="pt-2 border-t space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Net Amount</span>
                    <span className="font-mono">SGD {parseFloat(watchedAmount || "0").toFixed(2)}</span>
                  </div>
                  {watchedGstTreatment === "standard_rated" && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">GST ({gstRate}%)</span>
                      <span className="font-mono">SGD {parseFloat(watch("gstAmount") || "0").toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-semibold border-t pt-1">
                    <span>Total Received</span>
                    <span className="font-mono">SGD {(parseFloat(watchedAmount || "0") + parseFloat(watchedGstTreatment === "standard_rated" ? watch("gstAmount") || "0" : "0")).toFixed(2)}</span>
                  </div>
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
