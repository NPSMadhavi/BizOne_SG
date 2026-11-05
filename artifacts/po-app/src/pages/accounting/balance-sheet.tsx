import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/auth-context";
import { Download, Loader2, Package, Users, ChevronDown, ChevronUp, ChevronRight, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { generateBalanceSheet_PDF } from "@/lib/pdf";
import type { Asset } from "@shared/schema";


interface AcctLine { code: string; name: string; subType: string | null; amount: number }
interface BSData {
  asOf: string;
  assets: AcctLine[]; totalAssets: number;
  liabilities: AcctLine[]; totalLiabilities: number;
  equity: AcctLine[]; retainedEarnings: number; totalEquity: number;
  totalLiabilitiesAndEquity: number;
  balanced: boolean;
}

function fmtAmt(n: number) {
  const abs = Math.abs(n);
  const s = new Intl.NumberFormat("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(abs);
  return n < 0 ? `(${s})` : s;
}
function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-SG", { day: "2-digit", month: "long", year: "numeric" });
}

// Quarter end dates (calendar year)
const QUARTER_ENDS = [
  { label: "Q1", month: "03", day: "31" },
  { label: "Q2", month: "06", day: "30" },
  { label: "Q3", month: "09", day: "30" },
  { label: "Q4", month: "12", day: "31" },
];

function GroupLabel({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 px-5 py-2.5 bg-gray-50 border-b border-gray-100">
      <div className="w-0.5 h-4 bg-gray-300 rounded-full" />
      <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">{label}</span>
    </div>
  );
}

interface SectionProps {
  groupLabel?: string;
  rows: AcctLine[];
  subtotalLabel: string;
  subtotal: number;
  isGrandTotal?: boolean;
  expandedRows?: Record<string, boolean>;
  onToggleRow?: (row: AcctLine) => void;
  isRowClickable?: (row: AcctLine) => boolean;
  renderExpandedRow?: (row: AcctLine) => React.ReactNode;
  groupAction?: React.ReactNode;
}

function Section({
  groupLabel,
  rows,
  subtotalLabel,
  subtotal,
  isGrandTotal,
  expandedRows = {},
  onToggleRow,
  isRowClickable,
  renderExpandedRow,
  groupAction,
}: SectionProps) {
  const active = rows.filter(r => Math.abs(r.amount) > 0.005);
  return (
    <>
      {groupLabel && (
        <div className="flex items-center justify-between px-5 py-2.5 bg-gray-50 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-0.5 h-4 bg-gray-300 rounded-full" />
            <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">{groupLabel}</span>
          </div>
          {groupAction}
        </div>
      )}
      {active.map(r => {
        const isClickable = Boolean(isRowClickable && isRowClickable(r));
        const isExpanded = Boolean(expandedRows[r.code]);
        return (
          <div key={r.code} className="border-b border-gray-100 transition-all">
            <div
              onClick={() => {
                if (isClickable && onToggleRow) onToggleRow(r);
              }}
              className={cn(
                "flex items-baseline justify-between px-5 py-2",
                isClickable ? "cursor-pointer hover:bg-blue-50/70 transition-colors group" : "hover:bg-gray-50/60"
              )}
            >
              <span className="flex items-baseline gap-3 text-sm text-gray-600">
                <span className="font-mono text-xs text-gray-400 w-10 shrink-0">{r.code}</span>
                <span className={cn(isClickable && "group-hover:text-blue-700 font-medium")}>{r.name}</span>
                {isClickable && (
                  <ChevronDown
                    className={cn(
                      "h-3.5 w-3.5 text-gray-400 group-hover:text-blue-600 transition-transform duration-200",
                      isExpanded && "rotate-180 text-blue-600"
                    )}
                  />
                )}
              </span>
              <span className={cn("font-mono text-sm tabular-nums ml-6 shrink-0", r.amount < 0 ? "text-red-600" : "text-gray-800")}>{fmtAmt(r.amount)}</span>
            </div>
            {isExpanded && renderExpandedRow && (
              <div className="bg-slate-50/80 p-3 border-t border-gray-200 animate-in fade-in duration-200">
                {renderExpandedRow(r)}
              </div>
            )}
          </div>
        );
      })}
      {active.length === 0 && <div className="px-5 py-3 text-xs text-gray-300 italic pl-[4.5rem]">No entries</div>}
      <div className={cn("flex items-baseline justify-between px-5 py-3", isGrandTotal ? "bg-gray-900 text-white" : "bg-gray-50 border-t border-gray-200")}>
        <span className={cn("text-xs font-bold uppercase tracking-wider", isGrandTotal ? "text-gray-300" : "text-gray-500")}>{subtotalLabel}</span>
        <span className={cn("font-mono tabular-nums shrink-0 ml-6", isGrandTotal ? "text-white text-base font-bold" : subtotal < 0 ? "text-red-600 text-sm font-semibold" : "text-gray-900 text-sm font-semibold")}>
          {fmtAmt(subtotal)}
        </span>
      </div>
    </>
  );
}

function SubtotalBar({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="flex items-baseline justify-between px-5 py-2.5 bg-gray-100 border-t-2 border-gray-200">
      <span className="text-xs font-bold uppercase tracking-wider text-gray-500">{label}</span>
      <span className={cn("font-mono text-sm font-semibold tabular-nums ml-6", amount < 0 ? "text-red-600" : "text-gray-900")}>{fmtAmt(amount)}</span>
    </div>
  );
}

export default function BalanceSheetPage() {
  const { selectedCompany } = useAuth();
  const today = new Date().toISOString().split("T")[0];
  const currentYear = new Date().getFullYear();

  const [asOf, setAsOf] = useState(today);
  const [selYear, setSelYear] = useState(currentYear);
  const [selQuarter, setSelQuarter] = useState<number | null>(null); // null = custom
  const [pdfLoading, setPdfLoading] = useState(false);

  function selectQuarter(qi: number, year: number) {
    const q = QUARTER_ENDS[qi];
    const d = `${year}-${q.month}-${q.day}`;
    setAsOf(d);
    setSelYear(year);
    setSelQuarter(qi);
  }

  function handleDateChange(val: string) {
    setAsOf(val);
    setSelQuarter(null); // switch to custom
  }

  const { data, isLoading, isError, error } = useQuery<BSData>({
    queryKey: ["balance-sheet", asOf],
    queryFn: async () => {
      const r = await fetch(`/api/balance-sheet?asOf=${asOf}`, { credentials: "include" });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || "Failed to load"); }
      return r.json();
    },
    staleTime: 30_000,
  });

  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const toggleRow = (code: string) => {
    setExpandedRows(prev => ({
      ...prev,
      [code]: !prev[code],
    }));
  };

  const { data: assets = [] } = useQuery<Asset[]>({
    queryKey: ["/api/assets"],
  });

  const { data: payrollRecords = [] } = useQuery<any[]>({
    queryKey: ["/api/payroll/records"],
  });

  const { data: employees = [] } = useQuery<any[]>({
    queryKey: ["/api/employees"],
  });

  const { data: vendorInvoices = [] } = useQuery<any[]>({
    queryKey: ["/api/vendor-invoices"],
    queryFn: async () => {
      const res = await fetch("/api/vendor-invoices", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: expenses = [] } = useQuery<any[]>({
    queryKey: ["expenses"],
    queryFn: async () => {
      const res = await fetch("/api/expenses", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const assetBreakdown = useMemo(() => {
    return assets.map((a) => {
      const cost = parseFloat(String((a as any).cost || 0)) || 0;
      const marker = `asset-payment:${a.id}`;
      const paid = expenses.reduce((sum, exp) => {
        if (exp.notes?.includes(marker)) {
          return sum + (Number(exp.amount) || 0);
        }
        return sum;
      }, 0);
      return {
        asset: a,
        cost,
        paid,
        balance: Math.max(0, cost - paid),
      };
    });
  }, [assets, expenses]);

  const payrollBreakdown = useMemo(() => {
    return payrollRecords.map((rec: any) => {
      const emp = employees.find((e: any) => Number(e.id) === Number(rec.employee_id));
      const gross = parseFloat(String(rec.gross_pay || 0)) || 0;
      const net = parseFloat(String(rec.net_pay || 0)) || 0;
      const marker = `payroll-payment:${rec.employee_id}:`;
      const paid = expenses.reduce((sum, exp) => {
        if (exp.notes?.includes(marker)) {
          return sum + (Number(exp.amount) || 0);
        }
        return sum;
      }, 0);
      return {
        record: rec,
        employee: emp,
        gross,
        net,
        paid,
        balance: Math.max(0, Math.round((net - paid) * 100) / 100),
      };
    });
  }, [payrollRecords, employees, expenses]);

  const isNonCurrentOrFixed = (a: AcctLine) =>
    a.subType === "non_current_asset" ||
    a.subType === "fixed_asset" ||
    a.code.startsWith("15") ||
    a.code.startsWith("16") ||
    a.code.startsWith("17") ||
    /fixed asset|equipment|furniture|renovation/i.test(a.name);

  const ncAssets  = data?.assets.filter(isNonCurrentOrFixed) ?? [];
  const curAssets = data?.assets.filter(a => !isNonCurrentOrFixed(a)) ?? [];
  const curLiab   = data?.liabilities.filter(a => a.subType !== "non_current_liability") ?? [];
  const ncLiab    = data?.liabilities.filter(a => a.subType === "non_current_liability") ?? [];

  async function handleDownloadPDF() {
    if (!data) return;
    setPdfLoading(true);
    try {
      await generateBalanceSheet_PDF(
        selectedCompany as any, asOf,
        data.assets, data.totalAssets,
        data.liabilities, data.totalLiabilities,
        data.equity, data.retainedEarnings, data.totalEquity,
        data.totalLiabilitiesAndEquity, data.balanced
      );
    } finally {
      setPdfLoading(false);
    }
  }

  const yearOptions = Array.from({ length: 6 }, (_, i) => currentYear - i);

  return (
    <div className="space-y-5 pb-20 animate-in fade-in duration-300">
      <div className="flex items-end justify-between flex-wrap gap-4 pb-4 border-b border-gray-200">
        <div>
          <h1 className="text-2xl font-bold text-[#2563EB]">Balance Sheet</h1>
        </div>
        <div className="flex items-end gap-4 flex-wrap">
          {data && (
            <span className={cn("text-xs font-semibold px-2.5 py-1 rounded border mb-0.5", data.balanced ? "border-green-200 text-green-700 bg-green-50" : "border-red-200 text-red-700 bg-red-50")}>
              {data.balanced ? "Balanced ✓" : "Out of balance"}
            </span>
          )}
          {data && (
            <Button variant="outline" size="sm" onClick={handleDownloadPDF} disabled={pdfLoading} className="border-gray-200 text-gray-600 hover:text-gray-900 mb-0.5">
              {pdfLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
              Download PDF
            </Button>
          )}
        </div>
      </div>

      {/* Date / quarter selector */}
      <div className="flex flex-wrap items-end gap-4 p-4 bg-muted/20 border rounded-lg">
        {/* Year */}
        <div className="space-y-1">
          <Label className="text-xs text-gray-500">Year</Label>
          <select
            value={selYear}
            onChange={e => {
              const y = parseInt(e.target.value);
              setSelYear(y);
              if (selQuarter !== null) selectQuarter(selQuarter, y);
            }}
            className="h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        {/* Quarter buttons */}
        <div className="space-y-1">
          <Label className="text-xs text-gray-500">Quarter end</Label>
          <div className="flex gap-1.5">
            {QUARTER_ENDS.map((q, i) => (
              <button
                key={q.label}
                onClick={() => selectQuarter(i, selYear)}
                className={cn(
                  "h-8 px-3 text-xs font-semibold rounded-md border transition-colors",
                  selQuarter === i
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background border-input text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
              >
                {q.label}
                <span className="ml-1 font-normal opacity-60">
                  {new Date(`${selYear}-${q.month}-${q.day}T00:00:00`).toLocaleDateString("en-SG", { month: "short", day: "numeric" })}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Custom date */}
        <div className="space-y-1">
          <Label className="text-xs text-gray-500">Or custom date</Label>
          <Input
            type="date"
            value={asOf}
            max={today}
            onChange={e => handleDateChange(e.target.value)}
            className="w-40 text-sm h-8 border-gray-200"
          />
        </div>
      </div>

      {isLoading && <div className="text-center py-16 text-sm text-gray-400">Loading…</div>}
      {isError   && <div className="text-center py-16 text-sm text-red-500">{(error as Error).message}</div>}

      {data && (
        <>
          <p className="text-xs text-gray-400">As at {fmtDate(data.asOf)} · All amounts in SGD · Accounts with zero balance are hidden.</p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-200 bg-white">
                <h2 className="text-sm font-bold uppercase tracking-widest text-gray-800">Assets</h2>
              </div>
              <Section
                groupLabel="Non-Current Assets (Fixed Assets)"
                rows={ncAssets}
                subtotalLabel="Total Non-Current Assets"
                subtotal={ncAssets.reduce((s, a) => s + a.amount, 0)}
                expandedRows={expandedRows}
                onToggleRow={(r) => toggleRow(r.code)}
                isRowClickable={(r) => r.subType === "fixed_asset" || r.code.startsWith("15") || r.code.startsWith("16") || r.code.startsWith("17") || /fixed asset/i.test(r.name)}
                renderExpandedRow={(r) => (
                  <div className="rounded-lg border border-blue-200 bg-white overflow-hidden shadow-sm">
                    <div className="flex items-center justify-between px-3 py-2 bg-blue-50/60 border-b border-blue-100 text-xs">
                      <span className="font-semibold text-blue-900 flex items-center gap-1.5">
                        <Package className="h-3.5 w-3.5 text-blue-600" />
                        Fixed Assets Register &amp; Capitalized Assets — {assetBreakdown.length} asset{assetBreakdown.length !== 1 ? "s" : ""}
                      </span>
                      <span className="font-mono text-muted-foreground">
                        Total Cost: <strong className="text-gray-900">{fmtAmt(assetBreakdown.reduce((s, a) => s + a.cost, 0))}</strong>
                      </span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-100 border-b border-slate-200 uppercase font-semibold text-slate-700">
                          <tr>
                            <th className="py-2.5 px-3 text-left whitespace-nowrap">Asset Tag</th>
                            <th className="py-2.5 px-3 text-left whitespace-nowrap">Asset Name</th>
                            <th className="py-2.5 px-3 text-left whitespace-nowrap">Category</th>
                            <th className="py-2.5 px-3 text-right whitespace-nowrap">Purchase Cost (S$)</th>
                            <th className="py-2.5 px-3 text-right whitespace-nowrap">Amount Paid (S$)</th>
                            <th className="py-2.5 px-3 text-right whitespace-nowrap">Balance Due (S$)</th>
                            <th className="py-2.5 px-3 text-center whitespace-nowrap">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 bg-white">
                          {assetBreakdown.length === 0 ? (
                            <tr>
                              <td colSpan={7} className="py-4 text-center text-gray-400 italic">No fixed assets registered.</td>
                            </tr>
                          ) : (
                            assetBreakdown.map(({ asset, cost, paid, balance }) => (
                              <tr key={asset.id} className="hover:bg-slate-50 transition-colors">
                                <td className="py-2 px-3 font-mono font-medium text-gray-800 whitespace-nowrap">{(asset as any).tag || (asset as any).assetTag || `FA-${asset.id}`}</td>
                                <td className="py-2 px-3 font-medium text-gray-900 whitespace-nowrap">{(asset as any).name || (asset as any).type || (asset as any).model || (asset as any).description || "—"}</td>
                                <td className="py-2 px-3 text-gray-600 capitalize whitespace-nowrap">{asset.category || "—"}</td>
                                <td className="py-2 px-3 text-right font-mono whitespace-nowrap">{fmtAmt(cost)}</td>
                                <td className="py-2 px-3 text-right font-mono text-emerald-600 whitespace-nowrap">{fmtAmt(paid)}</td>
                                <td className="py-2 px-3 text-right font-mono font-semibold text-gray-900 whitespace-nowrap">{fmtAmt(balance)}</td>
                                <td className="py-2 px-3 text-center whitespace-nowrap">
                                  <span className={cn(
                                    "text-[10px] px-2 py-0.5 rounded-full font-medium uppercase",
                                    balance <= 0.01 ? "bg-emerald-100 text-emerald-700" : paid > 0 ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"
                                  )}>
                                    {balance <= 0.01 ? "Fully Paid" : paid > 0 ? "Partially Paid" : "Unpaid"}
                                  </span>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                        {assetBreakdown.length > 0 && (
                          <tfoot className="bg-slate-50 border-t border-slate-200 font-semibold text-gray-900">
                            <tr>
                              <td colSpan={3} className="py-2.5 px-3 uppercase text-gray-600">Total Fixed Assets ({assetBreakdown.length})</td>
                              <td className="py-2.5 px-3 text-right font-mono">{fmtAmt(assetBreakdown.reduce((s, a) => s + a.cost, 0))}</td>
                              <td className="py-2.5 px-3 text-right font-mono text-emerald-700">{fmtAmt(assetBreakdown.reduce((s, a) => s + a.paid, 0))}</td>
                              <td className="py-2.5 px-3 text-right font-mono text-blue-700">{fmtAmt(assetBreakdown.reduce((s, a) => s + a.balance, 0))}</td>
                              <td></td>
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                  </div>
                )}
                groupAction={
                  assetBreakdown.length > 0 && ncAssets.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => {
                        const code = ncAssets[0]?.code;
                        if (code) toggleRow(code);
                      }}
                      className="text-[11px] font-medium text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1"
                    >
                      <Package className="h-3.5 w-3.5" />
                      {ncAssets.some(r => expandedRows[r.code]) ? "Hide Fixed Assets" : `View All Fixed Assets (${assetBreakdown.length})`}
                    </button>
                  ) : undefined
                }
              />
              <Section groupLabel="Current Assets" rows={curAssets} subtotalLabel="Total Current Assets" subtotal={curAssets.reduce((s, a) => s + a.amount, 0)} />
              <Section rows={[]} subtotalLabel="Total Assets" subtotal={data.totalAssets} isGrandTotal />
            </div>

            <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-200 bg-white">
                <h2 className="text-sm font-bold uppercase tracking-widest text-gray-800">Liabilities &amp; Equity</h2>
              </div>
              <Section
                groupLabel="Current Liabilities"
                rows={curLiab}
                subtotalLabel="Total Current Liabilities"
                subtotal={curLiab.reduce((s, a) => s + a.amount, 0)}
                expandedRows={expandedRows}
                onToggleRow={(r) => toggleRow(r.code)}
                isRowClickable={(r) => {
                  const isAp = r.code === "2000" || /accounts payable|trade creditors/i.test(r.name);
                  const isPayroll = r.code === "2040" || r.code === "2050" || /salaries payable|payroll payable/i.test(r.name);
                  return isAp || isPayroll;
                }}
                renderExpandedRow={(r) => {
                  const isAp = r.code === "2000" || /accounts payable|trade creditors/i.test(r.name);
                  if (isAp) {
                    return (
                      <div className="rounded-lg border border-amber-200 bg-white overflow-hidden shadow-sm">
                        <div className="flex items-center justify-between px-3 py-2 bg-amber-50/60 border-b border-amber-100 text-xs">
                          <span className="font-semibold text-amber-900 flex items-center gap-1.5">
                            <FileText className="h-3.5 w-3.5 text-amber-600" />
                            Accounts Payable (Trade Creditors) — {vendorInvoices.length} invoice{vendorInvoices.length !== 1 ? "s" : ""}
                          </span>
                          <span className="font-mono text-muted-foreground">
                            Total AP: <strong className="text-gray-900">{fmtAmt(vendorInvoices.reduce((s: number, vi: any) => s + (parseFloat(String(vi.totalAmount || 0)) || 0), 0))}</strong>
                          </span>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead className="bg-slate-100 border-b border-slate-200 uppercase font-semibold text-slate-700">
                              <tr>
                                <th className="py-2.5 px-3 text-left whitespace-nowrap">Invoice No.</th>
                                <th className="py-2.5 px-3 text-left whitespace-nowrap">Vendor Name</th>
                                <th className="py-2.5 px-3 text-left whitespace-nowrap">Invoice Date</th>
                                <th className="py-2.5 px-3 text-right whitespace-nowrap">Total Amount (S$)</th>
                                <th className="py-2.5 px-3 text-right whitespace-nowrap">Paid Amount (S$)</th>
                                <th className="py-2.5 px-3 text-right whitespace-nowrap">Balance Due (S$)</th>
                                <th className="py-2.5 px-3 text-center whitespace-nowrap">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 bg-white">
                              {vendorInvoices.length === 0 ? (
                                <tr>
                                  <td colSpan={7} className="py-4 text-center text-gray-400 italic">No vendor invoices found.</td>
                                </tr>
                              ) : (
                                vendorInvoices.map((vi: any) => {
                                  const tot = parseFloat(String(vi.totalAmount || 0)) || 0;
                                  const paid = parseFloat(String(vi.paidAmount || vi.amountPaid || 0)) || 0;
                                  const bal = Math.max(0, tot - paid);
                                  return (
                                    <tr key={vi.id} className="hover:bg-slate-50 transition-colors">
                                      <td className="py-2 px-3 font-mono font-medium text-gray-800 whitespace-nowrap">{vi.piNumber || `PI-${vi.id}`}</td>
                                      <td className="py-2 px-3 font-medium text-gray-900 whitespace-nowrap">{vi.vendorName || "—"}</td>
                                      <td className="py-2 px-3 text-gray-600 whitespace-nowrap">{vi.piDate ? fmtDate(vi.piDate) : "—"}</td>
                                      <td className="py-2 px-3 text-right font-mono whitespace-nowrap">{fmtAmt(tot)}</td>
                                      <td className="py-2 px-3 text-right font-mono text-emerald-600 whitespace-nowrap">{fmtAmt(paid)}</td>
                                      <td className="py-2 px-3 text-right font-mono font-semibold text-gray-900 whitespace-nowrap">{fmtAmt(bal)}</td>
                                      <td className="py-2 px-3 text-center whitespace-nowrap">
                                        <span className={cn(
                                          "text-[10px] px-2 py-0.5 rounded-full font-medium uppercase",
                                          bal <= 0.01 ? "bg-emerald-100 text-emerald-700" : paid > 0 ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"
                                        )}>
                                          {vi.status || (bal <= 0.01 ? "Paid" : "Pending")}
                                        </span>
                                      </td>
                                    </tr>
                                  );
                                })
                              )}
                            </tbody>
                            {vendorInvoices.length > 0 && (
                              <tfoot className="bg-slate-50 border-t border-slate-200 font-semibold text-gray-900">
                                <tr>
                                  <td colSpan={3} className="py-2.5 px-3 uppercase text-gray-600">Total Vendor Invoices ({vendorInvoices.length})</td>
                                  <td className="py-2.5 px-3 text-right font-mono">
                                    {fmtAmt(vendorInvoices.reduce((s: number, vi: any) => s + (parseFloat(String(vi.totalAmount || 0)) || 0), 0))}
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-mono text-emerald-700">
                                    {fmtAmt(vendorInvoices.reduce((s: number, vi: any) => s + (parseFloat(String(vi.paidAmount || vi.amountPaid || 0)) || 0), 0))}
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-mono text-blue-700">
                                    {fmtAmt(vendorInvoices.reduce((s: number, vi: any) => {
                                      const t = parseFloat(String(vi.totalAmount || 0)) || 0;
                                      const p = parseFloat(String(vi.paidAmount || vi.amountPaid || 0)) || 0;
                                      return s + Math.max(0, t - p);
                                    }, 0))}
                                  </td>
                                  <td></td>
                                </tr>
                              </tfoot>
                            )}
                          </table>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div className="rounded-lg border border-blue-200 bg-white overflow-hidden shadow-sm">
                      <div className="flex items-center justify-between px-3 py-2 bg-blue-50/60 border-b border-blue-100 text-xs">
                        <span className="font-semibold text-blue-900 flex items-center gap-1.5">
                          <Users className="h-3.5 w-3.5 text-blue-600" />
                          Staff Salaries &amp; Payroll Liabilities — {payrollBreakdown.length} record{payrollBreakdown.length !== 1 ? "s" : ""}
                        </span>
                        <span className="font-mono text-muted-foreground">
                          Balance Due: <strong className="text-gray-900">{fmtAmt(payrollBreakdown.reduce((s, p) => s + p.balance, 0))}</strong>
                        </span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead className="bg-slate-100 border-b border-slate-200 uppercase font-semibold text-slate-700">
                            <tr>
                              <th className="py-2.5 px-3 text-left whitespace-nowrap">Employee</th>
                              <th className="py-2.5 px-3 text-left whitespace-nowrap">Period</th>
                              <th className="py-2.5 px-3 text-right whitespace-nowrap">Gross Pay (S$)</th>
                              <th className="py-2.5 px-3 text-right whitespace-nowrap">Net Pay (S$)</th>
                              <th className="py-2.5 px-3 text-right whitespace-nowrap">Paid (S$)</th>
                              <th className="py-2.5 px-3 text-right whitespace-nowrap">Balance Due (S$)</th>
                              <th className="py-2.5 px-3 text-center whitespace-nowrap">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 bg-white">
                            {payrollBreakdown.length === 0 ? (
                              <tr>
                                <td colSpan={7} className="py-4 text-center text-gray-400 italic">No payroll records found.</td>
                              </tr>
                            ) : (
                              payrollBreakdown.map(({ record, employee, gross, net, paid, balance }) => (
                                <tr key={record.id} className="hover:bg-slate-50 transition-colors">
                                  <td className="py-2 px-3 whitespace-nowrap">
                                    <div className="font-medium text-gray-900">{employee?.name || `Employee ${record.employee_id}`}</div>
                                    <div className="text-[10px] text-gray-500 font-mono">{employee?.employeeId || employee?.designation || ""}</div>
                                  </td>
                                  <td className="py-2 px-3 text-gray-600 whitespace-nowrap">
                                    {record.pay_period_start ? `${new Date(record.pay_period_start).toLocaleDateString("en-SG", { month: "short", year: "numeric" })}` : "—"}
                                  </td>
                                  <td className="py-2 px-3 text-right font-mono whitespace-nowrap">{fmtAmt(gross)}</td>
                                  <td className="py-2 px-3 text-right font-mono font-medium text-gray-900 whitespace-nowrap">{fmtAmt(net)}</td>
                                  <td className="py-2 px-3 text-right font-mono text-emerald-600 whitespace-nowrap">{fmtAmt(paid)}</td>
                                  <td className="py-2 px-3 text-right font-mono font-semibold text-blue-700 whitespace-nowrap">{fmtAmt(balance)}</td>
                                  <td className="py-2 px-3 text-center whitespace-nowrap">
                                    <span className={cn(
                                      "text-[10px] px-2 py-0.5 rounded-full font-medium uppercase",
                                      balance <= 0.01 ? "bg-emerald-100 text-emerald-700" : paid > 0 ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"
                                    )}>
                                      {balance <= 0.01 ? "Settled" : paid > 0 ? "Partially Paid" : "Payable"}
                                    </span>
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                          {payrollBreakdown.length > 0 && (
                            <tfoot className="bg-slate-50 border-t border-slate-200 font-semibold text-gray-900">
                              <tr>
                                <td colSpan={2} className="py-2.5 px-3 uppercase text-gray-600">Total Payroll Records ({payrollBreakdown.length})</td>
                                <td className="py-2.5 px-3 text-right font-mono">{fmtAmt(payrollBreakdown.reduce((s, p) => s + p.gross, 0))}</td>
                                <td className="py-2.5 px-3 text-right font-mono">{fmtAmt(payrollBreakdown.reduce((s, p) => s + p.net, 0))}</td>
                                <td className="py-2.5 px-3 text-right font-mono text-emerald-700">{fmtAmt(payrollBreakdown.reduce((s, p) => s + p.paid, 0))}</td>
                                <td className="py-2.5 px-3 text-right font-mono text-blue-700">{fmtAmt(payrollBreakdown.reduce((s, p) => s + p.balance, 0))}</td>
                                <td></td>
                              </tr>
                            </tfoot>
                          )}
                        </table>
                      </div>
                    </div>
                  );
                }}
                groupAction={
                  payrollBreakdown.length > 0 && curLiab.some(r => r.code === "2040" || r.code === "2050" || /salaries payable|payroll payable/i.test(r.name)) ? (
                    <button
                      type="button"
                      onClick={() => {
                        const prRow = curLiab.find(r => r.code === "2040" || r.code === "2050" || /salaries payable|payroll payable/i.test(r.name));
                        if (prRow) toggleRow(prRow.code);
                      }}
                      className="text-[11px] font-medium text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1"
                    >
                      <Users className="h-3.5 w-3.5" />
                      {curLiab.some(r => (r.code === "2040" || r.code === "2050" || /salaries payable|payroll payable/i.test(r.name)) && expandedRows[r.code]) ? "Hide Payroll Details" : `View Payroll Details (${payrollBreakdown.length})`}
                    </button>
                  ) : undefined
                }
              />
              <Section groupLabel="Non-Current Liabilities" rows={ncLiab} subtotalLabel="Total Non-Current Liabilities" subtotal={ncLiab.reduce((s, a) => s + a.amount, 0)} />
              <SubtotalBar label="Total Liabilities" amount={data.totalLiabilities} />

              <GroupLabel label="Equity" />
              {data.equity.filter(e => Math.abs(e.amount) > 0.005).map(e => (
                <div key={e.code} className="flex items-baseline justify-between px-5 py-2 border-b border-gray-100 hover:bg-gray-50/60">
                  <span className="flex items-baseline gap-3 text-sm text-gray-600">
                    <span className="font-mono text-xs text-gray-400 w-10 shrink-0">{e.code}</span>
                    {e.name}
                  </span>
                  <span className={cn("font-mono text-sm tabular-nums ml-6 shrink-0", e.amount < 0 ? "text-red-600" : "text-gray-800")}>{fmtAmt(e.amount)}</span>
                </div>
              ))}
              <div className="flex items-baseline justify-between px-5 py-2 border-b border-gray-100 hover:bg-gray-50/60">
                <span className="flex items-baseline gap-3 text-sm text-gray-500 italic">
                  <span className="w-10 shrink-0" />Retained Earnings
                </span>
                <span className={cn("font-mono text-sm tabular-nums ml-6 shrink-0", data.retainedEarnings < 0 ? "text-red-600" : "text-gray-800")}>{fmtAmt(data.retainedEarnings)}</span>
              </div>
              <SubtotalBar label="Total Equity" amount={data.totalEquity} />

              <div className="flex items-baseline justify-between px-5 py-3 bg-gray-900">
                <span className="text-xs font-bold uppercase tracking-widest text-gray-300">Total Liabilities &amp; Equity</span>
                <span className="font-mono text-base font-bold text-white tabular-nums ml-6">{fmtAmt(data.totalLiabilitiesAndEquity)}</span>
              </div>
            </div>
          </div>

          {!data.balanced && (
            <p className="text-xs text-red-500">Difference: {fmtAmt(Math.abs(data.totalAssets - data.totalLiabilitiesAndEquity))} — check for unposted journal entries or missing account classifications.</p>
          )}
        </>
      )}
    </div>
  );
}