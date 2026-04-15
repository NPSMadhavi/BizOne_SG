import { useEffect, useRef, useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation, useParams } from "wouter";
import {
  useGetPurchaseOrder,
  getGetPurchaseOrderQueryKey,
  useUpdatePurchaseOrder,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
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
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Save, ArrowLeft, Eye, Lock } from "lucide-react";
import { PaymentTermsSelect } from "@/components/payment-terms-select";
import { DeliveryDateField } from "@/components/delivery-date-field";
import { IssueDateField } from "@/components/issue-date-field";
import { PdfPreviewModal } from "@/components/pdf-preview-modal";
import { DirectoryPickerButton } from "@/components/directory-picker-button";
import { generatePO_PDF } from "@/lib/pdf";
import { useAuth } from "@/contexts/auth-context";
import { ContactAutocomplete } from "@/components/contact-autocomplete";

const itemSchema = z.object({
  partNumber: z.string(),
  description: z.string(),
  qty: z.coerce.number().min(1, "Must be > 0"),
  unitPrice: z.coerce.number().min(0, "Cannot be negative"),
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
  status: z.enum(["draft", "confirmed", "cancelled"]),
  tax: z.coerce.number().min(0).max(100).default(0),
  items: z.array(itemSchema).min(1, "At least one item is required"),
});

