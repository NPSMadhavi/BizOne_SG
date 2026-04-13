import { jsPDF } from "jspdf";
import "jspdf-autotable";
import type { PurchaseOrder, Quotation, Invoice, DeliveryOrder, Company } from "@workspace/api-client-react";
import logoUrl from "@assets/logo_1776054030755.png";

function htmlToText(html: string): string {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function getBase64ImageFromUrl(imageUrl: string): Promise<string> {
  const res = await fetch(imageUrl);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

interface CompanyInfo {
  name: string;
  addressLine1?: string;
  addressLine2?: string;
  registrationNo?: string;
  phone?: string;
  email?: string;
}

function companyToInfo(company: Company | null | undefined): CompanyInfo {
  if (!company) {
    return {
      name: "RSV Infotech Pte. Ltd.",
      addressLine1: "#07-52A, 10 Ubi Crescent, UBI Techpark Lobby C,",
      addressLine2: "Singapore 408564",
    };
  }
  const addr = company.address || "";
  const lines = addr.split(",").map(s => s.trim()).filter(Boolean);
  const midpoint = Math.ceil(lines.length / 2);
  const line1 = lines.slice(0, midpoint).join(", ");
  const line2 = lines.slice(midpoint).join(", ");
  return {
    name: company.name,
    addressLine1: line1 || addr,
    addressLine2: line2 || undefined,
    registrationNo: company.registrationNo,
    phone: company.phone,
    email: company.email,
  };
}

function fmtMoney(currency: string, amount: number): string {
  return new Intl.NumberFormat("en-SG", { style: "currency", currency }).format(amount);
}

function formatDate(d: string | null | undefined): string {
  if (!d) return "TBA";
  const parsed = new Date(d.includes("T") ? d : d + "T00:00:00");
  if (!isNaN(parsed.getTime())) {
    return parsed.toLocaleDateString("en-SG", { day: "2-digit", month: "short", year: "numeric" });
  }
  return d;
}

function buildDocHeader(
  doc: jsPDF,
  logoBase64: string,
  title: string,
  docNumber: string,
  date: string,
  status: string,
  info: CompanyInfo
) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginLeft = 14;
  const marginRight = pageWidth - 14;

  doc.addImage(logoBase64, "PNG", marginLeft, 12, 65, 14);

  doc.setFontSize(26);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(24, 33, 47);
  doc.text(title, marginRight, 22, { align: "right" });

  doc.setFontSize(9.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(80, 80, 80);
  doc.text(`Number: ${docNumber}`, marginRight, 30, { align: "right" });
  doc.text(`Date: ${date}`, marginRight, 36, { align: "right" });
  doc.text(`Status: ${status.toUpperCase()}`, marginRight, 42, { align: "right" });

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text(info.name, marginLeft, 40);

  doc.setFontSize(9.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);

  let companyY = 46;
  if (info.addressLine1) {
    doc.text(info.addressLine1, marginLeft, companyY);
    companyY += 5;
  }
  if (info.addressLine2) {
    doc.text(info.addressLine2, marginLeft, companyY);
    companyY += 5;
  }
  if (info.registrationNo) {
    doc.text(`Reg. No: ${info.registrationNo}`, marginLeft, companyY);
  }

  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.4);
  doc.line(marginLeft, 58, marginRight, 58);
}

function buildDocFooter(doc: jsPDF, docType: string) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginRight = pageWidth - 14;
  const pageHeight = doc.internal.pageSize.getHeight();
  const totalPages = (doc as any).internal.pages.length - 1;
  const footerY = pageHeight - 12;
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(160, 160, 160);
    doc.text(
      `This is a computer-generated ${docType} document and does not require a physical signature.`,
      pageWidth / 2,
      footerY,
      { align: "center" }
    );
    if (totalPages > 1) {
      doc.text(`Page ${p} of ${totalPages}`, marginRight, footerY, { align: "right" });
    }
  }
}

// ── PURCHASE ORDER PDF ────────────────────────────────────────────────────────

