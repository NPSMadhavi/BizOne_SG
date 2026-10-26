import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearch } from "wouter";
import { Button } from "@/components/ui/button";
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
import { SyncBridgeDatePicker } from "@/components/ui/sync-bridge-date-picker";
import { usePagination } from "@/hooks/use-pagination";
import { ListPagination } from "@/components/list-pagination";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  buildIr8aLine,
  ir8aStatusClass,
  money,
  type Ir8aEmployeeRow,
  type Ir8aPayrollConfigRow,
  type Ir8aPayrollRecord,
} from "@/operations-8june/lib/ir8a-data";
import {
  CheckCircle2,
  ExternalLink,
  Eye,
  Send,
} from "lucide-react";

const IRAS_AIS_URL =
  "https://www.iras.gov.sg/taxes/individual-income-tax/employers/auto-inclusion-scheme-(ais)-for-employment-income";

type SubmissionHistoryItem = {
  id: string;
  year: number;
  employeeCount: number;
  totalIncome: number;
  submittedAt: string;
};

function parseYearFromSearch(search: string): string {
  const params = new URLSearchParams(search.startsWith("?") ? search : `?${search}`);
  const year = Number(params.get("year"));
  return Number.isFinite(year) && year >= 2000 ? String(year) : "";
}

export default function AisSubmissionPage() {
  const { toast } = useToast();
  const search = useSearch();
  const [year, setYear] = useState(parseYearFromSearch(search));
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [submittedIds, setSubmittedIds] = useState<number[]>([]);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<SubmissionHistoryItem[]>([]);
  const [lastSubmittedAt, setLastSubmittedAt] = useState<string | null>(null);

  const { data: employees = [], isLoading: employeesLoading } = useQuery<Ir8aEmployeeRow[]>({
    queryKey: ["/api/employees"],
  });
  const { data: payrollRecords = [], isLoading: recordsLoading } = useQuery<Ir8aPayrollRecord[]>({
    queryKey: ["/api/payroll/records"],
  });
  const { data: payrollConfigs = [] } = useQuery<Ir8aPayrollConfigRow[]>({
    queryKey: ["/api/payroll/configs"],
  });

  const assessmentYear = year ? Number(year) : null;
  const hasYear = assessmentYear != null && Number.isFinite(assessmentYear);

  const lines = useMemo(() => {
    if (!hasYear || assessmentYear == null) return [];
    return employees.map((employee) => {
      const config =
        payrollConfigs.find(
          (item) => Number(item.employeeId) === Number(employee.id) && item.isActive !== false,
        ) || payrollConfigs.find((item) => Number(item.employeeId) === Number(employee.id));
      return buildIr8aLine(
        employee,
        payrollRecords,
        config,
        assessmentYear,
        submittedIds.includes(employee.id),
      );
    });
  }, [employees, payrollRecords, payrollConfigs, assessmentYear, hasYear, submittedIds]);

  const departments = useMemo(() => {
    const values = new Set<string>();
    for (const line of lines) {
      const dept = String(line.employee.department || "").trim();
      if (dept) values.add(dept);
    }
    return [...values].sort((a, b) => a.localeCompare(b));
  }, [lines]);

  const filtered = useMemo(() => {
    if (departmentFilter === "all") return lines;
    return lines.filter(
      (line) => String(line.employee.department || "").trim() === departmentFilter,
    );
  }, [lines, departmentFilter]);

  const { page, setPage, totalPages, paginatedItems } = usePagination(filtered, 5);

  useEffect(() => {
    if (!hasYear) {
      setSelectedIds([]);
      setStep(1);
      return;
    }
    setSelectedIds(employees.map((employee) => employee.id));
    setStep((current) => (current === 3 ? 3 : 2));
    setPage(1);
    // Re-load table selection whenever assessment year changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally keyed by year only
  }, [year, hasYear, setPage]);

  const totalIncome = lines.reduce((sum, line) => sum + line.gross, 0);
  const allSubmitted = lines.length > 0 && lines.every((line) => line.status === "Submitted");
  const anySubmitted = submittedIds.length > 0;
  const pageIds = paginatedItems.map((line) => line.employee.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.includes(id));

  function handleYearChange(value: string) {
    setYear(value);
    if (!value) {
      setSelectedIds([]);
      setStep(1);
      setDepartmentFilter("all");
    }
  }

  function toggleAllPage(checked: boolean) {
    setSelectedIds((current) => {
      if (checked) {
        const next = new Set(current);
        for (const id of pageIds) next.add(id);
        return [...next];
      }
      return current.filter((id) => !pageIds.includes(id));
    });
  }

  function toggleOne(id: number, checked: boolean) {
    setSelectedIds((current) =>
      checked ? (current.includes(id) ? current : [...current, id]) : current.filter((item) => item !== id),
    );
  }

  function handleSubmit() {
    if (!hasYear || assessmentYear == null) {
      toast({
        title: "Select assessment year",
        description: "Choose an assessment year to load employee data before submitting.",
        variant: "destructive",
      });
      return;
    }
    const targets = selectedIds.length > 0 ? selectedIds : lines.map((line) => line.employee.id);
    if (targets.length === 0) {
      toast({
        title: "No employees to submit",
        description: "There are no employees available for AIS submission.",
        variant: "destructive",
      });
      return;
    }
    const submittedLines = lines.filter((line) => targets.includes(line.employee.id));
    const total = submittedLines.reduce((sum, line) => sum + line.gross, 0);
    const submittedAt = new Date().toISOString();
    setSubmittedIds((current) => {
      const next = new Set(current);
      for (const id of targets) next.add(id);
      return [...next];
    });
    setLastSubmittedAt(submittedAt);
    setHistory((current) => [
      {
        id: `${assessmentYear}-${submittedAt}`,
        year: assessmentYear,
        employeeCount: submittedLines.length,
        totalIncome: total,
        submittedAt,
      },
      ...current,
    ]);
    setStep(3);
    toast({
      title: "AIS submitted to IRAS",
      description: `Submitted ${submittedLines.length} employee(s) for YA ${assessmentYear}.`,
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-[#2563EB]">AIS Submission</h1>
        <a
          href={IRAS_AIS_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-[#2563EB] hover:underline"
        >
          Learn more about AIS (IRAS)
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

      <div className="rounded-xl border border-[#E5E7EB] bg-white px-4 py-4 shadow-sm sm:px-6">
        <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-center sm:justify-between">
          <StepItem index={1} label="Select Year" active={step === 1} done={step > 1} />
          <div className="hidden h-px flex-1 bg-[#E5E7EB] sm:block" />
          <StepItem index={2} label="Review Data" active={step === 2} done={step > 2} />
          <div className="hidden h-px flex-1 bg-[#E5E7EB] sm:block" />
          <StepItem index={3} label="Submit to IRAS" active={step === 3} done={false} />
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(300px,0.9fr)]">
        <div className="space-y-4 rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[#374151]">Assessment Year</label>
              <div className="w-[160px]">
                <SyncBridgeDatePicker
                  mode="year"
                  value={year || null}
                  onChange={handleYearChange}
                  placeholder="Select year"
                />
              </div>
            </div>
            <div className="flex min-w-[220px] items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              <div>
                <p className="text-xs font-medium text-emerald-700">Last Submission Status</p>
                <p className="font-medium">
                  {lastSubmittedAt
                    ? `Submitted ${new Date(lastSubmittedAt).toLocaleString("en-SG")}`
                    : "Not submitted yet"}
                </p>
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-[#E5E7EB]">
            <div className="flex flex-col gap-3 border-b border-[#E5E7EB] bg-[#F8FAFC] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-semibold text-[#111827]">
                Total Employees: <span className="text-[#2563EB]">{hasYear ? filtered.length : 0}</span>
              </p>
              <div className="flex items-center gap-2">
                <span className="text-sm text-[#6B7280]">Department</span>
                <Select
                  value={departmentFilter}
                  onValueChange={(value) => {
                    setDepartmentFilter(value);
                    setPage(1);
                  }}
                  disabled={!hasYear}
                >
                  <SelectTrigger className="h-9 w-[180px] bg-white">
                    <SelectValue placeholder="All Departments" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Departments</SelectItem>
                    {departments.map((dept) => (
                      <SelectItem key={dept} value={dept}>
                        {dept}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-white text-left text-xs text-[#6B7280]">
                    <th className="w-12 px-4 py-3">
                      <Checkbox
                        checked={allPageSelected}
                        onCheckedChange={(checked) => toggleAllPage(checked === true)}
                        aria-label="Select all employees on this page"
                        disabled={!hasYear}
                      />
                    </th>
                    <th className="px-3 py-3 font-medium">Employee ID</th>
                    <th className="px-3 py-3 font-medium">Names</th>
                    <th className="px-3 py-3 font-medium">Department</th>
                    <th className="px-3 py-3 text-right font-medium">Employment Income (SGD)</th>
                    <th className="px-4 py-3 text-right font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {!hasYear ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-[#6B7280]">
                        Select an assessment year to load employee AIS records.
                      </td>
                    </tr>
                  ) : employeesLoading || recordsLoading ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-[#6B7280]">
                        Loading employees...
                      </td>
                    </tr>
                  ) : paginatedItems.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-[#6B7280]">
                        No employees found for this filter.
                      </td>
                    </tr>
                  ) : (
                    paginatedItems.map((line) => {
                      const employee = line.employee;
                      const checked = selectedIds.includes(employee.id);
                      return (
                        <tr key={employee.id} className="border-b border-[#F3F4F6] hover:bg-[#F8FAFC]">
                          <td className="px-4 py-3">
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(value) => toggleOne(employee.id, value === true)}
                              aria-label={`Select ${employee.name || "employee"}`}
                            />
                          </td>
                          <td className="px-3 py-3 font-medium text-[#111827]">{employee.employeeId || "—"}</td>
                          <td className="px-3 py-3 text-[#111827]">{employee.name || "—"}</td>
                          <td className="px-3 py-3 text-[#374151]">{employee.department || "—"}</td>
                          <td className="px-3 py-3 text-right tabular-nums">{money(line.gross)}</td>
                          <td className="px-4 py-3 text-right">
                            <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium", ir8aStatusClass(line.status))}>
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

            {hasYear ? (
              <ListPagination
                page={page}
                totalPages={totalPages}
                onPageChange={setPage}
                className="justify-end"
              />
            ) : null}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-[#111827]">AIS Submission Details</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <DetailRow label="Assessment Year" value={year || "—"} />
              <DetailRow label="No. of Employees" value={hasYear ? String(lines.length) : "0"} />
              <DetailRow label="Total Employment Income" value={`SGD ${money(hasYear ? totalIncome : 0)}`} emphasize />
              <div className="flex items-center justify-between gap-3 border-t border-[#F3F4F6] pt-3">
                <dt className="text-[#6B7280]">Submission Status</dt>
                <dd>
                  <span
                    className={cn(
                      "inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold",
                      allSubmitted
                        ? "bg-emerald-50 text-emerald-700"
                        : anySubmitted
                          ? "bg-amber-50 text-amber-700"
                          : "bg-red-50 text-red-600",
                    )}
                  >
                    {allSubmitted ? "Submitted" : anySubmitted ? "Partially Submitted" : "Not Submitted"}
                  </span>
                </dd>
              </div>
            </dl>
          </div>

          <div className="space-y-2">
            <Button
              type="button"
              className="h-11 w-full gap-2 bg-[#2563EB] text-base hover:bg-[#1D4ED8]"
              onClick={handleSubmit}
              disabled={!hasYear || lines.length === 0}
            >
              <Send className="h-4 w-4" />
              Submit AIS to IRAS
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full gap-2 border-[#2563EB] text-[#2563EB] hover:bg-[#EFF6FF]"
              onClick={() => setHistoryOpen(true)}
            >
              <Eye className="h-4 w-4" />
              View Submission History
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>AIS Submission History</DialogTitle>
          </DialogHeader>
          {history.length === 0 ? (
            <p className="py-6 text-center text-sm text-[#6B7280]">No AIS submissions yet for this session.</p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-[#E5E7EB]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-[#F9FAFB] text-left text-xs text-[#6B7280]">
                    <th className="px-3 py-2 font-medium">YA</th>
                    <th className="px-3 py-2 font-medium">Employees</th>
                    <th className="px-3 py-2 text-right font-medium">Total Income</th>
                    <th className="px-3 py-2 text-right font-medium">Submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((item) => (
                    <tr key={item.id} className="border-b last:border-b-0">
                      <td className="px-3 py-2 font-medium">{item.year}</td>
                      <td className="px-3 py-2">{item.employeeCount}</td>
                      <td className="px-3 py-2 text-right tabular-nums">SGD {money(item.totalIncome)}</td>
                      <td className="px-3 py-2 text-right text-[#6B7280]">
                        {new Date(item.submittedAt).toLocaleString("en-SG")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StepItem({
  index,
  label,
  active,
  done,
}: {
  index: number;
  label: string;
  active: boolean;
  done: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold",
          active || done ? "bg-[#2563EB] text-white" : "bg-[#E5E7EB] text-[#6B7280]",
        )}
      >
        {done ? <CheckCircle2 className="h-4 w-4" /> : index}
      </div>
      <span className={cn("text-sm font-medium", active || done ? "text-[#111827]" : "text-[#9CA3AF]")}>
        {label}
      </span>
    </div>
  );
}

function DetailRow({
  label,
  value,
  emphasize,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-[#6B7280]">{label}</dt>
      <dd className={cn("text-right text-[#111827]", emphasize && "font-semibold")}>{value}</dd>
    </div>
  );
}
