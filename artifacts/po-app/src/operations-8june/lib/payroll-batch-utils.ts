export function formatLocalDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function getCurrentPayPeriod() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const lastDay = new Date(year, month, 0).getDate();
  return {
    payPeriodStart: formatLocalDate(year, month, 1),
    payPeriodEnd: formatLocalDate(year, month, lastDay),
  };
}

/** Last fully completed calendar month — default for payroll processing forms. */
export function getLastCompletedPayPeriod(now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return getPayPeriodForMonth(d.getFullYear(), d.getMonth() + 1);
}

export const PAYROLL_CURRENT_MONTH_ERROR =
  "This month has not ended yet, so payroll cannot be processed.";

/** Payroll can only be processed for months that have fully ended. */
export function isPayPeriodEligibleForProcessing(
  payPeriodStart: string,
  payPeriodEnd?: string,
  now = new Date()
): boolean {
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const { year: startYear, month: startMonth } = derivePayrollMonthYear(payPeriodStart);
  if (startYear > currentYear) return false;
  if (startYear === currentYear && startMonth >= currentMonth) return false;

  if (payPeriodEnd) {
    const { year: endYear, month: endMonth } = derivePayrollMonthYear(payPeriodEnd);
    if (endYear > currentYear) return false;
    if (endYear === currentYear && endMonth >= currentMonth) return false;
  }

  return true;
}

export function getMaxSelectablePayPeriodDate(now = new Date()): string {
  return getLastCompletedPayPeriod(now).payPeriodEnd;
}

export function isPayPeriodDateDisabled(date: Date, now = new Date()): boolean {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  if (year > currentYear) return true;
  if (year === currentYear && month >= currentMonth) return true;
  return false;
}

export function getPayPeriodForMonth(year: number, month: number) {
  const lastDay = new Date(year, month, 0).getDate();
  return {
    payPeriodStart: formatLocalDate(year, month, 1),
    payPeriodEnd: formatLocalDate(year, month, lastDay),
  };
}

/** Normalize any date to the first and last day of its calendar month */
export function normalizePayPeriodFromDate(dateStr: string) {
  const normalized = dateStr?.slice(0, 10) ?? "";
  const [yearStr, monthStr] = normalized.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return getCurrentPayPeriod();
  }
  return getPayPeriodForMonth(year, month);
}

export function derivePayrollMonthYear(payPeriodStart: string) {
  const normalized = payPeriodStart.slice(0, 10);
  const [yearStr, monthStr] = normalized.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  return {
    year: Number.isFinite(year) ? year : 0,
    month: Number.isFinite(month) ? month : 0,
    monthLabel:
      Number.isFinite(month) && Number.isFinite(year)
        ? formatPayrollMonthLabel(year, month)
        : "",
  };
}

export function formatPayrollMonthLabel(year: number, month: number) {
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return `${monthNames[month - 1]} ${year}`;
}

export function toDateOnly(value: string | Date | null | undefined): string {
  if (!value) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return formatLocalDate(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }
  return String(value).slice(0, 10);
}

export function payPeriodOverlapsMonth(
  payPeriodStart: string,
  payPeriodEnd: string,
  year: number,
  month: number
): boolean {
  const { payPeriodStart: monthStart, payPeriodEnd: monthEnd } = getPayPeriodForMonth(year, month);
  const start = toDateOnly(payPeriodStart);
  const end = toDateOnly(payPeriodEnd);
  return start <= monthEnd && end >= monthStart;
}

export function isPayslipMonthSelectable(
  year: number,
  month: number,
  now = new Date()
): boolean {
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  if (year > currentYear) return false;
  // Payslips are only available after the calendar month ends.
  if (year === currentYear && month >= currentMonth) return false;
  return true;
}

export function getProcessedMonthsForEmployee(
  employeeDbId: number,
  year: number,
  records: any[]
): number[] {
  const months: number[] = [];
  for (let m = 1; m <= 12; m++) {
    const hasRecord = records.some(
      (record) =>
        Number(record.employeeId) === Number(employeeDbId) &&
        payPeriodOverlapsMonth(record.payPeriodStart, record.payPeriodEnd, year, m)
    );
    if (hasRecord) months.push(m);
  }
  return months;
}

