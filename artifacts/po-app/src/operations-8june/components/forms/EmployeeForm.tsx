import { useState, useEffect, useCallback } from "react";
import { useForm, useFieldArray, type FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertEmployeeSchema, insertDependentSchema, Employee } from "@shared/schema";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/operations-8june/lib/queryClient";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { isBefore } from "date-fns";
import { Users, FileText, Plus, Trash2, User } from "lucide-react";
import { SimpleDatePicker } from "@/components/ui/simple-date-picker";
import { cn } from "@/lib/utils";
import {
  Dialog,
} from "@/components/ui/dialog";
import {
  FormModalShell,
  ModalCancelButton,
  ModalSaveButton,
  ModalSectionHeader,
} from "@/operations-8june/components/forms/FormModalShell";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/contexts/auth-context";

// Dependent schema for the form
const dependentSchema = z.object({
  name: z.string().min(1, "Name is required"),
  relationship: z.enum(["spouse", "child", "parent", "sibling", "other"]),
  passportNumber: z.string().optional(),
  passportExpiry: z.date().optional().nullable(),
  visaNumber: z.string().optional(),
  visaExpiry: z.date().optional().nullable(),
  visaType: z.enum(["s_pass", "work_permit", "employment_pass", "pr", "dependent_pass", "ltvp", "student_pass", "other"]).optional().nullable(),
  passportScan: z.string().optional(),
  visaScan: z.string().optional(),
});

// Extended employee form schema with dependents
const employeeFormSchema = insertEmployeeSchema.extend({
  employeeId: z.string().min(1, "Employee ID is required"),
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Valid email is required"),
  phone: z.string().min(8, "Phone number must be at least 8 characters"),
  address: z.string().min(10, "Address must be at least 10 characters"),
  department: z.string().min(2, "Department must be at least 2 characters"),
  designation: z.string().min(2, "Designation must be at least 2 characters"),
  joinDate: z.date({ required_error: "Join date is required" }),
  dateOfBirth: z.date({ required_error: "Date of birth is required" }),
  status: z.enum(["active", "resigned", "on_hold", "terminated"]),
  salary: z.string().min(1, "Salary is required"),
  annualSalary: z.string().optional().nullable(),
  nationality: z.preprocess(
    (val) => (val === "" || val == null ? undefined : val),
    z.enum(["Singapore", "PR", "Foreigner"], { required_error: "Nationality is required" })
  ),
  prStatus: z.preprocess(
    (val) => (val === "" || val == null ? undefined : val),
    z.enum(["1 Year", "2 Years", "3 Years and Above"]).optional().nullable()
  ),
  companyId: z.number().optional().nullable(),
  passportNumber: z.string().optional(),
  passportExpiry: z.date().optional().nullable(),
  visaNumber: z.string().optional(),
  visaExpiry: z.date().optional().nullable(),
  nricNumber: z.string().optional(),
  nricExpiry: z.date().optional().nullable(),
  visaType: z.enum(["s_pass", "work_permit", "employment_pass", "pr", "dependent_pass", "ltvp", "student_pass", "other"]).optional().nullable(),
  visaRemarks: z.string().optional(),
  passportScan: z.string().optional(),
  visaScan: z.string().optional(),
  nricScan: z.string().optional(),
  dependents: z.array(dependentSchema).optional(),
}).superRefine((data, ctx) => {
  if (data.nationality === "PR" && !data.prStatus) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "PR status is required when nationality is PR",
      path: ["prStatus"],
    });
  }
});

type EmployeeFormData = z.infer<typeof employeeFormSchema>;

interface EmployeeFormProps {
  employee?: Employee;
  isOpen: boolean;
  onClose: () => void;
  formId?: string;
  hideShell?: boolean;
  onPendingChange?: (pending: boolean) => void;
}

