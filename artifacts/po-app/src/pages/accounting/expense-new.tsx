import { useState, useCallback } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Upload, Info, AlertTriangle } from "lucide-react";

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

export default function ExpenseNew() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [receiptFileName, setReceiptFileName] = useState<string | null>(null);

  const form = useForm<ExpenseForm>({
    defaultValues: {
      expenseDate: today(),
      vendorName: "",
      description: "",
      category: "",
      amount: "",
      gstAmount: "0.00",
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

  function onCategoryChange(val: string) {
    setValue("category", val);
    const c = CATEGORY_CONFIG[val];
    if (c) {
      setValue("isDeductible", c.deductible);
      setValue("deductiblePct", c.pct);
      setValue("gstClaimable", c.gstClaimable);
      if (!c.gstClaimable) setValue("gstAmount", "0.00");
    }
  }

  const onReceiptChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setReceiptFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(",")[1];
      setValue("receiptData", base64);
      setValue("receiptMimeType", file.type);
    };
    reader.readAsDataURL(file);
  }, [setValue]);

  function calcNetAmount() {
    const gross = parseFloat(amount) || 0;
    const gst = parseFloat(gstAmount) || 0;
    return gross - gst;
  }

  function calcDeductibleAmount() {
    const net = calcNetAmount();
    if (!isDeductible) return 0;
    return net * deductiblePct / 100;
  }

  async function onSubmit(data: ExpenseForm, statusOverride?: string) {
    if (!data.category) { toast({ title: "Please select a category", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const payload = { ...data, status: statusOverride ?? data.status };
      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || "Failed to save"); }
      const created = await res.json();
      toast({ title: "Expense saved." });
      setLocation(`/accounting/expenses/${created.id}`);
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
        <h1 className="text-2xl font-bold">New Expense</h1>
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
                  <Label htmlFor="currency">Currency</Label>
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
                <Select value={selectedCategory} onValueChange={onCategoryChange}>
                  <SelectTrigger><SelectValue placeholder="Select a category…" /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(CATEGORY_CONFIG).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {cfg?.note && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Info className="h-3 w-3 shrink-0" /> {cfg.note}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label>Payment Method</Label>
                <Select value={watch("paymentMethod")} onValueChange={v => setValue("paymentMethod", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PAYMENT_METHODS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Amounts & GST</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="amount">Total Amount (incl. GST) <span className="text-destructive">*</span></Label>
                  <Input id="amount" type="number" step="0.01" min="0" placeholder="0.00" {...register("amount", { required: true })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="gstAmount">GST Amount</Label>
                  <Input id="gstAmount" type="number" step="0.01" min="0" placeholder="0.00" {...register("gstAmount")} />
                </div>
              </div>

              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">GST Input Tax Claimable</p>
                  <p className="text-xs text-muted-foreground">Claim GST back from IRAS if vendor is GST-registered</p>
                </div>
                <Switch checked={gstClaimable} onCheckedChange={v => setValue("gstClaimable", v)} />
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

              {cfg?.label === "Motor Vehicle (Private Car)" && (
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
                <span className="text-muted-foreground">Gross Amount</span>
                <span className="font-mono font-medium">{currency} {(parseFloat(amount) || 0).toLocaleString("en-SG", { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">GST Amount</span>
                <span className="font-mono text-blue-600">{currency} {(parseFloat(gstAmount) || 0).toLocaleString("en-SG", { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between border-t pt-2">
                <span className="text-muted-foreground">Net (excl. GST)</span>
                <span className="font-mono font-medium">{currency} {calcNetAmount().toLocaleString("en-SG", { minimumFractionDigits: 2 })}</span>
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
