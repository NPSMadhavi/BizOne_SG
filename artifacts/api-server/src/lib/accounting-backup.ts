/**
 * Accounting backup create / verify / list helpers.
 * Company-scoped logical snapshots — does not modify accounting transactions.
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import {
  db,
  accountingBackupsTable,
  backupSchedulesTable,
  backupRetentionSettingsTable,
  accountsTable,
  journalEntriesTable,
  journalLinesTable,
  financialYearsTable,
  glOpeningBalancesTable,
  customerOpeningBalancesTable,
  vendorOpeningBalancesTable,
  inventoryOpeningBalancesTable,
  fixedAssetOpeningBalancesTable,
  bankOpeningBalancesTable,
  expensesTable,
  incomeRecordsTable,
} from "@workspace/db";
import { eq, and, desc, sql, gte, lte, inArray } from "drizzle-orm";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const backupsDir = path.join(__dirname, "..", "uploads", "accounting-backups");

export type BackupType = "full_database" | "accounting" | "financial_year";
export type BackupSource = "manual" | "scheduled" | "fy_close" | "safety" | "uploaded";

function ensureDir() {
  if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true });
}

async function nextBackupCode(companyId: number, source: BackupSource = "manual"): Promise<string> {
  const year = new Date().getFullYear();
  const rows = await db
    .select({ id: accountingBackupsTable.id })
    .from(accountingBackupsTable)
    .where(eq(accountingBackupsTable.companyId, companyId));
  const seq = String(rows.length + 1).padStart(4, "0");
  if (source === "safety") return `SAFE-${year}-${seq}`;
  return `BK-${year}-${seq}`;
}

async function collectSnapshot(
  companyId: number,
  backupType: BackupType,
  fromDate?: string | null,
  toDate?: string | null,
) {
  const accounts = await db.select().from(accountsTable).where(eq(accountsTable.companyId, companyId));
  const fyYears = await db.select().from(financialYearsTable).where(eq(financialYearsTable.companyId, companyId));

  let jeQuery = db
    .select()
    .from(journalEntriesTable)
    .where(eq(journalEntriesTable.companyId, companyId));
  const journals = await jeQuery;
  let filteredJournals = journals;
  if (backupType === "financial_year" && fromDate && toDate) {
    filteredJournals = journals.filter((j) => j.entryDate >= fromDate && j.entryDate <= toDate);
  }
  const jeIds = filteredJournals.map((j) => j.id);
  const lines =
    jeIds.length > 0
      ? await db.select().from(journalLinesTable).where(inArray(journalLinesTable.journalEntryId, jeIds))
      : [];

  const expenses = await db.select().from(expensesTable).where(eq(expensesTable.companyId, companyId));
  const income = await db.select().from(incomeRecordsTable).where(eq(incomeRecordsTable.companyId, companyId));

  let filteredExpenses = expenses;
  let filteredIncome = income;
  if (backupType === "financial_year" && fromDate && toDate) {
    filteredExpenses = expenses.filter((e) => e.expenseDate >= fromDate && e.expenseDate <= toDate);
    filteredIncome = income.filter((i) => i.incomeDate >= fromDate && i.incomeDate <= toDate);
  }

  const opening = {
    gl: await db.select().from(glOpeningBalancesTable).where(eq(glOpeningBalancesTable.companyId, companyId)),
    customers: await db
      .select()
      .from(customerOpeningBalancesTable)
      .where(eq(customerOpeningBalancesTable.companyId, companyId)),
    vendors: await db
      .select()
      .from(vendorOpeningBalancesTable)
      .where(eq(vendorOpeningBalancesTable.companyId, companyId)),
    inventory: await db
      .select()
      .from(inventoryOpeningBalancesTable)
      .where(eq(inventoryOpeningBalancesTable.companyId, companyId)),
    fixedAssets: await db
      .select()
      .from(fixedAssetOpeningBalancesTable)
      .where(eq(fixedAssetOpeningBalancesTable.companyId, companyId)),
    bank: await db.select().from(bankOpeningBalancesTable).where(eq(bankOpeningBalancesTable.companyId, companyId)),
  };

  // full_database = company accounting + FY + masters snapshot (logical, company-scoped)
  return {
    format: "bizone-accounting-backup-v1",
    companyId,
    backupType,
    fromDate: fromDate || null,
    toDate: toDate || null,
    exportedAt: new Date().toISOString(),
    data: {
      accounts,
      financialYears: fyYears,
      journalEntries: filteredJournals,
      journalLines: lines,
      expenses: filteredExpenses,
      incomeRecords: filteredIncome,
      openingBalances: opening,
    },
  };
}

export async function createAccountingBackup(opts: {
  companyId: number;
  backupType: BackupType;
  fromDate?: string | null;
  toDate?: string | null;
  financialYearId?: number | null;
  financialYearLabel?: string | null;
  userId?: number | null;
  username?: string | null;
  source?: BackupSource;
  scheduleId?: number | null;
}): Promise<{ ok: true; backup: any } | { ok: false; error: string; backup?: any }> {
  ensureDir();
  const {
    companyId,
    backupType,
    fromDate,
    toDate,
    financialYearId,
    financialYearLabel,
    userId,
    username,
    source = "manual",
    scheduleId,
  } = opts;

  if (backupType === "financial_year" && (!fromDate || !toDate)) {
    return { ok: false, error: "Financial Year Backup requires From and To dates (use Dashboard date range)." };
  }

  const backupCode = await nextBackupCode(companyId, source);
  const [row] = await db
    .insert(accountingBackupsTable)
    .values({
      companyId,
      backupCode,
      backupType,
      fromDate: fromDate || null,
      toDate: toDate || null,
      financialYearId: financialYearId || null,
      financialYearLabel: financialYearLabel || null,
      status: "in_progress",
      backupSource: source,
      scheduleId: scheduleId || null,
      createdBy: userId || null,
      createdByUsername: username || null,
    })
    .returning();

  try {
    const snapshot = await collectSnapshot(companyId, backupType, fromDate, toDate);
    const json = JSON.stringify(snapshot, null, 2);
    const checksum = crypto.createHash("sha256").update(json).digest("hex");
    const filename = `${companyId}_${backupCode}_${Date.now()}.json`;
    const abs = path.join(backupsDir, filename);
    await fs.promises.writeFile(abs, json, "utf8");

    // Verify: file exists + readable + checksum matches
    const readBack = await fs.promises.readFile(abs, "utf8");
    const verifyHash = crypto.createHash("sha256").update(readBack).digest("hex");
    if (verifyHash !== checksum) {
      throw new Error("Backup verification failed: checksum mismatch");
    }
    JSON.parse(readBack); // ensure readable JSON

    const stat = await fs.promises.stat(abs);
    const storagePath = path.posix.join("uploads", "accounting-backups", filename);

    const [completed] = await db
      .update(accountingBackupsTable)
      .set({
        status: "completed",
        storagePath,
        storageRef: filename,
        fileSizeBytes: stat.size,
        checksumSha256: checksum,
        completedAt: new Date(),
        errorMessage: null,
      })
      .where(eq(accountingBackupsTable.id, row.id))
      .returning();

    return { ok: true, backup: completed };
  } catch (err: any) {
    const [failed] = await db
      .update(accountingBackupsTable)
      .set({
        status: "failed",
        errorMessage: err?.message || String(err),
        completedAt: new Date(),
      })
      .where(eq(accountingBackupsTable.id, row.id))
      .returning();
    return { ok: false, error: err?.message || "Backup failed", backup: failed };
  }
}

export async function hasSuccessfulPeriodBackup(
  companyId: number,
  fromDate: string,
  toDate: string,
): Promise<boolean> {
  const rows = await db
    .select()
    .from(accountingBackupsTable)
    .where(
      and(
        eq(accountingBackupsTable.companyId, companyId),
        eq(accountingBackupsTable.status, "completed"),
      ),
    )
    .orderBy(desc(accountingBackupsTable.createdAt))
    .limit(50);

  return rows.some((b) => {
    if (b.backupType === "full_database" || b.backupType === "accounting") {
      // Any recent completed accounting/full backup counts for FY close gate
      return true;
    }
    if (b.backupType === "financial_year") {
      return b.fromDate === fromDate && b.toDate === toDate;
    }
    return false;
  });
}

/** Stricter: FY close requires a completed backup covering this FY dates (or full/accounting). */
export async function hasMandatoryCloseBackup(
  companyId: number,
  fromDate: string,
  toDate: string,
): Promise<{ ok: boolean; backupId?: number; backupCode?: string }> {
  const rows = await db
    .select()
    .from(accountingBackupsTable)
    .where(
      and(
        eq(accountingBackupsTable.companyId, companyId),
        eq(accountingBackupsTable.status, "completed"),
      ),
    )
    .orderBy(desc(accountingBackupsTable.createdAt))
    .limit(100);

  const match = rows.find((b) => {
    if (b.backupSource === "fy_close" || b.backupType === "financial_year") {
      return (!b.fromDate || b.fromDate === fromDate) && (!b.toDate || b.toDate === toDate);
    }
    if (b.backupType === "accounting" || b.backupType === "full_database") {
      // Must be created after we consider "for this close" — accept any completed within last 7 days
      const age = Date.now() - new Date(b.createdAt).getTime();
      return age < 7 * 24 * 60 * 60 * 1000;
    }
    return false;
  });

  if (!match) return { ok: false };
  return { ok: true, backupId: match.id, backupCode: match.backupCode };
}

