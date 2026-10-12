import { useQuery } from "@tanstack/react-query";
import { generateDO_PDF } from "@/lib/pdf";

export type EmailPdfFile = { filename: string; content: string };

type InvoiceRef = {
  id: number;
  invNumber?: string | null;
  soId?: number | null;
};

/** Delivery orders created from this invoice, or from the same sales order when no invoice link exists. */
export async function deliveryOrdersForInvoice(invoice: InvoiceRef): Promise<any[]> {
  const res = await fetch("/api/delivery-orders", { credentials: "include" });
  if (!res.ok) return [];
  const rows = await res.json();
  if (!Array.isArray(rows)) return [];

  const id = Number(invoice.id);
  const number = String(invoice.invNumber || "");
  const byInvoice = rows.filter((row) =>
    Number(row.invId) === id || (number !== "" && String(row.invNumber || "") === number),
  );
  if (byInvoice.length > 0) return byInvoice;

  const soId = invoice.soId != null ? Number(invoice.soId) : null;
  if (!soId) return [];
  return rows.filter((row) => Number(row.soId) === soId);
}

export function useInvoiceDeliveryOrders(invoice?: InvoiceRef | null) {
  return useQuery({
    queryKey: ["delivery-orders-for-invoice", invoice?.id, invoice?.invNumber, invoice?.soId],
    enabled: !!invoice?.id,
    queryFn: () => deliveryOrdersForInvoice(invoice!),
  });
}

/** Shown in the email dialog, and used as the file name when no saved delivery order exists. */
export function deliveryOrderFileName(invoice: { invNumber?: string | null; id?: number }) {
  return `DO-${invoice.invNumber || invoice.id}.pdf`;
}

export function deliveryOrderAttachmentNames(
  orders: { doNumber?: string }[],
  invoices: { invNumber?: string | null; id?: number }[],
) {
  if (orders.length > 0) {
    return orders.map((order) => `${order.doNumber}.pdf`);
  }
  return invoices.map((invoice) => deliveryOrderFileName(invoice));
}

function deliveryOrderFromInvoice(invoice: any) {
  const items = ((invoice?.items as any[]) || [])
    .filter((item) => item?.type !== "section")
    .map((item) => ({
      partNumber: item.partNumber || "",
      description: item.description || "",
      qty: item.qty,
      uom: item.uom || "",
      serialNumbers: Array.isArray(item.selectedSerials)
        ? item.selectedSerials.join("\n")
        : (item.serialNumbers || ""),
    }));
  return {
    doNumber: deliveryOrderFileName(invoice).replace(/\.pdf$/i, ""),
    customerName: invoice.customerName || "",
    customerAddress: invoice.deliveryAddress || invoice.customerAddress || "",
    customerContact: invoice.customerContact || "",
    issueDate: invoice.issueDate,
    deliveryDate: invoice.deliveryDate,
    paymentTerms: invoice.paymentTerms || "",
    notes: invoice.invNumber ? `Delivery for Invoice ${invoice.invNumber}` : "",
    status: "draft",
    items,
    createdAt: invoice.createdAt,
  };
}

export async function deliveryOrderPdfAttachments(invoice: InvoiceRef & Record<string, any>, company?: any): Promise<EmailPdfFile[]> {
  const orders = await deliveryOrdersForInvoice(invoice);
  const sources = orders.length > 0 ? orders : [deliveryOrderFromInvoice(invoice)];
  const files: EmailPdfFile[] = [];
  for (const order of sources) {
    const content = await generateDO_PDF(order, company, { returnBase64: true });
    if (typeof content !== "string" || !content) continue;
    files.push({ filename: `${order.doNumber}.pdf`, content });
  }
  return files;
}

export async function markDeliveryOrdersSent(invoice: InvoiceRef, recipients: string[]) {
  const orders = await deliveryOrdersForInvoice(invoice);
  await Promise.all(orders.map((order) =>
    fetch(`/api/delivery-orders/${order.id}/mark-sent`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sentTo: recipients }),
    }),
  ));
}

export function invoiceEmailBody(contact: string | null | undefined, invNumber: string, doNumbers: string[]) {
  const greeting = `Dear ${contact || "Sir/Madam"},`;
  const attached = doNumbers.length
    ? `Please find attached Invoice ${invNumber} and Delivery Order ${doNumbers.join(", ")}.`
    : `Please find attached Invoice ${invNumber} for your records.`;
  return `${greeting}\n\n${attached}\n\nPlease arrange payment as per the agreed terms.\n\nThank you.`;
}
