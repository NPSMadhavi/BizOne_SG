import { Request, Response } from "express";
import dayjs from "dayjs";
import { and, eq } from "drizzle-orm";
import { db } from "./db";
import { tenantDbManager } from "./tenant-db-manager";
import { employeePayroll, payrollRecords, employees, tenants } from "@shared/schema";
import {
  BatchPayrollSummary,
  computeEmployerCpfForRecord,
  derivePayrollMonthYear,
  findPayrollRecordForPeriod,
  formatPayrollMonthLabel,
  getBatchZipNameFromPeriod,
  getPayPeriodForMonth,
  hasPayrollConfigChanged,
  normalizePayPeriodDate,
  parseForceOverwriteFlag,
  resolvePayrollMonthYearFromRecord,
  upsertPayrollRecord,
} from "./payroll-process-service";
import {
  generatePayslipPdf,
  getPayslipDownloadFileName,
  PayslipData,
  savePayslipPdf,
} from "./payslip-generator";
import {
  createPayslipZipArchive,
  getPayslipZipFileName,
  registerSessionPayslipZip,
  sendPayslipZipFile,
} from "./payslip-zip";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

async function getTenantPayrollDb(tenantId: number) {
  const tenantDb = await tenantDbManager.getTenantDatabase(tenantId);
  await tenantDbManager.ensurePayrollSchema(tenantId);
  return tenantDb;
}

async function getTenantSlug(tenantId: number): Promise<string | null> {
  if (!db) return null;
  const [tenant] = await db
    .select({ slug: tenants.slug, name: tenants.name, address: tenants.address })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  return tenant?.slug ?? null;
}

async function getTenantCompany(tenantId: number) {
  if (!db) return { companyName: "", address: "" };
  const [tenant] = await db
    .select({ name: tenants.name, address: tenants.address })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  return {
    companyName: tenant?.name || "",
    address: tenant?.address || "",
  };
}

function sumJsonValues(obj: Record<string, number> | null | undefined): number {
  if (!obj) return 0;
  return Object.values(obj).reduce((sum, v) => sum + (Number(v) || 0), 0);
}

function resolveEmployeeIcNo(employee: {
  nricNumber?: string | null;
  passportNumber?: string | null;
}): string {
  return employee.nricNumber || employee.passportNumber || "";
}

function buildPayslipFromProcessedRecord(
  record: {
    payPeriodStart: string | Date;
    payPeriodEnd: string | Date;
    baseSalary: string | number;
    overtimePay: string | number | null;
    allowances: Record<string, number> | null;
    deductions: Record<string, number> | null;
    grossPay: string | number;
    cpfDeduction: string | number | null;
    netPay: string | number;
  },
  config: { noOfWorkingDays?: number | null },
  employee: {
    id: number;
    employeeId: string;
    name: string;
    department: string;
    designation: string;
    nricNumber?: string | null;
    passportNumber?: string | null;
  },
  company: { companyName: string | null; address: string | null } | null,
  month: number,
  year: number,
  payPeriodStart: string,
  payPeriodEnd: string,
  employerCpf: number
): PayslipData {
  return {
    companyName: company?.companyName || "",
    companyAddress: company?.address || "",
    employeeName: employee.name,
    employeeDbId: employee.id,
    employeeCode: employee.employeeId,
    icNo: resolveEmployeeIcNo(employee),
    department: employee.department,
    jobTitle: employee.designation,
    month,
    year,
    payPeriodStart,
    payPeriodEnd,
    basicRate: parseFloat(String(record.baseSalary)),
    workingDays: config.noOfWorkingDays ?? null,
    basicPay: parseFloat(String(record.baseSalary)),
    overtime: parseFloat(String(record.overtimePay || 0)),
    allowance: sumJsonValues(record.allowances),
    grossPay: parseFloat(String(record.grossPay)),
    employeeCpf: parseFloat(String(record.cpfDeduction || 0)),
    netPay: parseFloat(String(record.netPay)),
    employerCpf,
    otherDeductions: sumJsonValues(record.deductions),
  };
}

