import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { EmailSendDialog } from "@/components/email-send-dialog";
import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

interface PdfPreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  generatePdf: (opts?: { returnBase64?: boolean }) => Promise<string | void>;
  pdfFilename: string;
  defaultEmailTo?: string;
  defaultEmailSubject?: string;
  defaultEmailBody?: string;
  onEdit?: () => void;
}

function PdfCanvasRenderer({ base64 }: { base64: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [rendering, setRendering] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

        const pdfDoc = await pdfjsLib.getDocument({ data: bytes }).promise;
        if (cancelled || !containerRef.current) return;

        const container = containerRef.current;
        container.innerHTML = "";

        for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
          if (cancelled) return;
          const page = await pdfDoc.getPage(pageNum);
          const viewport = page.getViewport({ scale: 1.5 });

          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.display = "block";
          canvas.style.width = "100%";
          canvas.style.marginBottom = "12px";
          canvas.style.boxShadow = "0 1px 4px rgba(0,0,0,0.15)";
          canvas.style.backgroundColor = "white";

          container.appendChild(canvas);

          const ctx = canvas.getContext("2d")!;
          await page.render({ canvasContext: ctx, viewport }).promise;
          if (cancelled) return;
        }
      } catch (e) {
        console.error("PDF render failed", e);
      } finally {
        if (!cancelled) setRendering(false);
      }
    })();

    return () => { cancelled = true; };
  }, [base64]);

  return (
    <div className="relative w-full h-full overflow-y-auto bg-muted/40 p-4">
      {rendering && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/40 z-10">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}
      <div ref={containerRef} className="max-w-[820px] mx-auto" />
    </div>
  );
}

export function PdfPreviewModal({
  open,
  onOpenChange,
  title,
  generatePdf,
  pdfFilename,
  defaultEmailTo = "",
  defaultEmailSubject = "",
  defaultEmailBody = "",
  onEdit,
}: PdfPreviewModalProps) {
  const [pdfBase64, setPdfBase64] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setPdfBase64(null);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const base64 = await generatePdf({ returnBase64: true });
        if (cancelled) return;
        if (typeof base64 === "string" && base64.length > 100) {
          setPdfBase64(base64);
        }
      } catch (e) {
        console.error("PDF generation failed", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [open]);

  const handleDownload = async () => {
    try {
      await generatePdf();
    } catch (e) {
      console.error("Download failed", e);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-full h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b flex-row items-center justify-between space-y-0">
          <DialogTitle className="text-base font-semibold">{title}</DialogTitle>
          <div className="flex items-center gap-2 pr-8">
            {onEdit && (
              <Button variant="outline" size="sm" onClick={onEdit}>
                Edit
              </Button>
            )}
            <Button variant="outline" size="sm" className="gap-2" onClick={handleDownload}>
              <Download className="h-4 w-4" />
              Download
            </Button>
            <EmailSendDialog
              defaultTo={defaultEmailTo}
              defaultSubject={defaultEmailSubject}
              defaultBody={defaultEmailBody}
              pdfFilename={pdfFilename}
              generatePdf={() => generatePdf({ returnBase64: true }) as Promise<string>}
              triggerSize="sm"
            />
          </div>
        </DialogHeader>
        <div className="flex-1 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : pdfBase64 ? (
            <PdfCanvasRenderer base64={pdfBase64} />
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              PDF preview not available. Use the Download button above.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
