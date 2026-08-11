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
