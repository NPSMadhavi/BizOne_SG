import { Router, type IRouter } from "express";
import { db, reportDefinitionsTable, reportFieldsTable, reportTemplatesTable } from "@workspace/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { requirePermission } from "../lib/auth-middleware.js";
import type { Request, Response, NextFunction } from "express";
import { logAudit } from "../lib/audit.js";
import { getCompanyReportData } from "../lib/reports/company-data.js";
import { getReportData } from "../lib/reports/data-provider.js";
import { renderReportHtml } from "../lib/reports/renderer.js";
import { htmlToPdf } from "../lib/reports/pdf.js";
import {
  assertNoCopiedBusinessValues,
  isValidTemplateJson,
  sanitizeTemplateJson,
  validateTemplateFields,
} from "../lib/reports/validate-template.js";
import {
  canAccessTemplate,
  getReportDefinitionByType,
  getSystemDefaultTemplate,
  isResolveError,
  resolveReportTemplate,
  templateVisibleFilter,
} from "../lib/reports/resolve-template.js";
import { getDocumentReportType, sortReportDefinitions } from "../lib/reports/document-types.js";
import { buildDefaultDocumentTemplate, buildDefaultInvoiceTemplate } from "../lib/reports/default-invoice-template.js";
import { seedReportDefinitions } from "../lib/reports/seed.js";

const router: IRouter = Router();

function requireReportPerm(permission: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.session?.isAdmin || req.session?.userRole === "admin") {
      if (!req.session.userId) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }
      if (!req.session.companyId) {
        res.status(403).json({ error: "Active company context required" });
        return;
      }
      next();
      return;
    }
    return requirePermission(permission)(req, res, next);
  };
}

function companyIdFrom(req: any): number | null {
  const id = Number(req.session?.companyId);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function parseId(value: string | string[] | undefined): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function userCtx(req: any, companyId: number) {
  return {
    companyId,
    userId: Number(req.session.userId),
    isAdmin: req.session.isAdmin === true || req.session.userRole === "admin",
    isExternal: req.session.userRole === "external",
  };
}

function uniqueCopyName(base: string, existing: string[]): string {
  const names = new Set(existing.map((n) => n.toLowerCase()));
  let candidate = `${base} Copy`;
  let i = 2;
  while (names.has(candidate.toLowerCase())) {
    candidate = `${base} Copy ${i}`;
    i += 1;
  }
  return candidate;
}

router.get("/report-definitions", requireReportPerm("report_templates:view"), async (req, res): Promise<void> => {
  await seedReportDefinitions();
  const rows = await db
    .select()
    .from(reportDefinitionsTable)
    .where(eq(reportDefinitionsTable.isActive, true));
  res.json(sortReportDefinitions(rows));
});

router.get("/report-definitions/:id", requireReportPerm("report_templates:view"), async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid ID" }); return; }
  const [def] = await db.select().from(reportDefinitionsTable).where(eq(reportDefinitionsTable.id, id)).limit(1);
  if (!def) { res.status(404).json({ error: "Report definition not found" }); return; }
  const fields = await db
    .select()
    .from(reportFieldsTable)
    .where(and(eq(reportFieldsTable.reportDefinitionId, id), eq(reportFieldsTable.isActive, true)))
    .orderBy(reportFieldsTable.id);
  res.json({
    ...def,
    fields: fields.map((f) => ({ ...f, isCollection: f.isRepeatable })),
  });
});

router.get("/report-templates", requireReportPerm("report_templates:view"), async (req, res): Promise<void> => {
  const companyId = companyIdFrom(req);
  if (!companyId) { res.status(403).json({ error: "Active company context required" }); return; }

  const reportType = typeof req.query.reportType === "string" ? req.query.reportType : null;
  let definitionId: number | null = null;
  if (reportType) {
    const def = await getReportDefinitionByType(reportType);
    if (!def) { res.json([]); return; }
    definitionId = def.id;
  }

  const rows = await db
    .select()
    .from(reportTemplatesTable)
    .where(
      definitionId
        ? and(templateVisibleFilter(companyId), eq(reportTemplatesTable.reportDefinitionId, definitionId))
        : templateVisibleFilter(companyId),
    )
    .orderBy(desc(reportTemplatesTable.isSystemTemplate), desc(reportTemplatesTable.isActive), reportTemplatesTable.name);

  const defs = await db.select().from(reportDefinitionsTable);
  const defMap = new Map(defs.map((d) => [d.id, d]));

  res.json(rows.map((row) => ({
    ...row,
    reportType: defMap.get(row.reportDefinitionId)?.reportType ?? null,
    reportTypeName: defMap.get(row.reportDefinitionId)?.name ?? null,
    status: row.isSystemTemplate ? "SYSTEM DEFAULT" : (row.isActive ? "ACTIVE" : "INACTIVE"),
  })));
});

