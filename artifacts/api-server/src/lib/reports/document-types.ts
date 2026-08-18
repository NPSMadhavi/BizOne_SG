export type DocumentPartyKind = "customer" | "vendor";

export interface DocumentReportType {
  reportType: string;
  name: string;
  shortName: string;
  module: string;
  group: "sales" | "purchase";
  title: string;
  partyLabel: string;
  partyKind: DocumentPartyKind;
  footerDocName: string;
  description: string;
}

/** PDF-generating BizOne documents shown in Report Type. */
export const DOCUMENT_REPORT_TYPES: DocumentReportType[] = [
  {
    reportType: "quotation",
    name: "Quotation",
    shortName: "QT",
    module: "quotations",
    group: "sales",
    title: "QUOTATION",
    partyLabel: "Bill To:",
    partyKind: "customer",
    footerDocName: "Quotation",
    description: "Sales quotation document",
  },
  {
    reportType: "sales-order",
    name: "Sales Order",
    shortName: "SO",
    module: "sales_orders",
    group: "sales",
    title: "SALES ORDER",
    partyLabel: "Bill To:",
    partyKind: "customer",
    footerDocName: "Sales Order",
    description: "Sales order document",
  },
  {
    reportType: "proforma-invoice",
    name: "Proforma Invoice",
    shortName: "PI",
    module: "proforma_invoices",
    group: "sales",
    title: "PROFORMA INVOICE",
    partyLabel: "Bill To:",
    partyKind: "customer",
    footerDocName: "Proforma Invoice",
    description: "Proforma invoice document",
  },
  {
    reportType: "invoice",
    name: "Tax Invoice",
    shortName: "INV",
    module: "invoices",
    group: "sales",
    title: "TAX INVOICE",
    partyLabel: "Bill To:",
    partyKind: "customer",
    footerDocName: "Tax Invoice",
    description: "Tax invoice document",
  },
  {
    reportType: "credit-note",
    name: "Credit Note",
    shortName: "CN",
    module: "credit_notes",
    group: "sales",
    title: "CREDIT NOTE",
    partyLabel: "Bill To:",
    partyKind: "customer",
    footerDocName: "Credit Note",
    description: "Credit note document",
  },
  {
    reportType: "debit-note",
    name: "Debit Note",
    shortName: "DN",
    module: "debit_notes",
    group: "sales",
    title: "DEBIT NOTE",
    partyLabel: "Bill To:",
    partyKind: "customer",
    footerDocName: "Debit Note",
    description: "Debit note document",
  },
  {
    reportType: "delivery-order",
    name: "Delivery Order",
    shortName: "DO",
    module: "delivery_orders",
    group: "sales",
    title: "DELIVERY ORDER",
    partyLabel: "Deliver To:",
    partyKind: "customer",
    footerDocName: "Delivery Order",
    description: "Delivery order document",
  },
  {
    reportType: "purchase-quotation",
    name: "Purchase Quotation",
    shortName: "PQ",
    module: "purchase_quotations",
    group: "purchase",
    title: "PURCHASE QUOTATION",
    partyLabel: "Vendor:",
    partyKind: "vendor",
    footerDocName: "Purchase Quotation",
    description: "Purchase quotation document",
  },
  {
    reportType: "purchase-order",
    name: "Purchase Order",
    shortName: "PO",
    module: "purchase_orders",
    group: "purchase",
    title: "PURCHASE ORDER",
    partyLabel: "Vendor:",
    partyKind: "vendor",
    footerDocName: "Purchase Order",
    description: "Purchase order document",
  },
  {
    reportType: "vendor-invoice",
    name: "Vendor Invoice",
    shortName: "VI",
    module: "vendor_invoices",
    group: "purchase",
    title: "VENDOR INVOICE",
    partyLabel: "Vendor:",
    partyKind: "vendor",
    footerDocName: "Vendor Invoice",
    description: "Vendor invoice document",
  },
  {
    reportType: "grn",
    name: "Goods Receipt Note",
    shortName: "GRN",
    module: "grn",
    group: "purchase",
    title: "GOODS RECEIPT NOTE",
    partyLabel: "Vendor:",
    partyKind: "vendor",
    footerDocName: "Goods Receipt Note",
    description: "Goods receipt note document",
  },
];

export const DOCUMENT_REPORT_TYPE_ORDER = DOCUMENT_REPORT_TYPES.map((d) => d.reportType);

export function resolveDocumentReportType(input: string): DocumentReportType | undefined {
  const raw = String(input || "").trim();
  if (!raw) return undefined;
  const slug = raw.toLowerCase().replace(/[\s_]+/g, "-");
  return DOCUMENT_REPORT_TYPES.find((d) =>
    d.reportType === raw ||
    d.reportType === slug ||
    d.name.toLowerCase() === raw.toLowerCase()
  );
}

export function getDocumentReportType(reportType: string): DocumentReportType | undefined {
  return resolveDocumentReportType(reportType);
}

export function isDocumentReportType(reportType: string): boolean {
  return !!resolveDocumentReportType(reportType);
}

export function sortReportDefinitions<T extends { reportType: string; name?: string | null }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const ai = DOCUMENT_REPORT_TYPE_ORDER.indexOf(a.reportType);
    const bi = DOCUMENT_REPORT_TYPE_ORDER.indexOf(b.reportType);
    const av = ai === -1 ? 1000 : ai;
    const bv = bi === -1 ? 1000 : bi;
    if (av !== bv) return av - bv;
    return String(a.name || a.reportType).localeCompare(String(b.name || b.reportType));
  });
}
