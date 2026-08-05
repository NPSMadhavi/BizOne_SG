import { Request, Response } from 'express';
import { db } from './db';
import { tenantDbManager } from './tenant-db-manager';
import { employeePayroll, payrollRecords, employees, tenants } from '@shared/schema';
import { and, eq, desc, gte, lte, sql } from 'drizzle-orm';
import { insertEmployeePayrollSchema, insertPayrollRecordSchema } from '@shared/schema';

async function getTenantPayrollDb(tenantId: number) {
  const tenantDb = await tenantDbManager.getTenantDatabase(tenantId);
  await tenantDbManager.ensurePayrollSchema(tenantId);
  await tenantDbManager.ensureEmployeesSchema(tenantId);
  return tenantDb;
}

async function getTenantPayrollPool(tenantId: number) {
  await tenantDbManager.ensurePayrollSchema(tenantId);
  await tenantDbManager.ensureEmployeesSchema(tenantId);
  return tenantDbManager.getTenantPool(tenantId);
}

function mapPayrollConfigRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    tenantSlug: row.tenant_slug,
    employeeId: row.employee_id,
    baseSalary: row.base_salary,
    payrollPeriod: row.payroll_period,
    hourlyRate: row.hourly_rate,
    overtimeRate: row.overtime_rate,
    allowances: row.allowances,
    deductions: row.deductions,
    taxRate: row.tax_rate,
    cpfRate: row.cpf_rate,
    cpfAmount: row.cpf_amount,
    employerCpfRate: row.employer_cpf_rate,
    employerCpfAmount: row.employer_cpf_amount,
    netSalary: row.net_salary,
    noOfWorkingDays: row.no_of_working_days,
    isActive: row.is_active,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
  };
}

function mapPayrollRecordRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    tenantSlug: row.tenant_slug,
    employeeId: row.employee_id,
    payrollConfigId: row.payroll_config_id,
    payPeriodStart: row.pay_period_start,
    payPeriodEnd: row.pay_period_end,
    payrollMonth: row.payroll_month,
    payrollYear: row.payroll_year,
    baseSalary: row.base_salary,
    overtimeHours: row.overtime_hours,
    overtimePay: row.overtime_pay,
    allowances: row.allowances,
    deductions: row.deductions,
    grossPay: row.gross_pay,
    taxDeduction: row.tax_deduction,
    cpfDeduction: row.cpf_deduction,
    netPay: row.net_pay,
    status: row.status,
    paymentDate: row.payment_date,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at,
  };
}

async function getTenantSlug(tenantId: number): Promise<string | null> {
  if (!db) return null;
  const [tenant] = await db
    .select({ slug: tenants.slug })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  return tenant?.slug ?? null;
}

// Get all employee payroll configurations
export async function getEmployeePayrollConfigs(req: Request, res: Response) {
  try {
    const tenantId = req.user!.tenantId;
    if (!tenantId) {
      return res.status(403).json({ message: "No tenant associated with user" });
    }
    
    const tenantDb = await getTenantPayrollDb(tenantId);
    
    const configs = await tenantDb
      .select({
        id: employeePayroll.id,
        employeeId: employeePayroll.employeeId,
        employeeName: employees.name,
        employeeEmail: employees.email,
        department: employees.department,
        designation: employees.designation,
        nationality: employees.nationality,
        baseSalary: employeePayroll.baseSalary,
        payrollPeriod: employeePayroll.payrollPeriod,
        hourlyRate: employeePayroll.hourlyRate,
        overtimeRate: employeePayroll.overtimeRate,
        allowances: employeePayroll.allowances,
        deductions: employeePayroll.deductions,
        taxRate: employeePayroll.taxRate,
        cpfRate: employeePayroll.cpfRate,
        cpfAmount: employeePayroll.cpfAmount,
        employerCpfRate: employeePayroll.employerCpfRate,
        employerCpfAmount: employeePayroll.employerCpfAmount,
        netSalary: employeePayroll.netSalary,
        isActive: employeePayroll.isActive,
        effectiveFrom: employeePayroll.effectiveFrom,
        effectiveTo: employeePayroll.effectiveTo,
        createdAt: employeePayroll.createdAt,
        updatedAt: employeePayroll.updatedAt,
      })
      .from(employeePayroll)
      .leftJoin(employees, eq(employeePayroll.employeeId, employees.id))
      .where(eq(employeePayroll.tenantId, tenantId))
      .orderBy(desc(employeePayroll.createdAt));

    res.json(configs);
  } catch (error) {
    console.error('Error fetching employee payroll configs:', error);
    res.status(500).json({ message: 'Failed to fetch employee payroll configurations' });
  }
}