export async function generatePO_PDF(po: PurchaseOrder, company?: Company | null, options?: { returnBase64?: boolean }): Promise<string | void> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginLeft = 14;
  const marginRight = pageWidth - 14;
  const col2 = 108;
  const info = companyToInfo(company);

  const logoBase64 = await getBase64ImageFromUrl(logoUrl);

  doc.addImage(logoBase64, "PNG", marginLeft, 12, 65, 14);

  doc.setFontSize(26);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(24, 33, 47);
  doc.text("PURCHASE ORDER", marginRight, 22, { align: "right" });

  doc.setFontSize(9.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(80, 80, 80);
  doc.text(`PO Number: ${po.poNumber}`, marginRight, 30, { align: "right" });
  doc.text(`Date: ${new Date(po.createdAt).toLocaleDateString()}`, marginRight, 36, { align: "right" });
  doc.text(`Status: ${po.status.toUpperCase()}`, marginRight, 42, { align: "right" });

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text(info.name, marginLeft, 40);

  doc.setFontSize(9.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  let companyY = 46;
  if (info.addressLine1) { doc.text(info.addressLine1, marginLeft, companyY); companyY += 5; }
  if (info.addressLine2) { doc.text(info.addressLine2, marginLeft, companyY); companyY += 5; }
  if (info.registrationNo) doc.text(`Reg. No: ${info.registrationNo}`, marginLeft, companyY);

  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.4);
  doc.line(marginLeft, 58, marginRight, 58);

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("Vendor:", marginLeft, 67);
  doc.text("Delivery To:", col2, 67);

  doc.setFontSize(9.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(60, 60, 60);

  const vendorText = [po.vendorName, po.vendorAddress || "", po.vendorContact || ""].filter(Boolean).join("\n");
  doc.text(doc.splitTextToSize(vendorText, 85), marginLeft, 74);
  doc.text(doc.splitTextToSize(po.deliveryAddress || `${info.name} Office`, 82), col2, 74);

  const formatDeliveryDate = (d: string | null | undefined): string => {
    if (!d) return "TBA";
    const parsed = new Date(d);
    if (!isNaN(parsed.getTime())) return parsed.toLocaleDateString("en-SG", { day: "2-digit", month: "short", year: "numeric" });
    return d;
  };

  doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(0, 0, 0);
  doc.text("Delivery Date:", marginLeft, 105);
  doc.text("Payment Terms:", col2, 105);
  doc.setFont("helvetica", "normal"); doc.setTextColor(60, 60, 60);
  doc.text(formatDeliveryDate(po.deliveryDate), marginLeft + 32, 105);
  doc.text(po.paymentTerms || "Standard", col2 + 33, 105);

  const poCurrency = (po as any).currency || "SGD";
  const tableData = po.items.map((item, index) => [
    index + 1, item.partNumber, htmlToText(item.description), item.qty,
    fmtMoney(poCurrency, Number(item.unitPrice)), fmtMoney(poCurrency, Number(item.amount)),
  ]);

  (doc as any).autoTable({
    startY: 113,
    head: [["#", "Item / Part Number", "Description", "Qty", "Unit Price", "Amount"]],
    body: tableData,
    theme: "striped",
    headStyles: { fillColor: [24, 33, 47], textColor: 255, fontStyle: "bold", fontSize: 9.5 },
    bodyStyles: { fontSize: 9.5 },
    styles: { cellPadding: 4 },
    columnStyles: {
      0: { cellWidth: 10, halign: "center" }, 1: { cellWidth: 32 },
      2: { cellWidth: "auto" }, 3: { cellWidth: 16, halign: "center" },
      4: { cellWidth: 27, halign: "right" }, 5: { cellWidth: 27, halign: "right" },
    },
    margin: { left: marginLeft, right: 14 },
  });

  const pageHeight = doc.internal.pageSize.getHeight();
  if (po.notes) {
    const notesY = (doc as any).lastAutoTable.finalY + 8;
    doc.setFontSize(9.5); doc.setFont("helvetica", "bold"); doc.setTextColor(0, 0, 0);
    doc.text("Notes:", marginLeft, notesY);
    doc.setFont("helvetica", "normal"); doc.setTextColor(80, 80, 80);
    doc.text(doc.splitTextToSize(po.notes, 120), marginLeft, notesY + 6);
  }

  const labelX = 146;
  const valueX = marginRight - 4;
  const totalsY = pageHeight - 47;

  doc.setFontSize(9.5); doc.setTextColor(0, 0, 0); doc.setFont("helvetica", "normal");
  doc.text("Subtotal:", labelX, totalsY);
  doc.text(fmtMoney(poCurrency, Number(po.subtotal)), valueX, totalsY, { align: "right" });
  const taxAmount = Number(po.totalAmount) - Number(po.subtotal);
  doc.text("Tax:", labelX, totalsY + 7);
  doc.text(fmtMoney(poCurrency, taxAmount), valueX, totalsY + 7, { align: "right" });
  doc.setDrawColor(180, 180, 180); doc.setLineWidth(0.3);
  doc.line(labelX, totalsY + 10, marginRight, totalsY + 10);
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(24, 33, 47);
  doc.text("Total Amount:", labelX, totalsY + 17);
  doc.text(fmtMoney(poCurrency, Number(po.totalAmount)), valueX, totalsY + 17, { align: "right" });

  const totalPages = (doc as any).internal.pages.length - 1;
  const footerY = pageHeight - 12;
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFontSize(7.5); doc.setFont("helvetica", "italic"); doc.setTextColor(160, 160, 160);
    doc.text("This is a computer-generated Purchase Order document and does not require a physical signature.", pageWidth / 2, footerY, { align: "center" });
    if (totalPages > 1) doc.text(`Page ${p} of ${totalPages}`, marginRight, footerY, { align: "right" });
  }

  if (options?.returnBase64) return doc.output("datauristring").split(",")[1];
  doc.save(`${po.poNumber}.pdf`);
}