router.get("/report-templates/active", requireReportPerm("report_templates:view"), async (req, res): Promise<void> => {
  const companyId = companyIdFrom(req);
  if (!companyId) { res.status(403).json({ error: "Active company context required" }); return; }
  const reportType = typeof req.query.reportType === "string" ? req.query.reportType : "invoice";
  const resolved = await resolveReportTemplate({ companyId, reportType });
  if (isResolveError(resolved)) { res.status(resolved.status).json({ error: resolved.error }); return; }
  res.json(resolved.template);
});

router.get("/report-templates/:id", requireReportPerm("report_templates:view"), async (req, res): Promise<void> => {
  const companyId = companyIdFrom(req);
  if (!companyId) { res.status(403).json({ error: "Active company context required" }); return; }
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [tpl] = await db.select().from(reportTemplatesTable).where(eq(reportTemplatesTable.id, id)).limit(1);
  if (!tpl || !canAccessTemplate(tpl, companyId)) {
    res.status(404).json({ error: "Template not found" });
    return;
  }
  const [def] = await db
    .select()
    .from(reportDefinitionsTable)
    .where(eq(reportDefinitionsTable.id, tpl.reportDefinitionId))
    .limit(1);
  res.json({
    ...tpl,
    reportType: def?.reportType ?? null,
    reportTypeName: def?.name ?? null,
  });
});

router.post("/report-templates", requireReportPerm("report_templates:create"), async (req, res): Promise<void> => {
  const companyId = companyIdFrom(req);
  if (!companyId) { res.status(403).json({ error: "Active company context required" }); return; }

  const name = String(req.body?.name || "").trim();
  const reportType = String(req.body?.reportType || "invoice").trim();
  const description = req.body?.description ? String(req.body.description).trim() : null;
  const setActive = req.body?.isActive === true;
  if (!name) { res.status(400).json({ error: "Template name is required" }); return; }

  const resolvedType = getDocumentReportType(reportType)?.reportType || reportType;
  let definition = await getReportDefinitionByType(resolvedType);
  if (!definition) {
    await seedReportDefinitions();
    definition = await getReportDefinitionByType(resolvedType);
  }
  if (!definition) { res.status(400).json({ error: "Unknown report type" }); return; }

  const [nameClash] = await db
    .select({ id: reportTemplatesTable.id })
    .from(reportTemplatesTable)
    .where(and(
      eq(reportTemplatesTable.companyId, companyId),
      eq(reportTemplatesTable.reportDefinitionId, definition.id),
      sql`lower(${reportTemplatesTable.name}) = ${name.toLowerCase()}`,
    ))
    .limit(1);
  if (nameClash) { res.status(409).json({ error: "A template with this name already exists for this report type" }); return; }

  let templateJson: ReportTemplateJson;
  if (isValidTemplateJson(req.body?.templateJson)) {
    templateJson = sanitizeTemplateJson(req.body.templateJson);
    const copied = assertNoCopiedBusinessValues(templateJson);
    if (copied) { res.status(400).json({ error: copied }); return; }
    const invalid = await validateTemplateFields(definition.id, templateJson);
    if (invalid) { res.status(400).json({ error: invalid }); return; }
  } else {
    const system = await getSystemDefaultTemplate(definition.id);
    const docCfg = getDocumentReportType(reportType);
    templateJson = cloneJson(
      (system?.templateJson as ReportTemplateJson) ||
      (docCfg
        ? buildDefaultDocumentTemplate({
            reportType: docCfg.reportType,
            title: docCfg.title,
            partyLabel: docCfg.partyLabel,
            footerDocName: docCfg.footerDocName,
          })
        : buildDefaultInvoiceTemplate()),
    );
  }

  if (req.body?.pageSize || req.body?.orientation) {
    templateJson.page = {
      ...templateJson.page,
      size: req.body.pageSize === "Letter" ? "Letter" : "A4",
      orientation: req.body.orientation === "landscape" ? "landscape" : "portrait",
      margin: templateJson.page?.margin || { top: 10, right: 10, bottom: 12, left: 10 },
    };
  }

  const [existingActive] = await db
    .select({ id: reportTemplatesTable.id })
    .from(reportTemplatesTable)
    .where(and(
      eq(reportTemplatesTable.companyId, companyId),
      eq(reportTemplatesTable.reportDefinitionId, definition.id),
      eq(reportTemplatesTable.isActive, true),
    ))
    .limit(1);
  const activate = setActive || !existingActive;

  const created = await db.transaction(async (tx) => {
    if (activate) {
      await tx
        .update(reportTemplatesTable)
        .set({ isActive: false, updatedAt: new Date() })
        .where(and(
          eq(reportTemplatesTable.companyId, companyId),
          eq(reportTemplatesTable.reportDefinitionId, definition.id),
          eq(reportTemplatesTable.isActive, true),
        ));
    }
    const [row] = await tx
      .insert(reportTemplatesTable)
      .values({
        companyId,
        reportDefinitionId: definition.id,
        name,
        description,
        templateJson,
        isSystemTemplate: false,
        isActive: activate,
        createdBy: req.session.userId ?? null,
        updatedBy: req.session.userId ?? null,
      })
      .returning();
    return row;
  });

  logAudit({ req, action: "create", entityType: "report_template", entityId: created.id, entityLabel: created.name });
  res.status(201).json(created);
});

