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

export function logServerError(
  logger: { error: (obj: object, msg?: string) => void },
  err: unknown,
  context: Record<string, unknown>,
): void {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  logger.error(
    {
      ...context,
      errMessage: SENSITIVE.test(message) ? "[redacted]" : message,
      stack: stack && !SENSITIVE.test(stack) ? stack : undefined,
    },
    "request failed",
  );
}
