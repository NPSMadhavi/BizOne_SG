import { useLocation, useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { FormPageShell } from "@/operations-8june/components/layout/FormPageShell";
import PayrollConfigForm from "@/operations-8june/components/forms/PayrollConfigForm";
import { useAuth } from "@/contexts/auth-context";

export default function PayrollConfigEditPage() {
  const [, params] = useRoute("/payroll/config/:id/edit");
  const [, setLocation] = useLocation();
  const { selectedCompany, isLoading: authLoading } = useAuth();
  const configId = params?.id ? Number(params.id) : undefined;
  const goBack = () => setLocation("/payroll");

  const { data: configs = [] } = useQuery<any[]>({
    queryKey: ["/api/payroll/configs"],
    enabled: !authLoading && !!selectedCompany && !!configId,
  });

  const config = configs.find((c) => Number(c.id) === configId);

  if (!configId || Number.isNaN(configId)) {
    setLocation("/payroll");
    return null;
  }

  if (!config) {
    return (
      <FormPageShell title="Edit Payroll" backHref="/payroll">
        <p className="text-sm text-[#6B7280]">Loading payroll…</p>
      </FormPageShell>
    );
  }

  return (
    <FormPageShell
      title="Edit Payroll"
      description="Update payroll setup for this employee."
      backHref="/payroll"
    >
      <PayrollConfigForm key={config.id} editData={config} onSuccess={goBack} onCancel={goBack} />
    </FormPageShell>
  );
}