// ── QUOTATION PDF ─────────────────────────────────────────────────────────────

export async function generateQuotation_PDF(qt: Quotation, company?: Company | null, options?: { returnBase64?: boolean }): Promise<string | void> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginLeft = 14;
  const marginRight = pageWidth - 14;
  const col2 = 108;
  const info = companyToInfo(company);

  const logoBase64 = await getBase64ImageFromUrl(logoUrl);
  buildDocHeader(doc, logoBase64, "QUOTATION", qt.qtNumber, new Date(qt.createdAt).toLocaleDateString(), qt.status, info);

  doc.setFontSize(10); doc.setFont("helvetica", "bold"); doc.setTextColor(0, 0, 0);
  doc.text("Quote To:", marginLeft, 67);
  doc.text("Deliver To:", col2, 67);

  doc.setFontSize(9.5); doc.setFont("helvetica", "normal"); doc.setTextColor(60, 60, 60);
  const customerText = [qt.customerName, qt.customerAddress || "", qt.customerContact || ""].filter(Boolean).join("\n");
  doc.text(doc.splitTextToSize(customerText, 85), marginLeft, 74);
  doc.text(doc.splitTextToSize(qt.deliveryAddress || "—", 82), col2, 74);

  doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(0, 0, 0);
  doc.text("Delivery Date:", marginLeft, 105);
  doc.text("Payment Terms:", col2, 105);
  doc.setFont("helvetica", "normal"); doc.setTextColor(60, 60, 60);
  doc.text(formatDate(qt.deliveryDate), marginLeft + 32, 105);
  doc.text(qt.paymentTerms || "Standard", col2 + 33, 105);

  const qtCurrency = (qt as any).currency || "SGD";
  const tableData = (qt.items as any[]).map((item, i) => [
    i + 1, item.partNumber || "", htmlToText(item.description),
    item.qty, fmtMoney(qtCurrency, Number(item.unitPrice)), fmtMoney(qtCurrency, Number(item.amount)),
  ]);

  (doc as any).autoTable({
    startY: 113,
    head: [["#", "Item / Part Number", "Description", "Qty", "Unit Price", "Amount"]],
    body: tableData,
    theme: "striped",
    headStyles: { fillColor: [24, 33, 47], textColor: 255, fontStyle: "bold", fontSize: 9.5 },
    bodyStyles: { fontSize: 9.5 },
    styles: { cellPadding: 4 },
    columnStyles: {
      0: { cellWidth: 10, halign: "center" }, 1: { cellWidth: 32 },
      2: { cellWidth: "auto" }, 3: { cellWidth: 16, halign: "center" },
      4: { cellWidth: 27, halign: "right" }, 5: { cellWidth: 27, halign: "right" },
    },
    margin: { left: marginLeft, right: 14 },
  });

  const pageHeight = doc.internal.pageSize.getHeight();
  if (qt.notes) {
    const notesY = (doc as any).lastAutoTable.finalY + 8;
    doc.setFontSize(9.5); doc.setFont("helvetica", "bold"); doc.setTextColor(0, 0, 0);
    doc.text("Notes:", marginLeft, notesY);
    doc.setFont("helvetica", "normal"); doc.setTextColor(80, 80, 80);
    doc.text(doc.splitTextToSize(qt.notes, 120), marginLeft, notesY + 6);
  }

  const labelX = 146;
  const valueX = marginRight - 4;
  const totalsY = pageHeight - 47;

  doc.setFontSize(9.5); doc.setTextColor(0, 0, 0); doc.setFont("helvetica", "normal");
  doc.text("Subtotal:", labelX, totalsY);
  doc.text(fmtMoney(qtCurrency, Number(qt.subtotal)), valueX, totalsY, { align: "right" });
  doc.text("GST:", labelX, totalsY + 7);
  doc.text(fmtMoney(qtCurrency, Number(qt.tax)), valueX, totalsY + 7, { align: "right" });
  doc.setDrawColor(180, 180, 180); doc.setLineWidth(0.3);
  doc.line(labelX, totalsY + 10, marginRight, totalsY + 10);
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(24, 33, 47);
  doc.text("Total Amount:", labelX, totalsY + 17);
  doc.text(fmtMoney(qtCurrency, Number(qt.totalAmount)), valueX, totalsY + 17, { align: "right" });

  buildDocFooter(doc, "Quotation");
  if (options?.returnBase64) return doc.output("datauristring").split(",")[1];
  doc.save(`${qt.qtNumber}.pdf`);
}

