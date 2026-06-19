import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/contexts/auth-context";
import { ArrowLeft, Printer, TrendingUp, TrendingDown, RefreshCw } from "lucide-react";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";

interface PnlAccount { code: string; name: string; amount: number; }
interface PnlData {
  period: { from: string | null; to: string | null };
  revenue: PnlAccount[];
  otherIncome: PnlAccount[];
  totalRevenue: number;
  costOfSales: PnlAccount[];
  totalCostOfSales: number;
  grossProfit: number;
  operatingExpenses: PnlAccount[];
  totalOperatingExpenses: number;
  operatingProfit: number;
  incomeTax: number;
  netProfit: number;
}

function currentYear() {
  const y = new Date().getFullYear();
  return { from: `${y}-01-01`, to: `${y}-12-31` };
}

function fmtSGD(n: number) {
  return new Intl.NumberFormat("en-SG", { style: "currency", currency: "SGD", minimumFractionDigits: 2 }).format(n);
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("en-SG", { day: "2-digit", month: "short", year: "numeric" });
}

interface RowProps { label: string; code?: string; amount: number; bold?: boolean; indent?: boolean; separator?: boolean; highlight?: "green" | "red" | "blue" | "muted"; }

function PnlRow({ label, code, amount, bold, indent, highlight }: RowProps) {
  const isZero = Math.abs(amount) < 0.005;
  return (
    <div className={cn("flex items-center justify-between py-1.5 px-2 rounded text-sm",
      indent && "pl-8",
      highlight === "green" && "bg-emerald-50",
      highlight === "red" && "bg-red-50",
      highlight === "blue" && "bg-blue-50",
      highlight === "muted" && "bg-muted/40",
    )}>
      <div className="flex items-center gap-2">
        {code && <span className="text-xs text-muted-foreground font-mono w-12 shrink-0">{code}</span>}
        <span className={cn(bold ? "font-semibold" : "text-muted-foreground", isZero && !bold && "opacity-50")}>{label}</span>
      </div>
      <span className={cn("tabular-nums font-mono text-sm",
        bold && "font-semibold",
        isZero && !bold ? "text-muted-foreground/50" : "",
        !isZero && amount < 0 ? "text-red-600" : "",
        highlight === "green" ? "text-emerald-700 font-bold" : "",
        highlight === "red" ? "text-red-700 font-bold" : "",
        highlight === "blue" ? "text-blue-700 font-bold" : "",
      )}>
        {fmtSGD(amount)}
      </span>
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="pt-4 pb-1">
      <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground px-2">{title}</p>
    </div>
  );
}

function SubtotalRow({ label, amount, highlight }: { label: string; amount: number; highlight?: RowProps["highlight"] }) {
  return (
    <div className="mt-1">
      <Separator className="mb-1" />
      <PnlRow label={label} amount={amount} bold highlight={highlight} />
    </div>
  );
}

