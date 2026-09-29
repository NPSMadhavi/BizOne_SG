import { parseSingaporePhoneDigits } from "@/lib/singapore-phone";
import { queueVedaFormFill } from "@/hooks/useVedaFormFill";
import { normalizeCurrency } from "@/lib/currencies";

/** Paths where Veda walks the create form field-by-field. */
export function isGuidedCreatePath(path: string | undefined | null): boolean {
  if (!path) return false;
  return path.includes("/new") || /vedaNew=1/.test(path) || /\/employees\/\d+\/edit/.test(path) || /\/stock\/\d+\/edit/.test(path) || /\/assets\/\d+\/edit/.test(path);
}

// Actual wake detection
export const WAKE_WORD = "veda";

// Transcript cleanup after wake detection (includes soft, slow, accented speech variants)
export const WAKE_TOKEN_RE =
  /\b(wake\s*up(?:\s*veda)?|wake\s*veda|wake\s*up\s*agent|wake\s*agent|wake\s*up|wake|veda|veeda|vida|vita|veta|veja|beda|vetta|weda|weeder|veeder|vader|feder|fader|vedaah|vedaa|vedas|vedha|veyda|veida|beeda|bheda|vada|vaada|vadaa|wada|waada|weather|whether|wait\s*a|waiter|way\s*that|way\s*the|way\s*da|wayda|where\s*the|wear\s*the|veena|veera|video|beta|vee\s*da|ve\s*da|v\s*da|veda\s*ji|hey\s*veda|hi\s*veda|hello\s*veda|ok\s*veda|okay\s*veda|yo\s*veda|oye\s*veda|agent|the\s*agent|hey\s*agent|hi\s*agent|hello\s*agent|call\s*agent|call\s*the\s*agent|bizone|biz\s*one|hey\s*bizone|assistant|hey\s*assistant)\b/gi;
export const LEAD_FILLER_RE = /^(hey|hi|ok|okay|please|um|uh|ah|oh|hmm|so|say|call|yo|oye|hello|and|then)\s+/i;
export const ONLY_FILLER_RE =
  /^(um|uh|ah|oh|hmm|ha|la|na|aa|ee|the|a|an|so|yes|yeah|yep|ok|okay|please|hey|hi|veda|veeda|vida|vita|veta|vada|wada|weather|whether|wait|agent)+[.!?]?$/i;

