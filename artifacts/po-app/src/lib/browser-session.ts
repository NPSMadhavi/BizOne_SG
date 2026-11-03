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
let xhrPatched = false;

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

/** Attach this tab's session id to XMLHttpRequest calls so uploads / XHR do not drop the session. */
export function installTabSessionXhr() {
  if (xhrPatched || typeof window === "undefined" || !window.XMLHttpRequest) return;
  xhrPatched = true;
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, ...args: any[]) {
    try {
      (this as any).__reqUrl = args[1];
    } catch {}
    return (originalOpen as any).apply(this, args);
  };

  XMLHttpRequest.prototype.send = function (this: XMLHttpRequest, body?: any) {
    try {
      const url = (this as any).__reqUrl;
      if (url && isAppApiRequest(url)) {
        const sid = getTabSessionId();
        if (sid) {
          try {
            this.setRequestHeader("X-BizOne-Session", sid);
          } catch {}
        }
      }
    } catch {}
    return originalSend.call(this, body);
  };
}

/** Call once before React mounts. */
export function bootstrapBrowserSession(): void {
  installTabSessionFetch();
  installTabSessionXhr();
}
