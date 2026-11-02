import { useMemo, useState, useEffect } from "react";
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
  AlertTriangle,
  Clock,
  ShieldCheck,
  Server,
  FileCheck,
  Database,
  Search,
  RefreshCw,
  HardDrive,
  Copy,
  CheckCircle2,
  XCircle,
  FileArchive,
  Settings2,
  Laptop,
  FolderOpen,
  Key,
  Globe,
  Radio,
  Terminal,
  Play,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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

type BackupRecord = {
  id: number;
  company_id: number;
  backup_code: string;
  backup_type: string;
  from_date?: string | null;
  to_date?: string | null;
  status: string;
  storage_path?: string | null;
  storage_ref?: string | null;
  file_size_bytes?: number | null;
  checksum_sha256?: string | null;
  backup_source: string; // manual | scheduled | safety
  error_message?: string | null;
  created_by_username?: string | null;
  created_at: string;
  completed_at?: string | null;
  restored_at?: string | null;
};

type LocalDownloadRecord = {
  id: number;
  company_id: number;
  backup_id?: number | null;
  backup_code?: string | null;
  file_name: string;
  destination_folder: string;
  file_size_bytes?: number | null;
  status: string; // Completed | Downloading | Pending | Failed | Verification Failed
  checksum_status: string; // Passed | Failed | Pending
  checksum_sha256?: string | null;
  error_message?: string | null;
  agent_hostname?: string | null;
  downloaded_at: string;
};

type AgentStatus = {
  connected: boolean;
  lastContactAt?: string | null;
  lastSuccessfulDownloadAt?: string | null;
  lastDownloadStatus?: string | null;
  agentToken?: string | null;
  timezone?: string;
};

type BackupSchedule = {
  id: number;
  company_id: number;
  enabled: boolean;
  frequency: "daily" | "weekly" | "monthly";
  time_of_day: string;
  day_of_week?: number | null;
  destination_dir?: string | null;
  local_download_enabled?: boolean;
  local_destination_dir?: string | null;
  local_timezone?: string | null;
  local_download_time?: string | null;
  local_download_frequency?: "daily" | "weekly" | "monthly" | null;
  agent_token?: string | null;
  last_agent_contact_at?: string | null;
  last_successful_download_at?: string | null;
  last_download_status?: string | null;
  last_run_at?: string | null;
  next_run_at?: string | null;
};

type DashboardResponse = {
  company?: { id: number; name: string; databaseName: string };
  backups: BackupRecord[];
  schedule: BackupSchedule | null;
  localHistory?: LocalDownloadRecord[];
  agentStatus?: AgentStatus;
  summary: {
    totalBackups: number;
    lastSuccessfulBackup: BackupRecord | null;
    failedBackups: number;
    nextScheduledBackup: string | null;
  };
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
  if (n == null || n === 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDateTime(dtStr?: string | null) {
  if (!dtStr) return "—";
  try {
    const d = new Date(dtStr);
    return {
      date: d.toLocaleDateString("en-SG", { day: "2-digit", month: "short", year: "numeric" }),
      time: d.toLocaleTimeString("en-SG", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true }),
      full: d.toLocaleString("en-SG"),
    };
  } catch {
    return { date: dtStr, time: "", full: dtStr };
  }
}

function getStatusBadge(status: string) {
  const s = (status || "").toUpperCase();
  if (s === "COMPLETED") {
    return <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white font-medium">Success</Badge>;
  }
  if (s === "RESTORED") {
    return <Badge className="bg-purple-600 hover:bg-purple-600 text-white font-medium">Restored</Badge>;
  }
  if (s === "IN_PROGRESS" || s === "PENDING") {
    return (
      <Badge className="bg-blue-600 hover:bg-blue-600 text-white flex items-center gap-1 font-medium">
        <Loader2 className="h-3 w-3 animate-spin" /> In Progress
      </Badge>
    );
  }
  if (s === "FAILED") {
    return <Badge className="bg-red-600 hover:bg-red-600 text-white font-medium">Failed</Badge>;
  }
  return <Badge variant="outline">{status}</Badge>;
}

function getTypeBadge(source: string) {
  const src = (source || "").toLowerCase();
  if (src === "scheduled") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-sky-700 bg-sky-50 px-2 py-0.5 rounded border border-sky-200">
        <Clock className="h-3 w-3" /> Automatic
      </span>
    );
  }
  if (src === "safety") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 font-medium">
        <ShieldCheck className="h-3 w-3 text-amber-600" /> Pre-Restore Safety
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
      Manual
    </span>
  );
}

function getDownloadStatusBadge(status: string) {
  const s = (status || "").toUpperCase();
  if (s === "COMPLETED") {
    return <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white font-medium">Completed</Badge>;
  }
  if (s === "DOWNLOADING") {
    return (
      <Badge className="bg-blue-600 hover:bg-blue-600 text-white flex items-center gap-1 font-medium">
        <Loader2 className="h-3 w-3 animate-spin" /> Downloading
      </Badge>
    );
  }
  if (s === "PENDING") {
    return <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50">Pending</Badge>;
  }
  if (s === "VERIFICATION FAILED" || s === "VERIFICATION_FAILED") {
    return <Badge className="bg-orange-600 hover:bg-orange-600 text-white font-medium">Verification Failed</Badge>;
  }
  if (s === "FAILED") {
    return <Badge className="bg-red-600 hover:bg-red-600 text-white font-medium">Failed</Badge>;
  }
  return <Badge variant="outline">{status}</Badge>;
}

function getChecksumBadge(status: string) {
  const s = (status || "").toUpperCase();
  if (s === "PASSED") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
        <CheckCircle2 className="h-3 w-3 text-emerald-600" /> Passed (SHA-256)
      </span>
    );
  }
  if (s === "FAILED") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-700 bg-red-50 px-2 py-0.5 rounded border border-red-200">
        <XCircle className="h-3 w-3 text-red-600" /> Mismatch
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
      Pending
    </span>
  );
}

function parse24To12(time24: string): { time12: string; ampm: "AM" | "PM" } {
  if (!time24) return { time12: "02:00", ampm: "AM" };
  const parts = time24.trim().split(":");
  let hour = parseInt(parts[0], 10);
  const min = (parts[1] || "00").slice(0, 2);
  if (isNaN(hour)) return { time12: "02:00", ampm: "AM" };
  const ampm: "AM" | "PM" = hour >= 12 ? "PM" : "AM";
  if (hour === 0) hour = 12;
  else if (hour > 12) hour -= 12;
  const hourStr = hour < 10 ? `0${hour}` : `${hour}`;
  return { time12: `${hourStr}:${min}`, ampm };
}

function convert12To24(time12: string, ampm: "AM" | "PM"): string {
  if (!time12) return ampm === "AM" ? "02:00" : "14:00";
  const parts = time12.trim().split(":");
  let hour = parseInt(parts[0], 10);
  const min = (parts[1] || "00").slice(0, 2);
  if (isNaN(hour)) hour = 2;
  if (ampm === "PM" && hour < 12) hour += 12;
  if (ampm === "AM" && hour === 12) hour = 0;
  const hourStr = hour < 10 ? `0${hour}` : `${hour}`;
  return `${hourStr}:${min}`;
}

