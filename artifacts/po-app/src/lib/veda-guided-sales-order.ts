import { queueVedaFormFill } from "@/hooks/useVedaFormFill";
import { sanitizeGuidedAnswer } from "@/lib/veda-optimistic-fill";

export type GuidedSoField = {
  key: string;
  ask: string;
  optional?: boolean;
  transform?: (answer: string) => unknown;
  /** Skip when already filled (e.g. from customer directory match). */
  when?: (filled: Record<string, unknown>) => boolean;
};

function parseLooseDate(answer: string): string | null {
  const t = answer.trim();
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const d = new Date(t);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  const m = t.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    let year = Number(m[3]);
    if (year < 100) year += 2000;
    const iso = new Date(Date.UTC(year, month - 1, day));
    if (!Number.isNaN(iso.getTime())) return iso.toISOString().slice(0, 10);
  }
  return null;
}

function mapCurrency(a: string): string {
  const t = a.trim().toUpperCase().replace(/[^A-Z]/g, "");
  if (/\bSGD\b|SINGAPORE|S\$/.test(a.toUpperCase()) || t === "SGD") return "SGD";
  if (/\bUSD\b|DOLLAR|US\$/.test(a.toUpperCase()) || t === "USD") return "USD";
  if (/\bEUR\b|EURO/.test(a.toUpperCase()) || t === "EUR") return "EUR";
  if (/\bGBP\b|POUND/.test(a.toUpperCase()) || t === "GBP") return "GBP";
  if (/\bMYR\b|RINGGIT/.test(a.toUpperCase()) || t === "MYR") return "MYR";
  if (/\bINR\b|RUPEE/.test(a.toUpperCase()) || t === "INR") return "INR";
  if (/^[A-Z]{3}$/.test(t)) return t;
  return a.trim().toUpperCase().slice(0, 3) || "SGD";
}

function asHtmlDescription(a: string): string {
  const t = a.trim();
  if (!t) return "";
  if (/^<p[\s>]/i.test(t)) return t;
  return `<p>${t}</p>`;
}

/** Continuous SO create field order — short prompts, live fill. */
export const SO_GUIDED_FIELDS: GuidedSoField[] = [
  { key: "customerName", ask: "Customer name?" },
  {
    key: "customerAddress",
    ask: "Address?",
    optional: true,
    when: (f) => !String(f.customerAddress || "").trim(),
  },
  {
    key: "customerContact",
    ask: "Contact person?",
    optional: true,
    when: (f) => !String(f.customerContact || "").trim(),
  },
  {
    key: "customerContactEmail",
    ask: "Contact email?",
    optional: true,
    when: (f) => !String(f.customerContactEmail || "").trim(),
  },
  {
    key: "currency",
    ask: "Currency?",
    transform: mapCurrency,
  },
  { key: "paymentTerms", ask: "Payment terms?" },
  {
    key: "deliveryDate",
    ask: "Delivery date?",
    optional: true,
    transform: (a) => parseLooseDate(a) ?? a,
  },
  {
    key: "items.0.description",
    ask: "Item description?",
    transform: asHtmlDescription,
  },
  {
    key: "items.0.qty",
    ask: "Quantity?",
    transform: (a) => {
      const n = parseFloat(a.replace(/[^\d.]/g, ""));
      return Number.isFinite(n) && n > 0 ? n : 1;
    },
  },
  {
    key: "items.0.unitPrice",
    ask: "Unit price?",
    transform: (a) => {
      const n = parseFloat(a.replace(/[^\d.]/g, ""));
      return Number.isFinite(n) ? n : 0;
    },
  },
  { key: "notes", ask: "Notes?", optional: true },
];

export type GuidedSalesOrderSession = {
  index: number;
  filled: Record<string, unknown>;
  awaitingSave: boolean;
};

type ContactHit = {
  name: string;
  address?: string | null;
  contact?: string | null;
  email?: string | null;
  deliveryAddress?: string | null;
};

function scoreNameMatch(spoken: string, candidate: string): number {
  const a = spoken.toLowerCase().trim();
  const b = candidate.toLowerCase().trim();
  if (!a || !b) return 0;
  if (a === b) return 100;
  if (b.includes(a) || a.includes(b)) return 80;
  const at = a.split(/\s+/).filter(Boolean);
  const bt = new Set(b.split(/\s+/).filter(Boolean));
  const overlap = at.filter((t) => bt.has(t)).length;
  return overlap * 20;
}

