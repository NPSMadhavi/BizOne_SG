import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ManagementTableCard, ManagementTableContainer, ManagementEmptyState, ManagementPageHeader, ManagementToolbarRow } from "@/operations-8june/components/layout/ManagementPageUI";
import { usePagination } from "@/hooks/use-pagination";
import { ListPagination } from "@/components/list-pagination";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { StringDatePicker } from "@/operations-8june/components/ui/date-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  EntityViewDialog,
  EntityViewField,
  EntityViewFieldGrid,
  EntityViewStatusBadge,
} from "@/operations-8june/components/ui/entity-view-dialog";
import { PdfPreviewModal } from "@/components/pdf-preview-modal";
import {
  generatePayslip_PDF,
  payslipPdfFilename,
  isPayslipPdfData,
  buildPayslipPdfData,
  type PayslipPdfData,
} from "@/operations-8june/lib/payslip-pdf";
import { calculateSyncBridgePayrollPreview } from "@/operations-8june/lib/payroll-utils";
import { splitEarnings } from "@/operations-8june/lib/payroll-earnings";
import {
  getLastCompletedPayPeriod,
  derivePayrollMonthYear,
  normalizePayPeriodFromDate,
  resolveBatchPayrollStatus,
  batchProcessPayrollForPeriod,
  getUniquePayrollRecords,
  hasProcessedPayrollForEmployee,
  getAvailablePayslipMonthsForEmployee,
  isPayslipMonthSelectable,
  isPayrollProcessedForPeriod,
  formatPayrollMonthLabel,
  listEmployeePayrollMonths,
  recordPayrollMonthYear,
  isPayPeriodEligibleForProcessing,
  PAYROLL_CURRENT_MONTH_ERROR,
  isPayPeriodDateDisabled,
  getPayPeriodForMonth,
  findPayrollRecordForPeriod,
  downloadPayslipForConfig,
  downloadBatchPayslipsZip,
  createPayslipZipBlob,
  type BatchPayrollScenario,
} from "@/operations-8june/lib/payroll-batch-utils";
import {
  payrollCancelButtonClass,
  payrollPrimaryButtonClass,
} from "@/operations-8june/lib/payroll-ui";
import { exportPayrollTableToExcel, exportPayrollTableToPdf } from "@/operations-8june/lib/excel-utils";
import { PayrollPaymentRecordDialog } from "@/operations-8june/components/forms/PayrollPaymentRecordDialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import {
  Plus,
  Users,
  DollarSign,
  Calculator,
  CreditCard,
  FileText,
  Edit,
  Eye,
  Download,
  Trash2,
  Printer,
  ChevronDown,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const PAYSLIP_MONTHS_LEFT = [
  { value: 1, label: "January" },
  { value: 2, label: "February" },
  { value: 3, label: "March" },
  { value: 4, label: "April" },
  { value: 5, label: "May" },
  { value: 6, label: "June" },
];

const PAYSLIP_MONTHS_RIGHT = [
  { value: 7, label: "July" },
  { value: 8, label: "August" },
  { value: 9, label: "September" },
  { value: 10, label: "October" },
  { value: 11, label: "November" },
  { value: 12, label: "December" },
];

function buildPayslipDownloadFilename(
  employeeName: string,
  month: number,
  year: number
): string {
  const safeName =
    employeeName
      .trim()
      .replace(/[^a-zA-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "Employee";
  const monthLabel =
    PAYSLIP_MONTHS_LEFT.concat(PAYSLIP_MONTHS_RIGHT).find((m) => m.value === month)?.label ||
    `Month${month}`;
  return `Payslip_${safeName}_${monthLabel}_${year}.pdf`;
}

interface PayrollConfig {
  id: number;
  employeeId: number;
  employeeName: string;
  employeeEmail: string;
  department: string;
  designation: string;
  nationality?: string;
  baseSalary: string;
  payrollPeriod: "monthly" | "bi_weekly" | "weekly";
  hourlyRate?: string;
  overtimeRate?: string;
  allowances: Record<string, number>;
  deductions: Record<string, number>;
  taxRate: string;
  cpfRate: string;
  cpfAmount?: string;
  employerCpfRate?: string;
  employerCpfAmount?: string;
  netSalary?: string;
  isActive: boolean;
  effectiveFrom: string;
  effectiveTo?: string;
  createdAt: string;
  updatedAt: string;
}

interface PayrollSummary {
  totalEmployees: number;
  totalGrossPay: number;
  totalNetPay: number;
  totalTaxDeduction: number;
  totalCpfDeduction: number;
  paidRecords: number;
  pendingRecords: number;
  draftRecords: number;
}

function calculateAge(dateOfBirth: Date): number {
  const today = new Date();
  let age = today.getFullYear() - dateOfBirth.getFullYear();
  const monthDiff = today.getMonth() - dateOfBirth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dateOfBirth.getDate())) {
    age -= 1;
  }
  return age;
}

function mapNationalityToCitizenship(nationality?: string): "citizen" | "pr" | "foreigner" {
  if (!nationality) return "citizen";
  const value = nationality.toLowerCase();
  if (value === "singapore") return "citizen";
  if (value === "pr") return "pr";
  if (value === "foreigner") return "foreigner";
  return "foreigner";
}

