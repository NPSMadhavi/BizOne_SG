import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Eye, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { formatViewDate } from "@/operations-8june/components/ui/entity-view-dialog";
import type { EmployeeDocument } from "@shared/schema";

const DOCUMENT_LABELS: Record<string, string> = {
  passport: "Passport",
  visa: "Visa",
  contract: "Contract",
  certification: "Certification",
  warranty: "Warranty",
  purchase_order: "Purchase order",
  other: "Other",
};

function fileSource(value: string, href?: string): string {
  if (value.startsWith("data:")) return value;
  return href || "";
}

function fileCaption(value: string, pickedName?: string): string {
  if (pickedName) return pickedName;
  if (value.includes("/")) return value.split("/").pop() || "Uploaded file";
  if (value.startsWith("data:application/pdf")) return "PDF uploaded";
  if (value.startsWith("data:image")) return "Image uploaded";
  return "File uploaded";
}

function dataUrlToObjectUrl(dataUrl: string): { url: string; kind: "image" | "pdf" | "other" } {
  const comma = dataUrl.indexOf(",");
  const header = comma >= 0 ? dataUrl.slice(0, comma) : dataUrl;
  const mime = header.match(/data:([^;,]+)/i)?.[1] || "application/octet-stream";
  const kind: "image" | "pdf" | "other" = mime.startsWith("image/")
    ? "image"
    : mime === "application/pdf"
      ? "pdf"
      : "other";

  // Images can render from data URLs directly; PDFs are more reliable as blob URLs
  if (kind === "image") {
    return { url: dataUrl, kind };
  }

  const payload = comma >= 0 ? dataUrl.slice(comma + 1) : "";
  const isBase64 = /;base64/i.test(header);
  const binary = isBase64 ? atob(payload) : decodeURIComponent(payload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: mime });
  return { url: URL.createObjectURL(blob), kind };
}

function FilePreviewDialog({
  source,
  title,
  onClose,
}: {
  source: string | null;
  title: string;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [url, setUrl] = useState<string | null>(null);
  const [kind, setKind] = useState<"image" | "pdf" | "other">("other");

  useEffect(() => {
    if (!source) {
      setUrl(null);
      return;
    }
    let objectUrl: string | null = null;
    let cancelled = false;
    void (async () => {
      try {
        if (source.startsWith("data:")) {
          const result = dataUrlToObjectUrl(source);
          if (cancelled) {
            if (result.url.startsWith("blob:")) URL.revokeObjectURL(result.url);
            return;
          }
          if (result.url.startsWith("blob:")) objectUrl = result.url;
          setUrl(result.url);
          setKind(result.kind);
          return;
        }
        const response = await fetch(source, { credentials: "include" });
        if (!response.ok) throw new Error("Could not open file");
        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        setUrl(objectUrl);
        setKind(
          blob.type.startsWith("image/")
            ? "image"
            : blob.type === "application/pdf"
              ? "pdf"
              : "other",
        );
      } catch {
        if (!cancelled) {
          toast({ title: "Could not open file", variant: "destructive" });
          onCloseRef.current();
        }
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [source, toast]);

  return (
    <Dialog open={Boolean(source)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {url && kind === "image" ? (
          <img src={url} alt="" className="max-h-[70vh] w-full object-contain" />
        ) : null}
        {url && kind === "pdf" ? (
          <iframe title={title} src={url} className="h-[70vh] w-full rounded border" />
        ) : null}
        {url && kind === "other" ? (
          <a href={url} download className="text-sm font-medium text-[#2563EB] underline">
            Download file
          </a>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function StoredImage({ source }: { source: string }) {
  const [preview, setPreview] = useState<string | null>(
    source.startsWith("data:image") ? source : null,
  );

  useEffect(() => {
    if (source.startsWith("data:")) {
      setPreview(source.startsWith("data:image") ? source : null);
      return;
    }
    let objectUrl: string | null = null;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(source, { credentials: "include" });
        if (!response.ok) return;
        const blob = await response.blob();
        if (!blob.type.startsWith("image/")) return;
        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) setPreview(objectUrl);
      } catch {
        /* preview is optional */
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [source]);

  if (!preview) return null;
  return (
    <img
      src={preview}
      alt=""
      className="mt-2 max-h-28 rounded border border-[#E5E7EB] object-contain"
    />
  );
}

export function EmployeeScanFile({
  value,
  pickedName,
  href,
  onRemove,
}: {
  value?: string | null;
  pickedName?: string;
  href?: string;
  onRemove?: () => void;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  if (!value) return null;
  const source = fileSource(value, href);
  return (
    <div>
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-xs text-green-600">
          {fileCaption(value, pickedName)}
        </p>
        {source ? (
          <button
            type="button"
            title="View"
            aria-label="View file"
            className="shrink-0 rounded p-1 text-[#2563EB] transition-colors hover:bg-[#EFF6FF]"
            onClick={() => setPreviewOpen(true)}
          >
            <Eye className="h-4 w-4" />
          </button>
        ) : null}
        {onRemove ? (
          <button
            type="button"
            title="Delete"
            aria-label="Delete file"
            className="shrink-0 rounded p-1 text-[#6B7280] transition-colors hover:bg-[#FEF2F2] hover:text-[#DC2626]"
            onClick={onRemove}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        ) : null}
      </div>
      {source ? <StoredImage source={source} /> : null}
      {source ? (
        <FilePreviewDialog
          source={previewOpen ? source : null}
          title={fileCaption(value, pickedName)}
          onClose={() => setPreviewOpen(false)}
        />
      ) : null}
    </div>
  );
}

export function EmployeeUploadedDocuments({ employeeId }: { employeeId: number }) {
  const [preview, setPreview] = useState<{ source: string; title: string } | null>(null);
  const { data: documents = [] } = useQuery<EmployeeDocument[]>({
    queryKey: ["/api/employees", employeeId, "documents"],
    enabled: Number.isFinite(employeeId),
  });

  if (documents.length === 0) return null;

  return (
    <div className="space-y-2 sm:col-span-2">
      <p className="text-sm font-medium text-[#111827]">Uploaded documents</p>
      <div className="space-y-2">
        {documents.map((document) => {
          const label = DOCUMENT_LABELS[document.documentType] || document.documentType;
          const filename = document.filePath?.split("/").pop() || "Document";
          const dates = [
            document.issueDate ? `Issued ${formatViewDate(document.issueDate)}` : "",
            document.expiryDate ? `Expires ${formatViewDate(document.expiryDate)}` : "",
          ].filter(Boolean);
          return (
            <div
              key={document.id}
              className="flex items-center justify-between gap-3 rounded-md border border-[#E5E7EB] px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-[#111827]">{label}</p>
                <p className="truncate text-xs text-[#6B7280]">{filename}</p>
                {dates.length > 0 ? (
                  <p className="text-xs text-[#6B7280]">{dates.join(" · ")}</p>
                ) : null}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() =>
                  setPreview({
                    source: `/api/documents/${document.id}/file`,
                    title: label,
                  })
                }
              >
                <Eye className="mr-1 h-4 w-4" />
                View
              </Button>
            </div>
          );
        })}
      </div>
      <FilePreviewDialog
        source={preview?.source ?? null}
        title={preview?.title ?? "Document"}
        onClose={() => setPreview(null)}
      />
    </div>
  );
}
