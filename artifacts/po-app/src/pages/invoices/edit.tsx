import { useState, useEffect, useRef, Fragment } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useParams, useLocation } from "wouter";
import { ContactAutocomplete } from "@/components/contact-autocomplete";
import { useGetInvoice, useUpdateInvoice, getGetInvoiceQueryKey, useGetSettings, getGetSettingsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Save, ArrowLeft, Eye, Lock, Package, Plus, Layers, AlignLeft, AlignCenter } from "lucide-react";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { SerialPickerDialog } from "@/components/serial-picker-dialog";
import { StockItemPickerDialog, type StockItemSelection } from "@/components/stock-item-picker-dialog";
import { PaymentTermsSelect } from "@/components/payment-terms-select";
import { DirectoryPickerButton } from "@/components/directory-picker-button";
import { CurrencyMismatchDialog } from "@/components/currency-mismatch-dialog";
import { DeliveryDateField } from "@/components/delivery-date-field";
import { IssueDateField } from "@/components/issue-date-field";
import { PdfPreviewModal } from "@/components/pdf-preview-modal";
import { PORefSelect } from "@/components/po-ref-select";
import { generateInvoice_PDF } from "@/lib/pdf";
import { useAuth } from "@/contexts/auth-context";

const itemSchema = z.object({
  type: z.enum(["item", "section"]).default("item"),
  sectionLabel: z.string().default(""),
  sectionAlign: z.enum(["left", "center"]).default("left"),
  partNumber: z.string(),
  description: z.string(),
  qty: z.coerce.number().min(0).default(1),
  unitPrice: z.coerce.number().min(0),
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
  customerName: z.string().min(1, "Required"),
  customerAddress: z.string().optional(),
  customerContact: z.string().optional(),
  customerContactEmail: z.string().email("Invalid email").optional().or(z.literal("")),
  issueDate: z.string().optional(),
  deliveryDate: z.string().optional(),
  paymentTerms: z.string().optional(),
  poRefNo: z.string().optional(),
  notes: z.string().optional(),
  currency: z.string().default("SGD"),
  status: z.enum(["draft", "confirmed", "cancelled"]),
  tax: z.coerce.number().min(0).max(100).default(9),
  discountAmount: z.coerce.number().min(0).default(0),
  isPrivate: z.boolean().default(false),
  items: z.array(itemSchema).min(1),
});

