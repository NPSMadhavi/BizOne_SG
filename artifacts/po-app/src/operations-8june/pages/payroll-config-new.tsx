import { useLocation } from "wouter";
import { FormPageShell } from "@/operations-8june/components/layout/FormPageShell";
import PayrollConfigForm from "@/operations-8june/components/forms/PayrollConfigForm";

export default function PayrollConfigNewPage() {
  const [, setLocation] = useLocation();
  const goBack = () => setLocation("/payroll");

  return (
    <FormPageShell
      title="Add Payroll Configuration"
      description="Set up payroll details for an employee."
      backHref="/payroll"
    >
      <PayrollConfigForm onSuccess={goBack} onCancel={goBack} />
    </FormPageShell>
  );
}