// ── INVOICE PDF ───────────────────────────────────────────────────────────────

export async function generateInvoice_PDF(inv: Invoice, company?: Company | null, options?: { returnBase64?: boolean }): Promise<string | void> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginLeft = 14;
  const marginRight = pageWidth - 14;
  const col2 = 108;
  const info = companyToInfo(company);

  const logoBase64 = await getBase64ImageFromUrl(logoUrl);
  buildDocHeader(doc, logoBase64, "INVOICE", inv.invNumber, new Date(inv.createdAt).toLocaleDateString(), inv.status, info);

  doc.setFontSize(10); doc.setFont("helvetica", "bold"); doc.setTextColor(0, 0, 0);
  doc.text("Bill To:", marginLeft, 67);
  doc.text("Deliver To:", col2, 67);

  doc.setFontSize(9.5); doc.setFont("helvetica", "normal"); doc.setTextColor(60, 60, 60);
  const customerText = [inv.customerName, inv.customerAddress || "", inv.customerContact || ""].filter(Boolean).join("\n");
  doc.text(doc.splitTextToSize(customerText, 85), marginLeft, 74);
  doc.text(doc.splitTextToSize(inv.deliveryAddress || "—", 82), col2, 74);

  doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(0, 0, 0);
  doc.text("Delivery Date:", marginLeft, 105);
  doc.text("Payment Terms:", col2, 105);
  doc.setFont("helvetica", "normal"); doc.setTextColor(60, 60, 60);
  doc.text(formatDate(inv.deliveryDate), marginLeft + 32, 105);
  doc.text(inv.paymentTerms || "Standard", col2 + 33, 105);

  const invCurrency = (inv as any).currency || "SGD";
  const tableData = (inv.items as any[]).map((item, i) => [
    i + 1, item.partNumber || "", htmlToText(item.description),
    item.qty, fmtMoney(invCurrency, Number(item.unitPrice)), fmtMoney(invCurrency, Number(item.amount)),
  ]);

  (doc as any).autoTable({
    startY: 113,
    head: [["#", "Item / Part Number", "Description", "Qty", "Unit Price", "Amount"]],
    body: tableData,
    theme: "striped",
    headStyles: { fillColor: [24, 33, 47], textColor: 255, fontStyle: "bold", fontSize: 9.5 },
    bodyStyles: { fontSize: 9.5 },
    styles: { cellPadding: 4 },
    columnStyles: {
      0: { cellWidth: 10, halign: "center" }, 1: { cellWidth: 32 },
      2: { cellWidth: "auto" }, 3: { cellWidth: 16, halign: "center" },
      4: { cellWidth: 27, halign: "right" }, 5: { cellWidth: 27, halign: "right" },
    },
    margin: { left: marginLeft, right: 14 },
  });

  const pageHeight = doc.internal.pageSize.getHeight();
  if (inv.notes) {
    const notesY = (doc as any).lastAutoTable.finalY + 8;
    doc.setFontSize(9.5); doc.setFont("helvetica", "bold"); doc.setTextColor(0, 0, 0);
    doc.text("Notes:", marginLeft, notesY);
    doc.setFont("helvetica", "normal"); doc.setTextColor(80, 80, 80);
    doc.text(doc.splitTextToSize(inv.notes, 120), marginLeft, notesY + 6);
  }

  const labelX = 146;
  const valueX = marginRight - 4;
  const totalsY = pageHeight - 47;

  doc.setFontSize(9.5); doc.setTextColor(0, 0, 0); doc.setFont("helvetica", "normal");
  doc.text("Subtotal:", labelX, totalsY);
  doc.text(fmtMoney(invCurrency, Number(inv.subtotal)), valueX, totalsY, { align: "right" });
  doc.text("GST:", labelX, totalsY + 7);
  doc.text(fmtMoney(invCurrency, Number(inv.tax)), valueX, totalsY + 7, { align: "right" });
  doc.setDrawColor(180, 180, 180); doc.setLineWidth(0.3);
  doc.line(labelX, totalsY + 10, marginRight, totalsY + 10);
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(24, 33, 47);
  doc.text("Total Amount:", labelX, totalsY + 17);
  doc.text(fmtMoney(invCurrency, Number(inv.totalAmount)), valueX, totalsY + 17, { align: "right" });

  buildDocFooter(doc, "Invoice");
  if (options?.returnBase64) return doc.output("datauristring").split(",")[1];
  doc.save(`${inv.invNumber}.pdf`);
}

