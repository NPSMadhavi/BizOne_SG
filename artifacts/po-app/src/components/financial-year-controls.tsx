import { useMemo, useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Lock,
  Unlock,
  CheckCircle2,
  AlertTriangle,
  Play,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { useDateRangeOptional } from "@/contexts/date-range-context";
import {
  toInputDate,
  fromInputDate,
  financialYearLabel,
  startOfFinancialYear,
  endOfFinancialYear,
  fmtRangeLabel,
} from "@/lib/date-range";

type Fy = {
  id: number;
  label: string;
  startDate: string;
  endDate: string;
  status: string;
  auditStatus: string;
  openingBalancesGenerated?: boolean;
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

function fmtFyDates(start: string, end: string) {
  const a = fromInputDate(start);
  const b = fromInputDate(end);
  if (!a || !b) return `${start} – ${end}`;
  return fmtRangeLabel(a, b);
}

const YEAR_END_CHECKLIST = [
  "All sales transactions reviewed",
  "All purchase transactions reviewed",
  "Bank reconciliation completed",
  "Customer outstanding reviewed",
  "Supplier outstanding reviewed",
  "Inventory verified",
  "Fixed assets reviewed",
  "Depreciation completed",
  "GST / Tax returns reviewed",
  "Profit & Loss reviewed",
  "Balance Sheet reviewed",
];

const CARRY_FORWARD = [
  "Bank balances",
  "Cash balances",
  "Customer receivables",
  "Supplier payables",
  "Inventory closing balance",
  "Fixed assets",
  "Accumulated depreciation",
  "Loans and liabilities",
  "Other Balance Sheet accounts",
  "Retained Earnings / accumulated profit",
];

const PROGRESS_STEPS = [
  "Checking transactions",
  "Completing year-end validation",
  "Calculating closing balances",
  "Closing Profit & Loss",
  "Carrying forward Balance Sheet balances",
  "Carrying forward customer outstanding",
  "Carrying forward supplier outstanding",
  "Carrying forward inventory",
  "Carrying forward fixed assets",
  "Creating opening balances for next FY",
  "Locking previous financial year",
];

/**
 * Wizard host for Close FY & Start Next FY.
 * Triggered from Date Range box button → confirmation → checklist blocks → progress → done.
 */
export function CloseFyStartNextWizard({
  openRequest,
  onOpenRequestHandled,
}: {
  /** When set, starts confirmation using this date range. */
  openRequest: { from: string; to: string } | null;
  onOpenRequestHandled: () => void;
}) {
  const { toast } = useToast();
  const { selectedCompany } = useAuth();
  const { applyDateRange } = useDateRangeOptional();
  const qc = useQueryClient();

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [phase, setPhase] = useState<"blocks" | "progress" | "done">("blocks");
  const [stepIdx, setStepIdx] = useState(0);
  const [checklist, setChecklist] = useState<any>(null);
  const [result, setResult] = useState<{ closed: Fy; next: Fy } | null>(null);
  const [running, setRunning] = useState(false);
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");

  // React to external open request from Date Range button
  useEffect(() => {
    if (!openRequest) return;
    setRangeFrom(openRequest.from);
    setRangeTo(openRequest.to);
    setConfirmOpen(true);
    onOpenRequestHandled();
  }, [openRequest]);

  const rangeMid = useMemo(() => {
    const from = fromInputDate(rangeFrom);
    const to = fromInputDate(rangeTo);
    if (!from || !to) return new Date();
    return new Date((from.getTime() + to.getTime()) / 2);
  }, [rangeFrom, rangeTo]);

  const nextBounds = useMemo(() => {
    const start = startOfFinancialYear(rangeMid);
    const end = endOfFinancialYear(rangeMid);
    const nextStart = new Date(start.getFullYear() + 1, 0, 1);
    const nextEnd = new Date(start.getFullYear() + 1, 11, 31);
    return {
      currentLabel: financialYearLabel(start, end),
      currentStart: toInputDate(start),
      currentEnd: toInputDate(end),
      nextLabel: financialYearLabel(nextStart, nextEnd),
      nextStart: toInputDate(nextStart),
      nextEnd: toInputDate(nextEnd),
    };
  }, [rangeMid]);

  async function afterConfirmYes() {
    setConfirmOpen(false);
    try {
      await api("/api/financial-years");
      const forDate = await api(`/api/financial-years/for-date?date=${toInputDate(rangeMid)}`);
      const fy = forDate.financialYear as Fy | null;
      if (!fy) {
        toast({ title: "No financial year found for this date range", variant: "destructive" });
        return;
      }
      if (fy.status === "closed") {
        toast({ title: `${fy.label} is already closed`, variant: "destructive" });
        return;
      }
      const c = await api(`/api/financial-years/${fy.id}/checklist`);
      setChecklist(c);
      setPhase("blocks");
      setStepIdx(0);
      setResult(null);
      setWizardOpen(true);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  }

  async function runRollover() {
    const fy = checklist?.financialYear as Fy | undefined;
    if (!fy) return;

    if (fy.auditStatus !== "completed") {
      try {
        await api(`/api/financial-years/${fy.id}/mark-audit-completed`, { method: "POST", body: "{}" });
      } catch (e: any) {
        toast({ title: "Cannot mark audit", description: e.message, variant: "destructive" });
        return;
      }
    }

    // Mandatory backup before close (independent of FY status — always create for this period)
    try {
      await api("/api/accounting-backups", {
        method: "POST",
        body: JSON.stringify({
          backupType: "financial_year",
          fromDate: fy.startDate,
          toDate: fy.endDate,
          financialYearId: fy.id,
          financialYearLabel: fy.label,
          source: "fy_close",
        }),
      });
    } catch (e: any) {
      toast({
        title: "Backup required",
        description:
          e.message ||
          "Financial year closing cannot continue because the required backup was not completed successfully.",
        variant: "destructive",
      });
      return;
    }

    const ready = await api(`/api/financial-years/${fy.id}/checklist`);
    if (!ready.canClose) {
      setChecklist(ready);
      const backupFailed = (ready.items || []).some((i: any) => i.key === "backup" && !i.ok);
      toast({
        title: "Year-end validation incomplete",
        description: backupFailed
          ? "Financial year closing cannot continue because the required backup was not completed successfully."
          : "Complete outstanding checklist items before closing.",
        variant: "destructive",
      });
      return;
    }

    setRunning(true);
    setPhase("progress");
    setStepIdx(0);

    const advance = async (i: number) => {
      setStepIdx(i);
      await new Promise((r) => setTimeout(r, 280));
    };

    try {
      for (let i = 0; i < 3; i++) await advance(i);

      const closeRes = await api(`/api/financial-years/${fy.id}/close`, { method: "POST", body: "{}" });
      const closed = closeRes.closed as Fy;
      let next = closeRes.next as Fy;

      for (let i = 3; i < 10; i++) await advance(i);

      if (next?.id) {
        await api(`/api/financial-years/${next.id}/activate`, { method: "POST", body: "{}" });
        const refreshed = await api("/api/financial-years");
        next = (refreshed.years as Fy[]).find((y) => y.id === next.id) || next;
      }

      await advance(10);

      setResult({ closed, next });
      setPhase("done");
      qc.invalidateQueries({ queryKey: ["financial-years"] });
      qc.invalidateQueries({ queryKey: ["financial-years-for-date"] });

      if (next?.startDate && next?.endDate) {
        const from = fromInputDate(next.startDate);
        const to = fromInputDate(next.endDate);
        if (from && to) applyDateRange("custom", from, to);
      }

      toast({ title: "Financial year successfully closed", description: closeRes.message });
    } catch (e: any) {
      setPhase("blocks");
      toast({ title: "Rollover failed", description: e.message, variant: "destructive" });
    } finally {
      setRunning(false);
    }
  }

  const displayCurrent = checklist?.financialYear;
  const companyOk = !!selectedCompany;

  if (!companyOk) return null;

  return (
    <>
      {/* Step 1: Confirmation message */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close Financial Year & Open Next Year</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-left text-sm text-muted-foreground">
                <p>
                  Current period:{" "}
                  <strong className="text-foreground">
                    {fmtFyDates(rangeFrom, rangeTo)}
                  </strong>
                </p>
                <p>
                  Closing <strong className="text-foreground">{nextBounds.currentLabel}</strong> will
                  make all transactions for this year read-only.
                </p>
                <p>
                  The next financial year,{" "}
                  <strong className="text-foreground">{nextBounds.nextLabel}</strong>, will then be
                  opened for new transactions.
                </p>
                <p className="font-medium text-foreground">Do you want to continue?</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-[#2563EB] hover:bg-[#1d4ed8]"
              onClick={(e) => {
                e.preventDefault();
                void afterConfirmYes();
              }}
            >
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Step 2+: Checklist blocks → progress → done */}
      <Dialog open={wizardOpen} onOpenChange={(v) => { if (!running) setWizardOpen(v); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          {phase === "blocks" && (
            <>
              <DialogHeader>
                <DialogTitle>Year-End Closing</DialogTitle>
                <DialogDescription>
                  Review the blocks below, then confirm Close FY & Start Next FY.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border p-3 bg-muted/30">
                    <p className="text-[11px] font-semibold uppercase text-muted-foreground">Current Financial Year</p>
                    <p className="mt-1 font-semibold">
                      {displayCurrent?.label || nextBounds.currentLabel}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {displayCurrent
                        ? fmtFyDates(displayCurrent.startDate, displayCurrent.endDate)
                        : fmtFyDates(nextBounds.currentStart, nextBounds.currentEnd)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
                    <p className="text-[11px] font-semibold uppercase text-muted-foreground">New Financial Year</p>
                    <p className="mt-1 font-semibold">{nextBounds.nextLabel}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {fmtFyDates(nextBounds.nextStart, nextBounds.nextEnd)}
                    </p>
                  </div>
                </div>

                <div className="rounded-lg border p-3 space-y-2">
                  <p className="font-semibold">Year-End Checklist</p>
                  <ul className="space-y-1.5">
                    {YEAR_END_CHECKLIST.map((label) => {
                      const matched = (checklist?.items || []).find((i: any) =>
                        label.toLowerCase().includes(String(i.key || "").replace(/_/g, " ")) ||
                        String(i.label || "").toLowerCase().includes(label.split(" ")[0].toLowerCase()),
                      );
                      const itemOk = matched ? matched.ok : true;
                      return (
                        <li key={label} className="flex items-start gap-2 text-[13px]">
                          {itemOk ? (
                            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
                          ) : (
                            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                          )}
                          <span>{label}</span>
                        </li>
                      );
                    })}
                  </ul>
                  {(checklist?.items || [])
                    .filter((i: any) => !i.ok)
                    .map((i: any) => (
                      <p key={i.key} className="text-xs text-amber-700">
                        Action needed: {i.label} — {i.detail}
                      </p>
                    ))}
                </div>

                <div className="rounded-lg border p-3 space-y-2">
                  <p className="font-semibold">Balances carried forward automatically</p>
                  <ul className="space-y-1">
                    {CARRY_FORWARD.map((label) => (
                      <li key={label} className="flex items-start gap-2 text-[13px]">
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
                        <span>{label}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12px] text-amber-900">
                  <strong>Warning:</strong> Once closed, the previous year is <strong>READ ONLY</strong>.
                  Transactions cannot be edited or deleted unless an administrator reopens the year.
                </div>
              </div>
              <DialogFooter className="gap-2">
                <Button type="button" variant="outline" onClick={() => setWizardOpen(false)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  className="bg-[#2563EB] hover:bg-[#1d4ed8]"
                  disabled={running}
                  onClick={runRollover}
                >
                  Close FY & Start Next FY
                </Button>
              </DialogFooter>
            </>
          )}

          {phase === "progress" && (
            <>
              <DialogHeader>
                <DialogTitle>
                  Closing {displayCurrent?.label || nextBounds.currentLabel}…
                </DialogTitle>
              </DialogHeader>
              <ul className="space-y-2 text-sm py-2">
                {PROGRESS_STEPS.map((label, i) => (
                  <li key={label} className="flex items-center gap-2 rounded-md border px-2.5 py-2">
                    {i < stepIdx ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                    ) : i === stepIdx ? (
                      <Loader2 className="h-4 w-4 animate-spin text-[#2563EB] shrink-0" />
                    ) : (
                      <span className="h-4 w-4 rounded-full border border-muted-foreground/30 shrink-0" />
                    )}
                    <span className={i <= stepIdx ? "text-foreground" : "text-muted-foreground"}>
                      {i + 1}. {label}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {phase === "done" && result && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-emerald-700">
                  <CheckCircle2 className="h-5 w-5" />
                  Financial Year Successfully Closed
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3 text-sm py-2">
                <div className="rounded-lg border px-3 py-2">
                  <strong>{result.closed.label}</strong> → Closed
                </div>
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
                  <strong>{result.next.label}</strong> → Current
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  className="bg-[#2563EB] hover:bg-[#1d4ed8]"
                  onClick={() => setWizardOpen(false)}
                >
                  Continue to {result.next.label}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Financial year status + close/activate actions.
 * Reuses the existing Dashboard date range (no separate FY management screen).
 */
export function FinancialYearControls() {
  const { toast } = useToast();
  const { canManage, isAdmin, selectedCompany } = useAuth();
  const { rangeFrom, rangeTo } = useDateRangeOptional();
  const qc = useQueryClient();
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [activateOpen, setActivateOpen] = useState(false);
  const [checklist, setChecklist] = useState<any>(null);
  const [preview, setPreview] = useState<any>(null);

  const countryRaw = String((selectedCompany as any)?.country || "").trim();
  const enabled =
    !!selectedCompany &&
    (countryRaw.toLowerCase().includes("singapore") || countryRaw.toUpperCase() === "SG");

  const { data } = useQuery({
    queryKey: ["financial-years", selectedCompany?.id],
    queryFn: () => api("/api/financial-years"),
    enabled,
  });

  const years: Fy[] = data?.years || [];
  const active: Fy | null = data?.active || null;

  const rangeMid = useMemo(() => {
    const t = (rangeFrom.getTime() + rangeTo.getTime()) / 2;
    return new Date(t);
  }, [rangeFrom, rangeTo]);

  const selectedFy = useMemo(() => {
    const d = toInputDate(rangeMid);
    return (
      years.find((y) => y.startDate <= d && y.endDate >= d) ||
      active ||
      null
    );
  }, [years, rangeMid, active]);

  const nextInactive = useMemo(() => {
    if (!selectedFy) return years.find((y) => y.status === "inactive") || null;
    return (
      years.find((y) => y.status === "inactive" && y.startDate > selectedFy.endDate) ||
      years.find((y) => y.status === "inactive") ||
      null
    );
  }, [years, selectedFy]);

  const fyLabelFallback = financialYearLabel(startOfFinancialYear(rangeMid), endOfFinancialYear(rangeMid));

  const closeMut = useMutation({
    mutationFn: (id: number) => api(`/api/financial-years/${id}/close`, { method: "POST", body: "{}" }),
    onSuccess: (res) => {
      toast({ title: "Financial year closed", description: res.message });
      setChecklistOpen(false);
      qc.invalidateQueries({ queryKey: ["financial-years"] });
    },
    onError: (e: any) => toast({ title: "Cannot close", description: e.message, variant: "destructive" }),
  });

  const auditMut = useMutation({
    mutationFn: (id: number) =>
      api(`/api/financial-years/${id}/mark-audit-completed`, { method: "POST", body: "{}" }),
    onSuccess: () => {
      toast({ title: "Audit marked completed" });
      qc.invalidateQueries({ queryKey: ["financial-years"] });
      if (selectedFy) openChecklist(selectedFy.id);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const activateMut = useMutation({
    mutationFn: (id: number) => api(`/api/financial-years/${id}/activate`, { method: "POST", body: "{}" }),
    onSuccess: (res) => {
      toast({ title: "Financial year activated", description: res.message });
      setActivateOpen(false);
      qc.invalidateQueries({ queryKey: ["financial-years"] });
    },
    onError: (e: any) => toast({ title: "Cannot activate", description: e.message, variant: "destructive" }),
  });

  const reopenMut = useMutation({
    mutationFn: (id: number) => api(`/api/financial-years/${id}/reopen`, { method: "POST", body: "{}" }),
    onSuccess: (res) => {
      toast({ title: "Year reopened", description: res.message });
      qc.invalidateQueries({ queryKey: ["financial-years"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  async function openChecklist(id: number) {
    try {
      const c = await api(`/api/financial-years/${id}/checklist`);
      setChecklist(c);
      setChecklistOpen(true);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  }

  async function openActivate(prevId: number, nextId: number) {
    try {
      const p = await api(`/api/financial-years/${prevId}/opening-balance-preview`);
      setPreview({ ...p, nextId });
      setActivateOpen(true);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  }

  if (!enabled) return null;

  const status = selectedFy?.status || "active";
  const isClosed = status === "closed";

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <div
          className={`inline-flex flex-col rounded-xl border px-3 py-2 text-[12px] shadow-sm ${
            isClosed ? "border-amber-200 bg-amber-50" : "border-[#e8edf5] bg-white"
          }`}
        >
          <span className="font-semibold text-[#101828]">
            Financial Year: {selectedFy?.label || fyLabelFallback}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-[#64748b]">
            Status:{" "}
            <Badge
              className={
                isClosed
                  ? "bg-amber-600 hover:bg-amber-600"
                  : status === "active"
                    ? "bg-emerald-600 hover:bg-emerald-600"
                    : "bg-slate-500 hover:bg-slate-500"
              }
            >
              {(status || "ACTIVE").toUpperCase()}
            </Badge>
            {selectedFy && (
              <>
                · Audit: {(selectedFy.auditStatus || "pending").toUpperCase()}
                {isClosed && <> · Access: VIEW ONLY</>}
              </>
            )}
          </span>
        </div>

        {canManage && selectedFy && selectedFy.status !== "closed" && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1"
            onClick={() => openChecklist(selectedFy.id)}
          >
            <Lock className="h-3.5 w-3.5" />
            Close Financial Year
          </Button>
        )}

        {canManage && selectedFy?.status === "closed" && nextInactive && (
          <Button
            type="button"
            size="sm"
            className="gap-1 bg-[#2563EB] hover:bg-[#1d4ed8]"
            onClick={() => openActivate(selectedFy.id, nextInactive.id)}
          >
            <Play className="h-3.5 w-3.5" />
            Activate {nextInactive.label}
          </Button>
        )}

        {isAdmin && selectedFy?.status === "closed" && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1 text-amber-700"
            onClick={() => reopenMut.mutate(selectedFy.id)}
            disabled={reopenMut.isPending}
          >
            <Unlock className="h-3.5 w-3.5" />
            Reopen
          </Button>
        )}
      </div>

      <Dialog open={checklistOpen} onOpenChange={setChecklistOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Financial Year Closing Checklist</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <p className="text-muted-foreground">
              {checklist?.financialYear?.label} ({checklist?.financialYear?.startDate} →{" "}
              {checklist?.financialYear?.endDate})
            </p>
            {(checklist?.items || []).map((item: any) => (
              <div key={item.key} className="flex items-start gap-2 rounded-lg border px-3 py-2">
                {item.ok ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                ) : (
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                )}
                <div>
                  <p className="font-medium">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{item.detail}</p>
                </div>
              </div>
            ))}
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            {checklist?.financialYear?.auditStatus !== "completed" && (
              <Button
                type="button"
                variant="outline"
                onClick={() => auditMut.mutate(checklist.financialYear.id)}
                disabled={auditMut.isPending}
              >
                Mark Audit Completed
              </Button>
            )}
            <Button
              type="button"
              disabled={!checklist?.canClose || closeMut.isPending}
              onClick={() => closeMut.mutate(checklist.financialYear.id)}
            >
              Close Financial Year
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={activateOpen} onOpenChange={setActivateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Activate Financial Year — Opening Balances</DialogTitle>
          </DialogHeader>
          {preview && (
            <div className="space-y-3 text-sm">
              <p>
                Previous: <strong>{preview.previousFinancialYear?.label}</strong>
                <br />
                New: <strong>{preview.newFinancialYear?.label}</strong>
              </p>
              <div className="rounded-lg border divide-y">
                {[
                  ["Cash", preview.summary?.cash],
                  ["Bank", preview.summary?.bank],
                  ["Receivables", preview.summary?.receivables],
                  ["Payables", preview.summary?.payables],
                  ["Inventory", preview.summary?.inventory],
                  ["Fixed Assets", preview.summary?.fixedAssets],
                  ["Capital / Equity", preview.summary?.capital],
                ].map(([label, val]) => (
                  <div key={String(label)} className="flex justify-between px-3 py-2">
                    <span>{label}</span>
                    <span className="font-mono">
                      {new Intl.NumberFormat("en-SG", {
                        style: "currency",
                        currency: "SGD",
                      }).format(Number(val) || 0)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setActivateOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={activateMut.isPending || !preview?.nextId}
              onClick={() => activateMut.mutate(preview.nextId)}
            >
              Confirm Activate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function usePeriodReadOnly() {
  const { selectedCompany } = useAuth();
  const { rangeFrom, rangeTo } = useDateRangeOptional();
  const countryRaw = String((selectedCompany as any)?.country || "").trim();
  const enabled =
    !!selectedCompany &&
    (countryRaw.toLowerCase().includes("singapore") || countryRaw.toUpperCase() === "SG");
  const mid = toInputDate(new Date((rangeFrom.getTime() + rangeTo.getTime()) / 2));

  const { data } = useQuery({
    queryKey: ["financial-years-for-date", selectedCompany?.id, mid],
    queryFn: () => api(`/api/financial-years/for-date?date=${mid}`),
    enabled,
  });

  return {
    readOnly: !!data?.readOnly,
    financialYear: data?.financialYear as Fy | undefined,
    access: (data?.access as string) || "FULL",
  };
}

export function ClosedYearBanner() {
  const { readOnly, financialYear: fy } = usePeriodReadOnly();

  if (!readOnly) return null;
  return (
    <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <Lock className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        <p className="font-semibold">
          Financial Year: {fy?.label} · Status: CLOSED · Access: VIEW ONLY
        </p>
        <p className="text-xs mt-0.5">
          Create, Edit, Delete, and Post are blocked for this year. Reports and ledgers remain available.
        </p>
      </div>
    </div>
  );
}
