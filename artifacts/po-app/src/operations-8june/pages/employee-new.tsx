import { useState } from "react";
import { useLocation } from "wouter";
import { FormPageShell } from "@/operations-8june/components/layout/FormPageShell";
import { ModalCancelButton, ModalSaveButton } from "@/operations-8june/components/forms/FormModalShell";
import EmployeeForm from "@/operations-8june/components/forms/EmployeeForm";

export default function EmployeeNewPage() {
  const [, setLocation] = useLocation();
  const [pending, setPending] = useState(false);
  const goBack = () => setLocation("/employees");

  return (
    <FormPageShell
      title="Create Employee"
      description="Add a new employee record."
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
        isOpen
        hideShell
        formId="employee-form"
        onPendingChange={setPending}
        onClose={goBack}
      />
    </FormPageShell>
  );
}