/** Processed months that can be selected for payslip view/download. */
export function getAvailablePayslipMonthsForEmployee(
  employeeDbId: number,
  year: number,
  records: any[],
  now = new Date()
): number[] {
  return getProcessedMonthsForEmployee(employeeDbId, year, records).filter((month) =>
    isPayslipMonthSelectable(year, month, now)
  );
}

export function isPayrollProcessedForPeriod(
  employeeDbId: number,
  records: any[],
  payPeriodStart: string,
  payPeriodEnd: string
) {
  return Boolean(findPayrollRecordForPeriod(employeeDbId, records, payPeriodStart, payPeriodEnd));
}

function normalizePayrollComponentMap(value: unknown): string {
  const obj = (
    value && typeof value === "object" && !Array.isArray(value) ? value : {}
  ) as Record<string, unknown>;
  const entries = Object.entries(obj)
    .map(([key, val]) => [key, Number(val) || 0] as const)
    .filter(([, num]) => num !== 0)
    .sort(([a], [b]) => a.localeCompare(b));

  return JSON.stringify(Object.fromEntries(entries));
}

export function findPayrollRecordForPeriod(
  employeeDbId: number,
  records: any[],
  payPeriodStart: string,
  payPeriodEnd: string
) {
  const start = toDateOnly(payPeriodStart);
  const { year, month } = derivePayrollMonthYear(start);

  return records
    .filter((record) => record.employeeId === employeeDbId)
    .filter(
      (record) =>
        (record.payrollYear === year && record.payrollMonth === month) ||
        payPeriodOverlapsMonth(record.payPeriodStart, record.payPeriodEnd, year, month)
    )
    .sort((a, b) => {
      const aTime = new Date(a.updatedAt || a.createdAt || 0).getTime();
      const bTime = new Date(b.updatedAt || b.createdAt || 0).getTime();
      return bTime - aTime;
    })[0];
}

export function hasPayrollDataChanged(
  config: any,
  record: any,
  requestedOvertimeHours = 0
) {
  if (!config || !record) return false;
  if (record.payrollConfigId != null && Number(record.payrollConfigId) !== Number(config.id)) {
    return true;
  }
  if (Number(record.baseSalary) !== Number(config.baseSalary)) return true;
  if (
    normalizePayrollComponentMap(record.allowances) !==
    normalizePayrollComponentMap(config.allowances)
  ) {
    return true;
  }
  if (
    normalizePayrollComponentMap(record.deductions) !==
    normalizePayrollComponentMap(config.deductions)
  ) {
    return true;
  }
  if (Number(requestedOvertimeHours) !== Number(record.overtimeHours ?? 0)) return true;
  if (config.updatedAt && record.updatedAt) {
    return new Date(config.updatedAt).getTime() > new Date(record.updatedAt).getTime();
  }
  return false;
}

export type BatchPayrollScenario = "pending" | "values-changed" | "no-changes";

export interface BatchPayrollSummary {
  totalEmployees: number;
  processedNew: number;
  updated: number;
  skipped: number;
  failures: { employeeName: string; message: string }[];
}

export interface BatchPayrollStatus {
  scenario: BatchPayrollScenario;
  pendingCount: number;
  changedCount: number;
  unchangedCount: number;
  pendingConfigIds: number[];
  changedConfigIds: number[];
}

export function resolveBatchPayrollStatus(
  configs: { id: number; employeeId: number; isActive?: boolean }[],
  records: any[],
  payPeriodStart: string,
  payPeriodEnd: string
): BatchPayrollStatus {
  const activeConfigs = configs.filter((config) => config.isActive !== false);
  const pendingConfigIds: number[] = [];
  const changedConfigIds: number[] = [];

  for (const config of activeConfigs) {
    const existing = findPayrollRecordForPeriod(
      config.employeeId,
      records,
      payPeriodStart,
      payPeriodEnd
    );
    if (!existing) {
      pendingConfigIds.push(config.id);
    } else if (hasPayrollDataChanged(config, existing, 0)) {
      changedConfigIds.push(config.id);
    }
  }

  const scenario: BatchPayrollScenario =
    pendingConfigIds.length > 0
      ? "pending"
      : changedConfigIds.length > 0
        ? "values-changed"
        : "no-changes";

  return {
    scenario,
    pendingCount: pendingConfigIds.length,
    changedCount: changedConfigIds.length,
    unchangedCount: activeConfigs.length - pendingConfigIds.length - changedConfigIds.length,
    pendingConfigIds,
    changedConfigIds,
  };
}

