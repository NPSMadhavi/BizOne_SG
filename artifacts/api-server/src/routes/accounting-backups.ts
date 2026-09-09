import { Router, type IRouter } from "express";
import fs from "fs";
import multer from "multer";
import {
  db,
  accountingBackupsTable,
  accountingRestoreOperationsTable,
  backupSchedulesTable,
  backupRetentionSettingsTable,
  companiesTable,
  financialYearsTable,
} from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { logAudit } from "../lib/audit.js";
import { isSingaporeCountry } from "../lib/singapore.js";
import {
  createAccountingBackup,
  getBackupAbsolutePath,
  ensureRetentionSettings,
  applyRetentionPolicy,
  computeNextRunAt,
  type BackupType,
} from "../lib/accounting-backup.js";
import {
  executeAccountingRestore,
  importUploadedBackup,
  validateBackupForRestore,
} from "../lib/accounting-restore.js";

const router: IRouter = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 80 * 1024 * 1024 },
});

function requireAuth(req: any, res: any): boolean {
  if (!req.session.userId) {
    res.status(401).json({ error: "Not authenticated" });
    return false;
  }
  return true;
}

function requireCompany(req: any, res: any): boolean {
  if (!req.session.companyId) {
    res.status(400).json({ error: "No company selected" });
    return false;
  }
  return true;
}

async function requireSingapore(req: any, res: any): Promise<boolean> {
  const [company] = await db
    .select()
    .from(companiesTable)
    .where(eq(companiesTable.id, req.session.companyId!))
    .limit(1);
  if (!company || !isSingaporeCountry(company.country)) {
    res.status(403).json({ error: "Accounting backups are only available for Singapore companies." });
    return false;
  }
  return true;
}

function canBackup(req: any): boolean {
  return !!(
    req.session.isAdmin ||
    req.session.userRole === "accountant" ||
    req.session.userRole === "Administrator" ||
    req.session.userRole === "admin"
  );
}

/** Highest privilege — restore / delete / upload */
function canRestore(req: any): boolean {
  return !!req.session.isAdmin;
}

// GET /accounting-backups
router.get("/accounting-backups", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  if (!(await requireSingapore(req, res))) return;
  const companyId = req.session.companyId!;
  const rows = await db
    .select()
    .from(accountingBackupsTable)
    .where(eq(accountingBackupsTable.companyId, companyId))
    .orderBy(desc(accountingBackupsTable.createdAt));
  res.json({ backups: rows });
});

// POST /accounting-backups/upload — register external backup file (before :id routes)
router.post("/accounting-backups/upload", upload.single("file"), async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  if (!(await requireSingapore(req, res))) return;
  if (!canRestore(req)) {
    res.status(403).json({ error: "Only administrators can upload backups" });
    return;
  }
  const file = (req as any).file as Express.Multer.File | undefined;
  if (!file?.buffer) {
    res.status(400).json({ error: "No backup file uploaded" });
    return;
  }
  const result = await importUploadedBackup({
    companyId: req.session.companyId!,
    userId: req.session.userId!,
    username: req.session.username || "admin",
    fileBuffer: file.buffer,
  });
  if (!result.ok) {
    logAudit({
      req,
      action: "backup_upload_failed",
      entityType: "accounting_backup",
      details: { error: result.error },
    });
    res.status(400).json({ error: result.error });
    return;
  }
  logAudit({
    req,
    action: "backup_uploaded",
    entityType: "accounting_backup",
    entityId: result.backup.id,
    entityLabel: result.backup.backupCode,
    details: result.meta,
  });
  res.status(201).json({
    message: "Backup uploaded and validated. Review details, then use Restore when ready.",
    backup: result.backup,
    meta: result.meta,
  });
});

// GET /accounting-backups/:id
router.get("/accounting-backups/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  if (!(await requireSingapore(req, res))) return;
  const id = Number(req.params.id);
  const [row] = await db
    .select()
    .from(accountingBackupsTable)
    .where(and(eq(accountingBackupsTable.id, id), eq(accountingBackupsTable.companyId, req.session.companyId!)))
    .limit(1);
  if (!row) {
    res.status(404).json({ error: "Backup not found" });
    return;
  }
  res.json(row);
});

