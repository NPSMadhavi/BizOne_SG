import { useState, useEffect, useRef, Fragment } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation, useSearch } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useCreateInvoice, useGetSettings, getGetSettingsQueryKey, useListPurchaseOrders, getListPurchaseOrdersQueryKey, useGetQuotation, getGetQuotationQueryKey } from "@workspace/api-client-react";
import { invalidateDocumentList } from "@/lib/invalidate-document-lists";
import { invalidateInventoryQueries } from "@/lib/invalidate-inventory";
import { previewRunningNumber } from "@/lib/running-number";
import { ContactAutocomplete } from "@/components/contact-autocomplete";
import { Button } from "@/components/ui/button";
import { FormStickyActions } from "@/components/form-sticky-actions";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { ItemImageField } from "@/components/item-image-field";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Save, Eye, Lock, Package, Plus, Layers, AlignLeft, AlignCenter, Upload, Sparkles, FileInput, ArrowLeft } from "lucide-react";
import { ImportFromPODialog } from "@/components/import-from-po-dialog";
import type { InvoiceImportItem } from "@/components/import-from-po-dialog";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { SerialPickerDialog } from "@/components/serial-picker-dialog";
import { StockItemPickerDialog, type StockItemSelection } from "@/components/stock-item-picker-dialog";
import { generateInvoice_PDF } from "@/lib/pdf";
import { PaymentTermsSelect } from "@/components/payment-terms-select";
import { DirectoryPickerButton } from "@/components/directory-picker-button";
import { CurrencyMismatchDialog } from "@/components/currency-mismatch-dialog";
import { DeliveryDateField } from "@/components/delivery-date-field";
import { IssueDateField, getToday } from "@/components/issue-date-field";
import { PdfPreviewModal } from "@/components/pdf-preview-modal";
import { PORefSelect } from "@/components/po-ref-select";
import { CustomerPoUploadDialog, type ExtractedPoData } from "@/components/customer-po-upload-dialog";
import { AiInvoiceDialog, type AiGeneratedInvoice } from "@/components/ai-invoice-dialog";
import { useAuth } from "@/contexts/auth-context";

const itemSchema = z.object({
  type: z.enum(["item", "section"]).default("item"),
  sectionLabel: z.string().default(""),
  sectionAlign: z.enum(["left", "center"]).default("left"),
  partNumber: z.string(),
  description: z.string(),
  qty: z.coerce.number().min(0).default(1),
  uom: z.string().default(""),
  unitPrice: z.coerce.number().min(0, "Cannot be negative"),
  discount: z.coerce.number().min(0).max(100).default(0),
  isFoc: z.boolean().default(false),
  isStockItem: z.boolean().default(false),
  stockItemId: z.number().positive().optional(),
  warehouseId: z.number().positive().optional(),
  warehouseName: z.string().optional(),
  selectedSerials: z.array(z.string()).default([]),
  selectedSerialIds: z.array(z.number()).default([]),
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
  poRefNo: z.string().optional(),
  notes: z.string().optional(),
  currency: z.string().default("SGD"),
  tax: z.coerce.number().min(0).max(100).default(9),
  discountAmount: z.coerce.number().min(0).default(0),
  isPrivate: z.boolean().default(false),
  items: z.array(itemSchema).min(1, "At least one item is required"),
});