function sendPdfBuffer(res: Response, pdfBuffer: Buffer, filename: string, inline = false): void {
  if (
    !Buffer.isBuffer(pdfBuffer) ||
    pdfBuffer.length < 4 ||
    pdfBuffer[0] !== 0x25 ||
    pdfBuffer[1] !== 0x50 ||
    pdfBuffer[2] !== 0x44 ||
    pdfBuffer[3] !== 0x46
  ) {
    throw new Error("Invalid PDF buffer");
  }

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `${inline ? "inline" : "attachment"}; filename="${filename}"`
  );
  res.setHeader("Content-Length", String(pdfBuffer.length));
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Cache-Control", "no-store");
  res.status(200).end(pdfBuffer);
}

async function resolvePayslipContext(req: Request, tenantId: number, payrollConfigIdNum: number) {
  const tenantDb = await getTenantPayrollDb(tenantId);

  const [config] = await tenantDb
    .select()
    .from(employeePayroll)
    .where(
      and(eq(employeePayroll.id, payrollConfigIdNum), eq(employeePayroll.tenantId, tenantId))
    );

  if (!config) {
    return { error: { status: 404, body: { message: "Payroll configuration not found" } } };
  }

  const [employee] = await tenantDb
    .select()
    .from(employees)
    .where(eq(employees.id, config.employeeId));

  if (!employee) {
    return { error: { status: 404, body: { message: "Employee not found" } } };
  }

  const company = await getTenantCompany(tenantId);
  return { config, employee, company, tenantDb };
}

async function generatePayslipBufferForRecord(
  tenantDb: Awaited<ReturnType<typeof getTenantPayrollDb>>,
  record: typeof payrollRecords.$inferSelect,
  config: typeof employeePayroll.$inferSelect,
  employee: typeof employees.$inferSelect,
  company: { companyName: string; address: string }
) {
  const payPeriodStart = normalizePayPeriodDate(record.payPeriodStart);
  const payPeriodEnd = normalizePayPeriodDate(record.payPeriodEnd);
  const { month, year } = resolvePayrollMonthYearFromRecord({
    payrollMonth: (record as any).payrollMonth,
    payrollYear: (record as any).payrollYear,
    payPeriodStart,
  });

  const employerCpf = computeEmployerCpfForRecord(record, employee, config);

  const payslipData = buildPayslipFromProcessedRecord(
    record,
    config,
    employee,
    company,
    month,
    year,
    payPeriodStart,
    payPeriodEnd,
    employerCpf
  );

  const pdfBuffer = await generatePayslipPdf(payslipData);
  await savePayslipPdf(payslipData, pdfBuffer);
  const downloadFilename = getPayslipDownloadFileName(employee.name, month, year);
  return { pdfBuffer, downloadFilename, payslipData };
}

async function generatePayslipFilesForMonths(
  tenantDb: Awaited<ReturnType<typeof getTenantPayrollDb>>,
  config: typeof employeePayroll.$inferSelect,
  employee: typeof employees.$inferSelect,
  company: { companyName: string; address: string },
  yearNum: number,
  validMonths: number[]
) {
  const generatedFiles: Array<{
    downloadFilename: string;
    buffer: Buffer;
  }> = [];
  const missingMonths: string[] = [];

  for (const month of validMonths) {
    const monthStart = `${yearNum}-${String(month).padStart(2, "0")}-01`;
    const monthEnd = dayjs(monthStart).endOf("month").format("YYYY-MM-DD");

    const record = await findPayrollRecordForPeriod(
      tenantDb,
      config.employeeId,
      monthStart,
      monthEnd
    );

    if (!record) {
      missingMonths.push(`${MONTH_NAMES[month - 1]} ${yearNum}`);
      continue;
    }

    const { pdfBuffer, downloadFilename } = await generatePayslipBufferForRecord(
      tenantDb,
      record,
      config,
      employee,
      company
    );

    generatedFiles.push({ downloadFilename, buffer: pdfBuffer });
  }

  return { generatedFiles, missingMonths };
}

