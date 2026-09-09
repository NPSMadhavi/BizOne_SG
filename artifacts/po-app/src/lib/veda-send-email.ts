import { generatePO_PDF, generateInvoice_PDF, generateQuotation_PDF, generateDO_PDF } from "@/lib/pdf";

export type VedaEmailDocType = "inv" | "qt" | "po" | "do";

function base64ToBlob(base64: string, mime: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({} as { error?: string }));
    throw new Error(err.error || `Failed to load document (${res.status})`);
  }
  return res.json();
}

function buildEmailCopy(
  docType: VedaEmailDocType,
  doc: any,
  companyName: string,
): { subject: string; body: string; filename: string; partyEmail?: string } {
  if (docType === "po") {
    const number = doc.poNumber || `PO-${doc.id}`;
    return {
      filename: `${number}.pdf`,
      partyEmail: doc.vendorContactEmail || undefined,
      subject: `${number} for ${doc.vendorName || "Vendor"} | ${companyName}`,
      body: `Dear ${doc.vendorContact || "Sir/Madam"},\n\nPlease find attached our Purchase Order ${number}.\n\nKindly acknowledge receipt and confirm acceptance.\n\nThank you.`,
    };
  }
  if (docType === "inv") {
    const number = doc.invNumber || `INV-${doc.id}`;
    return {
      filename: `${number}.pdf`,
      partyEmail: doc.customerContactEmail || undefined,
      subject: `Invoice ${number} | ${companyName}`,
      body: `Dear ${doc.customerContact || "Sir/Madam"},\n\nPlease find attached Invoice ${number} for your records.\n\nPlease arrange payment as per the agreed terms.\n\nThank you.`,
    };
  }
  if (docType === "qt") {
    const number = doc.qtNumber || `QT-${doc.id}`;
    return {
      filename: `${number}.pdf`,
      partyEmail: doc.customerContactEmail || undefined,
      subject: `Quotation ${number} | ${companyName}`,
      body: `Dear ${doc.customerContact || "Sir/Madam"},\n\nPlease find attached Quotation ${number}.\n\nThank you.`,
    };
  }
  const number = doc.doNumber || `DO-${doc.id}`;
  return {
    filename: `${number}.pdf`,
    partyEmail: doc.customerContactEmail || undefined,
    subject: `Delivery Order ${number} | ${companyName}`,
    body: `Dear ${doc.customerContact || "Sir/Madam"},\n\nPlease find attached Delivery Order ${number}.\n\nThank you.`,
  };
}

async function generatePdfBase64(
  docType: VedaEmailDocType,
  doc: any,
  company: any,
): Promise<string> {
  let content: string | void;
  if (docType === "po") content = await generatePO_PDF(doc, company, { returnBase64: true });
  else if (docType === "inv") content = await generateInvoice_PDF(doc, company, null, { returnBase64: true });
  else if (docType === "qt") content = await generateQuotation_PDF(doc, company, null, { returnBase64: true });
  else content = await generateDO_PDF(doc, company, { returnBase64: true });

  if (typeof content !== "string" || !content) {
    throw new Error("Could not generate the PDF attachment.");
  }
  return content;
}

/**
 * Generate the document PDF in the browser and send it through /api/send-email,
 * then mark the document as sent. Used by Veda when the user asks to email a document.
 */
export async function vedaAutoSendDocumentEmail(options: {
  docType: VedaEmailDocType;
  id: number;
  recipients: string[];
  company?: any;
  companyName?: string;
}): Promise<{ ok: true; recipients: string[]; docNumber: string } | { ok: false; error: string }> {
  const { docType, id, company } = options;
  const recipients = (options.recipients || [])
    .map((e) => String(e || "").trim())
    .filter(Boolean);

  if (!id) return { ok: false, error: "Missing document id." };
  if (recipients.length === 0) return { ok: false, error: "No recipient email provided." };

  try {
    const pathMap: Record<VedaEmailDocType, string> = {
      po: "purchase-orders",
      inv: "invoices",
      qt: "quotations",
      do: "delivery-orders",
    };
    const apiPath = pathMap[docType];
    const doc = await fetchJson<any>(`/api/${apiPath}/${id}`);
    const companyName = options.companyName || company?.name || "BizOne";
    const copy = buildEmailCopy(docType, doc, companyName);
    const pdfBase64 = await generatePdfBase64(docType, doc, company);

    const form = new FormData();
    form.append("to", recipients.join(", "));
    form.append("subject", copy.subject);
    form.append("body", copy.body);
    form.append("filename", copy.filename);
    if (docType === "po") form.append("poId", String(id));
    form.append("pdf", base64ToBlob(pdfBase64, "application/pdf"), copy.filename);

    const sendRes = await fetch("/api/send-email", {
      method: "POST",
      credentials: "include",
      body: form,
    });
    const sendData = await sendRes.json().catch(() => ({} as { error?: string }));
    if (!sendRes.ok) {
      throw new Error(sendData.error || `Failed to send email (${sendRes.status})`);
    }

    await fetch(`/api/${apiPath}/${id}/mark-sent`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sentTo: recipients }),
    });

    const docNumber =
      doc.poNumber || doc.invNumber || doc.qtNumber || doc.doNumber || String(id);

    return { ok: true, recipients, docNumber };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Failed to send email." };
  }
}
