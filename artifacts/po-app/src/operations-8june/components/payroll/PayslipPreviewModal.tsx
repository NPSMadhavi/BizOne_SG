import { useRef } from "react";
import { Download, Printer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";

type PayslipPreviewModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  html: string | null;
  pdfUrl?: string | null;
  isDownloading?: boolean;
  onDownload?: () => void;
};

export default function PayslipPreviewModal({
  open,
  onOpenChange,
  title,
  html,
  pdfUrl = null,
  isDownloading = false,
  onDownload,
}: PayslipPreviewModalProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const hasPreview = Boolean(html || pdfUrl);

  const handlePrint = () => {
    const frame = iframeRef.current;
    if (!frame?.contentWindow) return;
    frame.contentWindow.focus();
    frame.contentWindow.print();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="fixed left-1/2 top-1/2 z-50 flex h-[92vh] w-[min(920px,96vw)] max-w-none translate-x-[-50%] translate-y-[-50%] flex-col gap-0 overflow-hidden border bg-background p-0 shadow-2xl [&>button]:hidden"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <div className="flex shrink-0 items-center justify-between gap-4 border-b bg-background px-5 py-3">
          <h2 className="truncate text-base font-semibold text-foreground">{title}</h2>
          <div className="flex shrink-0 items-center gap-2">
            {onDownload && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onDownload}
                disabled={isDownloading || !hasPreview}
              >
                <Download className="mr-2 h-4 w-4" />
                {isDownloading ? "Downloading..." : "Download"}
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handlePrint}
              disabled={!hasPreview}
            >
              <Printer className="mr-2 h-4 w-4" />
              Print
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => onOpenChange(false)}
              aria-label="Close payslip preview"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-muted/50 p-4 sm:p-8">
          <div className="mx-auto flex justify-center">
            {html ? (
              <div className="bg-white shadow-xl ring-1 ring-black/5">
                <iframe
                  ref={iframeRef}
                  title="Payslip preview"
                  srcDoc={html}
                  className="block border-0 bg-white"
                  style={{
                    width: "210mm",
                    height: "297mm",
                    minHeight: "297mm",
                  }}
                />
              </div>
            ) : pdfUrl ? (
              <div className="bg-white shadow-xl ring-1 ring-black/5">
                <iframe
                  ref={iframeRef}
                  title="Payslip preview"
                  src={pdfUrl}
                  className="block border-0 bg-white"
                  style={{
                    width: "210mm",
                    height: "297mm",
                    minHeight: "297mm",
                  }}
                />
              </div>
            ) : (
              <div className="flex min-h-[297mm] w-full max-w-[210mm] items-center justify-center bg-white text-sm text-muted-foreground shadow-xl">
                Loading payslip...
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