export async function processIndividualPayroll(req: Request, res: Response) {
  try {
    const tenantId = req.user!.tenantId;
    if (!tenantId) {
      return res.status(403).json({ message: "No tenant associated with user" });
    }
    const userId = req.user!.id;
    const tenantSlug = await getTenantSlug(tenantId);
    if (!tenantSlug) {
      return res.status(400).json({ message: "Tenant not found" });
    }

    const {
      payrollConfigId,
      payPeriodStart,
      payPeriodEnd,
      overtimeHours = 0,
      notes = "",
      forceOverwrite = false,
    } = req.body;

    const payrollConfigIdNum = Number(payrollConfigId);
    if (!payrollConfigIdNum || !payPeriodStart || !payPeriodEnd) {
      return res.status(400).json({
        message: "payrollConfigId, payPeriodStart, and payPeriodEnd are required",
      });
    }

    const normalizedPayPeriodStart = normalizePayPeriodDate(payPeriodStart);
    const normalizedPayPeriodEnd = normalizePayPeriodDate(payPeriodEnd);

    if (normalizedPayPeriodEnd < normalizedPayPeriodStart) {
      return res.status(400).json({
        message: "Pay period end must be on or after pay period start",
      });
    }

    const ctx = await resolvePayslipContext(req, tenantId, payrollConfigIdNum);
    if ("error" in ctx && ctx.error) {
      return res.status(ctx.error.status).json(ctx.error.body);
    }

    const { config, employee, company, tenantDb } = ctx as Exclude<typeof ctx, { error: unknown }>;
    const forceOverwriteFlag = parseForceOverwriteFlag(forceOverwrite);

    const result = await upsertPayrollRecord(
      tenantDb,
      config,
      employee,
      normalizedPayPeriodStart,
      normalizedPayPeriodEnd,
      userId,
      tenantId,
      tenantSlug,
      {
        notes,
        overtimeHours: Number(overtimeHours) || 0,
        allowReprocess: true,
        forceUpdate: forceOverwriteFlag,
        requireForceForReprocess: true,
      }
    );

    if (result.action === "skipped") {
      const dataChanged = result.reason === "data_changed";
      const { monthLabel } = derivePayrollMonthYear(normalizedPayPeriodStart);
      return res.status(409).json({
        alreadyProcessed: true,
        dataChanged,
        message: dataChanged
          ? `Payroll for ${monthLabel} has already been processed. The payroll values have been modified.`
          : `Payroll for ${monthLabel} has already been processed. There are no changes to process.`,
        action: "skipped",
        record: result.record,
      });
    }

    if (!result.record) {
      return res.status(500).json({ message: "Failed to process payroll" });
    }

    const { pdfBuffer, downloadFilename } = await generatePayslipBufferForRecord(
      tenantDb,
      result.record,
      config,
      employee,
      company
    );

    res.setHeader("X-Payroll-Action", result.action);
    sendPdfBuffer(res, pdfBuffer, downloadFilename);
  } catch (error) {
    console.error("Error processing individual payroll:", error);
    const message = error instanceof Error ? error.message : "Failed to process payroll";
    res.status(500).json({ message });
  }
}

