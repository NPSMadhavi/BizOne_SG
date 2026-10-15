import { useEffect, useMemo, useState } from "react";
import { Redirect, useLocation } from "wouter";
import {
  BarChart3,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Receipt,
  RotateCcw,
  ShoppingCart,
  Wallet,
} from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { loadPosSalesFromServer } from "@/lib/pos-sales-api";
import {
  PAYMENT_MODES,
  type PaymentModeKey,
  type PosSale,
  changePct,
  counterOf,
  customerOf,
  eachDay,
  gstOf,
  inRange,
  isoDate,
  isRefund,
  money,
  monthBounds,
  compactAxis,
  outletLabel,
  TREND_COLORS,
  paymentsOf,
  prettyDate,
  prettyTime,
  previousRange,
  saleTotal,
  salespersonOf,
  toIso,
} from "./pos-report-data";

const REPORTS = [
  { id: "overview", href: "/point-of-sale/reports", label: "Reports Overview" },
  { id: "closing", href: "/point-of-sale/reports/closing", label: "Daily Closing Z Report" },
  { id: "collections", href: "/point-of-sale/reports/collections", label: "Payment Collection Details" },
  { id: "salesperson", href: "/point-of-sale/reports/salesperson", label: "Salesperson Daily Report" },
] as const;

type ReportId = (typeof REPORTS)[number]["id"];

