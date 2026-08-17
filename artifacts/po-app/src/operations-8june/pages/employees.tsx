import { useState, Fragment, useMemo } from "react";
import { useLocation } from "wouter";
import {
  ManagementPageHeader,
  ManagementTableCard,
  ManagementTableContainer,
  ManagementEmptyState,
  ManagementSearchBar,
} from "@/operations-8june/components/layout/ManagementPageUI";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { FormModalShell, ModalCancelButton, ModalSaveButton } from "@/operations-8june/components/forms/FormModalShell";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Employee } from "@shared/schema";
import { queryClient, apiRequest } from "@/operations-8june/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { usePagination } from "@/hooks/use-pagination";
import { format } from "date-fns";
import {
  exportEmployeesToExcel,
  exportEmployeesToPdf,
} from "@/operations-8june/lib/employee-export";

import {
  Plus,
  Trash2,
  FileText,
  Eye,
  Edit2,
  Download,
  ChevronDown,
} from "lucide-react";
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
import {
  Dialog,
} from "@/components/ui/dialog";
import {
  EntityViewDialog,
  EntityViewField,
  EntityViewFieldGrid,
  EntityViewStatusBadge,
  formatViewDate,
} from "@/operations-8june/components/ui/entity-view-dialog";
import DocumentForm from "@/operations-8june/components/forms/DocumentForm";

