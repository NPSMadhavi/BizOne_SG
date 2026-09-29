import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { BankAccountField } from "@/components/bank-account-field";
import { useToast } from "@/hooks/use-toast";
import { EmployeeCombobox } from "@/operations-8june/components/forms/EmployeeCombobox";
import {
  derivePayrollMonthYear,
  formatPayrollMonthLabel,
  getLastCompletedPayPeriod,
} from "@/operations-8june/lib/payroll-batch-utils";
import {
  payrollCancelButtonClass,
  payrollFormLabelClass,
  payrollPrimaryButtonClass,
} from "@/operations-8june/lib/payroll-ui";

const ALL_EMPLOYEES_ID = 0;

const PAYMENT_METHODS = [
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "cash", label: "Cash" },
  { value: "credit_card", label: "Credit Card" },
  { value: "cheque", label: "Cheque" },
  { value: "paynow", label: "PayNow" },
  { value: "nets", label: "NETS" },
];

type AccountOption = {
  id: number;
  code: string;
  name: string;
  isActive?: boolean;
};

type ExpenseRow = {
  amount: string;
  notes: string | null;
};

type PayrollPaymentRecordDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employees: Array<{
    id: number;
    name?: string | null;
    employeeId?: string | null;
    designation?: string | null;
    department?: string | null;
  }>;
  payrollRecords: Array<{
    employeeId?: number | string;
    payPeriodStart?: string;
    netPay?: string | number;
  }>;
};

