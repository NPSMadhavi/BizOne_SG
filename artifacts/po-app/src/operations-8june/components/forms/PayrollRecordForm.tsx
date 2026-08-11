import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { StringDatePicker } from "@/operations-8june/components/ui/date-picker";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calculator, FileText, DollarSign, CheckCircle, Clock, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/operations-8june/lib/queryClient";

const payrollRecordSchema = z.object({
  employeeId: z.number().min(1, "Please select an employee"),
  payPeriodStart: z.string().min(1, "Pay period start is required"),
  payPeriodEnd: z.string().min(1, "Pay period end is required"),
  overtimeHours: z.string().optional(),
  notes: z.string().optional(),
});

type PayrollRecordFormData = z.infer<typeof payrollRecordSchema>;

interface PayrollRecord {
  id: number;
  employeeId: number;
  employeeName: string;
  employeeEmail: string;
  department: string;
  designation: string;
  payPeriodStart: string;
  payPeriodEnd: string;
  baseSalary: string;
  overtimeHours: string;
  overtimePay: string;
  allowances: Record<string, number>;
  deductions: Record<string, number>;
  grossPay: string;
  taxDeduction: string;
  cpfDeduction: string;
  netPay: string;
  status: 'draft' | 'pending' | 'approved' | 'paid' | 'cancelled';
  paymentDate?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

interface PayrollConfig {
  id: number;
  employeeId: number;
  employeeName: string;
  employeeEmail: string;
  department: string;
  designation: string;
  baseSalary: string;
  payrollPeriod: 'monthly' | 'bi_weekly' | 'weekly';
  hourlyRate?: string;
  overtimeRate?: string;
  allowances: Record<string, number>;
  deductions: Record<string, number>;
  taxRate: string;
  cpfRate: string;
  isActive: boolean;
}

interface PayrollRecordFormProps {
  isOpen: boolean;
  onClose: () => void;
  record?: PayrollRecord | null;
}

export function PayrollRecordForm({ isOpen, onClose, record }: PayrollRecordFormProps) {
  const { toast } = useToast();
  const isEditMode = !!record;
  const [selectedEmployee, setSelectedEmployee] = useState<PayrollConfig | null>(null);

  // Fetch payroll configurations for employee selection
  const { data: configs } = useQuery<PayrollConfig[]>({
    queryKey: ["/api/payroll/configs"],
  });

  const form = useForm<PayrollRecordFormData>({
    resolver: zodResolver(payrollRecordSchema),
    defaultValues: {
      employeeId: record?.employeeId || undefined,
      payPeriodStart: record?.payPeriodStart || "",
      payPeriodEnd: record?.payPeriodEnd || "",
      overtimeHours: record?.overtimeHours || "",
      notes: record?.notes || "",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: PayrollRecordFormData) => {
      const response = await apiRequest("POST", "/api/payroll/records", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payroll/records"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payroll/summary"] });
      toast({
        title: "Success",
        description: "Payroll record created successfully",
      });
      onClose();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create payroll record",
        variant: "destructive",
      });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status, notes }: { id: number; status: string; notes?: string }) => {
      const response = await apiRequest("PUT", `/api/payroll/records/${id}/status`, {
        status,
        notes,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payroll/records"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payroll/summary"] });
      toast({
        title: "Success",
        description: "Payroll record status updated successfully",
      });
      onClose();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update payroll record",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: PayrollRecordFormData) => {
    if (!isEditMode) {
      createMutation.mutate(data);
    }
  };

  const updateStatus = (status: string) => {
    if (record) {
      updateStatusMutation.mutate({
        id: record.id,
        status,
        notes: form.getValues("notes"),
      });
    }
  };

  const handleEmployeeChange = (employeeId: string) => {
    const empId = parseInt(employeeId);
    form.setValue("employeeId", empId);
    
    const config = configs?.find(c => c.employeeId === empId);
    setSelectedEmployee(config || null);
    
    // Auto-set pay period based on current date and payroll period
    if (config) {
      const today = new Date();
      let startDate: Date;
      let endDate: Date;
      
      if (config.payrollPeriod === 'monthly') {
        startDate = new Date(today.getFullYear(), today.getMonth(), 1);
        endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      } else if (config.payrollPeriod === 'bi_weekly') {
        // Simplified bi-weekly calculation
        const dayOfMonth = today.getDate();
        if (dayOfMonth <= 15) {
          startDate = new Date(today.getFullYear(), today.getMonth(), 1);
          endDate = new Date(today.getFullYear(), today.getMonth(), 15);
        } else {
          startDate = new Date(today.getFullYear(), today.getMonth(), 16);
          endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        }
      } else { // weekly
        const dayOfWeek = today.getDay();
        startDate = new Date(today);
        startDate.setDate(today.getDate() - dayOfWeek);
        endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + 6);
      }
      
      form.setValue("payPeriodStart", startDate.toISOString().split('T')[0]);
      form.setValue("payPeriodEnd", endDate.toISOString().split('T')[0]);
    }
  };

  const calculateProjectedPay = () => {
    if (!selectedEmployee) return null;

    const baseSalary = parseFloat(selectedEmployee.baseSalary);
    const overtimeHours = parseFloat(form.watch("overtimeHours") || "0");
    const overtimeRate = parseFloat(selectedEmployee.overtimeRate || "0");
    const taxRate = parseFloat(selectedEmployee.taxRate || "0");

    const overtimePay = overtimeHours * overtimeRate;
    const allowancesTotal = Object.values(selectedEmployee.allowances || {}).reduce(
      (sum, amount) => sum + amount, 0
    );
    const deductionsTotal = Object.values(selectedEmployee.deductions || {}).reduce(
      (sum, amount) => sum + amount, 0
    );

    const grossPay = baseSalary + overtimePay + allowancesTotal - deductionsTotal;
    const taxDeduction = (grossPay * taxRate) / 100;
    const netPay = grossPay - taxDeduction;

    return {
      baseSalary,
      overtimePay,
      allowancesTotal,
      deductionsTotal,
      grossPay,
      taxDeduction,
      cpfDeduction: null,
      netPay,
    };
  };

  const projectedPay = calculateProjectedPay();

  const formatCurrency = (amount: string | number) => {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return new Intl.NumberFormat('en-SG', {
      style: 'currency',
      currency: 'SGD',
    }).format(num || 0);
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, any> = {
      draft: "secondary",
      pending: "outline",
      approved: "default",
      paid: "default",
      cancelled: "destructive",
    };

    const colors: Record<string, string> = {
      draft: "text-gray-600",
      pending: "text-yellow-600",
      approved: "text-blue-600",
      paid: "text-green-600",
      cancelled: "text-red-600",
    };

    return (
      <Badge variant={variants[status]} className={colors[status]}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  const canUpdateStatus = (currentStatus: string, newStatus: string) => {
    const transitions: Record<string, string[]> = {
      draft: ['pending', 'cancelled'],
      pending: ['approved', 'cancelled'],
      approved: ['paid', 'cancelled'],
      paid: [],
      cancelled: [],
    };
    return transitions[currentStatus]?.includes(newStatus) || false;
  };

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent 
        side="right"
        className="w-full max-w-[800px] p-0 overflow-hidden"
      >
        <Form {...form}>
          <div className="h-full flex flex-col">
            {/* Header */}
            <SheetHeader className="flex-shrink-0 px-6 py-4 border-b bg-background">
              <SheetTitle className="flex items-center gap-2 text-xl">
                <Calculator className="h-5 w-5 text-primary" />
                {isEditMode ? "View Payroll Record" : "Process Payroll"}
                {isEditMode && (
                  <div className="ml-auto">
                    {getStatusBadge(record!.status)}
                  </div>
                )}
              </SheetTitle>
            </SheetHeader>

            {/* Form Content - Scrollable Area */}
            <div className="flex-1 overflow-y-auto px-6 py-6 pb-24">
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                
                {/* Employee Selection & Pay Period */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <FileText className="h-4 w-4" />
                      Payroll Information
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    
                    {/* Employee Selection */}
                    <FormField
                      control={form.control}
                      name="employeeId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Employee*</FormLabel>
                          <Select 
                            onValueChange={handleEmployeeChange}
                            value={field.value?.toString()}
                            disabled={isEditMode}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select employee for payroll processing" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {configs?.filter(c => c.isActive).map((config) => (
                                <SelectItem key={config.employeeId} value={config.employeeId.toString()}>
                                  <div>
                                    <div className="font-medium">{config.employeeName}</div>
                                    <div className="text-sm text-muted-foreground">
                                      {config.designation} • {config.department} • {formatCurrency(config.baseSalary)}
                                    </div>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-2 gap-4">
                      {/* Pay Period Start */}
                      <FormField
                        control={form.control}
                        name="payPeriodStart"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Pay Period Start*</FormLabel>
                            <FormControl>
                              <StringDatePicker
                                value={field.value ?? ""}
                                onChange={(v) => field.onChange(v)}
                                disabled={isEditMode}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Pay Period End */}
                      <FormField
                        control={form.control}
                        name="payPeriodEnd"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Pay Period End*</FormLabel>
                            <FormControl>
                              <StringDatePicker
                                value={field.value ?? ""}
                                onChange={(v) => field.onChange(v)}
                                disabled={isEditMode}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    {/* Overtime Hours */}
                    <FormField
                      control={form.control}
                      name="overtimeHours"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Overtime Hours</FormLabel>
                          <FormControl>
                            <Input
                              type="text"
                              inputMode="decimal"
                              placeholder=""
                              name={field.name}
                              ref={field.ref}
                              onBlur={field.onBlur}
                              value={field.value ?? ""}
                              disabled={isEditMode}
                              onChange={(e) => {
                                const v = e.target.value;
                                if (v !== "" && !/^\d*\.?\d*$/.test(v)) return;
                                field.onChange(v);
                              }}
                            />
                          </FormControl>
                          <FormDescription>
                            {selectedEmployee?.overtimeRate && 
                              `Overtime rate: ${formatCurrency(selectedEmployee.overtimeRate)}/hour`
                            }
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Notes */}
                    <FormField
                      control={form.control}
                      name="notes"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Notes</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Additional notes or comments about this payroll record..."
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>

                {/* Payroll Calculation Preview */}
                {(projectedPay || isEditMode) && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <DollarSign className="h-4 w-4" />
                        {isEditMode ? "Payroll Details" : "Projected Calculation"}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {isEditMode ? (
                        // Show actual record data
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Basic Salary:</span>
                              <span className="font-medium">{formatCurrency(record!.baseSalary)}</span>
                            </div>
                            {parseFloat(record!.overtimeHours) > 0 && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">
                                  Overtime ({record!.overtimeHours}h):
                                </span>
                                <span className="font-medium">{formatCurrency(record!.overtimePay)}</span>
                              </div>
                            )}
                            {Object.entries(record!.allowances || {}).map(([name, amount]) => (
                              <div key={name} className="flex justify-between">
                                <span className="text-muted-foreground">{name}:</span>
                                <span className="font-medium">{formatCurrency(amount)}</span>
                              </div>
                            ))}
                          </div>
                          <div className="space-y-2">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Gross Pay:</span>
                              <span className="font-medium">{formatCurrency(record!.grossPay)}</span>
                            </div>
                            <div className="flex justify-between text-red-600">
                              <span>Tax Deduction:</span>
                              <span>-{formatCurrency(record!.taxDeduction)}</span>
                            </div>
                            <div className="flex justify-between text-red-600">
                              <span>CPF Deduction:</span>
                              <span>-{formatCurrency(record!.cpfDeduction)}</span>
                            </div>
                            {Object.entries(record!.deductions || {}).map(([name, amount]) => (
                              <div key={name} className="flex justify-between text-red-600">
                                <span>{name}:</span>
                                <span>-{formatCurrency(amount)}</span>
                              </div>
                            ))}
                            <div className="flex justify-between text-lg font-bold border-t pt-2">
                              <span>Net Pay:</span>
                              <span className="text-green-600">{formatCurrency(record!.netPay)}</span>
                            </div>
                          </div>
                        </div>
                      ) : projectedPay ? (
                        // Show projected calculation
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Basic Salary:</span>
                              <span className="font-medium">{formatCurrency(projectedPay.baseSalary)}</span>
                            </div>
                            {projectedPay.overtimePay > 0 && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">
                                  Overtime ({form.watch("overtimeHours")}h):
                                </span>
                                <span className="font-medium">{formatCurrency(projectedPay.overtimePay)}</span>
                              </div>
                            )}
                            {Object.entries(selectedEmployee?.allowances || {}).map(([name, amount]) => (
                              <div key={name} className="flex justify-between">
                                <span className="text-muted-foreground">{name}:</span>
                                <span className="font-medium">{formatCurrency(amount)}</span>
                              </div>
                            ))}
                          </div>
                          <div className="space-y-2">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Gross Pay:</span>
                              <span className="font-medium">{formatCurrency(projectedPay.grossPay)}</span>
                            </div>
                            <div className="flex justify-between text-red-600">
                              <span>Tax Deduction:</span>
                              <span>-{formatCurrency(projectedPay.taxDeduction)}</span>
                            </div>
                            {projectedPay.cpfDeduction !== null && (
                              <div className="flex justify-between text-red-600">
                                <span>CPF Deduction:</span>
                                <span>-{formatCurrency(projectedPay.cpfDeduction)}</span>
                              </div>
                            )}
                            {Object.entries(selectedEmployee?.deductions || {}).map(([name, amount]) => (
                              <div key={name} className="flex justify-between text-red-600">
                                <span>{name}:</span>
                                <span>-{formatCurrency(amount)}</span>
                              </div>
                            ))}
                            <div className="flex justify-between text-lg font-bold border-t pt-2">
                              <span>Net Pay:</span>
                              <span className="text-green-600">{formatCurrency(projectedPay.netPay)}</span>
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                )}
              </form>
            </div>

            {/* Footer Actions */}
            <div className="flex-shrink-0 border-t bg-background px-6 py-4">
              <div className="flex justify-between">
                <Button variant="outline" onClick={onClose}>
                  Close
                </Button>
                
                <div className="flex gap-2">
                  {isEditMode ? (
                    // Status update buttons for existing records
                    <>
                      {canUpdateStatus(record!.status, 'pending') && (
                        <Button
                          variant="outline"
                          onClick={() => updateStatus('pending')}
                          disabled={updateStatusMutation.isPending}
                        >
                          <Clock className="h-4 w-4 mr-2" />
                          Submit for Approval
                        </Button>
                      )}
                      {canUpdateStatus(record!.status, 'approved') && (
                        <Button
                          onClick={() => updateStatus('approved')}
                          disabled={updateStatusMutation.isPending}
                        >
                          <CheckCircle className="h-4 w-4 mr-2" />
                          Approve
                        </Button>
                      )}
                      {canUpdateStatus(record!.status, 'paid') && (
                        <Button
                          onClick={() => updateStatus('paid')}
                          disabled={updateStatusMutation.isPending}
                        >
                          <DollarSign className="h-4 w-4 mr-2" />
                          Mark as Paid
                        </Button>
                      )}
                      {canUpdateStatus(record!.status, 'cancelled') && (
                        <Button
                          variant="destructive"
                          onClick={() => updateStatus('cancelled')}
                          disabled={updateStatusMutation.isPending}
                        >
                          <X className="h-4 w-4 mr-2" />
                          Cancel
                        </Button>
                      )}
                    </>
                  ) : (
                    // Create button for new records
                    <Button 
                      onClick={form.handleSubmit(onSubmit)}
                      disabled={createMutation.isPending || !selectedEmployee}
                    >
                      <Calculator className="h-4 w-4 mr-2" />
                      Process Payroll
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </Form>
      </SheetContent>
    </Sheet>
  );
}