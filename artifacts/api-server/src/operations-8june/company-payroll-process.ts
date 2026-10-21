import type { Request, Response } from "express";
import type { Pool } from "pg";
import {
  calculateProcessPayroll,
  calculateAgeFromDob,
  mapEmployeeResidency,
} from "./singapore-payroll-shared";
import { resolvePayrollEarnings, splitEarnings } from "./payroll-earnings";
import {
  derivePayrollMonthYear,
  getBatchZipNameFromPeriod,
  getPayPeriodForMonth,
  isPayPeriodEligibleForProcessing,
  normalizePayPeriodDate,
  parseForceOverwriteFlag,
  PAYROLL_CURRENT_MONTH_ERROR,
} from "./payroll-date-utils";
import {
  buildPayslipHtml,
  generatePayslipPdf,
  getPayslipDownloadFileName,
  type PayslipData,
} from "./payslip-generator";
import {
  createPayslipZipArchive,
  registerSessionPayslipZip,
  sendPayslipZipFile,
} from "./payslip-zip";

export type PayrollProcessAction = "created" | "updated" | "skipped";

export interface BatchPayrollSummary {
  totalEmployees: number;
  processedNew: number;
  updated: number;
  skipped: number;
  failures: { employeeName: string; message: string }[];
}

interface DbEmployee {
  id: number;
  employee_id: string;
  name: string;
  department: string;
  designation: string;
  nationality: string | null;
  pr_status: string | null;
  date_of_birth: string | Date | null;
  nric_number: string | null;
  passport_number: string | null;
  salary?: string | number | null;
  annual_salary?: string | number | null;
}

interface DbPayrollConfig {
  id: number;
  employee_id: number;
  base_salary: string | number;
  allowances: unknown;
  deductions: unknown;
  cpf_employee_rate?: string | number | null;
  cpf_employer_rate?: string | number | null;
  updated_at: string | Date | null;
}

interface DbPayrollRecord {
  id: number;
  employee_id: number;
  payroll_config_id: number | null;
  pay_period_start: string | Date;
  pay_period_end: string | Date;
  base_salary?: string | number | null;
  overtime_hours?: string | number | null;
  overtime_pay?: string | number | null;
  allowances?: unknown;
  deductions?: unknown;
  gross_pay: string | number;
  net_pay: string | number;
  cpf_employee: string | number;
  cpf_employer: string | number;
  created_at: string | Date | null;
}

function parsePayrollComponents(value: unknown): Record<string, number> {
  if (!value) return {};
  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return {};
    }
  }
  if (Array.isArray(parsed)) return {};
  if (typeof parsed !== "object" || parsed === null) return {};
  const out: Record<string, number> = {};
  for (const [key, val] of Object.entries(parsed as Record<string, unknown>)) {
    out[key] = Number(val) || 0;
  }
  return out;
}

function sumJsonValues(obj: Record<string, number>): number {
  return Object.values(obj).reduce((sum, v) => sum + (Number(v) || 0), 0);
}


function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Default overtime rate: hourly rate from monthly salary (176 standard hours). */
function resolveOvertimeRate(baseSalary: number, explicitRate?: number | string | null): number {
  const parsed = Number(explicitRate);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return baseSalary > 0 ? round2(baseSalary / 176) : 0;
}

function calculatePayrollAmounts(params: {
  baseSalary: number;
  overtimeHours: number;
  overtimeRate: number;
  allowances: Record<string, number>;
  deductions: Record<string, number>;
  age: number;
  nationality?: string | null;
  prStatus?: string | null;
}) {
  const earnings = resolvePayrollEarnings({
    allowances: params.allowances,
    overtimeHours: params.overtimeHours,
    overtimeRate: params.overtimeRate,
  });
  const deductionsTotal = sumJsonValues(params.deductions);
  const { residencyType, prYear } = mapEmployeeResidency({
    nationality: params.nationality,
    prStatus: params.prStatus,
  });

  const calc = calculateProcessPayroll({
    monthlySalary: params.baseSalary,
    age: params.age,
    residencyType,
    prYear,
    monthlyAllowances: earnings.taxableEarnings,
    monthlyDeductions: deductionsTotal,
    overtimePay: earnings.overtimePay,
  });

  return {
    grossPay: calc.grossSalary,
    employeeCpf: calc.cpfEmployeeAmount,
    employerCpf: calc.cpfEmployerAmount,
    netPay: calc.netSalary,
    overtimePay: earnings.overtimePay,
    allowancesTotal: earnings.allowances,
    bonusTotal: earnings.bonus,
    otherIncomeTotal: earnings.otherIncome,
    deductionsTotal: calc.deductionsTotal,
    employeeCpfRate: calc.cpfEmployeeRate,
    employerCpfRate: calc.cpfEmployerRate,
  };
}

function resolveMonthlySalaryFromEmployee(employee: DbEmployee): number | null {
  if (employee.salary != null && String(employee.salary).trim() !== "") {
    const monthly = Number(employee.salary);
    if (!Number.isNaN(monthly) && monthly > 0) return monthly;
  }
  if (employee.annual_salary != null && String(employee.annual_salary).trim() !== "") {
    const monthly = Number(employee.annual_salary) / 12;
    if (!Number.isNaN(monthly) && monthly > 0) return monthly;
  }
  return null;
}

