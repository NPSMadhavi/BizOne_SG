import type { InvoiceReportPayload } from "./types.js";

const ALIASES: Record<string, string> = {
  tax_number: "taxNumber",
  registration_number: "registrationNumber",
  bank_details: "bankDetails",
  gst_rate: "gstRate",
  postal_code: "postalCode",
  ship_to_address: "shipToAddress",
  contact_person: "contactPerson",
};

export function resolveFieldPath(data: unknown, path: string): unknown {
  if (!path) return "";
  const parts = path.split(".");
  let current: any = data;
  for (const part of parts) {
    if (current == null) return "";
    const alias = ALIASES[part];
    if (alias && current[alias] !== undefined) current = current[alias];
    else current = current[part];
  }
  return current ?? "";
}

export function resolveFieldValue(
  data: InvoiceReportPayload | null,
  field: string | undefined,
  options?: { designLabel?: string },
): string {
  if (!field) return "";
  if (options?.designLabel) return `{{ ${options.designLabel} }}`;
  if (!data) return "";
  return String(resolveFieldPath(data, field) ?? "");
}

export function collectTemplateFieldKeys(template: { elements?: Array<{ field?: string; columns?: Array<{ field?: string }> }> } | null): string[] {
  const keys = new Set<string>();
  for (const el of template?.elements || []) {
    if (el.field) keys.add(el.field);
    for (const col of el.columns || []) {
      if (col.field) keys.add(col.field);
    }
  }
  return [...keys];
}
