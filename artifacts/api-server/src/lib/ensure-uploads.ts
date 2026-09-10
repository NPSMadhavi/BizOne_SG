/**
 * Ensure writable upload directories exist (OS-independent paths).
 * Plesk must allow write access to these under the api-server package root.
 *
 * Non-writable uploads must NOT kill Passenger boot — callers should treat
 * failure as a warning unless a later feature requires the directory.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { logger } from "./logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Package root: dist/ -> ..  or src/lib -> ../.. depending on runtime. */
function resolveUploadsRoot(): string {
  const candidates = [
    path.resolve(__dirname, "..", "uploads"), // dist/../uploads when bundled
    path.resolve(__dirname, "..", "..", "uploads"), // when running from src/lib
    path.resolve(process.cwd(), "uploads"),
    path.resolve(process.cwd(), "artifacts", "api-server", "uploads"),
  ];
  // Prefer existing uploads dir; else default next to package (dist/../uploads)
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return path.resolve(__dirname, "..", "uploads");
}

export const UPLOAD_SUBDIRS = [
  "employee-documents",
  "payslips",
  "payslip-zips",
  "accounting-backups",
] as const;

export type EnsureUploadsResult =
  | { ok: true; uploadsRoot: string }
  | { ok: false; uploadsRoot: string; error: string };

export function ensureUploadDirectories(): EnsureUploadsResult {
  const root = resolveUploadsRoot();
  try {
    fs.mkdirSync(root, { recursive: true });
    for (const sub of UPLOAD_SUBDIRS) {
      fs.mkdirSync(path.join(root, sub), { recursive: true });
    }
    // Probe writability without leaving junk if possible
    const probe = path.join(root, ".write-probe");
    fs.writeFileSync(probe, "ok");
    fs.unlinkSync(probe);
    logger.info({ uploadsRoot: root }, "[uploads] directories ready");
    return { ok: true, uploadsRoot: root };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(
      { err, uploadsRoot: root },
      "[uploads] not writable — email attachments / payslip zips / backups may fail until Plesk file permissions are fixed",
    );
    return { ok: false, uploadsRoot: root, error: message };
  }
}
