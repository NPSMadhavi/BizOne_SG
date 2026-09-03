import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Building2 } from "lucide-react";

export type BankAccountItem = {
  id: string;
  bankName: string;
  bankCode?: string;
  branchCode?: string;
  accountNumber: string;
  swiftBic?: string;
  accountHolder?: string;
  currency?: string;
  label: string;
};

export function getStoredBankAccounts(): BankAccountItem[] {
  try {
    const raw = localStorage.getItem("custom-bank-accounts-v1");
    if (raw) {
      const custom = JSON.parse(raw);
      if (Array.isArray(custom)) {
        return custom;
      }
    }
  } catch {
    /* empty */
  }
  return [];
}

export function saveNewBankAccount(item: Omit<BankAccountItem, "id" | "label">): BankAccountItem {
  const label = `${item.bankName} - ${item.accountNumber}${item.currency ? ` (${item.currency})` : ""}`;
  const newItem: BankAccountItem = {
    ...item,
    id: `bank-${Date.now()}`,
    label,
  };
  try {
    const raw = localStorage.getItem("custom-bank-accounts-v1");
    const existing = raw ? JSON.parse(raw) : [];
    const updated = [newItem, ...(Array.isArray(existing) ? existing : [])];
    localStorage.setItem("custom-bank-accounts-v1", JSON.stringify(updated));
  } catch {
    /* empty */
  }
  return newItem;
}

interface BankAccountFieldProps {
  paymentMethod: string;
  onPaymentMethodChange: (val: string) => void;
  selectedBankAccount: string;
  onBankAccountChange: (val: string) => void;
  paymentMethods: { value: string; label: string }[];
}

export function BankAccountField({
  paymentMethod,
  onPaymentMethodChange,
  selectedBankAccount,
  onBankAccountChange,
  paymentMethods,
}: BankAccountFieldProps) {
  const [bankAccounts, setBankAccounts] = useState<BankAccountItem[]>([]);
  const [createBankOpen, setCreateBankOpen] = useState(false);
  const [newBankName, setNewBankName] = useState("");
  const [newBankCode, setNewBankCode] = useState("");
  const [newBranchCode, setNewBranchCode] = useState("");
  const [newAccountNum, setNewAccountNum] = useState("");
  const [newSwiftBic, setNewSwiftBic] = useState("");

  useEffect(() => {
    setBankAccounts(getStoredBankAccounts());
  }, [createBankOpen]);

  const isBankTransfer =
    paymentMethod === "bank_transfer" ||
    paymentMethod === "Bank Transfer" ||
    paymentMethod?.toLowerCase().includes("bank");

  const resetCreateForm = () => {
    setNewBankName("");
    setNewBankCode("");
    setNewBranchCode("");
    setNewAccountNum("");
    setNewSwiftBic("");
  };

  const handleCreateBank = () => {
    if (!newBankName.trim() || !newAccountNum.trim()) return;
    const created = saveNewBankAccount({
      bankName: newBankName.trim(),
      bankCode: newBankCode.trim() || undefined,
      branchCode: newBranchCode.trim() || undefined,
      accountNumber: newAccountNum.trim(),
      swiftBic: newSwiftBic.trim() || undefined,
    });
    setBankAccounts(getStoredBankAccounts());
    onBankAccountChange(created.label);
    resetCreateForm();
    setCreateBankOpen(false);
  };

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 min-w-0">
        <div className="space-y-1.5">
          <Label>Payment Method</Label>
          <Select value={paymentMethod} onValueChange={onPaymentMethodChange}>
            <SelectTrigger>
              <SelectValue placeholder="Select Payment Method" />
            </SelectTrigger>
            <SelectContent>
              {paymentMethods.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5 min-w-0">
          <Label>Select Bank Account</Label>
          <Select
            disabled={!isBankTransfer}
            value={isBankTransfer ? selectedBankAccount : ""}
            onValueChange={(val) => {
              if (val === "CREATE_NEW_BANK_ACCOUNT") {
                setCreateBankOpen(true);
              } else {
                onBankAccountChange(val);
              }
            }}
          >
            <SelectTrigger className={`w-full ${isBankTransfer ? "border-[#2563EB]/40 bg-blue-50/20 focus:ring-2 focus:ring-[#2563EB]" : "bg-muted/50 text-muted-foreground opacity-70"}`}>
              <SelectValue placeholder={isBankTransfer ? "Select bank account..." : "Select Bank Account"} />
            </SelectTrigger>
            <SelectContent
              position="popper"
              className="w-[var(--radix-select-trigger-width)] max-w-[var(--radix-select-trigger-width)]"
            >
              <SelectItem
                value="CREATE_NEW_BANK_ACCOUNT"
                className="text-xs font-medium text-[#2563EB] cursor-pointer border-b pb-1.5 mb-1 truncate"
              >
                + Create Bank Account
              </SelectItem>
              {bankAccounts.length === 0 && (
                <div className="px-3 py-2 text-xs text-muted-foreground italic leading-tight">
                  No bank accounts created yet.
                </div>
              )}
              {bankAccounts.map((acc) => (
                <SelectItem key={acc.id} value={acc.label} className="truncate">
                  {acc.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Dialog
        open={createBankOpen}
        onOpenChange={(open) => {
          setCreateBankOpen(open);
          if (!open) resetCreateForm();
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[#2563EB]">
              <Building2 className="h-5 w-5" /> Create Bank Account
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs">Bank Name *</Label>
              <Input
                value={newBankName}
                onChange={(e) => setNewBankName(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Bank Code</Label>
                <Input
                  value={newBankCode}
                  onChange={(e) => setNewBankCode(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Branch Code</Label>
                <Input
                  value={newBranchCode}
                  onChange={(e) => setNewBranchCode(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Account Number *</Label>
              <Input
                value={newAccountNum}
                onChange={(e) => setNewAccountNum(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">SWIFT / BIC Code</Label>
              <Input
                value={newSwiftBic}
                onChange={(e) => setNewSwiftBic(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                resetCreateForm();
                setCreateBankOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-[#2563EB] hover:bg-[#1D4ED8]"
              disabled={!newBankName.trim() || !newAccountNum.trim()}
              onClick={handleCreateBank}
            >
              Save Bank Account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
