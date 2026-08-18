import type { InvoiceReportPayload, ReportElement, ReportTemplateJson } from "./types.js";
import { resolveFieldPath, resolveFieldValue } from "./field-resolver.js";

const PAGE_MM: Record<string, { width: number; height: number }> = {
  A4: { width: 210, height: 297 },
  Letter: { width: 215.9, height: 279.4 },
};

const FIELD_LABELS: Record<string, string> = {
  "company.name": "Company Name",
  "company.logo": "Company Logo",
  "company.address": "Company Address",
  "company.country": "Country",
  "company.phone": "Phone",
  "company.email": "Email",
  "company.website": "Website",
  "company.tax_number": "Tax Number",
  "company.registration_number": "Registration Number",
  "company.bank_details": "Bank Details",
  "company.terms": "Terms & Conditions",
  "company.gst_rate": "GST Rate",
  "invoice.invoice_number": "Invoice Number",
  "invoice.invoice_date": "Invoice Date",
  "invoice.delivery_date": "Delivery Date",
  "invoice.payment_terms": "Payment Terms",
  "invoice.po_ref": "PO Reference",
  "invoice.notes": "Notes",
  "invoice.subtotal": "Subtotal",
  "invoice.discount": "Discount",
  "invoice.tax": "Tax",
  "invoice.tax_label": "GST Label",
  "invoice.total": "Total",
  "invoice.currency": "Currency",
  "invoice.status": "Status",
  "customer.name": "Customer Name",
  "customer.address": "Customer Address",
  "customer.email": "Customer Email",
  "customer.phone": "Customer Phone",
  "customer.tax_number": "Customer Tax Number",
  "customer.contact_person": "Contact Person",
  "customer.postal_code": "Postal Code",
  "customer.country": "Customer Country",
  "customer.ship_to_address": "Ship To Address",
  "item.index": "#",
  "item.product_name": "Product",
  "item.description": "Description",
  "item.quantity": "Qty",
  "item.uom": "UOM",
  "item.unit_price": "Unit Price",
  "item.discount": "Discount",
  "item.tax": "Tax",
  "item.amount": "Amount",
};

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fieldValue(data: InvoiceReportPayload | null, field: string | undefined, designMode: boolean): string {
  if (!field) return "";
  if (designMode) return resolveFieldValue(data, field, { designLabel: FIELD_LABELS[field] || field });
  return resolveFieldValue(data, field);
}

function pageSize(template: ReportTemplateJson): { width: number; height: number } {
  const base = PAGE_MM[template.page?.size || "A4"] || PAGE_MM.A4;
  if (template.page?.orientation === "landscape") {
    return { width: base.height, height: base.width };
  }
  return base;
}

function elementStyle(el: ReportElement): string {
  const borderW = el.borderWidth ?? 0;
  const borderStyle = el.borderStyle && el.borderStyle !== "none" && borderW > 0
    ? `${borderW}mm ${el.borderStyle} ${el.borderColor || "#111827"}`
    : "none";
  return [
    `position:absolute`,
    `left:${el.x}mm`,
    `top:${el.y}mm`,
    `width:${el.width}mm`,
    `height:${el.height}mm`,
    `font-size:${el.fontSize || 9}pt`,
    `font-weight:${el.fontWeight || "normal"}`,
    `font-style:${el.fontStyle || "normal"}`,
    `color:${el.color || "#111827"}`,
    `text-align:${el.textAlign || "left"}`,
    `background:${el.backgroundColor || "transparent"}`,
    `border:${borderStyle}`,
    `overflow:hidden`,
    `white-space:pre-wrap`,
    `word-break:break-word`,
    `line-height:1.25`,
    `box-sizing:border-box`,
    `z-index:${el.zIndex || 1}`,
  ].join(";");
}

