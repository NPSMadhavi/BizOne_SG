import { useEffect, useMemo, useState } from "react";
import JsBarcode from "jsbarcode";
import { Barcode, Printer, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export type BarcodePreviewItem = {
  name: string;
  code: string;
  barcode: string;
  brand?: string | null;
  uom?: string | null;
  /** Selected Sub UOM / net weight shown on the label (barcode stays the same). */
  weightLabel?: string | null;
  stockQty?: string | number | null;
  unitPrice?: string | number | null;
  mrpPrice?: string | number | null;
};

function fmtMoney(n: number | string | null | undefined) {
  const v = parseFloat(String(n ?? 0));
  return Number.isFinite(v)
    ? `$${v.toLocaleString("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : "$0.00";
}

function fmtQty(qty: number | string | null | undefined, uom?: string | null) {
  const v = parseFloat(String(qty ?? 0));
  const n = Number.isFinite(v) ? v.toLocaleString("en-SG", { maximumFractionDigits: 3 }) : "0";
  return uom ? `${n} ${uom}` : n;
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Build a Code-128 PNG data URL (works even when dialog SVG refs are not ready). */
function buildBarcodeDataUrl(value: string): string | null {
  const text = value.trim();
  if (!text) return null;
  try {
    const canvas = document.createElement("canvas");
    JsBarcode(canvas, text, {
      format: "CODE128",
      width: 2.4,
      height: 90,
      displayValue: true,
      fontSize: 18,
      textMargin: 6,
      margin: 12,
      background: "#ffffff",
      lineColor: "#0f172a",
    });
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

export function printBarcodeLabel(item: BarcodePreviewItem, barcodeDataUrl: string) {
  const printWindow = window.open("", "_blank", "width=480,height=520");
  if (!printWindow) {
    window.print();
    return;
  }
  const price = fmtMoney(item.unitPrice);
  const qty = fmtQty(item.stockQty, item.uom);
  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Barcode Label - ${escapeHtml(item.code)}</title>
        <style>
          @page { size: auto; margin: 4mm; }
          * { box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            margin: 0;
            padding: 16px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            color: #0f172a;
            background: #fff;
          }
          .label-box {
            border: 1.5px dashed #94a3b8;
            padding: 18px 22px;
            border-radius: 10px;
            text-align: center;
            width: 100%;
            max-width: 360px;
          }
          .brand {
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 1px;
            color: #64748b;
            font-weight: 600;
            margin-bottom: 2px;
          }
          .title {
            font-size: 16px;
            font-weight: 700;
            line-height: 1.25;
            margin-bottom: 4px;
          }
          .weight {
            font-size: 13px;
            font-weight: 700;
            color: #2563eb;
            margin-bottom: 6px;
          }
          .sku {
            font-size: 12px;
            font-family: monospace;
            color: #2563eb;
            font-weight: 600;
            margin-bottom: 10px;
          }
          .barcode-img {
            max-width: 100%;
            height: auto;
            margin: 6px 0;
          }
          .barcode-text {
            font-family: monospace;
            font-size: 13px;
            font-weight: 700;
            letter-spacing: 2px;
            color: #1e293b;
          }
          .footer {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-top: 10px;
            padding-top: 8px;
            border-top: 1px solid #e2e8f0;
          }
          .type {
            font-size: 10px;
            text-transform: uppercase;
            color: #64748b;
            font-weight: 600;
          }
          .price {
            font-size: 15px;
            font-weight: 800;
            color: #0f172a;
          }
        </style>
      </head>
      <body>
        <div class="label-box">
          ${item.brand ? `<div class="brand">${escapeHtml(item.brand)}</div>` : ""}
          <div class="title">${escapeHtml(item.name)}</div>
          ${item.weightLabel ? `<div class="weight">${escapeHtml(item.weightLabel)}</div>` : ""}
          <div class="sku">SKU: ${escapeHtml(item.code)}</div>
          <img class="barcode-img" src="${barcodeDataUrl}" alt="${escapeHtml(item.barcode)}" />
          <div class="barcode-text">${escapeHtml(item.barcode)}</div>
          <div class="footer">
            <span class="type">Qty: ${escapeHtml(qty)}</span>
            <span class="price">Price: ${escapeHtml(price)}</span>
          </div>
        </div>
        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
              window.close();
            }, 350);
          };
        </script>
      </body>
    </html>
  `);
  printWindow.document.close();
}

