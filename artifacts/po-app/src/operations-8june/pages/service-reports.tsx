import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Plus,
  Eye,
  Edit2,
  Trash2,
  FileText,
  Clock,
  User,
  Wrench,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { StringDatePicker } from "@/operations-8june/components/ui/date-picker";
import { Dialog } from "@/components/ui/dialog";
import {
  Form,
  FormControl,
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
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useForm } from "react-hook-form";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { zodResolver } from "@hookform/resolvers/zod";
import { apiRequest, queryClient } from "@/operations-8june/lib/queryClient";
import {
  ServiceReport,
  Employee,
  Customer,
  insertServiceReportSchema,
} from "@shared/schema";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { usePagination } from "@/hooks/use-pagination";
import {
  ManagementPageHeader,
  ManagementTableCard,
  ManagementTableContainer,
  ManagementEmptyState,
  ManagementSearchBar,
} from "@/operations-8june/components/layout/ManagementPageUI";
import {
  FormModalShell,
  ModalCancelButton,
  ModalSaveButton,
  ModalSectionHeader,
  modalFormClass,
} from "@/operations-8june/components/forms/FormModalShell";
import {
  EntityViewDialog,
  EntityViewField,
  EntityViewFieldGrid,
  EntityViewStatusBadge,
} from "@/operations-8june/components/ui/entity-view-dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const serviceReportFormSchema = insertServiceReportSchema
  .omit({ csrNumber: true, supportRequestDate: true, serviceDate: true })
  .extend({
    csrNumber: z.string().optional(),
    supportRequestDate: z.string().min(1, "Request date is required"),
    serviceDate: z.string().min(1, "Service date is required"),
    customerId: z.coerce.number().min(1, "Please select a customer"),
    customerName: z.string().min(1, "Customer name is required"),
    engineerId: z.coerce.number().optional(),
    hoursCharged: z.coerce.number().min(0).default(0),
  });

type ServiceReportFormData = z.infer<typeof serviceReportFormSchema>;