export default function InvoiceNew() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const qtParams = new URLSearchParams(search);
  const qtId = qtParams.get("qtId");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { selectedCompany, user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [savedDoc, setSavedDoc] = useState<any>(null);
  const [isOverseas, setIsOverseas] = useState(false);
  const [directoryCurrency, setDirectoryCurrency] = useState<string>("");
  const [directoryCurrencyName, setDirectoryCurrencyName] = useState<string>("");
  const [pendingConfirmValues, setPendingConfirmValues] = useState<z.infer<typeof schema> | null>(null);
  const [currencyDialogOpen, setCurrencyDialogOpen] = useState(false);
  const [pickerIndex, setPickerIndex] = useState<number | null>(null);
  const [stockPickerIndex, setStockPickerIndex] = useState<number | null>(null);
  const [poUploadOpen, setPoUploadOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [createDeliveryOrder, setCreateDeliveryOrder] = useState(false);

  const allReservedIds = useRef<Set<number>>(new Set());

  async function releaseSerials(ids: number[]) {
    if (ids.length === 0) return;
    try {
      await fetch("/api/stock-serials/release", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serialIds: ids }),
      });
    } catch { }
  }

  async function reserveSerials(ids: number[], invoiceNumber?: string) {
    if (ids.length === 0) return;
    try {
      await fetch("/api/stock-serials/reserve", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serialIds: ids,
          invoiceNumber: invoiceNumber || nextInvNumber || "PENDING",
          reservedByUser: (user as any)?.username || "unknown",
        }),
      });
    } catch { }
  }

  useEffect(() => {
    const handleBeforeUnload = () => {
      const ids = Array.from(allReservedIds.current);
      if (ids.length > 0) {
        navigator.sendBeacon("/api/stock-serials/release", new Blob([JSON.stringify({ serialIds: ids })], { type: "application/json" }));
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      const ids = Array.from(allReservedIds.current);
      releaseSerials(ids);
    };
  }, []);

  const { data: settings } = useGetSettings({ query: { queryKey: getGetSettingsQueryKey() } });
  const qtIdNum = qtId ? Number(qtId) : null;
  const { data: sourceQt } = useGetQuotation(qtIdNum ?? 0, {
    query: { queryKey: getGetQuotationQueryKey(qtIdNum ?? 0), enabled: !!qtIdNum },
  });

  const blankInvItem = { type: "item" as const, sectionLabel: "", partNumber: "", description: "", qty: 1, uom: "", unitPrice: 0, discount: 0, isFoc: false, isStockItem: false, selectedSerials: [], selectedSerialIds: [], itemImage: "" };

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      customerName: qtParams.get("customer") || "", customerAddress: "", customerContact: "", customerContactEmail: "",
      issueDate: getToday(), deliveryDate: "", paymentTerms: "30 Days Net", poRefNo: qtParams.get("qtNumber") || "", notes: "",
      currency: "SGD",
      tax: 9,
      discountAmount: 0,
      isPrivate: false,
      items: [blankInvItem],
    },
  });

  useEffect(() => {
    if (settings) form.setValue("tax", settings.gstRate);
  }, [settings]);

  useEffect(() => {
    if (!sourceQt) return;
    const qtItems = (sourceQt.items as any[]) ?? [];
    form.reset({
      customerName: sourceQt.customerName || "",
      customerAddress: (sourceQt as any).customerAddress || "",
      customerContact: (sourceQt as any).customerContact || "",
      customerContactEmail: (sourceQt as any).customerContactEmail || "",
      issueDate: getToday(),
      deliveryDate: (sourceQt as any).deliveryDate || "",
      paymentTerms: (sourceQt as any).paymentTerms || "30 Days Net",
      poRefNo: sourceQt.qtNumber || "",
      notes: (sourceQt as any).notes || "",
      currency: (sourceQt as any).currency || "SGD",
      tax: (() => {
        const sub = Number((sourceQt as any).subtotal) || 0;
        const disc = Number((sourceQt as any).discountAmount) || 0;
        const taxAmt = Number((sourceQt as any).tax) || 0;
        const taxable = sub - disc;
        if (taxable > 0 && taxAmt > 0) return Math.round((taxAmt / taxable) * 1000) / 10;
        return Number(settings?.gstRate ?? 9);
      })(),
      discountAmount: Number((sourceQt as any).discountAmount ?? 0),
      isPrivate: false,
      items: qtItems.length > 0
        ? qtItems.map((it: any) => ({
            ...blankInvItem,
            type: it.type || "item",
            sectionLabel: it.sectionLabel || "",
            partNumber: it.partNumber || "",
            description: it.description || "",
            qty: Number(it.qty) || 1,
            uom: it.uom || "",
            unitPrice: Number(it.unitPrice) || 0,
            discount: Number(it.discount) || 0,
            isFoc: !!it.isFoc,
            itemImage: it.itemImage || "",
          }))
        : [blankInvItem],
    });
  }, [sourceQt]);

  function handleAiApply(data: AiGeneratedInvoice) {
    const blankItem = { type: "item" as const, sectionLabel: "", sectionAlign: "left" as const, partNumber: "", description: "", qty: 1, uom: "", unitPrice: 0, discount: 0, isFoc: false, isStockItem: false, selectedSerials: [], selectedSerialIds: [], itemImage: "" };
    form.reset({
      customerName: data.customerName || "",
      customerAddress: data.customerAddress || "",
      customerContact: data.customerContact || "",
      customerContactEmail: data.customerContactEmail || "",
      currency: data.currency || "SGD",
      paymentTerms: data.paymentTerms || "30 Days Net",
      notes: data.notes || "",
      issueDate: getToday(),
      deliveryDate: "",
      tax: settings?.gstRate ?? 9,
      discountAmount: Number(data.discountAmount) || 0,
      poRefNo: "",
      isPrivate: false,
      items: data.items?.length
        ? data.items.map(it => ({ ...blankItem, partNumber: it.partNumber || "", description: it.description || "", qty: Number(it.qty) || 1, uom: it.uom || "", unitPrice: Number(it.unitPrice) || 0 }))
        : [blankItem],
    });
  }

  function handlePoExtracted(data: ExtractedPoData) {
    const blankItem = { type: "item" as const, sectionLabel: "", sectionAlign: "left" as const, partNumber: "", description: "", qty: 1, uom: "", unitPrice: 0, discount: 0, isFoc: false, isStockItem: false, selectedSerials: [], selectedSerialIds: [], itemImage: "" };
    const mappedItems = data.items
      .filter(it => it.description?.trim())
      .map(it => ({
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
      customerName: data.customerName?.trim() || current.customerName || "",
      customerAddress: data.customerAddress?.trim() || current.customerAddress || "",
      customerContact: data.customerContact?.trim() || current.customerContact || "",
      customerContactEmail: data.customerContactEmail?.trim() || current.customerContactEmail || "",
      currency: data.currency?.trim() || current.currency || "SGD",
      paymentTerms: data.paymentTerms?.trim() || current.paymentTerms || "30 Days Net",
      notes: data.notes?.trim() || current.notes || "",
      poRefNo: data.poRefNo?.trim() || current.poRefNo || "",
      items: mappedItems.length > 0 ? mappedItems : current.items?.length ? current.items : [blankItem],
    });
  }

  // Aria prefill — populated by the AI agent via navigateTo
  useEffect(() => {
    const prefill = (window as any).__ariaPrefill;
    if (!prefill) return;
    (window as any).__ariaPrefill = null;
    const blankItem = { type: "item" as const, sectionLabel: "", partNumber: "", description: "", qty: 1, uom: "", unitPrice: 0, discount: 0, isFoc: false, isStockItem: false, selectedSerials: [], selectedSerialIds: [], itemImage: "" };
    form.reset({
      customerName: prefill.customerName || "",
      customerAddress: prefill.customerAddress || "",
      customerContact: prefill.customerContact || "",
      customerContactEmail: prefill.customerContactEmail || "",
      currency: prefill.currency || "SGD",
      paymentTerms: prefill.paymentTerms || "30 Days Net",
      poRefNo: "",
      notes: prefill.notes || "",
      issueDate: getToday(),
      deliveryDate: "",
      tax: settings?.gstRate ?? 9,
      discountAmount: prefill.discountAmount ?? 0,
      isPrivate: false,
      items: prefill.items?.length
        ? prefill.items.map((it: any) => ({ ...blankItem, partNumber: it.partNumber || "", description: it.description || "", qty: Number(it.qty) || 1, unitPrice: Number(it.unitPrice) || 0 }))
        : [blankItem],
    });
  }, []);

  const { fields, append, remove, insert } = useFieldArray({ control: form.control, name: "items" });
  const createMutation = useCreateInvoice();

  const nextInvNumber = settings
    ? previewRunningNumber((settings as any).invPrefix ?? "", (settings as any).invCounter, (settings as any).invSuffix ?? "")
    : null;

  const items = form.watch("items");
  const taxPercent = form.watch("tax") || 0;

  const [importPOOpen, setImportPOOpen] = useState(false);
  function handleImportFromPO(imported: InvoiceImportItem[]) {
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
    const sub = form.watch((values, { name }) => {
      if (!name?.startsWith("items.")) return;
      const match = name.match(/^items\.(\d+)\./);
      if (!match) return;
      const idx = parseInt(match[1], 10);
      const allItems = values.items ?? [];
      if (idx !== allItems.length - 1) return;
      const last = allItems[idx];
      if (!last) return;
      const descText = String(last.description || "").replace(/<[^>]*>/g, "").trim();
      const isEmpty =
        (!last.partNumber || String(last.partNumber).trim() === "") &&
        descText === "" &&
        (Number(last.unitPrice) === 0) && (Number(last.qty) <= 1);
      if ((last as any).type === "section") return;
      if (!isEmpty && !appendLock.current) {
        appendLock.current = true;
        const focused = document.activeElement as HTMLElement | null;
        append({ type: "item" as const, sectionLabel: "", sectionAlign: "left" as const, partNumber: "", description: "", qty: 1, uom: "", unitPrice: 0, discount: 0, isFoc: false, isStockItem: false, selectedSerials: [], selectedSerialIds: [], itemImage: "" });
        requestAnimationFrame(() => { focused?.focus(); appendLock.current = false; });
      }
    });
    return () => sub.unsubscribe();
  }, [form, append]);

  const currency = form.watch("currency") || "SGD";

  const subtotal = items.reduce((s, i) => ((i as any).type === "section" || (i as any).isFoc) ? s : s + (Number(i.qty) || 0) * (Number(i.unitPrice) || 0) * (1 - (Number(i.discount) || 0) / 100), 0);
  const discountAmt = form.watch("discountAmount") || 0;
  const taxableAmount = subtotal - discountAmt;
  const [discountPct, setDiscountPct] = useState(0);
  useEffect(() => {
    if (discountPct > 0) form.setValue("discountAmount", parseFloat((subtotal * discountPct / 100).toFixed(2)));
  }, [subtotal]);
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
    if (isSubmitting) return;
    setIsSubmitting(true);
    const filledItems = values.items.filter(i =>
      (i as any).type === "section"
        ? ((i as any).sectionLabel || "").trim() !== ""
        : (i.partNumber || "").replace(/<[^>]*>/g, "").trim() !== "" || (i.description || "").replace(/<[^>]*>/g, "").trim() !== ""
    );
    const realItems = filledItems.filter((i: any) => i.type !== "section");
    if (realItems.length === 0) {
      toast({ title: "Error", description: "At least one line item is required.", variant: "destructive" });
      setIsSubmitting(false);
      return;
    }
    const itemsWithAmount = filledItems.map(i => {
      if ((i as any).type === "section") return { type: "section" as const, sectionLabel: (i as any).sectionLabel || "", sectionAlign: (i as any).sectionAlign || "left", partNumber: "", description: "", qty: 1, uom: "", unitPrice: 0, discount: 0, isFoc: false, isStockItem: false, selectedSerials: [], selectedSerialIds: [], itemImage: "" };
      const disc = Number(i.discount) || 0;
      const qty = Number(i.qty) || 0;
      const partNumber = (i.partNumber || "").replace(/<[^>]*>/g, "").trim();
      const stockItemId = Number((i as any).stockItemId);
      const warehouseId = Number((i as any).warehouseId);
      return {
        ...i,
        qty,
        partNumber,
        discount: disc,
        isFoc: !!(i as any).isFoc,
        isStockItem: !!(i as any).isStockItem || (Number.isFinite(stockItemId) && stockItemId > 0),
        stockItemId: Number.isFinite(stockItemId) && stockItemId > 0 ? stockItemId : undefined,
        warehouseId: Number.isFinite(warehouseId) && warehouseId > 0 ? warehouseId : undefined,
        warehouseName: (i as any).warehouseName || undefined,
        amount: (qty * i.unitPrice * (1 - disc / 100)).toFixed(2),
      };
    });
    for (const item of itemsWithAmount) {
      if ((item as any).type === "section") continue;
      const serials = Array.isArray((item as any).selectedSerials) ? (item as any).selectedSerials.filter((s: string) => String(s).trim()) : [];
      if (serials.length > 0 && serials.length !== Number(item.qty)) {
        toast({
          title: "Serial count must match quantity",
          description: `${item.partNumber || "Item"}: qty ${item.qty} but ${serials.length} serials selected.`,
          variant: "destructive",
        });
        setIsSubmitting(false);
        return;
      }
      if ((item as any).stockItemId && !(item as any).warehouseId) {
        toast({
          title: "Warehouse required",
          description: `${item.partNumber || "Item"}: pick the item again with the cube icon and select the warehouse to reduce.`,
          variant: "destructive",
        });
        setIsSubmitting(false);
        return;
      }
    }
    console.log("[TAX INVOICE SAVE]", {
      mode: "create",
      items: itemsWithAmount
        .filter((i: any) => i.type !== "section" && i.stockItemId)
        .map((i: any) => ({
          warehouseId: i.warehouseId,
          stockItemId: i.stockItemId,
          quantity: i.qty,
          partNumber: i.partNumber,
        })),
    });
    const payload = {
      ...values,
      discountAmount: values.discountAmount,
      poRefNo: values.poRefNo || null,
      items: itemsWithAmount,
      createDeliveryOrder,
    };
    // Tax invoice always confirms on save so entered stock qty is reduced once
    // (Save Changes used to stay draft and never touch stock).
    createMutation.mutate({ data: { ...payload, status: "confirmed" } as any }, {
      onSuccess: async (data) => {
        const saved: any = data;
        await invalidateDocumentList(queryClient, "invoices");
        await Promise.all([
          invalidateInventoryQueries(queryClient),
          invalidateDocumentList(queryClient, "delivery-orders"),
        ]);
        // The invoice now owns these reservations; unmount cleanup must not
        // release serials that were successfully saved.
        allReservedIds.current.clear();
        setIsSubmitting(false);
        const doNumber = (saved as any)?.deliveryOrderNumber ?? (data as any)?.deliveryOrderNumber;
        if (createDeliveryOrder) {
          toast(doNumber
            ? { title: `Delivery Order ${doNumber} created.` }
            : { title: "Delivery Order was not created.", description: "Please try again from the invoice.", variant: "destructive" });
        }
        if (openPreview) {
          setSavedDoc(saved);
          setPreviewOpen(true);
        } else {
          const apply = (saved as any)?.stockApply;
          const reduced = Array.isArray(apply?.reducedThisSave) ? apply.reducedThisSave : [];
          if (reduced.length > 0) {
            const summary = reduced
              .map((l: any) => `${l.warehouseName || `WH#${l.warehouseId}`}: −${l.quantity}`)
              .join(", ");
            toast({
              title: "Invoice saved — stock reduced",
              description: `${summary}. Open Warehouses or Stock Items to verify qty.`,
            });
          } else {
            toast({
              title: "Invoice saved",
              description: "No warehouse stock was reduced (pick stock with the cube icon and warehouse).",
            });
          }
          setLocation("/invoices");
        }
      },
      onError: (err: any) => {
        toast({ title: "Error", description: err?.message || "Failed to create invoice.", variant: "destructive" });
        setIsSubmitting(false);
      },
    });
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setLocation("/invoices")}
            className="h-9 w-9 shrink-0"
            aria-label="Back to invoices"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-[#2563EB]">New Invoice</h1>
            <p className="text-muted-foreground mt-1">Create a new customer invoice.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            className="gap-2 border-dashed border-violet-500/60 text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-950/30"
            onClick={() => setAiOpen(true)}
          >
            <Sparkles className="h-4 w-4" />
            Generate with AI
          </Button>
          <Button
            type="button"
            variant="outline"
            className="gap-2 border-dashed border-primary/50 text-primary hover:bg-primary/5"
            onClick={() => setPoUploadOpen(true)}
          >
            <Upload className="h-4 w-4" />
            Import Customer PO
          </Button>
          {nextInvNumber && (
            <div className="text-right">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Invoice Number</p>
              <p className="text-lg font-semibold font-mono">{nextInvNumber}</p>
            </div>
          )}
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit((v) => onSubmit(v))} className="space-y-8">
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
                    if (c.shipToAddress) form.setValue("deliveryAddress", c.shipToAddress);
                    if (c.effectiveGstRate !== undefined) { form.setValue("tax", c.effectiveGstRate); setIsOverseas(c.effectiveGstRate === 0); }
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
                        placeholder="Acme Corp"
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
                    <FormControl><Textarea placeholder="123 Business Rd..." className="resize-none" rows={3} {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="customerContact" render={({ field }) => (
                  <FormItem><FormLabel>Contact Person</FormLabel>
                    <FormControl><Input placeholder="John Doe" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="customerContactEmail" render={({ field }) => (
                  <FormItem><FormLabel>Contact Email</FormLabel>
                    <FormControl><Input placeholder="john@example.com" type="email" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="deliveryAddress" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ship To Address <span className="text-muted-foreground text-xs font-normal">(optional)</span></FormLabel>
                    <FormControl><Textarea placeholder="Delivery / ship-to address if different from billing…" className="resize-none" rows={2} {...field} /></FormControl>
                    <p className="text-[11px] text-muted-foreground">Auto-filled from customer directory. Appears on the invoice PDF when set.</p>
                  </FormItem>
                )} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-4"><CardTitle className="text-lg">Invoice Details</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <FormField control={form.control} name="issueDate" render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <IssueDateField value={field.value || ""} onChange={field.onChange} label="Invoice Date" />
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
                <FormField control={form.control} name="poRefNo" render={({ field }) => (
                  <FormItem><FormLabel>PO Reference No.</FormLabel>
                    <FormControl><PORefSelect value={field.value ?? ""} onChange={field.onChange} /></FormControl><FormMessage /></FormItem>
                )} />
                <div>
                  <p className="text-sm font-medium mb-1.5">Sales Order</p>
                  <p className="h-9 flex items-center px-3 rounded-md border bg-muted/40 text-sm font-mono text-muted-foreground">—</p>
                </div>
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
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CardTitle className="text-lg">Line Items</CardTitle>
                  <Button type="button" variant="outline" size="sm" className="gap-1.5 text-xs h-7" onClick={() => append({ type: "item" as const, sectionLabel: "", sectionAlign: "left" as const, partNumber: "", description: "", qty: 1, uom: "", unitPrice: 0, discount: 0, isFoc: false, isStockItem: false, selectedSerials: [], selectedSerialIds: [], itemImage: "" })}>
                    <Plus className="h-3 w-3" /> Add Item
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="gap-1.5 text-xs h-7" onClick={() => append({ type: "section" as const, sectionLabel: "", sectionAlign: "left" as const, partNumber: "", description: "", qty: 1, uom: "", unitPrice: 0, discount: 0, isFoc: false, isStockItem: false, selectedSerials: [], selectedSerialIds: [], itemImage: "" })}>
                    <Layers className="h-3 w-3" /> Add Section
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="gap-1.5 text-xs h-7 text-primary border-primary/30 hover:bg-primary/5" onClick={() => setImportPOOpen(true)}>
                    <FileInput className="h-3 w-3" /> Import from PO
                  </Button>
                </div>
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground">Overseas / Export</span>
                    <Switch
                      checked={isOverseas}
                      onCheckedChange={(v) => {
                        setIsOverseas(v);
                        form.setValue("tax", v ? 0 : (settings?.gstRate ?? 0));
                      }}
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm text-muted-foreground">GST:</span>
                    <span className="text-sm font-medium">{taxPercent}%</span>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
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
                      <th className="px-2 py-3 text-right w-16">Disc %</th>
                      <th className="px-2 py-3 text-right w-28">Amount</th>
                      <th className="px-2 py-3 text-center w-12">FOC</th>
                      <th className="px-2 py-3 text-center w-20">Serials</th>
                      <th className="px-2 py-3 w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => { let _n = 0; return fields.map((field, index) => {
                      const itemType = form.watch(`items.${index}.type`);
                      const _itemNo = itemType !== "section" ? ++_n : null;
                      const blankItem = { type: "item" as const, sectionLabel: "", sectionAlign: "left" as const, partNumber: "", description: "", qty: 1, uom: "", unitPrice: 0, discount: 0, isFoc: false, isStockItem: false, selectedSerials: [], selectedSerialIds: [], itemImage: "" };
                      const blankSection = { type: "section" as const, sectionLabel: "", sectionAlign: "left" as const, partNumber: "", description: "", qty: 1, uom: "", unitPrice: 0, discount: 0, isFoc: false, isStockItem: false, selectedSerials: [], selectedSerialIds: [], itemImage: "" };
                      const insertBar = (
                        <tr className="group/ins border-0 h-5">
                          <td colSpan={11} className="p-0 overflow-visible">
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
                              <td colSpan={11} className="px-2 py-2">
                                <div className="flex items-start gap-2">
                                  <Layers className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-2" />
                                  <div className="flex-1 min-w-0">
                                    <FormField control={form.control} name={`items.${index}.sectionLabel`} render={({ field: f }) => (
                                      <FormItem><FormControl>
                                        <RichTextEditor value={f.value} onChange={f.onChange} placeholder="Section header text..." />
                                      </FormControl></FormItem>
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
                      const qty = Number(form.watch(`items.${index}.qty`)) || 0;
                      const price = Number(form.watch(`items.${index}.unitPrice`)) || 0;
                      const disc = Number(form.watch(`items.${index}.discount`)) || 0;
                      const isFoc = !!(form.watch(`items.${index}.isFoc`));
                      const amount = qty * price * (1 - disc / 100);
                      return (
                        <Fragment key={field.id}>
                          {insertBar}
                          <tr className="border-b last:border-0 hover:bg-muted/20">
                          <td className="px-2 py-2 text-muted-foreground text-xs">{_itemNo}</td>
                          <td className="px-2 py-2">
                            <FormField control={form.control} name={`items.${index}.partNumber`} render={({ field }) => (
                              <FormItem><FormControl>
                                <div className="flex items-center gap-1">
                                  <Input
                                    className="h-8 text-sm border-0 bg-transparent focus:bg-background"
                                    placeholder="Optional"
                                    value={field.value}
                                    onChange={(e) => {
                                      const next = e.target.value;
                                      field.onChange(next);
                                      // Manual part edits must not keep a stale cube-picked binding
                                      // (that deducted the wrong stock item / warehouse).
                                      const boundId = form.getValues(`items.${index}.stockItemId`);
                                      if (boundId) {
                                        form.setValue(`items.${index}.stockItemId`, undefined as any);
                                        form.setValue(`items.${index}.warehouseId`, undefined as any);
                                        form.setValue(`items.${index}.warehouseName`, "" as any);
                                        form.setValue(`items.${index}.isStockItem`, false);
                                        form.setValue(`items.${index}.selectedSerials`, []);
                                        form.setValue(`items.${index}.selectedSerialIds`, []);
                                      }
                                    }}
                                    onBlur={field.onBlur}
                                    name={field.name}
                                    ref={field.ref}
                                  />
                                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-primary" onClick={() => setStockPickerIndex(index)} title="Pick from stock">
                                    <Package className="h-3.5 w-3.5" />
                                  </Button>
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
                              <FormItem><FormControl>
                                <Input
                                  type="number"
                                  inputMode="decimal"
                                  min="0"
                                  step="any"
                                  className="h-8 text-sm text-right border-0 bg-transparent focus:bg-background"
                                  {...field}
                                  onChange={(event) => field.onChange(event.target.value === "" ? "" : Number(event.target.value))}
                                />
                              </FormControl></FormItem>
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
                          <td className="px-2 py-2">
                            <FormField control={form.control} name={`items.${index}.discount`} render={({ field }) => (
                              <FormItem><FormControl><Input inputMode="decimal" className="h-8 text-sm text-right border-0 bg-transparent focus:bg-background" placeholder="0" {...field} onChange={e => field.onChange(parseFloat(e.target.value) || 0)} value={field.value || ""} /></FormControl></FormItem>
                            )} />
                          </td>
                          <td className={`px-2 py-2 text-right text-sm font-medium ${isFoc ? "text-amber-600" : "text-muted-foreground"}`}>{fmt(amount)}</td>
                          <td className="px-2 py-2 text-center">
                            <FormField control={form.control} name={`items.${index}.isFoc`} render={({ field }) => (
                              <FormItem className="space-y-0"><FormControl>
                                <Checkbox checked={!!field.value} onCheckedChange={field.onChange} title="Free of Charge — excluded from subtotal, shown in amber" />
                              </FormControl></FormItem>
                            )} />
                          </td>
                          <td className="px-2 py-2 text-center">
                            <FormField control={form.control} name={`items.${index}.isStockItem`} render={({ field }) => (
                              <FormItem className="space-y-0">
                                <div className="flex flex-col items-center gap-1">
                                  <Checkbox checked={field.value} onCheckedChange={field.onChange} title="Serialized stock item" />
                                  {field.value && (
                                    <button
                                      type="button"
                                      onClick={() => setPickerIndex(index)}
                                      className="text-xs text-primary hover:underline whitespace-nowrap"
                                    >
                                      {(form.watch(`items.${index}.selectedSerials`) || []).length > 0
                                        ? `${(form.watch(`items.${index}.selectedSerials`) || []).length} S/N`
                                        : "Pick S/N"}
                                    </button>
                                  )}
                                </div>
                              </FormItem>
                            )} />
                          </td>
                          <td className="px-2 py-2">
                            {fields.length > 1 && (
                              <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => {
                                const ids = form.getValues(`items.${index}.selectedSerialIds`) || [];
                                if (ids.length > 0) {
                                  ids.forEach((id: number) => allReservedIds.current.delete(id));
                                  releaseSerials(ids);
                                }
                                remove(index);
                              }}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </td>
                        </tr>
                        </Fragment>
                      );
                    }); })()}
                    <tr className="group/ins-tail border-0 h-5">
                      <td colSpan={11} className="p-0 overflow-visible">
                        <div className="relative flex items-center justify-center h-5">
                          <div className="absolute inset-x-0 top-1/2 h-px bg-border/40 group-hover/ins-tail:bg-primary/40 transition-colors" />
                          <div className="absolute flex items-center gap-2 opacity-0 group-hover/ins-tail:opacity-100 transition-opacity">
                            <button type="button" onClick={() => append({ type: "item" as const, sectionLabel: "", sectionAlign: "left" as const, partNumber: "", description: "", qty: 1, uom: "", unitPrice: 0, discount: 0, isFoc: false, isStockItem: false, selectedSerials: [], selectedSerialIds: [], itemImage: "" })} className="flex items-center gap-1 text-[10px] text-primary bg-background border border-primary/30 rounded px-2 leading-5 whitespace-nowrap shadow-sm">
                              <Plus className="h-2.5 w-2.5" /> + line item here
                            </button>
                            <button type="button" onClick={() => append({ type: "section" as const, sectionLabel: "", sectionAlign: "left" as const, partNumber: "", description: "", qty: 1, uom: "", unitPrice: 0, discount: 0, isFoc: false, isStockItem: false, selectedSerials: [], selectedSerialIds: [], itemImage: "" })} className="flex items-center gap-1 text-[10px] text-primary bg-background border border-primary/30 rounded px-2 leading-5 whitespace-nowrap shadow-sm">
                              <Layers className="h-2.5 w-2.5" /> + section here
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="border-t bg-muted/20 p-4 flex justify-end">
                <div className="w-72 space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{fmt(subtotal)}</span></div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground whitespace-nowrap">Discount</span>
                    <div className="flex items-center gap-1.5">
                      <div className="relative">
                        <Input
                          inputMode="decimal"
                          maxLength={3}
                          placeholder="0"
                          className="h-7 w-14 text-sm text-center pr-5"
                          value={discountPct || ""}
                          onChange={e => {
                            const raw = e.target.value.replace(/[^0-9.]/g, "");
                            const n = Math.min(parseFloat(raw) || 0, 100);
                            setDiscountPct(n);
                            form.setValue("discountAmount", parseFloat((subtotal * n / 100).toFixed(2)));
                          }}
                        />
                        <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">%</span>
                      </div>
                      <FormField control={form.control} name="discountAmount" render={({ field }) => (
                        <FormItem className="m-0 p-0"><FormControl>
                          <Input inputMode="decimal" className="h-7 w-24 text-sm text-right" placeholder="0.00"
                            value={field.value || ""}
                            onChange={e => { setDiscountPct(0); field.onChange(parseFloat(e.target.value) || 0); }}
                          />
                        </FormControl></FormItem>
                      )} />
                    </div>
                  </div>
                  {discountAmt > 0 && <div className="flex justify-between text-xs text-muted-foreground"><span>Net Amount</span><span>{fmt(taxableAmount)}</span></div>}
                  <div className="flex justify-between"><span className="text-muted-foreground">GST ({taxPercent}%)</span><span>{fmt(taxAmount)}</span></div>
                  <div className="flex justify-between font-semibold text-base border-t pt-2"><span>Total</span><span>{fmt(totalAmount)}</span></div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-4"><CardTitle className="text-lg">Additional Notes</CardTitle></CardHeader>
            <CardContent>
              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem><FormControl><RichTextEditor value={field.value ?? ""} onChange={field.onChange} placeholder="Terms, conditions, or special instructions..." className="min-h-[96px]" /></FormControl><FormMessage /></FormItem>
              )} />
            </CardContent>
          </Card>

          <FormStickyActions className="flex-col items-end">
            <div className="flex justify-end">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                <Checkbox
                  checked={createDeliveryOrder}
                  onCheckedChange={(checked) => setCreateDeliveryOrder(checked === true)}
                />
                Converted into Delivery Order
              </label>
            </div>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => setLocation("/invoices")}>Cancel</Button>
              <Button
                type="button"
                variant="outline"
                disabled={isSubmitting}
                className="gap-2"
                onClick={form.handleSubmit(v => doSubmit(v, false))}
              >
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
                {isSubmitting ? "Saving..." : "Save & Preview"}
              </Button>
            </div>
          </FormStickyActions>
        </form>
      </Form>

      {pickerIndex !== null && (
        <SerialPickerDialog
          open={pickerIndex !== null}
          onOpenChange={(open) => { if (!open) setPickerIndex(null); }}
          partNumber={form.watch(`items.${pickerIndex}.partNumber`) || ""}
          currentSelected={form.watch(`items.${pickerIndex}.selectedSerials`) || []}
          currentSelectedIds={form.watch(`items.${pickerIndex}.selectedSerialIds`) || []}
          onConfirm={(serials, serialIds) => {
            const prevIds: number[] = form.getValues(`items.${pickerIndex!}.selectedSerialIds`) || [];
            const toRelease = prevIds.filter(id => !serialIds.includes(id));
            const toReserve = serialIds.filter(id => !prevIds.includes(id));
            toRelease.forEach(id => allReservedIds.current.delete(id));
            toReserve.forEach(id => allReservedIds.current.add(id));
            releaseSerials(toRelease);
            reserveSerials(toReserve);
            // Pick S/N sets quantity from the chosen serials for this line only.
            form.setValue(`items.${pickerIndex!}.qty`, serials.length);
            form.setValue(`items.${pickerIndex!}.selectedSerials`, serials);
            form.setValue(`items.${pickerIndex!}.selectedSerialIds`, serialIds);
            setPickerIndex(null);
          }}
        />
      )}

      <StockItemPickerDialog
        open={stockPickerIndex !== null}
        onOpenChange={(open) => { if (!open) setStockPickerIndex(null); }}
        onSelect={({ item, selectedSerials, selectedSerialIds, qty, warehouseId, warehouseName }: StockItemSelection) => {
          if (stockPickerIndex === null) return;
          if (!warehouseId) return;
          const prevIds: number[] = form.getValues(`items.${stockPickerIndex}.selectedSerialIds`) || [];
          const toRelease = prevIds.filter(id => !selectedSerialIds.includes(id));
          toRelease.forEach(id => allReservedIds.current.delete(id));
          selectedSerialIds.forEach(id => allReservedIds.current.add(id));
          releaseSerials(toRelease);
          reserveSerials(selectedSerialIds);
          const serialRows: string[] = [];
          for (let i = 0; i < selectedSerials.length; i += 3) {
            serialRows.push(selectedSerials.slice(i, i + 3).join("&nbsp;&nbsp;&nbsp;"));
          }
          const serialHtml = serialRows.map((row) => `<p>${row}</p>`).join("");
          const desc = selectedSerials.length > 0
            ? `<p>${item.name}</p><p><strong>Serial Numbers:</strong></p>${serialHtml}`
            : `<p>${item.name}</p>`;
          const importQty = Number(qty);
          if (!Number.isFinite(importQty) || importQty <= 0) return;
          form.setValue(`items.${stockPickerIndex}.partNumber`, item.code);
          form.setValue(`items.${stockPickerIndex}.description`, desc);
          form.setValue(`items.${stockPickerIndex}.unitPrice`, Number(item.unitPrice) || 0);
          form.setValue(`items.${stockPickerIndex}.isStockItem`, true);
          form.setValue(`items.${stockPickerIndex}.stockItemId`, item.id);
          form.setValue(`items.${stockPickerIndex}.qty`, importQty);
          form.setValue(`items.${stockPickerIndex}.selectedSerials`, selectedSerials);
          form.setValue(`items.${stockPickerIndex}.selectedSerialIds`, selectedSerialIds);
          form.setValue(`items.${stockPickerIndex}.warehouseId`, warehouseId);
          form.setValue(`items.${stockPickerIndex}.warehouseName`, warehouseName ?? "");
          setStockPickerIndex(null);
        }}
      />

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

      <AiInvoiceDialog
        open={aiOpen}
        onOpenChange={setAiOpen}
        onApply={handleAiApply}
      />

      <CustomerPoUploadDialog
        open={poUploadOpen}
        onOpenChange={setPoUploadOpen}
        onApply={handlePoExtracted}
      />

      <ImportFromPODialog
        open={importPOOpen}
        onOpenChange={setImportPOOpen}
        mode="invoice"
        onImport={imported => handleImportFromPO(imported as InvoiceImportItem[])}
      />
      {savedDoc && (
        <PdfPreviewModal
          open={previewOpen}
          onOpenChange={(open) => {
            setPreviewOpen(open);
            if (!open) setLocation(`/invoices`);
          }}
          title={`Invoice ${savedDoc.invNumber}`}
          generatePdf={(opts) => generateInvoice_PDF(savedDoc, selectedCompany, undefined, opts)}
          pdfFilename={`${savedDoc.invNumber}.pdf`}
          defaultEmailTo={savedDoc.customerContactEmail || ""}
          defaultEmailSubject={`Invoice ${savedDoc.invNumber}`}
          defaultEmailBody={`Dear ${savedDoc.customerContact || "Sir/Madam"},\n\nPlease find attached Invoice ${savedDoc.invNumber} for your records.\n\nPlease arrange payment as per the agreed terms.\n\nThank you.`}
          onEdit={() => { setPreviewOpen(false); setLocation(`/invoices/${savedDoc.id}/edit`); }}
          onEmailSent={async (recipients) => {
            await fetch(`/api/invoices/${savedDoc.id}/mark-sent`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sentTo: recipients }) });
            setSavedDoc((prev: any) => prev ? { ...prev, status: "sent", emailSentTo: recipients.join(", ") } : prev);
          }}
        />
      )}
    </div>
  );
}
