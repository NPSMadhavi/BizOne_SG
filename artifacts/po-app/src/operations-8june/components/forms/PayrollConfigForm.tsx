import { useEffect, useMemo } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/operations-8june/lib/queryClient";
import { insertEmployeePayrollSchema } from "@shared/schema";
import {
  Calculator,
  DollarSign,
  MinusCircle,
  User,
  Wallet,
  IdCard,
} from "lucide-react";
import { ModalSectionHeader } from "@/operations-8june/components/forms/FormModalShell";
import { EmployeeCombobox } from "@/operations-8june/components/forms/EmployeeCombobox";
import { TooltipProvider } from "@/components/ui/tooltip";
import { calculateSyncBridgePayrollPreview, CPF_WAGE_CEILING } from "@/operations-8june/lib/payroll-utils";
import {
  payrollCancelButtonClass,
  payrollPrimaryButtonClass,
} from "@/operations-8june/lib/payroll-ui";

const optionalAmount = z.preprocess((val) => {
  if (val === "" || val === null || val === undefined) return undefined;
  const num = Number(val);
  return Number.isNaN(num) ? undefined : num;
}, z.number().optional());

const payrollConfigSchema = insertEmployeePayrollSchema
  .omit({ tenantId: true, tenantSlug: true, createdBy: true })
  .extend({
  baseSalary: z.coerce.number().min(1, "Basic salary is required"),
  hourlyRate: optionalAmount,
  overtimeRate: optionalAmount,
  citizenshipStatus: z.enum(["citizen", "pr", "foreigner"]),
  citizenshipDisplay: z.string().optional(),
  age: z.coerce.number().min(16, "Employee must be at least 16 years old"),
  dateOfBirth: z.string().min(1, "Date of birth is required"),
  workingDays: optionalAmount,
  allowanceTransport: optionalAmount,
  allowanceMeal: optionalAmount,
  allowancePhone: optionalAmount,
  allowanceOthers: optionalAmount,
  deductionMedical: optionalAmount,
  deductionAdvance: optionalAmount,
  deductionOthers: optionalAmount,
});

type PayrollConfigFormData = z.infer<typeof payrollConfigSchema>;

interface PayrollConfigFormProps {
  onSuccess: () => void;
  onCancel: () => void;
  editData?: any;
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

function formatCitizenshipDisplay(employee: any): string {
  if (employee?.nationality === "PR") {
    if (employee?.prStatus === "1 Year") return "PR — 1";
    if (employee?.prStatus === "2 Years") return "PR — 2";
    if (employee?.prStatus === "3 Years and Above") return "PR — 3+";
    return "PR";
  }
  if (employee?.nationality === "Singapore") return "Singapore Citizen";
  if (employee?.nationality === "Foreigner") return "Foreigner";
  return employee?.nationality || "";
}

function formatNationalityDisplay(employee: any): string {
  if (employee?.nationality === "PR" && employee?.prStatus) {
    if (employee.prStatus === "1 Year") return "PR (1 Year)";
    if (employee.prStatus === "2 Years") return "PR (2 Year)";
    if (employee.prStatus === "3 Years and Above") return "PR (3+ Year)";
  }
  return employee?.nationality || "—";
}

function formatPrStatusDisplay(prStatus?: string): string {
  if (!prStatus) return "—";
  if (prStatus === "1 Year") return "1 Year PR";
  if (prStatus === "2 Years") return "2 Year PR";
  if (prStatus === "3 Years and Above") return "3+ Year PR";
  return prStatus;
}

function formatDisplayDate(value?: string | Date | null): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB");
}

function toDateInputValue(value?: string | Date | null): string {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().split("T")[0];
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
  }).format(amount || 0);
}

/** Monthly CPF ordinary wage: Basic × (working days / 30). Full basic if days not set. */
const CPF_STANDARD_MONTH_DAYS = 30;

function calcBasicSalaryForCpf(
  baseSalary: number,
  workingDays?: number | null
): number {
  const base = Number(baseSalary) || 0;
  if (base <= 0) return 0;
  const days = Number(workingDays);
  if (!Number.isFinite(days) || days <= 0) return Math.round(base * 100) / 100;
  const prorated =
    (base * Math.min(days, CPF_STANDARD_MONTH_DAYS)) / CPF_STANDARD_MONTH_DAYS;
  return Math.round(prorated * 100) / 100;
}

