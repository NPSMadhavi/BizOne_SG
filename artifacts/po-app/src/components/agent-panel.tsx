import { useState, useRef, useEffect, useCallback } from "react";
import { X, Send, Mic, Volume2, Loader2, Sparkles, ExternalLink, Square, Navigation, BarChart2, ChevronDown, RotateCcw } from "lucide-react";
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

// ── Memory persistence ───────────────────────────────────────────────────────
const MEMORY_KEY = "aria_memory_v2";
const MAX_MEMORY = 10;

function loadMemory(): string[] {
  try { return JSON.parse(localStorage.getItem(MEMORY_KEY) || "[]"); } catch { return []; }
}
function saveMemory(entries: string[]) {
  localStorage.setItem(MEMORY_KEY, JSON.stringify(entries.slice(-MAX_MEMORY)));
}
function appendMemory(fact: string) {
  const mem = loadMemory();
  if (!fact.trim() || mem.includes(fact)) return;
  saveMemory([...mem, fact]);
}

// ── Markdown renderer ────────────────────────────────────────────────────────
function MarkdownText({ text }: { text: string }) {
  if (!text) return null;
  const lines = text.split("\n");
  return (
    <div className="space-y-1">
      {lines.map((line, li) => {
        const isBullet = /^[\s]*[-•*]\s+/.test(line);
        const content = isBullet ? line.replace(/^[\s]*[-•*]\s+/, "") : line;
        const segments: React.ReactNode[] = [];
        let key = 0;
        const pattern = /(\*\*(.+?)\*\*|\*(.+?)\*)/g;
        let lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(content)) !== null) {
          if (match.index > lastIndex) segments.push(content.slice(lastIndex, match.index));
          if (match[0].startsWith("**")) {
            segments.push(<strong key={key++} className="font-semibold">{match[2]}</strong>);
          } else {
            segments.push(<em key={key++}>{match[3]}</em>);
          }
          lastIndex = pattern.lastIndex;
        }
        if (lastIndex < content.length) segments.push(content.slice(lastIndex));
        if (!line.trim()) return <div key={li} className="h-2" />;
        if (isBullet) {
          return (
            <div key={li} className="flex gap-2.5 items-baseline">
              <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-foreground/25 mt-[7px]" />
              <span>{segments.length ? segments : content}</span>
            </div>
          );
        }
        return <div key={li}>{segments.length ? segments : line}</div>;
      })}
    </div>
  );
}

// ── Tool labels ──────────────────────────────────────────────────────────────
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

// ── Path → label ─────────────────────────────────────────────────────────────
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
  "/stock": "Stock",
  "/grn": "GRN",
  "/settings": "Settings",
  "/vendor-invoices": "Vendor Invoices",
  "/customers": "Customers",
  "/vendors": "Vendors",
};

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ── Suggestion chips ─────────────────────────────────────────────────────────
const SUGGESTIONS = [
  "Create an invoice",
  "Show this quarter's revenue",
  "Search customers",
  "Go to Purchase Orders",
  "Convert a quotation to invoice",
  "Show low stock items",
];

// ── Audio ────────────────────────────────────────────────────────────────────
let _currentAudio: HTMLAudioElement | null = null;
function playAudio(base64Mp3: string): void {
  if (_currentAudio) { _currentAudio.pause(); _currentAudio.src = ""; _currentAudio = null; }
  const audio = new Audio(`data:audio/mp3;base64,${base64Mp3}`);
  _currentAudio = audio;
  audio.onended = () => { _currentAudio = null; };
  audio.onerror = () => { _currentAudio = null; };
  audio.play().catch(() => { _currentAudio = null; });
}

async function fetchAndPlayText(text: string): Promise<void> {
  try {
    const res = await fetch(`${BASE}/api/agent/speak`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      credentials: "include", body: JSON.stringify({ text }),
    });
    if (!res.ok) return;
    const data = await res.json();
    playAudio(data.audio);
  } catch {}
}

