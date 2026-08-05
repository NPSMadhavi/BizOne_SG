import { Router, type IRouter, type Request, type Response } from "express";
import { pool } from "@workspace/db";
import { saveEmployeeDocumentUpload } from "../../lib/operations-upload";
import {
  batchProcessPayrollCompany,
  downloadPayslipForConfigCompany,
  downloadPayslipsCompany,
  previewPayslipCompany,
  processIndividualPayrollCompany,
  syncEmployeeSalaryFromPayrollConfig,
  syncPayrollConfigFromEmployee,
  viewPayslipCompany,
} from "../../operations-8june/company-payroll-process";

declare module "express-session" {
  interface SessionData {
    userId?: number;
    companyId?: number;
    isAdmin?: boolean;
  }
}

const router: IRouter = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

function requireAuth(req: Request, res: Response): boolean {
  if (!req.session.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

function requireCompany(req: Request, res: Response): boolean {
  if (!req.session.companyId) {
    res.status(400).json({ error: "No company selected" });
    return false;
  }
  return true;
}

function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

function rowToCamel(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    out[snakeToCamel(k)] = v;
  }
  return out;
}

function bodyToSnake(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (v === undefined) continue;
    out[camelToSnake(k)] = v;
  }
  return out;
}

const TIMESTAMP_FIELDS = new Set([
  "purchaseDate",
  "warrantyExpiry",
  "depreciationStartDate",
  "joinDate",
  "dateOfBirth",
  "passportExpiry",
  "visaExpiry",
  "nricExpiry",
  "createdAt",
  "updatedAt",
  "expiryDate",
  "dateAssigned",
  "dateReturned",
  "serviceDate",
  "nextMaintenanceDate",
  "payPeriodStart",
  "payPeriodEnd",
  "processedAt",
  "supportRequestDate",
  "effectiveFrom",
  "effectiveTo",
  "paymentDate",
  "issueDate",
]);

function parseDates(obj: Record<string, unknown>): Record<string, unknown> {
  const out = { ...obj };
  for (const key of Object.keys(out)) {
    const val = out[key];
    if (val instanceof Date) {
      out[key] = val.toISOString();
    } else if (TIMESTAMP_FIELDS.has(key) && val != null && typeof val !== "string") {
      out[key] = new Date(val as string | number).toISOString();
    }
  }
  return out;
}

const JSONB_COLUMNS = new Set(["allowances", "deductions"]);

function formatRow(row: Record<string, unknown>): Record<string, unknown> {
  const camel = rowToCamel(row);
  // Some drivers expose reserved-like column names inconsistently
  const rawType = row.type ?? row["type"] ?? row.asset_type ?? row["asset_type"];
  if (camel.type == null && rawType != null) camel.type = rawType;
  if (camel.type == null && row.asset_type != null) camel.type = row.asset_type;
  for (const key of ["allowances", "deductions"]) {
    if (typeof camel[key] === "string") {
      try {
        camel[key] = JSON.parse(camel[key] as string);
      } catch {
        /* keep raw */
      }
    }
  }
  for (const key of ["baseSalary", "cost", "salary", "annualSalary", "grossPay", "netPay", "hoursCharged"]) {
    if (camel[key] != null && typeof camel[key] !== "string") {
      camel[key] = String(camel[key]);
    }
  }
  for (const key of ["id", "employeeId", "payrollConfigId", "companyId", "userId", "vendorId", "customerId"]) {
    if (camel[key] != null && typeof camel[key] !== "number") {
      const num = Number(camel[key]);
      if (Number.isFinite(num)) camel[key] = num;
    }
  }
  if (typeof camel.hasLicense === "boolean") {
    /* ok */
  } else if (camel.hasLicense != null) {
    camel.hasLicense = Boolean(camel.hasLicense);
  }
  return parseDates(camel);
}

function formatRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map(formatRow);
}

function parseId(param: string | undefined): number | null {
  const id = parseInt(param ?? "", 10);
  return Number.isFinite(id) ? id : null;
}

async function nextCsrNumber(companyId: number): Promise<string> {
  const result = await pool.query(
    `SELECT csr_number FROM service_reports WHERE company_id = $1 ORDER BY id DESC LIMIT 1`,
    [companyId],
  );
  const last = result.rows[0]?.csr_number as string | undefined;
  const match = last?.match(/CSR-(\d+)/i);
  const next = match ? parseInt(match[1], 10) + 1 : 1;
  return `CSR-${String(next).padStart(4, "0")}`;
}

async function nextEmployeeCode(companyId: number): Promise<string> {
  const result = await pool.query(
    `SELECT employee_id FROM employees WHERE company_id = $1 ORDER BY id DESC LIMIT 1`,
    [companyId],
  );
  const last = result.rows[0]?.employee_id as string | undefined;
  const match = last?.match(/(\d+)$/);
  const next = match ? parseInt(match[1], 10) + 1 : 1;
  return `EMP-${String(next).padStart(4, "0")}`;
}

function buildInsert(
  table: string,
  companyId: number,
  body: Record<string, unknown>,
  allowedColumns: string[],
): { sql: string; values: unknown[] } {
  const snake = bodyToSnake(body);
  const cols = ["company_id"];
  const vals: unknown[] = [companyId];
  const placeholders: string[] = ["$1"];
  let idx = 2;

  for (const col of allowedColumns) {
    if (snake[col] === undefined) continue;
    cols.push(col);
    let val = snake[col];
    if (JSONB_COLUMNS.has(col) && val != null && typeof val !== "string") {
      val = JSON.stringify(val);
    }
    vals.push(val);
    placeholders.push(JSONB_COLUMNS.has(col) ? `$${idx}::jsonb` : `$${idx}`);
    idx++;
  }

  return {
    sql: `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING *`,
    values: vals,
  };
}

function buildUpdate(
  table: string,
  id: number,
  companyId: number,
  body: Record<string, unknown>,
  allowedColumns: string[],
): { sql: string; values: unknown[] } | null {
  const snake = bodyToSnake(body);
  const sets: string[] = [];
  const vals: unknown[] = [];
  let idx = 1;

  for (const col of allowedColumns) {
    if (snake[col] === undefined) continue;
    let val = snake[col];
    if (JSONB_COLUMNS.has(col) && val != null && typeof val !== "string") {
      val = JSON.stringify(val);
    }
    sets.push(`${col} = $${idx}${JSONB_COLUMNS.has(col) ? "::jsonb" : ""}`);
    vals.push(val);
    idx++;
  }

  if (sets.length === 0) return null;

  vals.push(id, companyId);
  return {
    sql: `UPDATE ${table} SET ${sets.join(", ")} WHERE id = $${idx} AND company_id = $${idx + 1} RETURNING *`,
    values: vals,
  };
}

