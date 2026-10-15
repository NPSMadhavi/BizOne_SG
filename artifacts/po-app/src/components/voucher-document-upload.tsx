import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { EmployeeScanFile } from "@/operations-8june/components/employees/EmployeeFiles";

export type VoucherAttachmentPayload = {
  attachmentData?: string | null;
  attachmentName?: string | null;
  attachmentRemoved?: boolean;
};

export function useVoucherAttachment(options?: {
  storedPath?: string | null;
  storedName?: string | null;
  viewHref?: string;
}) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileData, setFileData] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [removed, setRemoved] = useState(false);

  const showingNew = !!fileData;
  const showingStored = !removed && !fileData && !!options?.storedPath;
  const value = showingNew ? fileData : showingStored ? options?.storedPath : "";
  const name = showingNew
    ? fileName
    : showingStored
      ? options?.storedName || options?.storedPath?.split("/").pop() || "Uploaded file"
      : "";

  const payload: VoucherAttachmentPayload = showingNew
    ? { attachmentData: fileData, attachmentName: fileName, attachmentRemoved: false }
    : removed
      ? { attachmentRemoved: true, attachmentData: null, attachmentName: null }
      : {};

  function onPick(file: File | undefined) {
    if (!file) return;
    const allowed = ["application/pdf", "image/jpeg", "image/png"];
    if (!allowed.includes(file.type)) {
      toast({ title: "Upload PDF, JPG, or PNG", variant: "destructive" });
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast({ title: "File must be 8 MB or smaller", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      if (!result.startsWith("data:")) return;
      setFileData(result);
      setFileName(file.name);
      setRemoved(false);
    };
    reader.readAsDataURL(file);
  }

  const node = (
    <div className="rounded-xl border bg-card px-6 py-4">
      <p className="mb-2 text-sm font-medium text-[#111827]">Upload document</p>
      <div className="grid grid-cols-1 gap-x-6 md:grid-cols-2 lg:grid-cols-3">
        <div className="flex flex-col gap-2">
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png"
          className="hidden"
          onChange={(event) => {
            onPick(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => inputRef.current?.click()}
          className="w-full border-[#E5E7EB] text-[#111827]"
        >
          <Upload className="mr-2 h-4 w-4" />
          Upload
        </Button>
        <EmployeeScanFile
          value={value || undefined}
          pickedName={name || undefined}
          href={!showingNew && showingStored ? options?.viewHref : undefined}
          onRemove={() => {
            setFileData(null);
            setFileName("");
            setRemoved(true);
          }}
        />
        </div>
      </div>
    </div>
  );

  return { node, payload };
}
