import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles, Check, Loader2, AlertCircle, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  "Reading line items…",
  "Detecting service categories…",
  "Analysing descriptions…",
  "Structuring section headers…",
  "Finalising format…",
];

function stripHtml(html: string) {
  return (html || "").replace(/<[^>]*>/g, "").trim();
}

function fmtPrice(currency: string, amount: number) {
  if (!amount) return "";
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

interface ItemPanelProps {
  items: any[];
  currency: string;
  label: string;
  highlight?: boolean;
}

function ItemPanel({ items, currency, label, highlight }: ItemPanelProps) {
  let seq = 0;
  return (
    <div className={cn("flex flex-col flex-1 min-w-0 border rounded-lg overflow-hidden", highlight && "border-violet-300 shadow-sm shadow-violet-100")}>
      <div className={cn("px-4 py-2.5 text-xs font-semibold uppercase tracking-wide border-b", highlight ? "bg-violet-50 text-violet-700 border-violet-200" : "bg-muted/60 text-muted-foreground")}>
        {label}
      </div>
      <div className="flex-1 overflow-y-auto">
        {items.map((item: any, i: number) => {
          if (item.type === "section") {
            const label = stripHtml(item.sectionLabel || "Section");
            return (
              <div key={i} className={cn("px-4 py-2 text-xs font-bold uppercase tracking-wide border-b", highlight ? "bg-violet-50/70 text-violet-800" : "bg-muted/40 text-foreground")}>
                {label}
              </div>
            );
          }
          seq++;
          const desc = stripHtml(item.description || "");
          const qty = Number(item.qty) || 0;
          const price = Number(item.unitPrice) || 0;
          return (
            <div key={i} className="flex items-start gap-3 px-4 py-2.5 border-b last:border-0 hover:bg-muted/20">
              <span className="text-xs text-muted-foreground w-5 shrink-0 pt-0.5">{seq}.</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm leading-snug line-clamp-3">{desc || <span className="text-muted-foreground italic">—</span>}</p>
                {item.partNumber && <p className="text-xs text-muted-foreground mt-0.5 font-mono">{item.partNumber}</p>}
              </div>
              <div className="text-right shrink-0">
                {qty > 0 && <p className="text-xs text-muted-foreground">×{qty}</p>}
                {price > 0 && <p className="text-xs font-medium tabular-nums">{fmtPrice(currency, price)}</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface AiFormatSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: any[];
  currency: string;
  onConfirm: (items: any[]) => void;
}

export function AiFormatSheet({ open, onOpenChange, items, currency, onConfirm }: AiFormatSheetProps) {
  const [phase, setPhase] = useState<"loading" | "compare" | "error">("loading");
  const [visibleSteps, setVisibleSteps] = useState(0);
  const [formattedItems, setFormattedItems] = useState<any[]>([]);
  const [errorMsg, setErrorMsg] = useState("");
  const apiResultRef = useRef<{ items: any[] } | null>(null);
  const animDoneRef = useRef(false);
  const apiDoneRef = useRef(false);

  function maybeShowCompare() {
    if (animDoneRef.current && apiDoneRef.current && apiResultRef.current) {
      setFormattedItems(apiResultRef.current.items);
      setPhase("compare");
    }
  }

  useEffect(() => {
    if (!open) return;
    setPhase("loading");
    setVisibleSteps(0);
    setFormattedItems([]);
    setErrorMsg("");
    apiResultRef.current = null;
    animDoneRef.current = false;
    apiDoneRef.current = false;

    // Animate steps
    const timers: ReturnType<typeof setTimeout>[] = [];
    STEPS.forEach((_, i) => {
      timers.push(setTimeout(() => {
        setVisibleSteps(i + 1);
        if (i === STEPS.length - 1) {
          animDoneRef.current = true;
          maybeShowCompare();
        }
      }, 550 + i * 700));
    });

    // Call API in parallel
    (async () => {
      try {
        const res = await fetch("/api/ai/format-invoice", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Failed" }));
          throw new Error(err.error || "Formatting failed");
        }
        const data = await res.json();
        apiResultRef.current = { items: data.formattedItems };
        apiDoneRef.current = true;
        maybeShowCompare();
      } catch (e: any) {
        timers.forEach(clearTimeout);
        setErrorMsg(e.message || "AI formatting failed. Please try again.");
        setPhase("error");
      }
    })();

    return () => timers.forEach(clearTimeout);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-full h-[82vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b flex-row items-center gap-3 space-y-0 shrink-0">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-violet-100">
            <Sparkles className="h-4 w-4 text-violet-600" />
          </div>
          <div>
            <DialogTitle className="text-base font-semibold leading-none">AI Invoice Formatting</DialogTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              {phase === "loading" ? "Analysing your line items…" : phase === "compare" ? "Review the suggested structure before saving" : "Something went wrong"}
            </p>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col">
          {/* ── Loading phase ── */}
          {phase === "loading" && (
            <div className="flex-1 flex flex-col items-center justify-center gap-6 px-8">
              <div className="w-full max-w-sm space-y-3">
                {STEPS.map((step, i) => {
                  const shown = i < visibleSteps;
                  const active = i === visibleSteps - 1;
                  return (
                    <div key={i} className={cn("flex items-center gap-3 transition-all duration-300", shown ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2")}>
                      <div className={cn("flex items-center justify-center w-5 h-5 rounded-full shrink-0 transition-colors", active && visibleSteps <= STEPS.length ? "bg-violet-100" : "bg-emerald-100")}>
                        {active && visibleSteps <= STEPS.length
                          ? <Loader2 className="h-3 w-3 animate-spin text-violet-600" />
                          : <Check className="h-3 w-3 text-emerald-600" />}
                      </div>
                      <span className={cn("text-sm transition-colors", active && visibleSteps <= STEPS.length ? "text-foreground font-medium" : "text-muted-foreground")}>{step}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Error phase ── */}
          {phase === "error" && (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8 text-center">
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-destructive/10">
                <AlertCircle className="h-6 w-6 text-destructive" />
              </div>
              <div>
                <p className="font-medium text-destructive">Formatting failed</p>
                <p className="text-sm text-muted-foreground mt-1">{errorMsg}</p>
              </div>
              <Button variant="outline" onClick={() => onConfirm(items)}>
                Continue with original items
              </Button>
            </div>
          )}

          {/* ── Compare phase ── */}
          {phase === "compare" && (
            <>
              <div className="flex-1 flex gap-4 p-4 overflow-hidden min-h-0">
                <ItemPanel items={items} currency={currency} label="Original" />
                <div className="flex items-center justify-center shrink-0">
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </div>
                <ItemPanel items={formattedItems} currency={currency} label="✨ AI Formatted" highlight />
              </div>
              <div className="shrink-0 flex items-center justify-between px-6 py-4 border-t bg-muted/20">
                <p className="text-xs text-muted-foreground">
                  Numbers (qty, price, discount) are never changed. Only structure and text are reformatted.
                </p>
                <div className="flex items-center gap-3">
                  <Button variant="outline" onClick={() => onConfirm(items)}>
                    Keep Original
                  </Button>
                  <Button
                    className="gap-2 bg-violet-600 hover:bg-violet-700 text-white"
                    onClick={() => onConfirm(formattedItems)}
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Use AI Format
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