router.put("/report-templates/:id", requireReportPerm("report_templates:edit"), async (req, res): Promise<void> => {
  const companyId = companyIdFrom(req);
  if (!companyId) { res.status(403).json({ error: "Active company context required" }); return; }
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [existing] = await db.select().from(reportTemplatesTable).where(eq(reportTemplatesTable.id, id)).limit(1);
  if (!existing || !canAccessTemplate(existing, companyId)) {
    res.status(404).json({ error: "Template not found" });
    return;
  }
  if (existing.isSystemTemplate) {
    res.status(403).json({ error: "System default templates cannot be modified. Use Save As to create a company template." });
    return;
  }

  const updates: Record<string, unknown> = {
    updatedBy: req.session.userId ?? null,
    updatedAt: new Date(),
  };
  if (req.body?.name !== undefined) {
    const name = String(req.body.name).trim();
    if (!name) { res.status(400).json({ error: "Template name is required" }); return; }
    const [clash] = await db
      .select({ id: reportTemplatesTable.id })
      .from(reportTemplatesTable)
      .where(and(
        eq(reportTemplatesTable.companyId, companyId),
        eq(reportTemplatesTable.reportDefinitionId, existing.reportDefinitionId),
        sql`lower(${reportTemplatesTable.name}) = ${name.toLowerCase()}`,
        sql`${reportTemplatesTable.id} <> ${id}`,
      ))
      .limit(1);
    if (clash) { res.status(409).json({ error: "A template with this name already exists for this report type" }); return; }
    updates.name = name;
  }
  if (req.body?.description !== undefined) updates.description = req.body.description ? String(req.body.description).trim() : null;
  if (req.body?.isActive === false) updates.isActive = false;
  if (req.body?.templateJson !== undefined) {
    if (!isValidTemplateJson(req.body.templateJson)) {
      res.status(400).json({ error: "Invalid template JSON" });
      return;
    }
    const templateJson = sanitizeTemplateJson(req.body.templateJson);
    const copied = assertNoCopiedBusinessValues(templateJson);
    if (copied) { res.status(400).json({ error: copied }); return; }
    const invalid = await validateTemplateFields(existing.reportDefinitionId, templateJson);
    if (invalid) { res.status(400).json({ error: invalid }); return; }
    updates.templateJson = templateJson;
  }

  const [updated] = await db
    .update(reportTemplatesTable)
    .set(updates)
    .where(and(eq(reportTemplatesTable.id, id), eq(reportTemplatesTable.companyId, companyId)))
    .returning();

  logAudit({ req, action: "update", entityType: "report_template", entityId: id, entityLabel: updated?.name });
  res.json(updated);
});

router.post("/report-templates/:id/duplicate", requireReportPerm("report_templates:create"), async (req, res): Promise<void> => {
  const companyId = companyIdFrom(req);
  if (!companyId) { res.status(403).json({ error: "Active company context required" }); return; }
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [existing] = await db.select().from(reportTemplatesTable).where(eq(reportTemplatesTable.id, id)).limit(1);
  if (!existing || !canAccessTemplate(existing, companyId)) {
    res.status(404).json({ error: "Template not found" });
    return;
  }

  const siblings = await db
    .select({ name: reportTemplatesTable.name })
    .from(reportTemplatesTable)
    .where(and(
      eq(reportTemplatesTable.companyId, companyId),
      eq(reportTemplatesTable.reportDefinitionId, existing.reportDefinitionId),
    ));
  const name = uniqueCopyName(existing.name, siblings.map((s) => s.name));

  const [created] = await db
    .insert(reportTemplatesTable)
    .values({
      companyId,
      reportDefinitionId: existing.reportDefinitionId,
      name,
      description: existing.description,
      templateJson: cloneJson(existing.templateJson),
      isSystemTemplate: false,
      isActive: false,
      createdBy: req.session.userId ?? null,
      updatedBy: req.session.userId ?? null,
    })
    .returning();

  logAudit({
    req,
    action: "duplicate",
    entityType: "report_template",
    entityId: created.id,
    entityLabel: created.name,
    details: { sourceId: existing.id, sourceName: existing.name },
  });
  res.status(201).json(created);
});

