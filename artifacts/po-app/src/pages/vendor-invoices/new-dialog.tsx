import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { useLocation } from "wouter";

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
  const [selectedVendorId, setSelectedVendorId] = useState<string>("");
  const [vendorName, setVendorName] = useState(prefillVendorName || "");
  const [amount, setAmount] = useState(prefillAmount ? String(prefillAmount) : "");
  const [currency, setCurrency] = useState(prefillCurrency || selectedCompany?.currency || "SGD");
  const [notes, setNotes] = useState("");
  const [selectedPoIds, setSelectedPoIds] = useState<number[]>(prefillPoId ? [prefillPoId] : []);

  const { data: vendors = [] } = useQuery<any[]>({
    queryKey: ["vendors", selectedCompany?.id],
    queryFn: async () => {
      const res = await fetch("/api/vendors", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: open && !prefillPoId,
  });

  const { data: pos = [] } = useQuery<any[]>({
    queryKey: ["purchase-orders-confirmed", selectedCompany?.id],
    queryFn: async () => {
      const res = await fetch("/api/purchase-orders?status=confirmed", { credentials: "include" });
      if (!res.ok) return [];
      const all = await res.json();
      return all.filter((p: any) => p.status === "confirmed");
    },
    enabled: open && !prefillPoId,
  });

  const filteredPos = useMemo(() => {
    if (!vendorName.trim()) return pos;
    return pos.filter((p: any) =>
      p.vendorName?.toLowerCase().includes(vendorName.trim().toLowerCase())
    );
  }, [pos, vendorName]);

  const handleVendorSelect = (vendorId: string) => {
    setSelectedVendorId(vendorId);
    const vendor = vendors.find((v: any) => String(v.id) === vendorId);
    if (vendor) {
      setVendorName(vendor.name);
      if (vendor.currency) setCurrency(vendor.currency);
      setSelectedPoIds([]);
    }
  };

  const togglePo = (id: number) => {
    setSelectedPoIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const selectedPos = prefillPoId
    ? [{ id: prefillPoId, poNumber: prefillPoNumber, vendorName: prefillVendorName }]
    : pos.filter((p: any) => selectedPoIds.includes(p.id));

  const poNumbers = selectedPos.map((p: any) => p.poNumber).join(", ");

  const resetForm = () => {
    setPiNumber("");
    setPiDate(new Date().toISOString().split("T")[0]);
    setSelectedVendorId("");
    setVendorName(prefillVendorName || "");
    setAmount(prefillAmount ? String(prefillAmount) : "");
    setCurrency(prefillCurrency || selectedCompany?.currency || "SGD");
    setNotes("");
    setSelectedPoIds(prefillPoId ? [prefillPoId] : []);
  };

  const handleSave = async () => {
    if (!piNumber.trim()) { toast({ title: "Error", description: "Vendor PI number is required", variant: "destructive" }); return; }
    if (!vendorName.trim()) { toast({ title: "Error", description: "Vendor name is required", variant: "destructive" }); return; }
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
          vendorName: vendorName.trim(),
          poIds: selectedPoIds,
          poNumbers: poNumbers || null,
          currency,
          totalAmount: parseFloat(amount),
          notes: notes || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to save");
      }
      const created = await res.json();
      toast({ title: "Vendor PI Recorded", description: `${piNumber} has been saved.` });
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

          {!prefillVendorName && (
            <div className="space-y-1.5">
              <Label>Select Vendor</Label>
              <Select value={selectedVendorId} onValueChange={handleVendorSelect}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick from vendor directory…" />
                </SelectTrigger>
                <SelectContent>
                  {vendors.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">No vendors found</div>
                  ) : vendors.map((v: any) => (
                    <SelectItem key={v.id} value={String(v.id)}>{v.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Vendor Name <span className="text-destructive">*</span></Label>
            <Input
              placeholder="Vendor name"
              value={vendorName}
              onChange={e => { setVendorName(e.target.value); setSelectedVendorId(""); }}
              readOnly={!!prefillVendorName}
            />
            {!prefillVendorName && (
              <p className="text-xs text-muted-foreground">Auto-filled from selection, or type manually</p>
            )}
          </div>

          {prefillPoId ? (
            <div className="space-y-1.5">
              <Label>Linked Purchase Order</Label>
              <Input value={prefillPoNumber || ""} readOnly className="bg-muted" />
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>
                Link to Purchase Order(s)
                {filteredPos.length !== pos.length && (
                  <span className="ml-2 text-xs font-normal text-primary">
                    {filteredPos.length} of {pos.length} POs shown
                  </span>
                )}
              </Label>
              <div className="border rounded-md max-h-40 overflow-y-auto p-2 space-y-1">
                {filteredPos.length === 0 ? (
                  <p className="text-sm text-muted-foreground px-1">
                    {pos.length === 0 ? "No confirmed POs found" : "No POs match this vendor"}
                  </p>
                ) : filteredPos.map((po: any) => (
                  <div key={po.id} className="flex items-center gap-2 px-1 py-0.5">
                    <Checkbox
                      id={`po-${po.id}`}
                      checked={selectedPoIds.includes(po.id)}
                      onCheckedChange={() => togglePo(po.id)}
                    />
                    <label htmlFor={`po-${po.id}`} className="text-sm cursor-pointer flex-1 min-w-0">
                      <span className="font-medium font-mono">{po.poNumber}</span>
                      <span className="text-muted-foreground ml-2 truncate">{po.vendorName}</span>
                    </label>
                    <span className="text-xs text-muted-foreground shrink-0">{po.currency} {parseFloat(po.totalAmount).toLocaleString()}</span>
                  </div>
                ))}
              </div>
              {selectedPoIds.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Selected {selectedPoIds.length} PO{selectedPoIds.length > 1 ? "s" : ""}: {poNumbers}
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>PI Amount <span className="text-destructive">*</span></Label>
              <Input type="number" min="0" step="0.01" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Currency</Label>
              <Input value={currency} onChange={e => setCurrency(e.target.value)} placeholder="SGD" />
            </div>
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
