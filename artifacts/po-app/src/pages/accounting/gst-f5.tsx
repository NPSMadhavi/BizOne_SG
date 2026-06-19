import { useState, useRef } from "react";
import { createPortal } from "react-dom";
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
    piDate: string | null; totalAmount: number; currency: string;
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

// ─── Print CSS ───────────────────────────────────────────────────────────────

const PRINT_STYLE = `
@media print {
  body > *:not(#gst-f5-print-root) { display: none !important; }
  #gst-f5-print-root { display: block !important; position: static !important; }
}
`;

// ─── Printable F5 Form ───────────────────────────────────────────────────────

function PrintableF5({ data, from, to }: { data: F5Data; from: string; to: string }) {
  const box8Payable  = data.box8 > 0.005;
  const box8Refund   = data.box8 < -0.005;

  const boxValue = (n: number): number => {
    if (n === 1) return data.box1;
    if (n === 2) return data.box2;
    if (n === 3) return data.box3;
    if (n === 4) return data.box4;
    if (n === 5) return data.box5;
    if (n === 6) return data.box6;
    if (n === 7) return data.box7;
    if (n === 8) return Math.abs(data.box8);
    return 0;
  };

  return (
    <div id="gst-f5-print-root" style={{ fontFamily: "Arial, sans-serif", fontSize: "11pt", color: "#000", maxWidth: "210mm", margin: "0 auto", padding: "12mm 15mm", background: "#fff" }}>
      {/* Header */}
      <div style={{ textAlign: "center", borderBottom: "3px solid #1a365d", paddingBottom: "10px", marginBottom: "16px" }}>
        <div style={{ fontSize: "8pt", color: "#555", letterSpacing: "2px", textTransform: "uppercase", marginBottom: "4px" }}>Inland Revenue Authority of Singapore</div>
        <div style={{ fontSize: "16pt", fontWeight: "bold", color: "#1a365d" }}>GST RETURN (FORM F5)</div>
        <div style={{ fontSize: "8pt", color: "#555", marginTop: "3px" }}>This is a computer-generated working paper — file your return at myTax Portal (mytax.iras.gov.sg)</div>
      </div>

      {/* Company + Period */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginBottom: "20px", padding: "10px 12px", background: "#f5f7fa", border: "1px solid #d0d9e8", borderRadius: "4px" }}>
        <div>
          <div style={{ fontSize: "8pt", color: "#555", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "4px" }}>GST-Registered Business</div>
          <div style={{ fontWeight: "bold", fontSize: "12pt" }}>{data.company.name}</div>
          {data.company.gstRegistrationNo && (
            <div style={{ fontSize: "9pt", color: "#333", marginTop: "3px" }}>GST Reg. No.: <strong>{data.company.gstRegistrationNo}</strong></div>
          )}
          {data.company.address && (
            <div style={{ fontSize: "8pt", color: "#666", marginTop: "3px" }}>{data.company.address}</div>
          )}
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "8pt", color: "#555", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "4px" }}>Accounting Period</div>
          <div style={{ fontWeight: "bold", fontSize: "11pt" }}>{fmtDateLong(from)}</div>
          <div style={{ fontSize: "10pt", color: "#555" }}>to</div>
          <div style={{ fontWeight: "bold", fontSize: "11pt" }}>{fmtDateLong(to)}</div>
          <div style={{ fontSize: "8pt", color: "#666", marginTop: "6px" }}>GST Rate: {data.gstRate}%</div>
        </div>
      </div>

      {/* Section A: Supplies */}
      <div style={{ marginBottom: "18px" }}>
        <div style={{ background: "#1a365d", color: "#fff", fontWeight: "bold", fontSize: "9pt", letterSpacing: "1px", padding: "5px 10px", marginBottom: "0" }}>
          PART I — DECLARATION OF TOTAL VALUE OF SUPPLIES
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#e8edf5", fontSize: "8pt", color: "#333" }}>
              <th style={{ border: "1px solid #b8c8d8", padding: "5px 8px", width: "38px", textAlign: "center" }}>Box</th>
              <th style={{ border: "1px solid #b8c8d8", padding: "5px 8px", textAlign: "left" }}>Description</th>
              <th style={{ border: "1px solid #b8c8d8", padding: "5px 8px", width: "130px", textAlign: "right" }}>Amount (S$)</th>
            </tr>
          </thead>
          <tbody>
            {[1, 2, 3, 5].map(n => {
              const box = IRAS_BOXES.find(b => b.num === n)!;
              const val = boxValue(n);
              return (
                <tr key={n} style={{ background: n % 2 === 0 ? "#fafbfd" : "#fff" }}>
                  <td style={{ border: "1px solid #ccd6e2", padding: "7px 8px", textAlign: "center", fontWeight: "bold", color: "#1a365d" }}>{n}</td>
                  <td style={{ border: "1px solid #ccd6e2", padding: "7px 8px" }}>
                    <div style={{ fontWeight: "600", fontSize: "9.5pt" }}>{box.label}</div>
                    <div style={{ fontSize: "7.5pt", color: "#666", marginTop: "2px" }}>{box.desc}</div>
                  </td>
                  <td style={{ border: "1px solid #ccd6e2", padding: "7px 8px", textAlign: "right", fontFamily: "monospace", fontSize: "10pt", color: val === 0 ? "#aaa" : "#000" }}>
                    {fmtAmt(val)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Section B: Purchases */}
      <div style={{ marginBottom: "18px" }}>
        <div style={{ background: "#1a365d", color: "#fff", fontWeight: "bold", fontSize: "9pt", letterSpacing: "1px", padding: "5px 10px" }}>
          PART II — DECLARATION OF TOTAL VALUE OF PURCHASES AND IMPORTS
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#e8edf5", fontSize: "8pt", color: "#333" }}>
              <th style={{ border: "1px solid #b8c8d8", padding: "5px 8px", width: "38px", textAlign: "center" }}>Box</th>
              <th style={{ border: "1px solid #b8c8d8", padding: "5px 8px", textAlign: "left" }}>Description</th>
              <th style={{ border: "1px solid #b8c8d8", padding: "5px 8px", width: "130px", textAlign: "right" }}>Amount (S$)</th>
            </tr>
          </thead>
          <tbody>
            {[4].map(n => {
              const box = IRAS_BOXES.find(b => b.num === n)!;
              const val = boxValue(n);
              return (
                <tr key={n}>
                  <td style={{ border: "1px solid #ccd6e2", padding: "7px 8px", textAlign: "center", fontWeight: "bold", color: "#1a365d" }}>{n}</td>
                  <td style={{ border: "1px solid #ccd6e2", padding: "7px 8px" }}>
                    <div style={{ fontWeight: "600", fontSize: "9.5pt" }}>{box.label}</div>
                    <div style={{ fontSize: "7.5pt", color: "#666", marginTop: "2px" }}>{box.desc}</div>
                  </td>
                  <td style={{ border: "1px solid #ccd6e2", padding: "7px 8px", textAlign: "right", fontFamily: "monospace", fontSize: "10pt", color: val === 0 ? "#aaa" : "#000" }}>
                    {fmtAmt(val)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Section C: GST Computation */}
      <div style={{ marginBottom: "18px" }}>
        <div style={{ background: "#1a365d", color: "#fff", fontWeight: "bold", fontSize: "9pt", letterSpacing: "1px", padding: "5px 10px" }}>
          PART III — GST COMPUTATION
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#e8edf5", fontSize: "8pt", color: "#333" }}>
              <th style={{ border: "1px solid #b8c8d8", padding: "5px 8px", width: "38px", textAlign: "center" }}>Box</th>
              <th style={{ border: "1px solid #b8c8d8", padding: "5px 8px", textAlign: "left" }}>Description</th>
              <th style={{ border: "1px solid #b8c8d8", padding: "5px 8px", width: "130px", textAlign: "right" }}>Amount (S$)</th>
            </tr>
          </thead>
          <tbody>
            {[6, 7].map(n => {
              const box = IRAS_BOXES.find(b => b.num === n)!;
              const val = boxValue(n);
              return (
                <tr key={n} style={{ background: n === 7 ? "#fafbfd" : "#fff" }}>
                  <td style={{ border: "1px solid #ccd6e2", padding: "7px 8px", textAlign: "center", fontWeight: "bold", color: "#1a365d" }}>{n}</td>
                  <td style={{ border: "1px solid #ccd6e2", padding: "7px 8px" }}>
                    <div style={{ fontWeight: "600", fontSize: "9.5pt" }}>{box.label}</div>
                    <div style={{ fontSize: "7.5pt", color: "#666", marginTop: "2px" }}>{box.desc}</div>
                  </td>
                  <td style={{ border: "1px solid #ccd6e2", padding: "7px 8px", textAlign: "right", fontFamily: "monospace", fontSize: "10pt", color: val === 0 ? "#aaa" : "#000" }}>
                    {fmtAmt(val)}
                  </td>
                </tr>
              );
            })}
            {/* Box 8 highlighted */}
            <tr style={{ background: box8Payable ? "#fffbeb" : box8Refund ? "#f0fdf4" : "#f5f5f5" }}>
              <td style={{ border: "2px solid #1a365d", padding: "9px 8px", textAlign: "center", fontWeight: "bold", fontSize: "11pt", color: "#1a365d" }}>8</td>
              <td style={{ border: "2px solid #1a365d", padding: "9px 8px" }}>
                <div style={{ fontWeight: "700", fontSize: "10pt" }}>
                  {box8Payable ? "Net GST to be paid to Comptroller of GST" : box8Refund ? "Net GST to be claimed from Comptroller of GST" : "Net GST (payable / claimable)"}
                </div>
                <div style={{ fontSize: "7.5pt", color: "#555", marginTop: "2px" }}>Box 6 minus Box 7. {box8Payable ? "Make payment by the due date via myTax Portal." : box8Refund ? "Submit claim via myTax Portal." : ""}</div>
              </td>
              <td style={{ border: "2px solid #1a365d", padding: "9px 8px", textAlign: "right", fontFamily: "monospace", fontSize: "13pt", fontWeight: "bold", color: box8Payable ? "#92400e" : box8Refund ? "#14532d" : "#000" }}>
                {fmtAmt(Math.abs(data.box8))}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Declaration */}
      <div style={{ border: "1px solid #b8c8d8", padding: "12px 14px", background: "#f5f7fa", borderRadius: "4px", marginBottom: "18px" }}>
        <div style={{ fontWeight: "bold", fontSize: "9pt", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Declaration</div>
        <div style={{ fontSize: "8.5pt", color: "#333", lineHeight: "1.5" }}>
          I declare that the information provided in this GST Return is true and correct to the best of my knowledge and belief.
          I understand that penalties may be imposed for any false declaration.
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "20px", marginTop: "24px" }}>
          {["Signature", "Name & Designation", "Date"].map(f => (
            <div key={f}>
              <div style={{ borderBottom: "1px solid #888", height: "24px", marginBottom: "4px" }} />
              <div style={{ fontSize: "7.5pt", color: "#666" }}>{f}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div style={{ fontSize: "7pt", color: "#888", textAlign: "center", borderTop: "1px solid #ddd", paddingTop: "8px" }}>
        Generated by RSV Infotech Document Management System · For reference only · File at mytax.iras.gov.sg ·{" "}
        Printed: {new Date().toLocaleDateString("en-SG", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function GstF5Page() {
  const [, navigate] = useLocation();
  useAuth();

  const [selYear,    setSelYear]    = useState(YEAR);
  const [selQuarter, setSelQuarter] = useState<number>(CURRENT_Q);
  const [useCustom,  setUseCustom]  = useState(false);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo,   setCustomTo]   = useState("");

  const [showInvoices,       setShowInvoices]       = useState(false);
  const [showVendorInvoices, setShowVendorInvoices] = useState(false);
  const [showPrint,          setShowPrint]          = useState(false);

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
    setShowPrint(true);
    setTimeout(() => {
      window.print();
      setTimeout(() => setShowPrint(false), 1000);
    }, 150);
  }

  const box8Highlight = data ? (data.box8 > 0.005 ? "payable" : data.box8 < -0.005 ? "refund" : undefined) : undefined;

  return (
    <>
      {/* Inject print CSS */}
      <style>{PRINT_STYLE}</style>

      {/* Portal renders directly into document.body so print CSS can isolate it */}
      {showPrint && data && createPortal(
        <div id="gst-f5-print-root">
          <PrintableF5 data={data} from={from} to={to} />
        </div>,
        document.body
      )}

      {/* ── On-screen UI ── */}
      <div className="max-w-4xl mx-auto space-y-6 pb-12">

        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/accounting/profit-loss")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-bold">GST F5 Return</h1>
            <p className="text-sm text-muted-foreground">IRAS Form F5 — Singapore GST Reporting</p>
          </div>
          {data && (
            <Button variant="outline" size="sm" onClick={handlePrint} className="gap-2">
              <Printer className="h-4 w-4" /> Print / Save as PDF
            </Button>
          )}
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
              <div className="border rounded-lg overflow-hidden">
                <button
                  className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 text-sm font-medium transition-colors"
                  onClick={() => setShowVendorInvoices(v => !v)}
                >
                  <span>Vendor Invoices / Purchases contributing to Box 4 — {data.vendorInvoices.length} record{data.vendorInvoices.length !== 1 ? "s" : ""}</span>
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
                          <tr className="bg-muted/30 font-semibold border-t-2">
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
            <div className="rounded-md bg-muted/30 border px-4 py-3 text-xs text-muted-foreground">
              <span className="font-semibold">Note:</span> Boxes 2, 3, and 5 require manual entry if applicable and are not auto-computed by the system.
              Box 7 (input tax) is sourced from GL account 1110 — ensure your accountant has posted all input tax claims before generating this report.
              File your GST return at{" "}
              <a href="https://mytax.iras.gov.sg" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">mytax.iras.gov.sg</a>.
            </div>
          </div>
        )}
      </div>
    </>
  );
}
