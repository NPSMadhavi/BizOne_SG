import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useListStockItems } from "@workspace/api-client-react";
import { inventoryApi } from "@/lib/inventory-api";
import { invalidateInventoryQueries } from "@/lib/invalidate-inventory";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SyncBridgeDatePicker } from "@/components/ui/sync-bridge-date-picker";

const ADJUSTMENT_TYPES = [
  { value: "stock_decrease", label: "Stock decrease" },
  { value: "stock_increase", label: "Stock increase" },
  { value: "stock_opening_balance", label: "Stock opening balance" },
] as const;

const REASONS = [
  { value: "stolen_goods", label: "Stolen goods" },
  { value: "damaged_goods", label: "Damaged goods" },
  { value: "stock_writtenoff", label: "Stock written off" },
  { value: "expired_stock", label: "Expired stock" },
  { value: "internal_consumption", label: "Internal consumption" },
  { value: "opening_balance", label: "Opening balance" },
  { value: "stock_count_difference", label: "Stock count difference" },
  { value: "found_stock", label: "Found stock" },
  { value: "others", label: "Others" },
] as const;

const AUTHORISED_BY = [
  { value: "Manager", label: "Manager" },
  { value: "Accountant", label: "Accountant" },
  { value: "Others", label: "Others" },
] as const;

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

const emptyForm = () => ({
  stockItemId: "",
  adjustmentType: "",
  warehouseId: "",
  adjustmentQty: "",
  reason: "",
  reference: "",
  adjustmentNumber: "",
  referenceDocument: "",
  adjustmentDate: todayYmd(),
  remarks: "",
  authorisedBy: "",
});

interface AdjustStockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AdjustStockDialog({ open, onOpenChange }: AdjustStockDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const { data: items = [] } = useListStockItems({} as any, {
    query: { enabled: open, staleTime: 30_000 },
  });

  const { data: warehouses = [] } = useQuery({
    queryKey: ["adjust-stock-warehouses"],
    queryFn: () => inventoryApi.getWarehouses(),
    enabled: open,
    staleTime: 60_000,
  });

  const stockItems = useMemo(
    () =>
      (items as any[]).filter(
        (it) => it.type !== "service" && it.type !== "service_item" && it.isActive !== false,
      ),
    [items],
  );

  const { data: warehouseStock = [] } = useQuery({
    queryKey: ["adjust-stock-wh-qty", form.stockItemId],
    queryFn: async () => {
      const res = await fetch(
        `/api/inventory/warehouse-stock?stockItemId=${form.stockItemId}`,
        { credentials: "include" },
      );
      return res.ok ? res.json() : [];
    },
    enabled: open && !!form.stockItemId,
    staleTime: 0,
  });

  const currentQty = useMemo(() => {
    if (!form.warehouseId) return null;
    const row = (warehouseStock as any[]).find((w) => String(w.id) === form.warehouseId);
    return row != null ? Number(row.quantity) || 0 : 0;
  }, [warehouseStock, form.warehouseId]);

  useEffect(() => {
    if (!open) setForm(emptyForm());
  }, [open]);

  function setField<K extends keyof ReturnType<typeof emptyForm>>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    if (!form.stockItemId) {
      toast({ title: "Select item", variant: "destructive" });
      return;
    }
    if (!form.adjustmentType) {
      toast({ title: "Select adjustment type", variant: "destructive" });
      return;
    }
    if (!form.warehouseId) {
      toast({ title: "Select warehouse", variant: "destructive" });
      return;
    }
    const qty = Number(form.adjustmentQty);
    if (!Number.isFinite(qty) || qty < 0 || form.adjustmentQty === "") {
      toast({ title: "Enter a valid adjustment qty", variant: "destructive" });
      return;
    }
    if (!form.reason) {
      toast({ title: "Select reason", variant: "destructive" });
      return;
    }
    if (!form.authorisedBy) {
      toast({ title: "Select authorised by", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const reasonLabel = REASONS.find((r) => r.value === form.reason)?.label || form.reason;
      const typeLabel =
        ADJUSTMENT_TYPES.find((t) => t.value === form.adjustmentType)?.label || form.adjustmentType;
      const doc = await inventoryApi.createAdjustment({
        warehouseId: Number(form.warehouseId),
        stockItemId: Number(form.stockItemId),
        adjustmentType: form.adjustmentType,
        adjustmentQty: qty,
        reason: reasonLabel,
        remarks: form.remarks || null,
        adjustmentDate: form.adjustmentDate || todayYmd(),
        reference: form.reference || null,
        referenceDocument: form.referenceDocument || null,
        authorisedBy: form.authorisedBy || null,
      });
      toast({
        title: "Stock adjusted",
        description: `${doc.adjustmentNumber || "Adjustment"} saved (${typeLabel}).`,
      });
      await invalidateInventoryQueries(queryClient);
      onOpenChange(false);
    } catch (e: any) {
      toast({
        title: "Adjustment failed",
        description: e?.message || "Could not save stock adjustment",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Adjust stock</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Select item</Label>
            <Select value={form.stockItemId} onValueChange={(v) => setField("stockItemId", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select stock item" />
              </SelectTrigger>
              <SelectContent>
                {stockItems.map((it: any) => (
                  <SelectItem key={it.id} value={String(it.id)}>
                    {it.code} — {it.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Adjustment type</Label>
            <Select value={form.adjustmentType} onValueChange={(v) => setField("adjustmentType", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {ADJUSTMENT_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Warehouse</Label>
            <Select value={form.warehouseId} onValueChange={(v) => setField("warehouseId", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select warehouse" />
              </SelectTrigger>
              <SelectContent>
                {(warehouses as any[])
                  .filter((w) => w.isActive !== false)
                  .map((w) => (
                    <SelectItem key={w.id} value={String(w.id)}>
                      {w.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            {form.warehouseId && form.stockItemId && currentQty != null && (
              <p className="text-xs text-muted-foreground">
                Current qty in warehouse: {currentQty.toLocaleString("en-SG", { maximumFractionDigits: 3 })}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Adjustment qty</Label>
            <Input
              type="number"
              min={0}
              step="any"
              value={form.adjustmentQty}
              onChange={(e) => setField("adjustmentQty", e.target.value)}
              placeholder="0"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Reason</Label>
            <Select value={form.reason} onValueChange={(v) => setField("reason", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select reason" />
              </SelectTrigger>
              <SelectContent>
                {REASONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Reference</Label>
            <Input
              value={form.reference}
              onChange={(e) => setField("reference", e.target.value)}
              placeholder="Optional reference"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Adjustment number</Label>
            <Input value="Auto-generated on save" disabled className="bg-muted" />
          </div>

          <div className="space-y-1.5">
            <Label>Reference document</Label>
            <Input
              value={form.referenceDocument}
              onChange={(e) => setField("referenceDocument", e.target.value)}
              placeholder="Optional document ref"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Adjustment date</Label>
            <SyncBridgeDatePicker
              value={form.adjustmentDate || todayYmd()}
              onChange={(v) => setField("adjustmentDate", v || todayYmd())}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Authorised by</Label>
            <Select value={form.authorisedBy} onValueChange={(v) => setField("authorisedBy", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                {AUTHORISED_BY.map((a) => (
                  <SelectItem key={a.value} value={a.value}>
                    {a.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label>Remarks</Label>
            <Textarea
              value={form.remarks}
              onChange={(e) => setField("remarks", e.target.value)}
              placeholder="Optional remarks"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save adjustment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
