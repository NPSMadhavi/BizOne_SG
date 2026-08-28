import { useRef } from "react";
import { Control } from "react-hook-form";
import { Upload, X } from "lucide-react";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

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
        const handleFile = (file: File) => {
          const reader = new FileReader();
          reader.onload = async (e) => {
            const src = e.target?.result as string;
            if (src) {
              const img = document.createElement("img");
              img.onload = () => {
                const canvas = document.createElement("canvas");
                let w = img.width, h = img.height;
                const maxW = 300, maxH = 100;
                if (w > maxW || h > maxH) {
                  const r = Math.min(maxW / w, maxH / h);
                  w = Math.round(w * r); h = Math.round(h * r);
                }
                canvas.width = w; canvas.height = h;
                canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
                field.onChange(canvas.toDataURL("image/png"));
              };
              img.src = src;
            }
          };
          reader.readAsDataURL(file);
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
                    >
                      <Upload className="h-4 w-4" /> Upload Signature Image
                    </Button>
                  )}
                  <input
                    ref={inputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFile(f);
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
