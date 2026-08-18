export const DOCUMENT_REPORT_TYPES = [
  { reportType: "quotation", name: "Quotation", group: "sales" as const },
  { reportType: "sales-order", name: "Sales Order", group: "sales" as const },
  { reportType: "proforma-invoice", name: "Proforma Invoice", group: "sales" as const },
  { reportType: "invoice", name: "Tax Invoice", group: "sales" as const },
  { reportType: "credit-note", name: "Credit Note", group: "sales" as const },
  { reportType: "debit-note", name: "Debit Note", group: "sales" as const },
  { reportType: "delivery-order", name: "Delivery Order", group: "sales" as const },
  { reportType: "purchase-quotation", name: "Purchase Quotation", group: "purchase" as const },
  { reportType: "purchase-order", name: "Purchase Order", group: "purchase" as const },
  { reportType: "vendor-invoice", name: "Vendor Invoice", group: "purchase" as const },
  { reportType: "grn", name: "Goods Receipt Note", group: "purchase" as const },
] as const;

export type DocumentReportTypeOption = {
  reportType: string;
  name: string;
  group: "sales" | "purchase";
};

export function mergeReportTypeOptions(apiRows: Array<{ reportType: string; name: string }>): DocumentReportTypeOption[] {
  const byType = new Map<string, DocumentReportTypeOption>();
  for (const d of DOCUMENT_REPORT_TYPES) {
    byType.set(d.reportType, { reportType: d.reportType, name: d.name, group: d.group });
  }
  for (const row of apiRows) {
    const existing = byType.get(row.reportType);
    if (existing) {
      existing.name = row.name || existing.name;
    } else {
      byType.set(row.reportType, {
        reportType: row.reportType,
        name: row.name,
        group: row.reportType.startsWith("purchase") || row.reportType === "grn" || row.reportType === "vendor-invoice"
          ? "purchase"
          : "sales",
      });
    }
  }
  return [
    ...DOCUMENT_REPORT_TYPES.map((d) => byType.get(d.reportType)!),
    ...[...byType.values()].filter((d) => !DOCUMENT_REPORT_TYPES.some((x) => x.reportType === d.reportType)),
  ];
}
