import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/auth-context";
import { ArrowLeft, Printer, Info, ChevronDown, ChevronRight } from "lucide-react";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";

interface F5Data {
  period: { from: string | null; to: string | null };
  company: { name: string; gstRegistrationNo: string | null; address: string | null };
  gstRate: number;
  box1: number; box2: number; box3: number; box4: number; box5: number;
  box6: number; box7: number; box8: number;
  invoices: Array<{ id: number; invNumber: string; customerName: string; issueDate: string | null; netAmount: number; gstAmount: number; totalAmount: number; status: string; }>;
  vendorInvoices: Array<{ id: number; piNumber: string; vendorName: string; piDate: string | null; totalAmount: number; currency: string; }>;
}

const YEAR = new Date().getFullYear();
const CURRENT_Q = Math.floor(new Date().getMonth() / 3);

const QUARTERS = [
  { label: "Q1", sublabel: "Jan – Mar", from: "-01-01", to: "-03-31" },
  { label: "Q2", sublabel: "Apr – Jun", from: "-04-01", to: "-06-30" },
  { label: "Q3", sublabel: "Jul – Sep", from: "-07-01", to: "-09-30" },
  { label: "Q4", sublabel: "Oct – Dec", from: "-10-01", to: "-12-31" },
];

function fmtAmt(n: number) {
  return new Intl.NumberFormat("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("en-SG", { day: "2-digit", month: "short", year: "numeric" });
}

interface BoxRowProps {
  num: number;
  label: string;
  sublabel?: string;
  amount: number;
  highlight?: "payable" | "refund" | "section";
  manual?: boolean;
}

function F5Box({ num, label, sublabel, amount, highlight, manual }: BoxRowProps) {
  const isPayable  = highlight === "payable";
  const isRefund   = highlight === "refund";
  const isSection  = highlight === "section";
  return (
    <div className={cn(
      "grid grid-cols-[2.5rem_1fr_auto] gap-3 items-start px-4 py-3 border-b last:border-b-0",
      isPayable && "bg-amber-50",
      isRefund  && "bg-emerald-50",
      isSection && "bg-muted/30",
    )}>
      <div className={cn(
        "flex items-center justify-center w-8 h-8 rounded text-xs font-bold shrink-0",
        isPayable ? "bg-amber-200 text-amber-800" : isRefund ? "bg-emerald-200 text-emerald-800" : "bg-muted text-muted-foreground",
      )}>
        {num}
      </div>
      <div>
        <p className={cn("text-sm font-medium", isPayable && "text-amber-900", isRefund && "text-emerald-900")}>{label}</p>
        {sublabel && <p className="text-xs text-muted-foreground mt-0.5">{sublabel}</p>}
        {manual && <p className="text-xs text-blue-600 mt-0.5 flex items-center gap-1"><Info className="h-3 w-3" /> Enter manually if applicable</p>}
      </div>
      <div className={cn(
        "text-right font-mono font-semibold text-sm tabular-nums",
        isPayable ? "text-amber-900" : isRefund ? "text-emerald-900" : "text-foreground",
        amount === 0 && !isPayable && !isRefund ? "text-muted-foreground/60" : "",
      )}>
        S$ {fmtAmt(amount)}
      </div>
    </div>
  );
}

export default function GstF5Page() {
  const [, navigate] = useLocation();
  const { selectedCompany } = useAuth();
  const printRef = useRef<HTMLDivElement>(null);

  const [selYear, setSelYear] = useState(YEAR);
  const [selQuarter, setSelQuarter] = useState<number>(CURRENT_Q);
  const [useCustom, setUseCustom] = useState(false);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo]   = useState("");
  const [showInvoices, setShowInvoices]       = useState(false);
  const [showVendorInvoices, setShowVendorInvoices] = useState(false);

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

  function handlePrint() {
    window.print();
  }

  const box8Highlight = data ? (data.box8 > 0.005 ? "payable" : data.box8 < -0.005 ? "refund" : undefined) : undefined;

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center gap-3 print:hidden">
        <Button variant="ghost" size="icon" onClick={() => navigate("/accounting/profit-loss")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">GST F5 Return</h1>
          <p className="text-sm text-muted-foreground">IRAS Form F5 — Singapore GST Reporting</p>
        </div>
        {data && (
          <Button variant="outline" size="sm" onClick={handlePrint} className="gap-2">
            <Printer className="h-4 w-4" /> Print / Export
          </Button>
        )}
      </div>

      {/* Period selector */}
      <Card className="print:hidden">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Select GST Accounting Period</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Year + Quarter row */}
          <div className="flex flex-wrap items-center gap-3">
            <select
              className="border rounded-md px-3 py-1.5 text-sm bg-background"
              value={selYear}
              onChange={e => { setSelYear(Number(e.target.value)); setUseCustom(false); }}
            >
              {[YEAR - 1, YEAR, YEAR + 1].map(y => <option key={y} value={y}>{y}</option>)}
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

          {/* Custom date range */}
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

          {/* Period display */}
          {enabled && !useCustom && (
            <p className="text-xs text-muted-foreground">
              Period: <span className="font-medium text-foreground">{fmtDate(from)} – {fmtDate(to)}</span>
            </p>
          )}
        </CardContent>
      </Card>

      {/* Loading / Error */}
      {isLoading && <div className="text-center py-12 text-muted-foreground text-sm">Loading GST F5 data…</div>}
      {isError && <div className="text-center py-12 text-red-600 text-sm">{(error as Error).message}</div>}
      {!enabled && !isLoading && <div className="text-center py-8 text-muted-foreground text-sm">Select a period above to generate the F5 return.</div>}

      {/* F5 Report */}
      {data && (
        <div ref={printRef} className="space-y-6">
          {/* Company header */}
          <div className="border rounded-lg p-5 bg-white print:border-none print:p-0">
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-lg font-bold">{data.company.name}</h2>
                {data.company.gstRegistrationNo && (
                  <p className="text-sm text-muted-foreground">GST Reg. No.: <span className="font-medium text-foreground">{data.company.gstRegistrationNo}</span></p>
                )}
                {data.company.address && (
                  <p className="text-xs text-muted-foreground mt-1">{data.company.address}</p>
                )}
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">GST F5 Return</p>
                <p className="text-sm font-medium mt-1">{fmtDate(data.period.from)} – {fmtDate(data.period.to)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">GST Rate: {data.gstRate}%</p>
              </div>
            </div>
          </div>

          {/* Part I: Supplies */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Part I — Value of Supplies</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <F5Box
                num={1}
                label="Total value of standard-rated supplies"
                sublabel="Net taxable sales (excl. GST) from issued invoices in the period"
                amount={data.box1}
              />
              <F5Box
                num={2}
                label="Total value of zero-rated supplies"
                sublabel="Exports and international services (0% GST)"
                amount={data.box2}
                manual
              />
              <F5Box
                num={3}
                label="Total value of exempt supplies"
                sublabel="Residential property, financial services, etc."
                amount={data.box3}
                manual
              />
              <F5Box
                num={5}
                label="Total value of out-of-scope supplies"
                sublabel="Third-country sales and non-business supplies"
                amount={data.box5}
                manual
              />
            </CardContent>
          </Card>

          {/* Part II: Purchases */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Part II — Value of Purchases</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <F5Box
                num={4}
                label="Total value of taxable purchases"
                sublabel="Vendor invoices in the period (all currencies converted to SGD)"
                amount={data.box4}
              />
            </CardContent>
          </Card>

          {/* Part III: GST Computation */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Part III — GST Computation</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <F5Box
                num={6}
                label="Output tax due"
                sublabel={`GST collected on standard-rated supplies at ${data.gstRate}%`}
                amount={data.box6}
              />
              <F5Box
                num={7}
                label="Less: Input tax and refunds claimed"
                sublabel="GST paid on purchases — from account 1110 (GST Input Tax Recoverable)"
                amount={data.box7}
              />
              <F5Box
                num={8}
                label={data.box8 >= 0 ? "Net GST payable to IRAS" : "Net GST refundable from IRAS"}
                sublabel="Box 6 minus Box 7"
                amount={Math.abs(data.box8)}
                highlight={box8Highlight}
              />
            </CardContent>
          </Card>

          {/* Summary callout */}
          <div className={cn(
            "rounded-lg border p-4 flex items-center gap-4",
            data.box8 > 0.005 ? "border-amber-300 bg-amber-50" : data.box8 < -0.005 ? "border-emerald-300 bg-emerald-50" : "border-border bg-muted/30",
          )}>
            <div className="flex-1">
              <p className="text-sm font-semibold">
                {data.box8 > 0.005 ? "GST Payable to IRAS" : data.box8 < -0.005 ? "GST Refundable from IRAS" : "No GST Due"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {data.box8 > 0.005
                  ? "This amount must be paid to IRAS by the due date. File via myTax Portal."
                  : data.box8 < -0.005
                  ? "You may claim this refund from IRAS when filing."
                  : "Output tax equals input tax for this period."}
              </p>
            </div>
            <div className={cn(
              "text-2xl font-bold font-mono tabular-nums",
              data.box8 > 0.005 ? "text-amber-800" : data.box8 < -0.005 ? "text-emerald-800" : "text-muted-foreground",
            )}>
              S$ {fmtAmt(Math.abs(data.box8))}
            </div>
          </div>

          {/* Input Tax note */}
          {data.box7 === 0 && (
            <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800 flex items-start gap-2 print:hidden">
              <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">Box 7 is S$ 0.00.</span> Input tax (Box 7) is pulled from journal lines on account <span className="font-mono font-semibold">1110 – GST Input Tax Recoverable</span>.
                To claim input tax on vendor purchases, post a journal entry debiting account 1110 with the GST amount, or ask your accountant to record the input tax claim.
              </div>
            </div>
          )}

          {/* Supporting details */}
          <div className="space-y-3 print:hidden">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Supporting Details</h3>

            {/* Sales invoices breakdown */}
            <div className="border rounded-lg overflow-hidden">
              <button
                className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 text-sm font-medium transition-colors"
                onClick={() => setShowInvoices(v => !v)}
              >
                <span>Sales Invoices (Box 1 + Box 6) — {data.invoices.length} invoice{data.invoices.length !== 1 ? "s" : ""}</span>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs text-muted-foreground">GST S$ {fmtAmt(data.box6)}</span>
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
                          <th className="text-right px-4 py-2 text-xs font-semibold text-muted-foreground">Net (excl. GST)</th>
                          <th className="text-right px-4 py-2 text-xs font-semibold text-muted-foreground">GST</th>
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
                              <Badge variant={inv.status === "paid" ? "default" : "outline"} className="text-[10px]">
                                {inv.status}
                              </Badge>
                            </td>
                            <td className="px-4 py-2 text-right font-mono text-xs">{fmtAmt(inv.netAmount)}</td>
                            <td className="px-4 py-2 text-right font-mono text-xs text-blue-700">{fmtAmt(inv.gstAmount)}</td>
                            <td className="px-4 py-2 text-right font-mono text-xs font-semibold">{fmtAmt(inv.totalAmount)}</td>
                          </tr>
                        ))}
                        <tr className="bg-muted/30 font-semibold">
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

            {/* Vendor invoices breakdown */}
            <div className="border rounded-lg overflow-hidden">
              <button
                className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 text-sm font-medium transition-colors"
                onClick={() => setShowVendorInvoices(v => !v)}
              >
                <span>Vendor Invoices / Purchases (Box 4) — {data.vendorInvoices.length} record{data.vendorInvoices.length !== 1 ? "s" : ""}</span>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs text-muted-foreground">S$ {fmtAmt(data.box4)}</span>
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
                          <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">PI Number</th>
                          <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Vendor</th>
                          <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Date</th>
                          <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Currency</th>
                          <th className="text-right px-4 py-2 text-xs font-semibold text-muted-foreground">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.vendorInvoices.map((vi, i) => (
                          <tr key={vi.id} className={cn("border-b last:border-b-0", i % 2 === 0 ? "" : "bg-muted/10")}>
                            <td className="px-4 py-2 font-mono text-xs font-medium">{vi.piNumber}</td>
                            <td className="px-4 py-2 text-xs">{vi.vendorName}</td>
                            <td className="px-4 py-2 text-xs text-muted-foreground">{fmtDate(vi.piDate)}</td>
                            <td className="px-4 py-2 text-xs">{vi.currency}</td>
                            <td className="px-4 py-2 text-right font-mono text-xs font-semibold">{fmtAmt(vi.totalAmount)}</td>
                          </tr>
                        ))}
                        <tr className="bg-muted/30 font-semibold">
                          <td colSpan={4} className="px-4 py-2 text-xs text-right text-muted-foreground">Total</td>
                          <td className="px-4 py-2 text-right font-mono text-xs">{fmtAmt(data.box4)}</td>
                        </tr>
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* IRAS disclaimer */}
          <div className="rounded-md bg-muted/30 border px-4 py-3 text-xs text-muted-foreground print:hidden">
            <span className="font-semibold">Disclaimer:</span> This report is generated from system data for reference only.
            Review and verify all figures before filing with IRAS via{" "}
            <a href="https://mytax.iras.gov.sg" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">myTax Portal</a>.
            Boxes 2, 3, and 5 require manual input if applicable.
          </div>
        </div>
      )}
    </div>
  );
}
