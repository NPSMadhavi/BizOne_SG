import { jsPDF } from "jspdf";
import "jspdf-autotable";
import type { PurchaseOrder } from "@workspace/api-client-react";
import logoUrl from "@assets/logo_1776054030755.png";

// Load the logo image as base64 to embed in the PDF
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
  const doc = new jsPDF();
  
  const logoBase64 = await getBase64ImageFromUrl(logoUrl);
  
  // Header
  doc.addImage(logoBase64, "PNG", 14, 15, 40, 15);
  doc.setFontSize(24);
  doc.setTextColor(24, 33, 47); // Navy blue
  doc.text("PURCHASE ORDER", 130, 25);
  
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(`PO Number: ${po.poNumber}`, 130, 32);
  doc.text(`Date: ${new Date(po.createdAt).toLocaleDateString()}`, 130, 37);
  doc.text(`Status: ${po.status.toUpperCase()}`, 130, 42);

  // RSV Infotech Info
  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "bold");
  doc.text("RSV Infotech Pte. Ltd.", 14, 45);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text("Singapore", 14, 50);

  doc.line(14, 55, 196, 55);

  // Vendor & Delivery
  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "bold");
  doc.text("Vendor:", 14, 65);
  doc.text("Delivery To:", 105, 65);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(60, 60, 60);
  
  const vendorLines = doc.splitTextToSize(
    `${po.vendorName}\n${po.vendorAddress || ""}\n${po.vendorContact || ""}`,
    80
  );
  doc.text(vendorLines, 14, 72);

  const deliveryLines = doc.splitTextToSize(
    po.deliveryAddress || "RSV Infotech Office",
    80
  );
  doc.text(deliveryLines, 105, 72);

  // Terms
  doc.setFont("helvetica", "bold");
  doc.text("Delivery Date:", 14, 100);
  doc.text("Payment Terms:", 105, 100);
  doc.setFont("helvetica", "normal");
  doc.text(po.deliveryDate || "TBA", 45, 100);
  doc.text(po.paymentTerms || "Standard", 135, 100);

  // Line Items Table
  const tableData = po.items.map((item, index) => [
    index + 1,
    item.partNumber,
    item.description,
    item.qty,
    `$${item.unitPrice.toFixed(2)}`,
    `$${item.amount.toFixed(2)}`,
  ]);

  (doc as any).autoTable({
    startY: 110,
    head: [["#", "Part Number", "Description", "Qty", "Unit Price", "Amount"]],
    body: tableData,
    theme: "striped",
    headStyles: { fillColor: [24, 33, 47] }, // Navy
    styles: { fontSize: 9, cellPadding: 5 },
    columnStyles: {
      0: { cellWidth: 10 },
      1: { cellWidth: 30 },
      2: { cellWidth: "auto" },
      3: { cellWidth: 15, halign: "center" },
      4: { cellWidth: 25, halign: "right" },
      5: { cellWidth: 30, halign: "right" },
    },
  });

  const finalY = (doc as any).lastAutoTable.finalY + 10;

  // Totals
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text("Subtotal:", 140, finalY);
  doc.text(`$${po.subtotal.toFixed(2)}`, 196, finalY, { align: "right" });

  doc.text(`Tax (${po.tax}%):`, 140, finalY + 7);
  const taxAmount = po.subtotal * (po.tax / 100);
  doc.text(`$${taxAmount.toFixed(2)}`, 196, finalY + 7, { align: "right" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Total Amount:", 140, finalY + 16);
  doc.text(`$${po.totalAmount.toFixed(2)}`, 196, finalY + 16, { align: "right" });

  // Notes
  if (po.notes) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("Notes:", 14, finalY);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 60, 60);
    const noteLines = doc.splitTextToSize(po.notes, 100);
    doc.text(noteLines, 14, finalY + 7);
  }

  // Footer
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text(
    "This is a computer-generated Purchase Order document and does not require a physical signature.",
    105,
    285,
    { align: "center" }
  );

  doc.save(`PO-${po.poNumber}.pdf`);
}
