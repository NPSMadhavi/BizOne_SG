import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createWriteStream } from "fs";
import type { Response } from "express";
import archiver from "archiver";
import { getEmployeeNamePart } from "./payslip-generator";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const payslipZipsRoot = path.join(__dirname, "..", "uploads", "payslip-zips");
const STALE_ZIP_MAX_AGE_MS = 30 * 60 * 1000;

const sessionZipPaths = new Map<string, Set<string>>();

export function ensurePayslipZipsDirectory(): void {
  if (!fs.existsSync(payslipZipsRoot)) {
    fs.mkdirSync(payslipZipsRoot, { recursive: true });
  }
}

export function getPayslipZipFileName(employeeName: string, employeeDbId: number): string {
  return `${getEmployeeNamePart(employeeName)}_${employeeDbId}_Payslips.zip`;
}

function safeUnlink(filePath: string): void {
  fs.promises.unlink(filePath).catch(() => undefined);
}

export function registerSessionPayslipZip(sessionId: string, zipPath: string): void {
  if (!sessionZipPaths.has(sessionId)) {
    sessionZipPaths.set(sessionId, new Set());
  }
  sessionZipPaths.get(sessionId)!.add(zipPath);
}

export function cleanupSessionPayslipZips(sessionId: string): void {
  const paths = sessionZipPaths.get(sessionId);
  if (!paths) return;
  for (const zipPath of paths) {
    safeUnlink(zipPath);
  }
  sessionZipPaths.delete(sessionId);
}

export async function cleanupStalePayslipZips(): Promise<void> {
  ensurePayslipZipsDirectory();
  const now = Date.now();
  let entries: string[];
  try {
    entries = await fs.promises.readdir(payslipZipsRoot);
  } catch {
    return;
  }

  await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(payslipZipsRoot, entry);
      try {
        const stat = await fs.promises.stat(fullPath);
        if (stat.isFile() && now - stat.mtimeMs > STALE_ZIP_MAX_AGE_MS) {
          await fs.promises.unlink(fullPath);
        }
      } catch {
        // ignore
      }
    })
  );
}

export async function createPayslipZipArchive(
  files: Array<{ filename: string; buffer: Buffer }>
): Promise<string> {
  ensurePayslipZipsDirectory();
  const zipPath = path.join(
    payslipZipsRoot,
    `payslips-${Date.now()}-${Math.random().toString(36).slice(2)}.zip`
  );
  const output = createWriteStream(zipPath);
  const archive = archiver("zip", { zlib: { level: 9 } });

  await new Promise<void>((resolve, reject) => {
    output.on("close", () => resolve());
    output.on("error", reject);
    archive.on("error", reject);
    archive.pipe(output);

    for (const file of files) {
      archive.append(file.buffer, { name: file.filename });
    }

    archive.finalize();
  });

  return zipPath;
}

export function sendPayslipZipFile(
  res: Response,
  zipPath: string,
  filename: string,
  sessionId?: string
): void {
  const stat = fs.statSync(zipPath);

  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Content-Length", String(stat.size));
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Cache-Control", "no-store");

  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    safeUnlink(zipPath);
    if (sessionId) {
      const paths = sessionZipPaths.get(sessionId);
      paths?.delete(zipPath);
      if (paths?.size === 0) {
        sessionZipPaths.delete(sessionId);
      }
    }
  };

  res.on("finish", cleanup);
  res.on("close", () => {
    if (!res.writableFinished) {
      cleanup();
    }
  });

  fs.createReadStream(zipPath).pipe(res);
}

ensurePayslipZipsDirectory();
setInterval(() => {
  cleanupStalePayslipZips().catch((err) => {
    console.error("Payslip ZIP cleanup error:", err);
  });
}, 15 * 60 * 1000);