export default function EmployeeForm({
  employee,
  isOpen,
  onClose,
  formId = "employee-form",
  hideShell = false,
  onPendingChange,
}: EmployeeFormProps) {
  const { toast } = useToast();
  const { user, selectedCompany } = useAuth();
  const isEditMode = !!employee;
  
  const getDefaultValues = (emp?: Employee) => ({
    employeeId: emp?.employeeId || "",
    name: emp?.name || "",
    email: (emp as any)?.email || "",
    phone: (emp as any)?.phone || "",
    address: (emp as any)?.address || "",
    department: emp?.department || "",
    designation: emp?.designation || "",
    joinDate: emp?.joinDate ? new Date(emp.joinDate) : new Date(),
    dateOfBirth: (emp as any)?.dateOfBirth ? new Date((emp as any).dateOfBirth) : undefined,
    status: emp?.status || "active",
    salary: (emp as any)?.salary?.toString() || "",
    annualSalary: (emp as any)?.annualSalary?.toString() || "",
    nationality: (emp as any)?.nationality || "",
    prStatus: (emp as any)?.prStatus || "",
    companyId: (emp as any)?.companyId ?? selectedCompany?.id ?? null,
    passportNumber: emp?.passportNumber || "",
    passportExpiry: emp?.passportExpiry ? new Date(emp.passportExpiry) : null,
    visaNumber: emp?.visaNumber || "",
    visaExpiry: emp?.visaExpiry ? new Date(emp.visaExpiry) : null,
    nricNumber: (emp as any)?.nricNumber || "",
    nricExpiry: (emp as any)?.nricExpiry ? new Date((emp as any).nricExpiry) : null,
    visaType: emp?.visaType || null,
    visaRemarks: emp?.visaRemarks || "",
    passportScan: emp?.passportScan || "",
    visaScan: emp?.visaScan || "",
    nricScan: emp?.nricScan || "",
    dependents: [],
  });

  const { data: existingDependents = [] } = useQuery<any[]>({
    queryKey: ["/api/employees", employee?.id, "dependents"],
    enabled: !!employee?.id && isOpen,
  });
  
  const form = useForm<EmployeeFormData>({
    resolver: zodResolver(employeeFormSchema),
    defaultValues: getDefaultValues(employee),
    shouldFocusError: true,
  });

  // Track if form has been initialized to prevent repeated resets
  const [formInitialized, setFormInitialized] = useState(false);
  
  // Reset form only when sheet opens or employee changes (not on every existingDependents update)
  useEffect(() => {
    if (isOpen && !formInitialized) {
      const defaults = getDefaultValues(employee);
      form.reset(defaults);
      setFormInitialized(true);
    }
    if (!isOpen) {
      setFormInitialized(false);
    }
  }, [employee?.id, isOpen]);

  useEffect(() => {
    if (isOpen && selectedCompany?.id != null) {
      form.setValue("companyId", selectedCompany.id);
    }
  }, [isOpen, selectedCompany?.id, form]);
  
  // Load dependents separately for edit mode (only once when they arrive)
  useEffect(() => {
    if (isOpen && employee && existingDependents.length > 0 && formInitialized) {
      const currentDependents = form.getValues("dependents") || [];
      // Only update if dependents haven't been loaded yet
      if (currentDependents.length === 0) {
        form.setValue("dependents", existingDependents.map((dep: any) => ({
          name: dep.name,
          relationship: dep.relationship,
          passportNumber: dep.passportNumber || "",
          passportExpiry: dep.passportExpiry ? new Date(dep.passportExpiry) : null,
          visaNumber: dep.visaNumber || "",
          visaExpiry: dep.visaExpiry ? new Date(dep.visaExpiry) : null,
          visaType: dep.visaType || null,
          passportScan: dep.passportScan || "",
          visaScan: dep.visaScan || "",
        })));
      }
    }
  }, [existingDependents, isOpen, employee, formInitialized]);

  const { fields: dependentFields, append: addDependent, remove: removeDependent } = useFieldArray({
    control: form.control,
    name: "dependents",
  });

  // Create employee mutation
  const createMutation = useMutation({
    mutationFn: async (data: EmployeeFormData) => {
      // Convert Date objects to ISO strings for API
      const serializedData = {
        ...data,
        employeeId: data.employeeId?.trim(),
        joinDate: data.joinDate.toISOString(),
        dateOfBirth: data.dateOfBirth ? data.dateOfBirth.toISOString() : null,
        passportExpiry: data.passportExpiry ? data.passportExpiry.toISOString() : null,
        visaExpiry: data.visaExpiry ? data.visaExpiry.toISOString() : null,
        nricExpiry: data.nricExpiry ? data.nricExpiry.toISOString() : null,
        dependents: data.dependents?.map(dep => ({
          ...dep,
          passportExpiry: dep.passportExpiry ? dep.passportExpiry.toISOString() : null,
          visaExpiry: dep.visaExpiry ? dep.visaExpiry.toISOString() : null,
        }))
      };
      const response = await apiRequest("POST", "/api/employees", serializedData);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Employee created successfully!",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payroll/configs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/employee-payroll"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payroll/summary"] });
      form.reset();
      onClose();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create employee",
        variant: "destructive",
      });
    },
  });

  // Update employee mutation
  const updateMutation = useMutation({
    mutationFn: async (data: EmployeeFormData) => {
      // Convert Date objects to ISO strings for API
      const serializedData = {
        ...data,
        employeeId: data.employeeId?.trim(),
        joinDate: data.joinDate.toISOString(),
        dateOfBirth: data.dateOfBirth ? data.dateOfBirth.toISOString() : null,
        passportExpiry: data.passportExpiry ? data.passportExpiry.toISOString() : null,
        visaExpiry: data.visaExpiry ? data.visaExpiry.toISOString() : null,
        nricExpiry: data.nricExpiry ? data.nricExpiry.toISOString() : null,
        dependents: data.dependents?.map(dep => ({
          ...dep,
          passportExpiry: dep.passportExpiry ? dep.passportExpiry.toISOString() : null,
          visaExpiry: dep.visaExpiry ? dep.visaExpiry.toISOString() : null,
        }))
      };
      const response = await apiRequest("PUT", `/api/employees/${employee!.id}`, serializedData);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Employee updated successfully!",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payroll/configs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/employee-payroll"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payroll/summary"] });
      onClose();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update employee",
        variant: "destructive",
      });
    },
  });

  // File upload handler
  const handleFileUpload = (file: File, fieldName: string) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      form.setValue(fieldName as any, base64String);
    };
    reader.readAsDataURL(file);
  };

  const getFirstValidationMessage = (errors: FieldErrors<EmployeeFormData>): string => {
    const walk = (value: unknown): string | undefined => {
      if (!value || typeof value !== "object") return undefined;
      if ("message" in value && typeof (value as { message?: unknown }).message === "string") {
        return (value as { message: string }).message;
      }
      for (const nested of Object.values(value)) {
        const message = walk(nested);
        if (message) return message;
      }
      return undefined;
    };
    return walk(errors) ?? "Please complete all required fields";
  };

  // Handle form submission
  const onSubmit = (values: EmployeeFormData) => {
    // Auto-set status based on document expiry
    const updatedValues = { ...values };
    if (values.passportExpiry && isBefore(values.passportExpiry, new Date())) {
      // Could add logic here for expired document handling
    }

    if (employee) {
      updateMutation.mutate(updatedValues);
    } else {
      createMutation.mutate(updatedValues);
    }
  };

  const onInvalid = useCallback(
    (errors: FieldErrors<EmployeeFormData>) => {
      toast({
        title: "Cannot save employee",
        description: getFirstValidationMessage(errors),
        variant: "destructive",
      });
    },
    [toast]
  );

  // Handle keyboard shortcuts
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
    }
  };

  useEffect(() => {
    onPendingChange?.(createMutation.isPending || updateMutation.isPending);
  }, [createMutation.isPending, updateMutation.isPending, onPendingChange]);

  const formLabelClass = "text-sm font-medium text-[#111827]";
  const selectedNationality = form.watch("nationality");
  const isPrNationality = selectedNationality === "PR";

  const formBody = (
    <TooltipProvider>
      <Form {...form}>
        <form
          id={formId}
          onSubmit={form.handleSubmit(onSubmit, onInvalid)}
          onKeyDown={handleKeyDown}
          className="space-y-8"
        >
          <section className="space-y-4">
            <ModalSectionHeader icon={User} title="Personal Information" />
            <div className="space-y-4">
              {/* Row 1: Employee ID | Full Name */}
              <div className="grid grid-cols-1 items-start gap-x-6 gap-y-4 lg:grid-cols-2">
                <FormField control={form.control} name="employeeId" render={({ field }) => (
                  <FormItem>
                    <FormLabel className={formLabelClass}>Employee ID *</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g. EMP001"
                        className="font-mono"
                        {...field}
                        value={field.value || ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="name" render={({ field }) => (
                  <FormItem>
                    <FormLabel className={formLabelClass}>Full Name *</FormLabel>
                    <FormControl><Input placeholder="John Doe" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              {/* Row 2: Email | Phone */}
              <div className="grid grid-cols-1 items-start gap-x-6 gap-y-4 lg:grid-cols-2">
                <FormField control={form.control} name="email" render={({ field }) => (
                  <FormItem>
                    <FormLabel className={formLabelClass}>Email *</FormLabel>
                    <FormControl><Input type="email" placeholder="john.doe@company.com" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="phone" render={({ field }) => (
                  <FormItem>
                    <FormLabel className={formLabelClass}>Phone Number *</FormLabel>
                    <FormControl><Input type="tel" placeholder="+65 9123 4567" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              {/* Row 3: Department | Salary + Annual Salary */}
              <div className="grid grid-cols-1 items-start gap-x-6 gap-y-4 lg:grid-cols-2">
                <FormField control={form.control} name="department" render={({ field }) => (
                  <FormItem>
                    <FormLabel className={formLabelClass}>Department *</FormLabel>
                    <FormControl><Input placeholder="Engineering" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
                  <FormField control={form.control} name="salary" render={({ field }) => (
                    <FormItem>
                      <FormLabel className={formLabelClass}>Salary *</FormLabel>
                      <FormControl>
                        <Input
                          type="text"
                          inputMode="decimal"
                          placeholder=""
                          name={field.name}
                          ref={field.ref}
                          onBlur={field.onBlur}
                          value={field.value || ""}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (v !== "" && !/^\d*\.?\d*$/.test(v)) return;
                            field.onChange(v);
                            const monthly = parseFloat(v);
                            if (!Number.isNaN(monthly)) {
                              form.setValue("annualSalary", (monthly * 12).toFixed(2));
                            } else {
                              form.setValue("annualSalary", "");
                            }
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="annualSalary" render={({ field }) => (
                    <FormItem>
                      <FormLabel className={formLabelClass}>Annual Salary</FormLabel>
                      <FormControl>
                        <Input
                          type="text"
                          inputMode="decimal"
                          placeholder=""
                          name={field.name}
                          ref={field.ref}
                          onBlur={field.onBlur}
                          value={field.value || ""}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (v === "" || /^\d*\.?\d*$/.test(v)) field.onChange(v);
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
              </div>

              {/* Row 4: Designation | Nationality + PR Status */}
              <div className="grid grid-cols-1 items-start gap-x-6 gap-y-4 lg:grid-cols-2">
                <FormField control={form.control} name="designation" render={({ field }) => (
                  <FormItem>
                    <FormLabel className={formLabelClass}>Designation *</FormLabel>
                    <FormControl><Input placeholder="Software Engineer" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
                  <FormField control={form.control} name="nationality" render={({ field }) => (
                    <FormItem>
                      <FormLabel className={formLabelClass}>Nationality *</FormLabel>
                      <Select
                        onValueChange={(value) => {
                          field.onChange(value);
                          if (value !== "PR") {
                            form.setValue("prStatus", "");
                          }
                        }}
                        value={field.value || undefined}
                      >
                        <FormControl><SelectTrigger><SelectValue placeholder="Select nationality" /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="Singapore">Singapore</SelectItem>
                          <SelectItem value="PR">PR</SelectItem>
                          <SelectItem value="Foreigner">Foreigner</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="prStatus" render={({ field }) => (
                    <FormItem>
                      <FormLabel className={formLabelClass}>
                        PR Status{isPrNationality ? " *" : ""}
                      </FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value || undefined}
                        disabled={!isPrNationality}
                      >
                        <FormControl>
                          <SelectTrigger className={!isPrNationality ? "bg-[#F9FAFB]" : undefined}>
                            <SelectValue placeholder={isPrNationality ? "Select PR status" : "Only for PR nationality"} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="1 Year">1 Year</SelectItem>
                          <SelectItem value="2 Years">2 Years</SelectItem>
                          <SelectItem value="3 Years and Above">3 Years and Above</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
              </div>

              {/* Row 5: Join Date | Passport Number + Passport Expiry */}
              <div className="grid grid-cols-1 items-start gap-x-6 gap-y-4 lg:grid-cols-2">
                <FormField control={form.control} name="joinDate" render={({ field }) => (
                  <FormItem>
                    <FormLabel className={formLabelClass}>Join Date *</FormLabel>
                    <FormControl><SimpleDatePicker date={field.value} setDate={field.onChange} placeholder="Select join date" max={new Date().toISOString().split("T")[0]} min="1900-01-01" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
                  <FormField control={form.control} name="passportNumber" render={({ field }) => (
                    <FormItem>
                      <FormLabel className={formLabelClass}>Passport Number</FormLabel>
                      <FormControl><Input placeholder="A1234567" {...field} value={field.value || ""} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="passportExpiry" render={({ field }) => (
                    <FormItem>
                      <FormLabel className={formLabelClass}>Passport Expiry</FormLabel>
                      <FormControl><SimpleDatePicker date={field.value} setDate={field.onChange} placeholder="Select passport expiry" min="1900-01-01" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
              </div>

              {/* Row 6: Date of Birth | Visa Type + Status */}
              <div className="grid grid-cols-1 items-start gap-x-6 gap-y-4 lg:grid-cols-2">
                <FormField control={form.control} name="dateOfBirth" render={({ field }) => (
                  <FormItem>
                    <FormLabel className={formLabelClass}>Date of Birth *</FormLabel>
                    <FormControl><SimpleDatePicker date={field.value} setDate={field.onChange} placeholder="Select date of birth" max={new Date().toISOString().split("T")[0]} min="1900-01-01" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
                  <FormField control={form.control} name="visaType" render={({ field }) => (
                    <FormItem>
                      <FormLabel className={formLabelClass}>Visa Type</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || undefined}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select visa type" /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="s_pass">S Pass</SelectItem>
                          <SelectItem value="work_permit">Work Permit</SelectItem>
                          <SelectItem value="employment_pass">Employment Pass</SelectItem>
                          <SelectItem value="pr">Permanent Resident</SelectItem>
                          <SelectItem value="dependent_pass">Dependent Pass</SelectItem>
                          <SelectItem value="ltvp">Long Term Visit Pass</SelectItem>
                          <SelectItem value="student_pass">Student Pass</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="status" render={({ field }) => (
                    <FormItem>
                      <FormLabel className={formLabelClass}>Status</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="resigned">Resigned</SelectItem>
                          <SelectItem value="on_hold">On Hold</SelectItem>
                          <SelectItem value="terminated">Terminated</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
              </div>

              {/* Row 7: Company + NRIC/IC | Visa Permit + Visa Expiry + NRIC Expiry */}
              <div className="grid grid-cols-1 items-start gap-x-6 gap-y-4 lg:grid-cols-2">
                <div className="flex flex-col gap-y-4">
                  <FormField control={form.control} name="companyId" render={() => (
                    <FormItem>
                      <FormLabel className={formLabelClass}>Company</FormLabel>
                      <FormControl>
                        <Input
                          readOnly
                          disabled
                          value={selectedCompany?.name ?? ""}
                          className="bg-slate-50 text-slate-700"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="nricNumber" render={({ field }) => (
                    <FormItem>
                      <FormLabel className={formLabelClass}>NRIC/IC Number</FormLabel>
                      <FormControl><Input placeholder="S1234567A" {...field} value={field.value || ""} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                <div className="flex flex-col gap-y-4">
                  <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
                    <FormField control={form.control} name="visaNumber" render={({ field }) => (
                      <FormItem>
                        <FormLabel className={formLabelClass}>Visa Permit Number</FormLabel>
                        <FormControl><Input placeholder="WP1234567" {...field} value={field.value || ""} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="visaExpiry" render={({ field }) => (
                      <FormItem>
                        <FormLabel className={formLabelClass}>Visa Expiry</FormLabel>
                        <FormControl><SimpleDatePicker date={field.value} setDate={field.onChange} placeholder="Select visa expiry" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                  <FormField control={form.control} name="nricExpiry" render={({ field }) => (
                    <FormItem>
                      <FormLabel className={formLabelClass}>NRIC Expiry Date</FormLabel>
                      <FormControl><SimpleDatePicker date={field.value} setDate={field.onChange} placeholder="Select NRIC expiry date" min="1900-01-01" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
              </div>

              {/* Row 8: Address | Visa Remarks */}
              <div className="grid grid-cols-1 items-start gap-x-6 gap-y-4 lg:grid-cols-2">
                <FormField control={form.control} name="address" render={({ field }) => (
                  <FormItem>
                    <FormLabel className={formLabelClass}>Address *</FormLabel>
                    <FormControl><Textarea placeholder="123 Main Street, Singapore 123456" className="min-h-[100px]" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="visaRemarks" render={({ field }) => (
                  <FormItem>
                    <FormLabel className={formLabelClass}>Visa Remarks</FormLabel>
                    <FormControl><Textarea placeholder="Optional visa notes..." className="min-h-[100px]" {...field} value={field.value || ""} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <ModalSectionHeader icon={FileText} title="Document Uploads" />
            <div className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-2 lg:grid-cols-3">
              <FormField
                control={form.control}
                name="passportScan"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Passport Scan</FormLabel>
                            <FormControl>
                              <div className="flex flex-col gap-2">
                                <Input
                                  type="file"
                                  accept=".pdf,.jpg,.jpeg,.png"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) handleFileUpload(file, "passportScan");
                                  }}
                                />
                                {field.value && (
                                  <p className="text-xs text-green-600">File uploaded successfully</p>
                                )}
                              </div>
                            </FormControl>
                            <FormDescription className="text-xs">
                              Upload passport scan (PDF/JPG/PNG)
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Visa Scan */}
                      <FormField
                        control={form.control}
                        name="visaScan"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Visa/Work Permit Scan</FormLabel>
                            <FormControl>
                              <div className="flex flex-col gap-2">
                                <Input
                                  type="file"
                                  accept=".pdf,.jpg,.jpeg,.png"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) handleFileUpload(file, "visaScan");
                                  }}
                                />
                                {field.value && (
                                  <p className="text-xs text-green-600">File uploaded successfully</p>
                                )}
                              </div>
                            </FormControl>
                            <FormDescription className="text-xs">
                              Upload visa or work permit scan
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* NRIC Scan */}
                      <FormField
                        control={form.control}
                        name="nricScan"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>NRIC/ID Scan (Optional)</FormLabel>
                            <FormControl>
                              <div className="flex flex-col gap-2">
                                <Input
                                  type="file"
                                  accept=".pdf,.jpg,.jpeg,.png"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) handleFileUpload(file, "nricScan");
                                  }}
                                />
                                {field.value && (
                                  <p className="text-xs text-green-600">File uploaded successfully</p>
                                )}
                              </div>
                            </FormControl>
                            <FormDescription className="text-xs">
                              Upload NRIC or ID copy (optional)
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
            </div>
          </section>

          <section className="space-y-4">
            <ModalSectionHeader
              icon={Users}
              title="Dependents"
              action={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => addDependent({
                    name: "",
                    relationship: "spouse",
                    passportNumber: "",
                    passportExpiry: null,
                    visaNumber: "",
                    visaExpiry: null,
                    visaType: null,
                    passportScan: "",
                    visaScan: "",
                  })}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Dependent
                </Button>
              }
            />
            {dependentFields.length === 0 ? (
                        <p className="text-muted-foreground text-sm">No dependents added yet. Click "Add Dependent" to start.</p>
                      ) : (
                        <div className="space-y-6">
                          {dependentFields.map((dependent, index) => (
                            <div key={dependent.id} className="border rounded-lg p-4 space-y-4">
                              <div className="flex items-center justify-between">
                                <h4 className="text-sm font-medium">Dependent {index + 1}</h4>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removeDependent(index)}
                                  className="text-red-600 hover:text-red-700"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                              
                              <div className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-2">
                                {/* Dependent Name */}
                                <FormField
                                  control={form.control}
                                  name={`dependents.${index}.name`}
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>Full Name*</FormLabel>
                                      <FormControl>
                                        <Input placeholder="John Doe" {...field} />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />

                                {/* Relationship */}
                                <FormField
                                  control={form.control}
                                  name={`dependents.${index}.relationship`}
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>Relationship*</FormLabel>
                                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <FormControl>
                                          <SelectTrigger>
                                            <SelectValue placeholder="Select relationship" />
                                          </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                          <SelectItem value="spouse">Spouse</SelectItem>
                                          <SelectItem value="child">Child</SelectItem>
                                          <SelectItem value="parent">Parent</SelectItem>
                                          <SelectItem value="sibling">Sibling</SelectItem>
                                          <SelectItem value="other">Other</SelectItem>
                                        </SelectContent>
                                      </Select>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />

                                {/* Passport Number */}
                                <FormField
                                  control={form.control}
                                  name={`dependents.${index}.passportNumber`}
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>Passport Number</FormLabel>
                                      <FormControl>
                                        <Input placeholder="Optional" {...field} />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />

                                {/* Passport Expiry */}
                                <FormField
                                  control={form.control}
                                  name={`dependents.${index}.passportExpiry`}
                                  render={({ field }) => (
                                    <FormItem className="flex flex-col">
                                      <FormLabel>Passport Expiry</FormLabel>
                                      <FormControl>
                                        <SimpleDatePicker
                                          date={field.value}
                                          setDate={field.onChange}
                                          placeholder="Select passport expiry date"
                                        />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />

                                {/* Visa Number */}
                                <FormField
                                  control={form.control}
                                  name={`dependents.${index}.visaNumber`}
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>Visa Number</FormLabel>
                                      <FormControl>
                                        <Input placeholder="Optional" {...field} />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />

                                {/* Visa Expiry */}
                                <FormField
                                  control={form.control}
                                  name={`dependents.${index}.visaExpiry`}
                                  render={({ field }) => (
                                    <FormItem className="flex flex-col">
                                      <FormLabel>Visa Expiry</FormLabel>
                                      <FormControl>
                                        <SimpleDatePicker
                                          date={field.value}
                                          setDate={field.onChange}
                                          placeholder="Select visa expiry date"
                                        />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
            )}
          </section>

        </form>
      </Form>
    </TooltipProvider>
  );

  if (hideShell) {
    if (!isOpen) return null;
    return formBody;
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <FormModalShell
        title={isEditMode ? "Edit employee" : "Create new employee"}
        maxWidth="max-w-5xl"
        onClose={onClose}
        footer={
          <>
            <ModalCancelButton
              onClick={() => {
                form.reset();
                onClose();
              }}
            />
            <ModalSaveButton
              type="button"
              onClick={() => {
                const formEl = document.getElementById(formId) as HTMLFormElement | null;
                formEl?.requestSubmit();
              }}
              loading={createMutation.isPending || updateMutation.isPending}
              label="Save"
              loadingLabel="Saving..."
            />
          </>
        }
      >
        {formBody}
      </FormModalShell>
    </Dialog>
  );
}