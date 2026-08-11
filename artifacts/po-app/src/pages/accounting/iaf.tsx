import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Download, Loader2, FileText, ShoppingCart, BookOpen, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface IafData {
  saCount: number;
  paCount: number;
  gaCount: number;
  saNet: number;
  saGst: number;
  paNet: number;
  paGst: number;
  filename: string;
  content: string;
}

function fmtAmt(n: number) {
  return new Intl.NumberFormat("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-SG", { day: "2-digit", month: "long", year: "numeric" });
}

const QUARTERS = [
  { label: "Q1", from: (y: number) => `${y}-01-01`, to: (y: number) => `${y}-03-31` },
  { label: "Q2", from: (y: number) => `${y}-04-01`, to: (y: number) => `${y}-06-30` },
  { label: "Q3", from: (y: number) => `${y}-07-01`, to: (y: number) => `${y}-09-30` },
  { label: "Q4", from: (y: number) => `${y}-10-01`, to: (y: number) => `${y}-12-31` },
];

export default function IafPage() {
  const yr = new Date().getFullYear();
  const [fromDate, setFromDate] = useState(`${yr}-01-01`);
  const [toDate,   setToDate]   = useState(`${yr}-12-31`);
  const [downloading, setDownloading] = useState(false);

  const { data, isLoading, error } = useQuery<IafData>({
    queryKey: ["iaf", fromDate, toDate],
    queryFn: () =>
      fetch(`/api/iaf?from=${fromDate}&to=${toDate}`, { credentials: "include" })
        .then(async r => { if (!r.ok) { const e = await r.json(); throw new Error(e.error || "Failed"); } return r.json(); }),
    enabled: !!fromDate && !!toDate,
  });

  function downloadIaf() {
    if (!data) return;
    setDownloading(true);
    try {
      const blob = new Blob([data.content], { type: "text/plain;charset=utf-8" });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = data.filename;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }

  const isActive = (f: string, t: string) => fromDate === f && toDate === t;

  const statCards = data ? [
    {
      icon: FileText,
      label: "Supply Transactions (SA)",
      count: data.saCount,
      sub: `Net SGD ${fmtAmt(data.saNet)} · GST SGD ${fmtAmt(data.saGst)}`,
      color: "text-blue-600 bg-blue-50",
    },
    {
      icon: ShoppingCart,
      label: "Purchase Transactions (PA)",
      count: data.paCount,
      sub: `Net SGD ${fmtAmt(data.paNet)} · GST SGD ${fmtAmt(data.paGst)}`,
      color: "text-amber-600 bg-amber-50",
    },
    {
      icon: BookOpen,
      label: "General Ledger Lines (GA)",
      count: data.gaCount,
      sub: "From posted journal entries",
      color: "text-emerald-600 bg-emerald-50",
    },
  ] : [];

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#2563EB]">IRAS Audit File (IAF)</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Pipe-delimited text file for IRAS GST audit — SA (supply) · PA (purchase) · GA (general ledger)
          </p>
        </div>
        <Button onClick={downloadIaf} disabled={!data || downloading} className="gap-2">
          {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Download IAF
        </Button>
      </div>

      {/* Info banner */}
      <div className="flex gap-3 p-4 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-100 text-sm text-blue-800 dark:text-blue-200">
        <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
        <div className="space-y-1">
          <p className="font-medium">About the IAF format</p>
          <p className="text-xs opacity-80">
            The IRAS Audit File is a standardised pipe-delimited text file required by IRAS for GST-registered businesses.
            Supply records come from confirmed invoices; purchase records from recorded vendor invoices;
            general ledger records from posted journal entries.
            Vendor GST registration status is read from your Vendor Directory.
          </p>
        </div>
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
      ) : error ? (
        <div className="text-center py-16 text-red-500 text-sm">{(error as Error).message}</div>
      ) : data ? (
        <div className="space-y-4">
          {/* Period label */}
          <div className="bg-[#1a365d] text-white rounded-xl px-5 py-4">
            <p className="text-xs text-blue-300 uppercase tracking-wider mb-0.5">Audit Period</p>
            <p className="font-semibold">{fmtDate(fromDate)} – {fmtDate(toDate)}</p>
            <p className="text-xs text-blue-300 mt-1">{data.filename}</p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {statCards.map(card => (
              <div key={card.label} className="bg-card border rounded-xl p-5 space-y-3">
                <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center", card.color)}>
                  <card.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold tabular-nums">{card.count}</p>
                  <p className="text-sm font-medium text-foreground leading-tight">{card.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{card.sub}</p>
                </div>
              </div>
            ))}
          </div>

          {/* File preview (first 10 lines) */}
          <div className="bg-card border rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b bg-muted/30 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">File Preview</span>
              <span className="text-xs text-muted-foreground">{data.content.split("\r\n").length} lines total</span>
            </div>
            <pre className="px-5 py-4 text-xs font-mono text-foreground/80 overflow-x-auto leading-relaxed whitespace-pre">
              {data.content.split("\r\n").slice(0, 12).join("\n")}
              {data.content.split("\r\n").length > 12 && "\n…"}
            </pre>
          </div>

          <Button onClick={downloadIaf} disabled={downloading} size="lg" className="w-full gap-2">
            {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Download {data.filename}
          </Button>
        </div>
      ) : (
        <div className="text-center py-20 text-muted-foreground text-sm">
          Select a period above to generate the IAF.
        </div>
      )}
    </div>
  );
}