export default function ProfitLoss() {
  const [, setLocation] = useLocation();
  const { selectedCompany } = useAuth();
  const defaults = currentYear();
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo]     = useState(defaults.to);
  const [applied, setApplied] = useState(defaults);
  const printRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, isFetching, error } = useQuery<PnlData>({
    queryKey: ["profit-loss", applied.from, applied.to],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (applied.from) params.set("from", applied.from);
      if (applied.to)   params.set("to",   applied.to);
      const res = await fetch(`/api/profit-loss?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load P&L");
      return res.json();
    },
  });

  function handleApply() { setApplied({ from, to }); }
  function handlePrint() {
    window.print();
  }

  const loading = isLoading || isFetching;

  return (
    <div className="space-y-6 max-w-7xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/accounting/journal-entries")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Profit & Loss</h1>
            <p className="text-muted-foreground mt-1">Income Statement — {selectedCompany?.name}</p>
          </div>
        </div>
        <Button variant="outline" className="gap-2 print:hidden" onClick={handlePrint}>
          <Printer className="h-4 w-4" />
          Print
        </Button>
      </div>

      {/* Date filter */}
      <Card className="print:hidden">
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <Label className="text-xs">From</Label>
              <Input type="date" className="w-40" value={from} onChange={e => setFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">To</Label>
              <Input type="date" className="w-40" value={to} onChange={e => setTo(e.target.value)} />
            </div>
            <Button onClick={handleApply} disabled={loading} className="gap-2">
              {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : null}
              Apply
            </Button>
            <div className="flex gap-2 ml-auto">
              {[
                { label: "This Year", ...currentYear() },
                { label: "Last Year", from: `${new Date().getFullYear()-1}-01-01`, to: `${new Date().getFullYear()-1}-12-31` },
                { label: "This Month", from: new Date().toISOString().slice(0,7)+"-01", to: new Date(new Date().getFullYear(), new Date().getMonth()+1, 0).toISOString().slice(0,10) },
                { label: "Last Month", from: new Date(new Date().getFullYear(), new Date().getMonth()-1, 1).toISOString().slice(0,10), to: new Date(new Date().getFullYear(), new Date().getMonth(), 0).toISOString().slice(0,10) },
              ].map(q => (
                <Button key={q.label} variant="outline" size="sm" onClick={() => { setFrom(q.from); setTo(q.to); setApplied({ from: q.from, to: q.to }); }}>
                  {q.label}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {error && <div className="text-destructive text-sm px-4">Failed to load P&amp;L statement.</div>}

      {/* P&L Statement */}
      {data && (
        <Card ref={printRef as any}>
          <CardHeader className="pb-2 text-center border-b">
            <div className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Income Statement</div>
            <CardTitle className="text-xl">{selectedCompany?.name}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {fmtDate(data.period.from)} — {fmtDate(data.period.to)}
            </p>
          </CardHeader>
          <CardContent className="pt-4 space-y-0">

            {/* ── Revenue ── */}
            <SectionHeader title="Revenue" />
            {data.revenue.map(a => <PnlRow key={a.code} code={a.code} label={a.name} amount={a.amount} indent />)}
            {data.otherIncome.map(a => <PnlRow key={a.code} code={a.code} label={a.name} amount={a.amount} indent />)}
            <SubtotalRow label="Total Revenue" amount={data.totalRevenue} highlight="muted" />

            {/* ── Cost of Sales ── */}
            {(data.costOfSales.length > 0 || true) && (
              <>
                <SectionHeader title="Less: Cost of Sales" />
                {data.costOfSales.length > 0
                  ? data.costOfSales.map(a => <PnlRow key={a.code} code={a.code} label={a.name} amount={a.amount} indent />)
                  : <p className="text-xs text-muted-foreground px-8 py-1 italic">No cost of sales recorded</p>
                }
                <SubtotalRow label="Total Cost of Sales" amount={data.totalCostOfSales} />
              </>
            )}

            {/* ── Gross Profit ── */}
            <div className="pt-2">
              <Separator />
              <PnlRow
                label="Gross Profit"
                amount={data.grossProfit}
                bold
                highlight={data.grossProfit >= 0 ? "green" : "red"}
              />
            </div>

            {/* ── Operating Expenses ── */}
            <SectionHeader title="Less: Operating Expenses" />
            {data.operatingExpenses.length > 0
              ? data.operatingExpenses.map(a => <PnlRow key={a.code} code={a.code} label={a.name} amount={a.amount} indent />)
              : <p className="text-xs text-muted-foreground px-8 py-1 italic">No operating expenses recorded</p>
            }
            <SubtotalRow label="Total Operating Expenses" amount={data.totalOperatingExpenses} />

            {/* ── Operating Profit ── */}
            <div className="pt-2">
              <Separator />
              <PnlRow
                label="Operating Profit (EBIT)"
                amount={data.operatingProfit}
                bold
                highlight={data.operatingProfit >= 0 ? "muted" : "red"}
              />
            </div>

            {/* ── Income Tax ── */}
            {data.incomeTax !== 0 && (
              <>
                <SectionHeader title="Less: Income Tax" />
                <PnlRow code="7300" label="Income Tax Expense" amount={data.incomeTax} indent />
              </>
            )}

            {/* ── Net Profit ── */}
            <div className="pt-3 pb-2">
              <Separator className="mb-2" />
              <Separator />
              <PnlRow
                label={data.netProfit >= 0 ? "Net Profit After Tax" : "Net Loss After Tax"}
                amount={data.netProfit}
                bold
                highlight={data.netProfit >= 0 ? "green" : "red"}
              />
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-3 gap-4 pt-6 border-t mt-4">
              <div className="text-center p-4 rounded-lg bg-emerald-50">
                <TrendingUp className="h-5 w-5 text-emerald-600 mx-auto mb-1" />
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Revenue</p>
                <p className="text-lg font-bold text-emerald-700">{fmtSGD(data.totalRevenue)}</p>
              </div>
              <div className="text-center p-4 rounded-lg bg-red-50">
                <TrendingDown className="h-5 w-5 text-red-500 mx-auto mb-1" />
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Expenses</p>
                <p className="text-lg font-bold text-red-700">{fmtSGD(data.totalCostOfSales + data.totalOperatingExpenses + data.incomeTax)}</p>
              </div>
              <div className={cn("text-center p-4 rounded-lg", data.netProfit >= 0 ? "bg-blue-50" : "bg-red-50")}>
                <TrendingUp className={cn("h-5 w-5 mx-auto mb-1", data.netProfit >= 0 ? "text-blue-600" : "text-red-500")} />
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Net {data.netProfit >= 0 ? "Profit" : "Loss"}</p>
                <p className={cn("text-lg font-bold", data.netProfit >= 0 ? "text-blue-700" : "text-red-700")}>{fmtSGD(Math.abs(data.netProfit))}</p>
              </div>
            </div>

            <p className="text-[10px] text-muted-foreground text-center pt-4">
              Generated {new Date().toLocaleString("en-SG")} · Based on posted journal entries only · All amounts in SGD
            </p>
          </CardContent>
        </Card>
      )}

      {loading && !data && (
        <div className="flex justify-center py-16">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      )}
    </div>
  );
}
