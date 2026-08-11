import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Info, CheckCircle, AlertTriangle, FileText, Save, ExternalLink } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { cn } from "@/lib/utils";

// ─── Constants ────────────────────────────────────────────────────────────────

const CUR_YEAR = new Date().getFullYear();
// YA = FY + 1 (e.g. FY 2024 → YA 2025)
// Include CUR_YEAR+1 so the current FY (which files next year) is visible.
const YAS = Array.from({ length: 6 }, (_, i) => CUR_YEAR + 1 - i); // e.g. 2027→2022

// Singapore corporate tax: partial exemption (from YA 2020)
//   First $10K chargeable income: 75% exempt → effective 4.25%
//   Next $190K: 50% exempt → effective 8.5%
//   Above $200K: 17%
function computeTax(ci: number): { t1: number; t2: number; t3: number; total: number } {
  if (ci <= 0) return { t1: 0, t2: 0, t3: 0, total: 0 };
  const tier1  = Math.min(ci, 10_000);
  const tier2  = Math.max(0, Math.min(ci - 10_000, 190_000));
  const tier3  = Math.max(0, ci - 200_000);
  const t1 = tier1  * 0.25 * 0.17;   // 75% exempt → 25% taxable × 17%
  const t2 = tier2  * 0.50 * 0.17;   // 50% exempt → 50% taxable × 17%
  const t3 = tier3  * 0.17;
  return { t1, t2, t3, total: t1 + t2 + t3 };
}

const CHECKLIST = [
  "Audited / unaudited financial statements for the FY",
  "Tax computation (workings) for ECI and chargeable income",
  "Form C-S / C-S Lite completed in full",
  "Director's declaration reviewed and signed",
  "Any prior-year assessments / amendments resolved",
  "Capital allowances schedule (if applicable)",
  "Related-party transactions disclosed (transfer pricing)",
];

// ─── Types ────────────────────────────────────────────────────────────────────

interface EciData {
  filing: { chargeableIncome: number | null; revenue: number | null; status: string } | null;
  computedRevenue: number;
}

interface CsData {
  filing: FilingRecord | null;
  computedRevenue: number;
}
interface FilingRecord {
  id: number; status: string;
  revenue: number | null; chargeableIncome: number | null; taxPayable: number | null;
  filedDate: string | null; referenceNo: string | null; data: any; notes: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}
