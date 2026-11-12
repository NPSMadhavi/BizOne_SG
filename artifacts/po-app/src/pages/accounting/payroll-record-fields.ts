type PayrollRow = Record<string, unknown> | null | undefined;

export function payrollValue(row: PayrollRow, ...keys: string[]) {
  if (!row) return undefined;
  for (const key of keys) {
    const value = row[key];
    if (value != null && value !== "") return value;
  }
  return undefined;
}

export function payrollAmount(row: PayrollRow, ...keys: string[]) {
  const n = parseFloat(String(payrollValue(row, ...keys) ?? 0));
  return Number.isFinite(n) ? n : 0;
}

export function payrollEmployeeId(row: PayrollRow) {
  return payrollValue(row, "employeeId", "employee_id");
}

export function payrollEmployeeName(row: PayrollRow, employees: any[] = []) {
  const id = payrollEmployeeId(row);
  const emp = employees.find((e) => Number(e.id) === Number(id));
  const name = payrollValue(row, "employeeName", "employee_name") || emp?.name;
  if (name) return String(name);
  return id != null ? `Employee ${id}` : "Employee";
}

export function payrollEmployeeSubtitle(row: PayrollRow, employees: any[] = []) {
  const id = payrollEmployeeId(row);
  const emp = employees.find((e) => Number(e.id) === Number(id));
  return String(emp?.employeeId || payrollValue(row, "designation") || emp?.designation || "");
}

export function payrollPeriodLabel(row: PayrollRow) {
  const start = payrollValue(row, "payPeriodStart", "pay_period_start");
  if (!start) return "—";
  const d = new Date(String(start));
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-SG", { month: "short", year: "numeric" });
}