// Create employee payroll configuration
export async function createEmployeePayrollConfig(req: Request, res: Response) {
  try {
    const tenantId = req.user!.tenantId;
    if (!tenantId) {
      return res.status(403).json({ message: "No tenant associated with user" });
    }
    const userId = req.user!.id;

    const tenantSlug = await getTenantSlug(tenantId);

    if (!tenantSlug) {
      return res.status(400).json({ message: 'Tenant not found' });
    }

    const pool = await getTenantPayrollPool(tenantId);
    const { effectiveTo, workingDays, ...body } = req.body;

    const validatedData = insertEmployeePayrollSchema.parse({
      ...body,
      tenantId,
      tenantSlug,
      createdBy: userId,
      effectiveTo: effectiveTo || undefined,
      noOfWorkingDays: workingDays != null ? Number(workingDays) : undefined,
    });

    // Check if active payroll config already exists for this employee
    const existingConfig = await pool.query(
      `SELECT id FROM employee_payroll
       WHERE tenant_id = $1 AND employee_id = $2 AND is_active = true
       LIMIT 1`,
      [tenantId, validatedData.employeeId],
    );

    if (existingConfig.rows.length > 0) {
      return res.status(400).json({ 
        message: 'Active payroll configuration already exists for this employee' 
      });
    }

    const result = await pool.query(
      `INSERT INTO employee_payroll (
        tenant_id, tenant_slug, employee_id, base_salary, payroll_period, hourly_rate,
        overtime_rate, allowances, deductions, tax_rate, cpf_rate, cpf_amount,
        employer_cpf_rate, employer_cpf_amount, net_salary, no_of_working_days,
        is_active, effective_from, effective_to, created_by
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20
      ) RETURNING *`,
      [
        tenantId,
        tenantSlug,
        validatedData.employeeId,
        validatedData.baseSalary,
        validatedData.payrollPeriod || "monthly",
        validatedData.hourlyRate ?? null,
        validatedData.overtimeRate ?? null,
        JSON.stringify(validatedData.allowances || {}),
        JSON.stringify(validatedData.deductions || {}),
        validatedData.taxRate ?? "0.00",
        validatedData.cpfRate ?? "20.00",
        validatedData.cpfAmount ?? null,
        validatedData.employerCpfRate ?? "0.00",
        validatedData.employerCpfAmount ?? null,
        validatedData.netSalary ?? null,
        validatedData.noOfWorkingDays ?? null,
        validatedData.isActive ?? true,
        validatedData.effectiveFrom,
        validatedData.effectiveTo ?? null,
        userId,
      ],
    );

    res.status(201).json(mapPayrollConfigRow(result.rows[0]));
  } catch (error: any) {
    console.error('Error creating employee payroll config:', error);
    if (error?.name === 'ZodError') {
      return res.status(400).json({
        message: 'Invalid payroll configuration data',
        details: error.errors,
      });
    }
    if (error?.code === '23503') {
      return res.status(400).json({
        message: 'Selected employee was not found. Please refresh and try again.',
      });
    }
    res.status(500).json({
      message: error?.detail || error?.message || 'Failed to create employee payroll configuration',
    });
  }
}