function renderTable(el: ReportElement, data: InvoiceReportPayload | null, designMode: boolean): string {
  const cols = el.columns || [];
  const headerBg = el.headerBackground || "#18212F";
  const headerFg = el.headerColor || "#FFFFFF";
  const source = el.source || "items";
  const rows = designMode
    ? [{ index: "1", product_name: "{{ Part No }}", description: "{{ Description }}", quantity: "{{ Qty }}", uom: "{{ UOM }}", unit_price: "{{ Price }}", amount: "{{ Amount }}" }]
    : (source === "items" ? (data?.items || []) : []);
  const header = cols
    .map((c) => `<th style="text-align:${c.align || "left"};width:${c.width}mm;padding:2mm 1.4mm;background:${headerBg};color:${headerFg};font-size:7.5pt;font-weight:bold;">${escapeHtml(c.header)}</th>`)
    .join("");
  const body = (rows.length ? rows : [{}]).map((row: any, i: number) => {
    const cells = cols.map((c) => {
      const key = (c.field || "").replace(/^item\./, "");
      const value = designMode && rows.length ? String((row as any)[key] ?? c.header) : String(row?.[key] ?? "");
      return `<td style="text-align:${c.align || "left"};padding:1.6mm 1.4mm;border-bottom:0.15mm solid #E5E7EB;vertical-align:top;">${escapeHtml(value)}</td>`;
    }).join("");
    return `<tr style="background:${i % 2 ? "#fff" : "#F7F7F7"}">${cells}</tr>`;
  }).join("");
  return `<div style="${elementStyle(el)}"><table style="width:100%;border-collapse:collapse;table-layout:fixed;font-size:inherit;">
    <thead><tr>${header}</tr></thead>
    <tbody>${body}</tbody>
  </table></div>`;
}

function renderElement(el: ReportElement, data: InvoiceReportPayload | null, designMode: boolean): string {
  if (el.visible === false) return "";
  switch (el.type) {
    case "text":
      return `<div style="${elementStyle(el)}">${escapeHtml(el.text || "")}</div>`;
    case "field":
      return `<div style="${elementStyle(el)}">${escapeHtml(fieldValue(data, el.field, designMode))}</div>`;
    case "date": {
      const value = el.field
        ? fieldValue(data, el.field, designMode)
        : (designMode ? "{{ Date }}" : new Date().toISOString().slice(0, 10));
      return `<div style="${elementStyle(el)}">${escapeHtml(value)}</div>`;
    }
    case "page_number":
      return `<div style="${elementStyle(el)}" class="page-number">${designMode ? "{{ Page Number }}" : "Page <span class=\"pageNumber\"></span>"}</div>`;
    case "image": {
      const src = designMode ? "" : (el.field ? String(resolveFieldPath(data as InvoiceReportPayload, el.field) || "") : "");
      if (!src) {
        return `<div style="${elementStyle(el)};display:flex;align-items:center;justify-content:center;border:0.2mm dashed #D1D5DB;color:#9CA3AF;font-size:7pt;">${designMode ? "{{ Logo }}" : ""}</div>`;
      }
      return `<div style="${elementStyle(el)}"><img src="${escapeHtml(src)}" alt="" style="max-width:100%;max-height:100%;object-fit:contain;" /></div>`;
    }
    case "line":
      return `<div style="${elementStyle(el)};height:${Math.max(el.height, 0.3)}mm;background:${el.backgroundColor || el.color || "#111827"};"></div>`;
    case "rectangle":
      return `<div style="${elementStyle(el)}"></div>`;
    case "table":
      return renderTable(el, data, designMode);
    default:
      return "";
  }
}

export function renderReportHtml(
  template: ReportTemplateJson,
  data: InvoiceReportPayload | null,
  options?: { designMode?: boolean; title?: string },
): string {
  const size = pageSize(template);
  const designMode = options?.designMode === true;
  const elements = [...(template.elements || [])]
    .filter((el) => el.visible !== false)
    .sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0))
    .map((el) => renderElement(el, data, designMode))
    .join("\n");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(options?.title || "Report")}</title>
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; }
    body { font-family: Arial, Helvetica, sans-serif; color: #111827; }
    .report-page {
      position: relative;
      width: ${size.width}mm;
      height: ${size.height}mm;
      overflow: hidden;
      background: #fff;
    }
    @page { size: ${size.width}mm ${size.height}mm; margin: 0; }
    @media print {
      html, body { width: ${size.width}mm; height: ${size.height}mm; }
      .report-page { page-break-after: always; }
    }
  </style>
</head>
<body>
  <div class="report-page">${elements}</div>
</body>
</html>`;
}
