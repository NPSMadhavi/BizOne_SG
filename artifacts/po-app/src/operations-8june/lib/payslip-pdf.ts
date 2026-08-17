import { jsPDF } from "jspdf";

export type PayslipPdfData = {
  companyName: string;
  companyAddress: string;
  employeeName: string;
  employeeDbId: number;
  employeeCode: string;
  icNo: string;
  department: string;
  jobTitle: string;
  month: number;
  year: number;
  payPeriodStart: string;
  payPeriodEnd: string;
  basicRate: number;
  workingDays: number | null;
  basicPay: number;
  overtime: number;
  allowance: number;
  grossPay: number;
  employeeCpf: number;
  netPay: number;
  employerCpf: number;
  otherDeductions: number;
};

function money(value: string | number | null | undefined): string {
  const num = parseFloat(String(value ?? 0));
  return (Number.isFinite(num) ? num : 0).toFixed(2);
}

function workingDays(value: number | null | undefined): string {
  if (value == null) return "";
  const num = parseFloat(String(value));
  return (Number.isFinite(num) ? num : 0).toFixed(2);
}

function monthShort(month: number, year: number): string {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const safeMonth = month >= 1 && month <= 12 ? month : 1;
  return `${months[safeMonth - 1]}-${String(year).slice(-2)}`;
}

function shortDate(isoDate: string): string {
  const normalized = String(isoDate || "").slice(0, 10);
  const [yearStr, monthStr, dayStr] = normalized.split("-");
  if (!yearStr || !monthStr || !dayStr) return normalized;
  return `${dayStr}.${monthStr}.${yearStr.slice(-2)}`;
}

function monthFull(month: number): string {
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return months[month - 1] || `Month${month}`;
}

