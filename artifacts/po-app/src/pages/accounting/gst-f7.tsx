import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Download, Loader2, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/auth-context";
import { generateGstF7_PDF } from "@/lib/pdf";

interface F7Data {
  originalPeriod: { from: string | null; to: string | null };
  amendedPeriod:  { from: string | null; to: string | null };
  company: { name: string; gstRegistrationNo: string | null; address: string | null };
  gstRate: number;
  original: Record<string, number>;
  amended:  Record<string, number>;
  delta:    Record<string, number>;
}

const YEAR = new Date().getFullYear();
const CURRENT_Q = Math.floor(new Date().getMonth() / 3);
const QUARTERS = [
  { label: "Q1", sublabel: "Jan–Mar", from: "-01-01", to: "-03-31" },
  { label: "Q2", sublabel: "Apr–Jun", from: "-04-01", to: "-06-30" },
  { label: "Q3", sublabel: "Jul–Sep", from: "-07-01", to: "-09-30" },
  { label: "Q4", sublabel: "Oct–Dec", from: "-10-01", to: "-12-31" },
];

const BOX_LABELS: Record<number, string> = {
  1: "Total value of standard-rated supplies",
  2: "Total value of zero-rated supplies",
  3: "Total value of exempt supplies",
  4: "Total value of taxable purchases",
  5: "Total value of out-of-scope supplies",
  6: "Output tax due",
  7: "Less: Input tax and refunds claimed",
  8: "Net GST to be paid / claimed",
};