type Props = {
  item: BarcodePreviewItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function BarcodePreviewDialog({ item, open, onOpenChange }: Props) {
  const barcode = item?.barcode?.trim() || "";
  const [barcodeSrc, setBarcodeSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !barcode) {
      setBarcodeSrc(null);
      return;
    }
    // Defer one frame so dialog is painted, then draw onto an off-DOM canvas.
    const id = window.requestAnimationFrame(() => {
      setBarcodeSrc(buildBarcodeDataUrl(barcode));
    });
    return () => window.cancelAnimationFrame(id);
  }, [open, barcode]);

  const sell = parseFloat(String(item?.unitPrice ?? 0)) || 0;
  const mrp = parseFloat(String(item?.mrpPrice ?? 0)) || 0;

  const canPrint = useMemo(() => Boolean(barcode && barcodeSrc), [barcode, barcodeSrc]);

  function handlePrint() {
    if (!item || !barcodeSrc) return;
    printBarcodeLabel(item, barcodeSrc);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-[min(94vw,32rem)] max-w-[32rem] gap-0 rounded-3xl border-slate-200 p-8 sm:p-10 text-center shadow-2xl [&>button]:hidden"
      >
        <div className="mb-5 flex items-start justify-between border-b border-slate-100 pb-4">
          <div className="min-w-0 text-left pr-3">
            <DialogTitle className="truncate text-lg font-bold leading-tight text-slate-900 sm:text-xl">
              {item?.name || "Barcode"}
            </DialogTitle>
            <span className="mt-0.5 block font-mono text-sm font-semibold text-blue-600">
              SKU: {item?.code || "—"}
            </span>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-5 flex min-h-[320px] flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-7 sm:p-9">
          {barcode && barcodeSrc ? (
            <img
              src={barcodeSrc}
              alt={`Barcode ${barcode}`}
              className="mx-auto h-auto w-full max-w-[360px] object-contain"
            />
          ) : barcode ? (
            <div className="flex min-h-[120px] flex-col items-center justify-center gap-2 text-slate-400">
              <Barcode className="h-10 w-10 animate-pulse" />
              <span className="text-xs">Generating barcode…</span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-10 text-slate-400">
              <Barcode className="h-10 w-10" />
              <span className="text-xs">No barcode assigned</span>
            </div>
          )}

          {barcode ? (
            <>
              <div className="mt-3 font-mono text-sm font-bold tracking-widest text-slate-700">
                {barcode}
              </div>
              <span className="mt-1 font-sans text-[10px] uppercase tracking-wider text-slate-400">
                INTERNAL • CODE-128 STANDARD
              </span>
            </>
          ) : null}

          <div className="mt-5 flex w-full items-center justify-between border-t border-slate-200/80 px-1 pt-4 text-xs">
            <div className="text-left">
              <span className="block font-sans text-[10px] font-medium uppercase tracking-wider text-slate-400">
                {item?.weightLabel ? "Net Wt / UOM" : "Quantity"}
              </span>
              <span className="font-mono text-sm font-bold text-slate-800">
                {item?.weightLabel
                  ? item.weightLabel
                  : fmtQty(item?.stockQty, item?.uom)}
              </span>
            </div>
            <div className="text-right">
              <span className="block font-sans text-[10px] font-medium uppercase tracking-wider text-slate-400">
                Price
              </span>
              <div className="flex items-baseline justify-end gap-1.5">
                <span className="font-mono text-base font-extrabold text-blue-700">
                  {fmtMoney(item?.unitPrice)}
                </span>
                {mrp > sell && sell > 0 ? (
                  <span className="font-mono text-[10px] text-slate-400 line-through">
                    {fmtMoney(item?.mrpPrice)}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-1 flex gap-3">
          <Button
            type="button"
            variant="secondary"
            className="h-11 flex-1 rounded-xl text-sm font-semibold"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="h-11 flex-1 gap-1.5 rounded-xl bg-blue-600 text-sm font-bold hover:bg-blue-700"
            disabled={!canPrint}
            onClick={handlePrint}
          >
            <Printer className="h-4 w-4" />
            Print
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
