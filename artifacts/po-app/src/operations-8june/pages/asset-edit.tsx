import { useEffect, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { FormPageShell } from "@/operations-8june/components/layout/FormPageShell";
import { ModalCancelButton, ModalSaveButton } from "@/operations-8june/components/forms/FormModalShell";
import AssetForm from "@/operations-8june/components/forms/AssetForm";

export default function AssetEditPage() {
  const [, params] = useRoute("/assets/:id/edit");
  const [, setLocation] = useLocation();
  const [pending, setPending] = useState(false);
  const assetId = params?.id ? Number(params.id) : undefined;
  const goBack = () => setLocation("/assets");
  const invalid = !assetId || Number.isNaN(assetId);

  useEffect(() => {
    if (invalid) setLocation("/assets");
  }, [invalid, setLocation]);

  if (invalid) return null;

  return (
    <FormPageShell
      title="Edit Asset"
      description="Update asset details."
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
        key={assetId}
        assetId={assetId}
        formId="asset-form"
        hideFooter
        onPendingChange={setPending}
        onSuccess={goBack}
      />
    </FormPageShell>
  );
}