async function resolveCustomer(spoken: string): Promise<ContactHit | null> {
  try {
    const res = await fetch("/api/contacts?type=customer", { credentials: "include" });
    if (!res.ok) return null;
    const list = (await res.json()) as ContactHit[];
    if (!Array.isArray(list) || list.length === 0) return null;
    let best: ContactHit | null = null;
    let bestScore = 0;
    for (const c of list) {
      const s = scoreNameMatch(spoken, c.name || "");
      if (s > bestScore) {
        bestScore = s;
        best = c;
      }
    }
    return bestScore >= 40 ? best : null;
  } catch {
    return null;
  }
}

export function createGuidedSalesOrderSession(): GuidedSalesOrderSession {
  const today = new Date().toISOString().slice(0, 10);
  const defaults: Record<string, unknown> = {
    issueDate: today,
    currency: "SGD",
    paymentTerms: "30 Days Net",
    tax: 9,
  };
  queueVedaFormFill(defaults);
  return { index: 0, filled: { ...defaults }, awaitingSave: false };
}

export function currentSoField(session: GuidedSalesOrderSession): GuidedSoField | null {
  if (session.awaitingSave) return null;
  while (session.index < SO_GUIDED_FIELDS.length) {
    const field = SO_GUIDED_FIELDS[session.index];
    if (field.when && !field.when(session.filled)) {
      session.index += 1;
      continue;
    }
    return field;
  }
  return null;
}

export function currentSoQuestion(session: GuidedSalesOrderSession): string {
  if (session.awaitingSave) return "Shall I save and preview?";
  return currentSoField(session)?.ask || "Shall I save and preview?";
}

function isSkipAnswer(answer: string): boolean {
  return /^(skip|none|no|later|n\/a|na|pass|same)[.!]?$/i.test(answer.trim());
}

/**
 * Apply spoken answer to current SO field instantly (live form fill).
 * Customer name resolves against directory dropdown and fills related party fields.
 */
export async function applyGuidedSalesOrderAnswer(
  session: GuidedSalesOrderSession,
  rawAnswer: string,
): Promise<{ ok: boolean; nextAsk: string; filled?: Record<string, unknown>; done?: boolean }> {
  const answer = sanitizeGuidedAnswer(rawAnswer);
  if (!answer) return { ok: false, nextAsk: currentSoQuestion(session) };

  if (session.awaitingSave) {
    if (/^(yes|yeah|yep|yup|ok|okay|sure|save|preview|submit)[.!]?$/i.test(answer)) {
      return { ok: true, nextAsk: "Saving and preview.", done: true };
    }
    if (/^(no|nope|not yet|wait|cancel)[.!]?$/i.test(answer)) {
      session.awaitingSave = false;
      return { ok: true, nextAsk: "Okay. Say save when ready." };
    }
    return { ok: false, nextAsk: "Shall I save and preview?" };
  }

  const field = currentSoField(session);
  if (!field) {
    session.awaitingSave = true;
    return { ok: true, nextAsk: "Shall I save and preview?" };
  }

  if (field.optional && isSkipAnswer(answer)) {
    session.index += 1;
    const next = currentSoField(session);
    if (!next) {
      session.awaitingSave = true;
      return { ok: true, nextAsk: "Shall I save and preview?" };
    }
    return { ok: true, nextAsk: next.ask };
  }

  let value: unknown = field.transform ? field.transform(answer) : answer;
  if (value == null || value === "") {
    return { ok: false, nextAsk: field.ask };
  }

  const patch: Record<string, unknown> = { [field.key]: value };

  // Customer: pick best directory match so dropdown value + address/contact show live
  if (field.key === "customerName") {
    const hit = await resolveCustomer(String(value));
    if (hit) {
      patch.customerName = hit.name;
      if (hit.address) patch.customerAddress = hit.address;
      if (hit.contact) patch.customerContact = hit.contact;
      if (hit.email) patch.customerContactEmail = hit.email;
      if (hit.deliveryAddress) patch.deliveryAddress = hit.deliveryAddress;
      window.dispatchEvent(
        new CustomEvent("veda:select-contact", {
          detail: { type: "customer", contact: hit },
        }),
      );
    }
  }

  queueVedaFormFill(patch);
  Object.assign(session.filled, patch);
  session.index += 1;

  const next = currentSoField(session);
  if (!next) {
    session.awaitingSave = true;
    return { ok: true, nextAsk: "Shall I save and preview?", filled: patch };
  }
  return { ok: true, nextAsk: next.ask, filled: patch };
}
