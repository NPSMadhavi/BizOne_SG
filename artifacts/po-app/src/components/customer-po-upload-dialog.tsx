import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Upload, FileText, Loader2, CheckCircle2, AlertCircle, Pencil, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ExtractedPoData {
  items: Array<{
    partNumber: string;
    description: string;
    qty: number;
    uom: string;
    unitPrice: number;
  }>;
}

interface CustomerPoUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (data: ExtractedPoData) => void;
}

type Step = "upload" | "extracting" | "preview" | "error";

export function CustomerPoUploadDialog({ open, onOpenChange, onApply }: CustomerPoUploadDialogProps) {
  const [step, setStep] = useState<Step>("upload");
  const [errorMsg, setErrorMsg] = useState("");
  const [extracted, setExtracted] = useState<ExtractedPoData | null>(null);
  const [fileName, setFileName] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setStep("upload");
    setErrorMsg("");
    setExtracted(null);
    setFileName("");
  }

  function handleClose(v: boolean) {
    if (!v) reset();
    onOpenChange(v);
  }

  async function processFile(file: File) {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setErrorMsg("Please upload a PDF file.");
      setStep("error");
      return;
    }
    setFileName(file.name);
    setStep("extracting");

    const form = new FormData();
    form.append("file", file);

    try {
      const res = await fetch("/api/invoices/extract-po", {
        method: "POST",
        credentials: "include",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || "Extraction failed. Please try again.");
        setStep("error");
        return;
      }
      setExtracted(data as ExtractedPoData);
      setStep("preview");
    } catch {
      setErrorMsg("Network error. Please check your connection and try again.");
      setStep("error");
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = "";
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  }

  function handleApply() {
    if (!extracted) return;
    onApply(extracted);
    handleClose(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Import from Customer PO
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          {/* ── UPLOAD STEP ─────────────────────────────────────────── */}
          {step === "upload" && (
            <div className="space-y-4 py-2">
              <p className="text-sm text-muted-foreground">
                Upload the customer's Purchase Order PDF. AI will extract the line items — you'll get a chance to review before applying.
              </p>
              <div
                className={cn(
                  "border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors",
                  isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30"
                )}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
                <p className="font-medium text-sm">Drop PDF here or click to browse</p>
                <p className="text-xs text-muted-foreground mt-1">Supports text-based PDFs up to 20 MB</p>
              </div>
              <input ref={fileInputRef} type="file" accept=".pdf" className="hidden" onChange={handleFileChange} />
            </div>
          )}

          {/* ── EXTRACTING STEP ─────────────────────────────────────── */}
          {step === "extracting" && (
            <div className="flex flex-col items-center justify-center gap-4 py-16">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <div className="text-center">
                <p className="font-semibold">Extracting data from PDF…</p>
                <p className="text-sm text-muted-foreground mt-1 truncate max-w-xs">{fileName}</p>
              </div>
              <p className="text-xs text-muted-foreground">This usually takes 5–15 seconds</p>
            </div>
          )}

          {/* ── ERROR STEP ──────────────────────────────────────────── */}
          {step === "error" && (
            <div className="flex flex-col items-center justify-center gap-4 py-12">
              <AlertCircle className="h-10 w-10 text-destructive" />
              <div className="text-center">
                <p className="font-semibold">Extraction failed</p>
                <p className="text-sm text-muted-foreground mt-1 max-w-sm">{errorMsg}</p>
              </div>
              <Button variant="outline" onClick={reset}>Try Again</Button>
            </div>
          )}

          {/* ── PREVIEW STEP ────────────────────────────────────────── */}
          {step === "preview" && extracted && (
            <div className="space-y-5 py-2">
              <div className="flex items-center gap-2 text-sm text-emerald-600 font-medium">
                <CheckCircle2 className="h-4 w-4" />
                Extracted successfully from <span className="text-muted-foreground font-normal">{fileName}</span>
              </div>

              {/* Line items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Line Items ({extracted.items.length})
                  </p>
                </div>
                <div className="rounded-lg border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/40">
                      <tr>
                        <th className="px-3 py-2 text-left w-6 text-muted-foreground font-medium">#</th>
                        <th className="px-3 py-2 text-left w-24 text-muted-foreground font-medium">Part No.</th>
                        <th className="px-3 py-2 text-left text-muted-foreground font-medium">Description</th>
                        <th className="px-3 py-2 text-right w-14 text-muted-foreground font-medium">Qty</th>
                        <th className="px-3 py-2 text-center w-14 text-muted-foreground font-medium">UOM</th>
                        <th className="px-3 py-2 text-right w-20 text-muted-foreground font-medium">Unit Price</th>
                        <th className="px-3 py-2 w-6"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {extracted.items.map((item, i) => (
                        <tr key={i} className="border-t hover:bg-muted/10">
                          <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                          <td className="px-3 py-2 font-mono">
                            <EditableField value={item.partNumber} onChange={v => setExtracted(p => p ? { ...p, items: p.items.map((it, idx) => idx === i ? { ...it, partNumber: v } : it) } : p)} />
                          </td>
                          <td className="px-3 py-2">
                            <EditableField value={item.description} onChange={v => setExtracted(p => p ? { ...p, items: p.items.map((it, idx) => idx === i ? { ...it, description: v } : it) } : p)} />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <EditableField value={String(item.qty)} onChange={v => setExtracted(p => p ? { ...p, items: p.items.map((it, idx) => idx === i ? { ...it, qty: parseFloat(v) || 1 } : it) } : p)} align="right" />
                          </td>
                          <td className="px-3 py-2 text-center">
                            <EditableField value={item.uom} onChange={v => setExtracted(p => p ? { ...p, items: p.items.map((it, idx) => idx === i ? { ...it, uom: v } : it) } : p)} align="center" />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <EditableField value={String(item.unitPrice)} onChange={v => setExtracted(p => p ? { ...p, items: p.items.map((it, idx) => idx === i ? { ...it, unitPrice: parseFloat(v) || 0 } : it) } : p)} align="right" />
                          </td>
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              className="text-muted-foreground hover:text-destructive transition-colors"
                              onClick={() => setExtracted(p => p ? { ...p, items: p.items.filter((_, idx) => idx !== i) } : p)}
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                      {extracted.items.length === 0 && (
                        <tr><td colSpan={7} className="px-3 py-4 text-center text-muted-foreground">No items extracted</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                  <Pencil className="h-3 w-3" /> Click any value to edit before applying
                </p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="pt-3 border-t">
          {step === "preview" && (
            <>
              <Button variant="outline" onClick={reset}>Upload Different File</Button>
              <Button onClick={handleApply} disabled={!extracted || extracted.items.length === 0} className="gap-2">
                <CheckCircle2 className="h-4 w-4" />
                Apply to Invoice ({extracted?.items.length ?? 0} items)
              </Button>
            </>
          )}
          {step === "upload" && (
            <Button variant="outline" onClick={() => handleClose(false)}>Cancel</Button>
          )}
          {step === "error" && (
            <Button variant="outline" onClick={() => handleClose(false)}>Close</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface EditableFieldProps {
  value: string;
  onChange: (v: string) => void;
  align?: "left" | "right" | "center";
  multiline?: boolean;
}

function EditableField({ value, onChange, align = "left", multiline = false }: EditableFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  function commit() {
    onChange(draft);
    setEditing(false);
  }

  if (!editing) {
    return (
      <span
        className={cn(
          "cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5 -mx-1 transition-colors block",
          align === "right" && "text-right",
          align === "center" && "text-center",
          !value && "text-muted-foreground italic"
        )}
        onClick={() => { setDraft(value); setEditing(true); }}
      >
        {value || "—"}
      </span>
    );
  }

  if (multiline) {
    return (
      <textarea
        autoFocus
        className="w-full text-xs border rounded px-1.5 py-1 resize-none focus:outline-none focus:ring-1 focus:ring-primary"
        rows={3}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === "Escape") { setDraft(value); setEditing(false); } }}
      />
    );
  }

  return (
    <input
      autoFocus
      className={cn(
        "w-full text-xs border rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary",
        align === "right" && "text-right",
        align === "center" && "text-center"
      )}
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setDraft(value); setEditing(false); } }}
    />
  );
}
