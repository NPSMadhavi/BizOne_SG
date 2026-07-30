import { useState, useCallback, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/auth-context";
import { Download, Loader2, Info, ChevronDown, ChevronRight, RefreshCw, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { generateGstF5_PDF } from "@/lib/pdf";

// ─── Types ──────────────────────────────────────────────────────────────────

interface F5Data {
  period: { from: string | null; to: string | null };
  company: { name: string; gstRegistrationNo: string | null; address: string | null };
  gstRate: number;
  box1: number; box2: number; box3: number; box4: number; box5: number;
  box6: number; box7: number; box8: number;
  invoices: Array<{
    id: number; invNumber: string; customerName: string;
    issueDate: string | null; netAmount: number; gstAmount: number;
    totalAmount: number; status: string;
  }>;
  vendorInvoices: Array<{
    id: number; piNumber: string; vendorName: string;
    piDate: string | null; netAmount: number; gstAmount: number;
    netAmountSGD?: number; gstAmountSGD?: number;
    totalAmount: number; gstTreatment: string; currency: string;
    exchangeRate?: number;
  }>;
  expenses: Array<{
    id: number; vendorName: string; description: string; category: string;
    expenseDate: string; amount: number; gstAmount: number; currency: string;
  }>;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const YEAR = new Date().getFullYear();
const CURRENT_Q = Math.floor(new Date().getMonth() / 3);

const QUARTERS = [
  { label: "Q1", sublabel: "Jan – Mar", from: "-01-01", to: "-03-31" },
  { label: "Q2", sublabel: "Apr – Jun", from: "-04-01", to: "-06-30" },
  { label: "Q3", sublabel: "Jul – Sep", from: "-07-01", to: "-09-30" },
  { label: "Q4", sublabel: "Oct – Dec", from: "-10-01", to: "-12-31" },
];

// Exact IRAS F5 box descriptions
const IRAS_BOXES = [
  { num: 1, label: "Total value of standard-rated supplies", desc: "Taxable supplies made at the prevailing GST rate (excludes GST)" },
  { num: 2, label: "Total value of zero-rated supplies",    desc: "Supplies made at 0% GST (e.g. exports, international services)" },
  { num: 3, label: "Total value of exempt supplies",        desc: "Financial services, sale/lease of residential properties, etc." },
  { num: 4, label: "Total value of taxable purchases and expenses incurred in the making of taxable supplies",
             desc: "All GST-taxable purchases (incl. imports) for which input tax is claimed" },
  { num: 5, label: "Total value of out-of-scope supplies",  desc: "Third-country sales, internal transfers, non-business receipts, etc." },
  { num: 6, label: "Output tax due",                        desc: "GST collected on standard-rated supplies (Box 1 × GST rate)" },
  { num: 7, label: "Less: Input tax and refunds claimed",   desc: "GST paid on purchases (account 1110 – GST Input Tax Recoverable)" },
  { num: 8, label: "Net GST to be paid to / claimed from Comptroller", desc: "Box 6 minus Box 7. Positive = payable to IRAS; Negative = claimable from IRAS." },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtAmt(n: number) {
  return new Intl.NumberFormat("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("en-SG", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtDateLong(d: string | null) {
  if (!d) return "—";
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("en-SG", { day: "numeric", month: "long", year: "numeric" });
}

// ─── SortTh — standalone so it doesn't remount on every parent re-render ─────

type VISortKey = "piNumber" | "vendorName" | "piDate" | "currency" | "netAmount" | "gstAmount" | "totalAmount";

interface SortThProps {
  col: VISortKey;
  sortKey: VISortKey;
  sortDir: "asc" | "desc";
  onSort: (col: VISortKey) => void;
  right?: boolean;
  children: React.ReactNode;
}

function SortTh({ col, sortKey, sortDir, onSort, right, children }: SortThProps) {
  const active = sortKey === col;
  return (
    <th
      className={cn(
        "px-4 py-2 text-xs font-semibold cursor-pointer select-none hover:text-foreground group",
        active ? "text-foreground" : "text-muted-foreground",
        right ? "text-right" : "text-left",
      )}
      onClick={() => onSort(col)}
    >
      <span className={cn("inline-flex items-center gap-1", right ? "justify-end w-full" : "")}>
        {children}
        {active
          ? (sortDir === "asc" ? <ArrowUp className="h-3 w-3 text-primary shrink-0" /> : <ArrowDown className="h-3 w-3 text-primary shrink-0" />)
          : <ArrowUpDown className="h-3 w-3 shrink-0 opacity-0 group-hover:opacity-40 transition-opacity" />}
      </span>
    </th>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function GstF5Page() {
  const { selectedCompany } = useAuth();

  const [selYear,    setSelYear]    = useState(YEAR);
  const [selQuarter, setSelQuarter] = useState<number>(CURRENT_Q);
  const [useCustom,  setUseCustom]  = useState(false);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo,   setCustomTo]   = useState("");

  const [showInvoices,       setShowInvoices]       = useState(false);
  const [showVendorInvoices, setShowVendorInvoices] = useState(false);
  const [showExpenses,       setShowExpenses]       = useState(false);
  const [pdfLoading,         setPdfLoading]         = useState(false);
  const [backfilling,        setBackfilling]        = useState(false);
  const [backfillResult,     setBackfillResult]     = useState<{ updated: number; failed: number } | null>(null);

  // Vendor invoices sort state
  const [viSortKey, setViSortKey] = useState<VISortKey>("piDate");
  const [viSortDir, setViSortDir] = useState<"asc" | "desc">("desc");

  const handleViSort = useCallback((col: VISortKey) => {
    setViSortKey(prev => {
      if (prev === col) { setViSortDir(d => d === "asc" ? "desc" : "asc"); return col; }
      setViSortDir("asc");
      return col;
    });
  }, []);

  const queryClient = useQueryClient();
  // Tracks which period key has already been auto-backfilled, so it retries
  // when the user switches quarters but doesn't loop within the same period.
  const autoBackfillDone = useRef<string | null>(null);

  const from = useCustom ? customFrom : (selQuarter >= 0 ? `${selYear}${QUARTERS[selQuarter].from}` : "");
  const to   = useCustom ? customTo   : (selQuarter >= 0 ? `${selYear}${QUARTERS[selQuarter].to}`   : "");
  const enabled = !!(from && to);

  const { data, isLoading, isError, error } = useQuery<F5Data>({
    queryKey: ["gst-f5", from, to],
    queryFn: async () => {
      const res = await fetch(`/api/gst-f5?from=${from}&to=${to}`, { credentials: "include" });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "Failed to load GST F5 data"); }
      return res.json();
    },
    enabled,
    staleTime: 30_000,
  });

  const runBackfill = useCallback(async (silent = false) => {
    if (!silent && !confirm("This will auto-fetch historical exchange rates for all non-SGD records that still have the default rate. Continue?")) return;
    setBackfilling(true); if (!silent) setBackfillResult(null);
    try {
      const res = await fetch("/api/accounting/exchange-rate/backfill", { method: "POST", credentials: "include" });
      const d = await res.json();
      if (!silent) setBackfillResult(d);
      if (d.updated > 0) {
        // Refetch F5 data so the new rates show immediately
        queryClient.invalidateQueries({ queryKey: ["gst-f5"] });
        if (!silent) setBackfillResult(d);
      }
    } catch { if (!silent) setBackfillResult({ updated: 0, failed: -1 }); }
    finally { setBackfilling(false); }
  }, [queryClient]);

  const handleBackfill = useCallback(() => runBackfill(false), [runBackfill]);

  // Auto-backfill silently when data loads and non-SGD records still have rate = 1.
  // Keyed to the period so switching quarters always re-checks.
  useEffect(() => {
    if (!data) return;
    const periodKey = `${from}_${to}`;
    if (autoBackfillDone.current === periodKey) return;
    const needsFix = data.vendorInvoices.some(
      v => (v.currency ?? "SGD") !== "SGD" && ((v as any).exchangeRate ?? 1) === 1
    );
    if (needsFix) {
      autoBackfillDone.current = periodKey;
      runBackfill(true);
    }
  }, [data, runBackfill, from, to]);

  async function handleDownloadPDF() {
    if (!data) return;
    setPdfLoading(true);
    try {
      await generateGstF5_PDF(selectedCompany as any, { ...data, period: { from: from || null, to: to || null } });
    } finally {
      setPdfLoading(false);
    }
  }

  const box8Highlight = data ? (data.box8 > 0.005 ? "payable" : data.box8 < -0.005 ? "refund" : undefined) : undefined;

  return (
    <div className="space-y-6 pb-12">

        {/* Header */}
        <div className="flex items-end justify-between flex-wrap gap-4 pb-4 border-b border-gray-200">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">IRAS Singapore</p>
            <h1 className="text-2xl font-bold text-gray-900">GST F5 Return</h1>
            <p className="text-sm text-muted-foreground mt-0.5">IRAS Form F5 — Singapore GST Reporting</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleBackfill} disabled={backfilling} title="Auto-fill exchange rates for non-SGD records" className="border-amber-200 text-amber-700 hover:text-amber-900 hover:bg-amber-50">
              <RefreshCw className={`h-4 w-4 mr-2 ${backfilling ? "animate-spin" : ""}`} />
              Backfill FX Rates
            </Button>
            {data && (
              <Button variant="outline" size="sm" onClick={handleDownloadPDF} disabled={pdfLoading} className="border-gray-200 text-gray-600 hover:text-gray-900">
                {pdfLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                Download PDF
              </Button>
            )}
          </div>
        </div>

        {/* Period selector */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Select GST Accounting Period</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <select
                className="border rounded-md px-3 py-1.5 text-sm bg-background"
                value={selYear}
                onChange={e => { setSelYear(Number(e.target.value)); setUseCustom(false); }}
              >
                {[YEAR - 2, YEAR - 1, YEAR, YEAR + 1].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <div className="flex gap-2">
                {QUARTERS.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => { setSelQuarter(i); setUseCustom(false); }}
                    className={cn(
                      "flex flex-col items-center px-4 py-2 rounded-lg border text-xs font-medium transition-colors",
                      !useCustom && selQuarter === i
                        ? "bg-primary text-primary-foreground border-primary"
                        : "hover:bg-muted border-border",
                    )}
                  >
                    <span className="text-sm font-bold">{q.label}</span>
                    <span className="text-[10px] opacity-70">{q.sublabel}</span>
                  </button>
                ))}
              </div>
              <button
                onClick={() => setUseCustom(true)}
                className={cn(
                  "px-4 py-2 rounded-lg border text-xs font-medium transition-colors",
                  useCustom ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted border-border",
                )}
              >
                Custom
              </button>
            </div>
            {useCustom && (
              <div className="flex items-center gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">From</Label>
                  <Input type="date" className="w-40 text-sm" value={customFrom} onChange={e => setCustomFrom(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">To</Label>
                  <Input type="date" className="w-40 text-sm" value={customTo} onChange={e => setCustomTo(e.target.value)} />
                </div>
              </div>
            )}
            {enabled && !useCustom && (
              <p className="text-xs text-muted-foreground">
                Period: <span className="font-medium text-foreground">{fmtDateLong(from)} – {fmtDateLong(to)}</span>
              </p>
            )}
          </CardContent>
        </Card>

        {/* States */}
        {isLoading && <div className="text-center py-12 text-muted-foreground text-sm">Loading GST F5 data…</div>}
        {isError   && <div className="text-center py-12 text-red-600 text-sm">{(error as Error).message}</div>}
        {!enabled && !isLoading && <div className="text-center py-8 text-muted-foreground text-sm">Select a period above to generate the F5 return.</div>}

        {/* ── Report ── */}
        {data && (
          <div className="space-y-6">
            {/* Company + Period header */}
            <div className="border rounded-lg overflow-hidden">
              <div className="bg-[#1a365d] text-white px-5 py-3">
                <p className="text-[10px] tracking-widest uppercase opacity-70 mb-0.5">Inland Revenue Authority of Singapore</p>
                <p className="text-base font-bold tracking-wide">GST RETURN (FORM F5) — Working Paper</p>
              </div>
              <div className="grid grid-cols-2 gap-6 p-5 bg-slate-50 border-b">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">GST-Registered Business</p>
                  <p className="font-bold text-sm">{data.company.name}</p>
                  {data.company.gstRegistrationNo && (
                    <p className="text-xs text-muted-foreground mt-0.5">GST Reg. No.: <span className="font-semibold text-foreground">{data.company.gstRegistrationNo}</span></p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Accounting Period</p>
                  <p className="font-bold text-sm">{fmtDateLong(from)} – {fmtDateLong(to)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">GST Rate: {data.gstRate}%</p>
                </div>
              </div>
            </div>

            {/* Part I */}
            <Card>
              <div className="bg-[#1a365d] text-white px-4 py-2 rounded-t-lg text-xs font-bold uppercase tracking-wider">
                Part I — Declaration of Total Value of Supplies
              </div>
              <CardContent className="p-0">
                {[1, 2, 3, 5].map(n => {
                  const box = IRAS_BOXES.find(b => b.num === n)!;
                  const val = n === 1 ? data.box1 : n === 2 ? data.box2 : n === 3 ? data.box3 : data.box5;
                  return (
                    <div key={n} className="grid grid-cols-[2.5rem_1fr_auto] gap-3 items-start px-4 py-3 border-b last:border-b-0 even:bg-muted/20">
                      <div className="flex items-center justify-center w-8 h-8 rounded bg-[#1a365d]/10 text-[#1a365d] text-xs font-bold shrink-0">{n}</div>
                      <div>
                        <p className="text-sm font-semibold">{box.label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{box.desc}</p>
                        {(n === 2 || n === 3 || n === 5) && val === 0 && (
                          <p className="text-[10px] text-blue-600 mt-1 flex items-center gap-1"><Info className="h-3 w-3" /> Enter manually if applicable — not tracked by the system</p>
                        )}
                      </div>
                      <div className={cn("text-right font-mono font-semibold text-sm tabular-nums", val === 0 ? "text-muted-foreground/40" : "")}>
                        S$ {fmtAmt(val)}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {/* Part II */}
            <Card>
              <div className="bg-[#1a365d] text-white px-4 py-2 rounded-t-lg text-xs font-bold uppercase tracking-wider">
                Part II — Declaration of Total Value of Purchases and Imports
              </div>
              <CardContent className="p-0">
                <div className="grid grid-cols-[2.5rem_1fr_auto] gap-3 items-start px-4 py-3">
                  <div className="flex items-center justify-center w-8 h-8 rounded bg-[#1a365d]/10 text-[#1a365d] text-xs font-bold shrink-0">4</div>
                  <div>
                    <p className="text-sm font-semibold">{IRAS_BOXES[3].label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{IRAS_BOXES[3].desc}</p>
                  </div>
                  <div className={cn("text-right font-mono font-semibold text-sm tabular-nums", data.box4 === 0 ? "text-muted-foreground/40" : "")}>
                    S$ {fmtAmt(data.box4)}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Part III */}
            <Card>
              <div className="bg-[#1a365d] text-white px-4 py-2 rounded-t-lg text-xs font-bold uppercase tracking-wider">
                Part III — GST Computation
              </div>
              <CardContent className="p-0">
                {[6, 7].map(n => {
                  const box = IRAS_BOXES.find(b => b.num === n)!;
                  const val = n === 6 ? data.box6 : data.box7;
                  return (
                    <div key={n} className="grid grid-cols-[2.5rem_1fr_auto] gap-3 items-start px-4 py-3 border-b even:bg-muted/20">
                      <div className="flex items-center justify-center w-8 h-8 rounded bg-[#1a365d]/10 text-[#1a365d] text-xs font-bold shrink-0">{n}</div>
                      <div>
                        <p className="text-sm font-semibold">{box.label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{box.desc}</p>
                      </div>
                      <div className={cn("text-right font-mono font-semibold text-sm tabular-nums", val === 0 ? "text-muted-foreground/40" : "")}>
                        S$ {fmtAmt(val)}
                      </div>
                    </div>
                  );
                })}
                {/* Box 8 */}
                <div className={cn(
                  "grid grid-cols-[2.5rem_1fr_auto] gap-3 items-start px-4 py-4 border-2 rounded-b-lg",
                  box8Highlight === "payable" ? "bg-amber-50 border-amber-300" : box8Highlight === "refund" ? "bg-emerald-50 border-emerald-300" : "bg-muted/30 border-border",
                )}>
                  <div className={cn(
                    "flex items-center justify-center w-8 h-8 rounded text-sm font-bold shrink-0",
                    box8Highlight === "payable" ? "bg-amber-200 text-amber-800" : box8Highlight === "refund" ? "bg-emerald-200 text-emerald-800" : "bg-muted text-muted-foreground",
                  )}>8</div>
                  <div>
                    <p className={cn("text-sm font-bold", box8Highlight === "payable" ? "text-amber-900" : box8Highlight === "refund" ? "text-emerald-900" : "")}>
                      {data.box8 > 0.005 ? "Net GST to be paid to Comptroller of GST" : data.box8 < -0.005 ? "Net GST to be claimed from Comptroller of GST" : "Net GST (payable / claimable)"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">{IRAS_BOXES[7].desc}</p>
                  </div>
                  <div className={cn(
                    "text-right font-mono font-bold text-lg tabular-nums",
                    box8Highlight === "payable" ? "text-amber-900" : box8Highlight === "refund" ? "text-emerald-900" : "",
                  )}>
                    S$ {fmtAmt(Math.abs(data.box8))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Input Tax note */}
            {data.box7 === 0 && (
              <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800 flex items-start gap-2">
                <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold">Box 7 is S$0.00.</span> Input tax is auto-pulled from GL account <span className="font-mono font-semibold">1110 – GST Input Tax Recoverable</span> via posted journal entries.
                  To claim input tax on purchases, post a journal entry debiting account 1110 (or ask your accountant to record the GST input claim).
                </div>
              </div>
            )}

            {/* Supporting details */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Supporting Details</h3>

              {/* Sales invoices */}
              <div className="border rounded-lg overflow-hidden">
                <button
                  className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 text-sm font-medium transition-colors"
                  onClick={() => setShowInvoices(v => !v)}
                >
                  <span>Sales Invoices contributing to Box 1 + Box 6 — {data.invoices.length} invoice{data.invoices.length !== 1 ? "s" : ""}</span>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs text-muted-foreground">Output GST S$ {fmtAmt(data.box6)}</span>
                    {showInvoices ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </div>
                </button>
                {showInvoices && (
                  <div className="overflow-x-auto">
                    {data.invoices.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-6">No taxable invoices in this period.</p>
                    ) : (
                      <table className="w-full text-sm">
                        <thead className="bg-muted/20 border-b">
                          <tr>
                            <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Invoice No.</th>
                            <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Customer</th>
                            <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Date</th>
                            <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Status</th>
                            <th className="text-right px-4 py-2 text-xs font-semibold text-muted-foreground">Net (Box 1)</th>
                            <th className="text-right px-4 py-2 text-xs font-semibold text-muted-foreground">GST (Box 6)</th>
                            <th className="text-right px-4 py-2 text-xs font-semibold text-muted-foreground">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.invoices.map((inv, i) => (
                            <tr key={inv.id} className={cn("border-b last:border-b-0", i % 2 === 0 ? "" : "bg-muted/10")}>
                              <td className="px-4 py-2 font-mono text-xs font-medium">{inv.invNumber}</td>
                              <td className="px-4 py-2 text-xs">{inv.customerName}</td>
                              <td className="px-4 py-2 text-xs text-muted-foreground">{fmtDate(inv.issueDate)}</td>
                              <td className="px-4 py-2">
                                <Badge variant={inv.status === "paid" ? "default" : "outline"} className="text-[10px]">{inv.status}</Badge>
                              </td>
                              <td className="px-4 py-2 text-right font-mono text-xs">{fmtAmt(inv.netAmount)}</td>
                              <td className="px-4 py-2 text-right font-mono text-xs text-blue-700">{fmtAmt(inv.gstAmount)}</td>
                              <td className="px-4 py-2 text-right font-mono text-xs font-semibold">{fmtAmt(inv.totalAmount)}</td>
                            </tr>
                          ))}
                          <tr className="bg-muted/30 font-semibold border-t-2">
                            <td colSpan={4} className="px-4 py-2 text-xs text-right text-muted-foreground">Totals</td>
                            <td className="px-4 py-2 text-right font-mono text-xs">{fmtAmt(data.box1)}</td>
                            <td className="px-4 py-2 text-right font-mono text-xs text-blue-700">{fmtAmt(data.box6)}</td>
                            <td className="px-4 py-2 text-right font-mono text-xs">{fmtAmt(data.invoices.reduce((s, i) => s + i.totalAmount, 0))}</td>
                          </tr>
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>

              {/* Vendor invoices */}
              {(() => {
                // Sort
                const sortedVI = [...data.vendorInvoices].sort((a, b) => {
                  let av: any, bv: any;
                  switch (viSortKey) {
                    case "piNumber":   av = a.piNumber;   bv = b.piNumber;   break;
                    case "vendorName": av = a.vendorName; bv = b.vendorName; break;
                    case "piDate":     av = a.piDate ?? ""; bv = b.piDate ?? ""; break;
                    case "currency":   av = a.currency ?? "SGD"; bv = b.currency ?? "SGD"; break;
                    case "netAmount":  av = a.netAmount;  bv = b.netAmount;  break;
                    case "gstAmount":  av = a.gstAmount;  bv = b.gstAmount;  break;
                    case "totalAmount":av = a.totalAmount;bv = b.totalAmount;break;
                    default:           av = a.piDate ?? ""; bv = b.piDate ?? "";
                  }
                  if (typeof av === "string") return viSortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
                  return viSortDir === "asc" ? av - bv : bv - av;
                });

                const viSR    = sortedVI.filter(v => !v.gstTreatment || v.gstTreatment === "standard_rated");
                const viOther = sortedVI.filter(v => v.gstTreatment && v.gstTreatment !== "standard_rated");
                const hasFX   = sortedVI.some(v => (v.currency ?? "SGD") !== "SGD");
                const totalInputGst = viSR.reduce((s, v) => s + (hasFX ? (v.gstAmountSGD ?? v.gstAmount) : v.gstAmount), 0);
                const totalNet      = viSR.reduce((s, v) => s + (hasFX ? (v.netAmountSGD ?? v.netAmount) : v.netAmount), 0);
                const totalAll      = sortedVI.reduce((s, v) => s + v.totalAmount, 0);

                const GST_TREATMENT_BADGE: Record<string, { label: string; cls: string }> = {
                  standard_rated: { label: "SR 9%",       cls: "bg-green-100 text-green-800 border-green-300" },
                  zero_rated:     { label: "ZR 0%",       cls: "bg-blue-100 text-blue-800 border-blue-300" },
                  exempt:         { label: "Exempt",      cls: "bg-gray-100 text-gray-700 border-gray-300" },
                  out_of_scope:   { label: "Out of Scope",cls: "bg-orange-100 text-orange-800 border-orange-300" },
                };

                return (
                  <div className="border rounded-lg overflow-hidden">
                    <button
                      className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 text-sm font-medium transition-colors"
                      onClick={() => setShowVendorInvoices(v => !v)}
                    >
                      <span>
                        Vendor Invoices — {data.vendorInvoices.length} record{data.vendorInvoices.length !== 1 ? "s" : ""}
                        {viOther.length > 0 && (
                          <span className="ml-2 text-xs text-muted-foreground font-normal">
                            ({viSR.length} GST · {viOther.length} Non-GST)
                          </span>
                        )}
                      </span>
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-xs text-muted-foreground">Input GST S$ {fmtAmt(totalInputGst)}</span>
                        {showVendorInvoices ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </div>
                    </button>
                    {showVendorInvoices && (
                      <div className="overflow-x-auto">
                        {data.vendorInvoices.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-6">No vendor invoices in this period.</p>
                        ) : (
                          <table className="w-full text-sm">
                            <thead className="bg-muted/20 border-b">
                              <tr>
                                <SortTh col="piNumber"    sortKey={viSortKey} sortDir={viSortDir} onSort={handleViSort}>PI Number</SortTh>
                                <SortTh col="vendorName"  sortKey={viSortKey} sortDir={viSortDir} onSort={handleViSort}>Vendor</SortTh>
                                <SortTh col="piDate"      sortKey={viSortKey} sortDir={viSortDir} onSort={handleViSort}>Date</SortTh>
                                <SortTh col="currency"    sortKey={viSortKey} sortDir={viSortDir} onSort={handleViSort}>Currency</SortTh>
                                {hasFX && <th className="text-right px-4 py-2 text-xs font-semibold text-amber-700">FX Rate</th>}
                                <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">GST Treatment</th>
                                <SortTh col="netAmount"   sortKey={viSortKey} sortDir={viSortDir} onSort={handleViSort} right>Net (Box 4)</SortTh>
                                {hasFX && <th className="text-right px-4 py-2 text-xs font-semibold text-amber-700">Net SGD</th>}
                                <SortTh col="gstAmount"   sortKey={viSortKey} sortDir={viSortDir} onSort={handleViSort} right>GST (Box 7)</SortTh>
                                {hasFX && <th className="text-right px-4 py-2 text-xs font-semibold text-amber-700">GST SGD</th>}
                                <SortTh col="totalAmount" sortKey={viSortKey} sortDir={viSortDir} onSort={handleViSort} right>Total</SortTh>
                              </tr>
                            </thead>
                            <tbody>
                              {sortedVI.map((vi, i) => {
                                const isSR = !vi.gstTreatment || vi.gstTreatment === "standard_rated";
                                const badge = GST_TREATMENT_BADGE[vi.gstTreatment] ?? GST_TREATMENT_BADGE.standard_rated;
                                return (
                                  <tr key={vi.id} className={cn("border-b last:border-b-0", i % 2 === 0 ? "" : "bg-muted/10", !isSR ? "opacity-70" : "")}>
                                    <td className="px-4 py-2 font-mono text-xs font-medium">{vi.piNumber}</td>
                                    <td className="px-4 py-2 text-xs">{vi.vendorName}</td>
                                    <td className="px-4 py-2 text-xs text-muted-foreground">{fmtDate(vi.piDate)}</td>
                                    <td className="px-4 py-2 text-xs text-muted-foreground">{vi.currency ?? "SGD"}</td>
                                    {hasFX && (
                                      <td className="px-4 py-2 text-right font-mono text-xs text-amber-700">
                                        {(vi.currency ?? "SGD") !== "SGD" ? ((vi as any).exchangeRate ?? 1).toFixed(4) : <span className="text-muted-foreground/30">—</span>}
                                      </td>
                                    )}
                                    <td className="px-4 py-2">
                                      <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-semibold", badge.cls)}>
                                        {badge.label}
                                      </span>
                                    </td>
                                    <td className="px-4 py-2 text-right font-mono text-xs">
                                      {isSR ? fmtAmt(vi.netAmount) : <span className="text-muted-foreground/40">—</span>}
                                    </td>
                                    {hasFX && (
                                      <td className="px-4 py-2 text-right font-mono text-xs text-amber-700 font-semibold">
                                        {isSR && (vi.currency ?? "SGD") !== "SGD" ? fmtAmt((vi as any).netAmountSGD ?? vi.netAmount) : <span className="text-muted-foreground/30">—</span>}
                                      </td>
                                    )}
                                    <td className="px-4 py-2 text-right font-mono text-xs text-blue-700">
                                      {isSR ? fmtAmt(vi.gstAmount) : <span className="text-muted-foreground/40">—</span>}
                                    </td>
                                    {hasFX && (
                                      <td className="px-4 py-2 text-right font-mono text-xs text-amber-700 font-semibold">
                                        {isSR && (vi.currency ?? "SGD") !== "SGD" ? fmtAmt((vi as any).gstAmountSGD ?? vi.gstAmount) : <span className="text-muted-foreground/30">—</span>}
                                      </td>
                                    )}
                                    <td className="px-4 py-2 text-right font-mono text-xs font-semibold">{fmtAmt(vi.totalAmount)}</td>
                                  </tr>
                                );
                              })}
                              <tr className="bg-muted/30 font-semibold border-t-2">
                                <td colSpan={hasFX ? 6 : 5} className="px-4 py-2 text-xs text-right text-muted-foreground">Totals (SGD)</td>
                                <td className="px-4 py-2 text-right font-mono text-xs">{fmtAmt(totalNet)}</td>
                                {hasFX && <td />}
                                <td className="px-4 py-2 text-right font-mono text-xs text-blue-700">{fmtAmt(totalInputGst)}</td>
                                {hasFX && <td />}
                                <td className="px-4 py-2 text-right font-mono text-xs">{fmtAmt(totalAll)}</td>
                              </tr>
                              {viOther.length > 0 && (
                                <tr className="bg-amber-50 border-t">
                                  <td colSpan={8} className="px-4 py-2 text-[10px] text-amber-700 flex items-center gap-1">
                                    <Info className="h-3 w-3 shrink-0" />
                                    {viOther.length} non-GST record{viOther.length !== 1 ? "s" : ""} (ZR / Exempt / Out-of-scope) — excluded from Box 4 &amp; Box 7 as no input tax is claimable.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Expenses with GST claimable → Box 4 + Box 7 */}
              <div className="border rounded-lg overflow-hidden">
                <button
                  className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 text-sm font-medium transition-colors"
                  onClick={() => setShowExpenses(v => !v)}
                >
                  <span>Confirmed Expenses (GST-claimable) contributing to Box 4 + Box 7 — {data.expenses.length} record{data.expenses.length !== 1 ? "s" : ""}</span>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs text-muted-foreground">Input GST S$ {fmtAmt(data.expenses.reduce((s, e) => s + e.gstAmount, 0))}</span>
                    {showExpenses ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </div>
                </button>
                {showExpenses && (
                  <div className="overflow-x-auto">
                    {data.expenses.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-6">No GST-claimable expenses confirmed in this period.</p>
                    ) : (
                      <table className="w-full text-sm">
                        <thead className="bg-muted/20 border-b">
                          <tr>
                            <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Vendor / Payee</th>
                            <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Description</th>
                            <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Date</th>
                            <th className="text-right px-4 py-2 text-xs font-semibold text-muted-foreground">Net (Box 4)</th>
                            <th className="text-right px-4 py-2 text-xs font-semibold text-muted-foreground">GST (Box 7)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.expenses.map((exp, i) => (
                            <tr key={exp.id} className={cn("border-b last:border-b-0", i % 2 === 0 ? "" : "bg-muted/10")}>
                              <td className="px-4 py-2 text-xs font-medium">{exp.vendorName}</td>
                              <td className="px-4 py-2 text-xs text-muted-foreground max-w-[200px] truncate">{exp.description}</td>
                              <td className="px-4 py-2 text-xs text-muted-foreground">{fmtDate(exp.expenseDate)}</td>
                              <td className="px-4 py-2 text-right font-mono text-xs">{fmtAmt(exp.amount)}</td>
                              <td className="px-4 py-2 text-right font-mono text-xs text-blue-700">{fmtAmt(exp.gstAmount)}</td>
                            </tr>
                          ))}
                          <tr className="bg-muted/30 font-semibold border-t-2">
                            <td colSpan={3} className="px-4 py-2 text-xs text-right text-muted-foreground">Totals</td>
                            <td className="px-4 py-2 text-right font-mono text-xs">{fmtAmt(data.expenses.reduce((s, e) => s + e.amount, 0))}</td>
                            <td className="px-4 py-2 text-right font-mono text-xs text-blue-700">{fmtAmt(data.expenses.reduce((s, e) => s + e.gstAmount, 0))}</td>
                          </tr>
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* IRAS disclaimer */}
            <div className="rounded-md bg-muted/30 border px-4 py-3 text-xs text-muted-foreground">
              <span className="font-semibold">Note:</span> Boxes 2, 3, and 5 require manual entry if applicable and are not auto-computed by the system.
              Box 4 and Box 7 include confirmed expenses marked as GST-claimable. Box 7 also includes any manual input tax posted to GL account 1110.
              File your GST return at{" "}
              <a href="https://mytax.iras.gov.sg" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">mytax.iras.gov.sg</a>.
            </div>
          </div>
        )}
      </div>
  );
}
