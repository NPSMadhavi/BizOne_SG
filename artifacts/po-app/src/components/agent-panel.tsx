import { useState, useRef, useEffect, useCallback } from "react";
import {
  Send, Mic, Volume2, Loader2, Sparkles, ExternalLink,
  Square, BarChart2, Navigation, X, CheckCircle2, Plus, Radio,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth-context";
import { pathToAppModule } from "@/contexts/auth-modules";

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

// ── Track user gesture so we know TTS is unblocked ────────────────────────
let _userHasInteracted = false;
if (typeof window !== "undefined") {
  const _markInteracted = () => { _userHasInteracted = true; };
  window.addEventListener("click", _markInteracted, { once: false, capture: true, passive: true });
  window.addEventListener("keydown", _markInteracted, { once: false, capture: true, passive: true });
  window.addEventListener("touchstart", _markInteracted, { once: false, capture: true, passive: true });
}

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
let _browserTtsTimeout: ReturnType<typeof setTimeout> | null = null;
function speakBrowser(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (!window.speechSynthesis) { resolve(); return; }

    // Clear any prior pending promise and utterance
    if (_browserTtsTimeout) { clearTimeout(_browserTtsTimeout); _browserTtsTimeout = null; }
    window.speechSynthesis.cancel();
    _browserTtsResolve?.();
    _browserTtsResolve = resolve;

    const clean = text.replace(/\*\*/g, "").replace(/\*/g, "").replace(/#{1,6}\s/g, "").replace(/`/g, "").replace(/•\s*/g, "").trim();
    if (!clean) { _browserTtsResolve = null; resolve(); return; }

    const done = () => {
      if (_browserTtsTimeout) { clearTimeout(_browserTtsTimeout); _browserTtsTimeout = null; }
      if (_browserTtsResolve === resolve) { _browserTtsResolve = null; resolve(); }
    };

    // Chrome bug: after cancel(), speak() must be deferred or the utterance is silently dropped.
    // Also set a hard timeout (words * ~80ms + 3s buffer) so the loop never hangs if onend
    // never fires (another known Chrome SpeechSynthesis bug).
    const estimatedMs = Math.max(3000, clean.split(/\s+/).length * 400 + 2000);
    _browserTtsTimeout = setTimeout(done, estimatedMs);

    setTimeout(() => {
      if (_browserTtsResolve !== resolve) return; // already cancelled by a newer call
      const utt = new SpeechSynthesisUtterance(clean);
      utt.rate = 1.0;
      utt.pitch = 1.05;
      utt.volume = 1.0;
      const voice = _cachedVoice ?? pickBestVoice(window.speechSynthesis.getVoices());
      if (voice) utt.voice = voice;
      utt.onend = done;
      utt.onerror = done;
      window.speechSynthesis.speak(utt);
    }, 80); // 80 ms gap after cancel() before next speak()
  });
}

