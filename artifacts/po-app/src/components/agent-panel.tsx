import { useState, useRef, useEffect, useCallback } from "react";
import {
  Send, Mic, Volume2, Loader2, Sparkles, ExternalLink,
  Square, BarChart2, Navigation, X, CheckCircle2, Plus, Radio,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth-context";
import { queueVedaFormAction } from "@/hooks/useVedaFormActions";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetPurchaseOrderQueryKey,
  getListPurchaseOrdersQueryKey,
  getGetInvoiceQueryKey,
  getListInvoicesQueryKey,
  getGetQuotationQueryKey,
  getListQuotationsQueryKey,
  getGetDeliveryOrderQueryKey,
  getListDeliveryOrdersQueryKey,
} from "@workspace/api-client-react";
import { vedaAutoSendDocumentEmail, type VedaEmailDocType } from "@/lib/veda-send-email";
import { useToast } from "@/hooks/use-toast";

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
  submitCurrentForm: "Saving form",
  previewCurrentDocument: "Opening preview",
  downloadCurrentDocument: "Downloading PDF",
  updateDocumentFields: "Updating document",
  navigateTo: "Navigating",
  createInvoice: "Creating invoice",
  createQuotation: "Creating quotation",
  createPurchaseOrder: "Creating purchase order",
  createDeliveryOrder: "Creating delivery order",
  confirmDocument: "Confirming document",
  voidInvoice: "Voiding invoice",
  knockOffInvoice: "Marking invoice paid",
  sendDocumentEmail: "Preparing email",
};

/** Store navigation prefill for supported new-document pages (and legacy invoice key). */
function storeVedaPrefill(prefill: unknown) {
  if (!prefill) return;
  (window as any).__vedaPrefill = prefill;
  // Invoice new page still reads the legacy key — keep both in sync without changing that page.
  (window as any).__ariaPrefill = prefill;
}

/** Let Veda open any module page even if sidebar assignment would block it. */
function unlockVedaModules() {
  (window as any).__vedaModuleUnlock = true;
  try { sessionStorage.setItem("veda_module_unlock", "1"); } catch {}
}
export function isVedaModuleUnlocked(): boolean {
  if (typeof window === "undefined") return false;
  if ((window as any).__vedaModuleUnlock) return true;
  try { return sessionStorage.getItem("veda_module_unlock") === "1"; } catch { return false; }
}

function normalizeNavPath(path: string): string {
  let p = String(path || "").trim();
  if (!p) return "/dashboard";
  if (!p.startsWith("/")) p = `/${p}`;
  return p;
}

/** Instant client-side navigate for clear "go to / open …" phrases (no LLM wait). */
function matchQuickNavigate(command: string): string | null {
  const t = String(command || "").toLowerCase().replace(/\s+/g, " ").trim();
  if (!t) return null;
  const wantsNav = /\b(go\s*to|goto|open|show|take\s*me|navigate|switch\s*to|bring\s*(me\s*)?up|launch|visit|create|make|add)\b/.test(t)
    || /\b(page|module|screen|list)\b/.test(t)
    || /^(invoices?|quotations?|purchase\s*orders?|delivery\s*orders?|customers?|vendors?|stock|grn|dashboard|settings|point\s*of\s*sale|pos)$/.test(t);
  if (!wantsNav) return null;

  // Create / new forms
  if (/\b(create|new|add|make)\b/.test(t) && /\binvoices?\b/.test(t)) return "/invoices/new";
  if (/\b(create|new|add|make)\b/.test(t) && /\bquotations?\b|\bquotes?\b/.test(t)) return "/quotations/new";
  if (/\b(create|new|add|make)\b/.test(t) && /\bpurchase\s*orders?\b/.test(t)) return "/purchase-orders/new";
  if (/\b(create|new|add|make)\b/.test(t) && /\bdelivery\s*orders?\b/.test(t)) return "/delivery-orders/new";

  if (/\bnew\b/.test(t) && /\binvoices?\b/.test(t)) return "/invoices/new";
  if (/\bnew\b/.test(t) && /\bquotations?\b/.test(t)) return "/quotations/new";
  if (/\bnew\b/.test(t) && /\bpurchase\s*orders?\b/.test(t)) return "/purchase-orders/new";
  if (/\bnew\b/.test(t) && /\bdelivery\s*orders?\b/.test(t)) return "/delivery-orders/new";

  if (/\bpurchase\s*orders?\b/.test(t)) return "/purchase-orders";
  if (/\bpoint\s*of\s*sale\b/.test(t)) return "/point-of-sale";
  if (/\b(vendor\s*invoices?|supplier\s*invoices?)\b/.test(t)) return "/vendor-invoices";
  if (/\binvoices?\b/.test(t)) return "/invoices";
  if (/\bquotations?\b|\bquotes?\b/.test(t)) return "/quotations";
  if (/\bdelivery\s*orders?\b/.test(t)) return "/delivery-orders";
  if (/\bsales\s*orders?\b/.test(t)) return "/sales-orders";
  if (/\bcustomers?\b/.test(t)) return "/customers";
  if (/\bvendors?\b|\bsuppliers?\b/.test(t)) return "/vendors";
  if (/\bstock\b|\binventory\b|\bcatalogue\b|\bcatalog\b/.test(t)) return "/stock";
  if (/\bgrn\b|\bgoods\s*received\b/.test(t)) return "/grn";
  if (/\bdashboard\b|\bhome\b/.test(t)) return "/dashboard";
  if (/\bsettings?\b/.test(t)) return "/settings";
  if (/\bexpenses?\b/.test(t)) return "/accounting/expenses";
  if (/\baccounting\b/.test(t)) return "/accounting/chart-of-accounts";
  return null;
}

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