export async function batchProcessPayroll(req: Request, res: Response) {
  try {
    const tenantId = req.user!.tenantId;
    if (!tenantId) {
      return res.status(403).json({ message: "No tenant associated with user" });
    }
    const userId = req.user!.id;
    const tenantSlug = await getTenantSlug(tenantId);
    if (!tenantSlug) {
      return res.status(400).json({ message: "Tenant not found" });
    }

    const {
      payPeriodStart,
      payPeriodEnd,
      year,
      month,
      payrollConfigIds,
      forceOverwrite = false,
      processScope,
    } = req.body;

    let resolvedPayPeriodStart = normalizePayPeriodDate(payPeriodStart);
    let resolvedPayPeriodEnd = normalizePayPeriodDate(payPeriodEnd);

    if (!resolvedPayPeriodStart || !resolvedPayPeriodEnd) {
      const yearNum = Number(year);
      const monthNum = Number(month);
      if (!yearNum || !monthNum || monthNum < 1 || monthNum > 12) {
        return res.status(400).json({
          message: "Pay period start/end or valid year and month are required",
        });
      }
      const derived = getPayPeriodForMonth(yearNum, monthNum);
      resolvedPayPeriodStart = derived.payPeriodStart;
      resolvedPayPeriodEnd = derived.payPeriodEnd;
    }

    if (resolvedPayPeriodEnd < resolvedPayPeriodStart) {
      return res.status(400).json({
        message: "Pay period end must be on or after pay period start",
      });
    }

    const tenantDb = await getTenantPayrollDb(tenantId);

    let configs = await tenantDb
      .select()
      .from(employeePayroll)
      .where(and(eq(employeePayroll.isActive, true), eq(employeePayroll.tenantId, tenantId)));

    if (Array.isArray(payrollConfigIds) && payrollConfigIds.length > 0) {
      const idSet = new Set(payrollConfigIds.map(Number));
      configs = configs.filter((config) => idSet.has(config.id));
    }

    if (configs.length === 0) {
      return res.status(400).json({ message: "No active payroll configurations to process" });
    }

    const forceOverwriteFlag = parseForceOverwriteFlag(forceOverwrite);
    const pendingConfigs: typeof configs = [];
    const changedConfigs: typeof configs = [];

    for (const config of configs) {
      const existing = await findPayrollRecordForPeriod(
        tenantDb,
        config.employeeId,
        resolvedPayPeriodStart,
        resolvedPayPeriodEnd
      );
      if (!existing) {
        pendingConfigs.push(config);
        continue;
      }
      if (hasPayrollConfigChanged(config, existing, 0)) {
        changedConfigs.push(config);
      }
    }

    const buildStatusSummary = (): BatchPayrollSummary => ({
      totalEmployees: configs.length,
      processedNew: 0,
      updated: 0,
      skipped: configs.length - pendingConfigs.length - changedConfigs.length,
      failures: [],
    });

    if (!processScope && !forceOverwriteFlag) {
      if (pendingConfigs.length > 0) {
        return res.json({
          needsPendingConfirmation: true,
          scenario: "pending",
          message:
            "Payroll for the selected period has not been processed for some employees. Do you want to process payroll for all pending employees?",
          summary: buildStatusSummary(),
        });
      }

      if (changedConfigs.length > 0) {
        return res.json({
          needsOverwriteConfirmation: true,
          scenario: "values-changed",
          alreadyProcessed: true,
          message:
            "Payroll for the selected period has already been processed. Payroll values have been modified for one or more employees. Do you want to overwrite the existing payslips and regenerate them?",
          summary: buildStatusSummary(),
        });
      }

      return res.json({
        needsNoChangesNotice: true,
        scenario: "no-changes",
        alreadyProcessed: true,
        message:
          "Payroll for the selected period has already been processed. There are no changes to process.",
        summary: buildStatusSummary(),
      });
    }

    let configsToProcess: typeof configs = [];
    let useForceUpdate = forceOverwriteFlag;

    if (processScope === "pending") {
      configsToProcess = pendingConfigs;
      useForceUpdate = false;
    } else if (processScope === "changed" || forceOverwriteFlag) {
      configsToProcess = changedConfigs;
      useForceUpdate = true;
    } else {
      configsToProcess = [...pendingConfigs, ...changedConfigs];
    }

    if (configsToProcess.length === 0) {
      return res.json({
        needsNoChangesNotice: true,
        scenario: "no-changes",
        alreadyProcessed: true,
        message:
          "Payroll for the selected period has already been processed. There are no changes to process.",
        summary: buildStatusSummary(),
      });
    }

    const summary: BatchPayrollSummary = {
      totalEmployees: configs.length,
      processedNew: 0,
      updated: 0,
      skipped: configs.length - configsToProcess.length,
      failures: [],
    };

    const processedConfigIds = new Set<number>();
    const company = await getTenantCompany(tenantId);

    for (const config of configsToProcess) {
      const [employee] = await tenantDb
        .select()
        .from(employees)
        .where(eq(employees.id, config.employeeId));

      const employeeName = employee?.name || `Employee ${config.employeeId}`;

      if (!employee) {
        summary.failures.push({ employeeName, message: "Employee not found" });
        continue;
      }

      try {
        const result = await upsertPayrollRecord(
          tenantDb,
          config,
          employee,
          resolvedPayPeriodStart,
          resolvedPayPeriodEnd,
          userId,
          tenantId,
          tenantSlug,
          {
            notes: "Batch processed payroll",
            allowReprocess: true,
            forceUpdate: useForceUpdate,
            requireForceForReprocess: processScope === "changed",
          }
        );

        if (result.action === "skipped") {
          summary.skipped++;
          continue;
        }

        if (!result.record) {
          summary.failures.push({ employeeName, message: "Failed to save payroll record" });
          continue;
        }

        processedConfigIds.add(config.id);
        if (result.action === "created") summary.processedNew++;
        else if (result.action === "updated") summary.updated++;
      } catch (error) {
        summary.failures.push({
          employeeName,
          message: error instanceof Error ? error.message : "Processing failed",
        });
      }
    }

    const zipFiles: { filename: string; buffer: Buffer }[] = [];

    for (const config of configs.filter((item) => processedConfigIds.has(item.id))) {
      const employeeName =
        (
          await tenantDb
            .select({ name: employees.name })
            .from(employees)
            .where(eq(employees.id, config.employeeId))
            .limit(1)
        )[0]?.name || `Employee ${config.employeeId}`;

      try {
        const record = await findPayrollRecordForPeriod(
          tenantDb,
          config.employeeId,
          resolvedPayPeriodStart,
          resolvedPayPeriodEnd
        );
        if (!record) continue;

        const [employee] = await tenantDb
          .select()
          .from(employees)
          .where(eq(employees.id, config.employeeId));

        if (!employee) continue;

        const { pdfBuffer, downloadFilename } = await generatePayslipBufferForRecord(
          tenantDb,
          record,
          config,
          employee,
          company
        );

        zipFiles.push({ filename: downloadFilename, buffer: pdfBuffer });
      } catch (error) {
        summary.failures.push({
          employeeName,
          message: error instanceof Error ? error.message : "Failed to generate payslip",
        });
      }
    }

    if (zipFiles.length === 0) {
      return res.status(409).json({
        message: `No payslips generated. ${summary.skipped} employee(s) skipped.`,
        summary,
      });
    }

    const zipFilename = getBatchZipNameFromPeriod(resolvedPayPeriodStart);
    const zipPath = await createPayslipZipArchive(zipFiles);
    const sessionId = (req as any).session?.id as string | undefined;
    if (sessionId) {
      registerSessionPayslipZip(sessionId, zipPath);
    }

    res.setHeader("X-Payroll-Summary", JSON.stringify(summary));
    sendPayslipZipFile(res, zipPath, zipFilename, sessionId);
  } catch (error) {
    console.error("Error in batch payroll processing:", error);
    const message = error instanceof Error ? error.message : "Failed to batch process payroll";
    res.status(500).json({ message });
  }
}

