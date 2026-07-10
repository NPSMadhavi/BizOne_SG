import { jsPDF } from "jspdf";
import "jspdf-autotable";
import logoRsvUrl from "@assets/logo_1776054030755.png";
import logoNetopsysUrl from "@assets/Netopsys_logo_Dark_1776066608427.png";

const VOUCHER_TYPE_LABELS: Record<string, string> = {
  payment: "PAYMENT VOUCHER",
  reimbursement: "REIMBURSEMENT VOUCHER",
  "petty-cash": "PETTY CASH VOUCHER",
};

function getLogoUrl(companyId?: number | null): string {
  if (!companyId || companyId === 1) return logoRsvUrl;
  return logoNetopsysUrl;
}

async function getLogoData(url: string): Promise<{ dataUrl: string; natW: number; natH: number }> {
  const res = await fetch(url);
  const blob = await res.blob();
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
  const dims = await new Promise<{ natW: number; natH: number }>((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ natW: img.naturalWidth, natH: img.naturalHeight });
    img.onerror = () => resolve({ natW: 260, natH: 56 });
    img.src = dataUrl;
  });
  return { dataUrl, ...dims };
}

function fmtMoney(currency: string, amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export interface VoucherPDFData {
  voucherNumber: string;
  type: string;
  payee: string;
  payeeContact?: string | null;
  issueDate?: string | null;
  description?: string | null;
  currency: string;
  totalAmount: number;
  status: string;
  paidDate?: string | null;
  bankRef?: string | null;
  notes?: string | null;
  items: Array<{ description: string; category?: string; amount: number }>;
  project?: { name: string; code?: string | null } | null;
}

export interface VoucherCompany {
  id?: number | null;
  name: string;
  address?: string | null;
  registrationNo?: string | null;
  email?: string | null;
  phone?: string | null;
}

export async function generateVoucherPDF(
  voucher: VoucherPDFData,
  company?: VoucherCompany | null,
  options?: { returnBase64?: boolean }
): Promise<string | void> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const F = "helvetica";
  const mL = 15, mR = 195;
  const pageW = 210;
  const centerX = pageW / 2;

  const logo = await getLogoData(getLogoUrl(company?.id)).catch(() => null);

  let y = 12;

  if (logo) {
    const maxW = 45, maxH = 18;
    const scale = Math.min(maxW / logo.natW, maxH / logo.natH);
    const lw = logo.natW * scale;
    const lh = logo.natH * scale;
    doc.addImage(logo.dataUrl, "PNG", mL, y, lw, lh);
  }

  const coName = company?.name || "RSV Infotech Pte. Ltd.";
  const coAddr = company?.address || "";
  const coReg = company?.registrationNo ? `Reg. No: ${company.registrationNo}` : "";

  doc.setFont(F, "bold"); doc.setFontSize(11); doc.setTextColor(30, 30, 30);
  doc.text(coName, mR, y + 2, { align: "right" });
  doc.setFont(F, "normal"); doc.setFontSize(8.5); doc.setTextColor(80, 80, 80);
  if (coAddr) {
    const addrLines = coAddr.split(",").map((s: string) => s.trim()).filter(Boolean);
    const mid = Math.ceil(addrLines.length / 2);
    const line1 = addrLines.slice(0, mid).join(", ");
    const line2 = addrLines.slice(mid).join(", ");
    doc.text(line1, mR, y + 8, { align: "right" });
    if (line2) doc.text(line2, mR, y + 13, { align: "right" });
  }
  if (coReg) doc.text(coReg, mR, y + 18, { align: "right" });

  y = 38;

  doc.setDrawColor(220, 38, 38); doc.setLineWidth(0.8);
  doc.line(mL, y, mR, y);
  y += 6;

  const title = VOUCHER_TYPE_LABELS[voucher.type] || "PAYMENT VOUCHER";
  doc.setFont(F, "bold"); doc.setFontSize(16); doc.setTextColor(30, 30, 30);
  doc.text(title, centerX, y, { align: "center" });
  y += 8;

  doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.3);
  doc.line(mL, y, mR, y);
  y += 6;

  doc.setFontSize(9); doc.setFont(F, "normal"); doc.setTextColor(60, 60, 60);
  const col1 = mL, col2 = 70, col3 = 120, col4 = mR;

  function infoRow(label1: string, val1: string, label2: string, val2: string) {
    doc.setFont(F, "bold"); doc.setTextColor(80, 80, 80);
    doc.text(label1, col1, y);
    doc.setFont(F, "normal"); doc.setTextColor(30, 30, 30);
    doc.text(val1, col2, y);
    doc.setFont(F, "bold"); doc.setTextColor(80, 80, 80);
    doc.text(label2, col3, y);
    doc.setFont(F, "normal"); doc.setTextColor(30, 30, 30);
    doc.text(val2, col4, y, { align: "right" });
    y += 6;
  }

  infoRow("Voucher No:", voucher.voucherNumber, "Date:", voucher.issueDate || new Date().toISOString().slice(0, 10));

  if (voucher.project) {
    const projLabel = voucher.project.code ? `${voucher.project.name} (${voucher.project.code})` : voucher.project.name;
    infoRow("Project:", projLabel, "Currency:", voucher.currency);
  } else {
    infoRow("Currency:", voucher.currency, "", "");
  }

  infoRow("Pay To:", voucher.payee, "Status:", voucher.status === "paid" ? "PAID" : "DRAFT");

  if (voucher.payeeContact) {
    doc.setFont(F, "bold"); doc.setTextColor(80, 80, 80);
    doc.text("Contact:", col1, y);
    doc.setFont(F, "normal"); doc.setTextColor(30, 30, 30);
    doc.text(voucher.payeeContact, col2, y);
    y += 6;
  }

  if (voucher.status === "paid" && (voucher.paidDate || voucher.bankRef)) {
    infoRow("Paid On:", voucher.paidDate || "", "Bank Ref:", voucher.bankRef || "");
  }

  y += 2;
  doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.3);
  doc.line(mL, y, mR, y);
  y += 5;

  if (voucher.description) {
    doc.setFont(F, "bold"); doc.setFontSize(8.5); doc.setTextColor(80, 80, 80);
    doc.text("Description:", mL, y);
    doc.setFont(F, "normal"); doc.setTextColor(40, 40, 40);
    const descLines = doc.splitTextToSize(voucher.description, mR - mL - 30);
    doc.text(descLines, mL + 28, y);
    y += descLines.length * 5 + 3;
  }

  const items = (voucher.items || []).filter((it: any) => it.description);
  if (items.length > 0) {
    (doc as any).autoTable({
      startY: y,
      margin: { left: mL, right: 210 - mR },
      head: [["#", "Description", "Category", "Amount"]],
      body: items.map((it: any, i: number) => [
        String(i + 1),
        it.description || "",
        it.category || "",
        fmtMoney(voucher.currency, parseFloat(it.amount) || 0),
      ]),
      headStyles: {
        fillColor: [30, 30, 30],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 9,
      },
      bodyStyles: { fontSize: 9, textColor: [40, 40, 40] },
      columnStyles: {
        0: { cellWidth: 10 },
        1: { cellWidth: "auto" },
        2: { cellWidth: 40 },
        3: { cellWidth: 35, halign: "right" },
      },
      alternateRowStyles: { fillColor: [248, 248, 248] },
      tableLineColor: [220, 220, 220],
      tableLineWidth: 0.3,
    });
    y = (doc as any).lastAutoTable.finalY + 4;
  }

  const labelX = mR - 40;
  doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.3);
  doc.line(labelX - 5, y, mR, y);
  y += 5;
  doc.setFontSize(11); doc.setFont(F, "bold"); doc.setTextColor(30, 30, 30);
  doc.text("Total Amount:", labelX - 5, y);
  doc.setTextColor(220, 38, 38);
  doc.text(fmtMoney(voucher.currency, voucher.totalAmount), mR, y, { align: "right" });
  y += 10;

  if (voucher.notes) {
    doc.setFont(F, "bold"); doc.setFontSize(8.5); doc.setTextColor(80, 80, 80);
    doc.text("Notes:", mL, y);
    doc.setFont(F, "normal"); doc.setTextColor(40, 40, 40);
    const noteLines = doc.splitTextToSize(voucher.notes, mR - mL - 18);
    doc.text(noteLines, mL + 18, y);
    y += noteLines.length * 5 + 4;
  }

  y = Math.max(y + 10, 220);
  if (y > 250) y = 250;

  doc.setDrawColor(150, 150, 150); doc.setLineWidth(0.3);

  const sigW = 55;
  const sig1X = mL;
  const sig2X = centerX - sigW / 2;
  const sig3X = mR - sigW;

  doc.line(sig1X, y, sig1X + sigW, y);
  doc.line(sig2X, y, sig2X + sigW, y);
  doc.line(sig3X, y, sig3X + sigW, y);
  y += 4;
  doc.setFont(F, "normal"); doc.setFontSize(8); doc.setTextColor(80, 80, 80);
  doc.text("Prepared By", sig1X + sigW / 2, y, { align: "center" });
  doc.text("Verified By", sig2X + sigW / 2, y, { align: "center" });
  doc.text("Approved By", sig3X + sigW / 2, y, { align: "center" });
  y += 4;
  doc.setFontSize(7); doc.setTextColor(120, 120, 120);
  doc.text("Name & Date", sig1X + sigW / 2, y, { align: "center" });
  doc.text("Name & Date", sig2X + sigW / 2, y, { align: "center" });
  doc.text("Name & Date", sig3X + sigW / 2, y, { align: "center" });

  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let pg = 1; pg <= pageCount; pg++) {
    doc.setPage(pg);
    doc.setFont(F, "normal"); doc.setFontSize(7.5); doc.setTextColor(150, 150, 150);
    doc.text(
      `${title} | ${voucher.voucherNumber} | Page ${pg} of ${pageCount}`,
      centerX, 290, { align: "center" }
    );
  }

  if (options?.returnBase64) return doc.output("datauristring").split(",")[1];
  doc.save(`Voucher_${voucher.voucherNumber}.pdf`);
}
