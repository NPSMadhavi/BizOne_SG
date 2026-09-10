import { parseSingaporePhoneDigits } from "@/lib/singapore-phone";
import { queueVedaFormFill } from "@/hooks/useVedaFormFill";

/** Paths where Veda walks the create form field-by-field. */
export function isGuidedCreatePath(path: string | undefined | null): boolean {
  if (!path) return false;
  return path.includes("/new") || /vedaNew=1/.test(path) || /\/employees\/\d+\/edit/.test(path);
}

type FieldGuess = { key: string; transform?: (answer: string) => unknown };

const ASK_PATTERNS: Array<{ re: RegExp; field: FieldGuess }> = [
  { re: /employee\s*id|emp(?:loyee)?\s*code|#?\s*id\b/i, field: { key: "employeeId" } },
  { re: /customer\s*name/i, field: { key: "customerName" } },
  { re: /vendor\s*name/i, field: { key: "vendorName" } },
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
    re: /\bstatus\b/i,
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
  { re: /\bcurrency\b/i, field: { key: "currency" } },
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
  // Prefer the last sentence / question fragment
  const parts = text.split(/(?<=[?.!])\s+/);
  const focus = parts[parts.length - 1] || text;
  for (const { re, field } of ASK_PATTERNS) {
    if (re.test(focus) || re.test(text)) return field;
  }
  return null;
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
  const answer = (userAnswer || "").trim();
  if (!answer || answer.length > 200) return null;
  // Skip confirmations / meta answers
  if (/^(yes|yeah|yep|ok|okay|sure|no|nope|cancel|stop|save|submit)[.!]?$/i.test(answer)) return null;

  const guess = guessFieldFromAssistantQuestion(assistantText);
  if (!guess) return null;

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
      "In this SAME turn: (1) FIRST call fillCurrentForm with ONLY the field just answered " +
      "(keys: employeeId, name, email, phone as 8 local digits no +65, address, department, " +
      "salary, designation, nationality Singapore|PR|Foreigner, joinDate YYYY-MM-DD, dateOfBirth, status). " +
      "(2) Then reply with ONLY the next question (≤6 words). " +
      "Do NOT confirm. Do NOT narrate. Do NOT wait."
    );
  }
  return (
    "\n\n[GUIDED CREATE — SPEED CRITICAL] " +
    "In this SAME turn: FIRST call fillCurrentForm with the answered field, " +
    "then ask ONLY the next field in ≤6 words. No confirmation, no narration."
  );
}
