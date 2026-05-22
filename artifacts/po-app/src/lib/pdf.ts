import { jsPDF } from "jspdf";
import "jspdf-autotable";
import type { PurchaseOrder, Quotation, Invoice, DeliveryOrder, Company } from "@workspace/api-client-react";
import logoRsvUrl from "@assets/logo_1776054030755.png";
import logoNetopsysUrl from "@assets/Netopsys_logo_Dark_1776066608427.png";
import { fmtDate } from "./utils";

// ── Unicode font (Roboto) — supports ₹, €, £ and all PDF currency symbols ───
let PDF_FONT = "helvetica";
type FontCache = { regular: string; bold: string; italic: string; bolditalic: string };
let _fontCache: FontCache | null = null;
let _fontPromise: Promise<void> | null = null;

function _bufToB64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  const CHUNK = 32768;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += CHUNK) {
    // Use apply to avoid spread-operator stack limits on large TypedArrays
    parts.push(String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK) as unknown as number[]));
  }
  return btoa(parts.join(""));
}

function _loadFonts(): Promise<void> {
  const base = `${import.meta.env.BASE_URL}fonts/`;
  const load = (name: string) =>
    fetch(`${base}${name}`).then(r => {
      if (!r.ok) throw new Error(`Font ${name} not found (${r.status})`);
      return r.arrayBuffer();
    });
  return Promise.all([
    load("Roboto-Regular.ttf"),
    load("Roboto-Bold.ttf"),
    load("Roboto-Italic.ttf"),
    load("Roboto-BoldItalic.ttf"),
  ]).then(([reg, bold, ital, boldItal]) => {
    _fontCache = {
      regular: _bufToB64(reg),
      bold: _bufToB64(bold),
      italic: _bufToB64(ital),
      bolditalic: _bufToB64(boldItal),
    };
    // PDF_FONT is set only after successful addFont in attachPdfFonts
  }).catch((e) => { console.warn("Roboto fonts failed to load, using Helvetica:", e); });
}

function ensurePdfFonts(): Promise<void> {
  if (!_fontPromise) _fontPromise = _loadFonts();
  return _fontPromise;
}

function attachPdfFonts(doc: jsPDF): void {
  if (!_fontCache) return;
  try {
    doc.addFileToVFS("Roboto-Regular.ttf", _fontCache.regular);
    doc.addFont("Roboto-Regular.ttf", "Roboto", "normal");
    doc.addFileToVFS("Roboto-Bold.ttf", _fontCache.bold);
    doc.addFont("Roboto-Bold.ttf", "Roboto", "bold");
    doc.addFileToVFS("Roboto-Italic.ttf", _fontCache.italic);
    doc.addFont("Roboto-Italic.ttf", "Roboto", "italic");
    doc.addFileToVFS("Roboto-BoldItalic.ttf", _fontCache.bolditalic);
    doc.addFont("Roboto-BoldItalic.ttf", "Roboto", "bolditalic");
    PDF_FONT = "Roboto"; // Only mark as active after every variant is registered
  } catch (e) {
    console.warn("Roboto font registration failed, falling back to Helvetica:", e);
    PDF_FONT = "helvetica"; // Ensure fallback is used for this generation
    _fontCache = null;     // Clear cache so next attempt re-downloads
    _fontPromise = null;
  }
}
// ─────────────────────────────────────────────────────────────────────────────

function getLogoUrl(company: Company | null | undefined): string {
  if (!company || company.id === 1) return logoRsvUrl;
  return logoNetopsysUrl;
}

