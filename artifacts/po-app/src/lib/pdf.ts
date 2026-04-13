import { jsPDF } from "jspdf";
import "jspdf-autotable";
import type { PurchaseOrder, Quotation, Invoice, DeliveryOrder } from "@workspace/api-client-react";
import logoUrl from "@assets/logo_1776054030755.png";

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

export async function generatePO_PDF(po: PurchaseOrder) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  const pageWidth = doc.internal.pageSize.getWidth(); // 210mm
  const marginLeft = 14;
  const marginRight = pageWidth - 14; // 196mm

  const logoBase64 = await getBase64ImageFromUrl(logoUrl);

  // ── Header ─────────────────────────────────────────────────────────────
  // Logo: RSV Infotech logo is wide — approximately 4.5:1 (width:height)
  const logoW = 65;
  const logoH = 14;
  doc.addImage(logoBase64, "PNG", marginLeft, 12, logoW, logoH);

  // "PURCHASE ORDER" right-aligned to the right margin
  doc.setFontSize(26);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(24, 33, 47);
  doc.text("PURCHASE ORDER", marginRight, 22, { align: "right" });

  // PO meta — right-aligned under the title
  doc.setFontSize(9.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(80, 80, 80);
  doc.text(`PO Number: ${po.poNumber}`, marginRight, 30, { align: "right" });
  doc.text(`Date: ${new Date(po.createdAt).toLocaleDateString()}`, marginRight, 36, { align: "right" });
  doc.text(`Status: ${po.status.toUpperCase()}`, marginRight, 42, { align: "right" });

  // ── Company Info ──────────────────────────────────────────────────────
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("RSV Infotech Pte. Ltd.", marginLeft, 40);
  doc.setFontSize(9.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text("#07-52A, 10 Ubi Crescent, UBI Techpark Lobby C,", marginLeft, 46);
  doc.text("Singapore 408564", marginLeft, 51);

  // Divider line
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.4);
  doc.line(marginLeft, 58, marginRight, 58);

  // ── Vendor & Delivery ──────────────────────────────────────────────────
  const col2 = 108;

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("Vendor:", marginLeft, 67);
  doc.text("Delivery To:", col2, 67);

  doc.setFontSize(9.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(60, 60, 60);

  const vendorText = [
    po.vendorName,
    po.vendorAddress || "",
    po.vendorContact || "",
  ]
    .filter(Boolean)
    .join("\n");

  const vendorLines = doc.splitTextToSize(vendorText, 85);
  doc.text(vendorLines, marginLeft, 74);

  const deliveryLines = doc.splitTextToSize(
    po.deliveryAddress || "RSV Infotech Office",
    82
  );
  doc.text(deliveryLines, col2, 74);

  // ── Delivery date / Payment terms ─────────────────────────────────────
  // Format ISO date (YYYY-MM-DD) to readable form, or pass through free text
  const formatDeliveryDate = (d: string | null | undefined): string => {
    if (!d) return "TBA";
    const parsed = new Date(d);
    if (!isNaN(parsed.getTime())) {
      return parsed.toLocaleDateString("en-SG", { day: "2-digit", month: "short", year: "numeric" });
    }
    return d;
  };

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(0, 0, 0);
  doc.text("Delivery Date:", marginLeft, 105);
  doc.text("Payment Terms:", col2, 105);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(60, 60, 60);
  doc.text(formatDeliveryDate(po.deliveryDate), marginLeft + 32, 105);
  doc.text(po.paymentTerms || "Standard", col2 + 33, 105);

  // ── Line Items Table ──────────────────────────────────────────────────
  const tableData = po.items.map((item, index) => [
    index + 1,
    item.partNumber,
    item.description,
    item.qty,
    `$${Number(item.unitPrice).toFixed(2)}`,
    `$${Number(item.amount).toFixed(2)}`,
  ]);

  (doc as any).autoTable({
    startY: 113,
    head: [["#", "Item / Part Number", "Description", "Qty", "Unit Price", "Amount"]],
    body: tableData,
    theme: "striped",
    headStyles: {
      fillColor: [24, 33, 47],
      textColor: 255,
      fontStyle: "bold",
      fontSize: 9.5,
    },
    bodyStyles: { fontSize: 9.5 },
    styles: { cellPadding: 4 },
    columnStyles: {
      0: { cellWidth: 10, halign: "center" },
      1: { cellWidth: 32 },
      2: { cellWidth: "auto" },
      3: { cellWidth: 16, halign: "center" },
      4: { cellWidth: 27, halign: "right" },
      5: { cellWidth: 27, halign: "right" },
    },
    margin: { left: marginLeft, right: 14 },
  });

  const tableEndY = (doc as any).lastAutoTable.finalY;
  const pageHeight = doc.internal.pageSize.getHeight(); // 297mm for A4

  // ── Notes (just after the table, on the last page) ────────────────────
  if (po.notes) {
    const notesY = tableEndY + 8;
    doc.setFontSize(9.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text("Notes:", marginLeft, notesY);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80, 80, 80);
    const noteLines = doc.splitTextToSize(po.notes, 120);
    doc.text(noteLines, marginLeft, notesY + 6);
  }

  // ── Totals block — always anchored to bottom of the last page ─────────
  // Table Amount column text right edge = marginRight(196) - cellPadding(4) = 192mm
  const labelX = 146;
  const valueX = marginRight - 4; // 192mm — flush with Amount column

  // Totals block height: subtotal(0) + tax(+7) + separator(+10) + total(+17) = ~20mm
  // Footer sits at pageHeight - 12. Totals block ends at pageHeight - 15.
  const totalsY = pageHeight - 47; // dynamically bottom of last page

  doc.setFontSize(9.5);
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "normal");
  doc.text("Subtotal:", labelX, totalsY);
  doc.text(`$${Number(po.subtotal).toFixed(2)}`, valueX, totalsY, { align: "right" });

  const subtotalNum = Number(po.subtotal);
  const taxAmount = Number(po.totalAmount) - subtotalNum;

  doc.text("Tax:", labelX, totalsY + 7);
  doc.text(`$${taxAmount.toFixed(2)}`, valueX, totalsY + 7, { align: "right" });

  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.3);
  doc.line(labelX, totalsY + 10, marginRight, totalsY + 10);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(24, 33, 47);
  doc.text("Total Amount:", labelX, totalsY + 17);
  doc.text(`$${Number(po.totalAmount).toFixed(2)}`, valueX, totalsY + 17, { align: "right" });

  // ── Footer — on every page ────────────────────────────────────────────
  const totalPages = (doc as any).internal.pages.length - 1;
  const footerY = pageHeight - 12;
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(160, 160, 160);
    doc.text(
      "This is a computer-generated Purchase Order document and does not require a physical signature.",
      pageWidth / 2,
      footerY,
      { align: "center" }
    );
    if (totalPages > 1) {
      doc.text(`Page ${p} of ${totalPages}`, marginRight, footerY, { align: "right" });
    }
  }

  doc.save(`${po.poNumber}.pdf`);
}

