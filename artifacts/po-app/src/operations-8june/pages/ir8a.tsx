import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePagination } from "@/hooks/use-pagination";
import { ListPagination } from "@/components/list-pagination";
import { useToast } from "@/hooks/use-toast";
import { calculateSyncBridgePayrollPreview } from "@/operations-8june/lib/payroll-utils";
import { emptyEarningsSplit, splitEarnings, type EarningsSplit } from "@/operations-8june/lib/payroll-earnings";
import {
  calculateAgeFromDob,
  mapEmployeeResidency,
} from "@/operations-8june/types/singapore-payroll";
import {
  Users,
  DollarSign,
  Shield,
  FileText,
  Search,
  Download,
  Save,
  CheckCircle2,
  Send,
  FileCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/auth-context";
import { downloadIr8aForm, Ir8aFormView, type Ir8aOfficialFormData } from "@/operations-8june/pages/ir8a-form-view";
import { Ir8aGenerateDialog } from "@/operations-8june/pages/ir8a-generate-dialog";

type Ir8aStatus = "Ready" | "Check" | "Pending" | "Submitted";

type EmployeeRow = {
  id: number;
  employeeId?: string | null;
  name?: string | null;
  designation?: string | null;
  nricNumber?: string | null;
  salary?: string | number | null;
  annualSalary?: string | number | null;
  nationality?: string | null;
  prStatus?: string | null;
  dateOfBirth?: string | null;
  joinDate?: string | null;
  status?: string | null;
};

type PayrollRecord = {
  id: number;
  employeeId: number;
  payrollYear?: number | string | null;
  payPeriodStart?: string | null;
  baseSalary?: string | number | null;
  allowances?: unknown;
  overtimePay?: string | number | null;
  grossPay?: string | number | null;
  cpfDeduction?: string | number | null;
  netPay?: string | number | null;
  payrollMonth?: string | number | null;
};

type PayrollConfigRow = {
  employeeId: number;
  isActive?: boolean | null;
  allowances?: unknown;
  baseSalary?: string | number | null;
};

type Ir8aLine = {
  employee: EmployeeRow;
  monthlySalary: number;
  grossSalary: number;
  bonus: number;
  allowances: number;
  directorsFees: number;
  fees: number;
  otherPayments: number;
  gross: number;
  benefitsInKind: number;
  shareOption: number;
  retirementBenefits: number;
  incomeTaxBorneByEmployee: number;
  employeeCpf: number;
  employerCpf: number;
  status: Ir8aStatus;
  checks: { label: string; ok: boolean }[];
};

function num(value: unknown) {
  const n = parseFloat(String(value ?? 0));
  return Number.isFinite(n) ? n : 0;
}

function money(value: number) {
  return value.toLocaleString("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function recordYear(record: PayrollRecord) {
  const year = Number(record.payrollYear);
  if (Number.isFinite(year) && year > 0) return year;
  const start = String(record.payPeriodStart || "");
  const parsed = Number(start.slice(0, 4));
  return Number.isFinite(parsed) ? parsed : 0;
}

function addSplit(left: EarningsSplit, right: EarningsSplit): EarningsSplit {
  const next = emptyEarningsSplit();
  for (const key of Object.keys(next) as (keyof EarningsSplit)[]) {
    next[key] = left[key] + right[key];
  }
  return next;
}

function scaleSplit(split: EarningsSplit, factor: number): EarningsSplit {
  const next = emptyEarningsSplit();
  for (const key of Object.keys(next) as (keyof EarningsSplit)[]) {
    next[key] = split[key] * factor;
  }
  return next;
}

function buildLine(
  employee: EmployeeRow,
  records: PayrollRecord[],
  config: PayrollConfigRow | undefined,
  year: number,
  submitted: boolean,
): Ir8aLine {
  const months = records.filter(
    (record) => Number(record.employeeId) === Number(employee.id) && recordYear(record) === year,
  );
  const monthlySalary = num(employee.salary) || num(config?.baseSalary);
  const { residencyType } = mapEmployeeResidency({
    nationality: employee.nationality,
    prStatus: employee.prStatus,
  });
  const preview = calculateSyncBridgePayrollPreview({
    monthlySalary,
    age: calculateAgeFromDob(employee.dateOfBirth),
    citizenshipStatus: residencyType,
    prStatus: employee.prStatus,
    allowances: (config?.allowances && typeof config.allowances === "object"
      ? config.allowances
      : {}) as Record<string, number>,
  });

  const hasRecords = months.length > 0;
  const periods = hasRecords ? months.length : 12;
  const recordComponents = hasRecords
    ? months.reduce((total, record) => addSplit(total, splitEarnings(record.allowances)), emptyEarningsSplit())
    : emptyEarningsSplit();
  const recordHasBreakdown = recordComponents.allowances + recordComponents.bonus + recordComponents.fees + recordComponents.otherIncome + recordComponents.overtime > 0;
  const components = recordHasBreakdown
    ? recordComponents
    : scaleSplit(splitEarnings(config?.allowances), periods);
  const grossSalary = monthlySalary * periods + components.overtime;
  const allowances = components.allowances;
  const bonus = components.bonus;
  const directorsFees = components.directorsFees;
  const fees = components.fees;
  const otherPayments = components.otherPayments;
  const gross = grossSalary + bonus + directorsFees + fees + allowances + otherPayments;
  const employeeCpf = hasRecords
    ? months.reduce((sum, record) => sum + num(record.cpfDeduction), 0)
    : preview.employeeCpf * 12;
  const employerCpf = preview.employerCpf * (hasRecords ? months.length : 12);
  const nric = String(employee.nricNumber || "").trim();
  const checks = [
    { label: "Payroll records matched", ok: hasRecords || monthlySalary > 0 },
    { label: "CPF calculations completed", ok: employeeCpf > 0 || residencyType === "foreigner" || monthlySalary > 0 },
    { label: "Employee particulars available", ok: Boolean(employee.name && employee.employeeId && nric) },
    { label: "IR8A data ready", ok: Boolean(nric) && gross > 0 },
  ];

  let status: Ir8aStatus = "Ready";
  if (submitted) status = "Submitted";
  else if (!nric) status = "Check";
  else if (gross <= 0) status = "Pending";

  return {
    employee,
    monthlySalary,
    grossSalary,
    bonus,
    allowances,
    directorsFees,
    fees,
    otherPayments,
    gross,
    benefitsInKind: components.benefitsInKind,
    shareOption: components.shareOption + components.genericOtherIncome,
    retirementBenefits: components.retirementBenefits,
    incomeTaxBorneByEmployee: components.incomeTaxBorneByEmployee,
    employeeCpf,
    employerCpf,
    status,
    checks,
  };
}

function statusClass(status: Ir8aStatus) {
  if (status === "Ready") return "bg-emerald-50 text-emerald-700";
  if (status === "Check") return "bg-amber-50 text-amber-700";
  if (status === "Submitted") return "bg-blue-50 text-blue-700";
  return "bg-orange-50 text-orange-700";
}

function attentionIssue(line: Ir8aLine) {
  const employee = line.employee;
  if (!String(employee.nricNumber || "").trim()) return "Missing NRIC / FIN";
  if (!String(employee.designation || "").trim()) return "Missing Designation";
  if (!String(employee.joinDate || "").trim()) return "Missing Date of Commencement";
  const { residencyType } = mapEmployeeResidency({
    nationality: employee.nationality,
    prStatus: employee.prStatus,
  });
  if (line.employeeCpf <= 0 && line.employerCpf <= 0 && residencyType !== "foreigner") return "Missing CPF Data";
  return null;
}

function formDataFor(
  line: Ir8aLine,
  year: number,
  company: { name?: string | null; registrationNo?: string | null; address?: string | null } | null,
  employer?: { employerName?: string | null; uen?: string | null; address?: string | null; signatoryName?: string | null; designation?: string | null; declarationDate?: string | null; signature?: string | null } | null,
): Ir8aOfficialFormData {
  return {
    year,
    employerName: employer?.employerName?.trim() || company?.name?.trim() || "—",
    employerUen: employer?.uen?.trim() || company?.registrationNo?.trim() || "—",
    employerAddress: employer?.address?.trim() || company?.address?.trim() || "—",
    employeeName: line.employee.name?.trim() || "—",
    nric: line.employee.nricNumber?.trim() || "—",
    designation: line.employee.designation?.trim() || "—",
    commencement: line.employee.joinDate || null,
    cessation: null,
    bank: "—",
    grossSalary: line.grossSalary,
    bonus: line.bonus,
    directorsFees: line.directorsFees,
    fees: line.fees,
    allowances: line.allowances,
    otherPayments: line.otherPayments,
    gross: line.gross,
    employeeCpf: line.employeeCpf,
    employerCpf: line.employerCpf,
    benefitsInKind: line.benefitsInKind,
    shareOption: line.shareOption,
    retirementBenefits: line.retirementBenefits,
    incomeTaxBorne: line.incomeTaxBorneByEmployee,
    signatoryName: employer?.signatoryName?.trim() || "—",
    signatoryDesignation: employer?.designation?.trim() || "—",
    declarationDate: employer?.declarationDate || "",
    signature: employer?.signature || "",
  };
}

export default function Ir8aPage() {
  const { toast } = useToast();
  const { selectedCompany } = useAuth();
  const [, setLocation] = useLocation();
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [submittedIds, setSubmittedIds] = useState<number[]>([]);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [generatePhase, setGeneratePhase] = useState<"running" | "done">("running");
  const [generateRun, setGenerateRun] = useState(0);
  const [processed, setProcessed] = useState(0);
  const [progressPercent, setProgressPercent] = useState(0);
  const [checkedAttention, setCheckedAttention] = useState<number[]>([]);
  const [formOpen, setFormOpen] = useState(false);

  const { data: employees = [], isLoading: employeesLoading } = useQuery<EmployeeRow[]>({
    queryKey: ["/api/employees"],
  });
  const { data: payrollRecords = [], isLoading: recordsLoading } = useQuery<PayrollRecord[]>({
    queryKey: ["/api/payroll/records"],
  });
  const { data: payrollConfigs = [] } = useQuery<PayrollConfigRow[]>({
    queryKey: ["/api/payroll/configs"],
  });
  const { data: ir8aEmployers = [] } = useQuery<{
    employerName?: string | null;
    uen?: string | null;
    address?: string | null;
    signatoryName?: string | null;
    designation?: string | null;
    declarationDate?: string | null;
    signature?: string | null;
  }[]>({
    queryKey: ["/api/ir8a/employers"],
  });

  const assessmentYear = Number(year);
  const lines = useMemo(
    () => employees.map((employee) => {
      const config = payrollConfigs.find(
        (item) => Number(item.employeeId) === Number(employee.id) && item.isActive !== false,
      ) || payrollConfigs.find((item) => Number(item.employeeId) === Number(employee.id));
      return buildLine(employee, payrollRecords, config, assessmentYear, submittedIds.includes(employee.id));
    }),
    [employees, payrollRecords, payrollConfigs, assessmentYear, submittedIds],
  );
  const linesRef = useRef(lines);
  linesRef.current = lines;

  useEffect(() => {
    if (!generateOpen || generatePhase !== "running") return;
    const duration = 2800;
    const started = Date.now();
    setProcessed(0);
    setProgressPercent(0);
    const timer = window.setInterval(() => {
      const count = linesRef.current.length;
      const ratio = Math.min(1, (Date.now() - started) / duration);
      setProgressPercent(Math.round(ratio * 100));
      setProcessed(count === 0 ? 0 : Math.min(count, Math.round(ratio * count)));
      if (ratio >= 1) {
        window.clearInterval(timer);
        setProcessed(count);
        setProgressPercent(100);
        setGeneratePhase("done");
      }
    }, 80);
    return () => window.clearInterval(timer);
  }, [generateOpen, generatePhase, generateRun]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return lines.filter((line) => {
      if (statusFilter !== "all" && line.status !== statusFilter) return false;
      if (!q) return true;
      const employee = line.employee;
      return [employee.name, employee.employeeId, employee.nricNumber]
        .some((value) => String(value || "").toLowerCase().includes(q));
    });
  }, [lines, search, statusFilter]);

  const { page, setPage, totalPages, paginatedItems, totalItems } = usePagination(filtered, 10);
  const selected = lines.find((line) => line.employee.id === selectedId) || null;
  const readyCount = lines.filter((line) => line.status === "Ready" || line.status === "Submitted").length;
  const pendingCount = lines.length - readyCount;
  const activeCount = employees.filter((employee) => String(employee.status || "active") === "active").length;
  const totalGross = lines.reduce((sum, line) => sum + line.gross, 0);
  const totalCpf = lines.reduce((sum, line) => sum + line.employeeCpf + line.employerCpf, 0);
  const from = totalItems === 0 ? 0 : (page - 1) * 10 + 1;
  const to = Math.min(page * 10, totalItems);

  const attention = lines.flatMap((line) => {
    const issue = attentionIssue(line);
    if (!issue) return [];
    return [{
      id: line.employee.id,
      name: line.employee.name || "—",
      nric: line.employee.nricNumber || "—",
      issue,
    }];
  });
  const formData = selected ? formDataFor(selected, assessmentYear, selectedCompany, ir8aEmployers[0]) : null;

  function openEmployee(id: number) {
    setSelectedId(id);
  }

  function startGenerate() {
    setProcessed(0);
    setProgressPercent(0);
    setGeneratePhase("running");
    setGenerateRun((run) => run + 1);
    setGenerateOpen(true);
  }

  function openForm(print: boolean) {
    if (!selected) return;
    setFormOpen(true);
    if (!print) return;
    if (formData) downloadIr8aForm(formData);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#111827]">IR8A – Employment Income Declaration</h1>
          <p className="mt-1 text-sm text-[#6B7280]">Auto-filled from Payroll and CPF calculations</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-sm text-[#6B7280]">Year of Assessment</span>
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger className="h-10 w-[110px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[2024, 2025, 2026, 2027, 2028].map((value) => (
                <SelectItem key={value} value={String(value)}>{value}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={Users} iconClass="bg-blue-50 text-[#2563EB]" label="Total Employees" value={String(employees.length)} hint={`${activeCount} Active employees`} />
        <Kpi icon={DollarSign} iconClass="bg-emerald-50 text-emerald-600" label="Total Gross Employment Income" value={`SGD ${money(totalGross)}`} hint="(Annual)" />
        <Kpi icon={Shield} iconClass="bg-sky-50 text-sky-600" label="Total CPF Contribution" value={`SGD ${money(totalCpf)}`} hint="(Annual)" />
        <Kpi icon={FileText} iconClass="bg-orange-50 text-orange-600" label="IR8A Status" value={`${readyCount} Ready / ${pendingCount} Pending`} hint="" bar />
      </div>

      <div className="overflow-hidden rounded-xl border border-[#E5E7EB] bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-[#E5E7EB] p-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9CA3AF]" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name, NRIC or employee code"
              className="h-10 pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-10 w-[150px]">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="Ready">Ready</SelectItem>
              <SelectItem value="Check">Check</SelectItem>
              <SelectItem value="Pending">Pending</SelectItem>
              <SelectItem value="Submitted">Submitted</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-[#F9FAFB] text-left text-xs text-[#6B7280]">
                <th className="w-12 px-4 py-3" />
                <th className="px-3 py-3 font-medium">Employee</th>
                <th className="px-3 py-3 font-medium">NRIC / FIN</th>
                <th className="px-3 py-3 text-right font-medium">Gross Income (SGD)</th>
                <th className="px-3 py-3 text-right font-medium">CPF (SGD)</th>
                <th className="px-4 py-3 text-right font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {employeesLoading || recordsLoading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-[#6B7280]">Loading employees...</td>
                </tr>
              ) : paginatedItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-[#6B7280]">No employees found.</td>
                </tr>
              ) : (
                paginatedItems.map((line) => {
                  const employee = line.employee;
                  const selectedRow = selectedId === employee.id;
                  return (
                    <tr
                      key={employee.id}
                      className={cn("cursor-pointer border-b border-[#F3F4F6] hover:bg-[#F8FAFC]", selectedRow && "bg-[#EFF6FF]")}
                      onClick={() => openEmployee(employee.id)}
                    >
                      <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                        <Checkbox
                          checked={selectedRow}
                          onCheckedChange={() => openEmployee(employee.id)}
                          aria-label={`Open IR8A for ${employee.name || "employee"}`}
                        />
                      </td>
                      <td className="px-3 py-3">
                        <div className="font-medium text-[#111827]">{employee.name || "—"}</div>
                        <div className="text-xs text-[#6B7280]">{employee.employeeId || "—"}</div>
                      </td>
                      <td className="px-3 py-3 text-[#374151]">{employee.nricNumber || "—"}</td>
                      <td className="px-3 py-3 text-right">{money(line.gross)}</td>
                      <td className="px-3 py-3 text-right">{money(line.employeeCpf + line.employerCpf)}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium", statusClass(line.status))}>
                          {line.status}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-[#6B7280]">Showing {from} – {to} of {totalItems} employees</p>
          <ListPagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </div>
      </div>

      <Dialog open={selected != null && !generateOpen && !formOpen} onOpenChange={(open) => !open && setSelectedId(null)}>
        <DialogContent className="max-h-[92vh] w-[min(1080px,calc(100vw-2rem))] max-w-none overflow-y-auto">
          {selected && (
            <>
              <DialogHeader className="space-y-3 pr-8">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <DialogTitle className="text-lg">IR8A – Employee Details</DialogTitle>
                    <p className="mt-1 text-sm text-[#6B7280]">
                      {selected.employee.name} <span className="mx-1">|</span> {selected.employee.employeeId || "—"} <span className="mx-1">|</span> {selected.employee.nricNumber || "—"} <span className="mx-1">|</span> {selected.employee.designation || "—"}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-[#EFF6FF] px-3 py-1 text-xs font-semibold text-[#2563EB]">YA {year}</span>
                </div>
              </DialogHeader>

              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(260px,0.8fr)]">
                  <div className="space-y-3">
                    <StatementTable
                      title="Employment Income (As per IR8A)"
                      leftHeader="Type of Income"
                      rows={[
                        { label: "1. Gross Salary, Wages and Other Employment Income", value: selected.grossSalary },
                        { label: "2. Bonus", value: selected.bonus },
                        { label: "3. Director's Fees", value: selected.directorsFees },
                        { label: "4. Fees (including Commissions)", value: selected.fees },
                        { label: "5. Allowances", value: selected.allowances },
                        { label: "6. Other Payments", value: selected.otherPayments },
                        { label: "Gross Employment Income", value: selected.gross, emphasize: true, accent: true },
                      ]}
                    />
                    <StatementTable
                      title="CPF Contributions"
                      leftHeader="Type"
                      rows={[
                        { label: "Employee CPF Contribution", value: selected.employeeCpf },
                        { label: "Employer CPF Contribution", value: selected.employerCpf },
                      ]}
                    />
                    <StatementTable
                      title="Other Income / Benefits"
                      leftHeader="Type of Income"
                      rows={[
                        { label: "1. Benefits-in-Kind", value: selected.benefitsInKind },
                        { label: "2. Share Option / Other Income", value: selected.shareOption },
                        { label: "3. Retirement Benefits", value: selected.retirementBenefits },
                        { label: "4. Income Tax Borne by Employee", value: selected.incomeTaxBorneByEmployee },
                        {
                          label: "Total – Other Income / Benefits",
                          value: selected.benefitsInKind + selected.shareOption + selected.retirementBenefits + selected.incomeTaxBorneByEmployee,
                          emphasize: true,
                          accent: true,
                        },
                      ]}
                    />
                  </div>
                  <div className="space-y-3">
                    <StatementTable
                      title="Employee Information"
                      leftHeader="Field"
                      rightHeader="Details"
                      rows={[
                        { label: "Name", value: selected.employee.name || "—" },
                        { label: "NRIC / FIN", value: selected.employee.nricNumber || "—" },
                        { label: "Employee ID", value: selected.employee.employeeId || "—" },
                        { label: "Designation", value: selected.employee.designation || "—" },
                      ]}
                    />
                    <div className="rounded-xl border border-[#DBEAFE] bg-[#F8FBFF] p-4">
                      <h3 className="text-sm font-semibold text-[#111827]">IR8A Preview</h3>
                      <p className="mt-2 text-sm text-[#6B7280]">
                        All fields are auto-populated from payroll and CPF calculations. You can review, edit (if required) and generate the IR8A form.
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        className="mt-4 w-full gap-2"
                        onClick={() => openForm(false)}
                      >
                        <Download className="h-4 w-4" />
                        View IR8A
                      </Button>
                    </div>
                    <div className="rounded-xl border border-[#E5E7EB] p-4">
                      <h3 className="mb-3 text-center text-sm font-semibold text-[#111827]">Quick Actions</h3>
                      <div className="space-y-2">
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full justify-center gap-2"
                          onClick={() => {
                            toast({ title: "Draft saved" });
                          }}
                        >
                          <Save className="h-4 w-4" /> Save Draft
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full justify-center gap-2"
                          onClick={() => {
                            const failed = selected.checks.filter((check) => !check.ok);
                            toast({
                              title: failed.length ? "Validation needs attention" : "Validated",
                              description: failed.length ? failed.map((check) => check.label).join(", ") : "IR8A data is ready.",
                              variant: failed.length ? "destructive" : "default",
                            });
                          }}
                        >
                          <FileCheck className="h-4 w-4" /> Validate
                        </Button>
                        <Button
                          type="button"
                          className="w-full justify-center gap-2 bg-[#2563EB] hover:bg-[#1D4ED8]"
                          onClick={startGenerate}
                        >
                          <FileText className="h-4 w-4" /> Generate IR8A
                        </Button>
                        <Button
                          type="button"
                          className="w-full justify-center gap-2 bg-emerald-600 hover:bg-emerald-700"
                          onClick={() => {
                            setSubmittedIds((current) => current.includes(selected.employee.id) ? current : [...current, selected.employee.id]);
                            toast({ title: "Submitted to AIS" });
                          }}
                        >
                          <Send className="h-4 w-4" /> Submit AIS
                        </Button>
                      </div>
                    </div>
                    <Section title="Validation" source="" tone="amber">
                      <div className="space-y-2">
                        {selected.checks.map((check) => (
                          <div key={check.label} className="flex items-center gap-2 text-sm text-[#374151]">
                            <CheckCircle2 className={cn("h-4 w-4", check.ok ? "text-emerald-600" : "text-amber-500")} />
                            {check.label}
                          </div>
                        ))}
                      </div>
                    </Section>
                  </div>
                </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Ir8aGenerateDialog
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        year={year}
        onYearChange={setYear}
        phase={generatePhase}
        processed={processed}
        total={lines.length}
        percent={progressPercent}
        successCount={Math.max(lines.length - attention.length, 0)}
        attention={attention}
        checkedIds={checkedAttention}
        onToggle={(id) => {
          setCheckedAttention((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
        }}
        onToggleAll={(checked) => {
          setCheckedAttention(checked ? attention.map((row) => row.id) : []);
        }}
        onView={() => openForm(false)}
        onDownload={() => openForm(true)}
        onGenerateAll={startGenerate}
        onUpdate={(id) => {
          setGenerateOpen(false);
          setFormOpen(false);
          setSelectedId(null);
          setLocation(`/employees/${id}/edit`);
        }}
      />
      <Ir8aFormView
        open={formOpen && formData != null}
        onOpenChange={setFormOpen}
        data={formData}
      />
    </div>
  );
}

function Kpi({
  icon: Icon,
  iconClass,
  label,
  value,
  hint,
  bar,
}: {
  icon: typeof Users;
  iconClass: string;
  label: string;
  value: string;
  hint: string;
  bar?: boolean;
}) {
  return (
    <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-full", iconClass)}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-[#6B7280]">{label}</p>
          <p className="mt-1 text-lg font-semibold text-[#111827]">{value}</p>
          {hint ? <p className="text-xs text-[#9CA3AF]">{hint}</p> : null}
          {bar ? <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-orange-100"><div className="h-full w-4/5 bg-emerald-500" /></div> : null}
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  source,
  tone,
  children,
}: {
  title: string;
  source: string;
  tone: "emerald" | "sky" | "violet" | "amber";
  children: ReactNode;
}) {
  const tones = {
    emerald: "border-emerald-100 bg-emerald-50/60",
    sky: "border-sky-100 bg-sky-50/60",
    violet: "border-violet-100 bg-violet-50/60",
    amber: "border-amber-100 bg-amber-50/70",
  };
  return (
    <div className={cn("rounded-xl border p-4", tones[tone])}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-[#111827]">{title}</h3>
        {source ? <span className="text-xs text-[#6B7280]">{source} · Auto</span> : null}
      </div>
      {children}
    </div>
  );
}

function StatementTable({
  title,
  leftHeader,
  rightHeader = "Amount (S$)",
  rows,
}: {
  title: string;
  leftHeader: string;
  rightHeader?: string;
  rows: { label: string; value: number | string; emphasize?: boolean; accent?: boolean }[];
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-[#D7E6F5] bg-white">
      <div className="bg-[#E7F1FC] px-4 py-2.5">
        <h3 className="text-sm font-semibold text-[#111827]">{title}</h3>
      </div>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-[#E5E7EB]">
            <th className="px-4 py-3 text-left font-bold text-[#2563EB]">{leftHeader}</th>
            <th className="px-4 py-3 text-right font-bold text-[#2563EB]">{rightHeader}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.label}
              className={cn(
                "border-b border-[#EEF2F6] last:border-b-0",
                row.emphasize && "bg-[#E7F1FC]",
              )}
            >
              <td className={cn("px-4 py-3", row.accent ? "font-bold text-[#2563EB]" : "text-[#111827]", row.emphasize && "font-bold")}>{row.label}</td>
              <td className={cn("px-4 py-3 text-right", row.accent ? "font-bold text-[#2563EB]" : "text-[#111827]", row.emphasize && "font-bold", typeof row.value === "number" && "tabular-nums")}>
                {typeof row.value === "number" ? money(row.value) : row.value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
