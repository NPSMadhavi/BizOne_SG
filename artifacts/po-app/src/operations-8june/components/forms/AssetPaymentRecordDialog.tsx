import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Asset } from "@shared/schema";
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
import {
  payrollCancelButtonClass,
  payrollFormLabelClass,
  payrollPrimaryButtonClass,
} from "@/operations-8june/lib/payroll-ui";

const ALL_ASSETS_ID = 0;

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
  type?: string;
  subType?: string;
  isActive?: boolean;
};

type ExpenseRow = {
  id: number;
  amount: string;
  notes: string | null;
  description?: string;
};

type AssetPaymentRecordDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assets?: Asset[];
  preSelectedAssetId?: number | null;
};

function money(amount: number) {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
  }).format(amount || 0);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function assetPaymentMarker(assetId: number) {
  return `asset-payment:${assetId}`;
}

export function AssetPaymentRecordDialog({
  open,
  onOpenChange,
  assets: propAssets,
  preSelectedAssetId,
}: AssetPaymentRecordDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [assetId, setAssetId] = useState<number | null>(preSelectedAssetId ?? null);
  const [paymentDate, setPaymentDate] = useState(today);
  const [amount, setAmount] = useState("");
  const [amountEdited, setAmountEdited] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("bank_transfer");
  const [bankAccount, setBankAccount] = useState("");
  const [bankReference, setBankReference] = useState("");
  const [notes, setNotes] = useState("");
  const [ledgerId, setLedgerId] = useState("");
  const [saving, setSaving] = useState(false);

  // Load assets from query if not provided
  const { data: queriedAssets = [] } = useQuery<Asset[]>({
    queryKey: ["/api/assets"],
    enabled: open && (!propAssets || propAssets.length === 0),
  });

  const assets = useMemo(() => {
    if (propAssets && propAssets.length > 0) return propAssets;
    return queriedAssets;
  }, [propAssets, queriedAssets]);

  // Load chart of accounts
  const { data: accounts = [] } = useQuery<AccountOption[]>({
    queryKey: ["/api/accounts"],
    enabled: open,
    queryFn: async () => {
      const res = await fetch("/api/accounts", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load chart of accounts");
      return res.json();
    },
  });

  // Load expenses to calculate already paid amounts for each asset
  const { data: expenses = [] } = useQuery<ExpenseRow[]>({
    queryKey: ["expenses"],
    enabled: open,
    queryFn: async () => {
      const res = await fetch("/api/expenses", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const ledgerOptions = useMemo(
    () =>
      accounts
        .filter((account) => account.isActive !== false)
        .slice()
        .sort((a, b) => a.code.localeCompare(b.code)),
    [accounts]
  );

  // Pre-select default fixed asset account (e.g. 1500)
  useEffect(() => {
    if (!open || ledgerId) return;
    const defaultFa =
      ledgerOptions.find((a) => a.code === "1500") ||
      ledgerOptions.find((a) => a.subType === "fixed_asset") ||
      ledgerOptions.find((a) => a.code.startsWith("15") || a.code.startsWith("16")) ||
      ledgerOptions[0];
    if (defaultFa) {
      setLedgerId(String(defaultFa.id));
    }
  }, [open, ledgerId, ledgerOptions]);

  // Asset options for dropdown
  const assetOptions = useMemo(() => {
    return [
      {
        id: ALL_ASSETS_ID,
        tag: "ALL",
        type: "All Fixed Assets",
        cost: "0",
        label: "All Fixed Assets (Batch Payment)",
      },
      ...assets.map((a) => ({
        ...a,
        label: `${a.tag || `FA-${a.id}`} — ${a.type} (${money(parseFloat(String(a.cost || 0)) || 0)})`,
      })),
    ];
  }, [assets]);

  // Calculate cost and payment history per asset
  const costForAsset = (a: Asset) => {
    const raw = (a as any).cost;
    const n = typeof raw === "string" ? parseFloat(raw) : Number(raw);
    return Number.isFinite(n) ? n : 0;
  };

  const paidForAsset = (id: number) => {
    const marker = assetPaymentMarker(id);
    return expenses.reduce((sum, exp) => {
      if (!exp.notes?.includes(marker)) return sum;
      return sum + (Number(exp.amount) || 0);
    }, 0);
  };

  const isAllAssets = assetId === ALL_ASSETS_ID;

  const selectedAsset = useMemo(() => {
    if (isAllAssets || assetId == null) return null;
    return assets.find((a) => Number(a.id) === Number(assetId)) ?? null;
  }, [assetId, assets, isAllAssets]);

  // Computed total cost, paid, balance
  const computedTotals = useMemo(() => {
    if (assetId === null || assetId === undefined) {
      return { total: 0, paid: 0, balance: 0 };
    }
    const targetAssets = isAllAssets ? assets : selectedAsset ? [selectedAsset] : [];
    let total = 0;
    let paid = 0;
    for (const a of targetAssets) {
      const c = costForAsset(a);
      const p = paidForAsset(a.id);
      total += c;
      paid += p;
    }
    const balance = Math.max(0, Math.round((total - paid) * 100) / 100);
    return {
      total: Math.round(total * 100) / 100,
      paid: Math.round(paid * 100) / 100,
      balance,
    };
  }, [assetId, isAllAssets, assets, selectedAsset, expenses]);

  // Auto-fill amount when asset changes (unless edited manually)
  useEffect(() => {
    if (!open) return;
    if (amountEdited) return;

    if (assetId === null || assetId === undefined) {
      setAmount("");
      return;
    }

    if (computedTotals.balance > 0) {
      setAmount(computedTotals.balance.toFixed(2));
    } else {
      setAmount("");
    }
  }, [open, assetId, computedTotals.balance, amountEdited]);

  // Reset form when dialog opens
  useEffect(() => {
    if (!open) return;
    setAssetId(preSelectedAssetId ?? (assets.length > 0 ? assets[0].id : ALL_ASSETS_ID));
    setPaymentDate(today());
    setAmount("");
    setAmountEdited(false);
    setPaymentMethod("bank_transfer");
    setBankAccount("");
    setBankReference("");
    setNotes("");
  }, [open, preSelectedAssetId, assets]);

  const selectedLedger = useMemo(
    () => accounts.find((a) => String(a.id) === String(ledgerId)) || null,
    [accounts, ledgerId]
  );

  const handleSave = async () => {
    if (assetId === null || assetId === undefined) {
      toast({
        title: "Asset required",
        description: "Please select an asset or All Assets.",
        variant: "destructive",
      });
      return;
    }

    const paidAmount = Number(amount);
    if (!paidAmount || paidAmount <= 0) {
      toast({
        title: "Amount required",
        description: "Enter a payment amount greater than zero.",
        variant: "destructive",
      });
      return;
    }

    if (!paymentDate) {
      toast({
        title: "Payment date required",
        description: "Select the payment date.",
        variant: "destructive",
      });
      return;
    }

    if (!selectedLedger) {
      toast({
        title: "Ledger required",
        description: "Select a fixed asset ledger from the chart of accounts.",
        variant: "destructive",
      });
      return;
    }

    if (paymentMethod === "bank_transfer" && !bankAccount) {
      toast({
        title: "Bank account required",
        description: "Select a bank account for this transfer.",
        variant: "destructive",
      });
      return;
    }

    const ledgerLabel = `${selectedLedger.code} — ${selectedLedger.name}`;
    const targetAssets = isAllAssets ? assets : selectedAsset ? [selectedAsset] : [];

    if (targetAssets.length === 0) {
      toast({
        title: "No assets found",
        description: "No assets available to record payment for.",
        variant: "destructive",
      });
      return;
    }

    // Allocate payment across assets
    const shares = targetAssets.map((asset) => {
      const aCost = costForAsset(asset);
      const aPaid = paidForAsset(asset.id);
      return {
        asset,
        cost: aCost,
        paid: aPaid,
        balance: Math.max(0, Math.round((aCost - aPaid) * 100) / 100),
      };
    });

    const balanceTotal = shares.reduce((sum, s) => sum + s.balance, 0);
    const withBalance = shares.filter((s) => (isAllAssets ? s.balance > 0 : true));
    let allocated = 0;

    const allocations = withBalance
      .map((share, index) => {
        const isLast = index === withBalance.length - 1;
        const portion =
          isAllAssets && balanceTotal > 0
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
        description: "The selected asset has no remaining balance due.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      for (const share of allocations) {
        const a = share.asset;
        const noteLines = [
          `Asset: ${a.tag || `FA-${a.id}`} — ${a.type}`,
          `Category: ${a.category || "Fixed Asset"}`,
          `Cost: ${money(share.cost)}`,
          `Already paid: ${money(share.paid)}`,
          `Balance due: ${money(share.balance)}`,
          `Ledger: ${ledgerLabel}`,
          bankAccount ? `Bank account: ${bankAccount}` : "",
          bankReference.trim() ? `Bank reference: ${bankReference.trim()}` : "",
          notes.trim() ? `Notes: ${notes.trim()}` : "",
          assetPaymentMarker(a.id),
        ].filter(Boolean);

        const vendorName = (a as any).vendor || (a as any).manufacturer || a.type || "Fixed Asset";

        // Create expense entry
        const res = await fetch("/api/expenses", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expenseDate: paymentDate,
            vendorName,
            description: `Asset payment — ${a.tag || `FA-${a.id}`} (${a.type}) — ${ledgerLabel}`,
            category: "other",
            accountId: selectedLedger.id,
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
          throw new Error(created.error || created.message || "Failed to save the asset payment");
        }

        // Confirm expense to post Journal Entry affecting Balance Sheet
        const confirmRes = await fetch(`/api/expenses/${created.id}/confirm`, {
          method: "POST",
          credentials: "include",
        });

        if (!confirmRes.ok) {
          const confirmBody = await confirmRes.json().catch(() => ({}));
          throw new Error(
            confirmBody.error || confirmBody.message || "Payment saved as draft expense."
          );
        }
      }

      await queryClient.invalidateQueries({ queryKey: ["expenses"] });
      await queryClient.invalidateQueries({ queryKey: ["journal-entries"] });
      await queryClient.invalidateQueries({ queryKey: ["balance-sheet"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/assets"] });

      toast({
        title: "Asset payment recorded",
        description: isAllAssets
          ? "Payments for all assets recorded and posted to Fixed Assets in Balance Sheet."
          : `Payment of ${money(paidAmount)} recorded and posted to Fixed Assets in Balance Sheet.`,
      });

      onOpenChange(false);
    } catch (err: any) {
      toast({
        title: "Could not record payment",
        description: err instanceof Error ? err.message : "Failed to record payment.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-visible">
        <DialogHeader>
          <DialogTitle>Asset Payment Record</DialogTitle>
        </DialogHeader>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto overscroll-contain py-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden [&_input:not([type=checkbox]):not([type=radio])]:rounded-lg [&_input:not([type=checkbox]):not([type=radio])]:border-[#E5E7EB] [&_input:not([type=checkbox]):not([type=radio])]:bg-[#F8FAFC] [&_input:not([type=checkbox]):not([type=radio])]:shadow-none [&_textarea]:rounded-lg [&_textarea]:border-[#E5E7EB] [&_textarea]:bg-[#F8FAFC] [&_textarea]:shadow-none [&_[role=combobox]]:rounded-lg [&_[role=combobox]]:border-[#E5E7EB] [&_[role=combobox]]:bg-[#F8FAFC] [&_[role=combobox]]:shadow-none">
          {/* Asset Selector */}
          <div className="space-y-1.5">
            <Label className={payrollFormLabelClass}>Fixed Asset *</Label>
            <Select
              value={assetId != null ? String(assetId) : undefined}
              onValueChange={(val) => {
                setAssetId(Number(val));
                setAmountEdited(false);
              }}
            >
              <SelectTrigger className="focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB]">
                <SelectValue placeholder="Select asset..." />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {assetOptions.map((opt) => (
                  <SelectItem key={opt.id} value={String(opt.id)}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Cost & Balance Summary */}
          <div className="space-y-1 rounded-lg bg-blue-50/70 border border-blue-100 p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-[#475569]">Total Cost</span>
              <span className="font-semibold text-[#0F172A]">{money(computedTotals.total)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#475569]">Already Paid</span>
              <span className="font-medium text-emerald-600">{money(computedTotals.paid)}</span>
            </div>
            <div className="flex justify-between border-t border-blue-200/60 pt-1 font-semibold">
              <span className="text-[#0F172A]">Balance Due</span>
              <span className="text-orange-600 font-bold">{money(computedTotals.balance)}</span>
            </div>
          </div>

          {/* Payment Date & Amount */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className={payrollFormLabelClass}>Payment Date *</Label>
              <Input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
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
                onChange={(e) => {
                  setAmountEdited(true);
                  setAmount(e.target.value.replace(/[^0-9.]/g, ""));
                }}
              />
            </div>
          </div>

          {/* Payment Method & Bank */}
          <BankAccountField
            paymentMethod={paymentMethod}
            onPaymentMethodChange={setPaymentMethod}
            selectedBankAccount={bankAccount}
            onBankAccountChange={setBankAccount}
            paymentMethods={PAYMENT_METHODS}
          />

          {/* Reference */}
          <div className="space-y-1.5">
            <Label className={payrollFormLabelClass}>Bank Reference / Voucher</Label>
            <Input
              placeholder="Transaction reference or check number"
              value={bankReference}
              onChange={(e) => setBankReference(e.target.value)}
            />
          </div>

          {/* Ledger Account */}
          <div className="space-y-1.5">
            <Label className={payrollFormLabelClass}>Ledger (Balance Sheet Account) *</Label>
            <Select value={ledgerId} onValueChange={setLedgerId}>
              <SelectTrigger>
                <SelectValue placeholder="Select fixed asset ledger..." />
              </SelectTrigger>
              <SelectContent className="max-h-64 [&_[data-radix-select-viewport]]:[-ms-overflow-style:none] [&_[data-radix-select-viewport]]:[scrollbar-width:none] [&_[data-radix-select-viewport]::-webkit-scrollbar]:hidden">
                {ledgerOptions.map((account) => (
                  <SelectItem key={account.id} value={String(account.id)}>
                    {account.code} — {account.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-[#64748B]">
              Debited to Fixed Assets on the Balance Sheet and credited to Bank.
            </p>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label className={payrollFormLabelClass}>Notes (Optional)</Label>
            <Textarea
              placeholder="e.g. Purchase payment, invoice reference..."
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
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
          <Button
            type="button"
            className={payrollPrimaryButtonClass}
            onClick={() => void handleSave()}
            disabled={saving}
          >
            {saving ? "Saving & Posting..." : "Record Payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

