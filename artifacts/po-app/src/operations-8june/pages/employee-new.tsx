import { useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { FormPageShell } from "@/operations-8june/components/layout/FormPageShell";
import { ModalCancelButton, ModalSaveButton } from "@/operations-8june/components/forms/FormModalShell";
import EmployeeForm, { type CreatedEmployeeInfo } from "@/operations-8june/components/forms/EmployeeForm";

function isSafeAssetReturnPath(path: string): boolean {
  return path.startsWith("/assets/new") || /^\/assets\/\d+\/edit$/.test(path);
}

export default function EmployeeNewPage() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const [pending, setPending] = useState(false);

  const returnTo = useMemo(() => {
    const value = new URLSearchParams(searchString).get("returnTo");
    if (!value || !isSafeAssetReturnPath(value)) return null;
    return value;
  }, [searchString]);

  const goBack = (created?: CreatedEmployeeInfo) => {
    if (returnTo) {
      if (created?.name) {
        const [path, query = ""] = returnTo.split("?");
        const params = new URLSearchParams(query);
        params.set("assignEmployee", created.name);
        const qs = params.toString();
        setLocation(path + (qs ? `?${qs}` : ""));
      } else {
        setLocation(returnTo);
      }
      return;
    }
    setLocation("/employees");
  };

  return (
    <FormPageShell
      title="Create Employee"
      description="Add a new employee record."
      backHref={returnTo ?? "/employees"}
      footer={
        <>
          <ModalCancelButton onClick={() => goBack()} />
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
