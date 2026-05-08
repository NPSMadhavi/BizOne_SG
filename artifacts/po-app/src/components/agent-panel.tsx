import { useState, useRef, useEffect, useCallback } from "react";
import { X, Send, Mic, Volume2, Loader2, Sparkles, ExternalLink, Square, ChevronDown, BarChart2, Navigation } from "lucide-react";
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

// ── Memory persistence ────────────────────────────────────────────────────────
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
function MarkdownText({ text, isUser }: { text: string; isUser: boolean }) {
  if (!text) return null;
  const lines = text.split("\n");
  return (
    <div className="space-y-0.5">
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
        if (!line.trim()) return <div key={li} className="h-1" />;
        if (isBullet) {
          return (
            <div key={li} className="flex gap-2 items-baseline">
              <span className={cn("shrink-0 w-1.5 h-1.5 rounded-full mt-[5px]", isUser ? "bg-primary-foreground/60" : "bg-foreground/30")} />
              <span>{segments.length ? segments : content}</span>
            </div>
          );
        }
        return <div key={li}>{segments.length ? segments : line}</div>;
      })}
    </div>
  );
}

// ── Tool labels ───────────────────────────────────────────────────────────────
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

// ── Path → label ──────────────────────────────────────────────────────────────
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

// ── Audio ─────────────────────────────────────────────────────────────────────
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

// ── Welcome message ───────────────────────────────────────────────────────────
const WELCOME: Message = {
  id: "welcome",
  role: "assistant",
  content: "Hi, I'm Aria — your AI assistant for RSV Infotech.\n\nJust tell me what you need:\n• Create an invoice or quotation\n• Convert a quotation to invoice\n• Show me this quarter's revenue\n• Search customers or stock items\n• Go to the invoices module\n\nI'll search, gather the data, and get it done.",
};