/** Fast check if wake word is present in a spoken phrase (including soft / slow / accented voice). */
export function isWakeWordDetected(raw: string): boolean {
  const t = String(raw || "").toLowerCase().replace(/[^\w\s']/g, " ").replace(/\s+/g, " ").trim();
  if (!t) return false;
  WAKE_TOKEN_RE.lastIndex = 0;
  return WAKE_TOKEN_RE.test(t);
}

/**
 * Strip wake-word / filler from a spoken field answer.
 * Returns "" when nothing usable remains (e.g. bare "Veda" / "so").
 */
export function sanitizeGuidedAnswer(raw: string): string {
  let t = String(raw || "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  // Remove every wake-token occurrence ("veda veda EMP01" → "EMP01")
  t = t.replace(WAKE_TOKEN_RE, " ").replace(/\s+/g, " ").trim();
  // Drop leading fillers repeatedly ("so um Madhavi" → "Madhavi")
  for (let i = 0; i < 4; i++) {
    const next = t.replace(LEAD_FILLER_RE, "").trim();
    if (next === t) break;
    t = next;
  }
  t = t.replace(/[.,!?]+$/g, "").replace(/\s+/g, " ").trim();
  if (!t || ONLY_FILLER_RE.test(t)) return "";
  return t;
}

type FieldGuess = { key: string; transform?: (answer: string) => unknown };

const ASK_PATTERNS: Array<{ re: RegExp; field: FieldGuess }> = [
  { re: /asset\s*tag|tag\s*number/i, field: { key: "tag" } },
  { re: /asset\s*name|asset\s*type/i, field: { key: "type" } },
  { re: /asset\s*category/i, field: { key: "category" } },
  { re: /serial\s*number|serial\s*no/i, field: { key: "serial" } },
  { re: /model\s*(?:number|name)?/i, field: { key: "model" } },
  { re: /manufacturer|brand/i, field: { key: "manufacturer" } },
  { re: /employee\s*id|emp(?:loyee)?\s*code/i, field: { key: "employeeId" } },
  { re: /customer\s*name/i, field: { key: "customerName" } },
  { re: /vendor\s*name/i, field: { key: "vendorName" } },
  { re: /item\s*name|product\s*name/i, field: { key: "name" } },
  { re: /item\s*code|part\s*number|sku/i, field: { key: "code" } },
  { re: /selling\s*price|unit\s*price/i, field: { key: "unitPrice", transform: (a) => a.replace(/[^\d.]/g, "") } },
  { re: /cost\s*price|purchase\s*price/i, field: { key: "purchasePrice", transform: (a) => a.replace(/[^\d.]/g, "") } },
  { re: /\buom\b|unit\s*of\s*measure/i, field: { key: "uom" } },
  { re: /opening\s*stock|stock\s*qty|quantity/i, field: { key: "stockQty", transform: (a) => a.replace(/[^\d.]/g, "") } },
  { re: /employee\s*name|full\s*name/i, field: { key: "name" } },
  { re: /\bemail\b|e-?mail/i, field: { key: "email" } },
  { re: /\bphone\b|mobile|contact\s*number/i, field: { key: "phone", transform: (a) => parseSingaporePhoneDigits(a) } },
  { re: /\baddress\b/i, field: { key: "address" } },
  { re: /\bdepartment\b|\bdept\b/i, field: { key: "department" } },
  { re: /monthly\s*salary|\bsalary\b|\bwage\b/i, field: { key: "salary", transform: (a) => a.replace(/[^\d.]/g, "") } },
  { re: /\bdesignation\b|\bjob\s*title\b|\btitle\b/i, field: { key: "designation" } },
  {
    re: /\bnationality\b/i,
    field: {
      key: "nationality",
      transform: (a) => {
        const t = a.trim().toLowerCase();
        if (/^pr\b|permanent\s*resident/.test(t)) return "PR";
        if (/foreign|work\s*pass|ep|s.?pass|wp/.test(t)) return "Foreigner";
        if (/singapore|citizen|sg/.test(t)) return "Singapore";
        if (/^singapore$/i.test(a.trim()) || a.trim() === "PR" || /^foreigner$/i.test(a.trim())) return a.trim();
        return a.trim();
      },
    },
  },
  { re: /\bpr\s*status\b/i, field: { key: "prStatus" } },
  { re: /join(?:ing)?\s*date|date\s*of\s*join/i, field: { key: "joinDate" } },
  { re: /date\s*of\s*birth|\bdob\b|birthday/i, field: { key: "dateOfBirth" } },
  { re: /\bpassport\s*number\b|\bpassport\s*no\b/i, field: { key: "passportNumber" } },
  { re: /\bpassport\s*expir/i, field: { key: "passportExpiry" } },
  { re: /\bvisa\s*type\b/i, field: { key: "visaType" } },
  { re: /\bvisa\s*(?:permit\s*)?(?:number|no)\b/i, field: { key: "visaNumber" } },
  { re: /\bvisa\s*expir/i, field: { key: "visaExpiry" } },
  { re: /\bnric|\bic\s*number/i, field: { key: "nricNumber" } },
  { re: /\bnric\s*expir/i, field: { key: "nricExpiry" } },
  {
    re: /\b(?:employee\s*)?status\b|\bactive\b|\bresigned\b|\bon\s*hold\b/i,
    field: {
      key: "status",
      transform: (a) => {
        const t = a.trim().toLowerCase().replace(/\s+/g, "_");
        if (t.startsWith("active")) return "active";
        if (t.includes("resign")) return "resigned";
        if (t.includes("hold")) return "on_hold";
        if (t.includes("termin")) return "terminated";
        return t;
      },
    },
  },
  { re: /\bcurrency\b/i, field: { key: "currency", transform: (a) => normalizeCurrency(a) } },
  { re: /payment\s*terms/i, field: { key: "paymentTerms" } },
  { re: /contact\s*person/i, field: { key: "contactPerson" } },
  { re: /contact\s*email/i, field: { key: "contactEmail" } },
  // Short "Name?" last so it doesn't steal "Customer name?"
  { re: /\bname\b/i, field: { key: "name" } },
];

/** Infer which form field the last Veda question was asking for. */
export function guessFieldFromAssistantQuestion(assistantText: string): FieldGuess | null {
  const text = (assistantText || "").trim();
  if (!text) return null;
  // Never map from navigation / opening chatter — only real field questions
  if (/^opening\b/i.test(text) || /\bform is now open\b/i.test(text)) return null;
  if (!/[?]/.test(text) && !/\b(id|name|email|phone|address|department|salary|designation|nationality|date|passport|visa|nric|status|currency|payment|contact|stock|price|cost|uom|qty)\b/i.test(text)) {
    return null;
  }
  // Prefer the last sentence / question fragment
  const parts = text.split(/(?<=[?.!])\s+/);
  const focus = parts[parts.length - 1] || text;
  for (const { re, field } of ASK_PATTERNS) {
    if (re.test(focus) || re.test(text)) return field;
  }
  return null;
}

/** Extract direct field assignments from user statements (e.g. "customer is Acme", "terms 30 days net", "tax 9"). */
export function extractFieldsFromUserStatement(statement: string): Record<string, unknown> | null {
  const t = String(statement || "").trim();
  if (!t) return null;
  const out: Record<string, unknown> = {};

  // Customer: e.g. "customer is SP Systems", "customer SP Systems", "client is SP Systems"
  const custMatch = t.match(/\b(?:customer(?:\s*name)?|client)\s*(?:is|:|=)?\s*([A-Za-z0-9&.,' -]+?)(?=(?:\s*,\s*|\s+and\s+|\s+(?:terms|payment|po|currency|tax|item|date)|$))/i);
  if (custMatch && custMatch[1].trim() && !/^(is|the|a|an|new|create)$/i.test(custMatch[1].trim())) {
    out.customerName = custMatch[1].trim();
  }

  // Vendor: e.g. "vendor is Westcon", "vendor Westcon", "supplier Cisco"
  const vendMatch = t.match(/\b(?:vendor(?:\s*name)?|supplier)\s*(?:is|:|=)?\s*([A-Za-z0-9&.,' -]+?)(?=(?:\s*,\s*|\s+and\s+|\s+(?:terms|payment|po|currency|tax|item|date)|$))/i);
  if (vendMatch && vendMatch[1].trim() && !/^(is|the|a|an|new|create)$/i.test(vendMatch[1].trim())) {
    out.vendorName = vendMatch[1].trim();
  }

  // Payment terms: "payment terms 30 days", "terms 30 days net", "terms: COD"
  const termsMatch = t.match(/\b(?:payment\s*terms?|terms?)\s*(?:is|:|=)?\s*(\d+\s*days?(?:\s*net)?|cod|immediate|cash)/i);
  if (termsMatch) {
    out.paymentTerms = termsMatch[1].trim();
  }

  // Currency: "currency USD", "currency is SGD", "currency EUR"
  const currMatch = t.match(/\b(?:currency)\s*(?:is|:|=)?\s*([A-Za-z]{3})\b/i);
  if (currMatch) {
    out.currency = normalizeCurrency(currMatch[1]);
  }

  // Tax / GST: "tax 9%", "gst 9", "tax 0"
  const taxMatch = t.match(/\b(?:tax|gst)\s*(?:is|:|=)?\s*(\d+(?:\.\d+)?)\s*%?/i);
  if (taxMatch) {
    out.tax = parseFloat(taxMatch[1]);
  }

  // PO ref: "po ref PO123", "po number 123", "po #123"
  const poMatch = t.match(/\b(?:po\s*(?:ref(?:erence)?|no|number)?|reference)\s*(?:is|:|=|#)?\s*([A-Za-z0-9-_]+)\b/i);
  if (poMatch && !/^(is|the|a)$/i.test(poMatch[1])) {
    out.poRefNo = poMatch[1].trim();
  }

  // Item / Line item: "item Laptop qty 5 price 1200", "add 5 laptops at 1200"
  const itemMatch = t.match(/\bitem\s*(?:is|:)?\s*([^,]+?)(?:,\s*|\s+)qty\s*(\d+)(?:,\s*|\s+)(?:price|rate|unit\s*price)\s*(\d+(?:\.\d+)?)/i);
  if (itemMatch) {
    out.items = [{
      description: itemMatch[1].trim(),
      qty: parseInt(itemMatch[2], 10),
      unitPrice: parseFloat(itemMatch[3]),
    }];
  }

  return Object.keys(out).length > 0 ? out : null;
}

/**
 * Instantly patch the open form from the user's answer (before the LLM round-trip).
 * Returns the fields dispatched, or null if nothing matched.
 */
export function dispatchOptimisticGuidedFill(
  assistantText: string,
  userAnswer: string,
  path?: string | null,
): Record<string, unknown> | null {
  if (!isGuidedCreatePath(path)) return null;
  const answer = sanitizeGuidedAnswer(userAnswer);
  if (!answer || answer.length > 200) return null;
  // Skip confirmations / meta answers / create-nav commands
  if (/^(yes|yeah|yep|ok|okay|sure|no|nope|cancel|stop|save|submit|skip)[.!]?$/i.test(answer)) return null;
  if (/\b(create|open|go\s*to|navigate|new\s+employee|employee\s+form)\b/i.test(answer) && answer.split(/\s+/).length > 3) {
    return null;
  }

  const guess = guessFieldFromAssistantQuestion(assistantText);
  if (!guess) {
    const direct = extractFieldsFromUserStatement(answer);
    if (direct) {
      queueVedaFormFill(direct);
      return direct;
    }
    return null;
  }

  let value: unknown = guess.transform ? guess.transform(answer) : answer;
  if (value == null || value === "") return null;

  // Date-ish free text → ISO if parseable
  if (/Date|Expiry$/i.test(guess.key) && typeof value === "string") {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) value = d.toISOString().slice(0, 10);
  }

  const fields: Record<string, unknown> = { [guess.key]: value };
  if (guess.key === "salary" && typeof value === "string" && value) {
    const n = parseFloat(value);
    if (Number.isFinite(n)) fields.annualSalary = (n * 12).toFixed(2);
  }

  queueVedaFormFill(fields);
  return fields;
}

/** Hint appended to user turns so the model fills immediately. */
export function guidedAnswerHint(path: string | undefined | null): string {
  if (!isGuidedCreatePath(path)) return "";
  if (path?.includes("/employees")) {
    return (
      "\n\n[GUIDED EMPLOYEE CREATE — SPEED CRITICAL] " +
      "In this SAME turn: (1) FIRST call fillCurrentForm with ONLY the field just answered — use the user's exact words/numbers, never invent. " +
      "(keys: employeeId, name, email, phone as 8 local digits no +65, address, department, " +
      "salary, designation, nationality Singapore|PR|Foreigner, prStatus, joinDate YYYY-MM-DD, dateOfBirth, " +
      "passportNumber, passportExpiry, visaType, visaNumber, visaExpiry, nricNumber, nricExpiry, status). " +
      "(2) Then reply with ONLY the next unanswered field question (≤6 words). " +
      "Ask every field one by one — do not skip. Do NOT confirm. Do NOT narrate. Do NOT wait."
    );
  }
  return (
    "\n\n[GUIDED CREATE — SPEED CRITICAL] " +
    "In this SAME turn: FIRST call fillCurrentForm with the answered field using the user's exact answer, " +
    "then ask ONLY the next field in ≤6 words. No confirmation, no narration, no invented values."
  );
}
