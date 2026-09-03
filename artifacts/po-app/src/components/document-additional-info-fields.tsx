import { useRef, useState } from "react";
import { Control } from "react-hook-form";
import { Upload, X } from "lucide-react";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { processSignatureFile, SIGNATURE_FILE_ACCEPT } from "@/lib/signature-upload";

type DocumentAdditionalInfoFieldsProps = {
  control: Control<any>;
  signatureHint?: string;
};

export function DocumentAdditionalInfoFields({
  control,
  signatureHint = "Appears at the bottom of the PDF above the sign-off line.",
}: DocumentAdditionalInfoFieldsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
      <FormField control={control} name="customerNote" render={({ field }) => (
        <FormItem className="flex flex-col">
          <FormLabel>Customer Note</FormLabel>
          <FormControl>
            <Textarea
              value={field.value ?? ""}
              onChange={field.onChange}
              placeholder="Note for the customer..."
              rows={4}
              className="min-h-[96px] resize-y"
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )} />

      <FormField control={control} name="deliveryInstructions" render={({ field }) => (
        <FormItem className="flex flex-col">
          <FormLabel>Delivery Instructions</FormLabel>
          <FormControl>
            <Textarea
              value={field.value ?? ""}
              onChange={field.onChange}
              placeholder="Special instructions for delivery..."
              rows={4}
              className="min-h-[96px] resize-y"
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )} />

      <FormField control={control} name="termsAndConditions" render={({ field }) => (
        <FormItem className="flex flex-col">
          <FormLabel>Terms & Conditions</FormLabel>
          <FormControl>
            <Textarea
              value={field.value ?? ""}
              onChange={field.onChange}
              placeholder="Terms & conditions..."
              rows={4}
              className="min-h-[96px] resize-y"
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )} />

      <FormField control={control} name="authorisedSignature" render={({ field }) => {
        const inputRef = useRef<HTMLInputElement>(null);
        const [uploading, setUploading] = useState(false);

        const handleFile = async (file: File) => {
          setUploading(true);
          try {
            field.onChange(await processSignatureFile(file));
          } catch {
            // invalid type or read failure — ignore
          } finally {
            setUploading(false);
          }
        };

        return (
          <FormItem className="flex flex-col">
            <FormLabel>Authorised Signature</FormLabel>
            <FormControl>
              <div className="flex flex-col border rounded-lg p-3 bg-muted/10 min-h-[96px]">
                <div className="flex items-center gap-4 flex-1">
                  {field.value ? (
                    <div className="relative group border rounded overflow-hidden bg-white p-2">
                      <img src={field.value} alt="Authorised Signature" className="h-16 object-contain" />
                      <button
                        type="button"
                        onClick={() => field.onChange("")}
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
                <p className="text-[10px] text-muted-foreground mt-2">{signatureHint}</p>
              </div>
            </FormControl>
            <FormMessage />
          </FormItem>
        );
      }} />
    </div>
  );
}