function parseFilenameFromDisposition(disposition: string | null, fallback: string): string {
  if (!disposition) return fallback;
  const match = disposition.match(/filename\*?=(?:UTF-8''|")?([^";]+)/i);
  return match?.[1]?.replace(/"/g, "") || fallback;
}

function triggerBrowserDownload(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.style.display = "none";
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  window.URL.revokeObjectURL(url);
  anchor.remove();
}

function isPdfArrayBuffer(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 4) return false;
  const bytes = new Uint8Array(buffer, 0, 4);
  return bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
}

function isZipArrayBuffer(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 2) return false;
  const bytes = new Uint8Array(buffer, 0, 2);
  return bytes[0] === 0x50 && bytes[1] === 0x4b;
}

export async function downloadPayrollFileResponse(
  res: Response,
  fallbackFilename: string
): Promise<{ ok: true; action?: string } | { ok: false; message: string; summary?: BatchPayrollSummary }> {
  const summaryHeader = res.headers.get("X-Payroll-Summary");
  const summary = summaryHeader ? (JSON.parse(summaryHeader) as BatchPayrollSummary) : undefined;

  if (!res.ok) {
    try {
      const data = await res.json();
      return { ok: false, message: data.message || "Processing failed", summary: data.summary };
    } catch {
      return { ok: false, message: "Processing failed", summary };
    }
  }

  const arrayBuffer = await res.arrayBuffer();

  if (isPdfArrayBuffer(arrayBuffer)) {
    const blob = new Blob([arrayBuffer], { type: "application/pdf" });
    const filename = parseFilenameFromDisposition(
      res.headers.get("Content-Disposition"),
      fallbackFilename
    );
    triggerBrowserDownload(blob, filename);
    return { ok: true, action: res.headers.get("X-Payroll-Action") || undefined };
  }

  if (isZipArrayBuffer(arrayBuffer)) {
    const blob = new Blob([arrayBuffer], { type: "application/zip" });
    const filename = parseFilenameFromDisposition(
      res.headers.get("Content-Disposition"),
      fallbackFilename.endsWith(".zip") ? fallbackFilename : `${fallbackFilename}.zip`
    );
    triggerBrowserDownload(blob, filename);
    return { ok: true };
  }

  try {
    const data = JSON.parse(new TextDecoder().decode(arrayBuffer));
    return { ok: false, message: data.message || "Processing failed", summary: data.summary };
  } catch {
    return { ok: false, message: "Server did not return a valid payslip file", summary };
  }
}

export async function processIndividualPayrollForConfig(
  config: any,
  payPeriodStart: string,
  payPeriodEnd: string,
  overtimeHours = 0,
  notes = "",
  options?: { forceOverwrite?: boolean }
) {
  const res = await fetch("/api/payroll/process/individual", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      payrollConfigId: config.id,
      payPeriodStart,
      payPeriodEnd,
      overtimeHours,
      notes,
      forceOverwrite: options?.forceOverwrite === true,
    }),
  });

  if (res.status === 409) {
    const data = await res.json().catch(() => ({}));
    if (options?.forceOverwrite === true) {
      return {
        ok: false as const,
        message:
          data.message ||
          "Payroll could not be overwritten. Please try again or contact support.",
      };
    }
    return {
      ok: false as const,
      alreadyProcessed: true as const,
      dataChanged: data.dataChanged === true,
      message: data.message || "Payroll for this period has already been processed.",
      action: data.action as string | undefined,
    };
  }

  const month = parseInt(payPeriodStart.slice(5, 7), 10);
  const year = parseInt(payPeriodStart.slice(0, 4), 10);
  const fallbackFilename = `Payslip_${config.employeeName?.replace(/[^a-zA-Z0-9]+/g, "_") || "Employee"}_${formatPayrollMonthLabel(year, month).replace(" ", "_")}.pdf`;

  return downloadPayrollFileResponse(res, fallbackFilename);
}

