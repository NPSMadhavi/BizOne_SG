import { useState, useEffect, useRef } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useParams, useLocation } from "wouter";
import { ContactAutocomplete } from "@/components/contact-autocomplete";
import { useGetDeliveryOrder, useUpdateDeliveryOrder, getGetDeliveryOrderQueryKey, useListPurchaseOrders, getListPurchaseOrdersQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { ItemImageField } from "@/components/item-image-field";
import { PaymentTermsSelect } from "@/components/payment-terms-select";
import { DirectoryPickerButton } from "@/components/directory-picker-button";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useVedaFormFill } from "@/hooks/useVedaFormFill";
import { Trash2, Save, ArrowLeft, Eye, Lock, Plus, FileInput, Package } from "lucide-react";
import { StockItemPickerDialog, type StockItemSelection } from "@/components/stock-item-picker-dialog";
import { ImportFromPODialog } from "@/components/import-from-po-dialog";
import type { DOImportItem } from "@/components/import-from-po-dialog";
import { ImportItemsDialog } from "@/components/import-items-dialog";
import { DeliveryDateField } from "@/components/delivery-date-field";
import { IssueDateField } from "@/components/issue-date-field";
import { PdfPreviewModal } from "@/components/pdf-preview-modal";
import { generateDO_PDF } from "@/lib/pdf";
import { UomSelect } from "@/components/uom-select";
import { useAuth } from "@/contexts/auth-context";

const itemSchema = z.object({
  partNumber: z.string().default(""),
  description: z.string(),
  qty: z.coerce.number().min(1),
  uom: z.string().default(""),
  itemImage: z.string().default(""),
  serialNumbers: z.string().default(""),
});

const schema = z.object({
  customerName: z.string().min(1, "Required"),
  customerAddress: z.string().optional(),
  customerContact: z.string().optional(),
  customerContactEmail: z.string().email("Invalid email").optional().or(z.literal("")),
  deliveryAddress: z.string().optional(),
  issueDate: z.string().optional(),
  deliveryDate: z.string().optional(),
  paymentTerms: z.string().optional(),
  notes: z.string().optional(),
  isPrivate: z.boolean().default(false),
  status: z.enum(["draft", "confirmed", "cancelled"]),
  items: z.array(itemSchema).min(1),
});

