import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/auth-context";
import { Download, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { generateCashFlow_PDF } from "@/lib/pdf";

interface WC {
  changeAR: number; changeOtherReceivables: number; changeGstInput: number;
  changeInventory: number; changePrepayments: number; changeDeposits: number;
  changeAP: number; changeGstOutput: number; changeAccruals: number;
  changeStaffPayable: number; changeCPF: number;
}
interface CashFlowData {
  period: { from: string; to: string };
  netProfit: number; addBackDepreciation: number;
  workingCapital: WC; totalWorkingCapitalChange: number; netOperating: number;
  investing: { equipment: number; furniture: number; renovation: number };
  netInvesting: number;
  financing: { directorsLoan: number; bankLoan: number; shareCapital: number };
  netFinancing: number;
  netChange: number; openingCash: number; closingCash: number;
}

function fmtAmt(n: number) {
  const abs = Math.abs(n);
  const s = new Intl.NumberFormat("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(abs);
  return n < 0 ? `(${s})` : s;
}

function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-SG", { day: "2-digit", month: "long", year: "numeric" });
}

function CfRow({ label, amount, indent = false }: { label: string; amount: number; indent?: boolean }) {
  if (Math.abs(amount) < 0.005) return null;
  return (
    <div className={cn("flex items-baseline justify-between py-2 border-b border-gray-100 hover:bg-gray-50/60", indent ? "px-10" : "px-5")}>
      <span className="text-sm text-gray-600">{label}</span>
      <span className={cn("font-mono text-sm tabular-nums ml-6 shrink-0", amount < 0 ? "text-red-600" : "text-gray-800")}>{fmtAmt(amount)}</span>
    </div>
  );
}

function GroupLabel({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 px-5 py-2 bg-gray-50 border-b border-gray-100">
      <div className="w-0.5 h-3 bg-gray-300 rounded-full" />
      <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">{label}</span>
    </div>
  );
}

function SectionTotal({ label, amount, dark = false }: { label: string; amount: number; dark?: boolean }) {
  return (
    <div className={cn("flex items-baseline justify-between px-5 py-3", dark ? "bg-[#1a365d]" : "bg-gray-50 border-t border-gray-200")}>
      <span className={cn("text-xs font-bold uppercase tracking-wider", dark ? "text-blue-200" : "text-gray-500")}>{label}</span>
      <span className={cn("font-mono tabular-nums shrink-0 ml-6", dark ? "text-white text-base font-bold" : amount < 0 ? "text-red-600 text-sm font-semibold" : "text-gray-900 text-sm font-semibold")}>
        {fmtAmt(amount)}
      </span>
    </div>
  );
}

function EmptyNote({ text }: { text: string }) {
  return <div className="px-5 py-3 text-xs text-gray-300 italic">{text}</div>;
}

const QUARTERS = [
  { label: "Q1", from: (y: number) => `${y}-01-01`, to: (y: number) => `${y}-03-31` },
  { label: "Q2", from: (y: number) => `${y}-04-01`, to: (y: number) => `${y}-06-30` },
  { label: "Q3", from: (y: number) => `${y}-07-01`, to: (y: number) => `${y}-09-30` },
  { label: "Q4", from: (y: number) => `${y}-10-01`, to: (y: number) => `${y}-12-31` },
];

export default function CashFlowStatement() {
  const { selectedCompany } = useAuth();
  const yr = new Date().getFullYear();
  const [fromDate, setFromDate] = useState(`${yr}-01-01`);
  const [toDate,   setToDate]   = useState(`${yr}-12-31`);
  const [downloading, setDownloading] = useState(false);

  const { data, isLoading } = useQuery<CashFlowData>({
    queryKey: ["cash-flow", fromDate, toDate],
    queryFn: () =>
      fetch(`/api/accounting/cash-flow?from=${fromDate}&to=${toDate}`, { credentials: "include" })
        .then(async r => { if (!r.ok) { const e = await r.json(); throw new Error(e.error || "Failed"); } return r.json(); }),
    enabled: !!fromDate && !!toDate,
  });

  async function handleDownload() {
    if (!data) return;
    setDownloading(true);
    try { await generateCashFlow_PDF(selectedCompany, data); }
    finally { setDownloading(false); }
  }

  const isActive = (f: string, t: string) => fromDate === f && toDate === t;

  return (
    <div className="space-y-6 max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Cash Flow Statement</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Indirect method — reconciles net profit to net cash movement</p>
        </div>
        <Button onClick={handleDownload} disabled={!data || downloading} className="gap-2">
          {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Download PDF
        </Button>
      </div>

      {/* Period selector */}
      <div className="bg-card border rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap gap-6 items-end">
          <div className="space-y-1.5">
            <Label>From</Label>
            <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="w-40" />
          </div>
          <div className="space-y-1.5">
            <Label>To</Label>
            <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="w-40" />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {[yr, yr - 1].map(y => (
            <button key={y} type="button"
              onClick={() => { setFromDate(`${y}-01-01`); setToDate(`${y}-12-31`); }}
              className={cn("px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                isActive(`${y}-01-01`, `${y}-12-31`) ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted")}
            >
              FY {y}
            </button>
          ))}
          {QUARTERS.map(q => (
            <button key={q.label} type="button"
              onClick={() => { setFromDate(q.from(yr)); setToDate(q.to(yr)); }}
              className={cn("px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                isActive(q.from(yr), q.to(yr)) ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted")}
            >
              {q.label} {yr}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : data ? (
        <div className="space-y-4">

          {/* Period stripe */}
          <div className="bg-[#1a365d] text-white rounded-xl px-5 py-4">
            <p className="text-xs text-blue-300 uppercase tracking-wider mb-0.5">Period</p>
            <p className="font-semibold">{fmtDate(data.period.from)} – {fmtDate(data.period.to)}</p>
          </div>

          {/* ── A: Operating ── */}
          <div className="bg-card border rounded-xl overflow-hidden">
            <div className="px-5 py-3 bg-blue-50 dark:bg-blue-950/30 border-b border-blue-100">
              <h2 className="font-semibold text-blue-900 dark:text-blue-200 text-sm uppercase tracking-wider">A · Operating Activities</h2>
            </div>
            <CfRow label="Net Profit for the period" amount={data.netProfit} />
            {data.addBackDepreciation > 0 && (
              <CfRow label="Add back: Depreciation (non-cash expense)" amount={data.addBackDepreciation} />
            )}
            <GroupLabel label="Changes in Working Capital" />
            <CfRow label="Trade Receivables (AR)" amount={data.workingCapital.changeAR} indent />
            <CfRow label="Other Receivables" amount={data.workingCapital.changeOtherReceivables} indent />
            <CfRow label="GST Input Tax Recoverable" amount={data.workingCapital.changeGstInput} indent />
            <CfRow label="Inventory / Stock" amount={data.workingCapital.changeInventory} indent />
            <CfRow label="Prepayments" amount={data.workingCapital.changePrepayments} indent />
            <CfRow label="Deposits Paid" amount={data.workingCapital.changeDeposits} indent />
            <CfRow label="Trade Payables (AP)" amount={data.workingCapital.changeAP} indent />
            <CfRow label="GST Output Tax Payable" amount={data.workingCapital.changeGstOutput} indent />
            <CfRow label="Accrued Liabilities" amount={data.workingCapital.changeAccruals} indent />
            <CfRow label="Staff Salaries Payable" amount={data.workingCapital.changeStaffPayable} indent />
            <CfRow label="CPF Contributions Payable" amount={data.workingCapital.changeCPF} indent />
            <SectionTotal label="Net Cash from Operating Activities" amount={data.netOperating} />
          </div>

          {/* ── B: Investing ── */}
          <div className="bg-card border rounded-xl overflow-hidden">
            <div className="px-5 py-3 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-100">
              <h2 className="font-semibold text-amber-900 dark:text-amber-200 text-sm uppercase tracking-wider">B · Investing Activities</h2>
            </div>
            <CfRow label="Fixed Assets — Equipment (purchases / disposals)" amount={data.investing.equipment} />
            <CfRow label="Fixed Assets — Furniture & Fittings (purchases / disposals)" amount={data.investing.furniture} />
            <CfRow label="Fixed Assets — Office Renovation (additions / write-offs)" amount={data.investing.renovation} />
            {data.investing.equipment === 0 && data.investing.furniture === 0 && data.investing.renovation === 0 && (
              <EmptyNote text="No fixed asset movements in this period" />
            )}
            <SectionTotal label="Net Cash from Investing Activities" amount={data.netInvesting} />
          </div>

          {/* ── C: Financing ── */}
          <div className="bg-card border rounded-xl overflow-hidden">
            <div className="px-5 py-3 bg-emerald-50 dark:bg-emerald-950/30 border-b border-emerald-100">
              <h2 className="font-semibold text-emerald-900 dark:text-emerald-200 text-sm uppercase tracking-wider">C · Financing Activities</h2>
            </div>
            <CfRow label="Director's Loan — drawdown / repayment" amount={data.financing.directorsLoan} />
            <CfRow label="Bank Loan — proceeds / repayment" amount={data.financing.bankLoan} />
            <CfRow label="Share Capital — new injection" amount={data.financing.shareCapital} />
            {data.financing.directorsLoan === 0 && data.financing.bankLoan === 0 && data.financing.shareCapital === 0 && (
              <EmptyNote text="No financing activity in this period" />
            )}
            <SectionTotal label="Net Cash from Financing Activities" amount={data.netFinancing} />
          </div>

          {/* ── Reconciliation ── */}
          <div className="bg-card border rounded-xl overflow-hidden">
            <SectionTotal label="Net Change in Cash & Equivalents (A + B + C)" amount={data.netChange} dark />
            <div className="flex items-baseline justify-between px-5 py-2.5 border-b border-gray-100">
              <span className="text-sm text-gray-600">Opening Cash Balance (start of period)</span>
              <span className="font-mono text-sm tabular-nums ml-6 text-gray-800">{fmtAmt(data.openingCash)}</span>
            </div>
            <div className="flex items-baseline justify-between px-5 py-3 bg-gray-900">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-300">Closing Cash Balance (end of period)</span>
              <span className={cn("font-mono text-base font-bold tabular-nums ml-6", data.closingCash < 0 ? "text-red-400" : "text-white")}>
                SGD {fmtAmt(data.closingCash)}
              </span>
            </div>
          </div>

        </div>
      ) : (
        <div className="text-center py-20 text-muted-foreground text-sm">
          Select a period above to generate the statement.
        </div>
      )}
    </div>
  );
}