export async function batchProcessPayrollForPeriod(
  payPeriodStart: string,
  payPeriodEnd: string,
  payrollConfigIds?: number[],
  options?: { forceOverwrite?: boolean; processScope?: "pending" | "changed" }
) {
  const res = await fetch("/api/payroll/process/batch", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      payPeriodStart,
      payPeriodEnd,
      payrollConfigIds,
      forceOverwrite: options?.forceOverwrite === true,
      processScope: options?.processScope,
    }),
  });

  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const data = await res.json();
    if (data.scenario === "no-changes" || data.needsNoChangesNotice) {
      return {
        ok: false as const,
        alreadyProcessed: true as const,
        scenario: "no-changes" as const,
        message: data.message as string,
        summary: data.summary as BatchPayrollSummary | undefined,
      };
    }
    if (data.needsOverwriteConfirmation || data.scenario === "values-changed") {
      return {
        ok: false as const,
        alreadyProcessed: true as const,
        needsOverwriteConfirmation: true as const,
        scenario: "values-changed" as const,
        message: data.message as string,
        summary: data.summary as BatchPayrollSummary | undefined,
      };
    }
    if (data.scenario === "pending" || data.needsPendingConfirmation) {
      return {
        ok: false as const,
        scenario: "pending" as const,
        needsPendingConfirmation: true as const,
        message: data.message as string,
        summary: data.summary as BatchPayrollSummary | undefined,
      };
    }
    return {
      ok: false as const,
      message: data.message || "Processing failed",
      summary: data.summary as BatchPayrollSummary | undefined,
      alreadyProcessed: false as const,
    };
  }

  const summaryHeader = res.headers.get("X-Payroll-Summary");
  const summary = summaryHeader ? (JSON.parse(summaryHeader) as BatchPayrollSummary) : undefined;
  const { monthLabel } = derivePayrollMonthYear(payPeriodStart);
  const fallbackFilename = `Payslips_${monthLabel.replace(" ", "_")}.zip`;

  const result = await downloadPayrollFileResponse(res, fallbackFilename);
  return { ...result, summary };
}

export function getUniquePayrollRecords(records: any[] = []) {
  const seen = new Set<string>();
  return records.filter((rec) => {
    const key = `${rec.employeeId}-${rec.payPeriodStart}-${rec.payPeriodEnd}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function hasProcessedPayrollForEmployee(employeeDbId: number, records: any[], now = new Date()): boolean {
  const years = new Set<number>();
  for (const record of records) {
    if (Number(record.employeeId) !== Number(employeeDbId)) continue;
    const { year } = derivePayrollMonthYear(record.payPeriodStart);
    if (year) years.add(year);
  }

  for (const year of years) {
    if (getAvailablePayslipMonthsForEmployee(employeeDbId, year, records, now).length > 0) {
      return true;
    }
  }

  return false;
}

export async function downloadPayslipForConfig(
  config: any,
  payPeriodStart?: string,
  payPeriodEnd?: string
) {
  const res = await fetch("/api/payroll/payslips/download-config", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      payrollConfigId: config.id,
      payPeriodStart,
      payPeriodEnd,
    }),
  });

  const month = payPeriodStart
    ? parseInt(payPeriodStart.slice(5, 7), 10)
    : new Date().getMonth() + 1;
  const year = payPeriodStart
    ? parseInt(payPeriodStart.slice(0, 4), 10)
    : new Date().getFullYear();
  const fallbackFilename = `Payslip_${config.employeeName?.replace(/[^a-zA-Z0-9]+/g, "_") || "Employee"}_${formatPayrollMonthLabel(year, month).replace(" ", "_")}.pdf`;

  return downloadPayrollFileResponse(res, fallbackFilename);
}
