import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/operations-8june/lib/queryClient";
import { ManagementTableCard, ManagementTableContainer, ManagementEmptyState, ManagementPageHeader, ManagementToolbarRow } from "@/operations-8june/components/layout/ManagementPageUI";
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
import { FormModalShell } from "@/operations-8june/components/forms/FormModalShell";
import {
  EntityViewDialog,
  EntityViewField,
  EntityViewFieldGrid,
  EntityViewStatusBadge,
} from "@/operations-8june/components/ui/entity-view-dialog";
import PayrollConfigForm from "@/operations-8june/components/forms/PayrollConfigForm";
import ProcessPayrollForm from "@/operations-8june/components/forms/ProcessPayrollForm";
import PayslipPreviewModal from "@/operations-8june/components/payroll/PayslipPreviewModal";
import { calculateSyncBridgePayrollPreview } from "@/operations-8june/lib/payroll-utils";
import {
  getLastCompletedPayPeriod,
  derivePayrollMonthYear,
  normalizePayPeriodFromDate,
  resolveBatchPayrollStatus,
  batchProcessPayrollForPeriod,
  getUniquePayrollRecords,
  hasProcessedPayrollForEmployee,
  getAvailablePayslipMonthsForEmployee,
  isPayrollProcessedForPeriod,
  downloadPayrollFileResponse,
  formatPayrollMonthLabel,
  isPayPeriodEligibleForProcessing,
  PAYROLL_CURRENT_MONTH_ERROR,
  isPayPeriodDateDisabled,
  type BatchPayrollScenario,
} from "@/operations-8june/lib/payroll-batch-utils";
import {
  payrollCancelButtonClass,
  payrollPrimaryButtonClass,
} from "@/operations-8june/lib/payroll-ui";
import { exportPayrollTableToExcel } from "@/operations-8june/lib/excel-utils";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  Users,
  DollarSign,
  Calculator,
  FileText,
  Edit,
  Eye,
  Download,
  Loader2,
  Trash2,
} from "lucide-react";

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

function formatCurrency(amount: string | number) {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-SG", { style: "currency", currency: "SGD" }).format(num || 0);
}

function formatPeriod(period: string) {
  const map: Record<string, string> = {
    monthly: "Monthly",
    bi_weekly: "Bi-weekly",
    weekly: "Weekly",
  };
  return map[period] || period;
}

