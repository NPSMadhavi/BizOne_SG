import { useState, useRef, useEffect, useCallback } from "react";
import {
  Send, Mic, Volume2, Loader2, Sparkles, ExternalLink,
  Square, BarChart2, Navigation, X, CheckCircle2, Plus, Radio,
  PanelRightClose, Columns, Maximize2, Minimize2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth-context";
import { queueVedaFormFill } from "@/hooks/useVedaFormFill";
import { queueVedaFormAction } from "@/hooks/useVedaFormActions";
import {
  dispatchOptimisticGuidedFill,
  guidedAnswerHint,
  isGuidedCreatePath,
  sanitizeGuidedAnswer,
  WAKE_WORD,
  WAKE_TOKEN_RE,
  isWakeWordDetected,
} from "@/lib/veda-optimistic-fill";
import {
  applyGuidedEmployeeAnswer,
  createGuidedEmployeeSession,
  currentEmployeeQuestion,
  type GuidedEmployeeSession,
} from "@/lib/veda-guided-employee";
import {
  applyGuidedSalesOrderAnswer,
  createGuidedSalesOrderSession,
  currentSoQuestion,
  type GuidedSalesOrderSession,
} from "@/lib/veda-guided-sales-order";
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
  getStockItem: "Loading stock item",
  createStockItem: "Creating stock item",
  updateStockItem: "Updating stock item",
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
  openDirectoryForm: "Opening form",
  searchEmployees: "Searching employees",
  createEmployee: "Creating employee",
  updateEmployee: "Updating employee",
  searchAssets: "Searching assets",
  getAsset: "Loading asset",
  createAsset: "Creating asset",
  updateAsset: "Updating asset",
  createCustomer: "Creating customer",
  updateCustomer: "Updating customer",
  createVendor: "Creating vendor",
  updateVendor: "Updating vendor",
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

type QuickNavResult = { path: string; prefill?: Record<string, string>; spokenParty?: string };

/** True when text is a create/open navigation phrase, not a person/company name. */
function looksLikeCreateOrNavPhrase(text: string): boolean {
  const t = String(text || "").toLowerCase().replace(/\s+/g, " ").trim();
  if (!t) return true;
  if (/\b(create|open|show|launch|add|make|go\s*to|goto|navigate|please\s*go|form|page|module)\b/.test(t)) return true;
  if (/\b(new\s+)?(employee|staff|invoice|quotation|quote|purchase\s*order|delivery\s*order|customer|vendor|asset|fixed\s*asset)\b/.test(t)) return true;
  return false;
}

/** Pull party name from "for Acme" / "named John" — never from "go to create employee". */
function extractPartyFromCommand(command: string): string | null {
  const raw = String(command || "").replace(/\s+/g, " ").trim();
  // Strip navigation "go/navigate/take me to …" so "to" is not treated as a party delimiter
  const t = raw.replace(
    /\b(?:go|goto|navigate|take\s+me|switch|bring\s+(?:me\s+)?(?:up\s+)?)(?:\s+to)?\b/gi,
    " ",
  ).replace(/\s+/g, " ").trim();

  // Prefer explicit "customer/vendor X" or "named/called X"
  const labeled = t.match(
    /\b(?:customer|vendor|supplier|client)\s+(?:name\s+)?(?:is\s+|as\s+)?(.+?)(?:\s+(?:please|now|today)\s*[.!]?\s*$|[.!?]?\s*$)/i,
  );
  const named = t.match(
    /\b(?:named|called)\s+(.+?)(?:\s+(?:please|now|today|thanks|thank\s*you)\s*[.!]?\s*$|[.!?]?\s*$)/i,
  );
  // "for Acme" / "to SP Systems" — safe after stripping "go to …"
  const forTo = t.match(
    /\b(?:for|to|under)\s+(.+?)(?:\s+(?:please|now|today|thanks|thank\s*you)\s*[.!]?\s*$|[.!?]?\s*$)/i,
  );
  const m = labeled || named || forTo;
  if (!m) return null;
  let name = m[1]
    .replace(/\b(a|an|the)\s+(new\s+)?(invoice|quotation|quote|purchase\s*order|delivery\s*order|employee|staff|form)\b/gi, "")
    .replace(/\b(customer|vendor|supplier|client|employee|staff|create|new|open|add|form|page|please|go)\b/gi, "")
    .replace(/[.,!?]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!name) return null;
  if (/^(me|us|myself|yourself|them|him|her|it|a|an|the|new|form|this|that|quotation|invoice|order|employee|staff)$/i.test(name)) return null;
  if (looksLikeCreateOrNavPhrase(name)) return null;
  // Reject tiny STT fragments
  if (name.length < 2) return null;
  if (name.split(/\s+/).length > 6) name = name.split(/\s+/).slice(0, 6).join(" ");
  return name;
}

/** Guided kickoff instructions after the create form is already open. */
function guidedCreateKickoffHint(path: string, partyHint?: string): string {
  const isEmployee = /\/employees\//.test(path);
  const navOnly =
    "NAVIGATION ONLY — do NOT fill any field from the open/create command. Do NOT invent values. Use ONLY later spoken answers.";
  if (isEmployee) {
    // Never prefill employee name from a create/nav utterance (false party hints)
    const safeName =
      partyHint && !looksLikeCreateOrNavPhrase(partyHint) ? partyHint.trim() : null;
    if (safeName) {
      return `${navOnly} User already gave employee name "${safeName}". Immediately fillCurrentForm with name only. Then ask ONLY "Employee ID?" in ≤6 words. After each answer: fill that field, then ask the next. Ask ALL fields one by one: employeeId → name → email → phone → address → department → salary → designation → nationality → prStatus (if PR) → dateOfBirth → joinDate → passportNumber → passportExpiry → visaType → visaNumber → visaExpiry → nricNumber → nricExpiry → status. Never skip. Never invent.`;
    }
    return `${navOnly} Start guided employee create: ask ONLY "Employee ID?" now. After each answer: fillCurrentForm with ONLY that field, then ask the next in ≤6 words. Ask ALL fields one by one: employeeId → name → email → phone → address → department → salary → designation → nationality → prStatus (if PR) → dateOfBirth → joinDate → passportNumber → passportExpiry → visaType → visaNumber → visaExpiry → nricNumber → nricExpiry → status. Never skip. Never invent. Never fill from the open command.`;
  }
  if (partyHint && !looksLikeCreateOrNavPhrase(partyHint)) {
    return `${navOnly} User already named the party as "${partyHint}". FIRST call searchCustomers or searchVendors with that exact text. Then fillCurrentForm with customerName/vendorName using the BEST directory match (or the spoken text if no match). Confirm what you filled, then ask ONLY the next required field. Do NOT ask for the name again.`;
  }
  return `${navOnly} Start guided create: ask ONLY the first field now.`;
}

function matchExplicitFormAction(text: string): "save" | "preview" | "download" | "close" | null {
  const t = normalizeVoiceTranscript(String(text || "")).toLowerCase().replace(/\s+/g, " ").trim();
  if (!t) return null;
  const clean = t.replace(/^(?:veda|please|kindly|can\s+you|could\s+you)\s+/i, "").replace(/[.!?]+$/g, "").trim();

  // Close / exit / cancel form commands
  if (
    /^(?:close|exit|leave|dismiss|cancel)(?:\s+(?:the|this|current)?\s*(?:form|dialog|modal|screen|drawer|page|editor|new|window|record|it))?$/i.test(clean) ||
    /^(?:back\s+to\s+list|go\s+back|discard(?:\s+form|\s+changes)?)$/i.test(clean) ||
    clean === "close" || clean === "close form" || clean === "cancel" || clean === "cancel form" || clean === "exit" || clean === "exit form"
  ) {
    return "close";
  }

  if (
    /^(?:save|submit)(?:\s+(?:the|this)?\s*(?:form|document|record|draft|changes|details|it))?$/i.test(clean) ||
    /^save\s+and\s+(?:preview|download)$/i.test(clean) ||
    clean === "save" || clean === "submit" || clean === "save now"
  ) {
    return "save";
  }
  if (
    /^(?:preview|show\s+preview)(?:\s+(?:the|this)?\s*(?:form|document|record|draft|pdf|it))?$/i.test(clean) ||
    clean === "preview" || clean === "preview now"
  ) {
    return "preview";
  }
  if (
    /^(?:download|print)(?:\s+(?:the|this)?\s*(?:form|document|record|pdf|invoice|it))?$/i.test(clean) ||
    clean === "download" || clean === "download pdf"
  ) {
    return "download";
  }
  return null;
}

function closeActiveFormsAndModals(navigate: (path: string) => void, currentPath: string): { closed: boolean; message: string } {
  // 1. Broadcast close action to any active form component
  queueVedaFormAction("close");

  // 2. Dispatch events for custom modals and directory forms
  window.dispatchEvent(new CustomEvent("veda:close-modal"));
  window.dispatchEvent(new CustomEvent("veda:open-directory-form", { detail: { mode: "close" } }));

  // 3. Dispatch Escape key to dismiss any open Radix UI Dialog / Sheet / Popover / Command
  try {
    const escEvent = new KeyboardEvent("keydown", {
      key: "Escape",
      code: "Escape",
      keyCode: 27,
      which: 27,
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(escEvent);
    window.dispatchEvent(escEvent);
  } catch {}

  // 4. Click any open dialog/sheet close button
  try {
    const closeButtons = document.querySelectorAll<HTMLElement>(
      '[role="dialog"] button[aria-label="Close"], [data-state="open"] button[aria-label="Close"], [role="dialog"] button:has(svg.lucide-x)'
    );
    closeButtons.forEach((btn) => {
      try { btn.click(); } catch {}
    });
  } catch {}

  // 5. If on a form route (/module/new or /module/:id/edit or ?vedaNew=1), navigate back to parent list/view
  const cleanPath = (currentPath || "").split("?")[0];
  const editMatch = cleanPath.match(/^\/([a-z0-9-]+)\/(\d+)\/edit$/i);
  const newMatch = cleanPath.match(/^\/([a-z0-9-]+)\/new$/i);
  const isVedaNew = (currentPath || "").includes("vedaNew=1");

  if (editMatch) {
    const moduleName = editMatch[1];
    const id = editMatch[2];
    const parentPath = `/${moduleName}/${id}`;
    navigate(parentPath);
    const label = PATH_LABELS[`/${moduleName}`] || moduleName.replace(/-/g, " ");
    return { closed: true, message: `Closed form, returned to ${label}.` };
  }

  if (newMatch) {
    const moduleName = newMatch[1];
    const parentPath = `/${moduleName}`;
    navigate(parentPath);
    const label = PATH_LABELS[parentPath] || moduleName.replace(/-/g, " ");
    return { closed: true, message: `Closed form, returned to ${label}.` };
  }

  if (isVedaNew) {
    navigate(cleanPath);
    const label = PATH_LABELS[cleanPath] || cleanPath;
    return { closed: true, message: `Closed form, returned to ${label}.` };
  }

  return { closed: true, message: "Form closed." };
}

function matchDocViewEditAction(command: string, currentPath: string): { path: string; label: string } | null {
  const t = normalizeVoiceTranscript(String(command || "")).toLowerCase().replace(/\s+/g, " ").trim();
  const clean = t.replace(/^(?:veda|please|kindly|can\s+you|could\s+you)\s+/i, "").replace(/[.!?]+$/g, "").trim();

  const isEditCmd = /^(?:edit|update|modify|change)(?:\s+(?:this|the|current)?\s*(?:form|document|invoice|quotation|quote|order|purchase\s*order|delivery\s*order|sales\s*order|voucher|project))?$/i.test(clean);
  const isViewCmd = /^(?:view|show|see|open|display)(?:\s+(?:this|the|current)?\s*(?:form|document|invoice|quotation|quote|order|purchase\s*order|delivery\s*order|sales\s*order|voucher|project))?$/i.test(clean);

  const viewMatch = currentPath.match(/^\/(invoices|quotations|sales-orders|purchase-orders|delivery-orders|purchase-quotations|proforma-invoices|vendor-invoices|projects|assets)\/(\d+)$/);
  if (viewMatch && isEditCmd) {
    const [, moduleName, id] = viewMatch;
    return { path: `/${moduleName}/${id}/edit`, label: `Edit ${moduleName.replace(/-/g, " ")}` };
  }

  const editMatch = currentPath.match(/^\/(invoices|quotations|sales-orders|purchase-orders|delivery-orders|purchase-quotations|proforma-invoices|vendor-invoices|projects|assets)\/(\d+)\/edit$/);
  if (editMatch && isViewCmd) {
    const [, moduleName, id] = editMatch;
    return { path: `/${moduleName}/${id}`, label: `View ${moduleName.replace(/-/g, " ")}` };
  }

  return null;
}

/** Instant client-side navigate for clear "go to / open / create …" phrases (no LLM wait). */
function matchQuickNavigate(command: string): QuickNavResult | null {
  const t = normalizeVoiceTranscript(String(command || "")).toLowerCase().replace(/\s+/g, " ").trim();
  if (!t) return null;

  // Search / analytics / specific-record phrases must reach the agent — never short-circuit.
  if (/\b(find|search|look\s*up|latest|last|previous|recent|paid|confirmed|draft|void|revenue|total|amount|balance|how\s+many|what(?:'s|\s+is)|which|when|whose)\b/.test(t)) {
    return null;
  }
  if (/\b(inv-|qt-|po-|do-|pi-)\w*\d+/i.test(t)) return null;

  const wantsCreate =
    /\b(create|new|add|make)\b/.test(t)
    || /\b(open|show|launch)\b.+\b(new\s+)?(form|page)\b/.test(t)
    || /\b(open|show)\s+(a\s+|the\s+)?(new\s+)?(invoice|quotation|quote|purchase\s*order|delivery\s*order|sales\s*order|employee|customer|vendor|stock\s*item|product)\b/.test(t);

  const party = extractPartyFromCommand(normalizeVoiceTranscript(command));

  if (wantsCreate) {
    const openNew = (path: string): QuickNavResult => ({
      path,
      spokenParty: party || undefined,
    });
    if (/\b(stock\s*items?|products?|inventory\s*items?|catalogue\s*items?)\b/.test(t)) return openNew("/stock/new");
    if (/\b(vendor\s*invoices?|supplier\s*invoices?)\b/.test(t)) return openNew("/vendor-invoices/new");
    if (/\bpurchase\s*quotations?\b/.test(t)) return openNew("/purchase-quotations/new");
    if (/\bproforma\s*invoices?\b|\bpi\b/.test(t)) return openNew("/proforma-invoices/new");
    if (/\binvoices?\b/.test(t)) return openNew("/invoices/new");
    if (/\bquotations?\b|\bquotes?\b/.test(t)) return openNew("/quotations/new");
    if (/\bpurchase\s*orders?\b/.test(t)) return openNew("/purchase-orders/new");
    if (/\bdelivery\s*orders?\b/.test(t)) return openNew("/delivery-orders/new");
    if (/\bsales\s*orders?\b/.test(t)) return openNew("/sales-orders/new");
    if (/\bemployees?\b|\bstaff\b|\bperson\b/.test(t)) return openNew("/employees/new");
    if (/\bcustomers?\b/.test(t)) return openNew("/customers?vedaNew=1");
    if (/\bvendors?\b|\bsuppliers?\b/.test(t)) return openNew("/vendors?vedaNew=1");
    if (/\bprojects?\b/.test(t)) return openNew("/projects/new");
    if (/\b(assets?|fixed\s*assets?)\b/.test(t)) return openNew("/assets/new");
  }

  // Plain list / module navigation (no create intent)
  if (t.split(/\s+/).length > 10) return null;

  const wantsNav = /\b(go\s*to|goto|open|show|take\s*me|navigate|switch\s*to|bring\s*(me\s*)?up|launch|visit)\b/.test(t)
    || /\b(page|module|screen|list)\b/.test(t)
    || /^(invoices?|quotations?|quotes?|purchase\s*orders?|delivery\s*orders?|customers?|vendors?|employees?|staff|stock|grn|dashboard|settings|point\s*of\s*sale|pos|purchase\s*quotations?|proforma\s*invoices?|vendor\s*invoices?|projects?|inventory|catalogue|catalog|item\s*master|assets?|fixed\s*assets?)$/.test(t);
  if (!wantsNav) return null;

  // "show/open X for Y" without create → let agent search (unless it's clearly a page jump)
  if (/\b(show|open|display|get)\b.+\b(for|of|from|about|with)\b/.test(t) && !/\b(page|list|module|screen|form)\b/.test(t)) {
    return null;
  }

  if (/\b(vendor\s*invoices?|supplier\s*invoices?)\b/.test(t)) return { path: "/vendor-invoices" };
  if (/\bpurchase\s*quotations?\b/.test(t)) return { path: "/purchase-quotations" };
  if (/\bproforma\s*invoices?\b/.test(t)) return { path: "/proforma-invoices" };
  if (/\bpurchase\s*orders?\b/.test(t)) return { path: "/purchase-orders" };
  if (/\bpoint\s*of\s*sale\b/.test(t)) return { path: "/point-of-sale" };
  if (/\binvoices?\b/.test(t)) return { path: "/invoices" };
  if (/\bquotations?\b|\bquotes?\b/.test(t)) return { path: "/quotations" };
  if (/\bdelivery\s*orders?\b/.test(t)) return { path: "/delivery-orders" };
  if (/\bsales\s*orders?\b/.test(t)) return { path: "/sales-orders" };
  if (/\bemployees?\b|\bstaff\b|\bpayroll\b/.test(t)) return { path: "/employees" };
  if (/\bcustomers?\b/.test(t)) return { path: "/customers" };
  if (/\bvendors?\b|\bsuppliers?\b/.test(t)) return { path: "/vendors" };
  if (/\bprojects?\b/.test(t)) return { path: "/projects" };
  if (/\bstock\b|\binventory\b|\bcatalogue\b|\bcatalog\b|\bitem\s*master\b/.test(t)) return { path: "/stock" };
  if (/\b(assets?|fixed\s*assets?)\b/.test(t)) return { path: "/assets" };
  if (/\bgrn\b|\bgoods\s*received\b/.test(t)) return { path: "/grn" };
  if (/\bdashboard\b|\bhome\b/.test(t)) return { path: "/dashboard" };
  if (/\bsettings?\b/.test(t)) return { path: "/settings" };
  if (/\bexpenses?\b/.test(t)) return { path: "/accounting/expenses" };
  if (/\baccounting\b/.test(t)) return { path: "/accounting/chart-of-accounts" };
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
  "/sales-orders": "Sales Orders",
  "/sales-orders/new": "New Sales Order",
  "/purchase-quotations": "Purchase Quotations",
  "/purchase-quotations/new": "New Purchase Quotation",
  "/proforma-invoices": "Proforma Invoices",
  "/proforma-invoices/new": "New Proforma Invoice",
  "/employees": "Employees",
  "/employees/new": "New Employee",
  "/assets": "Fixed Assets",
  "/assets/new": "New Asset",
  "/stock": "Item Master",
  "/stock/new": "New Stock Item",
  "/grn": "GRN",
  "/settings": "Settings",
  "/vendor-invoices": "Vendor Invoices",
  "/vendor-invoices/new": "New Vendor Invoice",
  "/customers": "Customers",
  "/customers?vedaNew=1": "New Customer",
  "/vendors": "Vendors",
  "/vendors?vedaNew=1": "New Vendor",
  "/projects": "Projects",
  "/projects/new": "New Project",
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

/** Instant sensory audio chime (<1ms latency) using Web Audio API when wake word is detected. */
function playWakeChime() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (ctx.state === "suspended") {
      void ctx.resume();
    }
    const now = ctx.currentTime;

    // First tone (warm ascending chime: D5 ~ 587Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(587.33, now);
    gain1.gain.setValueAtTime(0.14, now);
    gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.12);

    // Second tone (higher crisp chime: A5 ~ 880Hz)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(880, now + 0.07);
    gain2.gain.setValueAtTime(0.18, now + 0.07);
    gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.07);
    osc2.stop(now + 0.28);

    setTimeout(() => {
      try { void ctx.close(); } catch {}
    }, 350);
  } catch {}
}

let _browserTtsResolve: (() => void) | null = null;
let _browserTtsTimeout: ReturnType<typeof setTimeout> | null = null;
function speakBrowser(text: string, opts?: { rate?: number; deferMs?: number }): Promise<void> {
  return new Promise((resolve) => {
    if (!window.speechSynthesis) { resolve(); return; }

    // Clear any prior pending promise and utterance
    if (_browserTtsTimeout) { clearTimeout(_browserTtsTimeout); _browserTtsTimeout = null; }
    window.speechSynthesis.cancel();
    _browserTtsResolve?.();
    _browserTtsResolve = resolve;

    if (window.speechSynthesis.paused) {
      try { window.speechSynthesis.resume(); } catch {}
    }

    const clean = text.replace(/\*\*/g, "").replace(/\*/g, "").replace(/#{1,6}\s/g, "").replace(/`/g, "").replace(/•\s*/g, "").trim();
    if (!clean) { _browserTtsResolve = null; resolve(); return; }

    const done = () => {
      if (_browserTtsTimeout) { clearTimeout(_browserTtsTimeout); _browserTtsTimeout = null; }
      if (_browserTtsResolve === resolve) { _browserTtsResolve = null; resolve(); }
    };

    const rate = opts?.rate ?? 0.95;
    const deferMs = opts?.deferMs ?? 80;
    // Slower rate → longer hard timeout so speech isn't cut off early
    const estimatedMs = Math.max(1600, Math.round(clean.split(/\s+/).length * (420 / rate) + 900));
    _browserTtsTimeout = setTimeout(done, estimatedMs);

    setTimeout(() => {
      if (_browserTtsResolve !== resolve) return; // already cancelled by a newer call
      const utt = new SpeechSynthesisUtterance(clean);
      utt.rate = rate;
      utt.pitch = 1.05;
      utt.volume = 1.0;
      const voice = _cachedVoice ?? pickBestVoice(window.speechSynthesis.getVoices());
      if (voice) utt.voice = voice;
      utt.onend = done;
      utt.onerror = done;
      window.speechSynthesis.speak(utt);
    }, deferMs);
  });
}

/** Fast wake acknowledgment word so user immediately hears Veda is awake and ready. */
async function speakWakeGreeting(text: string): Promise<void> {
  const clean = String(text || "Ready!").trim();
  if (!clean) return;
  _userHasInteracted = true;
  if (typeof window !== "undefined" && window.speechSynthesis?.paused) {
    try { window.speechSynthesis.resume(); } catch {}
  }
  await speakBrowser(clean, { rate: 1.15, deferMs: 0 });
}

async function speak(text: string): Promise<void> {
  const clean = text.replace(/\*\*/g, "").replace(/\*/g, "").replace(/#{1,6}\s/g, "").replace(/`/g, "").replace(/•\s*/g, "").trim().slice(0, 600);
  if (!clean) return;
  await speakBrowser(clean);
}

/** Guided prompts — clear pace (not rushed). */
async function speakGuidedFast(text: string): Promise<void> {
  const clean = String(text || "").trim().slice(0, 80);
  if (!clean) return;
  await speakBrowser(clean, { rate: 1.0, deferMs: 40 });
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

function getSpeechLang(): string {
  if (typeof navigator !== "undefined" && navigator.language) return navigator.language;
  return "en-SG";
}

/** Fix common Web Speech mishears for BizOne / Singapore ERP phrases. */
function normalizeVoiceTranscript(raw: string): string {
  let t = String(raw || "").replace(/\s+/g, " ").trim();
  if (!t) return "";

  t = t
    .replace(/\bcotations?\b/gi, (m) => (/s$/i.test(m) ? "quotations" : "quotation"))
    .replace(/\bkotations?\b/gi, (m) => (/s$/i.test(m) ? "quotations" : "quotation"))
    .replace(/\bkotat(ion|ions)\b/gi, (_m, g1) => (g1 === "ions" ? "quotations" : "quotation"))
    .replace(/\bquote\s*a\s*tions?\b/gi, (m) => (/s$/i.test(m) ? "quotations" : "quotation"))
    .replace(/\bquote\s*form\b/gi, "quotation form")
    .replace(/\bopen\s+a\s+quote\b/gi, "open a quotation")
    .replace(/\bcreate\s+a\s+quote\b/gi, "create a quotation")
    .replace(/\bmake\s+a\s+quote\b/gi, "create a quotation")
    .replace(/\bin\s*voices?\b/gi, (m) => (/s$/i.test(m) ? "invoices" : "invoice"))
    .replace(/\bgo\s+to\s+the\b/gi, "go to")
    .replace(/\bplease\s*$/i, "")
    .replace(/\bfor\s+me\s+please\b/gi, "for me");

  return t.replace(/\s+/g, " ").trim();
}

const ERP_SCORE_WORDS = [
  "quotation", "quotations", "quote", "invoice", "invoices", "purchase", "order", "orders",
  "delivery", "customer", "vendor", "supplier", "employee", "create", "open", "form",
  "save", "preview", "download", "veda", "new", "edit", "asset", "assets", "stock", "items",
];

/** Prefer the SpeechRecognition alternative that best matches ERP vocabulary. */
function pickBestSpeechAlternative(result: SpeechRecognitionResult | any): { text: string; conf: number } {
  const alts: Array<{ text: string; conf: number; score: number }> = [];
  const n = result?.length ?? 0;
  for (let j = 0; j < n; j++) {
    const raw = String(result[j]?.transcript || "").trim();
    if (!raw) continue;
    const text = normalizeVoiceTranscript(raw);
    const conf = typeof result[j]?.confidence === "number" ? result[j].confidence : 0;
    const lower = text.toLowerCase();
    let score = conf * 10;
    for (const w of ERP_SCORE_WORDS) {
      if (lower.includes(w)) score += 1.5;
    }
    // Prefer phrases that look like create/open commands
    if (/\b(create|open|new|add|make|go to|show)\b/i.test(text)) score += 2;
    if (/\b(quotation|invoice|purchase order|delivery order|employee|customer|vendor)\b/i.test(text)) score += 2;
    alts.push({ text, conf, score });
  }
  if (!alts.length) return { text: "", conf: 0 };
  alts.sort((a, b) => b.score - a.score || b.conf - a.conf);
  return { text: alts[0].text, conf: alts[0].conf };
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

/** Ignore empty / filler / wake-only — never drop real short answers (names, IT, HR, phones). */
function isLikelyNoise(text: string): boolean {
  const t = String(text || "").trim().toLowerCase();
  if (!t) return true;
  if (isStopCommand(t)) return false;
  if (/^(close|cancel|exit|dismiss|save|preview|download)$/i.test(t)) return false;
  // Digits, emails, yes/no, currencies, common form answers are always real
  if (/\d/.test(t) || /@/.test(t)) return false;
  if (/^(yes|yeah|yep|yup|ok|okay|sure|no|nope|nah|skip|later|none|sgd|usd|eur|inr|myr|gbp|active|singapore|foreigner|pr)$/i.test(t)) return false;
  const words = t.split(/\s+/).filter(Boolean);
  // Wake word alone (or repeated) is never a field answer
  if (words.every(w => /^(veda|veeda|vida|vita|veta|veja|beda|vetta|weda|weeder|veeder|vader|feder|vedha|veyda|veida|beeda|bheda|hey)$/i.test(w))) {
    return true;
  }
  // Pure filler tokens only
  if (words.length === 1 && /^(um|uh|ah|oh|hmm|ha|la|na|aa|ee|the|a|an|so|and|then|please|hey|hi)$/i.test(words[0])) return true;
  if (t.replace(/\s+/g, "").length < 2) return true;
  // After stripping wake/filler, nothing left → noise
  if (!sanitizeGuidedAnswer(t)) return true;
  return false;
}

/** Speak fully unless user clearly says stop — do NOT barge-in on room chatter. */
function speakWithHardStopOnly(
  text: string,
  opts?: { signal?: AbortSignal },
): Promise<{ interrupted: boolean; stop?: boolean }> {
  return speakAndMaybeCapture(text, { ...opts, captureAnswer: false }).then(r => ({
    interrupted: r.interrupted,
    stop: r.stop,
  }));
}

/** True when STT likely heard Veda's own question (TTS echo), not a user answer. */
function looksLikeEchoOfQuestion(answer: string, question: string): boolean {
  const a = String(answer || "").toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
  const q = String(question || "").toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
  if (!a || !q) return false;
  if (a === q || a === q.replace(/\s+/g, "")) return true;
  const qCore = q.replace(/\b(please|what|is|the|your|a|an)\b/g, " ").replace(/\s+/g, " ").trim();
  if (qCore && (a === qCore || a.includes(qCore) || qCore.includes(a))) return true;
  const qWords = qCore.split(/\s+/).filter(w => w.length > 1);
  const aWords = new Set(a.split(/\s+/).filter(Boolean));
  if (qWords.length >= 2 && qWords.every(w => aWords.has(w))) return true;
  // Single-word questions like "Email?" — ignore if answer is just that label
  if (qWords.length === 1 && a === qWords[0]) return true;
  return false;
}

/**
 * Speak a short guided question while listening for the user's answer.
 * fast=true: snappy TTS + accept solid interim answers (don't wait for isFinal).
 */
function speakAndMaybeCapture(
  text: string,
  opts?: { signal?: AbortSignal; captureAnswer?: boolean; fast?: boolean },
): Promise<{ interrupted: boolean; stop?: boolean; answer?: string }> {
  return new Promise((resolve) => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    let settled = false;
    let bargeRec: any = null;
    let startRecTimer: ReturnType<typeof setTimeout> | null = null;
    let interimTimer: ReturnType<typeof setTimeout> | null = null;
    let heardFinal = "";
    let lastInterim = "";
    const capture = !!opts?.captureAnswer;
    const fast = !!opts?.fast;
    const question = String(text || "");

    const usableAnswer = (raw: string): string | undefined => {
      const cleaned = sanitizeGuidedAnswer(raw);
      if (!cleaned || isLikelyNoise(cleaned)) return undefined;
      if (looksLikeEchoOfQuestion(cleaned, question)) return undefined;
      return cleaned;
    };

    const finish = (result: { interrupted: boolean; stop?: boolean; answer?: string }) => {
      if (settled) return;
      settled = true;
      if (startRecTimer) clearTimeout(startRecTimer);
      if (interimTimer) clearTimeout(interimTimer);
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
      if (result.stop || result.answer) cancelSpeech();
      resolve(result);
    };

    opts?.signal?.addEventListener("abort", () => finish({ interrupted: false }));

    // Mic ASAP in fast mode so answers aren't lost under TTS
    startRecTimer = setTimeout(() => {
      if (settled || !SR) return;
      try {
        bargeRec = new SR();
        bargeRec.continuous = true;
        bargeRec.interimResults = true;
        bargeRec.lang = getSpeechLang();
        bargeRec.maxAlternatives = 5;
        claimSpeechMic(bargeRec);
        bargeRec.onresult = (evt: any) => {
          if (settled) return;
          let heard = "";
          for (let i = evt.resultIndex; i < evt.results.length; i++) {
            const picked = pickBestSpeechAlternative(evt.results[i]);
            if (!picked.text) continue;
            heard += (heard ? " " : "") + picked.text;
            if (evt.results[i].isFinal) {
              heardFinal = (heardFinal ? `${heardFinal} ${picked.text}` : picked.text).trim();
            } else {
              lastInterim = picked.text.trim();
            }
          }
          heard = heard.trim();
          if (isStopCommand(heard) || isStopCommand(heardFinal)) {
            finish({ interrupted: true, stop: true });
            return;
          }
          if (!capture) return;

          const finalAns = usableAnswer(heardFinal);
          if (finalAns) {
            finish({ interrupted: true, answer: finalAns });
            return;
          }

          // Fast path: commit stable interim — short delay for IDs/emails/phones, longer for names
          if (fast && lastInterim) {
            if (interimTimer) clearTimeout(interimTimer);
            const snap = lastInterim;
            const looksComplete =
              /@/.test(snap)
              || /[\d]/.test(snap)
              || /^(singapore|pr|foreigner|active|skip|none)$/i.test(snap.trim());
            interimTimer = setTimeout(() => {
              if (settled) return;
              const ans = usableAnswer(snap);
              if (ans) finish({ interrupted: true, answer: ans });
            }, looksComplete ? 160 : 380);
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
    }, fast ? 40 : 180);

    const speakP = fast ? speakGuidedFast(text) : speak(text);
    speakP
      .then(() => {
        if (settled) return;
        finish({
          interrupted: false,
          answer: capture ? usableAnswer(heardFinal || lastInterim) : undefined,
        });
      })
      .catch(() => finish({ interrupted: false }));
  });
}

/**
 * Guided employee turn: ask next ASAP and listen.
 * Returns the spoken answer (or "" if none / stop).
 */
async function guidedAskNext(
  question: string,
  signal: AbortSignal,
  onInterim?: (t: string) => void,
): Promise<{ answer?: string; stop?: boolean }> {
  const spoken = await speakAndMaybeCapture(question, {
    signal,
    captureAnswer: true,
    fast: true,
  });
  if (spoken.stop) return { stop: true };
  if (spoken.answer) return { answer: spoken.answer };
  // TTS ended with no answer — quick follow-up listen (short silence)
  if (signal.aborted) return {};
  const text = await listenForCommand(onInterim || (() => {}), signal, { silenceMs: 180 });
  if (signal.aborted) return {};
  if (isStopCommand(text)) return { stop: true };
  const cleaned = sanitizeGuidedAnswer(text);
  if (!cleaned || isLikelyNoise(cleaned) || looksLikeEchoOfQuestion(cleaned, question)) {
    return {};
  }
  return { answer: cleaned };
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
        if (ev.type === "open_directory_form") {
          window.dispatchEvent(new CustomEvent("veda:open-directory-form", {
            detail: { type: ev.formType, mode: ev.mode, id: ev.id },
          }));
        }
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
// Phonetic / STT variants of "Veda" and wake commands (including soft, slow, and Indian English accents)
let WAKE_WORDS = /\b(wake\s*up(?:\s*veda)?|wake\s*veda|wake\s*up\s*agent|wake\s*agent|wake\s*up|wake|veda|veeda|vida|vita|veta|veja|beda|vetta|weda|weeder|veeder|vader|feder|fader|vedaah|vedaa|vedas|vedha|veyda|veida|beeda|bheda|vada|vaada|vadaa|wada|waada|weather|whether|wait\s*a|waiter|way\s*that|way\s*the|way\s*da|wayda|where\s*the|wear\s*the|veena|veera|video|beta|vee\s*da|ve\s*da|v\s*da|veda\s*ji|hey\s*veda|hi\s*veda|hello\s*veda|ok\s*veda|okay\s*veda|yo\s*veda|oye\s*veda|agent|the\s*agent|hey\s*agent|hi\s*agent|hello\s*agent|call\s*agent|call\s*the\s*agent|bizone|biz\s*one|hey\s*bizone|assistant|hey\s*assistant)\b/i;
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

  // Explicit exact matches for wake commands without follow-on (including soft voice STT results)
  if (/^(wake\s*up(\s*veda)?|wake\s*veda|wake\s*up\s*agent|wake\s*agent|wake\s*up|wake|veda|hey\s*veda|hi\s*veda|hello\s*veda|ok\s*veda|agent|hey\s*agent|hi\s*agent|hello\s*agent|vada|wada|weather|whether|wait\s*a|veeda|vedaa|vida|wayda|way\s*da|veena|veera|video|beta)$/i.test(t)) {
    return { hit: true, followOn: undefined };
  }

  // Drop leading filler so "say veda" / "hey veda" / "ok veda" / "wake up veda" still wake
  const strippedLead = t.replace(/^(hey|hi|ok|okay|please|um|uh|so|say|call|wake|wake\s+up|yo|oye|hello)\s+(the\s+)?/i, "").trim();
  const candidates = [t, strippedLead].filter(Boolean);

  for (const c of candidates) {
    if (!WAKE_WORDS_REF.current.test(c)) continue;
    // reset lastIndex in case flag quirks
    WAKE_WORDS_REF.current.lastIndex = 0;
    let followOn = c
      .replace(WAKE_WORDS_REF.current, " ")
      .replace(/^(hey|hi|ok|okay|please|um|uh|so|say|call|wake|wake\s+up|yo|oye|hello)\s+(the\s+)?/i, "")
      .replace(/\s+/g, " ")
      .trim();
    followOn = followOn.replace(/^(veda|agent|assistant)\s+/i, "").trim();
    return { hit: true, followOn: followOn.length > 1 ? followOn : undefined };
  }

  // Single-token fuzzy: STT often mangles short words like "veda" or "agent" when spoken softly or slowly
  const tokens = [strippedLead.replace(/\s+/g, ""), ...strippedLead.split(/\s+/).filter(Boolean)];
  for (const one of tokens) {
    if (one.length < 3 || one.length > 8) continue;
    const targets = ["veda", "veeda", "vida", "vada", "weda", "wada", "beta", "agent", "weather", "veena", "veera", "video"];
    for (const target of targets) {
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
      if (dp[m][n] <= 1) {
        let followOn = strippedLead
          .split(/\s+/)
          .filter(w => w !== one && w.replace(/\s+/g, "") !== one)
          .join(" ")
          .replace(/^(hey|hi|ok|okay|please|um|uh|so|say|call|wake|wake\s+up|yo|oye|hello)\s+(the\s+)?/i, "")
          .trim();
        followOn = followOn.replace(/^(veda|agent|assistant)\s+/i, "").trim();
        return { hit: true, followOn: followOn.length > 1 ? followOn : undefined };
      }
    }
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
      // Continuous recognition keeps the mic open without restart gaps or dropped quiet speech
      rec.continuous      = true;
      rec.interimResults  = true;
      rec.lang            = getSpeechLang();
      rec.maxAlternatives = 8;
      claimSpeechMic(rec);
      recRef.current = rec;

      clearWatchdog();
      watchdogRef.current = setTimeout(() => {
        stopListening();
        if (enabledRef.current) timerRef.current = setTimeout(startListening, 10);
      }, 45_000);

      let fired = false;
      const tryWake = (transcript: string) => {
        if (fired || !transcript) return;
        onHeardRef.current?.(transcript);

        const wakeWordDetected = isWakeWordDetected(transcript) || matchWakeUtterance(transcript).hit;
        if (wakeWordDetected) {
          fired = true;
          stopListening();
          playWakeChime();
          const cleanCommand = sanitizeGuidedAnswer(transcript);
          onWakeRef.current(cleanCommand || undefined);
        }
      };

      rec.onresult = (evt: any) => {
        clearWatchdog();
        watchdogRef.current = setTimeout(() => {
          stopListening();
          if (enabledRef.current) timerRef.current = setTimeout(startListening, 10);
        }, 45_000);

        for (let i = evt.resultIndex; i < evt.results.length; i++) {
          for (let j = 0; j < evt.results[i].length; j++) {
            const transcript = normalizeVoiceTranscript(evt.results[i][j].transcript || "").toLowerCase().trim();
            if (transcript) tryWake(transcript);
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
        const delay = e.error === "no-speech" ? 10 : 80;
        if (enabledRef.current && !fired) timerRef.current = setTimeout(startListening, delay);
      };

      rec.onend = () => {
        clearWatchdog();
        if (_activeSpeechRec === rec) _activeSpeechRec = null;
        recRef.current = null;
        if (enabledRef.current && !fired) timerRef.current = setTimeout(startListening, 10);
      };

      rec.start();
    } catch {
      clearWatchdog();
      recRef.current = null;
      if (enabledRef.current) timerRef.current = setTimeout(startListening, 200);
    }
  }, [clearWatchdog, stopListening]);

  useEffect(() => {
    if (enabled) {
      timerRef.current = setTimeout(startListening, 10);
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
function listenForCommand(
  onInterim: (t: string) => void,
  signal?: AbortSignal,
  opts?: { silenceMs?: number },
): Promise<string> {
  return new Promise((resolve) => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { resolve(""); return; }

    let resolved = false;
    let finalText = "";
    let interimText = "";
    let silenceTimer: ReturnType<typeof setTimeout> | null = null;
    let maxTimer: ReturnType<typeof setTimeout> | null = null;
    let rec: any = null;
    let restartTimer: ReturnType<typeof setTimeout> | null = null;
    const silenceMs = opts?.silenceMs ?? 850;

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
        // continuous helps capture full "create quotation for Acme Systems" phrases
        rec.continuous = true;
        rec.interimResults = true;
        rec.lang = getSpeechLang();
        rec.maxAlternatives = 8;
        claimSpeechMic(rec);

        rec.onresult = (evt: any) => {
          for (let i = evt.resultIndex; i < evt.results.length; i++) {
            const picked = pickBestSpeechAlternative(evt.results[i]);
            const t = picked.text;
            const bestConf = picked.conf;
            if (!t) continue;
            // Only drop near-zero junk; accents and quiet speech often score low
            if (bestConf > 0 && bestConf < 0.01) continue;

            if (evt.results[i].isFinal) {
              if (isLikelyNoise(t) && !finalText) {
                continue;
              }
              finalText = (finalText ? `${finalText} ${t}` : t).trim();
              interimText = "";
              onInterim(finalText);
              if (silenceTimer) clearTimeout(silenceTimer);
              if (isStopCommand(finalText)) {
                done(finalText);
                return;
              }
              // Guided create uses a shorter pause for snappy field turns
              silenceTimer = setTimeout(() => {
                if (isLikelyNoise(finalText)) {
                  finalText = "";
                  onInterim("");
                  return;
                }
                done(normalizeVoiceTranscript(finalText));
              }, silenceMs);
            } else {
              interimText = t;
              onInterim(t);
              if (silenceTimer) clearTimeout(silenceTimer);
              if (isStopCommand(t)) {
                done(normalizeVoiceTranscript(t));
                return;
              }
            }
          }
        };

        rec.onerror = (e: any) => {
          if (_activeSpeechRec === rec) _activeSpeechRec = null;
          rec = null;
          if (e.error === "no-speech") {
            if (!resolved) restartTimer = setTimeout(startRec, 80);
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
          // Prefer final; if Chrome never finalized, keep interim so speech isn't lost
          if (finalText) {
            if (!silenceTimer) done(finalText);
            return;
          }
          if (interimText && !isLikelyNoise(interimText)) {
            done(normalizeVoiceTranscript(interimText));
            return;
          }
          restartTimer = setTimeout(startRec, 80);
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
  const [isDocked, setIsDocked] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    try {
      const saved = localStorage.getItem("veda_panel_docked");
      return saved === null ? true : saved === "true";
    } catch {
      return true;
    }
  });

  const toggleDocked = () => {
    setIsDocked(prev => {
      const next = !prev;
      try { localStorage.setItem("veda_panel_docked", String(next)); } catch {}
      return next;
    });
  };

  useEffect(() => {
    const handleOpen = () => setOpen(true);
    window.addEventListener("open-veda", handleOpen);
    return () => window.removeEventListener("open-veda", handleOpen);
  }, []);
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
  const locationRef = useRef(location);
  locationRef.current = location;
  /** Sticky path for guided create while ambient loop is open (avoids stale location closure). */
  const guidedFormPathRef = useRef<string | null>(null);
  /** Local employee field-by-field session — fills instantly without LLM. */
  const guidedEmployeeRef = useRef<GuidedEmployeeSession | null>(null);
  const guidedSalesOrderRef = useRef<GuidedSalesOrderSession | null>(null);
  const [memory] = useState(() => loadMemory());
  const { selectedCompany } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const resolveAgentPath = useCallback(() => {
    return guidedFormPathRef.current || locationRef.current || location;
  }, [location]);

  const dispatchFill = useCallback((fields: Record<string, any>) => {
    queueVedaFormFill(fields);
  }, []);

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
  const runAmbientConversation = useCallback(async (greeting = "Ready!", firstCommand?: string) => {
    if (convActiveRef.current) return;
    convActiveRef.current = true;
    killSpeechMic();
    cancelSpeech();
    const ctrl = new AbortController();
    ambientAbortRef.current = ctrl;
    ambientHistoryRef.current = [];
    guidedEmployeeRef.current = null;
    guidedSalesOrderRef.current = null;

    try {
      setConvState("greeting");
      setConvText(greeting);

      let pendingFirst = (firstCommand || "").trim();

      if (!pendingFirst) {
        // Non-blocking wake greeting so command mic starts listening IMMEDIATELY with zero lag
        _userHasInteracted = true;
        setConvState("listening");
        setConvText("");
        void speakWakeGreeting(greeting);
      } else {
        // If user already gave the command in the same breath, acknowledge immediately
        _userHasInteracted = true;
        setConvState("listening");
        setConvText(pendingFirst);
        void speakWakeGreeting("Sure.");
      }

      let lastSpokenWords: string[] = [];

      const isEcho = (cmd: string) => {
        if (lastSpokenWords.length === 0) return false;
        // Ignore common ERP words that legitimately repeat after Veda speaks
        const skip = new Set(["invoice", "invoices", "quotation", "quotations", "purchase", "order", "orders", "customer", "customers", "vendor", "vendors", "please", "veda", "opening", "create", "created", "ready", "sure", "yes"]);
        const cmdWords = cmd.toLowerCase().split(/\s+/).filter(w => w.length > 3 && !skip.has(w));
        if (cmdWords.length === 0) return false;
        const spoken = lastSpokenWords.filter(w => !skip.has(w));
        if (spoken.length === 0) return false;
        const matches = cmdWords.filter(w => spoken.includes(w)).length;
        // Only treat as echo when almost the whole command matches TTS
        return matches / cmdWords.length > 0.75;
      };

      while (convActiveRef.current) {
        let command = "";
        const guidedNow = isGuidedCreatePath(resolveAgentPath());
        if (pendingFirst) {
          command = pendingFirst;
          pendingFirst = "";
          setConvState("listening");
          setConvText(command);
        } else {
          setConvState("listening");
          setConvText("");
          // Guided field answers: shorter silence so turns feel instant
          command = await listenForCommand(
            t => setConvText(t),
            ctrl.signal,
            { silenceMs: guidedNow || guidedEmployeeRef.current || guidedSalesOrderRef.current ? 180 : 850 },
          );
        }
        if (ctrl.signal.aborted || !convActiveRef.current) break;

        command = normalizeVoiceTranscript(command);

        if (!command.trim() || isLikelyNoise(command)) {
          // Keep listening — ignore empty / room noise / wake-only (do NOT auto-stop)
          continue;
        }

        const cmdLower = command.trim().toLowerCase();
        if (cmdLower === "ready" || cmdLower === "ready!" || cmdLower === "sure" || cmdLower === "sure.") {
          // Discard echo of Veda's own greeting
          continue;
        }

        if (isEcho(command)) {
          lastSpokenWords = [];
          continue;
        }
        lastSpokenWords = [];

        const wakeAgain = matchWakeUtterance(command);
        if (wakeAgain.hit && wakeAgain.followOn) {
          command = wakeAgain.followOn;
        } else if (wakeAgain.hit && !wakeAgain.followOn) {
          // Bare "Veda" during guided create: stay listening — never fill a field
          if (guidedNow) continue;
          cancelSpeech();
          void speakWakeGreeting("Ready!");
          continue;
        }

        // Strip wake/filler before any form fill ("veda EMP01" → "EMP01")
        const cleanedAnswer = sanitizeGuidedAnswer(command);
        if (guidedEmployeeRef.current || guidedSalesOrderRef.current || guidedNow) {
          if (!cleanedAnswer) continue;
          command = cleanedAnswer;
        }

        if (isStopCommand(command)) {
          cancelSpeech();
          killSpeechMic();
          setConvState("speaking");
          setConvText("Okay, stopped.");
          await speak("Okay, stopped.");
          break;
        }

        const explicitAction = matchExplicitFormAction(command);
        if (explicitAction) {
          if (explicitAction === "close") {
            guidedEmployeeRef.current = null;
            guidedSalesOrderRef.current = null;
            guidedFormPathRef.current = null;
            const res = closeActiveFormsAndModals(navigate, resolveAgentPath());
            setConvState("speaking");
            setConvText(res.message);
            ambientHistoryRef.current = [
              ...ambientHistoryRef.current,
              { role: "user", content: command },
              { role: "assistant", content: res.message },
            ].slice(-16);
            await speakGuidedFast(res.message);
            continue;
          }
          queueVedaFormAction(explicitAction);
          const actionMsg = explicitAction === "save" ? "Saving form now." : explicitAction === "preview" ? "Opening preview." : "Downloading PDF.";
          setConvState("speaking");
          setConvText(actionMsg);
          ambientHistoryRef.current = [
            ...ambientHistoryRef.current,
            { role: "user", content: command },
            { role: "assistant", content: actionMsg },
          ].slice(-16);
          await speakGuidedFast(actionMsg);
          continue;
        }

        const docViewEdit = matchDocViewEditAction(command, resolveAgentPath());
        if (docViewEdit) {
          unlockVedaModules();
          navigate(docViewEdit.path);
          setConvState("speaking");
          const navMsg = `Opened ${docViewEdit.label}.`;
          setConvText(navMsg);
          ambientHistoryRef.current = [
            ...ambientHistoryRef.current,
            { role: "user", content: command },
            { role: "assistant", content: navMsg },
          ].slice(-16);
          await speakGuidedFast(navMsg);
          continue;
        }

        // ── Local guided employee: fill live instantly, ask next ASAP ──
        if (guidedEmployeeRef.current && /\/employees\/new/.test(resolveAgentPath())) {
          const session = guidedEmployeeRef.current;
          const result = applyGuidedEmployeeAnswer(session, command);
          // One quick re-fire if form listener raced mount
          if (result.filled) {
            window.setTimeout(() => queueVedaFormFill(result.filled!), 40);
          }
          ambientHistoryRef.current = [
            ...ambientHistoryRef.current,
            { role: "user", content: command },
            { role: "assistant", content: result.nextAsk },
          ].slice(-16);
          setConvText(result.nextAsk);

          if (result.done) {
            queueVedaFormAction("save");
            setConvState("speaking");
            void speakGuidedFast("Saving.");
            guidedEmployeeRef.current = null;
            continue;
          }

          setConvState("speaking");
          const asked = await guidedAskNext(result.nextAsk, ctrl.signal, t => setConvText(t));
          if (asked.stop) {
            await speak("Okay, stopped.");
            break;
          }
          if (asked.answer) pendingFirst = asked.answer;
          continue;
        }

        // ── Local guided sales order: continuous fields + live fill ──
        if (guidedSalesOrderRef.current && /\/sales-orders\/new/.test(resolveAgentPath())) {
          const session = guidedSalesOrderRef.current;
          const result = await applyGuidedSalesOrderAnswer(session, command);
          if (result.filled) {
            window.setTimeout(() => queueVedaFormFill(result.filled!), 40);
          }
          ambientHistoryRef.current = [
            ...ambientHistoryRef.current,
            { role: "user", content: command },
            { role: "assistant", content: result.nextAsk },
          ].slice(-16);
          setConvText(result.nextAsk);

          if (result.done) {
            queueVedaFormAction("preview");
            setConvState("speaking");
            void speakGuidedFast("Saving and preview.");
            guidedSalesOrderRef.current = null;
            continue;
          }

          setConvState("speaking");
          const asked = await guidedAskNext(result.nextAsk, ctrl.signal, t => setConvText(t));
          if (asked.stop) {
            await speak("Okay, stopped.");
            break;
          }
          if (asked.answer) pendingFirst = asked.answer;
          continue;
        }

        // Instant navigate for clear "go to / open / create …"
        const quick = matchQuickNavigate(command);
        if (quick) {
          const quickPath = quick.path;
          unlockVedaModules();
          if (quick.prefill) storeVedaPrefill(quick.prefill);
          navigate(normalizeNavPath(quickPath));
          if (isGuidedCreatePath(quickPath)) guidedFormPathRef.current = quickPath;
          setConvState("speaking");
          const label = PATH_LABELS[quickPath] || quickPath;
          const rawParty = quick.spokenParty || quick.prefill?.customerName || quick.prefill?.vendorName || quick.prefill?.name;
          const partyHint = rawParty && !looksLikeCreateOrNavPhrase(rawParty) ? rawParty : undefined;
          const isEmployeeCreate = /\/employees\/new/.test(quickPath);
          const isSalesOrderCreate = /\/sales-orders\/new/.test(quickPath);

          // Prefill only when we have trusted form keys (rare)
          if (quick.prefill) {
            await new Promise(r => setTimeout(r, 80));
            dispatchFill(quick.prefill);
          }

          // Employee create: local guided session — ask + fill instantly (no LLM)
          if (isEmployeeCreate) {
            const session = createGuidedEmployeeSession();
            guidedEmployeeRef.current = session;
            const q = currentEmployeeQuestion(session);
            ambientHistoryRef.current = [
              { role: "user", content: "[guided employee create started]" },
              { role: "assistant", content: q },
            ];
            setConvText(q);
            setConvState("speaking");
            const asked = await guidedAskNext(q, ctrl.signal, t => setConvText(t));
            if (asked.stop) {
              await speak("Okay, stopped.");
              break;
            }
            if (asked.answer) pendingFirst = asked.answer;
            continue;
          }

          // Sales order create: local continuous guided fill (no LLM lag)
          if (isSalesOrderCreate) {
            const session = createGuidedSalesOrderSession();
            guidedSalesOrderRef.current = session;
            // If user already said a customer in the create command, apply it first
            if (partyHint) {
              const seeded = await applyGuidedSalesOrderAnswer(session, partyHint);
              if (seeded.filled) {
                window.setTimeout(() => queueVedaFormFill(seeded.filled!), 40);
              }
            }
            const q = currentSoQuestion(session);
            ambientHistoryRef.current = [
              { role: "user", content: "[guided sales order create started]" },
              { role: "assistant", content: q },
            ];
            setConvText(q);
            setConvState("speaking");
            const asked = await guidedAskNext(q, ctrl.signal, t => setConvText(t));
            if (asked.stop) {
              await speak("Okay, stopped.");
              break;
            }
            if (asked.answer) pendingFirst = asked.answer;
            continue;
          }

          setConvText(partyHint ? `Opening ${label} for ${partyHint}` : `Opening ${label}`);
          void speak(partyHint ? `Opening ${label} for ${partyHint}` : `Opening ${label}`);
          await new Promise(r => setTimeout(r, isGuidedCreatePath(quickPath) ? 120 : 450));

          // New form / directory create → start guided field-by-field
          if (quickPath.endsWith("/new") || /vedaNew=1/.test(quickPath)) {
            setConvState("processing");
            let response = "";
            try {
              const known = guidedCreateKickoffHint(quickPath, partyHint);
              await streamChat(
                [
                  ...ambientHistoryRef.current,
                  {
                    role: "user",
                    content: `[The ${label} form is now open at ${quickPath}. ${known}]`,
                  },
                ],
                memory,
                chunk => { response += chunk; setConvText(response.slice(-150)); },
                () => {},
                (path, prefill) => {
                  unlockVedaModules();
                  storeVedaPrefill(prefill);
                  navigate(normalizeNavPath(path));
                  if (isGuidedCreatePath(path)) guidedFormPathRef.current = path;
                },
                ctrl.signal,
                dispatchFill,
                (action) => queueVedaFormAction(action),
                handleDocumentUpdated,
                (dt, id, recipients, docNumber) => { void handleVedaEmail(dt, id, recipients, docNumber); },
                quickPath,
                selectedCompany?.id,
              );
              if (response) {
                ambientHistoryRef.current = [
                  ...ambientHistoryRef.current,
                  { role: "user", content: `[guided create started at ${quickPath}]` },
                  { role: "assistant", content: response },
                ].slice(-16);
                setConvState("speaking");
                setConvText(response.slice(0, 240));
                const speakLimit = isGuidedCreatePath(quickPath) ? 120 : 600;
                const spoken = await speakAndMaybeCapture(response.slice(0, speakLimit), {
                  signal: ctrl.signal,
                  captureAnswer: isGuidedCreatePath(quickPath),
                });
                if (spoken.stop) {
                  await speak("Okay, stopped.");
                  break;
                }
                if (spoken.answer) pendingFirst = spoken.answer;
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

        const uid = "u-" + Date.now();
        const aid = "a-" + (Date.now() + 1);
        setMessages(p => [
          ...p,
          { id: uid, role: "user", content: command, fromVoice: true },
          { id: aid, role: "assistant", content: "", toolCalls: [] },
        ]);

        const agentPath = resolveAgentPath();
        const lastAsst = [...ambientHistoryRef.current].reverse().find(m => m.role === "assistant")?.content || "";
        // Live form fill BEFORE waiting on the LLM (~instant UI) — exact user words only
        dispatchOptimisticGuidedFill(lastAsst, command, agentPath);

        let response = "";
        let didNavigate = false;
        try {
          const userContent = `${command}${guidedAnswerHint(agentPath)}`;
          await streamChat(
            [...ambientHistoryRef.current, { role: "user", content: userContent }],
            memory,
            chunk => {
              response += chunk;
              setConvText(response.slice(-150));
              setMessages(p => p.map(m => m.id === aid ? { ...m, content: response } : m));
            },
            tool => {
              setMessages(p => p.map(m => m.id === aid ? { ...m, toolCalls: [...(m.toolCalls ?? []), tool] } : m));
            },
            (path, prefill) => {
              unlockVedaModules();
              storeVedaPrefill(prefill);
              navigate(normalizeNavPath(path));
              if (isGuidedCreatePath(path)) guidedFormPathRef.current = path;
              didNavigate = true;
            },
            ctrl.signal,
            dispatchFill,
            (action) => queueVedaFormAction(action),
            handleDocumentUpdated,
            (dt, id, recipients, docNumber) => { void handleVedaEmail(dt, id, recipients, docNumber); },
            agentPath,
            selectedCompany?.id,
          );
          if (ctrl.signal.aborted || !convActiveRef.current) break;

          if (response || didNavigate) {
            setMessages(p => p.map(m => m.id === aid ? { ...m, content: response || (didNavigate ? "Done." : ""), complete: true } : m));
            if (response) {
              ambientHistoryRef.current = [
                ...ambientHistoryRef.current,
                { role: "user", content: command },
                { role: "assistant", content: response },
              ].slice(-16);
            }
            lastSpokenWords = (response || "").toLowerCase().split(/\s+/).filter(w => w.length > 3);
            setConvState("speaking");
            const speakLimit = isGuidedCreatePath(agentPath) ? 120 : 600;
            const speakText = response
              ? response.slice(0, speakLimit)
              : didNavigate ? "Done." : "";
            setConvText((response || (didNavigate ? "Done." : "")).slice(0, 240));

            if (speakText) {
              const spoken = await speakAndMaybeCapture(speakText, {
                signal: ctrl.signal,
                captureAnswer: isGuidedCreatePath(agentPath),
              });
              if (ctrl.signal.aborted || !convActiveRef.current) break;

              if (spoken.stop) {
                cancelSpeech();
                killSpeechMic();
                await speak("Okay, stopped.");
                break;
              }
              if (spoken.answer) {
                pendingFirst = spoken.answer;
              } else {
                await new Promise(r => setTimeout(r, isGuidedCreatePath(agentPath) ? 40 : 250));
              }
            }
          } else {
            // Empty agent reply — still acknowledge so user knows mic worked
            const fallback = "I didn't catch a clear answer. Please say that again.";
            setConvState("speaking");
            setConvText(fallback);
            await speak(fallback);
          }
        } catch (e: any) {
          if (e.name === "AbortError" || ctrl.signal.aborted) break;
          const msg = /company/i.test(String(e?.message || ""))
            ? "Please select a company first, then try again."
            : "I ran into an issue. Please try again.";
          setConvText(msg);
          await speak(msg);
          break;
        }
      }
    } finally {
      convActiveRef.current = false;
      ambientAbortRef.current = null;
      guidedFormPathRef.current = null;
      guidedEmployeeRef.current = null;
      guidedSalesOrderRef.current = null;
      cancelSpeech();
      killSpeechMic();
      await new Promise(r => setTimeout(r, 200));
      setConvState("idle");
      setConvText("");
    }
  }, [navigate, memory, resolveAgentPath, dispatchFill, selectedCompany?.id, handleDocumentUpdated, handleVedaEmail]);

  const activateVedaImmediately = useCallback((followOn?: string) => {
    // Instant sensory audio feedback (<1ms) so the user immediately knows the wake command was heard
    playWakeChime();
    // Open the panel so the voice assistant visibly wakes up
    setOpen(true);
    _userHasInteracted = true;
    if (convActiveRef.current) {
      // Interrupt current turn (including TTS) and restart
      convActiveRef.current = false;
      ambientAbortRef.current?.abort();
      cancelSpeech();
      killSpeechMic();
      setTimeout(() => runAmbientConversation("Ready!", followOn), 60);
      return;
    }
    runAmbientConversation("Ready!", followOn);
  }, [runAmbientConversation]);

  const handleWakeWord = activateVedaImmediately;

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
  // Wake with panel open too — users often open chat then say "Veda"
  const wakeEnabled = handsFree && !panelListening && convState === "idle";

  const { supported: wakeSupported } = useWakeWord(
    activateVedaImmediately,
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
        activateVedaImmediately();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [convState, open, activateVedaImmediately, stopConversation]);

  // Auto-clear mic error after 3 seconds
  useEffect(() => {
    if (!micError) return;
    const t = setTimeout(() => setMicError(false), 3000);
    return () => clearTimeout(t);
  }, [micError]);

  // Hardware microphone warmup & Automatic Gain Control (AGC) keeper
  // Keeping an active audio stream with autoGainControl boosts quiet/slow speech so users don't need to shout
  const warmMicStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    let active = true;
    const startWarmMic = async () => {
      if (!handsFree || warmMicStreamRef.current) return;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            autoGainControl: true,
            noiseSuppression: false,
            echoCancellation: true,
          },
        });
        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        warmMicStreamRef.current = stream;
        setWakeError(null);
      } catch {
        // SpeechRecognition will manage permissions if getUserMedia fails
      }
    };

    if (handsFree) {
      void startWarmMic();
    } else {
      if (warmMicStreamRef.current) {
        warmMicStreamRef.current.getTracks().forEach((t) => t.stop());
        warmMicStreamRef.current = null;
      }
    }

    const unlockOnGesture = () => {
      if (handsFree && !warmMicStreamRef.current) {
        void startWarmMic();
      }
    };
    window.addEventListener("pointerdown", unlockOnGesture, { capture: true });
    window.addEventListener("keydown", unlockOnGesture, { capture: true });

    return () => {
      active = false;
      window.removeEventListener("pointerdown", unlockOnGesture, true);
      window.removeEventListener("keydown", unlockOnGesture, true);
      if (warmMicStreamRef.current) {
        warmMicStreamRef.current.getTracks().forEach((t) => t.stop());
        warmMicStreamRef.current = null;
      }
    };
  }, [handsFree]);

  const history = messages.filter(m => m.content).map(m => ({ role: m.role, content: m.content }));

  const handleNavigate = useCallback((path: string, prefill: any, reason: string) => {
    unlockVedaModules();
    storeVedaPrefill(prefill);
    const normalized = normalizeNavPath(path);
    if (isGuidedCreatePath(normalized)) guidedFormPathRef.current = normalized;
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
    text = normalizeVoiceTranscript(text);

    const explicitAction = matchExplicitFormAction(text);
    if (explicitAction) {
      const uid = Date.now().toString();
      const aid = `asst-${uid}`;
      if (explicitAction === "close") {
        guidedEmployeeRef.current = null;
        guidedSalesOrderRef.current = null;
        guidedFormPathRef.current = null;
        const res = closeActiveFormsAndModals(navigate, resolveAgentPath());
        setMessages(p => [...p,
          { id: uid, role: "user", content: text.trim(), fromVoice },
          { id: aid, role: "assistant", content: res.message, complete: true },
        ]);
        setInput("");
        if (fromVoice) void speak(res.message);
        return;
      }
      queueVedaFormAction(explicitAction);
      const actionMsg = explicitAction === "save" ? "Saving form now." : explicitAction === "preview" ? "Opening preview." : "Downloading PDF.";
      setMessages(p => [...p,
        { id: uid, role: "user", content: text.trim(), fromVoice },
        { id: aid, role: "assistant", content: actionMsg, complete: true, toolCalls: [explicitAction === "save" ? "submitCurrentForm" : explicitAction === "preview" ? "previewCurrentDocument" : "downloadCurrentDocument"] },
      ]);
      setInput("");
      if (fromVoice) void speak(actionMsg);
      return;
    }

    // Guided kickoff from quick-nav — skip another navigate short-circuit
    const isGuidedKickoff = /\[The .+ form is now open at /.test(text);
    const quick = isGuidedKickoff ? null : matchQuickNavigate(text.trim());
    if (quick) {
      unlockVedaModules();
      const quickPath = quick.path;
      const label = PATH_LABELS[quickPath] || quickPath;
      const rawParty = quick.spokenParty || quick.prefill?.customerName || quick.prefill?.vendorName || quick.prefill?.name;
      const partyHint = rawParty && !looksLikeCreateOrNavPhrase(rawParty) ? rawParty : undefined;
      const uid = Date.now().toString();
      const aid = `asst-${uid}`;
      const msg = partyHint ? `Opening ${label} for ${partyHint}.` : `Opening ${label}.`;
      setMessages(p => [...p,
        { id: uid, role: "user", content: text.trim(), fromVoice },
        { id: aid, role: "assistant", content: msg, complete: true, navigated: { path: quickPath, label }, toolCalls: ["navigateTo"] },
      ]);
      setInput("");
      if (quick.prefill) storeVedaPrefill(quick.prefill);
      navigate(normalizeNavPath(quickPath));
      if (isGuidedCreatePath(quickPath)) guidedFormPathRef.current = quickPath;
      if (quick.prefill) {
        window.setTimeout(() => {
          dispatchFill(quick.prefill);
        }, 200);
      }
      if (fromVoice) void speak(msg);

      // Continue into agent guided create (same turn) without re-matching quick-nav
      if (quickPath.endsWith("/new") || /vedaNew=1/.test(quickPath)) {
        const isEmployee = /\/employees\//.test(quickPath);
        const isSalesOrder = /\/sales-orders\//.test(quickPath);
        // Employee: local guided — ask first field instantly (voice ambient owns live fills)
        if (isEmployee) {
          const session = createGuidedEmployeeSession();
          guidedEmployeeRef.current = session;
          const q = currentEmployeeQuestion(session);
          const gid = `asst-guide-${uid}`;
          setMessages(p => [...p, { id: gid, role: "assistant", content: q, complete: true, toolCalls: [] }]);
          if (fromVoice) void speak(q);
          return;
        }
        if (isSalesOrder) {
          const session = createGuidedSalesOrderSession();
          guidedSalesOrderRef.current = session;
          if (partyHint) {
            void applyGuidedSalesOrderAnswer(session, partyHint).then((seeded) => {
              if (seeded.filled) window.setTimeout(() => queueVedaFormFill(seeded.filled!), 40);
              const q = currentSoQuestion(session);
              const gid = `asst-guide-${uid}`;
              setMessages(p => [...p, { id: gid, role: "assistant", content: q, complete: true, toolCalls: seeded.filled ? ["fillCurrentForm"] : [] }]);
              if (fromVoice) void speak(q);
            });
            return;
          }
          const q = currentSoQuestion(session);
          const gid = `asst-guide-${uid}`;
          setMessages(p => [...p, { id: gid, role: "assistant", content: q, complete: true, toolCalls: [] }]);
          if (fromVoice) void speak(q);
          return;
        }
        const known = guidedCreateKickoffHint(quickPath, partyHint);
        // Do not send the open/create utterance as fillable content — only the kickoff brief
        const kickoff = `[The ${label} form is now open at ${quickPath}. ${known}]`;
        const gid = `asst-guide-${uid}`;
        setMessages(p => [...p, { id: gid, role: "assistant", content: "", toolCalls: [] }]);
        setThinking(true);
        abortRef.current = new AbortController();
        let full = "";
        try {
          await streamChat(
            [...history, { role: "user", content: text.trim() }, { role: "user", content: kickoff }],
            memory,
            chunk => { full += chunk; setMessages(p => p.map(m => m.id === gid ? { ...m, content: full } : m)); },
            tool => setMessages(p => p.map(m => m.id === gid ? { ...m, toolCalls: [...(m.toolCalls ?? []), tool] } : m)),
            (path, prefill, reason) => handleNavigate(path, prefill, reason),
            abortRef.current.signal,
            dispatchFill,
            (action) => queueVedaFormAction(action),
            handleDocumentUpdated,
            (dt, id, recipients, docNumber) => { void handleVedaEmail(dt, id, recipients, docNumber); },
            quickPath,
            selectedCompany?.id,
          );
          setMessages(p => p.map(m => m.id === gid ? { ...m, complete: true } : m));
          if (fromVoice && full) await speak(full.slice(0, isGuidedCreatePath(quickPath) ? 120 : 600));
        } catch (e: any) {
          if (e.name !== "AbortError") setMessages(p => p.map(m => m.id === gid ? { ...m, complete: true, content: "Something went wrong — please try again." } : m));
        } finally {
          setThinking(false);
          abortRef.current = null;
        }
      }
      return;
    }
    const uid = Date.now().toString();
    const aid = `asst-${uid}`;
    const agentPath = resolveAgentPath();

    const docViewEdit = matchDocViewEditAction(text, agentPath);
    if (docViewEdit) {
      unlockVedaModules();
      navigate(docViewEdit.path);
      const navMsg = `Opened ${docViewEdit.label}.`;
      setMessages(p => [...p,
        { id: uid, role: "user", content: text.trim(), fromVoice },
        { id: aid, role: "assistant", content: navMsg, complete: true, toolCalls: ["navigateTo"], navigated: { path: docViewEdit.path, label: docViewEdit.label } },
      ]);
      setInput("");
      if (fromVoice) void speak(navMsg);
      return;
    }

    const lastAsst = [...messages].reverse().find(m => m.role === "assistant" && m.content)?.content || "";
    // Guided: never send wake/filler into fields — use exact cleaned user words only
    let answerText = text.trim();
    if (isGuidedCreatePath(agentPath) || guidedEmployeeRef.current || guidedSalesOrderRef.current) {
      const cleaned = sanitizeGuidedAnswer(answerText);
      if (!cleaned) return;
      answerText = cleaned;
    }

    // Local employee guided session — instant fill, no LLM
    if (guidedEmployeeRef.current && /\/employees/.test(agentPath)) {
      const session = guidedEmployeeRef.current;
      const result = applyGuidedEmployeeAnswer(session, answerText);
      if (result.filled) {
        window.setTimeout(() => queueVedaFormFill(result.filled!), 40);
      }
      setMessages(p => [...p,
        { id: uid, role: "user", content: answerText, fromVoice },
        { id: aid, role: "assistant", content: result.nextAsk, complete: true, toolCalls: result.filled ? ["fillCurrentForm"] : [] },
      ]);
      setInput("");
      if (result.done) {
        queueVedaFormAction("save");
        guidedEmployeeRef.current = null;
      }
      if (fromVoice) void speak(result.nextAsk);
      return;
    }

    // Local sales-order guided session — continuous ask + live fill, then preview
    if (guidedSalesOrderRef.current && /\/sales-orders/.test(agentPath)) {
      const session = guidedSalesOrderRef.current;
      setInput("");
      const result = await applyGuidedSalesOrderAnswer(session, answerText);
      if (result.filled) {
        window.setTimeout(() => queueVedaFormFill(result.filled!), 40);
      }
      setMessages(p => [...p,
        { id: uid, role: "user", content: answerText, fromVoice },
        { id: aid, role: "assistant", content: result.nextAsk, complete: true, toolCalls: result.filled ? ["fillCurrentForm"] : [] },
      ]);
      if (result.done) {
        queueVedaFormAction("preview");
        guidedSalesOrderRef.current = null;
      }
      if (fromVoice) void speak(result.nextAsk);
      return;
    }

    dispatchOptimisticGuidedFill(lastAsst, answerText, agentPath);
    setMessages(p => [...p,
      { id: uid, role: "user", content: answerText, fromVoice },
      { id: aid, role: "assistant", content: "", toolCalls: [] },
    ]);
    setInput(""); setThinking(true);
    abortRef.current = new AbortController();
    let full = "";
    try {
      const userContent = `${answerText}${guidedAnswerHint(agentPath)}`;
      await streamChat(
        [...history, { role: "user", content: userContent }],
        memory,
        chunk => { full += chunk; setMessages(p => p.map(m => m.id === aid ? { ...m, content: full } : m)); },
        tool => setMessages(p => p.map(m => m.id === aid ? { ...m, toolCalls: [...(m.toolCalls ?? []), tool] } : m)),
        (path, prefill, reason) => {
          if (isGuidedCreatePath(path)) guidedFormPathRef.current = path;
          handleNavigate(path, prefill, reason);
        },
        abortRef.current.signal,
        dispatchFill,
        (action) => queueVedaFormAction(action),
        handleDocumentUpdated,
        (dt, id, recipients, docNumber) => { void handleVedaEmail(dt, id, recipients, docNumber); },
        agentPath,
        selectedCompany?.id,
      );
      const inv = full.match(/\b(INV-\d+)\b/);
      const qt = full.match(/\b(QT-\d+)\b/);
      if (inv) { setMessages(p => p.map(m => m.id === aid ? { ...m, complete: true, docRef: { number: inv[1], path: "/invoices" } } : m)); appendMemory(`Created invoice ${inv[1]}`); }
      else if (qt) { setMessages(p => p.map(m => m.id === aid ? { ...m, complete: true, docRef: { number: qt[1], path: "/quotations" } } : m)); appendMemory(`Created quotation ${qt[1]}`); }
      else { setMessages(p => p.map(m => m.id === aid ? { ...m, complete: true } : m)); }
      if (fromVoice && full) await speak(full.slice(0, isGuidedCreatePath(agentPath) ? 120 : 600));
    } catch (e: any) {
      if (e.name !== "AbortError") setMessages(p => p.map(m => m.id === aid ? { ...m, complete: true, content: "Something went wrong — please try again." } : m));
    } finally { setThinking(false); abortRef.current = null; }
  }, [thinking, history, memory, handleNavigate, resolveAgentPath, dispatchFill, messages, selectedCompany?.id, handleDocumentUpdated, handleVedaEmail, navigate]);

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

  const panelInner = (
    <div className="flex flex-col h-full w-full overflow-hidden bg-card text-card-foreground">
      {/* Header — Clean Gemini-style */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-blue-600 via-indigo-500 to-sky-400 text-white flex items-center justify-center shadow-xs">
            <Sparkles className="h-3.5 w-3.5" />
          </div>
          <span className="text-sm font-semibold tracking-tight text-foreground">Veda</span>
        </div>
        <div className="flex items-center gap-1">
          {wakeSupported && (
            <button
              onClick={toggleHandsFree}
              title={
                wakeError
                  ? "Mic blocked by browser"
                  : handsFree
                  ? "Hands-free voice ON (say 'Veda')"
                  : "Turn on hands-free voice"
              }
              className={cn(
                "relative w-7 h-7 flex items-center justify-center rounded-lg transition-colors",
                wakeError
                  ? "text-yellow-600 hover:bg-yellow-500/10"
                  : handsFree
                  ? "text-primary hover:bg-primary/10"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              <Radio className="h-3.5 w-3.5" />
              {handsFree && (
                <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-primary" />
              )}
            </button>
          )}
          {hasMessages && (
            <button
              onClick={clear}
              title="New chat"
              className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <Plus className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={toggleDocked}
            title={isDocked ? "Float panel" : "Dock to side"}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            {isDocked ? (
              <PanelRightClose className="h-3.5 w-3.5" />
            ) : (
              <Columns className="h-3.5 w-3.5" />
            )}
          </button>
          <button
            onClick={close}
            title="Close"
            className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Active Voice Bar inside open panel */}
      {convState !== "idle" && (
        <div className="flex items-center justify-between px-3.5 py-2 bg-primary/10 border-b border-primary/20 text-xs text-primary animate-in fade-in duration-200 shrink-0">
          <div className="flex items-center gap-2 overflow-hidden min-w-0">
            {convState === "greeting" && (
              <>
                <Sparkles className="h-3.5 w-3.5 animate-pulse text-primary shrink-0" />
                <span className="font-semibold shrink-0">Ready:</span>
                <span className="truncate">{convText || "Ready!"}</span>
              </>
            )}
            {convState === "listening" && (
              <>
                <Mic className="h-3.5 w-3.5 animate-pulse text-red-500 shrink-0" />
                <span className="font-semibold text-red-500 shrink-0">Listening…</span>
                <span className="truncate text-foreground/80">{convText ? `"${convText}"` : "speak now"}</span>
              </>
            )}
            {convState === "processing" && (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary shrink-0" />
                <span className="font-semibold shrink-0">Processing…</span>
                <span className="truncate text-muted-foreground">{convText}</span>
              </>
            )}
            {convState === "speaking" && (
              <>
                <Volume2 className="h-3.5 w-3.5 animate-bounce text-primary shrink-0" />
                <span className="font-semibold shrink-0">Speaking…</span>
                <span className="truncate text-muted-foreground">{convText}</span>
              </>
            )}
          </div>
          <button
            onClick={stopConversation}
            className="px-2 py-0.5 rounded bg-background/80 hover:bg-background border border-border text-[11px] text-muted-foreground hover:text-foreground shrink-0 ml-2"
          >
            Stop (Esc)
          </button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto min-h-0 px-4 py-4">
        {!hasMessages ? (
          /* ── Gemini Welcome ── */
          <div className="flex flex-col items-center justify-center min-h-[320px] py-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 via-indigo-500 to-sky-400 text-white flex items-center justify-center shadow-lg shadow-primary/20 mb-3.5">
              <Sparkles className="h-6 w-6" />
            </div>

            <h2 className="text-xl font-semibold tracking-tight text-foreground text-center">
              Where should we start?
            </h2>
            <p className="text-xs text-muted-foreground mt-1 text-center max-w-[260px]">
              Ask questions, run reports, or navigate BizOne
            </p>

            {voiceError && (
              <p className="mt-2 text-xs text-red-600 text-center max-w-sm px-2">{voiceError}</p>
            )}

            {/* Prompt Starters */}
            <div className="w-full flex flex-col gap-2 mt-5">
              {SUGGESTIONS.map(s => (
                <button
                  key={s.label}
                  onClick={() => send(s.label)}
                  className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl border border-border/70 bg-card hover:bg-muted/60 text-left text-xs text-foreground/85 hover:text-foreground transition-all hover:border-primary/40 hover:shadow-xs group cursor-pointer"
                >
                  <span className="text-base group-hover:scale-110 transition-transform shrink-0">{s.icon}</span>
                  <span className="font-medium flex-1 truncate">{s.label}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* ── Chat thread ── */
          <div className="space-y-4">
            {messages.map(msg => (
              <div key={msg.id} className={cn(
                "flex gap-2.5",
                msg.role === "user" ? "justify-end" : "justify-start",
              )}>
                {msg.role === "assistant" && (
                  <div className="shrink-0 w-6 h-6 rounded-lg bg-gradient-to-tr from-blue-600 via-indigo-500 to-sky-400 text-white flex items-center justify-center mt-0.5 shadow-xs">
                    <Sparkles className="h-3 w-3" />
                  </div>
                )}

                <div className={cn(
                  "flex flex-col gap-1.5",
                  msg.role === "user" ? "items-end max-w-[80%]" : "items-start max-w-[85%]",
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
                        : "text-foreground bg-muted/30 px-3.5 py-2.5 rounded-2xl rounded-tl-sm border border-border/40",
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

      {/* ── Bottom Input Capsule (Gemini Style — Always Present) ── */}
      <div className="shrink-0 border-t border-border/70 px-3.5 pt-3 pb-3 bg-card">
        <div className={cn(
          "flex flex-col bg-muted/40 border border-border/80 rounded-2xl p-2.5 transition-all shadow-xs",
          "focus-within:ring-2 focus-within:ring-primary/25 focus-within:border-primary/40 focus-within:bg-background",
          panelListening && "ring-2 ring-red-400/50 border-red-400 bg-red-500/5"
        )}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={onKey}
            placeholder={panelListening ? "Listening… speak then pause" : "Ask Veda anything…"}
            rows={1}
            disabled={thinking || panelListening || transcribing}
            className="w-full resize-none bg-transparent text-sm focus:outline-none disabled:opacity-50 min-h-[32px] max-h-[120px] overflow-y-auto px-1 py-0.5 placeholder:text-muted-foreground/60 leading-relaxed"
            onInput={e => {
              const el = e.currentTarget;
              el.style.height = "auto";
              el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
            }}
          />

          <div className="flex items-center justify-between mt-1 pt-1.5 border-t border-border/30">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {panelListening ? (
                <span className="flex items-center gap-1.5 text-red-600 dark:text-red-400 font-medium">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                  Listening…
                </span>
              ) : thinking ? (
                <span className="flex items-center gap-1.5 text-primary">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Thinking…
                </span>
              ) : (
                <span className="text-[11px] text-muted-foreground/70">
                  {handsFree ? 'Say "Veda" or type' : 'Press Enter to send'}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1">
              {thinking && (
                <button
                  onClick={() => abortRef.current?.abort()}
                  className="w-7 h-7 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  title="Stop generating"
                >
                  <Square className="h-3 w-3" />
                </button>
              )}
              <div className="relative">
                <button
                  onClick={mic}
                  disabled={transcribing || thinking}
                  title={micError ? "Mic access denied" : panelListening ? "Cancel listening" : "Voice input (ends on pause)"}
                  className={cn(
                    "w-7 h-7 rounded-full flex items-center justify-center transition-all",
                    micError
                      ? "bg-red-100 text-red-500 dark:bg-red-950/40"
                      : panelListening
                      ? "bg-red-500 text-white animate-pulse"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted",
                  )}
                >
                  <Mic className="h-3.5 w-3.5" />
                </button>
                {micError && (
                  <div className="absolute bottom-full right-0 mb-1.5 whitespace-nowrap text-[11px] bg-red-600 text-white px-2 py-0.5 rounded pointer-events-none">
                    Mic denied
                  </div>
                )}
              </div>
              <button
                onClick={submit}
                disabled={!input.trim() || thinking || panelListening}
                className={cn(
                  "w-7 h-7 rounded-full flex items-center justify-center transition-all",
                  input.trim() && !thinking && !panelListening
                    ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-xs cursor-pointer"
                    : "bg-muted text-muted-foreground opacity-40 cursor-not-allowed"
                )}
                title="Send"
              >
                <Send className="h-3 w-3" />
              </button>
            </div>
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground/60 text-center mt-1.5">
          Veda can make mistakes. Verify important financial info.
        </p>
      </div>
    </div>
  );

  return (
    <>
      {/* ── Active Voice Floating Pill when panel is closed ── */}
      {!open && convState !== "idle" && (
        <div className="fixed bottom-20 right-6 z-50 flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-background border border-primary/40 shadow-2xl animate-in slide-in-from-bottom-2 duration-200">
          <div className="flex items-center justify-center w-7 h-7 rounded-full bg-primary text-primary-foreground shrink-0">
            {convState === "listening" ? (
              <Mic className="h-4 w-4 animate-pulse text-white" />
            ) : convState === "processing" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 animate-pulse" />
            )}
          </div>
          <div className="flex flex-col text-xs max-w-[260px]">
            <span className="font-semibold text-primary">
              {convState === "greeting" ? "Veda awake" : convState === "listening" ? "Listening…" : convState === "speaking" ? "Speaking…" : "Processing…"}
            </span>
            <span className="truncate text-foreground/80">{convText || "Speak your command"}</span>
          </div>
          <button
            onClick={stopConversation}
            className="ml-1 p-1 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted"
            title="Stop listening (Esc)"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* ── Trigger button down right side when closed ── */}
      {!open && (
        <div className="fixed bottom-6 right-6 z-40 flex items-center gap-2">
          <button
            onClick={() => setOpen(true)}
            title="Ask Veda AI Assistant (Alt+M)"
            className="group relative flex items-center gap-2.5 px-4 py-2.5 bg-gradient-to-r from-blue-600 via-primary to-indigo-600 text-white rounded-full shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all duration-200 border border-white/20 select-none cursor-pointer"
          >
            {handsFree && (
              <span className="absolute inset-0 rounded-full animate-ping bg-primary opacity-25 pointer-events-none" />
            )}
            <Sparkles className="h-4 w-4 text-amber-300 group-hover:rotate-12 transition-transform" />
            <span className="text-sm font-semibold tracking-wide">Ask Veda</span>
          </button>
        </div>
      )}

      {/* ── Veda Panel: Docked (Gemini side panel) or Floating ── */}
      {open && (
        isDocked ? (
          <>
            {/* Desktop: Docked right sidebar (decreased width so dashboard numbers never cramp) */}
            <aside
              aria-label="Veda AI Assistant Panel"
              className="hidden lg:flex flex-col w-[320px] sm:w-[350px] xl:w-[370px] h-screen sticky top-0 shrink-0 border-l border-border bg-card z-30 shadow-sm transition-all duration-300"
            >
              {panelInner}
            </aside>

            {/* Mobile / Tablet: Slide-over drawer */}
            <div
              className="lg:hidden fixed inset-0 bg-black/40 z-40 backdrop-blur-sm animate-in fade-in duration-200"
              onClick={close}
            />
            <div className="lg:hidden fixed inset-y-0 right-0 w-full sm:w-[360px] z-50 flex flex-col bg-card border-l border-border shadow-2xl animate-in slide-in-from-right duration-300">
              {panelInner}
            </div>
          </>
        ) : (
          /* Floating window mode (user preference toggle) */
          <div className="fixed top-14 right-6 z-50 pointer-events-none flex flex-col items-end">
            <div className="pointer-events-auto flex flex-col w-[350px] sm:w-[380px] h-[580px] max-h-[85vh] bg-card border border-border rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
              {panelInner}
            </div>
          </div>
        )
      )}
    </>
  );
}