function calculateSingaporeCpf(params: {
  grossSalary: number;
  age?: number;
  citizenshipStatus?: string;
  employeeRate?: number;
  employerRate?: number;
}) {
  const gross = Number(params.grossSalary) || 0;
  const age = params.age ?? 30;
  const cpfCeiling = 7400;
  const ordinaryWages = Math.min(gross, cpfCeiling);

  let employeeRate = params.employeeRate;
  let employerRate = params.employerRate;

  if (params.citizenshipStatus === "foreigner") {
    employeeRate = 0;
    employerRate = 0;
  } else {
    if (employeeRate == null) {
      if (age <= 55) employeeRate = 0.2;
      else if (age <= 60) employeeRate = 0.13;
      else if (age <= 65) employeeRate = 0.075;
      else employeeRate = 0.05;
    }
    if (employerRate == null) {
      if (age <= 55) employerRate = 0.17;
      else if (age <= 60) employerRate = 0.13;
      else if (age <= 65) employerRate = 0.09;
      else employerRate = 0.075;
    }
  }

  const employeeCpf = Math.round(ordinaryWages * employeeRate * 100) / 100;
  const employerCpf = Math.round(ordinaryWages * employerRate * 100) / 100;
  const netPay = Math.round((gross - employeeCpf) * 100) / 100;

  return {
    grossPay: gross,
    cpfApplicableSalary: ordinaryWages,
    employeeCpf,
    employerCpf,
    totalCpf: employeeCpf + employerCpf,
    employeeCpfRate: employeeRate * 100,
    employerCpfRate: employerRate * 100,
    netPay,
  };
}

function mapPayrollConfigRow(row: Record<string, unknown>, emp?: Record<string, unknown>) {
  const camel = formatRow(row);
  const allowances =
    (camel.allowances as Record<string, number>) ?? {};
  const deductions =
    (camel.deductions as Record<string, number>) ?? {};

  const baseSalary = Number(camel.baseSalary ?? 0);
  const overtimeRate =
    baseSalary > 0 ? String(Math.round((baseSalary / 176) * 100) / 100) : "0";

  return {
    id: camel.id,
    employeeId: camel.employeeId,
    employeeName: emp?.name ?? "",
    employeeEmail: emp?.email ?? "",
    department: emp?.department ?? "",
    designation: emp?.designation ?? "",
    nationality: emp?.nationality,
    baseSalary: String(camel.baseSalary ?? "0"),
    payrollPeriod: camel.payrollPeriod ?? "monthly",
    hourlyRate: undefined,
    overtimeRate,
    allowances,
    deductions,
    taxRate: "0.00",
    cpfRate: String(camel.cpfEmployeeRate ?? "20"),
    cpfAmount: undefined,
    employerCpfRate: String(camel.cpfEmployerRate ?? "17"),
    employerCpfAmount: undefined,
    netSalary: undefined,
    isActive: camel.isActive ?? true,
    effectiveFrom: camel.createdAt,
    effectiveTo: undefined,
    createdAt: camel.createdAt,
    updatedAt: camel.updatedAt,
  };
}

function mapPayrollRecordRow(row: Record<string, unknown>, emp?: Record<string, unknown>) {
  const camel = formatRow(row);
  const payPeriodStart = String(camel.payPeriodStart ?? "").slice(0, 10);
  const payPeriodEnd = String(camel.payPeriodEnd ?? "").slice(0, 10);
  const [yearStr, monthStr] = payPeriodStart.split("-");
  const payrollYear = parseInt(yearStr, 10);
  const payrollMonth = parseInt(monthStr, 10);

  return {
    id: camel.id,
    employeeId: camel.employeeId,
    employeeName: emp?.name ?? "",
    employeeEmail: emp?.email ?? "",
    department: emp?.department ?? "",
    designation: emp?.designation ?? "",
    payrollConfigId: camel.payrollConfigId,
    payPeriodStart,
    payPeriodEnd,
    payrollYear: Number.isFinite(payrollYear) ? payrollYear : undefined,
    payrollMonth: Number.isFinite(payrollMonth) ? payrollMonth : undefined,
    baseSalary: String(camel.grossPay ?? "0"),
    overtimeHours: "0.00",
    overtimePay: "0.00",
    allowances: {},
    deductions: {},
    grossPay: String(camel.grossPay ?? "0"),
    taxDeduction: "0.00",
    cpfDeduction: String(camel.cpfEmployee ?? "0"),
    netPay: String(camel.netPay ?? "0"),
    status: camel.status ?? "draft",
    paymentDate: camel.processedAt,
    notes: undefined,
    createdAt: camel.createdAt,
    updatedAt: camel.processedAt ?? camel.createdAt,
  };
}

async function fetchEmployeeMap(companyId: number): Promise<Map<number, Record<string, unknown>>> {
  const result = await pool.query(
    `SELECT * FROM employees WHERE company_id = $1`,
    [companyId],
  );
  const map = new Map<number, Record<string, unknown>>();
  for (const row of result.rows) {
    const formatted = formatRow(row);
    map.set(formatted.id as number, formatted);
  }
  return map;
}

function mapPayrollBody(body: Record<string, unknown>): Record<string, unknown> {
  const mapped = { ...body };
  if (mapped.cpfRate != null) mapped.cpfEmployeeRate = mapped.cpfRate;
  if (mapped.employerCpfRate != null) mapped.cpfEmployerRate = mapped.employerCpfRate;
  delete mapped.cpfRate;
  delete mapped.cpfAmount;
  delete mapped.employerCpfAmount;
  delete mapped.netSalary;
  delete mapped.taxRate;
  delete mapped.hourlyRate;
  delete mapped.overtimeRate;
  delete mapped.effectiveFrom;
  delete mapped.effectiveTo;
  delete mapped.noOfWorkingDays;
  delete mapped.workingDays;
  delete mapped.citizenshipStatus;
  delete mapped.citizenshipDisplay;
  delete mapped.dateOfBirth;
  delete mapped.age;
  return mapped;
}

