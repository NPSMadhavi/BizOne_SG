import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  amountFromWeight,
  getScaleService,
  parseWeightInputToKg,
  type ScaleStatus,
} from "@/lib/pos-scale-service";
import { Scale, Loader2 } from "lucide-react";

export type WeightDialogProduct = {
  key: string;
  stockItemId: number;
  code: string;
  name: string;
  barcode: string;
  unitPrice: number;
  stockQty: number;
  uom: string;
  subUoms?: string[];
};

type Props = {
  open: boolean;
  product: WeightDialogProduct | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (weightKg: number) => void;
};

function money(n: number) {
  return `S$ ${n.toLocaleString("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const DEFAULT_QUICK_WEIGHTS = [
  { label: "250g", value: "250g" },
  { label: "500g", value: "500g" },
  { label: "750g", value: "750g" },
  { label: "1kg", value: "1kg" },
  { label: "1.25kg", value: "1.25kg" },
];

function subUomToQuick(label: string): { label: string; value: string } | null {
  const kg = parseWeightInputToKg(label);
  if (kg == null || !(kg > 0)) return null;
  return { label, value: label };
}

export function PosWeightDialog({ open, product, onOpenChange, onConfirm }: Props) {
  const productQuickWeights = useMemo(() => {
    const fromProduct = (product?.subUoms || [])
      .map(subUomToQuick)
      .filter(Boolean) as { label: string; value: string }[];
    if (fromProduct.length > 0) return fromProduct;
    return DEFAULT_QUICK_WEIGHTS;
  }, [product?.subUoms]);

  const defaultManual = productQuickWeights[0]?.value || "0.500";
  const [manualRaw, setManualRaw] = useState(defaultManual);
  const [scaleStatus, setScaleStatus] = useState<ScaleStatus>("disconnected");
  const [scaleWeight, setScaleWeight] = useState<number | null>(null);
  const [scaleMessage, setScaleMessage] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [useManual, setUseManual] = useState(true);

  useEffect(() => {
    if (!open) return;
    const first = (product?.subUoms || []).map(subUomToQuick).find(Boolean);
    setManualRaw(first?.value || "0.500");
    setError(null);
    setUseManual(true);
    let cancelled = false;

    async function refresh() {
      setPolling(true);
      try {
        const reading = await getScaleService().getReading();
        if (cancelled) return;
        setScaleStatus(reading.status);
        setScaleWeight(reading.weightKg);
        setScaleMessage(reading.message || null);
        if (reading.status === "connected" && reading.weightKg != null && reading.weightKg > 0) {
          setUseManual(false);
        } else {
          setUseManual(true);
        }
      } finally {
        if (!cancelled) setPolling(false);
      }
    }

    void refresh();
    const id = window.setInterval(() => { void refresh(); }, 1500);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [open, product?.key, product?.subUoms]);

  const weightKg = useMemo(() => {
    if (!useManual && scaleWeight != null && scaleWeight > 0) return scaleWeight;
    return parseWeightInputToKg(manualRaw);
  }, [useManual, scaleWeight, manualRaw]);

  const amount = weightKg != null && product ? amountFromWeight(weightKg, product.unitPrice) : 0;

  function confirm() {
    if (!product) return;
    if (weightKg == null || !(weightKg > 0)) {
      setError("Enter a valid weight greater than 0 (e.g. 500g or 0.5).");
      return;
    }
    if (product.stockQty > 0 && weightKg > product.stockQty) {
      setError(`Only ${product.stockQty} ${product.uom || "Kg"} available in stock.`);
      return;
    }
    setError(null);
    onConfirm(weightKg);
  }

  if (!product) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scale className="h-5 w-5 text-[#2563EB]" />
            Weigh item
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] p-3 text-sm">
            <p className="font-semibold text-[#111827]">{product.name}</p>
            <p className="mt-0.5 font-mono text-xs text-[#6B7280]">Barcode: {product.barcode || "—"}</p>
            <p className="mt-2 text-[#4B5563]">
              Rate: <span className="font-semibold text-[#111827]">{money(product.unitPrice)}</span> / KG
            </p>
          </div>

          {scaleStatus === "connected" && scaleWeight != null && scaleWeight > 0 ? (
            <div className="space-y-2">
              <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                {polling ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading scale…
                  </span>
                ) : (
                  <span>Scale connected · Live weight {scaleWeight.toFixed(3)} KG</span>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={!useManual ? "default" : "outline"}
                  size="sm"
                  onClick={() => setUseManual(false)}
                >
                  Use scale weight
                </Button>
                <Button
                  type="button"
                  variant={useManual ? "default" : "outline"}
                  size="sm"
                  onClick={() => setUseManual(true)}
                >
                  Enter weight manually
                </Button>
              </div>
            </div>
          ) : scaleStatus === "error" ? (
            <p className="text-xs text-destructive">{scaleMessage || "Scale error. Enter weight below."}</p>
          ) : (
            <p className="text-xs font-medium text-[#6B7280]">Enter weight</p>
          )}

          <div className="space-y-1.5">
            <Label>Weight</Label>
            <Input
              value={!useManual && scaleWeight != null ? scaleWeight.toFixed(3) : manualRaw}
              readOnly={!useManual && scaleWeight != null}
              className={!useManual && scaleWeight != null ? "bg-muted/40" : ""}
              placeholder="e.g. 500g or 0.5"
              onChange={(e) => {
                setUseManual(true);
                setManualRaw(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  confirm();
                }
              }}
            />
            <p className="text-[11px] text-[#9CA3AF]">
              Accepts g or kg (250g, 0.5, 1kg). Internally stored as KG.
            </p>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {productQuickWeights.map((q) => (
              <Button
                key={q.value}
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() => {
                  setUseManual(true);
                  setManualRaw(q.value);
                  setError(null);
                }}
              >
                {q.label}
              </Button>
            ))}
          </div>

          <div className="rounded-lg bg-[#EFF6FF] px-3 py-2 text-sm">
            <span className="text-[#6B7280]">Amount: </span>
            <span className="text-lg font-bold text-[#2563EB]">
              {weightKg != null && weightKg > 0 ? money(amount) : "—"}
            </span>
            {weightKg != null && weightKg > 0 ? (
              <span className="ml-2 text-xs text-[#6B7280]">
                ({weightKg.toFixed(3)} KG × {money(product.unitPrice)})
              </span>
            ) : null}
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" className="bg-[#2563EB] hover:bg-[#1D4ED8]" onClick={confirm}>
            Add to Bill
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
