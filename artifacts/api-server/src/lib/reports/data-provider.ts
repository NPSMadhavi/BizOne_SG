import { getCompanyReportData } from "./company-data.js";
import { getInvoiceReportData, getLatestInvoiceReportData } from "./invoice-data.js";
import { isDocumentReportType } from "./document-types.js";
import { invoiceAccessible } from "./validate-template.js";
import { EMPTY_CUSTOMER, EMPTY_INVOICE, type InvoiceReportPayload } from "./types.js";

export type ReportUserContext = {
  companyId: number;
  userId: number;
  isAdmin: boolean;
  isExternal?: boolean;
};

export type ReportDataResult =
  | { ok: true; data: InvoiceReportPayload }
  | { ok: false; status: number; error: string };

/**
 * Runtime report data only. Never written to report_fields or report_templates.
 * Invoice/customer/company/item values are read from existing BizOne tables.
 */
export async function getReportData(
  reportType: string,
  recordId: number | null,
  ctx: ReportUserContext,
): Promise<ReportDataResult> {
  if (!isDocumentReportType(reportType)) {
    return { ok: false, status: 400, error: "Unsupported report type" };
  }

  if (reportType === "invoice") {
    if (recordId) {
      const access = await invoiceAccessible({
        invoiceId: recordId,
        companyId: ctx.companyId,
        userId: ctx.userId,
        isAdmin: ctx.isAdmin,
        isExternal: ctx.isExternal,
      });
      if (!access.ok) return access;
      const data = await getInvoiceReportData(recordId, ctx.companyId);
      if (!data) return { ok: false, status: 404, error: "Invoice not found" };
      return { ok: true, data };
    }

    const data = await getLatestInvoiceReportData(ctx.companyId);
    return { ok: true, data };
  }

  return { ok: true, data: await emptyInvoiceReport(ctx.companyId) };
}

export async function emptyInvoiceReport(companyId: number): Promise<InvoiceReportPayload> {
  return {
    company: await getCompanyReportData(companyId),
    invoice: { ...EMPTY_INVOICE },
    customer: { ...EMPTY_CUSTOMER },
    items: [],
  };
}