export async function viewPayslip(req: Request, res: Response) {
  try {
    const tenantId = req.user!.tenantId;
    if (!tenantId) {
      return res.status(403).json({ message: "No tenant associated with user" });
    }

    const { payrollConfigId, year, month } = req.body;
    const payrollConfigIdNum = Number(payrollConfigId);
    const yearNum = Number(year);
    const monthNum = Number(month);

    if (!payrollConfigIdNum || !yearNum || !monthNum || monthNum < 1 || monthNum > 12) {
      return res.status(400).json({
        message: "payrollConfigId, year, and a valid month are required",
      });
    }

    const ctx = await resolvePayslipContext(req, tenantId, payrollConfigIdNum);
    if ("error" in ctx && ctx.error) {
      return res.status(ctx.error.status).json(ctx.error.body);
    }

    const { config, employee, company, tenantDb } = ctx as Exclude<typeof ctx, { error: unknown }>;
    const { generatedFiles, missingMonths } = await generatePayslipFilesForMonths(
      tenantDb,
      config,
      employee,
      company,
      yearNum,
      [monthNum]
    );

    if (generatedFiles.length === 0) {
      return res.status(404).json({
        message: `No processed payroll found for: ${missingMonths.join(", ") || "selected month"}. Please process payroll first.`,
        missingMonths,
      });
    }

    sendPdfBuffer(res, generatedFiles[0].buffer, generatedFiles[0].downloadFilename, true);
  } catch (error) {
    console.error("Error viewing payslip:", error);
    res.status(500).json({
      message: error instanceof Error ? error.message : "Failed to view payslip",
    });
  }
}

