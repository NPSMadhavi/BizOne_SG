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
  ChevronDown,
  DollarSign,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ModalSectionHeader } from "@/operations-8june/components/forms/FormModalShell";
import { EmployeeCombobox } from "@/operations-8june/components/forms/EmployeeCombobox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
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
  citizenshipStatus: z.enum(["citizen", "pr", "foreigner"]).default("citizen"),
  citizenshipDisplay: z.string().optional(),
  age: z.coerce.number().min(16, "Employee must be at least 16 years old").optional(),
  dateOfBirth: z.string().optional(),
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
    if (employee?.prStatus === "1 Year") return "PR - 1";
    if (employee?.prStatus === "2 Years") return "PR - 2";
    if (employee?.prStatus === "3 Years and Above") return "PR - 3+";
    return "PR";
  }
  if (employee?.nationality === "Singapore") return "Singapore Citizen";
  if (employee?.nationality === "Foreigner") return "Foreigner";
  return employee?.nationality || "";
}

function formatNationalityDisplay(employee: any): string {
  // Nationality only — PR years belong in PR Status
  return employee?.nationality || "-";
}

function formatPrStatusDisplay(prStatus?: string): string {
  if (!prStatus) return "-";
  if (prStatus === "1 Year") return "1 Year PR";
  if (prStatus === "2 Years") return "2 Year PR";
  if (prStatus === "3 Years and Above") return "3+ Year PR";
  return prStatus;
}

