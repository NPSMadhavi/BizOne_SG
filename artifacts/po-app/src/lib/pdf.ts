import { jsPDF } from "jspdf";
import "jspdf-autotable";
import type { PurchaseOrder, Quotation, Invoice, DeliveryOrder, Company } from "@workspace/api-client-react";
import logoRsvUrl from "@assets/logo_1776054030755.png";
import logoNetopsysUrl from "@assets/Netopsys_logo_Dark_1776066608427.png";

function getLogoUrl(company: Company | null | undefined): string {
  if (!company || company.id === 1) return logoRsvUrl;
  return logoNetopsysUrl;
}

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

interface RichLine { text: string; bold: boolean; italic: boolean; }

function htmlToRichLines(html: string): RichLine[] {
  if (!html) return [];
  const rawLines = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<\/?(ul|ol|div|h[1-6])[^>]*>/gi, "\n")
    .split("\n");
  const result: RichLine[] = [];
  for (const rawLine of rawLines) {
    const hasBold = /<(strong|b)\b/i.test(rawLine);
    const hasItalic = /<(em|i)\b/i.test(rawLine);
    const text = rawLine
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&nbsp;/g, " ")
      .trim();
    if (text) result.push({ text, bold: hasBold, italic: hasItalic });
  }
  return result;
}

function autoTableRich(
  doc: jsPDF,
  opts: any,
  descColIdx: number,
  richDescRows: RichLine[][]
): void {
  (doc as any).autoTable({
    ...opts,
    willDrawCell: (data: any) => {
      if (data.section === "body" && data.column.index === descColIdx) {
        data.cell.text = [];
      }
    },
    didDrawCell: (data: any) => {
      if (data.section !== "body" || data.column.index !== descColIdx) return;
      const richLines = richDescRows[data.row.index];
      if (!richLines || richLines.length === 0) return;
      const jdoc = data.doc as jsPDF;
      const cell = data.cell;
      const padding = 4;
      const x = cell.x + padding;
      const maxW = cell.width - padding * 2;
      let ty = cell.y + padding + 3.35;
      jdoc.setFontSize(9.5);
      for (const { text, bold, italic } of richLines) {
        const style = bold && italic ? "bolditalic" : bold ? "bold" : italic ? "italic" : "normal";
        jdoc.setFont("helvetica", style);
        jdoc.setTextColor(60, 60, 60);
        const wrapped = jdoc.splitTextToSize(text, maxW);
        jdoc.text(wrapped, x, ty);
        ty += wrapped.length * 4.5;
      }
    },
  });
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
  gstNo?: string;
  phone?: string;
  email?: string;
}

function companyToInfo(company: Company | null | undefined): CompanyInfo {
  if (!company) {
    return {
      name: "RSV Infotech Pte. Ltd.",
      addressLine1: "#07-52A, 10 Ubi Crescent, UBI Techpark Lobby C,",
      addressLine2: "Singapore 408564",
      registrationNo: "200812581D",
      gstNo: "200812581D",
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
    doc.text(`Co. Reg. No.: ${info.registrationNo}`, marginLeft, companyY);
    companyY += 5;
  }
  if (info.gstNo) {
    doc.text(`GST Reg. No.: ${info.gstNo}`, marginLeft, companyY);
  }

  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.4);
  doc.line(marginLeft, 58, marginRight, 58);
}