export async function downloadPayslips(req: Request, res: Response) {
  try {
    const tenantId = req.user!.tenantId;
    if (!tenantId) {
      return res.status(403).json({ message: "No tenant associated with user" });
    }

    const { payrollConfigId, year, months } = req.body;
    const payrollConfigIdNum = Number(payrollConfigId);
    const yearNum = Number(year);

    if (!payrollConfigIdNum || !yearNum || !Array.isArray(months) || months.length === 0) {
      return res.status(400).json({
        message: "payrollConfigId, year, and at least one month are required",
      });
    }

    const validMonths = months
      .map((m: number) => Number(m))
      .filter((m) => Number.isInteger(m) && m >= 1 && m <= 12);

    if (validMonths.length === 0) {
      return res.status(400).json({ message: "Invalid month selection" });
    }

    const ctx = await resolvePayslipContext(req, tenantId, payrollConfigIdNum);
    if ("error" in ctx && ctx.error) {
      return res.status(ctx.error.status).json(ctx.error.body);
    }

    const { config, employee, company, tenantDb } = ctx as Exclude<typeof ctx, { error: unknown }>;
    const { generatedFiles, missingMonths } = await generatePayslipFilesForMonths(
      tenantDb,
      config,
      employee,
      company,
      yearNum,
      validMonths
    );

    if (generatedFiles.length === 0) {
      return res.status(404).json({
        message: `No processed payroll found for: ${missingMonths.join(", ")}. Please process payroll for the selected month(s) first.`,
        missingMonths,
      });
    }

    if (generatedFiles.length === 1) {
      if (missingMonths.length > 0) {
        res.setHeader("X-Payslip-Missing-Months", missingMonths.join(", "));
      }
      sendPdfBuffer(res, generatedFiles[0].buffer, generatedFiles[0].downloadFilename);
      return;
    }

    const zipFilename = getPayslipZipFileName(employee.name, employee.id);
    const zipPath = await createPayslipZipArchive(generatedFiles);
    const sessionId = (req as any).session?.id as string | undefined;
    if (sessionId) {
      registerSessionPayslipZip(sessionId, zipPath);
    }
    if (missingMonths.length > 0) {
      res.setHeader("X-Payslip-Missing-Months", missingMonths.join(", "));
    }
    sendPayslipZipFile(res, zipPath, zipFilename, sessionId);
  } catch (error) {
    console.error("Error generating payslips:", error);
    res.status(500).json({
      message: error instanceof Error ? error.message : "Failed to generate payslips",
    });
  }
}

export async function downloadPayslipForConfig(req: Request, res: Response) {
  try {
    const tenantId = req.user!.tenantId;
    if (!tenantId) {
      return res.status(403).json({ message: "No tenant associated with user" });
    }

    const { payrollConfigId, payPeriodStart, payPeriodEnd } = req.body;
    const payrollConfigIdNum = Number(payrollConfigId);

    if (!payrollConfigIdNum) {
      return res.status(400).json({ message: "payrollConfigId is required" });
    }

    const ctx = await resolvePayslipContext(req, tenantId, payrollConfigIdNum);
    if ("error" in ctx && ctx.error) {
      return res.status(ctx.error.status).json(ctx.error.body);
    }

    const { config, employee, company, tenantDb } = ctx as Exclude<typeof ctx, { error: unknown }>;

    const start = payPeriodStart
      ? normalizePayPeriodDate(payPeriodStart)
      : getPayPeriodForMonth(new Date().getFullYear(), new Date().getMonth() + 1).payPeriodStart;
    const end = payPeriodEnd
      ? normalizePayPeriodDate(payPeriodEnd)
      : getPayPeriodForMonth(new Date().getFullYear(), new Date().getMonth() + 1).payPeriodEnd;

    const record = await findPayrollRecordForPeriod(tenantDb, config.employeeId, start, end);

    if (!record) {
      return res.status(404).json({
        message: "No processed payroll found for this period. Please process payroll first.",
      });
    }

    const { pdfBuffer, downloadFilename } = await generatePayslipBufferForRecord(
      tenantDb,
      record,
      config,
      employee,
      company
    );

    sendPdfBuffer(res, pdfBuffer, downloadFilename);
  } catch (error) {
    console.error("Error downloading payslip:", error);
    res.status(500).json({
      message: error instanceof Error ? error.message : "Failed to download payslip",
    });
  }
}
