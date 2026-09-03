/** Line amount from stored amount or qty × unit price (minus line discount). */
export function lineItemAmount(item: any): number {
  if (item?.type === "section" || item?.isFoc) return 0;
  const parsed = parseFloat(String(item?.amount ?? ""));
  if (!Number.isNaN(parsed) && parsed > 0) return parsed;
  const disc = Number(item?.discount) || 0;
  return (Number(item?.qty) || 0) * (Number(item?.unitPrice) || 0) * (1 - disc / 100);
}

/** Infer GST rate % from stored doc fields (handles legacy rows where tax held the rate). */
export function inferProformaTaxRatePercent(doc: any): number {
  const storedSubtotal = Number(doc?.subtotal ?? 0);
  const storedTax = Number(doc?.tax ?? 0);
  const disc = Number(doc?.discountAmount ?? 0);
  const taxable = storedSubtotal - disc;
  if (storedTax <= 0) return 0;
  if (storedTax <= 100 && taxable <= 0) return storedTax;
  if (storedTax <= 100 && storedTax < taxable * 0.5) return storedTax;
  if (taxable > 0) return (storedTax / taxable) * 100;
  if (storedTax <= 100) return storedTax;
  return 0;
}

export function computeProformaFinancials(doc: any) {
  const items = Array.isArray(doc?.items) ? doc.items : [];
  const discountAmount = Number(doc?.discountAmount) || 0;
  const rate = inferProformaTaxRatePercent(doc);
  const subtotal = items.reduce((s, item) => s + lineItemAmount(item), 0);
  const taxable = subtotal - discountAmount;
  const tax = (taxable * rate) / 100;
  return {
    subtotal,
    discountAmount,
    tax,
    totalAmount: taxable + tax,
  };
}

/** Recompute totals from line items when stored subtotal/tax are missing or legacy. */
export function normalizeProformaDoc(doc: any) {
  if (!doc) return doc;
  const items = Array.isArray(doc.items) ? doc.items : [];
  if (!items.length) return doc;

  const storedSubtotal = Number(doc.subtotal) || 0;
  const lineSubtotal = items.reduce((s, item) => s + lineItemAmount(item), 0);
  const storedTax = Number(doc.tax) || 0;
  const needsRecompute =
    lineSubtotal > 0 &&
    (storedSubtotal <= 0 || Math.abs(storedSubtotal - lineSubtotal) > 0.01);
  const needsTaxFix =
    storedSubtotal <= 0 && storedTax > 0 && storedTax <= 100 && lineSubtotal > 0;

  if (!needsRecompute && !needsTaxFix) return doc;

  const fin = computeProformaFinancials(doc);
  if (fin.subtotal <= 0) return doc;
  return { ...doc, ...fin };
}