export default function PurchaseOrderEdit() {
  const params = useParams();
  const id = Number(params.id);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { selectedCompany } = useAuth();
  const queryClient = useQueryClient();
  const [initialized, setInitialized] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const { data: po, isLoading } = useGetPurchaseOrder(id, {
    query: {
      queryKey: getGetPurchaseOrderQueryKey(id),
      enabled: !!id,
    },
  });

  const form = useForm<z.infer<typeof poSchema>>({
    resolver: zodResolver(poSchema),
    defaultValues: {
      vendorName: "",
      vendorAddress: "",
      vendorContact: "",
      vendorContactEmail: "",
      issueDate: "",
      deliveryAddress: "",
      deliveryDate: "",
      paymentTerms: "30 Days Net",
      notes: "",
      currency: "SGD",
      status: "confirmed",
      tax: 9,
      items: [{ partNumber: "", description: "", qty: 1, unitPrice: 0 }],
    },
  });

  useEffect(() => {
    if (po && !initialized) {
      form.reset({
        vendorName: po.vendorName ?? "",
        vendorAddress: po.vendorAddress ?? "",
        vendorContact: po.vendorContact ?? "",
        vendorContactEmail: (po as any).vendorContactEmail ?? "",
        issueDate: (po as any).issueDate ?? "",
        quoteRefNo: (po as any).quoteRefNo ?? "",
        deliveryAddress: po.deliveryAddress ?? "",
        deliveryDate: po.deliveryDate ?? "",
        paymentTerms: po.paymentTerms ?? "30 Days Net",
        notes: po.notes ?? "",
        currency: (po as any).currency || "SGD",
        isPrivate: (po as any).isPrivate ?? false,
        status: (po.status as "draft" | "confirmed" | "cancelled") ?? "confirmed",
        tax: po.subtotal && Number(po.subtotal) > 0 ? Math.round((Number(po.tax) / Number(po.subtotal)) * 1000) / 10 : 9,
        items: po.items.map((item: any) => ({
          partNumber: item.partNumber ?? "",
          description: item.description ?? "",
          qty: item.qty ?? 1,
          unitPrice: item.unitPrice ?? 0,
        })),
      });
      setInitialized(true);
    }
  }, [po, initialized, form]);

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });

  const updateMutation = useUpdatePurchaseOrder();

  const items = form.watch("items");
  const taxPercent = form.watch("tax") || 0;

  // Auto-append a new empty row ONLY when the user edits the very last row (after init)
  const appendLock = useRef(false);
  useEffect(() => {
    if (!initialized) return;
    const subscription = form.watch((values, { name }) => {
      if (!name?.startsWith("items.")) return;
      const match = name.match(/^items\.(\d+)\./);
      if (!match) return;
      const changedIndex = parseInt(match[1], 10);
      const allItems = values.items ?? [];
      // Only react when the user is typing in the last row
      if (changedIndex !== allItems.length - 1) return;
      const last = allItems[changedIndex];
      if (!last) return;
      const lastIsEmpty =
        (!last.partNumber || String(last.partNumber).trim() === "") &&
        (!last.description || String(last.description).trim() === "") &&
        (last.unitPrice === undefined || last.unitPrice === null || String(last.unitPrice).trim() === "" || Number(last.unitPrice) === 0) &&
        (last.qty === undefined || last.qty === null || String(last.qty).trim() === "" || Number(last.qty) <= 1);
      if (!lastIsEmpty && !appendLock.current) {
        appendLock.current = true;
        const focused = document.activeElement as HTMLElement | null;
        append({ partNumber: "", description: "", qty: 1, unitPrice: 0 });
        requestAnimationFrame(() => {
          focused?.focus();
          appendLock.current = false;
        });
      }
    });
    return () => subscription.unsubscribe();
  }, [form, append, initialized]);

  const subtotal = items.reduce(
    (sum, item) => sum + (Number(item.qty) || 0) * (Number(item.unitPrice) || 0),
    0
  );
  const taxAmount = subtotal * (taxPercent / 100);
  const totalAmount = subtotal + taxAmount;

  const currency = form.watch("currency") || "SGD";
  const CURRENCY_LOCALE: Record<string, string> = { SGD: "en-SG", USD: "en-US", EUR: "en-IE", GBP: "en-GB", MYR: "ms-MY", INR: "en-IN" };
  const formatCurrency = (value: number) =>
    new Intl.NumberFormat(CURRENCY_LOCALE[currency] || "en", { style: "currency", currency }).format(value);

  async function onSubmit(values: z.infer<typeof poSchema>) {
    const filledItems = values.items.filter(
      (item) => item.partNumber.trim() !== "" || item.description.trim() !== ""
    );
    if (filledItems.length === 0) {
      toast({ title: "Error", description: "At least one line item is required.", variant: "destructive" });
      return;
    }
    const itemsWithAmount = filledItems.map((item) => ({
      ...item,
      amount: item.qty * item.unitPrice,
    }));

    updateMutation.mutate(
      { id, data: { ...values, items: itemsWithAmount } },
      {
        onSuccess: (data) => {
          queryClient.invalidateQueries({ queryKey: getGetPurchaseOrderQueryKey(id) });
          toast({ title: "Draft saved." });
        },
        onError: (error: any) => {
          toast({
            title: "Error",
            description: error?.message || "Failed to update purchase order.",
            variant: "destructive",
          });
        },
      }
    );
  }

  if (isLoading || !initialized) {
    return (
      <div className="space-y-6 max-w-5xl mx-auto">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!po) return <div>Purchase order not found.</div>;

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation(`/purchase-orders/${id}`)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Edit {po.poNumber}</h1>
          <p className="text-muted-foreground mt-1">Update the purchase order details.</p>
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
                <CardTitle className="text-lg">Vendor Details</CardTitle>
                <DirectoryPickerButton
                  type="vendor"
                  onSelect={(v) => {
                    form.setValue("vendorName", v.name);
                    form.setValue("vendorAddress", v.fullAddress);
                    form.setValue("vendorContact", v.contactPerson);
                    form.setValue("vendorContactEmail", v.contactEmail);
                    if (v.effectiveGstRate !== undefined) form.setValue("tax", v.effectiveGstRate);
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
                      <FormControl>
                        <Textarea placeholder="123 Business Rd..." className="resize-none" rows={3} {...field} />
                      </FormControl>
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
                      <FormControl>
                        <Input placeholder="John Doe" {...field} />
                      </FormControl>
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
                      <FormControl>
                        <Input placeholder="john@example.com" type="email" {...field} />
                      </FormControl>
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
                      <FormControl>
                        <Textarea className="resize-none" rows={3} {...field} />
                      </FormControl>
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
                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <select
                        value={field.value}
                        onChange={e => field.onChange(e.target.value)}
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      >
                        <option value="draft">Draft</option>
                        <option value="confirmed">Confirmed</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                      <FormMessage />
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
              </div>
              {form.formState.errors.items?.root && (
                <div className="text-sm text-destructive mt-2">
                  {form.formState.errors.items.root.message}
                </div>
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
                    <th className="px-4 py-3 font-medium w-32 text-right">Unit Price</th>
                    <th className="px-4 py-3 font-medium w-32 text-right">Amount</th>
                    <th className="px-4 py-3 font-medium w-16 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {fields.map((field, index) => {
                    const itemQty = Number(items[index]?.qty) || 0;
                    const itemPrice = Number(items[index]?.unitPrice) || 0;
                    const itemAmount = itemQty * itemPrice;

                    return (
                      <tr key={field.id} className="bg-card">
                        <td className="px-4 py-2 text-center text-muted-foreground">{index + 1}</td>
                        <td className="px-4 py-2">
                          <FormField
                            control={form.control}
                            name={`items.${index}.partNumber`}
                            render={({ field }) => (
                              <FormItem>
                                <FormControl>
                                  <Input className="h-8" placeholder="PN-123" {...field} />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                        </td>
                        <td className="px-4 py-2 align-top">
                          <FormField
                            control={form.control}
                            name={`items.${index}.description`}
                            render={({ field }) => (
                              <FormItem>
                                <FormControl>
                                  <RichTextEditor value={field.value} onChange={field.onChange} placeholder="Item description" />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                        </td>
                        <td className="px-4 py-2">
                          <FormField
                            control={form.control}
                            name={`items.${index}.qty`}
                            render={({ field }) => (
                              <FormItem>
                                <FormControl>
                                  <Input inputMode="numeric" className="h-8 text-center" {...field} />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                        </td>
                        <td className="px-4 py-2">
                          <FormField
                            control={form.control}
                            name={`items.${index}.unitPrice`}
                            render={({ field }) => (
                              <FormItem>
                                <FormControl>
                                  <Input inputMode="decimal" className="h-8 text-right" {...field} />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                        </td>
                        <td className="px-4 py-2 text-right font-medium text-muted-foreground bg-muted/10">
                          {formatCurrency(itemAmount)}
                        </td>
                        <td className="px-4 py-2 text-center">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            onClick={() => remove(index)}
                            disabled={fields.length === 1}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
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
                          <Textarea
                            placeholder="Any special instructions or terms..."
                            className="resize-none h-24"
                            {...field}
                          />
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
            <Button
              type="button"
              variant="outline"
              onClick={() => setLocation(`/purchase-orders/${id}`)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="outline" className="gap-2" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Saving..." : <><Save className="h-4 w-4" />Save as Draft</>}
            </Button>
            <Button
              type="button"
              className="gap-2"
              disabled={updateMutation.isPending}
              onClick={form.handleSubmit(async (values) => {
                const filledItems = values.items.filter(i => i.partNumber.trim() !== "" || i.description.trim() !== "");
                if (!filledItems.length) return;
                const itemsWithAmount = filledItems.map(i => ({ ...i, amount: i.qty * i.unitPrice }));
                updateMutation.mutate(
                  { id, data: { ...values, items: itemsWithAmount } },
                  {
                    onSuccess: async () => {
                      setLocation(`/purchase-orders/${id}`);
                    },
                    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
                  }
                );
              })}
            >
              <Eye className="h-4 w-4" />
              Save
            </Button>
          </div>
        </form>
      </Form>

      {po && (
        <PdfPreviewModal
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          title={`Purchase Order ${po.poNumber}`}
          generatePdf={(opts) => generatePO_PDF(po, selectedCompany, opts)}
          pdfFilename={`${po.poNumber}.pdf`}
          defaultEmailTo={(po as any).vendorContactEmail || ""}
          defaultEmailSubject={`Purchase Order ${po.poNumber}`}
          defaultEmailBody={`Dear ${po.vendorContact || "Sir/Madam"},\n\nPlease find attached our Purchase Order ${po.poNumber}.\n\nKindly acknowledge receipt and confirm acceptance.\n\nThank you.`}
          onEdit={() => setPreviewOpen(false)}
        />
      )}
    </div>
  );
}
