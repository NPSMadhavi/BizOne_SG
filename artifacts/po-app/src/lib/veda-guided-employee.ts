import { parseSingaporePhoneDigits } from "@/lib/singapore-phone";
import { queueVedaFormFill } from "@/hooks/useVedaFormFill";
import { sanitizeGuidedAnswer } from "@/lib/veda-optimistic-fill";

export type GuidedEmployeeField = {
  key: string;
  ask: string;
  /** Optional fields can be skipped with "skip" / "none" / "later". */
  optional?: boolean;
  transform?: (answer: string) => unknown;
  /** After fill, maybe inject extra fields (e.g. annualSalary). */
  extra?: (value: unknown) => Record<string, unknown>;
  /** Skip this field when predicate is false (based on filled so far). */
  when?: (filled: Record<string, unknown>) => boolean;
};

function parseLooseDate(answer: string): string | null {
  const t = answer.trim();
  if (!t) return null;
  // Already ISO-ish
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const d = new Date(t);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  // DD/MM/YYYY or DD-MM-YYYY
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

function mapNationality(a: string): string {
  const t = a.trim().toLowerCase();
  if (/^pr\b|permanent\s*resident/.test(t)) return "PR";
  if (/foreign|work\s*pass|ep|s.?pass|wp/.test(t)) return "Foreigner";
  if (/singapore|citizen|^sg$/.test(t)) return "Singapore";
  if (/^(Singapore|PR|Foreigner)$/i.test(a.trim())) return a.trim();
  return a.trim();
}

/** Ordered employee create fields — short prompts for snappy voice turns. */
export const EMPLOYEE_GUIDED_FIELDS: GuidedEmployeeField[] = [
  { key: "employeeId", ask: "ID?" },
  { key: "name", ask: "Name?" },
  { key: "email", ask: "Email?" },
  {
    key: "phone",
    ask: "Phone?",
    transform: (a) => parseSingaporePhoneDigits(a),
  },
  { key: "department", ask: "Department?" },
  { key: "designation", ask: "Designation?" },
  {
    key: "salary",
    ask: "Salary?",
    transform: (a) => a.replace(/[^\d.]/g, ""),
    extra: (v) => {
      const n = parseFloat(String(v));
      return Number.isFinite(n) ? { annualSalary: (n * 12).toFixed(2) } : {};
    },
  },
  {
    key: "nationality",
    ask: "Nationality?",
    transform: mapNationality,
  },
  {
    key: "prStatus",
    ask: "PR status?",
    optional: true,
    when: (filled) => filled.nationality === "PR",
  },
  {
    key: "dateOfBirth",
    ask: "Date of birth?",
    transform: (a) => parseLooseDate(a) ?? a,
  },
  { key: "address", ask: "Address?", optional: true },
];

export type GuidedEmployeeSession = {
  index: number;
  filled: Record<string, unknown>;
  awaitingSave: boolean;
};

export function createGuidedEmployeeSession(): GuidedEmployeeSession {
  const today = new Date().toISOString().slice(0, 10);
  // Defaults so we don't waste turns asking
  const defaults: Record<string, unknown> = {
    joinDate: today,
    status: "active",
  };
  queueVedaFormFill(defaults);
  return { index: 0, filled: { ...defaults }, awaitingSave: false };
}

export function currentEmployeeField(session: GuidedEmployeeSession): GuidedEmployeeField | null {
  if (session.awaitingSave) return null;
  while (session.index < EMPLOYEE_GUIDED_FIELDS.length) {
    const field = EMPLOYEE_GUIDED_FIELDS[session.index];
    if (field.when && !field.when(session.filled)) {
      session.index += 1;
      continue;
    }
    return field;
  }
  return null;
}

export function currentEmployeeQuestion(session: GuidedEmployeeSession): string {
  if (session.awaitingSave) return "Shall I save?";
  return currentEmployeeField(session)?.ask || "Shall I save?";
}

function isSkipAnswer(answer: string): boolean {
  return /^(skip|none|no|later|n\/a|na|pass)[.!]?$/i.test(answer.trim());
}

/**
 * Apply the user's spoken answer to the current field instantly.
 * Returns the next question to speak, or save prompt.
 */
export function applyGuidedEmployeeAnswer(
  session: GuidedEmployeeSession,
  rawAnswer: string,
): { ok: boolean; nextAsk: string; filled?: Record<string, unknown>; done?: boolean } {
  const answer = sanitizeGuidedAnswer(rawAnswer);
  if (!answer) return { ok: false, nextAsk: currentEmployeeQuestion(session) };

  if (session.awaitingSave) {
    if (/^(yes|yeah|yep|yup|ok|okay|sure|save|submit)[.!]?$/i.test(answer)) {
      return { ok: true, nextAsk: "Saving.", done: true };
    }
    if (/^(no|nope|not yet|wait|cancel)[.!]?$/i.test(answer)) {
      session.awaitingSave = false;
      return { ok: true, nextAsk: "Okay. Say save when ready." };
    }
    return { ok: false, nextAsk: "Shall I save?" };
  }

  const field = currentEmployeeField(session);
  if (!field) {
    session.awaitingSave = true;
    return { ok: true, nextAsk: "Shall I save?" };
  }

  if (field.optional && isSkipAnswer(answer)) {
    session.index += 1;
    const next = currentEmployeeField(session);
    if (!next) {
      session.awaitingSave = true;
      return { ok: true, nextAsk: "Shall I save?" };
    }
    return { ok: true, nextAsk: next.ask };
  }

  let value: unknown = field.transform ? field.transform(answer) : answer;
  if (value == null || value === "") {
    return { ok: false, nextAsk: field.ask };
  }

  const patch: Record<string, unknown> = { [field.key]: value };
  if (field.extra) Object.assign(patch, field.extra(value));

  // Instant live fill — no LLM
  queueVedaFormFill(patch);
  Object.assign(session.filled, patch);
  session.index += 1;

  const next = currentEmployeeField(session);
  if (!next) {
    session.awaitingSave = true;
    return { ok: true, nextAsk: "Shall I save?", filled: patch };
  }
  return { ok: true, nextAsk: next.ask, filled: patch };
}
