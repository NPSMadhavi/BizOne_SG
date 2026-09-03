import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import "jspdf-autotable";
import { format, isAfter, isBefore, addDays } from "date-fns";
import type { License } from "@shared/schema";

function fileStamp() {
  return format(new Date(), "yyyy-MM-dd");
}

export function getLicenseStatusLabel(license: License): string {
  if (!license.expiryDate) return "-";

  const expiryDate = new Date(license.expiryDate);
  const now = new Date();

  if (isBefore(expiryDate, now)) return "Expired";
  if (isBefore(expiryDate, addDays(now, 90))) return "Expiring Soon";
  return "Valid";
}

function fmtLicenseDate(value?: string | Date | null, neverLabel = "-"): string {
  if (!value) return neverLabel;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return neverLabel;
  return format(d, "MMM d, yyyy");
}

function tabSuffix(activeTab?: string) {
  if (activeTab === "expiring") return "expiring";
  if (activeTab === "expired") return "expired";
  return "all";
}

function toExcelRows(licenses: License[]) {
  return licenses.map((license) => ({
    Name: license.name,
    Type: license.type,
    Key: license.licenseKey || "-",
    "Purchase Date": fmtLicenseDate(license.purchaseDate),
    "Expiry Date": fmtLicenseDate(license.expiryDate, "Never"),
    Status: getLicenseStatusLabel(license),
    Asset: license.assetId ? `#${license.assetId}` : "-",
    Seats: license.seats ?? "-",
  }));
}

export function exportLicensesToExcel(licenses: License[], activeTab?: string) {
  const rows = toExcelRows(licenses);
  const worksheet = XLSX.utils.json_to_sheet(rows);
  worksheet["!cols"] = [
    { wch: 28 },
    { wch: 14 },
    { wch: 24 },
    { wch: 16 },
    { wch: 16 },
    { wch: 14 },
    { wch: 10 },
    { wch: 8 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Licenses");
  XLSX.writeFile(workbook, `licenses-${tabSuffix(activeTab)}-${fileStamp()}.xlsx`);
}

export function exportLicensesToPdf(licenses: License[], activeTab?: string) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const dateLabel = format(new Date(), "dd MMM yyyy");
  const tabLabel =
    activeTab === "expiring" ? "Expiring" : activeTab === "expired" ? "Expired" : "All Licenses";

  doc.setFontSize(14);
  doc.setTextColor(37, 99, 235);
  doc.text("Licenses Report", 14, 14);
  doc.setFontSize(9);
  doc.setTextColor(107, 114, 128);
  doc.text(
    `Filter: ${tabLabel}  |  Generated: ${dateLabel}  |  Total: ${licenses.length}`,
    14,
    20,
  );

  (doc as any).autoTable({
    startY: 24,
    head: [["Name", "Type", "Purchase Date", "Expiry Date", "Status", "Asset", "Seats"]],
    body: licenses.map((license) => [
      license.name ?? "",
      license.type ?? "",
      fmtLicenseDate(license.purchaseDate),
      fmtLicenseDate(license.expiryDate, "Never"),
      getLicenseStatusLabel(license),
      license.assetId ? `#${license.assetId}` : "-",
      license.seats != null ? String(license.seats) : "-",
    ]),
    styles: { fontSize: 8, cellPadding: 2, overflow: "linebreak" },
    headStyles: {
      fillColor: [59, 130, 246],
      textColor: 255,
      fontStyle: "bold",
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 10, right: 10 },
  });

  doc.save(`licenses-${tabSuffix(activeTab)}-${fileStamp()}.pdf`);
}
