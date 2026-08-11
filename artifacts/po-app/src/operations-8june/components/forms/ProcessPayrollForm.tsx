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
import { Input } from "@/components/ui/input";
import { StringDatePicker } from "@/operations-8june/components/ui/date-picker";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/operations-8june/lib/queryClient";
import { calculateSyncBridgePayrollPreview } from "@/operations-8june/lib/payroll-utils";
import {
  processIndividualPayrollForConfig,
  findPayrollRecordForPeriod,
  hasPayrollDataChanged,
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
import { Calculator, Clock, User } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const processPayrollSchema = z.object({
  employeeId: z.coerce.number().min(1, "Please select an employee"),
  payPeriodStart: z.string().min(1, "Start date is required"),
  payPeriodEnd: z.string().min(1, "End date is required"),
  overtimeHours: z.coerce.number().min(0).optional(),
  notes: z.string().optional(),
});

type ProcessPayrollFormData = z.infer<typeof processPayrollSchema>;

interface ProcessPayrollFormProps {
  onSuccess: () => void;
  onCancel: () => void;
}

type ProcessedDialogMode = "overwrite" | "no-changes" | null;

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
      overtimeHours: undefined,
      ...getLastCompletedPayPeriod(),
    },
  });

  const employeeId = form.watch("employeeId");
  const overtimeHours = Number(form.watch("overtimeHours") || 0);
  const payPeriodStart = form.watch("payPeriodStart");
  const payPeriodEnd = form.watch("payPeriodEnd");
  const dialogPayPeriodStart = pendingFormData?.payPeriodStart ?? payPeriodStart;
  const dialogMonthLabel = derivePayrollMonthYear(dialogPayPeriodStart).monthLabel;

  const openProcessedDialog = (data: ProcessPayrollFormData, dataChanged: boolean) => {
    setPendingFormData(data);
    setProcessedDialogMode(dataChanged ? "overwrite" : "no-changes");
    setProcessedDialogOpen(true);
  };

  const closeProcessedDialog = () => {
    setProcessedDialogOpen(false);
    setProcessedDialogMode(null);
    setPendingFormData(null);
  };

  const resolvePayrollChangeStatus = (data: ProcessPayrollFormData) => {
    const config = payrollConfigs.find(
      (c: any) => Number(c.employeeId) === Number(data.employeeId) && c.isActive
    );
    const existingRecord = findPayrollRecordForPeriod(
      data.employeeId,
      payrollRecords,
      data.payPeriodStart,
      data.payPeriodEnd
    );

    if (!existingRecord) {
      return { alreadyProcessed: false, dataChanged: false };
    }

    return {
      alreadyProcessed: true,
      dataChanged: hasPayrollDataChanged(config, existingRecord, Number(data.overtimeHours) || 0),
    };
  };

  useEffect(() => {
    if (!employeeId) {
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

  const calculationPreview = useMemo(() => {
    if (!payrollConfig || !selectedEmployee) return null;

    const baseSalary = parseFloat(payrollConfig.baseSalary) || 0;
    const allowances = payrollConfig.allowances || {};
    const deductions = payrollConfig.deductions || {};
    const overtimeRate = parseFloat(payrollConfig.overtimeRate || "0") || 0;
    const overtimePay = overtimeHours * overtimeRate;
    const dob = selectedEmployee.dateOfBirth
      ? new Date(selectedEmployee.dateOfBirth)
      : null;
    const age = dob && !Number.isNaN(dob.getTime()) ? calculateAge(dob) : 30;

    const preview = calculateSyncBridgePayrollPreview({
      monthlySalary: baseSalary,
      age,
      citizenshipStatus: mapNationalityToCitizenship(selectedEmployee.nationality),
      prStatus: selectedEmployee.prStatus,
      overtimePay,
      allowances,
      deductions,
    });

    return { ...preview, monthlySalary: baseSalary };
  }, [payrollConfig, selectedEmployee, overtimeHours]);

  const processPayrollMutation = useMutation({
    mutationFn: async (data: ProcessPayrollFormData & { forceOverwrite?: boolean }) => {
      if (!calculationPreview || !payrollConfig) {
        throw new Error("Please select an employee with an active payroll configuration");
      }

      const result = await processIndividualPayrollForConfig(
        payrollConfig,
        data.payPeriodStart,
        data.payPeriodEnd,
        data.overtimeHours || 0,
        data.notes,
        { forceOverwrite: data.forceOverwrite === true }
      );

      if ("alreadyProcessed" in result && result.alreadyProcessed) {
        return {
          alreadyProcessed: true as const,
          dataChanged: result.dataChanged === true,
        };
      }

      if (!result.ok) {
        throw new Error(result.message || "Failed to process payroll");
      }

      return result;
    },
    onSuccess: (result, variables) => {
      if (result && "alreadyProcessed" in result && result.alreadyProcessed) {
        if (variables.forceOverwrite) {
          toast({
            title: "Overwrite failed",
            description: "Could not regenerate the payslip. Please try again.",
            variant: "destructive",
          });
          return;
        }

        const formData = pendingFormData ?? variables;
        openProcessedDialog(formData, result.dataChanged === true);
        return;
      }

      queryClient.invalidateQueries({ queryKey: ["/api/payroll-records"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payroll/records"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payroll/summary"] });
      closeProcessedDialog();
      const wasUpdated = "action" in result && result.action === "updated";
      toast({
        title: wasUpdated ? "Payroll Updated Successfully" : "Payroll Processed Successfully",
        description: wasUpdated
          ? "The payslip has been regenerated and downloaded successfully."
          : "Payroll saved and payslip downloaded automatically.",
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
    const { alreadyProcessed, dataChanged } = resolvePayrollChangeStatus(data);

    if (alreadyProcessed) {
      openProcessedDialog(data, dataChanged);
      return;
    }

    setPendingFormData(data);
    processPayrollMutation.mutate(data);
  };

  const handleProcessClick = () => {
    const { payPeriodStart, payPeriodEnd } = form.getValues();

    if (!isPayPeriodEligibleForProcessing(payPeriodStart, payPeriodEnd)) {
      toast({
        title: "Payroll not allowed",
        description: PAYROLL_CURRENT_MONTH_ERROR,
        variant: "destructive",
      });
      return;
    }

    if (!calculationPreview) {
      toast({
        title: "Payroll not calculated",
        description: "Please select an employee to calculate payroll first.",
        variant: "destructive",
      });
      return;
    }

    form.handleSubmit(onSubmit)();
  };

  const handleConfirmOverwrite = () => {
    const formData = pendingFormData ?? form.getValues();
    if (!formData?.employeeId) {
      toast({
        title: "Error",
        description: "Form data is unavailable. Please close the dialog and try again.",
        variant: "destructive",
      });
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

  const activeConfigs = payrollConfigs.filter((c: any) => c.isActive);
  const processEmployeeOptions = activeConfigs
    .map((config: any) => {
      const employee = employees.find(
        (emp: any) => Number(emp.id) === Number(config.employeeId)
      );
      if (!employee) return null;
      return {
        id: Number(config.employeeId),
        name: employee.name,
        employeeId: employee.employeeId,
        designation: `${employee.designation || ""} (${formatCurrency(parseFloat(config.baseSalary))}/month)`.trim(),
        department: employee.department,
      };
    })
    .filter(Boolean) as Array<{
      id: number;
      name: string;
      employeeId: string;
      designation: string;
      department?: string;
    }>;

  return (
    <>
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              <section className="space-y-4">
                <ModalSectionHeader icon={User} title="Employee & Pay Period" />
                <div className="space-y-4">
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
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-1 items-start gap-x-6 gap-y-4 lg:grid-cols-2">
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

              <section className="space-y-4">
                <ModalSectionHeader icon={Clock} title="Additional Hours & Adjustments" />
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="overtimeHours"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className={payrollFormLabelClass}>
                          Overtime Hours (Max 72 hours/month per MOM)
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="text"
                            inputMode="decimal"
                            placeholder=""
                            value={field.value ?? ""}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v !== "" && !/^\d*\.?\d*$/.test(v)) return;
                              field.onChange(v === "" ? undefined : parseFloat(v));
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className={payrollFormLabelClass}>Notes (Optional)</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Add any notes or remarks for this payroll period..."
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
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
                  {processPayrollMutation.isPending ? "Processing..." : "Process Payroll"}
                </Button>
              </div>
            </form>
          </Form>
        </div>

        <div className="lg:col-span-1">
          <div className="sticky top-4 rounded-lg border border-[#E5E7EB] bg-[#FAFAFA] p-5">
            <h3 className="mb-4 flex items-center gap-2 text-base font-semibold text-[#111827]">
              <Calculator className="h-4 w-4 text-[#2563EB]" />
              Singapore Payroll Calculation
            </h3>
            {calculationPreview ? (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-[#6B7280]">Monthly Salary</span>
                  <span className="font-medium text-[#111827]">
                    {formatCurrency(calculationPreview.monthlySalary)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#6B7280]">Allowance</span>
                  <span className="font-medium text-[#111827]">
                    {formatCurrency(calculationPreview.allowancesTotal)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#6B7280]">Deductions</span>
                  <span className="font-medium text-[#DC2626]">
                    -{formatCurrency(calculationPreview.deductionsTotal)}
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
                  <span className="text-[#111827]">{calculationPreview.employeeRate}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#6B7280]">CPF Amount (Employee)</span>
                  <span className="font-medium text-[#DC2626]">
                    -{formatCurrency(calculationPreview.employeeCpf)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#6B7280]">CPF Rate (Employer)</span>
                  <span className="text-[#111827]">{calculationPreview.employerRate}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#6B7280]">CPF Amount (Employer)</span>
                  <span className="font-medium text-[#111827]">
                    {formatCurrency(calculationPreview.employerCpf)}
                  </span>
                </div>
                <div className="flex justify-between border-t border-[#E5E7EB] pt-3">
                  <span className="text-base font-semibold text-[#111827]">Net Salary</span>
                  <span className="text-lg font-bold text-[#16A34A]">
                    {formatCurrency(calculationPreview.netPay)}
                  </span>
                </div>
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-[#6B7280]">
                Select an employee to view payroll calculation
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
            <DialogTitle className="text-gray-900">Payroll Already Processed</DialogTitle>
            <div className="space-y-2 pt-2 text-sm text-gray-600">
              <p>
                Payroll for{" "}
                <span className="font-semibold text-gray-900">{dialogMonthLabel}</span> has already
                been processed.
              </p>
              {processedDialogMode === "overwrite" ? (
                <>
                  <p>The payroll values have been modified.</p>
                  <p>Do you want to overwrite the existing payslip and regenerate it?</p>
                </>
              ) : (
                <p>There are no changes to process.</p>
              )}
            </div>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            {processedDialogMode === "overwrite" ? (
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
