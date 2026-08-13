import { useEffect, useRef, useState, Fragment } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation, useParams } from "wouter";
import {
  useGetPurchaseOrder,
  getGetPurchaseOrderQueryKey,
  getListPurchaseOrdersQueryKey,
  useUpdatePurchaseOrder,
} from "@workspace/api-client-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { invalidateDocumentList } from "@/lib/invalidate-document-lists";
import { invalidateInventoryQueries } from "@/lib/invalidate-inventory";
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
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useVedaFormFill } from "@/hooks/useVedaFormFill";
import { Trash2, Save, ArrowLeft, Eye, Lock, Users, Plus, Layers, AlignCenter, AlignLeft, Package, Upload } from "lucide-react";
import { ImportItemsDialog } from "@/components/import-items-dialog";
import { CustomerPoUploadDialog, type ExtractedPoData } from "@/components/customer-po-upload-dialog";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { PaymentTermsSelect } from "@/components/payment-terms-select";
import { DeliveryDateField } from "@/components/delivery-date-field";
import { IssueDateField } from "@/components/issue-date-field";
import { PdfPreviewModal } from "@/components/pdf-preview-modal";
import { StockItemPickerDialog, type StockItemSelection } from "@/components/stock-item-picker-dialog";
import { DirectoryPickerButton } from "@/components/directory-picker-button";
import { CurrencyMismatchDialog } from "@/components/currency-mismatch-dialog";
import { generatePO_PDF } from "@/lib/pdf";
import { useAuth } from "@/contexts/auth-context";
import { ContactAutocomplete } from "@/components/contact-autocomplete";