router.post("/report-templates/:id/set-active", requireReportPerm("report_templates:edit"), async (req, res): Promise<void> => {
  const companyId = companyIdFrom(req);
  if (!companyId) { res.status(403).json({ error: "Active company context required" }); return; }
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [existing] = await db.select().from(reportTemplatesTable).where(eq(reportTemplatesTable.id, id)).limit(1);
  if (!existing || !canAccessTemplate(existing, companyId)) {
    res.status(404).json({ error: "Template not found" });
    return;
  }

  const updated = await db.transaction(async (tx) => {
    await tx
      .update(reportTemplatesTable)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(
        eq(reportTemplatesTable.companyId, companyId),
        eq(reportTemplatesTable.reportDefinitionId, existing.reportDefinitionId),
        eq(reportTemplatesTable.isActive, true),
      ));
    if (existing.isSystemTemplate) {
      return existing;
    }
    const [row] = await tx
      .update(reportTemplatesTable)
      .set({ isActive: true, updatedBy: req.session.userId ?? null, updatedAt: new Date() })
      .where(and(eq(reportTemplatesTable.id, id), eq(reportTemplatesTable.companyId, companyId)))
      .returning();
    return row;
  });

  logAudit({ req, action: "activate", entityType: "report_template", entityId: id, entityLabel: updated?.name });
  res.json(updated);
});

router.delete("/report-templates/:id", requireReportPerm("report_templates:delete"), async (req, res): Promise<void> => {
  const companyId = companyIdFrom(req);
  if (!companyId) { res.status(403).json({ error: "Active company context required" }); return; }
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [existing] = await db.select().from(reportTemplatesTable).where(eq(reportTemplatesTable.id, id)).limit(1);
  if (!existing || !canAccessTemplate(existing, companyId)) {
    res.status(404).json({ error: "Template not found" });
    return;
  }
  if (!existing.isSystemTemplate && existing.companyId !== companyId) {
    res.status(404).json({ error: "Template not found" });
    return;
  }

  await db.delete(reportTemplatesTable).where(eq(reportTemplatesTable.id, id));
  logAudit({ req, action: "delete", entityType: "report_template", entityId: id, entityLabel: existing.name });
  res.json({ success: true });
});

router.get("/reports/invoice-templates", async (req, res): Promise<void> => {
  if (!req.session?.userId) { res.status(401).json({ error: "Authentication required" }); return; }
  const companyId = companyIdFrom(req);
  if (!companyId) { res.status(403).json({ error: "Active company context required" }); return; }
  const perms: string[] = req.session.permissions || [];
  const can = perms.includes("invoices:view") || perms.includes("report_templates:view") || req.session.isAdmin === true || req.session.userRole === "admin";
  if (!can) { res.status(403).json({ error: "Permission denied" }); return; }

  const definition = await getReportDefinitionByType("invoice");
  if (!definition) { res.json([]); return; }
  const rows = await db
    .select({
      id: reportTemplatesTable.id,
      name: reportTemplatesTable.name,
      isActive: reportTemplatesTable.isActive,
      isSystemTemplate: reportTemplatesTable.isSystemTemplate,
    })
    .from(reportTemplatesTable)
    .where(and(templateVisibleFilter(companyId), eq(reportTemplatesTable.reportDefinitionId, definition.id)))
    .orderBy(desc(reportTemplatesTable.isSystemTemplate), desc(reportTemplatesTable.isActive), reportTemplatesTable.name);
  res.json(rows);
});

router.get("/reports/company-data", requireReportPerm("report_templates:view"), async (req, res): Promise<void> => {
  const companyId = companyIdFrom(req);
  if (!companyId) { res.status(403).json({ error: "Active company context required" }); return; }
  res.json(await getCompanyReportData(companyId));
});