function htmlToText(html: string): string {
  if (!html) return "";
  return html
    .replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_m, inner) => {
      let n = 0;
      return inner.replace(/<li[^>]*>/gi, () => `<li data-n="${++n}">`);
    })
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li data-n="(\d+)">/gi, (_, n) => `${n}. `)
    .replace(/<li[^>]*>/gi, "• ")
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
  const preprocessed = html.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_m, inner) => {
    let n = 0;
    return inner.replace(/<li[^>]*>/gi, () => `<li data-n="${++n}">`);
  });
  const rawLines = preprocessed
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li data-n="(\d+)">/gi, (_, n) => `${n}. `)
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
  const { headStyles: hs, bodyStyles: bs, ...restOpts } = opts;
  (doc as any).autoTable({
    styles: { font: PDF_FONT },
    ...restOpts,
    headStyles: { font: PDF_FONT, ...(hs ?? {}) },
    bodyStyles: { font: PDF_FONT, ...(bs ?? {}) },
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
        jdoc.setFont(PDF_FONT, style);
        jdoc.setTextColor(60, 60, 60);
        const wrapped = jdoc.splitTextToSize(text, maxW);
        jdoc.text(wrapped, x, ty);
        ty += wrapped.length * 4.5;
      }
    },
  });
}

interface LogoData { dataUrl: string; natW: number; natH: number; }

async function getLogoData(imageUrl: string): Promise<LogoData> {
  const res = await fetch(imageUrl);
  const blob = await res.blob();
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
  const { natW, natH } = await new Promise<{ natW: number; natH: number }>((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ natW: img.naturalWidth, natH: img.naturalHeight });
    img.onerror = () => resolve({ natW: 260, natH: 56 });
    img.src = dataUrl;
  });
  return { dataUrl, natW, natH };
}

function fitInBox(natW: number, natH: number, maxW: number, maxH: number): { w: number; h: number } {
  const scale = Math.min(maxW / natW, maxH / natH);
  return { w: natW * scale, h: natH * scale };
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
      addressLine1: "#07-52, 10 UBI Crescent, UBI Techpark Lobby C,",
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

function renderEntityBlock(
  doc: jsPDF,
  name: string,
  rest: (string | null | undefined)[],
  x: number,
  startY: number,
  maxWidth: number
): void {
  doc.setFontSize(9.5);
  doc.setFont(PDF_FONT, "bold");
  doc.setTextColor(60, 60, 60);
  doc.text(name, x, startY);
  const restText = rest.filter(Boolean).join("\n");
  if (restText) {
    doc.setFont(PDF_FONT, "normal");
    doc.text(doc.splitTextToSize(restText, maxWidth), x, startY + 5);
  }
}

function fmtMoney(currency: string, amount: number): string {
  const SYMBOLS: Record<string, string> = {
    SGD: "S$", USD: "$", EUR: "\u20AC", GBP: "\u00A3", MYR: "RM ",
    INR: PDF_FONT === "Roboto" ? "\u20B9" : "Rs.",
  };
  const symbol = SYMBOLS[currency] ?? (currency + " ");
  const num = new Intl.NumberFormat("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
  return symbol + num;
}

function fmtMoneyTotal(currency: string, amount: number): string {
  return currency + " " + fmtMoney(currency, amount);
}

function formatDate(d: string | null | undefined): string {
  return fmtDate(d);
}

function buildDocHeader(
  doc: jsPDF,
  logo: LogoData,
  title: string,
  docNumber: string,
  date: string,
  _status: string,
  info: CompanyInfo
) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginLeft = 14;
  const marginRight = pageWidth - 14;

  const { w: lw, h: lh } = fitInBox(logo.natW, logo.natH, 65, 18);
  doc.addImage(logo.dataUrl, "PNG", marginLeft, 12, lw, lh);

  doc.setFontSize(26);
  doc.setFont(PDF_FONT, "bold");
  doc.setTextColor(24, 33, 47);
  doc.text(title, marginRight, 22, { align: "right" });

  doc.setFontSize(9.5);
  doc.setFont(PDF_FONT, "normal");
  doc.setTextColor(80, 80, 80);
  doc.text(`Number: ${docNumber}`, marginRight, 30, { align: "right" });
  doc.text(`Date: ${date}`, marginRight, 36, { align: "right" });

  doc.setFontSize(11);
  doc.setFont(PDF_FONT, "bold");
  doc.setTextColor(0, 0, 0);
  doc.text(info.name, marginLeft, 40);

  doc.setFontSize(9.5);
  doc.setFont(PDF_FONT, "normal");
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

const FOOTER_RESERVE = 14; // mm from page bottom reserved for the footer bar

function buildDocFooter(doc: jsPDF, docType: string) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginLeft = 14;
  const marginRight = pageWidth - 14;
  const pageHeight = doc.internal.pageSize.getHeight();
  const totalPages = (doc as any).internal.pages.length - 1;
  const sepY = pageHeight - FOOTER_RESERVE + 2;
  const textY = pageHeight - 5;
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setDrawColor(210, 210, 210); doc.setLineWidth(0.2);
    doc.line(marginLeft, sepY, marginRight, sepY);
    doc.setFontSize(6.5);
    doc.setFont(PDF_FONT, "italic");
    doc.setTextColor(175, 175, 175);
    doc.text(
      `This is a computer-generated ${docType} document and does not require a physical signature.`,
      pageWidth / 2,
      textY,
      { align: "center" }
    );
    doc.text(`Page ${p} of ${totalPages}`, marginRight, textY, { align: "right" });
  }
}