// POST /accounting-backups/:id/validate — pre-flight validation (admin)
router.post("/accounting-backups/:id/validate", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  if (!(await requireSingapore(req, res))) return;
  if (!canRestore(req)) {
    res.status(403).json({ error: "Only administrators can validate backups for restore" });
    return;
  }
  const result = await validateBackupForRestore({
    companyId: req.session.companyId!,
    backupId: Number(req.params.id),
  });
  if (!result.ok) {
    res.status(400).json({ error: result.error, valid: false });
    return;
  }
  res.json({
    valid: true,
    backup: result.backup,
    summary: {
      accounts: result.snapshot.data.accounts.length,
      financialYears: result.snapshot.data.financialYears.length,
      journalEntries: result.snapshot.data.journalEntries.length,
      expenses: result.snapshot.data.expenses.length,
      incomeRecords: result.snapshot.data.incomeRecords.length,
      format: result.snapshot.format,
    },
  });
});

// POST /accounting-backups  { backupType, fromDate?, toDate?, financialYearId? }
router.post("/accounting-backups", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  if (!(await requireSingapore(req, res))) return;
  if (!canBackup(req)) {
    res.status(403).json({ error: "Only admin/accountant can create backups" });
    return;
  }

  const companyId = req.session.companyId!;
  const backupType = (req.body?.backupType || "accounting") as BackupType;
  if (!["full_database", "accounting", "financial_year"].includes(backupType)) {
    res.status(400).json({ error: "Invalid backup type" });
    return;
  }

  let fromDate = req.body?.fromDate || null;
  let toDate = req.body?.toDate || null;
  let financialYearId = req.body?.financialYearId ? Number(req.body.financialYearId) : null;
  let financialYearLabel = req.body?.financialYearLabel || null;
  const source = req.body?.source === "fy_close" ? "fy_close" : "manual";

  if (financialYearId) {
    const [fy] = await db
      .select()
      .from(financialYearsTable)
      .where(and(eq(financialYearsTable.id, financialYearId), eq(financialYearsTable.companyId, companyId)))
      .limit(1);
    if (fy) {
      fromDate = fromDate || fy.startDate;
      toDate = toDate || fy.endDate;
      financialYearLabel = financialYearLabel || fy.label;
    }
  }

  logAudit({
    req,
    action: "backup_started",
    entityType: "accounting_backup",
    entityLabel: backupType,
    details: { backupType, fromDate, toDate, source },
  });

  const result = await createAccountingBackup({
    companyId,
    backupType,
    fromDate,
    toDate,
    financialYearId,
    financialYearLabel,
    userId: req.session.userId,
    username: req.session.username,
    source: source as any,
  });

  if (!result.ok) {
    logAudit({
      req,
      action: "backup_failed",
      entityType: "accounting_backup",
      entityId: result.backup?.id,
      entityLabel: result.backup?.backupCode,
      details: { error: result.error },
    });
    res.status(500).json({
      error: result.error,
      backup: result.backup,
    });
    return;
  }

  logAudit({
    req,
    action: "backup_completed",
    entityType: "accounting_backup",
    entityId: result.backup.id,
    entityLabel: result.backup.backupCode,
    details: {
      backupType,
      size: result.backup.fileSizeBytes,
      checksum: result.backup.checksumSha256,
    },
  });

  res.status(201).json({
    message: "Backup completed successfully",
    backup: result.backup,
  });
});

// GET /accounting-backups/:id/download
router.get("/accounting-backups/:id/download", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  if (!(await requireSingapore(req, res))) return;
  if (!canBackup(req)) {
    res.status(403).json({ error: "Not authorized to download backups" });
    return;
  }
  const id = Number(req.params.id);
  const [row] = await db
    .select()
    .from(accountingBackupsTable)
    .where(and(eq(accountingBackupsTable.id, id), eq(accountingBackupsTable.companyId, req.session.companyId!)))
    .limit(1);
  if (!row || (row.status !== "completed" && row.status !== "restored")) {
    res.status(404).json({ error: "Completed backup not found" });
    return;
  }
  const abs = await getBackupAbsolutePath(row.storagePath);
  if (!abs) {
    res.status(404).json({ error: "Backup file missing on disk" });
    return;
  }
  logAudit({
    req,
    action: "backup_downloaded",
    entityType: "accounting_backup",
    entityId: row.id,
    entityLabel: row.backupCode,
  });
  res.download(abs, `${row.backupCode}.json`);
});

