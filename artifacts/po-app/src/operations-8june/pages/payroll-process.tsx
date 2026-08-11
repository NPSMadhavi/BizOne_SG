import { useLocation } from "wouter";
import { FormPageShell } from "@/operations-8june/components/layout/FormPageShell";
import ProcessPayrollForm from "@/operations-8june/components/forms/ProcessPayrollForm";

export default function PayrollProcessPage() {
  const [, setLocation] = useLocation();
  const goBack = () => setLocation("/payroll");

  return (
    <FormPageShell
      title="Process Payroll"
      description="Run payroll for the selected period."
      backHref="/payroll"
    >
      <ProcessPayrollForm onSuccess={goBack} onCancel={goBack} />
    </FormPageShell>
  );
}
