import type { Request, Response } from "express";
import type { Pool } from "pg";
import {
  calculateProcessPayroll,
  calculateAgeFromDob,
  mapEmployeeResidency,
} from "./singapore-payroll-shared";
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
  const allowancesTotal = sumJsonValues(params.allowances);
  const deductionsTotal = sumJsonValues(params.deductions);
  const overtimePay = round2(params.overtimeHours * params.overtimeRate);
  const { residencyType, prYear } = mapEmployeeResidency({
    nationality: params.nationality,
    prStatus: params.prStatus,
  });

  const calc = calculateProcessPayroll({
    monthlySalary: params.baseSalary,
    age: params.age,
    residencyType,
    prYear,
    monthlyAllowances: allowancesTotal,
    monthlyDeductions: deductionsTotal,
    overtimePay,
  });

  return {
    grossPay: calc.grossSalary,
    employeeCpf: calc.cpfEmployeeAmount,
    employerCpf: calc.cpfEmployerAmount,
    netPay: calc.netSalary,
    overtimePay: calc.overtimePay,
    allowancesTotal: calc.allowancesTotal,
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
       updated_at = NOW()
     WHERE id = $4 AND company_id = $5
     RETURNING *`,
    [
      monthlySalary,
      amounts.employeeCpfRate,
      amounts.employerCpfRate,
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
         gross_pay, net_pay, cpf_employee, cpf_employer,
         status, processed_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', NOW())
       RETURNING *`,
      [
        companyId,
        employee.id,
        activeConfig.id,
        payPeriodStart,
        payPeriodEnd,
        amounts.grossPay,
        amounts.netPay,
        amounts.employeeCpf,
        amounts.employerCpf,
      ],
    );
    return { action: "created", record: insertResult.rows[0]! };
  }

  const forceUpdate = parseForceOverwriteFlag(options.forceUpdate);
  const configChanged = hasPayrollConfigChanged(activeConfig, existing, amounts);

  if (!forceUpdate) {
    if (!configChanged) {
      return { action: "skipped", record: existing, reason: "already_processed" };
    }
    if (options.requireForceForReprocess) {
      return { action: "skipped", record: existing, reason: "data_changed" };
    }
  }

  const updateResult = await pool.query<DbPayrollRecord>(
    `UPDATE payroll_records SET
       payroll_config_id = $1,
       pay_period_start = $2,
       pay_period_end = $3,
       gross_pay = $4,
       net_pay = $5,
       cpf_employee = $6,
       cpf_employer = $7,
       status = 'pending',
       processed_at = NOW()
     WHERE id = $8 AND company_id = $9
     RETURNING *`,
    [
      activeConfig.id,
      payPeriodStart,
      payPeriodEnd,
      amounts.grossPay,
      amounts.netPay,
      amounts.employeeCpf,
      amounts.employerCpf,
      existing.id,
      companyId,
    ],
  );

  return { action: "updated", record: updateResult.rows[0]! };
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
    if ("error" in ctx) {
      res.status(ctx.error.status).json({ message: ctx.error.message });
      return;
    }

    const { config, employee, company } = ctx;
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
        message: dataChanged
          ? `Payroll for ${monthLabel} has already been processed. The payroll values have been modified.`
          : `Payroll for ${monthLabel} has already been processed. There are no changes to process.`,
        action: "skipped",
      });
      return;
    }

    const baseSalary = Number(config.base_salary) || 0;
    const allowances = parsePayrollComponents(config.allowances);
    const deductions = parsePayrollComponents(config.deductions);
    const overtimeRate = resolveOvertimeRate(baseSalary);
    const amounts = calculatePayrollAmounts({
      baseSalary,
      overtimeHours: Number(overtimeHours) || 0,
      overtimeRate,
      allowances,
      deductions,
      age: calculateAgeFromDob(employee.date_of_birth),
      nationality: employee.nationality,
      prStatus: employee.pr_status,
    });

    const payslipData = buildPayslipData(
      employee,
      company,
      amounts,
      baseSalary,
      normalizedPayPeriodStart,
      normalizedPayPeriodEnd,
    );

    const pdfBuffer = await generatePayslipPdf(payslipData);
    const { month, year } = derivePayrollMonthYear(normalizedPayPeriodStart);
    const downloadFilename = getPayslipDownloadFileName(employee.name, month, year);
    sendPdfBuffer(res, pdfBuffer, downloadFilename, { action: result.action });
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
      if (changedConfigs.length > 0) {
        res.json({
          needsOverwriteConfirmation: true,
          scenario: "values-changed",
          alreadyProcessed: true,
          message:
            "Payroll for the selected period has already been processed. Payroll values have been modified for one or more employees. Do you want to overwrite the existing payslips and regenerate them?",
          summary: buildStatusSummary(),
        });
        return;
      }
      res.json({
        needsNoChangesNotice: true,
        scenario: "no-changes",
        alreadyProcessed: true,
        message:
          "Payroll for the selected period has already been processed. There are no changes to process.",
        summary: buildStatusSummary(),
      });
      return;
    }

    let configsToProcess: DbPayrollConfig[] = [];
    let useForceUpdate = forceOverwriteFlag;

    if (forceOverwriteFlag) {
      configsToProcess = configs;
      useForceUpdate = true;
    } else if (processScope === "pending") {
      configsToProcess = pendingConfigs;
      useForceUpdate = false;
    } else if (processScope === "changed") {
      configsToProcess = changedConfigs;
      useForceUpdate = true;
    } else {
      configsToProcess = [...pendingConfigs, ...changedConfigs];
    }

    if (configsToProcess.length === 0) {
      res.json({
        needsNoChangesNotice: true,
        scenario: "no-changes",
        alreadyProcessed: true,
        message:
          "Payroll for the selected period has already been processed. There are no changes to process.",
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

    const companyResult = await pool.query<{ name: string; address: string | null }>(
      `SELECT name, address FROM companies WHERE id = $1`,
      [companyId],
    );
    const company = companyResult.rows[0] ?? { name: "", address: "" };
    const zipFiles: { filename: string; buffer: Buffer }[] = [];

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

        const activeConfig = await getActivePayrollConfig(pool, companyId, config, employee);
        const baseSalary = Number(activeConfig.base_salary) || 0;
        const allowances = parsePayrollComponents(activeConfig.allowances);
        const deductions = parsePayrollComponents(activeConfig.deductions);
        const overtimeRate = resolveOvertimeRate(baseSalary);
        const amounts = calculatePayrollAmounts({
          baseSalary,
          overtimeHours: 0,
          overtimeRate,
          allowances,
          deductions,
          age: calculateAgeFromDob(employee.date_of_birth),
          nationality: employee.nationality,
          prStatus: employee.pr_status,
        });

        const payslipData = buildPayslipData(
          employee,
          company,
          amounts,
          baseSalary,
          resolvedPayPeriodStart,
          resolvedPayPeriodEnd,
        );

        const pdfBuffer = await generatePayslipPdf(payslipData);
        const { month: m, year: y } = derivePayrollMonthYear(resolvedPayPeriodStart);
        zipFiles.push({
          filename: getPayslipDownloadFileName(employee.name, m, y),
          buffer: pdfBuffer,
        });

        if (result.action === "created") summary.processedNew++;
        else if (result.action === "updated") summary.updated++;
      } catch (error) {
        summary.failures.push({
          employeeName,
          message: error instanceof Error ? error.message : "Processing failed",
        });
      }
    }

    if (zipFiles.length === 0) {
      res.status(409).json({
        message: `No payslips generated. ${summary.skipped} employee(s) skipped.`,
        summary,
      });
      return;
    }

    const zipFilename = getBatchZipNameFromPeriod(resolvedPayPeriodStart);
    const zipPath = await createPayslipZipArchive(zipFiles);
    const sessionId = req.session?.id as string | undefined;
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

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function buildPayslipDataFromRecord(
  employee: DbEmployee,
  company: { name: string; address: string | null },
  config: DbPayrollConfig,
  record: DbPayrollRecord,
): PayslipData {
  const payPeriodStart = normalizePayPeriodDate(record.pay_period_start);
  const payPeriodEnd = normalizePayPeriodDate(record.pay_period_end);
  const baseSalary = Number(config.base_salary) || 0;
  const allowances = parsePayrollComponents(config.allowances);
  const deductions = parsePayrollComponents(config.deductions);

  return {
    companyName: company.name,
    companyAddress: company.address ?? "",
    employeeName: employee.name,
    employeeDbId: employee.id,
    employeeCode: employee.employee_id,
    icNo: employee.nric_number || employee.passport_number || "",
    department: employee.department,
    jobTitle: employee.designation,
    month: derivePayrollMonthYear(payPeriodStart).month,
    year: derivePayrollMonthYear(payPeriodStart).year,
    payPeriodStart,
    payPeriodEnd,
    basicRate: baseSalary,
    workingDays: null,
    basicPay: baseSalary,
    overtime: 0,
    allowance: sumJsonValues(allowances),
    grossPay: Number(record.gross_pay) || 0,
    employeeCpf: Number(record.cpf_employee) || 0,
    netPay: Number(record.net_pay) || 0,
    employerCpf: Number(record.cpf_employer) || 0,
    otherDeductions: sumJsonValues(deductions),
  };
}

async function generatePayslipForPeriod(
  pool: Pool,
  companyId: number,
  payrollConfigId: number,
  payPeriodStart: string,
  payPeriodEnd: string,
) {
  const ctx = await loadPayrollContext(pool, companyId, payrollConfigId);
  if ("error" in ctx) return ctx;

  const { config, employee, company } = ctx;
  const record = await findPayrollRecordForPeriod(
    pool,
    companyId,
    employee.id,
    payPeriodStart,
    payPeriodEnd,
  );

  if (!record) {
    return {
      error: {
        status: 404,
        message: "No processed payroll found for this period. Please process payroll first.",
      },
    };
  }

  const payslipData = buildPayslipDataFromRecord(employee, company, config, record);
  const pdfBuffer = await generatePayslipPdf(payslipData);
  const { month, year } = derivePayrollMonthYear(payPeriodStart);
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
    if ("error" in ctx) {
      res.status(ctx.error.status).json({ message: ctx.error.message });
      return;
    }

    const { config, employee, company } = ctx;
    const record = await findPayrollRecordForPeriod(
      pool,
      companyId,
      employee.id,
      payPeriodStart,
      payPeriodEnd,
    );

    if (!record) {
      res.status(404).json({
        message: "No processed payroll found for this period. Please process payroll first.",
      });
      return;
    }

    const payslipData = buildPayslipDataFromRecord(employee, company, config, record);
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
    if ("error" in result && result.error) {
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

    if ("error" in result && result.error) {
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
    if ("error" in ctx) {
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

      if ("error" in result && result.error) {
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

    const zipPath = await createPayslipZipArchive(generatedFiles);
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