const ASSET_COLUMNS = [
  "tag", "type", "category", "serial", "model", "manufacturer", "status", "condition",
  "assigned_to", "location", "vendor", "vendor_id", "invoice_number", "purchase_date",
  "warranty_expiry", "cost", "depreciation_start_date", "useful_life_years",
  "depreciation_method", "description", "has_license",
];

const EMPLOYEE_COLUMNS = [
  "employee_id", "user_id", "name", "email", "phone", "address", "department",
  "designation", "join_date", "status", "salary", "annual_salary", "nationality",
  "pr_status", "date_of_birth", "passport_number", "passport_expiry", "visa_number",
  "visa_expiry", "visa_type", "visa_remarks", "nric_number", "nric_expiry",
];

const DEPENDENT_COLUMNS = [
  "employee_id", "name", "relationship", "passport_number", "passport_expiry",
  "visa_number", "visa_expiry", "visa_type",
];

const LICENSE_COLUMNS = [
  "asset_id", "name", "license_key", "type", "seats", "vendor_id", "purchase_date",
  "expiry_date", "cost", "renewal_cycle", "status", "notes",
];

const ASSIGNMENT_COLUMNS = ["asset_id", "employee_id", "date_assigned", "date_returned", "notes"];

const MAINTENANCE_COLUMNS = [
  "asset_id", "issue_description", "resolution", "service_date", "next_maintenance_date", "cost",
];

const PAYROLL_CONFIG_COLUMNS = [
  "employee_id", "base_salary", "payroll_period", "cpf_employee_rate", "cpf_employer_rate",
  "allowances", "deductions", "bank_name", "bank_account", "is_active",
];

const PAYROLL_RECORD_COLUMNS = [
  "employee_id", "payroll_config_id", "pay_period_start", "pay_period_end",
  "gross_pay", "net_pay", "cpf_employee", "cpf_employer", "status", "processed_at",
];

const SERVICE_REPORT_COLUMNS = [
  "csr_number", "customer_id", "customer_name", "customer_address", "customer_contact_person",
  "customer_phone", "customer_email", "support_requested_by", "support_request_date",
  "problem_description", "engineer_id", "service_date", "service_time", "hours_charged",
  "service_details", "remarks", "priority_level", "status", "created_by",
];

async function insertDependents(
  companyId: number,
  employeeId: number,
  dependents: Record<string, unknown>[] | undefined,
) {
  if (!dependents?.length) return;
  for (const dep of dependents) {
    const payload = { ...dep, employeeId };
    const { sql, values } = buildInsert("dependents", companyId, payload, DEPENDENT_COLUMNS);
    await pool.query(sql, values);
  }
}

// ── ASSETS ────────────────────────────────────────────────────────────────────

router.get("/assets", async (req, res): Promise<void> => {
  if (!requireAuth(req, res) || !requireCompany(req, res)) return;
  try {
    const result = await pool.query(
      `SELECT * FROM assets WHERE company_id = $1 ORDER BY id DESC`,
      [req.session.companyId],
    );
    res.json(formatRows(result.rows));
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to fetch assets" });
  }
});

router.get("/assets/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res) || !requireCompany(req, res)) return;
  const id = parseId(req.params.id);
  if (id == null) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const result = await pool.query(
      `SELECT * FROM assets WHERE id = $1 AND company_id = $2`,
      [id, req.session.companyId],
    );
    if (!result.rows[0]) { res.status(404).json({ error: "Asset not found" }); return; }
    res.json(formatRow(result.rows[0]));
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to fetch asset" });
  }
});

router.post("/assets", async (req, res): Promise<void> => {
  if (!requireAuth(req, res) || !requireCompany(req, res)) return;
  try {
    const body = { status: "available", ...req.body };
    const { sql, values } = buildInsert("assets", req.session.companyId!, body, ASSET_COLUMNS);
    const result = await pool.query(sql, values);
    res.status(201).json(formatRow(result.rows[0]));
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to create asset" });
  }
});

router.put("/assets/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res) || !requireCompany(req, res)) return;
  const id = parseId(req.params.id);
  if (id == null) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const built = buildUpdate("assets", id, req.session.companyId!, req.body, ASSET_COLUMNS);
    if (!built) { res.status(400).json({ error: "No fields to update" }); return; }
    const result = await pool.query(built.sql, built.values);
    if (!result.rows[0]) { res.status(404).json({ error: "Asset not found" }); return; }
    res.json(formatRow(result.rows[0]));
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to update asset" });
  }
});

router.delete("/assets/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res) || !requireCompany(req, res)) return;
  const id = parseId(req.params.id);
  if (id == null) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const result = await pool.query(
      `DELETE FROM assets WHERE id = $1 AND company_id = $2 RETURNING id`,
      [id, req.session.companyId],
    );
    if (!result.rows[0]) { res.status(404).json({ error: "Asset not found" }); return; }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to delete asset" });
  }
});

// ── ASSET ASSIGNMENTS ─────────────────────────────────────────────────────────

router.get("/asset-assignments", async (req, res): Promise<void> => {
  if (!requireAuth(req, res) || !requireCompany(req, res)) return;
  try {
    const result = await pool.query(
      `SELECT * FROM asset_assignments WHERE company_id = $1 ORDER BY id DESC`,
      [req.session.companyId],
    );
    res.json(formatRows(result.rows));
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to fetch asset assignments" });
  }
});

router.post("/asset-assignments", async (req, res): Promise<void> => {
  if (!requireAuth(req, res) || !requireCompany(req, res)) return;
  try {
    const companyId = req.session.companyId!;
    const { sql, values } = buildInsert("asset_assignments", companyId, req.body, ASSIGNMENT_COLUMNS);
    const result = await pool.query(sql, values);
    const assignment = result.rows[0];
    if (assignment?.asset_id) {
      await pool.query(
        `UPDATE assets SET status = 'assigned' WHERE id = $1 AND company_id = $2`,
        [assignment.asset_id, companyId],
      );
    }
    res.status(201).json(formatRow(assignment));
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to create asset assignment" });
  }
});

router.put("/asset-assignments/:id/return", async (req, res): Promise<void> => {
  if (!requireAuth(req, res) || !requireCompany(req, res)) return;
  const id = parseId(req.params.id);
  if (id == null) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const companyId = req.session.companyId!;
    const dateReturned = req.body.dateReturned ?? new Date().toISOString();
    const result = await pool.query(
      `UPDATE asset_assignments SET date_returned = $1
       WHERE id = $2 AND company_id = $3 RETURNING *`,
      [dateReturned, id, companyId],
    );
    if (!result.rows[0]) { res.status(404).json({ error: "Assignment not found" }); return; }
    const assignment = result.rows[0];
    if (assignment.asset_id) {
      await pool.query(
        `UPDATE assets SET status = 'available', assigned_to = NULL WHERE id = $1 AND company_id = $2`,
        [assignment.asset_id, companyId],
      );
    }
    res.json(formatRow(assignment));
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to return asset" });
  }
});

