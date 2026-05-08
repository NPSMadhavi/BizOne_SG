import { useState, useRef, useEffect, useCallback } from "react";
import {
  Send, Mic, Volume2, Loader2, Sparkles, ExternalLink,
  Square, BarChart2, Navigation, RotateCcw, X, CheckCircle2, Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: string[];
  complete?: boolean;
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
            <span className="shrink-0 w-1 h-1 rounded-full bg-current opacity-40 mt-[9px]" />
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
  { label: "Create new invoice", icon: "📄" },
  { label: "This quarter's revenue", icon: "📊" },
  { label: "Go to Purchase Orders", icon: "🗂️" },
  { label: "Search customers", icon: "🔍" },
  { label: "Convert quotation to invoice", icon: "✨" },
  { label: "Check low stock items", icon: "📦" },
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
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const { recording, start, stop } = useVoice();
  const [, navigate] = useLocation();
  const [memory] = useState(() => loadMemory());

  const hasMessages = messages.length > 0;

  // Lock body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  // Scroll to bottom when messages update
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const history = messages.filter(m => m.content).map(m => ({ role: m.role, content: m.content }));

  const handleNavigate = useCallback((path: string, prefill: any, reason: string) => {
    if (prefill) (window as any).__ariaPrefill = prefill;
    const label = PATH_LABELS[path] || path;
    setMessages(p => p.map(m =>
      m.role === "assistant" && !m.complete
        ? { ...m, navigated: { path, label } }
        : m
    ));
    navigate(path);
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
        (path, prefill, reason) => handleNavigate(path, prefill, reason),
        abortRef.current.signal,
      );
      const inv = full.match(/\b(INV-\d+)\b/);
      const qt = full.match(/\b(QT-\d+)\b/);
      if (inv) { setMessages(p => p.map(m => m.id === aid ? { ...m, complete: true, docRef: { number: inv[1], path: "/invoices" } } : m)); appendMemory(`Created invoice ${inv[1]}`); }
      else if (qt) { setMessages(p => p.map(m => m.id === aid ? { ...m, complete: true, docRef: { number: qt[1], path: "/quotations" } } : m)); appendMemory(`Created quotation ${qt[1]}`); }
      else { setMessages(p => p.map(m => m.id === aid ? { ...m, complete: true } : m)); }
      if (fromVoice && full) speak(full.slice(0, 600));
    } catch (e: any) {
      if (e.name !== "AbortError") setMessages(p => p.map(m => m.id === aid ? { ...m, complete: true, content: "Something went wrong — please try again." } : m));
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

      {/* ── Full-screen modal ── */}
      {open && (
        <div className="fixed inset-0 z-50 flex flex-col bg-background/97 backdrop-blur-sm">

          {/* Top bar */}
          <div className="flex items-center justify-between px-6 py-4 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shadow-sm">
                <Sparkles className="h-4 w-4" />
              </div>
              <span className="text-sm font-semibold text-foreground">Aria</span>
            </div>
            <div className="flex items-center gap-2">
              {hasMessages && (
                <button
                  onClick={clear}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-lg hover:bg-muted transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  New chat
                </button>
              )}
              <button
                onClick={close}
                className="w-8 h-8 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Content area */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {!hasMessages ? (
              /* ── Welcome ── */
              <div className="flex flex-col items-center justify-center h-full px-6 pb-24 gap-8">
                <div className="text-center">
                  <p className="text-lg text-muted-foreground mb-1">Hi there</p>
                  <h1 className="text-4xl font-semibold tracking-tight">Where should we start?</h1>
                </div>

                {/* Hero input */}
                <div className="w-full max-w-2xl">
                  <div className="flex items-end gap-3 bg-muted/50 border border-border rounded-2xl px-5 py-4 shadow-sm focus-within:ring-2 focus-within:ring-primary/30 focus-within:border-primary/50 transition-all">
                    <textarea
                      ref={inputRef}
                      value={input}
                      onChange={e => setInput(e.target.value)}
                      onKeyDown={onKey}
                      placeholder="Ask me anything…"
                      rows={1}
                      className="flex-1 resize-none bg-transparent text-base focus:outline-none min-h-[28px] max-h-[160px] overflow-y-auto py-0 placeholder:text-muted-foreground/50"
                      onInput={e => {
                        const el = e.currentTarget;
                        el.style.height = "auto";
                        el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
                      }}
                    />
                    <div className="flex items-center gap-2 shrink-0 pb-0.5">
                      <button
                        onClick={mic}
                        className={cn(
                          "w-8 h-8 rounded-full flex items-center justify-center transition-all",
                          recording ? "bg-red-500 text-white animate-pulse" : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {transcribing ? <Loader2 className="h-4 w-4 animate-spin" />
                          : recording ? <Square className="h-3.5 w-3.5 fill-current" />
                          : <Mic className="h-4 w-4" />}
                      </button>
                      <button
                        onClick={submit}
                        disabled={!input.trim()}
                        className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                      >
                        <Send className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Suggestion chips */}
                <div className="flex flex-wrap justify-center gap-2.5 max-w-2xl">
                  {SUGGESTIONS.map(s => (
                    <button
                      key={s.label}
                      onClick={() => send(s.label)}
                      className="flex items-center gap-2 px-4 py-2 rounded-full border border-border bg-background hover:bg-muted text-sm text-foreground/70 hover:text-foreground transition-colors shadow-sm"
                    >
                      <span>{s.icon}</span>
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              /* ── Chat thread ── */
              <div className="max-w-3xl mx-auto px-6 py-6 space-y-8">
                {messages.map(msg => (
                  <div key={msg.id} className={cn(
                    "flex gap-4",
                    msg.role === "user" ? "justify-end" : "justify-start",
                  )}>
                    {/* Avatar — assistant only */}
                    {msg.role === "assistant" && (
                      <div className="shrink-0 w-8 h-8 rounded-xl bg-primary text-primary-foreground flex items-center justify-center mt-0.5 shadow-sm">
                        <Sparkles className="h-3.5 w-3.5" />
                      </div>
                    )}

                    <div className={cn(
                      "flex flex-col gap-2",
                      msg.role === "user" ? "items-end max-w-[70%]" : "items-start max-w-[80%]",
                    )}>
                      {/* Tool badges */}
                      {msg.toolCalls && msg.toolCalls.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {msg.toolCalls.map((tc, i) => {
                            const done = !!msg.complete;
                            const icon = done
                              ? <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                              : tc === "getFinancialStats" ? <BarChart2 className="h-3 w-3" />
                              : tc === "navigateTo" ? <Navigation className="h-3 w-3" />
                              : <Loader2 className="h-3 w-3 animate-spin" />;
                            return (
                              <span key={i} className={cn(
                                "text-xs rounded-full px-3 py-1 flex items-center gap-1.5 border",
                                done
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800/50"
                                  : "bg-muted text-muted-foreground border-border/60",
                              )}>
                                {icon}
                                {TOOL_LABELS[tc] ?? tc}
                              </span>
                            );
                          })}
                        </div>
                      )}

                      {/* Navigation badge */}
                      {msg.navigated && (
                        <div className="flex items-center gap-1.5 text-xs text-primary bg-primary/8 border border-primary/20 rounded-full px-3 py-1">
                          <Navigation className="h-3 w-3" />
                          Opened {msg.navigated.label}
                        </div>
                      )}

                      {/* Message bubble */}
                      {(msg.content || msg.role === "assistant") && (
                        <div className={cn(
                          "text-sm leading-relaxed",
                          msg.role === "user"
                            ? "bg-primary text-primary-foreground px-4 py-3 rounded-2xl rounded-tr-sm"
                            : "text-foreground",
                        )}>
                          {msg.content ? (
                            <MarkdownText text={msg.content} />
                          ) : (
                            <div className="flex gap-1 items-center h-5">
                              <span className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:0ms]" />
                              <span className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:150ms]" />
                              <span className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:300ms]" />
                            </div>
                          )}

                          {/* Doc link */}
                          {msg.docRef && (
                            <button
                              onClick={() => { navigate(msg.docRef!.path); close(); }}
                              className="mt-3 flex items-center gap-1.5 text-xs text-primary hover:underline underline-offset-2"
                            >
                              <ExternalLink className="h-3 w-3" />
                              Open {msg.docRef.number}
                            </button>
                          )}
                        </div>
                      )}

                      {/* Listen */}
                      {msg.role === "assistant" && msg.content && (
                        <button
                          onClick={() => speak(msg.content.slice(0, 600))}
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <Volume2 className="h-3 w-3" />
                          Listen
                        </button>
                      )}
                    </div>

                    {/* Avatar — user only */}
                    {msg.role === "user" && (
                      <div className="shrink-0 w-8 h-8 rounded-xl bg-muted text-foreground/60 flex items-center justify-center text-xs font-bold mt-0.5">
                        Y
                      </div>
                    )}
                  </div>
                ))}
                <div ref={endRef} />
              </div>
            )}
          </div>

          {/* Bottom input — only shown in chat mode */}
          {hasMessages && (
            <div className="shrink-0 border-t border-border/60 bg-background/80 backdrop-blur-sm px-6 py-4">
              <div className="max-w-3xl mx-auto">
                <div className="flex items-end gap-3 bg-muted/50 border border-border rounded-2xl px-5 py-4 focus-within:ring-2 focus-within:ring-primary/30 focus-within:border-primary/50 transition-all">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={onKey}
                    placeholder={recording ? "🔴 Listening…" : "Ask Aria anything…"}
                    rows={1}
                    disabled={thinking || recording || transcribing}
                    className="flex-1 resize-none bg-transparent text-sm focus:outline-none disabled:opacity-50 min-h-[24px] max-h-[140px] overflow-y-auto py-0 placeholder:text-muted-foreground/50"
                    onInput={e => {
                      const el = e.currentTarget;
                      el.style.height = "auto";
                      el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
                    }}
                  />
                  <div className="flex items-center gap-2 shrink-0 pb-0.5">
                    {thinking && (
                      <button
                        onClick={() => { abortRef.current?.abort(); }}
                        className="w-8 h-8 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                        title="Stop"
                      >
                        <Square className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      onClick={mic}
                      disabled={transcribing || thinking}
                      className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center transition-all",
                        recording ? "bg-red-500 text-white animate-pulse" : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {transcribing ? <Loader2 className="h-4 w-4 animate-spin" />
                        : recording ? <Square className="h-3.5 w-3.5 fill-current" />
                        : <Mic className="h-4 w-4" />}
                    </button>
                    <button
                      onClick={submit}
                      disabled={!input.trim() || thinking || recording}
                      className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    >
                      <Send className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground text-center mt-2">
                  Press Enter to send · Shift+Enter for new line · Esc to close
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