// ── DELIVERY ORDER PDF ────────────────────────────────────────────────────────

export async function generateDO_PDF(doDoc: DeliveryOrder, company?: Company | null) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginLeft = 14;
  const marginRight = pageWidth - 14;
  const info = companyToInfo(company);

  const logoBase64 = await getBase64ImageFromUrl(logoUrl);
  buildDocHeader(doc, logoBase64, "DELIVERY ORDER", doDoc.doNumber, new Date(doDoc.createdAt).toLocaleDateString(), doDoc.status, info);

  doc.setFontSize(10); doc.setFont("helvetica", "bold"); doc.setTextColor(0, 0, 0);
  doc.text("Deliver To:", marginLeft, 67);

  doc.setFontSize(9.5); doc.setFont("helvetica", "normal"); doc.setTextColor(60, 60, 60);
  const customerText = [doDoc.customerName, doDoc.customerAddress || "", doDoc.customerContact || ""].filter(Boolean).join("\n");
  doc.text(doc.splitTextToSize(customerText, 85), marginLeft, 74);

  doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(0, 0, 0);
  doc.text("Delivery Date:", marginLeft, 105);
  doc.setFont("helvetica", "normal"); doc.setTextColor(60, 60, 60);
  doc.text(formatDate(doDoc.deliveryDate), marginLeft + 32, 105);

  const tableData = (doDoc.items as any[]).map((item, i) => [i + 1, item.description, item.qty]);

  (doc as any).autoTable({
    startY: 113,
    head: [["#", "Description", "Qty"]],
    body: tableData,
    theme: "striped",
    headStyles: { fillColor: [24, 33, 47], textColor: 255, fontStyle: "bold", fontSize: 9.5 },
    bodyStyles: { fontSize: 9.5 },
    styles: { cellPadding: 4 },
    columnStyles: {
      0: { cellWidth: 10, halign: "center" },
      1: { cellWidth: "auto" },
      2: { cellWidth: 20, halign: "center" },
    },
    margin: { left: marginLeft, right: 14 },
  });

  if (doDoc.notes) {
    const notesY = (doc as any).lastAutoTable.finalY + 8;
    doc.setFontSize(9.5); doc.setFont("helvetica", "bold"); doc.setTextColor(0, 0, 0);
    doc.text("Notes:", marginLeft, notesY);
    doc.setFont("helvetica", "normal"); doc.setTextColor(80, 80, 80);
    doc.text(doc.splitTextToSize(doDoc.notes, 120), marginLeft, notesY + 6);
  }

  buildDocFooter(doc, "Delivery Order");
  doc.save(`${doDoc.doNumber}.pdf`);
}