export async function getBackupAbsolutePath(storagePath: string | null | undefined): Promise<string | null> {
  if (!storagePath) return null;
  const abs = path.join(__dirname, "..", storagePath.replace(/^\//, ""));
  if (!fs.existsSync(abs)) {
    // fallback: filename only under backupsDir
    const alt = path.join(backupsDir, path.basename(storagePath));
    return fs.existsSync(alt) ? alt : null;
  }
  return abs;
}

export async function ensureRetentionSettings(companyId: number) {
  const [existing] = await db
    .select()
    .from(backupRetentionSettingsTable)
    .where(eq(backupRetentionSettingsTable.companyId, companyId))
    .limit(1);
  if (existing) return existing;
  const [created] = await db
    .insert(backupRetentionSettingsTable)
    .values({ companyId })
    .returning();
  return created;
}

export async function applyRetentionPolicy(companyId: number) {
  const settings = await ensureRetentionSettings(companyId);
  const rows = await db
    .select()
    .from(accountingBackupsTable)
    .where(
      and(eq(accountingBackupsTable.companyId, companyId), eq(accountingBackupsTable.status, "completed")),
    )
    .orderBy(desc(accountingBackupsTable.createdAt));

  const now = Date.now();
  for (const b of rows) {
    if (b.backupType === "financial_year" && settings.financialYearKeepForever) continue;
    const ageMs = now - new Date(b.createdAt).getTime();
    let maxAge = settings.dailyKeepDays * 86400000;
    if (b.backupSource === "scheduled") {
      // use daily window as default for scheduled unless tagged otherwise — schedules store frequency separately
      maxAge = settings.dailyKeepDays * 86400000;
    }
    if (ageMs > maxAge && b.backupType !== "financial_year") {
      const abs = await getBackupAbsolutePath(b.storagePath);
      if (abs) {
        try {
          await fs.promises.unlink(abs);
        } catch {
          /* ignore */
        }
      }
      await db.delete(accountingBackupsTable).where(eq(accountingBackupsTable.id, b.id));
    }
  }
}

export function computeNextRunAt(frequency: string, timeOfDay: string, dayOfWeek: number | null): Date {
  const [hh, mm] = timeOfDay.split(":").map((x) => parseInt(x, 10) || 0);
  const now = new Date();
  const next = new Date(now);
  next.setSeconds(0, 0);
  next.setHours(hh, mm, 0, 0);

  if (frequency === "daily") {
    if (next <= now) next.setDate(next.getDate() + 1);
    return next;
  }
  if (frequency === "weekly") {
    const target = dayOfWeek == null ? 0 : dayOfWeek;
    for (let i = 0; i < 8; i++) {
      const d = new Date(next);
      d.setDate(next.getDate() + i);
      d.setHours(hh, mm, 0, 0);
      if (d.getDay() === target && d > now) return d;
    }
    next.setDate(next.getDate() + 7);
    return next;
  }
  // monthly — last day of month at time
  const y = now.getFullYear();
  const m = now.getMonth();
  let last = new Date(y, m + 1, 0, hh, mm, 0, 0);
  if (last <= now) last = new Date(y, m + 2, 0, hh, mm, 0, 0);
  return last;
}

export async function runDueSchedules(): Promise<number> {
  const schedules = await db
    .select()
    .from(backupSchedulesTable)
    .where(eq(backupSchedulesTable.enabled, true));

  let ran = 0;
  const now = new Date();
  for (const s of schedules) {
    if (!s.nextRunAt || s.nextRunAt > now) continue;
    const result = await createAccountingBackup({
      companyId: s.companyId,
      backupType: (s.backupType as BackupType) || "accounting",
      source: "scheduled",
      scheduleId: s.id,
      username: "system-scheduler",
    });
    const next = computeNextRunAt(s.frequency, s.timeOfDay, s.dayOfWeek);
    await db
      .update(backupSchedulesTable)
      .set({ lastRunAt: now, nextRunAt: next, updatedAt: now })
      .where(eq(backupSchedulesTable.id, s.id));
    if (result.ok) {
      ran++;
      await applyRetentionPolicy(s.companyId);
    }
  }
  return ran;
}

export function startBackupScheduler() {
  // Check every 60s for due schedules — independent of FY closing
  setInterval(() => {
    runDueSchedules().catch(() => {});
  }, 60_000);
}
