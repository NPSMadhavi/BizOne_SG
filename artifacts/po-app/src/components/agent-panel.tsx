import { useState, useRef, useEffect, useCallback } from "react";
import {
  Send, Mic, Volume2, Loader2, Sparkles, ExternalLink,
  Square, BarChart2, Navigation, X, CheckCircle2, Plus, Radio,
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
const MEMORY_KEY = "veda_memory_v1";
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
  searchVendors: "Searching vendors",
  searchQuotations: "Searching quotations",
  getQuotation: "Loading quotation",
  searchStockItems: "Searching catalogue",
  searchPurchaseOrders: "Searching POs",
  getPurchaseOrder: "Loading PO",
  searchInvoices: "Searching invoices",
  getInvoice: "Loading invoice",
  searchDeliveryOrders: "Searching delivery orders",
  getDeliveryOrder: "Loading delivery order",
  searchVendorInvoices: "Searching vendor invoices",
  searchGRN: "Searching GRN",
  getCompanySettings: "Loading settings",
  getFinancialStats: "Calculating stats",
  fillCurrentForm: "Updating form",
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
  "/accounting": "Accounting",
  "/accounting/gst-f5": "GST F5",
  "/expenses": "Expenses",
  "/admin/users": "Admin — Users",
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

// ── Browser TTS — voice cache (must load BEFORE first speak call) ─────────
let _cachedVoice: SpeechSynthesisVoice | null = null;

function pickBestVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  // Priority: Indian English (clear, neutral, non-Western accent) →
  //           Google US English (crisp synthesis) → neutral US voices → fallback
  return (
    // Indian English female — Microsoft/Google (Heera = Windows en-IN, Neerja = some Windows)
    voices.find(v => /heera|neerja/i.test(v.name))
    // Google Indian English (Chrome on some platforms)
    || voices.find(v => v.lang === "en-IN" && /google/i.test(v.name))
    // Any en-IN local voice
    || voices.find(v => v.lang === "en-IN" && v.localService)
    // Google US English (very clean synthesis, available in Chrome)
    || voices.find(v => /google us english/i.test(v.name))
    // Clear US female voices (macOS/Windows)
    || voices.find(v => /samantha/i.test(v.name))   // macOS — clear US
    || voices.find(v => /zira/i.test(v.name))        // Windows — clear US
    // Any Google English voice (avoid Google UK Female — too accented for this app)
    || voices.find(v => /google/i.test(v.name) && v.lang.startsWith("en")
        && !/uk.*male|uk.*female|australian|ireland/i.test(v.name))
    // Any Google English voice as last resort
    || voices.find(v => /google/i.test(v.name) && v.lang.startsWith("en"))
    // Any en-US local voice that isn't a male or joke voice
    || voices.find(v => v.lang === "en-US" && v.localService
        && !/\b(alex|daniel|fred|lee|tom|ralph|albert|bruce|jorge|trinoids|bubbles|zarvox|whisper|bells)\b/i.test(v.name))
    // Widest net fallback
    || voices.find(v => v.lang.startsWith("en") && v.localService
        && !/\b(alex|daniel|fred|lee|tom|ralph|albert|bruce|jorge|trinoids|bubbles|zarvox|whisper|bells)\b/i.test(v.name))
    || null
  );
}

// Eagerly cache voice — runs at module load and again when voices change
function _initVoiceCache() {
  if (!window.speechSynthesis) return;
  const voices = window.speechSynthesis.getVoices();
  if (voices.length > 0) {
    _cachedVoice = null; // reset before re-picking so priority changes take effect
    _cachedVoice = pickBestVoice(voices);
  }
}
if (typeof window !== "undefined" && window.speechSynthesis) {
  _cachedVoice = null; // always start fresh (ensures code change takes effect on reload)
  window.speechSynthesis.addEventListener("voiceschanged", _initVoiceCache);
  _initVoiceCache();
}

