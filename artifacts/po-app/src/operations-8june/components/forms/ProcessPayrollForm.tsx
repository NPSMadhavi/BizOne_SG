import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { StringDatePicker } from "@/operations-8june/components/ui/date-picker";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/operations-8june/lib/queryClient";
import {
  calculateSyncBridgePayrollPreview,
  type SyncBridgePayrollPreview,
} from "@/operations-8june/lib/payroll-utils";
import {
  processIndividualPayrollForConfig,
  batchProcessPayrollForPeriod,
  findPayrollRecordForPeriod,
  hasPayrollDataChanged,
  resolveBatchPayrollStatus,
  derivePayrollMonthYear,
  getLastCompletedPayPeriod,
  normalizePayPeriodFromDate,
  isPayPeriodEligibleForProcessing,
  PAYROLL_CURRENT_MONTH_ERROR,
  isPayPeriodDateDisabled,
} from "@/operations-8june/lib/payroll-batch-utils";
import {
  payrollCancelButtonClass,
  payrollFormLabelClass,
  payrollPrimaryButtonClass,
} from "@/operations-8june/lib/payroll-ui";
import { ModalSectionHeader } from "@/operations-8june/components/forms/FormModalShell";
import { EmployeeCombobox } from "@/operations-8june/components/forms/EmployeeCombobox";
import { Calculator, User } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** Special employeeId value: process every active payroll config. */
const ALL_EMPLOYEES_ID = 0;

const processPayrollSchema = z.object({
  employeeId: z.coerce.number().min(0, "Please select an employee"),
  payPeriodStart: z.string().min(1, "Start date is required"),
  payPeriodEnd: z.string().min(1, "End date is required"),
});

type ProcessPayrollFormData = z.infer<typeof processPayrollSchema>;

interface ProcessPayrollFormProps {
  onSuccess: () => void;
  onCancel: () => void;
}

type ProcessedDialogMode = "overwrite" | "no-changes" | "pending" | null;

type PreviewView = SyncBridgePayrollPreview & {
  monthlySalary: number;
  mode: "individual" | "all";
  employeeCount: number;
  /** When bulk / mixed rates, rates are omitted in the UI */
  ratesMixed?: boolean;
};

function applyPayPeriodMonth(
  dateStr: string,
  setValue: (name: "payPeriodStart" | "payPeriodEnd", value: string) => void
) {
  const { payPeriodStart, payPeriodEnd } = normalizePayPeriodFromDate(dateStr);
  setValue("payPeriodStart", payPeriodStart);
  setValue("payPeriodEnd", payPeriodEnd);
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

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
  }).format(amount || 0);
}

function buildEmployeePreview(config: any, employee: any): SyncBridgePayrollPreview & { monthlySalary: number } {
  const baseSalary = parseFloat(config.baseSalary) || 0;
  const allowances = config.allowances || {};
  const deductions = config.deductions || {};
  const otFromConfig =
    Number(allowances.overtime) ||
    (parseFloat(config.overtimeRate || "0") || 0) * (parseFloat(config.hourlyRate || "0") || 0);
  const overtimePay = Math.round(otFromConfig * 100) / 100;
  const dob = employee.dateOfBirth ? new Date(employee.dateOfBirth) : null;
  const age = dob && !Number.isNaN(dob.getTime()) ? calculateAge(dob) : 30;

  const preview = calculateSyncBridgePayrollPreview({
    monthlySalary: baseSalary,
    age,
    citizenshipStatus: mapNationalityToCitizenship(employee.nationality),
    prStatus: employee.prStatus,
    overtimePay,
    allowances: {
      transport: Number(allowances.transport) || 0,
      meal: Number(allowances.meal) || 0,
      phone: Number(allowances.phone) || 0,
      others: Number(allowances.others) || 0,
    },
    deductions,
  });

  return { ...preview, monthlySalary: baseSalary };
}

