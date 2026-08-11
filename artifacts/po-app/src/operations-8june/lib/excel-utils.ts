import * as XLSX from "xlsx";

export interface PayrollTableExportRow {
  employee: string;
  department: string;
  designation: string;
  payrollPeriod: string;
  baseSalary: string;
  annualSalary: string;
  cpfRateEmployee: string;
  cpfAmountEmployee: string;
  cpfRateEmployer: string;
  cpfAmountEmployer: string;
}

export function exportPayrollTableToExcel(rows: PayrollTableExportRow[]) {
  const sheetRows = rows.map((row) => ({
    Employee: row.employee,
    Department: row.department,
    Designation: row.designation,
    "Payroll Period": row.payrollPeriod,
    "Basic Salary": row.baseSalary,
    "Annual Salary": row.annualSalary,
    "CPF Rate (Employee)": row.cpfRateEmployee,
    "CPF Amount (Employee)": row.cpfAmountEmployee,
    "CPF Rate (Employer)": row.cpfRateEmployer,
    "CPF Amount (Employer)": row.cpfAmountEmployer,
  }));

  const worksheet = XLSX.utils.json_to_sheet(sheetRows);
  worksheet["!cols"] = [
    { wch: 28 },
    { wch: 18 },
    { wch: 20 },
    { wch: 16 },
    { wch: 14 },
    { wch: 14 },
    { wch: 20 },
    { wch: 20 },
    { wch: 20 },
    { wch: 20 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Payroll");
  XLSX.writeFile(
    workbook,
    `payroll-configurations-${new Date().toISOString().split("T")[0]}.xlsx`
  );
}
