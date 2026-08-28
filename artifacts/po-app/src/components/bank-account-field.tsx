import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Building2, Plus } from "lucide-react";

export type BankAccountItem = {
  id: string;
  bankName: string;
  accountNumber: string;
  accountHolder?: string;
  currency?: string;
  label: string;
};

const DEFAULT_BANK_ACCOUNTS: BankAccountItem[] = [];

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
  const [newAccountNum, setNewAccountNum] = useState("");
  const [newAccountHolder, setNewAccountHolder] = useState("");
  const [newCurrency, setNewCurrency] = useState("SGD");

  useEffect(() => {
    setBankAccounts(getStoredBankAccounts());
  }, [createBankOpen]);

  const isBankTransfer =
    paymentMethod === "bank_transfer" ||
    paymentMethod === "Bank Transfer" ||
    paymentMethod?.toLowerCase().includes("bank");

  const handleCreateBank = () => {
    if (!newBankName.trim() || !newAccountNum.trim()) return;
    const created = saveNewBankAccount({
      bankName: newBankName.trim(),
      accountNumber: newAccountNum.trim(),
      accountHolder: newAccountHolder.trim(),
      currency: newCurrency,
    });
    setBankAccounts(getStoredBankAccounts());
    onBankAccountChange(created.label);
    setNewBankName("");
    setNewAccountNum("");
    setNewAccountHolder("");
    setNewCurrency("SGD");
    setCreateBankOpen(false);
  };

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

        <div className="space-y-1.5">
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
            <SelectContent className="w-[var(--radix-select-trigger-width)] min-w-[var(--radix-select-trigger-width)]">
              <SelectItem
                value="CREATE_NEW_BANK_ACCOUNT"
                className="text-[#2563EB] font-semibold cursor-pointer border-b pb-2 mb-1"
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

      <Dialog open={createBankOpen} onOpenChange={setCreateBankOpen}>
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
                placeholder="e.g. DBS Bank, OCBC Bank, UOB, Citibank"
                value={newBankName}
                onChange={(e) => setNewBankName(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Account Number *</Label>
              <Input
                placeholder="e.g. 123-45678-9"
                value={newAccountNum}
                onChange={(e) => setNewAccountNum(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Account Holder Name</Label>
              <Input
                placeholder="e.g. BizOne SG Pte Ltd"
                value={newAccountHolder}
                onChange={(e) => setNewAccountHolder(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Currency</Label>
              <Select value={newCurrency} onValueChange={setNewCurrency}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SGD">SGD - Singapore Dollar</SelectItem>
                  <SelectItem value="USD">USD - US Dollar</SelectItem>
                  <SelectItem value="EUR">EUR - Euro</SelectItem>
                  <SelectItem value="MYR">MYR - Malaysian Ringgit</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setCreateBankOpen(false)}>
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