function buildDoFooter(doc: jsPDF) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginLeft = 14;
  const marginRight = pageWidth - 14;
  const pageHeight = doc.internal.pageSize.getHeight();
  const totalPages = (doc as any).internal.pages.length - 1;
  const footerY = pageHeight - 10;

  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);

    if (p === totalPages) {
      const sigY = pageHeight - 62;

      doc.setDrawColor(120, 120, 120);
      doc.setLineWidth(0.3);
      doc.line(marginLeft, sigY, marginLeft + 130, sigY);

      doc.setFontSize(9);
      doc.setFont(PDF_FONT, "italic");
      doc.setTextColor(60, 60, 60);
      doc.text("Customer Authorised Signature(s) & Company official stamp/NRIC", marginLeft, sigY + 5);

      doc.setFontSize(9);
      doc.setFont(PDF_FONT, "normal");
      doc.setTextColor(60, 60, 60);
      const ackLines = doc.splitTextToSize(
        "Received above goods in good order & condition. No further claim for damage, shortage or errors will be entertained after acceptance of goods.",
        pageWidth - marginLeft * 2
      );
      doc.text(ackLines, marginLeft, sigY + 20);
    }

    doc.setFontSize(8);
    doc.setFont(PDF_FONT, "normal");
    doc.setTextColor(100, 100, 100);
    doc.text("Confidential", pageWidth / 2, footerY, { align: "center" });
    doc.text(`Page ${p} of ${totalPages}`, marginRight, footerY, { align: "right" });
  }
}

// ── PURCHASE ORDER PDF ────────────────────────────────────────────────────────

