import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Printer, Sparkles } from "lucide-react";
import { EmailSendDialog, type EmailDocInfo } from "@/components/email-send-dialog";
import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

const AI_STEPS = [
  "Analyzing document structure...",
  "Computing layout geometry...",
  "Measuring column widths...",
  "Optimizing page distribution...",
  "Rendering typography...",
  "Applying smart pagination...",
  "Finalizing document...",
];

function AiPreloader() {
  const [stepIdx, setStepIdx] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setStepIdx(i => (i + 1) % AI_STEPS.length);
    }, 441);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center h-full gap-5">
      <div className="relative flex items-center justify-center">
        <div className="h-14 w-14 rounded-full border-[3px] border-primary/15 border-t-primary animate-spin" />
        <Sparkles className="absolute h-5 w-5 text-primary" />
      </div>
      <div className="text-center space-y-1.5">
        <p className="text-sm font-semibold text-foreground tracking-tight">AI Layout Engine</p>
        <p className="text-xs text-muted-foreground min-h-[16px] transition-all duration-300">
          {AI_STEPS[stepIdx]}
        </p>
      </div>
      <div className="flex gap-1.5">
        {AI_STEPS.map((_, i) => (
          <div
            key={i}
            className={`h-1 rounded-full transition-all duration-300 ${
              i <= stepIdx ? "w-5 bg-primary" : "w-2 bg-muted"
            }`}
          />
        ))}
      </div>
    </div>
  );
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
          await page.render({ canvasContext: ctx, viewport, canvas }).promise;
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
          <AiPreloader />
        </div>
      )}
      <div ref={containerRef} className="max-w-[820px] mx-auto" />
    </div>
  );
}

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
  onEmailSent?: (recipients: string[]) => void;
  poId?: number;
  docInfo?: EmailDocInfo;
  showEmail?: boolean;
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
  onEmailSent,
  poId,
  docInfo,
  showEmail = true,
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

  const handlePrint = () => {
    if (!pdfBase64) return;
    const binary = atob(pdfBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;width:0;height:0;border:none;opacity:0;";
    document.body.appendChild(iframe);
    iframe.src = url;
    iframe.onload = () => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => {
        document.body.removeChild(iframe);
        URL.revokeObjectURL(url);
      }, 60000);
    };
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
            <Button variant="outline" size="sm" className="gap-2" onClick={handlePrint} disabled={!pdfBase64}>
              <Printer className="h-4 w-4" />
              Print
            </Button>
            {showEmail && (
              <EmailSendDialog
                defaultTo={defaultEmailTo}
                defaultSubject={defaultEmailSubject}
                defaultBody={defaultEmailBody}
                pdfFilename={pdfFilename}
                generatePdf={() => generatePdf({ returnBase64: true }) as Promise<string>}
                triggerSize="sm"
                onSuccess={(recipients) => onEmailSent?.(recipients)}
                poId={poId}
                docInfo={docInfo}
              />
            )}
          </div>
        </DialogHeader>
        <div className="flex-1 overflow-hidden">
          {loading ? (
            <AiPreloader />
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