function reportIdFromPath(path: string): ReportId {
  if (path.includes("/closing")) return "closing";
  if (path.includes("/collections")) return "collections";
  if (path.includes("/salesperson")) return "salesperson";
  return "overview";
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows
    .map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function closingKey(day: string, outlet: string, counter: string) {
  return `bizone-pos-closing:${day}:${outlet}:${counter}`;
}

type ClosingDraft = {
  openingFloat: number;
  actualCash: number;
  status: "open" | "draft" | "verified" | "closed";
  closedBy?: string;
  closedAt?: string;
};

function readClosing(day: string, outlet: string, counter: string): ClosingDraft {
  try {
    const raw = localStorage.getItem(closingKey(day, outlet, counter));
    if (!raw) return { openingFloat: 0, actualCash: 0, status: "open" };
    const parsed = JSON.parse(raw) as ClosingDraft;
    return {
      openingFloat: Number(parsed.openingFloat) || 0,
      actualCash: Number(parsed.actualCash) || 0,
      status: parsed.status || "open",
      closedBy: parsed.closedBy,
      closedAt: parsed.closedAt,
    };
  } catch {
    return { openingFloat: 0, actualCash: 0, status: "open" };
  }
}

export default function PosSalesReportPage() {
  const { user, isAdmin } = useAuth();
  const { toast } = useToast();
  const [location, setLocation] = useLocation();
  const report = reportIdFromPath(location);
  const bounds = monthBounds();
  const today = toIso(new Date());
  const [sales, setSales] = useState<PosSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [from, setFrom] = useState(bounds.from);
  const [to, setTo] = useState(bounds.to);
  const [day, setDay] = useState(today);
  const outlet = "all";
  const [counter, setCounter] = useState("all");
  const [mode, setMode] = useState<PaymentModeKey>("Cash");
  const [page, setPage] = useState(1);
  const [closing, setClosing] = useState<ClosingDraft>({ openingFloat: 0, actualCash: 0, status: "open" });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadPosSalesFromServer(undefined, "all")
      .then((rows) => {
        if (!cancelled) setSales(rows as PosSale[]);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message || "Could not load the report");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    setPage(1);
  }, [report, from, to, day, outlet, counter, mode]);

  useEffect(() => {
    setClosing(readClosing(day, outlet, counter));
  }, [day, outlet, counter]);

  const counters = useMemo(() => {
    const values = new Set(sales.map((sale) => counterOf(sale)));
    if (!values.size) values.add("Counter 1");
    return ["all", ...Array.from(values)];
  }, [sales]);

  const scoped = useMemo(() => {
    return sales.filter((sale) => {
      if (outlet !== "all" && outletLabel(sale.channel) !== outlet) return false;
      if (counter !== "all" && counterOf(sale) !== counter) return false;
      return true;
    });
  }, [sales, outlet, counter]);

  const ranged = useMemo(
    () => scoped.filter((sale) => inRange(sale, report === "overview" || report === "collections" ? from : day, report === "overview" || report === "collections" ? to : day)),
    [scoped, from, to, day, report],
  );

  const prior = useMemo(() => {
    const range = previousRange(from, to);
    return scoped.filter((sale) => inRange(sale, range.from, range.to));
  }, [scoped, from, to]);

  if (isAdmin) return <Redirect to="/inventory/sales-person-wise-report" />;

  function openReport(href: string) {
    setLocation(href);
  }

  function saveClosing(next: ClosingDraft, message: string) {
    localStorage.setItem(closingKey(day, outlet, counter), JSON.stringify(next));
    setClosing(next);
    toast({ title: message });
  }

  const actor = String((user as { fullName?: string | null } | null)?.fullName || user?.username || "User");

  return (
    <div className="space-y-4 text-[#0F172A]">
      <ReportHeader
        report={report}
        from={from}
        to={to}
        day={day}
        counter={counter}
        counters={counters}
        onReport={openReport}
        onFrom={setFrom}
        onTo={setTo}
        onDay={setDay}
        onCounter={setCounter}
        onExport={() => exportCurrent(report, ranged, mode)}
        onPdf={() => window.print()}
      />

      {error ? <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

      {report === "overview" && (
        <Overview
          current={ranged}
          previous={prior}
          from={from}
          to={to}
          loading={loading}
        />
      )}
      {report === "closing" && (
        <ClosingReport
          sales={ranged}
          draft={closing}
          loading={loading}
          onDraft={(patch) => setClosing((current) => ({ ...current, ...patch }))}
          onSave={() => saveClosing({ ...closing, status: closing.status === "closed" ? "closed" : "draft" }, "Draft saved")}
          onVerify={() => saveClosing({ ...closing, status: "verified" }, "Collection verified")}
          onClose={() =>
            saveClosing(
              { ...closing, status: "closed", closedBy: actor, closedAt: new Date().toISOString() },
              "Day closed",
            )
          }
        />
      )}
      {report === "collections" && (
        <Collections sales={ranged} mode={mode} page={page} loading={loading} onMode={setMode} onPage={setPage} />
      )}
      {report === "salesperson" && <SalespersonReport sales={ranged} page={page} loading={loading} onPage={setPage} />}
    </div>
  );
}

function exportCurrent(report: ReportId, sales: PosSale[], mode: PaymentModeKey) {
  if (report === "salesperson") {
    const groups = groupSalespeople(sales);
    downloadCsv("salesperson-daily-report.csv", [
      ["Salesperson", "Total Sales", "No. of Bills", "Avg. Sale", "Collection"],
      ...groups.map((row) => [row.name, row.sales.toFixed(2), String(row.bills), row.avg.toFixed(2), row.collection.toFixed(2)]),
    ]);
    return;
  }
  if (report === "collections") {
    const rows = collectionRows(sales, mode);
    downloadCsv("payment-collection.csv", [
      ["Ref No.", "Bill No.", "Salesperson", "Customer", "Counter", "Time", "Amount", "Status"],
      ...rows.map((row) => [row.ref, row.bill, row.salesperson, row.customer, row.counter, row.time, row.amount.toFixed(2), row.status]),
    ]);
    return;
  }
  downloadCsv("pos-report.csv", [
    ["POS No.", "Date", "Outlet", "Salesperson", "Total", "Tax", "Status"],
    ...sales.map((sale) => [
      sale.posNumber || sale.id,
      isoDate(sale.createdAt),
      outletLabel(sale.channel),
      salespersonOf(sale),
      saleTotal(sale).toFixed(2),
      gstOf(sale).gst.toFixed(2),
      isRefund(sale) ? "Refund" : "Paid",
    ]),
  ]);
}

function ReportHeader({
  report,
  from,
  to,
  day,
  counter,
  counters,
  onReport,
  onFrom,
  onTo,
  onDay,
  onCounter,
  onExport,
  onPdf,
}: {
  report: ReportId;
  from: string;
  to: string;
  day: string;
  counter: string;
  counters: string[];
  onReport: (href: string) => void;
  onFrom: (value: string) => void;
  onTo: (value: string) => void;
  onDay: (value: string) => void;
  onCounter: (value: string) => void;
  onExport: () => void;
  onPdf: () => void;
}) {
  const current = REPORTS.find((item) => item.id === report) || REPORTS[0];
  const singleDay = report === "closing" || report === "salesperson";
  const titles = {
    overview: "Reports Overview",
    closing: "Daily Closing Z Report",
    collections: "Payment Collection Details",
    salesperson: "Salesperson Daily Report",
  } as const;

  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <h1 className="text-[28px] font-bold leading-tight tracking-tight text-[#3B82F6]">{titles[report]}</h1>
      <div className="flex flex-wrap items-center gap-2">
        <select
          id="pos-report-switch"
          value={current.href}
          onChange={(event) => onReport(event.target.value)}
          aria-label="Report"
          className="h-10 w-[176px] rounded-lg border border-[#BFDBFE] bg-[#EFF6FF] px-2.5 text-sm font-medium text-[#111827] shadow-sm outline-none"
        >
          {REPORTS.map((item) => (
            <option key={item.id} value={item.href}>{item.label}</option>
          ))}
        </select>
        {singleDay ? (
          <input
            type="date"
            value={day}
            onChange={(event) => onDay(event.target.value)}
            className="h-10 rounded-lg border border-[#E5E7EB] bg-white px-3 text-sm shadow-sm"
            aria-label="Report date"
          />
        ) : (
          <div className="flex h-10 items-center gap-2 rounded-lg border border-[#E5E7EB] bg-white px-3 text-sm shadow-sm">
            <input type="date" value={from} onChange={(event) => onFrom(event.target.value)} aria-label="From date" className="bg-transparent outline-none" />
            <span className="text-[#9CA3AF]">–</span>
            <input type="date" value={to} onChange={(event) => onTo(event.target.value)} aria-label="To date" className="bg-transparent outline-none" />
          </div>
        )}
        {report !== "salesperson" && (
          <select value={counter} onChange={(event) => onCounter(event.target.value)} aria-label="Counter" className="h-10 rounded-lg border border-[#E5E7EB] bg-white px-3 text-sm shadow-sm">
            {counters.map((value) => (
              <option key={value} value={value}>{value === "all" ? "All Counters" : value}</option>
            ))}
          </select>
        )}
        <button type="button" onClick={onExport} className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#BFDBFE] bg-white px-3 text-sm font-medium text-[#2563EB] shadow-sm">
          <Download className="h-4 w-4" /> Export
        </button>
        {(report === "closing" || report === "collections") && (
          <button type="button" onClick={onPdf} className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#2563EB] px-3 text-sm font-medium text-white shadow-sm">
            <FileText className="h-4 w-4" /> PDF
          </button>
        )}
      </div>
    </div>
  );
}

