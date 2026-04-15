import { useState, useEffect, useRef } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation } from "wouter";
import { useCreateDeliveryOrder, useGetSettings, getGetSettingsQueryKey } from "@workspace/api-client-react";
import { ContactAutocomplete } from "@/components/contact-autocomplete";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { PaymentTermsSelect } from "@/components/payment-terms-select";
import { DirectoryPickerButton } from "@/components/directory-picker-button";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Save, Eye, Lock } from "lucide-react";
import { generateDO_PDF } from "@/lib/pdf";
import { DeliveryDateField } from "@/components/delivery-date-field";
import { IssueDateField, getToday } from "@/components/issue-date-field";
import { PdfPreviewModal } from "@/components/pdf-preview-modal";
import { useAuth } from "@/contexts/auth-context";

const itemSchema = z.object({
  partNumber: z.string().default(""),
  description: z.string(),
  qty: z.coerce.number().min(1, "Must be > 0"),
});

const schema = z.object({
  customerName: z.string().min(1, "Customer name is required"),
  customerAddress: z.string().optional(),
  customerContact: z.string().optional(),
  issueDate: z.string().optional(),
  deliveryDate: z.string().optional(),
  paymentTerms: z.string().optional(),
  notes: z.string().optional(),
  isPrivate: z.boolean().default(false),
  items: z.array(itemSchema).min(1, "At least one item is required"),
});

export default function DeliveryOrderNew() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { selectedCompany } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [savedDoc, setSavedDoc] = useState<any>(null);

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      customerName: "", customerAddress: "", customerContact: "",
      issueDate: getToday(), deliveryDate: "", paymentTerms: "", notes: "",
      isPrivate: false,
      items: [{ partNumber: "", description: "", qty: 1 }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: "items" });
  const createMutation = useCreateDeliveryOrder();
  const { data: settings } = useGetSettings({ query: { queryKey: getGetSettingsQueryKey() } });

  const nextDoNumber = (() => {
    if (!settings) return null;
    const prefix = (settings as any).doPrefix ?? "";
    const counter = parseInt((settings as any).doCounter) || 1;
    const suffix = (settings as any).doSuffix ?? "";
    const padded = String(counter).padStart(4, "0");
    return `${prefix}${prefix ? "-" : ""}${padded}${suffix}`;
  })();

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
      const isEmpty = (!last.description || String(last.description).trim() === "") && (Number(last.qty) <= 1);
      if (!isEmpty && !appendLock.current) {
        appendLock.current = true;
        const focused = document.activeElement as HTMLElement | null;
        append({ partNumber: "", description: "", qty: 1 });
        requestAnimationFrame(() => { focused?.focus(); appendLock.current = false; });
      }
    });
    return () => sub.unsubscribe();
  }, [form, append]);

  async function onSubmit(values: z.infer<typeof schema>, openPreview = false) {
    setIsSubmitting(true);
    const filledItems = values.items.filter(i => i.description.trim() !== "");
    if (filledItems.length === 0) {
      toast({ title: "Error", description: "At least one line item is required.", variant: "destructive" });
      setIsSubmitting(false);
      return;
    }
    createMutation.mutate({ data: { ...values, items: filledItems } }, {
      onSuccess: (data) => {
        setIsSubmitting(false);
        if (openPreview) {
          setSavedDoc(data);
          setPreviewOpen(true);
        } else {
          toast({ title: "Draft saved." });
          setLocation("/delivery-orders");
        }
      },
      onError: (err: any) => {
        toast({ title: "Error", description: err?.message || "Failed to create delivery order.", variant: "destructive" });
        setIsSubmitting(false);
      },
    });
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">New Delivery Order</h1>
          <p className="text-muted-foreground mt-1">Create a new delivery order.</p>
        </div>
        {nextDoNumber && (
          <div className="text-right">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">DO Number</p>
            <p className="text-lg font-semibold font-mono">{nextDoNumber}</p>
          </div>
        )}
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
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
                        placeholder="Acme Corp"
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
                    <FormControl><Textarea placeholder="123 Business Rd..." className="resize-none" rows={3} {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="customerContact" render={({ field }) => (
                  <FormItem><FormLabel>Contact Person / Email</FormLabel>
                    <FormControl><Input placeholder="John Doe (john@example.com)" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-4"><CardTitle className="text-lg">Delivery Details</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <FormField control={form.control} name="issueDate" render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <IssueDateField value={field.value || ""} onChange={field.onChange} label="Document Date" />
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
                <FormField control={form.control} name="notes" render={({ field }) => (
                  <FormItem><FormLabel>Notes</FormLabel>
                    <FormControl><Textarea placeholder="Special delivery instructions..." className="resize-none" rows={3} {...field} /></FormControl><FormMessage /></FormItem>
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
              <CardTitle className="text-lg">Items to Deliver</CardTitle>
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
                      <th className="px-4 py-3 w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {fields.map((field, index) => (
                      <tr key={field.id} className="border-b last:border-0 hover:bg-muted/20">
                        <td className="px-4 py-2 text-muted-foreground text-xs align-top pt-3">{index + 1}</td>
                        <td className="px-4 py-2 align-top">
                          <FormField control={form.control} name={`items.${index}.partNumber`} render={({ field }) => (
                            <FormItem><FormControl><Input className="h-8 text-sm font-mono" placeholder="PN-123" {...field} /></FormControl></FormItem>
                          )} />
                        </td>
                        <td className="px-4 py-2 align-top">
                          <FormField control={form.control} name={`items.${index}.description`} render={({ field }) => (
                            <FormItem><FormControl><RichTextEditor value={field.value} onChange={field.onChange} placeholder="Item description" /></FormControl></FormItem>
                          )} />
                        </td>
                        <td className="px-4 py-2 align-top">
                          <FormField control={form.control} name={`items.${index}.qty`} render={({ field }) => (
                            <FormItem><FormControl><Input inputMode="numeric" className="h-8 text-sm text-right" {...field} /></FormControl></FormItem>
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
            <Button type="button" variant="outline" onClick={() => setLocation("/delivery-orders")}>Cancel</Button>
            <Button type="submit" variant="outline" disabled={isSubmitting} className="gap-2">
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

      {savedDoc && (
        <PdfPreviewModal
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          title={`Delivery Order ${savedDoc.doNumber}`}
          generatePdf={(opts) => generateDO_PDF(savedDoc, selectedCompany, opts)}
          pdfFilename={`${savedDoc.doNumber}.pdf`}
          defaultEmailTo=""
          defaultEmailSubject={`Delivery Order ${savedDoc.doNumber}`}
          defaultEmailBody={`Dear ${savedDoc.customerContact || "Sir/Madam"},\n\nPlease find attached Delivery Order ${savedDoc.doNumber}.\n\nThank you.`}
          onEdit={() => { setPreviewOpen(false); setLocation(`/delivery-orders/${savedDoc.id}/edit`); }}
        />
      )}
    </div>
  );
}