router.get("/reports/invoice-data/:invoiceId", async (req, res): Promise<void> => {
  if (!req.session?.userId) { res.status(401).json({ error: "Authentication required" }); return; }
  const companyId = companyIdFrom(req);
  if (!companyId) { res.status(403).json({ error: "Active company context required" }); return; }

  const perms: string[] = req.session.permissions || [];
  const can = perms.includes("invoices:view") || perms.includes("report_templates:view") || req.session.isAdmin === true || req.session.userRole === "admin";
  if (!can) { res.status(403).json({ error: "Permission denied" }); return; }

  const invoiceId = parseId(req.params.invoiceId);
  if (!invoiceId) { res.status(400).json({ error: "Invalid invoice ID" }); return; }
  const result = await getReportData("invoice", invoiceId, userCtx(req, companyId));
  if (!result.ok) { res.status(result.status).json({ error: result.error }); return; }
  res.json(result.data);
});

router.post("/reports/preview", async (req, res): Promise<void> => {
  if (!req.session?.userId) { res.status(401).json({ error: "Authentication required" }); return; }
  const companyId = companyIdFrom(req);
  if (!companyId) { res.status(403).json({ error: "Active company context required" }); return; }

  const perms: string[] = req.session.permissions || [];
  const can = perms.includes("invoices:view") || perms.includes("report_templates:view") || req.session.isAdmin === true || req.session.userRole === "admin";
  if (!can) { res.status(403).json({ error: "Permission denied" }); return; }

  const reportType = String(req.body?.reportType || "invoice");
  const recordIdRaw = req.body?.recordId ?? req.body?.documentId;
  const documentId = recordIdRaw ? Number(recordIdRaw) : null;
  const designMode = req.body?.designMode === true;

  let templateJson: ReportTemplateJson | null = isValidTemplateJson(req.body?.templateJson)
    ? sanitizeTemplateJson(req.body.templateJson)
    : null;

  if (!templateJson) {
    const resolved = await resolveReportTemplate({
      companyId,
      reportType,
      templateId: req.body?.templateId ? Number(req.body.templateId) : null,
    });
    if (isResolveError(resolved)) { res.status(resolved.status).json({ error: resolved.error }); return; }
    templateJson = resolved.template.templateJson as ReportTemplateJson;
  }

  const loaded = await getReportData(reportType, Number.isInteger(documentId) && (documentId as number) > 0 ? documentId : null, userCtx(req, companyId));
  if (!loaded.ok) { res.status(loaded.status).json({ error: loaded.error }); return; }

  const html = renderReportHtml(templateJson, loaded.data, {
    designMode,
    title: loaded.data.invoice.invoice_number || "Invoice Preview",
  });
  res.json({ html, data: loaded.data });
});

router.post("/reports/generate", async (req, res): Promise<void> => {
  if (!req.session?.userId) { res.status(401).json({ error: "Authentication required" }); return; }
  const companyId = companyIdFrom(req);
  if (!companyId) { res.status(403).json({ error: "Active company context required" }); return; }

  const perms: string[] = req.session.permissions || [];
  const can = perms.includes("invoices:view") || perms.includes("report_templates:view") || req.session.isAdmin === true || req.session.userRole === "admin";
  if (!can) { res.status(403).json({ error: "Permission denied" }); return; }

  const reportType = String(req.body?.reportType || "invoice");
  const recordIdRaw = req.body?.recordId ?? req.body?.documentId;
  const documentId = Number(recordIdRaw);
  if (!Number.isInteger(documentId) || documentId <= 0) {
    res.status(400).json({ error: "recordId is required" });
    return;
  }

  let templateJson: ReportTemplateJson | null = isValidTemplateJson(req.body?.templateJson)
    ? sanitizeTemplateJson(req.body.templateJson)
    : null;
  let templateId: number | null = req.body?.templateId ? Number(req.body.templateId) : null;
  let templateName = "unsaved";

  if (!templateJson) {
    const resolved = await resolveReportTemplate({
      companyId,
      reportType,
      templateId,
    });
    if (isResolveError(resolved)) { res.status(resolved.status).json({ error: resolved.error }); return; }
    templateJson = resolved.template.templateJson as ReportTemplateJson;
    templateId = resolved.template.id;
    templateName = resolved.template.name;
  }

  const loaded = await getReportData(reportType, documentId, userCtx(req, companyId));
  if (!loaded.ok) { res.status(loaded.status).json({ error: loaded.error }); return; }

  const html = renderReportHtml(templateJson, loaded.data, { title: loaded.data.invoice.invoice_number });
  const pdf = await htmlToPdf(html, templateJson);

  logAudit({
    req,
    action: "generate",
    entityType: "report",
    entityId: documentId,
    entityLabel: loaded.data.invoice.invoice_number,
    details: { reportType, templateId, templateName },
  });

  const filename = `${loaded.data.invoice.invoice_number || "invoice"}.pdf`;
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(pdf);
});

export default router;
