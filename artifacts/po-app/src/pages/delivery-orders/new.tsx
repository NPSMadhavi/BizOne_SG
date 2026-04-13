import { useState, useEffect, useRef } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation } from "wouter";
import { useCreateDeliveryOrder } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Save } from "lucide-react";
import { generateDO_PDF } from "@/lib/pdf";

const itemSchema = z.object({
  description: z.string(),
  qty: z.coerce.number().min(1, "Must be > 0"),
});

const schema = z.object({
  customerName: z.string().min(1, "Customer name is required"),
  customerAddress: z.string().optional(),
  customerContact: z.string().optional(),
  deliveryDate: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(itemSchema).min(1, "At least one item is required"),
});

export default function DeliveryOrderNew() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      customerName: "", customerAddress: "", customerContact: "",
      deliveryDate: "", notes: "",
      items: [{ description: "", qty: 1 }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: "items" });
  const createMutation = useCreateDeliveryOrder();

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
        append({ description: "", qty: 1 });
        requestAnimationFrame(() => { focused?.focus(); appendLock.current = false; });
      }
    });
    return () => sub.unsubscribe();
  }, [form, append]);

  async function onSubmit(values: z.infer<typeof schema>) {
    setIsSubmitting(true);
    const filledItems = values.items.filter(i => i.description.trim() !== "");
    if (filledItems.length === 0) {
      toast({ title: "Error", description: "At least one line item is required.", variant: "destructive" });
      setIsSubmitting(false);
      return;
    }
    createMutation.mutate({ data: { ...values, items: filledItems } }, {
      onSuccess: async (data) => {
        try { await generateDO_PDF(data); } catch {}
        toast({ title: "Success", description: "Delivery order created and PDF downloaded." });
        setLocation(`/delivery-orders/${data.id}`);
      },
      onError: (err: any) => {
        toast({ title: "Error", description: err?.message || "Failed to create delivery order.", variant: "destructive" });
        setIsSubmitting(false);
      },
    });
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">New Delivery Order</h1>
        <p className="text-muted-foreground mt-1">Create a new delivery order.</p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader className="pb-4"><CardTitle className="text-lg">Customer Details</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <FormField control={form.control} name="customerName" render={({ field }) => (
                  <FormItem><FormLabel>Customer Name <span className="text-destructive">*</span></FormLabel>
                    <FormControl><Input placeholder="Acme Corp" {...field} /></FormControl><FormMessage /></FormItem>
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
                <FormField control={form.control} name="deliveryDate" render={({ field }) => (
                  <FormItem><FormLabel>Delivery Date</FormLabel>
                    <FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="notes" render={({ field }) => (
                  <FormItem><FormLabel>Notes</FormLabel>
                    <FormControl><Textarea placeholder="Special delivery instructions..." className="resize-none" rows={4} {...field} /></FormControl><FormMessage /></FormItem>
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
                      <th className="px-4 py-3 text-left">Description</th>
                      <th className="px-4 py-3 text-right w-24">Qty</th>
                      <th className="px-4 py-3 w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {fields.map((field, index) => (
                      <tr key={field.id} className="border-b last:border-0 hover:bg-muted/20">
                        <td className="px-4 py-2 text-muted-foreground text-xs">{index + 1}</td>
                        <td className="px-4 py-2">
                          <FormField control={form.control} name={`items.${index}.description`} render={({ field }) => (
                            <FormItem><FormControl><Input className="h-8 text-sm border-0 bg-transparent focus:bg-background" placeholder="Item description" {...field} /></FormControl></FormItem>
                          )} />
                        </td>
                        <td className="px-4 py-2">
                          <FormField control={form.control} name={`items.${index}.qty`} render={({ field }) => (
                            <FormItem><FormControl><Input inputMode="numeric" className="h-8 text-sm text-right border-0 bg-transparent focus:bg-background" {...field} /></FormControl></FormItem>
                          )} />
                        </td>
                        <td className="px-4 py-2">
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
            <Button type="submit" disabled={isSubmitting} className="gap-2 min-w-32">
              <Save className="h-4 w-4" />
              {isSubmitting ? "Creating..." : "Create & Download PDF"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
