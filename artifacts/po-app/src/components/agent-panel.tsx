import { useState, useRef, useEffect, useCallback } from "react";
import {
  X, Send, Mic, Volume2, Loader2, Sparkles, ExternalLink,
  Square, BarChart2, Navigation, RotateCcw, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: string[];
  docRef?: { number: string; path: string };
  navigated?: { path: string; label: string };
  fromVoice?: boolean;
}

// ── Memory ────────────────────────────────────────────────────────────────────
const MEMORY_KEY = "aria_memory_v2";
const MAX_MEMORY = 10;
function loadMemory(): string[] {
  try { return JSON.parse(localStorage.getItem(MEMORY_KEY) || "[]"); } catch { return []; }
}
function saveMemory(e: string[]) { localStorage.setItem(MEMORY_KEY, JSON.stringify(e.slice(-MAX_MEMORY))); }
function appendMemory(fact: string) {
  const m = loadMemory();
  if (!fact.trim() || m.includes(fact)) return;
  saveMemory([...m, fact]);
}

// ── Markdown ──────────────────────────────────────────────────────────────────
function MarkdownText({ text }: { text: string }) {
  if (!text) return null;
  return (
    <div className="space-y-1">
      {text.split("\n").map((line, li) => {
        const isBullet = /^[\s]*[-•*]\s+/.test(line);
        const content = isBullet ? line.replace(/^[\s]*[-•*]\s+/, "") : line;
        const parts: React.ReactNode[] = [];
        let k = 0, last = 0;
        const re = /(\*\*(.+?)\*\*|\*(.+?)\*)/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(content)) !== null) {
          if (m.index > last) parts.push(content.slice(last, m.index));
          parts.push(m[0].startsWith("**")
            ? <strong key={k++} className="font-semibold">{m[2]}</strong>
            : <em key={k++}>{m[3]}</em>);
          last = re.lastIndex;
        }
        if (last < content.length) parts.push(content.slice(last));
        if (!line.trim()) return <div key={li} className="h-1.5" />;
        if (isBullet) return (
          <div key={li} className="flex gap-2 items-baseline">
            <span className="shrink-0 w-1 h-1 rounded-full bg-foreground/30 mt-[8px]" />
            <span>{parts.length ? parts : content}</span>
          </div>
        );
        return <div key={li}>{parts.length ? parts : line}</div>;
      })}
    </div>
  );
}

// ── Constants ─────────────────────────────────────────────────────────────────
const TOOL_LABELS: Record<string, string> = {
  searchCustomers: "Searching customers",
  searchQuotations: "Searching quotations",
  getQuotation: "Loading quotation",
  searchStockItems: "Searching catalogue",
  searchPurchaseOrders: "Searching POs",
  getCompanySettings: "Loading settings",
  getFinancialStats: "Calculating stats",
  navigateTo: "Navigating",
  createInvoice: "Creating invoice",
  createQuotation: "Creating quotation",
};

const PATH_LABELS: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/invoices": "Invoices",
  "/invoices/new": "New Invoice",
  "/quotations": "Quotations",
  "/quotations/new": "New Quotation",
  "/purchase-orders": "Purchase Orders",
  "/purchase-orders/new": "New Purchase Order",
  "/delivery-orders": "Delivery Orders",
  "/delivery-orders/new": "New Delivery Order",
  "/stock": "Stock Items",
  "/grn": "GRN",
  "/settings": "Settings",
  "/vendor-invoices": "Vendor Invoices",
  "/customers": "Customers",
  "/vendors": "Vendors",
};

const SUGGESTIONS = [
  "Create a new invoice",
  "Show this quarter's revenue",
  "Go to Purchase Orders",
  "Search customers",
  "Convert a quotation to invoice",
  "Check low stock items",
];

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ── Audio ─────────────────────────────────────────────────────────────────────
let _audio: HTMLAudioElement | null = null;
function playAudio(b64: string) {
  if (_audio) { _audio.pause(); _audio.src = ""; _audio = null; }
  const a = new Audio(`data:audio/mp3;base64,${b64}`);
  _audio = a;
  a.onended = a.onerror = () => { _audio = null; };
  a.play().catch(() => { _audio = null; });
}
async function speak(text: string) {
  try {
    const r = await fetch(`${BASE}/api/agent/speak`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      credentials: "include", body: JSON.stringify({ text }),
    });
    if (r.ok) playAudio((await r.json()).audio);
  } catch {}
}

