import { db, reportDefinitionsTable, reportFieldsTable, reportTemplatesTable } from "@workspace/db";
import { and, eq, isNull } from "drizzle-orm";
import { DOCUMENT_REPORT_TYPES } from "./document-types.js";
import { fieldsForDocumentType } from "./invoice-fields.js";
import { buildDefaultDocumentTemplate } from "./default-invoice-template.js";
import { logger } from "../logger.js";

export async function seedInvoiceReportDefinition(): Promise<void> {
  await seedReportDefinitions();
}

export async function seedReportDefinitions(): Promise<void> {
  for (const cfg of DOCUMENT_REPORT_TYPES) {
    try {
      await seedOneDocumentType(cfg);
    } catch (err) {
      logger.error({ err, reportType: cfg.reportType }, "[reports] failed to seed document type");
    }
  }
}

async function seedOneDocumentType(cfg: (typeof DOCUMENT_REPORT_TYPES)[number]): Promise<void> {
  const existing = await db
    .select()
    .from(reportDefinitionsTable)
    .where(eq(reportDefinitionsTable.reportType, cfg.reportType))
    .limit(1);

  let definition = existing[0];
  let createdDefinition = false;
  if (!definition) {
    const [created] = await db
      .insert(reportDefinitionsTable)
      .values({
        module: cfg.module,
        reportType: cfg.reportType,
        name: cfg.name,
        description: cfg.description,
        isSystem: true,
        isActive: true,
      })
      .returning();
    definition = created;
    createdDefinition = true;
  } else {
    await db
      .update(reportDefinitionsTable)
      .set({
        name: cfg.name,
        description: cfg.description,
        module: cfg.module,
        isActive: true,
        updatedAt: new Date(),
      })
      .where(eq(reportDefinitionsTable.id, definition.id));
  }

  const existingFields = await db
    .select()
    .from(reportFieldsTable)
    .where(eq(reportFieldsTable.reportDefinitionId, definition.id));
  const have = new Map(existingFields.map((f) => [f.fieldKey, f]));

  for (const field of fieldsForDocumentType(cfg)) {
    const current = have.get(field.fieldKey);
    if (!current) {
      await db.insert(reportFieldsTable).values({
        reportDefinitionId: definition.id,
        fieldKey: field.fieldKey,
        fieldLabel: field.fieldLabel,
        fieldGroup: field.fieldGroup,
        dataType: field.dataType,
        isRepeatable: field.isRepeatable,
        isActive: true,
      });
      continue;
    }
    if (current.fieldLabel !== field.fieldLabel || current.fieldGroup !== field.fieldGroup) {
      await db
        .update(reportFieldsTable)
        .set({
          fieldLabel: field.fieldLabel,
          fieldGroup: field.fieldGroup,
          isActive: true,
        })
        .where(eq(reportFieldsTable.id, current.id));
    }
  }

  const templateJson = buildDefaultDocumentTemplate({
    reportType: cfg.reportType,
    title: cfg.title,
    partyLabel: cfg.partyLabel,
    footerDocName: cfg.footerDocName,
  });

  const [systemTemplate] = await db
    .select()
    .from(reportTemplatesTable)
    .where(
      and(
        eq(reportTemplatesTable.reportDefinitionId, definition.id),
        eq(reportTemplatesTable.isSystemTemplate, true),
        isNull(reportTemplatesTable.companyId),
      ),
    )
    .limit(1);

  const templateName = `Default ${cfg.name} Template`;
  const templateDescription = `System default ${cfg.name.toLowerCase()} layout matching the BizOne document. Company data is bound at print time.`;

  if (!systemTemplate) {
    if (!createdDefinition) return;
    await db.insert(reportTemplatesTable).values({
      companyId: null,
      reportDefinitionId: definition.id,
      name: templateName,
      description: templateDescription,
      templateJson,
      isSystemTemplate: true,
      isActive: false,
    });
    logger.info(`[reports] seeded ${templateName}`);
  } else {
    await db
      .update(reportTemplatesTable)
      .set({
        name: templateName,
        templateJson,
        description: templateDescription,
        updatedAt: new Date(),
      })
      .where(eq(reportTemplatesTable.id, systemTemplate.id));
  }
}
