import { Fragment, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trash2, Plus, Layers, FileInput, Package, Upload, AlignLeft, AlignCenter } from "lucide-react";
import { ImportItemsDialog } from "@/components/import-items-dialog";
import { ImportFromPurchaseQuotationDialog } from "@/components/import-from-purchase-quotation-dialog";
import { StockItemPickerDialog, type StockItemSelection } from "@/components/stock-item-picker-dialog";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { cn } from "@/lib/utils";
import type { ImportedItem } from "@/lib/import-items";
import {
  calcViLineAmount,
  calcViSubtotal,
  emptyViLineItem,
  emptyViSection,
  getUomOptions,
  type VendorInvoiceLineItem,
} from "@/lib/vendor-invoice-items";

interface TotalsProps {
  subtotal: number;
  discountAmount: number;
  taxableAmount: number;
  netAmount: number;
  gstAmount: number;
  totalAmount: number;
}

interface Props {
  items: VendorInvoiceLineItem[];
  onChange: (items: VendorInvoiceLineItem[]) => void;
  currency?: string;
  gstTreatment: string;
  gstRate: number;
  isOverseas: boolean;
  onOverseasChange: (v: boolean) => void;
  discountAmount: number;
  onDiscountAmountChange: (v: number) => void;
  totals: TotalsProps;
}

