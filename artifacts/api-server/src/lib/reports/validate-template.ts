import { db, invoicesTable, reportFieldsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { collectTemplateFieldKeys } from "./field-resolver.js";
import type { ReportElement, ReportTemplateJson } from "./types.js";

const ALLOWED_TYPES = new Set([
  "text", "field", "image", "table", "line", "rectangle", "date", "page_number",
]);

export function isValidTemplateJson(value: unknown): value is ReportTemplateJson {
  if (!value || typeof value !== "object") return false;
  const t = value as ReportTemplateJson;
  return Array.isArray(t.elements) && !!t.page;
}

export function sanitizeTemplateJson(input: ReportTemplateJson): ReportTemplateJson {
  return {
    version: Number(input.version) || 1,
    reportType: String(input.reportType || "invoice"),
    page: {
      size: input.page?.size === "Letter" ? "Letter" : "A4",
      orientation: input.page?.orientation === "landscape" ? "landscape" : "portrait",
      margin: {
        top: Number(input.page?.margin?.top ?? 10),
        right: Number(input.page?.margin?.right ?? 10),
        bottom: Number(input.page?.margin?.bottom ?? 12),
        left: Number(input.page?.margin?.left ?? 10),
      },
    },
    elements: (input.elements || []).filter((el) => ALLOWED_TYPES.has(el.type)).map((el): ReportElement => ({
      id: String(el.id || ""),
      type: el.type,
      x: Number(el.x) || 0,
      y: Number(el.y) || 0,
      width: Number(el.width) || 10,
      height: Number(el.height) || 4,
      text: el.type === "text" || el.type === "page_number" ? (el.text || "") : undefined,
      field: el.field ? String(el.field) : undefined,
      src: undefined,
      fontSize: el.fontSize,
      fontWeight: el.fontWeight,
      fontStyle: el.fontStyle,
      color: el.color,
      backgroundColor: el.backgroundColor,
      textAlign: el.textAlign,
      borderWidth: el.borderWidth,
      borderColor: el.borderColor,
      borderStyle: el.borderStyle,
      visible: el.visible,
      zIndex: el.zIndex,
      source: el.source || (el.type === "table" ? "items" : undefined),
      columns: el.columns,
      dateFormat: el.dateFormat,
      headerBackground: el.headerBackground,
      headerColor: el.headerColor,
    })),
  };
}

export async function validateTemplateFields(definitionId: number, template: ReportTemplateJson): Promise<string | null> {
  const rows = await db
    .select({ fieldKey: reportFieldsTable.fieldKey })
    .from(reportFieldsTable)
    .where(and(eq(reportFieldsTable.reportDefinitionId, definitionId), eq(reportFieldsTable.isActive, true)));
  const allowed = new Set(rows.map((r) => r.fieldKey));
  const used = collectTemplateFieldKeys(template);
  const invalid = used.filter((key) => !allowed.has(key));
  if (invalid.length) {
    return `Unknown field reference(s): ${invalid.join(", ")}. Templates may only store field keys from the report definition, not live invoice values.`;
  }
  return null;
}

export function assertNoCopiedBusinessValues(template: ReportTemplateJson): string | null {
  for (const el of template.elements || []) {
    if ((el.type === "field" || el.type === "image" || el.type === "date") && !el.field) {
      return "Field, image, and date elements must reference a catalog field key such as invoice.invoice_number.";
    }
    if (el.type === "table") {
      const source = el.source || "items";
      if (source !== "items") return "Table dataSource must be items.";
    }
  }
  return null;
}

export async function invoiceAccessible(opts: {
  invoiceId: number;
  companyId: number;
  userId: number;
  isAdmin: boolean;
  isExternal?: boolean;
}): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const [doc] = await db
    .select({
      id: invoicesTable.id,
      companyId: invoicesTable.companyId,
      createdBy: invoicesTable.createdBy,
      isPrivate: invoicesTable.isPrivate,
    })
    .from(invoicesTable)
    .where(and(eq(invoicesTable.id, opts.invoiceId), eq(invoicesTable.companyId, opts.companyId)))
    .limit(1);
  if (!doc) return { ok: false, status: 404, error: "Invoice not found" };
  if (opts.isExternal && doc.createdBy !== opts.userId) {
    return { ok: false, status: 403, error: "Access denied" };
  }
  if (doc.isPrivate && doc.createdBy !== opts.userId && !opts.isAdmin) {
    return { ok: false, status: 403, error: "Access denied" };
  }
  return { ok: true };
}
