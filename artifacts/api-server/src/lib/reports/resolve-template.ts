import { db, reportDefinitionsTable, reportTemplatesTable } from "@workspace/db";
import { and, eq, isNull, or } from "drizzle-orm";
import { resolveDocumentReportType } from "./document-types.js";

export async function getReportDefinitionByType(reportType: string) {
  const key = resolveDocumentReportType(reportType)?.reportType || String(reportType || "").trim();
  if (!key) return null;
  const [def] = await db
    .select()
    .from(reportDefinitionsTable)
    .where(eq(reportDefinitionsTable.reportType, key))
    .limit(1);
  return def ?? null;
}

export async function getSystemDefaultTemplate(reportDefinitionId: number) {
  const [tpl] = await db
    .select()
    .from(reportTemplatesTable)
    .where(
      and(
        eq(reportTemplatesTable.reportDefinitionId, reportDefinitionId),
        eq(reportTemplatesTable.isSystemTemplate, true),
        isNull(reportTemplatesTable.companyId),
      ),
    )
    .limit(1);
  return tpl ?? null;
}

/**
 * Resolve template for generation:
 * 1. Explicit template (must be system or belong to company)
 * 2. Company active template
 * 3. System default
 */
export type ResolvedTemplate =
  | { definition: typeof reportDefinitionsTable.$inferSelect; template: typeof reportTemplatesTable.$inferSelect }
  | { error: string; status: 400 | 404 };

export function isResolveError(
  value: ResolvedTemplate,
): value is { error: string; status: 400 | 404 } {
  return "error" in value;
}

export async function resolveReportTemplate(opts: {
  companyId: number;
  reportType: string;
  templateId?: number | null;
}): Promise<ResolvedTemplate> {
  const definition = await getReportDefinitionByType(opts.reportType);
  if (!definition) return { error: "Unknown report type", status: 400 as const };

  if (opts.templateId) {
    const [tpl] = await db
      .select()
      .from(reportTemplatesTable)
      .where(eq(reportTemplatesTable.id, opts.templateId))
      .limit(1);
    if (!tpl) return { error: "Template not found", status: 404 as const };
    const allowed = tpl.isSystemTemplate || tpl.companyId === opts.companyId;
    if (!allowed) return { error: "Template not found", status: 404 as const };
    if (tpl.reportDefinitionId !== definition.id) {
      return { error: "Template does not match report type", status: 400 as const };
    }
    return { definition, template: tpl };
  }

  const [active] = await db
    .select()
    .from(reportTemplatesTable)
    .where(
      and(
        eq(reportTemplatesTable.companyId, opts.companyId),
        eq(reportTemplatesTable.reportDefinitionId, definition.id),
        eq(reportTemplatesTable.isActive, true),
        eq(reportTemplatesTable.isSystemTemplate, false),
      ),
    )
    .limit(1);

  if (active) return { definition, template: active };

  const system = await getSystemDefaultTemplate(definition.id);
  if (!system) return { error: "No template available", status: 404 as const };
  return { definition, template: system };
}

export function canAccessTemplate(template: { companyId: number | null; isSystemTemplate: boolean }, companyId: number): boolean {
  if (template.isSystemTemplate) return true;
  return template.companyId === companyId;
}

export function templateVisibleFilter(companyId: number) {
  return or(
    and(eq(reportTemplatesTable.isSystemTemplate, true), isNull(reportTemplatesTable.companyId)),
    eq(reportTemplatesTable.companyId, companyId),
  );
}
