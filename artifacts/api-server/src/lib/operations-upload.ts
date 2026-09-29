import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { randomBytes } from "crypto";
import { getUploadsRoot } from "./ensure-uploads.js";

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
