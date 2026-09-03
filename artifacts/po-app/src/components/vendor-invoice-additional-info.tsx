import { useRef, useState } from "react";
import { Upload, X } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { processSignatureFile, SIGNATURE_FILE_ACCEPT } from "@/lib/signature-upload";

interface Props {
  customerNote: string;
  onCustomerNoteChange: (v: string) => void;
  deliveryInstructions: string;
  onDeliveryInstructionsChange: (v: string) => void;
  termsAndConditions: string;
  onTermsAndConditionsChange: (v: string) => void;
  authorisedSignature: string;
  onAuthorisedSignatureChange: (v: string) => void;
}

export function VendorInvoiceAdditionalInfo({
  customerNote,
  onCustomerNoteChange,
  deliveryInstructions,
  onDeliveryInstructionsChange,
  termsAndConditions,
  onTermsAndConditionsChange,
  authorisedSignature,
  onAuthorisedSignatureChange,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      onAuthorisedSignatureChange(await processSignatureFile(file));
    } catch {
      /* ignore */
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
        <div className="space-y-1.5 flex flex-col">
          <Label>Customer Note</Label>
          <Textarea
            value={customerNote}
            onChange={(e) => onCustomerNoteChange(e.target.value)}
            placeholder="Note for the customer..."
            rows={4}
            className="min-h-[96px] resize-y"
          />
        </div>
        <div className="space-y-1.5 flex flex-col">
          <Label>Delivery Instructions</Label>
          <Textarea
            value={deliveryInstructions}
            onChange={(e) => onDeliveryInstructionsChange(e.target.value)}
            placeholder="Special instructions for delivery..."
            rows={4}
            className="min-h-[96px] resize-y"
          />
        </div>
        <div className="space-y-1.5 flex flex-col">
          <Label>Terms & Conditions</Label>
          <Textarea
            value={termsAndConditions}
            onChange={(e) => onTermsAndConditionsChange(e.target.value)}
            placeholder="Terms & conditions..."
            rows={4}
            className="min-h-[96px] resize-y"
          />
        </div>
        <div className="space-y-1.5 flex flex-col">
          <Label>Authorised Signature</Label>
          <div className="flex flex-col border rounded-lg p-3 bg-muted/10 min-h-[96px]">
            <div className="flex items-center gap-4 flex-1">
              {authorisedSignature ? (
                <div className="relative group border rounded overflow-hidden bg-white p-2">
                  <img src={authorisedSignature} alt="Authorised Signature" className="h-16 object-contain" />
                  <button
                    type="button"
                    onClick={() => onAuthorisedSignatureChange("")}
                    className="absolute top-1 right-1 bg-black/50 rounded-full p-1 hover:bg-black/70 transition-colors"
                  >
                    <X className="h-3 w-3 text-white" />
                  </button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => inputRef.current?.click()}
                  className="gap-2 text-xs"
                  disabled={uploading}
                >
                  <Upload className="h-4 w-4" /> {uploading ? "Uploading..." : "Upload Signature"}
                </Button>
              )}
              <input
                ref={inputRef}
                type="file"
                accept={SIGNATURE_FILE_ACCEPT}
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleFile(f);
                  e.target.value = "";
                }}
              />
            </div>
            <p className="text-[10px] text-muted-foreground mt-2">Appears at the bottom of the PDF above the sign-off line.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