// ── MAINTENANCE ───────────────────────────────────────────────────────────────

router.get("/assets/:assetId/maintenance", async (req, res): Promise<void> => {
  if (!requireAuth(req, res) || !requireCompany(req, res)) return;
  const assetId = parseId(req.params.assetId);
  if (assetId == null) { res.status(400).json({ error: "Invalid asset id" }); return; }
  try {
    const result = await pool.query(
      `SELECT * FROM maintenance_records WHERE asset_id = $1 AND company_id = $2 ORDER BY service_date DESC`,
      [assetId, req.session.companyId],
    );
    res.json(formatRows(result.rows));
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to fetch maintenance records" });
  }
});

router.post("/maintenance-records", async (req, res): Promise<void> => {
  if (!requireAuth(req, res) || !requireCompany(req, res)) return;
  try {
    const { sql, values } = buildInsert(
      "maintenance_records",
      req.session.companyId!,
      req.body,
      MAINTENANCE_COLUMNS,
    );
    const result = await pool.query(sql, values);
    res.status(201).json(formatRow(result.rows[0]));
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to create maintenance record" });
  }
});

router.put("/maintenance-records/:id/complete", async (req, res): Promise<void> => {
  if (!requireAuth(req, res) || !requireCompany(req, res)) return;
  const id = parseId(req.params.id);
  if (id == null) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const built = buildUpdate(
      "maintenance_records",
      id,
      req.session.companyId!,
      { resolution: req.body.resolution, nextMaintenanceDate: req.body.nextMaintenanceDate, cost: req.body.cost },
      ["resolution", "next_maintenance_date", "cost"],
    );
    if (!built) { res.status(400).json({ error: "No fields to update" }); return; }
    const result = await pool.query(built.sql, built.values);
    if (!result.rows[0]) { res.status(404).json({ error: "Maintenance record not found" }); return; }
    res.json(formatRow(result.rows[0]));
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to complete maintenance record" });
  }
});

// ── LICENSES ──────────────────────────────────────────────────────────────────

router.get("/licenses", async (req, res): Promise<void> => {
  if (!requireAuth(req, res) || !requireCompany(req, res)) return;
  try {
    const result = await pool.query(
      `SELECT * FROM licenses WHERE company_id = $1 ORDER BY id DESC`,
      [req.session.companyId],
    );
    res.json(formatRows(result.rows));
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to fetch licenses" });
  }
});

router.get("/licenses/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res) || !requireCompany(req, res)) return;
  const id = parseId(req.params.id);
  if (id == null) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const result = await pool.query(
      `SELECT * FROM licenses WHERE id = $1 AND company_id = $2`,
      [id, req.session.companyId],
    );
    if (!result.rows[0]) { res.status(404).json({ error: "License not found" }); return; }
    res.json(formatRow(result.rows[0]));
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to fetch license" });
  }
});

router.post("/licenses", async (req, res): Promise<void> => {
  if (!requireAuth(req, res) || !requireCompany(req, res)) return;
  try {
    const { sql, values } = buildInsert("licenses", req.session.companyId!, req.body, LICENSE_COLUMNS);
    const result = await pool.query(sql, values);
    res.status(201).json(formatRow(result.rows[0]));
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to create license" });
  }
});

router.put("/licenses/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res) || !requireCompany(req, res)) return;
  const id = parseId(req.params.id);
  if (id == null) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const built = buildUpdate("licenses", id, req.session.companyId!, req.body, LICENSE_COLUMNS);
    if (!built) { res.status(400).json({ error: "No fields to update" }); return; }
    const result = await pool.query(built.sql, built.values);
    if (!result.rows[0]) { res.status(404).json({ error: "License not found" }); return; }
    res.json(formatRow(result.rows[0]));
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to update license" });
  }
});

router.delete("/licenses/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res) || !requireCompany(req, res)) return;
  const id = parseId(req.params.id);
  if (id == null) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const result = await pool.query(
      `DELETE FROM licenses WHERE id = $1 AND company_id = $2 RETURNING id`,
      [id, req.session.companyId],
    );
    if (!result.rows[0]) { res.status(404).json({ error: "License not found" }); return; }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to delete license" });
  }
});

// ── EMPLOYEES ───────────────────────────────────────────────────────────────

router.get("/employees", async (req, res): Promise<void> => {
  if (!requireAuth(req, res) || !requireCompany(req, res)) return;
  try {
    const result = await pool.query(
      `SELECT * FROM employees WHERE company_id = $1 ORDER BY name`,
      [req.session.companyId],
    );
    res.json(formatRows(result.rows));
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to fetch employees" });
  }
});

router.get("/employees/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res) || !requireCompany(req, res)) return;
  const id = parseId(req.params.id);
  if (id == null) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const result = await pool.query(
      `SELECT * FROM employees WHERE id = $1 AND company_id = $2`,
      [id, req.session.companyId],
    );
    if (!result.rows[0]) { res.status(404).json({ error: "Employee not found" }); return; }
    res.json(formatRow(result.rows[0]));
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to fetch employee" });
  }
});

router.post("/employees", async (req, res): Promise<void> => {
  if (!requireAuth(req, res) || !requireCompany(req, res)) return;
  try {
    const companyId = req.session.companyId!;
    const { dependents, ...body } = req.body;
    if (!body.employeeId) {
      body.employeeId = await nextEmployeeCode(companyId);
    }
    const { sql, values } = buildInsert("employees", companyId, body, EMPLOYEE_COLUMNS);
    const result = await pool.query(sql, values);
    const employee = formatRow(result.rows[0]);
    await insertDependents(companyId, employee.id as number, dependents);
    try {
      await syncPayrollConfigFromEmployee(pool, companyId, result.rows[0]);
    } catch (syncErr) {
      console.error("Failed to sync employee payroll config:", syncErr);
    }
    res.status(201).json(employee);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to create employee" });
  }
});