export default function InvoiceEdit() {
  const params = useParams();
  const id = Number(params.id);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { selectedCompany, user } = useAuth();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [isOverseas, setIsOverseas] = useState(false);
  const initialized = useRef(false);
  const [directoryCurrency, setDirectoryCurrency] = useState<string>("");
  const [directoryCurrencyName, setDirectoryCurrencyName] = useState<string>("");
  const [pendingConfirmValues, setPendingConfirmValues] = useState<z.infer<typeof schema> | null>(null);
  const [currencyDialogOpen, setCurrencyDialogOpen] = useState(false);
  const [pickerIndex, setPickerIndex] = useState<number | null>(null);
  const [stockPickerIndex, setStockPickerIndex] = useState<number | null>(null);

  const newlyReservedIds = useRef<Set<number>>(new Set());

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

  async function reserveSerials(ids: number[], invoiceNum?: string) {
    if (ids.length === 0) return;
    try {
      await fetch("/api/stock-serials/reserve", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serialIds: ids,
          invoiceId: id,
          invoiceNumber: invoiceNum || `INV-${id}`,
          reservedByUser: (user as any)?.username || "unknown",
        }),
      });
    } catch { }
  }

  useEffect(() => {
    const handleBeforeUnload = () => {
      const ids = Array.from(newlyReservedIds.current);
      if (ids.length > 0) {
        navigator.sendBeacon("/api/stock-serials/release", new Blob([JSON.stringify({ serialIds: ids })], { type: "application/json" }));
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      const ids = Array.from(newlyReservedIds.current);
      releaseSerials(ids);
    };
  }, []);

  const { data: doc } = useGetInvoice(id, {
    query: { queryKey: getGetInvoiceQueryKey(id), enabled: !!id },
  });

  const { data: docSettings } = useGetSettings({
    query: { queryKey: getGetSettingsQueryKey() },
  });

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      customerName: "", customerAddress: "", customerContact: "", customerContactEmail: "",
      issueDate: "", deliveryDate: "", paymentTerms: "", poRefNo: "", notes: "",
      currency: "SGD", status: "draft", tax: 9,
      discountAmount: 0,
      isPrivate: false,
      items: [{ type: "item" as const, sectionLabel: "", partNumber: "", description: "", qty: 1, unitPrice: 0, discount: 0, isStockItem: false, selectedSerials: [], selectedSerialIds: [] }],
    },
  });

  useEffect(() => {
    if (doc && !initialized.current) {
      const items = (doc.items as any[]) || [];
      form.reset({
        customerName: doc.customerName,
        customerAddress: doc.customerAddress || "",
        customerContact: doc.customerContact || "",
        customerContactEmail: (doc as any).customerContactEmail || "",
        issueDate: (doc as any).issueDate || "",
        deliveryDate: (doc as any).deliveryDate || "",
        paymentTerms: doc.paymentTerms || "",
        notes: doc.notes || "",
        currency: doc.currency || "SGD",
        status: doc.status as any,
        tax: doc.subtotal && Number(doc.subtotal) > 0 ? Math.round((Number(doc.tax) / Number(doc.subtotal)) * 1000) / 10 : 9,
        discountAmount: Number((doc as any).discountAmount) || 0,
        isPrivate: (doc as any).isPrivate ?? false,
        poRefNo: (doc as any).poRefNo || "",
        items: items.length > 0 ? items.map((i: any) => ({
          type: i.type || "item",
          sectionLabel: i.sectionLabel || "",
          sectionAlign: (i.sectionAlign as "left" | "center") || "left",
          partNumber: i.partNumber || "",
          description: i.description || "",
          qty: Number(i.qty) || 1,
          unitPrice: Number(i.unitPrice) || 0,
          discount: Number(i.discount) || 0,
          isStockItem: i.isStockItem ?? false,
          selectedSerials: i.selectedSerials ?? [],
          selectedSerialIds: i.selectedSerialIds ?? [],
        })) : [{ type: "item" as const, sectionLabel: "", partNumber: "", description: "", qty: 1, unitPrice: 0, discount: 0, isStockItem: false, selectedSerials: [], selectedSerialIds: [] }],
      });
      initialized.current = true;
    }
  }, [doc]);

  const { fields, append, remove, insert } = useFieldArray({ control: form.control, name: "items" });
  const updateMutation = useUpdateInvoice();
  const items = form.watch("items");
  const taxPercent = form.watch("tax") || 0;

  const appendLock = useRef(false);
  useEffect(() => {
    if (!initialized.current) return;
    const sub = form.watch((values, { name }) => {
      if (!name?.startsWith("items.")) return;
      const match = name.match(/^items\.(\d+)\./);
      if (!match) return;
      const idx = parseInt(match[1], 10);
      const allItems = values.items ?? [];
      if (idx !== allItems.length - 1) return;
      const last = allItems[idx];
      if (!last) return;
      const descText = String(last.description || "").replace(/<[^>]*>/g, "").trim();
      const isEmpty =
        (!last.partNumber || String(last.partNumber).trim() === "") &&
        descText === "" &&
        (Number(last.unitPrice) === 0) && (Number(last.qty) <= 1);
      if ((last as any).type === "section") return;
      if (!isEmpty && !appendLock.current) {
        appendLock.current = true;
        const focused = document.activeElement as HTMLElement | null;
        append({ type: "item", sectionLabel: "", partNumber: "", description: "", qty: 1, unitPrice: 0, discount: 0, isStockItem: false, selectedSerials: [], selectedSerialIds: [] });
        requestAnimationFrame(() => { focused?.focus(); appendLock.current = false; });
      }
    });
    return () => sub.unsubscribe();
  }, [form, append]);

  const currency = form.watch("currency") || "SGD";

  const subtotal = items.reduce((s, i) => (i as any).type === "section" ? s : s + (Number(i.qty) || 0) * (Number(i.unitPrice) || 0) * (1 - (Number(i.discount) || 0) / 100), 0);
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
    const filledItems = values.items.filter(i =>
      (i as any).type === "section"
        ? ((i as any).sectionLabel || "").trim() !== ""
        : i.partNumber.trim() !== "" || i.description.trim() !== ""
    );
    const realItems = filledItems.filter((i: any) => i.type !== "section");
    if (realItems.length === 0) {
      toast({ title: "Error", description: "At least one line item required.", variant: "destructive" });
      setIsSubmitting(false);
      return;
    }
    const itemsWithAmount = filledItems.map(i => {
      if ((i as any).type === "section") return { type: "section", sectionLabel: (i as any).sectionLabel || "", sectionAlign: (i as any).sectionAlign || "left" };
      const disc = Number(i.discount) || 0;
      return { ...i, discount: disc, amount: (i.qty * i.unitPrice * (1 - disc / 100)).toFixed(2) };
    });
    const saveStatus = openPreview ? "confirmed" : values.status;
    updateMutation.mutate({ id, data: { ...values, status: saveStatus, discountAmount: values.discountAmount, poRefNo: values.poRefNo || null, items: itemsWithAmount } as any }, {
      onSuccess: async () => {
        await queryClient.refetchQueries({ queryKey: getGetInvoiceQueryKey(id) });
        setIsSubmitting(false);
        if (openPreview) { setPreviewOpen(true); }
        else { toast({ title: "Draft saved." }); }
      },
      onError: (err: any) => {
        toast({ title: "Error", description: err?.message || "Update failed.", variant: "destructive" });
        setIsSubmitting(false);
      },
    });
  }

  if (!doc) return <div className="flex items-center justify-center h-64"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>;

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => setLocation(`/invoices/${id}`)}><ArrowLeft className="h-4 w-4" /></Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Edit Invoice</h1>
          <p className="text-muted-foreground mt-1">{doc.invNumber}</p>
        </div>
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
                    <FormControl><Textarea className="resize-none" rows={3} {...field} /></FormControl></FormItem>
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
                <FormField control={form.control} name="status" render={({ field }) => (
                  <FormItem><FormLabel>Status</FormLabel>
                    <select value={field.value} onChange={e => field.onChange(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring">
                      <option value="draft">Draft</option>
                      <option value="confirmed">Confirmed</option>
                      <option value="cancelled">Cancelled</option>
                    </select></FormItem>
                )} />
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
                    <FormControl><PaymentTermsSelect value={field.value} onChange={field.onChange} /></FormControl></FormItem>
                )} />
                <FormField control={form.control} name="poRefNo" render={({ field }) => (
                  <FormItem><FormLabel>PO Reference No.</FormLabel>
                    <FormControl><PORefSelect value={field.value ?? ""} onChange={field.onChange} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="isPrivate" render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center gap-3 rounded-lg border px-4 py-3">
                      <Lock className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="flex-1"><FormLabel className="text-sm font-medium cursor-pointer">Private Document</FormLabel>
                        <p className="text-xs text-muted-foreground mt-0.5">Only visible to you and admins</p></div>
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
                <div className="flex items-center gap-3">
                  <CardTitle className="text-lg">Line Items</CardTitle>
                  <Button type="button" variant="outline" size="sm" className="gap-1.5 text-xs h-7" onClick={() => append({ type: "item" as const, sectionLabel: "", sectionAlign: "left" as const, partNumber: "", description: "", qty: 1, unitPrice: 0, discount: 0, isStockItem: false, selectedSerials: [], selectedSerialIds: [] })}>
                    <Plus className="h-3 w-3" /> Add Item
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="gap-1.5 text-xs h-7" onClick={() => append({ type: "section" as const, sectionLabel: "", sectionAlign: "left" as const, partNumber: "", description: "", qty: 1, unitPrice: 0, discount: 0, isStockItem: false, selectedSerials: [], selectedSerialIds: [] })}>
                    <Layers className="h-3 w-3" /> Add Section
                  </Button>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">Overseas / Export</span>
                    <Switch
                      checked={isOverseas}
                      onCheckedChange={(v) => {
                        setIsOverseas(v);
                        form.setValue("tax", v ? 0 : (docSettings?.gstRate ?? 0));
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
                      const itemType = form.watch(`items.${index}.type`);
                      const insertBar = (
                        <tr className="group/ins border-0 h-5">
                          <td colSpan={9} className="p-0 overflow-visible">
                            <div className="relative flex items-center h-5">
                              <div className="absolute inset-x-0 top-1/2 h-px bg-border/40 group-hover/ins:bg-primary/40 transition-colors" />
                              <div className="absolute left-1/2 -translate-x-1/2 opacity-0 group-hover/ins:opacity-100 transition-opacity">
                                <button type="button" onClick={() => insert(index, { type: "section" as const, sectionLabel: "", sectionAlign: "left" as const, partNumber: "", description: "", qty: 1, unitPrice: 0, discount: 0, isStockItem: false, selectedSerials: [], selectedSerialIds: [] })} className="flex items-center gap-1 text-[10px] text-primary bg-background border border-primary/30 rounded px-2 leading-5 whitespace-nowrap shadow-sm">
                                  <Layers className="h-2.5 w-2.5" /> + section here
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                      if (itemType === "section") {
                        const emptyItem = { type: "item" as const, sectionLabel: "", sectionAlign: "left" as const, partNumber: "", description: "", qty: 1, unitPrice: 0, discount: 0, isStockItem: false, selectedSerials: [], selectedSerialIds: [] };
                        return (
                          <Fragment key={field.id}>
                            {insertBar}
                            <tr className="border-b bg-muted/40">
                              <td colSpan={9} className="px-4 py-2">
                                <div className="flex items-start gap-2">
                                  <Layers className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-2" />
                                  <div className="flex-1 min-w-0">
                                    <FormField control={form.control} name={`items.${index}.sectionLabel`} render={({ field: f }) => (
                                      <FormItem><FormControl>
                                        <RichTextEditor value={f.value} onChange={f.onChange} placeholder="Section header text..." />
                                      </FormControl></FormItem>
                                    )} />
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0 mt-1">
                                    <FormField control={form.control} name={`items.${index}.sectionAlign`} render={({ field: f }) => (
                                      <FormItem><FormControl>
                                        <Button type="button" variant="ghost" size="icon" title={f.value === "center" ? "Switch to left-align" : "Switch to center-align"} className={cn("h-7 w-7", f.value === "center" ? "text-primary bg-primary/10" : "text-muted-foreground")} onClick={() => f.onChange(f.value === "center" ? "left" : "center")}>
                                          {f.value === "center" ? <AlignCenter className="h-3.5 w-3.5" /> : <AlignLeft className="h-3.5 w-3.5" />}
                                        </Button>
                                      </FormControl></FormItem>
                                    )} />
                                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => remove(index)}>
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                </div>
                              </td>
                            </tr>
                            <tr className="border-0">
                              <td colSpan={9} className="px-4 py-1">
                                <button
                                  type="button"
                                  onClick={() => insert(index + 1, emptyItem)}
                                  className="flex items-center justify-center gap-1.5 w-full text-[11px] text-primary/60 hover:text-primary border border-dashed border-primary/25 hover:border-primary/50 rounded-md py-1 transition-colors"
                                >
                                  <Plus className="h-3 w-3" /> Add Line Item here
                                </button>
                              </td>
                            </tr>
                          </Fragment>
                        );
                      }
                      const qty = Number(form.watch(`items.${index}.qty`)) || 0;
                      const price = Number(form.watch(`items.${index}.unitPrice`)) || 0;
                      const disc = Number(form.watch(`items.${index}.discount`)) || 0;
                      return (
                        <Fragment key={field.id}>
                          {insertBar}
                          <tr className="border-b last:border-0 hover:bg-muted/20">
                          <td className="px-4 py-2 text-muted-foreground text-xs">{index + 1}</td>
                          <td className="px-4 py-2"><FormField control={form.control} name={`items.${index}.partNumber`} render={({ field }) => (
                            <FormItem><FormControl>
                              <div className="flex items-center gap-1">
                                <Input className="h-8 text-sm border-0 bg-transparent focus:bg-background" placeholder="Optional" {...field} />
                                <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-primary" onClick={() => setStockPickerIndex(index)} title="Pick from stock">
                                  <Package className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </FormControl></FormItem>
                          )} /></td>
                          <td className="px-4 py-2 align-top"><FormField control={form.control} name={`items.${index}.description`} render={({ field }) => (
                            <FormItem><FormControl><RichTextEditor value={field.value} onChange={field.onChange} placeholder="Item description" /></FormControl></FormItem>
                          )} /></td>
                          <td className="px-4 py-2"><FormField control={form.control} name={`items.${index}.qty`} render={({ field }) => (
                            <FormItem><FormControl><Input inputMode="numeric" className="h-8 text-sm text-right border-0 bg-transparent focus:bg-background" {...field} /></FormControl></FormItem>
                          )} /></td>
                          <td className="px-4 py-2"><FormField control={form.control} name={`items.${index}.unitPrice`} render={({ field }) => (
                            <FormItem><FormControl><Input inputMode="decimal" className="h-8 text-sm text-right border-0 bg-transparent focus:bg-background" placeholder="0.00" {...field} /></FormControl></FormItem>
                          )} /></td>
                          <td className="px-4 py-2"><FormField control={form.control} name={`items.${index}.discount`} render={({ field }) => (
                            <FormItem><FormControl><Input inputMode="decimal" className="h-8 text-sm text-right border-0 bg-transparent focus:bg-background" placeholder="0" {...field} onChange={e => field.onChange(parseFloat(e.target.value) || 0)} value={field.value || ""} /></FormControl></FormItem>
                          )} /></td>
                          <td className="px-4 py-2 text-right text-muted-foreground text-sm">{fmt(qty * price * (1 - disc / 100))}</td>
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
                          <td className="px-4 py-2">{fields.length > 1 && (
                            <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => {
                              const ids = form.getValues(`items.${index}.selectedSerialIds`) || [];
                              if (ids.length > 0) {
                                ids.forEach((id: number) => newlyReservedIds.current.delete(id));
                                releaseSerials(ids);
                              }
                              remove(index);
                            }}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}</td>
                        </tr>
                        </Fragment>
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
            <CardHeader className="pb-4"><CardTitle className="text-lg">Notes / Terms &amp; Conditions</CardTitle></CardHeader>
            <CardContent>
              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem><FormControl><Textarea placeholder="Terms, conditions, or special instructions..." className="resize-none" rows={4} {...field} /></FormControl><FormMessage /></FormItem>
              )} />
            </CardContent>
          </Card>

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => setLocation(`/invoices/${id}`)}>Cancel</Button>
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              className="gap-2 min-w-32"
              onClick={form.handleSubmit(v => doSubmit(v, false))}
            >
              <Save className="h-4 w-4" />
              {isSubmitting ? "Saving..." : "Save Changes"}
            </Button>
            <Button
              type="button"
              disabled={isSubmitting}
              variant="secondary"
              className="gap-2"
              onClick={form.handleSubmit(v => onSubmit(v, true))}
            >
              <Eye className="h-4 w-4" />
              Save & Preview
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
            toRelease.forEach(id => newlyReservedIds.current.delete(id));
            toReserve.forEach(id => newlyReservedIds.current.add(id));
            releaseSerials(toRelease);
            reserveSerials(toReserve, doc?.invNumber);
            form.setValue(`items.${pickerIndex!}.selectedSerials`, serials);
            form.setValue(`items.${pickerIndex!}.selectedSerialIds`, serialIds);
            setPickerIndex(null);
          }}
        />
      )}

      <StockItemPickerDialog
        open={stockPickerIndex !== null}
        onOpenChange={(open) => { if (!open) setStockPickerIndex(null); }}
        currentInvoiceId={id}
        onSelect={({ item, selectedSerials, selectedSerialIds, qty }: StockItemSelection) => {
          if (stockPickerIndex === null) return;
          const prevIds: number[] = form.getValues(`items.${stockPickerIndex}.selectedSerialIds`) || [];
          const toRelease = prevIds.filter(id => !selectedSerialIds.includes(id));
          toRelease.forEach(id => newlyReservedIds.current.delete(id));
          selectedSerialIds.forEach(id => newlyReservedIds.current.add(id));
          releaseSerials(toRelease);
          reserveSerials(selectedSerialIds, doc?.invNumber);
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
      <PdfPreviewModal
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        title={doc ? `Invoice ${doc.invNumber}` : "Invoice Preview"}
        generatePdf={(opts) => generateInvoice_PDF(doc!, selectedCompany, docSettings as any, opts)}
        pdfFilename={doc ? `${doc.invNumber}.pdf` : "invoice.pdf"}
        defaultEmailTo={(doc as any)?.customerContactEmail || ""}
        defaultEmailSubject={doc ? `Invoice ${doc.invNumber}` : "Invoice"}
        onEdit={() => { setPreviewOpen(false); }}
      />
    </div>
  );
}