export default function ServiceReportsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [showViewDialog, setShowViewDialog] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [selectedReport, setSelectedReport] = useState<ServiceReport | null>(null);
  const [deletingReport, setDeletingReport] = useState<ServiceReport | null>(null);
  const { toast } = useToast();

  const { data: serviceReports = [], isLoading } = useQuery<ServiceReport[]>({
    queryKey: ["/api/service-reports"],
  });

  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ["/api/employees"],
  });

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const { data: runningNumbers = [] } = useQuery<
    { type: string; prefix?: string; suffix?: string; currentNumber?: number; numberLength?: number }[]
  >({
    queryKey: ["/api/running-numbers"],
    enabled: showForm && !isEditing,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const serviceReportRunningNumber = runningNumbers.find((rn) => rn.type === "service_report");
  const nextCsrPreview = serviceReportRunningNumber
    ? (() => {
        const next = (serviceReportRunningNumber.currentNumber ?? 0) + 1;
        const padLength = serviceReportRunningNumber.numberLength ?? 0;
        const numberPart =
          padLength > 0 ? next.toString().padStart(padLength, "0") : next.toString();
        return `${serviceReportRunningNumber.prefix || ""}${numberPart}${serviceReportRunningNumber.suffix || ""}`;
      })()
    : "";

  const form = useForm<ServiceReportFormData>({
    resolver: zodResolver(serviceReportFormSchema),
    defaultValues: {
      csrNumber: "",
      customerId: undefined,
      customerName: "",
      customerAddress: "",
      customerContactPerson: "",
      customerPhone: "",
      customerEmail: "",
      supportRequestedBy: "",
      supportRequestDate: "",
      problemDescription: "",
      priorityLevel: "medium",
      status: "pending",
      engineerId: undefined,
      serviceDate: "",
      serviceTime: "",
      hoursCharged: 0,
      serviceDetails: "",
      remarks: "",
    },
  });

  useEffect(() => {
    if (showForm && !isEditing && nextCsrPreview) {
      form.setValue("csrNumber", nextCsrPreview);
    }
  }, [showForm, isEditing, nextCsrPreview, form]);

  const createMutation = useMutation({
    mutationFn: async (data: ServiceReportFormData) => {
      const response = await apiRequest("POST", "/api/service-reports", data);
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || "Failed to create service report");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-reports"] });
      queryClient.invalidateQueries({ queryKey: ["/api/running-numbers"] });
      toast({ title: "Success", description: "Service report created successfully." });
      closeForm();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: ServiceReportFormData & { id: number }) => {
      const { id, ...updateData } = data;
      const response = await apiRequest("PUT", `/api/service-reports/${id}`, updateData);
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || "Failed to update service report");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-reports"] });
      toast({ title: "Success", description: "Service report updated successfully." });
      closeForm();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/service-reports/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-reports"] });
      toast({ title: "Success", description: "Service report deleted successfully." });
      setDeletingReport(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const closeForm = () => {
    setShowForm(false);
    setIsEditing(false);
    setEditingId(null);
    form.reset();
  };

  const openCreateForm = () => {
    setIsEditing(false);
    setEditingId(null);
    form.reset({
      csrNumber: "",
      customerId: undefined,
      customerName: "",
      customerAddress: "",
      customerContactPerson: "",
      customerPhone: "",
      customerEmail: "",
      supportRequestedBy: "",
      supportRequestDate: "",
      problemDescription: "",
      priorityLevel: "medium",
      status: "pending",
      engineerId: undefined,
      serviceDate: "",
      serviceTime: "",
      hoursCharged: 0,
      serviceDetails: "",
      remarks: "",
    });
    setShowForm(true);
  };

  const handleEditReport = (report: ServiceReport) => {
    setIsEditing(true);
    setEditingId(report.id);
    form.reset({
      csrNumber: report.csrNumber || "",
      customerId: report.customerId,
      customerName: report.customerName,
      customerAddress: report.customerAddress || "",
      customerContactPerson: report.customerContactPerson || "",
      customerPhone: report.customerPhone || "",
      customerEmail: report.customerEmail || "",
      supportRequestedBy: report.supportRequestedBy || "",
      supportRequestDate: report.supportRequestDate
        ? new Date(report.supportRequestDate).toISOString().split("T")[0]
        : "",
      problemDescription: report.problemDescription || "",
      priorityLevel: report.priorityLevel as ServiceReportFormData["priorityLevel"],
      status: report.status as ServiceReportFormData["status"],
      engineerId: report.engineerId || undefined,
      serviceDate: report.serviceDate
        ? new Date(report.serviceDate).toISOString().split("T")[0]
        : "",
      serviceTime: report.serviceTime || "",
      hoursCharged: Number(report.hoursCharged) || 0,
      serviceDetails: report.serviceDetails || "",
      remarks: report.remarks || "",
    });
    setShowForm(true);
  };

  const handleCustomerSelect = (customerId: string) => {
    const id = parseInt(customerId, 10);
    form.setValue("customerId", id);
    const selected = customers.find((c) => c.id === id);
    if (selected) {
      form.setValue("customerName", selected.company || selected.name);
      form.setValue("customerAddress", selected.address || "");
      form.setValue("customerContactPerson", selected.name);
      form.setValue("customerPhone", selected.phone || "");
      form.setValue("customerEmail", selected.email || "");
      if (!form.getValues("supportRequestedBy")) {
        form.setValue("supportRequestedBy", selected.name);
      }
    }
  };

  const handleSubmit = (data: ServiceReportFormData) => {
    const submitData = {
      ...data,
      supportRequestDate: new Date(data.supportRequestDate),
      serviceDate: new Date(data.serviceDate),
      engineerId: data.engineerId && data.engineerId > 0 ? data.engineerId : undefined,
    };

    if (isEditing && editingId) {
      updateMutation.mutate({ ...submitData, id: editingId });
    } else {
      const { csrNumber: _preview, ...createData } = submitData;
      createMutation.mutate(createData);
    }
  };

  const getEngineerName = (engineerId: number | null | undefined) => {
    if (!engineerId) return "—";
    const employee = employees.find((e) => e.id === engineerId);
    return employee?.name || `Engineer #${engineerId}`;
  };

  const formatDate = (date: string | Date) => new Date(date).toLocaleDateString("en-SG");

  const filteredReports = useMemo(
    () => serviceReports.filter(
      (report) =>
        report.csrNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        report.customerName?.toLowerCase().includes(searchTerm.toLowerCase()),
    ),
    [serviceReports, searchTerm],
  );

  const { page, setPage, totalPages, paginatedItems } = usePagination(filteredReports);

  const pendingCount = serviceReports.filter((r) => r.status === "pending").length;
  const resolvedCount = serviceReports.filter((r) => r.status === "resolved").length;
  const abortedCount = serviceReports.filter((r) => r.status === "aborted").length;

  if (isLoading) {
    return (
      <>
        <ManagementPageHeader title="Service Reports" />
        <ManagementTableCard>
          <div className="flex justify-center items-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-[#2563EB]" />
          </div>
        </ManagementTableCard>
      </>
    );
  }

  return (
    <>
      <ManagementPageHeader
        title="Service Reports"
        description="Manage customer service requests and CSR documentation"
        action={
          <Button
            className="bg-[#2563EB] text-white shadow-sm hover:bg-[#2563EB]"
            onClick={openCreateForm}
          >
            <Plus className="mr-2 h-4 w-4" />
            New Service Report
          </Button>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
        {[
          { label: "Total Reports", value: serviceReports.length, icon: FileText },
          { label: "Pending", value: pendingCount, icon: Clock },
          { label: "Resolved", value: resolvedCount, icon: Clock },
          { label: "Aborted", value: abortedCount, icon: FileText },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-[#6B7280]">{stat.label}</p>
              <stat.icon className="h-4 w-4 text-[#6B7280]" />
            </div>
            <p className="mt-2 text-2xl font-bold text-[#111827]">{stat.value}</p>
          </div>
        ))}
      </div>

      <ManagementSearchBar
        value={searchTerm}
        onChange={setSearchTerm}
        placeholder="Search service reports..."
      />

      <ManagementTableCard pagination={{ page, totalPages, onPageChange: setPage }}>
        {filteredReports.length > 0 ? (
          <ManagementTableContainer>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>CSR Number</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Service Date</TableHead>
                  <TableHead>Engineer</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Hours</TableHead>
                  <TableHead className="w-px text-left">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedItems.map((report) => (
                  <TableRow key={report.id}>
                    <TableCell className="font-medium text-[#111827]">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedReport(report);
                          setShowViewDialog(true);
                        }}
                        className="font-medium text-[#111827] hover:underline"
                      >
                        {report.csrNumber}
                      </button>
                    </TableCell>
                    <TableCell className="text-[#444651]">
                      <div className="flex flex-col">
                        <span className="font-medium text-[#111827]">{report.customerName}</span>
                        <span className="text-xs text-[#6B7280]">
                          {report.customerContactPerson || "—"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-[#444651]">
                      <div className="flex flex-col">
                        <span>{formatDate(report.serviceDate)}</span>
                        <span className="text-xs text-[#6B7280]">{report.serviceTime || "—"}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-[#444651]">
                      {getEngineerName(report.engineerId)}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${
                          report.status === "resolved"
                            ? "bg-green-100 text-green-800"
                            : report.status === "aborted"
                              ? "bg-red-100 text-red-800"
                              : "bg-yellow-100 text-yellow-800"
                        }`}
                      >
                        {report.status}
                      </span>
                    </TableCell>
                    <TableCell className="capitalize text-[#444651]">
                      {report.priorityLevel}
                    </TableCell>
                    <TableCell className="text-[#444651]">{report.hoursCharged}h</TableCell>
                    <TableCell className="w-px whitespace-nowrap">
                      <div className="flex items-center justify-start gap-2">
                        <button
                          type="button"
                          title="View report"
                          onClick={() => {
                            setSelectedReport(report);
                            setShowViewDialog(true);
                          }}
                          className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-50 text-[#444651] transition-colors hover:bg-gray-100"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          title="Edit report"
                          onClick={() => handleEditReport(report)}
                          className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-[#2563EB] transition-colors hover:bg-blue-100"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          title="Delete report"
                          onClick={() => setDeletingReport(report)}
                          className="flex h-8 w-8 items-center justify-center rounded-full bg-red-50 text-red-600 transition-colors hover:bg-red-100"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ManagementTableContainer>
        ) : (
          <ManagementEmptyState
            title="No service reports found"
            description={
              searchTerm
                ? "Try adjusting your search terms."
                : "Get started by creating your first service report."
            }
            action={
              !searchTerm ? (
                <Button
                  className="bg-[#2563EB] text-white shadow-sm hover:bg-[#2563EB]"
                  onClick={openCreateForm}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Create Service Report
                </Button>
              ) : undefined
            }
          />
        )}
      </ManagementTableCard>

      <Dialog open={showForm} onOpenChange={(open) => !open && closeForm()}>
        <FormModalShell
          title={isEditing ? "Edit Service Report" : "Create New Service Report"}
          onClose={closeForm}
          className="flex h-[min(720px,90vh)] max-h-[min(720px,90vh)] flex-col !grid-cols-none"
          bodyClassName="min-h-0 flex-1 overflow-y-auto"
          footer={
            <>
              <ModalCancelButton onClick={closeForm} />
              <ModalSaveButton
                form="service-report-form"
                loading={createMutation.isPending || updateMutation.isPending}
                label={isEditing ? "Update" : "Save"}
                loadingLabel={isEditing ? "Updating..." : "Saving..."}
              />
            </>
          }
        >
          <Form {...form}>
            <form
              id="service-report-form"
              onSubmit={form.handleSubmit(handleSubmit)}
              className={modalFormClass}
            >
              <section>
                <ModalSectionHeader icon={User} title="Customer Information" />
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="csrNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>CSR Number</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder={nextCsrPreview || "Auto-generated on save"}
                            className="h-11 font-mono"
                            readOnly
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="customerId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Customer *</FormLabel>
                        <Select
                          onValueChange={handleCustomerSelect}
                          value={field.value ? field.value.toString() : undefined}
                        >
                          <FormControl>
                            <SelectTrigger className="h-11">
                              <SelectValue placeholder="Select customer" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {customers.map((customer) => (
                              <SelectItem key={customer.id} value={customer.id.toString()}>
                                {customer.name} — {customer.company || "No company"}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="customerContactPerson"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contact Person</FormLabel>
                        <FormControl>
                          <Input {...field} className="h-11" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="customerPhone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone</FormLabel>
                        <FormControl>
                          <Input {...field} className="h-11" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="customerEmail"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input {...field} type="email" className="h-11" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </section>

              <section>
                <ModalSectionHeader icon={FileText} title="Request Details" />
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="supportRequestedBy"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Support Requested By</FormLabel>
                        <FormControl>
                          <Input {...field} className="h-11" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="supportRequestDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Request Date *</FormLabel>
                        <FormControl>
                          <StringDatePicker value={field.value ?? ""} onChange={field.onChange} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="priorityLevel"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Priority Level</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger className="h-11">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="low">Low</SelectItem>
                            <SelectItem value="medium">Medium</SelectItem>
                            <SelectItem value="high">High</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Status</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger className="h-11">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="resolved">Resolved</SelectItem>
                            <SelectItem value="aborted">Aborted</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="problemDescription"
                  render={({ field }) => (
                    <FormItem className="mt-4">
                      <FormLabel>Problem Description</FormLabel>
                      <FormControl>
                        <Textarea {...field} rows={3} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </section>

              <section>
                <ModalSectionHeader icon={Wrench} title="Service Details" />
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="engineerId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Engineer</FormLabel>
                        <Select
                          onValueChange={(value) =>
                            field.onChange(value ? parseInt(value, 10) : undefined)
                          }
                          value={field.value ? field.value.toString() : undefined}
                        >
                          <FormControl>
                            <SelectTrigger className="h-11">
                              <SelectValue placeholder="Select engineer" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {employees.map((employee) => (
                              <SelectItem key={employee.id} value={employee.id.toString()}>
                                {employee.name}
                                {employee.designation ? ` — ${employee.designation}` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="serviceDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Service Date *</FormLabel>
                        <FormControl>
                          <StringDatePicker value={field.value ?? ""} onChange={field.onChange} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="serviceTime"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Service Time</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="e.g., 09:00 - 12:00" className="h-11" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="hoursCharged"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Hours Charged</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.25" className="h-11" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="serviceDetails"
                  render={({ field }) => (
                    <FormItem className="mt-4">
                      <FormLabel>Service Details</FormLabel>
                      <FormControl>
                        <Textarea {...field} rows={3} placeholder="Work performed and resolution" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="remarks"
                  render={({ field }) => (
                    <FormItem className="mt-4">
                      <FormLabel>Remarks</FormLabel>
                      <FormControl>
                        <Textarea {...field} rows={2} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </section>
            </form>
          </Form>
        </FormModalShell>
      </Dialog>

      <EntityViewDialog
        open={showViewDialog}
        onOpenChange={setShowViewDialog}
        title="Service Report Details"
        onClose={() => setShowViewDialog(false)}
        maxWidth="max-w-3xl"
      >
        {selectedReport && (
          <EntityViewFieldGrid>
            <EntityViewField label="CSR Number" value={selectedReport.csrNumber} />
            <EntityViewField label="Company" value={selectedReport.customerName} />
            <EntityViewField label="Contact Person" value={selectedReport.customerContactPerson} />
            <EntityViewField label="Engineer" value={getEngineerName(selectedReport.engineerId)} />
            <EntityViewField label="Phone" value={selectedReport.customerPhone} />
            <EntityViewField label="Email" value={selectedReport.customerEmail} />
            <EntityViewField
              label="Status"
              value={
                <EntityViewStatusBadge
                  status={selectedReport.status}
                  variant={selectedReport.status === "resolved" ? "valid" : "neutral"}
                />
              }
            />
            <EntityViewField label="Service Date" value={formatDate(selectedReport.serviceDate)} />
            <EntityViewField label="Hours Charged" value={String(selectedReport.hoursCharged)} />
            <EntityViewField
              label="Problem Description"
              value={selectedReport.problemDescription}
              fullWidth
            />
            <EntityViewField
              label="Service Details"
              value={selectedReport.serviceDetails}
              fullWidth
            />
          </EntityViewFieldGrid>
        )}
      </EntityViewDialog>

      <AlertDialog open={!!deletingReport} onOpenChange={() => setDeletingReport(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete service report?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete CSR {deletingReport?.csrNumber}. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => deletingReport && deleteMutation.mutate(deletingReport.id)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
