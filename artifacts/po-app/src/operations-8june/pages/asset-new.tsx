import { useState } from "react";
import { useLocation } from "wouter";
import { FormPageShell } from "@/operations-8june/components/layout/FormPageShell";
import { ModalCancelButton, ModalSaveButton } from "@/operations-8june/components/forms/FormModalShell";
import AssetForm from "@/operations-8june/components/forms/AssetForm";

export default function AssetNewPage() {
  const [, setLocation] = useLocation();
  const [pending, setPending] = useState(false);
  const goBack = () => setLocation("/assets");

  return (
    <FormPageShell
      title="Create Asset"
      description="Add a new asset to your inventory."
      backHref="/assets"
      footer={
        <>
          <ModalCancelButton onClick={goBack} />
          <ModalSaveButton
            form="asset-form"
            loading={pending}
            label="Save"
            loadingLabel="Saving..."
          />
        </>
      }
    >
      <AssetForm
        formId="asset-form"
        hideFooter
        onPendingChange={setPending}
        onSuccess={goBack}
      />
    </FormPageShell>
  );
}
