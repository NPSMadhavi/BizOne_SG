import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  useListInvoices, getListInvoicesQueryKey,
  useListPurchaseOrders, getListPurchaseOrdersQueryKey,
} from "@workspace/api-client-react";
import { Link } from "wouter";
import {
  Calendar as CalendarIcon,
  TrendingUp,
  TrendingDown,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  FileText,
  Receipt,
  ShoppingCart,
  CreditCard,
  Package,
  RotateCcw,
  AlertCircle,
  Clock,
  ChevronDown,
} from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { fmtDate } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const money = (v: number) =>
  new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    maximumFractionDigits: 0,
  }).format(v || 0);

const moneyExact = (v: number) =>
  new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    minimumFractionDigits: 2,
  }).format(v || 0);

function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}
function startOfQuarter(d = new Date()) {
  const q = Math.floor(d.getMonth() / 3) * 3;
  return new Date(d.getFullYear(), q, 1);
}
function endOfQuarter(d = new Date()) {
  const q = Math.floor(d.getMonth() / 3) * 3;
  return new Date(d.getFullYear(), q + 3, 0);
}
function startOfYear(d = new Date()) {
  return new Date(d.getFullYear(), 0, 1);
}
function endOfYear(d = new Date()) {
  return new Date(d.getFullYear(), 11, 31);
}
function toInputDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function fromInputDate(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}
function fmtRangeLabel(from: Date, to: Date) {
  const opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short", year: "numeric" };
  return `${from.toLocaleDateString("en-GB", opts)} - ${to.toLocaleDateString("en-GB", opts)}`;
}
function inRange(iso: string | null | undefined, from: Date, to: Date) {
  if (!iso) return false;
  const d = new Date(iso.slice(0, 10));
  if (Number.isNaN(d.getTime())) return false;
  const t = d.getTime();
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59, 999).getTime();
  return t >= start && t <= end;
}

function invoiceBalance(inv: { totalAmount?: string | number; paidAmount?: string | number; balance?: string | number }) {
  if (inv.balance != null && inv.balance !== "") {
    return Math.max(0, parseFloat(String(inv.balance)) || 0);
  }
  const total = parseFloat(String(inv.totalAmount)) || 0;
  const paid = parseFloat(String(inv.paidAmount)) || 0;
  return Math.max(0, total - paid);
}

function isOpenReceivable(status: string | null | undefined) {
  return !["paid", "void", "cancelled", "draft"].includes(String(status || ""));
}

function vendorOutstanding(vi: { totalAmount?: string | number; paidAmount?: string | number; status?: string }) {
  if (vi.status === "paid") return 0;
  const total = parseFloat(String(vi.totalAmount)) || 0;
  const paid = parseFloat(String(vi.paidAmount)) || 0;
  return Math.max(0, total - paid);
}

type PeriodPreset = "this-month" | "last-month" | "this-quarter" | "this-year" | "custom";

const PERIOD_PRESETS: { id: PeriodPreset; label: string }[] = [
  { id: "this-month", label: "This Month" },
  { id: "last-month", label: "Last Month" },
  { id: "this-quarter", label: "This Quarter" },
  { id: "this-year", label: "This Year" },
  { id: "custom", label: "Custom Range" },
];

function rangeForPreset(preset: PeriodPreset, customFrom: Date, customTo: Date): { from: Date; to: Date } {
  const now = new Date();
  switch (preset) {
    case "last-month": {
      const ref = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return { from: startOfMonth(ref), to: endOfMonth(ref) };
    }
    case "this-quarter":
      return { from: startOfQuarter(now), to: endOfQuarter(now) };
    case "this-year":
      return { from: startOfYear(now), to: endOfYear(now) };
    case "custom":
      return {
        from: customFrom <= customTo ? customFrom : customTo,
        to: customFrom <= customTo ? customTo : customFrom,
      };
    case "this-month":
    default:
      return { from: startOfMonth(now), to: endOfMonth(now) };
  }
}

