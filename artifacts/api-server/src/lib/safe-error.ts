/**
 * Safe production error helpers — never leak secrets to clients.
 */
const SENSITIVE =
  /password|secret|token|authorization|api[_-]?key|database_url|smtp_pass|connectionstring|bearer/i;

export function sanitizeErrorMessage(err: unknown, fallback = "An unexpected error occurred"): string {
  if (!(err instanceof Error) || !err.message) return fallback;
  if (SENSITIVE.test(err.message)) return fallback;
  // Hide raw SQL / connection strings
  if (/password=|postgresql:\/\//i.test(err.message)) return fallback;
  // Prefer a short, useful message over a generic 500 for constraint / validation failures
  const msg = err.message.trim();
  if (!msg) return fallback;
  if (process.env.NODE_ENV !== "production") return msg;
  // Production: still return non-sensitive app messages (not full query dumps)
  if (/^Failed query:/i.test(msg)) {
    const cause = (err as Error & { cause?: { message?: string; detail?: string; code?: string } }).cause;
    if (cause?.detail) return cause.detail;
    if (cause?.message) return cause.message;
    if (/unique|duplicate/i.test(msg)) return "A record with this value already exists.";
    if (/foreign key|violates foreign key/i.test(msg)) {
      return "Related company or master data is missing. Log out, sign in again, then retry.";
    }
    if (/null value|not-null|not null/i.test(msg)) return "A required field is missing.";
    return fallback;
  }
  return msg.length > 300 ? `${msg.slice(0, 297)}…` : msg;
}

export function extractPostgresError(err: unknown): { pgCode?: string; constraint?: string } {
  let current: unknown = err;
  for (let i = 0; i < 6 && current; i++) {
    if (typeof current !== "object" || current === null) break;
    const rec = current as { code?: unknown; constraint?: unknown; cause?: unknown };
    if (typeof rec.code === "string" && /^[0-9A-Z]{5}$/.test(rec.code)) {
      return {
        pgCode: rec.code,
        constraint: typeof rec.constraint === "string" ? rec.constraint : undefined,
      };
    }
    current = rec.cause;
  }
  return {};
}

export function logServerError(
  logger: { error: (obj: object, msg?: string) => void },
  err: unknown,
  context: Record<string, unknown>,
): void {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  const pg = extractPostgresError(err);
  logger.error(
    {
      ...context,
      ...pg,
      errMessage: SENSITIVE.test(message) ? "[redacted]" : message,
      stack: stack && !SENSITIVE.test(stack) ? stack : undefined,
    },
    "request failed",
  );
}