// ── SSE stream ────────────────────────────────────────────────────────────────
async function streamChat(
  messages: { role: string; content: string }[],
  memory: string[],
  onText: (c: string) => void,
  onTool: (n: string) => void,
  onNav: (path: string, prefill: any, reason: string) => void,
  signal: AbortSignal,
) {
  const r = await fetch(`${BASE}/api/agent/chat`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    credentials: "include", body: JSON.stringify({ messages, memory }), signal,
  });
  if (!r.ok) { const e = await r.json().catch(() => ({ error: "Failed" })); throw new Error(e.error); }
  const reader = r.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n"); buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      try {
        const ev = JSON.parse(line.slice(6));
        if (ev.type === "text" && ev.content) onText(ev.content);
        if (ev.type === "tool_call" && ev.name) onTool(ev.name);
        if (ev.type === "navigate") onNav(ev.path, ev.prefill, ev.reason || "");
        if (ev.type === "error") throw new Error(ev.message);
      } catch (e: any) { if (e.message && !e.message.includes("JSON")) throw e; }
    }
  }
}

// ── Voice ─────────────────────────────────────────────────────────────────────
async function transcribe(blob: Blob): Promise<string> {
  const ab = await blob.arrayBuffer();
  const bytes = new Uint8Array(ab);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
  const r = await fetch(`${BASE}/api/agent/transcribe`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    credentials: "include", body: JSON.stringify({ audio: btoa(bin) }),
  });
  if (!r.ok) throw new Error("Transcription failed");
  return (await r.json()).text;
}

function useVoice() {
  const [recording, setRecording] = useState(false);
  const mrRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  const start = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
    const mr = new MediaRecorder(stream, { mimeType: mime });
    chunks.current = [];
    mr.ondataavailable = e => { if (e.data.size > 0) chunks.current.push(e.data); };
    mr.start(250); mrRef.current = mr; setRecording(true);
  }, []);

  const stop = useCallback((): Promise<Blob> => new Promise(resolve => {
    const mr = mrRef.current;
    if (!mr) return resolve(new Blob());
    mr.onstop = () => {
      const blob = new Blob(chunks.current, { type: mr.mimeType });
      mr.stream.getTracks().forEach(t => t.stop());
      mrRef.current = null; setRecording(false); resolve(blob);
    };
    mr.stop();
  }), []);

  return { recording, start, stop };
}