function buildDocFooter(doc: jsPDF, docType: string) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginLeft = 14;
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
    doc.text(`Page ${p} of ${totalPages}`, marginRight, footerY, { align: "right" });
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

  const logoBase64 = await getBase64ImageFromUrl(getLogoUrl(company));

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
  if (info.registrationNo) { doc.text(`Co. Reg. No.: ${info.registrationNo}`, marginLeft, companyY); companyY += 5; }
  if (info.gstNo) doc.text(`GST Reg. No.: ${info.gstNo}`, marginLeft, companyY);

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
  const poRichDesc = po.items.map((item: any) => htmlToRichLines(item.description));
  const tableData = po.items.map((item, index) => [
    index + 1, item.partNumber, htmlToText(item.description), item.qty,
    fmtMoney(poCurrency, Number(item.unitPrice)), fmtMoney(poCurrency, Number(item.amount)),
  ]);

  autoTableRich(doc, {
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
  }, 2, poRichDesc);

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
    doc.text(`Page ${p} of ${totalPages}`, marginRight, footerY, { align: "right" });
  }

  if (options?.returnBase64) return doc.output("datauristring").split(",")[1];
  doc.save(`${po.poNumber}.pdf`);
}

// ── QUOTATION PDF ─────────────────────────────────────────────────────────────