function formatRatePercent(rate: number): string {
  return `${rate}%`;
}

const formLabelClass = "text-sm font-medium text-[#111827]";
const readOnlyInputClass = "bg-[#F9FAFB] text-[#111827]";

function OptionalAmountInput({
  field,
  placeholder = "",
}: {
  field: { value?: number; onChange: (value: number | undefined) => void; onBlur: () => void; name: string; ref: React.Ref<HTMLInputElement> };
  placeholder?: string;
}) {
  return (
    <Input
      type="text"
      inputMode="decimal"
      placeholder={placeholder}
      value={field.value === undefined || field.value === null ? "" : field.value}
      onChange={(e) => {
        const v = e.target.value;
        if (v !== "" && !/^\d*\.?\d*$/.test(v)) return;
        field.onChange(v === "" ? undefined : Number(v));
      }}
      onBlur={field.onBlur}
      name={field.name}
      ref={field.ref}
    />
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-[#2563EB]">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-[#111827]">{value}</p>
    </div>
  );
}

function mapConfigToFormValues(config: any): Partial<PayrollConfigFormData> {
  if (!config) return {};
  const allowances = config.allowances || {};
  const deductions = config.deductions || {};
  const toNum = (val: unknown) =>
    val != null && val !== "" ? Number(val) : undefined;
  return {
    employeeId: Number(config.employeeId) || undefined,
    baseSalary: Number(config.baseSalary) || undefined,
    payrollPeriod: config.payrollPeriod || "monthly",
    hourlyRate: toNum(config.hourlyRate),
    overtimeRate: toNum(config.overtimeRate),
    allowanceTransport: toNum(allowances.transport),
    allowanceMeal: toNum(allowances.meal),
    allowancePhone: toNum(allowances.phone),
    allowanceOthers: toNum(allowances.others),
    deductionMedical: toNum(deductions.medical),
    deductionAdvance: toNum(deductions.advance),
    deductionOthers: toNum(deductions.others),
    workingDays: toNum(config.noOfWorkingDays),
    isActive: config.isActive ?? true,
    effectiveFrom: config.effectiveFrom
      ? String(config.effectiveFrom).split("T")[0]
      : new Date().toISOString().split("T")[0],
    effectiveTo: config.effectiveTo ? String(config.effectiveTo).split("T")[0] : undefined,
  };
}

function buildPayrollConfigPayload(
  data: PayrollConfigFormData,
  selectedEmployee: any,
  citizenshipStatus: string,
  age: number
) {
  const {
    age: _age,
    citizenshipStatus: _citizenshipStatus,
    citizenshipDisplay,
    dateOfBirth,
    workingDays,
    allowanceTransport,
    allowanceMeal,
    allowancePhone,
    allowanceOthers,
    deductionMedical,
    deductionAdvance,
    deductionOthers,
    ...payrollData
  } = data;

  const allowances = {
    transport: allowanceTransport || 0,
    meal: allowanceMeal || 0,
    phone: allowancePhone || 0,
    others: allowanceOthers || 0,
  };

  const deductions = {
    medical: deductionMedical || 0,
    advance: deductionAdvance || 0,
    others: deductionOthers || 0,
  };

  const calculation = calculateSyncBridgePayrollPreview({
    monthlySalary: calcBasicSalaryForCpf(
      Number(payrollData.baseSalary) || 0,
      workingDays != null ? Number(workingDays) : undefined
    ),
    age,
    citizenshipStatus: citizenshipStatus as "citizen" | "pr" | "foreigner",
    prStatus: selectedEmployee?.prStatus,
    allowances,
    deductions,
  });

  return {
    ...payrollData,
    baseSalary: String(payrollData.baseSalary),
    hourlyRate:
      payrollData.hourlyRate != null ? String(payrollData.hourlyRate) : undefined,
    overtimeRate:
      payrollData.overtimeRate != null ? String(payrollData.overtimeRate) : undefined,
    effectiveTo: payrollData.effectiveTo || undefined,
    noOfWorkingDays: workingDays != null ? Number(workingDays) : undefined,
    allowances,
    deductions,
    cpfRate: String(calculation.employeeRate),
    cpfAmount: String(calculation.employeeCpf),
    employerCpfRate: String(calculation.employerRate),
    employerCpfAmount: String(calculation.employerCpf),
    netSalary: String(calculation.netPay),
    taxRate: getTaxRateStatic(Number(data.baseSalary) * 12),
  };
}

function getTaxRateStatic(annualSalary: number): string {
  if (annualSalary <= 20000) return "0.00";
  if (annualSalary <= 30000) return "2.00";
  if (annualSalary <= 40000) return "3.50";
  if (annualSalary <= 80000) return "7.00";
  if (annualSalary <= 120000) return "11.50";
  if (annualSalary <= 160000) return "15.00";
  if (annualSalary <= 200000) return "18.00";
  return "22.00";
}

export default function PayrollConfigForm({ onSuccess, onCancel, editData }: PayrollConfigFormProps) {
  const { toast } = useToast();

  const { data: employees = [], isLoading: employeesLoading } = useQuery<any[]>({
    queryKey: ["/api/employees"],
  });

  const employeeOptions = useMemo(() => {
    const options = [...employees];
    if (editData?.employeeId) {
      const editEmployeeId = Number(editData.employeeId);
      const alreadyListed = options.some((employee) => Number(employee.id) === editEmployeeId);
      if (!alreadyListed) {
        options.unshift({
          id: editEmployeeId,
          employeeId: editData.employeeCode ?? editData.employeeId,
          name: editData.employeeName ?? "Selected employee",
          department: editData.department ?? "",
          designation: editData.designation ?? "",
          nationality: editData.nationality,
          prStatus: editData.prStatus,
          salary: editData.baseSalary,
          annualSalary: String((Number(editData.baseSalary) || 0) * 12),
        });
      }
    }
    return options;
  }, [employees, editData]);

  const form = useForm<PayrollConfigFormData>({
    resolver: zodResolver(payrollConfigSchema),
    defaultValues: {
      payrollPeriod: "monthly",
      citizenshipStatus: "citizen",
      citizenshipDisplay: "",
      dateOfBirth: "",
      isActive: true,
      effectiveFrom: new Date().toISOString().split("T")[0],
    },
  });

  const isEditMode = Boolean(editData?.id);

  const selectedEmployeeId = form.watch("employeeId");
  const selectedEmployee = useMemo(
    () =>
      employeeOptions.find(
        (employee) => Number(employee.id) === Number(selectedEmployeeId)
      ),
    [employeeOptions, selectedEmployeeId]
  );

  const baseSalary = Number(form.watch("baseSalary") || 0);
  const workingDaysRaw = form.watch("workingDays");
  const basicSalaryForCpf = calcBasicSalaryForCpf(baseSalary, workingDaysRaw);
  const annualSalaryAuto = baseSalary * 12;
  const age = Number(form.watch("age") || 0);
  const citizenshipStatus = form.watch("citizenshipStatus");
  const allowanceTransport = Number(form.watch("allowanceTransport") || 0);
  const allowanceMeal = Number(form.watch("allowanceMeal") || 0);
  const allowancePhone = Number(form.watch("allowancePhone") || 0);
  const allowanceOthers = Number(form.watch("allowanceOthers") || 0);
  const deductionMedical = Number(form.watch("deductionMedical") || 0);
  const deductionAdvance = Number(form.watch("deductionAdvance") || 0);
  const deductionOthers = Number(form.watch("deductionOthers") || 0);

  const calculationPreview = useMemo(() => {
    if (!baseSalary || !age) return null;

    return calculateSyncBridgePayrollPreview({
      monthlySalary: basicSalaryForCpf,
      age,
      citizenshipStatus,
      prStatus: selectedEmployee?.prStatus,
      allowances: {
        transport: allowanceTransport,
        meal: allowanceMeal,
        phone: allowancePhone,
        others: allowanceOthers,
      },
      deductions: {
        medical: deductionMedical,
        advance: deductionAdvance,
        others: deductionOthers,
      },
    });
  }, [
    baseSalary,
    basicSalaryForCpf,
    age,
    citizenshipStatus,
    selectedEmployee?.prStatus,
    allowanceTransport,
    allowanceMeal,
    allowancePhone,
    allowanceOthers,
    deductionMedical,
    deductionAdvance,
    deductionOthers,
  ]);
  const populateFromEmployee = (employee: any) => {
    const dob = employee?.dateOfBirth ? new Date(employee.dateOfBirth) : null;
    const monthlySalary = parseFloat(employee?.salary || "0") || 0;

    if (dob) {
      form.setValue("age", calculateAge(dob));
      form.setValue("dateOfBirth", toDateInputValue(dob));
    } else {
      form.setValue("dateOfBirth", "");
    }
    form.setValue("citizenshipStatus", mapNationalityToCitizenship(employee?.nationality));
    form.setValue("citizenshipDisplay", formatCitizenshipDisplay(employee));
    if (monthlySalary > 0) {
      form.setValue("baseSalary", monthlySalary);
    }
  };

  useEffect(() => {
    if (!isEditMode || !editData) return;
    const employee = employeeOptions.find(
      (e) => Number(e.id) === Number(editData.employeeId)
    );
    const mapped = mapConfigToFormValues(editData);
    const dob = employee?.dateOfBirth ? new Date(employee.dateOfBirth) : null;

    form.reset({
      payrollPeriod: "monthly",
      citizenshipStatus: employee
        ? mapNationalityToCitizenship(employee.nationality)
        : "citizen",
      citizenshipDisplay: employee ? formatCitizenshipDisplay(employee) : "",
      dateOfBirth: dob ? toDateInputValue(dob) : "",
      age: dob ? calculateAge(dob) : undefined,
      isActive: true,
      effectiveFrom: new Date().toISOString().split("T")[0],
      ...mapped,
      employeeId: Number(editData.employeeId),
    } as PayrollConfigFormData);
  }, [isEditMode, editData, employeeOptions, form]);

  useEffect(() => {
    if (isEditMode || !selectedEmployee) return;
    populateFromEmployee(selectedEmployee);
  }, [selectedEmployee?.id, isEditMode]);

  const savePayrollConfigMutation = useMutation({
    mutationFn: async (data: PayrollConfigFormData) => {
      const payload = buildPayrollConfigPayload(
        data,
        selectedEmployee,
        data.citizenshipStatus,
        data.age
      );

      const res = editData?.id
        ? await apiRequest("PUT", `/api/employee-payroll/${editData.id}`, payload)
        : await apiRequest("POST", "/api/employee-payroll", payload);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employee-payroll"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payroll/configs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payroll/summary"] });
      toast({
        title: "Success",
        description: editData?.id
          ? "Payroll updated successfully"
          : "Payroll created successfully",
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

  const onSubmit = (data: PayrollConfigFormData) => {
    savePayrollConfigMutation.mutate(data);
  };

  const hasPayrollPreview = Boolean(baseSalary && age);

  const allowancesTotal = calculationPreview?.allowancesTotal ?? 0;
  const deductionsTotal = calculationPreview?.deductionsTotal ?? 0;
  const grossSalary =
    calculationPreview?.grossPay ??
    (hasPayrollPreview ? baseSalary + allowancesTotal : 0);
  const employeeCpf = calculationPreview?.employeeCpf ?? 0;
  const employerCpf = calculationPreview?.employerCpf ?? 0;
  const totalCpf = calculationPreview?.totalCpf ?? 0;
  const employeeCpfRate = calculationPreview?.employeeRate ?? 0;
  const employerCpfRate = calculationPreview?.employerRate ?? 0;
  const netSalary =
    calculationPreview?.netPay ??
    (hasPayrollPreview ? baseSalary + allowancesTotal - deductionsTotal - employeeCpf : 0);

  return (
    <TooltipProvider>
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,42rem)_minmax(0,18rem)] lg:items-start">
        <div className="min-w-0 max-w-2xl">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              <section className="space-y-4">
                <ModalSectionHeader icon={User} title="Employee Selection" />
                <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="employeeId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className={formLabelClass}>Employee *</FormLabel>
                      {isEditMode ? (
                        <FormControl>
                          <Input
                            readOnly
                            value={
                              selectedEmployee
                                ? `${selectedEmployee.name} (${selectedEmployee.employeeId}) — ${selectedEmployee.designation}`
                                : editData?.employeeName
                                  ? `${editData.employeeName} — ${editData.designation ?? ""}`
                                  : "Selected employee"
                            }
                          />
                        </FormControl>
                      ) : (
                        <FormControl>
                          <EmployeeCombobox
                            employees={employeeOptions}
                            value={field.value}
                            onChange={(id) => field.onChange(id)}
                            disabled={employeesLoading}
                            loading={employeesLoading}
                          />
                        </FormControl>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {selectedEmployee && (
                  <div className="rounded-lg border border-[#BFDBFE] bg-[#EFF6FF] p-4">
                    <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                      <InfoItem label="Employee ID" value={selectedEmployee.employeeId || "—"} />
                      <InfoItem label="Employee Name" value={selectedEmployee.name || "—"} />
                      <InfoItem label="Department" value={selectedEmployee.department || "—"} />
                      <InfoItem label="Designation" value={selectedEmployee.designation || "—"} />
                      <InfoItem
                        label="Basic Salary"
                        value={formatCurrency(parseFloat(selectedEmployee.salary || "0"))}
                      />
                      <InfoItem
                        label="Annual Salary"
                        value={formatCurrency(
                          parseFloat(selectedEmployee.annualSalary || "0") ||
                            (parseFloat(selectedEmployee.salary || "0") || 0) * 12
                        )}
                      />
                      <InfoItem label="Nationality" value={formatNationalityDisplay(selectedEmployee)} />
                      <InfoItem label="PR Status" value={formatPrStatusDisplay(selectedEmployee.prStatus)} />
                      <InfoItem
                        label="Date of Birth"
                        value={formatDisplayDate(selectedEmployee.dateOfBirth)}
                      />
                      <InfoItem
                        label="Age"
                        value={
                          selectedEmployee.dateOfBirth
                            ? String(calculateAge(new Date(selectedEmployee.dateOfBirth)))
                            : String(form.watch("age") || "—")
                        }
                      />
                    </div>
                  </div>
                )}
              </div>
            </section>

            <section className="space-y-4">
              <ModalSectionHeader icon={DollarSign} title="Payheads" />
              <div className="grid grid-cols-1 items-start gap-x-6 gap-y-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="baseSalary"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className={formLabelClass}>Basic Salary (SGD) *</FormLabel>
                      <FormControl>
                        <Input
                          type="text"
                          inputMode="decimal"
                          placeholder=""
                          value={field.value ?? ""}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (v !== "" && !/^\d*\.?\d*$/.test(v)) return;
                            field.onChange(v === "" ? undefined : Number(v));
                          }}
                          onBlur={field.onBlur}
                          name={field.name}
                          ref={field.ref}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormItem>
                  <FormLabel className={formLabelClass}>Annual Salary</FormLabel>
                  <FormControl>
                    <Input
                      readOnly
                      placeholder=""
                      value={baseSalary ? formatCurrency(annualSalaryAuto) : ""}
                      className={readOnlyInputClass}
                    />
                  </FormControl>
                </FormItem>
                <FormField
                  control={form.control}
                  name="payrollPeriod"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className={formLabelClass}>Payroll Period *</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="monthly">Monthly</SelectItem>
                          <SelectItem value="bi_weekly">Bi-weekly</SelectItem>
                          <SelectItem value="weekly">Weekly</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="workingDays"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className={formLabelClass}>No of Working Days</FormLabel>
                      <FormControl>
                        <Input
                          type="text"
                          inputMode="numeric"
                          placeholder=""
                          value={field.value ?? ""}
                          onChange={(e) => {
                            const v = e.target.value.replace(/\D/g, "");
                            field.onChange(v === "" ? undefined : parseInt(v, 10));
                          }}
                          onBlur={field.onBlur}
                          name={field.name}
                          ref={field.ref}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormItem>
                  <FormLabel className={formLabelClass}>Basic salary for CPF</FormLabel>
                  <FormControl>
                    <Input
                      readOnly
                      placeholder=""
                      value={baseSalary ? formatCurrency(basicSalaryForCpf) : ""}
                      className={readOnlyInputClass}
                    />
                  </FormControl>
                </FormItem>
              </div>
              <div className="grid grid-cols-1 items-start gap-x-6 gap-y-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="hourlyRate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className={formLabelClass}>Hourly Rate</FormLabel>
                      <FormControl>
                        <OptionalAmountInput field={field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="overtimeRate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className={formLabelClass}>Overtime Rate</FormLabel>
                      <FormControl>
                        <OptionalAmountInput field={field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </section>

            <section className="space-y-4">
              <ModalSectionHeader icon={IdCard} title="Employee Details (CPF)" />
              <div className="grid grid-cols-1 items-start gap-x-6 gap-y-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="citizenshipDisplay"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className={formLabelClass}>Citizenship Status</FormLabel>
                      <FormControl>
                        <Input
                          placeholder=""
                          {...field}
                          value={field.value || ""}
                          onChange={(e) => {
                            field.onChange(e.target.value);
                            const value = e.target.value.toLowerCase();
                            if (value.includes("pr")) form.setValue("citizenshipStatus", "pr");
                            else if (value.includes("foreigner")) form.setValue("citizenshipStatus", "foreigner");
                            else if (value.includes("singapore") || value.includes("citizen"))
                              form.setValue("citizenshipStatus", "citizen");
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="dateOfBirth"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className={formLabelClass}>Date of Birth</FormLabel>
                      <FormControl>
                        <StringDatePicker
                          placeholder=""
                          value={field.value ?? ""}
                          onChange={(value) => {
                            field.onChange(value || "");
                            if (value) {
                              const age = calculateAge(new Date(value));
                              form.setValue("age", age);
                            }
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="age"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className={formLabelClass}>Age</FormLabel>
                      <FormControl>
                        <Input
                          type="text"
                          inputMode="numeric"
                          placeholder=""
                          value={field.value ?? ""}
                          onChange={(e) => {
                            const v = e.target.value.replace(/\D/g, "");
                            field.onChange(v === "" ? undefined : parseInt(v, 10));
                          }}
                          onBlur={field.onBlur}
                          name={field.name}
                          ref={field.ref}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </section>

            <section className="space-y-4">
              <ModalSectionHeader icon={Wallet} title="Allowances" />
              <div className="grid grid-cols-1 items-start gap-x-6 gap-y-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="allowanceTransport"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className={formLabelClass}>Transport Allowance</FormLabel>
                      <FormControl>
                        <OptionalAmountInput field={field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="allowanceMeal"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className={formLabelClass}>Food Allowance</FormLabel>
                      <FormControl>
                        <OptionalAmountInput field={field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="allowancePhone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className={formLabelClass}>Mobile Allowance</FormLabel>
                      <FormControl>
                        <OptionalAmountInput field={field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="allowanceOthers"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className={formLabelClass}>Other Allowances</FormLabel>
                      <FormControl>
                        <OptionalAmountInput field={field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </section>

            <section className="space-y-4">
              <ModalSectionHeader icon={MinusCircle} title="Employee Deductions" />
              <div className="grid grid-cols-1 items-start gap-x-6 gap-y-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="deductionMedical"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className={formLabelClass}>Medical Insurance</FormLabel>
                      <FormControl>
                        <OptionalAmountInput field={field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="deductionAdvance"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className={formLabelClass}>Advanced / Loan Recovery</FormLabel>
                      <FormControl>
                        <OptionalAmountInput field={field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="deductionOthers"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className={formLabelClass}>Other Deductions</FormLabel>
                      <FormControl>
                        <OptionalAmountInput field={field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </section>

            <section className="space-y-4">
              <ModalSectionHeader icon={Calculator} title="CPF Calculation" />
              <div className="grid grid-cols-1 items-start gap-x-6 gap-y-4 md:grid-cols-2">
                <FormItem>
                  <FormLabel className={formLabelClass}>Gross Salary</FormLabel>
                  <Input
                    readOnly
                    placeholder=""
                    value={hasPayrollPreview ? formatCurrency(grossSalary) : ""}
                    className={readOnlyInputClass}
                  />
                </FormItem>
                <FormItem>
                  <FormLabel className={formLabelClass}>CPF Capped Limit</FormLabel>
                  <Input
                    readOnly
                    placeholder=""
                    value={formatCurrency(CPF_WAGE_CEILING)}
                    className={readOnlyInputClass}
                  />
                </FormItem>
                <FormItem>
                  <FormLabel className={formLabelClass}>CPF Rate (Employee %)</FormLabel>
                  <Input
                    readOnly
                    placeholder=""
                    value={hasPayrollPreview ? formatRatePercent(employeeCpfRate) : ""}
                    className={readOnlyInputClass}
                  />
                </FormItem>
                <FormItem>
                  <FormLabel className={formLabelClass}>CPF Amount (Employee)</FormLabel>
                  <Input
                    readOnly
                    placeholder=""
                    value={hasPayrollPreview ? formatCurrency(employeeCpf) : ""}
                    className={readOnlyInputClass}
                  />
                </FormItem>
                <FormItem>
                  <FormLabel className={formLabelClass}>CPF Rate (Employer %)</FormLabel>
                  <Input
                    readOnly
                    placeholder=""
                    value={hasPayrollPreview ? formatRatePercent(employerCpfRate) : ""}
                    className={readOnlyInputClass}
                  />
                </FormItem>
                <FormItem>
                  <FormLabel className={formLabelClass}>CPF Amount (Employer)</FormLabel>
                  <Input
                    readOnly
                    placeholder=""
                    value={hasPayrollPreview ? formatCurrency(employerCpf) : ""}
                    className={readOnlyInputClass}
                  />
                </FormItem>
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
                type="submit"
                disabled={savePayrollConfigMutation.isPending}
                className={payrollPrimaryButtonClass}
              >
                {savePayrollConfigMutation.isPending
                  ? isEditMode
                    ? "Updating..."
                    : "Creating..."
                  : isEditMode
                    ? "Update Payroll"
                    : "Create Payroll"}
              </Button>
            </div>
          </form>
        </Form>
      </div>

      <div className="lg:col-span-1">
        <div className="sticky top-4 rounded-lg border border-[#E5E7EB] bg-[#FAFAFA] p-5">
          <h3 className="mb-4 flex items-center gap-2 text-base font-semibold text-[#111827]">
            <Calculator className="h-4 w-4 text-[#2563EB]" />
            CPF Preview
          </h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-[#6B7280]">Basic Salary</span>
              <span className="font-medium text-[#111827]">{formatCurrency(baseSalary)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#6B7280]">Basic salary for CPF</span>
              <span className="font-medium text-[#111827]">{formatCurrency(basicSalaryForCpf)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#6B7280]">Allowances</span>
              <span className="font-medium text-[#111827]">{formatCurrency(allowancesTotal)}</span>
            </div>
            <div className="flex justify-between border-t border-[#E5E7EB] pt-2">
              <span className="font-semibold text-[#111827]">Gross Salary</span>
              <span className="font-semibold text-[#111827]">{formatCurrency(grossSalary)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#6B7280]">Deductions</span>
              <span className="font-medium text-[#DC2626]">-{formatCurrency(deductionsTotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#6B7280]">CPF Rate (Employee)</span>
              <span className="text-[#111827]">{formatRatePercent(employeeCpfRate)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#6B7280]">CPF Amount (Employee)</span>
              <span className="font-medium text-[#DC2626]">-{formatCurrency(employeeCpf)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#6B7280]">CPF Rate (Employer)</span>
              <span className="text-[#111827]">{formatRatePercent(employerCpfRate)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#6B7280]">CPF Amount (Employer)</span>
              <span className="text-[#111827]">{formatCurrency(employerCpf)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#6B7280]">Total CPF</span>
              <span className="text-[#111827]">{formatCurrency(totalCpf)}</span>
            </div>
            <div className="flex justify-between border-t border-[#E5E7EB] pt-3">
              <span className="text-base font-semibold text-[#111827]">Net Salary</span>
              <span className="text-lg font-bold text-[#16A34A]">{formatCurrency(netSalary)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
    </TooltipProvider>
  );
}
