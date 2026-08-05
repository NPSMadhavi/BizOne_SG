import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Info, CheckCircle, AlertTriangle, FileText, Save } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { cn } from "@/lib/utils";

// ─── Constants ────────────────────────────────────────────────────────────────

const CUR_YEAR = new Date().getFullYear();
// Include current FY so in-progress year is always selectable
const YEARS = Array.from({ length: 6 }, (_, i) => CUR_YEAR - i);

// ─── Types ────────────────────────────────────────────────────────────────────

interface EciData {
  filing: FilingRecord | null;
  computedRevenue: number;
  fyStart: string;
  fyEnd: string;
}
interface FilingRecord {
  id: number;
  status: string;
  revenue: number | null;
  chargeableIncome: number | null;
  taxPayable: number | null;
  filedDate: string | null;
  referenceNo: string | null;
  data: any;
  notes: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}
function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setMonth(d.getMonth() + months);
  return d.toLocaleDateString("en-SG", { day: "numeric", month: "long", year: "numeric" });
}
function isOverdue(dateStr: string) {
  return new Date() > new Date(dateStr + "T23:59:59");
}

// ─── Expense row ─────────────────────────────────────────────────────────────

function ExpRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-3 py-2 border-b border-muted/60 last:border-0">
      <span className="flex-1 text-sm text-muted-foreground">{label}</span>
      <Input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={e => onChange(e.target.value)}
        onBlur={e => { const n = parseFloat(e.target.value); if (!isNaN(n)) onChange(n.toFixed(2)); }}
        className="w-36 text-right tabular-nums h-8 text-sm"
        placeholder="0.00"
      />
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function EciPage() {
  const { selectedCompany } = useAuth();
  const qc = useQueryClient();
  const [year, setYear] = useState(CUR_YEAR);

  // Form state
  const [revenue,       setRevenue]       = useState("");
  const [staffCosts,    setStaffCosts]    = useState("");
  const [rental,        setRental]        = useState("");
  const [depreciation,  setDepreciation]  = useState("");
  const [otherExpenses, setOtherExpenses] = useState("");
  const [addBacks,      setAddBacks]      = useState("");
  const [capAllowances, setCapAllowances] = useState("");
  const [notes,         setNotes]         = useState("");
  const [refNo,         setRefNo]         = useState("");
  const [filedDate,     setFiledDate]     = useState(new Date().toISOString().slice(0, 10));

  const { data, isLoading } = useQuery<EciData>({
    queryKey: ["tax-filings", "eci", year],
    queryFn: () =>
      fetch(`/api/tax-filings?type=eci&year=${year}`, { credentials: "include" })
        .then(r => r.json()),
  });

  // Populate form when data loads
  useEffect(() => {
    if (!data) return;
    const d = data.filing?.data as any;
    setRevenue(data.filing?.revenue != null ? String(data.filing.revenue) : String(data.computedRevenue));
    setStaffCosts(d?.staffCosts ?? "");
    setRental(d?.rental ?? "");
    setDepreciation(d?.depreciation ?? "");
    setOtherExpenses(d?.otherExpenses ?? "");
    setAddBacks(d?.addBacks ?? "");
    setCapAllowances(d?.capAllowances ?? "");
    setNotes(data.filing?.notes ?? "");
    setRefNo(data.filing?.referenceNo ?? "");
  }, [data]);

  // Computed values
  const rev      = parseFloat(revenue)       || 0;
  const staff    = parseFloat(staffCosts)    || 0;
  const rent     = parseFloat(rental)        || 0;
  const depr     = parseFloat(depreciation)  || 0;
  const other    = parseFloat(otherExpenses) || 0;
  const backs    = parseFloat(addBacks)      || 0;
  const capAllow = parseFloat(capAllowances) || 0;

  const totalExpenses = staff + rent + depr + other;
  const profitBeforeTax = rev - totalExpenses;
  const eci = profitBeforeTax + backs - capAllow;

  // IRAS exemption check: revenue ≤ $5M AND ECI is nil
  const isRevenueExempt = rev <= 5_000_000;
  const isNilEci = eci <= 0;
  const isExempt = isRevenueExempt && isNilEci;

  // Filing deadline: 3 months after FY end (Dec = 31 Mar next year)
  const fyEnd = `${year}-12-31`;
  const deadlineStr = (() => {
    const d = new Date(`${year}-12-31T00:00:00`);
    d.setMonth(d.getMonth() + 3);
    return d.toISOString().slice(0, 10);
  })();

  const save = useMutation({
    mutationFn: async (status: string) => {
      const body = {
        type: "eci", financialYear: year,
        fyEndDate: fyEnd,
        revenue: rev,
        chargeableIncome: eci,
        taxPayable: null,
        status,
        filedDate: status === "filed" || status === "nil_exempt" ? filedDate : null,
        referenceNo: status === "filed" ? refNo : null,
        data: { staffCosts, rental, depreciation, otherExpenses, addBacks, capAllowances },
        notes,
      };
      const method = data?.filing ? "PUT" : "POST";
      const url    = data?.filing ? `/api/tax-filings/${data.filing.id}` : "/api/tax-filings";
      const r = await fetch(url, {
        method, credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error || "Failed"); }
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tax-filings", "eci", year] }),
  });

  const filing = data?.filing;
  const isFiled = filing?.status === "filed" || filing?.status === "nil_exempt";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Estimated Chargeable Income (ECI)</h1>
          <p className="text-sm text-muted-foreground mt-1">
            IRAS requires ECI filing within <strong>3 months</strong> of financial year end
          </p>
        </div>
        {/* FY selector */}
        <div className="flex gap-1.5 flex-wrap justify-end">
          {YEARS.map(y => (
            <button key={y} onClick={() => setYear(y)}
              className={cn("px-3 py-1.5 rounded-full text-sm font-medium border transition-colors",
                year === y ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted")}>
              FY {y}
            </button>
          ))}
        </div>
      </div>

      {/* Info + deadline */}
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="flex gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-sm text-blue-800 dark:text-blue-200">
          <Info className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <strong>Exemption rule:</strong> Companies with annual revenue ≤ S$5M and <em>nil</em> ECI are automatically exempt from filing.
          </div>
        </div>
        <div className={cn("flex gap-2 p-3 rounded-lg border text-sm",
          isFiled
            ? "bg-green-50 dark:bg-green-950/30 border-green-200 text-green-800 dark:text-green-200"
            : isOverdue(deadlineStr)
              ? "bg-red-50 dark:bg-red-950/30 border-red-200 text-red-800 dark:text-red-300"
              : "bg-amber-50 dark:bg-amber-950/30 border-amber-200 text-amber-800 dark:text-amber-200")}>
          {isFiled ? <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" /> : <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />}
          <div>
            <strong>FY {year} filing deadline:</strong> {addMonths(`${year}-12-31`, 3)}
            {isFiled
              ? <div className="mt-0.5">Filed on {filing?.filedDate} {filing?.referenceNo && `· Ref: ${filing.referenceNo}`}</div>
              : isOverdue(deadlineStr)
                ? <div className="mt-0.5 font-semibold">Deadline has passed — file immediately</div>
                : null}
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />Loading…
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-6">
          {/* Left: Income */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Revenue</CardTitle></CardHeader>
              <CardContent>
                <div className="text-xs text-muted-foreground mb-2">
                  Auto-pulled from confirmed invoices (FY {year}). You may adjust.
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">SGD</span>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={revenue}
                    onChange={e => setRevenue(e.target.value)}
                    onBlur={e => { const n = parseFloat(e.target.value); if (!isNaN(n)) setRevenue(n.toFixed(2)); }}
                    className="text-right tabular-nums font-medium"
                  />
                </div>
                {data && Math.abs(rev - data.computedRevenue) > 0.01 && (
                  <p className="text-xs text-muted-foreground mt-1.5">
                    Invoices total: SGD {fmt(data.computedRevenue)}
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Operating Expenses</CardTitle></CardHeader>
              <CardContent>
                <ExpRow label="Staff costs & CPF"  value={staffCosts}    onChange={setStaffCosts} />
                <ExpRow label="Rental"              value={rental}        onChange={setRental} />
                <ExpRow label="Depreciation"        value={depreciation}  onChange={setDepreciation} />
                <ExpRow label="Other expenses"      value={otherExpenses} onChange={setOtherExpenses} />
                <div className="flex items-center gap-3 pt-2 mt-1">
                  <span className="flex-1 text-sm font-semibold">Total Expenses</span>
                  <span className="text-sm font-semibold tabular-nums w-36 text-right">SGD {fmt(totalExpenses)}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Tax Adjustments</CardTitle></CardHeader>
              <CardContent>
                <ExpRow label="Add-backs (non-deductible exp.)" value={addBacks}      onChange={setAddBacks} />
                <ExpRow label="Capital allowances (S19/19A)"    value={capAllowances} onChange={setCapAllowances} />
              </CardContent>
            </Card>
          </div>

          {/* Right: Summary + Action */}
          <div className="space-y-4">
            <Card className={cn("border-2", isExempt ? "border-green-300 dark:border-green-700" : eci > 0 ? "border-amber-300 dark:border-amber-700" : "border-muted")}>
              <CardHeader className="pb-3"><CardTitle className="text-base">ECI Computation</CardTitle></CardHeader>
              <CardContent className="space-y-1">
                {[
                  { label: "Revenue",           value: rev,            indent: false },
                  { label: "Less: Expenses",    value: -totalExpenses, indent: false },
                  { label: "Profit Before Tax", value: profitBeforeTax,indent: false, bold: true },
                  { label: "Add: Non-deductibles", value: backs,       indent: true  },
                  { label: "Less: Capital Allowances", value: -capAllow, indent: true },
                ].map((r, i) => (
                  <div key={i} className={cn("flex justify-between py-1.5 text-sm", i === 2 ? "border-t border-b font-semibold" : "", r.indent ? "pl-4 text-muted-foreground" : "")}>
                    <span>{r.label}</span>
                    <span className={cn("tabular-nums", r.value < 0 ? "text-red-600" : "")}>{r.value < 0 ? `(${fmt(-r.value)})` : fmt(r.value)}</span>
                  </div>
                ))}
                <div className="flex justify-between py-2.5 mt-1 border-t-2 text-base font-bold">
                  <span>Estimated Chargeable Income</span>
                  <span className={cn("tabular-nums", isNilEci ? "text-green-600" : "text-amber-700")}>
                    {eci <= 0 ? "NIL" : `SGD ${fmt(eci)}`}
                  </span>
                </div>

                {isExempt ? (
                  <div className="mt-3 p-3 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 text-sm text-green-800 dark:text-green-200 flex gap-2">
                    <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <div><strong>Exempt from filing</strong> — Revenue ≤ S$5M and ECI is nil. No ECI filing required.</div>
                  </div>
                ) : (
                  <div className="mt-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 text-sm text-amber-800 dark:text-amber-200 flex gap-2">
                    <FileText className="h-4 w-4 shrink-0 mt-0.5" />
                    <div>
                      {!isRevenueExempt
                        ? <><strong>Filing required</strong> — Revenue exceeds S$5M.</>
                        : <><strong>Filing required</strong> — ECI is positive.</>
                      }
                      {" "}File via <strong>myTax Portal</strong> by {addMonths(`${year}-12-31`, 3)}.
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Filing record */}
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Filing Record</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {isFiled ? (
                  <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-300">
                    <CheckCircle className="h-4 w-4" />
                    {filing?.status === "nil_exempt" ? "Marked as exempt (no filing needed)" : `Filed on ${filing?.filedDate}`}
                  </div>
                ) : (
                  <>
                    <div>
                      <Label className="text-xs">Filed / Lodged Date</Label>
                      <Input type="date" value={filedDate} onChange={e => setFiledDate(e.target.value)} className="mt-1" />
                    </div>
                    <div>
                      <Label className="text-xs">IRAS Reference No. (if filed)</Label>
                      <Input value={refNo} onChange={e => setRefNo(e.target.value)} placeholder="myTax Portal acknowledgment ref" className="mt-1" />
                    </div>
                  </>
                )}
                <div>
                  <Label className="text-xs">Notes</Label>
                  <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any notes…" className="mt-1" />
                </div>
              </CardContent>
            </Card>

            {/* Action buttons */}
            <div className="flex flex-col gap-2">
              <Button className="w-full gap-2" variant="outline" onClick={() => save.mutate("draft")} disabled={save.isPending}>
                <Save className="h-4 w-4" />Save Draft
              </Button>
              {isExempt && !isFiled && (
                <Button className="w-full gap-2 bg-green-600 hover:bg-green-700 text-white"
                  onClick={() => save.mutate("nil_exempt")} disabled={save.isPending}>
                  <CheckCircle className="h-4 w-4" />Mark Exempt (No Filing Needed)
                </Button>
              )}
              {!isExempt && !isFiled && (
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