function PayrollMonthTable({
  rows,
  selectedMonth,
  selectedYear,
  onSelect,
}: {
  rows: ReturnType<typeof listEmployeePayrollMonths>;
  selectedMonth?: number | null;
  selectedYear?: number | null;
  onSelect?: (month: number, year: number) => void;
}) {
  if (rows.length === 0) {
    return (
      <p className="rounded-md border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-4 text-sm text-[#6B7280]">
        No monthly payroll has been saved yet.
      </p>
    );
  }
  const totals = rows.reduce(
    (acc, row) => ({
      basic: acc.basic + (Number(row.basic) || 0),
      transport: acc.transport + (Number(row.transport) || 0),
      meal: acc.meal + (Number(row.meal) || 0),
      bonus: acc.bonus + (Number(row.bonus) || 0),
      other: acc.other + (Number(row.other) || 0),
      gross: acc.gross + (Number(row.gross) || 0),
      employeeCpf: acc.employeeCpf + (Number(row.employeeCpf) || 0),
      employerCpf: acc.employerCpf + (Number(row.employerCpf) || 0),
    }),
    {
      basic: 0,
      transport: 0,
      meal: 0,
      bonus: 0,
      other: 0,
      gross: 0,
      employeeCpf: 0,
      employerCpf: 0,
    },
  );

  return (
    <div className="overflow-x-auto rounded-md border border-[#E5E7EB]">
      <table className="min-w-full text-sm">
        <thead className="bg-[#EFF6FF] text-left text-[#1D4ED8]">
          <tr>
            {["Month", "Basic", "Transport", "Food", "Bonus", "Other", "Gross", "Employee CPF", "Employer CPF"].map((heading) => (
              <th key={heading} className="whitespace-nowrap px-3 py-2 font-medium">{heading}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const selected = selectedMonth === row.month && selectedYear === row.year;
            return (
              <tr
                key={`${row.year}-${row.month}`}
                className={cn("border-t border-[#E5E7EB]", onSelect && "cursor-pointer hover:bg-[#F8FAFC]", selected && "bg-[#EFF6FF]")}
                onClick={onSelect ? () => onSelect(row.month, row.year) : undefined}
              >
                <td className="whitespace-nowrap px-3 py-2 font-medium text-[#111827]">{row.label}</td>
                <td className="px-3 py-2">{formatCurrency(row.basic)}</td>
                <td className="px-3 py-2">{formatCurrency(row.transport)}</td>
                <td className="px-3 py-2">{formatCurrency(row.meal)}</td>
                <td className="px-3 py-2">{formatCurrency(row.bonus)}</td>
                <td className="px-3 py-2">{formatCurrency(row.other)}</td>
                <td className="px-3 py-2">{formatCurrency(row.gross)}</td>
                <td className="px-3 py-2">{formatCurrency(row.employeeCpf)}</td>
                <td className="px-3 py-2">{formatCurrency(row.employerCpf)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-[#CBD5E1] bg-[#F8FAFC] font-semibold text-[#111827]">
            <td className="whitespace-nowrap px-3 py-2">Total</td>
            <td className="px-3 py-2">{formatCurrency(totals.basic)}</td>
            <td className="px-3 py-2">{formatCurrency(totals.transport)}</td>
            <td className="px-3 py-2">{formatCurrency(totals.meal)}</td>
            <td className="px-3 py-2">{formatCurrency(totals.bonus)}</td>
            <td className="px-3 py-2">{formatCurrency(totals.other)}</td>
            <td className="px-3 py-2">{formatCurrency(totals.gross)}</td>
            <td className="px-3 py-2">{formatCurrency(totals.employeeCpf)}</td>
            <td className="px-3 py-2">{formatCurrency(totals.employerCpf)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function formatCurrency(amount: string | number) {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-SG", { style: "currency", currency: "SGD" }).format(num || 0);
}

function onePayrollPerEmployee(configs: PayrollConfig[]): PayrollConfig[] {
  const byEmployee = new Map<number, PayrollConfig>();
  for (const config of configs) {
    const key = Number(config.employeeId);
    const current = byEmployee.get(key);
    if (!current) {
      byEmployee.set(key, config);
      continue;
    }
    const currentActive = current.isActive !== false;
    const nextActive = config.isActive !== false;
    if (nextActive && !currentActive) {
      byEmployee.set(key, config);
      continue;
    }
    if (currentActive === nextActive && Number(config.id) > Number(current.id)) {
      byEmployee.set(key, config);
    }
  }
  return [...byEmployee.values()];
}

function formatPeriod(period: string) {
  const map: Record<string, string> = {
    monthly: "Monthly",
    bi_weekly: "Bi-weekly",
    weekly: "Weekly",
  };
  return map[period] || period;
}

function buildPayslipFromSetSalary(args: {
  config: PayrollConfig;
  month: number;
  year: number;
  employees: any[];
  payrollRecords?: any[];
  company: { name?: string | null; address?: string | null } | null;
}): { data: PayslipPdfData; title: string; filename: string } {
  const { config, month, year, employees, company, payrollRecords = [] } = args;
  const { payPeriodStart, payPeriodEnd } = getPayPeriodForMonth(year, month);
  const employee = employees.find((item) => Number(item.id) === Number(config.employeeId));
  const monthRecord = payrollRecords.find((item) => {
    const period = recordPayrollMonthYear(item);
    return (
      Number(item.employeeId) === Number(config.employeeId) &&
      period.year === year &&
      period.month === month &&
      Number(item.baseSalary) > 0
    );
  });
  const baseSalary = Number(monthRecord?.baseSalary) || Number(config.baseSalary) || Number(employee?.salary) || 0;
  const dob = employee?.dateOfBirth ? new Date(employee.dateOfBirth) : null;
  const age = dob && !Number.isNaN(dob.getTime()) ? calculateAge(dob) : 30;
  const allowances =
    monthRecord?.allowances && typeof monthRecord.allowances === "object"
      ? monthRecord.allowances
      : config.allowances || {};
  const deductions =
    monthRecord?.deductions && typeof monthRecord.deductions === "object"
      ? monthRecord.deductions
      : config.deductions || {};
  const preview = calculateSyncBridgePayrollPreview({
    monthlySalary: baseSalary,
    age,
    citizenshipStatus: mapNationalityToCitizenship(employee?.nationality || config.nationality),
    prStatus: employee?.prStatus,
    allowances,
    deductions,
  });
  const earnings = splitEarnings(allowances);
  return {
    data: {
      companyName: company?.name || "",
      companyAddress: company?.address || "",
      employeeName: employee?.name || config.employeeName,
      employeeDbId: Number(employee?.id ?? config.employeeId),
      employeeCode: employee?.employeeId || String(config.employeeId),
      icNo: employee?.nricNumber || employee?.passportNumber || "",
      department: employee?.department || config.department || "",
      jobTitle: employee?.designation || config.designation || "",
      month,
      year,
      payPeriodStart,
      payPeriodEnd,
      basicRate: baseSalary,
      workingDays: null,
      basicPay: baseSalary,
      overtime: preview.overtimePay,
      allowance: earnings.allowances,
      bonus: earnings.bonus,
      otherIncome: earnings.otherIncome,
      grossPay: preview.grossPay,
      employeeCpf: preview.employeeCpf,
      netPay: preview.netPay,
      employerCpf: preview.employerCpf,
      otherDeductions: preview.deductionsTotal,
    },
    title: "Payslip",
    filename: payslipPdfFilename(employee?.name || config.employeeName, month, year),
  };
}

async function resolvePayslipPdfForMonth(args: {
  config: PayrollConfig;
  month: number;
  year: number;
  employees: any[];
  payrollRecords: any[];
  company: { name?: string | null; address?: string | null } | null;
}): Promise<{ data: PayslipPdfData; title: string; filename: string } | null> {
  return buildPayslipFromSetSalary(args);
}

function findLatestAvailablePayslipMonth(
  employeeDbId: number,
  payrollRecords: any[],
  now = new Date()
): { year: number; month: number } | null {
  const currentYear = now.getFullYear();
  for (let year = currentYear; year >= currentYear - 5; year -= 1) {
    const available = getAvailablePayslipMonthsForEmployee(employeeDbId, year, payrollRecords, now);
    if (available.length > 0) {
      return { year, month: available[available.length - 1] };
    }
  }
  return null;
}

export default function PayrollPage() {
  const { toast } = useToast();
  const { selectedCompany } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedConfig, setSelectedConfig] = useState<PayrollConfig | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [batchPayPeriodStart, setBatchPayPeriodStart] = useState(getLastCompletedPayPeriod().payPeriodStart);
  const [batchPayPeriodEnd, setBatchPayPeriodEnd] = useState(getLastCompletedPayPeriod().payPeriodEnd);
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);
  const [batchConfirmDialogOpen, setBatchConfirmDialogOpen] = useState(false);
  const [batchConfirmScenario, setBatchConfirmScenario] = useState<BatchPayrollScenario | null>(null);
  const [openDetail, setOpenDetail] = useState<null | "employees" | "gross" | "net" | "records">(null);
  const [payslipModalOpen, setPayslipModalOpen] = useState(false);
  const [payslipConfig, setPayslipConfig] = useState<PayrollConfig | null>(null);
  const [printDialogOpen, setPrintDialogOpen] = useState(false);
  const [printMode, setPrintMode] = useState<"bulk" | "individual">("individual");
  const [printConfigs, setPrintConfigs] = useState<PayrollConfig[]>([]);
  const [printFrom, setPrintFrom] = useState("");
  const [printTo, setPrintTo] = useState("");
  const [selectedPayslipMonths, setSelectedPayslipMonths] = useState<number[]>([]);
  const [payslipYear, setPayslipYear] = useState(new Date().getFullYear());
  const [isPayslipDownloading, setIsPayslipDownloading] = useState(false);
  const [isPayslipViewing, setIsPayslipViewing] = useState(false);
  const [payslipViewerOpen, setPayslipViewerOpen] = useState(false);
  const [payslipViewerData, setPayslipViewerData] = useState<PayslipPdfData | null>(null);
  const [payslipViewerTitle, setPayslipViewerTitle] = useState("");
  const [payslipViewerFilename, setPayslipViewerFilename] = useState("payslip.pdf");
  const [forceDeleteId, setForceDeleteId] = useState<number | null>(null);
  const [showForceDeleteDialog, setShowForceDeleteDialog] = useState(false);
  const [paymentRecordOpen, setPaymentRecordOpen] = useState(false);

  const { payPeriodStart, payPeriodEnd } = getLastCompletedPayPeriod();

  const closePayslipViewer = () => {
    setPayslipViewerOpen(false);
    setPayslipViewerData(null);
    setPayslipViewerTitle("");
    setPayslipViewerFilename("payslip.pdf");
  };

  function parseApiErrorMessage(error: unknown, fallback: string): string {
    if (!error || typeof error !== "object") return fallback;
    const record = error as { message?: string; error?: string };
    return record.message || record.error || fallback;
  }

  async function deletePayrollConfigRequest(id: number, force = false) {
    const res = await fetch(`/api/payroll/configs/${id}${force ? "?force=true" : ""}`, {
      method: "DELETE",
      credentials: "include",
    });

    if (res.status === 409) {
      const conflictError = new Error("Payroll config has related payroll records");
      (conflictError as Error & { status?: number }).status = 409;
      throw conflictError;
    }

    if (!res.ok) {
      const text = await res.text();
      let message = force
        ? "Failed to force delete payroll config"
        : "Failed to delete payroll config";
      try {
        const data = JSON.parse(text) as { message?: string; error?: string };
        message = data.message || data.error || message;
      } catch {
        if (text) message = text;
      }
      throw new Error(message);
    }

    return res.json();
  }

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deletePayrollConfigRequest(id, false),
    onError: (error, id) => {
      const status = (error as Error & { status?: number }).status;
      if (status === 409 || error.message.includes("related payroll records")) {
        setForceDeleteId(id);
        setShowForceDeleteDialog(true);
        return;
      }
      toast({
        title: parseApiErrorMessage(error, "Failed to delete payroll config"),
        variant: "destructive",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payroll/configs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payroll/summary"] });
      toast({ title: "Payroll deleted" });
    },
  });

  const forceDeleteMutation = useMutation({
    mutationFn: (id: number) => deletePayrollConfigRequest(id, true),
    onSuccess: () => {
      setShowForceDeleteDialog(false);
      setForceDeleteId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/payroll/configs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payroll/records"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payroll/summary"] });
      toast({ title: "Payroll and related records deleted" });
    },
    onError: (error) => {
      toast({
        title: parseApiErrorMessage(error, "Failed to force delete payroll config"),
        variant: "destructive",
      });
    },
  });

  const { data: summary, isLoading: summaryLoading } = useQuery<PayrollSummary>({
    queryKey: ["/api/payroll/summary"],
  });

  const { data: payrollConfigs = [], isLoading: configsLoading } = useQuery<PayrollConfig[]>({
    queryKey: ["/api/payroll/configs"],
  });
  const configs = useMemo(() => onePayrollPerEmployee(payrollConfigs), [payrollConfigs]);

  const { data: employees = [] } = useQuery<any[]>({
    queryKey: ["/api/employees"],
  });

  const { data: payrollRecords = [], isLoading: recordsLoading } = useQuery<any[]>({
    queryKey: ["/api/payroll/records"],
    refetchInterval: 30000,
  });

  const activeConfigs = useMemo(() => configs.filter((c) => c.isActive), [configs]);

  const uniquePayrollRecords = useMemo(
    () => getUniquePayrollRecords(payrollRecords),
    [payrollRecords]
  );

  const { page: configPage, setPage: setConfigPage, totalPages: configTotalPages, paginatedItems: paginatedConfigs } = usePagination(configs);
  const { page: recordPage, setPage: setRecordPage, totalPages: recordTotalPages, paginatedItems: paginatedRecords } = usePagination(uniquePayrollRecords);

  const recordCount = uniquePayrollRecords.length;

  const processedRowClass = "bg-[#E3F2FD] border-l-4 border-[#90CAF9]";

  const isConfigProcessed = (config: PayrollConfig) =>
    isPayrollProcessedForPeriod(config.employeeId, payrollRecords, payPeriodStart, payPeriodEnd);

  const configPreviews = useMemo(() => {
    const previews = new Map<number, ReturnType<typeof calculateSyncBridgePayrollPreview>>();
    for (const config of configs) {
      const employee = employees.find((e) => Number(e.id) === Number(config.employeeId));
      const dob = employee?.dateOfBirth ? new Date(employee.dateOfBirth) : null;
      const age = dob && !Number.isNaN(dob.getTime()) ? calculateAge(dob) : 30;
      previews.set(
        config.id,
        calculateSyncBridgePayrollPreview({
          monthlySalary: parseFloat(config.baseSalary) || 0,
          age,
          citizenshipStatus: mapNationalityToCitizenship(
            employee?.nationality || config.nationality
          ),
          prStatus: employee?.prStatus,
          allowances: config.allowances || {},
          deductions: config.deductions || {},
        })
      );
    }
    return previews;
  }, [configs, employees]);

  const openConfigForm = (config?: PayrollConfig) => {
    if (config?.id) {
      setLocation(`/payroll/config/${config.id}/edit`);
    } else {
      setLocation("/payroll/config/new");
    }
  };

  const openConfigDetails = (config: PayrollConfig) => {
    setSelectedConfig(config);
    setDetailOpen(true);
  };

  const closeDetails = () => {
    setDetailOpen(false);
    setSelectedConfig(null);
  };

  const toggleSelectAll = (checked: boolean) => {
    setSelectedIds(checked ? configs.map((c) => c.id) : []);
  };

  const toggleSelect = (id: number, checked: boolean) => {
    setSelectedIds((prev) =>
      checked ? [...prev, id] : prev.filter((item) => item !== id)
    );
  };

  const handleBatchPayPeriodChange = (dateStr: string) => {
    const { payPeriodStart, payPeriodEnd } = normalizePayPeriodFromDate(dateStr);
    setBatchPayPeriodStart(payPeriodStart);
    setBatchPayPeriodEnd(payPeriodEnd);
  };

  const handleBatchProcessOpen = () => {
    const { payPeriodStart, payPeriodEnd } = getLastCompletedPayPeriod();
    setBatchPayPeriodStart(payPeriodStart);
    setBatchPayPeriodEnd(payPeriodEnd);
    setBatchModalOpen(true);
  };

  const closeBatchConfirmDialog = () => {
    setBatchConfirmDialogOpen(false);
    setBatchConfirmScenario(null);
  };

  const confirmBatchProcess = () => {
    if (!batchPayPeriodStart || !batchPayPeriodEnd) {
      toast({
        title: "Missing pay period",
        description: "Please select both pay period start and end dates.",
        variant: "destructive",
      });
      return;
    }

    if (batchPayPeriodEnd < batchPayPeriodStart) {
      toast({
        title: "Invalid pay period",
        description: "Pay period end must be on or after pay period start.",
        variant: "destructive",
      });
      return;
    }

    if (!isPayPeriodEligibleForProcessing(batchPayPeriodStart, batchPayPeriodEnd)) {
      toast({
        title: "Payroll not allowed",
        description: PAYROLL_CURRENT_MONTH_ERROR,
        variant: "destructive",
      });
      return;
    }

    const targetConfigs =
      selectedIds.length > 0
        ? configs.filter((c) => selectedIds.includes(c.id))
        : activeConfigs;

    const configsToProcess = targetConfigs.filter((c) => c.isActive);

    if (configsToProcess.length === 0) {
      toast({
        title: "No eligible employees",
        description: "Select at least one active payroll to process.",
        variant: "destructive",
      });
      return;
    }

    const batchStatus = resolveBatchPayrollStatus(
      configsToProcess,
      payrollRecords,
      batchPayPeriodStart,
      batchPayPeriodEnd
    );

    setBatchModalOpen(false);
    setBatchConfirmScenario(batchStatus.scenario);
    setBatchConfirmDialogOpen(true);
  };

  const runBatchProcess = async (options?: {
    processScope?: "pending" | "changed";
    forceOverwrite?: boolean;
  }) => {
    if (!isPayPeriodEligibleForProcessing(batchPayPeriodStart, batchPayPeriodEnd)) {
      toast({
        title: "Payroll not allowed",
        description: PAYROLL_CURRENT_MONTH_ERROR,
        variant: "destructive",
      });
      return;
    }

    const { monthLabel } = derivePayrollMonthYear(batchPayPeriodStart);
    setIsBatchProcessing(true);

    try {
      const targetConfigIds = selectedIds.length > 0 ? selectedIds : undefined;
      const result = await batchProcessPayrollForPeriod(
        batchPayPeriodStart,
        batchPayPeriodEnd,
        targetConfigIds,
        {
          processScope: options?.processScope,
          forceOverwrite: options?.forceOverwrite === true,
        }
      );

      if ("scenario" in result && result.scenario === "no-changes" && !options?.forceOverwrite) {
        setBatchConfirmScenario("no-changes");
        setBatchConfirmDialogOpen(true);
        return;
      }

      await queryClient.invalidateQueries({ queryKey: ["/api/payroll/records"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/payroll/summary"] });
      await queryClient.refetchQueries({ queryKey: ["/api/payroll/records"] });
      setSelectedIds([]);
      closeBatchConfirmDialog();

      if (result.ok) {
        toast({
          title: options?.forceOverwrite ? "Payroll overwritten" : "Batch payroll complete",
          description: options?.forceOverwrite
            ? `Payroll overwritten for the selected period (${monthLabel}). Download payslips from Payroll when needed.`
            : options?.processScope === "changed"
              ? `Payroll updated for employees with changed values (${monthLabel}). Download payslips when needed.`
              : `Payroll for ${monthLabel} processed successfully. Download payslips from Payroll when needed.`,
        });
      } else {
        toast({
          title: "Batch processing result",
          description: result.message,
          variant: result.summary?.processedNew || result.summary?.updated ? "default" : "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Batch processing failed",
        description: error instanceof Error ? error.message : "Failed to batch process payroll",
        variant: "destructive",
      });
    } finally {
      setIsBatchProcessing(false);
    }
  };

  const handleBatchConfirmProceed = async () => {
    if (batchConfirmScenario === "pending") {
      await runBatchProcess({ processScope: "pending" });
    }
  };

  const handlePayslipButtonClick = (config: PayrollConfig) => {
    const latest = findLatestAvailablePayslipMonth(config.employeeId, payrollRecords);
    if (!latest) {
      toast({
        title: "Payslip unavailable",
        description: "Process payroll first, then download the payslip.",
        variant: "destructive",
      });
      return;
    }

    let availableCount = 0;
    const currentYear = new Date().getFullYear();
    for (let year = currentYear; year >= currentYear - 5; year -= 1) {
      availableCount += getAvailablePayslipMonthsForEmployee(
        config.employeeId,
        year,
        payrollRecords
      ).length;
      if (availableCount > 1) break;
    }

    // Multiple processed months → let the user choose; otherwise download immediately.
    if (availableCount > 1) {
      openPayslipModal(config);
      return;
    }

    void handleQuickPayslipDownload(config);
  };

  const openPrintDialog = (mode: "bulk" | "individual", targets: PayrollConfig[]) => {
    setPrintMode(mode);
    setPrintConfigs(targets);
    setPrintFrom("");
    setPrintTo("");
    setPrintDialogOpen(true);
  };

  /** Bulk print and individual print open the same month picker. */
  const handleBulkPrint = () => {
    const targets =
      selectedIds.length > 0
        ? configs.filter((c) => selectedIds.includes(c.id))
        : configs;

    if (targets.length === 0) {
      toast({
        title: "Nothing to print",
        description: "Select one or more employees first.",
        variant: "destructive",
      });
      return;
    }

    openPrintDialog("bulk", targets);
  };

  /** Individual print uses the same month popup as bulk print. */
  const handleIndividualPrint = () => {
    if (selectedIds.length !== 1) {
      toast({
        title: "Select one employee",
        description: "Check exactly one employee row for individual print.",
        variant: "destructive",
      });
      return;
    }

    const config = configs.find((c) => c.id === selectedIds[0]);
    if (!config) return;

    openPrintDialog("individual", [config]);
  };

  const printMonthOptions = useMemo(() => {
    const from = printFrom && printTo && printFrom > printTo ? printTo : printFrom;
    const to = printFrom && printTo && printFrom > printTo ? printFrom : printTo;
    const startYear = from ? Number(from.slice(0, 4)) : new Date().getFullYear();
    const endYear = to ? Number(to.slice(0, 4)) : startYear;
    const months: { year: number; month: number }[] = [];
    for (let year = startYear; year <= endYear; year += 1) {
      for (let month = 1; month <= 12; month += 1) {
        const period = getPayPeriodForMonth(year, month);
        if (from && period.payPeriodEnd < from) continue;
        if (to && period.payPeriodStart > to) continue;
        months.push({ year, month });
      }
    }
    return months;
  }, [printFrom, printTo]);

  const handlePrintMonth = async (year: number, month: number) => {
    const period = getPayPeriodForMonth(year, month);
    const targets = printConfigs;
    if (targets.length === 0) {
      toast({
        title: "Payslip unavailable",
        description: "Select an employee with a payroll salary first.",
        variant: "destructive",
      });
      return;
    }

    if (printMode === "individual" || targets.length === 1) {
      const config = targets[0];
      setIsPayslipViewing(true);
      try {
        const resolved = await resolvePayslipPdfForMonth({
          config,
          month,
          year,
          employees,
          payrollRecords,
          company: selectedCompany,
        });
        if (!resolved) {
          toast({
            title: "Print failed",
            description: "Could not load payslip for printing.",
            variant: "destructive",
          });
          return;
        }
        setPayslipViewerData(resolved.data);
        setPayslipViewerTitle(resolved.title);
        setPayslipViewerFilename(resolved.filename);
        setPayslipViewerOpen(true);
        setPrintDialogOpen(false);
      } catch (error) {
        toast({
          title: "Print failed",
          description: error instanceof Error ? error.message : "Failed to open payslip.",
          variant: "destructive",
        });
      } finally {
        setIsPayslipViewing(false);
      }
      return;
    }

    setIsPayslipDownloading(true);
    try {
      const zipResult = await downloadBatchPayslipsZip(
        targets,
        period.payPeriodStart,
        period.payPeriodEnd
      );
      if (zipResult.ok) {
        toast({
          title: "Bulk print ready",
          description: `Downloaded ${targets.length} payslip(s) for ${formatPayrollMonthLabel(year, month)}. Open the ZIP file to print.`,
        });
        setPrintDialogOpen(false);
        return;
      }

      const zipEntries: Array<{ filename: string; data: Uint8Array }> = [];
      for (const config of targets) {
        const resolved = await resolvePayslipPdfForMonth({
          config,
          month,
          year,
          employees,
          payrollRecords,
          company: selectedCompany,
        });
        if (!resolved) continue;
        const blob = await generatePayslip_PDF(resolved.data, {
          filename: resolved.filename,
          returnBlob: true,
        });
        if (blob instanceof Blob) {
          const buf = new Uint8Array(await blob.arrayBuffer());
          zipEntries.push({ filename: resolved.filename, data: buf });
        }
      }

      if (zipEntries.length === 0) {
        toast({
          title: "Bulk print failed",
          description: zipResult.message || "Could not build payslip files for printing.",
          variant: "destructive",
        });
        return;
      }

      const zipBlob = createPayslipZipBlob(zipEntries);
      const url = window.URL.createObjectURL(zipBlob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `Payslips_${formatPayrollMonthLabel(year, month).replace(/\s+/g, "_")}.zip`;
      anchor.rel = "noopener";
      anchor.style.display = "none";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);

      toast({
        title: "Bulk print ready",
        description: `Downloaded ${zipEntries.length} payslip(s) for ${formatPayrollMonthLabel(year, month)}. Open the ZIP file to print.`,
      });
      setPrintDialogOpen(false);
    } catch (error) {
      toast({
        title: "Bulk print failed",
        description: error instanceof Error ? error.message : "Failed to prepare payslips.",
        variant: "destructive",
      });
    } finally {
      setIsPayslipDownloading(false);
    }
  };

  const handleQuickPayslipDownload = async (config: PayrollConfig) => {
    const latest = findLatestAvailablePayslipMonth(config.employeeId, payrollRecords);
    if (!latest) {
      toast({
        title: "Payslip unavailable",
        description: "Process payroll first, then download the payslip.",
        variant: "destructive",
      });
      return;
    }

    setIsPayslipDownloading(true);
    try {
      // Prefer server PDF when available; fall back to client jsPDF from processed data.
      const serverDownload = await downloadPayslipForConfig(
        config,
        getPayPeriodForMonth(latest.year, latest.month).payPeriodStart,
        getPayPeriodForMonth(latest.year, latest.month).payPeriodEnd
      );
      if (serverDownload.ok) {
        toast({
          title: "Payslip downloaded",
          description: `Downloaded payslip for ${config.employeeName} (${formatPayrollMonthLabel(latest.year, latest.month)}).`,
        });
        return;
      }

      const resolved = await resolvePayslipPdfForMonth({
        config,
        month: latest.month,
        year: latest.year,
        employees,
        payrollRecords,
        company: selectedCompany,
      });
      if (!resolved) {
        toast({
          title: "Download failed",
          description:
            serverDownload.message ||
            "No processed payroll found for this employee. Process payroll first, then download.",
          variant: "destructive",
        });
        return;
      }

      await generatePayslip_PDF(resolved.data, { filename: resolved.filename });
      toast({
        title: "Payslip downloaded",
        description: `Downloaded payslip for ${config.employeeName} (${formatPayrollMonthLabel(latest.year, latest.month)}).`,
      });
    } catch (error) {
      toast({
        title: "Download failed",
        description: error instanceof Error ? error.message : "Failed to download payslip.",
        variant: "destructive",
      });
    } finally {
      setIsPayslipDownloading(false);
    }
  };

  const handlePayslipDownload = async () => {
    if (!payslipConfig) return;
    if (selectedPayslipMonths.length === 0) {
      toast({
        title: "No month selected",
        description: "Please select at least one month before downloading the payslip.",
        variant: "destructive",
      });
      return;
    }

    setIsPayslipDownloading(true);

    try {
      const downloaded: string[] = [];
      const missing: string[] = [];

      for (let i = 0; i < selectedPayslipMonths.length; i++) {
        const month = selectedPayslipMonths[i];
        const period = getPayPeriodForMonth(payslipYear, month);
        const serverDownload = await downloadPayslipForConfig(
          payslipConfig,
          period.payPeriodStart,
          period.payPeriodEnd
        );
        if (serverDownload.ok) {
          downloaded.push(formatPayrollMonthLabel(payslipYear, month));
          if (i < selectedPayslipMonths.length - 1) {
            await new Promise((r) => setTimeout(r, 200));
          }
          continue;
        }

        const resolved = await resolvePayslipPdfForMonth({
          config: payslipConfig,
          month,
          year: payslipYear,
          employees,
          payrollRecords,
          company: selectedCompany,
        });

        if (!resolved) {
          missing.push(formatPayrollMonthLabel(payslipYear, month));
          continue;
        }

        await generatePayslip_PDF(resolved.data, { filename: resolved.filename });
        downloaded.push(formatPayrollMonthLabel(payslipYear, month));
        if (i < selectedPayslipMonths.length - 1) {
          await new Promise((r) => setTimeout(r, 200));
        }
      }

      if (downloaded.length === 0) {
        toast({
          title: "Download failed",
          description: missing.length
            ? `No processed payroll found for ${missing.join(", ")}. Process payroll first, then download.`
            : "Failed to download payslips.",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: downloaded.length > 1 ? "Payslips downloaded" : "Payslip downloaded",
        description: missing.length
          ? `Downloaded ${downloaded.join(", ")}. Missing: ${missing.join(", ")}.`
          : `Downloaded payslip for ${payslipConfig.employeeName} (${downloaded.join(", ")}).`,
      });
    } catch (error) {
      toast({
        title: "Download failed",
        description: error instanceof Error ? error.message : "Failed to download payslips.",
        variant: "destructive",
      });
    } finally {
      setIsPayslipDownloading(false);
    }
  };

  const handlePayslipView = async () => {
    if (!payslipConfig) return;
    if (selectedPayslipMonths.length !== 1) {
      toast({
        title: "Select one month",
        description: "Please select exactly one month to view the payslip.",
        variant: "destructive",
      });
      return;
    }

    setIsPayslipViewing(true);
    const month = selectedPayslipMonths[0];

    try {
      const resolved = await resolvePayslipPdfForMonth({
        config: payslipConfig,
        month,
        year: payslipYear,
        employees,
        payrollRecords,
        company: selectedCompany,
      });

      if (!resolved) {
        toast({
          title: "View failed",
          description: "No processed payroll found for this month. Process payroll first, then view the payslip.",
          variant: "destructive",
        });
        return;
      }

      setPayslipViewerData(resolved.data);
      setPayslipViewerTitle(resolved.title);
      setPayslipViewerFilename(resolved.filename);
      setPayslipViewerOpen(true);
      setPayslipModalOpen(false);
    } catch (error) {
      toast({
        title: "View failed",
        description: error instanceof Error ? error.message : "Failed to load payslip preview.",
        variant: "destructive",
      });
    } finally {
      setIsPayslipViewing(false);
    }
  };

  const openPayslipModal = (config: PayrollConfig) => {
    const year = new Date().getFullYear();

    const findLatestSelectableMonth = (targetYear: number) => {
      const available = getAvailablePayslipMonthsForEmployee(
        config.employeeId,
        targetYear,
        payrollRecords
      );
      return available.length > 0 ? available[available.length - 1] : null;
    };

    let defaultYear = year;
    let defaultMonth = findLatestSelectableMonth(year);

    if (!defaultMonth) {
      const previousYear = year - 1;
      const previousMonth = findLatestSelectableMonth(previousYear);
      if (previousMonth) {
        defaultYear = previousYear;
        defaultMonth = previousMonth;
      }
    }

    setPayslipConfig(config);
    setPayslipYear(defaultYear);
    setSelectedPayslipMonths(defaultMonth ? [defaultMonth] : []);
    setPayslipModalOpen(true);
  };

  const payslipAvailableMonths = payslipConfig
    ? getAvailablePayslipMonthsForEmployee(payslipConfig.employeeId, payslipYear, payrollRecords)
    : [];

  const isPayslipMonthAvailable = (month: number) => payslipAvailableMonths.includes(month);

  const togglePayslipMonth = (month: number, checked: boolean) => {
    if (checked && !isPayslipMonthAvailable(month)) {
      return;
    }
    setSelectedPayslipMonths((prev) =>
      checked ? [...prev, month].sort((a, b) => a - b) : prev.filter((m) => m !== month)
    );
  };

  const handleExport = (formatType: "excel" | "pdf") => {
    if (!configs.length) {
      toast({
        title: "Nothing to export",
        description: "There is no payroll data to export.",
        variant: "destructive",
      });
      return;
    }

    try {
      const rows = configs.map((config) => {
        const preview = configPreviews.get(config.id);
        const employee = employees.find((e) => Number(e.id) === Number(config.employeeId));
        const monthlySalary = parseFloat(config.baseSalary) || 0;
        const annualSalary = monthlySalary * 12;
        const employeeLabel = employee?.employeeId
          ? `${config.employeeName} (ID: ${employee.employeeId})`
          : config.employeeName;

        return {
          employee: employeeLabel,
          department: config.department || "—",
          designation: config.designation || "—",
          payrollPeriod: formatPeriod(config.payrollPeriod),
          baseSalary: formatCurrency(monthlySalary),
          annualSalary: formatCurrency(annualSalary),
          cpfRateEmployee: preview ? `${preview.employeeRate.toFixed(2)}%` : "—",
          cpfAmountEmployee: preview ? formatCurrency(preview.employeeCpf) : "—",
          cpfRateEmployer: preview ? `${preview.employerRate.toFixed(2)}%` : "—",
          cpfAmountEmployer: preview ? formatCurrency(preview.employerCpf) : "—",
        };
      });

      if (formatType === "excel") {
        exportPayrollTableToExcel(rows);
        toast({
          title: "Export successful",
          description: "Payroll data has been downloaded as an Excel file.",
        });
      } else {
        exportPayrollTableToPdf(rows);
        toast({
          title: "Export successful",
          description: "Payroll data has been downloaded as a PDF file.",
        });
      }
    } catch {
      toast({
        title: "Export failed",
        description: "Unable to download the payroll report. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <>
      <ManagementPageHeader
        title="Payroll Management"
        action={
          <div className="flex shrink-0 flex-nowrap items-center gap-2">
            <Button
              variant="outline"
              className="border-[#E5E7EB]"
              onClick={() => setPaymentRecordOpen(true)}
            >
              <CreditCard className="mr-2 h-4 w-4" /> Payment Record
            </Button>
            <Button className={payrollPrimaryButtonClass} onClick={() => openConfigForm()}>
              <Plus className="mr-2 h-4 w-4" /> Create Payroll
            </Button>
            <Button className={payrollPrimaryButtonClass} onClick={() => setLocation("/payroll/process")}>
              <Calculator className="mr-2 h-4 w-4" /> Process Payroll
            </Button>
          </div>
        }
      />

      <div className="mb-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <button
          type="button"
          className="rounded-lg border border-[#E5E7EB] bg-white p-4 text-left transition-all hover:shadow-md"
          onClick={() => setOpenDetail("employees")}
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-[#444651]">Total Employees</span>
            <Users className="h-4 w-4 text-[#0D9488]" />
          </div>
          <div className="text-2xl font-bold text-[#111827]">
            {summaryLoading ? "—" : summary?.totalEmployees ?? 0}
          </div>
          <p className="mt-1 text-xs text-[#6B7280]">Employees on active payroll</p>
        </button>
        <button
          type="button"
          className="rounded-lg border border-[#E5E7EB] bg-white p-4 text-left transition-all hover:shadow-md"
          onClick={() => setOpenDetail("gross")}
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-[#444651]">Total Gross Pay</span>
            <DollarSign className="h-4 w-4 text-[#0D9488]" />
          </div>
          <div className="text-2xl font-bold text-[#111827]">
            {summaryLoading ? "—" : formatCurrency(summary?.totalGrossPay ?? 0)}
          </div>
          <p className="mt-1 text-xs text-[#6B7280]">
            {recordCount} records · Before deductions
          </p>
        </button>
        <button
          type="button"
          className="rounded-lg border border-[#E5E7EB] bg-white p-4 text-left transition-all hover:shadow-md"
          onClick={() => setOpenDetail("net")}
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-[#444651]">Total Net Pay</span>
            <DollarSign className="h-4 w-4 text-[#0D9488]" />
          </div>
          <div className="text-2xl font-bold text-[#111827]">
            {summaryLoading ? "—" : formatCurrency(summary?.totalNetPay ?? 0)}
          </div>
          <p className="mt-1 text-xs text-[#6B7280]">
            {recordCount} records · After deductions
          </p>
        </button>
        <button
          type="button"
          className="rounded-lg border border-[#E5E7EB] bg-white p-4 text-left transition-all hover:shadow-md"
          onClick={() => setOpenDetail("records")}
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-[#444651]">No. of Payroll Records</span>
            <FileText className="h-4 w-4 text-[#F97316]" />
          </div>
          <div className="text-2xl font-bold text-[#111827]">
            {recordsLoading ? "—" : recordCount}
          </div>
          <p className="mt-1 text-xs text-[#6B7280]">Total processed payroll records</p>
        </button>
      </div>

      <ManagementToolbarRow className="justify-between">
        <h3 className="text-lg font-semibold text-[#111827]">Employee Payroll</h3>
        <div className="flex gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="border-[#E5E7EB]"
                disabled={isPayslipDownloading || isPayslipViewing}
              >
                <Printer className="mr-2 h-4 w-4" /> Print
                <ChevronDown className="ml-2 h-4 w-4 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                disabled={isPayslipDownloading}
                onClick={() => void handleBulkPrint()}
              >
                Bulk print
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={isPayslipViewing || isPayslipDownloading}
                onClick={() => void handleIndividualPrint()}
              >
                Individual print
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="border-[#E5E7EB]" disabled={configs.length === 0}>
                <Download className="mr-2 h-4 w-4" /> Export
                <ChevronDown className="ml-2 h-4 w-4 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleExport("excel")}>
                Excel
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport("pdf")}>
                PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </ManagementToolbarRow>

      <ManagementTableCard pagination={{ page: configPage, totalPages: configTotalPages, onPageChange: setConfigPage }}>
        {configsLoading ? (
          <p className="py-16 text-center text-sm text-[#6B7280]">Loading...</p>
        ) : configs.length === 0 ? (
          <ManagementEmptyState
            title="No payroll set up"
            description="Set up payroll for your employees to start processing payroll."
            action={
              <Button className={payrollPrimaryButtonClass} onClick={() => openConfigForm()}>
                <Plus className="mr-2 h-4 w-4" /> Add First Payroll
              </Button>
            }
          />
        ) : (
          <ManagementTableContainer>
            <Table>
              <TableHeader>
                <TableRow className="bg-[#EFF6FF] hover:bg-[#EFF6FF]">
                  <TableHead className="w-10">
                    <Checkbox
                      checked={selectedIds.length === configs.length && configs.length > 0}
                      onCheckedChange={(checked) => toggleSelectAll(Boolean(checked))}
                    />
                  </TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Designation</TableHead>
                  <TableHead>Payroll Period</TableHead>
                  <TableHead>Basic Salary</TableHead>
                  <TableHead>Annual Salary</TableHead>
                  <TableHead>CPF Rate (Employee)</TableHead>
                  <TableHead>CPF Amount (Employee)</TableHead>
                  <TableHead>CPF Rate (Employer)</TableHead>
                  <TableHead>CPF Amount (Employer)</TableHead>
                  <TableHead>Payslip</TableHead>
                  <TableHead className="w-px text-left">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedConfigs.map((config) => {
                  const preview = configPreviews.get(config.id);
                  const employee = employees.find((e) => Number(e.id) === Number(config.employeeId));
                  const monthlySalary = parseFloat(config.baseSalary) || 0;
                  const processed = isConfigProcessed(config);
                  const canDownloadPayslip = hasProcessedPayrollForEmployee(
                    config.employeeId,
                    payrollRecords
                  );
                  return (
                    <TableRow
                      key={config.id}
                      className={processed ? processedRowClass : undefined}
                    >
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.includes(config.id)}
                          onCheckedChange={(checked) =>
                            toggleSelect(config.id, Boolean(checked))
                          }
                        />
                      </TableCell>
                      <TableCell className="font-medium text-[#111827]">
                        <div>{config.employeeName}</div>
                        <div className="text-sm text-[#6B7280]">
                          ID: {employee?.employeeId || config.employeeId}
                        </div>
                      </TableCell>
                      <TableCell className="text-[#444651]">{config.department}</TableCell>
                      <TableCell className="text-[#444651]">{config.designation}</TableCell>
                      <TableCell className="text-[#444651]">
                        {formatPeriod(config.payrollPeriod)}
                      </TableCell>
                      <TableCell className="text-[#444651]">
                        {formatCurrency(monthlySalary)}
                      </TableCell>
                      <TableCell className="text-[#444651]">
                        {formatCurrency(monthlySalary * 12)}
                      </TableCell>
                      <TableCell className="text-[#444651]">
                        {preview ? `${preview.employeeRate.toFixed(2)}%` : "—"}
                      </TableCell>
                      <TableCell className="text-[#444651]">
                        {preview ? formatCurrency(preview.employeeCpf) : "—"}
                      </TableCell>
                      <TableCell className="text-[#444651]">
                        {preview ? `${preview.employerRate.toFixed(2)}%` : "—"}
                      </TableCell>
                      <TableCell className="text-[#444651]">
                        {preview ? formatCurrency(preview.employerCpf) : "—"}
                      </TableCell>
                      <TableCell>
                        <button
                          type="button"
                          title={
                            canDownloadPayslip
                              ? `Download latest payslip for ${config.employeeName}`
                              : "Process payroll first to enable payslip download"
                          }
                          disabled={!canDownloadPayslip || isBatchProcessing || isPayslipDownloading}
                          onClick={() => handlePayslipButtonClick(config)}
                          className="flex h-8 w-8 items-center justify-center rounded-full bg-[#CCFBF1] text-[#0D9488] transition-colors hover:bg-[#99F6E4] disabled:pointer-events-none disabled:opacity-40"
                        >
                          <Download className="h-4 w-4" />
                        </button>
                      </TableCell>
                      <TableCell className="w-px whitespace-nowrap">
                        <div className="flex gap-1">
                          <button
                            type="button"
                            title="Edit payroll"
                            onClick={() => openConfigForm(config)}
                            className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-600 transition-colors hover:bg-gray-200"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            title="View payroll"
                            onClick={() => openConfigDetails(config)}
                            className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-600 transition-colors hover:bg-gray-200"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            title="Delete payroll"
                            disabled={deleteMutation.isPending}
                            onClick={() => deleteMutation.mutate(config.id)}
                            className="flex h-8 w-8 items-center justify-center rounded-full bg-red-50 text-red-600 transition-colors hover:bg-red-100 disabled:opacity-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </ManagementTableContainer>
        )}
      </ManagementTableCard>

      <EntityViewDialog
        open={detailOpen}
        onOpenChange={(open) => !open && closeDetails()}
        title="Payroll Details"
        onClose={closeDetails}
        maxWidth="max-w-5xl"
      >
        {selectedConfig && (
          <div className="space-y-5">
            <EntityViewFieldGrid>
              <EntityViewField label="Employee" value={selectedConfig.employeeName} />
              <EntityViewField label="Department" value={selectedConfig.department} />
              <EntityViewField label="Designation" value={selectedConfig.designation} />
              <EntityViewField label="Payroll Period" value={formatPeriod(selectedConfig.payrollPeriod)} />
              <EntityViewField
                label="Status"
                value={
                  <EntityViewStatusBadge
                    status={selectedConfig.isActive ? "Active" : "Inactive"}
                    variant={selectedConfig.isActive ? "valid" : "neutral"}
                  />
                }
              />
            </EntityViewFieldGrid>
            <PayrollMonthTable
              rows={listEmployeePayrollMonths(payrollRecords, selectedConfig.employeeId)}
            />
          </div>
        )}
      </EntityViewDialog>

      <PayrollPaymentRecordDialog
        open={paymentRecordOpen}
        onOpenChange={setPaymentRecordOpen}
        employees={activeConfigs.map((config) => {
          const employee = employees.find((item) => Number(item.id) === Number(config.employeeId));
          const designation = employee?.designation || config.designation || "";
          const monthlyPay = formatCurrency(parseFloat(config.baseSalary) || 0);
          return {
            id: Number(config.employeeId),
            name: employee?.name || config.employeeName,
            employeeId: employee?.employeeId,
            designation: `${designation} (${monthlyPay}/month)`.trim(),
            department: employee?.department || config.department,
          };
        })}
        payrollRecords={payrollRecords}
      />

      {/* Batch Process Pay Period Selection */}
      <Dialog open={batchModalOpen} onOpenChange={setBatchModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Batch Process Payroll</DialogTitle>
            <DialogDescription>
              Select the pay period to process payroll for all active employees (or selected rows).
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <Label>Pay Period Start *</Label>
                <StringDatePicker
                  value={batchPayPeriodStart}
                  onChange={handleBatchPayPeriodChange}
                  disabledDate={isPayPeriodDateDisabled}
                />
              </div>
              <div className="grid gap-2">
                <Label>Pay Period End *</Label>
                <StringDatePicker
                  value={batchPayPeriodEnd}
                  onChange={handleBatchPayPeriodChange}
                  disabledDate={isPayPeriodDateDisabled}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setBatchModalOpen(false)}
              className={payrollCancelButtonClass}
            >
              Cancel
            </Button>
            <Button
              className={payrollPrimaryButtonClass}
              onClick={confirmBatchProcess}
              disabled={isBatchProcessing}
            >
              {isBatchProcessing ? "Processing..." : "Save & Process"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Batch Process Confirmation */}
      <Dialog
        open={batchConfirmDialogOpen}
        onOpenChange={(open) => {
          if (!open) closeBatchConfirmDialog();
          else setBatchConfirmDialogOpen(true);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {batchConfirmScenario === "pending"
                ? "Confirm Batch Process"
                : "Payroll Already Processed"}
            </DialogTitle>
            <div className="space-y-2 pt-2 text-sm text-[#6B7280]">
              {batchConfirmScenario === "pending" ? (
                <>
                  <p>Payroll for the selected period has not been processed for some employees.</p>
                  <p>Do you want to process payroll for all pending employees?</p>
                </>
              ) : (
                <>
                  <p>Payroll for the selected period has already been processed.</p>
                  <p>Payroll can be processed only once in a month.</p>
                </>
              )}
            </div>
          </DialogHeader>
          <DialogFooter className="gap-2">
            {batchConfirmScenario === "pending" ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={closeBatchConfirmDialog}
                  className={payrollCancelButtonClass}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  className={payrollPrimaryButtonClass}
                  onClick={() => void handleBatchConfirmProceed()}
                  disabled={isBatchProcessing}
                >
                  {isBatchProcessing ? "Processing..." : "Yes, Proceed"}
                </Button>
              </>
            ) : (
              <Button
                type="button"
                variant="outline"
                onClick={closeBatchConfirmDialog}
                className={payrollCancelButtonClass}
              >
                Close
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stats detail sheet */}
      <Sheet open={!!openDetail} onOpenChange={(open) => !open && setOpenDetail(null)}>
        <SheetContent
          side="right"
          className="flex w-full flex-col p-0 sm:max-w-none"
          style={{ width: "50vw", minWidth: "320px" }}
        >
          <SheetHeader className="border-b px-6 py-4">
            <SheetTitle>
              {openDetail === "employees"
                ? "Employees with Payroll"
                : openDetail === "gross"
                  ? "Payroll Records - Gross Pay"
                  : openDetail === "net"
                    ? "Payroll Records - Net Pay"
                    : "Payroll Records"}
            </SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-6 pb-6 pt-4">
            {openDetail === "employees" &&
              (employees.length ? (
                <ul className="divide-y">
                  {employees.map((emp: any) => (
                    <li key={emp.id} className="py-3">
                      <div className="font-medium text-[#111827]">{emp.name}</div>
                      <div className="text-xs text-[#6B7280]">
                        {emp.department} | {emp.designation}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="py-8 text-center text-[#6B7280]">No employees found.</div>
              ))}

            {openDetail === "gross" &&
              (recordsLoading ? (
                <p className="py-8 text-center text-sm text-[#6B7280]">Loading payroll records...</p>
              ) : uniquePayrollRecords.length ? (
                <>
                <table className="min-w-full overflow-hidden rounded-lg border text-sm">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="px-4 py-2 text-left font-semibold">Employee</th>
                      <th className="px-4 py-2 text-left font-semibold">Period</th>
                      <th className="px-4 py-2 text-left font-semibold">Gross Pay</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedRecords.map((rec: any) => (
                      <tr
                        key={`${rec.employeeId}-${rec.payPeriodStart}-${rec.payPeriodEnd}`}
                        className="border-b hover:bg-gray-50"
                      >
                        <td className="px-4 py-2">{rec.employeeName}</td>
                        <td className="px-4 py-2">
                          {rec.payPeriodStart} - {rec.payPeriodEnd}
                        </td>
                        <td className="px-4 py-2">{formatCurrency(rec.grossPay)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <ListPagination page={recordPage} totalPages={recordTotalPages} onPageChange={setRecordPage} />
                </>
              ) : (
                <div className="py-8 text-center text-[#6B7280]">No payroll records found.</div>
              ))}

            {openDetail === "net" &&
              (recordsLoading ? (
                <p className="py-8 text-center text-sm text-[#6B7280]">Loading payroll records...</p>
              ) : uniquePayrollRecords.length ? (
                <>
                <table className="min-w-full overflow-hidden rounded-lg border text-sm">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="px-4 py-2 text-left font-semibold">Employee</th>
                      <th className="px-4 py-2 text-left font-semibold">Period</th>
                      <th className="px-4 py-2 text-left font-semibold">Net Pay</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedRecords.map((rec: any) => (
                      <tr
                        key={`${rec.employeeId}-${rec.payPeriodStart}-${rec.payPeriodEnd}`}
                        className="border-b hover:bg-gray-50"
                      >
                        <td className="px-4 py-2">{rec.employeeName}</td>
                        <td className="px-4 py-2">
                          {rec.payPeriodStart} - {rec.payPeriodEnd}
                        </td>
                        <td className="px-4 py-2">{formatCurrency(rec.netPay)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <ListPagination page={recordPage} totalPages={recordTotalPages} onPageChange={setRecordPage} />
                </>
              ) : (
                <div className="py-8 text-center text-[#6B7280]">No payroll records found.</div>
              ))}

            {openDetail === "records" &&
              (recordsLoading ? (
                <p className="py-8 text-center text-sm text-[#6B7280]">Loading payroll records...</p>
              ) : uniquePayrollRecords.length ? (
                <>
                <table className="min-w-full overflow-hidden rounded-lg border text-sm">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="px-4 py-2 text-left font-semibold">Employee</th>
                      <th className="px-4 py-2 text-left font-semibold">Period</th>
                      <th className="px-4 py-2 text-left font-semibold">Gross Pay</th>
                      <th className="px-4 py-2 text-left font-semibold">Net Pay</th>
                      <th className="px-4 py-2 text-left font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedRecords.map((rec: any) => (
                      <tr
                        key={`${rec.employeeId}-${rec.payPeriodStart}-${rec.payPeriodEnd}`}
                        className="border-b hover:bg-gray-50"
                      >
                        <td className="px-4 py-2">{rec.employeeName}</td>
                        <td className="px-4 py-2">
                          {rec.payPeriodStart} - {rec.payPeriodEnd}
                        </td>
                        <td className="px-4 py-2">{formatCurrency(rec.grossPay)}</td>
                        <td className="px-4 py-2">{formatCurrency(rec.netPay)}</td>
                        <td className="px-4 py-2 capitalize">{rec.status || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <ListPagination page={recordPage} totalPages={recordTotalPages} onPageChange={setRecordPage} />
                </>
              ) : (
                <div className="py-8 text-center text-[#6B7280]">No payroll records found.</div>
              ))}
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={printDialogOpen} onOpenChange={setPrintDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Print Payslip</DialogTitle>
            <DialogDescription>
              {printMode === "individual" && printConfigs[0]
                ? `Select a month for ${printConfigs[0].employeeName}.`
                : `Select a month to print payslips for ${printConfigs.length} employee${printConfigs.length === 1 ? "" : "s"}.`}
              {" "}Use custom dates to narrow the months. Click a month to print that month.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>From</Label>
                <StringDatePicker
                  value={printFrom}
                  onChange={(value) => setPrintFrom(value || "")}
                  placeholder="Custom from"
                />
              </div>
              <div className="grid gap-1.5">
                <Label>To</Label>
                <StringDatePicker
                  value={printTo}
                  onChange={(value) => setPrintTo(value || "")}
                  placeholder="Custom to"
                />
              </div>
            </div>
            {printMonthOptions.length === 0 ? (
              <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
                No months fall in this date range. Clear the custom dates to see every month.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {printMonthOptions.map((item) => (
                  <button
                    key={`${item.year}-${item.month}`}
                    type="button"
                    disabled={isPayslipDownloading || isPayslipViewing}
                    onClick={() => void handlePrintMonth(item.year, item.month)}
                    className="rounded-lg bg-[#f8fafc] px-3 py-2.5 text-left text-[13px] font-medium text-[#475569] transition hover:bg-[#f0f4ff] hover:text-[#1a73e8] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {formatPayrollMonthLabel(item.year, item.month)}
                  </button>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPrintDialogOpen(false)}
              className={payrollCancelButtonClass}
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payslip Download Dialog */}
      <Dialog open={payslipModalOpen} onOpenChange={setPayslipModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Payslip</DialogTitle>
          </DialogHeader>
          {payslipConfig && (
            <div className="space-y-4">
              <p className="text-sm text-[#6B7280]">
                Select one or more months for{" "}
                <span className="font-medium text-[#111827]">{payslipConfig.employeeName}</span>{" "}
                (ID: {payslipConfig.employeeId}). Payslips use processed payroll data only — process
                payroll for the selected month(s) before downloading.
              </p>
              <div className="flex items-center gap-3">
                <label htmlFor="payslip-year" className="text-sm font-medium">
                  Year
                </label>
                <input
                  id="payslip-year"
                  type="text"
                  inputMode="numeric"
                  value={payslipYear}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, "");
                    if (digits === "") return;
                    const currentYear = new Date().getFullYear();
                    const nextYear = Math.min(
                      currentYear,
                      Math.max(2000, parseInt(digits, 10) || currentYear)
                    );
                    setPayslipYear(nextYear);
                    if (payslipConfig) {
                      const available = getAvailablePayslipMonthsForEmployee(
                        payslipConfig.employeeId,
                        nextYear,
                        payrollRecords
                      );
                      setSelectedPayslipMonths((prev) =>
                        prev.filter((m) => available.includes(m))
                      );
                    }
                  }}
                  className="h-9 w-28 rounded-md border border-input bg-background px-3 text-sm"
                />
              </div>
              {payslipAvailableMonths.length === 0 ? (
                <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
                  No processed payroll is available for this employee in {payslipYear}. Please process
                  payroll first, then return to download the payslip.
                </p>
              ) : (
                <p className="text-xs text-[#6B7280]">
                  Available months (processed payroll):{" "}
                  {payslipAvailableMonths
                    .map(
                      (m) =>
                        PAYSLIP_MONTHS_LEFT.concat(PAYSLIP_MONTHS_RIGHT).find((x) => x.value === m)
                          ?.label
                    )
                    .filter(Boolean)
                    .join(", ")}
                </p>
              )}
              <p className="text-xs text-[#6B7280]">
                Only months with processed payroll can be selected. The current month and future
                months stay disabled until the pay period ends.
              </p>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-3">
                  {PAYSLIP_MONTHS_LEFT.map((month) => {
                    const available = isPayslipMonthAvailable(month.value);
                    return (
                      <label
                        key={month.value}
                        className={`flex items-center gap-2 text-sm ${available ? "cursor-pointer" : "cursor-not-allowed opacity-50"}`}
                      >
                        <Checkbox
                          checked={selectedPayslipMonths.includes(month.value)}
                          disabled={!available}
                          onCheckedChange={(checked) =>
                            available && togglePayslipMonth(month.value, checked === true)
                          }
                        />
                        {month.label}
                      </label>
                    );
                  })}
                </div>
                <div className="space-y-3">
                  {PAYSLIP_MONTHS_RIGHT.map((month) => {
                    const available = isPayslipMonthAvailable(month.value);
                    return (
                      <label
                        key={month.value}
                        className={`flex items-center gap-2 text-sm ${available ? "cursor-pointer" : "cursor-not-allowed opacity-50"}`}
                      >
                        <Checkbox
                          checked={selectedPayslipMonths.includes(month.value)}
                          disabled={!available}
                          onCheckedChange={(checked) =>
                            available && togglePayslipMonth(month.value, checked === true)
                          }
                        />
                        {month.label}
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setPayslipModalOpen(false)}
              className={payrollCancelButtonClass}
            >
              Cancel
            </Button>
            <Button
              variant="outline"
              onClick={() => void handlePayslipView()}
              disabled={
                isPayslipViewing ||
                isPayslipDownloading ||
                selectedPayslipMonths.length !== 1 ||
                payslipAvailableMonths.length === 0
              }
              className={payrollCancelButtonClass}
            >
              {isPayslipViewing ? (
                "Loading..."
              ) : (
                <>
                  <Eye className="mr-2 h-4 w-4" />
                  View Payslip
                </>
              )}
            </Button>
            <Button
              className={payrollPrimaryButtonClass}
              onClick={() => void handlePayslipDownload()}
              disabled={
                isPayslipDownloading ||
                isPayslipViewing ||
                selectedPayslipMonths.length === 0 ||
                payslipAvailableMonths.length === 0
              }
            >
              {isPayslipDownloading ? (
                "Downloading..."
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  Download
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payslip Preview — same jsPDF preview/download as Purchase Order */}
      {payslipViewerData && (
        <PdfPreviewModal
          open={payslipViewerOpen}
          onOpenChange={(open) => {
            if (!open) closePayslipViewer();
          }}
          title={payslipViewerTitle || "Payslip Preview"}
          generatePdf={(opts) => generatePayslip_PDF(payslipViewerData, {
            returnBase64: opts?.returnBase64,
            filename: payslipViewerFilename,
          })}
          pdfFilename={payslipViewerFilename}
          showEmail={false}
        />
      )}

      {/* Force Delete Dialog */}
      <Dialog open={showForceDeleteDialog} onOpenChange={setShowForceDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cannot Delete Payroll</DialogTitle>
          </DialogHeader>
          <div className="py-2 text-sm text-[#6B7280]">
            This payroll has related payroll records. Do you want to delete all related
            records and the payroll setup?
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowForceDeleteDialog(false)}
              className={payrollCancelButtonClass}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (forceDeleteId) forceDeleteMutation.mutate(forceDeleteId);
              }}
              disabled={forceDeleteMutation.isPending}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
