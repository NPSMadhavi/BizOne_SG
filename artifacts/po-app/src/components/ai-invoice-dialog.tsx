import { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Loader2, RefreshCw, CheckCircle2, AlertCircle, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AiGeneratedInvoice {
  customerName: string;
  customerAddress: string;
  customerContact: string;
  customerContactEmail: string;
  currency: string;
  paymentTerms: string;
  notes: string;
  discountAmount: number;
  items: Array<{
    description: string;
    qty: number;
    unitPrice: number;
    uom: string;
    partNumber: string;
  }>;
}

interface AiInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (data: AiGeneratedInvoice) => void;
}

type Step = "prompt" | "generating" | "preview" | "error";

function fmtAmt(currency: string, amount: number) {
  return new Intl.NumberFormat("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
}

function extractJson(raw: string): AiGeneratedInvoice | null {
  try {
    const clean = raw.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
    return JSON.parse(clean);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) {
      try { return JSON.parse(m[0]); } catch { return null; }
    }
    return null;
  }
}

const EXAMPLES = [
  "Invoice SP Sysnet for 3 days emergency IT support at $3,500/day. Payment 30 days.",
  "Create an invoice for Nexalab Pte Ltd for 10 units of Dell Latitude 5540 laptop at SGD 2,200 each.",
  "Invoice Acme Corp USD 8,500 for cloud infrastructure setup and 6 months managed services.",
];