export async function generatePO_PDF(po: PurchaseOrder, company?: Company | null, options?: { returnBase64?: boolean }): Promise<string | void> {
  await ensurePdfFonts();
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  attachPdfFonts(doc);
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginLeft = 14;
  const marginRight = pageWidth - 14;
  const col2 = 108;
  const info = companyToInfo(company);

  const logo = await getLogoData(getLogoUrl(company));
  const { w: lw, h: lh } = fitInBox(logo.natW, logo.natH, 65, 18);
  doc.addImage(logo.dataUrl, "PNG", marginLeft, 12, lw, lh);

  doc.setFontSize(26);
  doc.setFont(PDF_FONT, "bold");
  doc.setTextColor(24, 33, 47);
  doc.text("PURCHASE ORDER", marginRight, 22, { align: "right" });

  doc.setFontSize(9.5);
  doc.setFont(PDF_FONT, "normal");
  doc.setTextColor(80, 80, 80);
  doc.text(`PO Number: ${po.poNumber}`, marginRight, 30, { align: "right" });
  doc.text(`Date: ${fmtDate(po.issueDate || po.createdAt)}`, marginRight, 36, { align: "right" });

  doc.setFontSize(11);
  doc.setFont(PDF_FONT, "bold");
  doc.setTextColor(0, 0, 0);
  doc.text(info.name, marginLeft, 40);

  doc.setFontSize(9.5);
  doc.setFont(PDF_FONT, "normal");
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
  doc.setFont(PDF_FONT, "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("Vendor:", marginLeft, 67);
  doc.text("Delivery To:", col2, 67);

  renderEntityBlock(doc, po.vendorName, [po.vendorAddress, po.vendorContact ? `\nAttn: ${po.vendorContact}` : null], marginLeft, 74, 85);

  doc.setFontSize(9.5);
  doc.setFont(PDF_FONT, "normal");
  doc.setTextColor(60, 60, 60);
  doc.text(doc.splitTextToSize(po.deliveryAddress || `${info.name} Office`, 82), col2, 74);

  const formatDeliveryDate = (d: string | null | undefined): string => fmtDate(d);

  if ((po as any).quoteRefNo) {
    doc.setFont(PDF_FONT, "bold"); doc.setFontSize(9.5); doc.setTextColor(0, 0, 0);
    doc.text("Sales Ref No.:", col2, 96);
    doc.setFont(PDF_FONT, "normal"); doc.setTextColor(60, 60, 60);
    doc.text((po as any).quoteRefNo, col2 + 30, 96);
  }

  doc.setFont(PDF_FONT, "bold"); doc.setFontSize(9.5); doc.setTextColor(0, 0, 0);
  doc.text("Delivery Date:", marginLeft, 105);
  doc.text("Payment Terms:", col2, 105);
  doc.setFont(PDF_FONT, "normal"); doc.setTextColor(60, 60, 60);
  doc.text(formatDeliveryDate(po.deliveryDate), marginLeft + 32, 105);
  doc.text(po.paymentTerms || "Standard", col2 + 33, 105);

  const poCurrency = (po as any).currency || "SGD";
  const poRichDesc = po.items.map((item: any) => htmlToRichLines(item.description));
  const tableData = po.items.map((item, index) => [
    index + 1, item.partNumber, htmlToText(item.description), item.qty,
    fmtMoney(poCurrency, Number(item.unitPrice)), fmtMoney(poCurrency, Number(item.amount)),
  ]);

  const pageHeight = doc.internal.pageSize.getHeight();
  const footerReserve = 20; // space kept clear at page bottom for footer text
  const totalsBlockH = 28; // subtotal + tax + rule + total ≈ 28 mm
  const notesLineH = 5;

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
    margin: { left: marginLeft, right: 14, bottom: footerReserve + totalsBlockH + 10 },
  }, 2, poRichDesc);

  let currentY = (doc as any).lastAutoTable.finalY + 8;

  // Notes — check if they fit on this page; if not, new page
  if (po.notes) {
    const noteLines = doc.splitTextToSize(po.notes, 120);
    const notesH = 8 + noteLines.length * notesLineH;
    if (currentY + notesH + totalsBlockH + footerReserve > pageHeight) {
      doc.addPage();
      currentY = 20;
    }
    doc.setFontSize(9.5); doc.setFont(PDF_FONT, "bold"); doc.setTextColor(0, 0, 0);
    doc.text("Notes:", marginLeft, currentY);
    doc.setFont(PDF_FONT, "normal"); doc.setTextColor(80, 80, 80);
    doc.text(noteLines, marginLeft, currentY + 6);
    currentY += notesH + 4;
  }

  // Totals — if they don't fit on this page, push to a new page
  if (currentY + totalsBlockH + footerReserve > pageHeight) {
    doc.addPage();
    currentY = 20;
  }

  const labelX = 146;
  const valueX = marginRight - 4;
  const totalsY = currentY;

  doc.setFontSize(9.5); doc.setTextColor(0, 0, 0); doc.setFont(PDF_FONT, "normal");
  doc.text("Subtotal:", labelX, totalsY);
  doc.text(fmtMoneyTotal(poCurrency, Number(po.subtotal)), valueX, totalsY, { align: "right" });
  const taxAmount = Number(po.totalAmount) - Number(po.subtotal);
  doc.text("Tax:", labelX, totalsY + 7);
  doc.text(fmtMoneyTotal(poCurrency, taxAmount), valueX, totalsY + 7, { align: "right" });
  doc.setDrawColor(180, 180, 180); doc.setLineWidth(0.3);
  doc.line(labelX, totalsY + 10, marginRight, totalsY + 10);
  doc.setFont(PDF_FONT, "bold"); doc.setFontSize(9.5); doc.setTextColor(24, 33, 47);
  doc.text("Total Amount:", labelX, totalsY + 17);
  doc.text(fmtMoneyTotal(poCurrency, Number(po.totalAmount)), valueX, totalsY + 17, { align: "right" });

  const totalPages = (doc as any).internal.pages.length - 1;
  const footerY = pageHeight - 12;
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFontSize(7.5); doc.setFont(PDF_FONT, "italic"); doc.setTextColor(160, 160, 160);
    doc.text("This is a computer-generated Purchase Order document and does not require a physical signature.", pageWidth / 2, footerY, { align: "center" });
    doc.text(`Page ${p} of ${totalPages}`, marginRight, footerY, { align: "right" });
  }

  if (options?.returnBase64) return doc.output("datauristring").split(",")[1];
  doc.save(`${po.poNumber}.pdf`);
}

