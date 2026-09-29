import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import "jspdf-autotable";
import { format } from "date-fns";

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

const PAYROLL_EXPORT_HEADERS = [
  "Employee",
  "Department",
  "Designation",
  "Payroll Period",
  "Basic Salary",
  "Annual Salary",
  "CPF Rate (Employee)",
  "CPF Amount (Employee)",
  "CPF Rate (Employer)",
  "CPF Amount (Employer)",
] as const;

export function exportPayrollTableToPdf(rows: PayrollTableExportRow[]) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const dateLabel = format(new Date(), "dd MMM yyyy");

  doc.setFontSize(14);
  doc.setTextColor(37, 99, 235);
  doc.text("Employee Payroll", 14, 14);
  doc.setFontSize(9);
  doc.setTextColor(107, 114, 128);
  doc.text(`Generated: ${dateLabel}  |  Total: ${rows.length}`, 14, 20);

  (doc as any).autoTable({
    startY: 24,
    head: [PAYROLL_EXPORT_HEADERS.slice()],
    body: rows.map((row) => [
      row.employee,
      row.department,
      row.designation,
      row.payrollPeriod,
      row.baseSalary,
      row.annualSalary,
      row.cpfRateEmployee,
      row.cpfAmountEmployee,
      row.cpfRateEmployer,
      row.cpfAmountEmployer,
    ]),
    styles: { fontSize: 7, cellPadding: 1.5, overflow: "linebreak" },
    headStyles: {
      fillColor: [59, 130, 246],
      textColor: 255,
      fontStyle: "bold",
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 10, right: 10 },
  });

  doc.save(`payroll-configurations-${format(new Date(), "yyyy-MM-dd")}.pdf`);
}