export function payslipPdfFilename(employeeName: string, month: number, year: number): string {
  const safeName =
    employeeName
      .trim()
      .replace(/[^a-zA-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "Employee";
  return `Payslip_${safeName}_${monthFull(month)}_${year}.pdf`;
}

function setTimes(doc: jsPDF, style: "normal" | "bold" = "normal", size = 11) {
  doc.setFont("times", style);
  doc.setFontSize(size);
  doc.setTextColor(0, 0, 0);
}

function drawBox(doc: jsPDF, x: number, y: number, w: number, h: number) {
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.7);
  doc.setFillColor(255, 255, 255);
  doc.rect(x, y, w, h, "FD");
}

function fitText(doc: jsPDF, text: string, maxW: number, startSize: number, minSize = 8): number {
  let size = startSize;
  doc.setFontSize(size);
  while (size > minSize && doc.getTextWidth(text) > maxW) {
    size -= 0.5;
    doc.setFontSize(size);
  }
  return size;
}

/**
 * Same client-side jsPDF download pattern as Purchase Order preview:
 * - `{ returnBase64: true }` for the preview canvas
 * - no options → `doc.save(filename)`
 */
export async function generatePayslip_PDF(
  data: PayslipPdfData,
  options?: { returnBase64?: boolean; filename?: string },
): Promise<string | void> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 12;
  const tableX = margin;
  const tableW = pageW - margin * 2;
  const col1 = tableW * 0.3;
  const col2 = tableW * 0.3;
  const col12 = col1 + col2;
  const col3 = tableW - col12;
  const x2 = tableX + col1;
  const x3 = tableX + col12;

  const companyName = data.companyName || "";
  const companyAddress = data.companyAddress || "";
  const employeeName = data.employeeName || "";
  const period = `${shortDate(data.payPeriodStart)} - ${shortDate(data.payPeriodEnd)}`;

  let y = 16;
  setTimes(doc, "bold", 18);
  doc.setTextColor(62, 103, 197);
  const nameLines = doc.splitTextToSize(companyName, tableW) as string[];
  doc.text(nameLines, pageW / 2, y, { align: "center" });
  y += nameLines.length * 7 + 2;

  setTimes(doc, "normal", 12);
  doc.setTextColor(0, 0, 0);
  const addrLines = doc.splitTextToSize(companyAddress, tableW) as string[];
  doc.text(addrLines, pageW / 2, y, { align: "center" });
  y += addrLines.length * 5.4 + 10;

  const headerH = 10;
  drawBox(doc, tableX, y, tableW, headerH);
  doc.line(x2, y, x2, y + headerH);
  doc.line(x3, y, x3, y + headerH);
  setTimes(doc, "bold", 12);
  doc.text("PAYSLIP", tableX + 3, y + 6.6);
  doc.text(monthShort(data.month, data.year), tableX + col1 + col2 / 2, y + 6.6, { align: "center" });
  fitText(doc, period, col3 - 4, 11);
  doc.text(period, tableX + col12 + col3 / 2, y + 6.6, { align: "center" });
  y += headerH;

  const empRows: { label: string; value: string; bold?: boolean }[] = [
    { label: "Name :", value: employeeName, bold: true },
    { label: "IC NO :", value: data.icNo || "", bold: true },
    { label: "Employee Code :", value: data.employeeCode || "" },
    { label: "Department :", value: data.department || "" },
    { label: "Job Title :", value: data.jobTitle || "" },
  ];
  const labelW = 38;
  const valueW = col12 - labelW - 6;
  let empInnerH = 6;
  setTimes(doc, "normal", 11);
  for (const row of empRows) {
    const lines = doc.splitTextToSize(row.value || " ", valueW) as string[];
    empInnerH += Math.max(6.2, lines.length * 5.2);
  }
  const empH = Math.max(42, empInnerH);

  drawBox(doc, tableX, y, col12, empH);
  drawBox(doc, x3, y, col3, empH);
  doc.line(tableX + labelW, y, tableX + labelW, y + empH);

  let rowY = y + 7;
  for (const row of empRows) {
    setTimes(doc, "normal", 11);
    doc.text(row.label, tableX + 3, rowY);
    setTimes(doc, row.bold ? "bold" : "normal", 11);
    const lines = doc.splitTextToSize(row.value || "", valueW) as string[];
    doc.text(lines, tableX + labelW + 3, rowY);
    const rowH = Math.max(6.2, lines.length * 5.2);
    if (row.label === "Name :") {
      doc.setLineWidth(0.7);
      doc.line(tableX + labelW, rowY + 2.4, tableX + col12, rowY + 2.4);
    }
    rowY += rowH;
  }

  setTimes(doc, "normal", 11);
  doc.text("Deduction", x3 + 3, y + 7);
  y += empH;

  const payH = 58;
  const otherH = 8;
  const leftPayH = payH + otherH;
  drawBox(doc, tableX, y, col12, leftPayH);
  drawBox(doc, x3, y, col3, payH);
  drawBox(doc, x3, y + payH, col3, otherH);

  setTimes(doc, "normal", 11);
  doc.text("Payment :", tableX + 3, y + 8);

  const payItems: { label: string; value: string; gapBefore?: number }[] = [
    { label: "Basic Rate", value: money(data.basicRate) },
    { label: "Working Days", value: workingDays(data.workingDays) },
    { label: "Basic Pay", value: money(data.basicPay) },
    { label: "Overtime", value: money(data.overtime), gapBefore: 16 },
    { label: "Allowance", value: money(data.allowance) },
  ];
  let payY = y + 16;
  for (const item of payItems) {
    if (item.gapBefore) payY += item.gapBefore;
    setTimes(doc, "normal", 11);
    doc.text(item.label, tableX + 3, payY);
    doc.text(item.value, tableX + col12 - 3, payY, { align: "right" });
    payY += 6;
  }

  setTimes(doc, "normal", 11);
  doc.text(`Employee Amount = SGD ${money(data.employeeCpf)}`, x3 + 3, y + 36);
  doc.text(`Employer Amount = SGD ${money(data.employerCpf)}`, x3 + 3, y + 43);
  doc.text(`Other : ${money(data.otherDeductions)}`, x3 + 3, y + payH + 5.6);
  y += leftPayH;

  const grossH = 10;
  drawBox(doc, tableX, y, col12, grossH);
  drawBox(doc, x3, y, col3, grossH);
  setTimes(doc, "normal", 11);
  doc.text("Gross pay", tableX + 3, y + 6.6);
  doc.text(money(data.grossPay), tableX + col12 - 3, y + 6.6, { align: "right" });
  setTimes(doc, "bold", 11);
  doc.text(`Monthly Gross : SGD ${money(data.grossPay)}`, x3 + 3, y + 6.6);
  y += grossH;

  const netH = 22;
  drawBox(doc, tableX, y, col12, netH);
  drawBox(doc, x3, y, col3, netH);
  setTimes(doc, "normal", 11);
  doc.text("Employee CPF", tableX + 3, y + 7);
  doc.text(money(data.employeeCpf), tableX + col12 - 3, y + 7, { align: "right" });
  setTimes(doc, "bold", 11);
  doc.text("Net Pay", tableX + 3, y + 16.5);
  doc.text(money(data.netPay), tableX + col12 - 3, y + 16.5, { align: "right" });
  y += netH;

  const sigH = 28;
  drawBox(doc, tableX, y, col1, sigH);
  drawBox(doc, x2, y, col2, sigH);
  drawBox(doc, x3, y, col3, sigH);
  setTimes(doc, "normal", 11);
  doc.text("Employee", tableX + col1 - 3, y + sigH - 6, { align: "right" });

  const lineY = y + sigH - 12;
  doc.setLineWidth(0.7);
  doc.line(x2 + 2, lineY, x2 + col2 - 2, lineY);
  doc.line(x3 + 2, lineY, x3 + col3 - 2, lineY);

  setTimes(doc, "bold", 11);
  const empSigSize = fitText(doc, employeeName, col2 - 6, 11, 8);
  doc.setFontSize(empSigSize);
  doc.text(employeeName, x2 + 3, lineY + 6);
  const coSigSize = fitText(doc, companyName, col3 - 6, 11, 8);
  doc.setFontSize(coSigSize);
  doc.text(companyName, x3 + 3, lineY + 6);

  y += sigH + 10;
  setTimes(doc, "bold", 11);
  doc.text("***Computer Generated Payslip, No Signature Required***", pageW / 2, y, {
    align: "center",
  });

  const filename = options?.filename || payslipPdfFilename(employeeName, data.month, data.year);
  if (options?.returnBase64) return doc.output("datauristring").split(",")[1];
  doc.save(filename);
}