// Update employee payroll configuration
export async function updateEmployeePayrollConfig(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const tenantId = req.user!.tenantId;
    if (!tenantId) {
      return res.status(403).json({ message: "No tenant associated with user" });
    }

    const pool = await getTenantPayrollPool(tenantId);
    const { effectiveTo, workingDays, ...body } = req.body;

    const updatePayload: Record<string, unknown> = {
      updated_at: new Date(),
    };

    if (workingDays !== undefined) {
      updatePayload.no_of_working_days = workingDays != null ? Number(workingDays) : null;
    }

    const allowedKeys: Record<string, string> = {
      employeeId: "employee_id",
      baseSalary: "base_salary",
      payrollPeriod: "payroll_period",
      hourlyRate: "hourly_rate",
      overtimeRate: "overtime_rate",
      allowances: "allowances",
      deductions: "deductions",
      taxRate: "tax_rate",
      cpfRate: "cpf_rate",
      cpfAmount: "cpf_amount",
      employerCpfRate: "employer_cpf_rate",
      employerCpfAmount: "employer_cpf_amount",
      netSalary: "net_salary",
      noOfWorkingDays: "no_of_working_days",
      isActive: "is_active",
      effectiveFrom: "effective_from",
    };

    for (const [key, col] of Object.entries(allowedKeys)) {
      if (body[key] !== undefined) {
        updatePayload[col] = (key === "allowances" || key === "deductions")
          ? JSON.stringify(body[key] || {})
          : body[key];
      }
    }

    if (effectiveTo !== undefined) {
      updatePayload.effective_to = effectiveTo || null;
    }

    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;
    for (const [col, val] of Object.entries(updatePayload)) {
      if (col === "allowances" || col === "deductions") {
        sets.push(`${col} = $${idx++}::jsonb`);
      } else {
        sets.push(`${col} = $${idx++}`);
      }
      values.push(val);
    }
    values.push(parseInt(id), tenantId);

    const result = await pool.query(
      `UPDATE employee_payroll SET ${sets.join(", ")}
       WHERE id = $${idx++} AND tenant_id = $${idx}
       RETURNING *`,
      values,
    );

    if (!result.rows[0]) {
      return res.status(404).json({ message: 'Payroll configuration not found' });
    }

    res.json(mapPayrollConfigRow(result.rows[0]));
  } catch (error: any) {
    console.error('Error updating employee payroll config:', error);
    res.status(500).json({
      message: error?.detail || error?.message || 'Failed to update employee payroll configuration',
    });
  }
}

// Get payroll records
export async function getPayrollRecords(req: Request, res: Response) {
  try {
    const tenantId = req.user!.tenantId;
    if (!tenantId) {
      return res.status(403).json({ message: "No tenant associated with user" });
    }
    const tenantDb = await getTenantPayrollDb(tenantId);
    const { employeeId, status, startDate, endDate } = req.query;

    const conditions = [eq(payrollRecords.tenantId, tenantId)];
    
    if (employeeId) {
      conditions.push(eq(payrollRecords.employeeId, parseInt(employeeId as string)));
    }
    
    if (status) {
      conditions.push(eq(payrollRecords.status, status as any));
    }
    
    if (startDate) {
      conditions.push(gte(payrollRecords.payPeriodStart, startDate as string));
    }
    
    if (endDate) {
      conditions.push(lte(payrollRecords.payPeriodEnd, endDate as string));
    }

    const records = await tenantDb
      .select({
        id: payrollRecords.id,
        employeeId: payrollRecords.employeeId,
        employeeName: employees.name,
        employeeEmail: employees.email,
        department: employees.department,
        designation: employees.designation,
        payPeriodStart: payrollRecords.payPeriodStart,
        payPeriodEnd: payrollRecords.payPeriodEnd,
        payrollMonth: payrollRecords.payrollMonth,
        payrollYear: payrollRecords.payrollYear,
        baseSalary: payrollRecords.baseSalary,
        overtimeHours: payrollRecords.overtimeHours,
        overtimePay: payrollRecords.overtimePay,
        allowances: payrollRecords.allowances,
        deductions: payrollRecords.deductions,
        grossPay: payrollRecords.grossPay,
        taxDeduction: payrollRecords.taxDeduction,
        cpfDeduction: payrollRecords.cpfDeduction,
        netPay: payrollRecords.netPay,
        status: payrollRecords.status,
        paymentDate: payrollRecords.paymentDate,
        notes: payrollRecords.notes,
        createdAt: payrollRecords.createdAt,
        updatedAt: payrollRecords.updatedAt,
      })
      .from(payrollRecords)
      .leftJoin(employees, eq(payrollRecords.employeeId, employees.id))
      .where(and(...conditions))
      .orderBy(desc(payrollRecords.createdAt));

    res.json(records);
  } catch (error) {
    console.error('Error fetching payroll records:', error);
    res.status(500).json({ message: 'Failed to fetch payroll records' });
  }
}

