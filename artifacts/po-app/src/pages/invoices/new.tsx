import { useState, useEffect, useRef } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation } from "wouter";
import { useCreateInvoice, useGetSettings, getGetSettingsQueryKey } from "@workspace/api-client-react";
import { ContactAutocomplete } from "@/components/contact-autocomplete";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Save, Eye, Lock, Package } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { SerialPickerDialog } from "@/components/serial-picker-dialog";
import { StockItemPickerDialog, type StockItemSelection } from "@/components/stock-item-picker-dialog";
import { generateInvoice_PDF } from "@/lib/pdf";
import { PaymentTermsSelect } from "@/components/payment-terms-select";
import { DirectoryPickerButton } from "@/components/directory-picker-button";
import { CurrencyMismatchDialog } from "@/components/currency-mismatch-dialog";
import { DeliveryDateField } from "@/components/delivery-date-field";
import { IssueDateField, getToday } from "@/components/issue-date-field";
import { PdfPreviewModal } from "@/components/pdf-preview-modal";
import { useAuth } from "@/contexts/auth-context";

const itemSchema = z.object({
  partNumber: z.string(),
  description: z.string(),
  qty: z.coerce.number().min(1, "Must be > 0"),
  unitPrice: z.coerce.number().min(0, "Cannot be negative"),
  discount: z.coerce.number().min(0).max(100).default(0),
  isStockItem: z.boolean().default(false),
  selectedSerials: z.array(z.string()).default([]),
  selectedSerialIds: z.array(z.number()).default([]),
});

const CURRENCIES = [
  { code: "SGD", label: "SGD – S$" },
  { code: "USD", label: "USD – $" },
  { code: "EUR", label: "EUR – €" },
  { code: "GBP", label: "GBP – £" },
  { code: "MYR", label: "MYR – RM" },
  { code: "INR", label: "INR – ₹" },
];

const schema = z.object({
  customerName: z.string().min(1, "Customer name is required"),
  customerAddress: z.string().optional(),
  customerContact: z.string().optional(),
  customerContactEmail: z.string().email("Invalid email").optional().or(z.literal("")),
  issueDate: z.string().optional(),
  deliveryDate: z.string().optional(),
  paymentTerms: z.string().optional(),
  notes: z.string().optional(),
  currency: z.string().default("SGD"),
  tax: z.coerce.number().min(0).max(100).default(9),
  discountAmount: z.coerce.number().min(0).default(0),
  isPrivate: z.boolean().default(false),
  items: z.array(itemSchema).min(1, "At least one item is required"),
});

