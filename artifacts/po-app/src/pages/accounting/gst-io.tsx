import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Download, Info, ListFilter } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePagination } from "@/hooks/use-pagination";
import { ListPagination } from "@/components/list-pagination";

// ─── Types ────────────────────────────────────────────────────────────────────

interface OutputLine {
  date: string; docNo: string; party: string;
  taxType: "SR" | "ZR";
  taxableAmt: number; gstAmt: number; totalAmt: number; status: string;
}
interface InputLine {
  date: string; docNo: string; party: string;
  taxType: "TX" | "EP" | "NR";
  taxableAmt: number; gstAmt: number; totalAmt: number; currency: string;
}
interface GstIoData {
  period: { from: string | null; to: string | null };
  company: { name: string; gstRegistrationNo: string; address: string };
  gstRate: number;
  outputLines: OutputLine[];
  inputLines:  InputLine[];
  summary: {
    outputSR: number; outputSRGst: number;
    outputZR: number;
    inputTX: number; inputTXGst: number;
    netGst: number;
  };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const YEAR = new Date().getFullYear();
const CURRENT_Q = Math.floor(new Date().getMonth() / 3);

const QUARTERS = [
  { label: "Q1", from: "-01-01", to: "-03-31" },
  { label: "Q2", from: "-04-01", to: "-06-30" },
  { label: "Q3", from: "-07-01", to: "-09-30" },
  { label: "Q4", from: "-10-01", to: "-12-31" },
];

const TAX_TYPE_META: Record<string, { label: string; color: string; title: string }> = {
  SR:  { label: "SR",  color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",  title: "Standard Rated" },
  ZR:  { label: "ZR",  color: "bg-blue-100  text-blue-800  dark:bg-blue-900  dark:text-blue-200",   title: "Zero Rated" },
  TX:  { label: "TX",  color: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",  title: "Taxable Purchase" },
  EP:  { label: "EP",  color: "bg-gray-100  text-gray-700  dark:bg-gray-800  dark:text-gray-300",   title: "Exempt Purchase" },
  NR:  { label: "NR",  color: "bg-red-100   text-red-700   dark:bg-red-900   dark:text-red-300",    title: "Non-Recoverable (Overseas)" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function downloadCsv(data: GstIoData, from: string, to: string) {
  const rows: string[] = [];
  rows.push(`GST Input/Output Tax Listing`);
  rows.push(`Company,${data.company.name}`);
  rows.push(`GST Reg No,${data.company.gstRegistrationNo}`);
  rows.push(`Period,${from} to ${to}`);
  rows.push(``);

  rows.push(`OUTPUT TAX (Sales)`);
  rows.push(`Date,Doc No.,Customer,Tax Type,Taxable Amount (SGD),GST Amount (SGD),Total (SGD),Status`);
  for (const l of data.outputLines) {
    rows.push(`${l.date},${l.docNo},"${l.party}",${l.taxType},${l.taxableAmt.toFixed(2)},${l.gstAmt.toFixed(2)},${l.totalAmt.toFixed(2)},${l.status}`);
  }
  rows.push(`,,,,${data.summary.outputSR.toFixed(2)},${data.summary.outputSRGst.toFixed(2)},,`);
  rows.push(``);

  rows.push(`INPUT TAX (Purchases)`);
  rows.push(`Date,Doc No.,Vendor,Tax Type,Taxable Amount,GST Amount,Total,Currency`);
  for (const l of data.inputLines) {
    rows.push(`${l.date},${l.docNo},"${l.party}",${l.taxType},${l.taxableAmt.toFixed(2)},${l.gstAmt.toFixed(2)},${l.totalAmt.toFixed(2)},${l.currency}`);
  }
  rows.push(`,,,,${data.summary.inputTX.toFixed(2)},${data.summary.inputTXGst.toFixed(2)},,`);
  rows.push(``);

  rows.push(`SUMMARY`);
  rows.push(`Output GST (Box 6),${data.summary.outputSRGst.toFixed(2)}`);
  rows.push(`Input GST (Box 7),${data.summary.inputTXGst.toFixed(2)}`);
  rows.push(`Net GST (Box 8),${data.summary.netGst.toFixed(2)}`);

  const blob = new Blob([rows.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `GST_IO_Listing_${from}_${to}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Period Selector ─────────────────────────────────────────────────────────

interface PeriodSelectorProps {
  fromDate: string; toDate: string;
  setFromDate: (v: string) => void; setToDate: (v: string) => void;
}
function PeriodSelector({ fromDate, toDate, setFromDate, setToDate }: PeriodSelectorProps) {
  const chipCls = (active: boolean) =>
    `px-3 py-1 rounded-full text-xs font-medium border transition-colors cursor-pointer ${
      active ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border text-muted-foreground hover:border-primary hover:text-foreground"
    }`;
  const isActive = (f: string, t: string) => fromDate === f && toDate === t;

  return (
    <Card className="mb-6">
      <CardContent className="pt-4 pb-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">From</label>
              <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
                className="border rounded-md px-3 py-1.5 text-sm bg-background" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">To</label>
              <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
                className="border rounded-md px-3 py-1.5 text-sm bg-background" />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {[YEAR, YEAR - 1].map(y => (
              <button key={y} type="button"
                className={chipCls(isActive(`${y}-01-01`, `${y}-12-31`))}
                onClick={() => { setFromDate(`${y}-01-01`); setToDate(`${y}-12-31`); }}>
                FY {y}
              </button>
            ))}
            {QUARTERS.map((q, i) => (
              <button key={q.label} type="button"
                className={chipCls(isActive(`${YEAR}${q.from}`, `${YEAR}${q.to}`))}
                onClick={() => { setFromDate(`${YEAR}${q.from}`); setToDate(`${YEAR}${q.to}`); }}>
                {q.label} {YEAR}
              </button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Tax Type Badge ───────────────────────────────────────────────────────────

function TaxBadge({ type }: { type: string }) {
  const meta = TAX_TYPE_META[type] ?? { label: type, color: "bg-gray-100 text-gray-700", title: type };
  return (
    <span title={meta.title} className={`inline-block text-xs font-semibold px-1.5 py-0.5 rounded ${meta.color}`}>
      {meta.label}
    </span>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function GstIoListing() {
  const [fromDate, setFromDate] = useState(`${YEAR}-01-01`);
  const [toDate,   setToDate]   = useState(`${YEAR}-12-31`);
  const [activeTab, setActiveTab] = useState<"output" | "input">("output");

  const { data, isLoading, error } = useQuery<GstIoData>({
    queryKey: ["gst-io-listing", fromDate, toDate],
    queryFn: () =>
      fetch(`/api/gst-io-listing?from=${fromDate}&to=${toDate}`, { credentials: "include" })
        .then(async r => { if (!r.ok) { const e = await r.json(); throw new Error(e.error || "Failed"); } return r.json(); }),
    enabled: !!fromDate && !!toDate,
  });

  const summary = data?.summary;

  const { page: outputPage, setPage: setOutputPage, totalPages: outputTotalPages, paginatedItems: paginatedOutputLines } = usePagination(data?.outputLines ?? []);
  const { page: inputPage, setPage: setInputPage, totalPages: inputTotalPages, paginatedItems: paginatedInputLines } = usePagination(data?.inputLines ?? []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#2563EB]">GST Input/Output Tax Listing</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Detailed GST transaction listing — output tax (sales) · input tax (purchases)
          </p>
        </div>
        <Button
          variant="outline"
          disabled={!data}
          onClick={() => data && downloadCsv(data, fromDate, toDate)}
          className="gap-2 shrink-0"
        >
          <Download className="h-4 w-4" />
          Export CSV
        </Button>
      </div>

      {/* Info */}
      <div className="flex gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-sm text-blue-800 dark:text-blue-200">
        <Info className="h-4 w-4 shrink-0 mt-0.5" />
        <div>
          <strong>Tax codes:</strong> SR = Standard Rated (output) · ZR = Zero Rated (output) ·
          TX = Taxable Purchase (input, GST-registered local vendor) ·
          EP = Exempt Purchase · NR = Non-Recoverable (overseas/non-registered vendor)
        </div>
      </div>

      {/* Period selector */}
      <PeriodSelector fromDate={fromDate} toDate={toDate} setFromDate={setFromDate} setToDate={setToDate} />

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-1 pt-4 px-4">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">SR Taxable Sales</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="text-xl font-bold">SGD {fmt(summary.outputSR)}</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {data?.outputLines.filter(l => l.taxType === "SR").length ?? 0} invoices
              </div>
            </CardContent>
          </Card>
          <Card className="border-green-200 dark:border-green-800">
            <CardHeader className="pb-1 pt-4 px-4">
              <CardTitle className="text-xs font-medium text-green-700 dark:text-green-300 uppercase tracking-wider">Output GST (Box 6)</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="text-xl font-bold text-green-700 dark:text-green-300">SGD {fmt(summary.outputSRGst)}</div>
              <div className="text-xs text-muted-foreground mt-0.5">GST collected from customers</div>
            </CardContent>
          </Card>
          <Card className="border-amber-200 dark:border-amber-800">
            <CardHeader className="pb-1 pt-4 px-4">
              <CardTitle className="text-xs font-medium text-amber-700 dark:text-amber-300 uppercase tracking-wider">Input GST (Box 7)</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="text-xl font-bold text-amber-700 dark:text-amber-300">SGD {fmt(summary.inputTXGst)}</div>
              <div className="text-xs text-muted-foreground mt-0.5">GST paid to vendors</div>
            </CardContent>
          </Card>
          <Card className={summary.netGst >= 0 ? "border-red-200 dark:border-red-800" : "border-green-200 dark:border-green-800"}>
            <CardHeader className="pb-1 pt-4 px-4">
              <CardTitle className={`text-xs font-medium uppercase tracking-wider ${summary.netGst >= 0 ? "text-red-700 dark:text-red-300" : "text-green-700 dark:text-green-300"}`}>
                Net GST (Box 8)
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className={`text-xl font-bold ${summary.netGst >= 0 ? "text-red-700 dark:text-red-300" : "text-green-700 dark:text-green-300"}`}>
                SGD {fmt(Math.abs(summary.netGst))}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {summary.netGst >= 0 ? "Payable to IRAS" : "Claimable from IRAS"}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Loading / Error */}
      {isLoading && (
        <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading...
        </div>
      )}
      {error && (
        <div className="py-8 text-center text-destructive text-sm">
          {(error as Error).message}
        </div>
      )}

      {/* Tabs + Tables */}
      {data && !isLoading && (
        <Card>
          {/* Tab bar */}
          <div className="flex border-b px-6 pt-4 gap-1">
            {(["output", "input"] as const).map(tab => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "px-4 py-2 text-sm font-medium rounded-t-md border-b-2 -mb-px transition-colors",
                  activeTab === tab
                    ? "border-primary text-primary bg-primary/5"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {tab === "output"
                  ? `Output Tax (${data.outputLines.length})`
                  : `Input Tax (${data.inputLines.length})`}
              </button>
            ))}
          </div>

          {/* Output Tax table */}
          {activeTab === "output" && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Date</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Invoice No.</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Customer</th>
                    <th className="text-center px-3 py-2.5 font-medium text-muted-foreground">Type</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Taxable Amt</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">GST Amt</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Total</th>
                    <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.outputLines.length === 0 ? (
                    <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">No output tax transactions in this period</td></tr>
                  ) : paginatedOutputLines.map((l, i) => (
                    <tr key={i} className="hover:bg-muted/30">
                      <td className="px-4 py-2.5 text-muted-foreground">{l.date}</td>
                      <td className="px-4 py-2.5 font-medium">{l.docNo}</td>
                      <td className="px-4 py-2.5">{l.party}</td>
                      <td className="px-3 py-2.5 text-center"><TaxBadge type={l.taxType} /></td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{fmt(l.taxableAmt)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-green-700 dark:text-green-400">{fmt(l.gstAmt)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-medium">{fmt(l.totalAmt)}</td>
                      <td className="px-3 py-2.5 capitalize text-muted-foreground text-xs">{l.status}</td>
                    </tr>
                  ))}
                </tbody>
                {data.outputLines.length > 0 && (
                  <tfoot className="bg-muted/30 border-t-2 font-semibold">
                    <tr>
                      <td colSpan={4} className="px-4 py-2.5 text-right text-muted-foreground text-xs uppercase tracking-wider">Totals</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{fmt(summary?.outputSR ?? 0)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-green-700 dark:text-green-400">{fmt(summary?.outputSRGst ?? 0)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {fmt((summary?.outputSR ?? 0) + (summary?.outputSRGst ?? 0) + (summary?.outputZR ?? 0))}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
              <ListPagination page={outputPage} totalPages={outputTotalPages} onPageChange={setOutputPage} />
            </div>
          )}

          {/* Input Tax table */}
          {activeTab === "input" && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Date</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">PI No.</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Vendor</th>
                    <th className="text-center px-3 py-2.5 font-medium text-muted-foreground">Type</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Taxable Amt</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">GST Amt</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Total</th>
                    <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Curr.</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.inputLines.length === 0 ? (
                    <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">No input tax transactions in this period</td></tr>
                  ) : paginatedInputLines.map((l, i) => (
                    <tr key={i} className="hover:bg-muted/30">
                      <td className="px-4 py-2.5 text-muted-foreground">{l.date}</td>
                      <td className="px-4 py-2.5 font-medium">{l.docNo}</td>
                      <td className="px-4 py-2.5">{l.party}</td>
                      <td className="px-3 py-2.5 text-center"><TaxBadge type={l.taxType} /></td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{fmt(l.taxableAmt)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-amber-700 dark:text-amber-400">{l.gstAmt > 0 ? fmt(l.gstAmt) : "–"}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-medium">{fmt(l.totalAmt)}</td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">{l.currency}</td>
                    </tr>
                  ))}
                </tbody>
                {data.inputLines.length > 0 && (
                  <tfoot className="bg-muted/30 border-t-2 font-semibold">
                    <tr>
                      <td colSpan={4} className="px-4 py-2.5 text-right text-muted-foreground text-xs uppercase tracking-wider">Totals</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{fmt(summary?.inputTX ?? 0)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-amber-700 dark:text-amber-400">{fmt(summary?.inputTXGst ?? 0)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {fmt(data.inputLines.reduce((s, l) => s + l.totalAmt, 0))}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
              <ListPagination page={inputPage} totalPages={inputTotalPages} onPageChange={setInputPage} />
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