export default function EmployeesPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDocumentFormOpen, setIsDocumentFormOpen] = useState(false);
  const [documentFormPending, setDocumentFormPending] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(null);
  
  // Fetch employees
  const { data: employees = [], isLoading } = useQuery<Employee[]>({
    queryKey: ["/api/employees"],
  });
  
  // Delete employee mutation
  const deleteEmployeeMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/employees/${id}`);
    },
    onSuccess: () => {
      toast({
        title: "Employee deleted",
        description: "The employee has been deleted successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      setIsDeleteDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete employee",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  const handleViewEmployee = (id: number) => {
    setSelectedEmployeeId(id);
    setIsViewDialogOpen(true);
  };

  const handleEditEmployee = (id: number) => {
    setLocation(`/employees/${id}/edit`);
  };
  
  const handleDeleteEmployee = (id: number) => {
    setSelectedEmployeeId(id);
    setIsDeleteDialogOpen(true);
  };
  
  const handleAddDocument = (id: number) => {
    setSelectedEmployeeId(id);
    setIsDocumentFormOpen(true);
  };
  
  const confirmDelete = () => {
    if (selectedEmployeeId) {
      deleteEmployeeMutation.mutate(selectedEmployeeId);
    }
  };

  const filteredEmployees = useMemo(() => employees.filter((employee) => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return true;
    return [
      employee.employeeId,
      employee.name,
      employee.department,
      employee.designation,
      employee.passportNumber,
      employee.visaNumber,
      employee.status,
    ].some((value) => String(value ?? "").toLowerCase().includes(q));
  }), [employees, searchTerm]);

  const { page, setPage, totalPages, paginatedItems } = usePagination(filteredEmployees);

  const handleExport = (formatType: "excel" | "pdf") => {
    if (filteredEmployees.length === 0) {
      toast({
        title: "No data to export",
        description: "There are no employees matching the current search to export.",
        variant: "destructive",
      });
      return;
    }

    try {
      if (formatType === "excel") {
        exportEmployeesToExcel(filteredEmployees);
        toast({
          title: "Export successful",
          description: "Employee data has been downloaded as an Excel file.",
        });
      } else {
        exportEmployeesToPdf(filteredEmployees);
        toast({
          title: "Export successful",
          description: "Employee data has been downloaded as a PDF file.",
        });
      }
    } catch {
      toast({
        title: "Export failed",
        description: "Unable to download the employee report. Please try again.",
        variant: "destructive",
      });
    }
  };
  
  return (
    <>
      <ManagementPageHeader
        title="Employees"
        action={
          <div className="flex flex-wrap gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  className="flex items-center gap-2 border-[#E4E4E4]"
                  disabled={filteredEmployees.length === 0}
                >
                  <Download className="h-4 w-4" />
                  Export
                  <ChevronDown className="h-4 w-4 opacity-60" />
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
            <Button
              className="bg-[#2563EB] text-white shadow-sm hover:bg-[#2563EB]"
              onClick={() => setLocation("/employees/new")}
            >
              <Plus className="mr-2 h-4 w-4" /> Create Employee
            </Button>
          </div>
        }
      />

      <ManagementSearchBar
        value={searchTerm}
        onChange={setSearchTerm}
        placeholder="Search..."
      />

      <ManagementTableCard pagination={{ page, totalPages, onPageChange: setPage }}>
          {isLoading ? (
            <p className="py-16 text-center text-sm text-[#6B7280]">Loading...</p>
          ) : employees.length > 0 && filteredEmployees.length > 0 ? (
            <ManagementTableContainer>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Designation</TableHead>
                    <TableHead>Join Date</TableHead>
                    <TableHead>Documents</TableHead>
                    <TableHead className="w-px text-left">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedItems.map((employee) => (
                    <TableRow key={employee.id}>
                      <TableCell className="font-medium text-[#111827]">
                        <button
                          type="button"
                          onClick={() => handleViewEmployee(employee.id)}
                          className="text-left transition-colors hover:text-[#2563EB] hover:underline"
                        >
                          {employee.employeeId}
                        </button>
                      </TableCell>
                      <TableCell className="text-[#444651]">{employee.name}</TableCell>
                      <TableCell className="text-[#444651]">{employee.department}</TableCell>
                      <TableCell className="text-[#444651]">{employee.designation}</TableCell>
                      <TableCell className="whitespace-nowrap text-[#444651]">
                        {employee.joinDate
                          ? format(new Date(employee.joinDate), "MMM d, yyyy")
                          : "—"}
                      </TableCell>
                      <TableCell className="text-[#444651]">
                        <div className="flex flex-col space-y-1">
                          {employee.passportNumber && (
                            <div className="text-xs">
                              <span className="font-medium">Passport:</span>{" "}
                              {employee.passportNumber}
                              {employee.passportExpiry && (
                                <span className="text-[#6B7280]">
                                  {" "}
                                  (Expires: {format(new Date(employee.passportExpiry), "MMM d, yyyy")})
                                </span>
                              )}
                            </div>
                          )}
                          {employee.visaNumber && (
                            <div className="text-xs">
                              <span className="font-medium">Visa:</span>{" "}
                              {employee.visaNumber}
                              {employee.visaExpiry && (
                                <span className="text-[#6B7280]">
                                  {" "}
                                  (Expires: {format(new Date(employee.visaExpiry), "MMM d, yyyy")})
                                </span>
                              )}
                            </div>
                          )}
                          {!employee.passportNumber && !employee.visaNumber && "—"}
                        </div>
                      </TableCell>
                      <TableCell className="w-px whitespace-nowrap">
                        <div className="flex items-center justify-start gap-2">
                          <button
                            type="button"
                            title="View employee"
                            onClick={() => handleViewEmployee(employee.id)}
                            className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-600 transition-colors hover:bg-gray-200 active:scale-95"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            title="Edit employee"
                            onClick={() => handleEditEmployee(employee.id)}
                            className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-[#2563EB] transition-colors hover:bg-blue-100 active:scale-95"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            title="Add document"
                            onClick={() => handleAddDocument(employee.id)}
                            className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 transition-colors hover:bg-emerald-100 active:scale-95"
                          >
                            <FileText className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            title="Delete employee"
                            onClick={() => handleDeleteEmployee(employee.id)}
                            className="flex h-8 w-8 items-center justify-center rounded-full bg-red-50 text-red-600 transition-colors hover:bg-red-100 active:scale-95"
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
              title={searchTerm ? "No results found" : "No employees found"}
              description={
                searchTerm
                  ? "Try adjusting your search terms."
                  : "Get started by creating a new employee."
              }
              action={
                !searchTerm ? (
                  <Button
                    className="bg-[#2563EB] text-white shadow-sm hover:bg-[#2563EB]"
                    onClick={() => setLocation("/employees/new")}
                  >
                    <Plus className="mr-2 h-4 w-4" /> Add Employee
                  </Button>
                ) : undefined
              }
            />
          )}
      </ManagementTableCard>
      
      {/* Document Form Dialog */}
      <Dialog open={isDocumentFormOpen} onOpenChange={setIsDocumentFormOpen}>
        <FormModalShell
          title={
            selectedEmployeeId
              ? `Add document — ${employees.find((e) => e.id === selectedEmployeeId)?.name ?? "Employee"}`
              : "Add document"
          }
          maxWidth="max-w-5xl"
          onClose={() => setIsDocumentFormOpen(false)}
          footer={
            <>
              <ModalCancelButton onClick={() => setIsDocumentFormOpen(false)} />
              <ModalSaveButton
                type="button"
                onClick={() => {
                  const formEl = document.getElementById("document-form") as HTMLFormElement | null;
                  formEl?.requestSubmit();
                }}
                loading={documentFormPending}
                label="Save"
                loadingLabel="Saving..."
              />
            </>
          }
        >
          <DocumentForm
            employeeId={selectedEmployeeId || undefined}
            isOpen={isDocumentFormOpen}
            onClose={() => setIsDocumentFormOpen(false)}
            onSuccess={() => setIsDocumentFormOpen(false)}
            formId="document-form"
            hideShell
            onPendingChange={setDocumentFormPending}
          />
        </FormModalShell>
      </Dialog>
      
      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you want to delete this employee?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the employee and all related data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700"
              disabled={deleteEmployeeMutation.isPending}
            >
              {deleteEmployeeMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <EntityViewDialog
        open={isViewDialogOpen}
        onOpenChange={setIsViewDialogOpen}
        title="Employee Details"
        onClose={() => setIsViewDialogOpen(false)}
        maxWidth="max-w-2xl"
      >
        {selectedEmployeeId && (
          <EmployeeViewDetails employeeId={selectedEmployeeId} />
        )}
      </EntityViewDialog>
    </>
  );
}

// Employee View Component
function EmployeeViewDetails({ employeeId }: { employeeId: number }) {
  // Find employee from the list instead of making a separate API call
  const { data: employees } = useQuery<Employee[]>({
    queryKey: ["/api/employees"],
  });
  
  // Fetch dependents for this employee
  const { data: dependents = [] } = useQuery<any[]>({
    queryKey: ["/api/employees", employeeId, "dependents"],
  });
  
  const employee = employees?.find(emp => emp.id === employeeId);
  const isLoading = !employees;

  if (isLoading) {
    return (
      <p className="py-10 text-center text-sm text-[#6B7280]">Loading...</p>
    );
  }



  if (!employee) {
    return <div className="text-center py-10">Employee not found</div>;
  }

  const getExpiryStatus = (expiryDate?: Date | null) => {
    if (!expiryDate) return null;
    const today = new Date();
    const expiry = new Date(expiryDate);
    const diffTime = expiry.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return { status: 'expired', color: 'text-red-600', days: Math.abs(diffDays) };
    if (diffDays <= 60) return { status: 'expiring', color: 'text-yellow-600', days: diffDays };
    return { status: 'valid', color: 'text-green-600', days: diffDays };
  };

  const passportStatus = getExpiryStatus(employee.passportExpiry);
  const visaStatus = getExpiryStatus(employee.visaExpiry);

  const expiryBadgeVariant = (status: string | undefined) => {
    if (status === "expired") return "danger" as const;
    if (status === "expiring") return "warning" as const;
    return "valid" as const;
  };

  return (
    <EntityViewFieldGrid>
      <EntityViewField label="Employee ID" value={employee.employeeId} />
      <EntityViewField label="Name" value={employee.name} />
      <EntityViewField label="Email" value={(employee as any).email} />
      <EntityViewField label="Phone" value={(employee as any).phone} />
      <EntityViewField label="Address" value={(employee as any).address} fullWidth />
      <EntityViewField label="Department" value={employee.department} />
      <EntityViewField label="Designation" value={employee.designation} />
      <EntityViewField
        label="Join Date"
        value={employee.joinDate ? formatViewDate(employee.joinDate) : "-"}
      />
      <EntityViewField
        label="Status"
        value={
          <EntityViewStatusBadge
            status={employee.status}
            variant={employee.status === "active" ? "valid" : "neutral"}
          />
        }
      />
      {employee.passportNumber ? (
        <>
          <EntityViewField label="Passport Number" value={employee.passportNumber} />
          <EntityViewField
            label="Passport Expiry"
            value={
              employee.passportExpiry ? (
                <span className="inline-flex flex-wrap items-center gap-2">
                  {formatViewDate(employee.passportExpiry)}
                  {passportStatus ? (
                    <EntityViewStatusBadge
                      status={
                        passportStatus.status === "expired"
                          ? `Expired ${passportStatus.days} days ago`
                          : passportStatus.status === "expiring"
                            ? `Expires in ${passportStatus.days} days`
                            : `Valid for ${passportStatus.days} days`
                      }
                      variant={expiryBadgeVariant(passportStatus.status)}
                    />
                  ) : null}
                </span>
              ) : (
                "-"
              )
            }
          />
        </>
      ) : null}
      {employee.visaNumber ? (
        <>
          <EntityViewField label="Visa Number" value={employee.visaNumber} />
          <EntityViewField label="Visa Type" value={employee.visaType} />
          <EntityViewField
            label="Visa Expiry"
            value={
              employee.visaExpiry ? (
                <span className="inline-flex flex-wrap items-center gap-2">
                  {formatViewDate(employee.visaExpiry)}
                  {visaStatus ? (
                    <EntityViewStatusBadge
                      status={
                        visaStatus.status === "expired"
                          ? `Expired ${visaStatus.days} days ago`
                          : visaStatus.status === "expiring"
                            ? `Expires in ${visaStatus.days} days`
                            : `Valid for ${visaStatus.days} days`
                      }
                      variant={expiryBadgeVariant(visaStatus.status)}
                    />
                  ) : null}
                </span>
              ) : (
                "-"
              )
            }
          />
          {employee.visaRemarks ? (
            <EntityViewField label="Visa Remarks" value={employee.visaRemarks} fullWidth />
          ) : null}
        </>
      ) : null}
      {dependents.map((dependent, index) => {
        const depPassportStatus = getExpiryStatus(dependent.passportExpiry);
        const depVisaStatus = getExpiryStatus(dependent.visaExpiry);

        return (
          <Fragment key={dependent.id}>
            <EntityViewField
              label={`Dependent ${index + 1} Name`}
              value={dependent.name}
              fullWidth
            />
            <EntityViewField label="Relationship" value={dependent.relationship} />
            {dependent.passportNumber ? (
              <EntityViewField label="Passport Number" value={dependent.passportNumber} />
            ) : null}
            {dependent.passportExpiry ? (
              <EntityViewField
                label="Passport Expiry"
                value={
                  <span className="inline-flex flex-wrap items-center gap-2">
                    {formatViewDate(dependent.passportExpiry)}
                    {depPassportStatus ? (
                      <EntityViewStatusBadge
                        status={
                          depPassportStatus.status === "valid"
                            ? `Valid ${depPassportStatus.days}d`
                            : depPassportStatus.status === "expiring"
                              ? `${depPassportStatus.days}d left`
                              : "Expired"
                        }
                        variant={expiryBadgeVariant(depPassportStatus.status)}
                      />
                    ) : null}
                  </span>
                }
              />
            ) : null}
            {dependent.visaNumber ? (
              <EntityViewField label="Visa Number" value={dependent.visaNumber} />
            ) : null}
            {dependent.visaType ? (
              <EntityViewField label="Visa Type" value={dependent.visaType} />
            ) : null}
            {dependent.visaExpiry ? (
              <EntityViewField
                label="Visa Expiry"
                value={
                  <span className="inline-flex flex-wrap items-center gap-2">
                    {formatViewDate(dependent.visaExpiry)}
                    {depVisaStatus ? (
                      <EntityViewStatusBadge
                        status={
                          depVisaStatus.status === "valid"
                            ? `Valid ${depVisaStatus.days}d`
                            : depVisaStatus.status === "expiring"
                              ? `${depVisaStatus.days}d left`
                              : "Expired"
                        }
                        variant={expiryBadgeVariant(depVisaStatus.status)}
                      />
                    ) : null}
                  </span>
                }
              />
            ) : null}
          </Fragment>
        );
      })}
    </EntityViewFieldGrid>
  );
}