function money(amount: number) {
  return new Intl.NumberFormat("en-SG", { style: "currency", currency: "SGD" }).format(amount || 0);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function defaultMonth() {
  return getLastCompletedPayPeriod().payPeriodStart.slice(0, 7);
}

function paymentMarker(employeeId: number, month: string) {
  return `payroll-payment:${employeeId}:${month}`;
}

function monthLabel(month: string) {
  const [year, monthNumber] = month.split("-").map((part) => Number(part));
  if (!year || !monthNumber) return month;
  return formatPayrollMonthLabel(year, monthNumber);
}

export function PayrollPaymentRecordDialog({
  open,
  onOpenChange,
  employees,
  payrollRecords,
}: PayrollPaymentRecordDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [employeeId, setEmployeeId] = useState<number | null>(null);
  const [month, setMonth] = useState(defaultMonth);
  const [paymentDate, setPaymentDate] = useState(today);
  const [amount, setAmount] = useState("");
  const [amountEdited, setAmountEdited] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("bank_transfer");
  const [bankAccount, setBankAccount] = useState("");
  const [bankReference, setBankReference] = useState("");
  const [notes, setNotes] = useState("");
  const [ledgerId, setLedgerId] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: accounts = [] } = useQuery<AccountOption[]>({
    queryKey: ["/api/accounts"],
    enabled: open,
    queryFn: async () => {
      const res = await fetch("/api/accounts", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load chart of accounts");
      return res.json();
    },
  });

  const { data: expenses = [] } = useQuery<ExpenseRow[]>({
    queryKey: ["expenses"],
    enabled: open,
    queryFn: async () => {
      const res = await fetch("/api/expenses", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const employeeOptions = useMemo(
    () => [
      {
        id: ALL_EMPLOYEES_ID,
        name: "All Employees",
        employeeId: `${employees.length} active`,
        designation: "Process payroll for everyone",
      },
      ...employees,
    ],
    [employees]
  );

  const netForEmployee = (id: number) => {
    if (!month) return 0;
    return payrollRecords.reduce((sum, record) => {
      if (Number(record.employeeId) !== id) return sum;
      const start = String(record.payPeriodStart || "");
      const { year, month: recordMonth } = derivePayrollMonthYear(start);
      const key = `${year}-${String(recordMonth).padStart(2, "0")}`;
      if (key !== month) return sum;
      return sum + (Number(record.netPay) || 0);
    }, 0);
  };

  const paidForEmployee = (id: number) => {
    if (!month) return 0;
    const marker = paymentMarker(id, month);
    return expenses.reduce((sum, expense) => {
      if (!expense.notes?.includes(marker)) return sum;
      return sum + (Number(expense.amount) || 0);
    }, 0);
  };

  const ledgerOptions = useMemo(
    () =>
      accounts
        .filter((account) => account.isActive !== false)
        .slice()
        .sort((a, b) => a.code.localeCompare(b.code)),
    [accounts]
  );

  const isAllEmployees = employeeId === ALL_EMPLOYEES_ID;

  const computedTotal = useMemo(() => {
    if (employeeId === null || employeeId === undefined || !month) return 0;
    const ids = isAllEmployees ? employees.map((employee) => employee.id) : [employeeId];
    return ids.reduce((sum, id) => sum + netForEmployee(id), 0);
  }, [employeeId, employees, expenses, isAllEmployees, month, payrollRecords]);

  const totalValue = computedTotal;

  const alreadyPaid = useMemo(() => {
    if (employeeId === null || employeeId === undefined || !month) return 0;
    const ids = isAllEmployees ? employees.map((employee) => employee.id) : [employeeId];
    return ids.reduce((sum, id) => sum + paidForEmployee(id), 0);
  }, [employeeId, employees, expenses, isAllEmployees, month]);

  const balanceDue = Math.max(0, Math.round((totalValue - alreadyPaid) * 100) / 100);

  useEffect(() => {
    if (!open) return;
    setEmployeeId(null);
    setMonth(defaultMonth());
    setPaymentDate(today());
    setAmount("");
    setAmountEdited(false);
    setPaymentMethod("bank_transfer");
    setBankAccount("");
    setBankReference("");
    setNotes("");
    setLedgerId("");
  }, [open]);

  useEffect(() => {
    if (!open || amountEdited) return;
    setAmount(balanceDue > 0 ? balanceDue.toFixed(2) : "");
  }, [open, amountEdited, balanceDue]);

  const selectedEmployee = isAllEmployees
    ? employeeOptions[0]
    : employees.find((employee) => Number(employee.id) === Number(employeeId));
  const selectedLedger = ledgerOptions.find((account) => String(account.id) === ledgerId);

  const handleSave = async () => {
    if (employeeId === null || employeeId === undefined || !selectedEmployee) {
      toast({ title: "Employee required", description: "Select an employee.", variant: "destructive" });
      return;
    }
    if (!month) {
      toast({ title: "Month required", description: "Select the payroll month.", variant: "destructive" });
      return;
    }
    const paidAmount = Number(amount);
    if (!paidAmount || paidAmount <= 0) {
      toast({ title: "Amount required", description: "Enter a payment amount greater than zero.", variant: "destructive" });
      return;
    }
    if (!paymentDate) {
      toast({ title: "Payment date required", description: "Select the payment date.", variant: "destructive" });
      return;
    }
    if (!selectedLedger) {
      toast({ title: "Ledger required", description: "Select a ledger from the chart of accounts.", variant: "destructive" });
      return;
    }
    if (paymentMethod === "bank_transfer" && !bankAccount) {
      toast({ title: "Bank account required", description: "Select a bank account for this transfer.", variant: "destructive" });
      return;
    }

    const periodLabel = monthLabel(month);
    const ledgerLabel = `${selectedLedger.code} — ${selectedLedger.name}`;
    const payees = isAllEmployees ? employees : [selectedEmployee];
    const shares = payees.map((employee) => {
      const employeeTotal = netForEmployee(employee.id);
      const employeePaid = paidForEmployee(employee.id);
      return {
        employee,
        total: employeeTotal,
        paid: employeePaid,
        balance: Math.max(0, Math.round((employeeTotal - employeePaid) * 100) / 100),
      };
    });
    const balanceTotal = shares.reduce((sum, share) => sum + share.balance, 0);
    const withBalance = shares.filter((share) => (isAllEmployees ? share.balance > 0 : true));
    let allocated = 0;
    const allocations = withBalance
      .map((share, index) => {
        const isLast = index === withBalance.length - 1;
        const portion =
          isAllEmployees && balanceTotal > 0
            ? isLast
              ? Math.round((paidAmount - allocated) * 100) / 100
              : Math.round(((paidAmount * share.balance) / balanceTotal) * 100) / 100
            : paidAmount;
        allocated += portion;
        return { ...share, portion };
      })
      .filter((share) => share.portion > 0);

    if (allocations.length === 0) {
      toast({
        title: "Nothing to pay",
        description: "This month has no balance left for the selected employees.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      for (const share of allocations) {
        const noteLines = [
          `Employee: ${share.employee.name || "Employee"}${share.employee.employeeId ? ` (${share.employee.employeeId})` : ""}`,
          `Month: ${periodLabel}`,
          `Total value: ${money(isAllEmployees ? share.total : totalValue)}`,
          `Already paid: ${money(isAllEmployees ? share.paid : alreadyPaid)}`,
          `Balance due: ${money(isAllEmployees ? share.balance : balanceDue)}`,
          `Ledger: ${ledgerLabel}`,
          bankAccount ? `Bank account: ${bankAccount}` : "",
          bankReference.trim() ? `Bank reference: ${bankReference.trim()}` : "",
          notes.trim() ? `Notes: ${notes.trim()}` : "",
          paymentMarker(share.employee.id, month),
        ].filter(Boolean);

        const res = await fetch("/api/expenses", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expenseDate: paymentDate,
            vendorName: share.employee.name || "Employee",
            description: `Payroll payment — ${periodLabel} — ${ledgerLabel}`,
            category: "staff_costs",
            amount: share.portion.toFixed(2),
            gstAmount: "0",
            gstClaimable: false,
            isDeductible: true,
            deductiblePct: 100,
            currency: "SGD",
            paymentMethod,
            notes: noteLines.join("\n"),
            status: "draft",
          }),
        });
        const created = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(created.error || created.message || "Failed to save the payment");
        }

        const confirmRes = await fetch(`/api/expenses/${created.id}/confirm`, {
          method: "POST",
          credentials: "include",
        });
        if (!confirmRes.ok) {
          const confirmBody = await confirmRes.json().catch(() => ({}));
          throw new Error(confirmBody.error || confirmBody.message || "Payment was saved as a draft expense.");
        }
      }

      await queryClient.invalidateQueries({ queryKey: ["expenses"] });
      await queryClient.invalidateQueries({ queryKey: ["journal-entries"] });
      toast({
        title: "Payment recorded",
        description: isAllEmployees
          ? "Payments for all employees are saved and now show in Expenses."
          : "The payment is saved and now shows in Expenses.",
      });
      onOpenChange(false);
    } catch (error) {
      toast({
        title: "Could not record payment",
        description: error instanceof Error ? error.message : "Failed to save the payment",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-visible">
        <DialogHeader>
          <DialogTitle>Payment Record</DialogTitle>
        </DialogHeader>
        <div className="max-h-[70vh] space-y-4 overflow-y-auto overscroll-contain py-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden [&_input:not([type=checkbox]):not([type=radio])]:rounded-lg [&_input:not([type=checkbox]):not([type=radio])]:border-[#E5E7EB] [&_input:not([type=checkbox]):not([type=radio])]:bg-[#F8FAFC] [&_input:not([type=checkbox]):not([type=radio])]:shadow-none [&_textarea]:rounded-lg [&_textarea]:border-[#E5E7EB] [&_textarea]:bg-[#F8FAFC] [&_textarea]:shadow-none [&_[role=combobox]]:rounded-lg [&_[role=combobox]]:border-[#E5E7EB] [&_[role=combobox]]:bg-[#F8FAFC] [&_[role=combobox]]:shadow-none">
          <div className="space-y-1.5">
            <Label className={payrollFormLabelClass}>Employee *</Label>
            <EmployeeCombobox
              employees={employeeOptions}
              value={employeeId}
              onChange={(id) => {
                setEmployeeId(id);
                setAmountEdited(false);
              }}
              placeholder="Select employee or All Employees"
              searchPlaceholder="Search employee..."
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className={payrollFormLabelClass}>Month *</Label>
              <Input
                type="month"
                value={month}
                onChange={(event) => {
                  setMonth(event.target.value);
                  setAmountEdited(false);
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label className={payrollFormLabelClass}>
                Amount <span className="text-destructive">*</span>
              </Label>
              <Input
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(event) => {
                  setAmountEdited(true);
                  setAmount(event.target.value.replace(/[^0-9.]/g, ""));
                }}
              />
            </div>
          </div>

          <div className="space-y-1 rounded-lg bg-muted/50 p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Already Paid</span>
              <span className="font-medium text-emerald-600">{money(alreadyPaid)}</span>
            </div>
            <div className="flex justify-between border-t pt-1 font-semibold">
              <span>Balance Due</span>
              <span className="text-orange-600">{money(balanceDue)}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className={payrollFormLabelClass}>Payment Date</Label>
              <Input type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className={payrollFormLabelClass}>Bank Reference / UTR</Label>
              <Input
                placeholder="Transaction reference number"
                value={bankReference}
                onChange={(event) => setBankReference(event.target.value)}
              />
            </div>
          </div>

          <BankAccountField
            paymentMethod={paymentMethod}
            onPaymentMethodChange={setPaymentMethod}
            selectedBankAccount={bankAccount}
            onBankAccountChange={setBankAccount}
            paymentMethods={PAYMENT_METHODS}
          />

          <div className="space-y-1.5">
            <Label className={payrollFormLabelClass}>Ledger *</Label>
            <Select value={ledgerId} onValueChange={setLedgerId}>
              <SelectTrigger>
                <SelectValue placeholder="Select ledger" />
              </SelectTrigger>
              <SelectContent className="max-h-64 [&_[data-radix-select-viewport]]:[-ms-overflow-style:none] [&_[data-radix-select-viewport]]:[scrollbar-width:none] [&_[data-radix-select-viewport]::-webkit-scrollbar]:hidden">
                {ledgerOptions.map((account) => (
                  <SelectItem key={account.id} value={String(account.id)}>
                    {account.code} — {account.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className={payrollFormLabelClass}>Notes</Label>
            <Textarea
              placeholder="Optional notes..."
              rows={2}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className={payrollCancelButtonClass}
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button type="button" className={payrollPrimaryButtonClass} onClick={() => void handleSave()} disabled={saving}>
            {saving ? "Saving..." : "Record Payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