function sumSales(rows: PosSale[], refunds = false) {
  return rows.reduce((sum, sale) => {
    const refund = isRefund(sale);
    if (refunds ? !refund : refund) return sum;
    return sum + saleTotal(sale);
  }, 0);
}

function Overview({
  current,
  previous,
  from,
  to,
  loading,
}: {
  current: PosSale[];
  previous: PosSale[];
  from: string;
  to: string;
  loading: boolean;
}) {
  const paid = current.filter((sale) => !isRefund(sale));
  const refunds = current.filter((sale) => isRefund(sale));
  const total = sumSales(current);
  const refundTotal = sumSales(current, true);
  const bills = paid.length;
  const avg = bills ? total / bills : 0;
  const prevTotal = sumSales(previous);
  const prevBills = previous.filter((sale) => !isRefund(sale)).length;
  const prevAvg = prevBills ? prevTotal / prevBills : 0;
  const prevRefunds = sumSales(previous, true);
  const modes = PAYMENT_MODES.map((item) => ({
    ...item,
    amount: paid.reduce((sum, sale) => sum + paymentsOf(sale).filter((pay) => pay.mode === item.key).reduce((inner, pay) => inner + pay.amount, 0), 0),
  }));
  const modeTotal = modes.reduce((sum, item) => sum + item.amount, 0) || 1;
  const todayIso = toIso(new Date());
  const days = eachDay(from, to).filter((date) => date <= todayIso);
  const points = days.map((date) => ({
    label: prettyDate(date).slice(0, 6),
    sales: paid.filter((sale) => isoDate(sale.createdAt) === date).reduce((sum, sale) => sum + saleTotal(sale), 0),
    refunds: refunds.filter((sale) => isoDate(sale.createdAt) === date).reduce((sum, sale) => sum + saleTotal(sale), 0),
  }));
  const gst = paid.reduce(
    (sum, sale) => {
      const part = gstOf(sale);
      return { taxable: sum.taxable + part.taxable, gst: sum.gst + part.gst, total: sum.total + part.total };
    },
    { taxable: 0, gst: 0, total: 0 },
  );
  const gstRate = gst.taxable > 0 ? Math.round((gst.gst / gst.taxable) * 100) : 9;

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric icon={ShoppingCart} tint="bg-[#E8F8EF] text-[#22C55E]" label="Total Sales" value={money(total, 0)} change={changePct(total, prevTotal)} />
        <Metric icon={Receipt} tint="bg-[#E8F1FF] text-[#3B82F6]" label="Total Transactions" value={bills.toLocaleString("en-SG")} change={changePct(bills, prevBills)} />
        <Metric icon={BarChart3} tint="bg-[#F3E8FF] text-[#8B5CF6]" label="Avg. Sales per Bill" value={money(avg)} change={changePct(avg, prevAvg)} />
        <Metric icon={RotateCcw} tint="bg-[#FFF4E8] text-[#F97316]" label="Total Refunds" value={money(refundTotal, 0)} change={changePct(refundTotal, prevRefunds)} invert />
      </div>

      <div className="grid gap-4 xl:grid-cols-5">
        <section className="flex min-h-[420px] flex-col rounded-2xl border border-[#E8EEF5] bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] xl:col-span-3">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-[15px] font-semibold text-[#2563EB]">Sales Trend</h2>
            <div className="flex items-center gap-4 text-xs text-[#64748B]">
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: TREND_COLORS.sales }} />Sales</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: TREND_COLORS.refunds }} />Refunds</span>
            </div>
          </div>
          <BarTrend points={points} loading={loading} />
        </section>
        <section className="flex min-h-[420px] flex-col rounded-2xl border border-[#E8EEF5] bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] xl:col-span-2">
          <h2 className="mb-4 text-[15px] font-semibold text-[#2563EB]">Sales by Payment Mode</h2>
          <div className="flex flex-1 flex-wrap items-center gap-5">
            <Donut parts={modes.map((item) => ({ value: item.amount, color: item.color }))} center={money(total, 0)} size={268} />
            <ul className="min-w-[190px] flex-1 space-y-3 text-sm">
              {modes.map((item) => (
                <li key={item.key} className="grid grid-cols-[1fr_52px_auto] items-center gap-2">
                  <span className="flex items-center gap-2 text-[#334155]">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: item.color }} />
                    {item.key}
                  </span>
                  <span className="text-right text-[#64748B]">{((item.amount / modeTotal) * 100).toFixed(1)}%</span>
                  <span className="text-right font-semibold text-[#0F172A]">{money(item.amount, 0)}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>

      <section className="flex flex-wrap items-center rounded-2xl border border-[#D7E8F8] bg-[#EAF4FF] px-5 py-4">
        <div className="flex min-w-[250px] items-center gap-3 pr-6">
          <span className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-[#3B82F6] bg-white text-[#3B82F6]"><FileText className="h-5 w-5" /></span>
          <div>
            <h2 className="text-[15px] font-semibold text-[#2563EB]">GST Summary</h2>
            <p className="text-xs text-[#64748B]">GST Registered (Standard Rated Sales)</p>
          </div>
        </div>
        <div className="grid min-w-[280px] flex-1 grid-cols-3">
          <div className="border-l border-[#D7E8F8] px-6">
            <p className="text-xs text-[#64748B]">Taxable Sales</p>
            <p className="mt-1 text-xl font-bold text-[#0F172A]">{money(gst.taxable, 0)}</p>
          </div>
          <div className="border-l border-[#D7E8F8] px-6">
            <p className="text-xs text-[#64748B]">GST ({gstRate}%)</p>
            <p className="mt-1 text-xl font-bold text-[#0F172A]">{money(gst.gst, 0)}</p>
          </div>
          <div className="border-l border-[#D7E8F8] px-6">
            <p className="text-xs text-[#64748B]">Total Sales (Incl. GST)</p>
            <p className="mt-1 text-xl font-bold text-[#2563EB]">{money(gst.total, 0)}</p>
          </div>
        </div>
      </section>
      {loading ? <p className="text-sm text-[#64748B]">Loading sales…</p> : null}
    </>
  );
}

