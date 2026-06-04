import { useState, useEffect, useRef } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useParams, useLocation } from "wouter";
import { ContactAutocomplete } from "@/components/contact-autocomplete";
import { useGetQuotation, useUpdateQuotation, getGetQuotationQueryKey, useGetSettings, getGetSettingsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Save, ArrowLeft, Eye, Lock } from "lucide-react";
import { PaymentTermsSelect } from "@/components/payment-terms-select";
import { DeliveryDateField } from "@/components/delivery-date-field";
import { IssueDateField } from "@/components/issue-date-field";
import { PdfPreviewModal } from "@/components/pdf-preview-modal";
import { DirectoryPickerButton } from "@/components/directory-picker-button";
import { CurrencyMismatchDialog } from "@/components/currency-mismatch-dialog";
import { generateQuotation_PDF } from "@/lib/pdf";
import { useAuth } from "@/contexts/auth-context";

const itemSchema = z.object({
  partNumber: z.string(),
  description: z.string(),
  qty: z.coerce.number().min(1, "Must be > 0"),
  uom: z.string().default(""),
  unitPrice: z.coerce.number().min(0),
  discount: z.coerce.number().min(0).max(100).default(0),
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
  notes: z.string().optional(),
  currency: z.string().default("SGD"),
  status: z.enum(["draft", "confirmed", "cancelled"]),
  tax: z.coerce.number().min(0).max(100).default(9),
  discountAmount: z.coerce.number().min(0).default(0),
  isPrivate: z.boolean().default(false),
  items: z.array(itemSchema).min(1),
});

