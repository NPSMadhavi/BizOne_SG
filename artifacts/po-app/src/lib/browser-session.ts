/** Per-tab login. sessionStorage is not shared with other tabs. */
const TAB_SESSION_KEY = "bizone_tab_session";

export function getTabSessionId(): string | null {
  try {
    return sessionStorage.getItem(TAB_SESSION_KEY);
  } catch {
    return null;
  }
}

export function setTabSessionId(sessionId: string) {
  sessionStorage.setItem(TAB_SESSION_KEY, sessionId);
}

export function clearTabSessionId() {
  sessionStorage.removeItem(TAB_SESSION_KEY);
}

export function markBrowserSessionLive(sessionId?: string) {
  if (sessionId) setTabSessionId(sessionId);
}

export function clearBrowserSessionLive() {
  clearTabSessionId();
}

export function isBrowserSessionLive(): boolean {
  return Boolean(getTabSessionId());
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function isAppApiRequest(input: RequestInfo | URL): boolean {
  try {
    const url = new URL(requestUrl(input), window.location.origin);
    return url.origin === window.location.origin && url.pathname.startsWith("/api");
  } catch {
    return false;
  }
}

let fetchPatched = false;

/** Attach this tab's session id to API calls so tabs do not share the cookie session. */
export function installTabSessionFetch() {
  if (fetchPatched) return;
  fetchPatched = true;
  const original = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (!isAppApiRequest(input)) return original(input, init);
    const sid = getTabSessionId();
    if (!sid) return original(input, init);

    const headers = new Headers(
      init?.headers ?? (input instanceof Request ? input.headers : undefined),
    );
    if (!headers.has("X-BizOne-Session")) {
      headers.set("X-BizOne-Session", sid);
    }
    if (input instanceof Request) {
      return original(new Request(input, { ...init, headers }));
    }
    return original(input, { ...init, headers });
  };
}

/** Call once before React mounts. */
export function bootstrapBrowserSession(): void {
  installTabSessionFetch();
}