export function AiInvoiceDialog({ open, onOpenChange, onApply }: AiInvoiceDialogProps) {
  const [step, setStep] = useState<Step>("prompt");
  const [prompt, setPrompt] = useState("");
  const [streamedText, setStreamedText] = useState("");
  const [parsed, setParsed] = useState<AiGeneratedInvoice | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const streamRef = useRef<string>("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setStep("prompt");
      setPrompt("");
      setStreamedText("");
      setParsed(null);
      setErrorMsg("");
      streamRef.current = "";
    }
  }, [open]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [streamedText]);

  async function generate() {
    if (!prompt.trim()) return;
    setStep("generating");
    setStreamedText("");
    setErrorMsg("");
    streamRef.current = "";

    try {
      const res = await fetch("/api/ai/generate-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ prompt }),
      });

      if (!res.ok || !res.body) {
        throw new Error("Request failed");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.error) {
              setErrorMsg(evt.error);
              setStep("error");
              return;
            }
            if (evt.content) {
              streamRef.current += evt.content;
              setStreamedText(streamRef.current);
            }
            if (evt.done) {
              const result = extractJson(streamRef.current);
              if (result) {
                setParsed(result);
                setStep("preview");
              } else {
                setErrorMsg("The AI returned an unexpected format. Please try rephrasing.");
                setStep("error");
              }
            }
          } catch {
            // skip malformed SSE line
          }
        }
      }
    } catch (err) {
      setErrorMsg("Connection failed. Please check your network and try again.");
      setStep("error");
    }
  }

  function handleApply() {
    if (parsed) {
      onApply(parsed);
      onOpenChange(false);
    }
  }

  function reset() {
    setStep("prompt");
    setStreamedText("");
    setParsed(null);
    setErrorMsg("");
    streamRef.current = "";
  }

  const subtotal = parsed
    ? parsed.items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.unitPrice) || 0), 0)
    : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-6 py-5 border-b bg-gradient-to-r from-violet-50 to-indigo-50 dark:from-violet-950/30 dark:to-indigo-950/30 shrink-0">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <div className="p-1.5 rounded-lg bg-violet-100 dark:bg-violet-900/50">
              <Sparkles className="h-4 w-4 text-violet-600 dark:text-violet-400" />
            </div>
            Generate Invoice with AI
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-0.5">
            Describe the invoice in plain language — AI will extract all the details.
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          {step === "prompt" && (
            <div className="p-6 space-y-4">
              <Textarea
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                placeholder="Describe the invoice... e.g. Create an invoice for Acme Corp for 5 days of network setup services at $800/day, payment 30 days."
                rows={6}
                className="resize-none text-sm font-mono"
                onKeyDown={e => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) generate();
                }}
                autoFocus
              />
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Examples</p>
                {EXAMPLES.map((ex, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setPrompt(ex)}
                    className="w-full text-left text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60 px-3 py-2 rounded-md border border-transparent hover:border-border transition-colors flex items-start gap-2 group"
                  >
                    <ChevronRight className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground/50 group-hover:text-primary transition-colors" />
                    {ex}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Tip: Press <kbd className="px-1 py-0.5 text-xs bg-muted rounded border font-mono">⌘ Enter</kbd> to generate
              </p>
            </div>
          )}

          {step === "generating" && (
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin text-violet-500" />
                <span>AI is reading your description and extracting invoice data…</span>
              </div>
              <div
                ref={scrollRef}
                className="bg-muted/50 rounded-lg border p-4 h-64 overflow-y-auto font-mono text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap break-all"
              >
                {streamedText || <span className="animate-pulse">▍</span>}
              </div>
            </div>
          )}

          {step === "preview" && parsed && (
            <div className="p-6 space-y-5">
              <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" />
                <span className="font-medium">Invoice data extracted successfully</span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Customer</p>
                  <p className="text-sm font-medium">{parsed.customerName || "—"}</p>
                  {parsed.customerAddress && <p className="text-xs text-muted-foreground whitespace-pre-line">{parsed.customerAddress}</p>}
                  {parsed.customerContact && <p className="text-xs text-muted-foreground">Attn: {parsed.customerContact}</p>}
                  {parsed.customerContactEmail && <p className="text-xs text-muted-foreground">{parsed.customerContactEmail}</p>}
                </div>
                <div className="space-y-2">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Currency</p>
                    <p className="text-sm">{parsed.currency || "SGD"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Payment Terms</p>
                    <p className="text-sm">{parsed.paymentTerms || "30 Days Net"}</p>
                  </div>
                </div>
              </div>

              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Line Items</p>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/60">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium">Description</th>
                        <th className="text-right px-3 py-2 font-medium w-12">Qty</th>
                        <th className="text-right px-3 py-2 font-medium w-24">Unit Price</th>
                        <th className="text-right px-3 py-2 font-medium w-24">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsed.items.map((item, i) => (
                        <tr key={i} className={cn("border-t", i % 2 === 1 && "bg-muted/20")}>
                          <td className="px-3 py-2 text-muted-foreground leading-snug">
                            {item.partNumber && <span className="font-mono text-muted-foreground/70 mr-1">[{item.partNumber}]</span>}
                            {item.description}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{item.qty}{item.uom ? ` ${item.uom}` : ""}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmtAmt(parsed.currency, item.unitPrice)}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-medium">{fmtAmt(parsed.currency, item.qty * item.unitPrice)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex justify-end">
                <div className="text-sm space-y-1 min-w-[200px]">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span className="tabular-nums">{parsed.currency} {fmtAmt(parsed.currency, subtotal)}</span>
                  </div>
                  {Number(parsed.discountAmount) > 0 && (
                    <div className="flex justify-between text-red-600">
                      <span>Discount</span>
                      <span className="tabular-nums">-{parsed.currency} {fmtAmt(parsed.currency, parsed.discountAmount)}</span>
                    </div>
                  )}
                </div>
              </div>

              {parsed.notes && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Notes</p>
                  <p className="text-xs text-muted-foreground bg-muted/40 rounded-md px-3 py-2">{parsed.notes}</p>
                </div>
              )}
            </div>
          )}

          {step === "error" && (
            <div className="p-6 space-y-4">
              <div className="flex items-start gap-3 p-4 bg-destructive/5 border border-destructive/20 rounded-lg">
                <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-destructive">Generation failed</p>
                  <p className="text-xs text-muted-foreground">{errorMsg}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="border-t px-6 py-4 flex justify-between items-center gap-3 bg-background shrink-0">
          {step === "prompt" && (
            <>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button
                type="button"
                onClick={generate}
                disabled={!prompt.trim()}
                className="gap-2 bg-violet-600 hover:bg-violet-700 text-white"
              >
                <Sparkles className="h-4 w-4" />
                Generate Invoice
              </Button>
            </>
          )}
          {step === "generating" && (
            <>
              <span className="text-xs text-muted-foreground">This usually takes a few seconds…</span>
              <Button type="button" variant="ghost" disabled className="gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating…
              </Button>
            </>
          )}
          {step === "preview" && (
            <>
              <Button type="button" variant="ghost" onClick={reset} className="gap-2">
                <RefreshCw className="h-3.5 w-3.5" />
                Regenerate
              </Button>
              <Button type="button" onClick={handleApply} className="gap-2 bg-violet-600 hover:bg-violet-700 text-white">
                <CheckCircle2 className="h-4 w-4" />
                Apply to Form
              </Button>
            </>
          )}
          {step === "error" && (
            <>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
              <Button type="button" onClick={reset} className="gap-2">
                <RefreshCw className="h-3.5 w-3.5" />
                Try Again
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