function calcBlockHeight(
  doc: jsPDF,
  settings: { bankDetails?: string; termsAndConditions?: string } | null | undefined,
  maxW: number
): number {
  const bank = (settings?.bankDetails || "").trim();
  const tnc = (settings?.termsAndConditions || "").trim();
  if (!bank && !tnc) return 0;
  const lineH = 3.8;
  let h = 0;
  if (bank) {
    h += 4; // "Bank Details:" header
    bank.split("\n").filter(l => l.trim()).forEach(l => {
      h += doc.splitTextToSize(l.trim(), maxW).length * lineH;
    });
    h += 5; // box padding top + bottom
    if (tnc) h += 4; // gap between bank box and T&C
  }
  if (tnc) {
    h += 4; // "Terms & Conditions:" header
    tnc.split("\n").filter(l => l.trim()).forEach(l => {
      h += doc.splitTextToSize(`\u2022 ${l.trim()}`, maxW).length * lineH;
    });
  }
  return h + 2; // bottom margin
}

function renderBottomDocInfo(
  doc: jsPDF,
  settings: { bankDetails?: string; termsAndConditions?: string } | null | undefined,
  x: number,
  pageHeight: number,
  maxW: number
): void {
  const bank = (settings?.bankDetails || "").trim();
  const tnc = (settings?.termsAndConditions || "").trim();
  if (!bank && !tnc) return;

  const lineH = 3.8;
  const footerSepY = pageHeight - FOOTER_RESERVE + 1;
  const blockH = calcBlockHeight(doc, settings, maxW);
  let y = footerSepY - blockH;

  doc.setFontSize(7.5);

  if (bank) {
    const bankContentLines: string[] = [];
    bank.split("\n").filter(l => l.trim()).forEach(l => {
      doc.splitTextToSize(l.trim(), maxW).forEach((row: string) => bankContentLines.push(row));
    });
    const bankTextH = bankContentLines.length * lineH;
    const boxPad = 2.5;
    const boxH = 4 + bankTextH + boxPad * 2 + 1;

    doc.setFillColor(245, 246, 248);
    doc.roundedRect(x - 2, y - boxPad, maxW + 4, boxH, 1.5, 1.5, "F");

    doc.setFont(PDF_FONT, "bold"); doc.setTextColor(80, 80, 80);
    doc.text("Bank Details:", x, y); y += 4;
    doc.setFont(PDF_FONT, "normal"); doc.setTextColor(110, 110, 110);
    bankContentLines.forEach(row => {
      doc.text(row, x, y);
      y += lineH;
    });
    y += boxPad + 1;
    if (tnc) y += 4;
  }

  if (tnc) {
    doc.setFont(PDF_FONT, "bold"); doc.setTextColor(80, 80, 80);
    doc.text("Terms & Conditions:", x, y); y += 4;
    doc.setFont(PDF_FONT, "normal"); doc.setTextColor(110, 110, 110);
    tnc.split("\n").filter(l => l.trim()).forEach(line => {
      const wrapped = doc.splitTextToSize(`\u2022 ${line.trim()}`, maxW);
      doc.text(wrapped, x, y);
      y += wrapped.length * lineH;
    });
  }
}

// ── QUOTATION PDF ─────────────────────────────────────────────────────────────