function fmt(n: number) {
  return new Intl.NumberFormat("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

export function VendorInvoiceLineItems({
  items,
  onChange,
  currency = "SGD",
  gstTreatment,
  gstRate,
  isOverseas,
  onOverseasChange,
  discountAmount,
  onDiscountAmountChange,
  totals,
}: Props) {
  const [importExcelOpen, setImportExcelOpen] = useState(false);
  const [importPqOpen, setImportPqOpen] = useState(false);
  const [stockPickerIndex, setStockPickerIndex] = useState<number | null>(null);
  const [discountPct, setDiscountPct] = useState(0);

  const itemsRef = useRef(items);
  itemsRef.current = items;

  const commitItems = (next: VendorInvoiceLineItem[]) => {
    itemsRef.current = next;
    onChange(next);
  };

  const subtotal = calcViSubtotal(items);
  const taxPercent = gstTreatment === "standard_rated" ? gstRate : 0;

  const updateItem = (idx: number, patch: Partial<VendorInvoiceLineItem>) => {
    commitItems(itemsRef.current.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };

  const updateNumeric = (idx: number, field: "qty" | "unitPrice" | "discount", raw: string) => {
    const num = raw === "" ? 0 : Number(raw);
    updateItem(idx, { [field]: Number.isFinite(num) ? num : 0 });
  };

  const append = (item: VendorInvoiceLineItem) => {
    commitItems([...itemsRef.current, item]);
  };

  const insert = (index: number, item: VendorInvoiceLineItem) => {
    const next = [...itemsRef.current];
    next.splice(index, 0, item);
    commitItems(next);
  };

  const remove = (idx: number) => {
    const next = itemsRef.current.filter((_, i) => i !== idx);
    commitItems(next.length > 0 ? next : [emptyViLineItem()]);
  };

  const handleStockSelect = (selection: StockItemSelection) => {
    if (stockPickerIndex == null) return;
    const { item, qty } = selection;
    updateItem(stockPickerIndex, {
      partNumber: item.code || "",
      description: item.name ? `<p>${item.name}</p>` : "",
      qty: qty || 1,
      unitPrice: parseFloat(item.unitPrice) || 0,
      uom: item.uom || "",
    });
    setStockPickerIndex(null);
  };

  const handleImport = (imported: ImportedItem[], replace: boolean) => {
    const mapped: VendorInvoiceLineItem[] = imported.map((it) => ({
      ...emptyViLineItem(),
      partNumber: it.partNumber || "",
      description: it.description || "",
      qty: it.qty || 1,
      unitPrice: it.unitPrice || 0,
      uom: it.uom || "",
    }));
    commitItems(replace ? mapped : [...itemsRef.current, ...mapped]);
    setImportExcelOpen(false);
  };

  const handlePqImport = (imported: VendorInvoiceLineItem[]) => {
    commitItems([...itemsRef.current.filter((i) => i.type !== "section" || i.sectionLabel), ...imported]);
    setImportPqOpen(false);
  };

  const onDiscountPctChange = (raw: string) => {
    const n = Math.min(parseFloat(raw.replace(/[^0-9.]/g, "")) || 0, 100);
    setDiscountPct(n);
    onDiscountAmountChange(+(subtotal * n / 100).toFixed(2));
  };

  const onDiscountAmtChange = (raw: string) => {
    setDiscountPct(0);
    onDiscountAmountChange(parseFloat(raw) || 0);
  };

  const rowKey = (item: VendorInvoiceLineItem, idx: number) => item.lineId ?? `vi-row-${idx}`;

  return (
    <>
      <Card className="overflow-hidden">
        <CardHeader className="pb-4 bg-muted/20 border-b">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3 flex-wrap">
              <CardTitle className="text-lg">Line Items</CardTitle>
              <Button type="button" variant="outline" size="sm" className="gap-1.5 text-xs h-7" onClick={() => append(emptyViLineItem())}>
                <Plus className="h-3 w-3" /> Add Item
              </Button>
              <Button type="button" variant="outline" size="sm" className="gap-1.5 text-xs h-7" onClick={() => append(emptyViSection())}>
                <Layers className="h-3 w-3" /> Add Section
              </Button>
              <Button type="button" variant="outline" size="sm" className="gap-1.5 text-xs h-7 text-primary border-primary/40 hover:bg-primary/5" onClick={() => setImportPqOpen(true)}>
                <FileInput className="h-3 w-3" /> Import from Quotation
              </Button>
              <Button type="button" variant="outline" size="sm" className="gap-1.5 text-xs h-7 text-primary border-primary/40 hover:bg-primary/5" onClick={() => setImportExcelOpen(true)}>
                <Upload className="h-3 w-3" /> Import from PDF/Excel
              </Button>
            </div>
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">Overseas / Export</span>
                <Switch checked={isOverseas} onCheckedChange={onOverseasChange} />
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
                  <th className="px-4 py-3 text-left w-8">#</th>
                  <th className="px-4 py-3 text-left w-36">Item / Part Number</th>
                  <th className="px-4 py-3 text-left">Description</th>
                  <th className="px-4 py-3 text-right w-20">Qty</th>
                  <th className="px-4 py-3 text-center w-28">UOM</th>
                  <th className="px-4 py-3 text-right w-28">Unit Price</th>
                  <th className="px-4 py-3 text-right w-24">Disc %</th>
                  <th className="px-4 py-3 text-right w-28">Amount</th>
                  <th className="px-4 py-3 text-center w-12">FOC</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {(() => {
                  let itemNo = 0;
                  const rowNodes = items.map((item, idx) => {
                    const insertBar = (
                      <tr key={`ins-${rowKey(item, idx)}`} className="group/ins border-0 h-5">
                        <td colSpan={10} className="p-0 overflow-visible">
                          <div className="relative flex items-center justify-center h-5">
                            <div className="absolute inset-x-0 top-1/2 h-px bg-border/40 group-hover/ins:bg-primary/40 transition-colors" />
                            <div className="absolute flex items-center gap-2 opacity-0 group-hover/ins:opacity-100 transition-opacity">
                              <button
                                type="button"
                                onClick={() => insert(idx, emptyViLineItem())}
                                className="flex items-center gap-1 text-[10px] text-primary bg-background border border-primary/30 rounded px-2 leading-5 whitespace-nowrap shadow-sm"
                              >
                                <Plus className="h-2.5 w-2.5" /> + line item here
                              </button>
                              <button
                                type="button"
                                onClick={() => insert(idx, emptyViSection())}
                                className="flex items-center gap-1 text-[10px] text-primary bg-background border border-primary/30 rounded px-2 leading-5 whitespace-nowrap shadow-sm"
                              >
                                <Layers className="h-2.5 w-2.5" /> + section here
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    );

                    if (item.type === "section") {
                      return (
                        <Fragment key={rowKey(item, idx)}>
                          {insertBar}
                          <tr className="border-b bg-muted/40">
                            <td colSpan={10} className="px-4 py-2">
                              <div className="flex items-start gap-2">
                                <Layers className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-2" />
                                <div className="flex-1 min-w-0">
                                  <RichTextEditor
                                    value={item.sectionLabel}
                                    onChange={(v) => updateItem(idx, { sectionLabel: v })}
                                    placeholder="Section header text..."
                                  />
                                </div>
                                <div className="flex items-center gap-1 shrink-0 mt-1">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    title={item.sectionAlign === "center" ? "Switch to left-align" : "Switch to center-align"}
                                    className={cn("h-7 w-7", item.sectionAlign === "center" ? "text-primary bg-primary/10" : "text-muted-foreground")}
                                    onClick={() => updateItem(idx, { sectionAlign: item.sectionAlign === "center" ? "left" : "center" })}
                                  >
                                    {item.sectionAlign === "center" ? <AlignCenter className="h-3.5 w-3.5" /> : <AlignLeft className="h-3.5 w-3.5" />}
                                  </Button>
                                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => remove(idx)}>
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        </Fragment>
                      );
                    }

                    itemNo++;
                    const amount = calcViLineAmount(item.qty, item.unitPrice, item.discount, item.isFoc);
                    return (
                      <Fragment key={rowKey(item, idx)}>
                        {insertBar}
                        <tr className="border-b last:border-0 hover:bg-muted/20">
                          <td className="px-4 py-2 text-muted-foreground text-xs">{itemNo}</td>
                          <td className="px-4 py-2">
                            <div className="flex items-center gap-1">
                              <Input
                                className="h-8 text-sm border-0 bg-transparent focus:bg-background placeholder:text-muted-foreground/40"
                                placeholder="Item"
                                value={item.partNumber}
                                onChange={(e) => updateItem(idx, { partNumber: e.target.value })}
                              />
                              <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-primary" onClick={() => setStockPickerIndex(idx)} title="Pick from stock">
                                <Package className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                          <td className="px-4 py-2 align-top min-w-[200px]">
                            <RichTextEditor value={item.description} onChange={(v) => updateItem(idx, { description: v })} placeholder="Item description" />
                          </td>
                          <td className="px-4 py-2">
                            <Input
                              inputMode="decimal"
                              className="h-8 text-sm text-right border-0 bg-transparent focus:bg-background"
                              value={item.qty === 0 ? "" : String(item.qty)}
                              onChange={(e) => updateNumeric(idx, "qty", e.target.value)}
                            />
                          </td>
                          <td className="px-4 py-2">
                            <select
                              className="h-8 text-sm w-full border-0 bg-transparent focus:outline-none cursor-pointer"
                              value={item.uom || ""}
                              onChange={(e) => updateItem(idx, { uom: e.target.value })}
                            >
                              <option value="">—</option>
                              {getUomOptions().map((u) => (
                                <option key={u} value={u}>{u}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-2">
                            <Input
                              inputMode="decimal"
                              className="h-8 text-sm text-right border-0 bg-transparent focus:bg-background"
                              placeholder="0.00"
                              value={item.unitPrice === 0 ? "" : String(item.unitPrice)}
                              onChange={(e) => updateNumeric(idx, "unitPrice", e.target.value)}
                            />
                          </td>
                          <td className="px-4 py-2">
                            <Input
                              inputMode="decimal"
                              className="h-8 text-sm text-right border-0 bg-transparent focus:bg-background"
                              placeholder="0"
                              value={item.discount === 0 ? "" : String(item.discount)}
                              onChange={(e) => updateNumeric(idx, "discount", e.target.value)}
                            />
                          </td>
                          <td className={cn("px-4 py-2 text-right text-sm font-medium", item.isFoc ? "text-amber-600" : "text-muted-foreground")}>
                            {fmt(amount)}
                          </td>
                          <td className="px-4 py-2 text-center">
                            <Checkbox
                              checked={!!item.isFoc}
                              onCheckedChange={(v) => updateItem(idx, { isFoc: !!v })}
                              title="Free of Charge — excluded from subtotal"
                            />
                          </td>
                          <td className="px-4 py-2">
                            {items.length > 1 && (
                              <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => remove(idx)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </td>
                        </tr>
                      </Fragment>
                    );
                  });

                  return [
                    ...rowNodes,
                    <tr key="trailing-bar" className="group/ins border-0 h-5">
                      <td colSpan={10} className="p-0 overflow-visible">
                        <div className="relative flex items-center justify-center h-5">
                          <div className="absolute inset-x-0 top-1/2 h-px bg-border/40 group-hover/ins:bg-primary/40 transition-colors" />
                          <div className="absolute flex items-center gap-2 opacity-0 group-hover/ins:opacity-100 transition-opacity">
                            <button
                              type="button"
                              onClick={() => append(emptyViLineItem())}
                              className="flex items-center gap-1 text-[10px] text-primary bg-background border border-primary/30 rounded px-2 leading-5 whitespace-nowrap shadow-sm"
                            >
                              <Plus className="h-2.5 w-2.5" /> + line item here
                            </button>
                            <button
                              type="button"
                              onClick={() => append(emptyViSection())}
                              className="flex items-center gap-1 text-[10px] text-primary bg-background border border-primary/30 rounded px-2 leading-5 whitespace-nowrap shadow-sm"
                            >
                              <Layers className="h-2.5 w-2.5" /> + section here
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>,
                  ];
                })()}
              </tbody>
            </table>
          </div>
          <div className="border-t bg-muted/20 p-4 flex justify-end">
            <div className="w-72 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-mono">{currency} {fmt(totals.subtotal)}</span>
              </div>
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
                      onChange={(e) => onDiscountPctChange(e.target.value)}
                    />
                    <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">%</span>
                  </div>
                  <Input
                    inputMode="decimal"
                    className="h-7 w-24 text-sm text-right"
                    placeholder="0.00"
                    value={discountAmount || ""}
                    onChange={(e) => onDiscountAmtChange(e.target.value)}
                  />
                </div>
              </div>
              {totals.discountAmount > 0 && (
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Net Amount</span>
                  <span className="font-mono">{currency} {fmt(totals.taxableAmount)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">GST ({taxPercent}%)</span>
                <span className="font-mono">{currency} {fmt(totals.gstAmount)}</span>
              </div>
              <div className="flex justify-between font-semibold text-base border-t pt-2">
                <span>Total</span>
                <span className="font-mono text-primary">{currency} {fmt(totals.totalAmount)}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <ImportItemsDialog open={importExcelOpen} onClose={() => setImportExcelOpen(false)} onImport={handleImport} />
      <ImportFromPurchaseQuotationDialog open={importPqOpen} onClose={() => setImportPqOpen(false)} onImport={handlePqImport} currentItems={items} />
      <StockItemPickerDialog
        open={stockPickerIndex != null}
        onOpenChange={(open) => { if (!open) setStockPickerIndex(null); }}
        onSelect={handleStockSelect}
        mode="receive"
        ignoreStockLimit
      />
    </>
  );
}
