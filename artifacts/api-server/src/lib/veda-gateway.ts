/**
 * Veda AI Gateway client.
 *
 * Gateway API (FastAPI / Ollama):
 *   POST {VEDA_GATEWAY_URL}/chat  body: { message: string }
 *   → { response: string, model?: string }
 *
 * Not OpenAI-compatible — do not point the OpenAI SDK at this base URL.
 */

export function isVedaGatewayConfigured(): boolean {
  return Boolean((process.env.VEDA_GATEWAY_URL || "").trim());
}

function gatewayBase(): string {
  return (process.env.VEDA_GATEWAY_URL || "").trim().replace(/\/$/, "");
}

function gatewayHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const key = (process.env.VEDA_API_KEY || "").trim();
  if (key) {
    headers.Authorization = `Bearer ${key}`;
    headers["X-API-Key"] = key;
  }
  return headers;
}

/** Simple chat completion against the Veda gateway. Returns plain text. */
export async function vedaChat(message: string, opts?: { timeoutMs?: number }): Promise<string> {
  const base = gatewayBase();
  if (!base) {
    throw new Error("VEDA_GATEWAY_URL is not configured");
  }

  const controller = new AbortController();
  const timeoutMs = opts?.timeoutMs ?? 90_000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${base}/chat`, {
      method: "POST",
      headers: gatewayHeaders(),
      body: JSON.stringify({ message }),
      signal: controller.signal,
    });

    const raw = await res.text();
    if (!res.ok) {
      throw new Error(`Veda gateway ${res.status}${raw ? `: ${raw.slice(0, 200)}` : ""}`);
    }

    let parsed: any = null;
    try {
      parsed = raw ? JSON.parse(raw) : null;
    } catch {
      // plain text response
      return raw.trim();
    }

    const text =
      (typeof parsed?.response === "string" && parsed.response) ||
      (typeof parsed?.message === "string" && parsed.message) ||
      (typeof parsed?.content === "string" && parsed.content) ||
      (typeof parsed?.text === "string" && parsed.text) ||
      "";

    if (!text.trim()) {
      throw new Error("Veda gateway returned an empty response");
    }
    return text.trim();
  } finally {
    clearTimeout(timer);
  }
}
