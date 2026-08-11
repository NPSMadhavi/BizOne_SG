import { useState } from "react";
import { useLocation } from "wouter";
import { FormPageShell } from "@/operations-8june/components/layout/FormPageShell";
import { ModalCancelButton, ModalSaveButton } from "@/operations-8june/components/forms/FormModalShell";
import LicenseForm from "@/operations-8june/components/forms/LicenseForm";

export default function LicenseNewPage() {
  const [, setLocation] = useLocation();
  const [pending, setPending] = useState(false);
  const goBack = () => setLocation("/licenses");

  return (
    <FormPageShell
      title="Create License"
      description="Add a new software or service license."
      backHref="/licenses"
      footer={
        <>
          <ModalCancelButton onClick={goBack} />
          <ModalSaveButton
            form="license-form"
            loading={pending}
            label="Save"
            loadingLabel="Saving..."
          />
        </>
      }
    >
      <LicenseForm
        isOpen
        hideShell
        formId="license-form"
        onPendingChange={setPending}
        onClose={goBack}
      />
    </FormPageShell>
  );
}
