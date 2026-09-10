/**
 * Safe production error helpers — never leak secrets to clients.
 */
const SENSITIVE =
  /password|secret|token|authorization|api[_-]?key|database_url|smtp_pass|connectionstring|bearer/i;

export function sanitizeErrorMessage(err: unknown, fallback = "An unexpected error occurred"): string {
  if (process.env.NODE_ENV !== "production") {
    if (err instanceof Error && err.message && !SENSITIVE.test(err.message)) {
      return err.message;
    }
  }
  if (err instanceof Error && err.message) {
    if (SENSITIVE.test(err.message)) return fallback;
    // Hide raw SQL / connection strings in production
    if (/password=|postgresql:\/\//i.test(err.message)) return fallback;
  }
  return fallback;
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
