import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/contexts/auth-context";
import { Download, Loader2, TrendingUp, TrendingDown, RefreshCw, ChevronDown, ChevronUp, ChevronRight, Users, FileText, Receipt, ShoppingCart } from "lucide-react";
import { cn } from "@/lib/utils";
import { generateProfitLoss_PDF } from "@/lib/pdf";

interface PnlAccount { code: string; name: string; amount: number; }
interface PnlData {
  period: { from: string | null; to: string | null };
  revenue: PnlAccount[]; otherIncome: PnlAccount[]; totalRevenue: number;
  costOfSales: PnlAccount[]; totalCostOfSales: number; grossProfit: number;
  operatingExpenses: PnlAccount[]; totalOperatingExpenses: number;
  operatingProfit: number; incomeTax: number; netProfit: number;
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
  return new Date(d + "T00:00:00").toLocaleDateString("en-SG", { day: "2-digit", month: "short", year: "numeric" });
}

interface RowProps {
  label: string;
  code?: string;
  amount: number;
  bold?: boolean;
  indent?: boolean;
  highlight?: "green" | "red" | "blue" | "muted";
  clickable?: boolean;
  isExpanded?: boolean;
  onClick?: () => void;
}

function PnlRow({ label, code, amount, bold, indent, highlight, clickable, isExpanded, onClick }: RowProps) {
  const isZero = Math.abs(amount) < 0.005;
  return (
    <div
      onClick={clickable ? onClick : undefined}
      className={cn("flex items-center justify-between py-1.5 px-2 rounded text-sm transition-colors",
        indent && "pl-8",
        highlight === "green" && "bg-emerald-50",
        highlight === "red" && "bg-red-50",
        highlight === "blue" && "bg-blue-50",
        highlight === "muted" && "bg-muted/40",
        clickable ? "cursor-pointer hover:bg-blue-50/70 group" : ""
      )}
    >
      <div className="flex items-center gap-2">
        {code && <span className="text-xs text-muted-foreground font-mono w-12 shrink-0">{code}</span>}
        <span className={cn(bold ? "font-semibold" : "text-muted-foreground", isZero && !bold && "opacity-50", clickable && "group-hover:text-blue-700 font-medium")}>{label}</span>
        {clickable && (
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 text-gray-400 group-hover:text-blue-600 transition-transform duration-200",
              isExpanded && "rotate-180 text-blue-600"
            )}
          />
        )}
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
  const { selectedCompany } = useAuth();
  const defaults = currentYear();
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo]     = useState(defaults.to);
  const [applied, setApplied] = useState(defaults);
  const [pdfLoading, setPdfLoading] = useState(false);

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

  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const toggleRow = (code: string) => {
    setExpandedRows(prev => ({
      ...prev,
      [code]: !prev[code],
    }));
  };

  const { data: payrollRecords = [] } = useQuery<any[]>({
    queryKey: ["/api/payroll/records"],
  });

  const { data: employees = [] } = useQuery<any[]>({
    queryKey: ["/api/employees"],
  });

  const { data: expenses = [] } = useQuery<any[]>({
    queryKey: ["expenses"],
    queryFn: async () => {
      const res = await fetch("/api/expenses", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: invoices = [] } = useQuery<any[]>({
    queryKey: ["/api/invoices"],
    queryFn: async () => {
      const res = await fetch("/api/invoices", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: vendorInvoices = [] } = useQuery<any[]>({
    queryKey: ["/api/vendor-invoices"],
    queryFn: async () => {
      const res = await fetch("/api/vendor-invoices", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  function handleApply() { setApplied({ from, to }); }

  async function handleDownloadPDF() {
    if (!data) return;
    setPdfLoading(true);
    try {
      await generateProfitLoss_PDF(selectedCompany as any, data);
    } finally {
      setPdfLoading(false);
    }
  }

  const loading = isLoading || isFetching;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4 pb-4 border-b border-gray-200">
        <div>
          <h1 className="text-2xl font-bold text-[#2563EB]">Profit &amp; Loss</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Income Statement — {selectedCompany?.name}</p>
        </div>
        {data && (
          <Button variant="outline" size="sm" onClick={handleDownloadPDF} disabled={pdfLoading} className="border-gray-200 text-gray-600 hover:text-gray-900">
            {pdfLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
            Download PDF
          </Button>
        )}
      </div>

      {/* Date filter */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <Label className="text-xs">From</Label>
              <Input type="date" className="w-40 h-8 text-sm border-gray-200" value={from} onChange={e => setFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">To</Label>
              <Input type="date" className="w-40 h-8 text-sm border-gray-200" value={to} onChange={e => setTo(e.target.value)} />
            </div>
            <Button onClick={handleApply} disabled={loading} size="sm" className="gap-2">
              {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : null}
              Apply
            </Button>
            <div className="flex gap-2 ml-auto flex-wrap">
              {[
                { label: "This Year",  ...currentYear() },
                { label: "Last Year",  from: `${new Date().getFullYear()-1}-01-01`, to: `${new Date().getFullYear()-1}-12-31` },
                { label: "This Month", from: new Date().toISOString().slice(0,7)+"-01", to: new Date(new Date().getFullYear(), new Date().getMonth()+1, 0).toISOString().slice(0,10) },
                { label: "Last Month", from: new Date(new Date().getFullYear(), new Date().getMonth()-1, 1).toISOString().slice(0,10), to: new Date(new Date().getFullYear(), new Date().getMonth(), 0).toISOString().slice(0,10) },
              ].map(q => (
                <Button key={q.label} variant="outline" size="sm" className="text-xs h-8" onClick={() => { setFrom(q.from); setTo(q.to); setApplied({ from: q.from, to: q.to }); }}>
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
        <>
        <Card>
          <CardHeader className="pb-2 text-center border-b">
            <div className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Income Statement</div>
            <CardTitle className="text-xl">{selectedCompany?.name}</CardTitle>
            <p className="text-sm text-muted-foreground">{fmtDate(data.period.from)} — {fmtDate(data.period.to)}</p>
          </CardHeader>
          <CardContent className="pt-4 space-y-0">
            <SectionHeader title="Revenue" />
            {data.revenue.map(a => {
              const isExpanded = Boolean(expandedRows[a.code]);
              return (
                <div key={a.code} className="transition-all">
                  <PnlRow
                    code={a.code}
                    label={a.name}
                    amount={a.amount}
                    indent
                    clickable
                    isExpanded={isExpanded}
                    onClick={() => toggleRow(a.code)}
                  />
                  {isExpanded && (
                    <div className="ml-8 mr-2 my-2 border border-blue-200 rounded-lg bg-blue-50/20 overflow-hidden shadow-sm animate-in fade-in duration-200">
                      <div className="flex items-center justify-between px-3 py-2 bg-blue-50/60 border-b border-blue-100 text-xs">
                        <span className="font-semibold text-blue-900 flex items-center gap-1.5">
                          <FileText className="h-3.5 w-3.5 text-blue-600" />
                          Sales Invoices (Revenue Breakdown) — {invoices.length} invoice{invoices.length !== 1 ? "s" : ""}
                        </span>
                        <span className="font-mono text-muted-foreground">
                          Total Sales: <strong className="text-gray-900">{fmtSGD(invoices.reduce((s, i) => s + (parseFloat(String(i.totalAmount || 0)) || 0), 0))}</strong>
                        </span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead className="bg-slate-100 border-b border-slate-200 uppercase font-semibold text-slate-700">
                            <tr>
                              <th className="py-2.5 px-3 text-left whitespace-nowrap">Invoice No.</th>
                              <th className="py-2.5 px-3 text-left whitespace-nowrap">Customer</th>
                              <th className="py-2.5 px-3 text-left whitespace-nowrap">Issue Date</th>
                              <th className="py-2.5 px-3 text-right whitespace-nowrap">Net Amount (S$)</th>
                              <th className="py-2.5 px-3 text-right whitespace-nowrap">GST (S$)</th>
                              <th className="py-2.5 px-3 text-right whitespace-nowrap">Total Amount (S$)</th>
                              <th className="py-2.5 px-3 text-center whitespace-nowrap">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 bg-white">
                            {invoices.length === 0 ? (
                              <tr>
                                <td colSpan={7} className="py-4 text-center text-gray-400 italic">No sales invoices recorded.</td>
                              </tr>
                            ) : (
                              invoices.map((inv: any) => {
                                const tot = parseFloat(String(inv.totalAmount || 0)) || 0;
                                const gst = parseFloat(String(inv.gstAmount || 0)) || 0;
                                const net = tot - gst;
                                return (
                                  <tr key={inv.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="py-2 px-3 font-mono font-medium text-gray-800 whitespace-nowrap">{inv.invoiceNumber || `INV-${inv.id}`}</td>
                                    <td className="py-2 px-3 font-medium text-gray-900 whitespace-nowrap">{inv.customerName || "—"}</td>
                                    <td className="py-2 px-3 text-gray-600 whitespace-nowrap">{inv.issueDate ? fmtDate(inv.issueDate) : "—"}</td>
                                    <td className="py-2 px-3 text-right font-mono whitespace-nowrap">{fmtSGD(net)}</td>
                                    <td className="py-2 px-3 text-right font-mono text-gray-600 whitespace-nowrap">{fmtSGD(gst)}</td>
                                    <td className="py-2 px-3 text-right font-mono font-semibold text-emerald-700 whitespace-nowrap">{fmtSGD(tot)}</td>
                                    <td className="py-2 px-3 text-center whitespace-nowrap">
                                      <span className="text-[10px] px-2 py-0.5 rounded-full font-medium uppercase bg-blue-100 text-blue-700">
                                        {inv.status || "Confirmed"}
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                          {invoices.length > 0 && (
                            <tfoot className="bg-slate-50 border-t border-slate-200 font-semibold text-gray-900">
                              <tr>
                                <td colSpan={3} className="py-2.5 px-3 uppercase text-gray-600">Total Sales Invoices ({invoices.length})</td>
                                <td className="py-2.5 px-3 text-right font-mono">
                                  {fmtSGD(invoices.reduce((s, i) => s + ((parseFloat(String(i.totalAmount || 0)) || 0) - (parseFloat(String(i.gstAmount || 0)) || 0)), 0))}
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono text-gray-600">
                                  {fmtSGD(invoices.reduce((s, i) => s + (parseFloat(String(i.gstAmount || 0)) || 0), 0))}
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono text-emerald-700">
                                  {fmtSGD(invoices.reduce((s, i) => s + (parseFloat(String(i.totalAmount || 0)) || 0), 0))}
                                </td>
                                <td></td>
                              </tr>
                            </tfoot>
                          )}
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {data.otherIncome.map(a => <PnlRow key={a.code} code={a.code} label={a.name} amount={a.amount} indent />)}
            <SubtotalRow label="Total Revenue" amount={data.totalRevenue} highlight="muted" />

            {(data.costOfSales.length > 0 || true) && (
              <>
                <SectionHeader title="Less: Cost of Sales" />
                {data.costOfSales.length > 0
                  ? data.costOfSales.map(a => {
                      const isExpanded = Boolean(expandedRows[a.code]);
                      return (
                        <div key={a.code} className="transition-all">
                          <PnlRow
                            code={a.code}
                            label={a.name}
                            amount={a.amount}
                            indent
                            clickable
                            isExpanded={isExpanded}
                            onClick={() => toggleRow(a.code)}
                          />
                          {isExpanded && (
                            <div className="ml-8 mr-2 my-2 border border-amber-200 rounded-lg bg-amber-50/20 overflow-hidden shadow-sm animate-in fade-in duration-200">
                              <div className="flex items-center justify-between px-3 py-2 bg-amber-50/60 border-b border-amber-100 text-xs">
                                <span className="font-semibold text-amber-900 flex items-center gap-1.5">
                                  <ShoppingCart className="h-3.5 w-3.5 text-amber-600" />
                                  Cost of Sales &amp; Vendor Invoices — {vendorInvoices.length} invoice{vendorInvoices.length !== 1 ? "s" : ""}
                                </span>
                                <span className="font-mono text-muted-foreground">
                                  Total: <strong className="text-gray-900">{fmtSGD(vendorInvoices.reduce((s, vi) => s + (parseFloat(String(vi.totalAmount || 0)) || 0), 0))}</strong>
                                </span>
                              </div>
                              <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                  <thead className="bg-slate-100 border-b border-slate-200 uppercase font-semibold text-slate-700">
                                    <tr>
                                      <th className="py-2.5 px-3 text-left whitespace-nowrap">Invoice No.</th>
                                      <th className="py-2.5 px-3 text-left whitespace-nowrap">Vendor</th>
                                      <th className="py-2.5 px-3 text-left whitespace-nowrap">Date</th>
                                      <th className="py-2.5 px-3 text-right whitespace-nowrap">Net (S$)</th>
                                      <th className="py-2.5 px-3 text-right whitespace-nowrap">GST (S$)</th>
                                      <th className="py-2.5 px-3 text-right whitespace-nowrap">Total Amount (S$)</th>
                                      <th className="py-2.5 px-3 text-center whitespace-nowrap">Status</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-100 bg-white">
                                    {vendorInvoices.length === 0 ? (
                                      <tr>
                                        <td colSpan={7} className="py-4 text-center text-gray-400 italic">No vendor invoices recorded.</td>
                                      </tr>
                                    ) : (
                                      vendorInvoices.map((vi: any) => {
                                        const tot = parseFloat(String(vi.totalAmount || 0)) || 0;
                                        const gst = parseFloat(String(vi.gstAmount || 0)) || 0;
                                        const net = tot - gst;
                                        return (
                                          <tr key={vi.id} className="hover:bg-slate-50 transition-colors">
                                            <td className="py-2 px-3 font-mono font-medium text-gray-800 whitespace-nowrap">{vi.piNumber || `PI-${vi.id}`}</td>
                                            <td className="py-2 px-3 font-medium text-gray-900 whitespace-nowrap">{vi.vendorName || "—"}</td>
                                            <td className="py-2 px-3 text-gray-600 whitespace-nowrap">{vi.piDate ? fmtDate(vi.piDate) : "—"}</td>
                                            <td className="py-2 px-3 text-right font-mono whitespace-nowrap">{fmtSGD(net)}</td>
                                            <td className="py-2 px-3 text-right font-mono text-gray-600 whitespace-nowrap">{fmtSGD(gst)}</td>
                                            <td className="py-2 px-3 text-right font-mono font-semibold text-gray-900 whitespace-nowrap">{fmtSGD(tot)}</td>
                                            <td className="py-2 px-3 text-center whitespace-nowrap">
                                              <span className="text-[10px] px-2 py-0.5 rounded-full font-medium uppercase bg-blue-100 text-blue-700">
                                                {vi.status || "Posted"}
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
                                        <td colSpan={3} className="py-2.5 px-3 uppercase text-gray-600">Total Purchases ({vendorInvoices.length})</td>
                                        <td className="py-2.5 px-3 text-right font-mono">
                                          {fmtSGD(vendorInvoices.reduce((s, vi) => s + ((parseFloat(String(vi.totalAmount || 0)) || 0) - (parseFloat(String(vi.gstAmount || 0)) || 0)), 0))}
                                        </td>
                                        <td className="py-2.5 px-3 text-right font-mono text-gray-600">
                                          {fmtSGD(vendorInvoices.reduce((s, vi) => s + (parseFloat(String(vi.gstAmount || 0)) || 0), 0))}
                                        </td>
                                        <td className="py-2.5 px-3 text-right font-mono text-gray-900">
                                          {fmtSGD(vendorInvoices.reduce((s, vi) => s + (parseFloat(String(vi.totalAmount || 0)) || 0), 0))}
                                        </td>
                                        <td></td>
                                      </tr>
                                    </tfoot>
                                  )}
                                </table>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })
                  : <p className="text-xs text-muted-foreground px-8 py-1 italic">No cost of sales recorded</p>
                }
                <SubtotalRow label="Total Cost of Sales" amount={data.totalCostOfSales} />
              </>
            )}

            <div className="pt-2">
              <Separator />
              <PnlRow label="Gross Profit" amount={data.grossProfit} bold highlight={data.grossProfit >= 0 ? "green" : "red"} />
            </div>

            <SectionHeader title="Less: Operating Expenses" />
            {data.operatingExpenses.length > 0
              ? data.operatingExpenses.map(a => {
                  const isPayroll = a.code === "6000" || a.code === "6010" || /salaries|wages|cpf|staff/i.test(a.name);
                  const isExpanded = Boolean(expandedRows[a.code]);
                  const rowExpenses = expenses.filter((e: any) => {
                    if (String(e.category) === String(a.code)) return true;
                    if (e.category && a.name.toLowerCase().includes(String(e.category).replace(/_/g, " ").toLowerCase())) return true;
                    return false;
                  });
                  const displayExpenses = rowExpenses.length > 0 ? rowExpenses : expenses;

                  return (
                    <div key={a.code} className="transition-all">
                      <PnlRow
                        code={a.code}
                        label={a.name}
                        amount={a.amount}
                        indent
                        clickable
                        isExpanded={isExpanded}
                        onClick={() => toggleRow(a.code)}
                      />
                      {isExpanded && isPayroll && (
                        <div className="ml-8 mr-2 my-2 border border-blue-200 rounded-lg bg-blue-50/20 overflow-hidden shadow-sm animate-in fade-in duration-200">
                          <div className="flex items-center justify-between px-3 py-2 bg-blue-50/60 border-b border-blue-100 text-xs">
                            <span className="font-semibold text-blue-900 flex items-center gap-1.5">
                              <Users className="h-3.5 w-3.5 text-blue-600" />
                              Staff Costs &amp; Payroll Breakdown (Salaries &amp; Employer CPF) — {payrollRecords.length} record{payrollRecords.length !== 1 ? "s" : ""}
                            </span>
                            <span className="font-mono text-muted-foreground">
                              Total Gross: <strong className="text-gray-900">{fmtSGD(payrollRecords.reduce((s, r) => s + (parseFloat(String(r.gross_pay || 0)) || 0), 0))}</strong>
                            </span>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead className="bg-slate-100 border-b border-slate-200 uppercase font-semibold text-slate-700">
                                <tr>
                                  <th className="py-2.5 px-3 text-left whitespace-nowrap">Employee</th>
                                  <th className="py-2.5 px-3 text-left whitespace-nowrap">Period</th>
                                  <th className="py-2.5 px-3 text-right whitespace-nowrap">Gross Salary (S$)</th>
                                  <th className="py-2.5 px-3 text-right whitespace-nowrap">Employer CPF (S$)</th>
                                  <th className="py-2.5 px-3 text-right whitespace-nowrap">Net Pay (S$)</th>
                                  <th className="py-2.5 px-3 text-right whitespace-nowrap">Total Staff Cost (S$)</th>
                                  <th className="py-2.5 px-3 text-center whitespace-nowrap">Status</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100 bg-white">
                                {payrollRecords.length === 0 ? (
                                  <tr>
                                    <td colSpan={7} className="py-4 text-center text-gray-400 italic">No payroll records found for this period.</td>
                                  </tr>
                                ) : (
                                  payrollRecords.map((r: any) => {
                                    const emp = employees.find((e: any) => Number(e.id) === Number(r.employee_id));
                                    const gross = parseFloat(String(r.gross_pay || 0)) || 0;
                                    const net = parseFloat(String(r.net_pay || 0)) || 0;
                                    const emprCpf = parseFloat(String(r.cpf_employer || 0)) || 0;
                                    const totalCost = gross + emprCpf;
                                    return (
                                      <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="py-2 px-3 whitespace-nowrap">
                                          <div className="font-medium text-gray-900">{emp?.name || `Employee ${r.employee_id}`}</div>
                                          <div className="text-[10px] text-gray-500 font-mono">{emp?.employeeId || emp?.designation || ""}</div>
                                        </td>
                                        <td className="py-2 px-3 text-gray-600 whitespace-nowrap">
                                          {r.pay_period_start ? new Date(r.pay_period_start).toLocaleDateString("en-SG", { month: "short", year: "numeric" }) : "—"}
                                        </td>
                                        <td className="py-2 px-3 text-right font-mono whitespace-nowrap">{fmtSGD(gross)}</td>
                                        <td className="py-2 px-3 text-right font-mono text-amber-700 whitespace-nowrap">{fmtSGD(emprCpf)}</td>
                                        <td className="py-2 px-3 text-right font-mono text-gray-800 whitespace-nowrap">{fmtSGD(net)}</td>
                                        <td className="py-2 px-3 text-right font-mono font-semibold text-blue-700 whitespace-nowrap">{fmtSGD(totalCost)}</td>
                                        <td className="py-2 px-3 text-center whitespace-nowrap">
                                          <span className="text-[10px] px-2 py-0.5 rounded-full font-medium uppercase bg-emerald-100 text-emerald-700">
                                            {r.status || "Processed"}
                                          </span>
                                        </td>
                                      </tr>
                                    );
                                  })
                                )}
                              </tbody>
                              {payrollRecords.length > 0 && (
                                <tfoot className="bg-slate-50 border-t border-slate-200 font-semibold text-gray-900">
                                  <tr>
                                    <td colSpan={2} className="py-2.5 px-3 uppercase text-gray-600">Total Staff Costs ({payrollRecords.length})</td>
                                    <td className="py-2.5 px-3 text-right font-mono">
                                      {fmtSGD(payrollRecords.reduce((s, r) => s + (parseFloat(String(r.gross_pay || 0)) || 0), 0))}
                                    </td>
                                    <td className="py-2.5 px-3 text-right font-mono text-amber-700">
                                      {fmtSGD(payrollRecords.reduce((s, r) => s + (parseFloat(String(r.cpf_employer || 0)) || 0), 0))}
                                    </td>
                                    <td className="py-2.5 px-3 text-right font-mono">
                                      {fmtSGD(payrollRecords.reduce((s, r) => s + (parseFloat(String(r.net_pay || 0)) || 0), 0))}
                                    </td>
                                    <td className="py-2.5 px-3 text-right font-mono text-blue-700">
                                      {fmtSGD(payrollRecords.reduce((s, r) => s + (parseFloat(String(r.gross_pay || 0)) || 0) + (parseFloat(String(r.cpf_employer || 0)) || 0), 0))}
                                    </td>
                                    <td></td>
                                  </tr>
                                </tfoot>
                              )}
                            </table>
                          </div>
                        </div>
                      )}
                      {isExpanded && !isPayroll && (
                        <div className="ml-8 mr-2 my-2 border border-gray-200 rounded-lg bg-gray-50/50 overflow-hidden shadow-sm animate-in fade-in duration-200">
                          <div className="flex items-center justify-between px-3 py-2 bg-gray-100/70 border-b border-gray-200 text-xs">
                            <span className="font-semibold text-gray-900 flex items-center gap-1.5">
                              <Receipt className="h-3.5 w-3.5 text-blue-600" />
                              {a.name} Breakdown — {displayExpenses.length} record{displayExpenses.length !== 1 ? "s" : ""}
                            </span>
                            <span className="font-mono text-muted-foreground">
                              Total: <strong className="text-gray-900">{fmtSGD(displayExpenses.reduce((s: number, e: any) => s + (parseFloat(String(e.amount || 0)) || 0), 0))}</strong>
                            </span>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead className="bg-slate-100 border-b border-slate-200 uppercase font-semibold text-slate-700">
                                <tr>
                                  <th className="py-2.5 px-3 text-left whitespace-nowrap">Date</th>
                                  <th className="py-2.5 px-3 text-left whitespace-nowrap">Category</th>
                                  <th className="py-2.5 px-3 text-left whitespace-nowrap">Vendor / Payee</th>
                                  <th className="py-2.5 px-3 text-left whitespace-nowrap">Description</th>
                                  <th className="py-2.5 px-3 text-left whitespace-nowrap">Payment Method</th>
                                  <th className="py-2.5 px-3 text-right whitespace-nowrap">Amount (S$)</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100 bg-white">
                                {displayExpenses.length === 0 ? (
                                  <tr>
                                    <td colSpan={6} className="py-4 text-center text-gray-400 italic">No expenses recorded for this account.</td>
                                  </tr>
                                ) : (
                                  displayExpenses.map((e: any) => (
                                    <tr key={e.id} className="hover:bg-slate-50 transition-colors">
                                      <td className="py-2 px-3 text-gray-600 whitespace-nowrap">{e.expenseDate ? fmtDate(e.expenseDate) : "—"}</td>
                                      <td className="py-2 px-3 capitalize text-gray-700 whitespace-nowrap">{String(e.category || "").replace(/_/g, " ")}</td>
                                      <td className="py-2 px-3 font-medium text-gray-900 whitespace-nowrap">{e.vendorName || "—"}</td>
                                      <td className="py-2 px-3 text-gray-600 truncate max-w-xs">{e.description || "—"}</td>
                                      <td className="py-2 px-3 capitalize text-gray-500 whitespace-nowrap">{String(e.paymentMethod || "").replace(/_/g, " ")}</td>
                                      <td className="py-2 px-3 text-right font-mono font-medium text-gray-900 whitespace-nowrap">{fmtSGD(parseFloat(String(e.amount || 0)) || 0)}</td>
                                    </tr>
                                  ))
                                )}
                              </tbody>
                              {displayExpenses.length > 0 && (
                                <tfoot className="bg-slate-50 border-t border-slate-200 font-semibold text-gray-900">
                                  <tr>
                                    <td colSpan={5} className="py-2.5 px-3 uppercase text-gray-600">Total ({displayExpenses.length})</td>
                                    <td className="py-2.5 px-3 text-right font-mono text-red-700">
                                      {fmtSGD(displayExpenses.reduce((s: number, e: any) => s + (parseFloat(String(e.amount || 0)) || 0), 0))}
                                    </td>
                                  </tr>
                                </tfoot>
                              )}
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              : <p className="text-xs text-muted-foreground px-8 py-1 italic">No operating expenses recorded</p>
            }
            <SubtotalRow label="Total Operating Expenses" amount={data.totalOperatingExpenses} />

            <div className="pt-2">
              <Separator />
              <PnlRow label="Operating Profit (EBIT)" amount={data.operatingProfit} bold highlight={data.operatingProfit >= 0 ? "muted" : "red"} />
            </div>

            {data.incomeTax !== 0 && (
              <>
                <SectionHeader title="Less: Income Tax" />
                <PnlRow code="7300" label="Income Tax Expense" amount={data.incomeTax} indent />
              </>
            )}

            <div className="pt-3 pb-2">
              <Separator className="mb-2" />
              <Separator />
              <PnlRow
                label={data.netProfit >= 0 ? "Net Profit After Tax" : "Net Loss After Tax"}
                amount={data.netProfit} bold
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
        </>
      )}

      {loading && !data && (
        <div className="flex justify-center py-16">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      )}
    </div>
  );
}