// Create payroll record
export async function createPayrollRecord(req: Request, res: Response) {
  try {
    const tenantId = req.user!.tenantId;
    if (!tenantId) {
      return res.status(403).json({ message: "No tenant associated with user" });
    }
    const userId = req.user!.id;
    
    const pool = await getTenantPayrollPool(tenantId);
    const tenantSlug = await getTenantSlug(tenantId);
    if (!tenantSlug) {
      return res.status(400).json({ message: 'Tenant not found' });
    }
    
    const {
      employeeId,
      payPeriodStart,
      payPeriodEnd,
      payrollConfigId,
      baseSalary,
      overtimeHours = 0,
      overtimePay,
      allowances,
      deductions,
      grossPay,
      taxDeduction,
      cpfDeduction,
      netPay,
      status,
      notes,
    } = req.body;

    // Resolve payroll config when not provided
    let configId = payrollConfigId;
    if (!configId) {
      const configResult = await pool.query(
        `SELECT id FROM employee_payroll
         WHERE tenant_id = $1 AND employee_id = $2 AND is_active = true
         LIMIT 1`,
        [tenantId, employeeId],
      );

      if (!configResult.rows[0]) {
        return res.status(400).json({ 
          message: 'No active payroll configuration found for this employee' 
        });
      }
      configId = configResult.rows[0].id;
    }

    const validatedData = insertPayrollRecordSchema.parse({
      tenantId,
      tenantSlug,
      employeeId,
      payrollConfigId: configId,
      payPeriodStart,
      payPeriodEnd,
      baseSalary: String(baseSalary ?? "0"),
      overtimeHours: String(overtimeHours ?? 0),
      overtimePay: String(overtimePay ?? "0"),
      allowances: allowances || {},
      deductions: deductions || {},
      grossPay: String(grossPay ?? "0"),
      taxDeduction: String(taxDeduction ?? "0"),
      cpfDeduction: String(cpfDeduction ?? "0"),
      netPay: String(netPay ?? "0"),
      status: status || 'pending',
      notes,
      createdBy: userId,
    });

    const start = new Date(payPeriodStart);
    const result = await pool.query(
      `INSERT INTO payroll_records (
        tenant_id, tenant_slug, employee_id, payroll_config_id, pay_period_start, pay_period_end,
        payroll_month, payroll_year, base_salary, overtime_hours, overtime_pay, allowances, deductions,
        gross_pay, tax_deduction, cpf_deduction, net_pay, status, notes, created_by
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb,$14,$15,$16,$17,$18,$19,$20
      ) RETURNING *`,
      [
        tenantId,
        tenantSlug,
        validatedData.employeeId,
        validatedData.payrollConfigId,
        validatedData.payPeriodStart,
        validatedData.payPeriodEnd,
        start.getMonth() + 1,
        start.getFullYear(),
        validatedData.baseSalary,
        validatedData.overtimeHours,
        validatedData.overtimePay,
        JSON.stringify(validatedData.allowances || {}),
        JSON.stringify(validatedData.deductions || {}),
        validatedData.grossPay,
        validatedData.taxDeduction,
        validatedData.cpfDeduction,
        validatedData.netPay,
        validatedData.status || "pending",
        validatedData.notes ?? null,
        userId,
      ],
    );

    res.status(201).json(mapPayrollRecordRow(result.rows[0]));
  } catch (error) {
    console.error('Error creating payroll record:', error);
    res.status(500).json({ message: 'Failed to create payroll record' });
  }
}

// Update payroll record status
export async function updatePayrollRecordStatus(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;
    const tenantId = req.user!.tenantId;
    if (!tenantId) {
      return res.status(403).json({ message: "No tenant associated with user" });
    }
    const userId = req.user!.id;

    const pool = await getTenantPayrollPool(tenantId);
    const sets = [`status = $1`, `updated_at = NOW()`];
    const values: unknown[] = [status];
    let idx = 2;

    if (notes !== undefined) {
      sets.push(`notes = $${idx++}`);
      values.push(notes);
    }
    if (status === 'approved') {
      sets.push(`approved_by = $${idx++}`);
      values.push(userId);
      sets.push(`approved_at = NOW()`);
    }
    if (status === 'paid') {
      sets.push(`payment_date = $${idx++}`);
      values.push(new Date().toISOString().split('T')[0]);
    }

    values.push(parseInt(id), tenantId);
    const result = await pool.query(
      `UPDATE payroll_records SET ${sets.join(", ")}
       WHERE id = $${idx++} AND tenant_id = $${idx}
       RETURNING *`,
      values,
    );

    if (!result.rows[0]) {
      return res.status(404).json({ message: 'Payroll record not found' });
    }

    res.json(mapPayrollRecordRow(result.rows[0]));
  } catch (error) {
    console.error('Error updating payroll record status:', error);
    res.status(500).json({ message: 'Failed to update payroll record status' });
  }
}

