import { useEffect, useMemo, useState } from "react";
import { Printer } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  amountFromWeight,
  parseSubUomFactor,
  roundMoney,
} from "@/lib/pos-scale-service";
import {
  BarcodePreviewDialog,
  type BarcodePreviewItem,
} from "@/components/barcode-preview-dialog";

export type BarcodePrintSource = {
  name: string;
  code: string;
  barcode: string;
  brand?: string | null;
  uom?: string | null;
  alternateUom?: string | null;
  isWeightBased?: boolean;
  stockQty?: string | number | null;
  unitPrice?: string | number | null;
  mrpPrice?: string | number | null;
};

type Props = {
  item: BarcodePrintSource | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const MAIN_UOM = "__main__";

function parseSubUomList(raw?: string | null): string[] {
  if (!raw || !String(raw).trim()) return [];
  return String(raw)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function fmtMoney(n: number) {
  return `S$ ${n.toLocaleString("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Actions → Print: pick UOM / Sub UOM, print label with the SAME product barcode.
 * Weight/pack differs on the label; barcode never changes.
 */
export function BarcodePrintDialog({ item, open, onOpenChange }: Props) {
  const [selectedKey, setSelectedKey] = useState(MAIN_UOM);
  const [preview, setPreview] = useState<BarcodePreviewItem | null>(null);

  const subOptions = useMemo(() => parseSubUomList(item?.alternateUom), [item?.alternateUom]);

  useEffect(() => {
    if (!open) return;
    setSelectedKey(subOptions[0] ? subOptions[0] : MAIN_UOM);
    setPreview(null);
  }, [open, item?.barcode, item?.code, subOptions]);

  const basePrice = parseFloat(String(item?.unitPrice ?? 0)) || 0;
  const isWeightBased = Boolean(item?.isWeightBased);

  const resolved = useMemo(() => {
    if (!item) return null;
    const isMain = selectedKey === MAIN_UOM;
    const weightLabel = isMain ? null : selectedKey;
    const factor = isMain ? 1 : parseSubUomFactor(selectedKey, item.uom || undefined);
    const safeFactor = factor != null && factor > 0 ? factor : 1;
    const unitPrice = isWeightBased
      ? (isMain ? basePrice : amountFromWeight(safeFactor, basePrice))
      : (isMain ? basePrice : roundMoney(basePrice * safeFactor));
    const stockQty = isWeightBased && !isMain ? safeFactor : item.stockQty;
    const uom = isMain ? (item.uom || "Pcs") : selectedKey;
    return {
      weightLabel: weightLabel
        ? isWeightBased
          ? `Net Wt: ${weightLabel}`
          : `Pack: ${weightLabel}`
        : item.uom
          ? `UOM: ${item.uom}`
          : null,
      unitPrice,
      stockQty,
      uom,
      factor: safeFactor,
    };
  }, [item, selectedKey, basePrice, isWeightBased]);

  function openPreview() {
    if (!item?.barcode?.trim() || !resolved) return;
    setPreview({
      name: item.name,
      code: item.code,
      barcode: String(item.barcode).trim(),
      brand: item.brand,
      uom: resolved.uom,
      weightLabel: resolved.weightLabel,
      stockQty: resolved.stockQty,
      unitPrice: resolved.unitPrice,
      mrpPrice: item.mrpPrice,
    });
  }

  if (!item) return null;

  return (
    <>
      <Dialog open={open && !preview} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Printer className="h-5 w-5 text-[#2563EB]" />
              Print barcode
            </DialogTitle>
            <DialogDescription>
              Same barcode for this item. Select UOM / Sub UOM — weight can differ; barcode stays{" "}
              <span className="font-mono font-semibold text-foreground">{item.barcode || "—"}</span>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <div className="rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] p-3 text-sm">
              <p className="font-semibold text-[#111827]">{item.name}</p>
              <p className="mt-0.5 font-mono text-xs text-[#6B7280]">SKU: {item.code}</p>
              <p className="mt-1 font-mono text-xs font-semibold text-[#2563EB]">
                Barcode: {item.barcode || "—"}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>UOM</Label>
              <Select value={item.uom || "Pcs"} disabled>
                <SelectTrigger className="bg-muted/40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={item.uom || "Pcs"}>{item.uom || "Pcs"}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Sub UOM / Weight</Label>
              <Select value={selectedKey} onValueChange={setSelectedKey}>
                <SelectTrigger>
                  <SelectValue placeholder="Select Sub UOM" />
                </SelectTrigger>
                <SelectContent className="max-h-56">
                  <SelectItem value={MAIN_UOM}>
                    Main UOM ({item.uom || "Pcs"})
                    {isWeightBased ? " — per KG" : ""}
                  </SelectItem>
                  {subOptions.map((su) => (
                    <SelectItem key={su} value={su}>
                      {su}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {subOptions.length === 0 ? (
                <p className="text-[11px] text-[#9CA3AF]">
                  No Sub UOM saved on this item. Edit the item to add Sub UOMs, or print with main UOM.
                </p>
              ) : null}
            </div>

            {resolved ? (
              <div className="rounded-lg bg-[#EFF6FF] px-3 py-2 text-sm">
                <span className="text-[#6B7280]">Label price: </span>
                <span className="font-bold text-[#2563EB]">{fmtMoney(resolved.unitPrice)}</span>
                {resolved.weightLabel ? (
                  <span className="ml-2 text-xs text-[#6B7280]">({resolved.weightLabel})</span>
                ) : null}
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              className="gap-1.5 bg-[#2563EB] hover:bg-[#1D4ED8]"
              disabled={!item.barcode?.trim()}
              onClick={openPreview}
            >
              <Printer className="h-4 w-4" />
              Continue to Print
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BarcodePreviewDialog
        item={preview}
        open={!!preview}
        onOpenChange={(next) => {
          if (!next) {
            setPreview(null);
            onOpenChange(false);
          }
        }}
      />
    </>
  );
}