export async function generateQuotation_PDF(qt: Quotation, company?: Company | null, settings?: { bankDetails?: string; termsAndConditions?: string } | null, options?: { returnBase64?: boolean }): Promise<string | void> {
  await ensurePdfFonts();
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  attachPdfFonts(doc);
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginLeft = 14;
  const marginRight = pageWidth - 14;
  const info = companyToInfo(company);

  const logo = await getLogoData(getLogoUrl(company));
  buildDocHeader(doc, logo, "QUOTATION", qt.qtNumber, fmtDate(qt.issueDate || qt.createdAt), qt.status, info);

  doc.setFontSize(10); doc.setFont(PDF_FONT, "bold"); doc.setTextColor(0, 0, 0);
  doc.text("Quote To:", marginLeft, 67);

  renderEntityBlock(doc, qt.customerName, [qt.customerAddress, qt.customerContact ? `\nAttn: ${qt.customerContact}` : null], marginLeft, 74, 160);

  doc.setFont(PDF_FONT, "bold"); doc.setFontSize(9.5); doc.setTextColor(0, 0, 0);
  doc.text("Payment Terms:", marginLeft, 100);
  doc.setFont(PDF_FONT, "normal"); doc.setTextColor(60, 60, 60);
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

  const qtFooterReserve = 20;
  const qtExtraRows = qtDocDiscount > 0 ? 1 : 0;
  const qtBoxH = (3 + qtExtraRows) * 7 + 16;

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
    margin: { left: marginLeft, right: 14, bottom: qtFooterReserve + qtBoxH + 10 },
  }, 2, qtRichDesc);

  let qtCurrentY = (doc as any).lastAutoTable.finalY + 8;

  if (qt.notes) {
    const noteLines = doc.splitTextToSize(qt.notes, 120);
    const notesH = 8 + noteLines.length * 5;
    if (qtCurrentY + notesH + qtBoxH + qtFooterReserve > pageHeight) { doc.addPage(); qtCurrentY = 20; }
    doc.setFontSize(9.5); doc.setFont(PDF_FONT, "bold"); doc.setTextColor(0, 0, 0);
    doc.text("Notes:", marginLeft, qtCurrentY);
    doc.setFont(PDF_FONT, "normal"); doc.setTextColor(80, 80, 80);
    doc.text(noteLines, marginLeft, qtCurrentY + 6);
    qtCurrentY += notesH + 4;
  }

  if (qtCurrentY + qtBoxH + qtFooterReserve > pageHeight) { doc.addPage(); qtCurrentY = 20; }

  // ── Totals ───────────────────────────────────────────────────────────────────
  const labelX = 146;
  const valueX = marginRight - 4;
  const totalsY = qtCurrentY;

  doc.setFillColor(244, 246, 250);
  doc.roundedRect(labelX - 5, totalsY - 6, marginRight - labelX + 9, qtBoxH, 2, 2, "F");

  let ty = totalsY;
  doc.setFontSize(9.5); doc.setTextColor(60, 60, 60); doc.setFont(PDF_FONT, "normal");
  doc.text("Subtotal:", labelX, ty);
  doc.text(fmtMoneyTotal(qtCurrency, Number(qt.subtotal)), valueX, ty, { align: "right" });
  ty += 7;
  if (qtDocDiscount > 0) {
    doc.setTextColor(180, 0, 0);
    doc.text("Discount:", labelX, ty);
    doc.text(`-${fmtMoneyTotal(qtCurrency, qtDocDiscount)}`, valueX, ty, { align: "right" });
    doc.setTextColor(60, 60, 60);
    ty += 7;
  }
  doc.text("GST:", labelX, ty);
  doc.text(fmtMoneyTotal(qtCurrency, Number(qt.tax)), valueX, ty, { align: "right" });
  ty += 3;
  doc.setDrawColor(180, 180, 180); doc.setLineWidth(0.3);
  doc.line(labelX, ty, marginRight, ty);
  ty += 7;
  doc.setFont(PDF_FONT, "bold"); doc.setFontSize(9.5); doc.setTextColor(24, 33, 47);
  doc.text("Total Amount:", labelX, ty);
  doc.text(fmtMoneyTotal(qtCurrency, Number(qt.totalAmount)), valueX, ty, { align: "right" });

  renderBottomDocInfo(doc, settings, marginLeft, pageHeight, 120);

  buildDocFooter(doc, "Quotation");
  if (options?.returnBase64) return doc.output("datauristring").split(",")[1];
  doc.save(`${qt.qtNumber}.pdf`);
}

