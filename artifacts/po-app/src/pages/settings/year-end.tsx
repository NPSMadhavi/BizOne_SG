import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Loader2,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useDateRangeOptional } from "@/contexts/date-range-context";
import { fromInputDate } from "@/lib/date-range";

type Fy = {
  id: number;
  label: string;
  startDate: string;
  endDate: string;
  status: string;
};

type ReviewItem = {
  key: string;
  label: string;
  count: number;
  ok: boolean;
  detail: string;
};

type GlLine = {
  accountCode: string;
  accountName: string;
  accountType: string;
  subType?: string;
  balance: number;
};

async function api(path: string, init?: RequestInit) {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    ...init,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

function formatLong(iso: string) {
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return iso;
  return new Date(year, month - 1, day).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function yearSpan(start: string, end: string) {
  const from = start.slice(0, 4);
  const to = end.slice(0, 4);
  return from === to ? from : `${from} – ${to}`;
}

function addYear(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const month = (m || 1) - 1;
  const shifted = new Date((y || 2000) + 1, month, d || 1);
  const finalDate = shifted.getMonth() !== month ? new Date((y || 2000) + 1, month + 1, 0) : shifted;
  const mm = String(finalDate.getMonth() + 1).padStart(2, "0");
  const dd = String(finalDate.getDate()).padStart(2, "0");
  return `${finalDate.getFullYear()}-${mm}-${dd}`;
}

function money(amount: number) {
  return new Intl.NumberFormat("en-SG", { style: "currency", currency: "SGD" }).format(amount || 0);
}

function typeLabel(line: GlLine) {
  const name = `${line.accountName} ${line.subType || ""}`.toLowerCase();
  if (line.accountType === "asset" && /cash|bank/.test(name)) return "Bank & Cash";
  if (line.accountType === "asset" && /receiv/.test(name)) return "Current Asset";
  if (line.accountType === "asset" && /invent/.test(name)) return "Current Asset";
  if (line.accountType === "asset") return "Asset";
  if (line.accountType === "liability") return "Current Liability";
  if (line.accountType === "equity") return "Equity";
  return line.accountType || "Account";
}

const STEPS = [
  { n: 1, title: "Review & Validate", text: "Check for pending items and ensure data is ready." },
  { n: 2, title: "Close Year", text: "Transfer P&L to Retained Earnings and lock the year." },
  { n: 3, title: "Carry Forward Opening", text: "Move Balance Sheet balances to next financial year." },
  { n: 4, title: "Confirmation", text: "Review summary and complete the process." },
];

export default function YearEndProcessPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { applyDateRange } = useDateRangeOptional();
  const [step, setStep] = useState(1);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState<{ closed: string; next: string } | null>(null);

  const yearsQuery = useQuery({
    queryKey: ["financial-years"],
    queryFn: () => api("/api/financial-years"),
  });

  const active: Fy | null = yearsQuery.data?.active || null;
  const years: Fy[] = yearsQuery.data?.years || [];

  const nextBounds = useMemo(() => {
    if (!active) return null;
    const existing = years.find((y) => y.startDate > active.endDate);
    if (existing) return existing;
    const start = addYear(active.startDate);
    const end = addYear(active.endDate);
    return {
      id: 0,
      label: start.slice(0, 4) === end.slice(0, 4) ? `FY ${start.slice(0, 4)}` : `FY ${start.slice(0, 4)}-${end.slice(0, 4)}`,
      startDate: start,
      endDate: end,
      status: "inactive",
    } satisfies Fy;
  }, [active, years]);

  const checklistQuery = useQuery({
    queryKey: ["financial-year-checklist", active?.id],
    queryFn: () => api(`/api/financial-years/${active!.id}/checklist`),
    enabled: !!active && active.status !== "closed",
  });

  const previewQuery = useQuery({
    queryKey: ["financial-year-preview", active?.id],
    queryFn: () => api(`/api/financial-years/${active!.id}/opening-balance-preview`),
    enabled: !!active && active.status !== "closed",
  });

  const review: ReviewItem[] = checklistQuery.data?.reviewItems || [];
  const blockers = review.filter((item) => !item.ok);
  const allClear = !!active && active.status !== "closed" && blockers.length === 0 && !checklistQuery.isLoading;
  const lines: GlLine[] = (previewQuery.data?.glLines || []).filter((line: GlLine) => Math.abs(line.balance) > 0.005);
  const currentSpan = active ? yearSpan(active.startDate, active.endDate) : "—";
  const nextSpan = nextBounds ? yearSpan(nextBounds.startDate, nextBounds.endDate) : "—";

  async function closeAndCarryForward() {
    if (!active || running) return;
    setRunning(true);
    setDone(null);
    try {
      setStep(1);
      if (active) {
        await api(`/api/financial-years/${active.id}/mark-audit-completed`, { method: "POST", body: "{}" });
      }
      setStep(2);
      await api("/api/accounting-backups", {
        method: "POST",
        body: JSON.stringify({
          backupType: "financial_year",
          fromDate: active.startDate,
          toDate: active.endDate,
          financialYearId: active.id,
          financialYearLabel: active.label,
          source: "fy_close",
        }),
      });
      const ready = await api(`/api/financial-years/${active.id}/checklist`);
      if (!ready.canClose) {
        throw new Error(ready.items?.find((item: ReviewItem) => !item.ok)?.detail || "Year-end validation is not complete.");
      }
      const closeRes = await api(`/api/financial-years/${active.id}/close`, { method: "POST", body: "{}" });
      setStep(3);
      const next = closeRes.next as Fy | undefined;
      if (next?.id) {
        await api(`/api/financial-years/${next.id}/activate`, { method: "POST", body: "{}" });
      }
      setStep(4);
      setDone({ closed: closeRes.closed?.label || active.label, next: next?.label || nextSpan });
      if (next?.startDate && next?.endDate) {
        const from = fromInputDate(next.startDate);
        const to = fromInputDate(next.endDate);
        if (from && to) applyDateRange("custom", from, to);
      }
      await qc.invalidateQueries({ queryKey: ["financial-years"] });
      toast({
        title: "Financial year closed",
        description: `${active.label} is view only. Balances were carried into ${next?.label || "the next year"}.`,
      });
    } catch (error: any) {
      setStep(1);
      toast({ title: "Cannot close the year", description: error.message, variant: "destructive" });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-5 pb-10" data-allow-when-closed>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[#101828]">Financial Year Closing & Opening</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Close the current financial year and carry forward opening balances to the next financial year.
        </p>
      </div>

      {yearsQuery.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading financial year…
        </div>
      ) : !active ? (
        <div className="rounded-xl border bg-white p-6 text-sm text-muted-foreground">No financial year is set for this company.</div>
      ) : (
        <>
          <div className="grid items-center gap-4 lg:grid-cols-[1fr_auto_1fr]">
            <div className="rounded-2xl border border-sky-100 bg-sky-50/70 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-sky-600 shadow-sm">
                    <Calendar className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Current Financial Year</p>
                    <p className="text-2xl font-semibold text-[#101828]">{currentSpan}</p>
                  </div>
                </div>
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                  {active.status === "closed" ? "CLOSED" : "OPEN"}
                </span>
              </div>
              <p className="mt-4 text-sm text-slate-500">Closing Date : {formatLong(active.endDate)}</p>
            </div>

            <div className="flex flex-col items-center text-sky-600">
              <ArrowRight className="h-6 w-6" />
              <span className="text-xs font-medium">Year Transition</span>
            </div>

            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/80 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-emerald-600 shadow-sm">
                    <Calendar className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Next Financial Year</p>
                    <p className="text-2xl font-semibold text-[#101828]">{nextSpan}</p>
                  </div>
                </div>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-emerald-700">
                  {done ? "OPEN" : "READY"}
                </span>
              </div>
              <p className="mt-4 text-sm text-slate-500">
                Opening Date : {nextBounds ? formatLong(nextBounds.startDate) : "—"}
              </p>
            </div>
          </div>

          <div className="grid gap-3 rounded-2xl border bg-white p-4 md:grid-cols-4">
            {STEPS.map((item, index) => {
              const activeStep = step === item.n;
              const complete = done ? true : step > item.n;
              return (
                <div key={item.n} className="flex gap-3">
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                    complete || activeStep ? "bg-[#2563EB] text-white" : "bg-slate-100 text-slate-500"
                  }`}>
                    {complete && !activeStep ? <CheckCircle2 className="h-4 w-4" /> : item.n}
                  </div>
                  <div>
                    <p className={`text-sm font-semibold ${activeStep ? "text-[#2563EB]" : "text-[#101828]"}`}>{item.n}. {item.title}</p>
                    <p className="text-xs text-muted-foreground">{item.text}</p>
                  </div>
                  {index < STEPS.length - 1 && <div className="hidden" />}
                </div>
              );
            })}
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <section className="rounded-2xl border bg-white p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-semibold text-[#101828]">1. Review & Validate</h2>
                {allClear && <span className="text-xs font-semibold text-emerald-600">All Clear</span>}
              </div>
              {allClear && (
                <div className="mb-4 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                  <CheckCircle2 className="h-4 w-4" />
                  Your data is ready to close the year. No pending items found.
                </div>
              )}
              <div className="space-y-3">
                {(review.length ? review : []).map((item) => (
                  <div key={item.key} className="flex items-center justify-between gap-3 text-sm">
                    <div className="flex items-center gap-2">
                      {item.ok ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 text-amber-600" />
                      )}
                      <span>{item.label}</span>
                    </div>
                    <span className={item.ok ? "text-slate-500" : "font-semibold text-amber-700"}>{item.count}</span>
                  </div>
                ))}
                {checklistQuery.isLoading && <p className="text-sm text-muted-foreground">Checking pending items…</p>}
              </div>
            </section>

            <section className="rounded-2xl border bg-white p-5">
              <h2 className="font-semibold text-[#101828]">2. Opening Balance Preview (Next Year)</h2>
              <p className="mt-1 mb-4 text-sm text-muted-foreground">
                Balance Sheet accounts will be carried forward to the next financial year as opening balances.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-slate-500">
                      <th className="py-2 pr-3 font-medium">Account</th>
                      <th className="py-2 pr-3 font-medium">Type</th>
                      <th className="py-2 pr-3 text-right font-medium">Closing Balance ({currentSpan})</th>
                      <th className="py-2 text-right font-medium">Opening Balance ({nextSpan})</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-6 text-center text-muted-foreground">No balance sheet balances to carry forward.</td>
                      </tr>
                    ) : lines.map((line) => (
                      <tr key={`${line.accountCode}-${line.accountName}`} className="border-b last:border-0">
                        <td className="py-2 pr-3">{line.accountCode} — {line.accountName}</td>
                        <td className="py-2 pr-3 text-slate-500">{typeLabel(line)}</td>
                        <td className="py-2 pr-3 text-right">{money(line.balance)}</td>
                        <td className="py-2 text-right text-emerald-700">{money(line.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 flex gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                P&L accounts (Revenue, Expense) are not carried forward to opening balances. They are closed to Retained Earnings during the year end process.
              </div>
            </section>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border bg-white p-5">
            <div className="flex items-start gap-3">
              <Lock className="mt-0.5 h-5 w-5 text-slate-500" />
              <div>
                <p className="font-semibold text-[#101828]">{done ? "Year closed" : "Ready to Close?"}</p>
                <p className="text-sm text-muted-foreground">
                  {done
                    ? `${done.closed} is locked. Create, edit, and save are not available for that year. ${done.next} is open, and its opening balances have been carried forward.`
                    : "Once you proceed, the financial year will be locked and opening balances will be carried forward. Closed-year records stay available to view."}
                </p>
              </div>
            </div>
            {!done && active.status !== "closed" && (
              <Button
                className="bg-[#2563EB] hover:bg-[#1d4ed8]"
                disabled={running || blockers.length > 0}
                onClick={() => void closeAndCarryForward()}
              >
                {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Lock className="mr-2 h-4 w-4" />}
                Close & Carry Forward
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