// POST /accounting-backups/:id/restore — secure restore pipeline (admin only)
router.post("/accounting-backups/:id/restore", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  if (!(await requireSingapore(req, res))) return;
  if (!canRestore(req)) {
    res.status(403).json({ error: "Only administrators can restore backups" });
    return;
  }
  if (!req.body?.confirm) {
    res.status(400).json({
      error:
        "This action will restore the selected backup and may replace current accounting data. Pass confirm: true after explicit confirmation.",
    });
    return;
  }

  const companyId = req.session.companyId!;
  const id = Number(req.params.id);

  logAudit({
    req,
    action: "backup_restore_started",
    entityType: "accounting_restore",
    entityId: id,
    details: { backupId: id, confirmPhrase: !!req.body?.confirmPhrase },
  });

  const result = await executeAccountingRestore({
    companyId,
    backupId: id,
    userId: req.session.userId!,
    username: req.session.username || "admin",
    confirm: true,
    confirmPhrase: req.body?.confirmPhrase,
  });

  const steps = result.operation?.stepsJson
    ? (() => {
        try {
          return JSON.parse(result.operation.stepsJson);
        } catch {
          return [];
        }
      })()
    : [];

  if (!result.ok) {
    logAudit({
      req,
      action: "backup_restore_failed",
      entityType: "accounting_restore",
      entityId: result.operation?.id,
      entityLabel: result.operation?.restoreCode,
      details: {
        backupId: id,
        status: result.operation?.status,
        safetyBackupId: result.operation?.safetyBackupId,
        safetyBackupCode: result.operation?.safetyBackupCode,
        error: result.error,
        steps,
      },
    });
    res.status(result.operation?.status === "ROLLED_BACK" ? 409 : 500).json({
      error: result.error,
      operation: result.operation,
      steps,
    });
    return;
  }

  logAudit({
    req,
    action: "backup_restored",
    entityType: "accounting_restore",
    entityId: result.operation.id,
    entityLabel: result.operation.restoreCode,
    details: {
      restoreId: result.operation.restoreCode,
      backupId: id,
      backupCode: result.operation.backupCode,
      safetyBackupId: result.operation.safetyBackupId,
      safetyBackupCode: result.operation.safetyBackupCode,
      restoreType: result.operation.restoreType,
      result: result.operation.status,
      startedAt: result.operation.startedAt,
      completedAt: result.operation.completedAt,
      steps,
    },
  });

  res.json({
    message: "RESTORE COMPLETED",
    operation: result.operation,
    steps,
  });
});

// GET /accounting-restore-operations — restore history
router.get("/accounting-restore-operations", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  if (!(await requireSingapore(req, res))) return;
  if (!canRestore(req)) {
    res.status(403).json({ error: "Only administrators can view restore operations" });
    return;
  }
  const rows = await db
    .select()
    .from(accountingRestoreOperationsTable)
    .where(eq(accountingRestoreOperationsTable.companyId, req.session.companyId!))
    .orderBy(desc(accountingRestoreOperationsTable.startedAt))
    .limit(50);
  res.json({
    operations: rows.map((r) => ({
      ...r,
      steps: (() => {
        try {
          return r.stepsJson ? JSON.parse(r.stepsJson) : [];
        } catch {
          return [];
        }
      })(),
    })),
  });
});

// GET /accounting-restore-operations/:id
router.get("/accounting-restore-operations/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  if (!(await requireSingapore(req, res))) return;
  if (!canRestore(req)) {
    res.status(403).json({ error: "Only administrators can view restore operations" });
    return;
  }
  const [row] = await db
    .select()
    .from(accountingRestoreOperationsTable)
    .where(
      and(
        eq(accountingRestoreOperationsTable.id, Number(req.params.id)),
        eq(accountingRestoreOperationsTable.companyId, req.session.companyId!),
      ),
    )
    .limit(1);
  if (!row) {
    res.status(404).json({ error: "Restore operation not found" });
    return;
  }
  let steps: any[] = [];
  try {
    steps = row.stepsJson ? JSON.parse(row.stepsJson) : [];
  } catch {
    steps = [];
  }
  res.json({ ...row, steps });
});

// DELETE /accounting-backups/:id
router.delete("/accounting-backups/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  if (!(await requireSingapore(req, res))) return;
  if (!canRestore(req)) {
    res.status(403).json({ error: "Only administrators can delete backups" });
    return;
  }
  const id = Number(req.params.id);
  const [row] = await db
    .select()
    .from(accountingBackupsTable)
    .where(and(eq(accountingBackupsTable.id, id), eq(accountingBackupsTable.companyId, req.session.companyId!)))
    .limit(1);
  if (!row) {
    res.status(404).json({ error: "Backup not found" });
    return;
  }
  if (row.backupType === "financial_year") {
    const settings = await ensureRetentionSettings(req.session.companyId!);
    if (settings.financialYearKeepForever && String(req.query.force) !== "true") {
      res.status(400).json({
        error: "Financial year backups are retained permanently. Pass force=true to override.",
      });
      return;
    }
  }
  const abs = await getBackupAbsolutePath(row.storagePath);
  if (abs) {
    try {
      await fs.promises.unlink(abs);
    } catch {
      /* ignore */
    }
  }
  await db.delete(accountingBackupsTable).where(eq(accountingBackupsTable.id, id));
  logAudit({
    req,
    action: "backup_deleted",
    entityType: "accounting_backup",
    entityId: id,
    entityLabel: row.backupCode,
  });
  res.json({ success: true });
});

