import type { ReportElement, ReportTemplateJson } from "./types.js";

const NAVY = "#18212F";
const GREY = "#646464";
const LINE = "#C8C8C8";

function el(partial: Omit<ReportElement, "id"> & { id: string }): ReportElement {
  return {
    fontSize: 9.5,
    fontWeight: "normal",
    color: "#111827",
    textAlign: "left",
    borderWidth: 0,
    borderStyle: "none",
    visible: true,
    ...partial,
  };
}

export function buildDefaultInvoiceTemplate(): ReportTemplateJson {
  return buildDefaultDocumentTemplate({
    reportType: "invoice",
    title: "TAX INVOICE",
    partyLabel: "Bill To:",
    footerDocName: "Tax Invoice",
  });
}

/**
 * Default document layout matching the existing BizOne PDF:
 * logo + company (from Settings) on the left, title/meta on the right,
 * navy item table, grey totals box. Company values are field references only.
 */
export function buildDefaultDocumentTemplate(opts: {
  reportType: string;
  title: string;
  partyLabel: string;
  footerDocName: string;
}): ReportTemplateJson {
  return {
    version: 1,
    reportType: opts.reportType,
    page: {
      size: "A4",
      orientation: "portrait",
      margin: { top: 10, right: 14, bottom: 12, left: 14 },
    },
    elements: [
      el({
        id: "company-logo",
        type: "image",
        field: "company.logo",
        x: 14, y: 10, width: 62, height: 16,
      }),
      el({
        id: "company-name",
        type: "field",
        field: "company.name",
        x: 14, y: 28, width: 100, height: 6,
        fontSize: 11, fontWeight: "bold",
      }),
      el({
        id: "company-address",
        type: "field",
        field: "company.address",
        x: 14, y: 35, width: 108, height: 10,
        fontSize: 9, color: GREY,
      }),
      el({
        id: "reg-label",
        type: "text",
        text: "Co. Reg. No.:",
        x: 14, y: 46, width: 26, height: 4,
        fontSize: 8, color: GREY,
      }),
      el({
        id: "company-reg",
        type: "field",
        field: "company.registration_number",
        x: 40, y: 46, width: 82, height: 4,
        fontSize: 8, color: GREY,
      }),
      el({
        id: "gst-reg-label",
        type: "text",
        text: "GST Reg. No.:",
        x: 14, y: 50.5, width: 26, height: 4,
        fontSize: 8, color: GREY,
      }),
      el({
        id: "company-tax",
        type: "field",
        field: "company.tax_number",
        x: 40, y: 50.5, width: 82, height: 4,
        fontSize: 8, color: GREY,
      }),
      el({
        id: "doc-title",
        type: "text",
        text: opts.title,
        x: 108, y: 10, width: 88, height: 11,
        fontSize: 22, fontWeight: "bold", textAlign: "right", color: NAVY,
      }),
      el({
        id: "number-label",
        type: "text",
        text: "Number:",
        x: 128, y: 24, width: 28, height: 5,
        fontSize: 9.5, textAlign: "right", color: GREY,
      }),
      el({
        id: "invoice-number",
        type: "field",
        field: "invoice.invoice_number",
        x: 157, y: 24, width: 39, height: 5,
        fontSize: 9.5, textAlign: "right", color: GREY,
      }),
      el({
        id: "date-label",
        type: "text",
        text: "Date:",
        x: 128, y: 30, width: 28, height: 5,
        fontSize: 9.5, textAlign: "right", color: GREY,
      }),
      el({
        id: "invoice-date",
        type: "field",
        field: "invoice.invoice_date",
        x: 157, y: 30, width: 39, height: 5,
        fontSize: 9.5, textAlign: "right", color: GREY,
      }),
      el({
        id: "terms-meta-label",
        type: "text",
        text: "Payment Terms:",
        x: 118, y: 36, width: 38, height: 5,
        fontSize: 9.5, textAlign: "right", color: GREY,
      }),
      el({
        id: "payment-terms",
        type: "field",
        field: "invoice.payment_terms",
        x: 157, y: 36, width: 39, height: 5,
        fontSize: 9.5, textAlign: "right", color: GREY,
      }),
      el({
        id: "header-line",
        type: "line",
        x: 14, y: 57, width: 182, height: 0.35,
        backgroundColor: LINE,
      }),
      el({
        id: "bill-to-label",
        type: "text",
        text: opts.partyLabel,
        x: 14, y: 61, width: 80, height: 5,
        fontSize: 10, fontWeight: "bold",
      }),
      el({
        id: "customer-name",
        type: "field",
        field: "customer.name",
        x: 14, y: 68, width: 120, height: 5,
        fontSize: 9.5, fontWeight: "bold", color: "#3C3C3C",
      }),
      el({
        id: "customer-address",
        type: "field",
        field: "customer.address",
        x: 14, y: 74, width: 130, height: 10,
        fontSize: 9.5, color: "#3C3C3C",
      }),
      el({
        id: "customer-attn",
        type: "field",
        field: "customer.contact_person",
        x: 14, y: 85, width: 120, height: 5,
        fontSize: 9.5, color: "#3C3C3C",
      }),
      el({
        id: "items-table",
        type: "table",
        source: "items",
        x: 14, y: 94, width: 182, height: 88,
        fontSize: 8,
        headerBackground: NAVY,
        headerColor: "#FFFFFF",
        columns: [
          { header: "#", field: "item.index", width: 10, align: "left" },
          { header: "Item / Part Number", field: "item.product_name", width: 32, align: "left" },
          { header: "Description", field: "item.description", width: 48, align: "left" },
          { header: "Qty", field: "item.quantity", width: 16, align: "right" },
          { header: "UOM", field: "item.uom", width: 16, align: "center" },
          { header: "Unit Price", field: "item.unit_price", width: 30, align: "right" },
          { header: "Amount", field: "item.amount", width: 30, align: "right" },
        ],
      }),
      el({
        id: "totals-box",
        type: "rectangle",
        x: 118, y: 188, width: 78, height: 28,
        backgroundColor: "#F3F4F6",
        borderWidth: 0,
      }),
      el({
        id: "subtotal-label",
        type: "text",
        text: "Subtotal",
        x: 122, y: 191, width: 32, height: 5,
        fontSize: 9.5, color: GREY,
      }),
      el({
        id: "subtotal",
        type: "field",
        field: "invoice.subtotal",
        x: 154, y: 191, width: 38, height: 5,
        fontSize: 9.5, textAlign: "right",
      }),
      el({
        id: "tax-label",
        type: "field",
        field: "invoice.tax_label",
        x: 122, y: 198, width: 32, height: 5,
        fontSize: 9.5, color: GREY,
      }),
      el({
        id: "tax",
        type: "field",
        field: "invoice.tax",
        x: 154, y: 198, width: 38, height: 5,
        fontSize: 9.5, textAlign: "right",
      }),
      el({
        id: "total-line",
        type: "line",
        x: 122, y: 205, width: 70, height: 0.25,
        backgroundColor: "#D1D5DB",
      }),
      el({
        id: "total-label",
        type: "text",
        text: "Total Amount",
        x: 122, y: 208, width: 32, height: 6,
        fontSize: 10.5, fontWeight: "bold",
      }),
      el({
        id: "total",
        type: "field",
        field: "invoice.total",
        x: 154, y: 208, width: 38, height: 6,
        fontSize: 10.5, fontWeight: "bold", textAlign: "right",
      }),
      el({
        id: "footer-line",
        type: "line",
        x: 14, y: 278, width: 182, height: 0.25,
        backgroundColor: "#D2D2D2",
      }),
      el({
        id: "footer-note",
        type: "text",
        text: `This is a computer-generated ${opts.footerDocName} document and does not require a physical signature.`,
        x: 14, y: 281, width: 140, height: 5,
        fontSize: 6.5, fontStyle: "italic", color: "#AFAFAF",
      }),
      el({
        id: "page-number",
        type: "page_number",
        x: 154, y: 281, width: 42, height: 5,
        fontSize: 6.5, textAlign: "right", color: "#AFAFAF",
      }),
    ],
  };
}
