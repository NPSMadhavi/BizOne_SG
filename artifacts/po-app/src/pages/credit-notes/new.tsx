import { useState, useEffect } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { Trash2, Save, Eye, Lock, Plus, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { DirectoryPickerButton } from "@/components/directory-picker-button";
import { IssueDateField, getToday } from "@/components/issue-date-field";
import { PdfPreviewModal } from "@/components/pdf-preview-modal";
import { generateCreditNote_PDF } from "@/lib/pdf";
import { useGetSettings } from "@workspace/api-client-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const CURRENCIES = ["SGD", "USD", "EUR", "GBP", "MYR", "INR"];

const itemSchema = z.object({
  type: z.enum(["item", "section"]).default("item"),
  sectionLabel: z.string().default(""),
  partNumber: z.string().default(""),
  description: z.string().default(""),
  qty: z.coerce.number().min(0).default(1),
  unitPrice: z.coerce.number().min(0).default(0),
  discount: z.coerce.number().min(0).max(100).default(0),
  amount: z.coerce.number().default(0),
});

const schema = z.object({
  customerName: z.string().min(1, "Customer name is required"),
  customerAddress: z.string().default(""),
  contactPerson: z.string().default(""),
  contactEmail: z.string().default(""),
  refInvNumber: z.string().default(""),
  reason: z.string().default(""),
  issueDate: z.string().default(getToday()),
  currency: z.string().default("SGD"),
  taxRate: z.coerce.number().min(0).max(100).default(9),
  discountAmount: z.coerce.number().min(0).default(0),
  paymentTerms: z.string().default(""),
  notes: z.string().default(""),
  isPrivate: z.boolean().default(false),
  items: z.array(itemSchema).min(1, "At least one item is required"),
});

type FormValues = z.infer<typeof schema>;

function calcAmount(qty: number, unitPrice: number, discount: number): number {
  const base = qty * unitPrice;
  return base - (base * discount / 100);
}

export default function CreditNoteNew() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { selectedCompany } = useAuth();
  const [savedDoc, setSavedDoc] = useState<any>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const { data: settings } = useGetSettings();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      customerName: "", customerAddress: "", contactPerson: "", contactEmail: "",
      refInvNumber: "", reason: "", issueDate: getToday(),
      currency: "SGD", taxRate: 9, discountAmount: 0,
      paymentTerms: "", notes: "", isPrivate: false,
      items: [{ type: "item", sectionLabel: "", partNumber: "", description: "", qty: 1, unitPrice: 0, discount: 0, amount: 0 }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: "items" });

  // Pre-fill GST from settings
  useEffect(() => {
    if (settings?.gstRate) form.setValue("taxRate", parseFloat(String(settings.gstRate)));
  }, [settings]);

  const watchItems = form.watch("items");
  const watchTax = form.watch("taxRate");
  const watchDiscount = form.watch("discountAmount");

  const subtotal = watchItems.filter(i => i.type !== "section").reduce((s, i) => {
    const amt = i.amount || calcAmount(i.qty, i.unitPrice, i.discount);
    return s + amt;
  }, 0);
  const docDiscount = Number(watchDiscount) || 0;
  const taxableAmount = subtotal - docDiscount;
  const tax = taxableAmount * (Number(watchTax) / 100);
  const total = taxableAmount + tax;

  function updateItemAmount(idx: number) {
    const item = form.getValues(`items.${idx}`);
    if (item.type === "section") return;
    const amt = calcAmount(item.qty, item.unitPrice, item.discount);
    form.setValue(`items.${idx}.amount`, amt);
  }

  async function doSubmit(status: "draft" | "confirmed") {
    const valid = await form.trigger();
    if (!valid) return;
    const values = form.getValues();
    setSubmitting(true);
    try {
      const r = await fetch("/api/credit-notes", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({
          ...values,
          items: values.items.map((item, idx) => ({
            ...item,
            amount: item.type === "section" ? 0 : calcAmount(item.qty, item.unitPrice, item.discount),
          })),
          subtotal, tax, totalAmount: total, status,
        }),
      });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || "Failed"); }
      const doc = await r.json();
      setSavedDoc(doc);
      toast({ title: status === "confirmed" ? "Credit note confirmed" : "Draft saved", description: doc.cnNumber });
      if (status === "confirmed") { setShowPreview(true); }
      else { setLocation(`/credit-notes/${doc.id}/edit`); }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setSubmitting(false); }
  }

  const currency = form.watch("currency");
  const fmt = (n: number) => new Intl.NumberFormat("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

  return (
    <div className="max-w-[1600px] mx-auto pb-20 space-y-6 animate-in fade-in duration-300">
      <div className="flex items-center justify-between pb-4 border-b border-gray-200">
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">Documents</p>
          <h1 className="text-2xl font-bold text-gray-900">New Credit Note</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => doSubmit("draft")} disabled={submitting} className="gap-2">
            <Save className="h-4 w-4" />Save Draft
          </Button>
          <Button onClick={() => doSubmit("confirmed")} disabled={submitting} className="gap-2">
            <Eye className="h-4 w-4" />Save & Preview
          </Button>
        </div>
      </div>

      <Form {...form}>
        <form className="space-y-6">
          {/* Header */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle className="text-sm">Customer</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2 items-end">
                  <FormField control={form.control} name="customerName" render={({ field }) => (
                    <FormItem className="flex-1">
                      <FormLabel>Customer Name <span className="text-destructive">*</span></FormLabel>
                      <FormControl><Input {...field} placeholder="Customer name" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <DirectoryPickerButton type="customer" onSelect={v => {
                    form.setValue("customerName", v.name);
                    form.setValue("customerAddress", v.address || "");
                    form.setValue("contactPerson", v.contactPerson || "");
                    form.setValue("contactEmail", v.contactEmail || "");
                    if (v.effectiveGstRate !== undefined) form.setValue("taxRate", v.effectiveGstRate);
                  }} />
                </div>
                <FormField control={form.control} name="customerAddress" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Address</FormLabel>
                    <FormControl><Textarea {...field} rows={3} placeholder="Customer address" /></FormControl>
                  </FormItem>
                )} />
                <div className="grid grid-cols-2 gap-3">
                  <FormField control={form.control} name="contactPerson" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contact Person</FormLabel>
                      <FormControl><Input {...field} placeholder="Name" /></FormControl>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="contactEmail" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contact Email</FormLabel>
                      <FormControl><Input {...field} type="email" placeholder="email@example.com" /></FormControl>
                    </FormItem>
                  )} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-sm">Credit Note Details</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <FormField control={form.control} name="refInvNumber" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Reference Invoice No.</FormLabel>
                      <FormControl><Input {...field} placeholder="e.g. INV-0042" /></FormControl>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="issueDate" render={({ field }) => (
                    <IssueDateField value={field.value ?? ""} onChange={field.onChange} label="Issue Date" />
                  )} />
                </div>
                <FormField control={form.control} name="reason" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reason for Credit</FormLabel>
                    <FormControl><Textarea {...field} rows={2} placeholder="e.g. Returned goods, billing error, price adjustment…" /></FormControl>
                  </FormItem>
                )} />
                <div className="grid grid-cols-2 gap-3">
                  <FormField control={form.control} name="currency" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Currency</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                      </Select>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="taxRate" render={({ field }) => (
                    <FormItem>
                      <FormLabel>GST %</FormLabel>
                      <FormControl><Input {...field} type="number" min={0} max={100} step={0.1} /></FormControl>
                    </FormItem>
                  )} />
                </div>
                <FormField control={form.control} name="notes" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes (internal)</FormLabel>
                    <FormControl><Input {...field} placeholder="Internal notes" /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="isPrivate" render={({ field }) => (
                  <FormItem className="flex items-center gap-3 pt-1">
                    <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                    <span className="text-sm flex items-center gap-1.5"><Lock className="h-3.5 w-3.5" />Private (only you + admin)</span>
                  </FormItem>
                )} />
              </CardContent>
            </Card>
          </div>

          {/* Items */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-sm">Line Items</CardTitle>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" className="gap-1.5 text-xs h-8"
                  onClick={() => append({ type: "section", sectionLabel: "Section Header", partNumber: "", description: "", qty: 1, unitPrice: 0, discount: 0, amount: 0 })}>
                  <Layers className="h-3.5 w-3.5" />Add Section
                </Button>
                <Button type="button" size="sm" variant="outline" className="gap-1.5 text-xs h-8"
                  onClick={() => append({ type: "item", sectionLabel: "", partNumber: "", description: "", qty: 1, unitPrice: 0, discount: 0, amount: 0 })}>
                  <Plus className="h-3.5 w-3.5" />Add Item
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-t border-gray-200">
                    <tr>
                      <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 w-8">#</th>
                      <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 w-32">Part No.</th>
                      <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500">Description</th>
                      <th className="text-right px-3 py-2.5 text-xs font-semibold text-gray-500 w-20">Qty</th>
                      <th className="text-right px-3 py-2.5 text-xs font-semibold text-gray-500 w-28">Unit Price</th>
                      <th className="text-right px-3 py-2.5 text-xs font-semibold text-gray-500 w-20">Disc %</th>
                      <th className="text-right px-3 py-2.5 text-xs font-semibold text-gray-500 w-28">Amount</th>
                      <th className="w-10 px-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {fields.map((field, idx) => {
                      const isSection = watchItems[idx]?.type === "section";
                      return (
                        <tr key={field.id} className={cn("border-b border-gray-100", isSection ? "bg-gray-50" : "")}>
                          <td className="px-3 py-2 text-gray-400 text-xs">{isSection ? "" : idx + 1}</td>
                          {isSection ? (
                            <td colSpan={6} className="px-3 py-2">
                              <Input
                                {...form.register(`items.${idx}.sectionLabel`)}
                                placeholder="Section heading…"
                                className="font-semibold text-gray-700 border-dashed"
                              />
                            </td>
                          ) : (
                            <>
                              <td className="px-3 py-2">
                                <Input {...form.register(`items.${idx}.partNumber`)} placeholder="Part #" className="text-xs h-8" />
                              </td>
                              <td className="px-3 py-2">
                                <Input {...form.register(`items.${idx}.description`)} placeholder="Description" className="text-xs h-8" />
                              </td>
                              <td className="px-3 py-2">
                                <Input {...form.register(`items.${idx}.qty`, { onChange: () => updateItemAmount(idx) })} type="number" min={0} step={0.01} className="text-xs h-8 text-right w-20 ml-auto" />
                              </td>
                              <td className="px-3 py-2">
                                <Input {...form.register(`items.${idx}.unitPrice`, { onChange: () => updateItemAmount(idx) })} type="number" min={0} step={0.01} className="text-xs h-8 text-right w-28 ml-auto" />
                              </td>
                              <td className="px-3 py-2">
                                <Input {...form.register(`items.${idx}.discount`, { onChange: () => updateItemAmount(idx) })} type="number" min={0} max={100} step={0.01} className="text-xs h-8 text-right w-20 ml-auto" />
                              </td>
                              <td className="px-3 py-2 text-right font-mono text-xs text-gray-700 w-28">
                                {fmt(calcAmount(watchItems[idx]?.qty || 0, watchItems[idx]?.unitPrice || 0, watchItems[idx]?.discount || 0))}
                              </td>
                            </>
                          )}
                          <td className="px-2 py-2">
                            <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 text-gray-400 hover:text-red-500" onClick={() => remove(idx)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Totals */}
              <div className="flex justify-end p-4 border-t border-gray-200">
                <div className="w-72 space-y-2 text-sm">
                  <div className="flex justify-between text-gray-600">
                    <span>Subtotal</span>
                    <span className="font-mono">{currency} {fmt(subtotal)}</span>
                  </div>
                  {docDiscount > 0 && (
                    <div className="flex justify-between text-gray-600">
                      <span>Discount</span>
                      <span className="font-mono text-red-600">- {currency} {fmt(docDiscount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-gray-600">
                    <span>GST ({fmt(Number(watchTax))}%)</span>
                    <span className="font-mono">{currency} {fmt(tax)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-base border-t border-gray-200 pt-2 text-gray-900">
                    <span>Credit Total</span>
                    <span className="font-mono">{currency} {fmt(total)}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </form>
      </Form>

      {savedDoc && showPreview && (
        <PdfPreviewModal
          open={showPreview}
          onOpenChange={(open) => { if (!open) { setShowPreview(false); setLocation(`/credit-notes/${savedDoc.id}`); } }}
          title={savedDoc.cnNumber}
          generatePdf={(opts) => generateCreditNote_PDF(savedDoc, selectedCompany, opts)}
          pdfFilename={`${savedDoc.cnNumber}.pdf`}
          onEdit={() => setLocation(`/credit-notes/${savedDoc.id}/edit`)}
        />
      )}
    </div>
  );
}