export default function InvoiceNew() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { selectedCompany, user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [savedDoc, setSavedDoc] = useState<any>(null);
  const [isOverseas, setIsOverseas] = useState(false);
  const [directoryCurrency, setDirectoryCurrency] = useState<string>("");
  const [directoryCurrencyName, setDirectoryCurrencyName] = useState<string>("");
  const [pendingConfirmValues, setPendingConfirmValues] = useState<z.infer<typeof schema> | null>(null);
  const [currencyDialogOpen, setCurrencyDialogOpen] = useState(false);
  const [pickerIndex, setPickerIndex] = useState<number | null>(null);
  const [stockPickerIndex, setStockPickerIndex] = useState<number | null>(null);

  const allReservedIds = useRef<Set<number>>(new Set());

  async function releaseSerials(ids: number[]) {
    if (ids.length === 0) return;
    try {
      await fetch("/api/stock-serials/release", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serialIds: ids }),
      });
    } catch { }
  }

  async function reserveSerials(ids: number[], invoiceNumber?: string) {
    if (ids.length === 0) return;
    try {
      await fetch("/api/stock-serials/reserve", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serialIds: ids,
          invoiceNumber: invoiceNumber || nextInvNumber || "PENDING",
          reservedByUser: (user as any)?.username || "unknown",
        }),
      });
    } catch { }
  }

  useEffect(() => {
    const handleBeforeUnload = () => {
      const ids = Array.from(allReservedIds.current);
      if (ids.length > 0) {
        navigator.sendBeacon("/api/stock-serials/release", new Blob([JSON.stringify({ serialIds: ids })], { type: "application/json" }));
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      const ids = Array.from(allReservedIds.current);
      releaseSerials(ids);
    };
  }, []);

  const { data: settings } = useGetSettings({ query: { queryKey: getGetSettingsQueryKey() } });

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      customerName: "", customerAddress: "", customerContact: "", customerContactEmail: "",
      issueDate: getToday(), deliveryDate: "", paymentTerms: "30 Days Net", notes: "",
      currency: "SGD",
      tax: 9,
      discountAmount: 0,
      isPrivate: false,
      items: [{ partNumber: "", description: "", qty: 1, unitPrice: 0, discount: 0, isStockItem: false, selectedSerials: [], selectedSerialIds: [] }],
    },
  });

  useEffect(() => {
    if (settings) form.setValue("tax", settings.gstRate);
  }, [settings]);

  // Aria prefill — populated by the AI agent via navigateTo
  useEffect(() => {
    const prefill = (window as any).__ariaPrefill;
    if (!prefill) return;
    (window as any).__ariaPrefill = null;
    const blankItem = { partNumber: "", description: "", qty: 1, unitPrice: 0, discount: 0, isStockItem: false, selectedSerials: [], selectedSerialIds: [] };
    form.reset({
      customerName: prefill.customerName || "",
      customerAddress: prefill.customerAddress || "",
      customerContact: prefill.customerContact || "",
      customerContactEmail: prefill.customerContactEmail || "",
      currency: prefill.currency || "SGD",
      paymentTerms: prefill.paymentTerms || "30 Days Net",
      notes: prefill.notes || "",
      issueDate: getToday(),
      deliveryDate: "",
      tax: settings?.gstRate ?? 9,
      discountAmount: prefill.discountAmount ?? 0,
      isPrivate: false,
      items: prefill.items?.length
        ? prefill.items.map((it: any) => ({ ...blankItem, partNumber: it.partNumber || "", description: it.description || "", qty: Number(it.qty) || 1, unitPrice: Number(it.unitPrice) || 0 }))
        : [blankItem],
    });
  }, []);

  const { fields, append, remove } = useFieldArray({ control: form.control, name: "items" });
  const createMutation = useCreateInvoice();

  const nextInvNumber = (() => {
    if (!settings) return null;
    const prefix = (settings as any).invPrefix ?? "";
    const counter = (parseInt((settings as any).invCounter) || 0) + 1;
    const suffix = (settings as any).invSuffix ?? "";
    const padded = String(counter).padStart(4, "0");
    return `${prefix}${prefix ? "-" : ""}${padded}${suffix}`;
  })();

  const items = form.watch("items");
  const taxPercent = form.watch("tax") || 0;

  const appendLock = useRef(false);
  useEffect(() => {
    const sub = form.watch((values, { name }) => {
      if (!name?.startsWith("items.")) return;
      const match = name.match(/^items\.(\d+)\./);
      if (!match) return;
      const idx = parseInt(match[1], 10);
      const allItems = values.items ?? [];
      if (idx !== allItems.length - 1) return;
      const last = allItems[idx];
      if (!last) return;
      const isEmpty =
        (!last.partNumber || String(last.partNumber).trim() === "") &&
        (!last.description || String(last.description).trim() === "") &&
        (Number(last.unitPrice) === 0) && (Number(last.qty) <= 1);
      if (!isEmpty && !appendLock.current) {
        appendLock.current = true;
        const focused = document.activeElement as HTMLElement | null;
        append({ partNumber: "", description: "", qty: 1, unitPrice: 0, discount: 0, isStockItem: false, selectedSerials: [], selectedSerialIds: [] });
        requestAnimationFrame(() => { focused?.focus(); appendLock.current = false; });
      }
    });
    return () => sub.unsubscribe();
  }, [form, append]);

  const currency = form.watch("currency") || "SGD";

  const subtotal = items.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.unitPrice) || 0) * (1 - (Number(i.discount) || 0) / 100), 0);
  const discountAmt = form.watch("discountAmount") || 0;
  const taxableAmount = subtotal - discountAmt;
  const taxAmount = taxableAmount * (taxPercent / 100);
  const totalAmount = taxableAmount + taxAmount;

  const CURRENCY_LOCALE: Record<string, string> = { SGD: "en-SG", USD: "en-US", EUR: "en-IE", GBP: "en-GB", MYR: "ms-MY", INR: "en-IN" };
  const fmt = (v: number) => new Intl.NumberFormat(CURRENCY_LOCALE[currency] || "en", { style: "currency", currency }).format(v);

  async function onSubmit(values: z.infer<typeof schema>, openPreview = false) {
    if (openPreview && directoryCurrency && values.currency !== directoryCurrency) {
      setPendingConfirmValues(values);
      setCurrencyDialogOpen(true);
      return;
    }
    await doSubmit(values, openPreview);
  }

  async function doSubmit(values: z.infer<typeof schema>, openPreview = false) {
    setIsSubmitting(true);
    const filledItems = values.items.filter(i => i.partNumber.trim() !== "" || i.description.trim() !== "");
    if (filledItems.length === 0) {
      toast({ title: "Error", description: "At least one line item is required.", variant: "destructive" });
      setIsSubmitting(false);
      return;
    }
    const itemsWithAmount = filledItems.map(i => {
      const disc = Number(i.discount) || 0;
      return { ...i, discount: disc, amount: (i.qty * i.unitPrice * (1 - disc / 100)).toFixed(2) };
    });
    createMutation.mutate({ data: { ...values, status: openPreview ? "confirmed" : "draft", discountAmount: values.discountAmount, items: itemsWithAmount } as any }, {
      onSuccess: (data) => {
        setIsSubmitting(false);
        if (openPreview) {
          setSavedDoc(data);
          setPreviewOpen(true);
        } else {
          toast({ title: "Draft saved." });
          setLocation("/invoices");
        }
      },
      onError: (err: any) => {
        toast({ title: "Error", description: err?.message || "Failed to create invoice.", variant: "destructive" });
        setIsSubmitting(false);
      },
    });
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">New Invoice</h1>
          <p className="text-muted-foreground mt-1">Create a new customer invoice.</p>
        </div>
        {nextInvNumber && (
          <div className="text-right">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Invoice Number</p>
            <p className="text-lg font-semibold font-mono">{nextInvNumber}</p>
          </div>
        )}
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Currency</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {CURRENCIES.map(c => (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => form.setValue("currency", c.code)}
                    className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${currency === c.code ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader className="pb-4 flex flex-row items-center justify-between">
                <CardTitle className="text-lg">Customer Details</CardTitle>
                <DirectoryPickerButton
                  type="customer"
                  onSelect={(c) => {
                    form.setValue("customerName", c.name);
                    form.setValue("customerAddress", c.fullAddress);
                    form.setValue("customerContact", c.contactPerson);
                    form.setValue("customerContactEmail", c.contactEmail);
                    if (c.effectiveGstRate !== undefined) form.setValue("tax", c.effectiveGstRate);
                    if (c.currency) {
                      form.setValue("currency", c.currency);
                      setDirectoryCurrency(c.currency);
                      setDirectoryCurrencyName(c.name);
                    }
                  }}
                />
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField control={form.control} name="customerName" render={({ field }) => (
                  <FormItem><FormLabel>Customer Name <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <ContactAutocomplete
                        type="customer"
                        value={field.value}
                        onChange={field.onChange}
                        placeholder="Acme Corp"
                        onSelect={(c) => {
                          form.setValue("customerName", c.name);
                          if (c.address) form.setValue("customerAddress", c.address);
                          if (c.contact) form.setValue("customerContact", c.contact);
                          if (c.email) form.setValue("customerContactEmail", c.email);
                          if (c.deliveryAddress) form.setValue("deliveryAddress", c.deliveryAddress);
                        }}
                      />
                    </FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="customerAddress" render={({ field }) => (
                  <FormItem><FormLabel>Address</FormLabel>
                    <FormControl><Textarea placeholder="123 Business Rd..." className="resize-none" rows={3} {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="customerContact" render={({ field }) => (
                  <FormItem><FormLabel>Contact Person</FormLabel>
                    <FormControl><Input placeholder="John Doe" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="customerContactEmail" render={({ field }) => (
                  <FormItem><FormLabel>Contact Email</FormLabel>
                    <FormControl><Input placeholder="john@example.com" type="email" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-4"><CardTitle className="text-lg">Invoice Details</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <FormField control={form.control} name="issueDate" render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <IssueDateField value={field.value || ""} onChange={field.onChange} label="Invoice Date" />
                    </FormControl><FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="deliveryDate" render={({ field }) => (
                  <FormItem><FormLabel>Delivery Date</FormLabel>
                    <FormControl><DeliveryDateField value={field.value} onChange={field.onChange} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="paymentTerms" render={({ field }) => (
                  <FormItem><FormLabel>Payment Terms</FormLabel>
                    <FormControl><PaymentTermsSelect value={field.value} onChange={field.onChange} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="isPrivate" render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center gap-3 rounded-lg border px-4 py-3">
                      <Lock className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="flex-1">
                        <FormLabel className="text-sm font-medium cursor-pointer">Private Document</FormLabel>
                        <p className="text-xs text-muted-foreground mt-0.5">Only visible to you and admins</p>
                      </div>
                      <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                    </div>
                  </FormItem>
                )} />
              </CardContent>
            </Card>
          </div>

          <Card className="overflow-hidden">
            <CardHeader className="pb-4 bg-muted/20 border-b">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Line Items</CardTitle>
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">Overseas / Export</span>
                    <Switch
                      checked={isOverseas}
                      onCheckedChange={(v) => {
                        setIsOverseas(v);
                        form.setValue("tax", v ? 0 : (settings?.gstRate ?? 0));
                      }}
                    />
                  </div>
                  <FormField control={form.control} name="tax" render={({ field }) => (
                    <FormItem className="flex items-center gap-1">
                      <span className="text-sm text-muted-foreground">GST:</span>
                      <FormControl>
                        <Input type="number" min={0} max={100} step={0.5} {...field} disabled={isOverseas} className="w-16 h-7 text-sm text-right px-1" />
                      </FormControl>
                      <span className="text-sm text-muted-foreground">%</span>
                    </FormItem>
                  )} />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 text-xs text-muted-foreground uppercase border-b">
                    <tr>
                      <th className="px-4 py-3 text-left w-8">#</th>
                      <th className="px-4 py-3 text-left w-36">Item / Part Number</th>
                      <th className="px-4 py-3 text-left">Description</th>
                      <th className="px-4 py-3 text-right w-20">Qty</th>
                      <th className="px-4 py-3 text-right w-28">Unit Price</th>
                      <th className="px-4 py-3 text-right w-16">Disc %</th>
                      <th className="px-4 py-3 text-right w-28">Amount</th>
                      <th className="px-4 py-3 text-center w-24">Serials</th>
                      <th className="px-4 py-3 w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {fields.map((field, index) => {
                      const qty = Number(form.watch(`items.${index}.qty`)) || 0;
                      const price = Number(form.watch(`items.${index}.unitPrice`)) || 0;
                      const disc = Number(form.watch(`items.${index}.discount`)) || 0;
                      const amount = qty * price * (1 - disc / 100);
                      return (
                        <tr key={field.id} className="border-b last:border-0 hover:bg-muted/20">
                          <td className="px-4 py-2 text-muted-foreground text-xs">{index + 1}</td>
                          <td className="px-4 py-2">
                            <FormField control={form.control} name={`items.${index}.partNumber`} render={({ field }) => (
                              <FormItem><FormControl>
                                <div className="flex items-center gap-1">
                                  <Input className="h-8 text-sm border-0 bg-transparent focus:bg-background" placeholder="Optional" {...field} />
                                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-primary" onClick={() => setStockPickerIndex(index)} title="Pick from stock">
                                    <Package className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </FormControl></FormItem>
                            )} />
                          </td>
                          <td className="px-4 py-2 align-top">
                            <FormField control={form.control} name={`items.${index}.description`} render={({ field }) => (
                              <FormItem><FormControl><RichTextEditor value={field.value} onChange={field.onChange} placeholder="Item description" /></FormControl></FormItem>
                            )} />
                          </td>
                          <td className="px-4 py-2">
                            <FormField control={form.control} name={`items.${index}.qty`} render={({ field }) => (
                              <FormItem><FormControl><Input inputMode="numeric" className="h-8 text-sm text-right border-0 bg-transparent focus:bg-background" {...field} /></FormControl></FormItem>
                            )} />
                          </td>
                          <td className="px-4 py-2">
                            <FormField control={form.control} name={`items.${index}.unitPrice`} render={({ field }) => (
                              <FormItem><FormControl><Input inputMode="decimal" className="h-8 text-sm text-right border-0 bg-transparent focus:bg-background" placeholder="0.00" {...field} /></FormControl></FormItem>
                            )} />
                          </td>
                          <td className="px-4 py-2">
                            <FormField control={form.control} name={`items.${index}.discount`} render={({ field }) => (
                              <FormItem><FormControl><Input inputMode="decimal" className="h-8 text-sm text-right border-0 bg-transparent focus:bg-background" placeholder="0" {...field} onChange={e => field.onChange(parseFloat(e.target.value) || 0)} value={field.value || ""} /></FormControl></FormItem>
                            )} />
                          </td>
                          <td className="px-4 py-2 text-right text-muted-foreground text-sm">{fmt(amount)}</td>
                          <td className="px-4 py-2 text-center">
                            <FormField control={form.control} name={`items.${index}.isStockItem`} render={({ field }) => (
                              <FormItem className="space-y-0">
                                <div className="flex flex-col items-center gap-1">
                                  <Checkbox checked={field.value} onCheckedChange={field.onChange} title="Serialized stock item" />
                                  {field.value && (
                                    <button
                                      type="button"
                                      onClick={() => setPickerIndex(index)}
                                      className="text-xs text-primary hover:underline whitespace-nowrap"
                                    >
                                      {(form.watch(`items.${index}.selectedSerials`) || []).length > 0
                                        ? `${(form.watch(`items.${index}.selectedSerials`) || []).length} S/N`
                                        : "Pick S/N"}
                                    </button>
                                  )}
                                </div>
                              </FormItem>
                            )} />
                          </td>
                          <td className="px-4 py-2">
                            {fields.length > 1 && (
                              <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => {
                                const ids = form.getValues(`items.${index}.selectedSerialIds`) || [];
                                if (ids.length > 0) {
                                  ids.forEach((id: number) => allReservedIds.current.delete(id));
                                  releaseSerials(ids);
                                }
                                remove(index);
                              }}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="border-t bg-muted/20 p-4 flex justify-end">
                <div className="w-72 space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{fmt(subtotal)}</span></div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground whitespace-nowrap">Invoice Discount (−)</span>
                    <FormField control={form.control} name="discountAmount" render={({ field }) => (
                      <FormItem className="m-0 p-0"><FormControl>
                        <Input inputMode="decimal" className="h-7 w-28 text-sm text-right" placeholder="0.00" {...field} onChange={e => field.onChange(parseFloat(e.target.value) || 0)} value={field.value || ""} />
                      </FormControl></FormItem>
                    )} />
                  </div>
                  {discountAmt > 0 && <div className="flex justify-between text-xs text-muted-foreground"><span>Net Amount</span><span>{fmt(taxableAmount)}</span></div>}
                  <div className="flex justify-between"><span className="text-muted-foreground">GST ({taxPercent}%)</span><span>{fmt(taxAmount)}</span></div>
                  <div className="flex justify-between font-semibold text-base border-t pt-2"><span>Total</span><span>{fmt(totalAmount)}</span></div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-4"><CardTitle className="text-lg">Additional Notes</CardTitle></CardHeader>
            <CardContent>
              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem><FormControl><Textarea placeholder="Terms, conditions, or special instructions..." className="resize-none" rows={3} {...field} /></FormControl><FormMessage /></FormItem>
              )} />
            </CardContent>
          </Card>

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => setLocation("/invoices")}>Cancel</Button>
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              className="gap-2"
              onClick={form.handleSubmit(v => doSubmit(v, false))}
            >
              <Save className="h-4 w-4" />
              {isSubmitting ? "Saving..." : "Save as Draft"}
            </Button>
            <Button
              type="button"
              disabled={isSubmitting}
              className="gap-2"
              onClick={form.handleSubmit(v => onSubmit(v, true))}
            >
              <Eye className="h-4 w-4" />
              {isSubmitting ? "Saving..." : "Save"}
            </Button>
          </div>
        </form>
      </Form>

      {pickerIndex !== null && (
        <SerialPickerDialog
          open={pickerIndex !== null}
          onOpenChange={(open) => { if (!open) setPickerIndex(null); }}
          partNumber={form.watch(`items.${pickerIndex}.partNumber`) || ""}
          currentSelected={form.watch(`items.${pickerIndex}.selectedSerials`) || []}
          currentSelectedIds={form.watch(`items.${pickerIndex}.selectedSerialIds`) || []}
          onConfirm={(serials, serialIds) => {
            const prevIds: number[] = form.getValues(`items.${pickerIndex!}.selectedSerialIds`) || [];
            const toRelease = prevIds.filter(id => !serialIds.includes(id));
            const toReserve = serialIds.filter(id => !prevIds.includes(id));
            toRelease.forEach(id => allReservedIds.current.delete(id));
            toReserve.forEach(id => allReservedIds.current.add(id));
            releaseSerials(toRelease);
            reserveSerials(toReserve);
            form.setValue(`items.${pickerIndex!}.selectedSerials`, serials);
            form.setValue(`items.${pickerIndex!}.selectedSerialIds`, serialIds);
            setPickerIndex(null);
          }}
        />
      )}

      <StockItemPickerDialog
        open={stockPickerIndex !== null}
        onOpenChange={(open) => { if (!open) setStockPickerIndex(null); }}
        onSelect={({ item, selectedSerials, selectedSerialIds, qty }: StockItemSelection) => {
          if (stockPickerIndex === null) return;
          const prevIds: number[] = form.getValues(`items.${stockPickerIndex}.selectedSerialIds`) || [];
          const toRelease = prevIds.filter(id => !selectedSerialIds.includes(id));
          toRelease.forEach(id => allReservedIds.current.delete(id));
          selectedSerialIds.forEach(id => allReservedIds.current.add(id));
          releaseSerials(toRelease);
          reserveSerials(selectedSerialIds);
          const serialRows: string[] = [];
          for (let i = 0; i < selectedSerials.length; i += 3) {
            serialRows.push(selectedSerials.slice(i, i + 3).join("&nbsp;&nbsp;&nbsp;"));
          }
          const serialHtml = serialRows.map((row) => `<p>${row}</p>`).join("");
          const desc = selectedSerials.length > 0
            ? `<p>${item.name}</p><p><strong>Serial Numbers:</strong></p>${serialHtml}`
            : `<p>${item.name}</p>`;
          form.setValue(`items.${stockPickerIndex}.partNumber`, item.code);
          form.setValue(`items.${stockPickerIndex}.description`, desc);
          form.setValue(`items.${stockPickerIndex}.unitPrice`, Number(item.unitPrice) || 0);
          form.setValue(`items.${stockPickerIndex}.isStockItem`, true);
          if (selectedSerials.length > 0) {
            form.setValue(`items.${stockPickerIndex}.qty`, selectedSerials.length);
            form.setValue(`items.${stockPickerIndex}.selectedSerials`, selectedSerials);
            form.setValue(`items.${stockPickerIndex}.selectedSerialIds`, selectedSerialIds);
          } else if (qty && qty > 0) {
            form.setValue(`items.${stockPickerIndex}.qty`, qty);
            form.setValue(`items.${stockPickerIndex}.selectedSerials`, []);
            form.setValue(`items.${stockPickerIndex}.selectedSerialIds`, []);
          }
          setStockPickerIndex(null);
        }}
      />

      <CurrencyMismatchDialog
        open={currencyDialogOpen}
        entityName={directoryCurrencyName}
        entityType="customer"
        defaultCurrency={directoryCurrency}
        selectedCurrency={form.getValues("currency")}
        onContinue={async () => {
          setCurrencyDialogOpen(false);
          if (pendingConfirmValues) await doSubmit(pendingConfirmValues, true);
          setPendingConfirmValues(null);
        }}
        onRevert={async () => {
          setCurrencyDialogOpen(false);
          if (pendingConfirmValues) {
            const updated = { ...pendingConfirmValues, currency: directoryCurrency };
            form.setValue("currency", directoryCurrency);
            await doSubmit(updated, true);
          }
          setPendingConfirmValues(null);
        }}
      />

      {savedDoc && (
        <PdfPreviewModal
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          title={`Invoice ${savedDoc.invNumber}`}
          generatePdf={(opts) => generateInvoice_PDF(savedDoc, selectedCompany, undefined, opts)}
          pdfFilename={`${savedDoc.invNumber}.pdf`}
          defaultEmailTo={savedDoc.customerContactEmail || ""}
          defaultEmailSubject={`Invoice ${savedDoc.invNumber}`}
          defaultEmailBody={`Dear ${savedDoc.customerContact || "Sir/Madam"},\n\nPlease find attached Invoice ${savedDoc.invNumber} for your records.\n\nPlease arrange payment as per the agreed terms.\n\nThank you.`}
          onEdit={() => { setPreviewOpen(false); setLocation(`/invoices/${savedDoc.id}/edit`); }}
        />
      )}
    </div>
  );
}
