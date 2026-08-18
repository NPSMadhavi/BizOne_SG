import { db, invoicesTable, customersTable } from "@workspace/db";
import { and, desc, eq, ilike } from "drizzle-orm";
import { getCompanyReportData } from "./company-data.js";
import {
  EMPTY_CUSTOMER,
  EMPTY_INVOICE,
  type CustomerReportData,
  type InvoiceReportPayload,
  type ItemReportData,
} from "./types.js";

function str(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

function money(value: unknown, currency = "SGD"): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return currencySymbol(currency) + "0.00";
  const num = n.toLocaleString("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${currencySymbol(currency)}${num}`;
}

function amountOnly(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0.00";
  return n.toLocaleString("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function currencySymbol(currency: string): string {
  const map: Record<string, string> = {
    SGD: "S$", USD: "US$", EUR: "€", GBP: "£", MYR: "RM", INR: "₹",
  };
  return map[currency] || `${currency} `;
}

function mapItems(raw: unknown): ItemReportData[] {
  const items = Array.isArray(raw) ? raw : [];
  return items
    .filter((item) => item && item.type !== "section")
    .map((item, i) => ({
      index: String(i + 1),
      product_name: str(item.partNumber),
      description: stripHtml(str(item.description)),
      quantity: str(item.qty ?? item.quantity),
      uom: str(item.uom),
      unit_price: amountOnly(item.unitPrice),
      discount: str(item.discount || 0),
      tax: str(item.tax || 0),
      amount: amountOnly(item.amount),
    }));
}

function stripHtml(html: string): string {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function resolveCustomer(companyId: number, invoice: typeof invoicesTable.$inferSelect): Promise<CustomerReportData> {
  const name = str(invoice.customerName);
  let match: typeof customersTable.$inferSelect | undefined;
  if (name) {
    const rows = await db
      .select()
      .from(customersTable)
      .where(and(eq(customersTable.companyId, companyId), ilike(customersTable.name, name)))
      .limit(1);
    match = rows[0];
  }

  const person = str(invoice.customerContact) || str(match?.contactPerson);

  return {
    name: name || str(match?.name),
    address: str(invoice.customerAddress) || str(match?.address),
    email: str(invoice.customerContactEmail) || str(match?.contactEmail),
    phone: str(match?.phone),
    tax_number: str(match?.gstNo),
    contact_person: person ? `Attn: ${person}` : "",
    postal_code: str(match?.postalCode),
    country: str(match?.country),
    ship_to_address: str(invoice.deliveryAddress) || str(match?.shipToAddress),
  };
}

export async function getInvoiceReportData(invoiceId: number, companyId: number): Promise<InvoiceReportPayload | null> {
  const [invoice] = await db
    .select()
    .from(invoicesTable)
    .where(and(eq(invoicesTable.id, invoiceId), eq(invoicesTable.companyId, companyId)))
    .limit(1);

  if (!invoice) return null;

  const [company, customer] = await Promise.all([
    getCompanyReportData(companyId),
    resolveCustomer(companyId, invoice),
  ]);

  const currency = str(invoice.currency) || "SGD";
  const gstRate = company.gstRate || "9";

  return {
    recordId: invoice.id,
    company,
    invoice: {
      invoice_number: str(invoice.invNumber),
      invoice_date: str(invoice.issueDate),
      delivery_date: str(invoice.deliveryDate),
      payment_terms: str(invoice.paymentTerms),
      po_ref: str(invoice.poRefNo),
      notes: stripHtml(str(invoice.notes)),
      subtotal: money(invoice.subtotal, currency),
      discount: money(invoice.discountAmount, currency),
      tax: money(invoice.tax, currency),
      tax_label: `GST (${gstRate}%)`,
      total: money(invoice.totalAmount, currency),
      currency,
      currency_symbol: currencySymbol(currency),
      status: str(invoice.status),
    },
    customer,
    items: mapItems(invoice.items),
  };
}

export async function getLatestInvoiceReportData(companyId: number): Promise<InvoiceReportPayload> {
  const [latest] = await db
    .select({ id: invoicesTable.id })
    .from(invoicesTable)
    .where(eq(invoicesTable.companyId, companyId))
    .orderBy(desc(invoicesTable.id))
    .limit(1);

  if (latest) {
    const data = await getInvoiceReportData(latest.id, companyId);
    if (data) return data;
  }

  return {
    company: await getCompanyReportData(companyId),
    invoice: { ...EMPTY_INVOICE },
    customer: { ...EMPTY_CUSTOMER },
    items: [],
  };
}