async function speak(text: string): Promise<void> {
  const clean = text.replace(/\*\*/g, "").replace(/\*/g, "").replace(/#{1,6}\s/g, "").replace(/`/g, "").replace(/•\s*/g, "").trim().slice(0, 600);
  if (!clean) return;
  await speakBrowser(clean);
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
  onEmail?: (docType: string, id: number, recipients: string[], docNumber?: string) => void,
  currentPath?: string,
  selectedCompanyId?: number | null,
) {
  const r = await fetch(`${BASE}/api/agent/chat`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    credentials: "include", body: JSON.stringify({ messages, memory, currentPath, selectedCompanyId }), signal,
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
        if (ev.type === "trigger_email") {
          (window as any).__vedaOpenEmail = { recipients: ev.recipients, docType: ev.docType, id: ev.id };
          onEmail?.(ev.docType, ev.id, ev.recipients, ev.docNumber);
        }
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
  const data = await r.json().catch(() => ({} as { text?: string; error?: string }));
  if (!r.ok) throw new Error(data.error || "Transcription failed");
  return data.text || "";
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
// Keep as a plain variable (not const) so HMR always refreshes it in place.
// The hook reads it via a ref so stale useCallback closures always see the latest value.
// Only keep phonetically-close variants of "Veda".
// Removed common English words (weather, better, letter, meter, leader, reader,
// feeder, cedar, vector) that were causing constant false positives.
let WAKE_WORDS = /\b(veda|veeda|vida|vita|veta|veja|beda|vetta|weda|weeder|veeder|vader|feder)\b/i;
const WAKE_WORDS_REF = { current: WAKE_WORDS };
WAKE_WORDS_REF.current = WAKE_WORDS;

function useWakeWord(
  onWakeWord: () => void,
  enabled: boolean,
  onMicError?: (code: string) => void,
  onHeard?: (text: string) => void,
) {
  const recRef     = useRef<any>(null);
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const watchdogRef= useRef<ReturnType<typeof setTimeout> | null>(null);
  const enabledRef = useRef(enabled);
  const onWakeRef  = useRef(onWakeWord);
  const onMicErrRef= useRef(onMicError);
  const onHeardRef = useRef(onHeard);
  enabledRef.current = enabled;
  onWakeRef.current  = onWakeWord;
  onMicErrRef.current= onMicError;
  onHeardRef.current = onHeard;

  const clearWatchdog = useCallback(() => {
    if (watchdogRef.current) { clearTimeout(watchdogRef.current); watchdogRef.current = null; }
  }, []);

  const stopListening = useCallback(() => {
    clearWatchdog();
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    if (recRef.current) {
      try { recRef.current.abort(); } catch {}
      recRef.current = null;
    }
  }, [clearWatchdog]);

  const startListening = useCallback(() => {
    if (!enabledRef.current || recRef.current) return;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    try {
      const rec = new SR();
      rec.continuous      = false;
      rec.interimResults  = false;
      rec.lang            = "en-US";
      rec.maxAlternatives = 8; // more alternatives → more chances to catch "Veda"
      recRef.current      = rec;

      // Watchdog: Chrome sometimes silently hangs (no onresult/onerror/onend).
      // If no event fires within 14 s, force-abort and restart.
      clearWatchdog();
      watchdogRef.current = setTimeout(() => {
        if (recRef.current) {
          try { recRef.current.abort(); } catch {}
          recRef.current = null;
        }
        if (enabledRef.current) timerRef.current = setTimeout(startListening, 400);
      }, 14_000);

      rec.onresult = (evt: any) => {
        clearWatchdog();
        // Collect all alternatives, sorted best-first (Chrome already orders them).
        const heard: string[] = [];
        for (let i = 0; i < evt.results.length; i++) {
          for (let j = 0; j < evt.results[i].length; j++) {
            const t = (evt.results[i][j].transcript || "").toLowerCase().trim();
            if (t) heard.push(t);
          }
        }
        // Show whatever was best-heard in the debug chip
        if (heard.length > 0) onHeardRef.current?.(heard[0]);

        for (const t of heard) {
          if (WAKE_WORDS_REF.current.test(t)) {
            recRef.current = null;
            onWakeRef.current();
            return;
          }
        }
      };

      rec.onerror = (e: any) => {
        clearWatchdog();
        recRef.current = null;
        if (e.error === "not-allowed" || e.error === "service-not-allowed") {
          onMicErrRef.current?.(e.error);
          return;
        }
        // no-speech is normal — restart quickly; other errors give browser more breathing room
        const delay = e.error === "no-speech" ? 200 : 1500;
        if (enabledRef.current) timerRef.current = setTimeout(startListening, delay);
      };

      rec.onend = () => {
        clearWatchdog();
        recRef.current = null;
        // 300 ms is the sweet spot — fast enough to feel responsive, long enough that
        // Chrome's mic-release doesn't cause the next session to silently fail.
        if (enabledRef.current) timerRef.current = setTimeout(startListening, 300);
      };

      rec.start();
    } catch {
      clearWatchdog();
      recRef.current = null;
      if (enabledRef.current) timerRef.current = setTimeout(startListening, 900);
    }
  }, [clearWatchdog]);

  useEffect(() => {
    if (enabled) {
      // Small initial delay so the page/mic is ready before the first session
      timerRef.current = setTimeout(startListening, 800);
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

// ── Ambient voice capture — keeps listening until speech detected or timeout ──
// Uses continuous=false but restarts on no-speech/early-end so the listening
// mode doesn't close automatically when the user hasn't spoken yet.
function listenForCommand(onInterim: (t: string) => void, signal?: AbortSignal): Promise<string> {
  return new Promise((resolve) => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { resolve(""); return; }

    let resolved = false;
    let finalText = "";
    let silenceTimer: ReturnType<typeof setTimeout> | null = null;
    let maxTimer: ReturnType<typeof setTimeout> | null = null;
    let rec: any = null;
    let restartTimer: ReturnType<typeof setTimeout> | null = null;

    const done = (text: string) => {
      if (resolved) return;
      resolved = true;
      if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = null; }
      if (maxTimer) { clearTimeout(maxTimer); maxTimer = null; }
      if (restartTimer) { clearTimeout(restartTimer); restartTimer = null; }
      try { rec?.abort(); } catch {}
      resolve(text);
    };

    const startRec = () => {
      if (resolved) return;
      try {
        rec = new SR();
        rec.continuous = false;
        rec.interimResults = true;
        rec.lang = "en-US";
        rec.maxAlternatives = 1;

        rec.onresult = (evt: any) => {
          for (let i = evt.resultIndex; i < evt.results.length; i++) {
            const t = evt.results[i][0].transcript;
            if (evt.results[i].isFinal) {
              finalText = t;
              if (silenceTimer) clearTimeout(silenceTimer);
              // 800 ms after final word — catches appended words
              silenceTimer = setTimeout(() => done(finalText), 800);
            } else {
              onInterim(t);
              if (silenceTimer) clearTimeout(silenceTimer);
              silenceTimer = setTimeout(() => done(finalText), 2500);
            }
          }
        };

        rec.onerror = (e: any) => {
          rec = null;
          if (e.error === "no-speech") {
            // Normal — browser heard nothing; restart immediately and keep waiting
            if (!resolved) restartTimer = setTimeout(startRec, 100);
          } else if (e.error === "not-allowed" || e.error === "service-not-allowed") {
            done(""); // mic blocked — give up
          } else {
            // Other transient errors — brief pause then retry
            if (!resolved) restartTimer = setTimeout(startRec, 500);
          }
        };

        rec.onend = () => {
          rec = null;
          if (resolved) return;
          if (finalText) {
            // Already have text — silence timer handles it
          } else {
            // Ended early without speech — restart to keep listening
            restartTimer = setTimeout(startRec, 150);
          }
        };

        rec.start();
      } catch {
        rec = null;
        if (!resolved) restartTimer = setTimeout(startRec, 500);
      }
    };

    // Hard cap: 20 s total (user has plenty of time to speak)
    maxTimer = setTimeout(() => done(finalText), 20000);
    signal?.addEventListener("abort", () => done(finalText));

    startRec();
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
  const [voiceError, setVoiceError] = useState<string | null>(null);
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
  const [location, navigate] = useLocation();
  const [memory] = useState(() => loadMemory());
  const { selectedCompany, hasModuleAccess, isAdmin } = useAuth();

  const canOpenPath = useCallback((path: string) => {
    if (isAdmin) return true;
    const module = pathToAppModule(path);
    if (!module) return true;
    return hasModuleAccess(module);
  }, [isAdmin, hasModuleAccess]);

  const hasMessages = messages.length > 0;

  // ── Ambient conversation loop ──
  // greeting: what Veda says at the start of this conversation turn
  //   button press  → "Yes Boss, how may I help you?"
  //   wake word     → "Yes Boss"
  const runAmbientConversation = useCallback(async (greeting = "Yes Boss") => {
    if (convActiveRef.current) return;
    convActiveRef.current = true;
    const ctrl = new AbortController();
    ambientAbortRef.current = ctrl;
    ambientHistoryRef.current = [];

    try {
      setConvState("greeting");
      setConvText(greeting);
      // Only speak the greeting if the browser has received a user gesture
      // (click/keydown). On page-load with ambient restored from localStorage,
      // speechSynthesis.speak() is silently blocked — we skip speech but still
      // show the visual overlay and proceed straight to listening.
      if (_userHasInteracted) {
        await speak(greeting);
        // Give the audio hardware ~400 ms to switch from speaker → mic
        await new Promise(r => setTimeout(r, 400));
      } else {
        // No user gesture yet — just wait a beat so the UI updates before mic opens
        await new Promise(r => setTimeout(r, 200));
      }

      let silenceStreak = 0;
      // Track the last thing Veda said so we can detect mic echo
      let lastSpokenWords: string[] = [];

      // Helper: is this command just Veda's own TTS echoing back?
      const isEcho = (cmd: string) => {
        if (lastSpokenWords.length === 0) return false;
        const cmdWords = cmd.toLowerCase().split(/\s+/).filter(w => w.length > 3);
        if (cmdWords.length === 0) return false;
        const matches = cmdWords.filter(w => lastSpokenWords.includes(w)).length;
        // If >40% of the command's words came from what Veda just said, treat as echo
        return matches / cmdWords.length > 0.4;
      };

      while (convActiveRef.current) {
        setConvState("listening");
        setConvText("");

        const command = await listenForCommand(t => setConvText(t), ctrl.signal);
        if (ctrl.signal.aborted || !convActiveRef.current) break;

        if (!command.trim()) {
          silenceStreak++;
          if (silenceStreak >= 1) break;
          continue;
        }
        silenceStreak = 0;

        // Discard if it looks like Veda's own TTS being picked up by the mic
        if (isEcho(command)) {
          lastSpokenWords = []; // clear so next round is not filtered
          continue;
        }
        lastSpokenWords = [];

        if (/\b(stop|bye|goodbye|that'?s all|thanks veda|thank you|no thanks|done|exit|close)\b/i.test(command)) {
          setConvState("speaking");
          setConvText("Okay!");
          await speak("Okay.");
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
            (path, prefill) => {
              if (!canOpenPath(path)) return;
              if (prefill) (window as any).__vedaPrefill = prefill;
              navigate(path);
            },
            ctrl.signal,
            (fields) => window.dispatchEvent(new CustomEvent("veda:fill-form", { detail: fields })),
            (_dt, _id, recipients) => { window.dispatchEvent(new CustomEvent("veda:open-email", { detail: { recipients } })); },
            location,
            selectedCompany?.id,
          );
          if (response) {
            ambientHistoryRef.current = [
              ...ambientHistoryRef.current,
              { role: "user", content: command },
              { role: "assistant", content: response },
            ].slice(-16);
            // Remember what Veda is about to say so we can filter the echo
            lastSpokenWords = response.toLowerCase().split(/\s+/).filter(w => w.length > 3);
            setConvState("speaking");
            setConvText(response.slice(0, 240));
            await speak(response.slice(0, 600));
            // Longer pause so speaker→mic switch is complete before next listen
            await new Promise(r => setTimeout(r, 1200));
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
  }, [navigate, memory, location, canOpenPath, selectedCompany?.id]);

  const handleWakeWord = useCallback(() => {
    runAmbientConversation("Yes Boss"); // short acknowledgment on wake word
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
  const [lastHeard, setLastHeard] = useState<string>("");
  const lastHeardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleHeard = useCallback((text: string) => {
    setLastHeard(text);
    if (lastHeardTimerRef.current) clearTimeout(lastHeardTimerRef.current);
    lastHeardTimerRef.current = setTimeout(() => setLastHeard(""), 3000);
  }, []);

  // Wake word only active when ambient on AND no active conversation
  const { supported: wakeSupported } = useWakeWord(
    handleWakeWord,
    ambientMode && convState === "idle",
    (code) => setWakeError(code),
    handleHeard,
  );

  const toggleAmbient = useCallback(() => {
    const next = !ambientMode;
    try { localStorage.setItem("veda_ambient", next ? "1" : "0"); } catch {}
    if (next) {
      setWakeError(null);
      setAmbientMode(true);
      // Immediately greet and enter conversation — don't wait for wake word
      runAmbientConversation("Yes Boss, how may I help you?");
    } else {
      setAmbientMode(false);
    }
  }, [ambientMode, runAmbientConversation]);

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
        runAmbientConversation("Yes Boss, how may I help you?");
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
    if (!canOpenPath(path)) return;
    if (prefill) (window as any).__vedaPrefill = prefill;
    const label = PATH_LABELS[path] || reason || path.split("/").filter(Boolean).map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(" ");
    setMessages(p => p.map(m =>
      m.role === "assistant" && !m.complete
        ? { ...m, navigated: { path, label } }
        : m
    ));
    navigate(path);
  }, [navigate, canOpenPath]);

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
        (_dt, _id, recipients) => { window.dispatchEvent(new CustomEvent("veda:open-email", { detail: { recipients } })); },
        location,
        selectedCompany?.id,
      );
      const inv = full.match(/\b(INV-\d+)\b/);
      const qt = full.match(/\b(QT-\d+)\b/);
      if (inv && hasModuleAccess("invoices")) { setMessages(p => p.map(m => m.id === aid ? { ...m, complete: true, docRef: { number: inv[1], path: "/invoices" } } : m)); appendMemory(`Created invoice ${inv[1]}`); }
      else if (qt && hasModuleAccess("quotations")) { setMessages(p => p.map(m => m.id === aid ? { ...m, complete: true, docRef: { number: qt[1], path: "/quotations" } } : m)); appendMemory(`Created quotation ${qt[1]}`); }
      else { setMessages(p => p.map(m => m.id === aid ? { ...m, complete: true } : m)); }
      if (fromVoice && full) await speak(full.slice(0, 600));
    } catch (e: any) {
      if (e.name !== "AbortError") setMessages(p => p.map(m => m.id === aid ? { ...m, complete: true, content: "Something went wrong — please try again." } : m));
    } finally { setThinking(false); abortRef.current = null; }
  }, [thinking, history, memory, handleNavigate, location, selectedCompany?.id, hasModuleAccess]);

  const submit = () => send(input);
  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); }
  };

  const mic = async () => {
    if (transcribing) return;
    if (recording) {
      const blob = await stop();
      if (blob.size < 1000) {
        setVoiceError("Recording too short — hold and speak a bit longer.");
        return;
      }
      setTranscribing(true);
      setVoiceError(null);
      try {
        const t = await transcribe(blob);
        if (t.trim()) await send(t, true);
        else setVoiceError("Couldn't catch that — try again.");
      } catch (e: any) {
        setVoiceError(e?.message || "Voice transcription failed. Check API key and restart API server.");
      } finally {
        setTranscribing(false);
      }
    } else {
      setVoiceError(null);
      const ok = await start();
      if (!ok) setMicError(true);
    }
  };

  const stopAudio = () => {
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
        <div className="group fixed bottom-6 right-0 z-40 flex flex-col items-end gap-2 translate-x-[calc(100%-10px)] hover:translate-x-0 transition-transform duration-300 ease-in-out pr-3">
          {/* Debug: show what wake-word listener last heard */}
          {ambientMode && convState === "idle" && lastHeard && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs bg-muted border border-border shadow-sm max-w-[200px]">
              <span className="text-muted-foreground shrink-0">heard:</span>
              <span className="truncate font-mono text-foreground">{lastHeard}</span>
            </div>
          )}
          {/* Ambient mode toggle chip */}
          {wakeSupported && (
            <button
              onClick={toggleAmbient}
              title={ambientMode ? "Ambient mode ON — say 'Veda' anytime" : "Enable ambient mode"}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium shadow-md transition-all opacity-0 group-hover:opacity-100 duration-200",
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

                        {voiceError && (
                          <p className="text-xs text-red-600 text-center max-w-sm px-2">{voiceError}</p>
                        )}

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
                            {msg.docRef && canOpenPath(msg.docRef.path) && (
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