router.put("/employees/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res) || !requireCompany(req, res)) return;
  const id = parseId(req.params.id);
  if (id == null) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const companyId = req.session.companyId!;
    const { dependents, ...body } = req.body;
    const built = buildUpdate("employees", id, companyId, body, EMPLOYEE_COLUMNS);
    if (!built) { res.status(400).json({ error: "No fields to update" }); return; }
    const result = await pool.query(built.sql, built.values);
    if (!result.rows[0]) { res.status(404).json({ error: "Employee not found" }); return; }
    if (Array.isArray(dependents)) {
      await pool.query(`DELETE FROM dependents WHERE employee_id = $1 AND company_id = $2`, [id, companyId]);
      await insertDependents(companyId, id, dependents);
    }
    try {
      await syncPayrollConfigFromEmployee(pool, companyId, result.rows[0]);
    } catch (syncErr) {
      console.error("Failed to sync employee payroll config:", syncErr);
    }
    res.json(formatRow(result.rows[0]));
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to update employee" });
  }
});

router.delete("/employees/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res) || !requireCompany(req, res)) return;
  const id = parseId(req.params.id);
  if (id == null) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const companyId = req.session.companyId!;
    await pool.query(`DELETE FROM dependents WHERE employee_id = $1 AND company_id = $2`, [id, companyId]);
    const result = await pool.query(
      `DELETE FROM employees WHERE id = $1 AND company_id = $2 RETURNING id`,
      [id, companyId],
    );
    if (!result.rows[0]) { res.status(404).json({ error: "Employee not found" }); return; }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to delete employee" });
  }
});

router.get("/employees/:employeeId/dependents", async (req, res): Promise<void> => {
  if (!requireAuth(req, res) || !requireCompany(req, res)) return;
  const employeeId = parseId(req.params.employeeId);
  if (employeeId == null) { res.status(400).json({ error: "Invalid employee id" }); return; }
  try {
    const result = await pool.query(
      `SELECT * FROM dependents WHERE employee_id = $1 AND company_id = $2 ORDER BY id`,
      [employeeId, req.session.companyId],
    );
    res.json(formatRows(result.rows));
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to fetch dependents" });
  }
});

router.get("/employees/:employeeId/documents", async (req, res): Promise<void> => {
  if (!requireAuth(req, res) || !requireCompany(req, res)) return;
  const employeeId = parseId(req.params.employeeId);
  if (employeeId == null) { res.status(400).json({ error: "Invalid employee id" }); return; }
  try {
    const result = await pool.query(
      `SELECT * FROM employee_documents WHERE employee_id = $1 AND company_id = $2 ORDER BY created_at DESC`,
      [employeeId, req.session.companyId],
    );
    res.json(formatRows(result.rows));
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to fetch employee documents" });
  }
});

router.get("/documents/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res) || !requireCompany(req, res)) return;
  const id = parseId(req.params.id);
  if (id == null) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const result = await pool.query(
      `SELECT * FROM employee_documents WHERE id = $1 AND company_id = $2`,
      [id, req.session.companyId],
    );
    if (!result.rows[0]) { res.status(404).json({ error: "Document not found" }); return; }
    res.json(formatRow(result.rows[0]));
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to fetch document" });
  }
});

