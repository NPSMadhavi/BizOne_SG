import { useState, useCallback, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
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
import { ArrowLeft, Upload, Info, AlertTriangle, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { BankAccountField } from "@/components/bank-account-field";

interface ExpenseForm {
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
  paymentMethod: string;
  notes: string;
  receiptData: string;
  receiptMimeType: string;
  status: string;
}

interface CategoryConfig {
  label: string;
  deductible: boolean;
  pct: number;
  gstClaimable: boolean;
  note: string;
}

const CATEGORY_CONFIG: Record<string, CategoryConfig> = {
  staff_costs: { label: "Staff Costs", deductible: true, pct: 100, gstClaimable: false, note: "Salaries, CPF, bonuses — GST not applicable" },
  rental: { label: "Rental", deductible: true, pct: 100, gstClaimable: true, note: "Office space, equipment rental" },
  professional_fees: { label: "Professional Fees", deductible: true, pct: 100, gstClaimable: true, note: "Legal, audit, consulting fees" },
  advertising: { label: "Advertising & Marketing", deductible: true, pct: 100, gstClaimable: true, note: "" },
  office_supplies: { label: "Office Supplies", deductible: true, pct: 100, gstClaimable: true, note: "Stationery, printing, pantry supplies" },
  utilities: { label: "Utilities", deductible: true, pct: 100, gstClaimable: true, note: "Electricity, internet, telephone" },
  travel: { label: "Travel & Transport", deductible: true, pct: 100, gstClaimable: true, note: "Business travel, taxis, public transport" },
  entertainment: { label: "Entertainment (S14C)", deductible: true, pct: 50, gstClaimable: true, note: "IRAS Section 14C — only 50% is tax-deductible" },
  motor_vehicle_private: { label: "Motor Vehicle (Private Car)", deductible: false, pct: 0, gstClaimable: false, note: "IRAS: private cars are entirely non-deductible; no GST claim" },
  motor_vehicle_commercial: { label: "Motor Vehicle (Commercial)", deductible: true, pct: 100, gstClaimable: true, note: "Goods vehicles, vans, lorries — fully deductible" },
  training: { label: "Training & Development", deductible: true, pct: 100, gstClaimable: true, note: "Staff courses, seminars, certifications" },
  insurance: { label: "Insurance", deductible: true, pct: 100, gstClaimable: true, note: "Business insurance premiums" },
  bank_charges: { label: "Bank Charges", deductible: true, pct: 100, gstClaimable: false, note: "Bank charges are exempt from GST" },
  fixed_assets: { label: "Fixed Assets", deductible: true, pct: 100, gstClaimable: true, note: "Capital expenditure on fixed assets" },
  other: { label: "Other Expenses", deductible: true, pct: 100, gstClaimable: true, note: "Any other business expense" },
};

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

interface CategoryComboboxProps {
  value: string;
  onChange: (key: string) => void;
}

function CategoryCombobox({ value, onChange }: CategoryComboboxProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const selectedLabel = value ? (CATEGORY_CONFIG[value]?.label ?? value) : "";
  const displayValue = open ? query : selectedLabel;

  const filtered = Object.entries(CATEGORY_CONFIG).filter(([, cfg]) =>
    cfg.label.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={wrapperRef} className="relative">
      <Input
        placeholder="Type to search category…"
        value={displayValue}
        onFocus={() => { setOpen(true); setQuery(""); }}
        onChange={e => { setQuery(e.target.value); setOpen(true); }}
        onKeyDown={e => { if (e.key === "Escape") { setOpen(false); setQuery(""); } }}
        autoComplete="off"
      />
      {open && (
        <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-md max-h-56 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">No categories found</div>
          ) : (
            filtered.map(([key, cfg]) => (
              <div
                key={key}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground",
                  value === key && "bg-accent/60 font-medium"
                )}
                onMouseDown={e => {
                  e.preventDefault();
                  onChange(key);
                  setOpen(false);
                  setQuery("");
                }}
              >
                {value === key && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                {value !== key && <span className="w-3.5 shrink-0" />}
                {cfg.label}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
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

  const form = useForm<ExpenseForm>({
    defaultValues: {
      expenseDate: today(),
      vendorName: "",
      description: "",
      category: "",
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
  const selectedCategory = watch("category");
  const gstClaimable = watch("gstClaimable");
  const isDeductible = watch("isDeductible");
  const deductiblePct = watch("deductiblePct");
  const amount = watch("amount");
  const gstAmount = watch("gstAmount");
  const currency = watch("currency");

  const cfg = selectedCategory ? CATEGORY_CONFIG[selectedCategory] : null;

  function autoCalcGst(netAmount: string, claimable: boolean) {
    const net = parseFloat(netAmount);
    if (!claimable || isNaN(net) || net <= 0) {
      setValue("gstAmount", "");
      return;
    }
    const gst = net * gstRate / 100;
    setValue("gstAmount", gst.toFixed(2));
  }

  function onCategoryChange(key: string) {
    setValue("category", key);
    const c = CATEGORY_CONFIG[key];
    if (c) {
      setValue("isDeductible", c.deductible);
      setValue("deductiblePct", c.pct);
      setValue("gstClaimable", c.gstClaimable);
      autoCalcGst(amount, c.gstClaimable);
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const category = params.get("category");
    if (category && CATEGORY_CONFIG[category]) {
      onCategoryChange(category);
    }
    const vendor = params.get("vendor");
    if (vendor) setValue("vendorName", vendor);
    const description = params.get("description");
    if (description) setValue("description", description);
    const reference = params.get("reference");
    if (reference) setValue("notes", `Invoice ref: ${reference}`);
  }, []);

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
    if (!data.category) { toast({ title: "Please select a category", variant: "destructive" }); return; }
    setSaving(true);
    try {
      // Always create as draft first so that confirmation can be processed cleanly and auto-post the journal entry
      const payload = { ...data, status: "draft" };
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
                <Input id="vendorName" placeholder="e.g. ACME Pte. Ltd." {...register("vendorName", { required: true })} />
                {errors.vendorName && <p className="text-xs text-destructive">Required</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="description">Description <span className="text-destructive">*</span></Label>
                <Input id="description" placeholder="e.g. Office rental for October 2025" {...register("description", { required: true })} />
                {errors.description && <p className="text-xs text-destructive">Required</p>}
              </div>

              <div className="space-y-1.5">
                <Label>IRAS Category <span className="text-destructive">*</span></Label>
                <CategoryCombobox value={selectedCategory} onChange={onCategoryChange} />
                {cfg?.note && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Info className="h-3 w-3 shrink-0" /> {cfg.note}
                  </p>
                )}
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
                    placeholder="0.00"
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

              {selectedCategory === "motor_vehicle_private" && (
                <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 p-3">
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-800">Private car expenses are <strong>non-deductible</strong> and GST input tax cannot be claimed under IRAS rules (Section 14(1)(c)).</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Notes & Receipt</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="notes">Internal Notes</Label>
                <Textarea id="notes" placeholder="Any additional notes…" rows={3} {...register("notes")} />
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
          <Card className={cfg && !cfg.deductible ? "border-red-200 bg-red-50/30" : cfg?.pct === 50 ? "border-amber-200 bg-amber-50/30" : "border-green-200 bg-green-50/30"}>
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