/** Keep active payroll config in sync when employee profile/salary changes elsewhere. */
export async function syncPayrollConfigFromEmployee(
  pool: Pool,
  companyId: number,
  employee: DbEmployee,
  targetConfigId?: number,
): Promise<DbPayrollConfig | null> {
  const configResult = targetConfigId
    ? await pool.query<DbPayrollConfig>(
        `SELECT * FROM employee_payroll
         WHERE id = $1 AND employee_id = $2 AND company_id = $3`,
        [targetConfigId, employee.id, companyId],
      )
    : await pool.query<DbPayrollConfig>(
        `SELECT * FROM employee_payroll
         WHERE employee_id = $1 AND company_id = $2 AND is_active = true
         ORDER BY updated_at DESC NULLS LAST, id DESC
         LIMIT 1`,
        [employee.id, companyId],
      );

  const config = configResult.rows[0];
  if (!config) return null;

  const monthlySalary = resolveMonthlySalaryFromEmployee(employee) ?? Number(config.base_salary);
  const allowances = parsePayrollComponents(config.allowances);
  const deductions = parsePayrollComponents(config.deductions);
  const amounts = calculatePayrollAmounts({
    baseSalary: monthlySalary,
    overtimeHours: 0,
    overtimeRate: resolveOvertimeRate(monthlySalary),
    allowances,
    deductions,
    age: calculateAgeFromDob(employee.date_of_birth),
    nationality: employee.nationality,
    prStatus: employee.pr_status,
  });

  const updateResult = await pool.query<DbPayrollConfig>(
    `UPDATE employee_payroll SET
       base_salary = $1,
       cpf_employee_rate = $2,
       cpf_employer_rate = $3,
       cpf_amount = $4,
       employer_cpf_amount = $5,
       net_salary = $6,
       updated_at = NOW()
     WHERE id = $7 AND company_id = $8
     RETURNING *`,
    [
      monthlySalary,
      amounts.employeeCpfRate,
      amounts.employerCpfRate,
      amounts.employeeCpf,
      amounts.employerCpf,
      amounts.netPay,
      config.id,
      companyId,
    ],
  );

  return updateResult.rows[0] ?? null;
}

/** Mirror payroll config base salary back to the employee record. */
export async function syncEmployeeSalaryFromPayrollConfig(
  pool: Pool,
  companyId: number,
  config: Pick<DbPayrollConfig, "employee_id" | "base_salary">,
): Promise<void> {
  const monthlySalary = Number(config.base_salary);
  if (!monthlySalary || Number.isNaN(monthlySalary)) return;

  await pool.query(
    `UPDATE employees SET
       salary = $1,
       annual_salary = $2
     WHERE id = $3 AND company_id = $4`,
    [String(monthlySalary), String(monthlySalary * 12), config.employee_id, companyId],
  );
}

async function getActivePayrollConfig(
  pool: Pool,
  companyId: number,
  config: DbPayrollConfig,
  employee: DbEmployee,
): Promise<DbPayrollConfig> {
  const synced = await syncPayrollConfigFromEmployee(pool, companyId, employee, config.id);
  return synced ?? config;
}

async function findPayrollRecordForMonth(
  pool: Pool,
  companyId: number,
  employeeId: number,
  year: number,
  month: number,
): Promise<DbPayrollRecord | null> {
  if (!year || month < 1 || month > 12) return null;
  try {
    const exact = await pool.query<DbPayrollRecord>(
      `SELECT * FROM payroll_records
       WHERE company_id = $1 AND employee_id = $2
         AND payroll_year = $3 AND payroll_month = $4
       ORDER BY id DESC
       LIMIT 1`,
      [companyId, employeeId, year, month],
    );
    if (exact.rows[0]) return exact.rows[0];
  } catch {
    // payroll_year / payroll_month are added when a month salary is saved.
  }
  return null;
}

async function findPayrollRecordForPeriod(
  pool: Pool,
  companyId: number,
  employeeId: number,
  payPeriodStart: string,
  payPeriodEnd: string,
): Promise<DbPayrollRecord | null> {
  const start = normalizePayPeriodDate(payPeriodStart);
  const end = normalizePayPeriodDate(payPeriodEnd);
  const { year, month } = derivePayrollMonthYear(start);

  const result = await pool.query<DbPayrollRecord>(
    `SELECT * FROM payroll_records
     WHERE company_id = $1 AND employee_id = $2
       AND (
         (EXTRACT(YEAR FROM pay_period_start::date) = $3 AND EXTRACT(MONTH FROM pay_period_start::date) = $4)
         OR (pay_period_start::date <= $6::date AND pay_period_end::date >= $5::date)
       )
     ORDER BY created_at DESC
     LIMIT 1`,
    [companyId, employeeId, year, month, start, end],
  );

  return result.rows[0] ?? null;
}

function hasPayrollConfigChanged(
  config: DbPayrollConfig,
  record: DbPayrollRecord,
  calculated: ReturnType<typeof calculatePayrollAmounts>,
): boolean {
  if (record.payroll_config_id != null && Number(record.payroll_config_id) !== Number(config.id)) {
    return true;
  }
  if (round2(Number(record.gross_pay)) !== round2(calculated.grossPay)) return true;
  if (round2(Number(record.net_pay)) !== round2(calculated.netPay)) return true;
  if (round2(Number(record.cpf_employee)) !== round2(calculated.employeeCpf)) return true;
  if (round2(Number(record.cpf_employer)) !== round2(calculated.employerCpf)) return true;
  if (config.updated_at && record.created_at) {
    return new Date(config.updated_at).getTime() > new Date(record.created_at).getTime();
  }
  return false;
}

function sendPdfBuffer(
  res: Response,
  pdfBuffer: Buffer,
  filename: string,
  options?: { action?: PayrollProcessAction; inline?: boolean },
): void {
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `${options?.inline ? "inline" : "attachment"}; filename="${filename}"`,
  );
  res.setHeader("Content-Length", String(pdfBuffer.length));
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Cache-Control", "no-store");
  if (options?.action) {
    res.setHeader("X-Payroll-Action", options.action);
  }
  res.status(200).end(pdfBuffer);
}

