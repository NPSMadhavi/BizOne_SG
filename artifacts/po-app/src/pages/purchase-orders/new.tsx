import { useState, useEffect, useRef, Fragment } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useCreatePurchaseOrder, useGetSettings, getGetSettingsQueryKey } from "@workspace/api-client-react";
import { ContactAutocomplete } from "@/components/contact-autocomplete";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { ItemImageField } from "@/components/item-image-field";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Save, Eye, Lock, Users, Plus, Layers, AlignCenter, AlignLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { generatePO_PDF } from "@/lib/pdf";
import { PaymentTermsSelect } from "@/components/payment-terms-select";
import { DeliveryDateField } from "@/components/delivery-date-field";
import { IssueDateField, getToday } from "@/components/issue-date-field";
import { PdfPreviewModal } from "@/components/pdf-preview-modal";
import { DirectoryPickerButton } from "@/components/directory-picker-button";
import { CurrencyMismatchDialog } from "@/components/currency-mismatch-dialog";
import { ImportItemsDialog } from "@/components/import-items-dialog";
import { useAuth } from "@/contexts/auth-context";

const itemSchema = z.object({
  type: z.enum(["item", "section"]).default("item"),
  sectionLabel: z.string().default(""),
  sectionAlign: z.enum(["left", "center"]).default("left"),
  partNumber: z.string(),
  uom: z.string().default(""),
  description: z.string(),
  qty: z.coerce.number().min(0).default(1),
  unitPrice: z.coerce.number().min(0, "Cannot be negative"),
  isStockItem: z.boolean().default(false),
  itemImage: z.string().default(""),
});

const CURRENCIES = [
  { code: "SGD", label: "SGD – S$" },
  { code: "USD", label: "USD – $" },
  { code: "EUR", label: "EUR – €" },
  { code: "GBP", label: "GBP – £" },
  { code: "MYR", label: "MYR – RM" },
  { code: "INR", label: "INR – ₹" },
];

const poSchema = z.object({
  vendorName: z.string().min(1, "Vendor name is required"),
  vendorAddress: z.string().optional(),
  vendorContact: z.string().optional(),
  vendorContactEmail: z.string().email("Invalid email").optional().or(z.literal("")),
  issueDate: z.string().optional(),
  quoteRefNo: z.string().optional(),
  deliveryAddress: z.string().optional(),
  deliveryDate: z.string().optional(),
  paymentTerms: z.string().optional(),
  notes: z.string().optional(),
  currency: z.string().default("SGD"),
  isPrivate: z.boolean().default(false),
  customerId: z.number().nullable().optional(),
  customerPoRef: z.string().optional(),
  tax: z.coerce.number().min(0).max(100).default(0),
  items: z.array(itemSchema).min(1, "At least one item is required"),
});

