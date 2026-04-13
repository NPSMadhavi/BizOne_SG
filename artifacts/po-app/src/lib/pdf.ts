import { jsPDF } from "jspdf";
import "jspdf-autotable";
import type { PurchaseOrder } from "@workspace/api-client-react";
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
  doc.text("Vendor:", marginLeft, 62);
  doc.text("Delivery To:", col2, 62);

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
  doc.text(vendorLines, marginLeft, 69);

  const deliveryLines = doc.splitTextToSize(
    po.deliveryAddress || "RSV Infotech Office",
    82
  );
  doc.text(deliveryLines, col2, 69);

  // ── Delivery date / Payment terms ─────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(0, 0, 0);
  doc.text("Delivery Date:", marginLeft, 100);
  doc.text("Payment Terms:", col2, 100);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(60, 60, 60);
  doc.text(po.deliveryDate || "TBA", marginLeft + 32, 100);
  doc.text(po.paymentTerms || "Standard", col2 + 33, 100);

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
    startY: 108,
    head: [["#", "Part Number", "Description", "Qty", "Unit Price", "Amount"]],
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

  // ── Notes (just after the table) ──────────────────────────────────────
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

  // ── Totals block — pinned to bottom-right of page ─────────────────────
  // Table Amount column text right edge = 196 - 4mm cell padding = 192mm
  const labelX = 146;
  const valueX = marginRight - 4; // 192mm — flush with Amount column

  // Pin totals block to a fixed Y near the bottom (above footer)
  const totalsY = 250;

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

  // ── Footer ────────────────────────────────────────────────────────────
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "italic");
  doc.setTextColor(160, 160, 160);
  doc.text(
    "This is a computer-generated Purchase Order document and does not require a physical signature.",
    pageWidth / 2,
    285,
    { align: "center" }
  );

  doc.save(`${po.poNumber}.pdf`);
}