function buildPayslipData(
  employee: DbEmployee,
  company: { name: string; address: string | null },
  amounts: ReturnType<typeof calculatePayrollAmounts>,
  baseSalary: number,
  payPeriodStart: string,
  payPeriodEnd: string,
): PayslipData {
  const { month, year } = derivePayrollMonthYear(payPeriodStart);
  return {
    companyName: company.name,
    companyAddress: company.address ?? "",
    employeeName: employee.name,
    employeeDbId: employee.id,
    employeeCode: employee.employee_id,
    icNo: employee.nric_number || employee.passport_number || "",
    department: employee.department,
    jobTitle: employee.designation,
    month,
    year,
    payPeriodStart,
    payPeriodEnd,
    basicRate: baseSalary,
    workingDays: null,
    basicPay: baseSalary,
    overtime: amounts.overtimePay,
    allowance: amounts.allowancesTotal,
    bonus: amounts.bonusTotal,
    otherIncome: amounts.otherIncomeTotal,
    grossPay: amounts.grossPay,
    employeeCpf: amounts.employeeCpf,
    netPay: amounts.netPay,
    employerCpf: amounts.employerCpf,
    otherDeductions: amounts.deductionsTotal,
  };
}

async function loadPayrollContext(
  pool: Pool,
  companyId: number,
  payrollConfigId: number,
) {
  const configResult = await pool.query<DbPayrollConfig>(
    `SELECT * FROM employee_payroll WHERE id = $1 AND company_id = $2`,
    [payrollConfigId, companyId],
  );
  const config = configResult.rows[0];
  if (!config) return { error: { status: 404, message: "Payroll configuration not found" } };

  const employeeResult = await pool.query<DbEmployee>(
    `SELECT * FROM employees WHERE id = $1 AND company_id = $2`,
    [config.employee_id, companyId],
  );
  const employee = employeeResult.rows[0];
  if (!employee) return { error: { status: 404, message: "Employee not found" } };

  const companyResult = await pool.query<{ name: string; address: string | null }>(
    `SELECT name, address FROM companies WHERE id = $1`,
    [companyId],
  );
  const company = companyResult.rows[0] ?? { name: "", address: "" };

  const activeConfig = await getActivePayrollConfig(pool, companyId, config, employee);

  return { config: activeConfig, employee, company };
}

async function upsertPayrollRecord(
  pool: Pool,
  companyId: number,
  config: DbPayrollConfig,
  employee: DbEmployee,
  payPeriodStart: string,
  payPeriodEnd: string,
  overtimeHours: number,
  options: { forceUpdate?: boolean; requireForceForReprocess?: boolean } = {},
): Promise<{ action: PayrollProcessAction; record: DbPayrollRecord; reason?: string }> {
  const activeConfig = await getActivePayrollConfig(pool, companyId, config, employee);
  const baseSalary = Number(activeConfig.base_salary) || 0;
  const allowances = parsePayrollComponents(activeConfig.allowances);
  const deductions = parsePayrollComponents(activeConfig.deductions);
  const age = calculateAgeFromDob(employee.date_of_birth);
  const overtimeRate = resolveOvertimeRate(baseSalary);
  const amounts = calculatePayrollAmounts({
    baseSalary,
    overtimeHours,
    overtimeRate,
    allowances,
    deductions,
    age,
    nationality: employee.nationality,
    prStatus: employee.pr_status,
  });

  const existing = await findPayrollRecordForPeriod(
    pool,
    companyId,
    employee.id,
    payPeriodStart,
    payPeriodEnd,
  );

  if (!existing) {
    const insertResult = await pool.query<DbPayrollRecord>(
      `INSERT INTO payroll_records (
         company_id, employee_id, payroll_config_id,
         pay_period_start, pay_period_end,
         base_salary, overtime_hours, overtime_pay,
         allowances, deductions,
         gross_pay, net_pay, cpf_employee, cpf_employer,
         status, processed_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11, $12, $13, $14, 'pending', NOW())
       RETURNING *`,
      [
        companyId,
        employee.id,
        activeConfig.id,
        payPeriodStart,
        payPeriodEnd,
        baseSalary,
        overtimeHours,
        amounts.overtimePay,
        JSON.stringify(allowances),
        JSON.stringify(deductions),
        amounts.grossPay,
        amounts.netPay,
        amounts.employeeCpf,
        amounts.employerCpf,
      ],
    );
    return { action: "created", record: insertResult.rows[0]! };
  }

  const configChanged = hasPayrollConfigChanged(activeConfig, existing, amounts);
  void options;
  return {
    action: "skipped",
    record: existing,
    reason: configChanged ? "data_changed" : "already_processed",
  };
}

export async function processIndividualPayrollCompany(
  req: Request,
  res: Response,
  pool: Pool,
): Promise<void> {
  try {
    const companyId = req.session.companyId!;
    const {
      payrollConfigId,
      payPeriodStart,
      payPeriodEnd,
      overtimeHours = 0,
      forceOverwrite = false,
    } = req.body ?? {};

    const payrollConfigIdNum = Number(payrollConfigId);
    if (!payrollConfigIdNum || !payPeriodStart || !payPeriodEnd) {
      res.status(400).json({
        message: "payrollConfigId, payPeriodStart, and payPeriodEnd are required",
      });
      return;
    }

    const normalizedPayPeriodStart = normalizePayPeriodDate(payPeriodStart);
    const normalizedPayPeriodEnd = normalizePayPeriodDate(payPeriodEnd);

    if (normalizedPayPeriodEnd < normalizedPayPeriodStart) {
      res.status(400).json({ message: "Pay period end must be on or after pay period start" });
      return;
    }

    if (!isPayPeriodEligibleForProcessing(normalizedPayPeriodStart, normalizedPayPeriodEnd)) {
      res.status(400).json({ message: PAYROLL_CURRENT_MONTH_ERROR });
      return;
    }

    const ctx = await loadPayrollContext(pool, companyId, payrollConfigIdNum);
    if ("error" in ctx && ctx.error) {
      res.status(ctx.error.status).json({ message: ctx.error.message });
      return;
    }

    const { config, employee } = ctx;
    const forceOverwriteFlag = parseForceOverwriteFlag(forceOverwrite);

    const result = await upsertPayrollRecord(
      pool,
      companyId,
      config,
      employee,
      normalizedPayPeriodStart,
      normalizedPayPeriodEnd,
      Number(overtimeHours) || 0,
      {
        forceUpdate: forceOverwriteFlag,
        requireForceForReprocess: true,
      },
    );

    if (result.action === "skipped") {
      const dataChanged = result.reason === "data_changed";
      const { monthLabel } = derivePayrollMonthYear(normalizedPayPeriodStart);
      res.status(409).json({
        alreadyProcessed: true,
        dataChanged,
        message: `Payroll for ${monthLabel} has already been processed. Payroll can be processed only once in a month.`,
        action: "skipped",
      });
      return;
    }

    // Persist payroll only — payslips are generated on demand via download/view.
    res.json({
      ok: true,
      action: result.action,
      message:
        result.action === "updated"
          ? "Payroll updated successfully. Download the payslip from Payroll when needed."
          : "Payroll processed successfully. Download the payslip from Payroll when needed.",
    });
  } catch (error) {
    console.error("Error processing individual payroll:", error);
    const message = error instanceof Error ? error.message : "Failed to process payroll";
    res.status(500).json({ message });
  }
}