// ── INVOICE PDF ───────────────────────────────────────────────────────────────

export async function generateInvoice_PDF(inv: Invoice, company?: Company | null, settings?: { bankDetails?: string; termsAndConditions?: string } | null, options?: { returnBase64?: boolean }): Promise<string | void> {
  await ensurePdfFonts();
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  attachPdfFonts(doc);
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginLeft = 14;
  const marginRight = pageWidth - 14;
  const info = companyToInfo(company);

  const logo = await getLogoData(getLogoUrl(company));
  buildDocHeader(doc, logo, "TAX INVOICE", inv.invNumber, fmtDate(inv.issueDate || inv.createdAt), inv.status, info);

  doc.setFontSize(10); doc.setFont(PDF_FONT, "bold"); doc.setTextColor(0, 0, 0);
  doc.text("Bill To:", marginLeft, 67);

  renderEntityBlock(doc, inv.customerName, [inv.customerAddress, inv.customerContact ? `\nAttn: ${inv.customerContact}` : null], marginLeft, 74, 160);

  doc.setFont(PDF_FONT, "bold"); doc.setFontSize(9.5); doc.setTextColor(0, 0, 0);
  doc.text("Payment Terms:", marginLeft, 100);
  doc.setFont(PDF_FONT, "normal"); doc.setTextColor(60, 60, 60);
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

  const invFooterReserve = 20;
  const invExtraRows = invDocDiscount > 0 ? 1 : 0;
  const invBoxH = (3 + invExtraRows) * 7 + 16;

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
    margin: { left: marginLeft, right: 14, bottom: invFooterReserve + invBoxH + 10 },
  }, 2, invRichDesc);

  let invCurrentY = (doc as any).lastAutoTable.finalY + 8;

  if (inv.notes) {
    const noteLines = doc.splitTextToSize(inv.notes, 120);
    const notesH = 8 + noteLines.length * 5;
    if (invCurrentY + notesH + invBoxH + invFooterReserve > pageHeight) { doc.addPage(); invCurrentY = 20; }
    doc.setFontSize(9.5); doc.setFont(PDF_FONT, "bold"); doc.setTextColor(0, 0, 0);
    doc.text("Notes:", marginLeft, invCurrentY);
    doc.setFont(PDF_FONT, "normal"); doc.setTextColor(80, 80, 80);
    doc.text(noteLines, marginLeft, invCurrentY + 6);
    invCurrentY += notesH + 4;
  }

  if (invCurrentY + invBoxH + invFooterReserve > pageHeight) { doc.addPage(); invCurrentY = 20; }

  // ── Totals ───────────────────────────────────────────────────────────────────
  const labelX = 146;
  const valueX = marginRight - 4;
  const totalsY = invCurrentY;

  doc.setFillColor(244, 246, 250);
  doc.roundedRect(labelX - 5, totalsY - 6, marginRight - labelX + 9, invBoxH, 2, 2, "F");

  let ity = totalsY;
  doc.setFontSize(9.5); doc.setTextColor(60, 60, 60); doc.setFont(PDF_FONT, "normal");
  doc.text("Subtotal:", labelX, ity);
  doc.text(fmtMoneyTotal(invCurrency, Number(inv.subtotal)), valueX, ity, { align: "right" });
  ity += 7;
  if (invDocDiscount > 0) {
    doc.setTextColor(180, 0, 0);
    doc.text("Discount:", labelX, ity);
    doc.text(`-${fmtMoneyTotal(invCurrency, invDocDiscount)}`, valueX, ity, { align: "right" });
    doc.setTextColor(60, 60, 60);
    ity += 7;
  }
  doc.text("GST:", labelX, ity);
  doc.text(fmtMoneyTotal(invCurrency, Number(inv.tax)), valueX, ity, { align: "right" });
  ity += 3;
  doc.setDrawColor(180, 180, 180); doc.setLineWidth(0.3);
  doc.line(labelX, ity, marginRight, ity);
  ity += 7;
  doc.setFont(PDF_FONT, "bold"); doc.setFontSize(9.5); doc.setTextColor(24, 33, 47);
  doc.text("Total Amount:", labelX, ity);
  doc.text(fmtMoneyTotal(invCurrency, Number(inv.totalAmount)), valueX, ity, { align: "right" });

  renderBottomDocInfo(doc, settings, marginLeft, pageHeight, 120);

  buildDocFooter(doc, "Invoice");
  if (options?.returnBase64) return doc.output("datauristring").split(",")[1];
  doc.save(`${inv.invNumber}.pdf`);
}

