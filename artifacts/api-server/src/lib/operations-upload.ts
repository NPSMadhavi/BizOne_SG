import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { randomBytes } from "crypto";
import type { Response } from "express";
import { getUploadsRoot } from "./ensure-uploads.js";

export const VOUCHER_UPLOAD_FOLDERS = {
  purchaseOrders: "purchase orders",
  vendorInvoice: "vendor invoice",
  debitNote: "debit note",
  salesOrder: "sales order",
} as const;

const bundledDir = path.dirname(fileURLToPath(import.meta.url));

function extensionFromDataUrl(base64Data: string): string {
  const match = base64Data.match(/^data:([^;]+);/);
  if (!match) return "pdf";
  const mime = match[1];
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "application/pdf") return "pdf";
  return "bin";
}

function employeeDocumentDirs(): string[] {
  const dirs = [
    path.join(getUploadsRoot(), "employee-documents"),
    path.resolve(bundledDir, "..", "uploads", "employee-documents"),
    path.resolve(bundledDir, "uploads", "employee-documents"),
    path.resolve(process.cwd(), "uploads", "employee-documents"),
    path.resolve(process.cwd(), "artifacts", "api-server", "uploads", "employee-documents"),
  ];
  return [...new Set(dirs.map((dir) => path.resolve(dir)))];
}

function writableEmployeeDocumentsDir(): string {
  const dir = employeeDocumentDirs()[0];
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export async function saveEmployeeDocumentUpload(
  base64Data: string,
  filePrefix = "document",
): Promise<string> {
  const base64Content =
    base64Data.indexOf(",") > -1 ? base64Data.split(",")[1] : base64Data;
  const ext = extensionFromDataUrl(base64Data);
  const filename = `${filePrefix}-${randomBytes(8).toString("hex")}.${ext}`;
  const absolutePath = path.join(writableEmployeeDocumentsDir(), filename);
  await fs.promises.writeFile(absolutePath, Buffer.from(base64Content, "base64"));
  return path.posix.join("uploads", "employee-documents", filename);
}

export function mimeForStoredFile(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case ".pdf":
      return "application/pdf";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    default:
      return "application/octet-stream";
  }
}

/** Resolve a stored relative path to a file inside the employee-documents folder. */
export function resolveStoredEmployeeDocument(storedPath: string): string | null {
  if (!storedPath || storedPath.startsWith("data:")) return null;
  const filename = path.basename(storedPath);
  if (!filename || filename === "." || filename === "..") return null;
  for (const dir of employeeDocumentDirs()) {
    const root = path.resolve(dir);
    const absolute = path.resolve(root, filename);
    if (!absolute.startsWith(root + path.sep)) continue;
    if (fs.existsSync(absolute)) return absolute;
  }
  return null;
}

const voucherFolders = new Set<string>(Object.values(VOUCHER_UPLOAD_FOLDERS));

function assertVoucherFolder(folder: string): string {
  if (!voucherFolders.has(folder)) throw new Error("Unknown upload folder");
  return folder;
}

export async function saveVoucherUpload(
  base64Data: string,
  folder: string,
  filePrefix = "document",
): Promise<string> {
  const safeFolder = assertVoucherFolder(folder);
  const base64Content = base64Data.indexOf(",") > -1 ? base64Data.split(",")[1] : base64Data;
  const ext = extensionFromDataUrl(base64Data);
  if (ext !== "pdf" && ext !== "jpg" && ext !== "png") {
    throw new Error("Only PDF, JPG, and PNG files can be uploaded");
  }
  const bytes = Buffer.from(base64Content, "base64");
  if (bytes.length === 0 || bytes.length > 15 * 1024 * 1024) {
    throw new Error("File is empty or larger than 15 MB");
  }
  const dir = path.join(getUploadsRoot(), safeFolder);
  fs.mkdirSync(dir, { recursive: true });
  const filename = `${filePrefix}-${randomBytes(8).toString("hex")}.${ext}`;
  await fs.promises.writeFile(path.join(dir, filename), bytes);
  return path.posix.join("uploads", safeFolder, filename);
}

export function resolveVoucherUpload(storedPath: string, folder: string): string | null {
  if (!storedPath || storedPath.startsWith("data:") || !voucherFolders.has(folder)) return null;
  const filename = path.basename(storedPath);
  if (!filename || filename === "." || filename === "..") return null;
  const root = path.resolve(path.join(getUploadsRoot(), folder));
  const absolute = path.resolve(root, filename);
  if (!absolute.startsWith(root + path.sep)) return null;
  if (!fs.existsSync(absolute)) return null;
  return absolute;
}

export function deleteVoucherUpload(storedPath: string | null | undefined, folder: string): void {
  const absolute = resolveVoucherUpload(storedPath || "", folder);
  if (!absolute) return;
  fs.unlink(absolute, () => undefined);
}

export async function applyVoucherAttachment(
  body: { attachmentData?: unknown; attachmentName?: unknown; attachmentRemoved?: unknown },
  folder: string,
  previousPath?: string | null,
): Promise<{ attachmentPath?: string | null; attachmentName?: string | null }> {
  const data = typeof body?.attachmentData === "string" ? body.attachmentData : "";
  if (data.startsWith("data:")) {
    const saved = await saveVoucherUpload(data, folder, "document");
    const name = typeof body.attachmentName === "string" && body.attachmentName.trim()
      ? body.attachmentName.trim().slice(0, 255)
      : path.basename(saved);
    if (previousPath && previousPath !== saved) deleteVoucherUpload(previousPath, folder);
    return { attachmentPath: saved, attachmentName: name };
  }
  if (body?.attachmentRemoved === true) {
    if (previousPath) deleteVoucherUpload(previousPath, folder);
    return { attachmentPath: null, attachmentName: null };
  }
  return {};
}

export function sendVoucherFile(
  res: Response,
  storedPath: string | null | undefined,
  folder: string,
  downloadName?: string | null,
): void {
  const absolute = resolveVoucherUpload(storedPath || "", folder);
  if (!absolute) {
    res.status(404).json({ error: "File not found" });
    return;
  }
  const filename = (downloadName || path.basename(absolute)).replace(/[\r\n"]/g, "");
  res.setHeader("Content-Type", mimeForStoredFile(absolute));
  res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
  fs.createReadStream(absolute).pipe(res);
}