export default function SettingsBackupsPage() {
  const { toast } = useToast();
  const { isAdmin, selectedCompany } = useAuth();
  const qc = useQueryClient();

  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // Modals
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedBackup, setSelectedBackup] = useState<BackupRecord | null>(null);

  // Auto Backup form state
  const [schedEnabled, setSchedEnabled] = useState(true);
  const [schedFreq, setSchedFreq] = useState<"daily" | "weekly" | "monthly">("daily");
  const [schedTime, setSchedTime] = useState("02:00");
  const [schedAmPm, setSchedAmPm] = useState<"AM" | "PM">("AM");
  const [schedDayOfWeek, setSchedDayOfWeek] = useState("0");
  const [schedDestDir, setSchedDestDir] = useState("C:\\BizOne_Backups");

  // Local Windows Auto Download form state
  const [localDownloadEnabled, setLocalDownloadEnabled] = useState(true);
  const [localDestDir, setLocalDestDir] = useState("C:\\BizOneBackups");
  const [localTimezone, setLocalTimezone] = useState("Asia/Kolkata");
  const [localDownloadFreq, setLocalDownloadFreq] = useState<"daily" | "weekly" | "monthly">("daily");
  const [localDownloadTime, setLocalDownloadTime] = useState("02:30");
  const [localAmPm, setLocalAmPm] = useState<"AM" | "PM">("AM");
  const [testingConnection, setTestingConnection] = useState(false);
  const [triggeringLocalDownload, setTriggeringLocalDownload] = useState(false);

  // Real-time Backup Progress State
  const [backupActive, setBackupActive] = useState(false);
  const [backupProgressCode, setBackupProgressCode] = useState<string | null>(null);
  const [backupProgressData, setBackupProgressData] = useState<{
    status: string;
    step: string;
    percent: number;
    logs: string[];
    fileSizeBytes?: number;
    checksumSha256?: string;
    fileName?: string;
    error?: string;
  } | null>(null);

  // Restore Modal State
  const [restoreModalOpen, setRestoreModalOpen] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<BackupRecord | null>(null);
  const [restoreValidation, setRestoreValidation] = useState<any>(null);
  const [restoreValidating, setRestoreValidating] = useState(false);
  const [restoreAck, setRestoreAck] = useState(false);
  const [restoreConfirmText, setRestoreConfirmText] = useState("");
  const [restoreActive, setRestoreActive] = useState(false);
  const [restoreProgressCode, setRestoreProgressCode] = useState<string | null>(null);
  const [restoreProgressData, setRestoreProgressData] = useState<{
    status: string;
    step: string;
    percent: number;
    logs: string[];
    safetyBackupCode?: string;
    error?: string;
  } | null>(null);

  // Fetch Dashboard data
  const { data, isLoading, refetch, isFetching } = useQuery<DashboardResponse>({
    queryKey: ["system-backups-dashboard", selectedCompany?.id],
    queryFn: () => api("/api/system-backups"),
    refetchInterval: backupActive || restoreActive ? 2500 : 30000,
  });

  const backups = data?.backups || [];
  const schedule = data?.schedule;
  const localHistory = data?.localHistory || [];
  const agentStatus = data?.agentStatus;
  const summary = data?.summary || {
    totalBackups: 0,
    lastSuccessfulBackup: null,
    failedBackups: 0,
    nextScheduledBackup: null,
  };

  // Sync schedule form with fetched schedule
  useEffect(() => {
    if (schedule) {
      setSchedEnabled(schedule.enabled);
      setSchedFreq(schedule.frequency);
      const parsedServer = parse24To12(schedule.time_of_day || "02:00");
      setSchedTime(parsedServer.time12);
      setSchedAmPm(parsedServer.ampm);
      setSchedDayOfWeek(schedule.day_of_week != null ? String(schedule.day_of_week) : "0");
      setSchedDestDir((schedule.destination_dir || `C:\\BizOne_Backups\\${selectedCompany?.name || "Company"}`).replace(/\\+/g, "\\"));
      setLocalDownloadEnabled(schedule.local_download_enabled !== false);
      setLocalDestDir((schedule.local_destination_dir || "C:\\BizOneBackups").replace(/\\+/g, "\\"));
      setLocalTimezone(schedule.local_timezone || "Asia/Kolkata");
      setLocalDownloadFreq((schedule.local_download_frequency as any) || "daily");
      const parsedLocal = parse24To12(schedule.local_download_time || "02:30");
      setLocalDownloadTime(parsedLocal.time12);
      setLocalAmPm(parsedLocal.ampm);
    } else if (selectedCompany?.name) {
      setSchedDestDir(`C:\\BizOne_Backups\\${selectedCompany.name}`);
      setLocalDestDir("C:\\BizOneBackups");
    }
  }, [schedule, selectedCompany]);

  // Poll active backup progress
  useEffect(() => {
    if (!backupActive || !backupProgressCode) return;
    const interval = setInterval(async () => {
      try {
        const prog = await api(`/api/system-backups/progress/${backupProgressCode}`);
        setBackupProgressData(prog);
        if (prog.status === "COMPLETED" || prog.status === "FAILED") {
          setBackupActive(false);
          qc.invalidateQueries({ queryKey: ["system-backups-dashboard"] });
          if (prog.status === "COMPLETED") {
            toast({
              title: "Backup Complete!",
              description: `Archive generated successfully (${formatSize(prog.fileSizeBytes)})`,
            });
          } else {
            toast({
              title: "Backup Failed",
              description: prog.error || "An error occurred during system backup",
              variant: "destructive",
            });
          }
        }
      } catch (err: any) {
        // Continue polling or silent fail
      }
    }, 1500);
    return () => clearInterval(interval);
  }, [backupActive, backupProgressCode, qc, toast]);

  // Poll active restore progress
  useEffect(() => {
    if (!restoreActive || !restoreProgressCode) return;
    const interval = setInterval(async () => {
      try {
        const prog = await api(`/api/system-backups/restore/progress/${restoreProgressCode}`);
        setRestoreProgressData(prog);
        if (prog.status === "COMPLETED" || prog.status === "FAILED") {
          setRestoreActive(false);
          qc.invalidateQueries({ queryKey: ["system-backups-dashboard"] });
          if (prog.status === "COMPLETED") {
            toast({
              title: "Restore Completed!",
              description: `Application and databases restored successfully. Safety backup: ${prog.safetyBackupCode || "created"}.`,
            });
          } else {
            toast({
              title: "Restore Failed",
              description: prog.error || "An error occurred during system restoration",
              variant: "destructive",
            });
          }
        }
      } catch (err: any) {
        // Continue polling
      }
    }, 1500);
    return () => clearInterval(interval);
  }, [restoreActive, restoreProgressCode, qc, toast]);

  // Trigger Create Backup Mutation
  const createBackupMut = useMutation({
    mutationFn: () => api("/api/system-backups/create", { method: "POST" }),
    onSuccess: (res) => {
      setBackupProgressCode(res.backupCode);
      setBackupProgressData({
        status: "IN_PROGRESS",
        step: "Initializing PostgreSQL databases and attachments dump...",
        percent: 10,
        logs: [`[${new Date().toLocaleTimeString()}] Backup requested by administrator`],
      });
      setBackupActive(true);
      toast({
        title: "Backup Initiated",
        description: "Full application backup running on server...",
      });
    },
    onError: (err: any) => {
      toast({ title: "Failed to Start Backup", description: err.message, variant: "destructive" });
    },
  });

  // Save Schedule Mutation
  const saveScheduleMut = useMutation({
    mutationFn: () =>
      api("/api/system-backups/schedule", {
        method: "POST",
        body: JSON.stringify({
          enabled: schedEnabled,
          frequency: schedFreq,
          timeOfDay: convert12To24(schedTime, schedAmPm),
          dayOfWeek: schedFreq === "weekly" ? Number(schedDayOfWeek) : null,
          destinationDir: schedDestDir.replace(/\\+/g, "\\"),
          localDownloadEnabled,
          localDestinationDir: localDestDir.replace(/\\+/g, "\\"),
          localTimezone,
          localDownloadTime: convert12To24(localDownloadTime, localAmPm),
          localDownloadFrequency: localDownloadFreq,
        }),
      }),
    onSuccess: () => {
      toast({
        title: "Settings Saved Successfully",
        description: "Server backup schedule and Windows local download settings saved persistently.",
      });
      setScheduleModalOpen(false);
      qc.invalidateQueries({ queryKey: ["system-backups-dashboard"] });
    },
    onError: (err: any) => {
      toast({ title: "Error Saving Settings", description: err.message, variant: "destructive" });
    },
  });

  // Trigger Local Windows Download Immediately
  const triggerLocalDownload = async () => {
    setTriggeringLocalDownload(true);
    try {
      await api("/api/system-backups/agent/run-local", { method: "POST" });
      toast({
        title: "Local Download Succeeded",
        description: `Verified backup archive downloaded directly into ${localDestDir || "C:\\BizOneBackups"}.`,
      });
      qc.invalidateQueries({ queryKey: ["system-backups-dashboard"] });
    } catch (err: any) {
      toast({
        title: "Download Trigger Failed",
        description: err.message || "Could not run local download agent.",
        variant: "destructive",
      });
    } finally {
      setTriggeringLocalDownload(false);
    }
  };

  // Regenerate Agent Token Mutation
  const regenerateTokenMut = useMutation({
    mutationFn: () => api("/api/system-backups/agent/token/regenerate", { method: "POST" }),
    onSuccess: (res) => {
      toast({
        title: "Agent Credential Regenerated",
        description: "A new secure, revocable token has been generated for this company's Windows agent.",
      });
      qc.invalidateQueries({ queryKey: ["system-backups-dashboard"] });
    },
    onError: (err: any) => {
      toast({ title: "Token Generation Failed", description: err.message, variant: "destructive" });
    },
  });

  // Test Agent Connection
  async function testAgentConnection() {
    setTestingConnection(true);
    try {
      const res = await api(`/api/system-backups/agent/status?companyId=${selectedCompany?.id || 0}`);
      toast({
        title: "Backend Agent Endpoint OK",
        description: `Verified connection for ${res.company?.name || "Company"}. Latest Backup: ${res.latestBackup?.backupCode || "Ready"}. Server Time: ${new Date(res.serverTime).toLocaleTimeString()}.`,
      });
      refetch();
    } catch (err: any) {
      toast({
        title: "Connection Test Failed",
        description: err.message || "Failed to reach agent status endpoint",
        variant: "destructive",
      });
    } finally {
      setTestingConnection(false);
    }
  }

  // Delete Backup Mutation
  const deleteBackupMut = useMutation({
    mutationFn: (id: number) => api(`/api/system-backups/${id}?force=true`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Backup Deleted", description: "Backup archive removed safely." });
      qc.invalidateQueries({ queryKey: ["system-backups-dashboard"] });
    },
    onError: (err: any) => {
      toast({ title: "Delete Failed", description: err.message, variant: "destructive" });
    },
  });

  // Validate before restore
  async function openRestoreDialog(backup: BackupRecord) {
    setRestoreTarget(backup);
    setRestoreAck(false);
    setRestoreConfirmText("");
    setRestoreValidation(null);
    setRestoreProgressData(null);
    setRestoreModalOpen(true);
    setRestoreValidating(true);

    try {
      const val = await api(`/api/system-backups/${backup.id}/validate`, { method: "POST" });
      setRestoreValidation(val);
    } catch (err: any) {
      toast({
        title: "Archive Validation Warning",
        description: err.message || "Failed to inspect archive integrity",
        variant: "destructive",
      });
    } finally {
      setRestoreValidating(false);
    }
  }

  // Trigger Restore
  const triggerRestoreMut = useMutation({
    mutationFn: async () => {
      if (!restoreTarget) throw new Error("No backup selected for restore");
      return api(`/api/system-backups/${restoreTarget.id}/restore`, {
        method: "POST",
        body: JSON.stringify({ confirmPhrase: restoreConfirmText.trim() }),
      });
    },
    onSuccess: (res) => {
      setRestoreProgressCode(res.restoreCode);
      setRestoreProgressData({
        status: "SAFETY_BACKUP",
        step: "Creating automatic pre-restore safety backup of current data...",
        percent: 15,
        logs: [`[${new Date().toLocaleTimeString()}] Safety backup started`],
      });
      setRestoreActive(true);
      toast({
        title: "Restore In Progress",
        description: "Safety backup and restoration running on server...",
      });
    },
    onError: (err: any) => {
      toast({ title: "Restore Failed", description: err.message, variant: "destructive" });
    },
  });

  // Authenticated Download handler
  async function downloadBackupFile(backup: BackupRecord) {
    try {
      const res = await fetch(`/api/system-backups/${backup.id}/download`, { credentials: "include" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Download failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = backup.storage_ref || `${backup.backup_code}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast({ title: "Download Failed", description: err.message, variant: "destructive" });
    }
  }

  // Filtered backups list
  const filteredBackups = useMemo(() => {
    return backups.filter((b) => {
      const matchesSearch =
        !searchTerm.trim() ||
        b.backup_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (b.storage_ref && b.storage_ref.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (b.created_by_username && b.created_by_username.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesType =
        typeFilter === "all" ||
        (typeFilter === "manual" && b.backup_source === "manual") ||
        (typeFilter === "scheduled" && b.backup_source === "scheduled") ||
        (typeFilter === "safety" && b.backup_source === "safety");

      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "completed" && (b.status === "completed" || b.status === "restored")) ||
        (statusFilter === "failed" && b.status === "failed") ||
        (statusFilter === "in_progress" && (b.status === "in_progress" || b.status === "pending"));

      return matchesSearch && matchesType && matchesStatus;
    });
  }, [backups, searchTerm, typeFilter, statusFilter]);

  const canExecuteRestore =
    restoreAck &&
    restoreConfirmText.trim().toUpperCase() === "RESTORE" &&
    !triggerRestoreMut.isPending &&
    !restoreActive;

  return (
    <div className="space-y-6 pb-20 animate-in fade-in duration-300">
      {/* 1. Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-3xl font-bold tracking-tight text-[#2563EB]">Backup & Restore</h1>
            {selectedCompany && (
              <Badge variant="outline" className="text-xs bg-blue-50 border-blue-200 text-blue-700 font-semibold px-2.5 py-0.5">
                {selectedCompany.name}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Company-scoped database backups, automated scheduling, and safe data restoration for <strong>{selectedCompany?.name || "your company"}</strong>.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="gap-1.5"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin text-primary" : ""}`} />
            Refresh
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={() => setScheduleModalOpen(true)}
            className="gap-1.5 bg-slate-800 hover:bg-slate-900"
          >
            <Settings2 className="h-4 w-4" />
            Schedule Settings
          </Button>
        </div>
      </div>

      {/* 2. Four Main Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card A: Create Backup */}
        <Card className="border-t-4 border-t-blue-600 shadow-sm flex flex-col justify-between hover:shadow transition-shadow">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <span className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                <Database className="h-5 w-5" />
              </span>
              <Badge variant="outline" className="text-xs font-normal">Company Isolated</Badge>
            </div>
            <CardTitle className="text-base font-semibold mt-2">1. Create Backup</CardTitle>
            <CardDescription className="text-xs">
              Instantly dumps {selectedCompany?.name || "this company"}&apos;s database and uploaded documents into an encrypted archive.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <Button
              className="w-full bg-[#2563EB] hover:bg-[#1d4ed8] text-white gap-2 font-medium"
              disabled={createBackupMut.isPending || backupActive}
              onClick={() => createBackupMut.mutate()}
            >
              {createBackupMut.isPending || backupActive ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating Backup...
                </>
              ) : (
                <>
                  <Archive className="h-4 w-4" />
                  Create Backup Now
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Card B: Auto Backup */}
        <Card className="border-t-4 border-t-emerald-600 shadow-sm flex flex-col justify-between hover:shadow transition-shadow">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <span className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                <Clock className="h-5 w-5" />
              </span>
              <Badge className={schedule?.enabled ? "bg-emerald-600 hover:bg-emerald-600" : "bg-slate-400"}>
                {schedule?.enabled ? "Active" : "Disabled"}
              </Badge>
            </div>
            <CardTitle className="text-base font-semibold mt-2">2. Auto Backup</CardTitle>
            <CardDescription className="text-xs">
              Automatic backups for {selectedCompany?.name || "this company"} via Plesk and local Windows agent sync.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0 space-y-2">
            <div className="text-xs bg-slate-50 border rounded p-2 text-slate-600 space-y-1">
              <div>
                <span className="font-semibold text-slate-900">Schedule: </span>
                {schedule?.frequency ? `${schedule.frequency.toUpperCase()} at ${schedule.time_of_day || "02:00"}` : "Daily at 02:00 AM"}
              </div>
              <div className="truncate text-[11px] text-muted-foreground" title={schedDestDir}>
                <span className="font-semibold text-slate-900">Destination: </span>
                {schedDestDir}
              </div>
            </div>
            <Button
              variant="outline"
              className="w-full gap-2 border-emerald-600 text-emerald-700 hover:bg-emerald-50 font-medium"
              onClick={() => setScheduleModalOpen(true)}
            >
              <CalendarClock className="h-4 w-4 text-emerald-600" />
              Configure Schedule
            </Button>
          </CardContent>
        </Card>

        {/* Card C: Backup History */}
        <Card className="border-t-4 border-t-indigo-600 shadow-sm flex flex-col justify-between hover:shadow transition-shadow">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <span className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                <FileArchive className="h-5 w-5" />
              </span>
              <span className="text-xs font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
                {backups.length} Company Archives
              </span>
            </div>
            <CardTitle className="text-base font-semibold mt-2">3. Backup History</CardTitle>
            <CardDescription className="text-xs">
              Saved archives for {selectedCompany?.name || "this company"} with SHA-256 verification and retention safeguards.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <Button
              variant="outline"
              className="w-full gap-2 text-slate-700 hover:bg-slate-100"
              onClick={() => {
                const el = document.getElementById("backup-history-section");
                el?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              <FileCheck className="h-4 w-4 text-indigo-600" />
              View Archives Below
            </Button>
          </CardContent>
        </Card>

        {/* Card D: Restore */}
        <Card className="border-t-4 border-t-amber-500 shadow-sm flex flex-col justify-between hover:shadow transition-shadow">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <span className="p-2 bg-amber-50 text-amber-600 rounded-lg">
                <RotateCcw className="h-5 w-5" />
              </span>
              <span className="text-xs font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                Company Isolated
              </span>
            </div>
            <CardTitle className="text-base font-semibold mt-2">4. Restore</CardTitle>
            <CardDescription className="text-xs">
              Restores ONLY {selectedCompany?.name || "this company"}&apos;s database and files with a safety snapshot. Other companies are untouched.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <Button
              variant="outline"
              className="w-full gap-2 border-amber-500 text-amber-700 hover:bg-amber-50 font-medium"
              disabled={backups.length === 0}
              onClick={() => {
                const latestSuccess = backups.find((b) => b.status === "completed" || b.status === "restored");
                if (latestSuccess) {
                  openRestoreDialog(latestSuccess);
                } else {
                  toast({ title: "No backup available", description: "Create a backup first before restoring." });
                }
              }}
            >
              <RotateCcw className="h-4 w-4 text-amber-600" />
              Restore From Backup
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* 3. Summary KPI Cards Below the 4 Main Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Next Scheduled Backup */}
        <div className="rounded-xl border bg-card p-4 shadow-sm flex items-center gap-3">
          <div className="p-3 bg-sky-50 text-sky-600 rounded-lg">
            <Clock className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Next Scheduled Backup</p>
            <p className="text-sm font-semibold text-foreground mt-0.5">
              {summary.nextScheduledBackup
                ? formatDateTime(summary.nextScheduledBackup).full
                : schedule?.enabled
                  ? `Daily at ${schedule.time_of_day || "02:00"}`
                  : "Automatic Disabled"}
            </p>
          </div>
        </div>

        {/* Last Successful Backup */}
        <div className="rounded-xl border bg-card p-4 shadow-sm flex items-center gap-3">
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-lg">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Last Successful Backup</p>
            <p className="text-sm font-semibold text-foreground mt-0.5">
              {summary.lastSuccessfulBackup
                ? `${summary.lastSuccessfulBackup.backup_code} (${formatDateTime(summary.lastSuccessfulBackup.completed_at || summary.lastSuccessfulBackup.created_at).date})`
                : "No backups yet"}
            </p>
          </div>
        </div>

        {/* Total Backups */}
        <div className="rounded-xl border bg-card p-4 shadow-sm flex items-center gap-3">
          <div className="p-3 bg-purple-50 text-purple-600 rounded-lg">
            <HardDrive className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Total Backups</p>
            <p className="text-sm font-semibold text-foreground mt-0.5">
              {summary.totalBackups} Archives Saved
            </p>
          </div>
        </div>

        {/* Failed Backups */}
        <div className="rounded-xl border bg-card p-4 shadow-sm flex items-center gap-3">
          <div className={`p-3 rounded-lg ${summary.failedBackups > 0 ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"}`}>
            {summary.failedBackups > 0 ? <XCircle className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Failed Backups</p>
            <p className={`text-sm font-semibold mt-0.5 ${summary.failedBackups > 0 ? "text-red-600" : "text-emerald-700"}`}>
              {summary.failedBackups} Failed
            </p>
          </div>
        </div>
      </div>

      {/* 4. Real-time Backup Progress Widget (visible while in progress) */}
      {(backupActive || (backupProgressData && backupProgressData.status === "COMPLETED")) && (
        <Card className="border-2 border-blue-400 bg-blue-50/40 shadow-md">
          <CardHeader className="py-3.5 border-b bg-white/70">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {backupProgressData?.status === "COMPLETED" ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                ) : (
                  <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />
                )}
                <div>
                  <CardTitle className="text-base text-blue-900">
                    {backupProgressData?.status === "COMPLETED"
                      ? "System Backup Finished Successfully!"
                      : `Live Backup in Progress: ${backupProgressCode || ""}`}
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-600">
                    {backupProgressData?.step || "Processing..."}
                  </CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {backupProgressData?.status === "COMPLETED" && (
                  <Button
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                    onClick={() => {
                      const match = backups.find((b) => b.backup_code === backupProgressCode);
                      if (match) downloadBackupFile(match);
                      else refetch();
                    }}
                  >
                    <Download className="h-4 w-4" />
                    Download Archive
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setBackupActive(false);
                    setBackupProgressData(null);
                  }}
                >
                  Dismiss
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-4 space-y-3">
            {/* Progress Bar */}
            <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
              <div
                className={`h-2.5 rounded-full transition-all duration-500 ${
                  backupProgressData?.status === "COMPLETED" ? "bg-emerald-600" : "bg-blue-600"
                }`}
                style={{ width: `${backupProgressData?.percent || 15}%` }}
              />
            </div>
            {/* Checklist */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
              <div className="flex items-center gap-1.5 text-slate-700">
                <Check className={`h-3.5 w-3.5 ${(backupProgressData?.percent || 0) >= 20 ? "text-emerald-600 font-bold" : "text-slate-300"}`} />
                <span>Master DB (BizoneDB)</span>
              </div>
              <div className="flex items-center gap-1.5 text-slate-700">
                <Check className={`h-3.5 w-3.5 ${(backupProgressData?.percent || 0) >= 60 ? "text-emerald-600 font-bold" : "text-slate-300"}`} />
                <span>Tenant Databases Dumped</span>
              </div>
              <div className="flex items-center gap-1.5 text-slate-700">
                <Check className={`h-3.5 w-3.5 ${(backupProgressData?.percent || 0) >= 80 ? "text-emerald-600 font-bold" : "text-slate-300"}`} />
                <span>Uploads & Documents Packaged</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 5. Backup History Table Section */}
      <Card id="backup-history-section" className="shadow-sm">
        <CardHeader className="py-4 border-b">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-lg font-bold">Backup History</CardTitle>
              <CardDescription className="text-xs">
                Inspect, download, or restore previously generated system archives.
              </CardDescription>
            </div>

            {/* Search and Filters */}
            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search ID, file name..."
                  className="pl-8 h-9 text-xs"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="h-9 w-32 text-xs">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="scheduled">Automatic</SelectItem>
                  <SelectItem value="safety">Safety Snapshot</SelectItem>
                </SelectContent>
              </Select>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-9 w-32 text-xs">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="completed">Success</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
              <Loader2 className="h-5 w-5 animate-spin text-primary" /> Loading backup history...
            </div>
          ) : filteredBackups.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground text-sm">
              <FileArchive className="h-10 w-10 mx-auto text-slate-300 mb-2" />
              {backups.length === 0
                ? "No backups generated yet. Click 'Create Backup Now' above to generate your first complete backup."
                : "No backups match your search filters."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 border-b text-xs text-muted-foreground uppercase font-semibold">
                  <tr>
                    <th className="px-4 py-3 text-left">Backup ID</th>
                    <th className="px-4 py-3 text-left">Date & Time</th>
                    <th className="px-4 py-3 text-left">Type</th>
                    <th className="px-4 py-3 text-left">Archive File</th>
                    <th className="px-4 py-3 text-left">Size</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredBackups.map((b) => {
                    const dt = formatDateTime(b.created_at);
                    return (
                      <tr key={b.id} className="hover:bg-muted/20 transition-colors">
                        {/* Backup ID */}
                        <td className="px-4 py-3 font-mono font-medium text-xs text-[#2563EB]">
                          {b.backup_code}
                        </td>

                        {/* Date & Time */}
                        <td className="px-4 py-3 text-xs">
                          <div className="font-medium text-slate-800">{dt.date}</div>
                          <div className="text-muted-foreground text-[11px]">{dt.time}</div>
                        </td>

                        {/* Type */}
                        <td className="px-4 py-3">{getTypeBadge(b.backup_source)}</td>

                        {/* File Name */}
                        <td className="px-4 py-3 text-xs max-w-xs truncate text-slate-600 font-mono" title={b.storage_ref || ""}>
                          {b.storage_ref || "bizone_backup_archive.zip"}
                        </td>

                        {/* Size */}
                        <td className="px-4 py-3 text-xs font-medium">
                          {formatSize(b.file_size_bytes)}
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3">{getStatusBadge(b.status)}</td>

                        {/* Actions */}
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {/* View Details */}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2 text-xs"
                              title="Inspect Details"
                              onClick={() => {
                                setSelectedBackup(b);
                                setDetailModalOpen(true);
                              }}
                            >
                              <Eye className="h-3.5 w-3.5 mr-1" />
                              Details
                            </Button>

                            {/* Download Action */}
                            {(b.status === "completed" || b.status === "restored") && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 px-2.5 text-xs text-blue-700 hover:bg-blue-50 border-blue-200"
                                title="Download Archive"
                                onClick={() => downloadBackupFile(b)}
                              >
                                <Download className="h-3.5 w-3.5 mr-1" />
                                Download
                              </Button>
                            )}

                            {/* Restore Action */}
                            {isAdmin && (b.status === "completed" || b.status === "restored") && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 px-2.5 text-xs text-amber-700 hover:bg-amber-50 border-amber-300"
                                title="Restore Application State"
                                onClick={() => openRestoreDialog(b)}
                              >
                                <RotateCcw className="h-3.5 w-3.5 mr-1" />
                                Restore
                              </Button>
                            )}

                            {/* Delete Action */}
                            {isAdmin && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-slate-400 hover:text-destructive"
                                title="Delete Backup"
                                onClick={() => {
                                  if (confirm(`Are you sure you want to delete backup ${b.backup_code}? This cannot be undone.`)) {
                                    deleteBackupMut.mutate(b.id);
                                  }
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 5B. Local Windows Download History Section */}
      <Card className="border shadow-sm">
        <CardHeader className="py-4 border-b flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Laptop className="h-5 w-5 text-blue-600" />
              Local Windows Download History
            </CardTitle>
            <CardDescription className="text-xs">
              Archives automatically downloaded to your local Windows PC by the scheduled download agent.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1 text-xs"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {localHistory.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">
              <Laptop className="h-9 w-9 mx-auto text-slate-300 mb-2" />
              <p className="font-medium text-slate-700">No local downloads recorded yet</p>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                Once the Windows download agent executes at the scheduled download time, records with file size, download timestamp, and SHA-256 verification status will appear here.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 border-b text-xs text-muted-foreground uppercase font-semibold">
                  <tr>
                    <th className="px-4 py-3 text-left">Backup ID / Code</th>
                    <th className="px-4 py-3 text-left">File Name</th>
                    <th className="px-4 py-3 text-left">Downloaded At</th>
                    <th className="px-4 py-3 text-left">Destination Folder</th>
                    <th className="px-4 py-3 text-left">Size</th>
                    <th className="px-4 py-3 text-left">Download Status</th>
                    <th className="px-4 py-3 text-left">SHA-256 Integrity</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {localHistory.map((row) => {
                    const dt = formatDateTime(row.downloaded_at);
                    return (
                      <tr key={row.id} className="hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3 font-mono font-medium text-xs text-blue-700">
                          {row.backup_code || `ID-${row.backup_id || row.id}`}
                        </td>
                        <td className="px-4 py-3 text-xs max-w-xs truncate font-mono text-slate-700" title={row.file_name}>
                          {row.file_name}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          <div className="font-medium text-slate-800">{dt.date}</div>
                          <div className="text-muted-foreground text-[11px]">{dt.time}</div>
                        </td>
                        <td className="px-4 py-3 text-xs font-mono text-slate-600 truncate max-w-[220px]" title={row.destination_folder}>
                          {row.destination_folder}
                        </td>
                        <td className="px-4 py-3 text-xs font-medium">
                          {formatSize(row.file_size_bytes)}
                        </td>
                        <td className="px-4 py-3">
                          {getDownloadStatusBadge(row.status)}
                        </td>
                        <td className="px-4 py-3">
                          {getChecksumBadge(row.checksum_status)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs text-slate-600 hover:text-slate-900"
                              title="Copy Destination Path"
                              onClick={() => {
                                navigator.clipboard.writeText(`${row.destination_folder}\\${row.file_name}`);
                                toast({ title: "Copied file path to clipboard" });
                              }}
                            >
                              <Copy className="h-3 w-3 mr-1" />
                              Copy Path
                            </Button>
                            {(row.status === "Failed" || row.status === "Verification Failed") && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-xs text-red-700 border-red-200 hover:bg-red-50"
                                onClick={() => {
                                  toast({
                                    title: "Retry Queued",
                                    description: "Windows download agent will retry this archive on next cycle.",
                                  });
                                }}
                              >
                                <RotateCcw className="h-3 w-3 mr-1" />
                                Retry
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 6. Auto Backup Schedule Modal - Enhanced Two-Section Layout */}
      <Dialog open={scheduleModalOpen} onOpenChange={setScheduleModalOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2 text-lg">
                <CalendarClock className="h-5 w-5 text-emerald-600" />
                Automatic Backup & Local Auto Download Schedule
              </DialogTitle>
              {selectedCompany?.name && (
                <Badge variant="outline" className="text-xs bg-slate-50 border-slate-300 font-medium">
                  {selectedCompany.name}
                </Badge>
              )}
            </div>
            <DialogDescription>
              Configure server-side scheduled backups (Plesk) and automatic downloads to your local Windows PC.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* SECTION A: Server Backup Schedule (Plesk Server) */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-4">
              <div className="flex items-center justify-between border-b pb-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-emerald-100 text-emerald-700 rounded-md">
                    <Server className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm text-slate-900">SECTION A: Server Backup Schedule (Plesk Server)</h3>
                    <p className="text-xs text-muted-foreground">
                      Creates the complete company database dump and uploaded attachments archive.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor="sched-enabled" className="text-xs font-medium cursor-pointer">
                    {schedEnabled ? "Enabled" : "Disabled"}
                  </Label>
                  <input
                    id="sched-enabled"
                    type="checkbox"
                    checked={schedEnabled}
                    onChange={(e) => setSchedEnabled(e.target.checked)}
                    className="h-4 w-4 accent-emerald-600 cursor-pointer"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Server Frequency */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Backup Frequency</Label>
                  <Select value={schedFreq} onValueChange={(v: any) => setSchedFreq(v)}>
                    <SelectTrigger className="bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Daily (Every Day)</SelectItem>
                      <SelectItem value="weekly">Weekly (Specific Day of Week)</SelectItem>
                      <SelectItem value="monthly">Monthly (Last Day of Month)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Server Time of Day with AM / PM */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Backup Time (12-Hour)</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      value={schedTime}
                      onChange={(e) => setSchedTime(e.target.value)}
                      placeholder="02:00"
                      className="bg-white font-mono text-xs flex-1"
                    />
                    <Select value={schedAmPm} onValueChange={(v: "AM" | "PM") => setSchedAmPm(v)}>
                      <SelectTrigger className="w-20 bg-white font-semibold text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="AM">AM</SelectItem>
                        <SelectItem value="PM">PM</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="text-[11px] text-muted-foreground font-medium">
                    {schedAmPm === "PM"
                      ? `🕒 Runs at ${schedTime || "02:00"} PM (${convert12To24(schedTime, "PM")} in 24-hr) — Afternoon / Evening`
                      : `🕒 Runs at ${schedTime || "02:00"} AM (${convert12To24(schedTime, "AM")} in 24-hr) — Early Morning`}
                  </p>
                </div>
              </div>

              {/* Weekly Day Picker */}
              {schedFreq === "weekly" && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Day of Week</Label>
                  <Select value={schedDayOfWeek} onValueChange={setSchedDayOfWeek}>
                    <SelectTrigger className="bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">Sunday</SelectItem>
                      <SelectItem value="1">Monday</SelectItem>
                      <SelectItem value="2">Tuesday</SelectItem>
                      <SelectItem value="3">Wednesday</SelectItem>
                      <SelectItem value="4">Thursday</SelectItem>
                      <SelectItem value="5">Friday</SelectItem>
                      <SelectItem value="6">Saturday</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Plesk Cron Command helper */}
              <div className="p-3 bg-slate-900 text-slate-100 rounded-lg text-xs space-y-1 font-mono">
                <div className="flex items-center justify-between text-slate-400">
                  <span>Plesk Scheduled Task Command (Cron):</span>
                  <button
                    type="button"
                    className="hover:text-white"
                    onClick={() => {
                      const cmd = `node /var/www/vhosts/sg.biz1.in/scripts/run-scheduled-backup.mjs --company ${selectedCompany?.id || 0}`;
                      navigator.clipboard.writeText(cmd);
                      toast({ title: "Copied Plesk command to clipboard" });
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className="break-all text-[11px] text-emerald-400">
                  node /var/www/vhosts/sg.biz1.in/scripts/run-scheduled-backup.mjs --company {selectedCompany?.id || 0}
                </p>
              </div>
            </div>

            {/* SECTION B: Local Windows Automatic Download (My Computer) */}
            <div className="rounded-xl border-2 border-blue-200 bg-blue-50/20 p-4 space-y-4">
              <div className="flex items-center justify-between border-b border-blue-100 pb-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-blue-100 text-blue-700 rounded-md">
                    <Laptop className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm text-slate-900">SECTION B: Local Windows Automatic Download (My Computer)</h3>
                    <p className="text-xs text-muted-foreground">
                      Downloads verified archives to your Windows folder independently of the browser.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor="local-download-enabled" className="text-xs font-medium cursor-pointer">
                    {localDownloadEnabled ? "Enabled" : "Disabled"}
                  </Label>
                  <input
                    id="local-download-enabled"
                    type="checkbox"
                    checked={localDownloadEnabled}
                    onChange={(e) => setLocalDownloadEnabled(e.target.checked)}
                    className="h-4 w-4 accent-blue-600 cursor-pointer"
                  />
                </div>
              </div>

              {/* Local Folder Path with Browse/Setup helper */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold">Local Backup Folder Path</Label>
                  <span className="text-[11px] text-blue-600 font-medium">Configured once & saved persistently</span>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    value={localDestDir}
                    onChange={(e) => setLocalDestDir(e.target.value)}
                    placeholder="D:\BizOneBackups"
                    className="bg-white font-mono text-xs flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-xs bg-white whitespace-nowrap"
                    title="Click to copy PowerShell Folder Selector command"
                    onClick={() => {
                      const cmd = `powershell.exe -ExecutionPolicy Bypass -File C:\\BizOne_SG\\scripts\\setup-windows-agent.ps1 -CompanyId ${selectedCompany?.id || 0}`;
                      navigator.clipboard.writeText(cmd);
                      toast({
                        title: "PowerShell Setup Command Copied",
                        description: "Paste in PowerShell to open Windows Graphical Folder Browser and save to config.",
                      });
                    }}
                  >
                    <FolderOpen className="h-3.5 w-3.5 text-blue-600" />
                    Browse / Setup
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  The download agent saves this company&apos;s verified backup archives directly into this folder.
                </p>
              </div>

              {/* Schedule Timing & Timezone */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Timezone */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold flex items-center gap-1">
                    <Globe className="h-3 w-3 text-slate-500" />
                    Timezone
                  </Label>
                  <Select value={localTimezone} onValueChange={setLocalTimezone}>
                    <SelectTrigger className="bg-white text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Asia/Kolkata">Asia/Kolkata (IST)</SelectItem>
                      <SelectItem value="Asia/Singapore">Asia/Singapore (SGT)</SelectItem>
                      <SelectItem value="UTC">UTC</SelectItem>
                      <SelectItem value="Asia/Dubai">Asia/Dubai (GST)</SelectItem>
                      <SelectItem value="Europe/London">Europe/London (GMT)</SelectItem>
                      <SelectItem value="America/New_York">America/New York (EST)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Local Download Frequency */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Download Frequency</Label>
                  <Select value={localDownloadFreq} onValueChange={(v: any) => setLocalDownloadFreq(v)}>
                    <SelectTrigger className="bg-white text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Local Download Time with AM / PM */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Download Time (12-Hour)</Label>
                  <div className="flex items-center gap-1.5">
                    <Input
                      value={localDownloadTime}
                      onChange={(e) => setLocalDownloadTime(e.target.value)}
                      placeholder="02:30"
                      className="bg-white font-mono text-xs flex-1"
                    />
                    <Select value={localAmPm} onValueChange={(v: "AM" | "PM") => setLocalAmPm(v)}>
                      <SelectTrigger className="w-16 bg-white font-semibold text-xs px-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="AM">AM</SelectItem>
                        <SelectItem value="PM">PM</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="text-[10px] text-muted-foreground font-medium">
                    {localAmPm === "PM"
                      ? `🕒 Downloads at ${localDownloadTime || "02:30"} PM (${convert12To24(localDownloadTime, "PM")})`
                      : `🕒 Downloads at ${localDownloadTime || "02:30"} AM (${convert12To24(localDownloadTime, "AM")})`}
                  </p>
                </div>
              </div>

              {/* Live Windows Agent Connection Status Card */}
              <div className="p-3 bg-white rounded-lg border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-2.5 w-2.5">
                      {agentStatus?.connected ? (
                        <>
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                        </>
                      ) : (
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-slate-400"></span>
                      )}
                    </span>
                    <span className="text-xs font-semibold text-slate-800">
                      {agentStatus?.connected ? "Windows Agent Connected" : "Windows Agent Configured / Standby"}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 px-2.5 text-[11px] gap-1 bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 hover:text-blue-800 font-medium"
                      title="Run the Windows download agent immediately to fetch the latest backup into your local folder"
                      onClick={triggerLocalDownload}
                      disabled={triggeringLocalDownload}
                    >
                      <Play className={`h-3 w-3 ${triggeringLocalDownload ? "animate-spin" : ""}`} />
                      {triggeringLocalDownload ? "Downloading..." : "⚡ Run Download Now"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-[11px] gap-1"
                      onClick={testAgentConnection}
                      disabled={testingConnection}
                    >
                      <Radio className={`h-3 w-3 ${testingConnection ? "animate-spin text-blue-600" : "text-slate-600"}`} />
                      {testingConnection ? "Pinging..." : "Test Connection"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-[11px] text-slate-500 hover:text-slate-900 gap-1"
                      title="Regenerate secure revocable token for this company"
                      onClick={() => {
                        if (confirm("Regenerate agent token? The Windows agent will need to be updated with the new token.")) {
                          regenerateTokenMut.mutate();
                        }
                      }}
                      disabled={regenerateTokenMut.isPending}
                    >
                      <Key className="h-3 w-3" />
                      New Token
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-600 border-t pt-2">
                  <div>
                    <span className="text-muted-foreground">Last Agent Contact: </span>
                    <span className="font-medium text-slate-800">
                      {agentStatus?.lastContactAt ? formatDateTime(agentStatus.lastContactAt).full : "No contact recorded yet"}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Last Successful Download: </span>
                    <span className="font-medium text-slate-800">
                      {agentStatus?.lastSuccessfulDownloadAt ? formatDateTime(agentStatus.lastSuccessfulDownloadAt).full : "None recorded yet"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Windows Task Scheduler Setup Command Helper */}
              <div className="p-3 bg-slate-900 text-slate-100 rounded-lg text-xs space-y-2 font-mono">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="flex items-center gap-1.5">
                    <Terminal className="h-3.5 w-3.5 text-sky-400" />
                    One-Click Windows Setup & Scheduler Command:
                  </span>
                  <button
                    type="button"
                    className="hover:text-white"
                    onClick={() => {
                      const cmd = `powershell.exe -ExecutionPolicy Bypass -File C:\\BizOne_SG\\scripts\\setup-windows-agent.ps1 -Folder "${localDestDir}" -CompanyId ${selectedCompany?.id || 0} -Time "${localDownloadTime}" -AmPm "${localAmPm}" -AgentKey "${agentStatus?.agentToken || "bizone-backup-sync-key"}" -TestDownload`;
                      navigator.clipboard.writeText(cmd);
                      toast({ title: "Copied Windows setup command to clipboard" });
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className="break-all text-[11px] text-sky-300">
                  powershell.exe -ExecutionPolicy Bypass -File C:\BizOne_SG\scripts\setup-windows-agent.ps1 -Folder &quot;{localDestDir}&quot; -CompanyId {selectedCompany?.id || 0} -Time &quot;{localDownloadTime}&quot; -AmPm &quot;{localAmPm}&quot; -AgentKey &quot;{agentStatus?.agentToken || "bizone-backup-sync-key"}&quot; -TestDownload
                </p>
                <p className="text-[10px] text-slate-400 font-sans">
                  Runs folder verification, registers Windows Task Scheduler with &apos;StartWhenAvailable&apos; policy, and performs an initial download test.
                </p>
              </div>
            </div>
          </div>

          <DialogFooter className="border-t pt-3 flex items-center justify-between">
            <Button variant="outline" onClick={() => setScheduleModalOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
              disabled={saveScheduleMut.isPending}
              onClick={() => saveScheduleMut.mutate()}
            >
              {saveScheduleMut.isPending ? "Saving..." : "Save Settings"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 7. Backup Details Modal */}
      <Dialog open={detailModalOpen} onOpenChange={setDetailModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Backup Archive Details</DialogTitle>
          </DialogHeader>
          {selectedBackup && (
            <div className="space-y-2 text-xs">
              <div className="p-2.5 bg-slate-50 border rounded-lg space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Backup ID:</span>
                  <span className="font-mono font-bold text-slate-900">{selectedBackup.backup_code}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Type:</span>
                  <span>{getTypeBadge(selectedBackup.backup_source)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Created Date:</span>
                  <span>{formatDateTime(selectedBackup.created_at).full}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">File Size:</span>
                  <span className="font-medium">{formatSize(selectedBackup.file_size_bytes)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status:</span>
                  <span>{getStatusBadge(selectedBackup.status)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Created By:</span>
                  <span>{selectedBackup.created_by_username || "System"}</span>
                </div>
              </div>

              <div className="p-2.5 bg-slate-50 border rounded-lg space-y-1">
                <span className="text-muted-foreground font-semibold">SHA-256 Checksum:</span>
                <p className="font-mono text-[11px] break-all bg-white p-1.5 border rounded text-slate-700">
                  {selectedBackup.checksum_sha256 || "Verification pending"}
                </p>
              </div>

              <div className="p-2.5 bg-slate-50 border rounded-lg space-y-1">
                <span className="text-muted-foreground font-semibold">Storage Path:</span>
                <p className="font-mono text-[11px] break-all bg-white p-1.5 border rounded text-slate-700">
                  {selectedBackup.storage_path || selectedBackup.storage_ref || "—"}
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailModalOpen(false)}>
              Close
            </Button>
            {selectedBackup && (
              <Button
                className="bg-[#2563EB] hover:bg-[#1d4ed8]"
                onClick={() => downloadBackupFile(selectedBackup)}
              >
                <Download className="h-4 w-4 mr-1.5" />
                Download Archive
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 8. Safe Restore Dialog */}
      <Dialog
        open={restoreModalOpen}
        onOpenChange={(open) => {
          if (!open && !restoreActive) {
            setRestoreModalOpen(false);
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-700">
              <RotateCcw className="h-5 w-5" />
              Restore Application State
            </DialogTitle>
            <DialogDescription>
              Validate archive integrity and safely restore PostgreSQL databases and uploaded documents.
            </DialogDescription>
          </DialogHeader>

          {restoreTarget && (
            <div className="space-y-4 text-xs">
              {/* Validation Status */}
              <div className="p-3 border rounded-lg bg-slate-50 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-800">Target Archive:</span>
                  <span className="font-mono font-bold text-blue-700">{restoreTarget.backup_code}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Archive Timestamp:</span>
                  <span>{formatDateTime(restoreTarget.created_at).full}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Integrity Check:</span>
                  {restoreValidating ? (
                    <span className="flex items-center gap-1 text-slate-500">
                      <Loader2 className="h-3 w-3 animate-spin" /> Verifying SHA-256...
                    </span>
                  ) : restoreValidation?.valid ? (
                    <span className="flex items-center gap-1 text-emerald-700 font-semibold">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Archive Verified & Healthy
                    </span>
                  ) : (
                    <span className="text-amber-700">Ready for inspection</span>
                  )}
                </div>
              </div>

              {/* Safety Backup Guarantee */}
              <div className="p-3 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-900 space-y-1">
                <div className="flex items-center gap-1.5 font-semibold">
                  <ShieldCheck className="h-4 w-4 text-emerald-700" />
                  Pre-Restore Safety Snapshot Guaranteed
                </div>
                <p className="text-[11px] text-emerald-800 leading-relaxed">
                  Before making any changes to production, the system automatically creates a Safety Backup of your current live databases. If anything fails, changes are rejected.
                </p>
              </div>

              {/* High Risk Warning */}
              <div className="p-3 rounded-lg border border-red-200 bg-red-50 text-red-900 space-y-1">
                <div className="flex items-center gap-1.5 font-semibold">
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                  Warning: Data Replacement
                </div>
                <p className="text-[11px] text-red-800 leading-relaxed">
                  Restoring this backup will replace current database records with data from {formatDateTime(restoreTarget.created_at).full}. Transactions made after this backup was taken will be overwritten.
                </p>
              </div>

              {/* Confirmation Checkbox */}
              <label className="flex items-start gap-2 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-amber-600 rounded"
                  checked={restoreAck}
                  disabled={restoreActive}
                  onChange={(e) => setRestoreAck(e.target.checked)}
                />
                <span className="text-slate-700 leading-tight">
                  I understand this is a high-risk administrative action and I authorize the restoration.
                </span>
              </label>

              {/* Type RESTORE phrase */}
              <div className="space-y-1.5 pt-1">
                <Label htmlFor="restore-confirm-input" className="text-xs font-semibold text-slate-800">
                  Type <span className="font-mono text-red-600 font-bold">RESTORE</span> to confirm
                </Label>
                <Input
                  id="restore-confirm-input"
                  value={restoreConfirmText}
                  disabled={restoreActive}
                  onChange={(e) => setRestoreConfirmText(e.target.value)}
                  placeholder="RESTORE"
                  className="font-mono text-sm uppercase"
                />
              </div>

              {/* Live Restore Progress */}
              {restoreActive && restoreProgressData && (
                <div className="p-3 border rounded-lg bg-amber-50/50 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-amber-900 flex items-center gap-1.5">
                      <Loader2 className="h-4 w-4 animate-spin text-amber-700" />
                      {restoreProgressData.status}
                    </span>
                    <span className="font-mono font-bold text-amber-800">{restoreProgressData.percent}%</span>
                  </div>
                  <p className="text-[11px] text-amber-800">{restoreProgressData.step}</p>
                  <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-amber-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${restoreProgressData.percent}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              disabled={restoreActive}
              onClick={() => {
                setRestoreModalOpen(false);
                setRestoreProgressData(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!canExecuteRestore}
              onClick={() => triggerRestoreMut.mutate()}
              className="bg-red-600 hover:bg-red-700 text-white font-medium gap-1.5"
            >
              {restoreActive ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Restoring Databases...
                </>
              ) : (
                <>
                  <RotateCcw className="h-4 w-4" />
                  Create Safety Backup & Restore
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