function fmtPct(n: number) {
  return new Intl.NumberFormat("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + "%";
}

function InputRow({ label, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  return (
    <div className="py-2 border-b border-muted/60 last:border-0">
      <div className="flex items-center gap-3">
        <span className="flex-1 text-sm text-muted-foreground">{label}</span>
        <Input
          type="text"
          inputMode="decimal"
          value={value}
          onChange={e => onChange(e.target.value)}
          onBlur={e => {
            const n = parseFloat(e.target.value);
            if (!isNaN(n)) onChange(n.toFixed(2));
          }}
          className="w-36 text-right tabular-nums h-8 text-sm"
          placeholder="0.00"
        />
      </div>
      {hint && <p className="text-xs text-muted-foreground mt-0.5 pl-1">{hint}</p>}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function FormCsPage() {
  const qc = useQueryClient();
  const [ya, setYa] = useState(CUR_YEAR + 1); // Default to upcoming YA (covers current FY)
  const fy = ya - 1; // Financial Year

  const [revenue,         setRevenue]         = useState("");
  const [chargeableIncome, setChargeableIncome] = useState("");
  const [rebateAmt,       setRebateAmt]       = useState(""); // CIT rebate, if any
  const [notes,           setNotes]           = useState("");
  const [refNo,           setRefNo]           = useState("");
  const [filedDate,       setFiledDate]       = useState(new Date().toISOString().slice(0, 10));
  const [checklist,       setChecklist]       = useState<boolean[]>(CHECKLIST.map(() => false));

  // Fetch Form C-S filing
  const { data: csData, isLoading: csLoading } = useQuery<CsData>({
    queryKey: ["tax-filings", "form_cs", fy],
    queryFn: () =>
      fetch(`/api/tax-filings?type=form_cs&year=${fy}`, { credentials: "include" })
        .then(r => r.json()),
  });

  // Also fetch ECI for the same FY to pre-fill CI
  const { data: eciData } = useQuery<EciData>({
    queryKey: ["tax-filings", "eci", fy],
    queryFn: () =>
      fetch(`/api/tax-filings?type=eci&year=${fy}`, { credentials: "include" })
        .then(r => r.json()),
  });

  useEffect(() => {
    if (!csData) return;
    const d = csData.filing?.data as any;
    setRevenue(csData.filing?.revenue != null ? String(csData.filing.revenue) : String(csData.computedRevenue));
    setChargeableIncome(csData.filing?.chargeableIncome != null
      ? String(csData.filing.chargeableIncome)
      : eciData?.filing?.chargeableIncome != null
        ? String(Math.max(0, eciData.filing.chargeableIncome))
        : "");
    setRebateAmt(d?.rebateAmt ?? "");
    setNotes(csData.filing?.notes ?? "");
    setRefNo(csData.filing?.referenceNo ?? "");
    if (d?.checklist) setChecklist(d.checklist);
  }, [csData, eciData]);

  const rev = parseFloat(revenue)          || 0;
  const ci  = parseFloat(chargeableIncome) || 0;
  const rebate = Math.min(parseFloat(rebateAmt) || 0, 10_000); // CIT rebate capped at $10K

  // Form type eligibility
  const isCSLite = rev <= 200_000;
  const isCS     = rev <= 5_000_000;
  const formType = isCSLite ? "Form C-S (Lite)" : isCS ? "Form C-S" : "Form C (full)";
  const formColor = isCSLite ? "text-green-700" : isCS ? "text-blue-700" : "text-orange-700";

  const tax = computeTax(ci);
  const netTax = Math.max(0, tax.total - rebate);

  // Filing deadline: 30 November of the YA year (e-filing)
  const deadline = `${ya}-11-30`;
  const deadlineDisplay = new Date(deadline + "T00:00:00")
    .toLocaleDateString("en-SG", { day: "numeric", month: "long", year: "numeric" });
  const isOverdue = new Date() > new Date(deadline + "T23:59:59");

  const filing = csData?.filing;
  const isFiled = filing?.status === "filed";

  const save = useMutation({
    mutationFn: async (status: string) => {
      const body = {
        type: "form_cs", financialYear: fy,
        fyEndDate: `${fy}-12-31`,
        revenue: rev,
        chargeableIncome: ci,
        taxPayable: netTax,
        status,
        filedDate: status === "filed" ? filedDate : null,
        referenceNo: status === "filed" ? refNo : null,
        data: { rebateAmt, checklist, formType },
        notes,
      };
      const method = csData?.filing ? "PUT" : "POST";
      const url    = csData?.filing ? `/api/tax-filings/${csData.filing.id}` : "/api/tax-filings";
      const r = await fetch(url, {
        method, credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error || "Failed"); }
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tax-filings", "form_cs", fy] }),
  });

  const checkAll = checklist.every(Boolean);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#2563EB]">Form C-S / Corporate Tax Return</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Annual corporate income tax return for Singapore companies
          </p>
        </div>
        {/* YA selector */}
        <div className="flex gap-1.5 flex-wrap justify-end">
          {YAS.map(y => (
            <button key={y} onClick={() => setYa(y)}
              className={cn("px-3 py-1.5 rounded-full text-sm font-medium border transition-colors",
                ya === y ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted")}>
              YA {y}
            </button>
          ))}
        </div>
      </div>

      {/* Deadline + form type banner */}
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="flex gap-2 p-3 rounded-lg bg-muted/60 border text-sm">
          <Info className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" />
          <div>
            <strong>YA {ya}</strong> covers FY ending <strong>31 Dec {fy}</strong>.
            Filing form: <span className={cn("font-semibold", formColor)}>{formType}</span>
            <div className="text-xs text-muted-foreground mt-0.5">
              C-S Lite: revenue ≤ S$200K · C-S: ≤ S$5M · C: above S$5M
            </div>
          </div>
        </div>
        <div className={cn("flex gap-2 p-3 rounded-lg border text-sm",
          isFiled
            ? "bg-green-50 dark:bg-green-950/30 border-green-200 text-green-800 dark:text-green-200"
            : isOverdue
              ? "bg-red-50 dark:bg-red-950/30 border-red-200 text-red-800 dark:text-red-300"
              : "bg-amber-50 dark:bg-amber-950/30 border-amber-200 text-amber-800 dark:text-amber-200")}>
          {isFiled ? <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" /> : <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />}
          <div>
            <strong>YA {ya} deadline:</strong> {deadlineDisplay}
            {isFiled
              ? <div className="mt-0.5">Filed on {filing?.filedDate} {filing?.referenceNo && `· Ref: ${filing.referenceNo}`}</div>
              : isOverdue ? <div className="mt-0.5 font-semibold">Overdue — file via myTax Portal immediately</div>
              : null}
          </div>
        </div>
      </div>

      {csLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />Loading…
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-6">
          {/* Left: Key figures */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Key Financial Figures</CardTitle></CardHeader>
              <CardContent>
                <div className="text-xs text-muted-foreground mb-3">Revenue auto-pulled from confirmed invoices for FY {fy}.</div>
                <InputRow label="Total Revenue (S$)"          value={revenue}          onChange={setRevenue}
                  hint={csData && Math.abs(rev - csData.computedRevenue) > 0.01 ? `Invoices total: ${fmt(csData.computedRevenue)}` : undefined} />
                <InputRow label="Chargeable Income (S$)"      value={chargeableIncome} onChange={setChargeableIncome}
                  hint={eciData?.filing?.chargeableIncome != null ? `From ECI: ${fmt(Math.max(0, eciData.filing.chargeableIncome))}` : "From ECI computation or enter manually"} />
                <InputRow label="CIT Rebate (S$, max 10,000)" value={rebateAmt}        onChange={setRebateAmt}
                  hint="Corporate Income Tax Rebate — check IRAS for current YA rate" />
              </CardContent>
            </Card>

            {/* Checklist */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Pre-Filing Checklist</CardTitle>
                  <Badge variant={checkAll ? "default" : "secondary"} className={checkAll ? "bg-green-600" : ""}>
                    {checklist.filter(Boolean).length}/{CHECKLIST.length}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {CHECKLIST.map((item, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <Checkbox
                      id={`chk-${i}`}
                      checked={checklist[i]}
                      onCheckedChange={v => setChecklist(prev => prev.map((c, j) => j === i ? !!v : c))}
                      className="mt-0.5"
                    />
                    <label htmlFor={`chk-${i}`} className="text-sm text-muted-foreground cursor-pointer leading-snug">
                      {item}
                    </label>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Right: Tax computation + action */}
          <div className="space-y-4">
            <Card className="border-2 border-primary/20">
              <CardHeader className="pb-3"><CardTitle className="text-base">Corporate Tax Computation</CardTitle></CardHeader>
              <CardContent>
                <div className="text-xs text-muted-foreground mb-3">
                  Singapore corporate rate: 17% with partial tax exemption (YA 2020+)
                </div>
                <div className="space-y-1">
                  {[
                    { label: "Revenue",                          value: rev,  bold: false },
                    { label: "Chargeable Income",                value: ci,   bold: true  },
                  ].map((r, i) => (
                    <div key={i} className={cn("flex justify-between py-1.5 text-sm border-b border-muted/50", r.bold && "font-semibold")}>
                      <span>{r.label}</span>
                      <span className="tabular-nums">SGD {fmt(r.value)}</span>
                    </div>
                  ))}

                  <div className="pt-2 pb-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">Tax Calculation</div>
                  {ci > 0 ? <>
                    <TaxRow label={`First S$10K × 4.25%`}    amount={tax.t1} note="(75% exempt)" />
                    {ci > 10_000   && <TaxRow label={`Next S$190K × 8.5%`}    amount={tax.t2} note="(50% exempt)" />}
                    {ci > 200_000  && <TaxRow label={`Above S$200K × 17%`}    amount={tax.t3} />}
                    <div className="flex justify-between py-1.5 text-sm border-t font-semibold">
                      <span>Gross Tax</span>
                      <span className="tabular-nums">SGD {fmt(tax.total)}</span>
                    </div>
                    {rebate > 0 && (
                      <div className="flex justify-between py-1.5 text-sm text-green-700 dark:text-green-400">
                        <span>Less: CIT Rebate</span>
                        <span className="tabular-nums">(SGD {fmt(rebate)})</span>
                      </div>
                    )}
                  </> : (
                    <div className="py-2 text-sm text-muted-foreground italic">Enter chargeable income above</div>
                  )}

                  <div className="flex justify-between py-3 border-t-2 text-lg font-bold">
                    <span>Net Tax Payable</span>
                    <span className={cn("tabular-nums", netTax > 0 ? "text-red-700 dark:text-red-400" : "text-green-700")}>
                      {netTax > 0 ? `SGD ${fmt(netTax)}` : "NIL"}
                    </span>
                  </div>
                </div>

                <div className="mt-3 p-2.5 rounded-lg bg-muted/50 text-xs text-muted-foreground">
                  <strong>Effective rate: </strong>
                  {ci > 0 ? fmtPct((netTax / ci) * 100) : "—"} &nbsp;·&nbsp;
                  <a href="https://www.iras.gov.sg/taxes/corporate-income-tax/form-c-s" target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-0.5 text-primary hover:underline">
                    myTax Portal <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </CardContent>
            </Card>

            {/* Filing record */}
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Filing Record</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {isFiled ? (
                  <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-300">
                    <CheckCircle className="h-4 w-4" />
                    Filed on {filing?.filedDate} via myTax Portal
                    {filing?.referenceNo && <span className="text-muted-foreground">· Ref: {filing.referenceNo}</span>}
                  </div>
                ) : <>
                  <div>
                    <Label className="text-xs">Filed Date</Label>
                    <Input type="date" value={filedDate} onChange={e => setFiledDate(e.target.value)} className="mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs">myTax Portal Reference No.</Label>
                    <Input value={refNo} onChange={e => setRefNo(e.target.value)} placeholder="Acknowledgment ref" className="mt-1" />
                  </div>
                </>}
                <div>
                  <Label className="text-xs">Notes</Label>
                  <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any notes…" className="mt-1" />
                </div>
              </CardContent>
            </Card>

            {/* Actions */}
            <div className="flex flex-col gap-2">
              <Button className="w-full gap-2" variant="outline" onClick={() => save.mutate("draft")} disabled={save.isPending}>
                <Save className="h-4 w-4" />Save Draft
              </Button>
              {!isFiled && (
                <Button className="w-full gap-2 bg-blue-600 hover:bg-blue-700 text-white"
                  onClick={() => save.mutate("filed")} disabled={save.isPending}>
                  <FileText className="h-4 w-4" />Mark as Filed with IRAS
                </Button>
              )}
              {isFiled && (
                <Button className="w-full gap-2" variant="outline"
                  onClick={() => save.mutate("draft")} disabled={save.isPending}>
                  Reopen Draft
                </Button>
              )}
              {save.isPending && <div className="flex justify-center"><Loader2 className="h-4 w-4 animate-spin" /></div>}
              {save.isError && <p className="text-destructive text-sm">{(save.error as Error).message}</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TaxRow({ label, amount, note }: { label: string; amount: number; note?: string }) {
  return (
    <div className="flex justify-between py-1.5 text-sm text-muted-foreground">
      <span>{label} {note && <span className="text-xs opacity-70">{note}</span>}</span>
      <span className="tabular-nums">SGD {fmt(amount)}</span>
    </div>
  );
}
