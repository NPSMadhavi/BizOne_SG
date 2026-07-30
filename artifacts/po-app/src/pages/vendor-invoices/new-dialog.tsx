import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { useLocation } from "wouter";
import { Check, ChevronsUpDown, X, BookOpen, AlertTriangle, RefreshCw } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: (pi: any) => void;
  prefillPoId?: number;
  prefillPoNumber?: string;
  prefillVendorName?: string;
  prefillAmount?: number;
  prefillCurrency?: string;
}

const EXPENSE_ACCOUNT_TYPES = ["expense"];

export default function NewVendorInvoiceDialog({
  open, onOpenChange, onCreated,
  prefillPoId, prefillPoNumber, prefillVendorName, prefillAmount, prefillCurrency,
}: Props) {
  const { toast } = useToast();
  const { selectedCompany } = useAuth();
  const [, setLocation] = useLocation();
  const [saving, setSaving] = useState(false);

  const [piNumber, setPiNumber] = useState("");
  const [piDate, setPiDate] = useState(new Date().toISOString().split("T")[0]);
  const [vendorSearch, setVendorSearch] = useState(prefillVendorName || "");
  const [selectedVendor, setSelectedVendor] = useState<any>(null);
  const [vendorFromPo, setVendorFromPo] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [currency, setCurrency] = useState(prefillCurrency || (selectedCompany as any)?.currency || "SGD");
  const [amount, setAmount] = useState(prefillAmount ? String(prefillAmount) : "");
  const [notes, setNotes] = useState("");
  const [selectedPoIds, setSelectedPoIds] = useState<number[]>(prefillPoId ? [prefillPoId] : []);
  const [amountAutoFilled, setAmountAutoFilled] = useState(false);
  const [expenseAccountId, setExpenseAccountId] = useState<string>("none");
  const [gstTreatment, setGstTreatment] = useState("standard_rated");
  const [gstInclusive, setGstInclusive] = useState(false);
  const [expenseAccountPickerOpen, setExpenseAccountPickerOpen] = useState(false);
  const [exchangeRate, setExchangeRate] = useState("1.000000");
  const [fetchingRate, setFetchingRate] = useState(false);
  const vendorInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { data: vendors = [] } = useQuery<any[]>({
    queryKey: ["vendors", selectedCompany?.id],
    queryFn: async () => {
      const res = await fetch("/api/vendors", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: open && !prefillVendorName,
  });

  const { data: pos = [] } = useQuery<any[]>({
    queryKey: ["purchase-orders-confirmed", selectedCompany?.id],
    queryFn: async () => {
      const res = await fetch("/api/purchase-orders?status=confirmed&excludeLinked=true", { credentials: "include" });
      if (!res.ok) return [];
      const all = await res.json();
      return all.filter((p: any) => p.status === "confirmed");
    },
    enabled: open && !prefillPoId,
  });

  const { data: allAccounts = [] } = useQuery<any[]>({
    queryKey: ["accounts"],
    queryFn: async () => {
      const res = await fetch("/api/accounts", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: open,
  });

  const expenseAccounts = useMemo(() =>
    allAccounts.filter((a: any) => a.type === "expense" && a.isActive)
      .sort((a: any, b: any) => a.code.localeCompare(b.code)),
    [allAccounts]
  );

  const filteredVendors = useMemo(() => {
    if (!vendorSearch.trim()) return vendors.slice(0, 50);
    const q = vendorSearch.toLowerCase();
    return vendors.filter((v: any) => v.name.toLowerCase().includes(q)).slice(0, 50);
  }, [vendors, vendorSearch]);

  const vendorName = selectedVendor ? selectedVendor.name : vendorSearch.trim();

  // Auto-fetch exchange rate when currency ≠ SGD and piDate changes
  const fetchExchangeRate = async (curr: string, date: string) => {
    if (curr === "SGD") { setExchangeRate("1.000000"); return; }
    setFetchingRate(true);
    try {
      const res = await fetch(`/api/accounting/exchange-rate?currency=${curr}&date=${date}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setExchangeRate(data.rateSGD.toFixed(6));
      }
    } catch { /* silently ignore; user can enter manually */ }
    finally { setFetchingRate(false); }
  };

  useEffect(() => {
    if (open && currency !== "SGD") fetchExchangeRate(currency, piDate);
    if (currency === "SGD") setExchangeRate("1.000000");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currency, piDate, open]);

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
    setDropdownOpen(false);
  };

  const handleClearVendor = () => {
    setSelectedVendor(null);
    setVendorSearch("");
    setVendorFromPo(false);
    setSelectedPoIds([]);
    vendorInputRef.current?.focus();
  };

  const togglePo = (po: any) => {
    const alreadySelected = selectedPoIds.includes(po.id);
    const newIds = alreadySelected
      ? selectedPoIds.filter(x => x !== po.id)
      : [...selectedPoIds, po.id];
    setSelectedPoIds(newIds);

    const newSelectedPos = pos.filter((p: any) => newIds.includes(p.id));
    const total = newSelectedPos.reduce((sum: number, p: any) => sum + parseFloat(p.totalAmount || "0"), 0);
    setAmount(newIds.length > 0 ? total.toFixed(2) : "");
    setAmountAutoFilled(newIds.length > 0);

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

  const selectedPos = prefillPoId
    ? [{ id: prefillPoId, poNumber: prefillPoNumber, vendorName: prefillVendorName }]
    : pos.filter((p: any) => selectedPoIds.includes(p.id));

  const poNumbers = selectedPos.map((p: any) => p.poNumber).join(", ");

  const poTotal = useMemo(() => {
    if (prefillPoId) return prefillAmount || 0;
    if (selectedPoIds.length === 0) return 0;
    return pos.filter((p: any) => selectedPoIds.includes(p.id))
      .reduce((sum: number, p: any) => sum + parseFloat(p.totalAmount || "0"), 0);
  }, [prefillPoId, prefillAmount, selectedPoIds, pos]);

  const enteredAmount = parseFloat(amount) || 0;
  const poOverrun = poTotal > 0 && enteredAmount > poTotal + 0.005;
  const overrunBy = poOverrun ? enteredAmount - poTotal : 0;

  // GST calculations (IRAS-compliant)
  const gstRateNum = gstTreatment === "standard_rated" ? 9 : 0;
  const piAmountNum = parseFloat(amount) || 0;
  let computedNetAmount: number, computedGstAmount: number, computedTotal: number;
  if (gstRateNum === 0) {
    computedNetAmount = piAmountNum; computedGstAmount = 0; computedTotal = piAmountNum;
  } else if (gstInclusive) {
    computedTotal    = piAmountNum;
    computedGstAmount = +(piAmountNum * gstRateNum / (100 + gstRateNum)).toFixed(2);
    computedNetAmount = +(piAmountNum - computedGstAmount).toFixed(2);
  } else {
    computedNetAmount = piAmountNum;
    computedGstAmount = +(piAmountNum * gstRateNum / 100).toFixed(2);
    computedTotal     = +(piAmountNum + computedGstAmount).toFixed(2);
  }

  const resetForm = () => {
    setPiNumber("");
    setPiDate(new Date().toISOString().split("T")[0]);
    setVendorSearch(prefillVendorName || "");
    setSelectedVendor(null);
    setVendorFromPo(false);
    setAmount(prefillAmount ? String(prefillAmount) : "");
    setAmountAutoFilled(false);
    setCurrency(prefillCurrency || (selectedCompany as any)?.currency || "SGD");
    setNotes("");
    setSelectedPoIds(prefillPoId ? [prefillPoId] : []);
    setDropdownOpen(false);
    setExpenseAccountId("none");
    setGstTreatment("standard_rated");
    setGstInclusive(false);
    setExchangeRate("1.000000");
  };

  const handleSave = async () => {
    if (!piNumber.trim()) { toast({ title: "Error", description: "Vendor PI number is required", variant: "destructive" }); return; }
    if (!vendorName) { toast({ title: "Error", description: "Vendor name is required", variant: "destructive" }); return; }
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) { toast({ title: "Error", description: "Valid amount is required", variant: "destructive" }); return; }

    setSaving(true);
    try {
      const res = await fetch("/api/vendor-invoices", {
        method: "POST",
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
          gstTreatment,
          gstRate: gstRateNum,
          gstAmount: computedGstAmount,
          gstInclusive,
          exchangeRate: currency !== "SGD" ? parseFloat(exchangeRate) || 1 : 1,
          notes: notes || null,
          expenseAccountId: (expenseAccountId && expenseAccountId !== "none") ? parseInt(expenseAccountId) : null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to save");
      }
      const created = await res.json();
      const hasJE = !!expenseAccountId && expenseAccountId !== "none";
      toast({
        title: "Vendor PI Recorded",
        description: hasJE
          ? `${piNumber} saved — journal entry posted automatically.`
          : `${piNumber} has been saved.`,
      });
      onOpenChange(false);
      if (onCreated) onCreated(created);
      resetForm();
      setLocation(`/vendor-invoices/${created.id}`);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Record Vendor Purchase Invoice</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Vendor PI / Invoice Number <span className="text-destructive">*</span></Label>
              <Input placeholder="e.g. INV-2024-001" value={piNumber} onChange={e => setPiNumber(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>PI Date</Label>
              <Input type="date" value={piDate} onChange={e => setPiDate(e.target.value)} />
            </div>
          </div>

          {!prefillVendorName ? (
            <div className="space-y-1.5">
              <Label>Vendor <span className="text-destructive">*</span></Label>
              <div className="relative">
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
                    className={cn("pr-16", selectedVendor && "bg-primary/5 border-primary/40")}
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    {vendorSearch && (
                      <button
                        type="button"
                        onClick={handleClearVendor}
                        className="text-muted-foreground hover:text-foreground p-0.5"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                </div>

                {dropdownOpen && !prefillVendorName && (
                  <div
                    ref={dropdownRef}
                    className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-48 overflow-y-auto"
                  >
                    {filteredVendors.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-muted-foreground">
                        {vendorSearch ? `No vendors matching "${vendorSearch}"` : "No vendors in directory"}
                      </div>
                    ) : (
                      <>
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
          ) : (
            <div className="space-y-1.5">
              <Label>Vendor</Label>
              <Input value={prefillVendorName} readOnly className="bg-muted" />
            </div>
          )}

          {prefillPoId ? (
            <div className="space-y-1.5">
              <Label>Linked Purchase Order</Label>
              <Input value={prefillPoNumber || ""} readOnly className="bg-muted" />
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>
                Link to Purchase Order(s)
                {vendorName && filteredPos.length !== pos.length && (
                  <span className="ml-2 text-xs font-normal text-primary">
                    {filteredPos.length} of {pos.length} shown
                  </span>
                )}
              </Label>
              <div className="border rounded-md max-h-40 overflow-y-auto p-2 space-y-1">
                {filteredPos.length === 0 ? (
                  <p className="text-sm text-muted-foreground px-1">
                    {pos.length === 0
                      ? "No confirmed POs found"
                      : vendorName
                        ? `No confirmed POs for "${vendorName}"`
                        : "No confirmed POs found"}
                  </p>
                ) : filteredPos.map((po: any) => (
                  <div key={po.id} className="flex items-center gap-2 px-1 py-0.5">
                    <Checkbox
                      id={`po-${po.id}`}
                      checked={selectedPoIds.includes(po.id)}
                      onCheckedChange={() => togglePo(po)}
                    />
                    <label htmlFor={`po-${po.id}`} className="text-sm cursor-pointer flex-1 min-w-0">
                      <span className="font-medium font-mono">{po.poNumber}</span>
                      <span className="text-muted-foreground ml-2 truncate">{po.vendorName}</span>
                    </label>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {po.currency} {parseFloat(po.totalAmount).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
              {selectedPoIds.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {selectedPoIds.length} PO{selectedPoIds.length > 1 ? "s" : ""} selected: {poNumbers}
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>{gstInclusive && gstTreatment === "standard_rated" ? "PI Amount (incl. GST)" : "PI Amount (excl. GST)"} <span className="text-destructive">*</span></Label>
              <Input
                type="number" min="0" step="0.01" placeholder="0.00"
                value={amount}
                onChange={e => { setAmount(e.target.value); setAmountAutoFilled(false); }}
              />
              {amountAutoFilled && !poOverrun && (
                <p className="text-xs text-primary flex items-center gap-1">
                  <Check className="h-3 w-3" /> Auto-calculated from selected PO(s) — edit if needed
                </p>
              )}
              {poOverrun && (
                <div className="flex items-start gap-1.5 rounded-md bg-amber-50 border border-amber-200 px-2.5 py-2 mt-1">
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
            </div>
            <div className="space-y-1.5">
              <Label>Currency</Label>
              <Input value={currency} onChange={e => setCurrency(e.target.value.toUpperCase())} placeholder="SGD" />
            </div>
          </div>

          {/* Exchange Rate (shown only for non-SGD invoices) */}
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
                    type="number" step="0.000001" min="0.000001" placeholder="e.g. 1.350000"
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

          {/* GST Treatment */}
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
                <Switch id="gst-inclusive-new" checked={gstInclusive} onCheckedChange={setGstInclusive} />
                <Label htmlFor="gst-inclusive-new" className="cursor-pointer font-normal text-sm">GST Inclusive</Label>
              </div>
            )}
          </div>
          {gstTreatment === "standard_rated" && piAmountNum > 0 && (
            <div className="rounded-md bg-muted/40 border px-3 py-2.5 space-y-1.5 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Net Amount (excl. GST)</span>
                <span className="font-mono">{currency} {computedNetAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-primary">
                <span>GST (9%)</span>
                <span className="font-mono">+ {currency} {computedGstAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-semibold border-t pt-1.5">
                <span>Total Invoice Amount</span>
                <span className="font-mono">{currency} {computedTotal.toFixed(2)}</span>
              </div>
            </div>
          )}

          {/* GL / Expense Account */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <BookOpen className="h-3.5 w-3.5 text-muted-foreground" />
              Expense Account (GL)
              <span className="text-xs font-normal text-muted-foreground ml-1">— for auto journal entry</span>
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
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
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
            {expenseAccountId && expenseAccountId !== "none" ? (
              <p className="text-xs text-emerald-700 flex items-center gap-1">
                ✓ Will auto-post: DR {expenseAccounts.find((a: any) => String(a.id) === expenseAccountId)?.name} / CR Accounts Payable
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Leave blank to record manually via Journal Entries later.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Notes (internal)</Label>
            <Textarea placeholder="Any notes..." value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Record Vendor PI"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
