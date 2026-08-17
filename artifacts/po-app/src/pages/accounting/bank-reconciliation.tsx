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
import { usePagination } from "@/hooks/use-pagination";
import { ListPagination } from "@/components/list-pagination";
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
  Landmark,
  BookOpen,
} from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { SyncBridgeDatePicker } from "@/components/ui/sync-bridge-date-picker";
import { jsPDF } from "jspdf";
import "jspdf-autotable";
import * as XLSX from "xlsx";
import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

// Types
interface BankTransaction {
  id: number;
  date: string;
  dateDisplay?: string;
  valueDate?: string;
  valueDateDisplay?: string;
  description: string;
  refNo?: string;
  amount: number;
  type: "credit" | "debit";
  balance?: number;
  balanceDisplay?: string;
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
  return `${Number(d)} ${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][Number(m) - 1]} ${y}`;
}

function isValidIsoDate(value?: string): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function compareIsoDates(a: string, b: string): number {
  const aa = isValidIsoDate(a) ? a : "";
  const bb = isValidIsoDate(b) ? b : "";
  if (aa && bb) return aa.localeCompare(bb);
  if (aa) return -1;
  if (bb) return 1;
  return 0;
}

function getTransactionSortDate(tx: BankTransaction): string {
  if (isValidIsoDate(tx.date)) return tx.date;
  if (isValidIsoDate(tx.valueDate)) return tx.valueDate;
  return "";
}

function sortBankTransactions(rows: BankTransaction[], reassignIds = false): BankTransaction[] {
  const sorted = [...rows].sort((a, b) => {
    const byTxnDate = compareIsoDates(a.date, b.date);
    if (byTxnDate !== 0) return byTxnDate;
    const byValueDate = compareIsoDates(a.valueDate || "", b.valueDate || "");
    if (byValueDate !== 0) return byValueDate;
    return a.id - b.id;
  });
  if (!reassignIds) return sorted;
  return sorted.map((row, index) => ({ ...row, id: index + 1 }));
}

function normalizeFilterDate(value: string): string {
  if (!value) return "";
  const raw = value.includes("T") ? value.split("T")[0] : value.trim();
  if (isValidIsoDate(raw)) return raw;
  return "";
}

function validateAndFilterStatementByPeriod(
  rows: BankTransaction[],
  dateFrom: string,
  dateTo: string,
): { filtered: BankTransaction[]; error: string | null; excluded: number } {
  const from = normalizeFilterDate(dateFrom);
  const to = normalizeFilterDate(dateTo);
  if (!from || !to) {
    return {
      filtered: [],
      error: "Please select a date range before uploading the statement.",
      excluded: 0,
    };
  }
  if (from > to) {
    return {
      filtered: [],
      error: "Start date must be before end date.",
      excluded: 0,
    };
  }

  const periodLabel = `${formatPeriodDate(from)} – ${formatPeriodDate(to)}`;
  const datedRows = rows
    .map((row) => ({ row, date: getTransactionSortDate(row) }))
    .filter((entry): entry is { row: BankTransaction; date: string } => isValidIsoDate(entry.date));

  if (datedRows.length === 0) {
    return {
      filtered: [],
      error: "Could not read transaction dates from this statement. Please check the file format.",
      excluded: 0,
    };
  }

  const stmtDates = datedRows.map((entry) => entry.date);
  const stmtMin = stmtDates.reduce((a, b) => (a < b ? a : b));
  const stmtMax = stmtDates.reduce((a, b) => (a > b ? a : b));
  const stmtLabel = `${formatPeriodDate(stmtMin)} – ${formatPeriodDate(stmtMax)}`;

  // Reject only when the statement period has zero overlap with the selected filter.
  if (stmtMax < from || stmtMin > to) {
    return {
      filtered: [],
      error: `This statement (${stmtLabel}) does not match the selected period (${periodLabel}). Please upload the statement for ${formatPeriodDate(from)} to ${formatPeriodDate(to)}.`,
      excluded: 0,
    };
  }

  const filtered = rows.filter((row) => {
    const date = getTransactionSortDate(row);
    if (!isValidIsoDate(date)) return false;
    return date >= from && date <= to;
  });

  const excluded = rows.length - filtered.length;
  if (filtered.length === 0) {
    return {
      filtered: [],
      error: `No transactions found within the selected period (${periodLabel}). Please upload the ${formatPeriodDate(from)} to ${formatPeriodDate(to)} statement.`,
      excluded,
    };
  }

  return {
    filtered: sortBankTransactions(filtered, true),
    error: null,
    excluded,
  };
}

/** Indian numbering: 100000 → 1,00,000.00 */
function formatIndianAmount(value: number): string {
  const [intPart, dec = "00"] = Math.abs(value).toFixed(2).split(".");
  if (intPart.length <= 3) return `${intPart}.${dec}`;
  const last3 = intPart.slice(-3);
  let rest = intPart.slice(0, -3);
  const groups: string[] = [last3];
  while (rest.length > 0) {
    groups.unshift(rest.slice(-2));
    rest = rest.slice(0, -2);
  }
  return `${groups.join(",")}.${dec}`;
}