function ClosingReport({
  sales,
  draft,
  loading,
  onDraft,
  onSave,
  onVerify,
  onClose,
}: {
  sales: PosSale[];
  draft: ClosingDraft;
  loading: boolean;
  onDraft: (patch: Partial<ClosingDraft>) => void;
  onSave: () => void;
  onVerify: () => void;
  onClose: () => void;
}) {
  const paid = sales.filter((sale) => !isRefund(sale));
  const amounts = Object.fromEntries(PAYMENT_MODES.map((item) => [item.key, 0])) as Record<PaymentModeKey, number>;
  for (const sale of paid) {
    for (const pay of paymentsOf(sale)) amounts[pay.mode] += pay.amount;
  }
  const refunds = sales.filter(isRefund).reduce((sum, sale) => sum + saleTotal(sale), 0);
  const collection = Object.values(amounts).reduce((sum, value) => sum + value, 0);
  const expected = draft.openingFloat + amounts.Cash - refunds;
  const variance = draft.actualCash - expected;
  const gst = paid.reduce(
    (sum, sale) => {
      const part = gstOf(sale);
      return { taxable: sum.taxable + part.taxable, gst: sum.gst + part.gst, total: sum.total + part.total };
    },
    { taxable: 0, gst: 0, total: 0 },
  );
  const collectionLines = [
    ["+ Cash Sales", amounts.Cash],
    ["+ PayNow", amounts.PayNow],
    ["+ NETS", amounts.NETS],
    ["+ Visa / Mastercard", amounts.Card],
    ["+ Gift Voucher Redeemed", amounts["Gift Voucher"]],
  ] as const;
  const closed = draft.status === "closed";
  const modeTotal = collection || 1;
  const gstRate = gst.taxable > 0 ? Math.round((gst.gst / gst.taxable) * 100) : 9;
  const varianceText = variance < 0 ? `- ${money(Math.abs(variance))}` : money(variance);

  return (
    <div className="space-y-4">
      <div className="grid items-stretch gap-4 xl:grid-cols-2">
        <section className="h-full rounded-2xl border border-[#E8EEF5] bg-white px-5 py-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <h2 className="mb-2 text-lg font-semibold text-[#2563EB]">Collection Summary</h2>
          <div className="text-sm">
            <label className="flex items-center justify-between gap-3 border-b border-[#EEF2F6] py-3.5">
              <span className="text-[#64748B]">Opening Float (Cash)</span>
              <CashField value={draft.openingFloat} label="Opening float" onChange={(openingFloat) => onDraft({ openingFloat })} />
            </label>
            {collectionLines.map(([label, value]) => (
              <div key={label} className="flex items-center justify-between border-b border-[#EEF2F6] py-3.5">
                <span className="text-[#64748B]">{label}</span>
                <span className="font-medium text-[#0F172A]">{money(value)}</span>
              </div>
            ))}
            <div className="-mx-2 flex items-center justify-between rounded-lg bg-[#EAF4FF] px-2 py-3.5 font-semibold text-[#0F172A]">
              <span>Total Sales Collection</span>
              <span>{money(collection)}</span>
            </div>
            <div className="flex items-center justify-between border-b border-[#EEF2F6] py-3.5">
              <span className="text-[#64748B]">- Cash Expenses / Refunds</span>
              <span className="font-medium text-[#0F172A]">{money(refunds)}</span>
            </div>
            <div className="flex items-center justify-between border-b border-[#EEF2F6] py-3.5 font-semibold text-[#0F172A]">
              <span>Expected Closing Cash</span>
              <span>{money(expected)}</span>
            </div>
            <label className="flex items-center justify-between gap-3 border-b border-[#EEF2F6] py-3.5">
              <span className="text-[#64748B]">Actual Cash Counted</span>
              <CashField value={draft.actualCash} label="Actual cash counted" onChange={(actualCash) => onDraft({ actualCash })} />
            </label>
            <div className="flex items-center justify-between py-3.5 font-semibold">
              <span className="text-[#0F172A]">Cash Variance</span>
              <span className="text-[#EF4444]">{varianceText}</span>
            </div>
          </div>
        </section>

        <div className="flex h-full flex-col gap-4">
          <section className="flex flex-1 flex-col rounded-2xl border border-[#E8EEF5] bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <h2 className="mb-4 text-lg font-semibold text-[#0F172A]">Payment Mode Breakdown</h2>
            <div className="flex flex-1 flex-wrap items-center gap-6">
              <Donut parts={PAYMENT_MODES.map((item) => ({ value: amounts[item.key], color: item.color }))} center={money(collection, 0)} caption="Total Collection" size={320} />
              <ul className="min-w-[210px] flex-1 space-y-3 text-sm">
                {PAYMENT_MODES.map((item) => (
                  <li key={item.key} className="grid grid-cols-[1fr_52px_auto] items-center gap-3">
                    <span className="flex items-center gap-2 text-[#334155]">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: item.color }} />
                      {item.key}
                    </span>
                    <span className="text-right text-[#64748B]">{((amounts[item.key] / modeTotal) * 100).toFixed(1)}%</span>
                    <span className="text-right font-semibold text-[#0F172A]">{money(amounts[item.key], 0)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section className="rounded-2xl border border-[#D7E8F8] bg-[#EAF4FF] px-5 py-4">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-[#3B82F6] bg-white text-[#3B82F6]">
                <FileText className="h-4 w-4" />
              </span>
              <div>
                <h2 className="text-[15px] font-semibold text-[#2563EB]">GST Summary</h2>
                <p className="text-xs text-[#64748B]">GST ({gstRate}%) on Standard Rated Sales</p>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-3 gap-3">
              <div>
                <p className="text-xs text-[#64748B]">Taxable Sales</p>
                <p className="mt-1 text-xl font-bold text-[#0F172A]">{money(gst.taxable, 0)}</p>
              </div>
              <div>
                <p className="text-xs text-[#64748B]">GST Amount</p>
                <p className="mt-1 text-xl font-bold text-[#0F172A]">{money(gst.gst, 0)}</p>
              </div>
              <div>
                <p className="text-xs text-[#64748B]">Total Sales (Incl. GST)</p>
                <p className="mt-1 text-xl font-bold text-[#2563EB]">{money(gst.total, 0)}</p>
              </div>
            </div>
          </section>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className={`flex min-w-[280px] items-center gap-3 rounded-xl border px-4 py-3 ${closed ? "border-[#BBF7D0] bg-[#F0FDF4]" : "border-[#E2E8F0] bg-white"}`}>
          <span className={`flex h-8 w-8 items-center justify-center rounded-full text-white ${closed ? "bg-[#22C55E]" : "bg-[#94A3B8]"}`}>
            <Check className="h-4 w-4" />
          </span>
          <div>
            <p className={`text-sm font-semibold ${closed ? "text-[#16A34A]" : "text-[#475569]"}`}>{closed ? "Day Closed" : "Day Open"}</p>
            <p className="text-xs text-[#64748B]">
              {closed
                ? `Closed by ${draft.closedBy || "User"}${draft.closedAt ? ` · ${prettyDate(draft.closedAt.slice(0, 10))} ${prettyTime(draft.closedAt)}` : ""}`
                : "Count the cash, then close the day."}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onSave} className="h-10 rounded-lg border border-[#E2E8F0] bg-white px-4 text-sm font-medium text-[#334155]">Save Draft</button>
          <button type="button" onClick={onVerify} className="h-10 rounded-lg border border-[#93C5FD] bg-white px-4 text-sm font-medium text-[#2563EB]">Verify Collection</button>
          <button type="button" onClick={() => window.print()} className="h-10 rounded-lg border border-[#93C5FD] bg-white px-4 text-sm font-medium text-[#2563EB]">Print Z Report</button>
          <button type="button" onClick={onClose} disabled={closed} className="h-10 rounded-lg bg-[#22C55E] px-4 text-sm font-semibold text-white disabled:opacity-60">Close Day</button>
        </div>
      </div>
      {loading ? <p className="text-sm text-[#64748B]">Loading sales…</p> : null}
    </div>
  );
}

type CollectionRow = {
  ref: string;
  bill: string;
  salesperson: string;
  customer: string;
  counter: string;
  time: string;
  amount: number;
  status: string;
};

function collectionRows(sales: PosSale[], mode: PaymentModeKey): CollectionRow[] {
  const prefix = mode === "Gift Voucher" ? "GIFT" : mode.slice(0, 4).toUpperCase();
  return sales
    .filter((sale) => !isRefund(sale))
    .flatMap((sale) =>
      paymentsOf(sale)
        .filter((pay) => pay.mode === mode)
        .map((pay, index) => ({
          ref: `${prefix}-${String(sale.posNumber || sale.id).replace(/\D/g, "").slice(-6) || index + 1}`,
          bill: sale.posNumber || "—",
          salesperson: salespersonOf(sale),
          customer: customerOf(sale),
          counter: counterOf(sale),
          time: prettyTime(sale.createdAt),
          amount: pay.amount,
          status: "Settled",
        })),
    );
}

function Collections({
  sales,
  mode,
  page,
  loading,
  onMode,
  onPage,
}: {
  sales: PosSale[];
  mode: PaymentModeKey;
  page: number;
  loading: boolean;
  onMode: (mode: PaymentModeKey) => void;
  onPage: (page: number) => void;
}) {
  const totals = Object.fromEntries(PAYMENT_MODES.map((item) => [item.key, 0])) as Record<PaymentModeKey, number>;
  for (const sale of sales.filter((row) => !isRefund(row))) {
    for (const pay of paymentsOf(sale)) totals[pay.mode] += pay.amount;
  }
  const grand = Object.values(totals).reduce((sum, value) => sum + value, 0) || 1;
  const rows = collectionRows(sales, mode);
  const pageSize = 5;
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, pages);
  const slice = rows.slice((safePage - 1) * pageSize, safePage * pageSize);
  const methods = [
    { key: "Cash" as const, label: "Cash" },
    { key: "NETS" as const, label: "NETS" },
    { key: "Card" as const, label: "Credit Card" },
    { key: "PayNow" as const, label: "PayNow" },
    { key: "Gift Voucher" as const, label: "Voucher" },
  ];
  const selected = methods.find((item) => item.key === mode) || methods[0];
  const selectedMode = PAYMENT_MODES.find((item) => item.key === selected.key) || PAYMENT_MODES[0];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {methods.map((item) => {
          const active = item.key === mode;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onMode(item.key)}
              className={`h-10 rounded-lg px-5 text-sm font-semibold ${active ? "bg-[#2563EB] text-white" : "border border-[#DBEAFE] bg-[#F8FBFF] text-[#2563EB]"}`}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
        {methods.map((item) => {
          const active = item.key === mode;
          const tone = PAYMENT_MODES.find((modeItem) => modeItem.key === item.key) || PAYMENT_MODES[0];
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onMode(item.key)}
              className="rounded-2xl border bg-white p-4 text-left shadow-sm"
              style={{ borderColor: active ? tone.color : "#E5E7EB", background: active ? tone.soft : "#fff" }}
            >
              <p className="text-sm font-medium" style={{ color: tone.color }}>{item.label} Collection</p>
              <p className="mt-2 text-xl font-bold">{money(totals[item.key], 0)}</p>
              <p className="mt-1 text-xs text-[#6B7280]">{((totals[item.key] / grand) * 100).toFixed(1)}% of total</p>
            </button>
          );
        })}
      </div>
      <section className="overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-sm">
        <div className="border-b px-5 py-4">
          <h2 className="text-base font-semibold" style={{ color: selectedMode.color }}>{selected.label} Transactions</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-[#F9FAFB] text-left text-xs uppercase text-[#6B7280]">
                {["S.No", "Ref No.", "Bill No.", "Salesperson", "Customer Name", "Counter", "Time", "Amount (S$)", "Status"].map((heading) => (
                  <th key={heading} className="px-4 py-3 font-medium">{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-[#6B7280]">Loading transactions…</td></tr>
              ) : slice.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-[#6B7280]">No {selected.label.toLowerCase()} transactions in the selected dates.</td></tr>
              ) : slice.map((row, index) => (
                <tr key={`${row.ref}-${index}`} className="border-b">
                  <td className="px-4 py-3">{(safePage - 1) * pageSize + index + 1}</td>
                  <td className="px-4 py-3 font-medium">{row.ref}</td>
                  <td className="px-4 py-3">{row.bill}</td>
                  <td className="px-4 py-3">{row.salesperson}</td>
                  <td className="px-4 py-3">{row.customer}</td>
                  <td className="px-4 py-3">{row.counter}</td>
                  <td className="px-4 py-3">{row.time}</td>
                  <td className="px-4 py-3 font-medium">{row.amount.toLocaleString("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className="px-4 py-3"><span className="rounded-full bg-[#ECFDF3] px-2 py-1 text-xs font-medium text-[#16A34A]">{row.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager page={safePage} pages={pages} total={rows.length} pageSize={pageSize} onPage={onPage} />
      </section>
    </div>
  );
}

function groupSalespeople(sales: PosSale[]) {
  const map = new Map<string, { name: string; sales: number; bills: number; collection: number }>();
  for (const sale of sales) {
    if (isRefund(sale)) continue;
    const name = salespersonOf(sale);
    const current = map.get(name) || { name, sales: 0, bills: 0, collection: 0 };
    const total = saleTotal(sale);
    current.sales += total;
    current.bills += 1;
    current.collection += paymentsOf(sale).reduce((sum, pay) => sum + pay.amount, 0);
    map.set(name, current);
  }
  return Array.from(map.values())
    .map((row) => ({ ...row, avg: row.bills ? row.sales / row.bills : 0 }))
    .sort((a, b) => b.sales - a.sales);
}

function SalespersonReport({
  sales,
  page,
  loading,
  onPage,
}: {
  sales: PosSale[];
  page: number;
  loading: boolean;
  onPage: (page: number) => void;
}) {
  const rows = groupSalespeople(sales);
  const totalSales = rows.reduce((sum, row) => sum + row.sales, 0);
  const bills = rows.reduce((sum, row) => sum + row.bills, 0);
  const collection = rows.reduce((sum, row) => sum + row.collection, 0);
  const pageSize = 5;
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, pages);
  const slice = rows.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Metric icon={ShoppingCart} tint="bg-[#ECFDF3] text-[#16A34A]" label="Total Sales" value={money(totalSales, 0)} />
        <Metric icon={Receipt} tint="bg-[#E8F1FF] text-[#3B82F6]" label="Total Transactions" value={bills.toLocaleString("en-SG")} />
        <Metric icon={BarChart3} tint="bg-[#F5F3FF] text-[#7C3AED]" label="Avg. Sales per Ticket" value={money(bills ? totalSales / bills : 0)} />
        <Metric icon={Wallet} tint="bg-[#FFF7ED] text-[#EA580C]" label="Total Collection" value={money(collection, 0)} />
      </div>
      <section className="overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-[#F9FAFB] text-left text-xs uppercase text-[#6B7280]">
                {["S.No", "Salesperson", "Total Sales", "No. of Bills", "Avg. Sale", "Collection"].map((heading) => (
                  <th key={heading} className="px-4 py-3 font-medium">{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-[#6B7280]">Loading report…</td></tr>
              ) : slice.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-[#6B7280]">No Point of Sale sales for the selected date.</td></tr>
              ) : slice.map((row, index) => (
                <tr key={row.name} className="border-b">
                  <td className="px-4 py-3">{(safePage - 1) * pageSize + index + 1}</td>
                  <td className="px-4 py-3 font-medium">{row.name}</td>
                  <td className="px-4 py-3">{money(row.sales)}</td>
                  <td className="px-4 py-3">{row.bills}</td>
                  <td className="px-4 py-3">{money(row.avg)}</td>
                  <td className="px-4 py-3 font-medium">{money(row.collection)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager page={safePage} pages={pages} total={rows.length} pageSize={pageSize} onPage={onPage} />
      </section>
    </div>
  );
}

function Metric({
  icon: Icon,
  tint,
  label,
  value,
  change,
  invert = false,
}: {
  icon: typeof ShoppingCart;
  tint: string;
  label: string;
  value: string;
  change?: number;
  invert?: boolean;
}) {
  const up = (change || 0) >= 0;
  const good = invert ? !up : up;
  return (
    <div className="rounded-2xl border border-[#E8EEF5] bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${tint}`}><Icon className="h-5 w-5" /></span>
      <p className="mt-4 text-sm text-[#64748B]">{label}</p>
      <p className="mt-1 text-[26px] font-bold leading-none tracking-tight text-[#0F172A]">{value}</p>
      {change != null && (
        <p className="mt-2 text-xs">
          <span className={`font-semibold ${good ? "text-[#16A34A]" : "text-[#EF4444]"}`}>
            {up ? "↑" : "↓"} {Math.abs(change).toFixed(1)}%
          </span>
          <span className="ml-1 text-[#94A3B8]">vs. last month</span>
        </p>
      )}
    </div>
  );
}

function CashField({ value, onChange, label }: { value: number; onChange: (value: number) => void; label: string }) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState("");
  const shown = focused
    ? draft
    : value.toLocaleString("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (
    <span className="inline-flex items-center whitespace-nowrap font-medium text-[#0F172A]">
      <span>S$</span>
      <input
        type="text"
        inputMode="decimal"
        aria-label={label}
        value={shown}
        onFocus={() => {
          setFocused(true);
          setDraft(value ? String(value) : "0");
        }}
        onBlur={() => {
          const next = Number(String(draft).replace(/,/g, ""));
          onChange(Number.isFinite(next) ? next : 0);
          setFocused(false);
        }}
        onChange={(event) => setDraft(event.target.value.replace(/[^\d.]/g, ""))}
        className="ml-1 bg-transparent p-0 text-left font-medium outline-none"
        style={{ width: `${Math.max(shown.length, 4)}ch` }}
      />
    </span>
  );
}

function Donut({ parts, center, caption = "Total Sales", size = 168 }: { parts: { value: number; color: string }[]; center: string; caption?: string; size?: number }) {
  const total = parts.reduce((sum, part) => sum + part.value, 0);
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const slices = parts.filter((part) => part.value > 0).map((part) => {
    const length = total > 0 ? (part.value / total) * circumference : 0;
    const slice = { ...part, length, offset };
    offset += length;
    return slice;
  });
  const large = size >= 220;
  return (
    <div className="relative shrink-0" style={{ height: size, width: size }}>
      <svg viewBox="0 0 160 160" className="h-full w-full">
        <circle cx="80" cy="80" r={radius} fill="none" stroke="#EEF2F7" strokeWidth="16" />
        {slices.map((slice) => (
          <circle
            key={slice.color}
            cx="80"
            cy="80"
            r={radius}
            fill="none"
            stroke={slice.color}
            strokeWidth="16"
            strokeDasharray={`${slice.length} ${circumference - slice.length}`}
            strokeDashoffset={-slice.offset}
            transform="rotate(-90 80 80)"
          />
        ))}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center px-10 text-center">
        <span className={`font-bold leading-tight text-[#0F172A] ${large ? "text-[22px]" : "text-[15px]"}`}>{center}</span>
        <span className={`mt-0.5 text-[#94A3B8] ${large ? "text-sm" : "text-[11px]"}`}>{caption}</span>
      </div>
    </div>
  );
}

function niceMax(value: number) {
  if (value <= 0) return 4;
  const power = 10 ** Math.floor(Math.log10(value));
  const step = value / power;
  const nice = step <= 1 ? 1 : step <= 2 ? 2 : step <= 4 ? 4 : step <= 5 ? 5 : 10;
  return nice * power;
}

function BarTrend({ points, loading }: { points: { label: string; sales: number; refunds: number }[]; loading: boolean }) {
  const max = niceMax(Math.max(...points.map((point) => Math.max(point.sales, point.refunds)), 0));
  const ticks = [max, max * 0.75, max * 0.5, max * 0.25, 0];
  return (
    <div className="mt-2 flex flex-1 flex-col">
      <div className="flex h-[300px] gap-3">
        <div className="flex h-[260px] flex-col justify-between text-[11px] text-[#94A3B8]">
          {ticks.map((tick) => <span key={tick}>{compactAxis(tick)}</span>)}
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="relative h-[260px]">
            {ticks.map((tick) => (
              <div key={tick} className="absolute inset-x-0 border-t border-[#EEF2F6]" style={{ top: `${((max - tick) / max) * 100}%` }} />
            ))}
            <div className="absolute inset-0 flex items-end gap-2 px-1">
              {points.map((point, index) => (
                <div key={`${point.label}-${index}`} className="flex h-full flex-1 items-end justify-center gap-[2px]" title={`${point.label}: sales ${money(point.sales)}, refunds ${money(point.refunds)}`}>
                  <div className="w-[7px] rounded-t-[2px]" style={{ height: `${point.sales > 0 ? Math.max(3, (point.sales / max) * 100) : 0}%`, background: TREND_COLORS.sales }} />
                  <div className="w-[7px] rounded-t-[2px]" style={{ height: `${point.refunds > 0 ? Math.max(3, (point.refunds / max) * 100) : 0}%`, background: TREND_COLORS.refunds }} />
                </div>
              ))}
            </div>
          </div>
          <div className="mt-2 flex gap-2 px-1 text-[10px] text-[#94A3B8]">
            {points.map((point, index) => (
              <span key={`${point.label}-l-${index}`} className="flex-1 truncate text-center">{index % 2 === 0 ? point.label : ""}</span>
            ))}
          </div>
        </div>
      </div>
      {!loading && points.every((point) => point.sales === 0 && point.refunds === 0) ? (
        <p className="mt-6 text-center text-sm text-[#94A3B8]">No sales in the selected dates.</p>
      ) : null}
    </div>
  );
}

function Pager({
  page,
  pages,
  total,
  pageSize,
  onPage,
}: {
  page: number;
  pages: number;
  total: number;
  pageSize: number;
  onPage: (page: number) => void;
}) {
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);
  return (
    <div className="flex items-center justify-between px-4 py-3 text-sm text-[#6B7280]">
      <span>Showing {start} to {end} of {total} entries</span>
      <div className="flex items-center gap-1">
        <button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)} className="flex h-8 w-8 items-center justify-center rounded-lg border disabled:opacity-40">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="flex h-8 min-w-8 items-center justify-center rounded-lg bg-[#2563EB] px-2 text-white">{page}</span>
        <button type="button" aria-label="Next page" disabled={page >= pages} onClick={() => onPage(page + 1)} className="flex h-8 w-8 items-center justify-center rounded-lg border disabled:opacity-40">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
