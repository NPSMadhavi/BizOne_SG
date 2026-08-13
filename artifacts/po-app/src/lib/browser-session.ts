/** Marks an authenticated browser run. Cleared when the browser fully closes. */
const LIVE_KEY = "bizone_live_session";
const TABS_KEY = "bizone_open_tabs";
const REFRESH_COOKIE = "bizone_rf";
const TAB_STALE_MS = 20_000;

function readCookie(name: string): boolean {
  return document.cookie.split("; ").some((c) => c.startsWith(`${name}=`));
}

function clearCookie(name: string) {
  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
}

function setRefreshMarker() {
  document.cookie = `${REFRESH_COOKIE}=1; Path=/; Max-Age=5; SameSite=Lax`;
}

function getTabs(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(TABS_KEY) || "{}") as Record<string, number>;
  } catch {
    return {};
  }
}

function saveTabs(tabs: Record<string, number>) {
  localStorage.setItem(TABS_KEY, JSON.stringify(tabs));
}

function pruneTabs(tabs: Record<string, number>, now = Date.now()) {
  for (const [id, ts] of Object.entries(tabs)) {
    if (now - ts > TAB_STALE_MS) delete tabs[id];
  }
  return tabs;
}

export function markBrowserSessionLive() {
  sessionStorage.setItem(LIVE_KEY, "1");
  localStorage.setItem(LIVE_KEY, "1");
}

export function clearBrowserSessionLive() {
  sessionStorage.removeItem(LIVE_KEY);
  localStorage.removeItem(LIVE_KEY);
}

export function isBrowserSessionLive(): boolean {
  if (sessionStorage.getItem(LIVE_KEY) === "1") return true;
  if (localStorage.getItem(LIVE_KEY) === "1") {
    sessionStorage.setItem(LIVE_KEY, "1");
    return true;
  }
  return false;
}

/**
 * Call once before React mounts.
 * - Refresh / SPA navigations keep the session.
 * - Full browser reopen clears any restored session cookie and requires login.
 * - Extra tabs in the same browser run keep the session.
 */
export async function bootstrapBrowserSession(): Promise<void> {
  const isRefresh = readCookie(REFRESH_COOKIE);
  clearCookie(REFRESH_COOKIE);

  if (!isRefresh) {
    const now = Date.now();
    const liveTabs = Object.entries(pruneTabs(getTabs(), now));
    if (liveTabs.length > 0) {
      markBrowserSessionLive();
    } else {
      clearBrowserSessionLive();
      localStorage.removeItem(TABS_KEY);
      try {
        await fetch("/api/auth/logout", {
          method: "POST",
          credentials: "include",
          keepalive: true,
        });
      } catch {
        // ignore — session may already be gone
      }
    }
  }

  const tabId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  const touchTab = () => {
    const tabs = pruneTabs(getTabs());
    tabs[tabId] = Date.now();
    saveTabs(tabs);
  };

  const dropTab = () => {
    const tabs = pruneTabs(getTabs());
    delete tabs[tabId];
    saveTabs(tabs);
    if (Object.keys(tabs).length === 0) {
      localStorage.removeItem(LIVE_KEY);
    }
  };

  touchTab();
  const heartbeat = window.setInterval(touchTab, 5_000);

  window.addEventListener("pagehide", () => {
    setRefreshMarker();
    dropTab();
    window.clearInterval(heartbeat);
  });
}
