/** Read a same-app return path from ?returnTo=. Rejects external URLs. */
export function readReturnTo(): string | null {
  if (typeof window === "undefined") return null;
  const raw = new URLSearchParams(window.location.search).get("returnTo");
  if (!raw) return null;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\") || raw.includes("://")) return null;
  return raw;
}

/** Keep the current returnTo when moving to another in-app page. */
export function withReturnTo(path: string): string {
  const ret = readReturnTo();
  if (!ret) return path;
  const join = path.includes("?") ? "&" : "?";
  return `${path}${join}returnTo=${encodeURIComponent(ret)}`;
}
