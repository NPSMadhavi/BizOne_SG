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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Save, ArrowLeft } from "lucide-react";

const itemSchema = z.object({
  partNumber: z.string(),
  description: z.string(),
  qty: z.coerce.number().min(1, "Must be > 0"),
  unitPrice: z.coerce.number().min(0, "Cannot be negative"),
});

const poSchema = z.object({
  vendorName: z.string().min(1, "Vendor name is required"),
  vendorAddress: z.string().optional(),
  vendorContact: z.string().optional(),
  deliveryAddress: z.string().optional(),
  deliveryDate: z.string().optional(),
  paymentTerms: z.string().optional(),
  notes: z.string().optional(),
  status: z.enum(["draft", "confirmed", "cancelled"]),
  tax: z.coerce.number().min(0).max(100).default(0),
  items: z.array(itemSchema).min(1, "At least one item is required"),
});

export default function PurchaseOrderEdit() {
  const params = useParams();
  const id = Number(params.id);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [initialized, setInitialized] = useState(false);

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
      deliveryAddress: "",
      deliveryDate: "",
      paymentTerms: "30 Days Net",
      notes: "",
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
        deliveryAddress: po.deliveryAddress ?? "",
        deliveryDate: po.deliveryDate ?? "",
        paymentTerms: po.paymentTerms ?? "30 Days Net",
        notes: po.notes ?? "",
        status: (po.status as "draft" | "confirmed" | "cancelled") ?? "confirmed",
        tax: po.tax ?? 9,
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

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("en-SG", { style: "currency", currency: "SGD" }).format(value);

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
          toast({ title: "Success", description: "Purchase order updated." });
          setLocation(`/purchase-orders/${data.id}`);
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
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-lg">Vendor Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="vendorName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Vendor Name <span className="text-destructive">*</span></FormLabel>
                      <FormControl>
                        <Input placeholder="Acme Corp" {...field} />
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
                      <FormLabel>Contact Person / Email</FormLabel>
                      <FormControl>
                        <Input placeholder="John Doe (john@example.com)" {...field} />
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
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="deliveryDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Delivery Date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
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
                          <Input placeholder="30 Days Net" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="draft">Draft</SelectItem>
                          <SelectItem value="confirmed">Confirmed</SelectItem>
                          <SelectItem value="cancelled">Cancelled</SelectItem>
                        </SelectContent>
                      </Select>
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
                      <span className="text-muted-foreground">Tax %</span>
                      <FormField
                        control={form.control}
                        name="tax"
                        render={({ field }) => (
                          <FormItem className="mb-0">
                            <FormControl>
                              <Input
                                type="number"
                                min="0"
                                max="100"
                                className="h-7 w-16 text-right"
                                {...field}
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
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

          <div className="flex justify-end gap-4 fixed bottom-0 left-0 right-0 p-4 bg-background/80 backdrop-blur-sm border-t md:left-64 md:px-8 z-10">
            <Button
              type="button"
              variant="outline"
              onClick={() => setLocation(`/purchase-orders/${id}`)}
            >
              Cancel
            </Button>
            <Button type="submit" className="gap-2" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? (
                "Saving..."
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  Save Changes
                </>
              )}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