export default function ProcessPayrollForm({ onSuccess, onCancel }: ProcessPayrollFormProps) {
  const { toast } = useToast();
  const [selectedEmployee, setSelectedEmployee] = useState<any>(null);
  const [payrollConfig, setPayrollConfig] = useState<any>(null);
  const [processedDialogOpen, setProcessedDialogOpen] = useState(false);
  const [processedDialogMode, setProcessedDialogMode] = useState<ProcessedDialogMode>(null);
  const [pendingFormData, setPendingFormData] = useState<ProcessPayrollFormData | null>(null);

  const { data: payrollConfigs = [], isLoading: configsLoading } = useQuery<any[]>({
    queryKey: ["/api/payroll/configs"],
  });

  const { data: employees = [], isLoading: employeesLoading } = useQuery<any[]>({
    queryKey: ["/api/employees"],
  });

  const { data: payrollRecords = [] } = useQuery<any[]>({
    queryKey: ["/api/payroll/records"],
  });

  const form = useForm<ProcessPayrollFormData>({
    resolver: zodResolver(processPayrollSchema),
    defaultValues: {
      employeeId: undefined as unknown as number,
      ...getLastCompletedPayPeriod(),
    },
  });

  const employeeId = form.watch("employeeId");
  const payPeriodStart = form.watch("payPeriodStart");
  const payPeriodEnd = form.watch("payPeriodEnd");
  const isAllEmployees = Number(employeeId) === ALL_EMPLOYEES_ID;
  const dialogPayPeriodStart = pendingFormData?.payPeriodStart ?? payPeriodStart;
  const dialogMonthLabel = derivePayrollMonthYear(dialogPayPeriodStart).monthLabel;

  const activeConfigs = useMemo(
    () => payrollConfigs.filter((c: any) => c.isActive),
    [payrollConfigs]
  );

  const activeConfigEmployeePairs = useMemo(() => {
    return activeConfigs
      .map((config: any) => {
        const employee = employees.find(
          (emp: any) => Number(emp.id) === Number(config.employeeId)
        );
        if (!employee) return null;
        return { config, employee };
      })
      .filter(Boolean) as Array<{ config: any; employee: any }>;
  }, [activeConfigs, employees]);

  const openProcessedDialog = (data: ProcessPayrollFormData, mode: ProcessedDialogMode) => {
    setPendingFormData(data);
    setProcessedDialogMode(mode);
    setProcessedDialogOpen(true);
  };

  const closeProcessedDialog = () => {
    setProcessedDialogOpen(false);
    setProcessedDialogMode(null);
    setPendingFormData(null);
  };

  useEffect(() => {
    if (!employeeId && employeeId !== 0) {
      setSelectedEmployee(null);
      setPayrollConfig(null);
      return;
    }

    if (Number(employeeId) === ALL_EMPLOYEES_ID) {
      setSelectedEmployee(null);
      setPayrollConfig(null);
      return;
    }

    const employee = employees.find((emp: any) => Number(emp.id) === Number(employeeId));
    const config = payrollConfigs.find(
      (c: any) => Number(c.employeeId) === Number(employeeId) && c.isActive
    );

    if (employee && config) {
      setSelectedEmployee(employee);
      setPayrollConfig(config);
    } else {
      setSelectedEmployee(null);
      setPayrollConfig(null);
    }
  }, [employeeId, employees, payrollConfigs]);

  const calculationPreview = useMemo((): PreviewView | null => {
    if (isAllEmployees) {
      if (activeConfigEmployeePairs.length === 0) return null;

      const previews = activeConfigEmployeePairs.map(({ config, employee }) =>
        buildEmployeePreview(config, employee)
      );

      const sum = (pick: (p: (typeof previews)[0]) => number) =>
        Math.round(previews.reduce((acc, p) => acc + pick(p), 0) * 100) / 100;

      const employeeRates = new Set(previews.map((p) => p.employeeRate));
      const employerRates = new Set(previews.map((p) => p.employerRate));
      const ratesMixed = employeeRates.size > 1 || employerRates.size > 1;

      return {
        mode: "all",
        employeeCount: previews.length,
        ratesMixed,
        monthlySalary: sum((p) => p.monthlySalary),
        annualSalary: sum((p) => p.annualSalary),
        allowancesTotal: sum((p) => p.allowancesTotal),
        deductionsTotal: sum((p) => p.deductionsTotal),
        grossBeforeDeductions: sum((p) => p.grossBeforeDeductions),
        grossPay: sum((p) => p.grossPay),
        employeeRate: ratesMixed ? 0 : previews[0].employeeRate,
        employerRate: ratesMixed ? 0 : previews[0].employerRate,
        employeeCpf: sum((p) => p.employeeCpf),
        employerCpf: sum((p) => p.employerCpf),
        totalCpf: sum((p) => p.totalCpf),
        netPay: sum((p) => p.netPay),
      };
    }

    if (!payrollConfig || !selectedEmployee) return null;
    const preview = buildEmployeePreview(payrollConfig, selectedEmployee);
    return {
      ...preview,
      mode: "individual",
      employeeCount: 1,
      ratesMixed: false,
    };
  }, [isAllEmployees, activeConfigEmployeePairs, payrollConfig, selectedEmployee]);

  const processPayrollMutation = useMutation({
    mutationFn: async (
      data: ProcessPayrollFormData & {
        forceOverwrite?: boolean;
        processScope?: "pending" | "changed";
      }
    ) => {
      if (Number(data.employeeId) === ALL_EMPLOYEES_ID) {
        if (activeConfigs.length === 0) {
          throw new Error("No active payroll configurations found");
        }
        const result = await batchProcessPayrollForPeriod(
          data.payPeriodStart,
          data.payPeriodEnd,
          activeConfigs.map((c: any) => Number(c.id)),
          {
            forceOverwrite: data.forceOverwrite === true,
            processScope: data.processScope,
          }
        );
        return { kind: "batch" as const, result };
      }

      if (!payrollConfig) {
        throw new Error("Please select an employee with active payroll");
      }

      const result = await processIndividualPayrollForConfig(
        payrollConfig,
        data.payPeriodStart,
        data.payPeriodEnd,
        0,
        undefined,
        { forceOverwrite: data.forceOverwrite === true }
      );

      if ("alreadyProcessed" in result && result.alreadyProcessed) {
        return {
          kind: "individual" as const,
          result: {
            alreadyProcessed: true as const,
            dataChanged: result.dataChanged === true,
          },
        };
      }

      if (!result.ok) {
        throw new Error(result.message || "Failed to process payroll");
      }

      return { kind: "individual" as const, result };
    },
    onSuccess: (payload, variables) => {
      if (payload.kind === "batch") {
        const result = payload.result;

        if ("scenario" in result && result.scenario === "pending" && result.needsPendingConfirmation) {
          openProcessedDialog(variables, "pending");
          return;
        }
        if ("needsOverwriteConfirmation" in result && result.needsOverwriteConfirmation) {
          openProcessedDialog(variables, "overwrite");
          return;
        }
        if ("scenario" in result && result.scenario === "no-changes" && !variables.forceOverwrite) {
          openProcessedDialog(variables, "no-changes");
          return;
        }

        if (!result.ok) {
          toast({
            title: "Batch processing result",
            description: result.message,
            variant: "destructive",
          });
          return;
        }

        queryClient.invalidateQueries({ queryKey: ["/api/payroll/records"] });
        queryClient.invalidateQueries({ queryKey: ["/api/payroll/configs"] });
        queryClient.invalidateQueries({ queryKey: ["/api/payroll/summary"] });
        closeProcessedDialog();
        toast({
          title: variables.forceOverwrite ? "Payroll overwritten" : "Payroll processed",
          description: `Payroll for ${derivePayrollMonthYear(variables.payPeriodStart).monthLabel} processed for all employees. Download payslips from Payroll when needed.`,
        });
        onSuccess();
        return;
      }

      const result = payload.result;
      if (result && "alreadyProcessed" in result && result.alreadyProcessed) {
        if (variables.forceOverwrite) {
          toast({
            title: "Could not overwrite",
            description: "Payroll could not be overwritten. Please try again.",
            variant: "destructive",
          });
          return;
        }
        openProcessedDialog(variables, result.dataChanged ? "overwrite" : "no-changes");
        return;
      }

      queryClient.invalidateQueries({ queryKey: ["/api/payroll/records"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payroll/configs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payroll/summary"] });
      closeProcessedDialog();
      toast({
        title: "Payroll Processed",
        description: "Payroll processed successfully. Download the payslip from Payroll when needed.",
      });
      onSuccess();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ProcessPayrollFormData) => {
    if (Number(data.employeeId) === ALL_EMPLOYEES_ID) {
      const status = resolveBatchPayrollStatus(
        activeConfigs,
        payrollRecords,
        data.payPeriodStart,
        data.payPeriodEnd
      );

      // All employees are brand-new for this period → process immediately
      if (
        status.scenario === "pending" &&
        status.changedCount === 0 &&
        status.unchangedCount === 0
      ) {
        setPendingFormData(data);
        processPayrollMutation.mutate({ ...data, processScope: "pending" });
        return;
      }

      if (status.scenario === "pending") {
        openProcessedDialog(data, "pending");
        return;
      }
      if (status.scenario === "values-changed") {
        openProcessedDialog(data, "overwrite");
        return;
      }
      openProcessedDialog(data, "no-changes");
      return;
    }

    const config = payrollConfigs.find(
      (c: any) => Number(c.employeeId) === Number(data.employeeId) && c.isActive
    );
    const existingRecord = findPayrollRecordForPeriod(
      data.employeeId,
      payrollRecords,
      data.payPeriodStart,
      data.payPeriodEnd
    );

    if (existingRecord) {
      openProcessedDialog(
        data,
        hasPayrollDataChanged(config, existingRecord, 0) ? "overwrite" : "no-changes"
      );
      return;
    }

    setPendingFormData(data);
    processPayrollMutation.mutate(data);
  };

  const handleProcessClick = () => {
    const values = form.getValues();

    if (!isPayPeriodEligibleForProcessing(values.payPeriodStart, values.payPeriodEnd)) {
      toast({
        title: "Payroll not allowed",
        description: PAYROLL_CURRENT_MONTH_ERROR,
        variant: "destructive",
      });
      return;
    }

    if (values.employeeId === undefined || values.employeeId === null || Number.isNaN(Number(values.employeeId))) {
      toast({
        title: "Employee required",
        description: "Please select an employee or All Employees.",
        variant: "destructive",
      });
      return;
    }

    if (!calculationPreview) {
      toast({
        title: "Payroll not calculated",
        description: isAllEmployees
          ? "No active payroll configurations found for employees."
          : "Please select an employee to calculate payroll first.",
        variant: "destructive",
      });
      return;
    }

    form.handleSubmit(onSubmit)();
  };

  const handleConfirmOverwrite = () => {
    const formData = pendingFormData ?? form.getValues();
    if (formData?.employeeId === undefined || formData?.employeeId === null) {
      toast({
        title: "Error",
        description: "Form data is unavailable. Please close the dialog and try again.",
        variant: "destructive",
      });
      return;
    }

    if (Number(formData.employeeId) === ALL_EMPLOYEES_ID) {
      if (processedDialogMode === "pending") {
        processPayrollMutation.mutate({ ...formData, processScope: "pending" });
        return;
      }
      processPayrollMutation.mutate({ ...formData, forceOverwrite: true });
      return;
    }

    processPayrollMutation.mutate({ ...formData, forceOverwrite: true });
  };

  const isSubmitDisabled = processPayrollMutation.isPending || !calculationPreview;

  if (configsLoading || employeesLoading) {
    return (
      <div className="flex justify-center py-16 text-sm text-[#6B7280]">
        Loading payroll data...
      </div>
    );
  }

  const processEmployeeOptions = [
    {
      id: ALL_EMPLOYEES_ID,
      name: "All Employees",
      employeeId: `${activeConfigEmployeePairs.length} active`,
      designation: "Process payroll for everyone",
    },
    ...activeConfigEmployeePairs.map(({ config, employee }) => ({
      id: Number(config.employeeId),
      name: employee.name,
      employeeId: employee.employeeId,
      designation: `${employee.designation || ""} (${formatCurrency(parseFloat(config.baseSalary))}/month)`.trim(),
      department: employee.department,
    })),
  ];

  const rateEmployeeLabel = calculationPreview?.ratesMixed
    ? "—"
    : `${calculationPreview?.employeeRate ?? 0}%`;
  const rateEmployerLabel = calculationPreview?.ratesMixed
    ? "—"
    : `${calculationPreview?.employerRate ?? 0}%`;

  return (
    <>
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2 min-w-0 max-w-2xl">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              <section className="space-y-4">
                <ModalSectionHeader icon={User} title="Employee & Pay Period" />
                <div className="space-y-4 max-w-2xl">
                  <FormField
                    control={form.control}
                    name="employeeId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className={payrollFormLabelClass}>Employee *</FormLabel>
                        <FormControl>
                          <EmployeeCombobox
                            employees={processEmployeeOptions}
                            value={field.value}
                            onChange={(id) => field.onChange(id)}
                            placeholder="Select employee or All Employees"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-1 items-start gap-x-6 gap-y-4 md:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="payPeriodStart"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className={payrollFormLabelClass}>Pay Period Start *</FormLabel>
                          <FormControl>
                            <StringDatePicker
                              value={field.value ?? ""}
                              onChange={(v) => applyPayPeriodMonth(v ?? "", form.setValue)}
                              disabledDate={isPayPeriodDateDisabled}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="payPeriodEnd"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className={payrollFormLabelClass}>Pay Period End *</FormLabel>
                          <FormControl>
                            <StringDatePicker
                              value={field.value ?? ""}
                              onChange={(v) => applyPayPeriodMonth(v ?? "", form.setValue)}
                              disabledDate={isPayPeriodDateDisabled}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              </section>

              <div className="flex justify-end gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onCancel}
                  className={payrollCancelButtonClass}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={isSubmitDisabled}
                  onClick={handleProcessClick}
                  className={payrollPrimaryButtonClass}
                >
                  {processPayrollMutation.isPending
                    ? "Processing..."
                    : isAllEmployees
                      ? "Process All Employees"
                      : "Process Payroll"}
                </Button>
              </div>
            </form>
          </Form>
        </div>

        <div className="lg:col-span-1">
          <div className="sticky top-4 rounded-lg border border-[#E5E7EB] bg-[#FAFAFA] p-5">
            <h3 className="mb-1 flex items-center gap-2 text-base font-semibold text-[#111827]">
              <Calculator className="h-4 w-4 text-[#2563EB]" />
              Singapore Payroll Calculation
            </h3>
            {calculationPreview?.mode === "all" ? (
              <p className="mb-4 text-xs text-[#6B7280]">
                Combined totals for {calculationPreview.employeeCount} employees
              </p>
            ) : (
              <div className="mb-4" />
            )}
            {calculationPreview ? (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-[#6B7280]">Monthly Salary</span>
                  <span className="font-medium text-[#111827]">
                    {formatCurrency(calculationPreview.monthlySalary)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#6B7280]">Allowances</span>
                  <span className="font-medium text-[#111827]">
                    {formatCurrency(calculationPreview.allowancesTotal)}
                  </span>
                </div>
                <div className="flex justify-between border-t border-[#E5E7EB] pt-2">
                  <span className="font-semibold text-[#111827]">Gross Salary</span>
                  <span className="font-semibold text-[#111827]">
                    {formatCurrency(calculationPreview.grossPay)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#6B7280]">CPF Rate (Employee)</span>
                  <span className="text-[#111827]">{rateEmployeeLabel}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#6B7280]">CPF Amount (Employee)</span>
                  <span className="font-medium text-[#DC2626]">
                    -{formatCurrency(calculationPreview.employeeCpf)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#6B7280]">CPF Rate (Employer)</span>
                  <span className="text-[#111827]">{rateEmployerLabel}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#6B7280]">CPF Amount (Employer)</span>
                  <span className="font-medium text-[#111827]">
                    {formatCurrency(calculationPreview.employerCpf)}
                  </span>
                </div>
                <div className="flex justify-between border-t border-[#E5E7EB] pt-2">
                  <span className="text-[#6B7280]">Total Deductions</span>
                  <span className="font-medium text-[#DC2626]">
                    -
                    {formatCurrency(
                      calculationPreview.deductionsTotal + calculationPreview.employeeCpf
                    )}
                  </span>
                </div>
                <div className="flex justify-between border-t border-[#E5E7EB] pt-3">
                  <span className="text-base font-semibold text-[#111827]">
                    {calculationPreview.mode === "all" ? "Total Net Salary" : "Net Salary"}
                  </span>
                  <span className="text-lg font-bold text-[#16A34A]">
                    {formatCurrency(calculationPreview.netPay)}
                  </span>
                </div>
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-[#6B7280]">
                Select an employee or All Employees to view payroll calculation
              </p>
            )}
          </div>
        </div>
      </div>

      <Dialog
        open={processedDialogOpen}
        onOpenChange={(open) => {
          if (!open) closeProcessedDialog();
          else setProcessedDialogOpen(true);
        }}
      >
        <DialogContent className="max-w-md border border-gray-200 bg-white">
          <DialogHeader>
            <DialogTitle className="text-gray-900">
              {processedDialogMode === "pending"
                ? "Process Remaining Employees"
                : "Payroll Already Processed"}
            </DialogTitle>
            <div className="space-y-2 pt-2 text-sm text-gray-600">
              {processedDialogMode === "pending" ? (
                <p>
                  Payroll for{" "}
                  <span className="font-semibold text-gray-900">{dialogMonthLabel}</span> is not
                  processed for some employees. Do you want to process payroll for all pending
                  employees?
                </p>
              ) : (
                <>
                  <p>
                    Payroll for{" "}
                    <span className="font-semibold text-gray-900">{dialogMonthLabel}</span> has
                    already been processed
                    {isAllEmployees || Number(pendingFormData?.employeeId) === ALL_EMPLOYEES_ID
                      ? " for one or more employees"
                      : ""}
                    .
                  </p>
                  {processedDialogMode === "overwrite" ? (
                    <>
                      <p>The payroll values have been modified.</p>
                      <p>Do you want to overwrite the existing payroll for this period?</p>
                    </>
                  ) : (
                    <p>There are no changes to process.</p>
                  )}
                </>
              )}
            </div>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            {processedDialogMode === "overwrite" || processedDialogMode === "pending" ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={closeProcessedDialog}
                  className={payrollCancelButtonClass}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  className={payrollPrimaryButtonClass}
                  onClick={handleConfirmOverwrite}
                  disabled={processPayrollMutation.isPending}
                >
                  {processPayrollMutation.isPending ? "Processing..." : "Yes, Proceed"}
                </Button>
              </>
            ) : (
              <Button
                type="button"
                variant="outline"
                onClick={closeProcessedDialog}
                className={payrollCancelButtonClass}
              >
                Cancel
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
