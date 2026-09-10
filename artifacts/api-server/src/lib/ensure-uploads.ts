/**
 * Ensure writable upload directories exist (OS-independent paths).
 * Plesk must allow write access to these under the api-server package root.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { logger } from "./logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Package root: dist/ -> ..  or src/lib -> ../.. depending on runtime. */
function resolveUploadsRoot(): string {
  const candidates = [
    path.resolve(__dirname, "..", "uploads"), // dist/uploads or src/uploads wrong
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

export function ensureUploadDirectories(): string {
  const root = resolveUploadsRoot();
  fs.mkdirSync(root, { recursive: true });
  for (const sub of UPLOAD_SUBDIRS) {
    fs.mkdirSync(path.join(root, sub), { recursive: true });
  }
  logger.info({ uploadsRoot: root }, "[uploads] directories ready");
  return root;
}
