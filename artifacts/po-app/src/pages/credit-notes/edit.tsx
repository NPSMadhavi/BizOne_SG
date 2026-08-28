import { useState, useEffect, useRef, useCallback } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useParams, useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { FormStickyActions } from "@/components/form-sticky-actions";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { Trash2, Save, Eye, Lock, Plus, Layers, ArrowLeft, FileInput, Package, Pencil } from "lucide-react";
import { ImportItemsDialog } from "@/components/import-items-dialog";
import { StockItemPickerDialog, type StockItemSelection } from "@/components/stock-item-picker-dialog";
import { InvoiceRefPicker, type InvoiceRefOption } from "@/components/invoice-ref-picker";
import { cn } from "@/lib/utils";
import { DirectoryPickerButton } from "@/components/directory-picker-button";
import { IssueDateField, getToday } from "@/components/issue-date-field";
import { PdfPreviewModal } from "@/components/pdf-preview-modal";
import { generateCreditNote_PDF } from "@/lib/pdf";
import { invalidateDocumentList } from "@/lib/invalidate-document-lists";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { Link } from "wouter";
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

function stripHtml(html: string): string {
  return (html || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function mapInvoiceItemsToCn(items: any[]): FormValues["items"] {
  const mapped = (items || []).map((it: any) => {
    if (it.type === "section") {
      return {
        type: "section" as const,
        sectionLabel: it.sectionLabel || stripHtml(it.description || "") || "Section",
        partNumber: "",
        description: "",
        qty: 1,
        unitPrice: 0,
        discount: 0,
        amount: 0,
      };
    }
    const qty = Number(it.qty) || 0;
    const unitPrice = Number(it.unitPrice) || 0;
    const discount = Number(it.discount) || 0;
    return {
      type: "item" as const,
      sectionLabel: "",
      partNumber: (it.partNumber || "").trim(),
      description: stripHtml(it.description || it.name || ""),
      qty,
      unitPrice,
      discount,
      amount: calcAmount(qty, unitPrice, discount),
    };
  });
  return mapped.length > 0
    ? mapped
    : [{ type: "item", sectionLabel: "", partNumber: "", description: "", qty: 1, unitPrice: 0, discount: 0, amount: 0 }];
}

export default function CreditNoteEdit() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { selectedCompany } = useAuth();
  const qc = useQueryClient();
  const [showPreview, setShowPreview] = useState(false);
  const [savedDoc, setSavedDoc] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [ready, setReady] = useState(false);
  const [importExcelOpen, setImportExcelOpen] = useState(false);
  const [stockPickerIndex, setStockPickerIndex] = useState<number | null>(null);
  const [loadingInvoice, setLoadingInvoice] = useState(false);
  const lastLoadedRef = useRef("");

  const { data: doc } = useQuery<any>({
    queryKey: ["credit-note", id],
    queryFn: async () => {
      const r = await fetch(`/api/credit-notes/${id}`, { credentials: "include" });
      if (!r.ok) throw new Error("Not found");
      return r.json();
    },
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      customerName: "", customerAddress: "", contactPerson: "", contactEmail: "",
      refInvNumber: "", reason: "", issueDate: getToday(),
      currency: "SGD", taxRate: 9, discountAmount: 0,
      paymentTerms: "", notes: "",
      isPrivate: false,
      items: [{ type: "item", sectionLabel: "", partNumber: "", description: "", qty: 1, unitPrice: 0, discount: 0, amount: 0 }],
    },
  });

  const { fields, append, remove, replace } = useFieldArray({ control: form.control, name: "items" });

  useEffect(() => {
    if (!doc) return;
    const items = (doc.items ?? []).map((i: any) => ({
      type: i.type ?? "item",
      sectionLabel: i.sectionLabel ?? "",
      partNumber: i.partNumber ?? "",
      description: i.description ?? "",
      qty: i.qty ?? 1,
      unitPrice: i.unitPrice ?? 0,
      discount: i.discount ?? 0,
      amount: i.amount ?? 0,
    }));
    form.reset({
      customerName: doc.customerName ?? "",
      customerAddress: doc.customerAddress ?? "",
      contactPerson: doc.contactPerson ?? "",
      contactEmail: doc.contactEmail ?? "",
      refInvNumber: doc.refInvNumber ?? "",
      reason: doc.reason ?? "",
      issueDate: doc.issueDate ?? getToday(),
      currency: doc.currency ?? "SGD",
      taxRate: doc.taxRate ?? 9,
      discountAmount: doc.discountAmount ?? 0,
      paymentTerms: doc.paymentTerms ?? "",
      notes: doc.notes ?? "",
      isPrivate: doc.isPrivate ?? false,
      items: items.length > 0 ? items : [{ type: "item", sectionLabel: "", partNumber: "", description: "", qty: 1, unitPrice: 0, discount: 0, amount: 0 }],
    });
    lastLoadedRef.current = doc.refInvNumber ?? "";
    setReady(true);
  }, [doc]);

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
    form.setValue(`items.${idx}.amount`, calcAmount(item.qty, item.unitPrice, item.discount));
  }

  function applyInvoiceToForm(inv: InvoiceRefOption) {
    form.setValue("refInvNumber", inv.invNumber || "");
    form.setValue("customerName", inv.customerName || "");
    form.setValue("customerAddress", inv.customerAddress || "");
    form.setValue("contactPerson", inv.customerContact || "");
    form.setValue("contactEmail", inv.customerContactEmail || "");
    form.setValue("currency", inv.currency || "SGD");
    form.setValue("paymentTerms", inv.paymentTerms || "");
    if (inv.notes) form.setValue("notes", inv.notes);

    const sub = Number(inv.subtotal) || 0;
    const disc = Number(inv.discountAmount) || 0;
    const taxAmt = Number(inv.tax) || 0;
    const taxable = sub - disc;
    if (taxable > 0 && taxAmt > 0) {
      form.setValue("taxRate", Math.round((taxAmt / taxable) * 1000) / 10);
    }
    if (disc > 0) form.setValue("discountAmount", disc);

    form.setValue("items", mapInvoiceItemsToCn(inv.items || []));
    lastLoadedRef.current = inv.invNumber || "";
    toast({
      title: "Invoice loaded",
      description: `${inv.invNumber}: customer and stock line items filled automatically.`,
    });
  }

  const loadFromInvoice = useCallback(async (rawNumber: string) => {
    const invNumber = rawNumber.trim();
    if (!invNumber) return;
    if (lastLoadedRef.current.toLowerCase() === invNumber.toLowerCase()) return;

    setLoadingInvoice(true);
    try {
      const res = await fetch(`/api/invoices/by-number/${encodeURIComponent(invNumber)}`, {
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast({
          title: "Invoice not found",
          description: err.error || `No invoice matching "${invNumber}"`,
          variant: "destructive",
        });
        return;
      }
      const inv = await res.json();
      applyInvoiceToForm(inv);
    } catch {
      toast({ title: "Failed to load invoice", variant: "destructive" });
    } finally {
      setLoadingInvoice(false);
    }
  }, [form, toast]);

  async function doSubmit(status: "draft" | "confirmed") {
    const valid = await form.trigger();
    if (!valid) return;
    const values = form.getValues();
    setSubmitting(true);
    try {
      const r = await fetch(`/api/credit-notes/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({
          ...values,
          items: values.items.map((item) => ({
            ...item,
            amount: item.type === "section" ? 0 : calcAmount(item.qty, item.unitPrice, item.discount),
          })),
          subtotal, tax, totalAmount: total, status,
        }),
      });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || "Failed"); }
      const updated = await r.json();
      setSavedDoc(updated);
      qc.setQueryData(["credit-note", id], updated);
      qc.setQueryData(["credit-notes"], (old: any) =>
        Array.isArray(old) ? old.map((d: any) => (d.id === updated.id ? { ...d, ...updated } : d)) : old,
      );
      await invalidateDocumentList(qc, "credit-notes");
      toast({ title: status === "confirmed" ? "Credit note confirmed" : "Draft saved" });
      setShowPreview(true);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setSubmitting(false); }
  }

  const currency = form.watch("currency");
  const fmt = (n: number) => new Intl.NumberFormat("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

  if (!ready) return <div className="text-center py-16 text-gray-400">Loading…</div>;
  if (doc?.status === "void") return (
    <div className="text-center py-16">
      <p className="text-red-500">This credit note has been voided and cannot be edited.</p>
      <Link href={`/credit-notes/${id}`}><Button variant="outline" className="mt-4">View Credit Note</Button></Link>
    </div>
  );

  return (
    <div className="max-w-[1600px] mx-auto pb-20 space-y-6 animate-in fade-in duration-300">
      <div className="flex items-center justify-between pb-4 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setLocation(`/credit-notes/${id}`)}
            className="h-9 w-9 shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold text-[#2563EB]">Edit Credit Note — {doc?.cnNumber}</h1>
        </div>
      </div>

      <Form {...form}>
        <form className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle className="text-sm">Customer</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2 items-end">
                  <FormField control={form.control} name="customerName" render={({ field }) => (
                    <FormItem className="flex-1">
                      <FormLabel>Customer Name <span className="text-destructive">*</span></FormLabel>
                      <FormControl><Input {...field} /></FormControl>
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
                    <FormControl><Textarea {...field} rows={3} /></FormControl>
                  </FormItem>
                )} />
                <div className="grid grid-cols-2 gap-3">
                  <FormField control={form.control} name="contactPerson" render={({ field }) => (
                    <FormItem><FormLabel>Contact Person</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>
                  )} />
                  <FormField control={form.control} name="contactEmail" render={({ field }) => (
                    <FormItem><FormLabel>Contact Email</FormLabel><FormControl><Input {...field} type="email" /></FormControl></FormItem>
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
                      <FormControl>
                        <InvoiceRefPicker
                          value={field.value || ""}
                          loading={loadingInvoice}
                          onChange={(v) => {
                            field.onChange(v);
                            if (!v) lastLoadedRef.current = "";
                          }}
                          onSelectInvoice={(inv) => {
                            if (Array.isArray(inv.items) && inv.items.length > 0) {
                              applyInvoiceToForm(inv);
                            } else {
                              void loadFromInvoice(inv.invNumber);
                            }
                          }}
                          onCommitTyped={(v) => void loadFromInvoice(v)}
                        />
                      </FormControl>
                      <p className="text-[11px] text-muted-foreground">
                        Type invoice no. or pick from list — stock items fill automatically
                      </p>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="issueDate" render={({ field }) => (
                    <IssueDateField value={field.value ?? ""} onChange={field.onChange} label="Issue Date" />
                  )} />
                </div>
                <FormField control={form.control} name="reason" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reason for Return</FormLabel>
                    <FormControl><Textarea {...field} rows={2} placeholder="Returned goods, billing error…" /></FormControl>
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
                    <FormItem><FormLabel>GST %</FormLabel><FormControl><Input {...field} type="text" inputMode="decimal" min={0} max={100} step={0.1} /></FormControl></FormItem>
                  )} />
                </div>
                <FormField control={form.control} name="notes" render={({ field }) => (
                  <FormItem><FormLabel>Notes</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>
                )} />
                <FormField control={form.control} name="isPrivate" render={({ field }) => (
                  <FormItem className="flex items-center gap-3 pt-1">
                    <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                    <span className="text-sm flex items-center gap-1.5"><Lock className="h-3.5 w-3.5" />Private</span>
                  </FormItem>
                )} />
              </CardContent>
            </Card>
          </div>

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
                <Button type="button" size="sm" variant="outline" className="gap-1.5 text-xs h-8 text-primary border-primary/30 hover:bg-primary/5"
                  onClick={() => setImportExcelOpen(true)}>
                  <FileInput className="h-3.5 w-3.5" />Import from Excel / PDF
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
                      <th className="w-16 px-2"></th>
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
                              <Input {...form.register(`items.${idx}.sectionLabel`)} placeholder="Section heading…" className="font-semibold text-gray-700 border-dashed" />
                            </td>
                          ) : (
                            <>
                              <td className="px-3 py-2">
                                <div className="flex items-center gap-1">
                                  <Input {...form.register(`items.${idx}.partNumber`)} placeholder="Part #" className="text-xs h-8" />
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 shrink-0 text-muted-foreground hover:text-primary"
                                    onClick={() => setStockPickerIndex(idx)}
                                    title="Pick from stock"
                                  >
                                    <Package className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </td>
                              <td className="px-3 py-2"><Input {...form.register(`items.${idx}.description`)} placeholder="Description" className="text-xs h-8" /></td>
                              <td className="px-3 py-2"><Input {...form.register(`items.${idx}.qty`, { onChange: () => updateItemAmount(idx) })} type="text" inputMode="decimal" min={0} step={0.01} className="text-xs h-8 text-right w-20 ml-auto" /></td>
                              <td className="px-3 py-2"><Input {...form.register(`items.${idx}.unitPrice`, { onChange: () => updateItemAmount(idx) })} type="text" inputMode="decimal" min={0} step={0.01} className="text-xs h-8 text-right w-28 ml-auto" /></td>
                              <td className="px-3 py-2"><Input {...form.register(`items.${idx}.discount`, { onChange: () => updateItemAmount(idx) })} type="text" inputMode="decimal" min={0} max={100} step={0.01} className="text-xs h-8 text-right w-20 ml-auto" /></td>
                              <td className="px-3 py-2 text-right font-mono text-xs text-gray-700 w-28">
                                {fmt(calcAmount(watchItems[idx]?.qty || 0, watchItems[idx]?.unitPrice || 0, watchItems[idx]?.discount || 0))}
                              </td>
                            </>
                          )}
                          <td className="px-2 py-2">
                            <div className="flex items-center justify-end gap-0.5">
                              {!isSection && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 text-gray-400 hover:text-primary"
                                  onClick={() => setStockPickerIndex(idx)}
                                  title="Edit item"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 text-gray-400 hover:text-red-500" onClick={() => remove(idx)} title="Delete">
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end p-4 border-t border-gray-200">
                <div className="w-72 space-y-2 text-sm">
                  <div className="flex justify-between text-gray-600">
                    <span>Subtotal</span><span className="font-mono">{currency} {fmt(subtotal)}</span>
                  </div>
                  {docDiscount > 0 && (
                    <div className="flex justify-between text-gray-600">
                      <span>Discount</span><span className="font-mono text-red-600">- {currency} {fmt(docDiscount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-gray-600">
                    <span>GST ({fmt(Number(watchTax))}%)</span><span className="font-mono">{currency} {fmt(tax)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-base border-t pt-2 text-gray-900">
                    <span>Credit Total</span><span className="font-mono">{currency} {fmt(total)}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-4"><CardTitle className="text-lg">Additional Information</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem>
                  <FormLabel>Internal Notes</FormLabel>
                  <FormControl><RichTextEditor value={field.value ?? ""} onChange={field.onChange} placeholder="Internal notes (not shown on PDF)..." className="min-h-[96px]" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </CardContent>
          </Card>

          <FormStickyActions>
            <Button type="button" variant="outline" onClick={() => setLocation(`/credit-notes/${id}`)}>Cancel</Button>
            <Button type="button" variant="outline" onClick={() => doSubmit("draft")} disabled={submitting} className="gap-2">
              <Save className="h-4 w-4" />
              {submitting ? "Saving..." : "Save Draft"}
            </Button>
            <Button type="button" onClick={() => doSubmit("confirmed")} disabled={submitting} className="gap-2">
              <Eye className="h-4 w-4" />
              {submitting ? "Saving..." : "Save & Preview"}
            </Button>
          </FormStickyActions>
        </form>
      </Form>

      <ImportItemsDialog
        open={importExcelOpen}
        onClose={() => setImportExcelOpen(false)}
        onImport={(imported, replace) => {
          const newItems = imported.map(it => ({ type: "item" as const, sectionLabel: "", partNumber: it.partNumber, description: it.description, qty: it.qty, unitPrice: it.unitPrice, discount: 0, amount: 0 }));
          if (replace) { form.setValue("items", newItems); } else { for (const item of newItems) append(item); }
        }}
      />

      <StockItemPickerDialog
        open={stockPickerIndex !== null}
        onOpenChange={(open) => { if (!open) setStockPickerIndex(null); }}
        mode="receive"
        onSelect={({ item, qty }: StockItemSelection) => {
          if (stockPickerIndex === null) return;
          form.setValue(`items.${stockPickerIndex}.partNumber`, item.code);
          form.setValue(`items.${stockPickerIndex}.description`, item.name);
          form.setValue(`items.${stockPickerIndex}.unitPrice`, Number(item.unitPrice) || 0);
          if (qty && qty > 0) form.setValue(`items.${stockPickerIndex}.qty`, qty);
          updateItemAmount(stockPickerIndex);
          setStockPickerIndex(null);
        }}
      />
      {showPreview && (savedDoc || doc) && (
        <PdfPreviewModal
          open={showPreview}
          onOpenChange={(open) => { if (!open) { setShowPreview(false); setLocation(`/credit-notes`); } }}
          title={(savedDoc ?? doc).cnNumber}
          generatePdf={(opts) => generateCreditNote_PDF(savedDoc ?? doc, selectedCompany, opts)}
          pdfFilename={`${(savedDoc ?? doc).cnNumber}.pdf`}
          defaultEmailTo={(savedDoc ?? doc as any).contactEmail || ""}
          defaultEmailSubject={`Credit Note ${(savedDoc ?? doc).cnNumber}`}
          defaultEmailBody={`Dear ${(savedDoc ?? doc as any).contactPerson || "Sir/Madam"},\n\nPlease find attached Credit Note ${(savedDoc ?? doc).cnNumber}.\n\nThank you.`}
          docInfo={{
            docType: "Credit Note",
            docNumber: (savedDoc ?? doc).cnNumber,
            customerName: (savedDoc ?? doc as any).customerName || (savedDoc ?? doc as any).contactPerson || "",
            companyName: (selectedCompany as any)?.name || "RSV Infotech",
            items: (((savedDoc ?? doc).items as any[]) || []).filter((i: any) => i.type !== "section"),
            currency: (savedDoc ?? doc as any).currency || "SGD",
            totalAmount: Number((savedDoc ?? doc as any).totalAmount) || 0,
          }}
          onEdit={() => setShowPreview(false)}
        />
      )}
    </div>
  );
}