export default function DeliveryOrderEdit() {
  const params = useParams();
  const id = Number(params.id);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { selectedCompany } = useAuth();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const initialized = useRef(false);

  const { data: doc } = useGetDeliveryOrder(id, {
    query: { queryKey: getGetDeliveryOrderQueryKey(id), enabled: !!id },
  });

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      customerName: "", customerAddress: "", customerContact: "",
      issueDate: "", deliveryDate: "", paymentTerms: "", notes: "", isPrivate: false, status: "draft",
      items: [{ partNumber: "", description: "", qty: 1, itemImage: "" }],
    },
  });
  useVedaFormFill(form);

  useEffect(() => {
    if (doc && !initialized.current) {
      const items = (doc.items as any[]) || [];
      form.reset({
        customerName: doc.customerName,
        customerAddress: doc.customerAddress || "",
        customerContact: doc.customerContact || "",
        issueDate: (doc as any).issueDate || "",
        deliveryDate: doc.deliveryDate || "",
        paymentTerms: (doc as any).paymentTerms || "",
        notes: doc.notes || "",
        isPrivate: (doc as any).isPrivate ?? false,
        status: doc.status as any,
        items: items.length > 0 ? items.map((i: any) => ({
          partNumber: i.partNumber || "",
          description: i.description || "",
          qty: Number(i.qty) || 1,
          uom: i.uom || "",
          itemImage: (i as any).itemImage || "",
          serialNumbers: (i as any).serialNumbers || "",
        })) : [{ partNumber: "", description: "", qty: 1, uom: "", itemImage: "", serialNumbers: "" }],
      });
      initialized.current = true;
    }
  }, [doc]);

  const { fields, append, remove } = useFieldArray({ control: form.control, name: "items" });
  const [stockPickerIndex, setStockPickerIndex] = useState<number | null>(null);
  const updateMutation = useUpdateDeliveryOrder();

  const [importPOOpen, setImportPOOpen] = useState(false);
  const [importExcelOpen, setImportExcelOpen] = useState(false);
  function handleImportFromPO(imported: DOImportItem[]) {
    if (!imported.length) return;
    const current = form.getValues("items");
    const allBlank = current.every(i => !i.description?.trim());
    if (allBlank) {
      form.setValue("items", imported as any);
    } else {
      const last = current[current.length - 1];
      const trailingBlank = last && !last.description?.trim();
      form.setValue("items", [...(trailingBlank ? current.slice(0, -1) : current), ...(imported as any)]);
    }
  }

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
      const isEmpty = (!last.description || String(last.description).trim() === "") && (Number(last.qty) <= 1);
      if (!isEmpty && !appendLock.current) {
        appendLock.current = true;
        const focused = document.activeElement as HTMLElement | null;
        append({ partNumber: "", description: "", qty: 1, uom: "", itemImage: "" });
        requestAnimationFrame(() => { focused?.focus(); appendLock.current = false; });
      }
    });
    return () => sub.unsubscribe();
  }, [form, append]);

  async function onSubmit(values: z.infer<typeof schema>, openPreview = false) {
    setIsSubmitting(true);
    const filledItems = values.items.filter(i => i.description.trim() !== "");
    if (filledItems.length === 0) {
      toast({ title: "Error", description: "At least one item required.", variant: "destructive" });
      setIsSubmitting(false);
      return;
    }
    updateMutation.mutate({ id, data: { ...values, status: openPreview ? "confirmed" : "draft", items: filledItems as any } }, {
      onSuccess: async () => {
        await queryClient.refetchQueries({ queryKey: getGetDeliveryOrderQueryKey(id) });
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
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => setLocation(`/delivery-orders/${id}`)}><ArrowLeft className="h-4 w-4" /></Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Edit Delivery Order</h1>
          <p className="text-muted-foreground mt-1">{doc.doNumber}</p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit((v) => onSubmit(v))} className="space-y-8">
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
                          if (c.deliveryAddress) form.setValue("deliveryAddress", c.deliveryAddress);
                        }}
                      />
                    </FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="customerAddress" render={({ field }) => (
                  <FormItem><FormLabel>Delivery Address</FormLabel>
                    <FormControl><Textarea className="resize-none" rows={3} {...field} /></FormControl></FormItem>
                )} />
                <FormField control={form.control} name="customerContact" render={({ field }) => (
                  <FormItem><FormLabel>Contact</FormLabel>
                    <FormControl><Input {...field} /></FormControl></FormItem>
                )} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-4"><CardTitle className="text-lg">Delivery Details</CardTitle></CardHeader>
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
                      <IssueDateField value={field.value || ""} onChange={field.onChange} label="Document Date" />
                    </FormControl><FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="deliveryDate" render={({ field }) => (
                  <FormItem><FormLabel>Delivery Date</FormLabel>
                    <FormControl><DeliveryDateField value={field.value} onChange={field.onChange} /></FormControl></FormItem>
                )} />
                <FormField control={form.control} name="paymentTerms" render={({ field }) => (
                  <FormItem><FormLabel>Payment Terms</FormLabel>
                    <FormControl><PaymentTermsSelect value={field.value} onChange={field.onChange} /></FormControl></FormItem>
                )} />
                <FormField control={form.control} name="notes" render={({ field }) => (
                  <FormItem><FormLabel>Notes</FormLabel>
                    <FormControl><RichTextEditor value={field.value ?? ""} onChange={field.onChange} placeholder="Special delivery instructions..." className="min-h-[96px]" /></FormControl></FormItem>
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
                <CardTitle className="text-lg">Items to Deliver</CardTitle>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" className="gap-1.5 text-xs h-7 text-primary border-primary/30 hover:bg-primary/5" onClick={() => setImportPOOpen(true)}>
                    <FileInput className="h-3 w-3" /> Import from PO
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="gap-1.5 text-xs h-7 text-primary border-primary/30 hover:bg-primary/5" onClick={() => setImportExcelOpen(true)}>
                    <FileInput className="h-3 w-3" /> Import from Excel / PDF
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 text-xs text-muted-foreground uppercase border-b">
                    <tr>
                      <th className="px-4 py-3 text-left w-8">#</th>
                      <th className="px-4 py-3 text-left w-32">Item No.</th>
                      <th className="px-4 py-3 text-left">Description</th>
                      <th className="px-4 py-3 text-right w-24">Qty</th>
                      <th className="px-4 py-3 text-center w-16">UOM</th>
                      <th className="px-4 py-3 w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {fields.map((field, index) => (
                      <tr key={field.id} className="border-b last:border-0 hover:bg-muted/20">
                        <td className="px-4 py-2 text-muted-foreground text-xs align-top pt-3">{index + 1}</td>
                        <td className="px-4 py-2 align-top">
                          <div className="flex gap-1 items-center">
                            <FormField control={form.control} name={`items.${index}.partNumber`} render={({ field }) => (
                              <FormItem className="flex-1"><FormControl><Input className="h-8 text-sm font-mono" placeholder="Item no." {...field} /></FormControl></FormItem>
                            )} />
                            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-primary" title="Pick from stock catalog" onClick={() => setStockPickerIndex(index)}>
                              <Package className="h-3.5 w-3.5" />
                            </Button>
                          </div>
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
                        <td className="px-4 py-2 align-top">
                          <FormField control={form.control} name={`items.${index}.qty`} render={({ field }) => (
                            <FormItem><FormControl><Input inputMode="numeric" className="h-8 text-sm text-right" {...field} /></FormControl></FormItem>
                          )} />
                        </td>
                        <td className="px-4 py-2 align-top">
                          <FormField control={form.control} name={`items.${index}.uom`} render={({ field }) => (
                            <FormItem><FormControl><UomSelect value={field.value ?? ""} onChange={field.onChange} /></FormControl></FormItem>
                          )} />
                        </td>
                        <td className="px-4 py-2 align-top pt-2">
                          {fields.length > 1 && (
                            <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => remove(index)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => setLocation(`/delivery-orders/${id}`)}>Cancel</Button>
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              className="gap-2 min-w-32"
              onClick={form.handleSubmit(v => onSubmit(v, false))}
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
      <StockItemPickerDialog
        open={stockPickerIndex !== null}
        onOpenChange={(v) => { if (!v) setStockPickerIndex(null); }}
        onSelect={({ item, selectedSerials, qty }: StockItemSelection) => {
          if (stockPickerIndex === null) return;
          const desc = [item.name, item.description].filter(Boolean).join(" — ");
          form.setValue(`items.${stockPickerIndex}.partNumber`, item.code);
          form.setValue(`items.${stockPickerIndex}.description`, desc);
          form.setValue(`items.${stockPickerIndex}.uom`, item.uom);
          form.setValue(`items.${stockPickerIndex}.qty`, selectedSerials.length > 0 ? selectedSerials.length : (qty ?? 1));
          form.setValue(`items.${stockPickerIndex}.serialNumbers`, selectedSerials.join("\n"));
          setStockPickerIndex(null);
        }}
      />
      <ImportFromPODialog
        open={importPOOpen}
        onOpenChange={setImportPOOpen}
        mode="do"
        onImport={imported => handleImportFromPO(imported as DOImportItem[])}
      />
      <ImportItemsDialog
        open={importExcelOpen}
        onClose={() => setImportExcelOpen(false)}
        onImport={(imported, replace) => {
          const newItems = imported.map(it => ({ partNumber: it.partNumber, description: it.description, qty: it.qty, uom: it.uom, itemImage: "" }));
          if (replace) { form.setValue("items", newItems); } else { for (const item of newItems) append(item); }
        }}
      />
      <PdfPreviewModal
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        title={doc ? `Delivery Order ${doc.doNumber}` : "Delivery Order Preview"}
        generatePdf={(opts) => generateDO_PDF(doc!, selectedCompany, opts)}
        pdfFilename={doc ? `${doc.doNumber}.pdf` : "delivery-order.pdf"}
        defaultEmailTo={(doc as any)?.customerContactEmail || ""}
        defaultEmailSubject={doc ? `Delivery Order ${doc.doNumber}` : "Delivery Order"}
        docInfo={doc ? {
          docType: "Delivery Order",
          docNumber: doc.doNumber,
          customerName: doc.customerName,
          companyName: (selectedCompany as any)?.name || "RSV Infotech",
          items: ((doc.items as any[]) || []),
          currency: "SGD",
          totalAmount: 0,
        } : undefined}
        onEmailSent={async (recipients) => {
          await fetch(`/api/delivery-orders/${id}/mark-sent`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sentTo: recipients }) });
        }}
        onEdit={() => { setPreviewOpen(false); }}
      />
    </div>
  );
}
