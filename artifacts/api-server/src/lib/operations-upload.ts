import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { randomBytes } from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, "..", "uploads", "employee-documents");

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

function extensionFromDataUrl(base64Data: string): string {
  const match = base64Data.match(/^data:([^;]+);/);
  if (!match) return "pdf";
  const mime = match[1];
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "application/pdf") return "pdf";
  return "bin";
}

export async function saveEmployeeDocumentUpload(
  base64Data: string,
  filePrefix = "document",
): Promise<string> {
  const base64Content =
    base64Data.indexOf(",") > -1 ? base64Data.split(",")[1] : base64Data;
  const ext = extensionFromDataUrl(base64Data);
  const filename = `${filePrefix}-${randomBytes(8).toString("hex")}.${ext}`;
  const absolutePath = path.join(uploadsDir, filename);
  await fs.promises.writeFile(absolutePath, Buffer.from(base64Content, "base64"));
  return path.posix.join("uploads", "employee-documents", filename);
}

export const employeeDocumentsUploadDir = uploadsDir;
