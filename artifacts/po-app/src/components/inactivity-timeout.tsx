import { useEffect, useRef, useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Clock } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";

const INACTIVITY_MS = 5 * 60 * 1000;
const WARN_BEFORE_MS = 30 * 1000;

export function InactivityTimeout() {
  const { user, logout } = useAuth();
  const [showWarning, setShowWarning] = useState(false);
  const [showTimedOut, setShowTimedOut] = useState(false);
  const [countdown, setCountdown] = useState(30);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearAll = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (warnTimerRef.current) clearTimeout(warnTimerRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
  }, []);

  const startCountdown = useCallback(() => {
    setCountdown(30);
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          if (countdownRef.current) clearInterval(countdownRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const doLogout = useCallback(() => {
    clearAll();
    setShowWarning(false);
    setShowTimedOut(true);
    logout();
  }, [clearAll, logout]);

  const resetTimer = useCallback(() => {
    if (!user) return;
    if (showWarning || showTimedOut) return;
    clearAll();
    warnTimerRef.current = setTimeout(() => {
      setShowWarning(true);
      startCountdown();
      timerRef.current = setTimeout(() => {
        doLogout();
      }, WARN_BEFORE_MS);
    }, INACTIVITY_MS - WARN_BEFORE_MS);
  }, [user, showWarning, showTimedOut, clearAll, startCountdown, doLogout]);

  const handleStayActive = useCallback(() => {
    setShowWarning(false);
    clearAll();
    resetTimer();
  }, [clearAll, resetTimer]);

  useEffect(() => {
    if (!user) return;
    const events = ["mousemove", "keydown", "click", "touchstart", "scroll", "wheel"];
    const handler = () => resetTimer();
    events.forEach(e => window.addEventListener(e, handler, { passive: true }));
    resetTimer();
    return () => {
      events.forEach(e => window.removeEventListener(e, handler));
      clearAll();
    };
  }, [user, resetTimer, clearAll]);

  if (!user) return null;

  return (
    <>
      <Dialog open={showWarning} onOpenChange={() => {}}>
        <DialogContent className="max-w-sm" onPointerDownOutside={e => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-amber-500" />
              Session About to Expire
            </DialogTitle>
            <DialogDescription>
              You've been inactive for a while. Your session will automatically end in{" "}
              <span className="font-semibold text-foreground">{countdown} second{countdown !== 1 ? "s" : ""}</span>.
              Any unsaved stock reservations will be released.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 justify-end mt-2">
            <Button onClick={handleStayActive}>
              Stay Logged In
            </Button>
            <Button variant="outline" onClick={doLogout}>
              Log Out Now
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showTimedOut} onOpenChange={() => {}}>
        <DialogContent className="max-w-sm" onPointerDownOutside={e => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Session Timed Out
            </DialogTitle>
            <DialogDescription>
              Your session has expired due to inactivity (5 minutes). Any reserved stock items have been released. Please log in again to continue.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end mt-2">
            <Button onClick={() => setShowTimedOut(false)}>
              OK, Log In
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