function fmtAmt(n: number) {
  return new Intl.NumberFormat("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(n));
}
function fmtDateLong(d: string | null) {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("en-SG", { day: "numeric", month: "long", year: "numeric" });
}

function QuarterPicker({ year, setYear, quarter, setQuarter, useCustom, setUseCustom, customFrom, setCustomFrom, customTo, setCustomTo, label }: any) {
  return (
    <div className="space-y-2">
      <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{label}</Label>
      <div className="flex flex-wrap items-center gap-2 p-3 bg-gray-50 border border-gray-200 rounded-lg">
        <select className="border border-gray-200 rounded px-2.5 py-1.5 text-sm bg-white" value={year} onChange={e => { setYear(Number(e.target.value)); setUseCustom(false); }}>
          {[YEAR - 2, YEAR - 1, YEAR, YEAR + 1].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <div className="flex gap-1">
          {QUARTERS.map((q, i) => (
            <button key={i} onClick={() => { setQuarter(i); setUseCustom(false); }}
              className={cn("flex flex-col items-center px-3 py-1.5 rounded border text-xs font-medium transition-colors",
                !useCustom && quarter === i ? "bg-gray-900 text-white border-gray-900" : "hover:bg-gray-100 border-gray-200 text-gray-600"
              )}>
              <span className="font-bold">{q.label}</span>
              <span className="text-[9px] opacity-70">{q.sublabel}</span>
            </button>
          ))}
        </div>
        <button onClick={() => setUseCustom(true)} className={cn("px-3 py-1.5 rounded border text-xs font-medium transition-colors", useCustom ? "bg-gray-900 text-white border-gray-900" : "hover:bg-gray-100 border-gray-200 text-gray-600")}>
          Custom
        </button>
        {useCustom && (
          <div className="flex items-center gap-2 mt-1 w-full">
            <Input type="date" className="w-36 text-sm h-8 border-gray-200" value={customFrom} onChange={e => setCustomFrom(e.target.value)} />
            <span className="text-gray-400 text-xs">to</span>
            <Input type="date" className="w-36 text-sm h-8 border-gray-200" value={customTo} onChange={e => setCustomTo(e.target.value)} />
          </div>
        )}
      </div>
    </div>
  );
}

export default function GstF7Page() {
  const { selectedCompany } = useAuth();

  // Original period
  const [origYear, setOrigYear]     = useState(YEAR);
  const [origQ, setOrigQ]           = useState(Math.max(0, CURRENT_Q - 1));
  const [origCustom, setOrigCustom] = useState(false);
  const [origFrom, setOrigFrom]     = useState("");
  const [origTo, setOrigTo]         = useState("");

  // Amended period (current data)
  const [amdYear, setAmdYear]       = useState(YEAR);
  const [amdQ, setAmdQ]             = useState(CURRENT_Q);
  const [amdCustom, setAmdCustom]   = useState(false);
  const [amdFrom, setAmdFrom]       = useState("");
  const [amdTo, setAmdTo]           = useState("");

  const [pdfLoading, setPdfLoading] = useState(false);

  const qOrigFrom = origCustom ? origFrom : `${origYear}${QUARTERS[origQ].from}`;
  const qOrigTo   = origCustom ? origTo   : `${origYear}${QUARTERS[origQ].to}`;
  const qAmdFrom  = amdCustom  ? amdFrom  : `${amdYear}${QUARTERS[amdQ].from}`;
  const qAmdTo    = amdCustom  ? amdTo    : `${amdYear}${QUARTERS[amdQ].to}`;

  const enabled = !!(qOrigFrom && qOrigTo && qAmdFrom && qAmdTo);

  const { data, isLoading, isError, error } = useQuery<F7Data>({
    queryKey: ["gst-f7", qOrigFrom, qOrigTo, qAmdFrom, qAmdTo],
    queryFn: async () => {
      const p = new URLSearchParams({ origFrom: qOrigFrom, origTo: qOrigTo, from: qAmdFrom, to: qAmdTo });
      const r = await fetch(`/api/gst-f7?${p}`, { credentials: "include" });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || "Failed to load GST F7 data"); }
      return r.json();
    },
    enabled,
    staleTime: 30_000,
  });

  async function handleDownloadPDF() {
    if (!data) return;
    setPdfLoading(true);
    try {
      await generateGstF7_PDF(selectedCompany as any, data);
    } finally {
      setPdfLoading(false);
    }
  }

  const boxes = [1, 2, 3, 4, 5, 6, 7, 8];

  return (
    <div className="max-w-4xl mx-auto space-y-5 pb-20 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-4 pb-4 border-b border-gray-200">
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">IRAS Singapore</p>
          <h1 className="text-2xl font-bold text-gray-900">GST F7 — Amended Return</h1>
          <p className="text-sm text-gray-400 mt-0.5">Use this to correct a previously submitted F5 return</p>
        </div>
        {data && (
          <Button variant="outline" size="sm" onClick={handleDownloadPDF} disabled={pdfLoading} className="border-gray-200 text-gray-600 hover:text-gray-900">
            {pdfLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
            Download PDF
          </Button>
        )}
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 p-3.5 bg-blue-50 border border-blue-100 rounded-lg text-sm text-blue-700">
        <Info className="h-4 w-4 mt-0.5 shrink-0" />
        <p>Select the <strong>original period</strong> as it was submitted, and the <strong>amended period</strong> with the corrected data. The F7 shows the difference between what was originally reported and what should have been.</p>
      </div>

      {/* Period pickers */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <QuarterPicker label="Original Period (as submitted)" year={origYear} setYear={setOrigYear} quarter={origQ} setQuarter={setOrigQ} useCustom={origCustom} setUseCustom={setOrigCustom} customFrom={origFrom} setCustomFrom={setOrigFrom} customTo={origTo} setCustomTo={setOrigTo} />
        <QuarterPicker label="Amended Period (corrected data)" year={amdYear} setYear={setAmdYear} quarter={amdQ} setQuarter={setAmdQ} useCustom={amdCustom} setUseCustom={setAmdCustom} customFrom={amdFrom} setCustomFrom={setAmdFrom} customTo={amdTo} setCustomTo={setAmdTo} />
      </div>

      {isLoading && <div className="text-center py-16 text-sm text-gray-400">Loading…</div>}
      {isError   && <div className="text-center py-16 text-sm text-red-500">{(error as Error).message}</div>}
      {!enabled  && !isLoading && <div className="text-center py-10 text-sm text-gray-400">Select both periods above to generate the F7 comparison.</div>}

      {data && (
        <>
          {/* Company + period strip */}
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
            <div className="bg-[#1a365d] text-white px-5 py-3">
              <p className="text-[10px] tracking-widest uppercase opacity-70 mb-0.5">Inland Revenue Authority of Singapore</p>
              <p className="text-base font-bold tracking-wide">GST RETURN F7 — Disclosure of Errors / Omissions</p>
            </div>
            <div className="grid grid-cols-3 divide-x divide-gray-100 text-sm p-0">
              <div className="px-5 py-4">
                <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">GST-Registered Business</p>
                <p className="font-bold">{data.company.name}</p>
                {data.company.gstRegistrationNo && <p className="text-xs text-gray-500 mt-0.5">GST Reg: {data.company.gstRegistrationNo}</p>}
              </div>
              <div className="px-5 py-4">
                <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">Original Period</p>
                <p className="font-semibold text-sm">{fmtDateLong(qOrigFrom)} – {fmtDateLong(qOrigTo)}</p>
              </div>
              <div className="px-5 py-4">
                <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">Amended Period</p>
                <p className="font-semibold text-sm">{fmtDateLong(qAmdFrom)} – {fmtDateLong(qAmdTo)}</p>
              </div>
            </div>
          </div>

          {/* Comparison table */}
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b-2 border-gray-200 bg-gray-50">
                    <th className="text-center px-3 py-3 text-xs font-bold text-gray-600 uppercase tracking-wider w-12">Box</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wider">Description</th>
                    <th className="text-right px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wider w-36">Original (S$)</th>
                    <th className="text-right px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wider w-36">Amended (S$)</th>
                    <th className="text-right px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wider w-36">Difference (S$)</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { section: "PART I — VALUE OF SUPPLIES", boxes: [1, 2, 3, 5] },
                    { section: "PART II — PURCHASES & IMPORTS", boxes: [4] },
                    { section: "PART III — GST COMPUTATION", boxes: [6, 7, 8] },
                  ].map(({ section, boxes: sboxes }) => (
                    <>
                      <tr key={section}>
                        <td colSpan={5} className="px-4 py-2.5 bg-[#1a365d] text-white text-xs font-bold uppercase tracking-wider">{section}</td>
                      </tr>
                      {sboxes.map(n => {
                        const orig  = data.original[`box${n}`] ?? 0;
                        const amd   = data.amended[`box${n}`]  ?? 0;
                        const diff  = data.delta[`box${n}`]    ?? 0;
                        const isB8  = n === 8;
                        const hasDiff = Math.abs(diff) > 0.005;
                        return (
                          <tr key={n} className={cn("border-b border-gray-100", isB8 ? "bg-gray-50" : n % 2 === 0 ? "bg-white" : "bg-gray-50/40")}>
                            <td className="px-3 py-3 text-center">
                              <span className={cn("inline-flex items-center justify-center w-7 h-7 rounded text-xs font-bold", isB8 ? "bg-[#1a365d] text-white" : "bg-[#1a365d]/10 text-[#1a365d]")}>{n}</span>
                            </td>
                            <td className={cn("px-4 py-3 font-medium", isB8 ? "font-bold" : "")}>{BOX_LABELS[n]}</td>
                            <td className="text-right px-4 py-3 font-mono text-sm tabular-nums text-gray-600">{fmtAmt(orig)}</td>
                            <td className="text-right px-4 py-3 font-mono text-sm tabular-nums text-gray-800">{fmtAmt(amd)}</td>
                            <td className={cn("text-right px-4 py-3 font-mono tabular-nums font-semibold", isB8 ? "text-base" : "text-sm", !hasDiff ? "text-gray-300" : diff > 0 ? "text-amber-700" : "text-emerald-700")}>
                              {hasDiff ? (diff > 0 ? `+${fmtAmt(diff)}` : `−${fmtAmt(diff)}`) : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-900 text-white">
                    <td colSpan={4} className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-gray-300">Net Adjustment (Box 8 difference)</td>
                    <td className={cn("text-right px-4 py-3 font-mono text-base font-bold tabular-nums", (data.delta.box8 ?? 0) > 0.005 ? "text-amber-300" : (data.delta.box8 ?? 0) < -0.005 ? "text-emerald-300" : "text-gray-500")}>
                      {Math.abs(data.delta.box8 ?? 0) < 0.005 ? "No change" : (data.delta.box8 ?? 0) > 0 ? `Pay additional S$ ${fmtAmt(data.delta.box8)}` : `Claim S$ ${fmtAmt(data.delta.box8)}`}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Delta callout */}
          {Math.abs(data.delta.box8 ?? 0) > 0.005 && (
            <div className={cn("p-4 rounded-lg border text-sm font-medium", (data.delta.box8 ?? 0) > 0 ? "bg-amber-50 border-amber-200 text-amber-800" : "bg-emerald-50 border-emerald-200 text-emerald-800")}>
              {(data.delta.box8 ?? 0) > 0
                ? `⚠ Additional GST payable to IRAS: S$ ${fmtAmt(data.delta.box8)}. Submit this F7 and make payment via myTax Portal (mytax.iras.gov.sg).`
                : `✓ GST over-paid. You may claim a refund of S$ ${fmtAmt(data.delta.box8)} via myTax Portal (mytax.iras.gov.sg).`}
            </div>
          )}

          <p className="text-xs text-gray-400">This is a computer-generated working paper. Submit your amended return directly at <strong>mytax.iras.gov.sg</strong>. GST F7 must be submitted within 5 years of the original return due date.</p>
        </>
      )}
    </div>
  );
}
