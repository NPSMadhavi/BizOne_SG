export type AssetAttachment = {
  id: string;
  name: string;
  size: number;
  type: string;
  dataUrl: string;
};

const ATTACHMENT_STORAGE_PREFIX = "asset-attachments-";

function attachmentStorageKey(assetId: number | string): string {
  return `${ATTACHMENT_STORAGE_PREFIX}${assetId}`;
}

export function loadAssetAttachments(assetId?: number | string | null): AssetAttachment[] {
  if (assetId == null || assetId === "") return [];
  try {
    const value = localStorage.getItem(attachmentStorageKey(assetId));
    const parsed = value ? JSON.parse(value) : [];
    return Array.isArray(parsed) ? (parsed as AssetAttachment[]) : [];
  } catch {
    return [];
  }
}

export function saveAssetAttachments(
  assetId: number | string,
  attachments: AssetAttachment[],
): void {
  try {
    if (attachments.length === 0) {
      localStorage.removeItem(attachmentStorageKey(assetId));
      return;
    }
    localStorage.setItem(attachmentStorageKey(assetId), JSON.stringify(attachments));
  } catch {
    // Attachments stay available for the current session even when storage is full.
  }
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function mimeFromFileName(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  switch (ext) {
    case "pdf":
      return "application/pdf";
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "svg":
      return "image/svg+xml";
    case "txt":
      return "text/plain";
    case "html":
    case "htm":
      return "text/html";
    case "csv":
      return "text/csv";
    case "doc":
      return "application/msword";
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "xls":
      return "application/vnd.ms-excel";
    case "xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    default:
      return "application/octet-stream";
  }
}

function dataUrlToBlob(dataUrl: string, fallbackMime?: string): Blob {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) {
    throw new Error("Invalid data URL");
  }
  const header = dataUrl.slice(0, comma);
  const payload = dataUrl.slice(comma + 1);
  const isBase64 = /;base64/i.test(header);
  const headerMime = header.match(/data:([^;,]+)/i)?.[1];
  const mime = headerMime || fallbackMime || "application/octet-stream";
  const binary = isBase64 ? atob(payload) : decodeURIComponent(payload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

function attachmentObjectUrl(attachment: AssetAttachment): string {
  const fallbackMime = attachment.type || mimeFromFileName(attachment.name);
  const blob = dataUrlToBlob(attachment.dataUrl, fallbackMime);
  // Prefer a definite viewable MIME (e.g. PDF) even if the stored type was empty
  const type = blob.type && blob.type !== "application/octet-stream"
    ? blob.type
    : fallbackMime;
  const viewBlob =
    type && type !== blob.type ? new Blob([blob], { type }) : blob;
  return URL.createObjectURL(viewBlob);
}

/** Open attachment in a new tab for viewing (no forced download). */
export function viewAssetAttachment(attachment: AssetAttachment): void {
  if (!attachment?.dataUrl) return;
  try {
    const objectUrl = attachmentObjectUrl(attachment);
    const opened = window.open(objectUrl, "_blank");
    if (!opened) {
      // Popup blocked — open via temporary anchor (still without download attr)
      const link = document.createElement("a");
      link.href = objectUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      document.body.appendChild(link);
      link.click();
      link.remove();
    }
    // Keep URL alive long enough for the new tab to load large files
    setTimeout(() => URL.revokeObjectURL(objectUrl), 120_000);
  } catch (error) {
    console.error("Failed to open attachment for viewing", error);
  }
}

/** Trigger a file download for the attachment. */
export function downloadAssetAttachment(attachment: AssetAttachment): void {
  if (!attachment?.dataUrl) return;
  try {
    const objectUrl = attachmentObjectUrl(attachment);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = attachment.name || "attachment";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
  } catch (error) {
    console.error("Failed to download attachment", error);
    // Last resort: data URL with download attribute
    const link = document.createElement("a");
    link.href = attachment.dataUrl;
    link.download = attachment.name || "attachment";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }
}