// ── DELIVERY ORDER PDF ────────────────────────────────────────────────────────

export async function generateDO_PDF(doDoc: DeliveryOrder, company?: Company | null, options?: { returnBase64?: boolean }): Promise<string | void> {
  await ensurePdfFonts();
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  attachPdfFonts(doc);
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginLeft = 14;
  const marginRight = pageWidth - 14;
  const info = companyToInfo(company);

  const logo = await getLogoData(getLogoUrl(company));
  buildDocHeader(doc, logo, "DELIVERY ORDER", doDoc.doNumber, fmtDate(doDoc.issueDate || doDoc.createdAt), doDoc.status, info);

  doc.setFontSize(10); doc.setFont(PDF_FONT, "bold"); doc.setTextColor(0, 0, 0);
  doc.text("Deliver To:", marginLeft, 67);

  renderEntityBlock(doc, doDoc.customerName, [doDoc.customerAddress, doDoc.customerContact ? `Attn: ${doDoc.customerContact}` : null], marginLeft, 74, 85);

  doc.setFont(PDF_FONT, "bold"); doc.setFontSize(9.5); doc.setTextColor(0, 0, 0);
  doc.text("Delivery Date:", marginLeft, 105);
  doc.setFont(PDF_FONT, "normal"); doc.setTextColor(60, 60, 60);
  doc.text(formatDate(doDoc.deliveryDate), marginLeft + 32, 105);

  const hasPartNo = (doDoc.items as any[]).some((item: any) => item.partNumber && String(item.partNumber).trim() !== "");
  const doHeaders = hasPartNo ? ["#", "Item No.", "Description", "Qty"] : ["#", "Description", "Qty"];
  const doDescColIdx = hasPartNo ? 2 : 1;
  const doRichDesc = (doDoc.items as any[]).map((item: any) => htmlToRichLines(item.description));
  const tableData = (doDoc.items as any[]).map((item, i) =>
    hasPartNo
      ? [i + 1, item.partNumber || "", htmlToText(item.description), item.qty]
      : [i + 1, htmlToText(item.description), item.qty]
  );

  autoTableRich(doc, {
    startY: 113,
    head: [doHeaders],
    body: tableData,
    theme: "striped",
    headStyles: { fillColor: [24, 33, 47], textColor: 255, fontStyle: "bold", fontSize: 9.5 },
    bodyStyles: { fontSize: 9.5 },
    styles: { cellPadding: 4 },
    columnStyles: hasPartNo ? {
      0: { cellWidth: 10, halign: "center" },
      1: { cellWidth: 30, halign: "left" },
      2: { cellWidth: "auto" },
      3: { cellWidth: 20, halign: "center" },
    } : {
      0: { cellWidth: 10, halign: "center" },
      1: { cellWidth: "auto" },
      2: { cellWidth: 20, halign: "center" },
    },
    margin: { left: marginLeft, right: 14 },
  }, doDescColIdx, doRichDesc);

  if (doDoc.notes) {
    const notesY = (doc as any).lastAutoTable.finalY + 8;
    doc.setFontSize(9.5); doc.setFont(PDF_FONT, "bold"); doc.setTextColor(0, 0, 0);
    doc.text("Notes:", marginLeft, notesY);
    doc.setFont(PDF_FONT, "normal"); doc.setTextColor(80, 80, 80);
    doc.text(doc.splitTextToSize(doDoc.notes, 120), marginLeft, notesY + 6);
  }

  buildDoFooter(doc);
  if (options?.returnBase64) return doc.output("datauristring").split(",")[1];
  doc.save(`${doDoc.doNumber}.pdf`);
}
