import { useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import type { License } from "@shared/schema";
import { FormPageShell } from "@/operations-8june/components/layout/FormPageShell";
import { ModalCancelButton, ModalSaveButton } from "@/operations-8june/components/forms/FormModalShell";
import LicenseForm from "@/operations-8june/components/forms/LicenseForm";
import { useAuth } from "@/contexts/auth-context";

export default function LicenseEditPage() {
  const [, params] = useRoute("/licenses/:id/edit");
  const [, setLocation] = useLocation();
  const [pending, setPending] = useState(false);
  const { selectedCompany, isLoading: authLoading } = useAuth();
  const licenseId = params?.id ? Number(params.id) : undefined;
  const goBack = () => setLocation("/licenses");

  const { data: licenses = [] } = useQuery<License[]>({
    queryKey: ["/api/licenses"],
    enabled: !authLoading && !!selectedCompany && !!licenseId,
  });

  const license = licenses.find((l) => l.id === licenseId);

  if (!licenseId || Number.isNaN(licenseId)) {
    setLocation("/licenses");
    return null;
  }

  if (!license) {
    return (
      <FormPageShell title="Edit License" backHref="/licenses">
        <p className="text-sm text-[#6B7280]">Loading license…</p>
      </FormPageShell>
    );
  }

  return (
    <FormPageShell
      title="Edit License"
      description="Update license details."
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
        key={license.id}
        isOpen
        hideShell
        formId="license-form"
        license={license}
        onPendingChange={setPending}
        onClose={goBack}
      />
    </FormPageShell>
  );
}
