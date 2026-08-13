import { useState, useEffect, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Info, RefreshCw, Paperclip, X, FileText, FileImage, Upload, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

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
}

interface Account { id: number; code: string; name: string; }

interface AttachFile {
  data: string;
  mimeType: string;
  name: string;
  sizeKB: number;
}

interface SavedAttachment {
  id: number;
  fileName: string;
  mimeType: string;
  createdAt: string;
}

const CATEGORY_CONFIG: Record<string, { label: string; defaultGst: string; note: string; deductible: boolean; pct: number; gstClaimable: boolean }> = {
  rental_income:     { label: "Rental Income",             defaultGst: "standard_rated", note: "Standard-rated if you charge GST on rent. Residential rent is exempt.", deductible: true,  pct: 100, gstClaimable: true },
  interest_income:   { label: "Interest Income",           defaultGst: "exempt",          note: "Bank interest and loan interest received are GST-exempt.", deductible: true,  pct: 100, gstClaimable: false },
  dividend_income:   { label: "Dividend Income",           defaultGst: "exempt",          note: "Singapore one-tier dividends are exempt from GST.", deductible: true,  pct: 100, gstClaimable: false },
  grant_subsidy:     { label: "Government Grant / Subsidy",defaultGst: "out_of_scope",    note: "Government grants are out of scope of GST.", deductible: false, pct: 0,   gstClaimable: false },
  commission_income: { label: "Commission Income",         defaultGst: "standard_rated", note: "Commission for services rendered — standard-rated.", deductible: true,  pct: 100, gstClaimable: true },
  service_fee:       { label: "Service Fee (Non-trade)",   defaultGst: "standard_rated", note: "Non-recurring service fees — standard-rated.", deductible: true,  pct: 100, gstClaimable: true },
  royalty_income:    { label: "Royalty Income",            defaultGst: "standard_rated", note: "Royalties for use of IP in Singapore — standard-rated.", deductible: true,  pct: 100, gstClaimable: true },
  gain_on_disposal:  { label: "Gain on Disposal of Asset", defaultGst: "out_of_scope",    note: "Capital gains from asset sales are generally out of scope.", deductible: false, pct: 0,   gstClaimable: false },
  forex_gain:        { label: "Foreign Exchange Gain",     defaultGst: "out_of_scope",    note: "Realised FX gains are out of scope of GST.", deductible: true,  pct: 100, gstClaimable: false },
  other_income:      { label: "Other Income",              defaultGst: "standard_rated", note: "Review GST treatment before confirming.", deductible: true,  pct: 100, gstClaimable: true },
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

export default function IncomeEdit() {
  const params = useParams<{ id: string }>();
  const id = parseInt(params.id);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [revenueAccounts, setRevenueAccounts] = useState<Account[]>([]);
  const [exchangeRate, setExchangeRate] = useState("1.000000");
  const [fetchingRate, setFetchingRate] = useState(false);
  const [newAttachments, setNewAttachments] = useState<AttachFile[]>([]);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/income/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["income"] });
      toast({ title: "Income record deleted." });
      setLocation("/accounting/income");
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const { data: settings } = useGetSettings({});
  const gstRate = settings?.gstRate ?? 9;

  const { data: existing, isLoading, error: loadError } = useQuery({
    queryKey: ["income", id],
    queryFn: async () => {
      const res = await fetch(`/api/income/${id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    enabled: !isNaN(id),
    staleTime: 0,
    refetchOnMount: "always",
  });

  const { data: savedAttachments = [], refetch: refetchAttachments } = useQuery<SavedAttachment[]>({
    queryKey: ["income-attachments", id],
    queryFn: async () => {
      const res = await fetch(`/api/income/${id}/attachments`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !isNaN(id),
  });

  const form = useForm<IncomeForm>({ defaultValues: {
    incomeDate: "", payerName: "", description: "", category: "",
    amount: "", gstTreatment: "standard_rated", gstAmount: "",
    gstClaimable: false, isDeductible: true, deductiblePct: 100,
    currency: "SGD", paymentMethod: "bank_transfer", accountId: "", reference: "", notes: "",
  }});

  const { watch, setValue, register, handleSubmit, reset, formState: { errors } } = form;
  const watchedCategory     = watch("category");
  const watchedGstTreatment = watch("gstTreatment");
  const watchedAmount       = watch("amount");
  const watchedGstAmount    = watch("gstAmount");
  const gstClaimable        = watch("gstClaimable");
  const isDeductible        = watch("isDeductible");
  const deductiblePct       = watch("deductiblePct");
  const watchedCurrency     = watch("currency");
  const watchedDate         = watch("incomeDate");
  const cfg = watchedCategory ? CATEGORY_CONFIG[watchedCategory] : null;

  // Populate form when data loads
  useEffect(() => {
    if (existing && !loaded) {
      reset({
        incomeDate:    existing.incomeDate ?? "",
        payerName:     existing.payerName ?? "",
        description:   existing.description ?? "",
        category:      existing.category ?? "",
        amount:        String(existing.amount ?? ""),
        gstTreatment:  existing.gstTreatment ?? "standard_rated",
        gstAmount:     String(existing.gstAmount ?? "0.00"),
        gstClaimable:  !!existing.gstClaimable,
        isDeductible:  existing.isDeductible !== false,
        deductiblePct: existing.deductiblePct ?? 100,
        currency:      existing.currency ?? "SGD",
        paymentMethod: existing.paymentMethod ?? "bank_transfer",
        accountId:     existing.accountId ? String(existing.accountId) : "",
        reference:     existing.reference ?? "",
        notes:         existing.notes ?? "",
      });
      if (existing.exchangeRate) setExchangeRate(parseFloat(existing.exchangeRate).toFixed(6));
      setLoaded(true);
    }
  }, [existing, loaded, reset]);

  const fetchExchangeRateIncome = async (curr: string, date: string) => {
    if (curr === "SGD") { setExchangeRate("1.000000"); return; }
    setFetchingRate(true);
    try {
      const res = await fetch(`/api/exchange-rate?currency=${curr}&date=${date}`, { credentials: "include" });
      if (res.ok) { const d = await res.json(); setExchangeRate(d.rateSGD.toFixed(6)); }
    } catch { /* silently ignore */ } finally { setFetchingRate(false); }
  };

  // Fetch revenue accounts
  useEffect(() => {
    fetch("/api/accounting/accounts", { credentials: "include" })
      .then(r => r.ok ? r.json() : [])
      .then((all: any[]) => setRevenueAccounts(all.filter((a: any) => a.type === "revenue" && a.isActive)))
      .catch(() => {});
  }, []);

  const categoryNote = watchedCategory ? CATEGORY_CONFIG[watchedCategory]?.note : null;

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
    const totalCount = savedAttachments.length + newAttachments.length;
    const remaining = MAX_FILES - totalCount;
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
        const base64 = (reader.result as string).split(",")[1];
        setNewAttachments(prev => [...prev, { data: base64, mimeType: file.type, name: file.name, sizeKB: Math.round(file.size / 1024) }]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  };

  const deleteExistingAttachment = async (attId: number) => {
    setDeletingId(attId);
    try {
      const res = await fetch(`/api/income/${id}/attachments/${attId}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Failed to delete");
      await refetchAttachments();
      qc.invalidateQueries({ queryKey: ["income", id] });
    } catch {
      toast({ title: "Failed to delete attachment", variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  };

  const onSubmit = async (data: IncomeForm) => {
    if (!data.amount || isNaN(parseFloat(data.amount))) {
      toast({ title: "Net amount is required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/income/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ...data, exchangeRate: watchedCurrency !== "SGD" ? parseFloat(exchangeRate) || 1 : 1 }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || "Failed to save"); }

      // Upload any new attachments
      for (const att of newAttachments) {
        await fetch(`/api/income/${id}/attachments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ fileName: att.name, mimeType: att.mimeType, fileData: att.data }),
        });
      }

      toast({ title: "Income record updated." });
      await qc.invalidateQueries({ queryKey: ["income"] });
      await qc.invalidateQueries({ queryKey: ["income", id] });
      setLocation(`/accounting/income/${id}`);
    } catch (e: any) {
      toast({ title: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const totalAttachments = savedAttachments.length + newAttachments.length;

  if (isNaN(id)) return <div className="max-w-7xl mx-auto px-4 py-12 text-center text-destructive">Invalid income record.</div>;
  if (isLoading || !loaded) return <div className="max-w-7xl mx-auto px-4 py-12 text-center text-muted-foreground">Loading…</div>;
  if (loadError || !existing) return <div className="max-w-7xl mx-auto px-4 py-12 text-center text-destructive">Income record not found.</div>;

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" type="button" onClick={() => setLocation(`/accounting/income/${id}`)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-[#2563EB]">Edit Income Entry</h1>
            <p className="text-sm text-muted-foreground">Record #{id}</p>
          </div>
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

      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader><CardTitle className="text-base">Income Details</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Income Date <span className="text-destructive">*</span></Label>
                    <Input type="date" {...register("incomeDate", { required: true })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Currency</Label>
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
                  <Label>Payer Name <span className="text-destructive">*</span></Label>
                  <Input {...register("payerName", { required: true })} />
                </div>

                <div className="space-y-1.5">
                  <Label>Description <span className="text-destructive">*</span></Label>
                  <Input {...register("description", { required: true })} />
                </div>

                <div className="space-y-1.5">
                  <Label>Category <span className="text-destructive">*</span></Label>
                  <Controller name="category" control={form.control} rules={{ required: true }} render={({ field }) => (
                    <Select value={field.value} onValueChange={v => { field.onChange(v); onCategoryChange(v); }}>
                      <SelectTrigger><SelectValue placeholder="Select income category…" /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(CATEGORY_CONFIG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )} />
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
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Amounts & GST</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Net Amount (excl. GST) <span className="text-destructive">*</span></Label>
                    <Input
                      inputMode="decimal"
                      placeholder="0.00"
                      value={watchedAmount}
                      onChange={e => onAmountChange(e.target.value)}
                      className="[appearance:textfield]"
                    />
                    {errors.amount && <p className="text-xs text-destructive">Amount is required</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label>
                      GST Amount
                      {gstClaimable && watchedGstTreatment === "standard_rated" && (
                        <span className="ml-1 text-xs text-muted-foreground font-normal">(auto @ {gstRate}%)</span>
                      )}
                    </Label>
                    <Input
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
                  <Label>Reference / Bank Ref</Label>
                  <Input {...register("reference")} />
                </div>
                <div className="space-y-1.5">
                  <Label>Notes</Label>
                  <Textarea rows={3} {...register("notes")} />
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
                    {totalAttachments > 0 && (
                      <span className="text-xs font-normal bg-primary/10 text-primary rounded-full px-2 py-0.5">
                        {totalAttachments}
                      </span>
                    )}
                  </CardTitle>
                  {totalAttachments < MAX_FILES && (
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

                {totalAttachments === 0 ? (
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
                    {/* Existing saved attachments */}
                    {savedAttachments.map(att => (
                      <div key={att.id} className="flex items-center gap-3 p-2.5 rounded-lg border bg-muted/30">
                        <AttachmentIcon mimeType={att.mimeType} className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{att.fileName}</p>
                          <p className="text-xs text-muted-foreground">Saved</p>
                        </div>
                        <button type="button"
                          disabled={deletingId === att.id}
                          onClick={() => deleteExistingAttachment(att.id)}
                          className="shrink-0 text-muted-foreground hover:text-destructive transition-colors p-1 rounded disabled:opacity-50">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}

                    {/* New (pending) attachments */}
                    {newAttachments.map((att, i) => (
                      <div key={`new-${i}`} className="flex items-center gap-3 p-2.5 rounded-lg border border-dashed border-primary/30 bg-primary/5">
                        <AttachmentIcon mimeType={att.mimeType} className="h-4 w-4 shrink-0 text-primary/60" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{att.name}</p>
                          <p className="text-xs text-muted-foreground">{att.sizeKB} KB · pending save</p>
                        </div>
                        <button type="button"
                          onClick={() => setNewAttachments(prev => prev.filter((_, idx) => idx !== i))}
                          className="shrink-0 text-muted-foreground hover:text-destructive transition-colors p-1 rounded">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}

                    {totalAttachments < MAX_FILES && (
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
              <Button type="submit" className="w-full" disabled={saving}>Save Changes</Button>
              <Button type="button" variant="outline" className="w-full" disabled={saving} onClick={() => setLocation(`/accounting/income/${id}`)}>Cancel</Button>
            </div>
          </div>
        </div>
      </form>
      {/* Delete dialog */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete income record?</AlertDialogTitle>
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
