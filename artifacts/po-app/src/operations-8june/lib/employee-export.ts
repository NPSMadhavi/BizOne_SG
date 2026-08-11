import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import "jspdf-autotable";
import { format } from "date-fns";

export type EmployeeExportRow = {
  employeeId?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  department?: string | null;
  designation?: string | null;
  joinDate?: string | Date | null;
  dateOfBirth?: string | Date | null;
  status?: string | null;
  salary?: string | number | null;
  annualSalary?: string | number | null;
  nationality?: string | null;
  prStatus?: string | null;
  passportNumber?: string | null;
  passportExpiry?: string | Date | null;
  visaNumber?: string | null;
  visaExpiry?: string | Date | null;
  visaType?: string | null;
  nricNumber?: string | null;
  nricExpiry?: string | Date | null;
  visaRemarks?: string | null;
};

function fmtDate(value?: string | Date | null): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return format(d, "dd MMM yyyy");
}

function fmtText(value?: string | number | null): string {
  if (value == null || value === "") return "";
  return String(value);
}

function toSheetRows(employees: EmployeeExportRow[]) {
  return employees.map((e) => ({
    "Employee ID": fmtText(e.employeeId),
    Name: fmtText(e.name),
    Email: fmtText(e.email),
    Phone: fmtText(e.phone),
    Department: fmtText(e.department),
    Designation: fmtText(e.designation),
    "Join Date": fmtDate(e.joinDate),
    "Date of Birth": fmtDate(e.dateOfBirth),
    Status: fmtText(e.status),
    Salary: fmtText(e.salary),
    "Annual Salary": fmtText(e.annualSalary),
    Nationality: fmtText(e.nationality),
    "PR Status": fmtText(e.prStatus),
    Address: fmtText(e.address),
    "Passport Number": fmtText(e.passportNumber),
    "Passport Expiry": fmtDate(e.passportExpiry),
    "Visa Number": fmtText(e.visaNumber),
    "Visa Type": fmtText(e.visaType),
    "Visa Expiry": fmtDate(e.visaExpiry),
    "NRIC/IC Number": fmtText(e.nricNumber),
    "NRIC Expiry": fmtDate(e.nricExpiry),
    "Visa Remarks": fmtText(e.visaRemarks),
  }));
}

function fileStamp() {
  return format(new Date(), "yyyy-MM-dd");
}

export function exportEmployeesToExcel(employees: EmployeeExportRow[]) {
  const rows = toSheetRows(employees);
  const worksheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{}]);
  const colCount = Object.keys(rows[0] ?? { A: "" }).length || 1;
  worksheet["!cols"] = Array.from({ length: colCount }, () => ({ wch: 18 }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Employees");
  XLSX.writeFile(workbook, `employees-${fileStamp()}.xlsx`);
}

export function exportEmployeesToPdf(employees: EmployeeExportRow[]) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const dateLabel = format(new Date(), "dd MMM yyyy");

  doc.setFontSize(14);
  doc.setTextColor(37, 99, 235);
  doc.text("Employees Report", 14, 14);
  doc.setFontSize(9);
  doc.setTextColor(107, 114, 128);
  doc.text(`Generated: ${dateLabel}  |  Total: ${employees.length}`, 14, 20);

  (doc as any).autoTable({
    startY: 24,
    head: [[
      "Employee ID",
      "Name",
      "Email",
      "Phone",
      "Department",
      "Designation",
      "Join Date",
      "Status",
      "Salary",
      "Nationality",
    ]],
    body: employees.map((e) => [
      fmtText(e.employeeId),
      fmtText(e.name),
      fmtText(e.email),
      fmtText(e.phone),
      fmtText(e.department),
      fmtText(e.designation),
      fmtDate(e.joinDate),
      fmtText(e.status),
      fmtText(e.salary),
      fmtText(e.nationality),
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

  const lastY = (doc as any).lastAutoTable?.finalY ?? 30;
  const needNewPage = lastY > 170;
  if (needNewPage) doc.addPage();

  const sectionY = needNewPage ? 14 : lastY + 10;
  doc.setFontSize(11);
  doc.setTextColor(17, 24, 39);
  doc.text("Identity & Documents", 14, sectionY);

  (doc as any).autoTable({
    startY: sectionY + 4,
    head: [[
      "Employee ID",
      "Name",
      "Passport",
      "Passport Expiry",
      "Visa / Permit",
      "Visa Expiry",
      "NRIC/IC",
      "NRIC Expiry",
      "Address",
    ]],
    body: employees.map((e) => [
      fmtText(e.employeeId),
      fmtText(e.name),
      fmtText(e.passportNumber),
      fmtDate(e.passportExpiry),
      fmtText(e.visaNumber),
      fmtDate(e.visaExpiry),
      fmtText(e.nricNumber),
      fmtDate(e.nricExpiry),
      fmtText(e.address),
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

  doc.save(`employees-${fileStamp()}.pdf`);
}
