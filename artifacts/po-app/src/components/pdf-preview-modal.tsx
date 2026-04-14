import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Mail, Loader2, X } from "lucide-react";
import { EmailSendDialog } from "@/components/email-send-dialog";

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
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
        setPdfUrl(null);
      }
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const result = await generatePdf({ returnBase64: false });
        if (cancelled) return;
        if (typeof result === "string" && result.length > 200) {
          const binary = atob(result);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          const blob = new Blob([bytes], { type: "application/pdf" });
          setPdfUrl(URL.createObjectURL(blob));
        }
      } catch (e) {
        console.error("PDF preview failed", e);
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
        <div className="flex-1 overflow-hidden bg-muted/30">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : pdfUrl ? (
            <iframe
              src={`${pdfUrl}#toolbar=0&navpanes=0`}
              className="w-full h-full border-0"
              title={title}
            />
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
