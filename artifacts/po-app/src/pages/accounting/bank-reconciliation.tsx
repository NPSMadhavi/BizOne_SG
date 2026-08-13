import { useState, useMemo, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Upload,
  CheckCircle2,
  AlertCircle,
  XCircle,
  MinusCircle,
  ChevronRight,
  ChevronLeft,
  FileText,
  Download,
  FileSpreadsheet,
  Sparkles,
  Search,
  Check,
  ArrowRight,
} from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { SyncBridgeDatePicker } from "@/components/ui/sync-bridge-date-picker";
import { jsPDF } from "jspdf";
import "jspdf-autotable";
import * as XLSX from "xlsx";

// Types
interface BankTransaction {
  id: number;
  date: string;
  description: string;
  amount: number;
  type: "credit" | "debit";
  matchedType?: string;
  matchedRef?: string;
  matchedDetails?: string;
  status: "matched" | "need_review" | "unmatched" | "ignored";
}

interface Account {
  id: number;
  code: string;
  name: string;
  type: string;
  subType: string;
  isActive: boolean;
}

function formatReportDate(value: string) {
  if (!value) return "—";
  const parts = value.includes("-") ? value.split("-") : value.split("/");
  if (parts.length === 3 && parts[0].length === 4) {
    const [y, m, d] = parts;
    return `${Number(d)}/${Number(m)}/${y}`;
  }
  return value;
}

function formatPeriodDate(value: string) {
  if (!value) return "—";
  const [y, m, d] = value.split("-");
  if (!y || !m || !d) return value;
  return `${d.padStart(2, "0")} ${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][Number(m) - 1]} ${y}`;
}