const MONTH_NAME_MAP: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

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

  function autoMatchFromDescription(description: string) {
    let status: "matched" | "need_review" = "need_review";
    let matchedType: string | undefined;
    let matchedRef: string | undefined;
    let matchedDetails: string | undefined;
    const lower = description.toLowerCase();

    if (lower.includes("abc pte ltd")) {
      status = "matched";
      matchedType = "Receipt";
      matchedRef = "INV-1004";
      matchedDetails = "ABC Pte Ltd";
    } else if (lower.includes("uob bank charge")) {
      status = "matched";
      matchedType = "Bank Charges";
      matchedRef = "BC-9921";
      matchedDetails = "Bank Charges";
    }

    return { status, matchedType, matchedRef, matchedDetails };
  }

  function rowsToTransactions(rows: ParsedStatementRow[]) {
    const mapped = rows.map((row, idx) => {
      const match = autoMatchFromDescription(row.description);
      return {
        id: idx + 1,
        date: row.date,
        dateDisplay: row.dateDisplay,
        valueDate: row.valueDate,
        valueDateDisplay: row.valueDateDisplay,
        description: row.description,
        refNo: row.refNo,
        amount: row.amount,
        type: row.type,
        balance: row.balance,
        balanceDisplay: row.balanceDisplay,
        ...match,
      } satisfies BankTransaction;
    });
    return sortBankTransactions(mapped, true);
  }

  function normalizeType(raw: string, signedAmount: number): "credit" | "debit" {
    const t = raw.trim().toLowerCase();
    if (/(credit|cr\b|deposit|inflow|receipt|received)/.test(t)) return "credit";
    if (/(debit|dr\b|withdrawal|outflow|payment|paid)/.test(t)) return "debit";
    return signedAmount < 0 ? "debit" : "credit";
  }

  function parseAmountValue(raw: unknown): number | null {
    if (raw == null || raw === "") return null;
    if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
    const s = String(raw).trim();
    if (!s || /^[-–—]$/.test(s)) return null;
    // Reject date/time strings — they become nonsense amounts
    if (/^\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d/.test(s)) return null;
    if (/^\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}/.test(s)) return null;
    if (/\d{1,2}:\d{2}(:\d{2})?/.test(s) && !/[\d,]+\.\d{1,2}/.test(s)) return null;
    const neg = /^\(.*\)$/.test(s) || /^[-−]/.test(s);
    // Indian (1,00,000.00) and Western (1,000,000.00) grouping — strip commas
    const cleaned = s.replace(/[₹$+\s()]/g, "").replace(/,/g, "").replace(/[^\d.\-]/g, "");
    const n = parseFloat(cleaned);
    if (isNaN(n)) return null;
    return neg ? -Math.abs(n) : n;
  }

  function parseSignedAmount(raw: unknown): { amount: number; type: "credit" | "debit" } | null {
    const s = String(raw ?? "").trim();
    if (!s) return null;
    const val = parseAmountValue(s);
    if (val == null || Math.abs(val) < 0.001) return null;
    let type: "credit" | "debit" = "credit";
    if (/^[-−]/.test(s)) type = "debit";
    else if (/^\+/.test(s)) type = "credit";
    else if (val < 0) type = "debit";
    return { amount: Math.abs(val), type };
  }

  function parseDateTimeCell(raw: unknown): { iso: string; display: string } {
    const s = String(raw ?? "").trim();
    const iso = formatCellDate(raw);
    const displayDate = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? formatPeriodDate(iso) : (s || "—");
    const timeMatch = s.match(/\b(\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?)\b/i);
    const display = timeMatch ? `${displayDate}\n${timeMatch[1].trim()}` : displayDate;
    return { iso: /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : "", display };
  }

  function formatCellDate(raw: unknown): string {
    if (raw instanceof Date && !isNaN(raw.getTime())) {
      return `${raw.getFullYear()}-${String(raw.getMonth() + 1).padStart(2, "0")}-${String(raw.getDate()).padStart(2, "0")}`;
    }
    if (typeof raw === "number" && raw > 20000 && XLSX.SSF?.parse_date_code) {
      const parsed = XLSX.SSF.parse_date_code(raw);
      if (parsed) {
        return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
      }
    }
    const s = String(raw ?? "").trim();
    if (!s) return "";
    // already yyyy-mm-dd
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    // 10 Sep 2025 or 10 Sep 2025 01:19 PM
    const textDate = s.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})\b/);
    if (textDate) {
      const mm = MONTH_NAME_MAP[textDate[2].slice(0, 3).toLowerCase()];
      if (mm) {
        return `${textDate[3]}-${mm}-${textDate[1].padStart(2, "0")}`;
      }
    }
    // dd/mm/yyyy with optional time suffix (e.g. 31/03/2025 06:48:06 PM)
    const dmyWithTime = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/);
    if (dmyWithTime) {
      const dd = dmyWithTime[1].padStart(2, "0");
      const mm = dmyWithTime[2].padStart(2, "0");
      let yyyy = dmyWithTime[3];
      if (yyyy.length === 2) yyyy = Number(yyyy) > 50 ? `19${yyyy}` : `20${yyyy}`;
      return `${yyyy}-${mm}-${dd}`;
    }
    // dd/mm/yyyy or dd-mm-yyyy
    const dmy = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
    if (dmy) {
      const dd = dmy[1].padStart(2, "0");
      const mm = dmy[2].padStart(2, "0");
      let yyyy = dmy[3];
      if (yyyy.length === 2) yyyy = Number(yyyy) > 50 ? `19${yyyy}` : `20${yyyy}`;
      return `${yyyy}-${mm}-${dd}`;
    }
    const asDate = new Date(s);
    if (!isNaN(asDate.getTime())) {
      return `${asDate.getFullYear()}-${String(asDate.getMonth() + 1).padStart(2, "0")}-${String(asDate.getDate()).padStart(2, "0")}`;
    }
    return s;
  }

  function looksLikeDateOrTime(text: string): boolean {
    const t = text.trim();
    if (!t) return false;
    if (/^\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d/.test(t)) return true;
    if (/^\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}/.test(t)) return true;
    if (/^\d{1,2}:\d{2}(:\d{2})?(\s*(AM|PM))?$/i.test(t)) return true;
    if (/^:\d{2}(:\d{2})?(\s*(AM|PM))?$/i.test(t)) return true;
    if (/^-\s*\d{1,2}[\/\-.]\d/.test(t)) return true;
    return false;
  }

  /** Pick the transaction amount when a line has deposit, withdrawal, and running balance. */
  function pickStatementAmount(
    amounts: Array<{ value: number; raw: string; index?: number }>,
  ): { value: number; raw: string; type?: "credit" | "debit" } | null {
    if (amounts.length === 0) return null;

    // Prefer amounts with explicit +/- (Debit/Credit column)
    const signedTokens = amounts.filter((a) => /^[+-]/.test(a.raw.trim()));
    for (const tok of signedTokens) {
      const s = parseSignedAmount(tok.raw);
      if (s) return { ...tok, value: s.amount, type: s.type };
    }

    const ordered = [...amounts].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));

    // Singapore bank export order: Deposit | Withdrawal | Ledger Balance
    if (ordered.length >= 3) {
      const deposit = ordered[0];
      const withdrawal = ordered[1];
      if (Math.abs(withdrawal.value) > 0.001) {
        return { ...withdrawal, type: "debit" };
      }
      if (Math.abs(deposit.value) > 0.001) {
        return { ...deposit, type: "credit" };
      }
      return null;
    }

    // Indian bank: Debit/Credit | Balance (two columns)
    if (ordered.length === 2) {
      const [first, second] = ordered;
      const firstSigned = parseSignedAmount(first.raw);
      if (firstSigned) return { ...first, type: firstSigned.type };
      if (Math.abs(second.value) > 0 && Math.abs(first.value) > 0) {
        if (Math.abs(second.value) / Math.abs(first.value) >= 3) {
          return { ...first, type: first.value < 0 ? "debit" : "credit" };
        }
        if (Math.abs(first.value) / Math.abs(second.value) >= 3) {
          return { ...second, type: second.value < 0 ? "debit" : "credit" };
        }
      }
    }

    const nonZero = amounts.filter((a) => Math.abs(a.value) > 0.001);
    if (nonZero.length === 0) return null;
    if (nonZero.length === 1) return nonZero[0];

    const absValues = nonZero.map((a) => Math.abs(a.value)).sort((a, b) => b - a);
    const largest = absValues[0];
    const second = absValues[1] ?? 0;
    if (second > 0 && largest / second >= 5) {
      const txn = nonZero.find((a) => Math.abs(a.value) < largest * 0.9);
      if (txn) return txn;
    }
    return nonZero[nonZero.length - 2] ?? nonZero[nonZero.length - 1];
  }

  function isTimeAmountToken(line: string, index: number, rawNum: string): boolean {
    const before = line.slice(Math.max(0, index - 2), index);
    const after = line.slice(index + rawNum.length, index + rawNum.length + 2);
    if (/:\d*$/.test(before) || /^\d:/.test(after) || /^:\d/.test(after)) return true;
    // Bare integers 0–59 without decimals are usually time fragments (HH:MM:SS)
    if (!rawNum.includes(".") && !rawNum.includes(",") && Math.abs(parseFloat(rawNum)) <= 59) {
      const context = line.slice(Math.max(0, index - 8), index + rawNum.length + 8);
      if (/\d{1,2}:\d{2}/.test(context)) return true;
    }
    return false;
  }

  interface PdfTextItem {
    text: string;
    x: number;
    y: number;
  }

  interface PdfColumn {
    label: string;
    xMid: number;
    xStart: number;
    xEnd: number;
  }

  type ParsedStatementRow = {
    date: string;
    dateDisplay?: string;
    valueDate?: string;
    valueDateDisplay?: string;
    description: string;
    refNo?: string;
    amount: number;
    type: "credit" | "debit";
    balance?: number;
    balanceDisplay?: string;
  };

  function parseTxnDateCell(raw: unknown): { iso: string; display: string } {
    const s = String(raw ?? "").trim();
    if (!s) return { iso: "", display: "—" };
    const cleaned = s
      .replace(/account\s*statement/gi, "")
      .replace(/\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}\s*[-–—]\s*\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}/gi, "")
      .replace(/private\s*limited/gi, "")
      .replace(/netopsys/gi, "")
      .replace(/\s+/g, " ")
      .trim();
    const dateMatches = [...cleaned.matchAll(/(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})/gi)];
    if (dateMatches.length > 0) {
      const match =
        dateMatches.find((m) => {
          const y = parseInt(m[3], 10);
          return y >= 2020 && y <= 2035;
        }) ?? dateMatches[0];
      const iso = formatCellDate(`${match[1]} ${match[2]} ${match[3]}`);
      if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
        const displayDate = formatPeriodDate(iso);
        const times = [...cleaned.matchAll(/\b(\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?)\b/gi)];
        const time = times.length ? times[times.length - 1][1].trim() : "";
        return { iso, display: time ? `${displayDate}\n${time}` : displayDate };
      }
    }
    return parseDateTimeCell(cleaned);
  }

  function parseValueDateCell(raw: unknown): { iso: string; display: string } {
    const s = String(raw ?? "").trim();
    if (!s) return { iso: "", display: "—" };
    const m = s.match(/(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})/i);
    if (m) {
      const iso = formatCellDate(`${m[1]} ${m[2]} ${m[3]}`);
      if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return { iso, display: formatPeriodDate(iso) };
    }
    const iso = formatCellDate(s);
    return { iso: /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : "", display: /^\d{4}-\d{2}-\d{2}$/.test(iso) ? formatPeriodDate(iso) : "—" };
  }

  function parseBalanceValue(raw: unknown): number | null {
    const s = String(raw ?? "").trim();
    if (!s) return null;
    const val = parseAmountValue(s.replace(/^[+−]/, ""));
    return val != null && val > 0 ? Math.abs(val) : null;
  }

  function isStatementMetadata(text: string, serial: string, hasSignedAmount: boolean): boolean {
    const t = text.toLowerCase();
    if (/account\s*statement|private\s*limited|customer\s*id|account\s*number|ifsc|branch\s*name|netopsys/.test(t)) return true;
    if (/^page\s+\d+|continued\s+on|end\s+of\s+statement/.test(t)) return true;
    if (!hasSignedAmount && !/^\d+$/.test(serial.trim())) return true;
    return false;
  }

  function buildStatementRow(input: {
    txnDateRaw: unknown;
    valueDateRaw?: unknown;
    description: string;
    refNo?: string;
    extracted: { amount: number; type: "credit" | "debit" } | null;
    balanceRaw?: unknown;
  }): ParsedStatementRow | null {
    if (!input.extracted) return null;
    const txn = parseTxnDateCell(input.txnDateRaw);
    const value = input.valueDateRaw ? parseValueDateCell(input.valueDateRaw) : { iso: "", display: "—" };
    const balance = input.balanceRaw != null ? parseBalanceValue(input.balanceRaw) : null;
    const desc = input.description.trim();
    if (!desc && !txn.iso) return null;
    return {
      date: txn.iso || "—",
      dateDisplay: txn.display,
      valueDate: value.iso || undefined,
      valueDateDisplay: value.display !== "—" ? value.display : undefined,
      description: desc || "Bank transaction",
      refNo: input.refNo?.trim() || undefined,
      amount: input.extracted.amount,
      type: input.extracted.type,
      balance: balance ?? undefined,
      balanceDisplay: balance != null ? formatIndianAmount(balance) : undefined,
    };
  }

  async function extractPdfTextRows(buffer: ArrayBuffer): Promise<PdfTextItem[][]> {
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    const items: PdfTextItem[] = [];

    for (let pn = 1; pn <= pdf.numPages; pn++) {
      const page = await pdf.getPage(pn);
      const tc = await page.getTextContent();
      for (const raw of tc.items) {
        if (!("str" in raw)) continue;
        const item = raw as { str: string; transform: number[] };
        const text = (item.str || "").replace(/\s+/g, " ").trim();
        if (!text) continue;
        items.push({ text, x: item.transform[4], y: Math.round(item.transform[5]) });
      }
    }

    if (items.length === 0) return [];

    items.sort((a, b) => b.y - a.y || a.x - b.x);

    const rows: PdfTextItem[][] = [];
    let currentRow: PdfTextItem[] = [];
    let currentY: number | null = null;

    for (const item of items) {
      if (currentY === null || Math.abs(item.y - currentY) <= 5) {
        currentRow.push(item);
        currentY = currentY ?? item.y;
      } else {
        if (currentRow.length) {
          currentRow.sort((a, b) => a.x - b.x);
          rows.push(currentRow);
        }
        currentRow = [item];
        currentY = item.y;
      }
    }
    if (currentRow.length) {
      currentRow.sort((a, b) => a.x - b.x);
      rows.push(currentRow);
    }
    return rows;
  }

  function normalizePdfLabel(label: string): string {
    return label.trim().toLowerCase().replace(/\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
  }

  function buildPdfColumnsFromCells(cells: PdfTextItem[]): PdfColumn[] {
    const sorted = [...cells].sort((a, b) => a.x - b.x);
    const groups: PdfTextItem[][] = [];
    for (const cell of sorted) {
      const last = groups[groups.length - 1];
      if (!last || cell.x - last[last.length - 1].x > 35) groups.push([cell]);
      else last.push(cell);
    }
    return groups.map((group, idx) => {
      const label = group.map((g) => g.text).join(" ");
      const xMid = group.reduce((s, g) => s + g.x, 0) / group.length;
      const prevMid = idx > 0
        ? groups[idx - 1].reduce((s, g) => s + g.x, 0) / groups[idx - 1].length
        : null;
      const nextMid = idx < groups.length - 1
        ? groups[idx + 1].reduce((s, g) => s + g.x, 0) / groups[idx + 1].length
        : null;
      return {
        label: normalizePdfLabel(label),
        xMid,
        xStart: prevMid != null ? (prevMid + xMid) / 2 : xMid - 40,
        xEnd: nextMid != null ? (xMid + nextMid) / 2 : xMid + 500,
      };
    });
  }

  function rowTextLooksLikeHeader(cells: PdfTextItem[]): boolean {
    const joined = cells.map((c) => normalizePdfLabel(c.text)).join(" ");
    const hasDate =
      /transaction\s*date/.test(joined) ||
      /statement\s*date/.test(joined) ||
      /value\s*date/.test(joined) ||
      /\bdate\b/.test(joined);
    const hasDesc =
      /description/.test(joined) ||
      /transaction\s*details/.test(joined) ||
      /particulars/.test(joined) ||
      /narration/.test(joined);
    const hasMoney =
      /deposit/.test(joined) ||
      /withdrawal/.test(joined) ||
      /debit\s*\/\s*credit/.test(joined) ||
      /dr\s*\/\s*cr/.test(joined) ||
      /\bamount\b/.test(joined) ||
      /\bdebit\b/.test(joined) ||
      /\bcredit\b/.test(joined);
    return hasDate && hasDesc && hasMoney;
  }

  function findPdfTableHeader(rows: PdfTextItem[][]): { headerIdx: number; columns: PdfColumn[] } | null {
    for (let i = 0; i < Math.min(rows.length, 100); i++) {
      for (const span of [1, 2, 3]) {
        if (i + span > rows.length) break;
        const cells = rows.slice(i, i + span).flat();
        if (!rowTextLooksLikeHeader(cells)) continue;
        const columns = buildPdfColumnsFromCells(cells);
        if (columns.length < 3) continue;
        return { headerIdx: i + span - 1, columns };
      }
    }
    return null;
  }

  function assignPdfRowToColumns(row: PdfTextItem[], columns: PdfColumn[]): string[] {
    const cells = columns.map(() => "");
    for (const item of row) {
      let colIdx = columns.findIndex((col) => item.x >= col.xStart && item.x < col.xEnd);
      if (colIdx < 0) {
        let bestDist = Infinity;
        for (let i = 0; i < columns.length; i++) {
          const dist = Math.abs(item.x - columns[i].xMid);
          if (dist < bestDist) {
            bestDist = dist;
            colIdx = i;
          }
        }
      }
      if (colIdx >= 0) {
        cells[colIdx] += (cells[colIdx] ? " " : "") + item.text;
      }
    }
    return cells.map((c) => c.trim());
  }

  function findPdfColumn(columns: PdfColumn[], patterns: RegExp[]): number {
    return columns.findIndex((c) => patterns.some((p) => p.test(c.label)));
  }

  function parsePdfTableStatement(rows: PdfTextItem[][]): ParsedStatementRow[] {
    const header = findPdfTableHeader(rows);
    if (!header) return [];

    const { headerIdx, columns } = header;
    const serialCol = findPdfColumn(columns, [/^(#|s\.?\s*no|sr)/]);
    const txnDateCol = findPdfColumn(columns, [/transaction\s*date/, /posting\s*date/]);
    const valueDateCol = findPdfColumn(columns, [/value\s*date/]);
    const stmtDateCol = findPdfColumn(columns, [/statement\s*date/]);
    const descCol = findPdfColumn(columns, [/transaction\s*details/, /description/, /narration/, /particulars/]);
    const refCol = findPdfColumn(columns, [/chq/, /ref\s*no/, /reference/, /cheque/]);
    const depositCol = findPdfColumn(columns, [/^deposit$/, /^credit$/]);
    const withdrawalCol = findPdfColumn(columns, [/^withdrawal$/, /^debit$/]);
    const signedAmountCol = findPdfColumn(columns, [/debit\s*\/\s*credit/, /dr\s*\/\s*cr/]);
    const amountCol = findPdfColumn(columns, [/^amount$/, /txn\s*amount/]);
    const balanceCol = findPdfColumn(columns, [/balance/, /ledger/]);

    // Merge multi-line rows (time/amount continuation only)
    const mergedRows: PdfTextItem[][] = [];
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      const cells = assignPdfRowToColumns(row, columns);
      const rowText = row.map((c) => c.text).join(" ");
      const serial = serialCol >= 0 ? cells[serialCol].trim() : "";
      const hasNewSerial = /^\d+$/.test(serial);
      const extracted = extractSignedAmountFromCells(cells, signedAmountCol, depositCol, withdrawalCol, amountCol);

      if (isStatementMetadata(rowText, serial, !!extracted)) continue;

      if (mergedRows.length === 0 || hasNewSerial) {
        mergedRows.push([...row]);
        continue;
      }

      const prevCells = assignPdfRowToColumns(mergedRows[mergedRows.length - 1], columns);
      const prevExtracted = extractSignedAmountFromCells(prevCells, signedAmountCol, depositCol, withdrawalCol, amountCol);

      if (extracted && prevExtracted) {
        mergedRows.push([...row]);
        continue;
      }

      const prev = mergedRows[mergedRows.length - 1];
      for (const item of row) {
        const match = prev.find((p) => Math.abs(p.x - item.x) < 25);
        if (match) match.text = `${match.text} ${item.text}`.replace(/\s+/g, " ").trim();
        else prev.push(item);
      }
      prev.sort((a, b) => a.x - b.x);
    }

    const out: ParsedStatementRow[] = [];

    for (const row of mergedRows) {
      const rowText = row.map((c) => c.text).join(" ");
      if (/^(total|opening|closing|brought forward|carried forward)/i.test(rowText)) continue;

      const cells = assignPdfRowToColumns(row, columns);
      const serial = serialCol >= 0 ? cells[serialCol].trim() : "";
      const extracted = extractSignedAmountFromCells(cells, signedAmountCol, depositCol, withdrawalCol, amountCol);
      if (isStatementMetadata(rowText, serial, !!extracted)) continue;

      const built = buildStatementRow({
        txnDateRaw: txnDateCol >= 0 ? cells[txnDateCol] : "",
        valueDateRaw: valueDateCol >= 0 ? cells[valueDateCol] : undefined,
        description: descCol >= 0 ? cells[descCol].trim() : "",
        refNo: refCol >= 0 ? cells[refCol].trim() : undefined,
        extracted,
        balanceRaw: balanceCol >= 0 ? cells[balanceCol] : undefined,
      });

      if (!built) {
        if (descCol >= 0 && cells[descCol] && out.length > 0) {
          out[out.length - 1].description += ` ${cells[descCol].trim()}`;
        }
        continue;
      }
      out.push(built);
    }

    return out;
  }

  function extractAmountsFromLine(cleaned: string, afterIndex = 0): Array<{ raw: string; value: number; hint: string; index: number }> {
    const amountTokenRe = /([+-]\s*\d[\d,]*\.\d{2}|[+-]\d[\d,]*\.\d{2}|\d[\d,]*\.\d{2})/g;
    const amounts: Array<{ raw: string; value: number; hint: string; index: number }> = [];
    let m: RegExpExecArray | null;
    amountTokenRe.lastIndex = 0;
    while ((m = amountTokenRe.exec(cleaned)) !== null) {
      if (m.index < afterIndex) continue;
      const rawNum = m[1].replace(/\s+/g, "");
      if (isTimeAmountToken(cleaned, m.index, rawNum)) continue;
      const signed = parseSignedAmount(rawNum);
      if (!signed) continue;
      const value = signed.type === "debit" ? -signed.amount : signed.amount;
      amounts.push({
        raw: m[0],
        value,
        hint: signed.type === "debit" ? "debit" : "credit",
        index: m.index,
      });
    }
    return amounts;
  }

  function parsePdfLineStatement(lines: string[]): ParsedStatementRow[] {
    const dateRe = /(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}|\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|\d{4}[\/\-.]\d{1,2}[\/\-.]\d{1,2})/g;
    const rows: ParsedStatementRow[] = [];
    let pendingDate = "";
    let pendingDateDisplay = "";
    let pendingDesc: string[] = [];

    function flushPendingAmounts(line: string) {
      const amounts = extractAmountsFromLine(line, 0);
      const pick = pickStatementAmount(amounts);
      if (!pick) return false;

      let description = pendingDesc.join(" ").trim();
      if (!description) {
        description = line;
        for (const dm of line.matchAll(dateRe)) description = description.replace(dm[0], " ");
        description = description.replace(pick.raw, " ");
        description = description.replace(/\d{1,2}:\d{2}(:\d{2})?(\s*(AM|PM))?/gi, " ");
        description = description.replace(/\d{1,3}(?:,\d{3})*(?:\.\d{2})/g, " ");
        description = description.replace(/\s+/g, " ").trim();
      }

      if (!description || looksLikeDateOrTime(description)) description = "Bank transaction";
      if (/^(total|balance|opening|closing)/i.test(description)) return false;

      rows.push({
        date: pendingDate || "—",
        dateDisplay: pendingDateDisplay || undefined,
        description,
        amount: Math.abs(pick.value),
        type: pick.type ?? normalizeType(pick.value < 0 ? "debit" : "credit", pick.value),
      });
      pendingDesc = [];
      return true;
    }

    for (const line of lines) {
      const cleaned = line.replace(/\s+/g, " ").trim();
      if (!cleaned || cleaned.length < 4) continue;
      if (/^(date|description|amount|balance|particulars|debit|credit|statement|deposit|withdrawal|ledger)/i.test(cleaned)) continue;

      const dateMatches = [...cleaned.matchAll(dateRe)];
      const amounts = extractAmountsFromLine(cleaned, 0);

      if (dateMatches.length > 0) {
        const dateMatch = dateMatches.length > 1 ? dateMatches[1] : dateMatches[0];
        const parsedDt = parseTxnDateCell(dateMatch[0]);
        pendingDate = parsedDt.iso || formatCellDate(dateMatch[1]);
        pendingDateDisplay = parsedDt.display;
        const dateEndIndex = (dateMatch.index ?? 0) + dateMatch[0].length;

        if (amounts.some((a) => a.index >= dateEndIndex)) {
          let descPart = cleaned;
          for (const dm of dateMatches) descPart = descPart.replace(dm[0], " ");
          descPart = descPart.replace(/\d{1,2}:\d{2}(:\d{2})?(\s*(AM|PM))?/gi, " ");
          for (const a of amounts) descPart = descPart.replace(a.raw, " ");
          descPart = descPart.replace(/\s+/g, " ").trim();
          pendingDesc = descPart && !looksLikeDateOrTime(descPart) ? [descPart] : [];
          flushPendingAmounts(cleaned);
          continue;
        }

        let descPart = cleaned;
        for (const dm of dateMatches) descPart = descPart.replace(dm[0], " ");
        descPart = descPart.replace(/\d{1,2}:\d{2}(:\d{2})?(\s*(AM|PM))?/gi, " ");
        descPart = descPart.replace(/\s+/g, " ").trim();
        if (descPart && !looksLikeDateOrTime(descPart)) pendingDesc.push(descPart);
        continue;
      }

      if (amounts.length > 0 && flushPendingAmounts(cleaned)) continue;

      if (!looksLikeDateOrTime(cleaned) && !/^\d+\.\d{2}/.test(cleaned)) {
        pendingDesc.push(cleaned);
      }
    }

    return rows;
  }

  function parsePdfLineStatementSingleLine(lines: string[]): ParsedStatementRow[] {
    const dateRe = /(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}|\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|\d{4}[\/\-.]\d{1,2}[\/\-.]\d{1,2})/g;
    const rows: ParsedStatementRow[] = [];

    for (const line of lines) {
      const cleaned = line.replace(/\s+/g, " ").trim();
      if (!cleaned || cleaned.length < 6) continue;
      if (/^(date|description|amount|balance|particulars|debit|credit|statement|deposit|withdrawal|ledger)/i.test(cleaned)) continue;

      const dateMatches = [...cleaned.matchAll(dateRe)];
      if (dateMatches.length === 0) continue;

      const dateMatch = dateMatches.length > 1 ? dateMatches[1] : dateMatches[0];
      const dateEndIndex = (dateMatch.index ?? 0) + dateMatch[0].length;
      const amounts = extractAmountsFromLine(cleaned, dateEndIndex);
      const pick = pickStatementAmount(amounts);
      if (!pick) continue;

      let description = cleaned;
      for (const dm of dateMatches) description = description.replace(dm[0], " ");
      description = description.replace(pick.raw, " ");
      description = description.replace(/\d{1,2}:\d{2}(:\d{2})?(\s*(AM|PM))?/gi, " ");
      description = description.replace(/\d{1,3}(?:,\d{3})*(?:\.\d{2})/g, " ");
      description = description.replace(/\s+/g, " ").trim();
      if (!description || /^(total|balance|opening|closing)/i.test(description)) continue;
      if (looksLikeDateOrTime(description)) continue;

      const parsedDt = parseTxnDateCell(dateMatch[0]);
      rows.push({
        date: parsedDt.iso || formatCellDate(dateMatch[1]),
        dateDisplay: parsedDt.display,
        description,
        amount: Math.abs(pick.value),
        type: pick.type ?? normalizeType(pick.value < 0 ? "debit" : "credit", pick.value),
      });
    }
    return rows;
  }

  function headerMatches(header: string, patterns: RegExp[]) {
    const h = header.trim().toLowerCase().replace(/\([^)]*\)/g, "").replace(/[₹$]/g, "").replace(/\s+/g, " ");
    return patterns.some((p) => p.test(h));
  }

  /** Read amount ONLY from Debit/Credit column — never from Balance. */
  function extractSignedAmountFromCells(
    cells: string[],
    signedCol: number,
    depositCol: number,
    withdrawalCol: number,
    amountCol: number,
  ): { amount: number; type: "credit" | "debit" } | null {
    if (signedCol >= 0) {
      const signed = parseSignedAmount(cells[signedCol]);
      if (signed) return signed;
    }
    if (amountCol >= 0 && amountCol !== signedCol) {
      const signed = parseSignedAmount(cells[amountCol]);
      if (signed) return signed;
    }
    if (withdrawalCol >= 0) {
      const val = parseAmountValue(cells[withdrawalCol]);
      if (val != null && Math.abs(val) > 0) return { amount: Math.abs(val), type: "debit" };
    }
    if (depositCol >= 0) {
      const val = parseAmountValue(cells[depositCol]);
      if (val != null && Math.abs(val) > 0) return { amount: Math.abs(val), type: "credit" };
    }
    // Scan cells for explicit +/- amounts only (skip balance-like bare numbers)
    for (const cell of cells) {
      const t = String(cell ?? "").trim();
      if (!/^[+-]/.test(t)) continue;
      const signed = parseSignedAmount(t);
      if (signed) return signed;
    }
    return null;
  }

  function appendRefToDescription(description: string, ref: string): string {
    const r = ref.trim();
    if (!r || description.includes(r)) return description;
    return description ? `${description} | Ref: ${r}` : r;
  }

  function pickColumn(headers: string[], patterns: RegExp[]) {
    const idx = headers.findIndex((h) => headerMatches(h, patterns));
    return idx >= 0 ? idx : -1;
  }

  function parseExcelStatement(buffer: ArrayBuffer, isCsv = false) {
    const workbook = isCsv
      ? XLSX.read(new TextDecoder("utf-8").decode(buffer), { type: "string", cellDates: true })
      : XLSX.read(buffer, { type: "array", cellDates: true });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) throw new Error("Excel file has no sheets.");

    // Raw rows — find the header row (bank exports often have title rows above)
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: "",
      raw: true,
      blankrows: false,
    }) as unknown[][];

    if (!aoa.length) throw new Error("Excel sheet is empty.");

    const datePats = [/transaction\s*date/, /value\s*date/, /posting\s*date/, /^(txn\s*)?date$/, /^trans\.?\s*date$/, /^dt$/];
    const statementDatePats = [/statement\s*date/];
    const descPats = [/description/, /narration/, /particulars/, /details/, /memo/, /remarks?/, /transaction\s*details/, /^payee$/, /^text$/];
    const amountPats = [/^amount$/, /^amt\.?$/, /^value$/, /txn\s*amount/, /transaction\s*amount/, /debit\s*\/\s*credit/, /dr\s*\/\s*cr/];
    const typePats = [/^type$/, /dr\s*\/\s*cr/, /credit\s*\/\s*debit/, /txn\s*type/, /transaction\s*type/, /^cd$/];
    const debitPats = [/^debit$/, /^dr$/, /withdrawal/, /money\s*out/, /paid\s*out/, /^withdrawals?$/];
    const creditPats = [/^credit$/, /^cr$/, /deposit/, /money\s*in/, /paid\s*in/, /^deposits?$/];
    const balancePats = [/ledger\s*balance/, /running\s*balance/, /closing\s*balance/, /available\s*balance/, /balance/];
    const refPats = [/chq/, /ref\s*no/, /reference/, /cheque/];
    const serialPats = [/^(#|s\.?\s*no|sr\.?\s*no|serial)$/];

    let headerRowIdx = -1;
    let headers: string[] = [];

    for (let i = 0; i < Math.min(aoa.length, 30); i++) {
      const cells = (aoa[i] || []).map((c) => String(c ?? "").trim());
      if (cells.filter(Boolean).length < 2) continue;
      const hasDate = cells.some((c) => headerMatches(c, datePats));
      const hasDesc = cells.some((c) => headerMatches(c, descPats));
      const hasAmt =
        cells.some((c) => headerMatches(c, amountPats)) ||
        cells.some((c) => headerMatches(c, debitPats)) ||
        cells.some((c) => headerMatches(c, creditPats));
      if (hasDate && (hasDesc || hasAmt)) {
        headerRowIdx = i;
        headers = cells;
        break;
      }
    }

    // Fallback: first non-empty row as headers
    if (headerRowIdx < 0) {
      headerRowIdx = aoa.findIndex((r) => (r || []).some((c) => String(c ?? "").trim()));
      if (headerRowIdx < 0) throw new Error("Excel sheet is empty.");
      headers = (aoa[headerRowIdx] || []).map((c) => String(c ?? "").trim());
    }

    const signedAmountIdx = pickColumn(headers, [/debit\s*\/\s*credit/, /dr\s*\/\s*cr/]);
    const dateIdx = pickColumn(headers, [/transaction\s*date/, /posting\s*date/, /^(txn\s*)?date$/, /^trans\.?\s*date$/, /^dt$/]);
    const valueDateIdx = pickColumn(headers, [/value\s*date/]);
    const statementDateIdx = pickColumn(headers, statementDatePats);
    const descIdx = pickColumn(headers, descPats);
    const amountIdx = pickColumn(headers, amountPats);
    const typeIdx = pickColumn(headers, typePats);
    const debitIdx = pickColumn(headers, debitPats);
    const creditIdx = pickColumn(headers, creditPats);
    const balanceIdx = pickColumn(headers, balancePats);
    const refIdx = pickColumn(headers, refPats);
    const serialIdx = pickColumn(headers, serialPats);

    const effectiveAmountIdx = signedAmountIdx >= 0 ? signedAmountIdx : amountIdx;

    const excludedFromScan = new Set(
      [dateIdx, valueDateIdx, statementDateIdx, descIdx, effectiveAmountIdx, typeIdx, balanceIdx, refIdx, serialIdx, debitIdx, creditIdx].filter((idx) => idx >= 0),
    );

    const rows: ParsedStatementRow[] = [];

    for (let i = headerRowIdx + 1; i < aoa.length; i++) {
      const row = aoa[i] || [];
      if (!row.some((c) => c !== "" && c != null)) continue;

      const cells = row.map((c) => String(c ?? "").trim());
      const serial = serialIdx >= 0 ? cells[serialIdx] : "";
      const rowText = cells.join(" ");

      const extracted = extractSignedAmountFromCells(
        cells,
        signedAmountIdx,
        creditIdx,
        debitIdx,
        effectiveAmountIdx,
      );
      if (isStatementMetadata(rowText, serial, !!extracted)) continue;

      let description = descIdx >= 0 ? cells[descIdx] : "";
      if (!description) {
        description = row
          .map((c, idx) => ({ c, idx }))
          .filter(({ idx }) => !excludedFromScan.has(idx))
          .map(({ c }) => String(c ?? "").trim())
          .filter((t) => t && !/^[\d.,+\-]+$/.test(t) && !looksLikeDateOrTime(t))
          .join(" ")
          .trim();
      }

      const built = buildStatementRow({
        txnDateRaw: dateIdx >= 0 ? row[dateIdx] : (valueDateIdx >= 0 ? row[valueDateIdx] : ""),
        valueDateRaw: valueDateIdx >= 0 ? row[valueDateIdx] : undefined,
        description,
        refNo: refIdx >= 0 ? cells[refIdx] : undefined,
        extracted,
        balanceRaw: balanceIdx >= 0 ? row[balanceIdx] : undefined,
      });

      if (!built) continue;
      if (looksLikeDateOrTime(built.description)) continue;
      const descLower = built.description.toLowerCase();
      if (/^(total|balance|opening|closing|brought\s*forward|carried\s*forward)/i.test(descLower)) continue;

      rows.push(built);
    }

    if (rows.length === 0) {
      throw new Error(
        "No valid transactions found. Excel needs a header row with Date + Description, and Amount (or Debit/Credit) columns.",
      );
    }
    return rowsToTransactions(rows);
  }

  async function parsePdfStatement(buffer: ArrayBuffer) {
    const textRows = await extractPdfTextRows(buffer);
    if (textRows.length === 0) {
      throw new Error(
        "This PDF has no readable text (it may be a scanned image). Please download your statement as Excel (.xlsx) from your bank and upload that instead.",
      );
    }

    const lines = textRows.map((row) => row.map((c) => c.text).join(" "));

    // 1) Table layout (Statement Date | Transaction Date | Description | Deposit | Withdrawal | Balance)
    let parsed = parsePdfTableStatement(textRows);

    // 2) Multi-line PDF where date, description, and amounts are on separate lines
    if (parsed.length === 0) parsed = parsePdfLineStatement(lines);

    // 3) Single-line fallback
    if (parsed.length === 0) parsed = parsePdfLineStatementSingleLine(lines);

    if (parsed.length === 0) {
      throw new Error(
        "Could not read transactions from this PDF. Please download your bank statement as Excel (.xlsx) — it gives the most accurate results.",
      );
    }
    return rowsToTransactions(parsed);
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const name = file.name.toLowerCase();
    const isCsv = name.endsWith(".csv") || file.type === "text/csv";
    const isExcel =
      isCsv ||
      name.endsWith(".xlsx") ||
      name.endsWith(".xls") ||
      file.type.includes("sheet") ||
      file.type.includes("excel");
    const isPdf = name.endsWith(".pdf") || file.type === "application/pdf";

    if (!isExcel && !isPdf) {
      toast({
        title: "Unsupported file",
        description: "Upload Excel (.xlsx / .xls), CSV, or PDF.",
        variant: "destructive",
      });
      return;
    }

    try {
      const buffer = await file.arrayBuffer();
      let parsed: BankTransaction[];

      if (isExcel) {
        parsed = parseExcelStatement(buffer, isCsv);
      } else if (isPdf) {
        parsed = await parsePdfStatement(buffer);
      } else {
        return;
      }

      const { filtered, error: periodError, excluded } = validateAndFilterStatementByPeriod(
        parsed,
        dateFrom,
        dateTo,
      );
      if (periodError) {
        toast({
          title: "Wrong statement period",
          description: periodError,
          variant: "destructive",
        });
        return;
      }

      setTransactions(filtered);
      toast({
        title: "Statement Uploaded Successfully",
        description:
          excluded > 0
            ? `Loaded ${filtered.length} transactions within ${formatPeriodDate(normalizeFilterDate(dateFrom))} – ${formatPeriodDate(normalizeFilterDate(dateTo))}. ${excluded} row(s) outside this period were skipped.`
            : `Parsed ${filtered.length} transactions from ${file.name}.`,
      });
    } catch (err: any) {
      toast({
        title: "Failed to parse statement",
        description: err?.message || "Please check the file format.",
        variant: "destructive",
      });
    }
  };

  // Download sample Excel template
  const handleDownloadSampleExcel = () => {
    const rows = [
      ["Date", "Description", "Amount", "Type"],
      ["2026-08-10", "PAYMENT ABC PTE LTD Ref: 12345", 1250.0, "credit"],
      ["2026-08-11", "UOB BANK CHARGE", 25.0, "debit"],
      ["2026-08-12", "PAYNOW XYZ PTE LTD Ref: PAY123", 2500.0, "credit"],
      ["2026-08-13", "ACME PTE LTD Ref: 67890", 3000.0, "credit"],
      ["2026-08-14", "GIRO CREDIT Ref: GIRO567", 1000.0, "credit"],
      ["2026-08-09", "DBS BANK CHARGES", 35.0, "debit"],
      ["2026-08-12", "PAYNOW RECEIPT - ABC PTE LTD", 250.0, "credit"],
      ["2026-08-15", "SUPPLIER PAYMENT - XYZ PTE LTD", 120.0, "debit"],
    ];
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Statement");
    XLSX.writeFile(workbook, "sample_bank_statement.xlsx");
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
    const filtered = transactions.filter(t => {
      const matchesTab = 
        activeTab === "all" ||
        (activeTab === "matched" && t.status === "matched") ||
        (activeTab === "need_review" && t.status === "need_review") ||
        (activeTab === "unmatched" && t.status === "unmatched") ||
        (activeTab === "ignored" && t.status === "ignored");

      const matchesSearch =
        t.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.refNo || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.matchedRef || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.matchedDetails || "").toLowerCase().includes(searchQuery.toLowerCase());

      return matchesTab && matchesSearch;
    });
    return sortBankTransactions(filtered);
  }, [transactions, activeTab, searchQuery]);

  const { page: txPage, setPage: setTxPage, totalPages: txTotalPages, paginatedItems: paginatedTransactions } = usePagination(filteredTransactions);

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
              <div className="xl:col-span-3 space-y-6 min-w-0">
                {/* Filters Bar — 1 line when wide (100%), 2 lines when tight (e.g. 150% zoom) */}
                <div className="@container min-w-0">
                  <div className="flex flex-col gap-3 bg-card p-3 sm:p-4 rounded-xl border shadow-sm @[700px]:flex-row @[700px]:items-center @[700px]:justify-between @[700px]:gap-4">
                    <div className="flex items-center gap-3 min-w-0 flex-wrap @[700px]:flex-nowrap">
                      <select
                        value={selectedAccount}
                        onChange={(e) => setSelectedAccount(e.target.value)}
                        className="h-9 min-w-[160px] w-[200px] max-w-full rounded-md border border-input bg-background px-2 text-sm font-medium shadow-sm focus:outline-none"
                      >
                        {bankAccounts.length > 0 ? (
                          bankAccounts.map(a => (
                            <option key={a.id} value={String(a.id)}>{a.code} {a.name}</option>
                          ))
                        ) : (
                          <option value="">No Bank Accounts Found</option>
                        )}
                      </select>

                      <div className="flex items-center gap-1.5 shrink-0 ml-1">
                        <div className="w-[132px]">
                          <SyncBridgeDatePicker
                            value={dateFrom}
                            onChange={setDateFrom}
                            placeholder="From"
                            max={dateTo || undefined}
                            className="h-9"
                          />
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0">to</span>
                        <div className="w-[132px]">
                          <SyncBridgeDatePicker
                            value={dateTo}
                            onChange={setDateTo}
                            placeholder="To"
                            min={dateFrom || undefined}
                            className="h-9"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        variant="outline"
                        onClick={() => setTransactions([])}
                        className="h-9 shrink-0 whitespace-nowrap px-3 text-sm text-rose-600 border-rose-200 hover:bg-rose-50"
                      >
                        Clear Statement
                      </Button>
                      <Button
                        onClick={() => fileInputRef.current?.click()}
                        className="bg-[#2563EB] hover:bg-[#1D4ED8] gap-1.5 h-9 shrink-0 whitespace-nowrap px-3 text-sm"
                      >
                        <Upload className="h-4 w-4 shrink-0" />
                        Upload Statement
                      </Button>
                    </div>
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileUpload}
                      accept=".xlsx,.xls,.csv,.pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv,application/pdf"
                      className="hidden"
                    />
                  </div>
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
                          <tr className="border-b bg-muted/20 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                            <th className="px-3 py-3 text-left whitespace-nowrap">Transaction Date</th>
                            <th className="px-3 py-3 text-left whitespace-nowrap">Value Date</th>
                            <th className="px-3 py-3 text-left min-w-[200px]">Transaction Details</th>
                            <th className="px-3 py-3 text-left whitespace-nowrap">Chq / Ref No.</th>
                            <th className="px-3 py-3 text-right whitespace-nowrap">Debit/Credit(₹)</th>
                            <th className="px-3 py-3 text-right whitespace-nowrap">Balance(₹)</th>
                            <th className="px-3 py-3 text-left">Matched with (Books)</th>
                            <th className="px-3 py-3 text-center">Status</th>
                            <th className="px-3 py-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y text-xs">
                          {paginatedTransactions.map((tx) => (
                            <tr key={tx.id} className="hover:bg-muted/10 transition-colors">
                              <td className="px-3 py-3 font-medium text-muted-foreground whitespace-pre-line leading-snug">
                                {tx.dateDisplay || formatPeriodDate(tx.date) || tx.date}
                              </td>
                              <td className="px-3 py-3 text-muted-foreground whitespace-nowrap">
                                {tx.valueDateDisplay || (tx.valueDate ? formatPeriodDate(tx.valueDate) : "—")}
                              </td>
                              <td className="px-3 py-3 font-medium max-w-[240px]" title={tx.description}>
                                <span className="line-clamp-2">{tx.description}</span>
                              </td>
                              <td className="px-3 py-3 font-mono text-[10px] text-muted-foreground whitespace-nowrap">
                                {tx.refNo || "—"}
                              </td>
                              <td className={`px-3 py-3 text-right font-bold tabular-nums whitespace-nowrap ${tx.type === "debit" ? "text-rose-600" : "text-emerald-600"}`}>
                                {tx.type === "credit" ? "+" : "−"}{formatIndianAmount(tx.amount)}
                              </td>
                              <td className="px-3 py-3 text-right font-bold tabular-nums whitespace-nowrap text-slate-800">
                                {tx.balanceDisplay ?? (tx.balance != null ? formatIndianAmount(tx.balance) : "—")}
                              </td>
                              <td className="px-3 py-3 font-semibold text-slate-700">
                                {tx.matchedType ? (
                                  <span className="flex items-center gap-1">
                                    <FileText className="h-3 w-3 text-blue-500" />
                                    {tx.matchedType} <span className="font-mono text-[10px] text-muted-foreground">({tx.matchedRef})</span>
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground italic">No Match Found</span>
                                )}
                              </td>
                              <td className="px-3 py-3 text-center whitespace-nowrap">
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
                      <ListPagination page={txPage} totalPages={txTotalPages} onPageChange={setTxPage} />
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
              <div className="space-y-6 min-w-0">
                {/* Reconciliation Summary Card */}
                <Card className="shadow-sm overflow-hidden min-w-0">
                  <CardHeader className="pb-3 border-b">
                    <CardTitle className="text-sm font-bold text-slate-800">Reconciliation Summary</CardTitle>
                    <p className="text-[11px] text-muted-foreground">as on 31 Jul 2026</p>
                  </CardHeader>
                  <CardContent className="p-4 space-y-4 text-xs min-w-0">
                    <div className="flex justify-between items-start gap-3 min-w-0">
                      <span className="text-muted-foreground min-w-0 flex-1 leading-snug">Bank Statement Closing Balance</span>
                      <span className="font-bold text-slate-800 shrink-0 tabular-nums text-right">
                        {formatCurrency(reconSummary.adjustedBankBalance)}
                      </span>
                    </div>
                    <div className="flex justify-between items-start gap-3 min-w-0">
                      <span className="text-muted-foreground min-w-0 flex-1 leading-snug">Book Balance (As per Books)</span>
                      <span className="font-bold text-slate-800 shrink-0 tabular-nums text-right">
                        {formatCurrency(reconSummary.booksBalance)}
                      </span>
                    </div>
                    <div className="border-t pt-3 space-y-2 min-w-0">
                      <div className="flex justify-between items-center gap-3 min-w-0">
                        <span className="font-semibold text-slate-800 shrink-0">Difference</span>
                        <p className={`font-bold shrink-0 tabular-nums text-right ${reconSummary.isBalanced ? "text-emerald-600" : "text-rose-600"}`}>
                          {formatCurrency(reconSummary.difference)}
                        </p>
                      </div>
                      <div className="flex justify-end min-w-0">
                        <Badge className={`max-w-full shadow-none whitespace-nowrap ${reconSummary.isBalanced ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-amber-50 text-amber-700 border border-amber-200"}`}>
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
                          <td className="px-4 py-3.5 font-medium text-muted-foreground whitespace-pre-line leading-snug">
                            {tx.dateDisplay || formatPeriodDate(tx.date) || tx.date}
                          </td>
                          <td className="px-4 py-3.5 font-semibold text-slate-800">{tx.description}</td>
                          <td className="px-4 py-3.5 text-center">
                            {tx.type === "debit" ? (
                              <Badge className="bg-rose-50 text-rose-700 border border-rose-100 shadow-none">Debit</Badge>
                            ) : (
                              <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-100 shadow-none">Credit</Badge>
                            )}
                          </td>
                          <td className={`px-4 py-3.5 text-right font-bold tabular-nums whitespace-nowrap ${tx.type === "debit" ? "text-rose-600" : "text-emerald-600"}`}>
                            {tx.type === "credit" ? "+" : "-"}{formatIndianAmount(tx.amount)}
                          </td>
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

                {/* Balances Match Box — icons like reference */}
                <div className="flex items-center justify-center gap-3 w-full max-w-xl">
                  <div className="flex items-center gap-3 flex-1 bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm text-left">
                    <div className="h-11 w-11 rounded-full bg-[#1B7543] text-white flex items-center justify-center shrink-0 shadow-sm">
                      <Landmark className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-700">Bank Balance</p>
                      <p className="text-base font-bold text-[#1B7543] truncate">
                        {formatCurrency(reconSummary.adjustedBankBalance)}
                      </p>
                    </div>
                  </div>

                  <div className="h-8 w-8 rounded-full bg-emerald-50 border border-emerald-100 text-slate-700 flex items-center justify-center shrink-0 text-sm font-bold">
                    =
                  </div>

                  <div className="flex items-center gap-3 flex-1 bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm text-left">
                    <div className="h-11 w-11 rounded-full bg-[#1B7543] text-white flex items-center justify-center shrink-0 shadow-sm">
                      <BookOpen className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-700">Book Balance</p>
                      <p className="text-base font-bold text-[#1B7543] truncate">
                        {formatCurrency(reconSummary.booksBalance)}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-2 w-full max-w-lg">
                  <Button variant="outline" onClick={handlePrintReport} className="h-9 text-xs flex-1 min-w-[100px]">
                    Print
                  </Button>
                  <Button variant="outline" onClick={handleExportExcel} className="h-9 text-xs flex-1 min-w-[100px]">
                    Excel
                  </Button>
                  <Button variant="outline" onClick={handleDownloadPdf} className="h-9 text-xs flex-1 min-w-[100px]">
                    PDF
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
