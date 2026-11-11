export const STANDARD_ACCOUNT_TYPES = ["asset", "liability", "equity", "revenue", "expense"] as const;
export type StandardAccountType = (typeof STANDARD_ACCOUNT_TYPES)[number];

export type CustomAccountType = { value: string; label: string };

export const STANDARD_TYPE_LABELS: Record<StandardAccountType, string> = {
  asset: "Assets",
  liability: "Liabilities",
  equity: "Equity",
  revenue: "Revenue",
  expense: "Expenses",
};

export function slugifyAccountType(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

function storageKey(companyId: number | string | null | undefined) {
  return `bizone_custom_account_types_${companyId ?? "default"}`;
}

export function loadCustomAccountTypes(companyId: number | string | null | undefined): CustomAccountType[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey(companyId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item.value === "string" && typeof item.label === "string")
      .map((item) => ({ value: String(item.value), label: String(item.label) }));
  } catch {
    return [];
  }
}

export function saveCustomAccountTypes(
  companyId: number | string | null | undefined,
  types: CustomAccountType[],
) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey(companyId), JSON.stringify(types));
}

export function mergeAccountTypes(
  custom: CustomAccountType[],
  accountTypeValues: string[] = [],
): CustomAccountType[] {
  const out: CustomAccountType[] = STANDARD_ACCOUNT_TYPES.map((value) => ({
    value,
    label: STANDARD_TYPE_LABELS[value],
  }));
  const seen = new Set(out.map((t) => t.value));

  for (const item of custom) {
    if (!item.value || seen.has(item.value)) continue;
    out.push(item);
    seen.add(item.value);
  }

  for (const value of accountTypeValues) {
    if (!value || seen.has(value)) continue;
    out.push({
      value,
      label: value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    });
    seen.add(value);
  }

  return out;
}
