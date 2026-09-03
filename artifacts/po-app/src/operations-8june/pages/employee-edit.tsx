import { useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import type { Employee } from "@shared/schema";
import { FormPageShell } from "@/operations-8june/components/layout/FormPageShell";
import { ModalCancelButton, ModalSaveButton } from "@/operations-8june/components/forms/FormModalShell";
import EmployeeForm from "@/operations-8june/components/forms/EmployeeForm";
import { Button } from "@/components/ui/button";
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
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/operations-8june/lib/queryClient";
import { useAuth } from "@/contexts/auth-context";

export default function EmployeeEditPage() {
  const [, params] = useRoute("/employees/:id/edit");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const { selectedCompany, isLoading: authLoading } = useAuth();
  const employeeId = params?.id ? Number(params.id) : undefined;
  const goBack = () => setLocation("/employees");

  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ["/api/employees"],
    enabled: !authLoading && !!selectedCompany && !!employeeId,
  });

  const employee = employees.find((e) => e.id === employeeId);

  const deleteEmployeeMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/employees/${id}`);
    },
    onSuccess: async () => {
      toast({
        title: "Employee deleted",
        description: "The employee has been deleted successfully.",
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      setDeleteOpen(false);
      goBack();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete employee",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (!employeeId || Number.isNaN(employeeId)) {
    setLocation("/employees");
    return null;
  }

  if (!employee) {
    return (
      <FormPageShell title="Edit Employee" backHref="/employees">
        <p className="text-sm text-[#6B7280]">Loading employee…</p>
      </FormPageShell>
    );
  }

  return (
    <>
      <FormPageShell
        title="Edit Employee"
        description="Update employee details."
        backHref="/employees"
        footer={
          <div className="flex w-full items-center justify-between gap-3">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
              onClick={() => setDeleteOpen(true)}
              disabled={deleteEmployeeMutation.isPending}
              title="Delete"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
            <div className="flex gap-3">
              <ModalCancelButton onClick={goBack} />
              <ModalSaveButton
                type="button"
                onClick={() => {
                  const formEl = document.getElementById("employee-form") as HTMLFormElement | null;
                  formEl?.requestSubmit();
                }}
                loading={pending}
                label="Save"
                loadingLabel="Saving..."
              />
            </div>
          </div>
        }
      >
        <EmployeeForm
          key={employee.id}
          employee={employee}
          isOpen
          hideShell
          formId="employee-form"
          onPendingChange={setPending}
          onClose={goBack}
        />
      </FormPageShell>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
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
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                if (employeeId && !deleteEmployeeMutation.isPending) {
                  deleteEmployeeMutation.mutate(employeeId);
                }
              }}
            >
              {deleteEmployeeMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