// ── Shared helpers for customer-facing docs ──────────────────────────────────

function buildDocHeader(
  doc: jsPDF,
  logoBase64: string,
  title: string,
  docNumber: string,
  date: string,
  status: string
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
  doc.text("RSV Infotech Pte. Ltd.", marginLeft, 40);
  doc.setFontSize(9.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text("#07-52A, 10 Ubi Crescent, UBI Techpark Lobby C,", marginLeft, 46);
  doc.text("Singapore 408564", marginLeft, 51);

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

function formatDate(d: string | null | undefined): string {
  if (!d) return "TBA";
  const parsed = new Date(d.includes("T") ? d : d + "T00:00:00");
  if (!isNaN(parsed.getTime())) {
    return parsed.toLocaleDateString("en-SG", { day: "2-digit", month: "short", year: "numeric" });
  }
  return d;
}

// ── QUOTATION PDF ─────────────────────────────────────────────────────────────

export async function generateQuotation_PDF(qt: Quotation) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginLeft = 14;
  const marginRight = pageWidth - 14;
  const col2 = 108;

  const logoBase64 = await getBase64ImageFromUrl(logoUrl);
  buildDocHeader(doc, logoBase64, "QUOTATION", qt.qtNumber, new Date(qt.createdAt).toLocaleDateString(), qt.status);

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("Quote To:", marginLeft, 67);
  doc.text("Deliver To:", col2, 67);

  doc.setFontSize(9.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(60, 60, 60);
  const customerText = [qt.customerName, qt.customerAddress || "", qt.customerContact || ""].filter(Boolean).join("\n");
  doc.text(doc.splitTextToSize(customerText, 85), marginLeft, 74);
  doc.text(doc.splitTextToSize(qt.deliveryAddress || "—", 82), col2, 74);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(0, 0, 0);
  doc.text("Delivery Date:", marginLeft, 105);
  doc.text("Payment Terms:", col2, 105);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(60, 60, 60);
  doc.text(formatDate(qt.deliveryDate), marginLeft + 32, 105);
  doc.text(qt.paymentTerms || "Standard", col2 + 33, 105);

  const tableData = (qt.items as any[]).map((item, i) => [
    i + 1, item.partNumber || "", item.description,
    item.qty, `$${Number(item.unitPrice).toFixed(2)}`, `$${Number(item.amount).toFixed(2)}`,
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
  doc.text(`$${Number(qt.subtotal).toFixed(2)}`, valueX, totalsY, { align: "right" });
  doc.text("GST:", labelX, totalsY + 7);
  doc.text(`$${Number(qt.tax).toFixed(2)}`, valueX, totalsY + 7, { align: "right" });
  doc.setDrawColor(180, 180, 180); doc.setLineWidth(0.3);
  doc.line(labelX, totalsY + 10, marginRight, totalsY + 10);
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(24, 33, 47);
  doc.text("Total Amount:", labelX, totalsY + 17);
  doc.text(`$${Number(qt.totalAmount).toFixed(2)}`, valueX, totalsY + 17, { align: "right" });

  buildDocFooter(doc, "Quotation");
  doc.save(`${qt.qtNumber}.pdf`);
}

// ── INVOICE PDF ───────────────────────────────────────────────────────────────

export async function generateInvoice_PDF(inv: Invoice) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginLeft = 14;
  const marginRight = pageWidth - 14;
  const col2 = 108;

  const logoBase64 = await getBase64ImageFromUrl(logoUrl);
  buildDocHeader(doc, logoBase64, "INVOICE", inv.invNumber, new Date(inv.createdAt).toLocaleDateString(), inv.status);

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("Bill To:", marginLeft, 67);
  doc.text("Deliver To:", col2, 67);

  doc.setFontSize(9.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(60, 60, 60);
  const customerText = [inv.customerName, inv.customerAddress || "", inv.customerContact || ""].filter(Boolean).join("\n");
  doc.text(doc.splitTextToSize(customerText, 85), marginLeft, 74);
  doc.text(doc.splitTextToSize(inv.deliveryAddress || "—", 82), col2, 74);

  doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(0, 0, 0);
  doc.text("Delivery Date:", marginLeft, 105);
  doc.text("Payment Terms:", col2, 105);
  doc.setFont("helvetica", "normal"); doc.setTextColor(60, 60, 60);
  doc.text(formatDate(inv.deliveryDate), marginLeft + 32, 105);
  doc.text(inv.paymentTerms || "Standard", col2 + 33, 105);

  const tableData = (inv.items as any[]).map((item, i) => [
    i + 1, item.partNumber || "", item.description,
    item.qty, `$${Number(item.unitPrice).toFixed(2)}`, `$${Number(item.amount).toFixed(2)}`,
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
  doc.text(`$${Number(inv.subtotal).toFixed(2)}`, valueX, totalsY, { align: "right" });
  doc.text("GST:", labelX, totalsY + 7);
  doc.text(`$${Number(inv.tax).toFixed(2)}`, valueX, totalsY + 7, { align: "right" });
  doc.setDrawColor(180, 180, 180); doc.setLineWidth(0.3);
  doc.line(labelX, totalsY + 10, marginRight, totalsY + 10);
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(24, 33, 47);
  doc.text("Total Amount:", labelX, totalsY + 17);
  doc.text(`$${Number(inv.totalAmount).toFixed(2)}`, valueX, totalsY + 17, { align: "right" });

  buildDocFooter(doc, "Invoice");
  doc.save(`${inv.invNumber}.pdf`);
}

// ── DELIVERY ORDER PDF ────────────────────────────────────────────────────────

export async function generateDO_PDF(doDoc: DeliveryOrder) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginLeft = 14;
  const marginRight = pageWidth - 14;

  const logoBase64 = await getBase64ImageFromUrl(logoUrl);
  buildDocHeader(doc, logoBase64, "DELIVERY ORDER", doDoc.doNumber, new Date(doDoc.createdAt).toLocaleDateString(), doDoc.status);

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("Deliver To:", marginLeft, 67);

  doc.setFontSize(9.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(60, 60, 60);
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
