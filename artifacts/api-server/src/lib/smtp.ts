export type SmtpSettings = {
  smtpHost: string;
  smtpPort: string;
  smtpUser: string;
  smtpPass: string;
  smtpFrom: string;
};

/** Company DB settings first; fall back to process.env SMTP_* from .env */
export function resolveSmtpSettings(dbSettings?: Partial<SmtpSettings> | null): SmtpSettings | null {
  const smtpHost = (dbSettings?.smtpHost || process.env.SMTP_HOST || "").trim();
  const smtpUser = (dbSettings?.smtpUser || process.env.SMTP_USER || "").trim();
  const smtpPass = (dbSettings?.smtpPass || process.env.SMTP_PASS || "").trim();
  if (!smtpHost || !smtpUser || !smtpPass) return null;

  const envPort = process.env.SMTP_PORT?.trim();
  const smtpPort = (dbSettings?.smtpPort || envPort || "587").trim() || "587";
  const smtpFrom = (dbSettings?.smtpFrom || process.env.SMTP_FROM || smtpUser).trim();

  return { smtpHost, smtpPort, smtpUser, smtpPass, smtpFrom };
}

export function isSmtpConfigured(dbSettings?: Partial<SmtpSettings> | null): boolean {
  return resolveSmtpSettings(dbSettings) != null;
}