// ── Component ─────────────────────────────────────────────────────────────────
export function AgentPanel() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [navigating, setNavigating] = useState<string>("");
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const { recording, start, stop } = useVoice();
  const [, navigate] = useLocation();
  const [memory] = useState(() => loadMemory());

  const hasMessages = messages.length > 0;

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 200);
  }, [open]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const history = messages.filter(m => m.content).map(m => ({ role: m.role, content: m.content }));

  const handleNavigate = useCallback((path: string, prefill: any, reason: string) => {
    if (prefill) (window as any).__ariaPrefill = prefill;
    const label = PATH_LABELS[path] || path;
    // Show navigation happening — panel stays open so user can watch the page change
    setNavigating(reason || `Opening ${label}…`);
    navigate(path);
    setTimeout(() => setNavigating(""), 2000);
  }, [navigate]);

  const send = useCallback(async (text: string, fromVoice = false) => {
    if (!text.trim() || thinking) return;
    const uid = Date.now().toString();
    const aid = `asst-${uid}`;
    setMessages(p => [...p,
      { id: uid, role: "user", content: text.trim(), fromVoice },
      { id: aid, role: "assistant", content: "", toolCalls: [] },
    ]);
    setInput(""); setThinking(true);
    abortRef.current = new AbortController();
    let full = "";
    try {
      await streamChat(
        [...history, { role: "user", content: text.trim() }],
        memory,
        chunk => { full += chunk; setMessages(p => p.map(m => m.id === aid ? { ...m, content: full } : m)); },
        tool => setMessages(p => p.map(m => m.id === aid ? { ...m, toolCalls: [...(m.toolCalls ?? []), tool] } : m)),
        (path, prefill, reason) => {
          const label = PATH_LABELS[path] || path;
          setMessages(p => p.map(m => m.id === aid ? { ...m, navigated: { path, label } } : m));
          handleNavigate(path, prefill, reason);
        },
        abortRef.current.signal,
      );
      const inv = full.match(/\b(INV-\d+)\b/);
      const qt = full.match(/\b(QT-\d+)\b/);
      if (inv) { setMessages(p => p.map(m => m.id === aid ? { ...m, docRef: { number: inv[1], path: "/invoices" } } : m)); appendMemory(`Created invoice ${inv[1]}`); }
      else if (qt) { setMessages(p => p.map(m => m.id === aid ? { ...m, docRef: { number: qt[1], path: "/quotations" } } : m)); appendMemory(`Created quotation ${qt[1]}`); }
      if (fromVoice && full) speak(full.slice(0, 600));
    } catch (e: any) {
      if (e.name !== "AbortError") setMessages(p => p.map(m => m.id === aid ? { ...m, content: "Something went wrong — please try again." } : m));
    } finally { setThinking(false); abortRef.current = null; }
  }, [thinking, history, memory, handleNavigate]);

  const submit = () => send(input);
  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); }
  };

  const mic = async () => {
    if (transcribing) return;
    if (recording) {
      const blob = await stop();
      if (blob.size < 1000) return;
      setTranscribing(true);
      try { const t = await transcribe(blob); if (t.trim()) await send(t, true); }
      catch {} finally { setTranscribing(false); }
    } else { await start(); }
  };

  const stopAudio = () => { if (_audio) { _audio.pause(); _audio.src = ""; _audio = null; } };
  const clear = () => { stopAudio(); setMessages([]); };
  const close = () => { stopAudio(); setOpen(false); };

  return (
    <>
      {/* ── FAB trigger ── */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2.5 bg-primary text-primary-foreground rounded-full px-5 py-3 shadow-xl hover:bg-primary/90 transition-all hover:scale-105 active:scale-95"
        >
          <Sparkles className="h-4 w-4" />
          <span className="text-sm font-semibold">Ask Aria</span>
        </button>
      )}

      {/* ── Right-side slide-in panel ── */}
      <div
        className={cn(
          "fixed top-0 right-0 h-screen z-40 flex flex-col w-[400px] bg-background border-l border-border shadow-2xl",
          "transition-transform duration-300 ease-in-out",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-background shrink-0">
          <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-primary text-primary-foreground shadow-sm">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">Aria</p>
            <p className="text-xs text-muted-foreground">AI assistant for RSV Infotech</p>
          </div>
          <div className="flex items-center gap-1">
            {hasMessages && (
              <button onClick={clear} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" title="New conversation">
                <RotateCcw className="h-4 w-4" />
              </button>
            )}
            <button onClick={close} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" title="Close">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Navigation toast — visible while Aria is navigating the app */}
        {navigating && (
          <div className="flex items-center gap-2.5 px-4 py-2.5 bg-primary/5 border-b border-primary/15 text-primary text-sm shrink-0">
            <Navigation className="h-4 w-4 shrink-0 animate-pulse" />
            <span className="font-medium">{navigating}</span>
            <span className="text-xs text-muted-foreground ml-auto">Watch the page change →</span>
          </div>
        )}

        {/* Messages / Welcome */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {!hasMessages ? (
            /* Welcome */
            <div className="flex flex-col items-center justify-center h-full px-5 pb-8 text-center gap-5">
              <div className="flex flex-col items-center gap-3">
                <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                  <Sparkles className="h-7 w-7" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold">Hi, I'm Aria</h2>
                  <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                    Ask me to create documents, search data,<br />or navigate anywhere in the app.
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-2 w-full">
                {SUGGESTIONS.map(s => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="text-left px-4 py-2.5 rounded-xl border border-border bg-muted/30 hover:bg-muted text-sm text-foreground/80 hover:text-foreground transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* Chat thread */
            <div className="px-4 py-4 space-y-5">
              {messages.map(msg => (
                <div key={msg.id} className={cn("flex gap-2.5", msg.role === "user" ? "flex-row-reverse" : "flex-row")}>
                  {/* Avatar */}
                  <div className={cn(
                    "shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold mt-0.5",
                    msg.role === "user" ? "bg-primary/15 text-primary" : "bg-primary text-primary-foreground",
                  )}>
                    {msg.role === "user" ? "Y" : <Sparkles className="h-3.5 w-3.5" />}
                  </div>

                  <div className={cn("flex flex-col gap-1.5 max-w-[84%]", msg.role === "user" ? "items-end" : "items-start")}>
                    {/* Tool badges */}
                    {msg.toolCalls && msg.toolCalls.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {msg.toolCalls.map((tc, i) => (
                          <span key={i} className="text-xs bg-muted text-muted-foreground rounded-full px-2.5 py-0.5 flex items-center gap-1.5 border border-border/60">
                            {tc === "getFinancialStats" ? <BarChart2 className="h-2.5 w-2.5" />
                              : tc === "navigateTo" ? <Navigation className="h-2.5 w-2.5" />
                              : <Loader2 className="h-2.5 w-2.5 animate-spin" />}
                            {TOOL_LABELS[tc] ?? tc}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Navigation badge */}
                    {msg.navigated && (
                      <div className="flex items-center gap-1.5 text-xs text-primary bg-primary/8 border border-primary/20 rounded-full px-3 py-1">
                        <Navigation className="h-3 w-3" />
                        Navigated to {msg.navigated.label}
                      </div>
                    )}

                    {/* Bubble */}
                    <div className={cn(
                      "px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed",
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground rounded-tr-sm"
                        : "bg-muted/60 text-foreground rounded-tl-sm border border-border/40",
                    )}>
                      {msg.content ? (
                        <MarkdownText text={msg.content} />
                      ) : (
                        <div className="flex gap-1 items-center h-4 px-0.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:0ms]" />
                          <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:150ms]" />
                          <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:300ms]" />
                        </div>
                      )}
                      {msg.docRef && (
                        <button
                          onClick={() => { navigate(msg.docRef!.path); }}
                          className="mt-2 flex items-center gap-1.5 text-xs underline underline-offset-2 opacity-70 hover:opacity-100"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Open {msg.docRef.number}
                        </button>
                      )}
                    </div>

                    {/* Listen */}
                    {msg.role === "assistant" && msg.content && (
                      <button
                        onClick={() => speak(msg.content.slice(0, 600))}
                        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Volume2 className="h-3 w-3" />
                        Listen
                      </button>
                    )}
                  </div>
                </div>
              ))}
              <div ref={endRef} />
            </div>
          )}
        </div>

        {/* Input */}
        <div className="shrink-0 border-t border-border px-4 py-3 bg-background">
          <div className="flex items-end gap-2 rounded-xl border border-border bg-muted/20 px-3 py-2 focus-within:ring-2 focus-within:ring-primary/25 focus-within:border-primary/40 transition-all">
            <button
              onClick={mic}
              disabled={transcribing || thinking}
              className={cn(
                "shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all mb-0.5",
                recording ? "bg-red-500 text-white animate-pulse shadow"
                  : transcribing ? "text-muted-foreground cursor-wait"
                  : "text-muted-foreground hover:text-foreground",
              )}
              title={recording ? "Stop" : "Speak"}
            >
              {transcribing ? <Loader2 className="h-4 w-4 animate-spin" />
                : recording ? <Square className="h-3.5 w-3.5 fill-current" />
                : <Mic className="h-4 w-4" />}
            </button>

            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={onKey}
              placeholder={recording ? "🔴 Listening…" : "Ask Aria anything…"}
              rows={1}
              disabled={thinking || recording || transcribing}
              className="flex-1 resize-none bg-transparent text-sm focus:outline-none disabled:opacity-50 min-h-[32px] max-h-[130px] overflow-y-auto py-1.5 placeholder:text-muted-foreground/60"
              onInput={e => {
                const el = e.currentTarget;
                el.style.height = "auto";
                el.style.height = `${Math.min(el.scrollHeight, 130)}px`;
              }}
            />

            <button
              onClick={submit}
              disabled={!input.trim() || thinking || recording}
              className="shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 disabled:opacity-30 disabled:cursor-not-allowed transition-all mb-0.5"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="text-xs text-muted-foreground text-center mt-2">
            {recording ? "Tap ■ to stop · Aria will speak back" : "Enter to send · mic for voice"}
          </p>
        </div>
      </div>

      {/* Slim edge-tab when open — to collapse/toggle without losing the chat */}
      {open && (
        <button
          onClick={close}
          className="fixed right-[400px] top-1/2 -translate-y-1/2 z-40 flex items-center justify-center w-5 h-16 bg-border hover:bg-muted rounded-l-md transition-colors"
          title="Close Aria"
        >
          <ChevronRight className="h-3 w-3 text-muted-foreground" />
        </button>
      )}
    </>
  );
}