function applyVedaDocumentCache(
  queryClient: ReturnType<typeof useQueryClient>,
  payload: { docType: string; id: number; document?: any },
) {
  const { docType, id, document } = payload;
  if (!id) return;

  const detailKey =
    docType === "po" ? getGetPurchaseOrderQueryKey(id)
    : docType === "inv" ? getGetInvoiceQueryKey(id)
    : docType === "qt" ? getGetQuotationQueryKey(id)
    : docType === "do" ? getGetDeliveryOrderQueryKey(id)
    : null;
  const listKey =
    docType === "po" ? getListPurchaseOrdersQueryKey()
    : docType === "inv" ? getListInvoicesQueryKey()
    : docType === "qt" ? getListQuotationsQueryKey()
    : docType === "do" ? getListDeliveryOrdersQueryKey()
    : null;

  if (detailKey && document) {
    queryClient.setQueryData(detailKey, (old: any) => old ? { ...old, ...document } : document);
  }
  if (detailKey) {
    void queryClient.invalidateQueries({ queryKey: detailKey });
  }
  if (listKey) {
    if (document) {
      queryClient.setQueryData(listKey, (old: any) => {
        if (!Array.isArray(old)) return old;
        return old.map((row: any) => (row.id === id ? { ...row, ...document } : row));
      });
    }
    void queryClient.invalidateQueries({ queryKey: listKey });
  }
}

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
      utt.rate = 1.12;
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

function cancelSpeech() {
  window.speechSynthesis?.cancel();
  _browserTtsResolve?.();
  _browserTtsResolve = null;
  if (_browserTtsTimeout) { clearTimeout(_browserTtsTimeout); _browserTtsTimeout = null; }
}

// Chrome allows only ONE SpeechRecognition at a time. All Veda voice paths must
// go through this mutex or wake / listen / barge-in steal the mic from each other.
let _activeSpeechRec: any = null;
function killSpeechMic() {
  const rec = _activeSpeechRec;
  _activeSpeechRec = null;
  if (!rec) return;
  try {
    rec.onresult = null;
    rec.onerror = null;
    rec.onend = null;
    rec.abort();
  } catch {}
}
function claimSpeechMic(rec: any) {
  killSpeechMic();
  _activeSpeechRec = rec;
}