// ── Schedules ───────────────────────────────────────────────────────────────

router.get("/accounting-backup-schedules", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  if (!(await requireSingapore(req, res))) return;
  const rows = await db
    .select()
    .from(backupSchedulesTable)
    .where(eq(backupSchedulesTable.companyId, req.session.companyId!));
  res.json({ schedules: rows });
});

router.post("/accounting-backup-schedules", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  if (!(await requireSingapore(req, res))) return;
  if (!req.session.isAdmin) {
    res.status(403).json({ error: "Only administrators can configure backup schedules" });
    return;
  }
  const { frequency, timeOfDay, dayOfWeek, backupType, enabled } = req.body || {};
  if (!["daily", "weekly", "monthly"].includes(frequency)) {
    res.status(400).json({ error: "frequency must be daily, weekly, or monthly" });
    return;
  }
  const tod = timeOfDay || "23:00";
  const nextRunAt = computeNextRunAt(frequency, tod, dayOfWeek ?? 0);
  const [created] = await db
    .insert(backupSchedulesTable)
    .values({
      companyId: req.session.companyId!,
      enabled: enabled !== false,
      frequency,
      timeOfDay: tod,
      dayOfWeek: frequency === "weekly" ? (dayOfWeek ?? 0) : null,
      backupType: backupType || "accounting",
      nextRunAt,
      createdBy: req.session.userId,
    })
    .returning();
  logAudit({
    req,
    action: "backup_schedule_created",
    entityType: "backup_schedule",
    entityId: created.id,
    details: { frequency, timeOfDay: tod },
  });
  res.status(201).json(created);
});

router.put("/accounting-backup-schedules/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  if (!(await requireSingapore(req, res))) return;
  if (!req.session.isAdmin) {
    res.status(403).json({ error: "Only administrators can modify backup schedules" });
    return;
  }
  const id = Number(req.params.id);
  const [existing] = await db
    .select()
    .from(backupSchedulesTable)
    .where(and(eq(backupSchedulesTable.id, id), eq(backupSchedulesTable.companyId, req.session.companyId!)))
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "Schedule not found" });
    return;
  }
  const frequency = req.body.frequency ?? existing.frequency;
  const timeOfDay = req.body.timeOfDay ?? existing.timeOfDay;
  const dayOfWeek = req.body.dayOfWeek !== undefined ? req.body.dayOfWeek : existing.dayOfWeek;
  const enabled = req.body.enabled !== undefined ? !!req.body.enabled : existing.enabled;
  const nextRunAt = computeNextRunAt(frequency, timeOfDay, dayOfWeek);
  const [updated] = await db
    .update(backupSchedulesTable)
    .set({
      frequency,
      timeOfDay,
      dayOfWeek,
      enabled,
      backupType: req.body.backupType ?? existing.backupType,
      nextRunAt,
      updatedAt: new Date(),
    })
    .where(eq(backupSchedulesTable.id, id))
    .returning();
  logAudit({
    req,
    action: enabled ? "backup_schedule_modified" : "backup_schedule_disabled",
    entityType: "backup_schedule",
    entityId: id,
    details: { frequency, timeOfDay, enabled },
  });
  res.json(updated);
});

// Retention
router.get("/accounting-backup-retention", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  if (!(await requireSingapore(req, res))) return;
  const settings = await ensureRetentionSettings(req.session.companyId!);
  res.json(settings);
});

router.put("/accounting-backup-retention", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  if (!(await requireSingapore(req, res))) return;
  if (!req.session.isAdmin) {
    res.status(403).json({ error: "Only administrators can update retention policy" });
    return;
  }
  await ensureRetentionSettings(req.session.companyId!);
  const [updated] = await db
    .update(backupRetentionSettingsTable)
    .set({
      dailyKeepDays: req.body.dailyKeepDays ?? 30,
      weeklyKeepWeeks: req.body.weeklyKeepWeeks ?? 12,
      monthlyKeepMonths: req.body.monthlyKeepMonths ?? 12,
      financialYearKeepForever: req.body.financialYearKeepForever !== false,
      updatedBy: req.session.userId,
      updatedAt: new Date(),
    })
    .where(eq(backupRetentionSettingsTable.companyId, req.session.companyId!))
    .returning();
  await applyRetentionPolicy(req.session.companyId!);
  res.json(updated);
});

export default router;
