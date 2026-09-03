import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { useLocation, useParams } from "wouter";
import { Check, AlertTriangle, RefreshCw, Plus, ArrowLeft, Eye, BookOpen } from "lucide-react";
import { VendorCreateDialog } from "@/components/vendor-create-dialog";
import { PdfPreviewModal } from "@/components/pdf-preview-modal";
import { generateVendorInvoice_PDF } from "@/lib/pdf";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { CURRENCIES } from "@/lib/currencies";
import { PaymentTermsSelect } from "@/components/payment-terms-select";
import { useSalesPersons } from "@/hooks/use-sales-persons";
import { VendorInvoiceLineItems } from "@/components/vendor-invoice-line-items";
import { VendorInvoiceAdditionalInfo } from "@/components/vendor-invoice-additional-info";
import {
  calcViSubtotal,
  computeViGstTotals,
  emptyViLineItem,
  mapDocItemsToViLines,
  normalizeViItemsForApi,
  type VendorInvoiceLineItem,
} from "@/lib/vendor-invoice-items";

function dueDateFromTerms(date: string, terms: string) {
  const match = terms.match(/(\d+)\s+Days?\s+Net/i);
  if (!date || !match) return "";
  const due = new Date(`${date}T00:00:00`);
  due.setDate(due.getDate() + Number(match[1]));
  return due.toISOString().split("T")[0];
}