router.post("/documents", async (req, res): Promise<void> => {
  if (!requireAuth(req, res) || !requireCompany(req, res)) return;
  try {
    const companyId = req.session.companyId!;
    const { employeeId, documentType, issueDate, expiryDate, notes, fileData } = req.body ?? {};

    const parsedEmployeeId = parseInt(String(employeeId), 10);
    if (!parsedEmployeeId || Number.isNaN(parsedEmployeeId)) {
      res.status(400).json({ error: "Employee is required" });
      return;
    }
    if (!documentType) {
      res.status(400).json({ error: "Document type is required" });
      return;
    }
    if (!fileData) {
      res.status(400).json({ error: "File data is required" });
      return;
    }

    const employeeCheck = await pool.query(
      `SELECT id FROM employees WHERE id = $1 AND company_id = $2`,
      [parsedEmployeeId, companyId],
    );
    if (!employeeCheck.rows[0]) {
      res.status(404).json({ error: "Employee not found" });
      return;
    }

    const filePath = await saveEmployeeDocumentUpload(fileData, `document-${documentType}`);
    const result = await pool.query(
      `INSERT INTO employee_documents
        (company_id, employee_id, document_type, file_path, issue_date, expiry_date, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        companyId,
        parsedEmployeeId,
        documentType,
        filePath,
        issueDate ? new Date(issueDate) : null,
        expiryDate ? new Date(expiryDate) : null,
        notes || null,
      ],
    );
    res.status(201).json(formatRow(result.rows[0]));
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to create document" });
  }
});

router.post("/dependents", async (req, res): Promise<void> => {
  if (!requireAuth(req, res) || !requireCompany(req, res)) return;
  try {
    const { sql, values } = buildInsert("dependents", req.session.companyId!, req.body, DEPENDENT_COLUMNS);
    const result = await pool.query(sql, values);
    res.status(201).json(formatRow(result.rows[0]));
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to create dependent" });
  }
});

router.put("/dependents/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res) || !requireCompany(req, res)) return;
  const id = parseId(req.params.id);
  if (id == null) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const built = buildUpdate("dependents", id, req.session.companyId!, req.body, DEPENDENT_COLUMNS);
    if (!built) { res.status(400).json({ error: "No fields to update" }); return; }
    const result = await pool.query(built.sql, built.values);
    if (!result.rows[0]) { res.status(404).json({ error: "Dependent not found" }); return; }
    res.json(formatRow(result.rows[0]));
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to update dependent" });
  }
});

router.delete("/dependents/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res) || !requireCompany(req, res)) return;
  const id = parseId(req.params.id);
  if (id == null) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const result = await pool.query(
      `DELETE FROM dependents WHERE id = $1 AND company_id = $2 RETURNING id`,
      [id, req.session.companyId],
    );
    if (!result.rows[0]) { res.status(404).json({ error: "Dependent not found" }); return; }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to delete dependent" });
  }
});

// ── PAYROLL CONFIGS ───────────────────────────────────────────────────────────

async function listPayrollConfigs(companyId: number) {
  const result = await pool.query(
    `SELECT ep.*, e.name, e.email, e.department, e.designation, e.nationality
     FROM employee_payroll ep
     LEFT JOIN employees e ON e.id = ep.employee_id
     WHERE ep.company_id = $1
     ORDER BY ep.id DESC`,
    [companyId],
  );
  return result.rows.map((row) => {
    const { name, email, department, designation, nationality, ...configRow } = row;
    return mapPayrollConfigRow(configRow, { name, email, department, designation, nationality });
  });
}

router.get("/employee-payroll", async (req, res): Promise<void> => {
  if (!requireAuth(req, res) || !requireCompany(req, res)) return;
  try {
    res.json(await listPayrollConfigs(req.session.companyId!));
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to fetch employee payroll configs" });
  }
});

router.get("/payroll/configs", async (req, res): Promise<void> => {
  if (!requireAuth(req, res) || !requireCompany(req, res)) return;
  try {
    res.json(await listPayrollConfigs(req.session.companyId!));
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to fetch payroll configs" });
  }
});

router.post("/employee-payroll", async (req, res): Promise<void> => {
  if (!requireAuth(req, res) || !requireCompany(req, res)) return;
  try {
    const companyId = req.session.companyId!;
    const body = mapPayrollBody(req.body);
    if (body.isActive == null) body.isActive = true;
    const { sql, values } = buildInsert("employee_payroll", companyId, body, PAYROLL_CONFIG_COLUMNS);
    const result = await pool.query(sql, values);
    const empMap = await fetchEmployeeMap(companyId);
    res.status(201).json(mapPayrollConfigRow(result.rows[0], empMap.get(result.rows[0].employee_id)));
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to create payroll config" });
  }
});

router.post("/payroll/configs", async (req, res): Promise<void> => {
  if (!requireAuth(req, res) || !requireCompany(req, res)) return;
  try {
    const companyId = req.session.companyId!;
    const body = mapPayrollBody(req.body);
    if (body.isActive == null) body.isActive = true;
    const { sql, values } = buildInsert("employee_payroll", companyId, body, PAYROLL_CONFIG_COLUMNS);
    const result = await pool.query(sql, values);
    const empMap = await fetchEmployeeMap(companyId);
    res.status(201).json(mapPayrollConfigRow(result.rows[0], empMap.get(result.rows[0].employee_id)));
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to create payroll config" });
  }
});

router.put("/employee-payroll/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res) || !requireCompany(req, res)) return;
  const id = parseId(req.params.id);
  if (id == null) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const companyId = req.session.companyId!;
    const body = mapPayrollBody(req.body);
    const built = buildUpdate("employee_payroll", id, companyId, body, PAYROLL_CONFIG_COLUMNS);
    if (!built) { res.status(400).json({ error: "No fields to update" }); return; }
    const sql = built.sql.replace(" SET ", " SET updated_at = NOW(), ");
    const result = await pool.query(sql, built.values);
    if (!result.rows[0]) { res.status(404).json({ error: "Payroll config not found" }); return; }
    if (body.baseSalary != null) {
      try {
        await syncEmployeeSalaryFromPayrollConfig(pool, companyId, result.rows[0]);
      } catch (syncErr) {
        console.error("Failed to sync employee salary from payroll config:", syncErr);
      }
    }
    const empMap = await fetchEmployeeMap(companyId);
    res.json(mapPayrollConfigRow(result.rows[0], empMap.get(result.rows[0].employee_id)));
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to update payroll config" });
  }
});

router.put("/payroll/configs/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res) || !requireCompany(req, res)) return;
  const id = parseId(req.params.id);
  if (id == null) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const companyId = req.session.companyId!;
    const body = mapPayrollBody(req.body);
    const built = buildUpdate("employee_payroll", id, companyId, body, PAYROLL_CONFIG_COLUMNS);
    if (!built) { res.status(400).json({ error: "No fields to update" }); return; }
    const sql = built.sql.replace(" SET ", " SET updated_at = NOW(), ");
    const result = await pool.query(sql, built.values);
    if (!result.rows[0]) { res.status(404).json({ error: "Payroll config not found" }); return; }
    if (body.baseSalary != null) {
      try {
        await syncEmployeeSalaryFromPayrollConfig(pool, companyId, result.rows[0]);
      } catch (syncErr) {
        console.error("Failed to sync employee salary from payroll config:", syncErr);
      }
    }
    const empMap = await fetchEmployeeMap(companyId);
    res.json(mapPayrollConfigRow(result.rows[0], empMap.get(result.rows[0].employee_id)));
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to update payroll config" });
  }
});

async function deletePayrollConfigForCompany(
  companyId: number,
  id: number,
  force: boolean,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const configResult = await pool.query<{ employee_id: number }>(
    `SELECT id, employee_id FROM employee_payroll WHERE id = $1 AND company_id = $2`,
    [id, companyId],
  );
  const config = configResult.rows[0];
  if (!config) {
    return { status: 404, body: { error: "Payroll config not found" } };
  }

  const relatedRecords = await pool.query<{ id: number }>(
    `SELECT id FROM payroll_records
     WHERE company_id = $1
       AND (payroll_config_id = $2 OR employee_id = $3)`,
    [companyId, id, config.employee_id],
  );

  if (relatedRecords.rows.length > 0 && !force) {
    return {
      status: 409,
      body: {
        error: "Payroll config has related payroll records",
        message: "Payroll config has related payroll records",
      },
    };
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    if (force && relatedRecords.rows.length > 0) {
      await client.query(
        `DELETE FROM payroll_records
         WHERE company_id = $1
           AND (payroll_config_id = $2 OR employee_id = $3)`,
        [companyId, id, config.employee_id],
      );
    }

    const deleted = await client.query(
      `DELETE FROM employee_payroll WHERE id = $1 AND company_id = $2 RETURNING id`,
      [id, companyId],
    );
    if (!deleted.rows[0]) {
      await client.query("ROLLBACK");
      return { status: 404, body: { error: "Payroll config not found" } };
    }

    await client.query("COMMIT");
    return { status: 200, body: { success: true } };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function handleDeletePayrollConfig(req: Request, res: Response): Promise<void> {
  if (!requireAuth(req, res) || !requireCompany(req, res)) return;
  const id = parseId(req.params.id);
  if (id == null) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const force = req.query.force === "true";
    const result = await deletePayrollConfigForCompany(req.session.companyId!, id, force);
    res.status(result.status).json(result.body);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to delete payroll config" });
  }
}

router.delete("/payroll/configs/:id", handleDeletePayrollConfig);
router.delete("/employee-payroll/:id", handleDeletePayrollConfig);

// ── PAYROLL RECORDS ───────────────────────────────────────────────────────────

async function listPayrollRecords(companyId: number) {
  const result = await pool.query(
    `SELECT pr.*, e.name, e.email, e.department, e.designation
     FROM payroll_records pr
     LEFT JOIN employees e ON e.id = pr.employee_id
     WHERE pr.company_id = $1
     ORDER BY pr.id DESC`,
    [companyId],
  );
  return result.rows.map((row) => {
    const { name, email, department, designation, ...recordRow } = row;
    return mapPayrollRecordRow(recordRow, { name, email, department, designation });
  });
}

router.get("/payroll-records", async (req, res): Promise<void> => {
  if (!requireAuth(req, res) || !requireCompany(req, res)) return;
  try {
    res.json(await listPayrollRecords(req.session.companyId!));
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to fetch payroll records" });
  }
});

router.get("/payroll/records", async (req, res): Promise<void> => {
  if (!requireAuth(req, res) || !requireCompany(req, res)) return;
  try {
    res.json(await listPayrollRecords(req.session.companyId!));
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to fetch payroll records" });
  }
});

async function createPayrollRecordFromBody(companyId: number, body: Record<string, unknown>) {
  const employeeId = body.employeeId as number;
  const configResult = await pool.query(
    `SELECT * FROM employee_payroll WHERE employee_id = $1 AND company_id = $2 AND is_active = true LIMIT 1`,
    [employeeId, companyId],
  );
  const config = configResult.rows[0];
  const baseSalary = config ? Number(config.base_salary) : 0;
  const calc = calculateSingaporeCpf({
    grossSalary: baseSalary,
    employeeRate: config?.cpf_employee_rate ? Number(config.cpf_employee_rate) / 100 : undefined,
    employerRate: config?.cpf_employer_rate ? Number(config.cpf_employer_rate) / 100 : undefined,
  });

  const payload = {
    employeeId,
    payrollConfigId: config?.id,
    payPeriodStart: body.payPeriodStart,
    payPeriodEnd: body.payPeriodEnd,
    grossPay: calc.grossPay,
    netPay: calc.netPay,
    cpfEmployee: calc.employeeCpf,
    cpfEmployer: calc.employerCpf,
    status: "draft",
  };

  const { sql, values } = buildInsert("payroll_records", companyId, payload, PAYROLL_RECORD_COLUMNS);
  const result = await pool.query(sql, values);
  return result.rows[0];
}

router.post("/payroll-records", async (req, res): Promise<void> => {
  if (!requireAuth(req, res) || !requireCompany(req, res)) return;
  try {
    const companyId = req.session.companyId!;
    const row = await createPayrollRecordFromBody(companyId, req.body);
    const empMap = await fetchEmployeeMap(companyId);
    res.status(201).json(mapPayrollRecordRow(row, empMap.get(row.employee_id)));
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to create payroll record" });
  }
});

router.post("/payroll/records", async (req, res): Promise<void> => {
  if (!requireAuth(req, res) || !requireCompany(req, res)) return;
  try {
    const companyId = req.session.companyId!;
    const row = await createPayrollRecordFromBody(companyId, req.body);
    const empMap = await fetchEmployeeMap(companyId);
    res.status(201).json(mapPayrollRecordRow(row, empMap.get(row.employee_id)));
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to create payroll record" });
  }
});

router.put("/payroll-records/:id/status", async (req, res): Promise<void> => {
  if (!requireAuth(req, res) || !requireCompany(req, res)) return;
  const id = parseId(req.params.id);
  if (id == null) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const companyId = req.session.companyId!;
    const status = req.body.status ?? "draft";
    const processedAt = ["paid", "approved"].includes(status) ? new Date().toISOString() : null;
    const result = await pool.query(
      `UPDATE payroll_records SET status = $1, processed_at = COALESCE($2, processed_at)
       WHERE id = $3 AND company_id = $4 RETURNING *`,
      [status, processedAt, id, companyId],
    );
    if (!result.rows[0]) { res.status(404).json({ error: "Payroll record not found" }); return; }
    const empMap = await fetchEmployeeMap(companyId);
    res.json(mapPayrollRecordRow(result.rows[0], empMap.get(result.rows[0].employee_id)));
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to update payroll record status" });
  }
});

router.put("/payroll/records/:id/status", async (req, res): Promise<void> => {
  if (!requireAuth(req, res) || !requireCompany(req, res)) return;
  const id = parseId(req.params.id);
  if (id == null) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const companyId = req.session.companyId!;
    const status = req.body.status ?? "draft";
    const processedAt = ["paid", "approved"].includes(status) ? new Date().toISOString() : null;
    const result = await pool.query(
      `UPDATE payroll_records SET status = $1, processed_at = COALESCE($2, processed_at)
       WHERE id = $3 AND company_id = $4 RETURNING *`,
      [status, processedAt, id, companyId],
    );
    if (!result.rows[0]) { res.status(404).json({ error: "Payroll record not found" }); return; }
    const empMap = await fetchEmployeeMap(companyId);
    res.json(mapPayrollRecordRow(result.rows[0], empMap.get(result.rows[0].employee_id)));
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to update payroll record status" });
  }
});

router.get("/payroll/summary", async (req, res): Promise<void> => {
  if (!requireAuth(req, res) || !requireCompany(req, res)) return;
  try {
    const companyId = req.session.companyId!;
    const [configs, records] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS count FROM employee_payroll WHERE company_id = $1 AND is_active = true`, [companyId]),
      pool.query(`SELECT status, gross_pay, net_pay, cpf_employee FROM payroll_records WHERE company_id = $1`, [companyId]),
    ]);

    let totalGrossPay = 0;
    let totalNetPay = 0;
    let totalCpfDeduction = 0;
    let paidRecords = 0;
    let pendingRecords = 0;
    let draftRecords = 0;

    for (const row of records.rows) {
      totalGrossPay += Number(row.gross_pay ?? 0);
      totalNetPay += Number(row.net_pay ?? 0);
      totalCpfDeduction += Number(row.cpf_employee ?? 0);
      if (row.status === "paid") paidRecords++;
      else if (row.status === "pending") pendingRecords++;
      else if (row.status === "draft") draftRecords++;
    }

    res.json({
      totalEmployees: configs.rows[0]?.count ?? 0,
      totalGrossPay: Math.round(totalGrossPay * 100) / 100,
      totalNetPay: Math.round(totalNetPay * 100) / 100,
      totalTaxDeduction: 0,
      totalCpfDeduction: Math.round(totalCpfDeduction * 100) / 100,
      paidRecords,
      pendingRecords,
      draftRecords,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to fetch payroll summary" });
  }
});

