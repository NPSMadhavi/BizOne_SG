import nodemailer from "nodemailer";

export type SmtpSettings = {
  smtpHost: string;
  smtpPort: string;
  smtpUser: string;
  smtpPass: string;
  smtpFrom: string;
  smtpSecure: boolean;
};

function clean(value?: string | null): string {
  return (value || "").trim();
}

/** Gmail app passwords are often copied with spaces. */
function cleanPass(value?: string | null): string {
  return (value || "").replace(/\s+/g, "").trim();
}

function isComplete(host: string, user: string, pass: string): boolean {
  return Boolean(host && user && pass);
}

function parseSecureFlag(port: string, raw?: string | null): boolean {
  const v = (raw || "").trim().toLowerCase();
  if (v === "true" || v === "1" || v === "yes") return true;
  if (v === "false" || v === "0" || v === "no") return false;
  return parseInt(port || "587", 10) === 465;
}

/**
 * Use one complete credential set — never mix DB user with .env password.
 * Prefer SMTP_* from .env when all three are set, so local config is actually used.
 */
export function resolveSmtpSettings(dbSettings?: Partial<SmtpSettings> | null): SmtpSettings | null {
  const envHost = clean(process.env.SMTP_HOST);
  const envUser = clean(process.env.SMTP_USER);
  const envPass = cleanPass(process.env.SMTP_PASS);
  const envPort = clean(process.env.SMTP_PORT);
  const envFrom = clean(process.env.SMTP_FROM);

  const dbHost = clean(dbSettings?.smtpHost);
  const dbUser = clean(dbSettings?.smtpUser);
  const dbPass = cleanPass(dbSettings?.smtpPass);
  const dbPort = clean(dbSettings?.smtpPort);
  const dbFrom = clean(dbSettings?.smtpFrom);

  const envComplete = isComplete(envHost, envUser, envPass);
  const dbComplete = isComplete(dbHost, dbUser, dbPass);

  let smtpHost = "";
  let smtpUser = "";
  let smtpPass = "";
  let smtpPort = "";
  let smtpFrom = "";
  let secureRaw: string | null | undefined;

  if (envComplete) {
    smtpHost = envHost;
    smtpUser = envUser;
    smtpPass = envPass;
    smtpPort = envPort || dbPort || "465";
    smtpFrom = envFrom || dbFrom || envUser;
    secureRaw = process.env.SMTP_SECURE;
  } else if (dbComplete) {
    smtpHost = dbHost;
    smtpUser = dbUser;
    smtpPass = dbPass;
    smtpPort = dbPort || envPort || "587";
    smtpFrom = dbFrom || dbUser;
  } else {
    return null;
  }

  smtpPort = smtpPort.trim() || "587";
  return {
    smtpHost,
    smtpPort,
    smtpUser,
    smtpPass,
    smtpFrom,
    smtpSecure: parseSecureFlag(smtpPort, secureRaw),
  };
}

export function isSmtpConfigured(dbSettings?: Partial<SmtpSettings> | null): boolean {
  return resolveSmtpSettings(dbSettings) != null;
}

export function createMailTransporter(settings: SmtpSettings) {
  const port = parseInt(settings.smtpPort || "587", 10);
  return nodemailer.createTransport({
    host: settings.smtpHost,
    port,
    secure: settings.smtpSecure,
    requireTLS: !settings.smtpSecure && port === 587,
    auth: {
      user: settings.smtpUser,
      pass: settings.smtpPass,
    },
    connectionTimeout: 20000,
    greetingTimeout: 20000,
    socketTimeout: 180000,
  });
}