let _browserTtsResolve: (() => void) | null = null;
function speakBrowser(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (!window.speechSynthesis) { resolve(); return; }
    window.speechSynthesis.cancel();
    _browserTtsResolve?.();
    _browserTtsResolve = resolve;
    const clean = text.replace(/\*\*/g, "").replace(/\*/g, "").replace(/#{1,6}\s/g, "").replace(/`/g, "").replace(/•\s*/g, "").trim();
    if (!clean) { _browserTtsResolve = null; resolve(); return; }
    const utt = new SpeechSynthesisUtterance(clean);
    utt.rate = 1.0;
    utt.pitch = 1.05;
    utt.volume = 1.0;
    // Use pre-cached voice; fall back to fresh lookup if voiceschanged hasn't fired yet
    const voice = _cachedVoice ?? pickBestVoice(window.speechSynthesis.getVoices());
    if (voice) utt.voice = voice;
    utt.onend = () => { _browserTtsResolve = null; resolve(); };
    utt.onerror = () => { _browserTtsResolve = null; resolve(); };
    window.speechSynthesis.speak(utt);
  });
}

// ── API Audio ──────────────────────────────────────────────────────────────
let _audio: HTMLAudioElement | null = null;
function playAudio(b64: string): Promise<void> {
  return new Promise((resolve) => {
    if (_audio) { _audio.pause(); _audio.src = ""; _audio = null; }
    const a = new Audio(`data:audio/mp3;base64,${b64}`);
    _audio = a;
    a.onended = () => { _audio = null; resolve(); };
    a.onerror = () => { _audio = null; resolve(); };
    a.play().catch(() => { _audio = null; resolve(); });
  });
}

async function speakApi(text: string): Promise<boolean> {
  try {
    const r = await fetch(`${BASE}/api/agent/speak`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      credentials: "include", body: JSON.stringify({ text }),
    });
    if (!r.ok) return false;
    const { audio } = await r.json();
    if (!audio) return false;
    await playAudio(audio);
    return true;
  } catch {
    return false;
  }
}

async function speak(text: string): Promise<void> {
  const clean = text.replace(/\*\*/g, "").replace(/\*/g, "").replace(/#{1,6}\s/g, "").replace(/`/g, "").replace(/•\s*/g, "").trim().slice(0, 600);
  if (!clean) return;
  // Use browser TTS (instant, always available). Try API in background for future quality upgrade.
  await speakBrowser(clean);
  // Silently attempt API for higher-quality audio (non-blocking, just warms it up)
  speakApi(clean).catch(() => {});
}

// ── SSE stream ────────────────────────────────────────────────────────────────
async function streamChat(
  messages: { role: string; content: string }[],
  memory: string[],
  onText: (c: string) => void,
  onTool: (n: string) => void,
  onNav: (path: string, prefill: any, reason: string) => void,
  signal: AbortSignal,
  onFill?: (fields: Record<string, any>) => void,
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
        if (ev.type === "fill_form" && ev.fields) onFill?.(ev.fields);
        if (ev.type === "error") throw new Error(ev.message);
      } catch (e: any) { if (e.message && !e.message.includes("JSON")) throw e; }
    }
  }
}

// ── MediaRecorder voice hook ───────────────────────────────────────────────────
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

  const start = useCallback(async (): Promise<boolean> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
      const mr = new MediaRecorder(stream, { mimeType: mime });
      chunks.current = [];
      mr.ondataavailable = e => { if (e.data.size > 0) chunks.current.push(e.data); };
      mr.start(250); mrRef.current = mr; setRecording(true);
      return true;
    } catch {
      setRecording(false);
      return false;
    }
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

// ── Wake word hook (single-shot loop — far more reliable than continuous) ─────
const WAKE_WORDS = /\b(veda|veeda|vida|beta|beda|vetta|weda)\b/i;