router.post("/payroll/calculate", async (req, res): Promise<void> => {
  if (!requireAuth(req, res) || !requireCompany(req, res)) return;
  try {
    const result = calculateSingaporeCpf({
      grossSalary: Number(req.body.grossSalary ?? req.body.baseSalary ?? 0),
      age: Number(req.body.age ?? 30),
      citizenshipStatus: req.body.citizenshipStatus,
      employeeRate: req.body.employeeRate != null ? Number(req.body.employeeRate) / 100 : undefined,
      employerRate: req.body.employerRate != null ? Number(req.body.employerRate) / 100 : undefined,
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to calculate payroll" });
  }
});

router.post("/payroll/process/individual", async (req, res): Promise<void> => {
  if (!requireAuth(req, res) || !requireCompany(req, res)) return;
  await processIndividualPayrollCompany(req, res, pool);
});

router.post("/payroll/process/batch", async (req, res): Promise<void> => {
  if (!requireAuth(req, res) || !requireCompany(req, res)) return;
  await batchProcessPayrollCompany(req, res, pool);
});

router.post("/payroll/payslips/download-config", async (req, res): Promise<void> => {
  if (!requireAuth(req, res) || !requireCompany(req, res)) return;
  await downloadPayslipForConfigCompany(req, res, pool);
});

router.post("/payroll/payslips/download", async (req, res): Promise<void> => {
  if (!requireAuth(req, res) || !requireCompany(req, res)) return;
  await downloadPayslipsCompany(req, res, pool);
});

router.post("/payroll/payslips/view", async (req, res): Promise<void> => {
  if (!requireAuth(req, res) || !requireCompany(req, res)) return;
  await viewPayslipCompany(req, res, pool);
});

router.post("/payroll/payslips/preview", async (req, res): Promise<void> => {
  if (!requireAuth(req, res) || !requireCompany(req, res)) return;
  await previewPayslipCompany(req, res, pool);
});

// ── SERVICE REPORTS ───────────────────────────────────────────────────────────

router.get("/service-reports", async (req, res): Promise<void> => {
  if (!requireAuth(req, res) || !requireCompany(req, res)) return;
  try {
    const result = await pool.query(
      `SELECT * FROM service_reports WHERE company_id = $1 ORDER BY id DESC`,
      [req.session.companyId],
    );
    res.json(formatRows(result.rows));
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to fetch service reports" });
  }
});

router.get("/service-reports/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res) || !requireCompany(req, res)) return;
  const id = parseId(req.params.id);
  if (id == null) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const result = await pool.query(
      `SELECT * FROM service_reports WHERE id = $1 AND company_id = $2`,
      [id, req.session.companyId],
    );
    if (!result.rows[0]) { res.status(404).json({ error: "Service report not found" }); return; }
    res.json(formatRow(result.rows[0]));
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to fetch service report" });
  }
});