export async function generateQuotation_PDF(qt: Quotation, company?: Company | null, options?: { returnBase64?: boolean }): Promise<string | void> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginLeft = 14;
  const marginRight = pageWidth - 14;
  const info = companyToInfo(company);

  const logoBase64 = await getBase64ImageFromUrl(getLogoUrl(company));
  buildDocHeader(doc, logoBase64, "QUOTATION", qt.qtNumber, new Date(qt.createdAt).toLocaleDateString(), qt.status, info);

  doc.setFontSize(10); doc.setFont("helvetica", "bold"); doc.setTextColor(0, 0, 0);
  doc.text("Quote To:", marginLeft, 67);

  doc.setFontSize(9.5); doc.setFont("helvetica", "normal"); doc.setTextColor(60, 60, 60);
  const customerText = [qt.customerName, qt.customerAddress || "", qt.customerContact || ""].filter(Boolean).join("\n");
  doc.text(doc.splitTextToSize(customerText, 160), marginLeft, 74);

  doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(0, 0, 0);
  doc.text("Payment Terms:", marginLeft, 100);
  doc.setFont("helvetica", "normal"); doc.setTextColor(60, 60, 60);
  doc.text(qt.paymentTerms || "Standard", marginLeft + 33, 100);

  const qtCurrency = (qt as any).currency || "SGD";
  const qtDocDiscount = Number((qt as any).discountAmount) || 0;
  const hasItemDiscount = (qt.items as any[]).some(item => Number(item.discount) > 0);
  const qtHeaders = hasItemDiscount
    ? ["#", "Item / Part Number", "Description", "Qty", "Unit Price", "Disc %", "Amount"]
    : ["#", "Item / Part Number", "Description", "Qty", "Unit Price", "Amount"];
  const qtRichDesc = (qt.items as any[]).map((item: any) => htmlToRichLines(item.description));
  const tableData = (qt.items as any[]).map((item, i) => {
    const disc = Number(item.discount) || 0;
    const row = [i + 1, item.partNumber || "", htmlToText(item.description), item.qty, fmtMoney(qtCurrency, Number(item.unitPrice))];
    if (hasItemDiscount) row.push(disc > 0 ? `${disc}%` : "");
    row.push(fmtMoney(qtCurrency, Number(item.amount)));
    return row;
  });

  autoTableRich(doc, {
    startY: 107,
    head: [qtHeaders],
    body: tableData,
    theme: "striped",
    headStyles: { fillColor: [24, 33, 47], textColor: 255, fontStyle: "bold", fontSize: 9.5 },
    bodyStyles: { fontSize: 9.5 },
    styles: { cellPadding: 4 },
    columnStyles: hasItemDiscount ? {
      0: { cellWidth: 10, halign: "center" }, 1: { cellWidth: 28 },
      2: { cellWidth: "auto" }, 3: { cellWidth: 14, halign: "center" },
      4: { cellWidth: 25, halign: "right" }, 5: { cellWidth: 16, halign: "right" }, 6: { cellWidth: 25, halign: "right" },
    } : {
      0: { cellWidth: 10, halign: "center" }, 1: { cellWidth: 32 },
      2: { cellWidth: "auto" }, 3: { cellWidth: 16, halign: "center" },
      4: { cellWidth: 27, halign: "right" }, 5: { cellWidth: 27, halign: "right" },
    },
    margin: { left: marginLeft, right: 14 },
  }, 2, qtRichDesc);

  if (qt.notes) {
    const notesY = (doc as any).lastAutoTable.finalY + 8;
    doc.setFontSize(9.5); doc.setFont("helvetica", "bold"); doc.setTextColor(0, 0, 0);
    doc.text("Notes:", marginLeft, notesY);
    doc.setFont("helvetica", "normal"); doc.setTextColor(80, 80, 80);
    doc.text(doc.splitTextToSize(qt.notes, 120), marginLeft, notesY + 6);
  }

  // ── Terms & Conditions (left side, bottom) ──────────────────────────────────
  const tcStartY = pageHeight - 67;
  const tcLines = [
    "All prices are in Singapore Dollars.",
    "Validity: 30 days from quotation date.",
    "Payment: 100% against order confirmation.",
    "Hardware Delivery (if any): 2 to 4 weeks from the date of confirmation.",
    "Cancellation Clause: 20% chargeable on selling price if cancelled after confirmation.",
    "Job scope not defined above will be considered as a separate job scope/project.",
  ];
  doc.setFontSize(8.5); doc.setFont("helvetica", "bold"); doc.setTextColor(0, 0, 0);
  doc.text("Terms & Conditions:", marginLeft, tcStartY);
  doc.setFont("helvetica", "normal"); doc.setTextColor(60, 60, 60);
  tcLines.forEach((line, i) => {
    doc.text(doc.splitTextToSize(`• ${line}`, 125), marginLeft, tcStartY + 5.5 + i * 5);
  });

  // ── Totals (right side, bottom) ─────────────────────────────────────────────
  const labelX = 146;
  const valueX = marginRight - 4;
  const extraRows = qtDocDiscount > 0 ? 1 : 0;
  const boxH = (3 + extraRows) * 7 + 10;
  const totalsY = pageHeight - 12 - boxH;

  doc.setFillColor(244, 246, 250);
  doc.roundedRect(labelX - 5, totalsY - 6, marginRight - labelX + 9, boxH, 2, 2, "F");

  let ty = totalsY;
  doc.setFontSize(9.5); doc.setTextColor(60, 60, 60); doc.setFont("helvetica", "normal");
  doc.text("Subtotal:", labelX, ty);
  doc.text(fmtMoney(qtCurrency, Number(qt.subtotal)), valueX, ty, { align: "right" });
  ty += 7;
  if (qtDocDiscount > 0) {
    doc.setTextColor(180, 0, 0);
    doc.text("Discount:", labelX, ty);
    doc.text(`-${fmtMoney(qtCurrency, qtDocDiscount)}`, valueX, ty, { align: "right" });
    doc.setTextColor(60, 60, 60);
    ty += 7;
  }
  doc.text("GST:", labelX, ty);
  doc.text(fmtMoney(qtCurrency, Number(qt.tax)), valueX, ty, { align: "right" });
  ty += 3;
  doc.setDrawColor(180, 180, 180); doc.setLineWidth(0.3);
  doc.line(labelX, ty, marginRight, ty);
  ty += 7;
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(24, 33, 47);
  doc.text("Total Amount:", labelX, ty);
  doc.text(fmtMoney(qtCurrency, Number(qt.totalAmount)), valueX, ty, { align: "right" });

  buildDocFooter(doc, "Quotation");
  if (options?.returnBase64) return doc.output("datauristring").split(",")[1];
  doc.save(`${qt.qtNumber}.pdf`);
}

// ── INVOICE PDF ───────────────────────────────────────────────────────────────