// Only clear stop intents — do NOT match "thank you" / "done" / "close" (causes false auto-stop)
const HARD_STOP_RE =
  /\b(stop\s+it|stop\s+veda|stop\s+talking|shut\s*up|be\s*quiet|cancel\s+that|never\s*mind|that'?s\s+all|goodbye|good\s*bye)\b/i;
const HARD_STOP_ONLY_RE =
  /^\s*(stop(\s+it)?|bye|goodbye|exit)\s*[.!]?\s*$/i;

function isStopCommand(text: string) {
  const t = String(text || "").trim();
  if (!t) return false;
  return HARD_STOP_ONLY_RE.test(t) || HARD_STOP_RE.test(t);
}

/** Ignore room chatter / noise fragments — only accept clear addressed speech. */
function isLikelyNoise(text: string): boolean {
  const t = String(text || "").trim().toLowerCase();
  if (!t) return true;
  if (isStopCommand(t)) return false;
  // Short yes/no / numbers are valid field answers
  if (/^(yes|yeah|yep|yup|ok|okay|sure|no|nope|nah|sgd|usd|eur|inr|myr|gbp|\d+([.,]\d+)?)$/i.test(t)) return false;
  const words = t.split(/\s+/).filter(Boolean);
  // Single tiny word from background (hmm, the, a, uh) — ignore
  if (words.length === 1 && words[0].length < 3) return true;
  if (words.length === 1 && /^(the|a|an|and|or|to|of|is|it|um|uh|ah|oh|hmm|ha|la|na|aa|ee)$/i.test(words[0])) return true;
  // Very short mumbled fragment without intent words
  if (t.replace(/\s+/g, "").length < 3) return true;
  return false;
}

/** Speak fully unless user clearly says stop — do NOT barge-in on room chatter. */
function speakWithHardStopOnly(
  text: string,
  opts?: { signal?: AbortSignal },
): Promise<{ interrupted: boolean; stop?: boolean }> {
  return new Promise((resolve) => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    let settled = false;
    let bargeRec: any = null;
    let startRecTimer: ReturnType<typeof setTimeout> | null = null;

    const finish = (result: { interrupted: boolean; stop?: boolean }) => {
      if (settled) return;
      settled = true;
      if (startRecTimer) clearTimeout(startRecTimer);
      if (_activeSpeechRec === bargeRec) _activeSpeechRec = null;
      try {
        if (bargeRec) {
          bargeRec.onresult = null;
          bargeRec.onerror = null;
          bargeRec.onend = null;
          bargeRec.abort();
        }
      } catch {}
      bargeRec = null;
      if (result.stop) cancelSpeech();
      resolve(result);
    };

    opts?.signal?.addEventListener("abort", () => finish({ interrupted: false }));

    // Only listen for hard stop while speaking — ignore other voices in the room
    startRecTimer = setTimeout(() => {
      if (settled || !SR) return;
      try {
        bargeRec = new SR();
        bargeRec.continuous = true;
        bargeRec.interimResults = true;
        bargeRec.lang = "en-IN";
        claimSpeechMic(bargeRec);
        bargeRec.onresult = (evt: any) => {
          if (settled) return;
          let heard = "";
          for (let i = evt.resultIndex; i < evt.results.length; i++) {
            heard += evt.results[i][0]?.transcript || "";
          }
          heard = heard.trim();
          if (isStopCommand(heard)) {
            finish({ interrupted: true, stop: true });
          }
        };
        bargeRec.onerror = () => {};
        bargeRec.onend = () => {
          if (!settled && bargeRec && _activeSpeechRec === bargeRec) {
            try { bargeRec.start(); } catch {}
          }
        };
        bargeRec.start();
      } catch {}
    }, 600);

    speak(text)
      .then(() => finish({ interrupted: false }))
      .catch(() => finish({ interrupted: false }));
  });
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
  onFormAction?: (action: "save" | "preview" | "download") => void,
  onDocumentUpdated?: (payload: { docType: string; id: number; fields?: Record<string, any>; document?: any }) => void,
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
        if (ev.type === "form_action" && ev.action) onFormAction?.(ev.action);
        if (ev.type === "document_updated") {
          onDocumentUpdated?.({
            docType: ev.docType,
            id: ev.id,
            fields: ev.fields,
            document: ev.document,
          });
          window.dispatchEvent(new CustomEvent("veda:document-updated", {
            detail: { docType: ev.docType, id: ev.id, fields: ev.fields, document: ev.document },
          }));
        }
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
// Phonetic / STT variants of "Veda" only — avoid common English words that false-trigger.
let WAKE_WORDS = /\b(veda|veeda|vida|vita|veta|veja|beda|vetta|weda|weeder|veeder|vader|feder|vedaah|vedha|veyda|veida|beeda|bheda)\b/i;
const WAKE_WORDS_REF = { current: WAKE_WORDS };
WAKE_WORDS_REF.current = WAKE_WORDS;

/** Normalize STT text and detect wake + optional follow-on command. */
function matchWakeUtterance(raw: string): { hit: boolean; followOn?: string } {
  const t = String(raw || "")
    .toLowerCase()
    .replace(/[^\w\s']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return { hit: false };

  // Drop leading filler so "say veda" / "hey veda" / "ok veda" still wake
  const strippedLead = t.replace(/^(hey|hi|ok|okay|please|um|uh|so|say|call|yo|oye|hello)\s+/i, "").trim();
  const candidates = [t, strippedLead];

  for (const c of candidates) {
    if (!WAKE_WORDS_REF.current.test(c)) continue;
    // reset lastIndex in case flag quirks
    WAKE_WORDS_REF.current.lastIndex = 0;
    const followOn = c
      .replace(WAKE_WORDS_REF.current, " ")
      .replace(/^(hey|hi|ok|okay|please|um|uh|so|say|call|yo|oye|hello)\s+/i, "")
      .replace(/\s+/g, " ")
      .trim();
    return { hit: true, followOn: followOn.length > 1 ? followOn : undefined };
  }

  // Single-token fuzzy: STT often mangles short "Veda" (e.g. "ved", "veda.", "v eda")
  const one = strippedLead.replace(/\s+/g, "");
  if (one.length >= 3 && one.length <= 8) {
    const target = "veda";
    let dist = 0;
    const a = one.slice(0, 8);
    const b = target;
    const m = a.length;
    const n = b.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] = a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
    dist = dp[m][n];
    if (dist <= 1) return { hit: true };
  }

  return { hit: false };
}

function useWakeWord(
  onWakeWord: (followOnCommand?: string) => void,
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
      if (_activeSpeechRec === recRef.current) _activeSpeechRec = null;
      try {
        recRef.current.onresult = null;
        recRef.current.onerror = null;
        recRef.current.onend = null;
        recRef.current.abort();
      } catch {}
      recRef.current = null;
    }
  }, [clearWatchdog]);

  const startListening = useCallback(() => {
    if (!enabledRef.current || recRef.current) return;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    try {
      const rec = new SR();
      // Single-shot sessions are more reliable than continuous for short wake words
      rec.continuous      = false;
      rec.interimResults  = true;
      rec.lang            = "en-IN";
      rec.maxAlternatives = 5;
      claimSpeechMic(rec);
      recRef.current = rec;

      clearWatchdog();
      watchdogRef.current = setTimeout(() => {
        stopListening();
        if (enabledRef.current) timerRef.current = setTimeout(startListening, 100);
      }, 10_000);

      let fired = false;
      const tryWake = (text: string) => {
        if (fired || !text) return;
        onHeardRef.current?.(text);
        const match = matchWakeUtterance(text);
        if (!match.hit) return;
        fired = true;
        stopListening();
        onWakeRef.current(match.followOn);
      };

      rec.onresult = (evt: any) => {
        for (let i = 0; i < evt.results.length; i++) {
          for (let j = 0; j < evt.results[i].length; j++) {
            const t = (evt.results[i][j].transcript || "").toLowerCase().trim();
            if (t) tryWake(t);
            if (fired) return;
          }
        }
      };

      rec.onerror = (e: any) => {
        clearWatchdog();
        if (_activeSpeechRec === rec) _activeSpeechRec = null;
        recRef.current = null;
        if (e.error === "not-allowed" || e.error === "service-not-allowed") {
          onMicErrRef.current?.(e.error);
          return;
        }
        const delay = e.error === "no-speech" ? 60 : 350;
        if (enabledRef.current && !fired) timerRef.current = setTimeout(startListening, delay);
      };

      rec.onend = () => {
        clearWatchdog();
        if (_activeSpeechRec === rec) _activeSpeechRec = null;
        recRef.current = null;
        if (enabledRef.current && !fired) timerRef.current = setTimeout(startListening, 100);
      };

      rec.start();
    } catch {
      clearWatchdog();
      recRef.current = null;
      if (enabledRef.current) timerRef.current = setTimeout(startListening, 350);
    }
  }, [clearWatchdog, stopListening]);

  useEffect(() => {
    if (enabled) {
      timerRef.current = setTimeout(startListening, 100);
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

// ── Command capture — exclusive mic, pause ends the utterance ──
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
      if (_activeSpeechRec === rec) _activeSpeechRec = null;
      try {
        if (rec) {
          rec.onresult = null;
          rec.onerror = null;
          rec.onend = null;
          rec.abort();
        }
      } catch {}
      resolve(String(text || "").trim());
    };

    const startRec = () => {
      if (resolved) return;
      try {
        rec = new SR();
        rec.continuous = false;
        rec.interimResults = true;
        rec.lang = "en-IN";
        rec.maxAlternatives = 3;
        claimSpeechMic(rec);

        rec.onresult = (evt: any) => {
          for (let i = evt.resultIndex; i < evt.results.length; i++) {
            let best = evt.results[i][0]?.transcript || "";
            let bestConf = evt.results[i][0]?.confidence ?? 0;
            for (let j = 1; j < evt.results[i].length; j++) {
              const alt = evt.results[i][j];
              const c = alt?.confidence ?? 0;
              if (c > bestConf) {
                best = alt.transcript;
                bestConf = c;
              }
            }
            const t = String(best || "").trim();
            if (!t) continue;
            // Drop low-confidence room noise (0 means unknown — allow; <0.35 discard)
            if (bestConf > 0 && bestConf < 0.35) continue;

            if (evt.results[i].isFinal) {
              if (isLikelyNoise(t) && !finalText) {
                // Ignore stray single-word background hits; keep listening
                continue;
              }
              finalText = (finalText ? `${finalText} ${t}` : t).trim();
              onInterim(finalText);
              if (silenceTimer) clearTimeout(silenceTimer);
              if (isStopCommand(finalText)) {
                done(finalText);
                return;
              }
              // Longer pause so background chatter doesn't cut the user's answer short
              silenceTimer = setTimeout(() => {
                if (isLikelyNoise(finalText)) {
                  finalText = "";
                  onInterim("");
                  return;
                }
                done(finalText);
              }, 900);
            } else {
              // Don't end utterance on interim alone — wait for final (reduces room pickup)
              onInterim(t);
              if (silenceTimer) clearTimeout(silenceTimer);
              if (isStopCommand(t)) {
                done(t);
                return;
              }
            }
          }
        };

        rec.onerror = (e: any) => {
          if (_activeSpeechRec === rec) _activeSpeechRec = null;
          rec = null;
          if (e.error === "no-speech") {
            if (!resolved) restartTimer = setTimeout(startRec, 50);
          } else if (e.error === "not-allowed" || e.error === "service-not-allowed") {
            done("");
          } else {
            if (!resolved) restartTimer = setTimeout(startRec, 250);
          }
        };

        rec.onend = () => {
          if (_activeSpeechRec === rec) _activeSpeechRec = null;
          rec = null;
          if (resolved) return;
          if (!finalText) restartTimer = setTimeout(startRec, 70);
        };

        rec.start();
      } catch {
        rec = null;
        if (!resolved) restartTimer = setTimeout(startRec, 250);
      }
    };

    maxTimer = setTimeout(() => done(finalText), 20000);
    signal?.addEventListener("abort", () => done(finalText));

    // Ensure wake mic is dead before command mic starts
    killSpeechMic();
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
  // Always-on hands-free: wake word "Veda" works without opening the chat panel.
  // Chat panel opens ONLY when the user clicks the Veda icon.
  const [handsFree, setHandsFree] = useState(true);
  // Ambient conversation state machine
  const [convState, setConvState] = useState<ConvState>("idle");
  const [convText, setConvText] = useState("");
  const [panelListening, setPanelListening] = useState(false);
  const convActiveRef = useRef(false);
  const ambientAbortRef = useRef<AbortController | null>(null);
  const ambientHistoryRef = useRef<{ role: string; content: string }[]>([]);
  const panelListenAbortRef = useRef<AbortController | null>(null);

  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [location, navigate] = useLocation();
  const [memory] = useState(() => loadMemory());
  const { selectedCompany } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleDocumentUpdated = useCallback((payload: { docType: string; id: number; fields?: Record<string, any>; document?: any }) => {
    applyVedaDocumentCache(queryClient, payload);
  }, [queryClient]);

  const handleVedaEmail = useCallback(async (
    docType: string,
    id: number,
    recipients: string[],
    docNumber?: string,
  ) => {
    const typed = (["inv", "qt", "po", "do"].includes(docType) ? docType : "po") as VedaEmailDocType;
    toast({
      title: "Sending email…",
      description: `Preparing ${docNumber || "document"} PDF for ${recipients.join(", ")}`,
    });
    const result = await vedaAutoSendDocumentEmail({
      docType: typed,
      id,
      recipients,
      company: selectedCompany,
      companyName: (selectedCompany as any)?.name,
    });
    if (!result.ok) {
      toast({
        title: "Email not sent",
        description: result.error + (result.error.includes("SMTP")
          ? ""
          : " Check Settings → Email / SMTP configuration."),
        variant: "destructive",
      });
      return;
    }
    applyVedaDocumentCache(queryClient, {
      docType: typed,
      id,
      document: {
        status: "sent",
        emailSentTo: result.recipients.join(", "),
      },
    });
    toast({
      title: "Email sent",
      description: `${result.docNumber} sent to ${result.recipients.join(", ")}.`,
    });
  }, [queryClient, selectedCompany, toast]);

  const canOpenPath = useCallback((_path: string) => true, []);

  const hasMessages = messages.length > 0;

  // ── Ambient conversation loop (exclusive mic: wake OR listen OR barge-in) ──
  const runAmbientConversation = useCallback(async (greeting = "Yes?", firstCommand?: string) => {
    if (convActiveRef.current) return;
    convActiveRef.current = true;
    killSpeechMic();
    cancelSpeech();
    const ctrl = new AbortController();
    ambientAbortRef.current = ctrl;
    ambientHistoryRef.current = [];

    try {
      setConvState("greeting");
      setConvText(greeting);

      if (_userHasInteracted) void speak(greeting);
      // Wait for wake mic to fully release before command mic
      await new Promise(r => setTimeout(r, 220));

      let lastSpokenWords: string[] = [];
      let pendingFirst = (firstCommand || "").trim();

      const isEcho = (cmd: string) => {
        if (lastSpokenWords.length === 0) return false;
        const cmdWords = cmd.toLowerCase().split(/\s+/).filter(w => w.length > 3);
        if (cmdWords.length === 0) return false;
        const matches = cmdWords.filter(w => lastSpokenWords.includes(w)).length;
        return matches / cmdWords.length > 0.45;
      };

      while (convActiveRef.current) {
        let command = "";
        if (pendingFirst) {
          command = pendingFirst;
          pendingFirst = "";
          setConvState("listening");
          setConvText(command);
        } else {
          setConvState("listening");
          setConvText("");
          command = await listenForCommand(t => setConvText(t), ctrl.signal);
        }
        if (ctrl.signal.aborted || !convActiveRef.current) break;

        if (!command.trim() || isLikelyNoise(command)) {
          // Keep listening — ignore empty / room noise (do NOT auto-stop)
          continue;
        }

        if (isEcho(command)) {
          lastSpokenWords = [];
          continue;
        }
        lastSpokenWords = [];

        const wakeAgain = matchWakeUtterance(command);
        if (wakeAgain.hit && wakeAgain.followOn) command = wakeAgain.followOn;
        else if (wakeAgain.hit && !wakeAgain.followOn) {
          cancelSpeech();
          void speak("Yes?");
          continue;
        }

        if (isStopCommand(command)) {
          cancelSpeech();
          killSpeechMic();
          setConvState("speaking");
          setConvText("Okay, stopped.");
          await speak("Okay, stopped.");
          break;
        }

        // Instant navigate for clear "go to / open / create …"
        const quickPath = matchQuickNavigate(command);
        if (quickPath) {
          unlockVedaModules();
          navigate(normalizeNavPath(quickPath));
          setConvState("speaking");
          const label = PATH_LABELS[quickPath] || quickPath;
          setConvText(`Opening ${label}`);
          void speak(`Opening ${label}`);
          await new Promise(r => setTimeout(r, 450));

          // New form → start guided field-by-field (ask first field)
          if (quickPath.endsWith("/new")) {
            setConvState("processing");
            let response = "";
            try {
              await streamChat(
                [
                  ...ambientHistoryRef.current,
                  {
                    role: "user",
                    content: `${command}\n\n[The ${label} form is now open at ${quickPath}. Start guided create: ask ONLY the first field now.]`,
                  },
                ],
                memory,
                chunk => { response += chunk; setConvText(response.slice(-150)); },
                () => {},
                (path, prefill) => {
                  unlockVedaModules();
                  storeVedaPrefill(prefill);
                  navigate(normalizeNavPath(path));
                },
                ctrl.signal,
                (fields) => window.dispatchEvent(new CustomEvent("veda:fill-form", { detail: fields })),
                (action) => queueVedaFormAction(action),
                handleDocumentUpdated,
                (dt, id, recipients, docNumber) => { void handleVedaEmail(dt, id, recipients, docNumber); },
                quickPath,
                selectedCompany?.id,
              );
              if (response) {
                ambientHistoryRef.current = [
                  ...ambientHistoryRef.current,
                  { role: "user", content: command },
                  { role: "assistant", content: response },
                ].slice(-16);
                setConvState("speaking");
                setConvText(response.slice(0, 240));
                const spoken = await speakWithHardStopOnly(response.slice(0, 600), { signal: ctrl.signal });
                if (spoken.stop) {
                  await speak("Okay, stopped.");
                  break;
                }
              }
            } catch (e: any) {
              if (e.name === "AbortError" || ctrl.signal.aborted) break;
            }
          }
          continue;
        }

        setConvState("processing");
        setConvText(command);
        cancelSpeech();

        let response = "";
        let didNavigate = false;
        try {
          await streamChat(
            [...ambientHistoryRef.current, { role: "user", content: command }],
            memory,
            chunk => { response += chunk; setConvText(response.slice(-150)); },
            () => {},
            (path, prefill) => {
              unlockVedaModules();
              storeVedaPrefill(prefill);
              navigate(normalizeNavPath(path));
              didNavigate = true;
            },
            ctrl.signal,
            (fields) => window.dispatchEvent(new CustomEvent("veda:fill-form", { detail: fields })),
            (action) => queueVedaFormAction(action),
            handleDocumentUpdated,
            (dt, id, recipients, docNumber) => { void handleVedaEmail(dt, id, recipients, docNumber); },
            location,
            selectedCompany?.id,
          );
          if (ctrl.signal.aborted || !convActiveRef.current) break;

          if (response || didNavigate) {
            if (response) {
              ambientHistoryRef.current = [
                ...ambientHistoryRef.current,
                { role: "user", content: command },
                { role: "assistant", content: response },
              ].slice(-16);
            }
            lastSpokenWords = (response || "").toLowerCase().split(/\s+/).filter(w => w.length > 3);
            setConvState("speaking");
            const speakText = response
              ? response.slice(0, 600)
              : didNavigate ? "Done." : "";
            setConvText((response || (didNavigate ? "Done." : "")).slice(0, 240));

            if (speakText) {
              const spoken = await speakWithHardStopOnly(speakText, {
                signal: ctrl.signal,
              });
              if (ctrl.signal.aborted || !convActiveRef.current) break;

              if (spoken.stop) {
                cancelSpeech();
                killSpeechMic();
                await speak("Okay, stopped.");
                break;
              }
              await new Promise(r => setTimeout(r, 250));
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
      cancelSpeech();
      killSpeechMic();
      await new Promise(r => setTimeout(r, 200));
      setConvState("idle");
      setConvText("");
    }
  }, [navigate, memory, location, canOpenPath, selectedCompany?.id, handleDocumentUpdated, handleVedaEmail]);

  const handleWakeWord = useCallback((followOn?: string) => {
    if (convActiveRef.current) {
      // Interrupt current turn (including TTS) and restart
      convActiveRef.current = false;
      ambientAbortRef.current?.abort();
      cancelSpeech();
      killSpeechMic();
      setTimeout(() => runAmbientConversation("Yes?", followOn), 250);
      return;
    }
    runAmbientConversation("Yes?", followOn);
  }, [runAmbientConversation]);

  const stopConversation = useCallback(() => {
    convActiveRef.current = false;
    ambientAbortRef.current?.abort();
    cancelSpeech();
    killSpeechMic();
    setConvState("idle");
    setConvText("");
  }, []);

  const [wakeError, setWakeError] = useState<string | null>(null);

  // Wake ONLY when idle — never alongside command listen or barge-in (mic conflict)
  const wakeEnabled = handsFree && !open && !panelListening && convState === "idle";

  const { supported: wakeSupported } = useWakeWord(
    handleWakeWord,
    wakeEnabled,
    (code) => setWakeError(code),
  );

  const toggleHandsFree = useCallback(() => {
    const next = !handsFree;
    setHandsFree(next);
    if (!next) stopConversation();
    else setWakeError(null);
  }, [handsFree, stopConversation]);

  // Focus input when opened
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  // Scroll to bottom when messages update
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Escape stops hands-free conversation; Alt+M wakes Veda
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (convState !== "idle") {
          e.preventDefault();
          stopConversation();
          return;
        }
        close();
        return;
      }
      if (e.altKey && e.key.toLowerCase() === "m" && convState === "idle" && !open) {
        e.preventDefault();
        runAmbientConversation("Yes?");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [convState, open, runAmbientConversation, stopConversation]);

  // Auto-clear mic error after 3 seconds
  useEffect(() => {
    if (!micError) return;
    const t = setTimeout(() => setMicError(false), 3000);
    return () => clearTimeout(t);
  }, [micError]);

  // First click/key anywhere unlocks mic permission so "Veda" works without opening chat
  useEffect(() => {
    let done = false;
    const unlock = async () => {
      if (done) return;
      done = true;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((t) => t.stop());
        setWakeError(null);
      } catch {
        // leave wakeError to SpeechRecognition if it fails later
      }
    };
    window.addEventListener("pointerdown", unlock, { once: true, capture: true });
    window.addEventListener("keydown", unlock, { once: true, capture: true });
    return () => {
      window.removeEventListener("pointerdown", unlock, true);
      window.removeEventListener("keydown", unlock, true);
    };
  }, []);

  const history = messages.filter(m => m.content).map(m => ({ role: m.role, content: m.content }));

  const handleNavigate = useCallback((path: string, prefill: any, reason: string) => {
    unlockVedaModules();
    storeVedaPrefill(prefill);
    const normalized = normalizeNavPath(path);
    const label = PATH_LABELS[normalized] || reason || normalized.split("/").filter(Boolean).map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(" ");
    setMessages(p => p.map(m =>
      m.role === "assistant" && !m.complete
        ? { ...m, navigated: { path: normalized, label } }
        : m
    ));
    navigate(normalized);
  }, [navigate]);

  const send = useCallback(async (text: string, fromVoice = false) => {
    if (!text.trim() || thinking) return;
    const quickPath = matchQuickNavigate(text.trim());
    if (quickPath) {
      unlockVedaModules();
      const label = PATH_LABELS[quickPath] || quickPath;
      const uid = Date.now().toString();
      const aid = `asst-${uid}`;
      setMessages(p => [...p,
        { id: uid, role: "user", content: text.trim(), fromVoice },
        { id: aid, role: "assistant", content: `Opening ${label}.`, complete: true, navigated: { path: quickPath, label }, toolCalls: ["navigateTo"] },
      ]);
      setInput("");
      navigate(normalizeNavPath(quickPath));
      if (fromVoice) void speak(`Opening ${label}`);
      return;
    }
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
        (action) => queueVedaFormAction(action),
        handleDocumentUpdated,
        (dt, id, recipients, docNumber) => { void handleVedaEmail(dt, id, recipients, docNumber); },
        location,
        selectedCompany?.id,
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
  }, [thinking, history, memory, handleNavigate, location, selectedCompany?.id, handleDocumentUpdated, handleVedaEmail, navigate]);

  const submit = () => send(input);
  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); }
  };

  // Panel mic: one tap starts listening; utterance ends on pause (silence) — not tap-to-stop.
  const mic = async () => {
    if (thinking || transcribing) return;
    // Second tap only cancels if already listening (escape hatch)
    if (panelListening) {
      panelListenAbortRef.current?.abort();
      return;
    }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setVoiceError("Voice listening needs Chrome or Edge. Say \"Veda\" with hands-free, or type instead.");
      return;
    }
    setVoiceError(null);
    setMicError(false);
    setPanelListening(true);
    const ctrl = new AbortController();
    panelListenAbortRef.current = ctrl;
    try {
      const t = await listenForCommand(() => {}, ctrl.signal);
      if (ctrl.signal.aborted) return;
      if (t.trim()) await send(t, true);
      else setVoiceError("Couldn't catch that — speak again, then pause when done.");
    } catch {
      setVoiceError("Voice listening failed — try again or type instead.");
    } finally {
      setPanelListening(false);
      panelListenAbortRef.current = null;
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
      {/* Hands-free voice runs fully hidden — no overlay box. Chat opens only via FAB. */}

      {/* ── FAB trigger — chat panel opens ONLY from this icon ── */}
      {!open && (
        <div className="group fixed bottom-6 right-0 z-40 flex flex-col items-end gap-2 translate-x-[calc(100%-10px)] hover:translate-x-0 transition-transform duration-300 ease-in-out pr-3">
          {wakeSupported && (
            <button
              onClick={toggleHandsFree}
              title={
                wakeError
                  ? "Mic blocked — allow microphone, or press Alt+M"
                  : handsFree
                  ? "Hands-free ON — say Veda anytime (stays hidden)"
                  : "Enable hands-free listening"
              }
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium shadow-md transition-all opacity-0 group-hover:opacity-100 duration-200",
                wakeError
                  ? "bg-yellow-500/10 text-yellow-700 border border-yellow-300"
                  : handsFree
                  ? "bg-primary text-primary-foreground"
                  : "bg-background border border-border text-muted-foreground hover:text-foreground",
              )}
            >
              <Radio className="h-3 w-3" />
              {wakeError ? "⚠ Mic blocked" : handsFree ? "Listening" : "Hands-free OFF"}
            </button>
          )}
          <button
            onClick={() => setOpen(true)}
            title="Open Veda chat"
            className={cn(
              "relative flex items-center justify-center w-12 h-12 bg-primary text-primary-foreground rounded-full shadow-xl hover:bg-primary/90 transition-all hover:scale-105 active:scale-95",
            )}
          >
            {handsFree && convState === "idle" && (
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
                {handsFree && (
                  <span className="flex items-center gap-1 text-xs text-primary font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                    hands-free
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {wakeSupported && (
                  <button
                    onClick={toggleHandsFree}
                    title={
                      wakeError
                        ? "Mic blocked by browser — allow microphone, or use Alt+M"
                        : handsFree
                        ? "Hands-free ON — Veda stays hidden until you open chat"
                        : "Turn on hands-free listening"
                    }
                    className={cn(
                      "flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md transition-colors",
                      wakeError
                        ? "bg-yellow-500/10 text-yellow-600 font-medium"
                        : handsFree
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted",
                    )}
                  >
                    <Radio className="h-3 w-3" />
                    {wakeError ? "⚠ Mic blocked" : handsFree ? "Hands-free" : "Hands-free OFF"}
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
                        {handsFree && (
                          <p className="text-xs text-muted-foreground mt-1.5">
                            Hands-free is on — talk to Veda without opening this chat
                          </p>
                        )}
                      </div>

                      {/* Speak button — silence ends the utterance */}
                      <div className="w-full flex flex-col items-center gap-3">
                        <button
                          onClick={mic}
                          disabled={transcribing || thinking}
                          className={cn(
                            "relative w-full flex items-center justify-center gap-3 px-6 py-4 rounded-2xl font-semibold text-base transition-all duration-200 shadow-md select-none",
                            micError
                              ? "bg-red-100 text-red-600 border border-red-200"
                              : panelListening
                              ? "bg-red-500 text-white shadow-red-200 shadow-lg scale-[1.02]"
                              : "bg-primary text-primary-foreground hover:bg-primary/90 hover:scale-[1.02] active:scale-[0.98]",
                          )}
                        >
                          {panelListening && (
                            <span className="absolute inset-0 rounded-2xl animate-ping bg-red-400 opacity-30 pointer-events-none" />
                          )}
                          <span className={cn(
                            "flex items-center justify-center w-9 h-9 rounded-full shrink-0",
                            panelListening ? "bg-white/20" : "bg-white/15",
                          )}>
                            {panelListening
                              ? <Mic className="h-5 w-5" />
                              : <Mic className="h-5 w-5" />}
                          </span>
                          <span className="flex flex-col items-start leading-tight">
                            <span className="text-sm font-semibold">
                              {micError ? "Mic access denied" : panelListening ? "Listening… pause when done" : "Speak to Veda"}
                            </span>
                            {!panelListening && !micError && (
                              <span className="text-xs opacity-70 font-normal">Speak, then pause — no tap to stop</span>
                            )}
                            {panelListening && (
                              <span className="text-xs opacity-70 font-normal">Ends automatically when you pause</span>
                            )}
                          </span>
                          {panelListening && (
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
                    placeholder={panelListening ? "Listening… pause when done" : "Ask Veda anything…"}
                    rows={1}
                    disabled={thinking || panelListening || transcribing}
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
                        title={micError ? "Mic access denied" : panelListening ? "Cancel listening" : "Speak — ends when you pause"}
                        className={cn(
                          "w-7 h-7 rounded-full flex items-center justify-center transition-all",
                          micError ? "bg-red-100 text-red-500 dark:bg-red-950/40"
                            : panelListening ? "bg-red-500 text-white animate-pulse"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        <Mic className="h-3.5 w-3.5" />
                      </button>
                      {micError && (
                        <div className="absolute bottom-full right-0 mb-1.5 whitespace-nowrap text-xs bg-red-600 text-white px-2 py-0.5 rounded pointer-events-none">
                          Mic denied
                        </div>
                      )}
                    </div>
                    <button
                      onClick={submit}
                      disabled={!input.trim() || thinking || panelListening}
                      className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    >
                      <Send className="h-3 w-3" />
                    </button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground text-center mt-1.5">
                  Enter to send · Esc to close · Speak then pause
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