export default function QuotationEdit() {
  const params = useParams();
  const id = Number(params.id);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { selectedCompany } = useAuth();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [isOverseas, setIsOverseas] = useState(false);
  const initialized = useRef(false);
  const [directoryCurrency, setDirectoryCurrency] = useState<string>("");
  const [directoryCurrencyName, setDirectoryCurrencyName] = useState<string>("");
  const [pendingConfirmValues, setPendingConfirmValues] = useState<z.infer<typeof schema> | null>(null);
  const [currencyDialogOpen, setCurrencyDialogOpen] = useState(false);

  const { data: doc } = useGetQuotation(id, {
    query: { queryKey: getGetQuotationQueryKey(id), enabled: !!id },
  });

  const { data: docSettings } = useGetSettings({
    query: { queryKey: getGetSettingsQueryKey() },
  });

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      customerName: "", customerAddress: "", customerContact: "", customerContactEmail: "",
      issueDate: "", deliveryDate: "", paymentTerms: "", notes: "",
      currency: "SGD", status: "draft", tax: 9,
      discountAmount: 0,
      isPrivate: false,
      items: [{ partNumber: "", description: "", qty: 1, unitPrice: 0, discount: 0 }],
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
        items: items.length > 0 ? items.map((i: any) => ({
          partNumber: i.partNumber || "",
          description: i.description || "",
          qty: Number(i.qty) || 1,
          uom: i.uom || "",
          unitPrice: Number(i.unitPrice) || 0,
          discount: Number(i.discount) || 0,
        })) : [{ partNumber: "", description: "", qty: 1, uom: "", unitPrice: 0, discount: 0 }],
      });
      initialized.current = true;
    }
  }, [doc]);

  const { fields, append, remove } = useFieldArray({ control: form.control, name: "items" });
  const updateMutation = useUpdateQuotation();
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
      const isEmpty =
        (!last.partNumber || String(last.partNumber).trim() === "") &&
        (!last.description || String(last.description).trim() === "") &&
        (Number(last.unitPrice) === 0) && (Number(last.qty) <= 1);
      if (!isEmpty && !appendLock.current) {
        appendLock.current = true;
        const focused = document.activeElement as HTMLElement | null;
        append({ partNumber: "", description: "", qty: 1, uom: "", unitPrice: 0, discount: 0 });
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
      toast({ title: "Error", description: "At least one line item required.", variant: "destructive" });
      setIsSubmitting(false);
      return;
    }
    const itemsWithAmount = filledItems.map(i => {
      const disc = Number(i.discount) || 0;
      return { ...i, discount: disc, amount: (i.qty * i.unitPrice * (1 - disc / 100)).toFixed(2) };
    });
    updateMutation.mutate({ id, data: { ...values, status: openPreview ? "confirmed" : "draft", discountAmount: values.discountAmount, items: itemsWithAmount } as any }, {
      onSuccess: async () => {
        await queryClient.refetchQueries({ queryKey: getGetQuotationQueryKey(id) });
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
        <Button variant="ghost" size="icon" onClick={() => setLocation(`/quotations/${id}`)}><ArrowLeft className="h-4 w-4" /></Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Edit Quotation</h1>
          <p className="text-muted-foreground mt-1">{doc.qtNumber}</p>
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
              <CardHeader className="pb-4"><CardTitle className="text-lg">Quotation Details</CardTitle></CardHeader>
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
                      <IssueDateField value={field.value || ""} onChange={field.onChange} label="Quotation Date" />
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
                <CardTitle className="text-lg">Line Items</CardTitle>
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
                      <th className="px-4 py-3 text-center w-16">UOM</th>
                      <th className="px-4 py-3 text-right w-28">Unit Price</th>
                      <th className="px-4 py-3 text-right w-16">Disc %</th>
                      <th className="px-4 py-3 text-right w-28">Amount</th>
                      <th className="px-4 py-3 w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {fields.map((field, index) => {
                      const qty = Number(form.watch(`items.${index}.qty`)) || 0;
                      const price = Number(form.watch(`items.${index}.unitPrice`)) || 0;
                      const disc = Number(form.watch(`items.${index}.discount`)) || 0;
                      return (
                        <tr key={field.id} className="border-b last:border-0 hover:bg-muted/20">
                          <td className="px-4 py-2 text-muted-foreground text-xs">{index + 1}</td>
                          <td className="px-4 py-2"><FormField control={form.control} name={`items.${index}.partNumber`} render={({ field }) => (
                            <FormItem><FormControl><Input className="h-8 text-sm border-0 bg-transparent focus:bg-background" placeholder="Optional" {...field} /></FormControl></FormItem>
                          )} /></td>
                          <td className="px-4 py-2 align-top"><FormField control={form.control} name={`items.${index}.description`} render={({ field }) => (
                            <FormItem><FormControl><RichTextEditor value={field.value} onChange={field.onChange} placeholder="Item description" /></FormControl></FormItem>
                          )} /></td>
                          <td className="px-4 py-2"><FormField control={form.control} name={`items.${index}.qty`} render={({ field }) => (
                            <FormItem><FormControl><Input inputMode="numeric" className="h-8 text-sm text-right border-0 bg-transparent focus:bg-background" {...field} /></FormControl></FormItem>
                          )} /></td>
                          <td className="px-4 py-2"><FormField control={form.control} name={`items.${index}.uom`} render={({ field }) => (
                            <FormItem><FormControl><Input className="h-8 text-sm text-center border-0 bg-transparent focus:bg-background" placeholder="Nos" {...field} /></FormControl></FormItem>
                          )} /></td>
                          <td className="px-4 py-2"><FormField control={form.control} name={`items.${index}.unitPrice`} render={({ field }) => (
                            <FormItem><FormControl><Input inputMode="decimal" className="h-8 text-sm text-right border-0 bg-transparent focus:bg-background" placeholder="0.00" {...field} /></FormControl></FormItem>
                          )} /></td>
                          <td className="px-4 py-2"><FormField control={form.control} name={`items.${index}.discount`} render={({ field }) => (
                            <FormItem><FormControl><Input inputMode="decimal" className="h-8 text-sm text-right border-0 bg-transparent focus:bg-background" placeholder="0" {...field} onChange={e => field.onChange(parseFloat(e.target.value) || 0)} value={field.value || ""} /></FormControl></FormItem>
                          )} /></td>
                          <td className="px-4 py-2 text-right text-muted-foreground text-sm">{fmt(qty * price * (1 - disc / 100))}</td>
                          <td className="px-4 py-2">{fields.length > 1 && (
                            <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => remove(index)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}</td>
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
            <CardHeader className="pb-4"><CardTitle className="text-lg">Notes</CardTitle></CardHeader>
            <CardContent>
              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem><FormControl><Textarea className="resize-none" rows={3} {...field} /></FormControl></FormItem>
              )} />
            </CardContent>
          </Card>

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => setLocation(`/quotations/${id}`)}>Cancel</Button>
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
        title={doc ? `Quotation ${doc.qtNumber}` : "Quotation Preview"}
        generatePdf={(opts) => generateQuotation_PDF(doc!, selectedCompany, docSettings as any, opts)}
        pdfFilename={doc ? `${doc.qtNumber}.pdf` : "quotation.pdf"}
        defaultEmailTo={(doc as any)?.customerContactEmail || ""}
        defaultEmailSubject={doc ? `Quotation ${doc.qtNumber}` : "Quotation"}
        onEdit={() => { setPreviewOpen(false); }}
      />
    </div>
  );
}