const itemSchema = z.object({
  type: z.enum(["item", "section"]).default("item"),
  sectionLabel: z.string().default(""),
  sectionAlign: z.enum(["left", "center"]).default("left"),
  partNumber: z.string(),
  description: z.string(),
  qty: z.coerce.number().min(0).default(1),
  uom: z.string().default(""),
  unitPrice: z.coerce.number().min(0, "Cannot be negative"),
  isStockItem: z.boolean().default(false),
  stockItemId: z.number().nullish(),
  warehouseId: z.number().nullish(),
  warehouseName: z.string().optional(),
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
  customerId: z.number({ required_error: "Customer is required" }).nullable().refine((val) => val !== null, {
    message: "Customer is required",
  }),
  customerPoRef: z.string().optional(),
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
  const [stockPickerIndex, setStockPickerIndex] = useState<number | null>(null);
  const [directoryCurrency, setDirectoryCurrency] = useState<string>("");
  const [directoryCurrencyName, setDirectoryCurrencyName] = useState<string>("");
  const [pendingConfirmValues, setPendingConfirmValues] = useState<z.infer<typeof poSchema> | null>(null);
  const [currencyDialogOpen, setCurrencyDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [poUploadOpen, setPoUploadOpen] = useState(false);

  const { data: po, isLoading } = useGetPurchaseOrder(id, {
    query: {
      queryKey: getGetPurchaseOrderQueryKey(id),
      enabled: !!id,
    },
  });

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
      issueDate: "",
      deliveryAddress: "",
      deliveryDate: "",
      paymentTerms: "30 Days Net",
      notes: "",
      currency: "SGD",
      status: "confirmed",
      tax: 9,
      items: [{ partNumber: "", description: "", qty: 1, unitPrice: 0, itemImage: "" }],
    },
  });
  useVedaFormFill(form);

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
        customerId: (po as any).customerId ?? null,
        customerPoRef: (po as any).customerPoRef ?? "",
        status: po.status === "draft" || po.status === "cancelled" ? po.status : "confirmed",
        tax: po.subtotal && Number(po.subtotal) > 0 ? Math.round((Number(po.tax) / Number(po.subtotal)) * 1000) / 10 : 9,
        items: po.items.map((item: any) => ({
          type: item.type === "section" ? "section" : "item",
          sectionLabel: item.sectionLabel ?? "",
          sectionAlign: item.sectionAlign === "center" ? "center" : "left",
          partNumber: item.partNumber ?? "",
          description: item.description ?? "",
          qty: Number(item.qty) || 1,
          uom: item.uom ?? "",
          unitPrice: Number(item.unitPrice) || 0,
          isStockItem: item.isStockItem === true || Number(item.stockItemId) > 0,
          stockItemId: Number(item.stockItemId) > 0 ? Number(item.stockItemId) : undefined,
          warehouseId: Number(item.warehouseId) > 0 ? Number(item.warehouseId) : undefined,
          warehouseName: item.warehouseName ?? "",
          itemImage: (item as any).itemImage ?? "",
        })),
      });
      setInitialized(true);
    }
  }, [po, initialized, form]);

  const { fields, append, remove, insert } = useFieldArray({
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
      if ((last as any).type === "section") return;
      if (!lastIsEmpty && !appendLock.current) {
        appendLock.current = true;
        const focused = document.activeElement as HTMLElement | null;
        append({ type: "item", sectionLabel: "", sectionAlign: "left", partNumber: "", description: "", qty: 1, uom: "", unitPrice: 0, isStockItem: false, itemImage: "" });
        requestAnimationFrame(() => {
          focused?.focus();
          appendLock.current = false;
        });
      }
    });
    return () => subscription.unsubscribe();
  }, [form, append, initialized]);

  const subtotal = items.reduce(
    (sum, item) => (item as any).type === "section" ? sum : sum + (Number(item.qty) || 0) * (Number(item.unitPrice) || 0),
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
      (item) => (item as any).type === "section"
        ? ((item as any).sectionLabel || "").trim() !== ""
        : (item.partNumber.trim() !== "" || item.description.trim() !== "")
    );
    if (filledItems.length === 0) {
      toast({ title: "Error", description: "At least one line item is required.", variant: "destructive" });
      return;
    }
    const itemsWithAmount = filledItems.map((item) => ({
      ...item,
      amount: (item as any).type === "section" ? 0 : item.qty * item.unitPrice,
      isStockItem: item.isStockItem === true || Number((item as any).stockItemId) > 0,
      stockItemId: Number((item as any).stockItemId) > 0 ? Number((item as any).stockItemId) : undefined,
      warehouseId: Number((item as any).warehouseId) > 0 ? Number((item as any).warehouseId) : undefined,
      warehouseName: (item as any).warehouseName || undefined,
    }));

    updateMutation.mutate(
      { id, data: { ...values, status: "draft", items: itemsWithAmount, customerId: values.customerId ?? undefined } },
      {
        onSuccess: async (data) => {
          queryClient.setQueryData(getListPurchaseOrdersQueryKey(), (old: any) =>
            Array.isArray(old)
              ? old.map((d: any) => (d.id === (data as any)?.id ? data : d))
              : old,
          );
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: getGetPurchaseOrderQueryKey(id) }),
            invalidateDocumentList(queryClient, "purchase-orders"),
          ]);
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

  async function doSaveConfirmed(values: z.infer<typeof poSchema>) {
    const filledItems = values.items.filter(i => (i as any).type === "section" ? ((i as any).sectionLabel || "").trim() !== "" : (i.partNumber.trim() !== "" || i.description.trim() !== ""));
    if (!filledItems.length) return;
    for (const item of filledItems) {
      if ((item as any).type === "section") continue;
      const hasStock = item.isStockItem === true || Number((item as any).stockItemId) > 0;
      if (hasStock && !(Number((item as any).warehouseId) > 0)) {
        toast({
          title: "Warehouse required",
          description: `Select a warehouse for "${item.partNumber || "stock item"}" using the cube icon before saving.`,
          variant: "destructive",
        });
        return;
      }
    }
    const itemsWithAmount = filledItems.map((i) => ({
      ...i,
      amount: (i as any).type === "section" ? 0 : i.qty * i.unitPrice,
      isStockItem: i.isStockItem === true || Number((i as any).stockItemId) > 0,
      stockItemId: Number((i as any).stockItemId) > 0 ? Number((i as any).stockItemId) : undefined,
      warehouseId: Number((i as any).warehouseId) > 0 ? Number((i as any).warehouseId) : undefined,
      warehouseName: (i as any).warehouseName || undefined,
    }));
    updateMutation.mutate(
      { id, data: { ...values, status: "confirmed", items: itemsWithAmount, customerId: values.customerId ?? undefined } },
      {
        onSuccess: async (data) => {
          queryClient.setQueryData(getListPurchaseOrdersQueryKey(), (old: any) =>
            Array.isArray(old)
              ? old.map((d: any) => (d.id === (data as any)?.id ? data : d))
              : old,
          );
          await Promise.all([
            queryClient.refetchQueries({ queryKey: getGetPurchaseOrderQueryKey(id) }),
            invalidateDocumentList(queryClient, "purchase-orders"),
            invalidateInventoryQueries(queryClient),
          ]);
          setPreviewOpen(true);
        },
        onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
      }
    );
  }

  if (isLoading || !initialized) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!po) return <div>Purchase order not found.</div>;

  function handlePoExtracted(data: ExtractedPoData) {
    const blankItem = { type: "item" as const, sectionLabel: "", sectionAlign: "left" as const, partNumber: "", uom: "", description: "", qty: 1, unitPrice: 0, isStockItem: false, itemImage: "" };
    const mappedItems = data.items
      .filter((it) => it.description?.trim())
      .map((it) => ({
        ...blankItem,
        partNumber: it.partNumber || "",
        description: it.description,
        qty: Number(it.qty) || 1,
        uom: it.uom || "",
        unitPrice: Number(it.unitPrice) || 0,
      }));
    const current = form.getValues();
    form.reset({
      ...current,
      vendorName: data.customerName?.trim() || current.vendorName || "",
      vendorAddress: data.customerAddress?.trim() || current.vendorAddress || "",
      vendorContact: data.customerContact?.trim() || current.vendorContact || "",
      vendorContactEmail: data.customerContactEmail?.trim() || current.vendorContactEmail || "",
      currency: data.currency?.trim() || current.currency || "SGD",
      paymentTerms: data.paymentTerms?.trim() || current.paymentTerms || "",
      quoteRefNo: data.poRefNo?.trim() || current.quoteRefNo || "",
      notes: data.notes?.trim() || current.notes || "",
      items: mappedItems.length > 0 ? mappedItems : current.items?.length ? current.items : [blankItem],
    });
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation(`/purchase-orders/${id}`)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-[#2563EB]">Edit {po.poNumber}</h1>
            <p className="text-muted-foreground mt-1">Update the purchase order details.</p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          className="gap-2 border-dashed border-primary/50 text-primary hover:bg-primary/5 shrink-0"
          onClick={() => setPoUploadOpen(true)}
        >
          <Upload className="h-4 w-4" />
          Import Customer PO
        </Button>
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
                  name="customerId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5 text-muted-foreground" />
                        Customer (for reference) <span className="text-destructive">*</span>
                      </FormLabel>
                      <Select
                        value={field.value != null ? String(field.value) : ""}
                        onValueChange={(v) => field.onChange(v === "" ? null : Number(v))}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a customer…" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
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
                <Button type="button" variant="outline" size="sm" className="gap-1.5 text-xs h-8 text-primary border-primary/40 hover:bg-primary/5" onClick={() => setImportOpen(true)}>
                  Import from Excel / PDF
                </Button>
              </div>
              {form.formState.errors.items?.root && (
                <div className="text-sm text-destructive mt-2">
                  {form.formState.errors.items.root.message}
                </div>
              )}
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-xs text-muted-foreground uppercase border-b">
                  <tr>
                    <th className="px-2 py-3 text-left w-8">#</th>
                    <th className="px-2 py-3 text-left w-28">Item / Part Number</th>
                    <th className="px-2 py-3 text-left">Description</th>
                    <th className="px-2 py-3 text-right w-16">Qty</th>
                    <th className="px-2 py-3 text-center w-20">UOM</th>
                    <th className="px-2 py-3 text-right w-28">Unit Price</th>
                    <th className="px-2 py-3 text-right w-28">Amount</th>
                    <th className="px-2 py-3 text-center w-20">Stock Item</th>
                    <th className="px-2 py-3 w-10"></th>
                  </tr>
                </thead>
                <tbody>
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
                        <tr className="border-b last:border-0 hover:bg-muted/20">
                          <td className="px-2 py-2 text-muted-foreground text-xs">{_itemNo}</td>
                          <td className="px-2 py-2">
                            <FormField control={form.control} name={`items.${index}.partNumber`} render={({ field }) => (
                              <FormItem><FormControl>
                                <div className="flex flex-col gap-0.5">
                                  <div className="flex items-center gap-1">
                                    <Input className="h-8 text-sm border-0 bg-transparent focus:bg-background placeholder:text-muted-foreground/40" placeholder="Item" {...field} />
                                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-primary" onClick={() => setStockPickerIndex(index)} title="Pick from stock">
                                      <Package className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                  {items[index]?.warehouseName ? (
                                    <span className="text-[10px] text-muted-foreground pl-1 truncate" title={items[index].warehouseName}>
                                      → {items[index].warehouseName}
                                    </span>
                                  ) : null}
                                </div>
                              </FormControl></FormItem>
                            )} />
                          </td>
                          <td className="px-2 py-2 align-top">
                            <div className="flex gap-2 items-start">
                              <FormField control={form.control} name={`items.${index}.description`} render={({ field }) => (
                                <FormItem className="flex-1 min-w-0"><FormControl><RichTextEditor value={field.value} onChange={field.onChange} placeholder="Item description" /></FormControl></FormItem>
                              )} />
                              <FormField control={form.control} name={`items.${index}.itemImage`} render={({ field }) => (
                                <FormItem><FormControl><ItemImageField value={field.value} onChange={field.onChange} /></FormControl></FormItem>
                              )} />
                            </div>
                          </td>
                          <td className="px-2 py-2">
                            <FormField control={form.control} name={`items.${index}.qty`} render={({ field }) => (
                              <FormItem><FormControl><Input inputMode="numeric" className="h-8 text-sm text-right border-0 bg-transparent focus:bg-background" {...field} /></FormControl></FormItem>
                            )} />
                          </td>
                          <td className="px-2 py-2">
                            <FormField control={form.control} name={`items.${index}.uom`} render={({ field }) => (
                              <FormItem><FormControl>
                                <select className="h-8 text-sm w-full border-0 bg-transparent focus:outline-none cursor-pointer" {...field}>
                                  <option value="">—</option>
                                  <option value="Nos">Nos</option>
                                  <option value="Pcs">Pcs</option>
                                  <option value="Set">Set</option>
                                  <option value="Lot">Lot</option>
                                  <option value="Hr">Hr</option>
                                  <option value="Day">Day</option>
                                  <option value="Month">Month</option>
                                  <option value="Yr">Yr</option>
                                  <option value="Job">Job</option>
                                  <option value="kg">kg</option>
                                  <option value="m">m</option>
                                  <option value="L">L</option>
                                  <option value="Box">Box</option>
                                  <option value="Roll">Roll</option>
                                  <option value="Pair">Pair</option>
                                  <option value="Unit">Unit</option>
                                  <option value="ls">ls</option>
                                </select>
                              </FormControl></FormItem>
                            )} />
                          </td>
                          <td className="px-2 py-2">
                            <FormField control={form.control} name={`items.${index}.unitPrice`} render={({ field }) => (
                              <FormItem><FormControl><Input inputMode="decimal" className="h-8 text-sm text-right border-0 bg-transparent focus:bg-background" placeholder="0.00" {...field} /></FormControl></FormItem>
                            )} />
                          </td>
                          <td className="px-2 py-2 text-right text-sm font-medium text-muted-foreground">
                            {formatCurrency(itemAmount)}
                          </td>
                          <td className="px-2 py-2 text-center">
                            <FormField control={form.control} name={`items.${index}.isStockItem`} render={({ field }) => (
                              <FormItem><FormControl>
                                <Checkbox checked={field.value} onCheckedChange={field.onChange} title="Track serials for this item" />
                              </FormControl></FormItem>
                            )} />
                          </td>
                          <td className="px-2 py-2">
                            {fields.length > 1 && (
                              <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => remove(index)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
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
            <Button
              type="button"
              variant="outline"
              onClick={() => setLocation(`/purchase-orders/${id}`)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              disabled={updateMutation.isPending}
              onClick={form.handleSubmit(onSubmit)}
            >
              {updateMutation.isPending ? "Saving..." : <><Save className="h-4 w-4" />Save as Draft</>}
            </Button>
            <Button
              type="button"
              className="gap-2"
              disabled={updateMutation.isPending}
              onClick={form.handleSubmit(async (values) => {
                if (directoryCurrency && values.currency !== directoryCurrency) {
                  setPendingConfirmValues(values);
                  setCurrencyDialogOpen(true);
                  return;
                }
                await doSaveConfirmed(values);
              })}
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
        entityType="vendor"
        defaultCurrency={directoryCurrency}
        selectedCurrency={form.getValues("currency")}
        onContinue={async () => {
          setCurrencyDialogOpen(false);
          if (pendingConfirmValues) await doSaveConfirmed(pendingConfirmValues);
          setPendingConfirmValues(null);
        }}
        onRevert={async () => {
          setCurrencyDialogOpen(false);
          if (pendingConfirmValues) {
            const updated = { ...pendingConfirmValues, currency: directoryCurrency };
            form.setValue("currency", directoryCurrency);
            await doSaveConfirmed(updated);
          }
          setPendingConfirmValues(null);
        }}
      />


      <StockItemPickerDialog
        open={stockPickerIndex !== null}
        onOpenChange={(open) => { if (!open) setStockPickerIndex(null); }}
        mode="receive"
        onSelect={({ item, qty, warehouseId, warehouseName }: StockItemSelection) => {
          if (stockPickerIndex === null) return;
          if (!warehouseId) {
            toast({
              title: "Warehouse required",
              description: "Select a warehouse before adding the stock item.",
              variant: "destructive",
            });
            return;
          }
          form.setValue(`items.${stockPickerIndex}.partNumber`, item.code);
          form.setValue(`items.${stockPickerIndex}.description`, `<p>${item.name}</p>`);
          form.setValue(`items.${stockPickerIndex}.unitPrice`, Number(item.unitPrice) || 0);
          form.setValue(`items.${stockPickerIndex}.uom`, item.uom || "pcs");
          form.setValue(`items.${stockPickerIndex}.isStockItem`, true);
          form.setValue(`items.${stockPickerIndex}.stockItemId`, item.id);
          form.setValue(`items.${stockPickerIndex}.warehouseId`, warehouseId);
          form.setValue(`items.${stockPickerIndex}.warehouseName`, warehouseName ?? "");
          if (qty && qty > 0) form.setValue(`items.${stockPickerIndex}.qty`, qty);
          setStockPickerIndex(null);
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
      <CustomerPoUploadDialog
        open={poUploadOpen}
        onOpenChange={setPoUploadOpen}
        onApply={handlePoExtracted}
      />

      {po && (
        <PdfPreviewModal
          open={previewOpen}
          onOpenChange={(open) => {
            setPreviewOpen(open);
            if (!open) setLocation(`/purchase-orders`);
          }}
          title={`Purchase Order ${po.poNumber}`}
          generatePdf={(opts) => generatePO_PDF(po, selectedCompany, opts)}
          pdfFilename={`${po.poNumber}.pdf`}
          defaultEmailTo={(po as any).vendorContactEmail || ""}
          defaultEmailSubject={`${po.poNumber} for ${po.vendorName} | ${(selectedCompany as any)?.name || "RSV Infotech"}`}
          defaultEmailBody={`Dear ${po.vendorContact || "Sir/Madam"},\n\nPlease find attached our Purchase Order ${po.poNumber}.\n\nKindly acknowledge receipt and confirm acceptance.\n\nThank you.`}
          docInfo={{
            docType: "Purchase Order",
            docNumber: po.poNumber,
            customerName: po.vendorName,
            companyName: (selectedCompany as any)?.name || "RSV Infotech",
            items: ((po.items as any[]) || []).filter((i: any) => i.type !== "section"),
            currency: (po as any).currency || "SGD",
            totalAmount: Number(po.totalAmount) || 0,
          }}
          poId={po.id}
          onEmailSent={async (recipients) => {
            await fetch(`/api/purchase-orders/${po.id}/mark-sent`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sentTo: recipients }) });
          }}
          onEdit={() => setPreviewOpen(false)}
        />
      )}
    </div>
  );
}