function DateRangeFilter({
  preset,
  rangeFrom,
  rangeTo,
  onApply,
}: {
  preset: PeriodPreset;
  rangeFrom: Date;
  rangeTo: Date;
  onApply: (preset: PeriodPreset, from: Date, to: Date) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draftPreset, setDraftPreset] = useState<PeriodPreset>(preset);
  const [draftFrom, setDraftFrom] = useState(toInputDate(rangeFrom));
  const [draftTo, setDraftTo] = useState(toInputDate(rangeTo));

  function openPopover(next: boolean) {
    if (next) {
      setDraftPreset(preset);
      setDraftFrom(toInputDate(rangeFrom));
      setDraftTo(toInputDate(rangeTo));
    }
    setOpen(next);
  }

  function selectPreset(id: PeriodPreset) {
    setDraftPreset(id);
    if (id === "custom") return;
    const { from, to } = rangeForPreset(id, rangeFrom, rangeTo);
    setDraftFrom(toInputDate(from));
    setDraftTo(toInputDate(to));
  }

  function apply() {
    const from = fromInputDate(draftFrom) ?? rangeFrom;
    const to = fromInputDate(draftTo) ?? rangeTo;
    const resolved = rangeForPreset(draftPreset, from, to);
    onApply(draftPreset, resolved.from, resolved.to);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={openPopover}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-xl border border-[#e8edf5] bg-white px-4 py-2.5 text-[13px] font-medium text-[#101828] shadow-sm transition hover:bg-[#f8fafc]"
        >
          <CalendarIcon size={16} className="text-[#64748b]" />
          {fmtRangeLabel(rangeFrom, rangeTo)}
          <ChevronDown size={14} className={`text-[#94a3b8] transition ${open ? "rotate-180" : ""}`} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[320px] p-3 space-y-3">
        <p className="text-[12px] font-semibold text-[#64748b] uppercase tracking-wide">Date range</p>
        <div className="grid grid-cols-2 gap-1.5">
          {PERIOD_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => selectPreset(p.id)}
              className={`rounded-lg px-2.5 py-2 text-left text-[12px] font-medium transition ${
                draftPreset === p.id
                  ? "bg-[#1a73e8] text-white shadow-sm"
                  : "bg-[#f8fafc] text-[#475569] hover:bg-[#f0f4ff] hover:text-[#1a73e8]"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-[#64748b]">From</label>
            <Input
              type="date"
              value={draftFrom}
              onChange={(e) => {
                setDraftPreset("custom");
                setDraftFrom(e.target.value);
              }}
              className="h-9 text-[13px]"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-[#64748b]">To</label>
            <Input
              type="date"
              value={draftTo}
              onChange={(e) => {
                setDraftPreset("custom");
                setDraftTo(e.target.value);
              }}
              className="h-9 text-[13px]"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={apply}>
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function LineChart({ incomePts, expensePts, labels }: {
  incomePts: string; expensePts: string; labels: string[];
}) {
  return (
    <svg viewBox="0 0 620 220" className="h-[220px] w-full">
      {[0, 1, 2, 3, 4].map((i) => (
        <line
          key={i}
          x1="20"
          y1={40 + i * 35}
          x2="600"
          y2={40 + i * 35}
          stroke="#e8edf5"
          strokeWidth="1"
        />
      ))}
      <polyline
        fill="none"
        stroke="#1a73e8"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={incomePts}
      />
      <polyline
        fill="none"
        stroke="#ef4444"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={expensePts}
      />
      {labels.map((label, i) => (
        <text
          key={label}
          x={20 + i * 145}
          y="210"
          fill="#94a3b8"
          fontSize="11"
        >
          {label}
        </text>
      ))}
    </svg>
  );
}

function DonutChart({ segments }: { segments: { pct: number; color: string; offset: number }[] }) {
  const r = 70;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 180 180" className="h-[160px] w-[160px] shrink-0">
      <circle cx="90" cy="90" r={r} fill="none" stroke="#e8edf5" strokeWidth="22" />
      {segments.map((seg) => (
        <circle
          key={`${seg.color}-${seg.offset}`}
          cx="90"
          cy="90"
          r={r}
          fill="none"
          stroke={seg.color}
          strokeWidth="22"
          strokeDasharray={`${(seg.pct / 100) * c} ${c}`}
          strokeDashoffset={-((seg.offset / 100) * c)}
          transform="rotate(-90 90 90)"
        />
      ))}
    </svg>
  );
}

function buildSparkline(values: number[], yMin = 10, yMax = 160): string {
  const n = values.length;
  if (n === 0) return "20,100 600,100";
  const max = Math.max(...values, 1);
  return values
    .map((v, i) => {
      const x = 20 + (i / Math.max(n - 1, 1)) * 580;
      const y = yMax - (v / max) * (yMax - yMin);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

export default function Dashboard() {
  const { user } = useAuth();
  const userName =
    (user?.fullName && user.fullName.trim()) ||
    "there";

  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>("this-month");
  const [rangeFrom, setRangeFrom] = useState(() => startOfMonth());
  const [rangeTo, setRangeTo] = useState(() => endOfMonth());

  const periodChipLabel = PERIOD_PRESETS.find((p) => p.id === periodPreset)?.label ?? "Custom Range";

  function applyDateRange(preset: PeriodPreset, from: Date, to: Date) {
    setPeriodPreset(preset);
    setRangeFrom(from);
    setRangeTo(to);
  }

  const { data: invoices = [] } = useListInvoices({
    query: { queryKey: getListInvoicesQueryKey() },
  });
  const { data: purchaseOrders = [] } = useListPurchaseOrders({
    query: { queryKey: getListPurchaseOrdersQueryKey() },
  });

  const { data: expenses = [] } = useQuery({
    queryKey: ["dashboard-expenses"],
    queryFn: async () => {
      const res = await fetch("/api/expenses", { credentials: "include" });
      if (!res.ok) return [];
      return res.json() as Promise<any[]>;
    },
  });

  const { data: incomeRecords = [] } = useQuery({
    queryKey: ["dashboard-income"],
    queryFn: async () => {
      const res = await fetch("/api/income", { credentials: "include" });
      if (!res.ok) return [];
      return res.json() as Promise<any[]>;
    },
  });

  const { data: stockItems = [] } = useQuery({
    queryKey: ["stock-items-dashboard"],
    queryFn: async () => {
      const res = await fetch("/api/stock-items", { credentials: "include" });
      if (!res.ok) return [];
      return res.json() as Promise<{ id: number; name: string; stockQty: string }[]>;
    },
  });

  const { data: vendorInvoices = [] } = useQuery({
    queryKey: ["dashboard-vendor-invoices"],
    queryFn: async () => {
      const res = await fetch("/api/vendor-invoices", { credentials: "include" });
      if (!res.ok) return [];
      return res.json() as Promise<any[]>;
    },
  });

  const metrics = useMemo(() => {
    const invList = (invoices as any[]) || [];
    const expList = (expenses as any[]) || [];
    const incomeList = (incomeRecords as any[]) || [];
    const poList = (purchaseOrders as any[]) || [];
    const viList = (vendorInvoices as any[]) || [];

    const monthInvoices = invList.filter((i) =>
      inRange(i.issueDate || i.createdAt, new Date(rangeFrom), new Date(rangeTo)),
    );
    const monthExpenses = expList.filter((e) =>
      inRange(e.expenseDate || e.createdAt, new Date(rangeFrom), new Date(rangeTo)),
    );
    const monthIncomeExtra = incomeList.filter((r) =>
      inRange(r.incomeDate || r.createdAt, new Date(rangeFrom), new Date(rangeTo)),
    );

    const invoiceIncome = monthInvoices
      .filter((i) => i.status !== "void" && i.status !== "cancelled" && i.status !== "draft")
      .reduce((s, i) => s + (parseFloat(i.totalAmount) || 0), 0);
    const otherIncome = monthIncomeExtra
      .filter((r) => r.status !== "void")
      .reduce((s, r) => s + (parseFloat(r.amount ?? r.totalAmount) || 0), 0);
    const totalIncome = invoiceIncome + otherIncome;

    const totalExpenses = monthExpenses
      .filter((e) => e.status !== "void")
      .reduce((s, e) => s + (parseFloat(e.amount ?? e.totalAmount) || 0), 0);

    const netProfit = totalIncome - totalExpenses;

    const receivable = invList
      .filter((i) => isOpenReceivable(i.status))
      .reduce((s, i) => s + invoiceBalance(i), 0);

    const overdueReceivable = invList
      .filter((i) => {
        if (!isOpenReceivable(i.status)) return false;
        const due = i.deliveryDate || i.dueDate;
        if (!due) return i.status === "overdue";
        return new Date(due) < new Date(new Date().toISOString().slice(0, 10));
      })
      .reduce((s, i) => s + invoiceBalance(i), 0);

    const payable = viList
      .reduce((s, vi) => s + vendorOutstanding(vi), 0);

    // Split selected range into up to 5 buckets for the sparkline
    const spanMs = Math.max(rangeTo.getTime() - rangeFrom.getTime(), 24 * 60 * 60 * 1000);
    const bucketCount = 4;
    const bucketMs = spanMs / bucketCount;
    const weeks = Array.from({ length: bucketCount }, (_, w) => {
      const start = new Date(rangeFrom.getTime() + w * bucketMs);
      const end = new Date(Math.min(rangeFrom.getTime() + (w + 1) * bucketMs - 1, rangeTo.getTime()));
      const inc = invList
        .filter((i) => inRange(i.issueDate || i.createdAt, start, end))
        .filter((i) => i.status !== "void" && i.status !== "cancelled" && i.status !== "draft")
        .reduce((s, i) => s + (parseFloat(i.totalAmount) || 0), 0);
      const exp = expList
        .filter((e) => inRange(e.expenseDate || e.createdAt, start, end))
        .filter((e) => e.status !== "void")
        .reduce((s, e) => s + (parseFloat(e.amount ?? e.totalAmount) || 0), 0);
      return { inc, exp, start, end };
    });

    const sales = invoiceIncome;
    const services = otherIncome;
    const discounts = monthInvoices.reduce((s, i) => s + (parseFloat(i.discountAmount) || 0), 0);
    const categoryTotal = sales + services + discounts || 1;
    const incomeCategories = [
      { label: "Sales", value: money(sales), pct: `${((sales / categoryTotal) * 100).toFixed(1)}%`, color: "#1a73e8", raw: sales },
      { label: "Other Income", value: money(services), pct: `${((services / categoryTotal) * 100).toFixed(1)}%`, color: "#16a34a", raw: services },
      { label: "Discounts", value: money(discounts), pct: `${((discounts / categoryTotal) * 100).toFixed(1)}%`, color: "#f59e0b", raw: discounts },
    ].filter((c) => c.raw > 0 || categoryTotal === 1);

    // If no category data, keep India-like placeholders so donut still renders
    const cats = incomeCategories.length
      ? incomeCategories
      : [
          { label: "Sales", value: money(0), pct: "0%", color: "#1a73e8", raw: 0 },
          { label: "Other Income", value: money(0), pct: "0%", color: "#16a34a", raw: 0 },
          { label: "Discounts", value: money(0), pct: "0%", color: "#f59e0b", raw: 0 },
        ];

    let offset = 0;
    const donutSegments = cats.map((c) => {
      const pct = categoryTotal > 0 ? (c.raw / categoryTotal) * 100 : 0;
      const seg = { pct: Math.max(pct, 0), color: c.color, offset };
      offset += pct;
      return seg;
    });

    const chartLabels = weeks.map((w) =>
      w.start.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
    );
    while (chartLabels.length < 5) {
      chartLabels.push(rangeTo.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }));
    }

    const incomePts = buildSparkline(weeks.map((w) => w.inc));
    const expensePts = buildSparkline(weeks.map((w) => w.exp), 40, 160);

    const overdueCount = invList.filter((i) => {
      if (["paid", "void", "cancelled", "draft"].includes(String(i.status))) return false;
      const due = i.deliveryDate || i.dueDate;
      if (!due) return i.status === "overdue";
      return new Date(due) < new Date(new Date().toISOString().slice(0, 10));
    }).length;

    const draftCount = invList.filter((i) => i.status === "draft").length;
    const lowStock = (stockItems as any[]).filter((i) => Number(i.stockQty) <= 5).length;

    // Recent transactions mix
    const txns: {
      date: string;
      type: string;
      typeCode: string;
      typeColor: string;
      number: string;
      party: string;
      amount: string;
      status: string;
      statusColor: string;
      href: string;
      sort: number;
    }[] = [];

    for (const inv of invList.slice(0, 20)) {
      const status = String(inv.status || "draft");
      const statusColor =
        status === "paid" ? "bg-[#dcfce7] text-[#16a34a]"
        : status === "confirmed" || status === "sent" ? "bg-[#dbeafe] text-[#1a73e8]"
        : status === "overdue" ? "bg-[#fee2e2] text-[#dc2626]"
        : status === "draft" ? "bg-[#ffedd5] text-[#ea580c]"
        : "bg-[#f1f5f9] text-[#64748b]";
      txns.push({
        date: fmtDate(inv.issueDate || inv.createdAt) || "—",
        type: "Invoice",
        typeCode: "I",
        typeColor: "bg-[#dbeafe] text-[#1a73e8]",
        number: inv.invNumber,
        party: inv.customerName,
        amount: moneyExact(parseFloat(inv.totalAmount) || 0),
        status: status.charAt(0).toUpperCase() + status.slice(1),
        statusColor,
        href: `/invoices/${inv.id}`,
        sort: new Date(inv.issueDate || inv.createdAt || 0).getTime(),
      });
    }
    for (const exp of expList.slice(0, 10)) {
      txns.push({
        date: fmtDate(exp.expenseDate || exp.createdAt) || "—",
        type: "Expense",
        typeCode: "E",
        typeColor: "bg-[#fee2e2] text-[#dc2626]",
        number: exp.reference || `EXP-${exp.id}`,
        party: exp.vendorName || exp.payee || "Expense",
        amount: moneyExact(parseFloat(exp.amount ?? exp.totalAmount) || 0),
        status: String(exp.status || "Recorded").charAt(0).toUpperCase() + String(exp.status || "recorded").slice(1),
        statusColor: "bg-[#dcfce7] text-[#16a34a]",
        href: `/accounting/expenses/${exp.id}`,
        sort: new Date(exp.expenseDate || exp.createdAt || 0).getTime(),
      });
    }
    for (const po of poList.slice(0, 10)) {
      txns.push({
        date: fmtDate(po.issueDate || po.createdAt) || "—",
        type: "Purchase",
        typeCode: "P",
        typeColor: "bg-[#fee2e2] text-[#dc2626]",
        number: po.poNumber,
        party: po.vendorName,
        amount: moneyExact(parseFloat(String(po.totalAmount)) || 0),
        status: String(po.status || "draft").charAt(0).toUpperCase() + String(po.status || "draft").slice(1),
        statusColor:
          po.status === "confirmed" ? "bg-[#dcfce7] text-[#16a34a]"
          : po.status === "draft" ? "bg-[#ffedd5] text-[#ea580c]"
          : "bg-[#f1f5f9] text-[#64748b]",
        href: `/purchase-orders/${po.id}`,
        sort: new Date(po.issueDate || po.createdAt || 0).getTime(),
      });
    }
    txns.sort((a, b) => b.sort - a.sort);

    return {
      totalIncome,
      totalExpenses,
      netProfit,
      receivable,
      overdueReceivable,
      payable,
      cats,
      donutSegments,
      incomePts,
      expensePts,
      chartLabels: chartLabels.slice(0, 5),
      overdueCount,
      overdueAmount: overdueReceivable,
      draftCount,
      lowStock,
      transactions: txns.slice(0, 5),
    };
  }, [invoices, expenses, incomeRecords, purchaseOrders, vendorInvoices, stockItems, rangeFrom, rangeTo]);

  const summaryCards = [
    {
      title: "Total Income",
      value: money(metrics.totalIncome),
      change: null as string | null,
      up: true,
      icon: TrendingUp,
      iconBg: "bg-[#dbeafe]",
      iconColor: "text-[#1a73e8]",
      sub: null as string | null,
    },
    {
      title: "Total Expenses",
      value: money(metrics.totalExpenses),
      change: null,
      up: false,
      icon: TrendingDown,
      iconBg: "bg-[#dcfce7]",
      iconColor: "text-[#16a34a]",
      sub: null,
    },
    {
      title: "Net Profit",
      value: money(metrics.netProfit),
      change: null,
      up: metrics.netProfit >= 0,
      icon: DollarSign,
      iconBg: "bg-[#fef9c3]",
      iconColor: "text-[#ca8a04]",
      sub: null,
    },
    {
      title: "Outstanding Receivable",
      value: money(metrics.receivable),
      change: null,
      up: true,
      icon: ArrowUpRight,
      iconBg: "bg-[#f3e8ff]",
      iconColor: "text-[#9333ea]",
      sub: metrics.overdueReceivable > 0 ? `Overdue: ${money(metrics.overdueReceivable)}` : null,
    },
    {
      title: "Outstanding Payable",
      value: money(metrics.payable),
      change: null,
      up: false,
      icon: ArrowDownRight,
      iconBg: "bg-[#fee2e2]",
      iconColor: "text-[#dc2626]",
      sub: null,
    },
  ];

  const quickActions = [
    { label: "New Invoice", icon: FileText, bg: "bg-[#dbeafe]", color: "text-[#1a73e8]", href: "/invoices/new" },
    { label: "New Receipt", icon: Receipt, bg: "bg-[#dcfce7]", color: "text-[#16a34a]", href: "/accounting/income/new" },
    { label: "New Purchase Order", icon: ShoppingCart, bg: "bg-[#fee2e2]", color: "text-[#dc2626]", href: "/purchase-orders/new" },
    { label: "New Payment", icon: CreditCard, bg: "bg-[#f3e8ff]", color: "text-[#9333ea]", href: "/accounting/expenses/new" },
    { label: "New Product", icon: Package, bg: "bg-[#fef9c3]", color: "text-[#ca8a04]", href: "/stock" },
    { label: "New credit Note", icon: RotateCcw, bg: "bg-[#ffedd5]", color: "text-[#ea580c]", href: "/credit-notes/new" },
  ];

  const reminders = [
    {
      title: `${metrics.overdueCount} Invoice${metrics.overdueCount === 1 ? "" : "s"} Overdue`,
      amount: money(metrics.overdueAmount),
      icon: AlertCircle,
      color: "text-[#dc2626]",
      bg: "bg-[#fee2e2]",
      href: "/invoices",
      show: metrics.overdueCount > 0,
    },
    {
      title: `${metrics.draftCount} Draft Invoice${metrics.draftCount === 1 ? "" : "s"}`,
      amount: "Needs review",
      icon: Clock,
      color: "text-[#ca8a04]",
      bg: "bg-[#fef9c3]",
      href: "/invoices",
      show: metrics.draftCount > 0,
    },
    {
      title: `${metrics.lowStock} Low Stock Item${metrics.lowStock === 1 ? "" : "s"}`,
      amount: "≤ 5 units",
      icon: Package,
      color: "text-[#9333ea]",
      bg: "bg-[#f3e8ff]",
      href: "/stock",
      show: metrics.lowStock > 0,
    },
  ].filter((r) => r.show);

  return (
    <div className="space-y-6 pb-8">
      {/* Page Header — matches India_BizOne */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="m-0 text-[1.75rem] font-bold tracking-tight text-[#2563EB]">
            Dashboard
          </h1>
          <p className="mt-1 text-[14px] text-[#64748b]">
            Welcome back, {userName}! 👋
          </p>
        </div>
        <DateRangeFilter
          preset={periodPreset}
          rangeFrom={rangeFrom}
          rangeTo={rangeTo}
          onApply={applyDateRange}
        />
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {summaryCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.title}
              className="rounded-2xl border border-[#e8edf5] bg-white p-5 shadow-[0_2px_8px_rgba(15,28,51,0.04)]"
            >
              <div className="mb-3 flex items-start justify-between">
                <p className="text-[12px] font-medium text-[#64748b]">{card.title}</p>
                <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${card.iconBg}`}>
                  <Icon size={18} className={card.iconColor} />
                </div>
              </div>
              <p className="text-[1.35rem] font-bold tracking-tight text-[#101828]">{card.value}</p>
              {card.change && (
                <p
                  className={`mt-1 flex items-center gap-1 text-[12px] font-semibold ${
                    card.up ? "text-[#16a34a]" : "text-[#dc2626]"
                  }`}
                >
                  {card.up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                  {card.change}
                </p>
              )}
              {card.sub && (
                <p className="mt-1 text-[11px] font-medium text-[#dc2626]">{card.sub}</p>
              )}
            </div>
          );
        })}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <div className="rounded-2xl border border-[#e8edf5] bg-white p-5 shadow-[0_2px_8px_rgba(15,28,51,0.04)] xl:col-span-3">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-[15px] font-semibold text-[#101828]">
              Income vs Expense Overview
            </h2>
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5 text-[12px] text-[#64748b]">
                <span className="h-2.5 w-2.5 rounded-full bg-[#1a73e8]" />
                Income
              </span>
              <span className="flex items-center gap-1.5 text-[12px] text-[#64748b]">
                <span className="h-2.5 w-2.5 rounded-full bg-[#ef4444]" />
                Expense
              </span>
              <span className="inline-flex items-center gap-1 rounded-lg border border-[#e8edf5] bg-[#f8fafc] px-2.5 py-1 text-[11px] text-[#64748b]">
                {periodChipLabel}
              </span>
            </div>
          </div>
          <LineChart
            incomePts={metrics.incomePts}
            expensePts={metrics.expensePts}
            labels={metrics.chartLabels}
          />
        </div>

        <div className="rounded-2xl border border-[#e8edf5] bg-white p-5 shadow-[0_2px_8px_rgba(15,28,51,0.04)] xl:col-span-2">
          <h2 className="mb-4 text-[15px] font-semibold text-[#101828]">
            Income by Category
          </h2>
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
            <DonutChart segments={metrics.donutSegments} />
            <div className="w-full space-y-3">
              {metrics.cats.map((cat) => (
                <div key={cat.label} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: cat.color }}
                    />
                    <span className="text-[12px] text-[#64748b]">{cat.label}</span>
                  </div>
                  <div className="text-right">
                    <p className="text-[12px] font-semibold text-[#101828]">{cat.value}</p>
                    <p className="text-[10px] text-[#94a3b8]">{cat.pct}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        {/* Recent Transactions */}
        <div className="rounded-2xl border border-[#e8edf5] bg-white p-5 shadow-[0_2px_8px_rgba(15,28,51,0.04)] xl:col-span-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[15px] font-semibold text-[#101828]">
              Recent Transactions
            </h2>
            <Link href="/invoices" className="text-[12px] font-semibold text-[#1a73e8] hover:underline">
              View All
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-[12px]">
              <thead>
                <tr className="border-b border-[#e8edf5] text-[#94a3b8]">
                  <th className="pb-3 pr-3 font-medium">Date</th>
                  <th className="pb-3 pr-3 font-medium">Type</th>
                  <th className="pb-3 pr-3 font-medium">Number</th>
                  <th className="pb-3 pr-3 font-medium">Party</th>
                  <th className="pb-3 pr-3 font-medium">Amount</th>
                  <th className="pb-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {metrics.transactions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-[#94a3b8]">
                      No transactions yet.
                    </td>
                  </tr>
                ) : (
                  metrics.transactions.map((tx) => (
                    <tr key={`${tx.type}-${tx.number}`} className="border-b border-[#f1f5f9] last:border-0">
                      <td className="py-3 pr-3 text-[#64748b]">{tx.date}</td>
                      <td className="py-3 pr-3">
                        <span
                          className={`inline-flex h-6 w-6 items-center justify-center rounded-md text-[10px] font-bold ${tx.typeColor}`}
                        >
                          {tx.typeCode}
                        </span>
                      </td>
                      <td className="py-3 pr-3 font-medium text-[#101828]">
                        <Link href={tx.href} className="hover:text-[#1a73e8] hover:underline">
                          {tx.number}
                        </Link>
                      </td>
                      <td className="py-3 pr-3 text-[#64748b]">{tx.party}</td>
                      <td className="py-3 pr-3 font-semibold text-[#101828]">{tx.amount}</td>
                      <td className="py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${tx.statusColor}`}
                        >
                          {tx.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="rounded-2xl border border-[#e8edf5] bg-white p-5 shadow-[0_2px_8px_rgba(15,28,51,0.04)] xl:col-span-4">
          <h2 className="mb-4 text-[15px] font-semibold text-[#101828]">Quick Actions</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <Link
                  key={action.label}
                  href={action.href}
                  className="flex flex-col items-center gap-2 rounded-xl border border-[#f1f5f9] bg-[#fafbfc] px-3 py-4 transition hover:border-[#e8edf5] hover:bg-white hover:shadow-sm"
                >
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${action.bg}`}>
                    <Icon size={18} className={action.color} />
                  </div>
                  <span className="text-center text-[11px] font-medium text-[#64748b]">
                    {action.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Reminders */}
        <div className="rounded-2xl border border-[#e8edf5] bg-white p-5 shadow-[0_2px_8px_rgba(15,28,51,0.04)] xl:col-span-3">
          <h2 className="mb-4 text-[15px] font-semibold text-[#101828]">Reminders</h2>
          <div className="space-y-3">
            {reminders.length === 0 ? (
              <p className="text-[12px] text-[#94a3b8]">No reminders right now.</p>
            ) : (
              reminders.map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.title}
                    className="flex items-center gap-3 rounded-xl border border-[#f1f5f9] bg-[#fafbfc] p-3"
                  >
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${item.bg}`}>
                      <Icon size={16} className={item.color} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-semibold text-[#101828]">{item.title}</p>
                      <p className="text-[11px] text-[#64748b]">{item.amount}</p>
                    </div>
                    <Link
                      href={item.href}
                      className="shrink-0 text-[11px] font-semibold text-[#1a73e8] hover:underline"
                    >
                      View now
                    </Link>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