function formatDisplayDate(value?: string | Date | null): string {
  if (!value) return "-";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "-";
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

const ALL_EMPLOYEES_ID = 0;

const PAYROLL_MONTH_OPTIONS = [
  { value: 1, label: "January" },
  { value: 2, label: "February" },
  { value: 3, label: "March" },
  { value: 4, label: "April" },
  { value: 5, label: "May" },
  { value: 6, label: "June" },
  { value: 7, label: "July" },
  { value: 8, label: "August" },
  { value: 9, label: "September" },
  { value: 10, label: "October" },
  { value: 11, label: "November" },
  { value: 12, label: "December" },
] as const;

/** Calendar days in a month (28/29/30/31) for the given year. */
function getDaysInMonth(month: number, year = new Date().getFullYear()): number {
  if (!Number.isInteger(month) || month < 1 || month > 12) return 30;
  return new Date(year, month, 0).getDate();
}

/**
 * Prorated basic for CPF / pay:
 * (monthly salary ÷ days in selected month) × working days
 * Example: $3,100 ÷ 31 × 30 ≠ $3,100 ÷ 30 × 30
 */
function calcBasicSalaryForCpf(
  baseSalary: number,
  workingDays?: number | null,
  monthDays?: number | null
): number {
  const base = Number(baseSalary) || 0;
  if (base <= 0) return 0;

  const days = Number(workingDays);
  if (!Number.isFinite(days) || days <= 0) {
    return Math.round(base * 100) / 100;
  }

  const rawMonthDays = Number(monthDays);
  const divisor =
    Number.isFinite(rawMonthDays) && rawMonthDays > 0 ? rawMonthDays : days;
  if (divisor <= 0) return Math.round(base * 100) / 100;

  const prorated = (base / divisor) * days;
  // Never pay more than the configured monthly basic.
  return Math.round(Math.min(base, prorated) * 100) / 100;
}

function formatRatePercent(rate: number): string {
  return `${rate}%`;
}

const formLabelClass = "text-sm font-medium text-[#111827]";
const payheadLabelClass = "text-base font-medium text-[#111827]";
const readOnlyInputClass = "bg-[#F9FAFB] text-[#111827]";

type Payhead = { id: string; label: string };
type PayheadKind = "earning" | "deduction";
type PayheadStore = { renames: Record<string, string>; hidden: string[]; custom: Payhead[] };

const BUILTIN_EARNINGS: Payhead[] = [
  { id: "transport", label: "Travelling Allowance" },
  { id: "meal", label: "Food Allowance" },
  { id: "phone", label: "Mobile Allowance" },
  { id: "others", label: "Other Allowance" },
];
const BUILTIN_DEDUCTIONS: Payhead[] = [
  { id: "medical", label: "Medical Insurance" },
  { id: "advance", label: "Advanced / Loan Recovery" },
  { id: "others", label: "Other Deductions" },
];
const RESERVED_EARNING_IDS = new Set(["transport", "meal", "phone", "others", "overtime"]);
const RESERVED_DEDUCTION_IDS = new Set(["medical", "advance", "others"]);
const EARNING_FORM_FIELDS: Record<string, "allowanceTransport" | "allowanceMeal" | "allowancePhone" | "allowanceOthers"> = {
  transport: "allowanceTransport",
  meal: "allowanceMeal",
  phone: "allowancePhone",
  others: "allowanceOthers",
};
const DEDUCTION_FORM_FIELDS: Record<string, "deductionMedical" | "deductionAdvance" | "deductionOthers"> = {
  medical: "deductionMedical",
  advance: "deductionAdvance",
  others: "deductionOthers",
};

function emptyPayheadStore(): PayheadStore {
  return { renames: {}, hidden: [], custom: [] };
}

function payheadStorageKey(kind: PayheadKind) {
  return kind === "earning" ? "payroll-payhead-earnings" : "payroll-payhead-deductions";
}

function loadPayheadStore(kind: PayheadKind): PayheadStore {
  try {
    const raw = localStorage.getItem(payheadStorageKey(kind));
    if (!raw) return emptyPayheadStore();
    const parsed = JSON.parse(raw) as Partial<PayheadStore>;
    return {
      renames: parsed.renames && typeof parsed.renames === "object" ? parsed.renames : {},
      hidden: Array.isArray(parsed.hidden) ? parsed.hidden.filter((id) => typeof id === "string") : [],
      custom: Array.isArray(parsed.custom)
        ? parsed.custom.filter((item) => item && typeof item.id === "string" && typeof item.label === "string")
        : [],
    };
  } catch {
    return emptyPayheadStore();
  }
}

function savePayheadStore(kind: PayheadKind, store: PayheadStore) {
  localStorage.setItem(payheadStorageKey(kind), JSON.stringify(store));
}

function visiblePayheads(kind: PayheadKind, store: PayheadStore): Payhead[] {
  const builtins = kind === "earning" ? BUILTIN_EARNINGS : BUILTIN_DEDUCTIONS;
  const hidden = new Set(store.hidden);
  const builtinItems = builtins
    .filter((item) => !hidden.has(item.id))
    .map((item) => ({ id: item.id, label: store.renames[item.id] || item.label }));
  const customItems = store.custom
    .filter((item) => !hidden.has(item.id))
    .map((item) => ({ id: item.id, label: store.renames[item.id] || item.label }));
  return [...builtinItems, ...customItems];
}

function slugifyPayhead(label: string) {
  const base = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  return base || "payhead";
}

function labelFromPayheadId(id: string) {
  return id.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function mergeSavedPayheads(kind: PayheadKind, amounts: Record<string, unknown> | null | undefined): PayheadStore {
  const store = loadPayheadStore(kind);
  const reserved = kind === "earning" ? RESERVED_EARNING_IDS : RESERVED_DEDUCTION_IDS;
  const hidden = new Set(store.hidden);
  let changed = false;
  for (const key of Object.keys(amounts || {})) {
    if (reserved.has(key) || hidden.has(key) || store.custom.some((item) => item.id === key)) continue;
    store.custom.push({ id: key, label: labelFromPayheadId(key) });
    changed = true;
  }
  if (changed) savePayheadStore(kind, store);
  return store;
}

function PayheadMenu({
  buttonLabel,
  buttonClassName,
  items,
  onCreate,
  onEdit,
  onDelete,
}: {
  buttonLabel: string;
  buttonClassName: string;
  items: Payhead[];
  onCreate: () => void;
  onEdit: (item: Payhead) => void;
  onDelete: (item: Payhead) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" className={buttonClassName}>
          <Plus className="mr-1 h-4 w-4" />
          {buttonLabel}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuItem
          onSelect={onCreate}
          className="font-medium text-[#2563EB] focus:bg-[#EFF6FF] focus:text-[#2563EB]"
        >
          Create new payhead
        </DropdownMenuItem>
        {items.length > 0 ? <DropdownMenuSeparator /> : null}
        {items.map((item) => (
          <div key={item.id} className="flex items-center gap-1 px-2 py-1.5">
            <span className="min-w-0 flex-1 truncate text-sm text-[#111827]">{item.label}</span>
            <button
              type="button"
              className="rounded p-1 text-[#2563EB] hover:bg-[#EFF6FF]"
              title={`Edit ${item.label}`}
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setOpen(false);
                onEdit(item);
              }}
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className="rounded p-1 text-[#DC2626] hover:bg-[#FEF2F2]"
              title={`Delete ${item.label}`}
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setOpen(false);
                onDelete(item);
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function OptionalAmountInput({
  field,
  placeholder = "",
}: {
  field: { value?: number; onChange: (value: number | undefined) => void; onBlur?: () => void; name: string; ref?: React.Ref<HTMLInputElement> };
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
      <p className="text-sm font-medium text-[#2563EB]">{label}</p>
      <p className="mt-1 text-base font-semibold text-[#111827]">{value}</p>
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
  age: number,
  monthDays?: number | null,
  extraAllowances: Record<string, number> = {},
  extraDeductions: Record<string, number> = {},
  includedEarnings: string[] = ["transport", "meal", "phone", "others"],
  includedDeductions: string[] = ["medical", "advance", "others"],
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

  const earningIncluded = new Set(includedEarnings);
  const deductionIncluded = new Set(includedDeductions);
  const allowances: Record<string, number> = {
    // Overtime Hours × Overtime pay (SGD) — counted with allowances
    overtime: Math.round(
      (Number(payrollData.overtimeRate) || 0) * (Number(payrollData.hourlyRate) || 0) * 100
    ) / 100,
  };
  if (earningIncluded.has("transport")) allowances.transport = allowanceTransport || 0;
  if (earningIncluded.has("meal")) allowances.meal = allowanceMeal || 0;
  if (earningIncluded.has("phone")) allowances.phone = allowancePhone || 0;
  if (earningIncluded.has("others")) allowances.others = allowanceOthers || 0;
  for (const [key, value] of Object.entries(extraAllowances)) {
    if (!RESERVED_EARNING_IDS.has(key)) allowances[key] = Number(value) || 0;
  }

  const deductions: Record<string, number> = {};
  if (deductionIncluded.has("medical")) deductions.medical = deductionMedical || 0;
  if (deductionIncluded.has("advance")) deductions.advance = deductionAdvance || 0;
  if (deductionIncluded.has("others")) deductions.others = deductionOthers || 0;
  for (const [key, value] of Object.entries(extraDeductions)) {
    if (!RESERVED_DEDUCTION_IDS.has(key)) deductions[key] = Number(value) || 0;
  }

  const overtimePay = Number(allowances.overtime) || 0;
  const previewAllowances = { ...allowances };
  delete previewAllowances.overtime;

  const calculation = calculateSyncBridgePayrollPreview({
    monthlySalary: calcBasicSalaryForCpf(
      Number(payrollData.baseSalary) || 0,
      workingDays != null ? Number(workingDays) : undefined,
      monthDays
    ),
    age,
    citizenshipStatus: citizenshipStatus as "citizen" | "pr" | "foreigner",
    prStatus: selectedEmployee?.prStatus,
    overtimePay,
    allowances: previewAllowances,
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

  const activeEmployees = useMemo(
    () => employees.filter((employee) => String(employee.status || "active") === "active"),
    [employees],
  );

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
    if (editData?.id) return options;
    return [
      {
        id: ALL_EMPLOYEES_ID,
        name: "All Employees",
        employeeId: `${activeEmployees.length} active`,
        designation: "Process payroll for everyone",
      },
      ...options,
    ];
  }, [employees, editData, activeEmployees.length]);

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
  const [selectedPayrollMonth, setSelectedPayrollMonth] = useState<number | null>(null);
  const [monthMenuOpen, setMonthMenuOpen] = useState(false);
  const [monthError, setMonthError] = useState("");
  const [earningStore, setEarningStore] = useState<PayheadStore>(() => loadPayheadStore("earning"));
  const [deductionStore, setDeductionStore] = useState<PayheadStore>(() => loadPayheadStore("deduction"));
  const [customEarningAmounts, setCustomEarningAmounts] = useState<Record<string, number | undefined>>({});
  const [customDeductionAmounts, setCustomDeductionAmounts] = useState<Record<string, number | undefined>>({});
  const [payheadDialog, setPayheadDialog] = useState<{
    kind: PayheadKind;
    mode: "create" | "edit";
    id?: string;
    label: string;
  } | null>(null);
  const [payheadName, setPayheadName] = useState("");

  const earningCatalog = useMemo(() => visiblePayheads("earning", earningStore), [earningStore]);
  const deductionCatalog = useMemo(() => visiblePayheads("deduction", deductionStore), [deductionStore]);

  const selectedEmployeeId = form.watch("employeeId");
  const isAllEmployees = Number(selectedEmployeeId) === ALL_EMPLOYEES_ID;
  const selectedEmployee = useMemo(
    () =>
      isAllEmployees
        ? undefined
        : employeeOptions.find(
            (employee) => Number(employee.id) === Number(selectedEmployeeId)
          ),
    [employeeOptions, selectedEmployeeId, isAllEmployees]
  );

  const baseSalary = Number(form.watch("baseSalary") || 0);
  const workingDaysRaw = form.watch("workingDays");
  const selectedMonthDays =
    selectedPayrollMonth != null ? getDaysInMonth(selectedPayrollMonth) : null;
  const basicSalaryForCpf = calcBasicSalaryForCpf(
    baseSalary,
    workingDaysRaw,
    selectedMonthDays
  );
  const age = Number(form.watch("age") || 0);
  const citizenshipStatus = form.watch("citizenshipStatus");
  const overtimeHours = Number(form.watch("overtimeRate") || 0); // field labeled Overtime Hours
  const forHoursInSgd = Number(form.watch("hourlyRate") || 0); // field labeled Overtime pay (SGD)
  const overtimePay = Math.round(overtimeHours * forHoursInSgd * 100) / 100;
  const allowanceTransport = Number(form.watch("allowanceTransport") || 0);
  const allowanceMeal = Number(form.watch("allowanceMeal") || 0);
  const allowancePhone = Number(form.watch("allowancePhone") || 0);
  const allowanceOthers = Number(form.watch("allowanceOthers") || 0);
  const deductionMedical = Number(form.watch("deductionMedical") || 0);
  const deductionAdvance = Number(form.watch("deductionAdvance") || 0);
  const deductionOthers = Number(form.watch("deductionOthers") || 0);

  const allowancePreview = useMemo(() => {
    const visible = new Set(earningCatalog.map((item) => item.id));
    const map: Record<string, number> = {};
    if (visible.has("transport")) map.transport = allowanceTransport;
    if (visible.has("meal")) map.meal = allowanceMeal;
    if (visible.has("phone")) map.phone = allowancePhone;
    if (visible.has("others")) map.others = allowanceOthers;
    for (const item of earningCatalog) {
      if (RESERVED_EARNING_IDS.has(item.id)) continue;
      map[item.id] = Number(customEarningAmounts[item.id]) || 0;
    }
    return map;
  }, [
    earningCatalog,
    allowanceTransport,
    allowanceMeal,
    allowancePhone,
    allowanceOthers,
    customEarningAmounts,
  ]);

  const deductionPreview = useMemo(() => {
    const visible = new Set(deductionCatalog.map((item) => item.id));
    const map: Record<string, number> = {};
    if (visible.has("medical")) map.medical = deductionMedical;
    if (visible.has("advance")) map.advance = deductionAdvance;
    if (visible.has("others")) map.others = deductionOthers;
    for (const item of deductionCatalog) {
      if (RESERVED_DEDUCTION_IDS.has(item.id)) continue;
      map[item.id] = Number(customDeductionAmounts[item.id]) || 0;
    }
    return map;
  }, [
    deductionCatalog,
    deductionMedical,
    deductionAdvance,
    deductionOthers,
    customDeductionAmounts,
  ]);

  const calculationPreview = useMemo(() => {
    if (!baseSalary || !age) return null;

    return calculateSyncBridgePayrollPreview({
      monthlySalary: basicSalaryForCpf,
      age,
      citizenshipStatus,
      prStatus: selectedEmployee?.prStatus,
      overtimePay,
      allowances: allowancePreview,
      deductions: deductionPreview,
    });
  }, [
    baseSalary,
    basicSalaryForCpf,
    age,
    citizenshipStatus,
    selectedEmployee?.prStatus,
    overtimePay,
    allowancePreview,
    deductionPreview,
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
    const savedAllowances = (editData.allowances || {}) as Record<string, unknown>;
    const savedDeductions = (editData.deductions || {}) as Record<string, unknown>;
    setEarningStore(mergeSavedPayheads("earning", savedAllowances));
    setDeductionStore(mergeSavedPayheads("deduction", savedDeductions));
    const extraEarnings: Record<string, number | undefined> = {};
    const extraDeductions: Record<string, number | undefined> = {};
    for (const [key, value] of Object.entries(savedAllowances)) {
      if (!RESERVED_EARNING_IDS.has(key)) extraEarnings[key] = Number(value) || undefined;
    }
    for (const [key, value] of Object.entries(savedDeductions)) {
      if (!RESERVED_DEDUCTION_IDS.has(key)) extraDeductions[key] = Number(value) || undefined;
    }
    setCustomEarningAmounts(extraEarnings);
    setCustomDeductionAmounts(extraDeductions);
  }, [isEditMode, editData, employeeOptions, form]);

  useEffect(() => {
    if (isEditMode || !selectedEmployee) return;
    populateFromEmployee(selectedEmployee);
  }, [selectedEmployee?.id, isEditMode]);

  const savePayrollConfigMutation = useMutation({
    mutationFn: async (data: PayrollConfigFormData) => {
      const creatingForEveryone = !editData?.id && Number(data.employeeId) === ALL_EMPLOYEES_ID;
      const resolvedAge =
        Number(data.age) ||
        (data.dateOfBirth ? calculateAge(new Date(data.dateOfBirth)) : 0) ||
        (selectedEmployee?.dateOfBirth
          ? calculateAge(new Date(selectedEmployee.dateOfBirth))
          : 0);
      if (!creatingForEveryone && (!resolvedAge || resolvedAge < 16)) {
        throw new Error("Selected employee must have a valid date of birth (age 16+).");
      }
      const extraAllowances: Record<string, number> = {};
      const extraDeductions: Record<string, number> = {};
      for (const item of earningCatalog) {
        if (!RESERVED_EARNING_IDS.has(item.id)) {
          extraAllowances[item.id] = Number(customEarningAmounts[item.id]) || 0;
        }
      }
      for (const item of deductionCatalog) {
        if (!RESERVED_DEDUCTION_IDS.has(item.id)) {
          extraDeductions[item.id] = Number(customDeductionAmounts[item.id]) || 0;
        }
      }
      const monthDays = selectedPayrollMonth != null ? getDaysInMonth(selectedPayrollMonth) : null;
      const earningIds = earningCatalog.map((item) => item.id);
      const deductionIds = deductionCatalog.map((item) => item.id);

      if (creatingForEveryone) {
        const targets = activeEmployees.filter((employee) => {
          if (!employee.dateOfBirth) return false;
          return calculateAge(new Date(employee.dateOfBirth)) >= 16;
        });
        if (targets.length === 0) {
          throw new Error("No active employees with a valid date of birth.");
        }
        const created = [];
        for (const employee of targets) {
          const dob = new Date(employee.dateOfBirth);
          const age = calculateAge(dob);
          const citizenship = mapNationalityToCitizenship(employee.nationality);
          const payload = buildPayrollConfigPayload(
            {
              ...data,
              employeeId: Number(employee.id),
              age,
              dateOfBirth: toDateInputValue(dob),
              citizenshipStatus: citizenship,
            },
            employee,
            citizenship,
            age,
            monthDays,
            extraAllowances,
            extraDeductions,
            earningIds,
            deductionIds,
          );
          const res = await apiRequest("POST", "/api/employee-payroll", payload);
          created.push(await res.json());
        }
        return created;
      }

      const payload = buildPayrollConfigPayload(
        data,
        selectedEmployee,
        data.citizenshipStatus || "citizen",
        resolvedAge,
        monthDays,
        extraAllowances,
        extraDeductions,
        earningIds,
        deductionIds,
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
          : Array.isArray(data)
            ? `Payroll created for ${data.length} employees`
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
    if (selectedPayrollMonth == null) {
      setMonthError("Month is required");
      return;
    }
    setMonthError("");
    savePayrollConfigMutation.mutate(data);
  };

  const commitPayheadStore = (kind: PayheadKind, next: PayheadStore) => {
    savePayheadStore(kind, next);
    if (kind === "earning") setEarningStore(next);
    else setDeductionStore(next);
  };

  const openPayheadDialog = (kind: PayheadKind, mode: "create" | "edit", item?: Payhead) => {
    setPayheadDialog({ kind, mode, id: item?.id, label: item?.label || "" });
    setPayheadName(item?.label || "");
  };

  const savePayheadName = () => {
    if (!payheadDialog) return;
    const label = payheadName.trim();
    if (!label) {
      toast({ title: "Enter a name", variant: "destructive" });
      return;
    }
    const kind = payheadDialog.kind;
    const store = kind === "earning" ? earningStore : deductionStore;
    const catalog = kind === "earning" ? earningCatalog : deductionCatalog;
    const duplicate = catalog.some(
      (item) => item.id !== payheadDialog.id && item.label.toLowerCase() === label.toLowerCase(),
    );
    if (duplicate) {
      toast({ title: "That name already exists", variant: "destructive" });
      return;
    }
    if (payheadDialog.mode === "create") {
      const reserved = kind === "earning" ? RESERVED_EARNING_IDS : RESERVED_DEDUCTION_IDS;
      let id = slugifyPayhead(label);
      let suffix = 2;
      const base = id;
      while (reserved.has(id) || store.custom.some((item) => item.id === id) || catalog.some((item) => item.id === id)) {
        id = `${base}_${suffix++}`;
      }
      commitPayheadStore(kind, { ...store, custom: [...store.custom, { id, label }] });
    } else if (payheadDialog.id) {
      commitPayheadStore(kind, {
        ...store,
        renames: { ...store.renames, [payheadDialog.id]: label },
        custom: store.custom.map((item) => (item.id === payheadDialog.id ? { ...item, label } : item)),
      });
    }
    setPayheadDialog(null);
  };

  const deletePayhead = (kind: PayheadKind, id: string) => {
    const store = kind === "earning" ? earningStore : deductionStore;
    const isCustom = store.custom.some((item) => item.id === id);
    commitPayheadStore(kind, {
      ...store,
      hidden: isCustom ? store.hidden.filter((hiddenId) => hiddenId !== id) : [...store.hidden, id],
      custom: store.custom.filter((item) => item.id !== id),
    });
    const earningField = EARNING_FORM_FIELDS[id];
    const deductionField = DEDUCTION_FORM_FIELDS[id];
    if (kind === "earning" && earningField) form.setValue(earningField, undefined);
    if (kind === "deduction" && deductionField) form.setValue(deductionField, undefined);
    if (kind === "earning" && !earningField) {
      setCustomEarningAmounts((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
    }
    if (kind === "deduction" && !deductionField) {
      setCustomDeductionAmounts((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
    }
  };

  const hasPayrollPreview = Boolean(baseSalary && age);

  const allowancesOnly = Object.values(allowancePreview).reduce((sum, value) => sum + value, 0);
  const allowancesTotal =
    (calculationPreview?.allowancesTotal ?? allowancesOnly) + overtimePay;
  const deductionsTotal = calculationPreview?.deductionsTotal ?? 0;
  const grossSalary =
    calculationPreview?.grossPay ??
    (hasPayrollPreview ? basicSalaryForCpf + allowancesTotal : 0);
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
      <div className="w-full">
        <Form {...form}>
          <form
            onSubmit={(event) => {
              if (selectedPayrollMonth == null) setMonthError("Month is required");
              form.handleSubmit(onSubmit)(event);
            }}
            className="space-y-8"
          >
            <section className="space-y-4">
              <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
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
                                ? `${selectedEmployee.name} (${selectedEmployee.employeeId}) - ${selectedEmployee.designation}`
                                : editData?.employeeName
                                  ? `${editData.employeeName} - ${editData.designation ?? ""}`
                                  : "Selected employee"
                            }
                            className={readOnlyInputClass}
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
                            placeholder="Select employee or All Employees"
                            searchPlaceholder="Search employee..."
                          />
                        </FormControl>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormItem>
                  <FormLabel className={formLabelClass}>Month *</FormLabel>
                  <Popover open={monthMenuOpen} onOpenChange={setMonthMenuOpen}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      >
                        <span className={selectedPayrollMonth == null ? "text-muted-foreground" : "text-[#111827]"}>
                          {PAYROLL_MONTH_OPTIONS.find((month) => month.value === selectedPayrollMonth)?.label ?? "Select month"}
                        </span>
                        <ChevronDown className="h-4 w-4 opacity-50" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent
                      align="start"
                      className="w-[var(--radix-popover-trigger-width)] p-2"
                    >
                      <div className="grid grid-cols-3 gap-2">
                        {PAYROLL_MONTH_OPTIONS.map((month) => {
                          const selected = selectedPayrollMonth === month.value;
                          return (
                            <button
                              key={month.value}
                              type="button"
                              className={cn(
                                "rounded-md border border-[#BFDBFE] bg-white px-2 py-2 text-center text-sm text-[#111827] hover:bg-[#EFF6FF]",
                                selected && "border-[#2563EB] bg-[#EFF6FF] font-medium text-[#1D4ED8]",
                              )}
                              onClick={() => {
                                setSelectedPayrollMonth(month.value);
                                setMonthError("");
                                setMonthMenuOpen(false);
                                form.setValue("workingDays", getDaysInMonth(month.value), {
                                  shouldDirty: true,
                                  shouldValidate: true,
                                });
                              }}
                            >
                              {month.label}
                            </button>
                          );
                        })}
                      </div>
                    </PopoverContent>
                  </Popover>
                  {monthError ? <p className="text-sm font-medium text-destructive">{monthError}</p> : null}
                </FormItem>
              </div>

              {selectedEmployee && (
                <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
                  <div className="rounded-lg border border-[#BFDBFE] bg-[#EFF6FF] p-5">
                    <div className="grid grid-cols-1 content-start gap-x-8 gap-y-5 sm:grid-cols-2">
                      <InfoItem label="Employee ID" value={selectedEmployee.employeeId || "-"} />
                      <InfoItem label="Employee Name" value={selectedEmployee.name || "-"} />
                      <InfoItem label="Department" value={selectedEmployee.department || "-"} />
                      <InfoItem label="Designation" value={selectedEmployee.designation || "-"} />
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
                            : String(form.watch("age") || "-")
                        }
                      />
                    </div>
                  </div>

                  <div className="rounded-lg border border-[#E5E7EB] bg-[#FAFAFA] p-4">
                    <h3 className="mb-2 flex items-center gap-2 text-base font-semibold text-[#111827]">
                      <Calculator className="h-4 w-4 text-[#2563EB]" />
                      CPF Preview
                    </h3>
                    <div className="space-y-1.5 text-sm">
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
                      <div className="flex justify-between border-t border-[#E5E7EB] pt-1.5">
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
                      <div className="flex justify-between border-t border-[#E5E7EB] pt-1.5">
                        <span className="text-base font-semibold text-[#111827]">Net Salary</span>
                        <span className="text-lg font-bold text-[#16A34A]">{formatCurrency(netSalary)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </section>

            <section className="space-y-4">
              <div className="mb-1">
                <h3 className="text-lg font-semibold text-[#111827]">Payheads</h3>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <h4 className="inline-flex items-center rounded-md bg-[#EFF6FF] px-3 py-1.5 text-lg font-bold tracking-wide text-[#1D4ED8]">
                    Earnings
                  </h4>
                  <PayheadMenu
                    buttonLabel="Add earnings"
                    buttonClassName="border-[#BFDBFE] text-[#1D4ED8] hover:bg-[#EFF6FF]"
                    items={earningCatalog}
                    onCreate={() => openPayheadDialog("earning", "create")}
                    onEdit={(item) => openPayheadDialog("earning", "edit", item)}
                    onDelete={(item) => deletePayhead("earning", item.id)}
                  />
                </div>
                <div className="grid grid-cols-1 items-start gap-x-4 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
                  <FormField
                    control={form.control}
                    name="baseSalary"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className={payheadLabelClass}>Basic Salary *</FormLabel>
                        <FormControl>
                          <div className="relative">
                            {selectedEmployee && (
                              <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-[#6B7280]">
                                <DollarSign className="h-4 w-4" />
                              </span>
                            )}
                            <Input
                              type="text"
                              inputMode="decimal"
                              placeholder=""
                              className={selectedEmployee ? "pl-9" : undefined}
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
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="payrollPeriod"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className={payheadLabelClass}>Payroll Period *</FormLabel>
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
                        <FormLabel className={payheadLabelClass}>No of Working Days</FormLabel>
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
                  <FormField
                    control={form.control}
                    name="overtimeRate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className={payheadLabelClass}>Overtime Hours</FormLabel>
                        <FormControl>
                          <OptionalAmountInput field={field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="hourlyRate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className={payheadLabelClass}>Overtime pay (SGD)</FormLabel>
                        <FormControl>
                          <OptionalAmountInput field={field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {earningCatalog.map((item) => {
                    const fieldName = EARNING_FORM_FIELDS[item.id];
                    if (fieldName) {
                      return (
                        <FormField
                          key={item.id}
                          control={form.control}
                          name={fieldName}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className={payheadLabelClass}>{item.label}</FormLabel>
                              <FormControl>
                                <OptionalAmountInput field={field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      );
                    }
                    return (
                      <FormItem key={item.id}>
                        <FormLabel className={payheadLabelClass}>{item.label}</FormLabel>
                        <OptionalAmountInput
                          field={{
                            name: item.id,
                            value: customEarningAmounts[item.id],
                            onChange: (value) =>
                              setCustomEarningAmounts((current) => ({ ...current, [item.id]: value })),
                          }}
                        />
                      </FormItem>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <h4 className="inline-flex items-center rounded-md bg-[#FEF2F2] px-3 py-1.5 text-lg font-bold tracking-wide text-[#B91C1C]">
                    Deductions
                  </h4>
                  <PayheadMenu
                    buttonLabel="Add deductions"
                    buttonClassName="border-[#FECACA] text-[#B91C1C] hover:bg-[#FEF2F2]"
                    items={deductionCatalog}
                    onCreate={() => openPayheadDialog("deduction", "create")}
                    onEdit={(item) => openPayheadDialog("deduction", "edit", item)}
                    onDelete={(item) => deletePayhead("deduction", item.id)}
                  />
                </div>
                <div className="grid grid-cols-1 items-start gap-x-4 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
                  {deductionCatalog.map((item) => {
                    const fieldName = DEDUCTION_FORM_FIELDS[item.id];
                    if (fieldName) {
                      return (
                        <FormField
                          key={item.id}
                          control={form.control}
                          name={fieldName}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className={payheadLabelClass}>{item.label}</FormLabel>
                              <FormControl>
                                <OptionalAmountInput field={field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      );
                    }
                    return (
                      <FormItem key={item.id}>
                        <FormLabel className={payheadLabelClass}>{item.label}</FormLabel>
                        <OptionalAmountInput
                          field={{
                            name: item.id,
                            value: customDeductionAmounts[item.id],
                            onChange: (value) =>
                              setCustomDeductionAmounts((current) => ({ ...current, [item.id]: value })),
                          }}
                        />
                      </FormItem>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 items-start gap-x-4 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
                <FormItem>
                  <FormLabel className={formLabelClass}>Salary for CPF</FormLabel>
                  <FormControl>
                    <Input
                      readOnly
                      placeholder=""
                      value={baseSalary ? formatCurrency(basicSalaryForCpf) : ""}
                      className={readOnlyInputClass}
                    />
                  </FormControl>
                </FormItem>
                <FormItem>
                  <FormLabel className={formLabelClass}>CPF Capped Limit</FormLabel>
                  <FormControl>
                    <Input
                      readOnly
                      placeholder=""
                      value={formatCurrency(CPF_WAGE_CEILING)}
                      className={readOnlyInputClass}
                    />
                  </FormControl>
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
            <Dialog open={payheadDialog != null} onOpenChange={(open) => { if (!open) setPayheadDialog(null); }}>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>
                    {payheadDialog?.mode === "edit" ? "Edit payhead" : "Create new payhead"}
                  </DialogTitle>
                </DialogHeader>
                <Input
                  value={payheadName}
                  placeholder="Enter name"
                  onChange={(event) => setPayheadName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      savePayheadName();
                    }
                  }}
                />
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setPayheadDialog(null)}>
                    Cancel
                  </Button>
                  <Button type="button" onClick={savePayheadName}>
                    Save
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </form>
        </Form>
      </div>
    </TooltipProvider>
  );
}