// ── Main component ─────────────────────────────────────────────────────────────
export function AgentPanel() {
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
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

  useEffect(() => {
    if (open && !minimized) setTimeout(() => inputRef.current?.focus(), 150);
  }, [open, minimized]);

  useEffect(() => {
    if (!minimized) messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, minimized]);

  const chatHistory = messages
    .filter(m => m.id !== "welcome" && m.content)
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

        // Extract doc refs (INV-XXXX, QT-XXXX)
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
  const clearChat = () => { handleStopAudio(); setMessages([WELCOME]); };
  const handleClose = () => { handleStopAudio(); setOpen(false); setMinimized(false); };

  // ── Closed state ────────────────────────────────────────────────────────────
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-primary text-primary-foreground rounded-full px-4 py-3 shadow-xl hover:bg-primary/90 transition-all hover:scale-105 active:scale-95"
        title="Open Aria"
      >
        <Sparkles className="h-4 w-4" />
        <span className="text-sm font-semibold">Aria</span>
      </button>
    );
  }

  // ── Minimized / navigating pill ─────────────────────────────────────────────
  if (minimized) {
    return (
      <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-background/90 backdrop-blur-xl border border-border/50 rounded-full pl-4 pr-5 py-3 shadow-2xl animate-pulse-slow">
        <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/20">
          <Navigation className="h-3 w-3 text-primary" />
        </div>
        <div className="flex items-center gap-2">
          <Loader2 className="h-3.5 w-3.5 text-primary animate-spin" />
          <span className="text-sm text-foreground/80">{navStatus || "Aria is working…"}</span>
        </div>
      </div>
    );
  }

  // ── Open panel ──────────────────────────────────────────────────────────────
  const hasToolActivity = isThinking && messages.some(m => m.toolCalls && m.toolCalls.length > 0);

  return (
    <>
      {/* Subtle background dim — click through so app remains usable */}
      <div className="fixed inset-0 z-40 bg-black/20 pointer-events-none" />

      {/* Glass panel */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col w-[420px] rounded-2xl shadow-2xl border border-border/40 bg-background/85 backdrop-blur-xl overflow-hidden"
        style={{ maxHeight: "calc(100vh - 48px)" }}>

        {/* Header */}
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border/30 bg-primary/90 backdrop-blur-md text-primary-foreground shrink-0">
          <div className="flex items-center justify-center w-7 h-7 rounded-full bg-primary-foreground/20">
            <Sparkles className="h-3.5 w-3.5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold leading-none">Aria</p>
            <p className="text-xs opacity-70 mt-0.5 truncate">
              {hasToolActivity ? "Working…" : "AI Assistant · voice replies when you speak"}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setMinimized(true)}
              className="p-1.5 rounded-md text-primary-foreground/60 hover:text-primary-foreground hover:bg-primary-foreground/10 transition-colors"
              title="Minimize"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
            <button
              onClick={handleClose}
              className="p-1.5 rounded-md text-primary-foreground/60 hover:text-primary-foreground hover:bg-primary-foreground/10 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-0">
          {messages.map((msg) => (
            <div key={msg.id} className={cn("flex flex-col gap-1", msg.role === "user" ? "items-end" : "items-start")}>
              {/* Tool call badges */}
              {msg.toolCalls && msg.toolCalls.length > 0 && (
                <div className="flex flex-wrap gap-1 max-w-[90%]">
                  {msg.toolCalls.map((tc, i) => (
                    <span key={i} className="text-xs bg-muted/70 backdrop-blur-sm text-muted-foreground rounded-full px-2.5 py-0.5 flex items-center gap-1 border border-border/30">
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
                <div className="flex items-center gap-1.5 text-xs text-primary bg-primary/10 border border-primary/20 rounded-full px-2.5 py-1">
                  <Navigation className="h-3 w-3" />
                  Navigated to {msg.navigated.label}
                </div>
              )}

              {/* Message bubble */}
              {(msg.content || msg.id === "welcome") && (
                <div className={cn(
                  "max-w-[90%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed",
                  msg.role === "user"
                    ? "bg-primary/90 text-primary-foreground rounded-br-sm backdrop-blur-sm"
                    : "bg-muted/70 text-foreground rounded-bl-sm border border-border/30 backdrop-blur-sm",
                )}>
                  <MarkdownText text={msg.content} isUser={msg.role === "user"} />
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
              {msg.role === "assistant" && msg.content && msg.id !== "welcome" && (
                <button
                  onClick={() => handleReplay(msg.content)}
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                  title="Play this message"
                >
                  <Volume2 className="h-3 w-3" />
                  Listen
                </button>
              )}
            </div>
          ))}

          {/* Thinking indicator */}
          {isThinking && messages[messages.length - 1]?.content === "" && (
            <div className="flex items-start">
              <div className="bg-muted/70 backdrop-blur-sm border border-border/30 rounded-2xl rounded-bl-sm px-3.5 py-2.5">
                <div className="flex gap-1 items-center h-4">
                  <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:0ms]" />
                  <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:150ms]" />
                  <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:300ms]" />
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input bar */}
        <div className="border-t border-border/30 px-3 py-3 shrink-0 bg-background/60 backdrop-blur-md">
          <div className="flex items-end gap-2">
            <button
              onClick={handleMic}
              disabled={transcribing || isThinking}
              className={cn(
                "shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-all",
                isRecording
                  ? "bg-red-500 text-white animate-pulse shadow-md"
                  : transcribing
                    ? "bg-muted text-muted-foreground cursor-wait"
                    : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground border border-border/30",
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
              className="flex-1 resize-none rounded-xl border border-border/40 bg-muted/40 backdrop-blur-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50 min-h-[36px] max-h-[120px] overflow-y-auto"
              style={{ height: "auto" }}
              onInput={e => {
                const el = e.currentTarget;
                el.style.height = "auto";
                el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
              }}
            />

            <button
              onClick={handleSubmit}
              disabled={!input.trim() || isThinking || isRecording}
              className="shrink-0 w-9 h-9 rounded-full bg-primary/90 text-primary-foreground flex items-center justify-center hover:bg-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>

          <div className="flex items-center justify-between mt-1.5 px-1">
            <p className="text-xs text-muted-foreground">
              {isRecording ? "Tap ■ to stop · Aria will speak back" : "Enter to send · mic = voice reply"}
            </p>
            {messages.length > 1 && (
              <button onClick={clearChat} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                Clear
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
