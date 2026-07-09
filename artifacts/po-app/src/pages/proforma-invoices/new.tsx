import { useState, useEffect, useRef, Fragment } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation, useSearch } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { useGetSettings, getGetSettingsQueryKey, useGetQuotation, getGetQuotationQueryKey } from "@workspace/api-client-react";
import { ContactAutocomplete } from "@/components/contact-autocomplete";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Save, Eye, Lock, Plus, Layers, AlignLeft, AlignCenter } from "lucide-react";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { generatePI_PDF } from "@/lib/pdf";
import { PaymentTermsSelect } from "@/components/payment-terms-select";
import { DirectoryPickerButton } from "@/components/directory-picker-button";
import { DeliveryDateField } from "@/components/delivery-date-field";
import { IssueDateField, getToday } from "@/components/issue-date-field";
import { PdfPreviewModal } from "@/components/pdf-preview-modal";
import { useAuth } from "@/contexts/auth-context";

const itemSchema = z.object({
  type: z.enum(["item", "section"]).default("item"),
  sectionLabel: z.string().default(""),
  sectionAlign: z.enum(["left", "center"]).default("left"),
  partNumber: z.string().default(""),
  description: z.string().default(""),
  qty: z.coerce.number().min(0).default(1),
  uom: z.string().default(""),
  unitPrice: z.coerce.number().min(0).default(0),
  discount: z.coerce.number().min(0).max(100).default(0),
  isFoc: z.boolean().default(false),
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

const schema = z.object({
  customerName: z.string().min(1, "Customer name is required"),
  customerAddress: z.string().optional(),
  customerContact: z.string().optional(),
  customerContactEmail: z.string().email("Invalid email").optional().or(z.literal("")),
  deliveryAddress: z.string().optional(),
  issueDate: z.string().optional(),
  deliveryDate: z.string().optional(),
  paymentTerms: z.string().optional(),
  qtRefNo: z.string().optional(),
  notes: z.string().optional(),
  currency: z.string().default("SGD"),
  tax: z.coerce.number().min(0).max(100).default(9),
  discountAmount: z.coerce.number().min(0).default(0),
  isPrivate: z.boolean().default(false),
  items: z.array(itemSchema).min(1, "At least one item is required"),
});

type FormValues = z.infer<typeof schema>;

function calcTotals(items: any[], tax: number, discountAmount: number) {
  const subtotal = items.reduce((sum, it) => {
    if (it.type === "section") return sum;
    const qty = Number(it.qty) || 0;
    const price = it.isFoc ? 0 : (Number(it.unitPrice) || 0);
    const disc = Number(it.discount) || 0;
    return sum + qty * price * (1 - disc / 100);
  }, 0);
  const taxable = subtotal - (Number(discountAmount) || 0);
  const taxAmount = taxable * (Number(tax) / 100);
  return { subtotal, taxAmount, total: taxable + taxAmount };
}

export default function ProformaInvoiceNew() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const qtId = params.get("qtId");
  const { toast } = useToast();
  const { selectedCompany } = useAuth();

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<any>(null);
  const previewModeRef = useRef<"draft" | "preview">("draft");
  const [savedId, setSavedId] = useState<number | null>(null);

  const { data: settings } = useGetSettings({ query: { queryKey: getGetSettingsQueryKey() } });
  const qtIdNum = qtId ? Number(qtId) : null;
  const { data: sourceQt } = useGetQuotation(qtIdNum ?? 0, {
    query: { queryKey: getGetQuotationQueryKey(qtIdNum ?? 0), enabled: !!qtIdNum },
  });

  const blankItem = { type: "item" as const, sectionLabel: "", sectionAlign: "left" as const, partNumber: "", description: "", qty: 1, uom: "", unitPrice: 0, discount: 0, isFoc: false, itemImage: "" };

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      customerName: params.get("customer") || "",
      customerAddress: "",
      customerContact: "",
      customerContactEmail: "",
      deliveryAddress: "",
      issueDate: getToday(),
      deliveryDate: "",
      paymentTerms: "",
      qtRefNo: params.get("qtNumber") || "",
      notes: "",
      currency: "SGD",
      tax: Number(settings?.gstRate ?? 9),
      discountAmount: 0,
      isPrivate: false,
      items: [blankItem],
    },
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: "items" });

  useEffect(() => {
    if (settings?.gstRate) form.setValue("tax", Number(settings.gstRate));
  }, [settings, form]);

  useEffect(() => {
    if (!sourceQt) return;
    const qtItems = (sourceQt.items as any[]) ?? [];
    form.reset({
      customerName: sourceQt.customerName || "",
      customerAddress: (sourceQt as any).customerAddress || "",
      customerContact: (sourceQt as any).customerContact || "",
      customerContactEmail: (sourceQt as any).customerContactEmail || "",
      deliveryAddress: (sourceQt as any).deliveryAddress || "",
      issueDate: getToday(),
      deliveryDate: (sourceQt as any).deliveryDate || "",
      paymentTerms: (sourceQt as any).paymentTerms || "",
      qtRefNo: sourceQt.qtNumber || "",
      notes: (sourceQt as any).notes || "",
      currency: (sourceQt as any).currency || "SGD",
      tax: Number((sourceQt as any).tax ?? settings?.gstRate ?? 9),
      discountAmount: Number((sourceQt as any).discountAmount ?? 0),
      isPrivate: false,
      items: qtItems.length > 0
        ? qtItems.map((it: any) => ({
            type: it.type || "item",
            sectionLabel: it.sectionLabel || "",
            sectionAlign: it.sectionAlign || "left",
            partNumber: it.partNumber || "",
            description: it.description || "",
            qty: Number(it.qty) || 1,
            uom: it.uom || "",
            unitPrice: Number(it.unitPrice) || 0,
            discount: Number(it.discount) || 0,
            isFoc: !!it.isFoc,
            itemImage: it.itemImage || "",
          }))
        : [blankItem],
    });
  }, [sourceQt]);

  const createMutation = useMutation({
    mutationFn: async (body: any) => {
      const res = await fetch("/api/proforma-invoices", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || "Failed to create"); }
      return res.json();
    },
  });

  const markSentMutation = useMutation({
    mutationFn: async ({ id, sentTo }: { id: number; sentTo: string[] }) => {
      const res = await fetch(`/api/proforma-invoices/${id}/mark-sent`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sentTo }),
      });
      if (!res.ok) throw new Error("Failed to mark as sent");
      return res.json();
    },
  });

  const buildBody = (values: FormValues) => {
    const { subtotal, taxAmount, total } = calcTotals(values.items, values.tax, values.discountAmount ?? 0);
    return {
      ...values,
      subtotal,
      tax: taxAmount,
      totalAmount: total,
    };
  };

  const onSubmit = async (values: FormValues) => {
    const body = buildBody(values);
    try {
      if (previewModeRef.current === "preview") {
        const doc = await createMutation.mutateAsync({ ...body, status: "draft" });
        setSavedId(doc.id);
        setPreviewDoc({ ...doc, tax: values.tax });
        setPreviewOpen(true);
      } else {
        await createMutation.mutateAsync({ ...body, status: "draft" });
        toast({ title: "Proforma Invoice saved as draft." });
        setLocation("/proforma-invoices");
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const watchedItems = form.watch("items");
  const watchedTax = form.watch("tax");
  const watchedDiscount = form.watch("discountAmount");
  const { subtotal, taxAmount, total } = calcTotals(watchedItems, watchedTax, watchedDiscount ?? 0);

  return (
    <div className="max-w-[1600px] mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/proforma-invoices")}>
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-4 w-4"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" /></svg>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">New Proforma Invoice</h1>
          <p className="text-sm text-muted-foreground">Create a new proforma invoice</p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Customer Details */}
          <Card>
            <CardHeader><CardTitle className="text-base">Customer Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <FormField control={form.control} name="customerName" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Customer Name *</FormLabel>
                      <FormControl>
                        <ContactAutocomplete value={field.value} onChange={field.onChange} onSelect={() => {}} type="customer" placeholder="Enter customer name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                <DirectoryPickerButton
                  type="customer"
                  onSelect={(entry) => {
                    form.setValue("customerName", entry.name);
                    if (entry.address) form.setValue("customerAddress", entry.address);
                    if (entry.contactEmail) form.setValue("customerContactEmail", entry.contactEmail);
                    if (entry.contactPerson) form.setValue("customerContact", entry.contactPerson);
                    form.setValue("tax", entry.effectiveGstRate);
                  }}
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="customerAddress" render={({ field }) => (
                  <FormItem><FormLabel>Address</FormLabel><FormControl><Textarea {...field} rows={3} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="deliveryAddress" render={({ field }) => (
                  <FormItem><FormLabel>Delivery Address</FormLabel><FormControl><Textarea {...field} rows={3} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="customerContact" render={({ field }) => (
                  <FormItem><FormLabel>Contact Person</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="customerContactEmail" render={({ field }) => (
                  <FormItem><FormLabel>Contact Email</FormLabel><FormControl><Input {...field} type="email" /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
            </CardContent>
          </Card>

          {/* Document Details */}
          <Card>
            <CardHeader><CardTitle className="text-base">Invoice Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField control={form.control} name="issueDate" render={({ field }) => (
                  <FormItem><FormLabel>Issue Date</FormLabel><FormControl><IssueDateField value={field.value ?? ""} onChange={field.onChange} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="deliveryDate" render={({ field }) => (
                  <FormItem><FormLabel>Delivery Date</FormLabel><FormControl><DeliveryDateField value={field.value ?? ""} onChange={field.onChange} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="paymentTerms" render={({ field }) => (
                  <FormItem><FormLabel>Payment Terms</FormLabel><FormControl><PaymentTermsSelect value={field.value ?? ""} onChange={field.onChange} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="qtRefNo" render={({ field }) => (
                  <FormItem><FormLabel>QT Ref No</FormLabel><FormControl><Input {...field} placeholder="e.g. QT-0001" /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="currency" render={({ field }) => (
                  <FormItem><FormLabel>Currency</FormLabel>
                    <FormControl>
                      <select {...field} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm">
                        {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
                      </select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="tax" render={({ field }) => (
                  <FormItem><FormLabel>GST / Tax (%)</FormLabel><FormControl><Input {...field} type="number" min={0} max={100} step={0.01} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <FormField control={form.control} name="isPrivate" render={({ field }) => (
                <FormItem className="flex items-center gap-3">
                  <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                  <div className="flex items-center gap-1.5">
                    <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                    <FormLabel className="!mt-0 cursor-pointer">Private document</FormLabel>
                  </div>
                </FormItem>
              )} />
            </CardContent>
          </Card>

          {/* Items */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Items</CardTitle>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" className="gap-1.5"
                    onClick={() => append({ type: "item", sectionLabel: "", sectionAlign: "left", partNumber: "", description: "", qty: 1, uom: "", unitPrice: 0, discount: 0, isFoc: false, itemImage: "" })}>
                    <Plus className="h-3.5 w-3.5" />Add Item
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="gap-1.5"
                    onClick={() => append({ type: "section", sectionLabel: "", sectionAlign: "left", partNumber: "", description: "", qty: 0, uom: "", unitPrice: 0, discount: 0, isFoc: false, itemImage: "" })}>
                    <Layers className="h-3.5 w-3.5" />Add Section
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b border-t">
                    <tr>
                      <th className="px-3 py-2 text-left w-8">#</th>
                      <th className="px-3 py-2 text-left">Part No.</th>
                      <th className="px-3 py-2 text-left min-w-[240px]">Description</th>
                      <th className="px-3 py-2 text-right w-20">Qty</th>
                      <th className="px-3 py-2 text-left w-20">UOM</th>
                      <th className="px-3 py-2 text-right w-28">Unit Price</th>
                      <th className="px-3 py-2 text-right w-20">Disc%</th>
                      <th className="px-3 py-2 text-center w-12">FOC</th>
                      <th className="px-3 py-2 text-right w-28">Amount</th>
                      <th className="px-3 py-2 w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {fields.map((field, index) => {
                      const isSection = form.watch(`items.${index}.type`) === "section";
                      if (isSection) {
                        return (
                          <tr key={field.id} className="bg-muted/30 border-b">
                            <td className="px-3 py-2 text-muted-foreground text-xs">{index + 1}</td>
                            <td colSpan={7} className="px-3 py-2">
                              <div className="flex items-center gap-2">
                                <FormField control={form.control} name={`items.${index}.sectionLabel`} render={({ field }) => (
                                  <FormItem className="flex-1 mb-0">
                                    <FormControl><RichTextEditor value={field.value || ""} onChange={field.onChange} placeholder="Section heading..." className="text-sm font-semibold" /></FormControl>
                                  </FormItem>
                                )} />
                                <div className="flex gap-1">
                                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7"
                                    onClick={() => form.setValue(`items.${index}.sectionAlign`, "left")}>
                                    <AlignLeft className={cn("h-3.5 w-3.5", form.watch(`items.${index}.sectionAlign`) === "left" ? "text-primary" : "text-muted-foreground")} />
                                  </Button>
                                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7"
                                    onClick={() => form.setValue(`items.${index}.sectionAlign`, "center")}>
                                    <AlignCenter className={cn("h-3.5 w-3.5", form.watch(`items.${index}.sectionAlign`) === "center" ? "text-primary" : "text-muted-foreground")} />
                                  </Button>
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-2 text-right">—</td>
                            <td className="px-3 py-2">
                              <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => remove(index)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </td>
                          </tr>
                        );
                      }
                      const qty = Number(form.watch(`items.${index}.qty`) || 0);
                      const price = form.watch(`items.${index}.isFoc`) ? 0 : Number(form.watch(`items.${index}.unitPrice`) || 0);
                      const disc = Number(form.watch(`items.${index}.discount`) || 0);
                      const lineAmt = qty * price * (1 - disc / 100);
                      return (
                        <tr key={field.id} className="border-b hover:bg-muted/20">
                          <td className="px-3 py-2 text-muted-foreground text-xs">{index + 1}</td>
                          <td className="px-3 py-2">
                            <FormField control={form.control} name={`items.${index}.partNumber`} render={({ field }) => (
                              <FormItem className="mb-0"><FormControl><Input {...field} className="h-8 text-xs" placeholder="Part#" /></FormControl></FormItem>
                            )} />
                          </td>
                          <td className="px-3 py-2 min-w-[240px]">
                            <FormField control={form.control} name={`items.${index}.description`} render={({ field }) => (
                              <FormItem className="mb-0"><FormControl><RichTextEditor value={field.value || ""} onChange={field.onChange} placeholder="Item description..." className="text-sm" /></FormControl></FormItem>
                            )} />
                          </td>
                          <td className="px-3 py-2">
                            <FormField control={form.control} name={`items.${index}.qty`} render={({ field }) => (
                              <FormItem className="mb-0"><FormControl><Input {...field} type="number" className="h-8 text-xs text-right w-20" /></FormControl></FormItem>
                            )} />
                          </td>
                          <td className="px-3 py-2">
                            <FormField control={form.control} name={`items.${index}.uom`} render={({ field }) => (
                              <FormItem className="mb-0"><FormControl><Input {...field} className="h-8 text-xs w-20" placeholder="pcs" /></FormControl></FormItem>
                            )} />
                          </td>
                          <td className="px-3 py-2">
                            <FormField control={form.control} name={`items.${index}.unitPrice`} render={({ field }) => (
                              <FormItem className="mb-0"><FormControl><Input {...field} type="number" min={0} step={0.01} disabled={form.watch(`items.${index}.isFoc`)} className="h-8 text-xs text-right w-28" /></FormControl></FormItem>
                            )} />
                          </td>
                          <td className="px-3 py-2">
                            <FormField control={form.control} name={`items.${index}.discount`} render={({ field }) => (
                              <FormItem className="mb-0"><FormControl><Input {...field} type="number" min={0} max={100} className="h-8 text-xs text-right w-20" /></FormControl></FormItem>
                            )} />
                          </td>
                          <td className="px-3 py-2 text-center">
                            <FormField control={form.control} name={`items.${index}.isFoc`} render={({ field }) => (
                              <FormItem className="mb-0"><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl></FormItem>
                            )} />
                          </td>
                          <td className="px-3 py-2 text-right text-xs font-medium whitespace-nowrap">
                            {new Intl.NumberFormat("en-SG", { style: "currency", currency: form.watch("currency") || "SGD" }).format(lineAmt)}
                          </td>
                          <td className="px-3 py-2">
                            <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => remove(index)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {form.formState.errors.items && (
                <p className="text-sm text-destructive px-4 py-2">{form.formState.errors.items.message}</p>
              )}

              {/* Totals */}
              <div className="flex justify-end px-4 py-4">
                <div className="space-y-1 min-w-[200px]">
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">Subtotal</span><span>{new Intl.NumberFormat("en-SG", { style: "currency", currency: form.watch("currency") || "SGD" }).format(subtotal)}</span></div>
                  <div className="flex justify-between items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Doc. Discount</span>
                    <FormField control={form.control} name="discountAmount" render={({ field }) => (
                      <FormItem className="mb-0"><FormControl><Input {...field} type="number" min={0} step={0.01} className="h-7 text-xs text-right w-24" /></FormControl></FormItem>
                    )} />
                  </div>
                  {Number(watchedTax) > 0 && <div className="flex justify-between text-sm"><span className="text-muted-foreground">Tax ({watchedTax}%)</span><span>{new Intl.NumberFormat("en-SG", { style: "currency", currency: form.watch("currency") || "SGD" }).format(taxAmount)}</span></div>}
                  <div className="flex justify-between text-sm font-bold border-t pt-2"><span>Total</span><span>{new Intl.NumberFormat("en-SG", { style: "currency", currency: form.watch("currency") || "SGD" }).format(total)}</span></div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Notes */}
          <Card>
            <CardHeader><CardTitle className="text-base">Notes</CardTitle></CardHeader>
            <CardContent>
              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem>
                  <FormControl><Textarea {...field} rows={3} placeholder="Additional notes..." /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </CardContent>
          </Card>

          <div className="flex justify-end gap-3">
            <Button type="submit" variant="outline" disabled={createMutation.isPending}
              onClick={() => { previewModeRef.current = "draft"; }}>
              <Save className="h-4 w-4 mr-2" />Save Draft
            </Button>
            <Button type="submit" disabled={createMutation.isPending}
              onClick={() => { previewModeRef.current = "preview"; }}>
              <Eye className="h-4 w-4 mr-2" />Save & Preview
            </Button>
          </div>
        </form>
      </Form>

      {previewDoc && (
        <PdfPreviewModal
          open={previewOpen}
          onOpenChange={(open) => { if (!open) { setPreviewOpen(false); setLocation("/proforma-invoices"); } }}
          title={`Proforma Invoice ${previewDoc.piNumber}`}
          generatePdf={async (opts) => {
            if (!previewDoc) return;
            return generatePI_PDF({ ...previewDoc, tax: previewDoc.tax ?? Number(form.watch("tax")) }, selectedCompany, settings, opts);
          }}
          pdfFilename={`${previewDoc.piNumber}.pdf`}
          defaultEmailTo={previewDoc.customerContactEmail || ""}
          defaultEmailSubject={`Proforma Invoice ${previewDoc.piNumber}`}
          defaultEmailBody={`Dear ${previewDoc.customerContact || "Sir/Madam"},\n\nPlease find attached our Proforma Invoice ${previewDoc.piNumber} for your consideration.\n\nThank you.`}
          onEdit={savedId ? () => { setPreviewOpen(false); setLocation(`/proforma-invoices/${savedId}/edit`); } : undefined}
          onEmailSent={async (recipients) => {
            if (savedId) {
              await fetch(`/api/proforma-invoices/${savedId}/mark-sent`, {
                method: "POST", credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sentTo: recipients }),
              });
            }
            setLocation("/proforma-invoices");
          }}
        />
      )}
    </div>
  );
}