export default function BankReconciliation() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { selectedCompany, user } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step state: 1 = Match dashboard (Upload New here), 2 = Review, 3 = Tally, 4 = Finish
  // First empty "Upload Bank Statement" landing page is skipped
  const [step, setStep] = useState<number>(1);
  const [selectedAccount, setSelectedAccount] = useState<string>("");
  const [dateFrom, setDateFrom] = useState("2026-08-01");
  const [dateTo, setDateTo] = useState("2026-08-31");
  const [activeTab, setActiveTab] = useState<"all" | "matched" | "need_review" | "unmatched" | "ignored">("all");
  const [searchQuery, setSearchTerm] = useState("");

  // Start on match dashboard with no dummy rows — load via Upload Statement
  const [transactions, setTransactions] = useState<BankTransaction[]>([]);

  // Step 2 Create Voucher Modal State
  const [selectedTxForVoucher, setSelectedTxForVoucher] = useState<BankTransaction | null>(null);
  const [voucherType, setVoucherType] = useState("payment");
  const [ledgerAccount, setLedgerAccount] = useState<string>("");
  const [voucherGst, setVoucherGst] = useState("No GST");
  const [voucherDesc, setVoucherDescription] = useState("");

  // Fetch real accounts from Chart of Accounts
  const { data: accounts = [], isLoading: accountsLoading } = useQuery<Account[]>({
    queryKey: ["accounts"],
    queryFn: async () => {
      const res = await fetch("/api/accounts", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch accounts");
      return res.json();
    }
  });

  // Filter bank accounts for the bank account selector
  const bankAccounts = useMemo(() => {
    return accounts.filter(a => 
      a.isActive && 
      (a.type === "asset" && (a.name.toLowerCase().includes("bank") || a.code.startsWith("1")) )
    );
  }, [accounts]);

  // Set default selected bank account once loaded
  useMemo(() => {
    if (bankAccounts.length > 0 && !selectedAccount) {
      setSelectedAccount(String(bankAccounts[0].id));
    }
  }, [bankAccounts, selectedAccount]);

  // Mutation to create a real Journal Entry when reconciling
  const createJournalEntryMutation = useMutation({
    mutationFn: async (payload: {
      entryDate: string;
      description: string;
      lines: { accountId: number; description: string; debit: number; credit: number }[];
    }) => {
      const res = await fetch("/api/journal-entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error || "Failed to create journal entry");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["journal-entries"] });
    },
    onError: (err: any) => {
      toast({
        title: "Error creating journal entry",
        description: err.message,
        variant: "destructive"
      });
    }
  });

  // CSV file parser
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) return;

      try {
        const lines = text.split("\n");
        const parsed: BankTransaction[] = [];
        let id = 1;

        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;

          const parts = line.split(",");
          if (parts.length < 4) continue;

          const date = parts[0].replace(/"/g, "").trim();
          const description = parts[1].replace(/"/g, "").trim();
          const amount = parseFloat(parts[2].replace(/"/g, "").trim());
          const type = parts[3].replace(/"/g, "").trim().toLowerCase() as "credit" | "debit";

          if (isNaN(amount)) continue;

          // Auto match logic: if description contains certain keywords, auto-match it
          let status: "matched" | "need_review" = "need_review";
          let matchedType = undefined;
          let matchedRef = undefined;
          let matchedDetails = undefined;

          if (description.toLowerCase().includes("abc pte ltd")) {
            status = "matched";
            matchedType = "Receipt";
            matchedRef = "INV-1004";
            matchedDetails = "ABC Pte Ltd";
          } else if (description.toLowerCase().includes("uob bank charge")) {
            status = "matched";
            matchedType = "Bank Charges";
            matchedRef = "BC-9921";
            matchedDetails = "Bank Charges";
          }

          parsed.push({
            id: id++,
            date,
            description,
            amount,
            type,
            status,
            matchedType,
            matchedRef,
            matchedDetails
          });
        }

        if (parsed.length === 0) {
          throw new Error("No valid transactions found in CSV. Ensure format is: Date,Description,Amount,Type");
        }

        setTransactions(parsed);
        toast({
          title: "Statement Uploaded Successfully",
          description: `Parsed ${parsed.length} transactions from the CSV file.`
        });
      } catch (err: any) {
        toast({
          title: "Failed to parse CSV",
          description: err.message || "Please check the CSV format.",
          variant: "destructive"
        });
      }
    };
    reader.readAsText(file);
  };

  // Download Sample CSV template
  const handleDownloadSampleCSV = () => {
    const headers = "Date,Description,Amount,Type\n";
    const rows = [
      "2026-08-10,PAYMENT ABC PTE LTD Ref: 12345,1250.00,credit",
      "2026-08-11,UOB BANK CHARGE,25.00,debit",
      "2026-08-12,PAYNOW XYZ PTE LTD Ref: PAY123,2500.00,credit",
      "2026-08-13,ACME PTE LTD Ref: 67890,3000.00,credit",
      "2026-08-14,GIRO CREDIT Ref: GIRO567,1000.00,credit",
      "2026-08-09,DBS BANK CHARGES,35.00,debit",
      "2026-08-12,PAYNOW RECEIPT - ABC PTE LTD,250.00,credit",
      "2026-08-15,SUPPLIER PAYMENT - XYZ PTE LTD,120.00,debit"
    ].join("\n");

    const blob = new Blob([headers + rows], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.setAttribute("href", url);
    a.setAttribute("download", "sample_bank_statement.csv");
    a.click();
  };

  // Report meta + rows (ID, Date, Description, credit, debit)
  const reportMeta = useMemo(() => {
    const bankAccount =
      accounts.find(a => String(a.id) === selectedAccount)?.name || "—";
    const period = `${formatPeriodDate(dateFrom)} - ${formatPeriodDate(dateTo)}`;
    const preparedBy =
      (user as { fullName?: string | null } | null)?.fullName?.trim() ||
      user?.username ||
      "Admin";
    const preparedOn = new Date().toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
    return { bankAccount, period, preparedBy, preparedOn };
  }, [accounts, selectedAccount, dateFrom, dateTo, user]);

  const reportTable = useMemo(() => {
    let totalCredit = 0;
    let totalDebit = 0;
    const rows = transactions.map((t) => {
      const credit = t.type === "credit" ? t.amount : 0;
      const debit = t.type === "debit" ? t.amount : 0;
      totalCredit += credit;
      totalDebit += debit;
      return {
        id: t.id,
        date: formatReportDate(t.date),
        description: t.description,
        credit,
        debit,
      };
    });
    return { rows, totalCredit, totalDebit };
  }, [transactions]);

  const ensureReportData = () => {
    if (transactions.length === 0) {
      toast({
        title: "No transactions",
        description: "Upload a bank statement before exporting the report.",
        variant: "destructive",
      });
      return false;
    }
    return true;
  };

  const handlePrintReport = () => {
    if (!ensureReportData()) return;
    const { rows, totalCredit, totalDebit } = reportTable;
    const { bankAccount, period, preparedBy, preparedOn } = reportMeta;
    const tableRows = rows
      .map(
        (r) =>
          `<tr>
            <td>${r.id}</td>
            <td>${r.date}</td>
            <td>${r.description.replace(/</g, "&lt;")}</td>
            <td style="text-align:right">${r.credit || ""}</td>
            <td style="text-align:right">${r.debit || ""}</td>
          </tr>`
      )
      .join("");
    const html = `<!DOCTYPE html>
<html><head><title>Reconciliation Report</title>
<style>
  body { font-family: Arial, sans-serif; padding: 24px; color: #111; }
  h1 { font-size: 18px; margin: 0 0 12px; }
  .meta { margin-bottom: 16px; font-size: 12px; }
  .meta div { display: flex; justify-content: space-between; max-width: 420px; margin: 4px 0; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { border: 1px solid #333; padding: 6px 8px; }
  th { background: #f3f4f6; text-align: left; }
  tfoot td { font-weight: bold; }
</style></head><body>
  <h1>Reconciliation</h1>
  <div class="meta">
    <div><span>Bank Account</span><strong>${bankAccount}</strong></div>
    <div><span>Period</span><strong>${period}</strong></div>
    <div><span>Prepared By</span><strong>${preparedBy}</strong></div>
    <div><span>Prepared On</span><strong>${preparedOn}</strong></div>
  </div>
  <table>
    <thead>
      <tr><th>ID</th><th>Date</th><th>Description</th><th>credit</th><th>debit</th></tr>
    </thead>
    <tbody>${tableRows}</tbody>
    <tfoot>
      <tr>
        <td></td><td></td><td>Total</td>
        <td style="text-align:right">${totalCredit}</td>
        <td style="text-align:right">${totalDebit}</td>
      </tr>
    </tfoot>
  </table>
</body></html>`;
    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) {
      toast({ title: "Popup blocked", description: "Allow popups to print the report.", variant: "destructive" });
      return;
    }
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 250);
  };

  const handleExportExcel = () => {
    if (!ensureReportData()) return;
    const { rows, totalCredit, totalDebit } = reportTable;
    const { bankAccount, period, preparedBy, preparedOn } = reportMeta;

    const sheetData: (string | number)[][] = [
      ["Reconciliation"],
      ["Bank Account", bankAccount],
      ["Period", period],
      ["Prepared By", preparedBy],
      ["Prepared On", preparedOn],
      [],
      ["ID", "Date", "Description", "credit", "debit"],
      ...rows.map((r) => [
        r.id,
        r.date,
        r.description,
        r.credit || "",
        r.debit || "",
      ]),
      ["", "", "Total", totalCredit, totalDebit],
    ];

    const worksheet = XLSX.utils.aoa_to_sheet(sheetData);

    // Auto-fit column widths from cell content (so Date/Description don't clip)
    const colCount = 5;
    const colWidths = Array.from({ length: colCount }, () => 10);
    sheetData.forEach((row) => {
      for (let c = 0; c < colCount; c++) {
        const value = row[c];
        if (value === undefined || value === null || value === "") continue;
        const len = String(value).length + 2;
        colWidths[c] = Math.max(colWidths[c], Math.min(len, 55));
      }
    });
    // Minimums so Date / amounts never show as #####
    colWidths[0] = Math.max(colWidths[0], 8);
    colWidths[1] = Math.max(colWidths[1], 14);
    colWidths[2] = Math.max(colWidths[2], 28);
    colWidths[3] = Math.max(colWidths[3], 12);
    colWidths[4] = Math.max(colWidths[4], 12);
    worksheet["!cols"] = colWidths.map((wch) => ({ wch }));

    // Keep Date cells as text so Excel doesn't reformat/narrow them
    const headerRowIndex = 6; // 0-based; row with ID/Date/...
    rows.forEach((_, i) => {
      const cellRef = XLSX.utils.encode_cell({ r: headerRowIndex + 1 + i, c: 1 });
      const cell = worksheet[cellRef];
      if (cell) {
        cell.t = "s";
        cell.v = String(cell.v ?? "");
        cell.z = "@";
      }
    });

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Reconciliation");
    XLSX.writeFile(workbook, "reconciliation_report.xlsx");

    toast({ title: "Excel export ready", description: "Report downloaded with auto-sized columns." });
  };

  const handleDownloadPdf = () => {
    if (!ensureReportData()) return;
    const { rows, totalCredit, totalDebit } = reportTable;
    const { bankAccount, period, preparedBy, preparedOn } = reportMeta;
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    doc.setFontSize(16);
    doc.text("Reconciliation", 14, 18);
    doc.setFontSize(10);
    let y = 28;
    const metaLines = [
      ["Bank Account", bankAccount],
      ["Period", period],
      ["Prepared By", preparedBy],
      ["Prepared On", preparedOn],
    ] as const;
    metaLines.forEach(([label, value]) => {
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100);
      doc.text(label, 14, y);
      doc.setTextColor(20);
      doc.setFont("helvetica", "bold");
      doc.text(String(value), 55, y);
      y += 6;
    });
    (doc as any).autoTable({
      startY: y + 4,
      head: [["ID", "Date", "Description", "credit", "debit"]],
      body: [
        ...rows.map((r) => [
          String(r.id),
          r.date,
          r.description,
          r.credit ? String(r.credit) : "",
          r.debit ? String(r.debit) : "",
        ]),
        ["", "", "Total", String(totalCredit), String(totalDebit)],
      ],
      theme: "grid",
      headStyles: { fillColor: [243, 244, 246], textColor: 20, fontStyle: "bold", fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      columnStyles: {
        0: { cellWidth: 14 },
        1: { cellWidth: 28 },
        2: { cellWidth: "auto" },
        3: { halign: "right", cellWidth: 28 },
        4: { halign: "right", cellWidth: 28 },
      },
      didParseCell: (data: any) => {
        if (data.section === "body" && data.row.index === rows.length) {
          data.cell.styles.fontStyle = "bold";
        }
      },
      margin: { left: 14, right: 14 },
    });
    doc.save("reconciliation_report.pdf");
    toast({ title: "PDF downloaded", description: "Reconciliation report PDF saved." });
  };

  // Statistics
  const stats = useMemo(() => {
    const total = transactions.length;
    const matched = transactions.filter(t => t.status === "matched");
    const needReview = transactions.filter(t => t.status === "need_review");
    const unmatched = transactions.filter(t => t.status === "unmatched");
    const ignored = transactions.filter(t => t.status === "ignored");

    const matchedAmt = matched.reduce((sum, t) => sum + t.amount, 0);
    const needReviewAmt = needReview.reduce((sum, t) => sum + t.amount, 0);
    const unmatchedAmt = unmatched.reduce((sum, t) => sum + t.amount, 0);
    const ignoredAmt = ignored.reduce((sum, t) => sum + t.amount, 0);

    return {
      totalCount: total,
      matchedCount: matched.length,
      matchedAmount: matchedAmt,
      needReviewCount: needReview.length,
      needReviewAmount: needReviewAmt,
      unmatchedCount: unmatched.length,
      unmatchedAmount: unmatchedAmt,
      ignoredCount: ignored.length,
      ignoredAmount: ignoredAmt,
      progressPercent: total > 0 ? Math.round((matched.length / total) * 100) : 0
    };
  }, [transactions]);

  // Step 3 / sidebar amounts from uploaded statement
  const reconSummary = useMemo(() => {
    const signedNet = (list: BankTransaction[]) =>
      list.reduce((sum, t) => sum + (t.type === "credit" ? t.amount : -t.amount), 0);

    const matched = transactions.filter(t => t.status === "matched");
    const pending = transactions.filter(t => t.status === "need_review" || t.status === "unmatched");
    const pendingCredits = pending.filter(t => t.type === "credit");
    const pendingDebits = pending.filter(t => t.type === "debit");

    const booksBalance = signedNet(matched);
    const depositsInTransit = pendingCredits.reduce((sum, t) => sum + t.amount, 0);
    const outstandingPayments = pendingDebits.reduce((sum, t) => sum + t.amount, 0);
    const bankStatementClosing = booksBalance;
    const adjustedBankBalance = bankStatementClosing + depositsInTransit - outstandingPayments;
    const difference = adjustedBankBalance - booksBalance;

    return {
      bankStatementClosing,
      depositsInTransit,
      outstandingPayments,
      adjustedBankBalance,
      booksBalance,
      difference,
      isBalanced: Math.abs(difference) < 0.005,
    };
  }, [transactions]);

  // Filtered transactions for Step 1
  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      const matchesTab = 
        activeTab === "all" ||
        (activeTab === "matched" && t.status === "matched") ||
        (activeTab === "need_review" && t.status === "need_review") ||
        (activeTab === "unmatched" && t.status === "unmatched") ||
        (activeTab === "ignored" && t.status === "ignored");

      const matchesSearch = 
        t.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.matchedRef || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.matchedDetails || "").toLowerCase().includes(searchQuery.toLowerCase());

      return matchesTab && matchesSearch;
    });
  }, [transactions, activeTab, searchQuery]);

  const handleCreateVoucherClick = (tx: BankTransaction) => {
    setSelectedTxForVoucher(tx);
    setVoucherType(tx.type === "debit" ? "payment" : "receipt");
    setVoucherDescription(tx.description);
    
    // Auto select ledger account if possible
    if (tx.description.toLowerCase().includes("charge")) {
      const chargeAcc = accounts.find(a => a.name.toLowerCase().includes("charge"));
      if (chargeAcc) setLedgerAccount(String(chargeAcc.id));
    } else {
      const suspenseAcc = accounts.find(a => a.name.toLowerCase().includes("suspense"));
      if (suspenseAcc) setLedgerAccount(String(suspenseAcc.id));
    }
  };

  const handleSaveVoucher = async () => {
    if (!selectedTxForVoucher || !ledgerAccount || !selectedAccount) {
      toast({
        title: "Missing Information",
        description: "Please select a ledger account and ensure a bank account is selected.",
        variant: "destructive"
      });
      return;
    }
    
    const ledgerAccId = parseInt(ledgerAccount);
    const bankAccId = parseInt(selectedAccount);
    const amount = selectedTxForVoucher.amount;

    // Build double-entry lines
    const lines = [];
    if (selectedTxForVoucher.type === "debit") {
      // Money leaving bank: Debit Expense/Ledger, Credit Bank
      lines.push({ accountId: ledgerAccId, description: voucherDesc, debit: amount, credit: 0 });
      lines.push({ accountId: bankAccId, description: voucherDesc, debit: 0, credit: amount });
    } else {
      // Money entering bank: Debit Bank, Credit Income/Ledger
      lines.push({ accountId: bankAccId, description: voucherDesc, debit: amount, credit: 0 });
      lines.push({ accountId: ledgerAccId, description: voucherDesc, debit: 0, credit: amount });
    }

    try {
      const result = await createJournalEntryMutation.mutateAsync({
        entryDate: selectedTxForVoucher.date,
        description: `Bank Reconciliation: ${voucherDesc}`,
        lines
      });

      // Update local state to matched
      setTransactions(prev => prev.map(t => {
        if (t.id === selectedTxForVoucher.id) {
          const matchedAcc = accounts.find(a => a.id === ledgerAccId);
          return {
            ...t,
            status: "matched",
            matchedType: "Journal Entry",
            matchedRef: `JE-${result.id}`,
            matchedDetails: matchedAcc ? `${matchedAcc.code} ${matchedAcc.name}` : "Reconciled Account"
          };
        }
        return t;
      }));

      setSelectedTxForVoucher(null);
      toast({
        title: "Voucher Created & Reconciled",
        description: `Successfully posted Journal Entry JE-${result.id} to the general ledger.`
      });
    } catch (err: any) {
      // Handled in mutation onError
    }
  };

  const handleActionClick = (tx: BankTransaction, action: "match" | "ignore" | "review") => {
    setTransactions(prev => prev.map(t => {
      if (t.id === tx.id) {
        if (action === "match") {
          return {
            ...t,
            status: "matched",
            matchedType: "Receipt",
            matchedRef: `INV-${Math.floor(1000 + Math.random() * 9000)}`,
            matchedDetails: "Auto Matched Customer"
          };
        } else if (action === "ignore") {
          return { ...t, status: "ignored" };
        } else if (action === "review") {
          return { ...t, status: "need_review" };
        }
      }
      return t;
    }));
    toast({
      title: `Transaction updated`,
      description: `Status changed to ${action}.`
    });
  };

  const formatCurrency = (v: number) => {
    return new Intl.NumberFormat("en-SG", { style: "currency", currency: "SGD" }).format(v);
  };

  return (
    <div className="space-y-6 pb-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-5">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/dashboard")} className="h-9 w-9">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-[#2563EB]">Bank Reconciliation</h1>
              {step === 4 && <Badge className="bg-emerald-600">Complete</Badge>}
            </div>
            <p className="text-muted-foreground text-sm mt-0.5">
              Match and reconcile your bank transactions — upload new statements anytime
            </p>
          </div>
        </div>

        {/* Wizard Steps indicator */}
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground bg-muted/40 p-1.5 rounded-lg border">
          <span className={`px-2.5 py-1 rounded-md ${step === 1 ? "bg-white shadow text-primary font-semibold" : ""}`}>1. Upload & Match</span>
          <ChevronRight className="h-3 w-3" />
          <span className={`px-2.5 py-1 rounded-md ${step === 2 ? "bg-white shadow text-primary font-semibold" : ""}`}>2. Review & Resolve</span>
          <ChevronRight className="h-3 w-3" />
          <span className={`px-2.5 py-1 rounded-md ${step === 3 ? "bg-white shadow text-primary font-semibold" : ""}`}>3. Reconciliation</span>
          <ChevronRight className="h-3 w-3" />
          <span className={`px-2.5 py-1 rounded-md ${step === 4 ? "bg-white shadow text-primary font-semibold" : ""}`}>4. Finish</span>
        </div>
      </div>

      {/* STEP 1: Match dashboard (empty landing upload page skipped — use Upload New below) */}
      {step === 1 && (
        <>
            {/* Active Reconciliation Dashboard */}
            <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
              {/* Main Content Area */}
              <div className="xl:col-span-3 space-y-6">
                {/* Filters Bar — account, dates, upload grouped tightly on one line */}
                <div className="flex items-center gap-3 bg-card p-4 rounded-xl border shadow-sm">
                  <select
                    value={selectedAccount}
                    onChange={(e) => setSelectedAccount(e.target.value)}
                    className="h-9 w-[220px] shrink-0 rounded-md border border-input bg-background px-3 text-sm font-medium shadow-sm focus:outline-none"
                  >
                    {bankAccounts.length > 0 ? (
                      bankAccounts.map(a => (
                        <option key={a.id} value={a.id}>{a.code} {a.name}</option>
                      ))
                    ) : (
                      <option value="">No Bank Accounts Found</option>
                    )}
                  </select>

                  <div className="flex items-center gap-2 shrink-0">
                    <div className="w-[140px]">
                      <SyncBridgeDatePicker
                        value={dateFrom}
                        onChange={setDateFrom}
                        placeholder="From"
                        max={dateTo || undefined}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">to</span>
                    <div className="w-[140px]">
                      <SyncBridgeDatePicker
                        value={dateTo}
                        onChange={setDateTo}
                        placeholder="To"
                        min={dateFrom || undefined}
                      />
                    </div>
                  </div>

                  <Button
                    variant="outline"
                    onClick={() => setTransactions([])}
                    className="h-9 shrink-0 gap-1.5 text-rose-600 border-rose-200 hover:bg-rose-50"
                  >
                    Clear Statement
                  </Button>
                  <Button
                    onClick={() => fileInputRef.current?.click()}
                    className="bg-[#2563EB] hover:bg-[#1D4ED8] gap-2 h-9 shrink-0"
                  >
                    <Upload className="h-4 w-4" /> Upload Statement
                  </Button>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    accept=".csv"
                    className="hidden"
                  />
                </div>

                {/* KPI Cards */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <Card className="border-l-4 border-l-emerald-500 shadow-sm">
                    <CardContent className="p-4 flex flex-col justify-between h-full">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground font-medium">Auto Matched</span>
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      </div>
                      <div className="mt-2">
                        <p className="text-2xl font-bold text-emerald-600">{stats.matchedCount}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{formatCurrency(stats.matchedAmount)}</p>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-l-4 border-l-amber-500 shadow-sm">
                    <CardContent className="p-4 flex flex-col justify-between h-full">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground font-medium">Need Review</span>
                        <AlertCircle className="h-4 w-4 text-amber-500" />
                      </div>
                      <div className="mt-2">
                        <p className="text-2xl font-bold text-amber-600">{stats.needReviewCount}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{formatCurrency(stats.needReviewAmount)}</p>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-l-4 border-l-rose-500 shadow-sm">
                    <CardContent className="p-4 flex flex-col justify-between h-full">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground font-medium">Unmatched</span>
                        <XCircle className="h-4 w-4 text-rose-500" />
                      </div>
                      <div className="mt-2">
                        <p className="text-2xl font-bold text-rose-600">{stats.unmatchedCount}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{formatCurrency(stats.unmatchedAmount)}</p>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-l-4 border-l-gray-400 shadow-sm">
                    <CardContent className="p-4 flex flex-col justify-between h-full">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground font-medium">Ignored</span>
                        <MinusCircle className="h-4 w-4 text-gray-400" />
                      </div>
                      <div className="mt-2">
                        <p className="text-2xl font-bold text-gray-600">{stats.ignoredCount}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{formatCurrency(stats.ignoredAmount)}</p>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="shadow-sm bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-100">
                    <CardContent className="p-4 flex flex-col justify-between h-full">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-blue-700 font-semibold">Progress</span>
                        <Sparkles className="h-4 w-4 text-blue-500 animate-pulse" />
                      </div>
                      <div className="mt-2">
                        <p className="text-2xl font-bold text-blue-700">{stats.progressPercent}%</p>
                        <p className="text-[11px] text-blue-600 mt-0.5">{stats.matchedCount} / {stats.totalCount} Txns</p>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Transactions Table Area */}
                <Card className="shadow-sm">
                  <CardHeader className="pb-3 border-b">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      {/* Tabs */}
                      <div className="flex flex-wrap items-center gap-1.5 border p-1 rounded-lg bg-muted/30 text-xs font-medium w-fit">
                        <button onClick={() => setActiveTab("all")} className={`px-3 py-1.5 rounded-md transition-colors ${activeTab === "all" ? "bg-white shadow text-primary" : "text-muted-foreground hover:text-foreground"}`}>All ({stats.totalCount})</button>
                        <button onClick={() => setActiveTab("matched")} className={`px-3 py-1.5 rounded-md transition-colors ${activeTab === "matched" ? "bg-white shadow text-emerald-600" : "text-muted-foreground hover:text-foreground"}`}>Auto Matched ({stats.matchedCount})</button>
                        <button onClick={() => setActiveTab("need_review")} className={`px-3 py-1.5 rounded-md transition-colors ${activeTab === "need_review" ? "bg-white shadow text-amber-600" : "text-muted-foreground hover:text-foreground"}`}>Need Review ({stats.needReviewCount})</button>
                        <button onClick={() => setActiveTab("unmatched")} className={`px-3 py-1.5 rounded-md transition-colors ${activeTab === "unmatched" ? "bg-white shadow text-rose-600" : "text-muted-foreground hover:text-foreground"}`}>Unmatched ({stats.unmatchedCount})</button>
                        <button onClick={() => setActiveTab("ignored")} className={`px-3 py-1.5 rounded-md transition-colors ${activeTab === "ignored" ? "bg-white shadow text-gray-600" : "text-muted-foreground hover:text-foreground"}`}>Ignored ({stats.ignoredCount})</button>
                      </div>

                      {/* Search */}
                      <div className="relative w-full sm:w-64">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input 
                          placeholder="Search description, ref..." 
                          className="pl-8 h-8 text-xs"
                          value={searchQuery}
                          onChange={(e) => setSearchTerm(e.target.value)}
                        />
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm border-collapse">
                        <thead>
                          <tr className="border-b bg-muted/20 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            <th className="px-4 py-3 text-left">Date</th>
                            <th className="px-4 py-3 text-left">Bank Statement Description</th>
                            <th className="px-4 py-3 text-right">Amount (SGD)</th>
                            <th className="px-4 py-3 text-left">Matched with (Books)</th>
                            <th className="px-4 py-3 text-left">Details</th>
                            <th className="px-4 py-3 text-center">Status</th>
                            <th className="px-4 py-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y text-xs">
                          {filteredTransactions.map((tx) => (
                            <tr key={tx.id} className="hover:bg-muted/10 transition-colors">
                              <td className="px-4 py-3.5 font-medium text-muted-foreground whitespace-nowrap">{tx.date}</td>
                              <td className="px-4 py-3.5 font-medium max-w-[200px] truncate" title={tx.description}>{tx.description}</td>
                              <td className={`px-4 py-3.5 text-right font-bold tabular-nums whitespace-nowrap ${tx.type === "debit" ? "text-rose-600" : "text-emerald-600"}`}>
                                {tx.type === "debit" ? "-" : ""}{formatCurrency(tx.amount)}
                              </td>
                              <td className="px-4 py-3.5 font-semibold text-slate-700">
                                {tx.matchedType ? (
                                  <span className="flex items-center gap-1">
                                    <FileText className="h-3 w-3 text-blue-500" />
                                    {tx.matchedType} <span className="font-mono text-[10px] text-muted-foreground">({tx.matchedRef})</span>
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground italic">No Match Found</span>
                                )}
                              </td>
                              <td className="px-4 py-3.5 text-muted-foreground whitespace-nowrap">{tx.matchedDetails || "—"}</td>
                              <td className="px-4 py-3.5 text-center whitespace-nowrap">
                                {tx.status === "matched" ? (
                                  <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-50 shadow-none">Matched</Badge>
                                ) : tx.status === "need_review" ? (
                                  <Badge className="bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-50 shadow-none">Need Review</Badge>
                                ) : tx.status === "unmatched" ? (
                                  <Badge className="bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-50 shadow-none">Unmatched</Badge>
                                ) : (
                                  <Badge className="bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-50 shadow-none">Ignored</Badge>
                                )}
                              </td>
                              <td className="px-4 py-3.5 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-center justify-end gap-1.5">
                                  {tx.status === "need_review" && (
                                    <>
                                      <Button size="sm" variant="outline" className="h-7 text-[10px] border-emerald-500 text-emerald-600 hover:bg-emerald-50" onClick={() => handleActionClick(tx, "match")}>Quick Match</Button>
                                      <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => { setStep(2); handleCreateVoucherClick(tx); }}>Create Voucher</Button>
                                    </>
                                  )}
                                  {tx.status === "unmatched" && (
                                    <>
                                      <Button size="sm" variant="outline" className="h-7 text-[10px] border-amber-500 text-amber-600 hover:bg-amber-50" onClick={() => handleActionClick(tx, "review")}>Mark Review</Button>
                                      <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => handleActionClick(tx, "ignore")}>Ignore</Button>
                                    </>
                                  )}
                                  {tx.status === "matched" && (
                                    <span className="text-emerald-600 font-semibold flex items-center gap-1"><Check className="h-4.5 w-4.5" /> Verified</span>
                                  )}
                                  {tx.status === "ignored" && (
                                    <Button size="sm" variant="ghost" className="h-7 text-[10px] text-muted-foreground" onClick={() => handleActionClick(tx, "review")}>Restore</Button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>

                {/* Bottom buttons */}
                <div className="flex justify-end items-center bg-card p-4 rounded-xl border shadow-sm">
                  <Button onClick={() => setStep(2)} className="bg-[#2563EB] hover:bg-[#1D4ED8] gap-2">
                    Next: Review {stats.needReviewCount} Items <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Right Sidebar */}
              <div className="space-y-6">
                {/* Reconciliation Summary Card */}
                <Card className="shadow-sm">
                  <CardHeader className="pb-3 border-b">
                    <CardTitle className="text-sm font-bold text-slate-800">Reconciliation Summary</CardTitle>
                    <p className="text-[11px] text-muted-foreground">as on 31 Jul 2026</p>
                  </CardHeader>
                  <CardContent className="p-4 space-y-4 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Bank Statement Closing Balance</span>
                      <span className="font-bold text-slate-800">{formatCurrency(reconSummary.adjustedBankBalance)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Book Balance (As per Books)</span>
                      <span className="font-bold text-slate-800">{formatCurrency(reconSummary.booksBalance)}</span>
                    </div>
                    <div className="border-t pt-3 flex justify-between items-center">
                      <span className="font-semibold text-slate-800">Difference</span>
                      <div className="text-right">
                        <p className={`font-bold ${reconSummary.isBalanced ? "text-emerald-600" : "text-rose-600"}`}>
                          {formatCurrency(reconSummary.difference)}
                        </p>
                        <Badge className={`mt-1 shadow-none ${reconSummary.isBalanced ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-amber-50 text-amber-700 border border-amber-200"}`}>
                          {transactions.length === 0 ? "No statement" : reconSummary.isBalanced ? "Perfectly Matched" : "Needs Attention"}
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Breakdown Card */}
                <Card className="shadow-sm">
                  <CardHeader className="pb-3 border-b">
                    <CardTitle className="text-sm font-bold text-slate-800">Breakdown</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 space-y-3 text-xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                        <span className="text-slate-600">Auto Matched</span>
                      </div>
                      <span className="font-semibold text-slate-800">{stats.matchedCount} ({stats.progressPercent}%)</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                        <span className="text-slate-600">Need Review</span>
                      </div>
                      <span className="font-semibold text-slate-800">{stats.needReviewCount}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
                        <span className="text-slate-600">Unmatched</span>
                      </div>
                      <span className="font-semibold text-slate-800">{stats.unmatchedCount}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full bg-gray-400" />
                        <span className="text-slate-600">Ignored</span>
                      </div>
                      <span className="font-semibold text-slate-800">{stats.ignoredCount}</span>
                    </div>
                  </CardContent>
                </Card>

                {/* Recent Reconciliations */}
                <Card className="shadow-sm">
                  <CardHeader className="pb-3 border-b flex flex-row items-center justify-between">
                    <CardTitle className="text-sm font-bold text-slate-800">Recent Reconciliations</CardTitle>
                    <Button variant="link" size="sm" className="text-xs text-[#2563EB] p-0 h-auto">View All</Button>
                  </CardHeader>
                  <CardContent className="p-4 space-y-3 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-slate-700">01 Jul - 31 Jul 2026</span>
                      <div className="flex items-center gap-2">
                        <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-100 shadow-none">Reconciled</Badge>
                        <span className="font-semibold text-slate-800">100%</span>
                      </div>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-slate-700">01 Jun - 30 Jun 2026</span>
                      <div className="flex items-center gap-2">
                        <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-100 shadow-none">Reconciled</Badge>
                        <span className="font-semibold text-slate-800">100%</span>
                      </div>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-slate-700">01 May - 31 May 2026</span>
                      <div className="flex items-center gap-2">
                        <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-100 shadow-none">Reconciled</Badge>
                        <span className="font-semibold text-slate-800">100%</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
        </>
      )}

      {/* STEP 2: REVIEW & RESOLVE */}
      {step === 2 && (
        <div className="space-y-6">
          <Card className="shadow-sm">
            <CardHeader className="pb-3 border-b flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base font-bold text-slate-800 flex items-center gap-2">
                  <span className="bg-rose-100 text-rose-700 px-2 py-0.5 rounded-md text-xs font-bold">STEP 2 OF 3</span>
                  FIX — Items Need Your Attention
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">These transactions have no clear match in your books. Create a voucher or find a match.</p>
              </div>
              <Badge className="bg-rose-100 text-rose-800 border border-rose-200 hover:bg-rose-100">
                {transactions.filter(t => t.status === "need_review").length} Items Pending
              </Badge>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-hidden">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b bg-muted/20 text-xs font-semibold text-muted-foreground uppercase">
                      <th className="px-4 py-3 text-left whitespace-nowrap">Date</th>
                      <th className="px-4 py-3 text-left">Description (Bank)</th>
                      <th className="px-4 py-3 text-center whitespace-nowrap">Type</th>
                      <th className="px-4 py-3 text-right whitespace-nowrap">Amount</th>
                      <th className="px-4 py-3 text-center whitespace-nowrap">Status</th>
                      <th className="px-4 py-3 text-right whitespace-nowrap">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y text-xs">
                    {transactions.filter(t => t.status === "need_review").length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center py-10 text-muted-foreground">
                          All pending items have been resolved! Click &quot;Next&quot; to view the summary.
                        </td>
                      </tr>
                    ) : (
                      transactions.filter(t => t.status === "need_review").map((tx) => (
                        <tr key={tx.id} className="hover:bg-muted/10 transition-colors">
                          <td className="px-4 py-3.5 font-medium text-muted-foreground whitespace-nowrap">{tx.date}</td>
                          <td className="px-4 py-3.5 font-semibold text-slate-800">{tx.description}</td>
                          <td className="px-4 py-3.5 text-center">
                            {tx.type === "debit" ? (
                              <Badge className="bg-rose-50 text-rose-700 border border-rose-100 shadow-none">Debit</Badge>
                            ) : (
                              <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-100 shadow-none">Credit</Badge>
                            )}
                          </td>
                          <td className="px-4 py-3.5 text-right font-bold tabular-nums whitespace-nowrap">{formatCurrency(tx.amount)}</td>
                          <td className="px-4 py-3.5 text-center whitespace-nowrap">
                            <Badge className="bg-amber-100 text-amber-800 border border-amber-200 hover:bg-amber-100 shadow-none">
                              Create Voucher
                            </Badge>
                          </td>
                          <td className="px-4 py-3.5 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                size="sm"
                                className="h-8 bg-rose-600 hover:bg-rose-700 text-white text-xs gap-1"
                                onClick={() => handleCreateVoucherClick(tx)}
                              >
                                Create Voucher
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 text-amber-600 border-amber-200 hover:bg-amber-50 text-xs"
                                onClick={() => handleActionClick(tx, "match")}
                              >
                                Find Match
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Navigation buttons */}
          <div className="flex justify-between items-center bg-card p-4 rounded-xl border shadow-sm">
            <Button variant="outline" onClick={() => setStep(1)} className="gap-1.5">
              <ChevronLeft className="h-4 w-4" /> Back to Step 1
            </Button>
            <Button onClick={() => setStep(3)} className="bg-[#2563EB] hover:bg-[#1D4ED8] gap-2">
              Next: Summary <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Create Voucher popup */}
      <Dialog open={!!selectedTxForVoucher} onOpenChange={(open) => { if (!open) setSelectedTxForVoucher(null); }}>
        <DialogContent className="max-w-md sm:max-w-lg">
          {selectedTxForVoucher && (
            <>
              <DialogHeader>
                <div className="flex items-start justify-between gap-3 pr-6">
                  <div>
                    <DialogTitle>Create Voucher</DialogTitle>
                    <DialogDescription className="mt-1">
                      {selectedTxForVoucher.date} | {selectedTxForVoucher.description}
                    </DialogDescription>
                  </div>
                  <span className="text-sm font-bold text-rose-600 shrink-0 pt-0.5">
                    {formatCurrency(selectedTxForVoucher.amount)}
                  </span>
                </div>
              </DialogHeader>

              <div className="space-y-4 text-sm py-1">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">Voucher Type</label>
                  <select
                    value={voucherType}
                    onChange={(e) => setVoucherType(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none"
                  >
                    <option value="payment">Payment</option>
                    <option value="receipt">Receipt</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">Date</label>
                  <Input type="text" value={selectedTxForVoucher.date} disabled className="h-9" />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">Ledger Account</label>
                  <Select
                    value={ledgerAccount || undefined}
                    onValueChange={setLedgerAccount}
                  >
                    <SelectTrigger className="h-9 bg-background">
                      <SelectValue placeholder="-- Select Account --" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[17.5rem]" position="popper">
                      {accounts.filter(a => a.isActive).map(a => (
                        <SelectItem key={a.id} value={String(a.id)}>
                          {a.code} {a.name} ({a.type})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700">Amount</label>
                    <Input type="number" value={selectedTxForVoucher.amount} disabled className="h-9" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700">GST</label>
                    <select
                      value={voucherGst}
                      onChange={(e) => setVoucherGst(e.target.value)}
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none"
                    >
                      <option value="No GST">No GST</option>
                      <option value="SR (9%)">SR (9%)</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">Description</label>
                  <Textarea
                    value={voucherDesc}
                    onChange={(e) => setVoucherDescription(e.target.value)}
                    rows={3}
                    className="resize-none text-sm"
                  />
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" className="h-9" onClick={() => setSelectedTxForVoucher(null)}>
                  Cancel
                </Button>
                <Button
                  className="bg-emerald-600 hover:bg-emerald-700 text-white h-9"
                  onClick={handleSaveVoucher}
                  disabled={createJournalEntryMutation.isPending}
                >
                  {createJournalEntryMutation.isPending ? "Saving…" : "Save & Reconcile"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* STEP 3: TALLY SUMMARY */}
      {step === 3 && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Left: Tally Checklist & Summary */}
          <div className="xl:col-span-2 space-y-6">
            <Card className="shadow-sm">
              <CardHeader className="pb-3 border-b">
                <CardTitle className="text-base font-bold text-slate-800 flex items-center gap-2">
                  <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-md text-xs font-bold">STEP 3 OF 3</span>
                  Reconciliation Summary
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">Verify that your adjusted bank statement balance matches your adjusted general ledger books balance.</p>
              </CardHeader>
              <CardContent className="p-6 space-y-6 text-sm">
                <div className="space-y-4 border rounded-xl p-5 bg-slate-50/50">
                  <div className="flex justify-between items-center pb-2 border-b">
                    <span className="text-slate-600">Bank Statement Closing Balance</span>
                    <span className="font-bold text-slate-800">{formatCurrency(reconSummary.bankStatementClosing)}</span>
                  </div>
                  <div className="flex justify-between items-center text-emerald-600 font-medium">
                    <span>Add: Deposits in Transit</span>
                    <span>+{formatCurrency(reconSummary.depositsInTransit)}</span>
                  </div>
                  <div className="flex justify-between items-center text-rose-600 font-medium pb-2 border-b">
                    <span>Less: Outstanding Payments</span>
                    <span>-{formatCurrency(reconSummary.outstandingPayments)}</span>
                  </div>
                  <div className="flex justify-between items-center font-bold text-slate-800 text-base pt-1">
                    <span>Adjusted Bank Balance</span>
                    <span>{formatCurrency(reconSummary.adjustedBankBalance)}</span>
                  </div>
                  <div className="flex justify-between items-center font-bold text-slate-800 text-base pt-2 border-t border-dashed">
                    <span>Books Balance (After Adjustments)</span>
                    <span>{formatCurrency(reconSummary.booksBalance)}</span>
                  </div>
                </div>

                <div className={`flex flex-col items-center justify-center border-2 rounded-xl p-6 text-center ${reconSummary.isBalanced ? "border-emerald-500 bg-emerald-50/30" : "border-amber-400 bg-amber-50/30"}`}>
                  <div className={`p-2.5 rounded-full mb-3 ${reconSummary.isBalanced ? "bg-emerald-100 text-emerald-600" : "bg-amber-100 text-amber-600"}`}>
                    {reconSummary.isBalanced ? <Check className="h-6 w-6 stroke-[3]" /> : <AlertCircle className="h-6 w-6" />}
                  </div>
                  <h3 className={`text-2xl font-black ${reconSummary.isBalanced ? "text-emerald-700" : "text-amber-700"}`}>
                    DIFFERENCE: {formatCurrency(reconSummary.difference)}
                  </h3>
                  <p className={`text-xs font-bold mt-1 ${reconSummary.isBalanced ? "text-emerald-600" : "text-amber-700"}`}>
                    {reconSummary.isBalanced
                      ? "Perfectly balanced! Bank and Book balances are completely reconciled."
                      : "Balances do not match yet. Resolve pending items, then check again."}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Navigation buttons */}
            <div className="flex justify-between items-center bg-card p-4 rounded-xl border shadow-sm">
              <Button variant="outline" onClick={() => setStep(2)} className="gap-1.5">
                <ChevronLeft className="h-4 w-4" /> Back to Step 2
              </Button>
              <Button onClick={() => setStep(4)} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2">
                Complete Reconciliation <CheckCircle2 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Right Sidebar: Report Info */}
          <div className="space-y-6">
            <Card className="shadow-sm">
              <CardHeader className="pb-3 border-b">
                <CardTitle className="text-sm font-bold text-slate-800">Reconciliation</CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-4 text-xs">
                <div className="space-y-3">
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground shrink-0">Bank Account</span>
                    <span className="font-semibold text-slate-800 text-right">{reportMeta.bankAccount}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground shrink-0">Period</span>
                    <span className="font-semibold text-slate-800 text-right">{reportMeta.period}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground shrink-0">Prepared By</span>
                    <span className="font-semibold text-slate-800 text-right">{reportMeta.preparedBy}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground shrink-0">Prepared On</span>
                    <span className="font-semibold text-slate-800 text-right">{reportMeta.preparedOn}</span>
                  </div>
                </div>

                <div className="border-t pt-4 space-y-2">
                  <Button variant="outline" onClick={handlePrintReport} className="w-full justify-start gap-2 h-9 text-xs">
                    <FileText className="h-4 w-4 text-blue-500" /> Print
                  </Button>
                  <Button variant="outline" onClick={handleExportExcel} className="w-full justify-start gap-2 h-9 text-xs">
                    <FileSpreadsheet className="h-4 w-4 text-emerald-500" /> Export to Excel
                  </Button>
                  <Button variant="outline" onClick={handleDownloadPdf} className="w-full justify-start gap-2 h-9 text-xs">
                    <Download className="h-4 w-4 text-red-500" /> Download PDF
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* STEP 4: SUCCESS COMPLETED */}
      {step === 4 && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Left Main Success Card */}
          <div className="xl:col-span-2 space-y-6">
            <Card className="shadow-lg border-emerald-100 overflow-hidden relative">
              {/* Confetti background effect */}
              <div className="absolute top-0 right-0 h-40 w-40 bg-emerald-100/30 rounded-full blur-3xl -z-10" />
              <div className="absolute bottom-0 left-0 h-40 w-40 bg-teal-100/20 rounded-full blur-3xl -z-10" />

              <CardContent className="p-8 flex flex-col items-center justify-center text-center space-y-6">
                {/* Big Green Check Circle */}
                <div className="h-24 w-24 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center shadow-inner animate-bounce">
                  <Check className="h-12 w-12 stroke-[3]" />
                </div>

                <div className="space-y-2">
                  <h2 className="text-2xl font-black text-slate-800">Reconciliation Completed Successfully!</h2>
                  <p className="text-sm text-muted-foreground max-w-md">Great job! Your bank and book balances are now matched.</p>
                </div>

                {/* Balances Match Box */}
                <div className="flex items-center justify-center gap-6 bg-slate-50 border p-4 rounded-xl w-full max-w-lg shadow-sm">
                  <div className="text-center flex-1">
                    <p className="text-[10px] text-muted-foreground uppercase font-bold">Bank Balance</p>
                    <p className="text-lg font-black text-slate-800 mt-1">{formatCurrency(reconSummary.adjustedBankBalance)}</p>
                  </div>
                  <div className="text-xl font-bold text-muted-foreground">=</div>
                  <div className="text-center flex-1">
                    <p className="text-[10px] text-muted-foreground uppercase font-bold">Book Balance</p>
                    <p className="text-lg font-black text-slate-800 mt-1">{formatCurrency(reconSummary.booksBalance)}</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-2 w-full max-w-lg">
                  <Button variant="outline" onClick={handlePrintReport} className="h-9 text-xs gap-1.5 flex-1 min-w-[100px]">
                    <FileText className="h-4 w-4 text-blue-500" /> Print
                  </Button>
                  <Button variant="outline" onClick={handleExportExcel} className="h-9 text-xs gap-1.5 flex-1 min-w-[100px]">
                    <FileSpreadsheet className="h-4 w-4 text-emerald-500" /> Excel
                  </Button>
                  <Button variant="outline" onClick={handleDownloadPdf} className="h-9 text-xs gap-1.5 flex-1 min-w-[100px]">
                    <Download className="h-4 w-4 text-red-500" /> PDF
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Sidebar Completed Info */}
          <div className="space-y-6">
            {/* Status Card */}
            <Card className="shadow-sm relative overflow-hidden">
              <CardHeader className="pb-3 border-b">
                <CardTitle className="text-sm font-bold text-slate-800">Status</CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-4 text-xs">
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Status</span>
                    <Badge className="bg-emerald-100 text-emerald-800 border border-emerald-200 shadow-none">RECONCILED</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Completed On</span>
                    <span className="font-semibold text-slate-800">12 Aug 2026, 04:35 PM</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Reconciled By</span>
                    <span className="font-semibold text-slate-800">Admin</span>
                  </div>
                </div>

                {/* Stamp Effect */}
                <div className="border-t pt-4 flex justify-center">
                  <div className="border-4 border-emerald-500/30 text-emerald-600/60 font-black text-xl uppercase tracking-widest px-6 py-2 rounded-lg rotate-12 border-double">
                    RECONCILED
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Reconciliation Summary Card */}
            <Card className="shadow-sm">
              <CardHeader className="pb-3 border-b">
                <CardTitle className="text-sm font-bold text-slate-800">Reconciliation Summary</CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-3 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Auto Matched</span>
                  <span className="font-semibold text-slate-800">{stats.matchedCount} ({formatCurrency(stats.matchedAmount)})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Reviewed</span>
                  <span className="font-semibold text-slate-800">{stats.needReviewCount} ({formatCurrency(stats.needReviewAmount)})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Manually Created</span>
                  <span className="font-semibold text-slate-800">0 ($0.00)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Exceptions</span>
                  <span className="font-semibold text-slate-800">0 ($0.00)</span>
                </div>
                <div className="border-t pt-3 space-y-2">
                  <div className="flex justify-between font-bold text-slate-800">
                    <span>Total Transactions</span>
                    <span>{stats.totalCount}</span>
                  </div>
                  <div className="flex justify-between font-bold text-slate-800">
                    <span>Total Amount</span>
                    <span>{formatCurrency(stats.matchedAmount + stats.needReviewAmount)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