router.post("/service-reports", async (req, res): Promise<void> => {
  if (!requireAuth(req, res) || !requireCompany(req, res)) return;
  try {
    const companyId = req.session.companyId!;
    const body = { ...req.body };
    if (!body.csrNumber) {
      body.csrNumber = await nextCsrNumber(companyId);
    }
    if (!body.createdBy && req.session.userId) {
      body.createdBy = req.session.userId;
    }
    const { sql, values } = buildInsert("service_reports", companyId, body, SERVICE_REPORT_COLUMNS);
    const result = await pool.query(sql, values);
    res.status(201).json(formatRow(result.rows[0]));
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to create service report" });
  }
});

router.put("/service-reports/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res) || !requireCompany(req, res)) return;
  const id = parseId(req.params.id);
  if (id == null) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const body = { ...req.body };
    delete body.csrNumber;
    const built = buildUpdate("service_reports", id, req.session.companyId!, body, SERVICE_REPORT_COLUMNS.filter((c) => c !== "csr_number"));
    if (!built) { res.status(400).json({ error: "No fields to update" }); return; }
    const sql = built.sql.replace(" SET ", " SET updated_at = NOW(), ");
    const result = await pool.query(sql, built.values);
    if (!result.rows[0]) { res.status(404).json({ error: "Service report not found" }); return; }
    res.json(formatRow(result.rows[0]));
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to update service report" });
  }
});

router.delete("/service-reports/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res) || !requireCompany(req, res)) return;
  const id = parseId(req.params.id);
  if (id == null) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const result = await pool.query(
      `DELETE FROM service_reports WHERE id = $1 AND company_id = $2 RETURNING id`,
      [id, req.session.companyId],
    );
    if (!result.rows[0]) { res.status(404).json({ error: "Service report not found" }); return; }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to delete service report" });
  }
});

// ── Running numbers preview (employee / service report) ───────────────────────

async function currentRunningNumber(
  companyId: number,
  type: "employee" | "service_report",
): Promise<{ type: string; prefix: string; suffix: string; currentNumber: number; numberLength: number }> {
  if (type === "employee") {
    const result = await pool.query(
      `SELECT employee_id FROM employees WHERE company_id = $1 ORDER BY id DESC LIMIT 1`,
      [companyId],
    );
    const last = result.rows[0]?.employee_id as string | undefined;
    const match = last?.match(/(\d+)$/);
    return { type, prefix: "EMP-", suffix: "", currentNumber: match ? parseInt(match[1], 10) : 0, numberLength: 4 };
  }
  const result = await pool.query(
    `SELECT csr_number FROM service_reports WHERE company_id = $1 ORDER BY id DESC LIMIT 1`,
    [companyId],
  );
  const last = result.rows[0]?.csr_number as string | undefined;
  const match = last?.match(/CSR-(\d+)/i);
  return { type, prefix: "CSR-", suffix: "", currentNumber: match ? parseInt(match[1], 10) : 0, numberLength: 4 };
}

router.get("/running-numbers", async (req, res): Promise<void> => {
  if (!requireAuth(req, res) || !requireCompany(req, res)) return;
  try {
    const companyId = req.session.companyId!;
    const [employee, serviceReport] = await Promise.all([
      currentRunningNumber(companyId, "employee"),
      currentRunningNumber(companyId, "service_report"),
    ]);
    res.json([employee, serviceReport]);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to fetch running numbers" });
  }
});

router.get("/companies/active", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  try {
    const result = await pool.query(
      `SELECT c.id, c.name, true AS is_active
       FROM companies c
       ORDER BY c.name`,
    );
    res.json(result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      isActive: row.is_active ?? true,
    })));
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to fetch companies" });
  }
});

export default router;