// ── SSE streaming ─────────────────────────────────────────────────────────────
async function streamAgentChat(
  messages: { role: string; content: string }[],
  memory: string[],
  onText: (chunk: string) => void,
  onToolCall: (name: string) => void,
  onNavigate: (path: string, prefill: any, reason: string) => void,
  signal: AbortSignal,
): Promise<void> {
  const response = await fetch(`${BASE}/api/agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ messages, memory }),
    signal,
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.error || "Agent request failed");
  }

  const reader = response.body!.getReader();
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
        if (evt.type === "text" && evt.content) onText(evt.content);
        if (evt.type === "tool_call" && evt.name) onToolCall(evt.name);
        if (evt.type === "navigate") onNavigate(evt.path, evt.prefill, evt.reason || "");
        if (evt.type === "error") throw new Error(evt.message);
      } catch (e: any) {
        if (e.message && !e.message.includes("JSON")) throw e;
      }
    }
  }
}

// ── Voice recorder ────────────────────────────────────────────────────────────
async function transcribeAudio(audioBlob: Blob): Promise<string> {
  const arrayBuffer = await audioBlob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  const base64 = btoa(binary);
  const res = await fetch(`${BASE}/api/agent/transcribe`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    credentials: "include", body: JSON.stringify({ audio: base64 }),
  });
  if (!res.ok) throw new Error("Transcription failed");
  return (await res.json()).text;
}

function useVoiceRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const mrRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
    const mr = new MediaRecorder(stream, { mimeType });
    chunksRef.current = [];
    mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    mr.start(250);
    mrRef.current = mr;
    setIsRecording(true);
  }, []);

  const stopRecording = useCallback((): Promise<Blob> => new Promise((resolve) => {
    const mr = mrRef.current;
    if (!mr) return resolve(new Blob());
    mr.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mr.mimeType });
      mr.stream.getTracks().forEach(t => t.stop());
      mrRef.current = null;
      setIsRecording(false);
      resolve(blob);
    };
    mr.stop();
  }), []);

  return { isRecording, startRecording, stopRecording };
}

// ── Main component ─────────────────────────────────────────────────────────────
export function AgentPanel() {
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [navStatus, setNavStatus] = useState<string>("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const { isRecording, startRecording, stopRecording } = useVoiceRecorder();
  const [, navigate] = useLocation();
  const [memory] = useState<string[]>(() => loadMemory());

  const hasMessages = messages.length > 0;

  useEffect(() => {
    if (open && !minimized) setTimeout(() => inputRef.current?.focus(), 150);
  }, [open, minimized]);

  useEffect(() => {
    if (!minimized) messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, minimized]);

  const chatHistory = messages
    .filter(m => m.content)
    .map(m => ({ role: m.role, content: m.content }));

  const handleNavigate = useCallback((path: string, prefill: any, reason: string) => {
    if (prefill) (window as any).__ariaPrefill = prefill;
    const label = PATH_LABELS[path] || path;
    setNavStatus(reason || `Opening ${label}`);
    setMinimized(true);
    navigate(path);
    setTimeout(() => {
      setMinimized(false);
      setNavStatus("");
    }, 1800);
  }, [navigate]);

  const sendMessage = useCallback(
    async (userText: string, fromVoice = false) => {
      if (!userText.trim() || isThinking) return;

      const userMsg: Message = { id: Date.now().toString(), role: "user", content: userText.trim(), fromVoice };
      const assistantId = `asst-${Date.now()}`;
      const assistantMsg: Message = { id: assistantId, role: "assistant", content: "", toolCalls: [] };

      setMessages(prev => [...prev, userMsg, assistantMsg]);
      setInput("");
      setIsThinking(true);

      const history = [...chatHistory, { role: "user", content: userText.trim() }];
      abortRef.current = new AbortController();
      let fullResponse = "";

      try {
        await streamAgentChat(
          history,
          memory,
          (chunk) => {
            fullResponse += chunk;
            setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: fullResponse } : m));
          },
          (toolName) => {
            setMessages(prev => prev.map(m =>
              m.id === assistantId ? { ...m, toolCalls: [...(m.toolCalls ?? []), toolName] } : m,
            ));
          },
          (path, prefill, reason) => {
            const label = PATH_LABELS[path] || path;
            setMessages(prev => prev.map(m =>
              m.id === assistantId ? { ...m, navigated: { path, label } } : m,
            ));
            handleNavigate(path, prefill, reason);
          },
          abortRef.current.signal,
        );

        const invMatch = fullResponse.match(/\b(INV-\d+)\b/);
        const qtMatch = fullResponse.match(/\b(QT-\d+)\b/);
        if (invMatch) {
          setMessages(prev => prev.map(m =>
            m.id === assistantId ? { ...m, docRef: { number: invMatch[1], path: "/invoices" } } : m,
          ));
          appendMemory(`Created invoice ${invMatch[1]}`);
        } else if (qtMatch) {
          setMessages(prev => prev.map(m =>
            m.id === assistantId ? { ...m, docRef: { number: qtMatch[1], path: "/quotations" } } : m,
          ));
          appendMemory(`Created quotation ${qtMatch[1]}`);
        }

        if (fromVoice && fullResponse) fetchAndPlayText(fullResponse.slice(0, 600));
      } catch (e: any) {
        if (e.name !== "AbortError") {
          setMessages(prev => prev.map(m =>
            m.id === assistantId ? { ...m, content: "Something went wrong — please try again." } : m,
          ));
        }
      } finally {
        setIsThinking(false);
        abortRef.current = null;
      }
    },
    [isThinking, chatHistory, memory, handleNavigate],
  );

  const handleSubmit = () => sendMessage(input, false);
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input, false); }
  };

  const handleMic = async () => {
    if (transcribing) return;
    if (isRecording) {
      const blob = await stopRecording();
      if (blob.size < 1000) return;
      setTranscribing(true);
      try {
        const text = await transcribeAudio(blob);
        if (text.trim()) await sendMessage(text, true);
      } catch {} finally { setTranscribing(false); }
    } else {
      await startRecording();
    }
  };

  const handleReplay = (text: string) => fetchAndPlayText(text.slice(0, 600));
  const handleStopAudio = () => {
    if (_currentAudio) { _currentAudio.pause(); _currentAudio.src = ""; _currentAudio = null; }
  };
  const clearChat = () => { handleStopAudio(); setMessages([]); };
  const handleClose = () => { handleStopAudio(); setOpen(false); setMinimized(false); };

  // ── Trigger button (closed) ─────────────────────────────────────────────────
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 bg-primary text-primary-foreground rounded-full px-5 py-3 shadow-xl hover:bg-primary/90 transition-all hover:scale-105 active:scale-95"
        title="Ask Aria"
      >
        <Sparkles className="h-4 w-4" />
        <span className="text-sm font-semibold">Ask Aria</span>
      </button>
    );
  }

  // ── Minimized pill ─────────────────────────────────────────────────────────
  if (minimized) {
    return (
      <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-background/90 backdrop-blur-xl border border-border/50 rounded-full pl-4 pr-5 py-3 shadow-2xl">
        <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/20">
          <Navigation className="h-3 w-3 text-primary" />
        </div>
        <Loader2 className="h-3.5 w-3.5 text-primary animate-spin" />
        <span className="text-sm text-foreground/80">{navStatus || "Aria is working…"}</span>
      </div>
    );
  }

  // ── Full-screen centered dialog ─────────────────────────────────────────────
  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Centered dialog */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="pointer-events-auto w-full max-w-2xl flex flex-col rounded-2xl bg-background shadow-2xl border border-border/20 overflow-hidden"
          style={{ height: "min(82vh, 760px)" }}
          onClick={e => e.stopPropagation()}
        >
          {/* Top bar */}
          <div className="flex items-center justify-between px-5 pt-4 pb-3 shrink-0">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-primary text-primary-foreground shadow-sm">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold leading-none">Aria</p>
                <p className="text-xs text-muted-foreground mt-0.5">AI assistant for RSV Infotech</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {hasMessages && (
                <button
                  onClick={clearChat}
                  className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                  title="New conversation"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
              )}
              <button
                onClick={() => setMinimized(true)}
                className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                title="Minimize"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
              <button
                onClick={handleClose}
                className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Messages / Welcome */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {!hasMessages ? (
              /* Welcome screen */
              <div className="flex flex-col items-center justify-center h-full px-6 pb-4 text-center gap-6">
                <div className="flex flex-col items-center gap-3">
                  <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 text-primary">
                    <Sparkles className="h-8 w-8" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-semibold tracking-tight">Hi, I'm Aria</h2>
                    <p className="text-muted-foreground mt-1 text-sm">
                      Your AI assistant — I can create documents, search data,<br />navigate the app, and answer questions.
                    </p>
                  </div>
                </div>

                {/* Suggestion chips */}
                <div className="flex flex-wrap justify-center gap-2 max-w-lg">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => sendMessage(s)}
                      className="px-4 py-2 rounded-full border border-border bg-muted/40 hover:bg-muted text-sm text-foreground/80 hover:text-foreground transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              /* Chat messages */
              <div className="px-5 py-4 space-y-6">
                {messages.map((msg) => (
                  <div key={msg.id} className={cn("flex gap-3", msg.role === "user" ? "flex-row-reverse" : "flex-row")}>
                    {/* Avatar */}
                    <div className={cn(
                      "shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-xs font-semibold mt-0.5",
                      msg.role === "user"
                        ? "bg-primary/15 text-primary"
                        : "bg-primary text-primary-foreground shadow-sm",
                    )}>
                      {msg.role === "user" ? "You" : <Sparkles className="h-3.5 w-3.5" />}
                    </div>

                    <div className={cn("flex flex-col gap-1.5 max-w-[82%]", msg.role === "user" ? "items-end" : "items-start")}>
                      {/* Tool call badges */}
                      {msg.toolCalls && msg.toolCalls.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {msg.toolCalls.map((tc, i) => (
                            <span key={i} className="text-xs bg-muted text-muted-foreground rounded-full px-2.5 py-1 flex items-center gap-1.5 border border-border/50">
                              {tc === "getFinancialStats" ? (
                                <BarChart2 className="h-2.5 w-2.5" />
                              ) : tc === "navigateTo" ? (
                                <Navigation className="h-2.5 w-2.5" />
                              ) : (
                                <Loader2 className="h-2.5 w-2.5 animate-spin" />
                              )}
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

                      {/* Message bubble */}
                      {(msg.content || (!msg.content && msg.id.startsWith("asst-"))) && (
                        <div className={cn(
                          "px-4 py-3 rounded-2xl text-sm leading-relaxed",
                          msg.role === "user"
                            ? "bg-primary text-primary-foreground rounded-tr-sm"
                            : "bg-muted/60 text-foreground rounded-tl-sm border border-border/30",
                        )}>
                          {msg.content ? (
                            <MarkdownText text={msg.content} />
                          ) : (
                            /* Thinking dots */
                            <div className="flex gap-1 items-center h-4 px-1">
                              <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:0ms]" />
                              <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:150ms]" />
                              <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:300ms]" />
                            </div>
                          )}
                          {msg.docRef && (
                            <button
                              onClick={() => { navigate(msg.docRef!.path); handleClose(); }}
                              className="mt-2 flex items-center gap-1.5 text-xs underline underline-offset-2 opacity-70 hover:opacity-100"
                            >
                              <ExternalLink className="h-3 w-3" />
                              Open {msg.docRef.number}
                            </button>
                          )}
                        </div>
                      )}

                      {/* Replay */}
                      {msg.role === "assistant" && msg.content && (
                        <button
                          onClick={() => handleReplay(msg.content)}
                          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors"
                          title="Play this message"
                        >
                          <Volume2 className="h-3 w-3" />
                          Listen
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Input area */}
          <div className="shrink-0 border-t border-border/30 px-4 py-4 bg-background">
            <div className="flex items-end gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2 focus-within:ring-2 focus-within:ring-primary/30 focus-within:border-primary/50 transition-all">
              <button
                onClick={handleMic}
                disabled={transcribing || isThinking}
                className={cn(
                  "shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all mb-0.5",
                  isRecording
                    ? "bg-red-500 text-white animate-pulse shadow"
                    : transcribing
                      ? "text-muted-foreground cursor-wait"
                      : "text-muted-foreground hover:text-foreground",
                )}
                title={isRecording ? "Stop recording" : "Speak"}
              >
                {transcribing ? <Loader2 className="h-4 w-4 animate-spin" /> : isRecording ? <Square className="h-3.5 w-3.5 fill-current" /> : <Mic className="h-4 w-4" />}
              </button>

              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={isRecording ? "🔴 Listening…" : "Ask Aria anything…"}
                rows={1}
                disabled={isThinking || isRecording || transcribing}
                className="flex-1 resize-none bg-transparent text-sm focus:outline-none disabled:opacity-50 min-h-[32px] max-h-[140px] overflow-y-auto py-1.5 placeholder:text-muted-foreground/60"
                onInput={e => {
                  const el = e.currentTarget;
                  el.style.height = "auto";
                  el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
                }}
              />

              <button
                onClick={handleSubmit}
                disabled={!input.trim() || isThinking || isRecording}
                className="shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 disabled:opacity-30 disabled:cursor-not-allowed transition-all mb-0.5"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </div>

            <p className="text-xs text-muted-foreground text-center mt-2">
              {isRecording ? "Tap ■ to stop · Aria will speak back" : "Enter to send · mic icon for voice"}
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