function useWakeWord(
  onWakeWord: () => void,
  enabled: boolean,
  onMicError?: (code: string) => void,
) {
  const recRef = useRef<any>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enabledRef = useRef(enabled);
  const onWakeRef = useRef(onWakeWord);
  const onMicErrRef = useRef(onMicError);
  enabledRef.current = enabled;
  onWakeRef.current = onWakeWord;
  onMicErrRef.current = onMicError;

  const stopListening = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    if (recRef.current) {
      try { recRef.current.abort(); } catch {}
      recRef.current = null;
    }
  }, []);

  const startListening = useCallback(() => {
    if (!enabledRef.current || recRef.current) return;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    try {
      const rec = new SR();
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = "en-US";
      rec.maxAlternatives = 5;
      recRef.current = rec;

      rec.onresult = (evt: any) => {
        for (let i = 0; i < evt.results.length; i++) {
          for (let j = 0; j < evt.results[i].length; j++) {
            const t = (evt.results[i][j].transcript || "").toLowerCase().trim();
            if (WAKE_WORDS.test(t)) {
              recRef.current = null;
              onWakeRef.current();
              return;
            }
          }
        }
      };

      rec.onerror = (e: any) => {
        recRef.current = null;
        // Permission blocked → stop retrying, surface the error to the UI
        if (e.error === "not-allowed" || e.error === "service-not-allowed") {
          onMicErrRef.current?.(e.error);
          return; // do NOT restart — would just loop permission errors
        }
        // "no-speech" is normal — restart fast; other transient errors wait
        const delay = e.error === "no-speech" ? 100 : 1500;
        if (enabledRef.current) timerRef.current = setTimeout(startListening, delay);
      };

      rec.onend = () => {
        recRef.current = null;
        if (enabledRef.current) timerRef.current = setTimeout(startListening, 150);
      };

      rec.start();
    } catch {
      recRef.current = null;
      if (enabledRef.current) timerRef.current = setTimeout(startListening, 2000);
    }
  }, []);

  useEffect(() => {
    if (enabled) {
      // 2 s delay on every (re)enable — gives ambient greeting time to finish
      // and lets the mic fully release after a conversation ends before we start again
      timerRef.current = setTimeout(startListening, 2000);
    } else {
      stopListening();
    }
    return stopListening;
  }, [enabled, startListening, stopListening]);

  const supported = !!(
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  );
  return { supported };
}

// ── Ambient single-shot voice capture (auto-stops on silence — browser VAD) ────
function listenForCommand(onInterim: (t: string) => void, signal?: AbortSignal): Promise<string> {
  return new Promise((resolve) => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { resolve(""); return; }

    let resolved = false;
    let finalText = "";
    let silenceTimer: ReturnType<typeof setTimeout> | null = null;
    let maxTimer: ReturnType<typeof setTimeout> | null = null;

    const done = (text: string) => {
      if (resolved) return;
      resolved = true;
      if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = null; }
      if (maxTimer) { clearTimeout(maxTimer); maxTimer = null; }
      try { rec.abort(); } catch {}
      resolve(text);
    };

    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = "en-US";
    rec.maxAlternatives = 1;

    // Hard cap: if nothing resolves within 10s, give up (prevents forever-listening)
    maxTimer = setTimeout(() => done(finalText), 10000);

    signal?.addEventListener("abort", () => done(finalText));

    rec.onresult = (evt: any) => {
      for (let i = evt.resultIndex; i < evt.results.length; i++) {
        const t = evt.results[i][0].transcript;
        if (evt.results[i].isFinal) {
          finalText = t;
          // Short pause after final result before stopping (allows follow-up words)
          if (silenceTimer) clearTimeout(silenceTimer);
          silenceTimer = setTimeout(() => done(finalText), 800);
        } else {
          onInterim(t);
          // Reset silence countdown on any interim speech
          if (silenceTimer) clearTimeout(silenceTimer);
          silenceTimer = setTimeout(() => done(finalText), 2500);
        }
      }
    };

    rec.onerror = (e: any) => {
      // "no-speech" = silence detected — resolve normally (empty = loop continues waiting)
      done(finalText);
    };
    rec.onend = () => done(finalText);

    try { rec.start(); } catch { done(""); }
  });
}

// ── Component ─────────────────────────────────────────────────────────────────
type ConvState = "idle" | "greeting" | "listening" | "processing" | "speaking";