export default function VendorInvoiceEdit() {
  const params = useParams();
  const id = Number(params.id);
  const { toast } = useToast();
  const { salesPersons } = useSalesPersons();
  const { selectedCompany } = useAuth();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();

  const [saving, setSaving] = useState(false);
  const [savedDoc, setSavedDoc] = useState<any>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [salesPerson, setSalesPerson] = useState("");
  const [newVendorOpen, setNewVendorOpen] = useState(false);
  const initialized = useRef(false);
  const skipNextRateFetch = useRef(false);
  const prevIdRef = useRef(id);
  if (prevIdRef.current !== id) {
    prevIdRef.current = id;
    initialized.current = false;
    skipNextRateFetch.current = false;
  }

  const [piNumber, setPiNumber] = useState("");
  const [piDate, setPiDate] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("30 Days Net");
  const [dueDate, setDueDate] = useState("");
  const [plannedPaymentDate, setPlannedPaymentDate] = useState("");
  const [remindersEnabled, setRemindersEnabled] = useState(false);
  const [reminderStartAfterDay, setReminderStartAfterDay] = useState("15");
  const [reminderEmail, setReminderEmail] = useState("");
  const [reminderEmails, setReminderEmails] = useState<string[]>([]);
  const [vendorSearch, setVendorSearch] = useState("");
  const [selectedVendor, setSelectedVendor] = useState<any>(null);
  const [vendorFromPo, setVendorFromPo] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [currency, setCurrency] = useState((selectedCompany as any)?.currency || "SGD");
  const [lineItems, setLineItems] = useState<VendorInvoiceLineItem[]>([emptyViLineItem()]);
  const [notes, setNotes] = useState("");
  const [customerNote, setCustomerNote] = useState("");
  const [deliveryInstructions, setDeliveryInstructions] = useState("");
  const [termsAndConditions, setTermsAndConditions] = useState("");
  const [authorisedSignature, setAuthorisedSignature] = useState("");
  const [discountAmount, setDiscountAmount] = useState(0);
  const [selectedPoIds, setSelectedPoIds] = useState<number[]>([]);
  const [itemsAutoFilled, setItemsAutoFilled] = useState(false);
  const [poPickerOpen, setPoPickerOpen] = useState(false);
  const [gstTreatment, setGstTreatment] = useState("standard_rated");
  const [gstInclusive, setGstInclusive] = useState(false);
  const [expenseAccountId, setExpenseAccountId] = useState<string>("none");
  const [expenseAccountPickerOpen, setExpenseAccountPickerOpen] = useState(false);
  const [exchangeRate, setExchangeRate] = useState("1.000000");
  const [fetchingRate, setFetchingRate] = useState(false);
  const vendorInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const handleCancel = () => setLocation(`/vendor-invoices/${id}`);

  const { data: pi, isLoading, isError } = useQuery<any>({
    queryKey: ["vendor-invoice", id],
    queryFn: async () => {
      const res = await fetch(`/api/vendor-invoices/${id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    enabled: !!id,
  });

  const { data: vendors = [] } = useQuery<any[]>({
    queryKey: ["vendors", selectedCompany?.id],
    queryFn: async () => {
      const res = await fetch("/api/vendors", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: pos = [] } = useQuery<any[]>({
    queryKey: ["purchase-orders-confirmed-edit", selectedCompany?.id],
    queryFn: async () => {
      const res = await fetch("/api/purchase-orders?status=confirmed", { credentials: "include" });
      if (!res.ok) return [];
      const all = await res.json();
      return all.filter((p: any) => p.status === "confirmed" || p.status === "sent");
    },
  });

  const { data: allAccounts = [] } = useQuery<any[]>({
    queryKey: ["accounts"],
    queryFn: async () => {
      const res = await fetch("/api/accounts", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const expenseAccounts = useMemo(() =>
    allAccounts.filter((a: any) => a.type === "expense" && a.isActive)
      .sort((a: any, b: any) => a.code.localeCompare(b.code)),
    [allAccounts]
  );

  useEffect(() => {
    if (!pi || initialized.current) return;

    const piTotalAmount = parseFloat(String(pi.totalAmount ?? "0"));
    const piGstAmount = parseFloat(String(pi.gstAmount ?? "0"));
    const netAmount = +(piTotalAmount - piGstAmount).toFixed(2);
    const isGstInclusive = !!pi.gstInclusive;

    setPiNumber(pi.piNumber || "");
    setPiDate(pi.piDate ? String(pi.piDate).split("T")[0] : new Date().toISOString().split("T")[0]);
    setPaymentTerms(pi.paymentTerms || "30 Days Net");
    setDueDate(pi.dueDate ? String(pi.dueDate).split("T")[0] : dueDateFromTerms(pi.piDate, pi.paymentTerms || "30 Days Net"));
    setPlannedPaymentDate(pi.plannedPaymentDate ? String(pi.plannedPaymentDate).split("T")[0] : "");
    setRemindersEnabled(!!pi.remindersEnabled);
    setReminderStartAfterDay(
      pi.reminderStartAfterDay != null && Number(pi.reminderStartAfterDay) > 0
        ? String(pi.reminderStartAfterDay)
        : "15"
    );
    setReminderEmails(Array.isArray(pi.reminderEmails) ? pi.reminderEmails : []);
    setVendorSearch(pi.vendorName || "");
    setSelectedVendor(null);
    setSelectedPoIds(Array.isArray(pi.poIds) ? pi.poIds.map(Number) : []);
    setCurrency(pi.currency || (selectedCompany as any)?.currency || "SGD");
    if (Array.isArray(pi.items) && pi.items.length > 0) {
      setLineItems(mapDocItemsToViLines(pi.items));
    } else {
      const legacyAmount = isGstInclusive ? piTotalAmount : netAmount;
      setLineItems([{ ...emptyViLineItem(), unitPrice: legacyAmount, qty: legacyAmount > 0 ? 1 : 1 }]);
    }
    setNotes(pi.notes || "");
    setCustomerNote(pi.customerNote || "");
    setDeliveryInstructions(pi.deliveryInstructions || "");
    setTermsAndConditions(pi.termsAndConditions || "");
    setAuthorisedSignature(pi.authorisedSignature || "");
    setDiscountAmount(parseFloat(String(pi.discountAmount ?? "0")) || 0);
    setGstTreatment(pi.gstTreatment || "standard_rated");
    setGstInclusive(isGstInclusive);
    setSalesPerson(pi.salesPerson || "");
    setExpenseAccountId(pi.expenseAccountId ? String(pi.expenseAccountId) : "none");
    setExchangeRate(
      pi.exchangeRate != null && pi.exchangeRate !== ""
        ? Number(pi.exchangeRate).toFixed(6)
        : "1.000000"
    );
    skipNextRateFetch.current = true;
    initialized.current = true;
  }, [pi, selectedCompany]);

  useEffect(() => {
    if (!initialized.current) return;
    const calculated = dueDateFromTerms(piDate, paymentTerms);
    if (calculated && !pi?.dueDate) setDueDate(calculated);
  }, [piDate, paymentTerms, pi?.dueDate]);

  const filteredVendors = useMemo(() => {
    if (!vendorSearch.trim()) return vendors.slice(0, 50);
    const q = vendorSearch.toLowerCase();
    return vendors.filter((v: any) => v.name.toLowerCase().includes(q)).slice(0, 50);
  }, [vendors, vendorSearch]);

  const vendorName = selectedVendor ? selectedVendor.name : vendorSearch.trim();

  const fetchExchangeRate = async (curr: string, date: string) => {
    if (curr === "SGD") { setExchangeRate("1.000000"); return; }
    setFetchingRate(true);
    try {
      const res = await fetch(`/api/exchange-rate?currency=${curr}&date=${date}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setExchangeRate(data.rateSGD.toFixed(6));
      }
    } catch { /* silently ignore; user can enter manually */ }
    finally { setFetchingRate(false); }
  };

  useEffect(() => {
    if (!initialized.current) return;
    if (skipNextRateFetch.current) {
      skipNextRateFetch.current = false;
      return;
    }
    if (currency !== "SGD") fetchExchangeRate(currency, piDate);
    if (currency === "SGD") setExchangeRate("1.000000");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currency, piDate]);

  const filteredPos = useMemo(() => {
    if (!vendorName) return pos;
    return pos.filter((p: any) =>
      p.vendorName?.toLowerCase().includes(vendorName.toLowerCase())
    );
  }, [pos, vendorName]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        vendorInputRef.current && !vendorInputRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelectVendor = (vendor: any) => {
    setSelectedVendor(vendor);
    setVendorSearch(vendor.name);
    setVendorFromPo(false);
    if (vendor.currency) setCurrency(vendor.currency);
    setSelectedPoIds([]);
    setItemsAutoFilled(false);
    setDropdownOpen(false);
  };

  const loadPoItems = (selectedPos: any[]) => {
    const lines: VendorInvoiceLineItem[] = [];
    for (const po of selectedPos) {
      for (const it of po.items || []) {
        lines.push(mapDocItemsToViLines([it])[0]);
      }
    }
    if (lines.length > 0) {
      setLineItems(lines);
      setItemsAutoFilled(true);
    }
  };

  const togglePo = (po: any) => {
    const alreadySelected = selectedPoIds.includes(po.id);
    const newIds = alreadySelected
      ? selectedPoIds.filter(x => x !== po.id)
      : [...selectedPoIds, po.id];
    setSelectedPoIds(newIds);

    const newSelectedPos = pos.filter((p: any) => newIds.includes(p.id));
    if (newIds.length > 0) loadPoItems(newSelectedPos);
    else if (itemsAutoFilled) {
      setLineItems([emptyViLineItem()]);
      setItemsAutoFilled(false);
    }

    if (!alreadySelected && !vendorName && po.vendorName) {
      setVendorSearch(po.vendorName);
      setSelectedVendor(null);
      setVendorFromPo(true);
      if (po.currency) setCurrency(po.currency);
    }
    if (newIds.length === 0 && vendorFromPo) {
      setVendorSearch("");
      setVendorFromPo(false);
    }
  };

  const selectedPos = pos.filter((p: any) => selectedPoIds.includes(p.id));
  const poNumbers = selectedPos.length > 0
    ? selectedPos.map((p: any) => p.poNumber).join(", ")
    : (selectedPoIds.length > 0 ? (pi?.poNumbers || null) : null);

  const poTotal = useMemo(() => {
    if (selectedPoIds.length === 0) return 0;
    return pos.filter((p: any) => selectedPoIds.includes(p.id))
      .reduce((sum: number, p: any) => sum + parseFloat(p.remainingAmount ?? p.totalAmount ?? "0"), 0);
  }, [selectedPoIds, pos]);

  const itemsSubtotal = calcViSubtotal(lineItems);
  const enteredAmount = itemsSubtotal;
  const poOverrun = poTotal > 0 && enteredAmount > poTotal + 0.005;
  const overrunBy = poOverrun ? enteredAmount - poTotal : 0;
  const poMismatch = poTotal > 0 && !poOverrun && enteredAmount > 0 && !itemsAutoFilled &&
    Math.abs(enteredAmount - poTotal) / poTotal > 0.05;

  const isOverseas = gstTreatment === "zero_rated";
  const gstRateNum = gstTreatment === "standard_rated" ? 9 : 0;
  const gstTotals = computeViGstTotals(itemsSubtotal, gstTreatment, gstInclusive, gstRateNum, discountAmount);
  const { netAmount: computedNetAmount, gstAmount: computedGstAmount, totalAmount: computedTotal, taxableAmount } = gstTotals;

  const handleOverseasChange = (v: boolean) => {
    if (v) {
      setGstTreatment("zero_rated");
      setGstInclusive(false);
    } else {
      setGstTreatment("standard_rated");
    }
  };

  const handleSave = async () => {
    if (!piNumber.trim()) { toast({ title: "Error", description: "Vendor PI number is required", variant: "destructive" }); return; }
    if (!vendorName) { toast({ title: "Error", description: "Vendor name is required", variant: "destructive" }); return; }
    if (itemsSubtotal <= 0) { toast({ title: "Error", description: "Add at least one line item with an amount", variant: "destructive" }); return; }

    setSaving(true);
    try {
      const res = await fetch(`/api/vendor-invoices/${id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          piNumber: piNumber.trim(),
          piDate,
          vendorName,
          poIds: selectedPoIds,
          poNumbers: poNumbers || null,
          currency,
          totalAmount: computedTotal,
          items: normalizeViItemsForApi(lineItems),
          subtotal: computedNetAmount,
          gstTreatment,
          gstRate: gstRateNum,
          gstAmount: computedGstAmount,
          gstInclusive,
          paymentTerms,
          dueDate: dueDate || null,
          plannedPaymentDate: plannedPaymentDate || null,
          remindersEnabled,
          reminderStartAfterDay: remindersEnabled ? (parseInt(reminderStartAfterDay, 10) || 15) : null,
          reminderEmails,
          exchangeRate: currency !== "SGD" ? parseFloat(exchangeRate) || 1 : 1,
          notes: notes || null,
          customerNote: customerNote || null,
          deliveryInstructions: deliveryInstructions || null,
          termsAndConditions: termsAndConditions || null,
          authorisedSignature: authorisedSignature || null,
          discountAmount,
          salesPerson: salesPerson || null,
          expenseAccountId: (expenseAccountId && expenseAccountId !== "none") ? parseInt(expenseAccountId) : null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update");
      }
      const updated = await res.json();
      toast({ title: "Vendor PI Updated" });
      qc.setQueryData(["vendor-invoices"], (old: any) =>
        Array.isArray(old)
          ? old.map((d: any) => (d.id === updated.id ? { ...d, ...updated } : d))
          : [updated],
      );
      qc.setQueryData(["vendor-invoice", String(id)], updated);
      await qc.invalidateQueries({ queryKey: ["vendor-invoices"] });
      await qc.invalidateQueries({ queryKey: ["vendor-invoice", id] });
      setSavedDoc(updated);
      setShowPreview(true);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (isLoading || (pi && !initialized.current)) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError || !pi) {
    return <div className="p-6 text-muted-foreground">Vendor invoice not found.</div>;
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={handleCancel}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold tracking-tight text-[#2563EB]">Edit Vendor Invoice</h1>
          <p className="text-muted-foreground mt-1 font-mono">{pi.piNumber}</p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-lg">Invoice Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Vendor Invoice Number <span className="text-destructive">*</span></Label>
              <Input
                value={piNumber}
                onChange={e => setPiNumber(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Vendor Invoice Date</Label>
              <Input type="date" value={piDate} onChange={e => setPiDate(e.target.value)} />
            </div>
          </div>

          <div className="rounded-md border bg-muted/20 p-3 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5"><Label>Payment Terms</Label><PaymentTermsSelect value={paymentTerms} onChange={setPaymentTerms} /></div>
              <div className="space-y-1.5"><Label>Due Date</Label><Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="bg-muted/40" /></div>
              <div className="space-y-1.5"><Label>Planned Payment Date</Label><Input type="date" value={plannedPaymentDate} onChange={e => setPlannedPaymentDate(e.target.value)} /></div>
            </div>
            <div className="rounded-md border bg-background p-3 space-y-3">
              <div className="flex items-center justify-between"><div><Label>Payment reminders</Label><p className="text-xs text-muted-foreground">Daily reminders begin after the selected day.</p></div><Switch checked={remindersEnabled} onCheckedChange={setRemindersEnabled} /></div>
              {remindersEnabled && <div className="grid grid-cols-1 md:grid-cols-2 gap-3"><div className="space-y-1"><Label className="text-sm">Start after day</Label><Input type="number" min="0" value={reminderStartAfterDay} onChange={e => setReminderStartAfterDay(e.target.value)} /></div><div className="space-y-1"><Label className="text-sm">Additional email addresses</Label><div className="flex gap-2"><Input type="email" placeholder="name@example.com" value={reminderEmail} onChange={e => setReminderEmail(e.target.value)} /><Button type="button" variant="outline" onClick={() => { if (reminderEmail.trim()) { setReminderEmails([...reminderEmails, reminderEmail.trim()]); setReminderEmail(""); } }}>Add email</Button></div>{reminderEmails.length > 0 && <p className="text-xs text-muted-foreground">{reminderEmails.join(", ")}</p>}</div></div>}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
            <div className="space-y-1.5">
              <Label>Vendor <span className="text-destructive">*</span></Label>
              <div className="relative">
                  <Input
                    ref={vendorInputRef}
                    placeholder="Type to search vendors…"
                    value={vendorSearch}
                    onChange={e => {
                      setVendorSearch(e.target.value);
                      setSelectedVendor(null);
                      setDropdownOpen(true);
                    }}
                    onFocus={() => setDropdownOpen(true)}
                    className={cn(selectedVendor && "bg-primary/5 border-primary/40")}
                  />

                {dropdownOpen && (
                  <div
                    ref={dropdownRef}
                    className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-52 overflow-y-auto"
                  >
                    {filteredVendors.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-muted-foreground">
                        {vendorSearch ? `No vendors matching "${vendorSearch}"` : "No vendors in directory"}
                      </div>
                    ) : (
                      <>
                        <div className="border-b">
                          <button
                            type="button"
                            onMouseDown={e => { e.preventDefault(); setDropdownOpen(false); setNewVendorOpen(true); }}
                            className="w-full text-left flex items-center gap-2 px-3 py-2 text-sm text-primary hover:bg-accent font-medium"
                          >
                            <Plus className="h-3.5 w-3.5 shrink-0" />
                            Create new vendor{vendorSearch.trim() ? ` "${vendorSearch.trim()}"` : ""}
                          </button>
                        </div>
                        {filteredVendors.map((v: any) => (
                          <button
                            key={v.id}
                            type="button"
                            onMouseDown={e => { e.preventDefault(); handleSelectVendor(v); }}
                            className="w-full text-left flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
                          >
                            <Check className={cn("h-3.5 w-3.5 shrink-0", selectedVendor?.id === v.id ? "opacity-100" : "opacity-0")} />
                            <span className="flex-1 truncate">{v.name}</span>
                            {v.currency && <span className="text-xs text-muted-foreground">{v.currency}</span>}
                          </button>
                        ))}
                        {vendors.length > 50 && filteredVendors.length === 50 && (
                          <div className="px-3 py-1.5 text-xs text-muted-foreground border-t">
                            Showing first 50 results — type to narrow down
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
              {selectedVendor && (
                <p className="text-xs text-primary flex items-center gap-1">
                  <Check className="h-3 w-3" /> Selected from vendor directory
                </p>
              )}
              {vendorFromPo && !selectedVendor && vendorSearch && (
                <p className="text-xs text-amber-600 flex items-center gap-1">
                  <Check className="h-3 w-3" /> Auto-filled from PO — PO list locked to this vendor
                </p>
              )}
              {!selectedVendor && !vendorFromPo && vendorSearch && (
                <p className="text-xs text-muted-foreground">Not in directory — will be saved as typed</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>
                Link to Purchase Order(s)
                {vendorName && filteredPos.length !== pos.length && (
                  <span className="ml-2 text-xs font-normal text-primary">
                    {filteredPos.length} of {pos.length} shown
                  </span>
                )}
              </Label>
              <Popover modal={false} open={poPickerOpen} onOpenChange={setPoPickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={poPickerOpen}
                    className={cn(
                      "w-full justify-between font-normal text-left h-9 px-3",
                      selectedPoIds.length === 0 && "text-muted-foreground",
                    )}
                  >
                    <span className="truncate">
                      {selectedPoIds.length === 0
                        ? "Select purchase order(s)…"
                        : selectedPoIds.length === 1
                          ? (poNumbers || pi?.poNumbers || "1 PO selected")
                          : `${selectedPoIds.length} POs selected`}
                    </span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                  <div className="max-h-56 overflow-y-auto p-2 space-y-1">
                    {filteredPos.length === 0 ? (
                      <p className="text-sm text-muted-foreground px-2 py-1.5">
                        {pos.length === 0
                          ? "No confirmed POs found"
                          : vendorName
                            ? `No confirmed POs for "${vendorName}"`
                            : "No confirmed POs found"}
                      </p>
                    ) : filteredPos.map((po: any) => {
                      const invoiced = po.invoicedAmount || 0;
                      const remaining = po.remainingAmount ?? po.totalAmount;
                      const hasPartial = invoiced > 0;
                      return (
                        <div
                          key={po.id}
                          className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent cursor-pointer"
                          onClick={() => togglePo(po)}
                        >
                          <Checkbox
                            id={`po-edit-${po.id}`}
                            checked={selectedPoIds.includes(po.id)}
                            onCheckedChange={() => togglePo(po)}
                            onClick={e => e.stopPropagation()}
                          />
                          <div className="flex-1 min-w-0 text-sm">
                            <span className="font-medium font-mono">{po.poNumber}</span>
                            <span className="text-muted-foreground ml-2">{po.vendorName}</span>
                            {hasPartial && (
                              <span className="ml-1.5 text-[10px] font-semibold text-amber-600 uppercase tracking-wide">
                                partial
                              </span>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            {hasPartial ? (
                              <>
                                <div className="text-xs font-semibold text-emerald-700">
                                  {po.currency}{" "}
                                  {remaining.toLocaleString(undefined, {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })}{" "}
                                  left
                                </div>
                                <div className="text-[10px] text-muted-foreground line-through">
                                  {po.currency}{" "}
                                  {parseFloat(po.totalAmount).toLocaleString(undefined, {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })}
                                </div>
                              </>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                {po.currency}{" "}
                                {parseFloat(po.totalAmount).toLocaleString(undefined, {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </PopoverContent>
              </Popover>
              {selectedPoIds.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {selectedPoIds.length} PO{selectedPoIds.length > 1 ? "s" : ""} selected: {poNumbers || pi.poNumbers}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Currency</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map(c => (
                    <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Sales Person</Label>
              <Select value={salesPerson || undefined} onValueChange={setSalesPerson}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select Sales Person" />
                </SelectTrigger>
                <SelectContent>
                  {salesPersons.map((sp) => (
                    <SelectItem key={sp.id} value={sp.name}>
                      {sp.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {selectedPoIds.length > 0 && (
            <div className="space-y-1.5">
              {itemsAutoFilled && !poOverrun && (
                <p className="text-xs text-primary flex items-center gap-1">
                  <Check className="h-3 w-3" /> Line items loaded from selected PO(s) — edit if needed
                </p>
              )}
              {poOverrun && (
                <div className="flex items-start gap-1.5 rounded-md bg-amber-50 border border-amber-200 px-2.5 py-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-800">
                    <span className="font-semibold">Amount exceeds linked PO total</span>
                    {" "}by{" "}
                    <span className="font-mono font-semibold">
                      {currency} {overrunBy.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    {" "}(PO total:{" "}
                    <span className="font-mono">{currency} {poTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    ). Ensure a PO variation/amendment is approved before payment.
                  </div>
                </div>
              )}
              {poMismatch && (
                <div className="flex items-start gap-1.5 rounded-md bg-amber-50 border border-amber-200 px-2.5 py-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-800">
                    Amount differs from PO remaining balance of{" "}
                    <span className="font-mono font-semibold">
                      {currency} {poTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    {" "}— verify before saving.
                  </p>
                </div>
              )}
            </div>
          )}

          {currency !== "SGD" && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 space-y-1.5">
              <Label className="text-amber-800 font-medium text-xs flex items-center gap-1.5">
                <AlertTriangle className="h-3 w-3" />
                Exchange Rate to SGD <span className="font-normal">(required for IRAS GST reporting)</span>
              </Label>
              <div className="flex gap-2 items-center">
                <div className="flex items-center gap-1.5 flex-1 text-xs text-amber-700">
                  <span className="font-mono">1 {currency} =</span>
                  <Input
                    type="text" inputMode="decimal" step="0.000001" min="0.000001" placeholder="e.g. 1.350000"
                    value={exchangeRate}
                    onChange={e => setExchangeRate(e.target.value)}
                    className="h-7 font-mono text-xs w-32 bg-white"
                  />
                  <span className="font-mono">SGD</span>
                </div>
                <button
                  type="button"
                  onClick={() => fetchExchangeRate(currency, piDate)}
                  disabled={fetchingRate}
                  className="flex items-center gap-1 text-xs text-amber-800 border border-amber-300 rounded px-2 h-7 bg-white hover:bg-amber-50 disabled:opacity-50"
                >
                  <RefreshCw className={`h-3 w-3 ${fetchingRate ? "animate-spin" : ""}`} />
                  Fetch Rate
                </button>
              </div>
              <p className="text-[10px] text-amber-600">Rate auto-fetched from public exchange rates for {piDate}. Verify with MAS (mas.gov.sg) for IRAS compliance.</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>GST Treatment</Label>
              <Select value={gstTreatment} onValueChange={v => { setGstTreatment(v); if (v !== "standard_rated") setGstInclusive(false); }}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard_rated">Standard Rate (SR 9%)</SelectItem>
                  <SelectItem value="zero_rated">Zero-Rated (ZR 0%)</SelectItem>
                  <SelectItem value="exempt">Exempt (ES)</SelectItem>
                  <SelectItem value="out_of_scope">Out of Scope (OS)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {gstTreatment === "standard_rated" && (
              <div className="flex items-center gap-2 pt-6">
                <Switch id="gst-inclusive-edit" checked={gstInclusive} onCheckedChange={setGstInclusive} />
                <Label htmlFor="gst-inclusive-edit" className="cursor-pointer font-normal text-sm">GST Inclusive</Label>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <BookOpen className="h-3.5 w-3.5 text-muted-foreground" />
                Expense Account (GL)
              </Label>
              {(() => {
                const selectedAccount = expenseAccounts.find((a: any) => String(a.id) === expenseAccountId);
                return (
                  <Popover modal={false} open={expenseAccountPickerOpen} onOpenChange={setExpenseAccountPickerOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={expenseAccountPickerOpen}
                        className={cn("w-full justify-between font-normal text-left h-9 px-3", !selectedAccount && "text-muted-foreground")}
                      >
                        <span className="truncate">
                          {selectedAccount
                            ? <><span className="font-mono text-xs mr-2 opacity-60">{selectedAccount.code}</span>{selectedAccount.name}</>
                            : "— None (no journal entry) —"}
                        </span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[420px] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Search expense accounts…" className="h-9" />
                        <CommandList>
                          <CommandEmpty>No account found.</CommandEmpty>
                          <CommandGroup>
                            <CommandItem
                              value="__none__"
                              onSelect={() => { setExpenseAccountId("none"); setExpenseAccountPickerOpen(false); }}
                              className="italic text-muted-foreground"
                            >
                              — None (no journal entry) —
                              {expenseAccountId === "none" && <Check className="ml-auto h-3.5 w-3.5 shrink-0" />}
                            </CommandItem>
                          </CommandGroup>
                          <CommandGroup heading="Expense Accounts">
                            {expenseAccounts.map((a: any) => (
                              <CommandItem
                                key={a.id}
                                value={`${a.code} ${a.name}`}
                                onSelect={() => { setExpenseAccountId(String(a.id)); setExpenseAccountPickerOpen(false); }}
                                className="gap-2"
                              >
                                <span className="font-mono text-xs text-muted-foreground w-10 shrink-0">{a.code}</span>
                                <span className="flex-1">{a.name}</span>
                                {String(a.id) === expenseAccountId && <Check className="h-3.5 w-3.5 shrink-0" />}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                );
              })()}
              {expenseAccountId && expenseAccountId !== "none" && (
                <p className="text-xs text-emerald-700 flex items-center gap-1">
                  ✓ Will auto-post: DR {expenseAccounts.find((a: any) => String(a.id) === expenseAccountId)?.name} / CR Accounts Payable
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Internal notes..."
              />
            </div>
          </div>

        </CardContent>
      </Card>

      <VendorInvoiceLineItems
        items={lineItems}
        onChange={(items) => { setLineItems(items); setItemsAutoFilled(false); }}
        currency={currency}
        gstTreatment={gstTreatment}
        gstRate={gstRateNum}
        isOverseas={isOverseas}
        onOverseasChange={handleOverseasChange}
        discountAmount={discountAmount}
        onDiscountAmountChange={setDiscountAmount}
        totals={{
          subtotal: itemsSubtotal,
          discountAmount,
          taxableAmount,
          netAmount: computedNetAmount,
          gstAmount: computedGstAmount,
          totalAmount: computedTotal,
        }}
      />

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-lg">Additional Information</CardTitle>
        </CardHeader>
        <CardContent>
          <VendorInvoiceAdditionalInfo
            customerNote={customerNote}
            onCustomerNoteChange={setCustomerNote}
            deliveryInstructions={deliveryInstructions}
            onDeliveryInstructionsChange={setDeliveryInstructions}
            termsAndConditions={termsAndConditions}
            onTermsAndConditionsChange={setTermsAndConditions}
            authorisedSignature={authorisedSignature}
            onAuthorisedSignatureChange={setAuthorisedSignature}
          />
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" onClick={handleCancel}>Cancel</Button>
        <Button
          onClick={handleSave}
          disabled={saving}
          className="gap-2 bg-[#2563EB] hover:bg-[#1d4ed8] text-white"
        >
          <Eye className="h-4 w-4" />
          {saving ? "Saving..." : "Save & Preview"}
        </Button>
      </div>

      <VendorCreateDialog
        open={newVendorOpen}
        onOpenChange={setNewVendorOpen}
        onSuccess={vendor => {
          handleSelectVendor(vendor);
        }}
      />

      {savedDoc && showPreview && (
        <PdfPreviewModal
          open={showPreview}
          onOpenChange={(open) => {
            if (!open) {
              setShowPreview(false);
              setLocation("/vendor-invoices");
            }
          }}
          title={savedDoc.piNumber}
          generatePdf={(opts) => generateVendorInvoice_PDF(savedDoc, selectedCompany, opts)}
          pdfFilename={`${savedDoc.piNumber}.pdf`}
          defaultEmailTo=""
          defaultEmailSubject={`Vendor Invoice ${savedDoc.piNumber}`}
          defaultEmailBody={`Dear Sir/Madam,\n\nPlease find attached Vendor Invoice ${savedDoc.piNumber}.\n\nThank you.`}
          docInfo={{
            docType: "Vendor Invoice",
            docNumber: savedDoc.piNumber,
            customerName: savedDoc.vendorName || "",
            companyName: (selectedCompany as any)?.name || "RSV Infotech",
            items: ((savedDoc.items as any[]) || []).filter((i: any) => i.type !== "section"),
            currency: savedDoc.currency || "SGD",
            totalAmount: Number(savedDoc.totalAmount) || 0,
          }}
          onEdit={() => setLocation(`/vendor-invoices/${savedDoc.id}/edit`)}
        />
      )}
    </div>
  );
}