export default function PurchaseOrderNew() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { selectedCompany } = useAuth();
  const [isGenerating, setIsGenerating] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [savedPo, setSavedPo] = useState<any>(null);
  const [directoryCurrency, setDirectoryCurrency] = useState<string>("");
  const [directoryCurrencyName, setDirectoryCurrencyName] = useState<string>("");
  const [pendingConfirmValues, setPendingConfirmValues] = useState<z.infer<typeof poSchema> | null>(null);
  const [currencyDialogOpen, setCurrencyDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const { data: customers = [] } = useQuery<any[]>({
    queryKey: ["customers-for-po"],
    queryFn: async () => {
      const res = await fetch("/api/customers", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const form = useForm<z.infer<typeof poSchema>>({
    resolver: zodResolver(poSchema),
    defaultValues: {
      vendorName: "",
      vendorAddress: "",
      vendorContact: "",
      vendorContactEmail: "",
      issueDate: getToday(),
      quoteRefNo: "",
      deliveryAddress: "RSV Infotech Pte. Ltd.\nSingapore",
      deliveryDate: "",
      paymentTerms: "30 Days Net",
      notes: "",
      currency: "SGD",
      isPrivate: false,
      customerId: null,
      customerPoRef: "",
      tax: 9,
      items: [{ partNumber: "", description: "", qty: 1, unitPrice: 0, isStockItem: false, itemImage: "" }],
    },
  });

  const { fields, append, remove, insert } = useFieldArray({
    control: form.control,
    name: "items",
  });

  const createMutation = useCreatePurchaseOrder();
  const { data: settings } = useGetSettings({ query: { queryKey: getGetSettingsQueryKey() } });

  const nextPoNumber = (() => {
    if (!settings) return null;
    const prefix = (settings as any).poPrefix ?? "";
    const counter = (parseInt((settings as any).poCounter) || 0) + 1;
    const suffix = (settings as any).poSuffix ?? "";
    return `${prefix}${String(counter)}${suffix}`;
  })();

  const items = form.watch("items");
  const taxPercent = form.watch("tax") || 0;
  const currency = form.watch("currency") || "SGD";
  const isPrivate = form.watch("isPrivate");

  const appendLock = useRef(false);
  useEffect(() => {
    const subscription = form.watch((values, { name }) => {
      if (!name?.startsWith("items.")) return;
      const match = name.match(/^items\.(\d+)\./);
      if (!match) return;
      const changedIndex = parseInt(match[1], 10);
      const allItems = values.items ?? [];
      if (changedIndex !== allItems.length - 1) return;
      const last = allItems[changedIndex];
      if (!last) return;
      const lastIsEmpty =
        (!last.partNumber || String(last.partNumber).trim() === "") &&
        (!last.description || String(last.description).trim() === "") &&
        (last.unitPrice === undefined || last.unitPrice === null || String(last.unitPrice).trim() === "" || Number(last.unitPrice) === 0) &&
        (last.qty === undefined || last.qty === null || String(last.qty).trim() === "" || Number(last.qty) <= 1);
      if ((last as any).type === "section") return;
      if (!lastIsEmpty && !appendLock.current) {
        appendLock.current = true;
        const focused = document.activeElement as HTMLElement | null;
        append({ type: "item", sectionLabel: "", sectionAlign: "left", partNumber: "", uom: "", description: "", qty: 1, unitPrice: 0, isStockItem: false, itemImage: "" });
        requestAnimationFrame(() => {
          focused?.focus();
          appendLock.current = false;
        });
      }
    });
    return () => subscription.unsubscribe();
  }, [form, append]);

  const subtotal = items.reduce((sum, item) => (item as any).type === "section" ? sum : sum + (Number(item.qty) || 0) * (Number(item.unitPrice) || 0), 0);
  const taxAmount = subtotal * (taxPercent / 100);
  const totalAmount = subtotal + taxAmount;

  const CURRENCY_LOCALE: Record<string, string> = { SGD: "en-SG", USD: "en-US", EUR: "en-IE", GBP: "en-GB", MYR: "ms-MY", INR: "en-IN" };
  const formatCurrency = (value: number) =>
    new Intl.NumberFormat(CURRENCY_LOCALE[currency] || "en", { style: "currency", currency }).format(value);

  async function saveDocument(values: z.infer<typeof poSchema>, status: "draft" | "confirmed" = "draft") {
    const filledItems = values.items.filter(
      (item) => (item as any).type === "section"
        ? ((item as any).sectionLabel || "").trim() !== ""
        : (item.partNumber.trim() !== "" || item.description.trim() !== "")
    );
    if (filledItems.length === 0) {
      toast({ title: "Error", description: "At least one line item is required.", variant: "destructive" });
      return null;
    }
    const itemsWithAmount = filledItems.map(item => ({
      ...item,
      amount: (item as any).type === "section" ? 0 : item.qty * item.unitPrice
    }));

    return new Promise<any>((resolve, reject) => {
      createMutation.mutate(
        { data: { ...values, items: itemsWithAmount, status, customerId: values.customerId ?? undefined } },
        {
          onSuccess: (data) => resolve(data),
          onError: (error: any) => reject(error),
        }
      );
    });
  }

  async function onSaveDraft(values: z.infer<typeof poSchema>) {
    setIsGenerating(true);
    try {
      const data = await saveDocument(values, "draft");
      if (!data) return;
      toast({ title: "Draft saved." });
      setLocation("/purchase-orders");
    } catch (error: any) {
      toast({ title: "Error", description: error?.message || "Failed to save draft.", variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  }

  async function onSaveAndPreview(values: z.infer<typeof poSchema>) {
    if (directoryCurrency && values.currency !== directoryCurrency) {
      setPendingConfirmValues(values);
      setCurrencyDialogOpen(true);
      return;
    }
    await doSaveAndPreview(values);
  }

  async function doSaveAndPreview(values: z.infer<typeof poSchema>) {
    setIsGenerating(true);
    try {
      const data = await saveDocument(values, "draft");
      if (!data) return;
      setSavedPo(data);
      setPreviewOpen(true);
    } catch (error: any) {
      toast({ title: "Error", description: error?.message || "Failed to save.", variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Create Purchase Order</h1>
          <p className="text-muted-foreground mt-1">Draft a new professional PO document.</p>
        </div>
        {nextPoNumber && (
          <div className="text-right">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">PO Number</p>
            <p className="text-lg font-semibold font-mono">{nextPoNumber}</p>
          </div>
        )}
      </div>

      <Form {...form}>
        <form className="space-y-8">
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
                <CardTitle className="text-lg">Vendor Details</CardTitle>
                <DirectoryPickerButton
                  type="vendor"
                  onSelect={(v) => {
                    form.setValue("vendorName", v.name);
                    form.setValue("vendorAddress", v.fullAddress);
                    form.setValue("vendorContact", v.contactPerson);
                    form.setValue("vendorContactEmail", v.contactEmail);
                    if (v.effectiveGstRate !== undefined) form.setValue("tax", v.effectiveGstRate);
                    if (v.currency) {
                      form.setValue("currency", v.currency);
                      setDirectoryCurrency(v.currency);
                      setDirectoryCurrencyName(v.name);
                    }
                  }}
                />
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="vendorName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Vendor Name <span className="text-destructive">*</span></FormLabel>
                      <FormControl>
                        <ContactAutocomplete
                          type="vendor"
                          value={field.value}
                          onChange={field.onChange}
                          placeholder="Acme Corp"
                          onSelect={(c) => {
                            form.setValue("vendorName", c.name);
                            if (c.address) form.setValue("vendorAddress", c.address);
                            if (c.contact) form.setValue("vendorContact", c.contact);
                            if (c.email) form.setValue("vendorContactEmail", c.email);
                            if (c.deliveryAddress) form.setValue("deliveryAddress", c.deliveryAddress);
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="vendorAddress"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Address</FormLabel>
                      <FormControl><Textarea placeholder="123 Business Rd..." className="resize-none" rows={3} {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="vendorContact"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contact Person</FormLabel>
                      <FormControl><Input placeholder="John Doe" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="vendorContactEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contact Email</FormLabel>
                      <FormControl><Input placeholder="john@example.com" type="email" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-lg">Order Logistics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="customerId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5 text-muted-foreground" />Customer (for reference)</FormLabel>
                      <Select
                        value={field.value != null ? String(field.value) : "none"}
                        onValueChange={(v) => field.onChange(v === "none" ? null : Number(v))}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a customer…" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">— None —</SelectItem>
                          {customers.map((c: any) => (
                            <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="customerPoRef"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Customer PO Ref No.</FormLabel>
                      <FormControl><Input placeholder="CUST-PO-2024-001" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="quoteRefNo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Sales Quote Reference No.</FormLabel>
                      <FormControl><Input placeholder="SQ-2024-001" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="deliveryAddress"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Delivery Address</FormLabel>
                      <FormControl><Textarea className="resize-none" rows={3} {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="issueDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <IssueDateField value={field.value || ""} onChange={field.onChange} label="PO Date" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="deliveryDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Delivery Date</FormLabel>
                      <FormControl>
                        <DeliveryDateField value={field.value} onChange={field.onChange} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="paymentTerms"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Payment Terms</FormLabel>
                      <FormControl>
                        <PaymentTermsSelect value={field.value} onChange={field.onChange} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="isPrivate"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center gap-3 rounded-lg border px-4 py-3">
                        <Lock className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="flex-1">
                          <FormLabel className="text-sm font-medium cursor-pointer">Private Document</FormLabel>
                          <p className="text-xs text-muted-foreground mt-0.5">Only visible to you and admins</p>
                        </div>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                      </div>
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>
          </div>

          <Card className="overflow-hidden">
            <CardHeader className="pb-4 bg-muted/20 border-b">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Line Items</CardTitle>
                <Button type="button" variant="outline" size="sm" className="gap-1.5 text-xs h-8 text-primary border-primary/40 hover:bg-primary/5" onClick={() => setImportOpen(true)}>
                  Import from Excel / CSV
                </Button>
              </div>
              {form.formState.errors.items?.root && (
                <div className="text-sm text-destructive mt-2">{form.formState.errors.items.root.message}</div>
              )}
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground uppercase text-xs">
                  <tr>
                    <th className="px-4 py-3 font-medium text-center w-12">#</th>
                    <th className="px-4 py-3 font-medium w-48">Item / Part Number</th>
                    <th className="px-4 py-3 font-medium">Description</th>
                    <th className="px-4 py-3 font-medium w-24 text-center">Qty</th>
                    <th className="px-4 py-3 font-medium w-16 text-center">UOM</th>
                    <th className="px-4 py-3 font-medium w-32 text-right">Unit Price</th>
                    <th className="px-4 py-3 font-medium w-32 text-right">Amount</th>
                    <th className="px-4 py-3 font-medium w-20 text-center">Stock Item</th>
                    <th className="px-4 py-3 font-medium w-16 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(() => { let _n = 0; return [...fields.map((field, index) => {
                    const itemType = form.watch(`items.${index}.type`);
                    const _itemNo = itemType !== "section" ? ++_n : null;
                    const blankItem = { type: "item" as const, sectionLabel: "", sectionAlign: "left" as const, partNumber: "", uom: "", description: "", qty: 1, unitPrice: 0, isStockItem: false, itemImage: "" };
                    const blankSection = { type: "section" as const, sectionLabel: "", sectionAlign: "left" as const, partNumber: "", uom: "", description: "", qty: 1, unitPrice: 0, isStockItem: false, itemImage: "" };
                    const insertBar = (
                      <tr className="group/ins border-0 h-5">
                        <td colSpan={9} className="p-0 overflow-visible">
                          <div className="relative flex items-center justify-center h-5">
                            <div className="absolute inset-x-0 top-1/2 h-px bg-border/40 group-hover/ins:bg-primary/40 transition-colors" />
                            <div className="absolute flex items-center gap-2 opacity-0 group-hover/ins:opacity-100 transition-opacity">
                              <button type="button" onClick={() => insert(index, blankItem)} className="flex items-center gap-1 text-[10px] text-primary bg-background border border-primary/30 rounded px-2 leading-5 whitespace-nowrap shadow-sm">
                                <Plus className="h-2.5 w-2.5" /> + line item here
                              </button>
                              <button type="button" onClick={() => insert(index, blankSection)} className="flex items-center gap-1 text-[10px] text-primary bg-background border border-primary/30 rounded px-2 leading-5 whitespace-nowrap shadow-sm">
                                <Layers className="h-2.5 w-2.5" /> + section here
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                    if (itemType === "section") {
                      return (
                        <Fragment key={field.id}>
                          {insertBar}
                          <tr className="border-b bg-muted/40">
                            <td colSpan={9} className="px-4 py-2">
                              <div className="flex items-start gap-2">
                                <Layers className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-2" />
                                <div className="flex-1 min-w-0">
                                  <FormField control={form.control} name={`items.${index}.sectionLabel`} render={({ field: f }) => (
                                    <FormItem><FormControl><RichTextEditor value={f.value} onChange={f.onChange} placeholder="Section header text..." /></FormControl></FormItem>
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
                        </Fragment>
                      );
                    }
                    const itemQty = Number(items[index]?.qty) || 0;
                    const itemPrice = Number(items[index]?.unitPrice) || 0;
                    const itemAmount = itemQty * itemPrice;
                    return (
                      <Fragment key={field.id}>
                        {insertBar}
                        <tr className="bg-card">
                          <td className="px-4 py-2 text-center text-muted-foreground">{_itemNo}</td>
                          <td className="px-4 py-2">
                            <FormField control={form.control} name={`items.${index}.partNumber`} render={({ field }) => (
                              <FormItem><FormControl><Input className="h-8" placeholder="PN-123" {...field} /></FormControl></FormItem>
                            )} />
                          </td>
                          <td className="px-4 py-2 align-top">
                            <div className="flex gap-2 items-start">
                              <FormField control={form.control} name={`items.${index}.description`} render={({ field }) => (
                                <FormItem className="flex-1 min-w-0"><FormControl><RichTextEditor value={field.value} onChange={field.onChange} placeholder="Item description" /></FormControl></FormItem>
                              )} />
                              <FormField control={form.control} name={`items.${index}.itemImage`} render={({ field }) => (
                                <FormItem><FormControl><ItemImageField value={field.value} onChange={field.onChange} /></FormControl></FormItem>
                              )} />
                            </div>
                          </td>
                          <td className="px-4 py-2">
                            <FormField control={form.control} name={`items.${index}.qty`} render={({ field }) => (
                              <FormItem><FormControl><Input inputMode="numeric" className="h-8 text-center" {...field} /></FormControl></FormItem>
                            )} />
                          </td>
                          <td className="px-4 py-2">
                            <FormField control={form.control} name={`items.${index}.uom`} render={({ field }) => (
                              <FormItem><FormControl><Input className="h-8 text-center" placeholder="Nos" {...field} /></FormControl></FormItem>
                            )} />
                          </td>
                          <td className="px-4 py-2">
                            <FormField control={form.control} name={`items.${index}.unitPrice`} render={({ field }) => (
                              <FormItem><FormControl><Input inputMode="decimal" className="h-8 text-right" {...field} /></FormControl></FormItem>
                            )} />
                          </td>
                          <td className="px-4 py-2 text-right font-medium text-muted-foreground bg-muted/10">
                            {formatCurrency(itemAmount)}
                          </td>
                          <td className="px-4 py-2 text-center">
                            <FormField control={form.control} name={`items.${index}.isStockItem`} render={({ field }) => (
                              <FormItem><FormControl>
                                <Checkbox checked={field.value} onCheckedChange={field.onChange} title="Track serials for this item" />
                              </FormControl></FormItem>
                            )} />
                          </td>
                          <td className="px-4 py-2 text-center">
                            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10" onClick={() => remove(index)} disabled={fields.length === 1}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      </Fragment>
                    );
                  }), <tr key="trailing-bar" className="group/ins border-0 h-5"><td colSpan={9} className="p-0 overflow-visible"><div className="relative flex items-center justify-center h-5"><div className="absolute inset-x-0 top-1/2 h-px bg-border/40 group-hover/ins:bg-primary/40 transition-colors" /><div className="absolute flex items-center gap-2 opacity-0 group-hover/ins:opacity-100 transition-opacity"><button type="button" onClick={() => append({ type: "item" as const, sectionLabel: "", sectionAlign: "left" as const, partNumber: "", uom: "", description: "", qty: 1, unitPrice: 0, isStockItem: false, itemImage: "" })} className="flex items-center gap-1 text-[10px] text-primary bg-background border border-primary/30 rounded px-2 leading-5 whitespace-nowrap shadow-sm"><Plus className="h-2.5 w-2.5" /> + line item here</button><button type="button" onClick={() => append({ type: "section" as const, sectionLabel: "", sectionAlign: "left" as const, partNumber: "", uom: "", description: "", qty: 1, unitPrice: 0, isStockItem: false, itemImage: "" })} className="flex items-center gap-1 text-[10px] text-primary bg-background border border-primary/30 rounded px-2 leading-5 whitespace-nowrap shadow-sm"><Layers className="h-2.5 w-2.5" /> + section here</button></div></div></td></tr>]; })()}
                </tbody>
              </table>
            </div>
            <div className="bg-muted/20 border-t p-6">
              <div className="flex flex-col md:flex-row justify-between gap-6">
                <div className="flex-1 max-w-md">
                  <FormField
                    control={form.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-muted-foreground">Additional Notes</FormLabel>
                        <FormControl>
                          <RichTextEditor value={field.value ?? ""} onChange={field.onChange} placeholder="Any special instructions or terms..." className="min-h-[96px]" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="w-full md:w-72 space-y-4">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span className="font-medium">{formatCurrency(subtotal)}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">GST ({form.watch("tax") ?? 0}%)</span>
                      <FormField control={form.control} name="tax" render={({ field }) => (
                        <FormItem className="hidden"><FormControl><input type="hidden" {...field} /></FormControl></FormItem>
                      )} />
                    </div>
                    <span className="font-medium">{formatCurrency(taxAmount)}</span>
                  </div>
                  <div className="h-px bg-border my-2" />
                  <div className="flex justify-between items-center text-lg">
                    <span className="font-bold">Total Amount</span>
                    <span className="font-bold text-primary">{formatCurrency(totalAmount)}</span>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          <div className="flex justify-end gap-3 fixed bottom-0 left-0 right-0 p-4 bg-background/80 backdrop-blur-sm border-t md:left-64 md:px-8 z-10">
            <Button type="button" variant="outline" onClick={() => setLocation("/purchase-orders")}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              disabled={createMutation.isPending || isGenerating}
              onClick={form.handleSubmit(onSaveDraft)}
            >
              <Save className="h-4 w-4" />
              Save as Draft
            </Button>
            <Button
              type="button"
              className="gap-2"
              disabled={createMutation.isPending || isGenerating}
              onClick={form.handleSubmit(onSaveAndPreview)}
            >
              {createMutation.isPending || isGenerating ? (
                "Saving..."
              ) : (
                <>
                  <Eye className="h-4 w-4" />
                  Save
                </>
              )}
            </Button>
          </div>
        </form>
      </Form>

      <CurrencyMismatchDialog
        open={currencyDialogOpen}
        entityName={directoryCurrencyName}
        entityType="vendor"
        defaultCurrency={directoryCurrency}
        selectedCurrency={form.getValues("currency")}
        onContinue={async () => {
          setCurrencyDialogOpen(false);
          if (pendingConfirmValues) await doSaveAndPreview(pendingConfirmValues);
          setPendingConfirmValues(null);
        }}
        onRevert={async () => {
          setCurrencyDialogOpen(false);
          if (pendingConfirmValues) {
            const updated = { ...pendingConfirmValues, currency: directoryCurrency };
            form.setValue("currency", directoryCurrency);
            await doSaveAndPreview(updated);
          }
          setPendingConfirmValues(null);
        }}
      />

      <ImportItemsDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImport={(imported, replace) => {
          const blankItem = { type: "item" as const, sectionLabel: "", sectionAlign: "left" as const, partNumber: "", uom: "", description: "", qty: 1, unitPrice: 0, isStockItem: false, itemImage: "" };
          const newItems = imported.map((it) => ({ ...blankItem, partNumber: it.partNumber, description: it.description, qty: it.qty, uom: it.uom, unitPrice: it.unitPrice }));
          if (replace) {
            form.setValue("items", newItems);
          } else {
            for (const item of newItems) append(item);
          }
        }}
      />

      {savedPo && (
        <PdfPreviewModal
          open={previewOpen}
          onOpenChange={(open) => {
            setPreviewOpen(open);
            if (!open) setLocation(`/purchase-orders/${savedPo.id}`);
          }}
          title={`Purchase Order ${savedPo.poNumber}`}
          generatePdf={(opts) => generatePO_PDF(savedPo, selectedCompany, opts)}
          pdfFilename={`${savedPo.poNumber}.pdf`}
          defaultEmailTo={(savedPo as any).vendorContactEmail || ""}
          defaultEmailSubject={`Purchase Order ${savedPo.poNumber}`}
          defaultEmailBody={`Dear ${savedPo.vendorContact || "Sir/Madam"},\n\nPlease find attached our Purchase Order ${savedPo.poNumber}${(savedPo as any).quoteRefNo ? ` with the sales reference number ${(savedPo as any).quoteRefNo}` : ""}.\n\nKindly acknowledge receipt and confirm acceptance.\n\nThank you.`}
          onEdit={() => {
            setPreviewOpen(false);
            setLocation(`/purchase-orders/${savedPo.id}/edit`);
          }}
        />
      )}
    </div>
  );
}
