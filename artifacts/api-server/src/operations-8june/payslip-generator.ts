import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer";
import {
  formatPayrollMonthLabel,
  normalizePayPeriodDate,
} from "./payroll-date-utils";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const payslipsRoot = path.join(__dirname, "..", "uploads", "payslips");

export function ensurePayslipsDirectory(): void {
  if (!fs.existsSync(payslipsRoot)) {
    fs.mkdirSync(payslipsRoot, { recursive: true });
  }
}

export function getEmployeeNamePart(employeeName: string): string {
  const first = employeeName.trim().split(/\s+/)[0] || "Employee";
  return first.replace(/[^a-zA-Z0-9]/g, "") || "Employee";
}

export function getEmployeeFolderName(employeeName: string, employeeId: number): string {
  return `${getEmployeeNamePart(employeeName)}_${employeeId}`;
}

export function getPayslipFileName(
  employeeName: string,
  employeeId: number,
  month: number,
  year: number,
): string {
  const monthName = formatPayrollMonthLabel(year, month).split(" ")[0];
  return `${getEmployeeNamePart(employeeName)}_${employeeId}_${monthName}${year}.pdf`;
}

/** User-facing download filename: Payslip_EMPLOYEE_NAME_MONTH_YEAR.pdf */
export function getPayslipDownloadFileName(
  employeeName: string,
  month: number,
  year: number,
): string {
  const safeName =
    employeeName
      .trim()
      .replace(/[^a-zA-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "Employee";
  const monthName = formatPayrollMonthLabel(year, month).split(" ")[0];
  return `Payslip_${safeName}_${monthName}_${year}.pdf`;
}

function formatAmount(value: string | number | null | undefined): string {
  const num = parseFloat(String(value ?? 0));
  return (Number.isFinite(num) ? num : 0).toFixed(2);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface PayslipData {
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
}

function formatPayslipMonthShort(month: number, year: number): string {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const safeMonth = month >= 1 && month <= 12 ? month : 1;
  return `${months[safeMonth - 1]}-${String(year).slice(-2)}`;
}

function formatPayslipShortDate(isoDate: string): string {
  const normalized = normalizePayPeriodDate(isoDate);
  const [yearStr, monthStr, dayStr] = normalized.split("-");
  if (!yearStr || !monthStr || !dayStr) return normalized;
  return `${dayStr}.${monthStr}.${yearStr.slice(-2)}`;
}

function formatWorkingDays(value: number | null | undefined): string {
  if (value == null) return "";
  const num = parseFloat(String(value));
  return (Number.isFinite(num) ? num : 0).toFixed(2);
}

/** Scale down long text so payslip cells stay within borders. */
function longTextSizeClass(
  value: string,
  options?: { medium?: number; long?: number; veryLong?: number },
): string {
  const len = (value || "").trim().length;
  const medium = options?.medium ?? 28;
  const long = options?.long ?? 40;
  const veryLong = options?.veryLong ?? 55;
  if (len >= veryLong) return "text-very-long";
  if (len >= long) return "text-long";
  if (len >= medium) return "text-medium";
  return "";
}

function isLongIcNo(value: string): boolean {
  return (value || "").trim().length > 18;
}

export function buildPayslipHtml(data: PayslipData): string {
  const payPeriodStart = normalizePayPeriodDate(data.payPeriodStart);
  const payPeriodEnd = normalizePayPeriodDate(data.payPeriodEnd);
  const payrollMonthShort = formatPayslipMonthShort(data.month, data.year);
  const periodRange = `${formatPayslipShortDate(payPeriodStart)} - ${formatPayslipShortDate(payPeriodEnd)}`;

  const companyName = escapeHtml(data.companyName || "");
  const companyAddress = escapeHtml(data.companyAddress || "");
  const employeeName = escapeHtml(data.employeeName || "");
  const employeeNameClass = longTextSizeClass(data.employeeName || "");
  const icNo = escapeHtml(data.icNo || "");
  const icNoClass = isLongIcNo(data.icNo || "") ? "ic-value" : "";
  const employeeCode = escapeHtml(data.employeeCode || "");
  const department = escapeHtml(data.department || "");
  const jobTitle = escapeHtml(data.jobTitle || "");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
:root {
  --payslip-border: 3px solid #000;
}

@page {
  size: A4 portrait;
  margin: 0;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: "Times New Roman", Times, serif;
  font-size: 14px;
  color: #000;
  background: #fff;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

.page {
  width: 210mm;
  min-height: 297mm;
  margin: 0 auto;
  padding: 25px;
  background: #fff;
}

.company-name {
  text-align: center;
  font-size: 22px;
  font-weight: bold;
  color: #3E67C5;
  line-height: 1.25;
}

.company-address {
  text-align: center;
  font-size: 15px;
  font-weight: normal;
  color: #000;
  line-height: 1.4;
  margin-top: 4px;
  margin-bottom: 60px;
}

.payslip {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  border: var(--payslip-border);
}

.payslip td {
  border: var(--payslip-border);
  vertical-align: top;
  font-size: 14px;
  color: #000;
  background: #fff;
}

.row-payslip-header td {
  font-weight: 600;
  font-size: 16px;
  padding: 8px 10px;
  vertical-align: middle;
  height: 36px;
  border-top: var(--payslip-border);
  border-bottom: var(--payslip-border);
  border-left: none;
  border-right: none;
}

.row-payslip-header td:first-child {
  border-left: var(--payslip-border);
  text-align: left;
  text-transform: uppercase;
  padding-left: 10px;
}

.row-payslip-header td:nth-child(2) {
  text-align: center;
}

.row-payslip-header td:last-child {
  border-right: var(--payslip-border);
  text-align: center;
}

.cell-employee {
  padding: 0;
  vertical-align: top;
}

.emp-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.emp-table td {
  border: none;
  padding: 3px 10px;
  font-size: 14px;
  vertical-align: middle;
  text-align: left;
}

.emp-table td.label {
  width: 130px;
  border-right: var(--payslip-border);
  white-space: nowrap;
  font-weight: normal;
}

.emp-table td.value {
  font-weight: normal;
  word-break: break-word;
  overflow-wrap: anywhere;
  line-height: 1.35;
  padding-top: 4px;
  padding-bottom: 4px;
}

.emp-table td.value.text-medium {
  font-size: 13px;
  line-height: 1.3;
}

.emp-table td.value.text-long {
  font-size: 12px;
  line-height: 1.28;
}

.emp-table td.value.text-very-long {
  font-size: 11px;
  line-height: 1.22;
}

.emp-table td.value.ic-value {
  font-size: 11px;
  line-height: 1.25;
  word-break: break-all;
}

.emp-table .value-semibold {
  font-weight: 600;
}

.emp-row-name td.label,
.emp-row-ic td.label {
  border-top: none;
  border-bottom: none;
}

.emp-row-name td.value {
  border-bottom: var(--payslip-border);
}

.cell-deduction-title {
  padding: 8px 10px;
  font-size: 14px;
  font-weight: normal;
}

.cell-payment {
  padding: 8px 10px 10px;
}

.payslip td.cell-summary-gross {
  padding: 8px 10px 2px;
  border-bottom: none;
}

.payslip td.cell-monthly-gross {
  padding: 2px 10px;
  font-size: 14px;
  font-weight: bold;
  vertical-align: middle;
  border-bottom: none;
}

.payslip td.cell-summary-left {
  padding: 8px 10px 12px;
  border-top: none;
}

.payslip td.cell-summary-right-empty {
  padding: 0;
  vertical-align: top;
  border-top: none;
}

.payment-table,
.summary-table {
  width: 100%;
  border-collapse: collapse;
}

.payment-table td,
.summary-table td {
  border: none;
  padding: 2px 0;
  font-size: 14px;
  vertical-align: top;
}

.payment-table .label-cell,
.summary-table .label-cell {
  text-align: left;
}

.payment-table .amount-cell,
.summary-table .amount-cell {
  text-align: right;
  width: 90px;
  white-space: nowrap;
  padding-right: 2px;
}

.payment-title td {
  padding-bottom: 16px;
}

.payment-spacer td {
  height: 110px;
  padding: 0;
  border: none;
}

.cell-cpf {
  padding: 8px 10px;
  font-size: 14px;
  line-height: 1.6;
  vertical-align: top;
}

.cpf-block {
  padding-top: 72px;
}

.cell-other-inline {
  padding: 2px 10px;
  font-size: 14px;
  vertical-align: middle;
}

.summary-spacer td {
  height: 18px;
  padding: 0;
  border: none;
}

.summary-net .label-cell,
.summary-net .amount-cell {
  font-weight: bold;
}

.row-signature td {
  padding: 0 0 6px;
  height: auto;
  min-height: 88px;
  vertical-align: bottom;
}

.row-signature td:first-child {
  font-size: 14px;
  font-weight: normal;
  text-align: right;
  padding: 0 10px 10px;
  vertical-align: bottom;
}

.signature-line-block {
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  min-height: 88px;
  height: 100%;
  padding: 0 0 10px;
  box-sizing: border-box;
}

.signature-space {
  flex: 1 1 auto;
  min-height: 20px;
}

.signature-line {
  display: block;
  width: 100%;
  height: 3px;
  margin: 0;
  padding: 0;
  background: #000;
  border: none;
}

.signature-text {
  font-size: 15px;
  font-weight: 600;
  text-align: left;
  line-height: 1.2;
  margin-top: 6px;
  padding: 0 10px;
  word-break: break-word;
  overflow-wrap: anywhere;
  max-width: 100%;
}

.signature-text.text-medium {
  font-size: 13px;
  line-height: 1.18;
}

.signature-text.text-long {
  font-size: 11px;
  line-height: 1.15;
}

.signature-text.text-very-long {
  font-size: 9px;
  line-height: 1.12;
}

.footer-note {
  text-align: center;
  font-size: 14px;
  font-weight: bold;
  margin-top: 18px;
  color: #000;
}
</style>
</head>
<body>
<div class="page">

<div class="company-name">${companyName}</div>
<div class="company-address">${companyAddress}</div>

<table class="payslip">
<colgroup>
  <col style="width:30%">
  <col style="width:30%">
  <col style="width:40%">
</colgroup>
<tr class="row-payslip-header">
  <td>PAYSLIP</td>
  <td>${escapeHtml(payrollMonthShort)}</td>
  <td>${escapeHtml(periodRange)}</td>
</tr>

<tr>
  <td colspan="2" class="cell-employee">
    <table class="emp-table">
      <tr class="emp-row-name">
        <td class="label">Name :</td>
        <td class="value value-semibold ${employeeNameClass}">${employeeName}</td>
      </tr>
      <tr class="emp-row-ic">
        <td class="label">IC NO :</td>
        <td class="value value-semibold ${icNoClass}">${icNo}</td>
      </tr>
      <tr>
        <td class="label">Employee Code :</td>
        <td class="value">${employeeCode}</td>
      </tr>
      <tr>
        <td class="label">Department :</td>
        <td class="value">${department}</td>
      </tr>
      <tr>
        <td class="label">Job Title :</td>
        <td class="value">${jobTitle}</td>
      </tr>
    </table>
  </td>
  <td class="cell-deduction-title">Deduction</td>
</tr>

<tr>
  <td colspan="2" rowspan="2" class="cell-payment">
    <table class="payment-table">
      <tr class="payment-title">
        <td colspan="2">Payment :</td>
      </tr>
      <tr>
        <td class="label-cell">Basic Rate</td>
        <td class="amount-cell">${formatAmount(data.basicRate)}</td>
      </tr>
      <tr>
        <td class="label-cell">Working Days</td>
        <td class="amount-cell">${formatWorkingDays(data.workingDays)}</td>
      </tr>
      <tr>
        <td class="label-cell">Basic Pay</td>
        <td class="amount-cell">${formatAmount(data.basicPay)}</td>
      </tr>
      <tr class="payment-spacer">
        <td colspan="2"></td>
      </tr>
      <tr>
        <td class="label-cell">Overtime</td>
        <td class="amount-cell">${formatAmount(data.overtime)}</td>
      </tr>
      <tr>
        <td class="label-cell">Allowance</td>
        <td class="amount-cell">${formatAmount(data.allowance)}</td>
      </tr>
    </table>
  </td>
  <td class="cell-cpf">
    <div class="cpf-block">
      Employee Amount = SGD ${formatAmount(data.employeeCpf)}<br>
      Employer Amount = SGD ${formatAmount(data.employerCpf)}
    </div>
  </td>
</tr>

<tr class="row-allowance-other">
  <td class="cell-other-inline">Other : ${formatAmount(data.otherDeductions)}</td>
</tr>

<tr class="row-gross-monthly">
  <td colspan="2" class="cell-summary-gross">
    <table class="summary-table">
      <tr>
        <td class="label-cell">Gross pay</td>
        <td class="amount-cell">${formatAmount(data.grossPay)}</td>
      </tr>
    </table>
  </td>
  <td class="cell-monthly-gross">Monthly Gross : SGD ${formatAmount(data.grossPay)}</td>
</tr>

<tr>
  <td colspan="2" class="cell-summary-left">
    <table class="summary-table">
      <tr>
        <td class="label-cell">Employee CPF</td>
        <td class="amount-cell">${formatAmount(data.employeeCpf)}</td>
      </tr>
      <tr class="summary-spacer">
        <td colspan="2"></td>
      </tr>
      <tr class="summary-net">
        <td class="label-cell">Net Pay</td>
        <td class="amount-cell">${formatAmount(data.netPay)}</td>
      </tr>
    </table>
  </td>
  <td class="cell-summary-right-empty"></td>
</tr>

<tr class="row-signature">
  <td>Employee</td>
  <td>
    <div class="signature-line-block">
      <div class="signature-space"></div>
      <div class="signature-line"></div>
      <div class="signature-text ${employeeNameClass}">${employeeName}</div>
    </div>
  </td>
  <td>
    <div class="signature-line-block">
      <div class="signature-space"></div>
      <div class="signature-line"></div>
      <div class="signature-text ${longTextSizeClass(data.companyName || "", { medium: 30, long: 45, veryLong: 60 })}">${companyName}</div>
    </div>
  </td>
</tr>
</table>

<div class="footer-note">***Computer Generated Payslip, No Signature Required***</div>

</div>
</body>
</html>`;
}

function isPdfBuffer(buffer: Buffer): boolean {
  return (
    buffer.length >= 4 &&
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46
  );
}

async function launchPuppeteerBrowser() {
  const launchOptions = {
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  };

  try {
    return await puppeteer.launch(launchOptions);
  } catch {
    return await puppeteer.launch({
      ...launchOptions,
      channel: "chrome",
    });
  }
}

export async function generatePayslipPdf(data: PayslipData): Promise<Buffer> {
  const html = buildPayslipHtml(data);
  let browser;
  try {
    browser = await launchPuppeteerBrowser();
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdfBytes = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });
    const pdfBuffer = Buffer.from(pdfBytes);
    if (!isPdfBuffer(pdfBuffer)) {
      throw new Error("Puppeteer did not return a valid PDF buffer");
    }
    return pdfBuffer;
  } finally {
    if (browser) await browser.close();
  }
}

export async function savePayslipPdf(
  data: PayslipData,
  pdfBuffer: Buffer,
): Promise<{ filename: string; relativePath: string; absolutePath: string }> {
  ensurePayslipsDirectory();
  const folderName = getEmployeeFolderName(data.employeeName, data.employeeDbId);
  const employeeDir = path.join(payslipsRoot, folderName);
  if (!fs.existsSync(employeeDir)) {
    fs.mkdirSync(employeeDir, { recursive: true });
  }

  const filename = getPayslipFileName(
    data.employeeName,
    data.employeeDbId,
    data.month,
    data.year,
  );
  const absolutePath = path.join(employeeDir, filename);
  if (!isPdfBuffer(pdfBuffer)) {
    throw new Error("Cannot save payslip: invalid PDF buffer");
  }
  await fs.promises.writeFile(absolutePath, pdfBuffer, { encoding: undefined });

  const relativePath = path.posix.join("uploads", "payslips", folderName, filename);
  return { filename, relativePath, absolutePath };
}
