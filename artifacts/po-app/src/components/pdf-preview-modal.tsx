import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Printer, Sparkles } from "lucide-react";
import { EmailSendDialog, type EmailDocInfo, type EmailPdfAttachment } from "@/components/email-send-dialog";
import { useAuth } from "@/contexts/auth-context";
import bizoneLogo from "@assets/bizone_logo_optimized.webp";
import bizoneSgLogo from "@assets/bizone_sg_optimized.webp";
import bizoneIndiaLogo from "@assets/bizone_india_optimized.webp";
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

function printingCaption(title: string) {
  const base = title
    .replace(/\s+[A-Z0-9][A-Z0-9./-]*$/i, "")
    .replace(/\s+preview$/i, "")
    .trim();
  if (/^(sales\s+)?invoice$/i.test(base)) return "Tax Invoice Printing";
  if (!base) return "Printing";
  return `${base} Printing`;
}

function PdfCanvasRenderer({ base64, title }: { base64: string; title: string }) {
  const { selectedCompany } = useAuth();
  const country = selectedCompany?.country?.toLowerCase();
  const logo = country === "singapore" || country === "sg"
    ? bizoneSgLogo
    : country === "india" || country === "in"
      ? bizoneIndiaLogo
      : bizoneLogo;
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
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-[#eef0f3]">
      <style>{`
        @keyframes bizone-paper-feed {
          from { transform: translateY(-105%); }
          to { transform: translateY(0); }
        }
        .bizone-printer-head {
          position: relative;
          z-index: 30;
          width: min(820px, calc(100% - 36px));
          height: 64px;
          margin: 0 auto;
          border-radius: 23px;
          background: linear-gradient(180deg, #ffffff 0%, #fbfbfc 58%, #e7ebf0 100%);
          box-shadow:
            0 12px 20px rgba(15, 23, 42, 0.14),
            inset 0 1px 0 #fff,
            inset 0 -3px 5px rgba(15, 23, 42, 0.06);
        }
        .bizone-printer-slot {
          position: absolute;
          z-index: 0;
          left: 50%;
          top: 0;
          width: min(760px, calc(100% - 64px));
          height: 10px;
          border-radius: 2px;
          transform: translateX(-50%);
          background: #151922;
        }
        .bizone-printer-tray {
          position: absolute;
          z-index: 0;
          left: 50%;
          top: 6px;
          width: min(790px, calc(100% - 48px));
          height: 22px;
          border-radius: 0 0 16px 16px;
          transform: translateX(-50%);
          background: linear-gradient(180deg, #f5f6f8 0%, #e3e6eb 100%);
          box-shadow: 0 8px 14px rgba(15, 23, 42, 0.08);
        }
        .bizone-paper-window {
          position: relative;
          z-index: 10;
          min-height: 0;
          flex: 1;
          margin-top: -16px;
          overflow: hidden;
        }
        .bizone-paper-sheet {
          width: min(660px, calc(100% - 120px));
          margin: 0 auto 28px;
          transform: translateY(-105%);
        }
        .bizone-paper-sheet.is-feeding {
          animation: bizone-paper-feed 1.8s linear forwards;
        }
      `}</style>
      <div className="relative z-30 shrink-0 px-4 pb-0 pt-4">
        <div className="bizone-printer-head flex items-center justify-between gap-3 px-5">
          <img src={logo} alt="BizOne" className="h-11 w-auto max-w-[210px] object-contain object-left" />
          <span className="truncate text-lg font-semibold tracking-wide text-[#2563EB]">{printingCaption(title)}</span>
        </div>
      </div>
      <div className="bizone-paper-window">
        <div className="bizone-printer-slot" aria-hidden="true" />
        <div className="bizone-printer-tray" aria-hidden="true" />
        {rendering && (
          <div className="absolute inset-0 z-20 flex items-center justify-center">
            <AiPreloader />
          </div>
        )}
        <div className="relative z-10 h-full overflow-x-hidden overflow-y-auto">
          <div
            ref={containerRef}
            className={`bizone-paper-sheet ${rendering ? "" : "is-feeding"}`}
          />
        </div>
      </div>
    </div>
  );
}

interface PdfPreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  generatePdf: (opts?: { returnBase64?: boolean }) => Promise<string | void>;
  pdfFilename: string;
  pdfFilenames?: string[];
  generateAttachments?: () => Promise<EmailPdfAttachment[]>;
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
  pdfFilenames,
  generateAttachments,
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
                pdfFilenames={pdfFilenames}
                generatePdf={() => generatePdf({ returnBase64: true }) as Promise<string>}
                generateAttachments={generateAttachments}
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
            <PdfCanvasRenderer base64={pdfBase64} title={title} />
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