// Get payroll summary/dashboard
export async function getPayrollSummary(req: Request, res: Response) {
  try {
    const tenantId = req.user!.tenantId;
    if (!tenantId) {
      return res.status(403).json({ message: "No tenant associated with user" });
    }
    const tenantDb = await getTenantPayrollDb(tenantId);
    const { month, year } = req.query;
    
    // Get total employees with payroll configs
    const totalEmployees = await tenantDb
      .select({ count: sql<number>`count(*)` })
      .from(employeePayroll)
      .where(
        and(
          eq(employeePayroll.tenantId, tenantId),
          eq(employeePayroll.isActive, true)
        )
      );

    // Get payroll records summary for the period
    const recordConditions = [eq(payrollRecords.tenantId, tenantId)];

    if (month && year) {
      const startDate = `${year}-${month.toString().padStart(2, '0')}-01`;
      const endDate = `${year}-${month.toString().padStart(2, '0')}-31`;
      recordConditions.push(gte(payrollRecords.payPeriodStart, startDate));
      recordConditions.push(lte(payrollRecords.payPeriodEnd, endDate));
    }

    const [summary] = await tenantDb
      .select({
        totalGrossPay: sql<string>`sum(${payrollRecords.grossPay})`,
        totalNetPay: sql<string>`sum(${payrollRecords.netPay})`,
        totalTaxDeduction: sql<string>`sum(${payrollRecords.taxDeduction})`,
        totalCpfDeduction: sql<string>`sum(${payrollRecords.cpfDeduction})`,
        paidRecords: sql<number>`count(case when ${payrollRecords.status} = 'paid' then 1 end)`,
        pendingRecords: sql<number>`count(case when ${payrollRecords.status} = 'pending' then 1 end)`,
        draftRecords: sql<number>`count(case when ${payrollRecords.status} = 'draft' then 1 end)`,
      })
      .from(payrollRecords)
      .where(and(...recordConditions));

    res.json({
      totalEmployees: totalEmployees[0]?.count || 0,
      totalGrossPay: parseFloat(summary?.totalGrossPay || '0'),
      totalNetPay: parseFloat(summary?.totalNetPay || '0'),
      totalTaxDeduction: parseFloat(summary?.totalTaxDeduction || '0'),
      totalCpfDeduction: parseFloat(summary?.totalCpfDeduction || '0'),
      paidRecords: summary?.paidRecords || 0,
      pendingRecords: summary?.pendingRecords || 0,
      draftRecords: summary?.draftRecords || 0,
    });
  } catch (error) {
    console.error('Error fetching payroll summary:', error);
    res.status(500).json({ message: 'Failed to fetch payroll summary' });
  }
}

// Delete employee payroll configuration
export async function deleteEmployeePayrollConfig(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const tenantId = req.user!.tenantId;
    if (!tenantId) {
      return res.status(403).json({ message: "No tenant associated with user" });
    }
    const force = req.query.force === "true";

    const pool = await getTenantPayrollPool(tenantId);
    const configId = parseInt(id);

    const relatedRecords = await pool.query(
      `SELECT id FROM payroll_records WHERE payroll_config_id = $1 AND tenant_id = $2`,
      [configId, tenantId],
    );

    if (relatedRecords.rows.length > 0 && !force) {
      return res.status(409).json({ message: "Payroll config has related payroll records" });
    }

    if (force && relatedRecords.rows.length > 0) {
      await pool.query(
        `DELETE FROM payroll_records WHERE payroll_config_id = $1 AND tenant_id = $2`,
        [configId, tenantId],
      );
    }

    const deleted = await pool.query(
      `DELETE FROM employee_payroll WHERE id = $1 AND tenant_id = $2 RETURNING id`,
      [configId, tenantId],
    );

    if (!deleted.rows.length) {
      return res.status(404).json({ message: "Payroll configuration not found" });
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error("Error deleting payroll config:", error);
    res.status(500).json({
      message: error?.message || "Failed to delete payroll configuration",
    });
  }
}