function sumComponentMap(value: unknown): number {
  if (!value || typeof value !== "object" || Array.isArray(value)) return 0;
  return Object.values(value as Record<string, unknown>).reduce(
    (sum, item) => sum + (Number(item) || 0),
    0,
  );
}

export function isPayslipPdfData(value: unknown): value is PayslipPdfData {
  if (!value || typeof value !== "object") return false;
  const data = value as PayslipPdfData;
  return Boolean(data.employeeName) && Number(data.month) > 0 && Number(data.year) > 0;
}

export function buildPayslipPdfData(input: {
  config: {
    employeeId: number;
    employeeName: string;
    department: string;
    designation: string;
    baseSalary: string;
    allowances?: Record<string, number> | null;
    deductions?: Record<string, number> | null;
    cpfAmount?: string;
    employerCpfAmount?: string;
  };
  employee?: {
    id?: number;
    employeeId?: string;
    name?: string;
    department?: string;
    designation?: string;
    nricNumber?: string | null;
    passportNumber?: string | null;
  } | null;
  record: {
    payPeriodStart?: string;
    payPeriodEnd?: string;
    grossPay?: string | number;
    netPay?: string | number;
    cpfDeduction?: string | number;
    cpfEmployee?: string | number;
    cpfEmployer?: string | number;
    overtimePay?: string | number;
    overtimeHours?: string | number;
    baseSalary?: string | number;
    allowances?: Record<string, number> | null;
    deductions?: Record<string, number> | null;
  };
  company?: { name?: string | null; address?: string | null } | null;
  month: number;
  year: number;
  payPeriodStart: string;
  payPeriodEnd: string;
}): PayslipPdfData {
  const { config, employee, record, company, month, year, payPeriodStart, payPeriodEnd } = input;
  const baseSalary = Number(record.baseSalary ?? config.baseSalary) || 0;
  return {
    companyName: company?.name || "",
    companyAddress: company?.address || "",
    employeeName: employee?.name || config.employeeName,
    employeeDbId: Number(employee?.id ?? config.employeeId),
    employeeCode: employee?.employeeId || String(config.employeeId),
    icNo: employee?.nricNumber || employee?.passportNumber || "",
    department: employee?.department || config.department || "",
    jobTitle: employee?.designation || config.designation || "",
    month,
    year,
    payPeriodStart: String(record.payPeriodStart || payPeriodStart).slice(0, 10),
    payPeriodEnd: String(record.payPeriodEnd || payPeriodEnd).slice(0, 10),
    basicRate: Number(config.baseSalary) || baseSalary,
    workingDays: null,
    basicPay: baseSalary,
    overtime: Number(record.overtimePay) || 0,
    allowance: sumComponentMap(record.allowances ?? config.allowances),
    grossPay: Number(record.grossPay) || 0,
    employeeCpf: Number(record.cpfDeduction ?? record.cpfEmployee) || Number(config.cpfAmount) || 0,
    netPay: Number(record.netPay) || 0,
    employerCpf: Number(record.cpfEmployer) || Number(config.employerCpfAmount) || 0,
    otherDeductions: sumComponentMap(record.deductions ?? config.deductions),
  };
}
