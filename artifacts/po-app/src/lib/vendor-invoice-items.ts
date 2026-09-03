export type VendorInvoiceLineItem = {
  lineId?: string;
  type: "item" | "section";
  sectionLabel: string;
  sectionAlign?: "left" | "center";
  partNumber: string;
  description: string;
  qty: number;
  unitPrice: number;
  discount: number;
  uom?: string;
  isFoc?: boolean;
  amount?: number;
};

const UOM_OPTIONS = ["Nos", "Pcs", "Set", "Lot", "Hr", "Day", "Month", "Yr", "Job", "kg", "m", "L", "Box", "Roll", "Pair", "Unit", "ls"];

export function getUomOptions() {
  return UOM_OPTIONS;
}

export function calcViLineAmount(qty: number, unitPrice: number, discount: number, isFoc?: boolean): number {
  if (isFoc) return 0;
  const base = qty * unitPrice;
  return +(base - (base * discount) / 100).toFixed(2);
}

export function calcViSubtotal(items: VendorInvoiceLineItem[]): number {
  return +items
    .filter((i) => i.type !== "section")
    .reduce((s, i) => s + calcViLineAmount(i.qty, i.unitPrice, i.discount, i.isFoc), 0)
    .toFixed(2);
}

export function stripHtml(html: string): string {
  return (html || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

export function newViLineId(): string {
  return `vi-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function emptyViLineItem(): VendorInvoiceLineItem {
  return {
    lineId: newViLineId(),
    type: "item",
    sectionLabel: "",
    sectionAlign: "left",
    partNumber: "",
    description: "",
    qty: 1,
    unitPrice: 0,
    discount: 0,
    uom: "",
    isFoc: false,
  };
}

export function emptyViSection(): VendorInvoiceLineItem {
  return {
    lineId: newViLineId(),
    type: "section",
    sectionLabel: "",
    sectionAlign: "left",
    partNumber: "",
    description: "",
    qty: 1,
    unitPrice: 0,
    discount: 0,
    uom: "",
    isFoc: false,
  };
}

export function mapDocItemToViLine(it: any): VendorInvoiceLineItem {
  if (it.type === "section") {
    return {
      lineId: it.lineId || newViLineId(),
      type: "section",
      sectionLabel: it.sectionLabel || stripHtml(it.description || "") || "Section",
      sectionAlign: it.sectionAlign === "center" ? "center" : "left",
      partNumber: "",
      description: "",
      qty: 1,
      unitPrice: 0,
      discount: 0,
      uom: "",
      isFoc: false,
    };
  }
  const qty = Number(it.qty) || 0;
  const unitPrice = Number(it.unitPrice) || 0;
  const discount = Number(it.discount) || 0;
  const isFoc = !!it.isFoc;
  return {
    lineId: it.lineId || newViLineId(),
    type: "item",
    sectionLabel: "",
    sectionAlign: "left",
    partNumber: String(it.partNumber || it.code || "").trim(),
    description: it.description || stripHtml(it.name || ""),
    qty,
    unitPrice,
    discount,
    uom: it.uom || "",
    isFoc,
    amount: calcViLineAmount(qty, unitPrice, discount, isFoc),
  };
}

export function mapDocItemsToViLines(items: any[]): VendorInvoiceLineItem[] {
  const mapped = (items || []).map(mapDocItemToViLine);
  return mapped.length > 0 ? mapped : [emptyViLineItem()];
}

export function normalizeViItemsForApi(items: VendorInvoiceLineItem[]) {
  return (items || []).map((it) => ({
    type: it.type || "item",
    sectionLabel: it.sectionLabel || "",
    sectionAlign: it.sectionAlign || "left",
    partNumber: String(it.partNumber || "").trim(),
    description: String(it.description || "").trim(),
    qty: Number(it.qty) || 0,
    unitPrice: Number(it.unitPrice) || 0,
    discount: Number(it.discount) || 0,
    uom: it.uom || "",
    isFoc: !!it.isFoc,
    amount: it.type === "section" ? 0 : calcViLineAmount(it.qty, it.unitPrice, it.discount, it.isFoc),
  }));
}

export function computeViGstTotals(
  subtotal: number,
  gstTreatment: string,
  gstInclusive: boolean,
  gstRate = 9,
  discountAmount = 0,
) {
  const afterDiscount = Math.max(0, subtotal - discountAmount);
  const gstRateNum = gstTreatment === "standard_rated" ? gstRate : 0;
  if (gstRateNum === 0) {
    return { netAmount: afterDiscount, gstAmount: 0, totalAmount: afterDiscount, taxableAmount: afterDiscount };
  }
  if (gstInclusive) {
    const totalAmount = afterDiscount;
    const gstAmount = +(afterDiscount * gstRateNum / (100 + gstRateNum)).toFixed(2);
    const netAmount = +(afterDiscount - gstAmount).toFixed(2);
    return { netAmount, gstAmount, totalAmount, taxableAmount: afterDiscount };
  }
  const netAmount = afterDiscount;
  const gstAmount = +(afterDiscount * gstRateNum / 100).toFixed(2);
  const totalAmount = +(afterDiscount + gstAmount).toFixed(2);
  return { netAmount, gstAmount, totalAmount, taxableAmount: afterDiscount };
}
