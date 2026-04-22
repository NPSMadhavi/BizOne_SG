import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { WrenchIcon, Clock, Mail, AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface MaintenanceStatus {
  isEnabled: boolean;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  message: string | null;
  contactEmail: string | null;
}

function useCountdown(endTime: string | null) {
  const [remaining, setRemaining] = useState<string | null>(null);

  useEffect(() => {
    if (!endTime) { setRemaining(null); return; }

    const tick = () => {
      const diff = new Date(endTime).getTime() - Date.now();
      if (diff <= 0) { setRemaining("Shortly"); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      if (h > 0) setRemaining(`${h}h ${m}m`);
      else if (m > 0) setRemaining(`${m}m ${s}s`);
      else setRemaining(`${s}s`);
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [endTime]);

  return remaining;
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-SG", {
    dateStyle: "long", timeStyle: "short", hour12: true,
  });
}

function MaintenancePage({ status, onRetry }: { status: MaintenanceStatus; onRetry: () => void }) {
  const countdown = useCountdown(status.scheduledEnd);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-8 text-center space-y-6 shadow-2xl">
          <div className="flex justify-center">
            <div className="relative">
              <div className="w-20 h-20 rounded-full bg-amber-500/20 border-2 border-amber-400/40 flex items-center justify-center">
                <WrenchIcon className="h-9 w-9 text-amber-400" />
              </div>
              <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-amber-400 animate-ping opacity-75" />
              <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-amber-400" />
            </div>
          </div>

          <div>
            <h1 className="text-2xl font-bold text-white mb-2">Scheduled Maintenance</h1>
            <p className="text-slate-400 text-sm leading-relaxed">
              {status.message ||
                "We are currently performing scheduled maintenance to improve our services. We apologize for any inconvenience."}
            </p>
          </div>

          {(status.scheduledStart || status.scheduledEnd) && (
            <div className="bg-white/5 rounded-xl p-4 space-y-3 border border-white/10 text-left">
              {status.scheduledStart && (
                <div className="flex items-start gap-3">
                  <Clock className="h-4 w-4 text-blue-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wide">Started at</p>
                    <p className="text-sm text-white font-medium">{fmtDateTime(status.scheduledStart)}</p>
                  </div>
                </div>
              )}
              {status.scheduledEnd && (
                <div className="flex items-start gap-3">
                  <Clock className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wide">Expected back online</p>
                    <p className="text-sm text-white font-medium">{fmtDateTime(status.scheduledEnd)}</p>
                    {countdown && (
                      <Badge className="mt-1 bg-emerald-500/20 text-emerald-300 border-emerald-400/30 hover:bg-emerald-500/20 text-xs">
                        ⏱ {countdown} remaining
                      </Badge>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {status.contactEmail && (
            <div className="flex items-center justify-center gap-2 text-sm text-slate-400">
              <Mail className="h-4 w-4 text-slate-500" />
              <span>Need help?</span>
              <a
                href={`mailto:${status.contactEmail}`}
                className="text-blue-400 hover:text-blue-300 underline underline-offset-2"
              >
                {status.contactEmail}
              </a>
            </div>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={onRetry}
            className="border-white/20 text-white hover:bg-white/10 gap-2"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Check again
          </Button>
        </div>

        <p className="text-center text-slate-600 text-xs mt-4">RSV Infotech Document Manager</p>
      </div>
    </div>
  );
}

function AdminMaintenanceBanner({ status, onDismiss }: { status: MaintenanceStatus; onDismiss: () => void }) {
  const countdown = useCountdown(status.scheduledEnd);
  return (
    <div className="bg-amber-500 text-amber-950 px-4 py-2 flex items-center gap-3 text-sm font-medium">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span>
        Maintenance mode is <strong>active</strong>. Users cannot access the app.
        {status.scheduledEnd && countdown && ` Ends in ${countdown}.`}
      </span>
      <button onClick={onDismiss} className="ml-auto text-amber-900 hover:text-amber-950 text-xs underline shrink-0">
        Dismiss
      </button>
    </div>
  );
}

export function MaintenanceGuard({ children }: { children: React.ReactNode }) {
  const { isAdmin, isLoading: authLoading } = useAuth();
  const [status, setStatus] = useState<MaintenanceStatus | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [fetchKey, setFetchKey] = useState(0);

  const isMaintenanceActive = (s: MaintenanceStatus): boolean => {
    if (!s.isEnabled) return false;
    const now = Date.now();
    if (s.scheduledStart && new Date(s.scheduledStart).getTime() > now) return false;
    if (s.scheduledEnd && new Date(s.scheduledEnd).getTime() < now) return false;
    return true;
  };

  useEffect(() => {
    let cancelled = false;
    const fetch_ = async () => {
      try {
        const res = await fetch("/api/maintenance", { credentials: "include" });
        if (!res.ok) return;
        const data: MaintenanceStatus = await res.json();
        if (!cancelled) setStatus(data);
      } catch {}
    };
    fetch_();
    const interval = setInterval(fetch_, 30_000);
    const onUpdate = () => { fetch_(); };
    window.addEventListener("maintenance-updated", onUpdate);
    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener("maintenance-updated", onUpdate);
    };
  }, [fetchKey]);

  if (authLoading || !status) return <>{children}</>;

  const active = isMaintenanceActive(status);

  if (active && !isAdmin) {
    return (
      <MaintenancePage
        status={status}
        onRetry={() => setFetchKey(k => k + 1)}
      />
    );
  }

  return (
    <>
      {active && isAdmin && !bannerDismissed && (
        <AdminMaintenanceBanner status={status} onDismiss={() => setBannerDismissed(true)} />
      )}
      {children}
    </>
  );
}