export async function generateInvoice_PDF(inv: Invoice, company?: Company | null, options?: { returnBase64?: boolean }): Promise<string | void> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginLeft = 14;
  const marginRight = pageWidth - 14;
  const info = companyToInfo(company);

  const logoBase64 = await getBase64ImageFromUrl(getLogoUrl(company));
  buildDocHeader(doc, logoBase64, "TAX INVOICE", inv.invNumber, new Date(inv.createdAt).toLocaleDateString(), inv.status, info);

  doc.setFontSize(10); doc.setFont("helvetica", "bold"); doc.setTextColor(0, 0, 0);
  doc.text("Bill To:", marginLeft, 67);

  doc.setFontSize(9.5); doc.setFont("helvetica", "normal"); doc.setTextColor(60, 60, 60);
  const customerText = [inv.customerName, inv.customerAddress || "", inv.customerContact || ""].filter(Boolean).join("\n");
  doc.text(doc.splitTextToSize(customerText, 160), marginLeft, 74);

  doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(0, 0, 0);
  doc.text("Payment Terms:", marginLeft, 100);
  doc.setFont("helvetica", "normal"); doc.setTextColor(60, 60, 60);
  doc.text(inv.paymentTerms || "Standard", marginLeft + 33, 100);

  const invCurrency = (inv as any).currency || "SGD";
  const invDocDiscount = Number((inv as any).discountAmount) || 0;
  const hasInvItemDiscount = (inv.items as any[]).some(item => Number(item.discount) > 0);
  const invHeaders = hasInvItemDiscount
    ? ["#", "Item / Part Number", "Description", "Qty", "Unit Price", "Disc %", "Amount"]
    : ["#", "Item / Part Number", "Description", "Qty", "Unit Price", "Amount"];
  const invRichDesc = (inv.items as any[]).map((item: any) => htmlToRichLines(item.description));
  const tableData = (inv.items as any[]).map((item, i) => {
    const disc = Number(item.discount) || 0;
    const row = [i + 1, item.partNumber || "", htmlToText(item.description), item.qty, fmtMoney(invCurrency, Number(item.unitPrice))];
    if (hasInvItemDiscount) row.push(disc > 0 ? `${disc}%` : "");
    row.push(fmtMoney(invCurrency, Number(item.amount)));
    return row;
  });

  autoTableRich(doc, {
    startY: 107,
    head: [invHeaders],
    body: tableData,
    theme: "striped",
    headStyles: { fillColor: [24, 33, 47], textColor: 255, fontStyle: "bold", fontSize: 9.5 },
    bodyStyles: { fontSize: 9.5 },
    styles: { cellPadding: 4 },
    columnStyles: hasInvItemDiscount ? {
      0: { cellWidth: 10, halign: "center" }, 1: { cellWidth: 28 },
      2: { cellWidth: "auto" }, 3: { cellWidth: 14, halign: "center" },
      4: { cellWidth: 25, halign: "right" }, 5: { cellWidth: 16, halign: "right" }, 6: { cellWidth: 25, halign: "right" },
    } : {
      0: { cellWidth: 10, halign: "center" }, 1: { cellWidth: 32 },
      2: { cellWidth: "auto" }, 3: { cellWidth: 16, halign: "center" },
      4: { cellWidth: 27, halign: "right" }, 5: { cellWidth: 27, halign: "right" },
    },
    margin: { left: marginLeft, right: 14 },
  }, 2, invRichDesc);

  if (inv.notes) {
    const notesY = (doc as any).lastAutoTable.finalY + 8;
    doc.setFontSize(9.5); doc.setFont("helvetica", "bold"); doc.setTextColor(0, 0, 0);
    doc.text("Notes:", marginLeft, notesY);
    doc.setFont("helvetica", "normal"); doc.setTextColor(80, 80, 80);
    doc.text(doc.splitTextToSize(inv.notes, 120), marginLeft, notesY + 6);
  }

  // ── Bank Details + Terms & Conditions (left side, bottom) ───────────────────
  const isRSV = !company || company.id === 1;
  const bdStartY = pageHeight - 75;
  let bdY = bdStartY;

  if (isRSV) {
    doc.setFontSize(8.5); doc.setFont("helvetica", "bold"); doc.setTextColor(0, 0, 0);
    doc.text("Bank Details:", marginLeft, bdY); bdY += 5;
    doc.setFont("helvetica", "normal"); doc.setTextColor(60, 60, 60);
    doc.text("Please Paynow (or) Internet Banking funds transfer to:", marginLeft, bdY); bdY += 4.5;
    doc.text("UOB Bank  |  SGD A/c No: 395-302-839-3  |  Company: RSV InfoTech Pte Ltd", marginLeft, bdY); bdY += 4.5;
    doc.text("Bank Code: 7375  |  Branch Code: 447  |  Swift Code: UOVBSGSG", marginLeft, bdY); bdY += 7;
  }

  doc.setFont("helvetica", "bold"); doc.setTextColor(0, 0, 0);
  doc.text("Terms & Conditions:", marginLeft, bdY); bdY += 5;
  doc.setFont("helvetica", "normal"); doc.setTextColor(60, 60, 60);

  const tcLines = isRSV
    ? [
        "All prices are in Singapore Dollars (SGD).",
        "All cheques should be crossed and made payable to RSV InfoTech Pte Ltd.",
        "Customer must check the goods at the time of delivery; No complaints entertained thereafter.",
        "Goods once sold are not Returnable / Exchangeable.",
      ]
    : [
        "All prices are as per the currency stated on this invoice.",
        "Payment is due as per the payment terms stated above.",
        "Goods once sold are not Returnable / Exchangeable.",
      ];

  tcLines.forEach((line) => {
    const wrapped = doc.splitTextToSize(`• ${line}`, 125);
    doc.text(wrapped, marginLeft, bdY);
    bdY += wrapped.length * 4.5;
  });

  // ── Totals (right side, bottom) ─────────────────────────────────────────────
  const labelX = 146;
  const valueX = marginRight - 4;
  const invExtraRows = invDocDiscount > 0 ? 1 : 0;
  const invBoxH = (3 + invExtraRows) * 7 + 10;
  const totalsY = pageHeight - 12 - invBoxH;

  doc.setFillColor(244, 246, 250);
  doc.roundedRect(labelX - 5, totalsY - 6, marginRight - labelX + 9, invBoxH, 2, 2, "F");

  let ity = totalsY;
  doc.setFontSize(9.5); doc.setTextColor(60, 60, 60); doc.setFont("helvetica", "normal");
  doc.text("Subtotal:", labelX, ity);
  doc.text(fmtMoney(invCurrency, Number(inv.subtotal)), valueX, ity, { align: "right" });
  ity += 7;
  if (invDocDiscount > 0) {
    doc.setTextColor(180, 0, 0);
    doc.text("Discount:", labelX, ity);
    doc.text(`-${fmtMoney(invCurrency, invDocDiscount)}`, valueX, ity, { align: "right" });
    doc.setTextColor(60, 60, 60);
    ity += 7;
  }
  doc.text("GST:", labelX, ity);
  doc.text(fmtMoney(invCurrency, Number(inv.tax)), valueX, ity, { align: "right" });
  ity += 3;
  doc.setDrawColor(180, 180, 180); doc.setLineWidth(0.3);
  doc.line(labelX, ity, marginRight, ity);
  ity += 7;
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(24, 33, 47);
  doc.text("Total Amount:", labelX, ity);
  doc.text(fmtMoney(invCurrency, Number(inv.totalAmount)), valueX, ity, { align: "right" });

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

  const logoBase64 = await getBase64ImageFromUrl(getLogoUrl(company));
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

  const doRichDesc = (doDoc.items as any[]).map((item: any) => htmlToRichLines(item.description));
  const tableData = (doDoc.items as any[]).map((item, i) => [i + 1, htmlToText(item.description), item.qty]);

  autoTableRich(doc, {
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
  }, 1, doRichDesc);

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