export async function batchProcessPayrollCompany(
  req: Request,
  res: Response,
  pool: Pool,
): Promise<void> {
  try {
    const companyId = req.session.companyId!;
    const {
      payPeriodStart,
      payPeriodEnd,
      year,
      month,
      payrollConfigIds,
      forceOverwrite = false,
      processScope,
    } = req.body ?? {};

    let resolvedPayPeriodStart = normalizePayPeriodDate(payPeriodStart);
    let resolvedPayPeriodEnd = normalizePayPeriodDate(payPeriodEnd);

    if (!resolvedPayPeriodStart || !resolvedPayPeriodEnd) {
      const yearNum = Number(year);
      const monthNum = Number(month);
      if (!yearNum || !monthNum || monthNum < 1 || monthNum > 12) {
        res.status(400).json({ message: "Pay period start/end or valid year and month are required" });
        return;
      }
      const derived = getPayPeriodForMonth(yearNum, monthNum);
      resolvedPayPeriodStart = derived.payPeriodStart;
      resolvedPayPeriodEnd = derived.payPeriodEnd;
    }

    if (resolvedPayPeriodEnd < resolvedPayPeriodStart) {
      res.status(400).json({ message: "Pay period end must be on or after pay period start" });
      return;
    }

    if (!isPayPeriodEligibleForProcessing(resolvedPayPeriodStart, resolvedPayPeriodEnd)) {
      res.status(400).json({ message: PAYROLL_CURRENT_MONTH_ERROR });
      return;
    }

    let configsResult = await pool.query<DbPayrollConfig>(
      `SELECT * FROM employee_payroll WHERE company_id = $1 AND is_active = true`,
      [companyId],
    );
    let configs = configsResult.rows;

    if (Array.isArray(payrollConfigIds) && payrollConfigIds.length > 0) {
      const idSet = new Set(payrollConfigIds.map(Number));
      configs = configs.filter((config) => idSet.has(config.id));
    }

    if (configs.length === 0) {
      res.status(400).json({ message: "No active payroll configurations to process" });
      return;
    }

    const forceOverwriteFlag = parseForceOverwriteFlag(forceOverwrite);
    const pendingConfigs: DbPayrollConfig[] = [];
    const changedConfigs: DbPayrollConfig[] = [];

    for (const config of configs) {
      const existing = await findPayrollRecordForPeriod(
        pool,
        companyId,
        config.employee_id,
        resolvedPayPeriodStart,
        resolvedPayPeriodEnd,
      );
      if (!existing) {
        pendingConfigs.push(config);
        continue;
      }
      const employeeResult = await pool.query<DbEmployee>(
        `SELECT * FROM employees WHERE id = $1 AND company_id = $2`,
        [config.employee_id, companyId],
      );
      const employee = employeeResult.rows[0];
      if (!employee) continue;
      const activeConfig = await getActivePayrollConfig(pool, companyId, config, employee);
      const amounts = calculatePayrollAmounts({
        baseSalary: Number(activeConfig.base_salary) || 0,
        overtimeHours: 0,
        overtimeRate: resolveOvertimeRate(Number(activeConfig.base_salary) || 0),
        allowances: parsePayrollComponents(activeConfig.allowances),
        deductions: parsePayrollComponents(activeConfig.deductions),
        age: calculateAgeFromDob(employee.date_of_birth),
        nationality: employee.nationality,
        prStatus: employee.pr_status,
      });
      if (hasPayrollConfigChanged(activeConfig, existing, amounts)) {
        changedConfigs.push(activeConfig);
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
        res.json({
          needsPendingConfirmation: true,
          scenario: "pending",
          message:
            "Payroll for the selected period has not been processed for some employees. Do you want to process payroll for all pending employees?",
          summary: buildStatusSummary(),
        });
        return;
      }
      if (changedConfigs.length > 0 || pendingConfigs.length === 0) {
        res.json({
          needsNoChangesNotice: true,
          scenario: "no-changes",
          alreadyProcessed: true,
          message:
            "Payroll for the selected period has already been processed. Payroll can be processed only once in a month.",
          summary: buildStatusSummary(),
        });
        return;
      }
    }

    let configsToProcess: DbPayrollConfig[] = [];
    let useForceUpdate = forceOverwriteFlag;

    if (forceOverwriteFlag || processScope === "changed") {
      configsToProcess = pendingConfigs;
      useForceUpdate = false;
    } else if (processScope === "pending") {
      configsToProcess = pendingConfigs;
      useForceUpdate = false;
    } else {
      configsToProcess = pendingConfigs;
      useForceUpdate = false;
    }

    if (configsToProcess.length === 0) {
      res.json({
        needsNoChangesNotice: true,
        scenario: "no-changes",
        alreadyProcessed: true,
        message:
          "Payroll for the selected period has already been processed. Payroll can be processed only once in a month.",
        summary: buildStatusSummary(),
      });
      return;
    }

    const summary: BatchPayrollSummary = {
      totalEmployees: configs.length,
      processedNew: 0,
      updated: 0,
      skipped: configs.length - configsToProcess.length,
      failures: [],
    };
    const processedConfigIds = new Set<number>();

    for (const config of configsToProcess) {
      const employeeResult = await pool.query<DbEmployee>(
        `SELECT * FROM employees WHERE id = $1 AND company_id = $2`,
        [config.employee_id, companyId],
      );
      const employee = employeeResult.rows[0];
      const employeeName = employee?.name ?? `Employee ${config.employee_id}`;

      if (!employee) {
        summary.failures.push({ employeeName, message: "Employee not found" });
        continue;
      }

      try {
        const result = await upsertPayrollRecord(
          pool,
          companyId,
          config,
          employee,
          resolvedPayPeriodStart,
          resolvedPayPeriodEnd,
          0,
          {
            forceUpdate: useForceUpdate,
            requireForceForReprocess: processScope === "changed",
          },
        );

        if (result.action === "skipped") {
          summary.skipped++;
          continue;
        }

        if (result.action === "created") summary.processedNew++;
        else if (result.action === "updated") summary.updated++;
        processedConfigIds.add(config.id);
      } catch (error) {
        summary.failures.push({
          employeeName,
          message: error instanceof Error ? error.message : "Processing failed",
        });
      }
    }

    if (summary.processedNew === 0 && summary.updated === 0) {
      res.status(409).json({
        message: `No payroll processed. ${summary.skipped} employee(s) skipped.`,
        summary,
      });
      return;
    }

    // Generate payslips and auto-download after successful batch process.
    const zipFiles: Array<{ filename: string; buffer: Buffer }> = [];
    for (const config of configsToProcess.filter((item) => processedConfigIds.has(item.id))) {
      try {
        const slip = await generatePayslipForPeriod(
          pool,
          companyId,
          config.id,
          resolvedPayPeriodStart,
          resolvedPayPeriodEnd,
        );
        if ("error" in slip) {
          const empResult = await pool.query<{ name: string }>(
            `SELECT name FROM employees WHERE id = $1 AND company_id = $2`,
            [config.employee_id, companyId],
          );
          summary.failures.push({
            employeeName: empResult.rows[0]?.name ?? `Employee ${config.employee_id}`,
            message: slip.error.message || "Failed to generate payslip",
          });
          continue;
        }
        zipFiles.push({ filename: slip.downloadFilename, buffer: slip.pdfBuffer });
      } catch (error) {
        const empResult = await pool.query<{ name: string }>(
          `SELECT name FROM employees WHERE id = $1 AND company_id = $2`,
          [config.employee_id, companyId],
        );
        summary.failures.push({
          employeeName: empResult.rows[0]?.name ?? `Employee ${config.employee_id}`,
          message: error instanceof Error ? error.message : "Failed to generate payslip",
        });
      }
    }

    res.setHeader("X-Payroll-Summary", JSON.stringify(summary));

    if (zipFiles.length === 0) {
      // Payroll saved, but PDF generation failed — client can still download manually.
      res.json({
        ok: true,
        summary,
        message:
          "Payroll processed successfully. Download payslips from Payroll when needed.",
      });
      return;
    }

    // Batch process always returns one ZIP containing all payslips.
    const zipFilename = getBatchZipNameFromPeriod(resolvedPayPeriodStart);
    const zipPath = await createPayslipZipArchive(zipFiles);
    const sessionId = req.session?.id as string | undefined;
    if (sessionId) {
      registerSessionPayslipZip(sessionId, zipPath);
    }
    sendPayslipZipFile(res, zipPath, zipFilename, sessionId);
  } catch (error) {
    console.error("Error in batch payroll processing:", error);
    const message = error instanceof Error ? error.message : "Failed to batch process payroll";
    res.status(500).json({ message });
  }
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function snapshotBasicSalary(record: DbPayrollRecord): number {
  const stored = Number(record.base_salary);
  if (
    record.base_salary != null &&
    String(record.base_salary).trim() !== "" &&
    Number.isFinite(stored) &&
    stored > 0
  ) {
    return stored;
  }

  const gross = Number(record.gross_pay) || 0;
  const overtime = Number(record.overtime_pay) || 0;
  const allowanceSum = sumJsonValues(parsePayrollComponents(record.allowances));
  const derived = round2(gross - overtime - allowanceSum);
  return derived > 0 ? derived : gross;
}

export async function repairPayrollMonthSnapshots(pool: Pool): Promise<void> {
  await pool.query(`ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS payroll_month INTEGER`);
  await pool.query(`ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS payroll_year INTEGER`);
  await pool.query(
    `UPDATE payroll_records
     SET payroll_year = EXTRACT(YEAR FROM (pay_period_start AT TIME ZONE 'Asia/Singapore'))::int,
         payroll_month = EXTRACT(MONTH FROM (pay_period_start AT TIME ZONE 'Asia/Singapore'))::int
     WHERE payroll_month IS NULL OR payroll_year IS NULL`,
  );
  await pool.query(
    `UPDATE payroll_records pr
     SET allowances = ep.allowances,
         deductions = COALESCE(ep.deductions, pr.deductions),
         base_salary = COALESCE(NULLIF(pr.base_salary, 0), ep.base_salary),
         gross_pay = CASE
           WHEN COALESCE(pr.gross_pay, 0) <= COALESCE(NULLIF(pr.base_salary, 0), ep.base_salary, 0)
             THEN COALESCE(NULLIF(pr.base_salary, 0), ep.base_salary, 0) + sums.allowance_sum
           ELSE pr.gross_pay
         END,
         cpf_employee = CASE
           WHEN COALESCE(pr.gross_pay, 0) <= COALESCE(NULLIF(pr.base_salary, 0), ep.base_salary, 0)
             THEN ep.cpf_amount
           ELSE pr.cpf_employee
         END,
         cpf_employer = CASE
           WHEN COALESCE(pr.gross_pay, 0) <= COALESCE(NULLIF(pr.base_salary, 0), ep.base_salary, 0)
             THEN ep.employer_cpf_amount
           ELSE pr.cpf_employer
         END,
         net_pay = CASE
           WHEN COALESCE(pr.gross_pay, 0) <= COALESCE(NULLIF(pr.base_salary, 0), ep.base_salary, 0)
             THEN ep.net_salary
           ELSE pr.net_pay
         END
     FROM employee_payroll ep
     JOIN LATERAL (
       SELECT COALESCE(SUM(
         CASE
           WHEN value ~ '^-?[0-9]+(\\.[0-9]+)?$' AND value::numeric > 0 THEN value::numeric
           ELSE 0
         END
       ), 0) AS allowance_sum
       FROM jsonb_each_text(COALESCE(ep.allowances, '{}'::jsonb))
     ) sums ON true
     WHERE pr.payroll_config_id = ep.id
       AND pr.company_id = ep.company_id
       AND sums.allowance_sum > 0
       AND NOT EXISTS (
         SELECT 1
         FROM jsonb_each_text(COALESCE(pr.allowances, '{}'::jsonb)) cur(key, value)
         WHERE value ~ '^-?[0-9]+(\\.[0-9]+)?$'
           AND value::numeric > 0
       )`,
  );
}

export async function savePayrollMonthSnapshot(
  pool: Pool,
  companyId: number,
  payrollConfigId: number,
  employeeId: number,
  month: number,
  year: number,
  baseSalary: number,
  allowancesInput: unknown,
  deductionsInput: unknown,
): Promise<void> {
  if (!employeeId || !payrollConfigId || month < 1 || month > 12 || !year) return;
  await repairPayrollMonthSnapshots(pool);
  const employeeResult = await pool.query<DbEmployee>(
    `SELECT * FROM employees WHERE id = $1 AND company_id = $2`,
    [employeeId, companyId],
  );
  const employee = employeeResult.rows[0];
  if (!employee) return;

  const allowances = parsePayrollComponents(allowancesInput);
  const deductions = parsePayrollComponents(deductionsInput);
  const amounts = calculatePayrollAmounts({
    baseSalary,
    overtimeHours: 0,
    overtimeRate: resolveOvertimeRate(baseSalary),
    allowances,
    deductions,
    age: calculateAgeFromDob(employee.date_of_birth),
    nationality: employee.nationality,
    prStatus: employee.pr_status,
  });
  const payPeriodStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const payPeriodEnd = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  const existing = await pool.query<{ id: number }>(
    `SELECT id FROM payroll_records
     WHERE company_id = $1 AND employee_id = $2
       AND (
         (payroll_year = $3 AND payroll_month = $4)
         OR (
           EXTRACT(YEAR FROM (pay_period_start AT TIME ZONE 'Asia/Singapore')) = $3
           AND EXTRACT(MONTH FROM (pay_period_start AT TIME ZONE 'Asia/Singapore')) = $4
         )
       )
     ORDER BY id DESC
     LIMIT 1`,
    [companyId, employeeId, year, month],
  );

  if (!existing.rows[0]) {
    await pool.query(
      `INSERT INTO payroll_records (
         company_id, employee_id, payroll_config_id,
         pay_period_start, pay_period_end,
         payroll_year, payroll_month,
         base_salary, overtime_hours, overtime_pay,
         allowances, deductions,
         gross_pay, net_pay, cpf_employee, cpf_employer,
         status, processed_at
       ) VALUES ($1, $2, $3, $4::date, $5::date, $6, $7, $8, 0, $9, $10::jsonb, $11::jsonb, $12, $13, $14, $15, 'pending', NOW())`,
      [
        companyId,
        employeeId,
        payrollConfigId,
        payPeriodStart,
        payPeriodEnd,
        year,
        month,
        baseSalary,
        amounts.overtimePay,
        JSON.stringify(allowances),
        JSON.stringify(deductions),
        amounts.grossPay,
        amounts.netPay,
        amounts.employeeCpf,
        amounts.employerCpf,
      ],
    );
    return;
  }

  await pool.query(
    `UPDATE payroll_records SET
       payroll_config_id = $1,
       payroll_year = $2,
       payroll_month = $3,
       pay_period_start = $4::date,
       pay_period_end = $5::date,
       base_salary = $6,
       overtime_pay = $7,
       allowances = $8::jsonb,
       deductions = $9::jsonb,
       gross_pay = $10,
       net_pay = $11,
       cpf_employee = $12,
       cpf_employer = $13,
       updated_at = NOW()
     WHERE id = $14 AND company_id = $15`,
    [
      payrollConfigId,
      year,
      month,
      payPeriodStart,
      payPeriodEnd,
      baseSalary,
      amounts.overtimePay,
      JSON.stringify(allowances),
      JSON.stringify(deductions),
      amounts.grossPay,
      amounts.netPay,
      amounts.employeeCpf,
      amounts.employerCpf,
      existing.rows[0].id,
      companyId,
    ],
  );
}

function payslipSalaryForMonth(config: DbPayrollConfig, record: DbPayrollRecord | null) {
  const stored = Number(record?.base_salary);
  const hasStored = record?.base_salary != null && String(record.base_salary).trim() !== "" && stored > 0;
  const recordAllowances = parsePayrollComponents(record?.allowances);
  const recordDeductions = parsePayrollComponents(record?.deductions);
  return {
    baseSalary: hasStored ? stored : Number(config.base_salary) || 0,
    allowances: hasStored ? recordAllowances : parsePayrollComponents(config.allowances),
    deductions: hasStored ? recordDeductions : parsePayrollComponents(config.deductions),
  };
}

function buildPayslipDataFromConfig(
  employee: DbEmployee,
  company: { name: string; address: string | null },
  config: DbPayrollConfig,
  month: number,
  year: number,
  payPeriodStart: string,
  payPeriodEnd: string,
  record?: DbPayrollRecord | null,
): PayslipData {
  const saved = payslipSalaryForMonth(config, record ?? null);
  const baseSalary = saved.baseSalary;
  const allowances = saved.allowances;
  const deductions = saved.deductions;
  const amounts = calculatePayrollAmounts({
    baseSalary,
    overtimeHours: 0,
    overtimeRate: resolveOvertimeRate(baseSalary),
    allowances,
    deductions,
    age: calculateAgeFromDob(employee.date_of_birth),
    nationality: employee.nationality,
    prStatus: employee.pr_status,
  });
  const earnings = splitEarnings(allowances);

  return {
    companyName: company.name,
    companyAddress: company.address ?? "",
    employeeName: employee.name,
    employeeDbId: employee.id,
    employeeCode: employee.employee_id,
    icNo: employee.nric_number || employee.passport_number || "",
    department: employee.department,
    jobTitle: employee.designation,
    month,
    year,
    payPeriodStart,
    payPeriodEnd,
    basicRate: baseSalary,
    workingDays: null,
    basicPay: baseSalary,
    overtime: amounts.overtimePay,
    allowance: earnings.allowances,
    bonus: earnings.bonus,
    otherIncome: earnings.otherIncome,
    grossPay: amounts.grossPay,
    employeeCpf: amounts.employeeCpf,
    netPay: amounts.netPay,
    employerCpf: amounts.employerCpf,
    otherDeductions: amounts.deductionsTotal,
  };
}

async function generatePayslipForPeriod(
  pool: Pool,
  companyId: number,
  payrollConfigId: number,
  payPeriodStart: string,
  payPeriodEnd: string,
): Promise<
  | { pdfBuffer: Buffer; downloadFilename: string; payslipData: PayslipData }
  | { error: { status: number; message: string } }
> {
  const ctx = await loadPayrollContext(pool, companyId, payrollConfigId);
  if ("error" in ctx && ctx.error) {
    return { error: ctx.error };
  }

  const { config, employee, company } = ctx;
  const { month, year } = derivePayrollMonthYear(payPeriodStart);
  const record = await findPayrollRecordForMonth(pool, companyId, employee.id, year, month);
  const payslipData = buildPayslipDataFromConfig(
    employee,
    company,
    config,
    month,
    year,
    payPeriodStart,
    payPeriodEnd,
    record,
  );
  const pdfBuffer = await generatePayslipPdf(payslipData);
  const downloadFilename = getPayslipDownloadFileName(employee.name, month, year);
  return { pdfBuffer, downloadFilename, payslipData };
}

export async function previewPayslipCompany(
  req: Request,
  res: Response,
  pool: Pool,
): Promise<void> {
  try {
    const companyId = req.session.companyId!;
    const { payrollConfigId, year, month } = req.body ?? {};
    const payrollConfigIdNum = Number(payrollConfigId);
    const yearNum = Number(year);
    const monthNum = Number(month);

    if (!payrollConfigIdNum || !yearNum || !monthNum || monthNum < 1 || monthNum > 12) {
      res.status(400).json({ message: "payrollConfigId, year, and a valid month are required" });
      return;
    }

    const { payPeriodStart, payPeriodEnd } = getPayPeriodForMonth(yearNum, monthNum);
    const ctx = await loadPayrollContext(pool, companyId, payrollConfigIdNum);
    if ("error" in ctx && ctx.error) {
      res.status(ctx.error.status).json({ message: ctx.error.message });
      return;
    }

    const { config, employee, company } = ctx;
    const record = await findPayrollRecordForMonth(pool, companyId, employee.id, yearNum, monthNum);
    const payslipData = buildPayslipDataFromConfig(
      employee,
      company,
      config,
      monthNum,
      yearNum,
      payPeriodStart,
      payPeriodEnd,
      record,
    );
    const html = buildPayslipHtml(payslipData);
    const monthLabel = MONTH_NAMES[monthNum - 1] ?? `Month ${monthNum}`;
    const title = `Payslip — ${employee.name} — ${monthLabel} ${yearNum}`;
    const downloadFilename = getPayslipDownloadFileName(employee.name, monthNum, yearNum);

    res.json({
      html,
      data: payslipData,
      title,
      downloadFilename,
      month: monthNum,
      monthLabel,
      year: yearNum,
    });
  } catch (error) {
    console.error("Error previewing payslip:", error);
    res.status(500).json({
      message: error instanceof Error ? error.message : "Failed to preview payslip",
    });
  }
}

export async function downloadPayslipForConfigCompany(
  req: Request,
  res: Response,
  pool: Pool,
): Promise<void> {
  try {
    const companyId = req.session.companyId!;
    const { payrollConfigId, payPeriodStart, payPeriodEnd } = req.body ?? {};
    const payrollConfigIdNum = Number(payrollConfigId);

    if (!payrollConfigIdNum) {
      res.status(400).json({ message: "payrollConfigId is required" });
      return;
    }

    const now = new Date();
    const defaultPeriod = getPayPeriodForMonth(now.getFullYear(), now.getMonth() + 1);
    const start = payPeriodStart
      ? normalizePayPeriodDate(payPeriodStart)
      : defaultPeriod.payPeriodStart;
    const end = payPeriodEnd
      ? normalizePayPeriodDate(payPeriodEnd)
      : defaultPeriod.payPeriodEnd;

    const result = await generatePayslipForPeriod(pool, companyId, payrollConfigIdNum, start, end);
    if ("error" in result) {
      res.status(result.error.status).json({ message: result.error.message });
      return;
    }

    sendPdfBuffer(res, result.pdfBuffer, result.downloadFilename);
  } catch (error) {
    console.error("Error downloading payslip:", error);
    res.status(500).json({
      message: error instanceof Error ? error.message : "Failed to download payslip",
    });
  }
}

export async function viewPayslipCompany(
  req: Request,
  res: Response,
  pool: Pool,
): Promise<void> {
  try {
    const companyId = req.session.companyId!;
    const { payrollConfigId, year, month } = req.body ?? {};
    const payrollConfigIdNum = Number(payrollConfigId);
    const yearNum = Number(year);
    const monthNum = Number(month);

    if (!payrollConfigIdNum || !yearNum || !monthNum || monthNum < 1 || monthNum > 12) {
      res.status(400).json({ message: "payrollConfigId, year, and a valid month are required" });
      return;
    }

    const { payPeriodStart, payPeriodEnd } = getPayPeriodForMonth(yearNum, monthNum);
    const result = await generatePayslipForPeriod(
      pool,
      companyId,
      payrollConfigIdNum,
      payPeriodStart,
      payPeriodEnd,
    );

    if ("error" in result) {
      res.status(result.error.status).json({ message: result.error.message });
      return;
    }

    sendPdfBuffer(res, result.pdfBuffer, result.downloadFilename, { inline: true });
  } catch (error) {
    console.error("Error viewing payslip:", error);
    res.status(500).json({
      message: error instanceof Error ? error.message : "Failed to view payslip",
    });
  }
}

export async function downloadPayslipsCompany(
  req: Request,
  res: Response,
  pool: Pool,
): Promise<void> {
  try {
    const companyId = req.session.companyId!;
    const { payrollConfigId, year, months } = req.body ?? {};
    const payrollConfigIdNum = Number(payrollConfigId);
    const yearNum = Number(year);

    if (!payrollConfigIdNum || !yearNum || !Array.isArray(months) || months.length === 0) {
      res.status(400).json({ message: "payrollConfigId, year, and at least one month are required" });
      return;
    }

    const validMonths = months
      .map((m: number) => Number(m))
      .filter((m) => Number.isInteger(m) && m >= 1 && m <= 12);

    if (validMonths.length === 0) {
      res.status(400).json({ message: "Invalid month selection" });
      return;
    }

    const ctx = await loadPayrollContext(pool, companyId, payrollConfigIdNum);
    if ("error" in ctx && ctx.error) {
      res.status(ctx.error.status).json({ message: ctx.error.message });
      return;
    }

    const generatedFiles: Array<{ downloadFilename: string; buffer: Buffer }> = [];
    const missingMonths: string[] = [];

    for (const month of validMonths) {
      const { payPeriodStart, payPeriodEnd } = getPayPeriodForMonth(yearNum, month);
      const result = await generatePayslipForPeriod(
        pool,
        companyId,
        payrollConfigIdNum,
        payPeriodStart,
        payPeriodEnd,
      );

      if ("error" in result) {
        missingMonths.push(`${MONTH_NAMES[month - 1]} ${yearNum}`);
        continue;
      }

      generatedFiles.push({
        downloadFilename: result.downloadFilename,
        buffer: result.pdfBuffer,
      });
    }

    if (generatedFiles.length === 0) {
      res.status(404).json({
        message: `No processed payroll found for: ${missingMonths.join(", ")}. Please process payroll first.`,
        missingMonths,
      });
      return;
    }

    if (generatedFiles.length === 1) {
      if (missingMonths.length > 0) {
        res.setHeader("X-Payslip-Missing-Months", missingMonths.join(", "));
      }
      sendPdfBuffer(res, generatedFiles[0]!.buffer, generatedFiles[0]!.downloadFilename);
      return;
    }

    const zipPath = await createPayslipZipArchive(
      generatedFiles.map((f) => ({ filename: f.downloadFilename, buffer: f.buffer })),
    );
    const sessionId = req.session?.id as string | undefined;
    if (sessionId) {
      registerSessionPayslipZip(sessionId, zipPath);
    }
    if (missingMonths.length > 0) {
      res.setHeader("X-Payslip-Missing-Months", missingMonths.join(", "));
    }

    const zipFilename = `${ctx.employee.name.replace(/[^a-zA-Z0-9]+/g, "_")}_${ctx.employee.id}_Payslips.zip`;
    sendPayslipZipFile(res, zipPath, zipFilename, sessionId);
  } catch (error) {
    console.error("Error generating payslips:", error);
    res.status(500).json({
      message: error instanceof Error ? error.message : "Failed to generate payslips",
    });
  }
}

/** Download one ZIP of payslips for many employees in a single pay period. */
export async function downloadPayslipsBatchForPeriodCompany(
  req: Request,
  res: Response,
  pool: Pool,
): Promise<void> {
  try {
    const companyId = req.session.companyId!;
    const { payrollConfigIds, payPeriodStart, payPeriodEnd } = req.body ?? {};
    const start = normalizePayPeriodDate(payPeriodStart);
    const end = normalizePayPeriodDate(payPeriodEnd);

    if (!start || !end) {
      res.status(400).json({ message: "payPeriodStart and payPeriodEnd are required" });
      return;
    }

    if (!Array.isArray(payrollConfigIds) || payrollConfigIds.length === 0) {
      res.status(400).json({ message: "payrollConfigIds are required" });
      return;
    }

    const idList = payrollConfigIds.map(Number).filter((id) => Number.isFinite(id) && id > 0);
    if (idList.length === 0) {
      res.status(400).json({ message: "Invalid payrollConfigIds" });
      return;
    }

    const zipFiles: Array<{ filename: string; buffer: Buffer }> = [];
    const failures: string[] = [];

    for (const payrollConfigId of idList) {
      const result = await generatePayslipForPeriod(pool, companyId, payrollConfigId, start, end);
      if ("error" in result) {
        failures.push(`Config ${payrollConfigId}: ${result.error.message}`);
        continue;
      }
      zipFiles.push({ filename: result.downloadFilename, buffer: result.pdfBuffer });
    }

    if (zipFiles.length === 0) {
      res.status(404).json({
        message:
          failures.length > 0
            ? `No payslips generated. ${failures.join("; ")}`
            : "No payslips found for the selected employees and period.",
      });
      return;
    }

    const zipFilename = getBatchZipNameFromPeriod(start);
    const zipPath = await createPayslipZipArchive(zipFiles);
    const sessionId = req.session?.id as string | undefined;
    if (sessionId) {
      registerSessionPayslipZip(sessionId, zipPath);
    }
    if (failures.length > 0) {
      res.setHeader("X-Payslip-Missing", failures.join(" | "));
    }
    sendPayslipZipFile(res, zipPath, zipFilename, sessionId);
  } catch (error) {
    console.error("Error generating batch payslip ZIP:", error);
    res.status(500).json({
      message: error instanceof Error ? error.message : "Failed to generate payslip ZIP",
    });
  }
}
