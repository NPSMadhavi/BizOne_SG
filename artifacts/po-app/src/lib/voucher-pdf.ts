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
  const mL = 14;
  const mR = 196;
  const pageW = 210;

  const logo = await getLogoData(getLogoUrl(company?.id)).catch(() => null);

  // ── TOP HEADER BLOCK ───────────────────────────────────────────────────────
  // Left: logo + company details  |  Right: title + voucher metadata
  // Mirrors the Invoice / TAX INVOICE layout exactly.

  let y = 14;

  // Logo — same scale as other documents (maxW=55, maxH=22)
  if (logo) {
    const maxW = 55, maxH = 22;
    const scale = Math.min(maxW / logo.natW, maxH / logo.natH);
    doc.addImage(logo.dataUrl, "PNG", mL, y, logo.natW * scale, logo.natH * scale);
  }

  // Document title — large, right-aligned (like "TAX INVOICE")
  const title = VOUCHER_TYPE_LABELS[voucher.type] || "PAYMENT VOUCHER";
  doc.setFont(F, "bold"); doc.setFontSize(22); doc.setTextColor(20, 20, 20);
  doc.text(title, mR, y + 7, { align: "right" });

  // Right meta block: Voucher No / Date / Status / Currency (small, right-aligned)
  const metaItems: Array<[string, string]> = [
    ["Voucher No:", voucher.voucherNumber],
    ["Date:", voucher.issueDate || new Date().toISOString().slice(0, 10)],
    ["Status:", voucher.status === "paid" ? "PAID" : "DRAFT"],
    ["Currency:", voucher.currency],
  ];
  if (voucher.status === "paid" && voucher.paidDate) {
    metaItems.push(["Paid On:", voucher.paidDate]);
  }
  if (voucher.status === "paid" && voucher.bankRef) {
    metaItems.push(["Bank Ref:", voucher.bankRef]);
  }

  const metaLabelX = 140;
  let metaY = y + 15;
  doc.setFontSize(9);
  for (const [label, val] of metaItems) {
    doc.setFont(F, "normal"); doc.setTextColor(100, 100, 100);
    doc.text(label, metaLabelX, metaY);
    doc.setFont(F, "bold"); doc.setTextColor(30, 30, 30);
    doc.text(val, mR, metaY, { align: "right" });
    metaY += 5.5;
  }

  // Company details — left column below logo (same as Invoice)
  const coName = company?.name || "RSV Infotech Pte. Ltd.";
  const coAddr = company?.address || "";
  const coReg = company?.registrationNo ? `Co. Reg. No.: ${company.registrationNo}` : "";

  let coY = y + 26;
  doc.setFont(F, "bold"); doc.setFontSize(11); doc.setTextColor(20, 20, 20);
  doc.text(coName, mL, coY);
  coY += 5.5;

  doc.setFont(F, "normal"); doc.setFontSize(9); doc.setTextColor(60, 60, 60);
  if (coAddr) {
    const addrParts = coAddr.split(",").map((s: string) => s.trim()).filter(Boolean);
    // Group into lines of ~2-3 parts each
    const chunkSize = 3;
    for (let i = 0; i < addrParts.length; i += chunkSize) {
      const line = addrParts.slice(i, i + chunkSize).join(", ");
      doc.text(line, mL, coY);
      coY += 5;
    }
  }
  if (coReg) {
    doc.text(coReg, mL, coY);
    coY += 5;
  }

  // Advance y to below whichever block is taller
  y = Math.max(coY, metaY) + 4;

  // ── Divider ────────────────────────────────────────────────────────────────
  doc.setDrawColor(180, 180, 180); doc.setLineWidth(0.4);
  doc.line(mL, y, mR, y);
  y += 8;

  // ── PARTY BLOCK: Pay To / Project / Contact ────────────────────────────────
  // Left column: Pay To + Contact  |  Right column: Project
  const midX = pageW / 2;
  const lValX = mL + 22;
  const rColX = midX + 6;

  function partyLabel(txt: string, x: number, py: number) {
    doc.setFont(F, "bold"); doc.setFontSize(9); doc.setTextColor(80, 80, 80);
    doc.text(txt, x, py);
  }
  function partyVal(txt: string, x: number, py: number, maxW: number) {
    doc.setFont(F, "bold"); doc.setFontSize(10); doc.setTextColor(20, 20, 20);
    const wrapped = doc.splitTextToSize(txt, maxW) as string[];
    doc.text(wrapped, x, py);
    return wrapped.length;
  }

  partyLabel("Pay To:", mL, y);
  const payeeLines = partyVal(voucher.payee, lValX, y, midX - lValX - 4);

  if (voucher.project) {
    const projStr = voucher.project.code
      ? `${voucher.project.name} (${voucher.project.code})`
      : voucher.project.name;
    partyLabel("Project:", rColX, y);
    doc.setFont(F, "normal"); doc.setFontSize(9); doc.setTextColor(40, 40, 40);
    const projWrapped = doc.splitTextToSize(projStr, mR - rColX - 22) as string[];
    doc.text(projWrapped, rColX + 18, y);
  }

  y += Math.max(payeeLines, 1) * 5.5 + 2;

  if (voucher.payeeContact) {
    partyLabel("Contact:", mL, y);
    doc.setFont(F, "normal"); doc.setFontSize(9); doc.setTextColor(60, 60, 60);
    doc.text(voucher.payeeContact, lValX, y);
    y += 5.5;
  }

  if (voucher.description) {
    partyLabel("Purpose:", mL, y);
    doc.setFont(F, "normal"); doc.setFontSize(9); doc.setTextColor(60, 60, 60);
    const dLines = doc.splitTextToSize(voucher.description, mR - lValX - 2) as string[];
    doc.text(dLines, lValX, y);
    y += Math.max(dLines.length, 1) * 5 + 2;
  }

  y += 4;

  // ── Items table ────────────────────────────────────────────────────────────
  const items = (voucher.items || []).filter((it: any) => it.description);
  if (items.length > 0) {
    (doc as any).autoTable({
      startY: y,
      margin: { left: mL, right: pageW - mR },
      head: [["#", "Description", "Category", "Amount"]],
      body: items.map((it: any, i: number) => [
        String(i + 1),
        it.description || "",
        it.category || "",
        fmtMoney(voucher.currency, parseFloat(it.amount) || 0),
      ]),
      headStyles: {
        fillColor: [25, 35, 55],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 9,
      },
      bodyStyles: { fontSize: 9, textColor: [40, 40, 40] },
      columnStyles: {
        0: { cellWidth: 10 },
        1: { cellWidth: "auto" },
        2: { cellWidth: 42 },
        3: { cellWidth: 36, halign: "right" },
      },
      alternateRowStyles: { fillColor: [248, 249, 250] },
      tableLineColor: [210, 215, 220],
      tableLineWidth: 0.25,
    });
    y = (doc as any).lastAutoTable.finalY + 4;
  }

  // ── Total row ──────────────────────────────────────────────────────────────
  const totalLabelX = 120;
  doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.3);
  doc.line(totalLabelX, y, mR, y);
  y += 5;
  doc.setFontSize(11); doc.setFont(F, "bold"); doc.setTextColor(30, 30, 30);
  doc.text("Total Amount:", totalLabelX, y);
  doc.setTextColor(180, 20, 20);
  doc.text(fmtMoney(voucher.currency, voucher.totalAmount), mR, y, { align: "right" });
  y += 10;

  // ── Notes ──────────────────────────────────────────────────────────────────
  if (voucher.notes) {
    doc.setFont(F, "bold"); doc.setFontSize(9); doc.setTextColor(80, 80, 80);
    doc.text("Notes:", mL, y);
    doc.setFont(F, "normal"); doc.setTextColor(50, 50, 50);
    const noteLines = doc.splitTextToSize(voucher.notes, mR - mL - 20) as string[];
    doc.text(noteLines, mL + 18, y);
    y += noteLines.length * 5 + 4;
  }

  // ── Signature block ────────────────────────────────────────────────────────
  y = Math.max(y + 14, 225);
  if (y > 252) y = 252;

  doc.setDrawColor(160, 160, 160); doc.setLineWidth(0.3);
  const sigW = 50;
  const sig1X = mL;
  const sig2X = pageW / 2 - sigW / 2;
  const sig3X = mR - sigW;

  [sig1X, sig2X, sig3X].forEach(sx => doc.line(sx, y, sx + sigW, y));
  y += 4;
  doc.setFont(F, "normal"); doc.setFontSize(8); doc.setTextColor(80, 80, 80);
  ["Prepared By", "Verified By", "Approved By"].forEach((lbl, i) => {
    const sx = [sig1X, sig2X, sig3X][i];
    doc.text(lbl, sx + sigW / 2, y, { align: "center" });
  });
  y += 4;
  doc.setFontSize(7); doc.setTextColor(130, 130, 130);
  [sig1X, sig2X, sig3X].forEach(sx => doc.text("Name & Date", sx + sigW / 2, y, { align: "center" }));

  // ── Footer ─────────────────────────────────────────────────────────────────
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let pg = 1; pg <= pageCount; pg++) {
    doc.setPage(pg);
    doc.setFont(F, "normal"); doc.setFontSize(7.5); doc.setTextColor(160, 160, 160);
    doc.text(
      `${title} | ${voucher.voucherNumber} | Page ${pg} of ${pageCount}`,
      pageW / 2, 291, { align: "center" }
    );
  }

  if (options?.returnBase64) return doc.output("datauristring").split(",")[1];
  doc.save(`Voucher_${voucher.voucherNumber}.pdf`);
}
