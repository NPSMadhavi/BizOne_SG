import { useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import type { Employee } from "@shared/schema";
import { FormPageShell } from "@/operations-8june/components/layout/FormPageShell";
import { ModalCancelButton, ModalSaveButton } from "@/operations-8june/components/forms/FormModalShell";
import EmployeeForm from "@/operations-8june/components/forms/EmployeeForm";
import { useAuth } from "@/contexts/auth-context";

export default function EmployeeEditPage() {
  const [, params] = useRoute("/employees/:id/edit");
  const [, setLocation] = useLocation();
  const [pending, setPending] = useState(false);
  const { selectedCompany, isLoading: authLoading } = useAuth();
  const employeeId = params?.id ? Number(params.id) : undefined;
  const goBack = () => setLocation("/employees");

  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ["/api/employees"],
    enabled: !authLoading && !!selectedCompany && !!employeeId,
  });

  const employee = employees.find((e) => e.id === employeeId);

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
    <FormPageShell
      title="Edit Employee"
      description="Update employee details."
      backHref="/employees"
      footer={
        <>
          <ModalCancelButton onClick={goBack} />
          <ModalSaveButton
            form="employee-form"
            loading={pending}
            label="Save"
            loadingLabel="Saving..."
          />
        </>
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
  );
}
