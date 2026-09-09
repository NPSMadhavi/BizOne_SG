import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  Check,
  Download,
  Eye,
  Loader2,
  RotateCcw,
  Trash2,
  CalendarClock,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { fmtRangeLabel, fromInputDate } from "@/lib/date-range";

type Backup = {
  id: number;
  backupCode: string;
  backupType: string;
  fromDate: string | null;
  toDate: string | null;
  financialYearId: number | null;
  financialYearLabel: string | null;
  status: string;
  storagePath: string | null;
  fileSizeBytes: number | null;
  checksumSha256: string | null;
  backupSource: string;
  createdByUsername: string | null;
  createdAt: string;
  completedAt: string | null;
  errorMessage: string | null;
};

type Fy = {
  id: number;
  label: string;
  startDate: string;
  endDate: string;
  status: string;
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

function formatSize(n: number | null | undefined) {
  if (n == null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

type RestoreStep = { key: string; label: string; done: boolean; error?: string };

function statusBadge(status: string) {
  const s = status.toUpperCase();
  const cls =
    s === "COMPLETED"
      ? "bg-emerald-600"
      : s === "FAILED" || s === "ROLLED_BACK"
        ? "bg-red-600"
        : s === "RESTORED"
          ? "bg-violet-600"
          : s === "IN_PROGRESS" ||
              s === "RESTORING" ||
              s === "VALIDATING" ||
              s === "VERIFYING" ||
              s === "SAFETY_BACKUP"
            ? "bg-amber-500"
            : "bg-slate-500";
  return <Badge className={`${cls} hover:${cls}`}>{s}</Badge>;
}

function typeLabel(t: string) {
  if (t === "full_database") return "Full Database Backup";
  if (t === "financial_year") return "Financial Year Backup";
  return "Accounting / Financial Data Backup";
}

function fmtPeriod(start: string, end: string) {
  const a = fromInputDate(start);
  const b = fromInputDate(end);
  if (!a || !b) return `${start} → ${end}`;
  return fmtRangeLabel(a, b);
}

export default function SettingsBackupsPage() {
  const { toast } = useToast();
  const { isAdmin, canManage, selectedCompany } = useAuth();
  const qc = useQueryClient();

  const uploadRef = useRef<HTMLInputElement>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<Backup | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<Backup | null>(null);
  const [confirmPhrase, setConfirmPhrase] = useState("");
  const [restoreAck, setRestoreAck] = useState(false);
  const [restoreProgress, setRestoreProgress] = useState<{
    status: string;
    steps: RestoreStep[];
    restoreCode?: string;
    safetyBackupCode?: string;
    message?: string;
  } | null>(null);
  const [backupType, setBackupType] = useState<string>("accounting");
  const [selectedFyId, setSelectedFyId] = useState<string>("");
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [freq, setFreq] = useState("daily");
  const [timeOfDay, setTimeOfDay] = useState("23:00");
  const [dayOfWeek, setDayOfWeek] = useState("0");

  const enabled = !!selectedCompany;
  const countryRaw = String((selectedCompany as any)?.country || "").trim();
  const countryLower = countryRaw.toLowerCase();
  // Match shell: country may be "Singapore", "SG", or similar — not only the full name
  const isSingapore =
    countryLower === "singapore" ||
    countryLower.includes("singapore") ||
    countryRaw.toUpperCase() === "SG";

  const { data, isLoading } = useQuery({
    queryKey: ["accounting-backups", selectedCompany?.id],
    queryFn: () => api("/api/accounting-backups"),
    enabled: enabled && isSingapore,
  });

  const { data: fyData } = useQuery({
    queryKey: ["financial-years", selectedCompany?.id],
    queryFn: () => api("/api/financial-years"),
    enabled: enabled && isSingapore,
  });

  const { data: schedulesData } = useQuery({
    queryKey: ["accounting-backup-schedules", selectedCompany?.id],
    queryFn: () => api("/api/accounting-backup-schedules"),
    enabled: enabled && isAdmin && isSingapore,
  });

  const backups: Backup[] = data?.backups || [];
  const years: Fy[] = fyData?.years || [];
  const activeFy: Fy | null = fyData?.active || null;
  const schedules = schedulesData?.schedules || [];

  const selectedFy = useMemo(
    () => years.find((y) => String(y.id) === selectedFyId) || null,
    [years, selectedFyId],
  );

  function openCreate() {
    const def = activeFy || years[years.length - 1];
    setSelectedFyId(def ? String(def.id) : "");
    setBackupType("accounting");
    setCreateOpen(true);
  }

  function openRestore(b: Backup) {
    setRestoreTarget(b);
    setConfirmPhrase("");
    setRestoreAck(false);
    setRestoreProgress(null);
  }

  const createMut = useMutation({
    mutationFn: () => {
      if (backupType === "financial_year") {
        if (!selectedFy) throw new Error("Select a financial year from your company records");
        return api("/api/accounting-backups", {
          method: "POST",
          body: JSON.stringify({
            backupType: "financial_year",
            financialYearId: selectedFy.id,
            fromDate: selectedFy.startDate,
            toDate: selectedFy.endDate,
            financialYearLabel: selectedFy.label,
          }),
        });
      }
      // Full / accounting: still tag with active FY when available (real company FY)
      return api("/api/accounting-backups", {
        method: "POST",
        body: JSON.stringify({
          backupType,
          financialYearId: activeFy?.id,
          financialYearLabel: activeFy?.label,
          fromDate: activeFy?.startDate,
          toDate: activeFy?.endDate,
        }),
      });
    },
    onSuccess: (res) => {
      toast({ title: "Backup completed", description: res.backup?.backupCode });
      setCreateOpen(false);
      qc.invalidateQueries({ queryKey: ["accounting-backups"] });
    },
    onError: (e: any) => toast({ title: "Backup failed", description: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) =>
      api(`/api/accounting-backups/${id}?force=true`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Backup deleted" });
      qc.invalidateQueries({ queryKey: ["accounting-backups"] });
    },
    onError: (e: any) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  const restoreMut = useMutation({
    mutationFn: async (b: Backup) => {
      setRestoreProgress({
        status: "VALIDATING",
        steps: [
          { key: "validated", label: "Backup validated", done: false },
          { key: "safety", label: "Safety backup created", done: false },
          { key: "restored", label: "Database restore completed", done: false },
          { key: "verified", label: "Data validation completed", done: false },
        ],
      });
      return api(`/api/accounting-backups/${b.id}/restore`, {
        method: "POST",
        body: JSON.stringify({
          confirm: true,
          confirmPhrase: confirmPhrase.trim(),
        }),
      });
    },
    onSuccess: (res) => {
      setRestoreProgress({
        status: res.operation?.status || "COMPLETED",
        steps: res.steps || [],
        restoreCode: res.operation?.restoreCode,
        safetyBackupCode: res.operation?.safetyBackupCode,
        message: res.message,
      });
      toast({
        title: "RESTORE COMPLETED",
        description: `Restore ${res.operation?.restoreCode} · Safety ${res.operation?.safetyBackupCode}`,
      });
      qc.invalidateQueries({ queryKey: ["accounting-backups"] });
      qc.invalidateQueries({ queryKey: ["financial-years"] });
    },
    onError: (e: any) => {
      setRestoreProgress((prev) =>
        prev
          ? { ...prev, status: "FAILED", message: e.message }
          : { status: "FAILED", steps: [], message: e.message },
      );
      toast({ title: "Restore failed", description: e.message, variant: "destructive" });
    },
  });

  const uploadMut = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/accounting-backups/upload", {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || res.statusText);
      return data;
    },
    onSuccess: (res) => {
      toast({
        title: "Backup uploaded",
        description: `${res.backup?.backupCode} validated and added to history`,
      });
      qc.invalidateQueries({ queryKey: ["accounting-backups"] });
    },
    onError: (e: any) => toast({ title: "Upload failed", description: e.message, variant: "destructive" }),
  });

  const scheduleMut = useMutation({
    mutationFn: () =>
      api("/api/accounting-backup-schedules", {
        method: "POST",
        body: JSON.stringify({
          frequency: freq,
          timeOfDay,
          dayOfWeek: freq === "weekly" ? Number(dayOfWeek) : null,
          backupType: "accounting",
          enabled: true,
        }),
      }),
    onSuccess: () => {
      toast({ title: "Schedule saved" });
      setScheduleOpen(false);
      qc.invalidateQueries({ queryKey: ["accounting-backup-schedules"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  async function downloadBackup(b: Backup) {
    try {
      const res = await fetch(`/api/accounting-backups/${b.id}/download`, { credentials: "include" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Download failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${b.backupCode}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast({ title: "Download failed", description: e.message, variant: "destructive" });
    }
  }

  if (!isSingapore) {
    return (
      <div className="py-16 text-center text-muted-foreground text-sm">
        Backup & Restore is available for Singapore companies.
      </div>
    );
  }

  const needsRestoreTyped = true;
  const canSubmitRestore =
    !!restoreTarget &&
    restoreAck &&
    !restoreMut.isPending &&
    confirmPhrase.trim().toUpperCase() === "RESTORE";

  return (
    <div className="space-y-6 pb-16 animate-in fade-in duration-300">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[#2563EB]">Backup & Restore</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {isAdmin && (
            <>
              <input
                ref={uploadRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadMut.mutate(f);
                  e.target.value = "";
                }}
              />
              <Button
                type="button"
                variant="outline"
                className="gap-1.5"
                disabled={uploadMut.isPending}
                onClick={() => uploadRef.current?.click()}
              >
                {uploadMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Upload Backup
              </Button>
              <Button type="button" variant="outline" className="gap-1.5" onClick={() => setScheduleOpen(true)}>
                <CalendarClock className="h-4 w-4" />
                Schedule
              </Button>
            </>
          )}
          {canManage && (
            <Button type="button" className="gap-1.5 bg-[#2563EB] hover:bg-[#1d4ed8]" onClick={openCreate}>
              Create Backup
            </Button>
          )}
        </div>
      </div>

      {activeFy && (
        <Card>
          <CardContent className="py-3 text-sm">
            <span className="text-muted-foreground">Current financial year: </span>
            <strong>{activeFy.label}</strong>
            <span className="text-muted-foreground">
              {" "}
              ({fmtPeriod(activeFy.startDate, activeFy.endDate)}) · Status: {activeFy.status.toUpperCase()}
            </span>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-base">Backup History</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : backups.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">
              No backups yet. Create a backup of your company financial year data.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b text-xs text-muted-foreground uppercase">
                  <tr>
                    <th className="px-4 py-3 text-left">Backup ID</th>
                    <th className="px-4 py-3 text-left">Type</th>
                    <th className="px-4 py-3 text-left">Period</th>
                    <th className="px-4 py-3 text-left">Created By</th>
                    <th className="px-4 py-3 text-left">Date/Time</th>
                    <th className="px-4 py-3 text-left">Size</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {backups.map((b) => (
                    <tr key={b.id} className="hover:bg-muted/20">
                      <td className="px-4 py-3 font-mono text-xs">{b.backupCode}</td>
                      <td className="px-4 py-3">{typeLabel(b.backupType)}</td>
                      <td className="px-4 py-3 text-xs">
                        {b.financialYearLabel ||
                          (b.fromDate && b.toDate ? fmtPeriod(b.fromDate, b.toDate) : "—")}
                      </td>
                      <td className="px-4 py-3">{b.createdByUsername || "—"}</td>
                      <td className="px-4 py-3 text-xs">
                        {new Date(b.createdAt).toLocaleString("en-SG")}
                      </td>
                      <td className="px-4 py-3">{formatSize(b.fileSizeBytes)}</td>
                      <td className="px-4 py-3">{statusBadge(b.status)}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            title="View Details"
                            onClick={() => setDetail(b)}
                          >
                            <Eye className="h-3.5 w-3.5 mr-1" />
                            View Details
                          </Button>
                          {b.status === "completed" && (
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Download" onClick={() => downloadBackup(b)}>
                              <Download className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {isAdmin && (b.status === "completed" || b.status === "restored") && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs text-amber-700"
                              title="Restore"
                              onClick={() => openRestore(b)}
                            >
                              <RotateCcw className="h-3.5 w-3.5 mr-1" />
                              Restore
                            </Button>
                          )}
                          {isAdmin && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-destructive"
                              title="Delete"
                              onClick={() => deleteMut.mutate(b.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {isAdmin && schedules.length > 0 && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-base">Schedules</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            {schedules.map((s: any) => (
              <div key={s.id} className="flex justify-between rounded-lg border px-3 py-2">
                <span>
                  {s.frequency} at {s.timeOfDay}
                  {s.frequency === "weekly" ? ` (weekday ${s.dayOfWeek})` : ""}
                  {" · "}
                  {s.enabled ? "Enabled" : "Disabled"}
                </span>
                <span className="text-xs text-muted-foreground">
                  Next: {s.nextRunAt ? new Date(s.nextRunAt).toLocaleString("en-SG") : "—"}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Backup</DialogTitle>
            <DialogDescription>
              Uses this company&apos;s real financial year records from the database. Does not change accounting data.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Backup Type</Label>
              <Select value={backupType} onValueChange={setBackupType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="full_database">Full Database Backup (company accounting)</SelectItem>
                  <SelectItem value="accounting">Accounting / Financial Data Backup</SelectItem>
                  <SelectItem value="financial_year">Financial Year Backup</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {backupType === "financial_year" ? (
              <div className="space-y-1.5">
                <Label>Financial Year</Label>
                {years.length === 0 ? (
                  <p className="text-sm text-amber-700">
                    No financial years found for this company. Open the Dashboard once to seed the current year, then try again.
                  </p>
                ) : (
                  <Select value={selectedFyId} onValueChange={setSelectedFyId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select financial year" />
                    </SelectTrigger>
                    <SelectContent>
                      {years.map((y) => (
                        <SelectItem key={y.id} value={String(y.id)}>
                          {y.label} ({fmtPeriod(y.startDate, y.endDate)}) — {y.status.toUpperCase()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {selectedFy && (
                  <p className="text-xs text-muted-foreground">
                    Period: {fmtPeriod(selectedFy.startDate, selectedFy.endDate)}
                  </p>
                )}
              </div>
            ) : (
              activeFy && (
                <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
                  <p className="font-medium">Linked financial year</p>
                  <p className="text-muted-foreground mt-0.5">
                    {activeFy.label} · {fmtPeriod(activeFy.startDate, activeFy.endDate)}
                  </p>
                </div>
              )
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-[#2563EB] hover:bg-[#1d4ed8]"
              disabled={createMut.isPending || (backupType === "financial_year" && !selectedFy)}
              onClick={() => createMut.mutate()}
            >
              {createMut.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-1" /> Creating…
                </>
              ) : (
                <>
                  <Archive className="h-4 w-4 mr-1" /> Create Backup
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Backup Details</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-2 text-sm">
              <p>
                <strong>Backup ID:</strong> {detail.backupCode}
              </p>
              <p>
                <strong>Type:</strong> {typeLabel(detail.backupType)}
              </p>
              <p>
                <strong>Financial Year:</strong> {detail.financialYearLabel || "—"}
              </p>
              <p>
                <strong>Period:</strong>{" "}
                {detail.fromDate && detail.toDate ? fmtPeriod(detail.fromDate, detail.toDate) : "—"}
              </p>
              <p>
                <strong>Created By:</strong> {detail.createdByUsername || "—"}
              </p>
              <p>
                <strong>Created:</strong> {new Date(detail.createdAt).toLocaleString("en-SG")}
              </p>
              <p>
                <strong>Size:</strong> {formatSize(detail.fileSizeBytes)}
              </p>
              <p>
                <strong>Status:</strong> {detail.status}
              </p>
              <p>
                <strong>Storage:</strong> {detail.storagePath || "—"}
              </p>
              <p className="break-all">
                <strong>Checksum:</strong> {detail.checksumSha256 || "—"}
              </p>
              {detail.errorMessage && (
                <p className="text-destructive">
                  <strong>Error:</strong> {detail.errorMessage}
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!restoreTarget}
        onOpenChange={(o) => {
          if (!o && !restoreMut.isPending) {
            setRestoreTarget(null);
            setRestoreProgress(null);
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Restore Backup?</DialogTitle>
            <DialogDescription>
              This action will restore the selected backup and may replace current accounting data.
            </DialogDescription>
          </DialogHeader>

          {restoreTarget && restoreProgress?.status !== "COMPLETED" && (
            <div className="space-y-3">
              <div className="space-y-1 text-sm rounded-lg border p-3">
                <p>
                  <strong>Backup ID:</strong> {restoreTarget.backupCode}
                </p>
                <p>
                  <strong>Backup Type:</strong> {typeLabel(restoreTarget.backupType)}
                </p>
                <p>
                  <strong>Backup Created Date:</strong>{" "}
                  {new Date(restoreTarget.createdAt).toLocaleString("en-SG")}
                </p>
                <p>
                  <strong>Financial Period:</strong>{" "}
                  {restoreTarget.financialYearLabel ||
                    (restoreTarget.fromDate && restoreTarget.toDate
                      ? fmtPeriod(restoreTarget.fromDate, restoreTarget.toDate)
                      : "—")}
                </p>
                <p>
                  <strong>Backup Status:</strong> {restoreTarget.status.toUpperCase()}
                </p>
              </div>

              <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                Before restoring, the system will automatically create a safety backup of the current data.
              </div>

              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
                This backup may contain data from an earlier point in time. Restoring it may remove or
                replace changes made after the backup was created.
              </div>

              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={restoreAck}
                  disabled={restoreMut.isPending}
                  onChange={(e) => setRestoreAck(e.target.checked)}
                />
                <span>
                  I understand this is a high-risk administrative operation and I want to proceed.
                </span>
              </label>

              {needsRestoreTyped && (
                <div className="space-y-1.5">
                  <Label htmlFor="confirm-restore">Type RESTORE to confirm</Label>
                  <Input
                    id="confirm-restore"
                    value={confirmPhrase}
                    disabled={restoreMut.isPending}
                    onChange={(e) => setConfirmPhrase(e.target.value)}
                    placeholder="RESTORE"
                    autoComplete="off"
                  />
                </div>
              )}

              {restoreProgress && (
                <div className="rounded-lg border p-3 space-y-2 text-sm">
                  <p className="font-medium">Restore progress · {restoreProgress.status}</p>
                  <ul className="space-y-1">
                    {(restoreProgress.steps || []).map((s) => (
                      <li key={s.key} className="flex items-center gap-2">
                        {s.done ? (
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                        ) : restoreMut.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                        ) : (
                          <span className="h-3.5 w-3.5 rounded-full border inline-block" />
                        )}
                        <span className={s.done ? "text-foreground" : "text-muted-foreground"}>
                          {s.label}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {restoreProgress.message && (
                    <p className="text-destructive text-xs pt-1">{restoreProgress.message}</p>
                  )}
                </div>
              )}
            </div>
          )}

          {restoreProgress?.status === "COMPLETED" && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm space-y-2">
              <p className="font-semibold text-emerald-800">RESTORE COMPLETED</p>
              <ul className="space-y-1">
                {(restoreProgress.steps || []).map((s) => (
                  <li key={s.key} className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                    {s.label}
                  </li>
                ))}
              </ul>
              <p>
                <strong>Restore ID:</strong> {restoreProgress.restoreCode}
              </p>
              <p>
                <strong>Safety Backup:</strong> {restoreProgress.safetyBackupCode}
              </p>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={restoreMut.isPending}
              onClick={() => {
                setRestoreTarget(null);
                setRestoreProgress(null);
              }}
            >
              {restoreProgress?.status === "COMPLETED" ? "Close" : "Cancel"}
            </Button>
            {restoreProgress?.status !== "COMPLETED" && (
              <Button
                type="button"
                variant="destructive"
                disabled={!canSubmitRestore}
                onClick={() => restoreTarget && restoreMut.mutate(restoreTarget)}
              >
                {restoreMut.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-1" /> Restoring…
                  </>
                ) : (
                  "Create Safety Backup & Restore"
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Automatic Backup Schedule</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Frequency</Label>
              <Select value={freq} onValueChange={setFreq}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily (e.g. every day at 11:00 PM)</SelectItem>
                  <SelectItem value="weekly">Weekly (e.g. Sunday at 11:00 PM)</SelectItem>
                  <SelectItem value="monthly">Monthly (last day of month)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Time (HH:mm)</Label>
              <Input value={timeOfDay} onChange={(e) => setTimeOfDay(e.target.value)} placeholder="23:00" />
            </div>
            {freq === "weekly" && (
              <div className="space-y-1.5">
                <Label>Day of week (0=Sun … 6=Sat)</Label>
                <Input value={dayOfWeek} onChange={(e) => setDayOfWeek(e.target.value)} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setScheduleOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={scheduleMut.isPending} onClick={() => scheduleMut.mutate()}>
              Save Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