export function AgentPanel() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [micError, setMicError] = useState(false);
  const [ambientMode, setAmbientMode] = useState(() => {
    try { return localStorage.getItem("veda_ambient") === "1"; } catch { return false; }
  });
  // Ambient conversation state machine
  const [convState, setConvState] = useState<ConvState>("idle");
  const [convText, setConvText] = useState("");
  const convActiveRef = useRef(false);
  const ambientAbortRef = useRef<AbortController | null>(null);
  const ambientHistoryRef = useRef<{ role: string; content: string }[]>([]);

  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const { recording, start, stop } = useVoice();
  const [, navigate] = useLocation();
  const [memory] = useState(() => loadMemory());

  const hasMessages = messages.length > 0;

  // ── Ambient conversation loop ──
  const runAmbientConversation = useCallback(async () => {
    if (convActiveRef.current) return;
    convActiveRef.current = true;
    const ctrl = new AbortController();
    ambientAbortRef.current = ctrl;
    ambientHistoryRef.current = [];

    try {
      setConvState("greeting");
      setConvText("Yes, how can I help you?");
      await speak("Yes, how can I help you?");

      let silenceStreak = 0;
      let pendingCommand = ""; // carries user speech that interrupted TTS

      while (convActiveRef.current) {
        setConvState("listening");
        setConvText("");

        let command: string;
        if (pendingCommand) {
          // User spoke while Veda was talking — skip listen, use that text directly
          command = pendingCommand;
          pendingCommand = "";
          silenceStreak = 0;
        } else {
          command = await listenForCommand(t => setConvText(t), ctrl.signal);
          if (ctrl.signal.aborted || !convActiveRef.current) break;
          if (!command.trim()) {
            silenceStreak++;
            if (silenceStreak >= 2) break; // two silent rounds → end conversation
            continue; // retry once on first silence
          }
          silenceStreak = 0;
        }

        if (/\b(stop|bye|goodbye|that'?s all|thanks veda|thank you|no thanks|done|exit|close)\b/i.test(command)) {
          setConvState("speaking");
          setConvText("Alright!");
          await speak("Alright. Call my name whenever you need me.");
          break;
        }

        setConvState("processing");
        setConvText(command);

        let response = "";
        try {
          await streamChat(
            [...ambientHistoryRef.current, { role: "user", content: command }],
            memory,
            chunk => { response += chunk; setConvText(response.slice(-150)); },
            () => {},
            (path, prefill) => { if (prefill) (window as any).__vedaPrefill = prefill; navigate(path); },
            ctrl.signal,
            (fields) => window.dispatchEvent(new CustomEvent("veda:fill-form", { detail: fields })),
          );
          if (response) {
            ambientHistoryRef.current = [
              ...ambientHistoryRef.current,
              { role: "user", content: command },
              { role: "assistant", content: response },
            ].slice(-16);
            setConvState("speaking");
            setConvText(response.slice(0, 240));

            // ── Speak with interruption support ─────────────────────────────
            // Race TTS against a parallel mic listener. If the user speaks
            // before Veda finishes, cancel TTS and carry their words forward.
            const interruptCtrl = new AbortController();
            const [interruptText] = await Promise.race([
              speak(response.slice(0, 600)).then(() => [""]),
              listenForCommand(
                t => setConvText(`↩ ${t}`),
                interruptCtrl.signal,
              ).then(t => [t]),
            ]);
            interruptCtrl.abort();          // stop listener if TTS finished first
            window.speechSynthesis.cancel(); // stop TTS if listener finished first

            if (interruptText.trim()) {
              pendingCommand = interruptText; // process interrupt as next command
              silenceStreak = 0;
            }
          }
        } catch (e: any) {
          if (e.name === "AbortError" || ctrl.signal.aborted) break;
          await speak("I ran into an issue. Please try again.");
          break;
        }
      }
    } finally {
      convActiveRef.current = false;
      ambientAbortRef.current = null;
      // Brief pause so the mic from the last listenForCommand fully releases
      // before the wake-word hook tries to claim it again. Without this gap,
      // the new SpeechRecognition can silently fail, leaving "Veda" unresponsive.
      await new Promise(r => setTimeout(r, 700));
      setConvState("idle");
      setConvText("");
    }
  }, [navigate, memory]);

  const handleWakeWord = useCallback(() => {
    runAmbientConversation();
  }, [runAmbientConversation]);

  const stopConversation = useCallback(() => {
    convActiveRef.current = false;
    ambientAbortRef.current?.abort();
    window.speechSynthesis?.cancel();
    setConvState("idle");
    setConvText("");
  }, []);

  // Wake word error state (set when mic permission is denied/blocked in this context)
  const [wakeError, setWakeError] = useState<string | null>(null);

  // Wake word only active when ambient on AND no active conversation
  const { supported: wakeSupported } = useWakeWord(
    handleWakeWord,
    ambientMode && convState === "idle",
    (code) => setWakeError(code),
  );

  const toggleAmbient = useCallback(() => {
    setAmbientMode(v => {
      const next = !v;
      try { localStorage.setItem("veda_ambient", next ? "1" : "0"); } catch {}
      if (next) {
        setWakeError(null); // clear any previous block error on re-enable
        speak("Ambient mode on. Say my name to get started.");
      }
      return next;
    });
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  // Scroll to bottom when messages update
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Keyboard shortcuts: Escape = close panel; Alt+M = trigger Veda (reliable iframe fallback)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { close(); return; }
      if (e.altKey && e.key.toLowerCase() === "m" && convState === "idle" && !open) {
        e.preventDefault();
        runAmbientConversation();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [convState, open, runAmbientConversation]);

  // Auto-clear mic error after 3 seconds
  useEffect(() => {
    if (!micError) return;
    const t = setTimeout(() => setMicError(false), 3000);
    return () => clearTimeout(t);
  }, [micError]);

  const history = messages.filter(m => m.content).map(m => ({ role: m.role, content: m.content }));

  const handleNavigate = useCallback((path: string, prefill: any, reason: string) => {
    if (prefill) (window as any).__vedaPrefill = prefill;
    const label = PATH_LABELS[path] || reason || path.split("/").filter(Boolean).map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(" ");
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
        (fields) => window.dispatchEvent(new CustomEvent("veda:fill-form", { detail: fields })),
      );
      const inv = full.match(/\b(INV-\d+)\b/);
      const qt = full.match(/\b(QT-\d+)\b/);
      if (inv) { setMessages(p => p.map(m => m.id === aid ? { ...m, complete: true, docRef: { number: inv[1], path: "/invoices" } } : m)); appendMemory(`Created invoice ${inv[1]}`); }
      else if (qt) { setMessages(p => p.map(m => m.id === aid ? { ...m, complete: true, docRef: { number: qt[1], path: "/quotations" } } : m)); appendMemory(`Created quotation ${qt[1]}`); }
      else { setMessages(p => p.map(m => m.id === aid ? { ...m, complete: true } : m)); }
      if (fromVoice && full) await speak(full.slice(0, 600));
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
    } else {
      const ok = await start();
      if (!ok) setMicError(true);
    }
  };

  const stopAudio = () => {
    if (_audio) { _audio.pause(); _audio.src = ""; _audio = null; }
    window.speechSynthesis?.cancel();
    _browserTtsResolve?.();
  };
  const clear = () => { stopAudio(); setMessages([]); };
  const close = () => { stopAudio(); setOpen(false); };

  return (
    <>
      {/* ── Ambient conversation overlay (shown instead of panel during voice conv) ── */}
      {convState !== "idle" && !open && (
        <div className="fixed bottom-24 right-6 z-50 w-72 bg-background border border-border rounded-2xl shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-primary text-primary-foreground flex items-center justify-center">
                <Sparkles className="h-3 w-3" />
              </div>
              <span className="text-sm font-semibold">Veda</span>
              <span className={cn(
                "text-xs transition-colors",
                convState === "listening" ? "text-primary" : "text-muted-foreground",
              )}>
                {convState === "greeting" ? "· hello!" : convState === "listening" ? "· listening…" : convState === "processing" ? "· thinking…" : "· speaking…"}
              </span>
            </div>
            <button
              onClick={stopConversation}
              className="w-6 h-6 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title="Stop conversation"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
          <div className="px-3 py-3 min-h-[64px] flex items-center">
            {convState === "listening" ? (
              <div className="flex items-center gap-3 w-full">
                <div className="flex items-end gap-[3px] shrink-0 h-6">
                  {[2,3,5,6,4,5,3,2].map((h, i) => (
                    <span key={i} className="w-[3px] rounded-full bg-primary animate-pulse"
                      style={{ height: `${h * 3}px`, animationDelay: `${i * 70}ms` }} />
                  ))}
                </div>
                <span className="text-xs text-muted-foreground italic truncate">
                  {convText || "Go ahead…"}
                </span>
              </div>
            ) : convState === "processing" ? (
              <div className="flex items-center gap-2 w-full">
                <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
                <span className="text-xs text-muted-foreground truncate">{convText || "Thinking…"}</span>
              </div>
            ) : (
              <span className="text-sm text-foreground leading-snug line-clamp-4">{convText}</span>
            )}
          </div>
        </div>
      )}

      {/* ── FAB trigger ── */}
      {!open && (
        <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2">
          {/* Ambient mode toggle chip */}
          {wakeSupported && (
            <button
              onClick={toggleAmbient}
              title={ambientMode ? "Ambient mode ON — say 'Veda' anytime" : "Enable ambient mode"}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium shadow-md transition-all",
                ambientMode
                  ? "bg-primary text-primary-foreground animate-pulse"
                  : "bg-background border border-border text-muted-foreground hover:text-foreground",
              )}
            >
              <Radio className="h-3 w-3" />
              {wakeError ? "⚠ Mic blocked" : ambientMode ? "Ambient ON" : "Ambient"}
            </button>
          )}
          <button
            onClick={() => setOpen(true)}
            title="Ask Veda"
            className={cn(
              "relative flex items-center justify-center w-12 h-12 bg-primary text-primary-foreground rounded-full shadow-xl hover:bg-primary/90 transition-all hover:scale-105 active:scale-95",
            )}
          >
            {ambientMode && (
              <span className="absolute inset-0 rounded-full animate-ping bg-primary opacity-25 pointer-events-none" />
            )}
            <Sparkles className="h-5 w-5" />
          </button>
        </div>
      )}

      {/* ── Floating panel ── */}
      {open && (
        <div className="fixed bottom-6 right-6 z-50 pointer-events-none flex flex-col items-end">
          <div className="pointer-events-auto flex flex-col w-[520px] h-[620px] bg-background border border-border rounded-2xl shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-primary text-primary-foreground flex items-center justify-center shadow-sm">
                  <Sparkles className="h-3.5 w-3.5" />
                </div>
                <span className="text-sm font-semibold">Veda</span>
                <span className="text-xs text-muted-foreground">· AI assistant</span>
                {ambientMode && (
                  <span className="flex items-center gap-1 text-xs text-primary font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                    listening
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {/* Ambient toggle */}
                {wakeSupported && (
                  <button
                    onClick={toggleAmbient}
                    title={
                      wakeError
                        ? "Mic blocked by browser — try opening the app in a new tab, or use Alt+M as wake shortcut"
                        : ambientMode
                        ? "Ambient ON — say 'Veda' or press Alt+M"
                        : "Enable ambient mode (say 'Veda' or press Alt+M)"
                    }
                    className={cn(
                      "flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md transition-colors",
                      wakeError
                        ? "bg-yellow-500/10 text-yellow-600 font-medium"
                        : ambientMode
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted",
                    )}
                  >
                    <Radio className="h-3 w-3" />
                    {wakeError ? "⚠ Mic blocked" : ambientMode ? "Ambient ON" : "Ambient"}
                  </button>
                )}
                {hasMessages && (
                  <button
                    onClick={clear}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2.5 py-1.5 rounded-md hover:bg-muted transition-colors"
                  >
                    <Plus className="h-3 w-3" />
                    New
                  </button>
                )}
                <button
                  onClick={close}
                  className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto min-h-0">
              {!hasMessages ? (
                /* ── Welcome ── */
                <div className="flex flex-col items-center justify-center h-full px-6 gap-6">
                  <>
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground mb-1">Hi there</p>
                        <h2 className="text-2xl font-semibold tracking-tight">Where should we start?</h2>
                        {ambientMode && (
                          <p className="text-xs text-primary mt-1.5 flex items-center justify-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                            Say "Veda" anytime to get my attention
                          </p>
                        )}
                      </div>

                      {/* Speak button */}
                      <div className="w-full flex flex-col items-center gap-3">
                        <button
                          onClick={mic}
                          disabled={transcribing}
                          className={cn(
                            "relative w-full flex items-center justify-center gap-3 px-6 py-4 rounded-2xl font-semibold text-base transition-all duration-200 shadow-md select-none",
                            micError
                              ? "bg-red-100 text-red-600 border border-red-200"
                              : recording
                              ? "bg-red-500 text-white shadow-red-200 shadow-lg scale-[1.02]"
                              : transcribing
                              ? "bg-muted text-muted-foreground cursor-wait"
                              : "bg-primary text-primary-foreground hover:bg-primary/90 hover:scale-[1.02] active:scale-[0.98]",
                          )}
                        >
                          {recording && (
                            <span className="absolute inset-0 rounded-2xl animate-ping bg-red-400 opacity-30 pointer-events-none" />
                          )}
                          <span className={cn(
                            "flex items-center justify-center w-9 h-9 rounded-full shrink-0",
                            recording ? "bg-white/20" : "bg-white/15",
                          )}>
                            {transcribing
                              ? <Loader2 className="h-5 w-5 animate-spin" />
                              : recording
                              ? <Square className="h-4 w-4 fill-current" />
                              : <Mic className="h-5 w-5" />}
                          </span>
                          <span className="flex flex-col items-start leading-tight">
                            <span className="text-sm font-semibold">
                              {micError ? "Mic access denied" : transcribing ? "Transcribing…" : recording ? "Listening… tap to stop" : "Speak to Veda"}
                            </span>
                            {!recording && !transcribing && !micError && (
                              <span className="text-xs opacity-70 font-normal">Tap and talk — I'm listening</span>
                            )}
                          </span>
                          {recording && (
                            <span className="ml-auto flex items-center gap-[3px]">
                              {[1,2,3,4,3].map((h, i) => (
                                <span key={i} className="w-[3px] rounded-full bg-white/80 animate-pulse" style={{ height: `${h * 5}px`, animationDelay: `${i * 100}ms` }} />
                              ))}
                            </span>
                          )}
                        </button>

                        <div className="flex items-center gap-3 w-full">
                          <div className="flex-1 h-px bg-border" />
                          <span className="text-xs text-muted-foreground">or type below</span>
                          <div className="flex-1 h-px bg-border" />
                        </div>
                      </div>

                      {/* Text input */}
                      <div className="w-full">
                        <div className="flex items-end gap-2 bg-muted/50 border border-border rounded-xl px-4 py-3 focus-within:ring-2 focus-within:ring-primary/25 focus-within:border-primary/40 transition-all">
                          <textarea
                            ref={inputRef}
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={onKey}
                            placeholder="Ask me anything…"
                            rows={1}
                            className="flex-1 resize-none bg-transparent text-sm focus:outline-none min-h-[24px] max-h-[100px] overflow-y-auto py-0 placeholder:text-muted-foreground/50"
                            onInput={e => {
                              const el = e.currentTarget;
                              el.style.height = "auto";
                              el.style.height = `${Math.min(el.scrollHeight, 100)}px`;
                            }}
                          />
                          <button
                            onClick={submit}
                            disabled={!input.trim()}
                            className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 disabled:opacity-30 disabled:cursor-not-allowed transition-all shrink-0"
                          >
                            <Send className="h-3 w-3" />
                          </button>
                        </div>
                      </div>

                      {/* Chips */}
                      <div className="flex flex-wrap gap-2 justify-center">
                        {SUGGESTIONS.map(s => (
                          <button
                            key={s.label}
                            onClick={() => send(s.label)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border bg-background hover:bg-muted text-xs text-foreground/70 hover:text-foreground transition-colors"
                          >
                            <span>{s.icon}</span>
                            {s.label}
                          </button>
                        ))}
                      </div>
                  </>
                </div>
              ) : (
                /* ── Chat thread ── */
                <div className="px-4 py-4 space-y-5">
                  {messages.map(msg => (
                    <div key={msg.id} className={cn(
                      "flex gap-2.5",
                      msg.role === "user" ? "justify-end" : "justify-start",
                    )}>
                      {msg.role === "assistant" && (
                        <div className="shrink-0 w-6 h-6 rounded-lg bg-primary text-primary-foreground flex items-center justify-center mt-0.5">
                          <Sparkles className="h-3 w-3" />
                        </div>
                      )}

                      <div className={cn(
                        "flex flex-col gap-1.5",
                        msg.role === "user" ? "items-end max-w-[75%]" : "items-start max-w-[85%]",
                      )}>
                        {/* Tool badges */}
                        {msg.toolCalls && msg.toolCalls.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {msg.toolCalls.map((tc, i) => {
                              const done = !!msg.complete;
                              const icon = done
                                ? <CheckCircle2 className="h-2.5 w-2.5 text-emerald-500" />
                                : tc === "getFinancialStats" ? <BarChart2 className="h-2.5 w-2.5" />
                                : tc === "navigateTo" ? <Navigation className="h-2.5 w-2.5" />
                                : <Loader2 className="h-2.5 w-2.5 animate-spin" />;
                              return (
                                <span key={i} className={cn(
                                  "text-xs rounded-full px-2 py-0.5 flex items-center gap-1 border",
                                  done
                                    ? "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-400"
                                    : "bg-muted border-border text-muted-foreground",
                                )}>
                                  {icon}
                                  {TOOL_LABELS[tc] || tc}
                                </span>
                              );
                            })}
                          </div>
                        )}

                        {/* Navigation chip */}
                        {msg.navigated && (
                          <span className="text-xs rounded-full px-2.5 py-1 flex items-center gap-1 bg-blue-50 border border-blue-200 text-blue-700 dark:bg-blue-950/30 dark:border-blue-800 dark:text-blue-400">
                            <Navigation className="h-2.5 w-2.5" />
                            Opened {msg.navigated.label}
                          </span>
                        )}

                        {/* Bubble */}
                        {(msg.content || msg.role === "assistant") && (
                          <div className={cn(
                            "text-sm leading-relaxed",
                            msg.role === "user"
                              ? "bg-primary text-primary-foreground px-3.5 py-2.5 rounded-2xl rounded-tr-sm"
                              : "text-foreground",
                          )}>
                            {msg.content ? (
                              <MarkdownText text={msg.content} />
                            ) : (
                              <div className="flex gap-1 items-center h-4">
                                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:0ms]" />
                                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:150ms]" />
                                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:300ms]" />
                              </div>
                            )}
                            {msg.docRef && (
                              <button
                                onClick={() => { navigate(msg.docRef!.path); close(); }}
                                className="mt-2 flex items-center gap-1 text-xs text-primary hover:underline underline-offset-2"
                              >
                                <ExternalLink className="h-3 w-3" />
                                Open {msg.docRef.number}
                              </button>
                            )}
                          </div>
                        )}

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

                      {msg.role === "user" && (
                        <div className="shrink-0 w-6 h-6 rounded-lg bg-muted text-foreground/60 flex items-center justify-center text-xs font-bold mt-0.5">
                          Y
                        </div>
                      )}
                    </div>
                  ))}
                  <div ref={endRef} />
                </div>
              )}
            </div>

            {/* Bottom input — chat mode */}
            {hasMessages && (
              <div className="shrink-0 border-t border-border px-4 py-3">
                <div className="flex items-end gap-2 bg-muted/40 border border-border rounded-xl px-4 py-2.5 focus-within:ring-2 focus-within:ring-primary/25 focus-within:border-primary/40 transition-all">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={onKey}
                    placeholder={recording ? "🔴 Listening…" : "Ask Veda anything…"}
                    rows={1}
                    disabled={thinking || recording || transcribing}
                    className="flex-1 resize-none bg-transparent text-sm focus:outline-none disabled:opacity-50 min-h-[22px] max-h-[100px] overflow-y-auto py-0 placeholder:text-muted-foreground/50"
                    onInput={e => {
                      const el = e.currentTarget;
                      el.style.height = "auto";
                      el.style.height = `${Math.min(el.scrollHeight, 100)}px`;
                    }}
                  />
                  <div className="flex items-center gap-1.5 shrink-0">
                    {thinking && (
                      <button
                        onClick={() => abortRef.current?.abort()}
                        className="w-7 h-7 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                        title="Stop"
                      >
                        <Square className="h-3 w-3" />
                      </button>
                    )}
                    <div className="relative">
                      <button
                        onClick={mic}
                        disabled={transcribing || thinking}
                        title={micError ? "Mic access denied" : recording ? "Stop" : "Speak"}
                        className={cn(
                          "w-7 h-7 rounded-full flex items-center justify-center transition-all",
                          micError ? "bg-red-100 text-red-500 dark:bg-red-950/40"
                            : recording ? "bg-red-500 text-white animate-pulse"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {transcribing ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : recording ? <Square className="h-3 w-3 fill-current" />
                          : <Mic className="h-3.5 w-3.5" />}
                      </button>
                      {micError && (
                        <div className="absolute bottom-full right-0 mb-1.5 whitespace-nowrap text-xs bg-red-600 text-white px-2 py-0.5 rounded pointer-events-none">
                          Mic denied
                        </div>
                      )}
                    </div>
                    <button
                      onClick={submit}
                      disabled={!input.trim() || thinking || recording}
                      className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    >
                      <Send className="h-3 w-3" />
                    </button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground text-center mt-1.5">
                  Enter to send · Esc to close
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