export default function PayrollPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [configFormOpen, setConfigFormOpen] = useState(false);
  const [processFormOpen, setProcessFormOpen] = useState(false);
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
  const [selectedPayslipMonths, setSelectedPayslipMonths] = useState<number[]>([]);
  const [payslipYear, setPayslipYear] = useState(new Date().getFullYear());
  const [isPayslipDownloading, setIsPayslipDownloading] = useState(false);
  const [isPayslipViewing, setIsPayslipViewing] = useState(false);
  const [payslipViewerOpen, setPayslipViewerOpen] = useState(false);
  const [payslipViewerHtml, setPayslipViewerHtml] = useState<string | null>(null);
  const [payslipViewerPdfUrl, setPayslipViewerPdfUrl] = useState<string | null>(null);
  const [payslipViewerTitle, setPayslipViewerTitle] = useState("");
  const [payslipViewerContext, setPayslipViewerContext] = useState<{
    payrollConfigId: number;
    employeeName: string;
    year: number;
    month: number;
  } | null>(null);
  const [forceDeleteId, setForceDeleteId] = useState<number | null>(null);
  const [showForceDeleteDialog, setShowForceDeleteDialog] = useState(false);

  const { payPeriodStart, payPeriodEnd } = getLastCompletedPayPeriod();

  const closePayslipViewer = () => {
    setPayslipViewerOpen(false);
    setPayslipViewerHtml(null);
    if (payslipViewerPdfUrl) {
      window.URL.revokeObjectURL(payslipViewerPdfUrl);
    }
    setPayslipViewerPdfUrl(null);
    setPayslipViewerContext(null);
    setPayslipViewerTitle("");
  };

  function parseApiErrorMessage(error: unknown, fallback: string): string {
    if (!error || typeof error !== "object") return fallback;
    const record = error as { message?: string; error?: string };
    return record.message || record.error || fallback;
  }

  function isPdfResponse(buffer: ArrayBuffer): boolean {
    if (buffer.byteLength < 4) return false;
    const bytes = new Uint8Array(buffer, 0, 4);
    return bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
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
      toast({ title: "Payroll configuration deleted" });
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
      toast({ title: "Payroll configuration and related records deleted" });
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

  const { data: configs = [], isLoading: configsLoading } = useQuery<PayrollConfig[]>({
    queryKey: ["/api/payroll/configs"],
  });

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
    setSelectedConfig(config || null);
    setConfigFormOpen(true);
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
        description: "Select at least one active payroll configuration to process.",
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
      const result = await batchProcessPayrollForPeriod(
        batchPayPeriodStart,
        batchPayPeriodEnd,
        selectedIds.length > 0 ? selectedIds : undefined,
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
      setSelectedIds([]);
      closeBatchConfirmDialog();

      if (result.ok) {
        toast({
          title: options?.forceOverwrite ? "Payroll overwritten" : "Batch payroll complete",
          description: options?.forceOverwrite
            ? `Payslips regenerated for the selected period (${monthLabel}).`
            : options?.processScope === "changed"
              ? `Payslips regenerated for employees with updated payroll values (${monthLabel}).`
              : `Payroll for ${monthLabel} processed successfully. Payslips have been downloaded.`,
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
      return;
    }
    if (batchConfirmScenario === "values-changed" || batchConfirmScenario === "no-changes") {
      await runBatchProcess({ forceOverwrite: true });
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
      const res = await fetch("/api/payroll/payslips/download", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payrollConfigId: payslipConfig.id,
          year: payslipYear,
          months: selectedPayslipMonths,
        }),
      });

      const employeeFirstName =
        payslipConfig.employeeName?.trim().split(/\s+/)[0]?.replace(/[^a-zA-Z0-9]/g, "") ||
        "Employee";
      const isMultiMonth = selectedPayslipMonths.length > 1;
      const fallbackFilename = isMultiMonth
        ? `${employeeFirstName}_${payslipConfig.employeeId}_Payslips.zip`
        : buildPayslipDownloadFilename(
            payslipConfig.employeeName,
            selectedPayslipMonths[0],
            payslipYear
          );

      const result = await downloadPayrollFileResponse(res, fallbackFilename);

      if (result.ok) {
        const missingHeader = res.headers.get("X-Payslip-Missing-Months");
        toast({
          title: isMultiMonth ? "Payslips downloaded" : "Payslip downloaded",
          description: isMultiMonth
            ? `Downloaded ${selectedPayslipMonths.length} payslip(s) as a ZIP file for ${payslipConfig.employeeName}.${missingHeader ? ` Missing: ${missingHeader}.` : ""}`
            : `Downloaded payslip for ${payslipConfig.employeeName}.${missingHeader ? ` Missing: ${missingHeader}.` : ""}`,
        });
      } else {
        toast({
          title: "Download failed",
          description: result.message,
          variant: "destructive",
        });
      }
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
      let res = await fetch("/api/payroll/payslips/preview", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payrollConfigId: payslipConfig.id,
          year: payslipYear,
          month,
        }),
      });

      const initialContentType = res.headers.get("content-type") || "";
      if (
        !res.ok &&
        res.status === 404 &&
        !initialContentType.includes("application/json")
      ) {
        res = await fetch("/api/payroll/payslips/view", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            payrollConfigId: payslipConfig.id,
            year: payslipYear,
            month,
          }),
        });
      }

      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        toast({
          title: "View failed",
          description: parseApiErrorMessage(error, "Failed to load payslip preview."),
          variant: "destructive",
        });
        return;
      }

      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const data = await res.json();
        if (payslipViewerPdfUrl) {
          window.URL.revokeObjectURL(payslipViewerPdfUrl);
          setPayslipViewerPdfUrl(null);
        }
        setPayslipViewerTitle(data.title || `${payslipConfig.employeeName} — ${payslipYear}`);
        setPayslipViewerHtml(data.html || null);
        setPayslipViewerContext({
          payrollConfigId: payslipConfig.id,
          employeeName: payslipConfig.employeeName,
          year: payslipYear,
          month,
        });
        setPayslipViewerOpen(true);
        setPayslipModalOpen(false);
        return;
      }

      const arrayBuffer = await res.arrayBuffer();
      if (!isPdfResponse(arrayBuffer)) {
        toast({
          title: "View failed",
          description: "Server did not return a valid payslip preview.",
          variant: "destructive",
        });
        return;
      }

      if (payslipViewerPdfUrl) {
        window.URL.revokeObjectURL(payslipViewerPdfUrl);
      }
      const blob = new Blob([arrayBuffer], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      setPayslipViewerPdfUrl(url);
      setPayslipViewerHtml(null);
      setPayslipViewerTitle(
        `${payslipConfig.employeeName} - ${formatPayrollMonthLabel(payslipYear, month)}`
      );
      setPayslipViewerContext({
        payrollConfigId: payslipConfig.id,
        employeeName: payslipConfig.employeeName,
        year: payslipYear,
        month,
      });
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

  const handlePayslipViewerDownload = async () => {
    if (!payslipViewerContext) return;

    setIsPayslipDownloading(true);

    try {
      const res = await fetch("/api/payroll/payslips/download", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payrollConfigId: payslipViewerContext.payrollConfigId,
          year: payslipViewerContext.year,
          months: [payslipViewerContext.month],
        }),
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: "Failed to download payslip" }));
        toast({
          title: "Download failed",
          description: error.message || "Failed to download payslip.",
          variant: "destructive",
        });
        return;
      }

      const fallbackFilename = buildPayslipDownloadFilename(
        payslipViewerContext.employeeName,
        payslipViewerContext.month,
        payslipViewerContext.year
      );
      const result = await downloadPayrollFileResponse(res, fallbackFilename);

      if (result.ok) {
        toast({
          title: "Payslip downloaded",
          description: `Downloaded payslip for ${payslipViewerContext.employeeName}.`,
        });
      } else {
        toast({
          title: "Download failed",
          description: result.message,
          variant: "destructive",
        });
      }
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

  const exportConfigs = () => {
    if (!configs.length) {
      toast({
        title: "Nothing to export",
        description: "There are no payroll configurations to export.",
        variant: "destructive",
      });
      return;
    }

    try {
      const rows = configs.map((config) => {
        const preview = configPreviews.get(config.id);
        const employee = employees.find((e) => Number(e.id) === Number(config.employeeId));
        const annualSalary = (parseFloat(config.baseSalary) || 0) * 12;
        const employeeLabel = employee?.employeeId
          ? `${config.employeeName} (ID: ${employee.employeeId})`
          : config.employeeName;

        return {
          employee: employeeLabel,
          department: config.department || "—",
          designation: config.designation || "—",
          payrollPeriod: formatPeriod(config.payrollPeriod),
          baseSalary: formatCurrency(config.baseSalary),
          annualSalary: formatCurrency(annualSalary),
          cpfRateEmployee: preview ? `${preview.employeeRate.toFixed(2)}%` : "—",
          cpfAmountEmployee: preview ? formatCurrency(preview.employeeCpf) : "—",
          cpfRateEmployer: preview ? `${preview.employerRate.toFixed(2)}%` : "—",
          cpfAmountEmployer: preview ? formatCurrency(preview.employerCpf) : "—",
        };
      });

      exportPayrollTableToExcel(rows);

      toast({
        title: "Export successful",
        description: "Payroll data has been downloaded as an Excel file.",
      });
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
        description="Manage employee payroll configurations and process monthly payroll"
        action={
          <div className="flex flex-wrap gap-2">
            <Button className={payrollPrimaryButtonClass} onClick={() => openConfigForm()}>
              <Plus className="mr-2 h-4 w-4" /> Add Payroll Config
            </Button>
            <Button className={payrollPrimaryButtonClass} onClick={() => setProcessFormOpen(true)}>
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
          <p className="mt-1 text-xs text-[#6B7280]">Active payroll configurations</p>
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
        <h3 className="text-lg font-semibold text-[#111827]">Payroll Configurations</h3>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="border-[#E5E7EB]"
            onClick={handleBatchProcessOpen}
          >
            <Calculator className="mr-2 h-4 w-4" /> Batch Process
          </Button>
          <Button variant="outline" className="border-[#E5E7EB]" onClick={exportConfigs}>
            <Download className="mr-2 h-4 w-4" /> Export
          </Button>
        </div>
      </ManagementToolbarRow>

      <ManagementTableCard>
        {configsLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-[#2563EB]" />
          </div>
        ) : configs.length === 0 ? (
          <ManagementEmptyState
            title="No payroll configurations"
            description="Set up payroll configurations for your employees to start processing payroll."
            action={
              <Button className={payrollPrimaryButtonClass} onClick={() => openConfigForm()}>
                <Plus className="mr-2 h-4 w-4" /> Add First Configuration
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
                  <TableHead>Base Salary</TableHead>
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
                {configs.map((config) => {
                  const preview = configPreviews.get(config.id);
                  const employee = employees.find((e) => Number(e.id) === Number(config.employeeId));
                  const annualSalary = (parseFloat(config.baseSalary) || 0) * 12;
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
                        {formatCurrency(config.baseSalary)}
                      </TableCell>
                      <TableCell className="text-[#444651]">
                        {formatCurrency(annualSalary)}
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
                              ? `Download payslip for ${config.employeeName}`
                              : "Process payroll first to enable payslip download"
                          }
                          disabled={!canDownloadPayslip || isBatchProcessing}
                          onClick={() => openPayslipModal(config)}
                          className="flex h-8 w-8 items-center justify-center rounded-full bg-[#CCFBF1] text-[#0D9488] transition-colors hover:bg-[#99F6E4] disabled:pointer-events-none disabled:opacity-40"
                        >
                          <Download className="h-4 w-4" />
                        </button>
                      </TableCell>
                      <TableCell className="w-px whitespace-nowrap">
                        <div className="flex gap-1">
                          <button
                            type="button"
                            title="Edit configuration"
                            onClick={() => openConfigForm(config)}
                            className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-600 transition-colors hover:bg-gray-200"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            title="View configuration"
                            onClick={() => openConfigDetails(config)}
                            className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-600 transition-colors hover:bg-gray-200"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            title="Delete configuration"
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

      <Dialog open={configFormOpen}
        onOpenChange={(open) => {
          if (!open) {
            setConfigFormOpen(false);
            setSelectedConfig(null);
          }
        }}
      >
        <FormModalShell
          title={
            selectedConfig?.id ? "Edit payroll configuration" : "Add payroll configuration"
          }
          maxWidth="max-w-5xl"
          onClose={() => {
            setConfigFormOpen(false);
            setSelectedConfig(null);
          }}
        >
          <PayrollConfigForm
            onSuccess={() => {
              setConfigFormOpen(false);
              setSelectedConfig(null);
            }}
            onCancel={() => {
              setConfigFormOpen(false);
              setSelectedConfig(null);
            }}
            editData={selectedConfig}
          />
        </FormModalShell>
      </Dialog>

      <Dialog open={processFormOpen} onOpenChange={setProcessFormOpen}>
        <FormModalShell
          title="Generate Payroll Records"
          description="Create and process monthly payroll for employees"
          maxWidth="max-w-5xl"
          onClose={() => setProcessFormOpen(false)}
        >
          <ProcessPayrollForm
            onSuccess={() => setProcessFormOpen(false)}
            onCancel={() => setProcessFormOpen(false)}
          />
        </FormModalShell>
      </Dialog>

      <EntityViewDialog
        open={detailOpen}
        onOpenChange={(open) => !open && closeDetails()}
        title="Payroll Configuration Details"
        onClose={closeDetails}
        maxWidth="max-w-2xl"
      >
        {selectedConfig && (
          <EntityViewFieldGrid>
            <EntityViewField label="Employee" value={selectedConfig.employeeName} />
            <EntityViewField label="Department" value={selectedConfig.department} />
            <EntityViewField label="Designation" value={selectedConfig.designation} />
            <EntityViewField label="Payroll Period" value={formatPeriod(selectedConfig.payrollPeriod)} />
            <EntityViewField label="Base Salary" value={formatCurrency(selectedConfig.baseSalary)} />
            <EntityViewField
              label="Annual Salary"
              value={formatCurrency((parseFloat(selectedConfig.baseSalary) || 0) * 12)}
            />
            <EntityViewField
              label="Gross Salary"
              value={formatCurrency(
                configPreviews.get(selectedConfig.id)?.grossPay ??
                  (parseFloat(selectedConfig.baseSalary) || 0)
              )}
            />
            <EntityViewField
              label="CPF Rate (Employee)"
              value={
                selectedConfig.nationality?.trim().toLowerCase() === "foreigner"
                  ? "Not Applicable (Foreigner)"
                  : `${configPreviews.get(selectedConfig.id)?.employeeRate ?? parseFloat(selectedConfig.cpfRate || "0")}%`
              }
            />
            <EntityViewField
              label="CPF Amount (Employee)"
              value={formatCurrency(
                configPreviews.get(selectedConfig.id)?.employeeCpf ??
                  selectedConfig.cpfAmount ??
                  0
              )}
            />
            <EntityViewField
              label="CPF Rate (Employer)"
              value={
                configPreviews.get(selectedConfig.id)?.employerRate
                  ? `${configPreviews.get(selectedConfig.id)!.employerRate}%`
                  : selectedConfig.employerCpfRate
                    ? `${parseFloat(selectedConfig.employerCpfRate)}%`
                    : "—"
              }
            />
            <EntityViewField
              label="CPF Amount (Employer)"
              value={formatCurrency(
                configPreviews.get(selectedConfig.id)?.employerCpf ??
                  selectedConfig.employerCpfAmount ??
                  0
              )}
            />
            <EntityViewField
              label="Net Salary (Monthly)"
              value={formatCurrency(
                configPreviews.get(selectedConfig.id)?.netPay ??
                  selectedConfig.netSalary ??
                  0
              )}
            />
            <EntityViewField
              label="Transport Allowance"
              value={formatCurrency(selectedConfig.allowances?.transport || 0)}
            />
            <EntityViewField
              label="Meal Allowance"
              value={formatCurrency(selectedConfig.allowances?.meal || 0)}
            />
            <EntityViewField
              label="Medical Deduction"
              value={formatCurrency(selectedConfig.deductions?.medical || 0)}
            />
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
        )}
      </EntityViewDialog>

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
              {isBatchProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                "Save & Process"
              )}
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
              ) : batchConfirmScenario === "values-changed" ? (
                <>
                  <p>Payroll for the selected period has already been processed.</p>
                  <p>
                    Payroll values have been modified for one or more employees. Do you want to
                    overwrite the existing payslips and regenerate them?
                  </p>
                </>
              ) : (
                <>
                  <p>Payroll for the selected period has already been processed.</p>
                  <p>There are no changes to process.</p>
                </>
              )}
            </div>
          </DialogHeader>
          <DialogFooter className="gap-2">
            {batchConfirmScenario === "no-changes" ||
            batchConfirmScenario === "values-changed" ||
            batchConfirmScenario === "pending" ? (
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
                  {isBatchProcessing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    "Yes, Proceed"
                  )}
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
                ? "Employees with Payroll Configurations"
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
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="mr-2 h-6 w-6 animate-spin" />
                  Loading payroll records...
                </div>
              ) : uniquePayrollRecords.length ? (
                <table className="min-w-full overflow-hidden rounded-lg border text-sm">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="px-4 py-2 text-left font-semibold">Employee</th>
                      <th className="px-4 py-2 text-left font-semibold">Period</th>
                      <th className="px-4 py-2 text-left font-semibold">Gross Pay</th>
                    </tr>
                  </thead>
                  <tbody>
                    {uniquePayrollRecords.map((rec: any) => (
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
              ) : (
                <div className="py-8 text-center text-[#6B7280]">No payroll records found.</div>
              ))}

            {openDetail === "net" &&
              (recordsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="mr-2 h-6 w-6 animate-spin" />
                  Loading payroll records...
                </div>
              ) : uniquePayrollRecords.length ? (
                <table className="min-w-full overflow-hidden rounded-lg border text-sm">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="px-4 py-2 text-left font-semibold">Employee</th>
                      <th className="px-4 py-2 text-left font-semibold">Period</th>
                      <th className="px-4 py-2 text-left font-semibold">Net Pay</th>
                    </tr>
                  </thead>
                  <tbody>
                    {uniquePayrollRecords.map((rec: any) => (
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
              ) : (
                <div className="py-8 text-center text-[#6B7280]">No payroll records found.</div>
              ))}

            {openDetail === "records" &&
              (recordsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="mr-2 h-6 w-6 animate-spin" />
                  Loading payroll records...
                </div>
              ) : uniquePayrollRecords.length ? (
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
                    {uniquePayrollRecords.map((rec: any) => (
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
              ) : (
                <div className="py-8 text-center text-[#6B7280]">No payroll records found.</div>
              ))}
          </div>
        </SheetContent>
      </Sheet>

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
                  type="number"
                  min={2000}
                  max={new Date().getFullYear()}
                  value={payslipYear}
                  onChange={(e) => {
                    const currentYear = new Date().getFullYear();
                    const nextYear = Math.min(
                      currentYear,
                      parseInt(e.target.value, 10) || currentYear
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
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading...
                </>
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
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Downloading...
                </>
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

      {/* Payslip Preview */}
      <PayslipPreviewModal
        open={payslipViewerOpen}
        onOpenChange={(open) => {
          if (!open) {
            closePayslipViewer();
          } else {
            setPayslipViewerOpen(true);
          }
        }}
        title={payslipViewerTitle || "Payslip Preview"}
        html={payslipViewerHtml}
        pdfUrl={payslipViewerPdfUrl}
        isDownloading={isPayslipDownloading}
        onDownload={() => void handlePayslipViewerDownload()}
      />

      {/* Force Delete Dialog */}
      <Dialog open={showForceDeleteDialog} onOpenChange={setShowForceDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cannot Delete Payroll Configuration</DialogTitle>
          </DialogHeader>
          <div className="py-2 text-sm text-[#6B7280]">
            This payroll configuration has related payroll records. Do you want to delete all related
            records and the configuration?
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
