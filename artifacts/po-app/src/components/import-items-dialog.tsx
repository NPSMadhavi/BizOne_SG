import { useRef, useState, useCallback } from "react";
import { Upload, FileSpreadsheet, FileText, AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  parseExcel,
  parsePdf,
  applyColumnMap,
  buildColumnMap,
  type ImportedItem,
  type ColumnField,
  type ColumnMap,
  type ParseResult,
} from "@/lib/import-items";

interface Props {
  open: boolean;
  onClose: () => void;
  onImport: (items: ImportedItem[]) => void;
}

type Stage = "upload" | "parsing" | "preview";

const FIELD_OPTIONS: { value: ColumnField; label: string }[] = [
  { value: "ignore", label: "— Ignore —" },
  { value: "partNumber", label: "Part Number" },
  { value: "description", label: "Description" },
  { value: "qty", label: "Qty" },
  { value: "unitPrice", label: "Unit Price" },
  { value: "uom", label: "UOM" },
];

export function ImportItemsDialog({ open, onClose, onImport }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>("upload");
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState("");
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [columnMap, setColumnMap] = useState<ColumnMap>({});
  const [error, setError] = useState("");

  const reset = () => {
    setStage("upload");
    setFileName("");
    setParseResult(null);
    setColumnMap({});
    setError("");
  };

  const handleFile = useCallback(async (file: File) => {
    setFileName(file.name);
    setError("");
    setStage("parsing");
    try {
      let result: ParseResult;
      const lower = file.name.toLowerCase();
      if (lower.endsWith(".pdf")) {
        result = await parsePdf(file);
      } else if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
        result = await parseExcel(file);
      } else {
        setError("Unsupported file type. Please upload a PDF, XLSX, or XLS file.");
        setStage("upload");
        return;
      }
      setParseResult(result);
      setColumnMap(result.columnMap);
      setStage("preview");
    } catch (e: any) {
      setError(e?.message || "Failed to parse file. Please try another file.");
      setStage("upload");
    }
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const previewItems = parseResult
    ? applyColumnMap(parseResult.rawRows, columnMap)
    : [];

  const handleImport = () => {
    onImport(previewItems);
    reset();
    onClose();
  };

  const updateColMap = (colIdx: number, field: ColumnField) => {
    setColumnMap((prev) => {
      const next = { ...prev };
      // Unset any other column already using this field (avoid duplicates)
      if (field !== "ignore") {
        for (const k of Object.keys(next)) {
          if (next[Number(k)] === field) next[Number(k)] = "ignore";
        }
      }
      next[colIdx] = field;
      return next;
    });
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary" />
            Import Line Items
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-2">
          {/* ── Stage: Upload ── */}
          {stage === "upload" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Upload a supplier quote in <strong>PDF</strong> or <strong>Excel (.xlsx / .xls)</strong> format.
                The system will extract Part Number, Description, Qty, and Unit Price.
              </p>
              <div
                className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors
                  ${dragging ? "border-primary bg-primary/5" : "border-muted-foreground/30 hover:border-primary/60 hover:bg-muted/40"}`}
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
              >
                <div className="flex justify-center gap-3 mb-3 text-muted-foreground">
                  <FileText className="h-8 w-8" />
                  <FileSpreadsheet className="h-8 w-8" />
                </div>
                <p className="text-sm font-medium">Drop file here or click to browse</p>
                <p className="text-xs text-muted-foreground mt-1">Supports: PDF, XLSX, XLS</p>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.xlsx,.xls"
                  className="hidden"
                  onChange={handleInputChange}
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-md p-3">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}

              <div className="text-xs text-muted-foreground bg-amber-50 border border-amber-200 rounded-md p-3">
                <strong>PDF note:</strong> Works best with text-based PDFs (not scanned images). Column detection is automatic but you can adjust the mapping after upload.
              </div>
            </div>
          )}

          {/* ── Stage: Parsing ── */}
          {stage === "parsing" && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <RefreshCw className="h-8 w-8 text-primary animate-spin" />
              <p className="text-sm text-muted-foreground">Parsing <strong>{fileName}</strong>…</p>
            </div>
          )}

          {/* ── Stage: Preview ── */}
          {stage === "preview" && parseResult && (
            <div className="space-y-4">
              {/* File info + re-upload */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  {fileName.toLowerCase().endsWith(".pdf")
                    ? <FileText className="h-4 w-4" />
                    : <FileSpreadsheet className="h-4 w-4" />}
                  <span className="font-medium text-foreground">{fileName}</span>
                  <Badge variant="secondary">{previewItems.length} item{previewItems.length !== 1 ? "s" : ""} detected</Badge>
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={reset} className="gap-1.5 text-xs">
                  <Upload className="h-3.5 w-3.5" /> Change file
                </Button>
              </div>

              {/* Warnings */}
              {parseResult.warnings.length > 0 && (
                <div className="space-y-1.5">
                  {parseResult.warnings.map((w, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-3">
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                      {w}
                    </div>
                  ))}
                </div>
              )}

              {/* Column mapping */}
              {parseResult.rawHeaders.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Column Mapping</p>
                  <div className="flex flex-wrap gap-3 p-3 bg-muted/30 rounded-md border">
                    {parseResult.rawHeaders.map((h, i) => (
                      <div key={i} className="flex flex-col gap-1 min-w-[130px]">
                        <span className="text-xs text-muted-foreground truncate max-w-[160px]" title={h}>{h || `Col ${i + 1}`}</span>
                        <Select
                          value={columnMap[i] ?? "ignore"}
                          onValueChange={(v) => updateColMap(i, v as ColumnField)}
                        >
                          <SelectTrigger className="h-7 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {FIELD_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value} className="text-xs">
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Preview table */}
              {previewItems.length > 0 ? (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                    Preview (first {Math.min(previewItems.length, 10)} of {previewItems.length})
                  </p>
                  <div className="overflow-x-auto rounded-md border">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-muted/60 border-b">
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground w-8">#</th>
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground">Part Number</th>
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground">Description</th>
                          <th className="px-3 py-2 text-right font-medium text-muted-foreground w-16">Qty</th>
                          <th className="px-3 py-2 text-right font-medium text-muted-foreground w-24">Unit Price</th>
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground w-16">UOM</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewItems.slice(0, 10).map((item, i) => (
                          <tr key={i} className="border-b last:border-0 hover:bg-muted/20">
                            <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                            <td className="px-3 py-2 font-mono text-muted-foreground max-w-[100px] truncate">{item.partNumber || "—"}</td>
                            <td className="px-3 py-2 max-w-[260px] truncate" title={item.description}>{item.description || "—"}</td>
                            <td className="px-3 py-2 text-right">{item.qty}</td>
                            <td className="px-3 py-2 text-right">{item.unitPrice.toFixed(2)}</td>
                            <td className="px-3 py-2 text-muted-foreground">{item.uom || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {previewItems.length > 10 && (
                    <p className="text-xs text-muted-foreground mt-1.5 text-right">
                      + {previewItems.length - 10} more items will also be imported
                    </p>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-2 border rounded-md bg-muted/20">
                  <AlertTriangle className="h-6 w-6 text-amber-500" />
                  <p className="text-sm">No items detected with current mapping. Try adjusting the column mapping above.</p>
                </div>
              )}

              {previewItems.length > 0 && (
                <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md p-3">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  {previewItems.length} item{previewItems.length !== 1 ? "s" : ""} ready to import. They will be <strong>appended</strong> after any existing line items.
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="border-t pt-4">
          <Button type="button" variant="outline" onClick={handleClose}>Cancel</Button>
          {stage === "preview" && (
            <Button
              type="button"
              disabled={previewItems.length === 0}
              onClick={handleImport}
              className="gap-2"
            >
              <CheckCircle2 className="h-4 w-4" />
              Import {previewItems.length} Item{previewItems.length !== 1 ? "s" : ""}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
