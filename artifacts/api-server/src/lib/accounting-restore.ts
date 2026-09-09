/**
 * Secure accounting restore pipeline.
 *
 * Flow: validate → safety backup → restore → verify → audit
 * Never overwrites live data without a verified safety backup.
 * On failure after data changes, rolls back from the safety backup.
 */
import fs from "fs";
import crypto from "crypto";
import {
  db,
  accountingBackupsTable,
  accountingRestoreOperationsTable,
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
  companiesTable,
} from "@workspace/db";
import { eq, and, inArray, sql } from "drizzle-orm";
import {
  createAccountingBackup,
  getBackupAbsolutePath,
  type BackupType,
} from "./accounting-backup.js";

export type RestoreStatus =
  | "PENDING"
  | "VALIDATING"
  | "SAFETY_BACKUP"
  | "RESTORING"
  | "VERIFYING"
  | "COMPLETED"
  | "FAILED"
  | "ROLLED_BACK";

type RestoreStep = { key: string; label: string; done: boolean; error?: string };

const SUPPORTED_FORMAT = "bizone-accounting-backup-v1";

function toDate(v: unknown): Date | null {
  if (v == null) return null;
  if (v instanceof Date) return v;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

function stripMeta(row: Record<string, any>): Record<string, any> {
  const out = { ...row };
  for (const k of Object.keys(out)) {
    if (out[k] != null && typeof out[k] === "string" && /^\d{4}-\d{2}-\d{2}T/.test(out[k])) {
      const d = toDate(out[k]);
      if (d) out[k] = d;
    }
  }
  return out;
}

async function nextRestoreCode(companyId: number): Promise<string> {
  const year = new Date().getFullYear();
  const rows = await db
    .select({ id: accountingRestoreOperationsTable.id })
    .from(accountingRestoreOperationsTable)
    .where(eq(accountingRestoreOperationsTable.companyId, companyId));
  const seq = String(rows.length + 1).padStart(4, "0");
  return `RST-${year}-${seq}`;
}

async function updateOp(
  id: number,
  patch: Partial<{
    status: RestoreStatus;
    safetyBackupId: number | null;
    safetyBackupCode: string | null;
    stepsJson: string;
    resultMessage: string | null;
    errorDetails: string | null;
    completedAt: Date | null;
  }>,
) {
  const [row] = await db
    .update(accountingRestoreOperationsTable)
    .set(patch as any)
    .where(eq(accountingRestoreOperationsTable.id, id))
    .returning();
  return row;
}

function initialSteps(): RestoreStep[] {
  return [
    { key: "validated", label: "Backup validated", done: false },
    { key: "safety", label: "Safety backup created", done: false },
    { key: "restored", label: "Database restore completed", done: false },
    { key: "verified", label: "Data validation completed", done: false },
  ];
}

export type ValidatedSnapshot = {
  format: string;
  companyId: number;
  backupType: BackupType;
  fromDate: string | null;
  toDate: string | null;
  data: {
    accounts: any[];
    financialYears: any[];
    journalEntries: any[];
    journalLines: any[];
    expenses: any[];
    incomeRecords: any[];
    openingBalances: {
      gl: any[];
      customers: any[];
      vendors: any[];
      inventory: any[];
      fixedAssets: any[];
      bank: any[];
    };
  };
};

/** Validate backup row + file for restore (does not mutate DB). */
export async function validateBackupForRestore(opts: {
  companyId: number;
  backupId: number;
}): Promise<
  | { ok: true; backup: any; snapshot: ValidatedSnapshot; absPath: string }
  | { ok: false; error: string }
> {
  const [backup] = await db
    .select()
    .from(accountingBackupsTable)
    .where(
      and(
        eq(accountingBackupsTable.id, opts.backupId),
        eq(accountingBackupsTable.companyId, opts.companyId),
      ),
    )
    .limit(1);

  if (!backup) {
    return { ok: false, error: "Backup validation failed. The selected backup cannot be restored." };
  }
  if (backup.status !== "completed" && backup.status !== "restored") {
    return {
      ok: false,
      error: "Backup validation failed. Only COMPLETED backups can be restored.",
    };
  }
  if (backup.companyId !== opts.companyId) {
    return { ok: false, error: "Backup validation failed. The selected backup cannot be restored." };
  }

  const abs = await getBackupAbsolutePath(backup.storagePath);
  if (!abs || !fs.existsSync(abs)) {
    return {
      ok: false,
      error: "Backup validation failed. The selected backup cannot be restored. (file missing)",
    };
  }

  let raw: string;
  try {
    raw = await fs.promises.readFile(abs, "utf8");
  } catch {
    return {
      ok: false,
      error: "Backup validation failed. The selected backup cannot be restored. (unreadable)",
    };
  }

  if (backup.checksumSha256) {
    const hash = crypto.createHash("sha256").update(raw).digest("hex");
    if (hash !== backup.checksumSha256) {
      return {
        ok: false,
        error: "Backup validation failed. The selected backup cannot be restored. (checksum mismatch)",
      };
    }
  }

  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      ok: false,
      error: "Backup validation failed. The selected backup cannot be restored. (corrupt JSON)",
    };
  }

  if (parsed?.format !== SUPPORTED_FORMAT) {
    return {
      ok: false,
      error: "Backup validation failed. Unsupported backup format/version.",
    };
  }
  if (Number(parsed.companyId) !== opts.companyId) {
    return {
      ok: false,
      error: "Backup validation failed. Backup belongs to a different company/tenant.",
    };
  }
  if (!parsed.data || typeof parsed.data !== "object") {
    return {
      ok: false,
      error: "Backup validation failed. Required database structure is incompatible.",
    };
  }

  const snapshot: ValidatedSnapshot = {
    format: parsed.format,
    companyId: Number(parsed.companyId),
    backupType: (parsed.backupType || backup.backupType) as BackupType,
    fromDate: parsed.fromDate ?? backup.fromDate ?? null,
    toDate: parsed.toDate ?? backup.toDate ?? null,
    data: {
      accounts: parsed.data.accounts || [],
      financialYears: parsed.data.financialYears || [],
      journalEntries: parsed.data.journalEntries || [],
      journalLines: parsed.data.journalLines || [],
      expenses: parsed.data.expenses || [],
      incomeRecords: parsed.data.incomeRecords || [],
      openingBalances: {
        gl: parsed.data.openingBalances?.gl || [],
        customers: parsed.data.openingBalances?.customers || [],
        vendors: parsed.data.openingBalances?.vendors || [],
        inventory: parsed.data.openingBalances?.inventory || [],
        fixedAssets: parsed.data.openingBalances?.fixedAssets || [],
        bank: parsed.data.openingBalances?.bank || [],
      },
    },
  };

  return { ok: true, backup, snapshot, absPath: abs };
}

async function applySnapshotToCompany(companyId: number, snapshot: ValidatedSnapshot): Promise<void> {
  const data = snapshot.data;

  const forceCompany = (rows: Record<string, any>[]): Record<string, any>[] =>
    rows.map((r) => ({ ...stripMeta(r), companyId }));

  await db.transaction(async (tx) => {
    const jeIds = (
      await tx
        .select({ id: journalEntriesTable.id })
        .from(journalEntriesTable)
        .where(eq(journalEntriesTable.companyId, companyId))
    ).map((r) => r.id);

    if (jeIds.length > 0) {
      await tx.delete(journalLinesTable).where(inArray(journalLinesTable.journalEntryId, jeIds));
    }
    await tx.delete(journalEntriesTable).where(eq(journalEntriesTable.companyId, companyId));
    await tx.delete(expensesTable).where(eq(expensesTable.companyId, companyId));
    await tx.delete(incomeRecordsTable).where(eq(incomeRecordsTable.companyId, companyId));

    await tx.delete(glOpeningBalancesTable).where(eq(glOpeningBalancesTable.companyId, companyId));
    await tx
      .delete(customerOpeningBalancesTable)
      .where(eq(customerOpeningBalancesTable.companyId, companyId));
    await tx.delete(vendorOpeningBalancesTable).where(eq(vendorOpeningBalancesTable.companyId, companyId));
    await tx
      .delete(inventoryOpeningBalancesTable)
      .where(eq(inventoryOpeningBalancesTable.companyId, companyId));
    await tx
      .delete(fixedAssetOpeningBalancesTable)
      .where(eq(fixedAssetOpeningBalancesTable.companyId, companyId));
    await tx.delete(bankOpeningBalancesTable).where(eq(bankOpeningBalancesTable.companyId, companyId));
    await tx.delete(financialYearsTable).where(eq(financialYearsTable.companyId, companyId));

    const existingAccounts = await tx
      .select()
      .from(accountsTable)
      .where(eq(accountsTable.companyId, companyId));
    const existingById = new Map(existingAccounts.map((a) => [a.id, a]));

    for (const raw of forceCompany(data.accounts)) {
      const row = {
        id: raw.id,
        companyId,
        code: raw.code,
        name: raw.name,
        type: raw.type,
        subType: raw.subType,
        description: raw.description ?? null,
        isActive: raw.isActive !== false,
        isSystem: !!raw.isSystem,
        createdAt: toDate(raw.createdAt) || new Date(),
      };
      if (existingById.has(row.id)) {
        await tx
          .update(accountsTable)
          .set({
            code: row.code,
            name: row.name,
            type: row.type,
            subType: row.subType,
            description: row.description,
            isActive: row.isActive,
            isSystem: row.isSystem,
          })
          .where(and(eq(accountsTable.id, row.id), eq(accountsTable.companyId, companyId)));
      } else {
        await tx.insert(accountsTable).values(row);
      }
    }

    if (data.financialYears.length > 0) {
      await tx.insert(financialYearsTable).values(
        forceCompany(data.financialYears).map((r) => ({
          id: r.id,
          companyId,
          label: r.label,
          startDate: r.startDate,
          endDate: r.endDate,
          status: r.status || "inactive",
          auditStatus: r.auditStatus || "pending",
          closedAt: toDate(r.closedAt),
          closedBy: r.closedBy ?? null,
          closedByUsername: r.closedByUsername ?? null,
          activatedAt: toDate(r.activatedAt),
          activatedBy: r.activatedBy ?? null,
          activatedByUsername: r.activatedByUsername ?? null,
          reopenedAt: toDate(r.reopenedAt),
          reopenedBy: r.reopenedBy ?? null,
          openingBalancesGenerated: !!r.openingBalancesGenerated,
          openingJournalEntryId: r.openingJournalEntryId ?? null,
          createdAt: toDate(r.createdAt) || new Date(),
        })),
      );
    }

    const insertChunk = async (table: any, rows: any[]) => {
      if (!rows.length) return;
      const chunkSize = 200;
      for (let i = 0; i < rows.length; i += chunkSize) {
        await tx.insert(table).values(rows.slice(i, i + chunkSize));
      }
    };

    await insertChunk(
      glOpeningBalancesTable,
      forceCompany(data.openingBalances.gl).map((r) => ({
        id: r.id,
        companyId,
        financialYearId: r.financialYearId,
        accountId: r.accountId ?? null,
        accountCode: r.accountCode,
        accountName: r.accountName,
        accountType: r.accountType ?? null,
        debit: String(r.debit ?? "0"),
        credit: String(r.credit ?? "0"),
        notes: r.notes ?? null,
        createdAt: toDate(r.createdAt) || new Date(),
      })),
    );
    await insertChunk(
      customerOpeningBalancesTable,
      forceCompany(data.openingBalances.customers).map((r) => ({
        id: r.id,
        companyId,
        financialYearId: r.financialYearId,
        customerId: r.customerId ?? null,
        customerName: r.customerName,
        amount: String(r.amount ?? "0"),
        currency: r.currency || "SGD",
        createdAt: toDate(r.createdAt) || new Date(),
      })),
    );
    await insertChunk(
      vendorOpeningBalancesTable,
      forceCompany(data.openingBalances.vendors).map((r) => ({
        id: r.id,
        companyId,
        financialYearId: r.financialYearId,
        vendorId: r.vendorId ?? null,
        vendorName: r.vendorName,
        amount: String(r.amount ?? "0"),
        currency: r.currency || "SGD",
        createdAt: toDate(r.createdAt) || new Date(),
      })),
    );
    await insertChunk(
      inventoryOpeningBalancesTable,
      forceCompany(data.openingBalances.inventory).map((r) => ({
        id: r.id,
        companyId,
        financialYearId: r.financialYearId,
        stockItemId: r.stockItemId ?? null,
        itemCode: r.itemCode ?? null,
        itemName: r.itemName,
        warehouseId: r.warehouseId ?? null,
        warehouseName: r.warehouseName ?? null,
        quantity: String(r.quantity ?? "0"),
        value: String(r.value ?? "0"),
        createdAt: toDate(r.createdAt) || new Date(),
      })),
    );
    await insertChunk(
      fixedAssetOpeningBalancesTable,
      forceCompany(data.openingBalances.fixedAssets).map((r) => ({
        id: r.id,
        companyId,
        financialYearId: r.financialYearId,
        accountCode: r.accountCode ?? null,
        description: r.description,
        amount: String(r.amount ?? "0"),
        createdAt: toDate(r.createdAt) || new Date(),
      })),
    );
    await insertChunk(
      bankOpeningBalancesTable,
      forceCompany(data.openingBalances.bank).map((r) => ({
        id: r.id,
        companyId,
        financialYearId: r.financialYearId,
        accountId: r.accountId ?? null,
        accountCode: r.accountCode,
        accountName: r.accountName,
        amount: String(r.amount ?? "0"),
        createdAt: toDate(r.createdAt) || new Date(),
      })),
    );

    await insertChunk(
      journalEntriesTable,
      forceCompany(data.journalEntries).map((r) => ({
        id: r.id,
        companyId,
        entryDate: r.entryDate,
        description: r.description,
        refType: r.refType ?? null,
        refId: r.refId ?? null,
        refNumber: r.refNumber ?? null,
        status: r.status || "posted",
        reversalOfId: r.reversalOfId ?? null,
        createdBy: r.createdBy ?? 0,
        createdAt: toDate(r.createdAt) || new Date(),
      })),
    );

    await insertChunk(
      journalLinesTable,
      (data.journalLines || []).map((r) => ({
        id: r.id,
        journalEntryId: r.journalEntryId,
        accountId: r.accountId,
        description: r.description ?? null,
        debit: String(r.debit ?? "0"),
        credit: String(r.credit ?? "0"),
        createdAt: toDate(r.createdAt) || new Date(),
      })),
    );

    await insertChunk(
      expensesTable,
      forceCompany(data.expenses).map((r) => ({
        id: r.id,
        companyId,
        expenseDate: r.expenseDate,
        vendorName: r.vendorName,
        description: r.description,
        category: r.category,
        amount: String(r.amount ?? "0"),
        gstAmount: String(r.gstAmount ?? "0"),
        gstClaimable: !!r.gstClaimable,
        isDeductible: r.isDeductible !== false,
        deductiblePct: r.deductiblePct ?? 100,
        currency: r.currency || "SGD",
        paymentMethod: r.paymentMethod ?? "bank_transfer",
        receiptData: r.receiptData ?? null,
        receiptMimeType: r.receiptMimeType ?? null,
        vendorId: r.vendorId ?? null,
        projectId: r.projectId ?? null,
        voucherId: r.voucherId ?? null,
        journalEntryId: r.journalEntryId ?? null,
        status: r.status || "draft",
        notes: r.notes ?? null,
        createdBy: r.createdBy ?? 0,
        createdAt: toDate(r.createdAt) || new Date(),
        updatedAt: toDate(r.updatedAt) || new Date(),
      })),
    );

    await insertChunk(
      incomeRecordsTable,
      forceCompany(data.incomeRecords).map((r) => ({
        id: r.id,
        companyId,
        incomeDate: r.incomeDate,
        payerName: r.payerName,
        description: r.description,
        category: r.category,
        amount: String(r.amount ?? "0"),
        gstAmount: String(r.gstAmount ?? "0"),
        gstTreatment: r.gstTreatment || "standard_rated",
        currency: r.currency || "SGD",
        exchangeRate: String(r.exchangeRate ?? "1.000000"),
        paymentMethod: r.paymentMethod ?? "bank_transfer",
        accountId: r.accountId ?? null,
        reference: r.reference ?? null,
        notes: r.notes ?? null,
        status: r.status || "draft",
        journalEntryId: r.journalEntryId ?? null,
        createdBy: r.createdBy ?? 0,
        createdAt: toDate(r.createdAt) || new Date(),
        updatedAt: toDate(r.updatedAt) || new Date(),
      })),
    );

    await tx.execute(sql`SELECT setval(pg_get_serial_sequence('accounts', 'id'), COALESCE((SELECT MAX(id) FROM accounts), 1))`);
    await tx.execute(sql`SELECT setval(pg_get_serial_sequence('financial_years', 'id'), COALESCE((SELECT MAX(id) FROM financial_years), 1))`);
    await tx.execute(sql`SELECT setval(pg_get_serial_sequence('journal_entries', 'id'), COALESCE((SELECT MAX(id) FROM journal_entries), 1))`);
    await tx.execute(sql`SELECT setval(pg_get_serial_sequence('journal_lines', 'id'), COALESCE((SELECT MAX(id) FROM journal_lines), 1))`);
    await tx.execute(sql`SELECT setval(pg_get_serial_sequence('expenses', 'id'), COALESCE((SELECT MAX(id) FROM expenses), 1))`);
    await tx.execute(sql`SELECT setval(pg_get_serial_sequence('income_records', 'id'), COALESCE((SELECT MAX(id) FROM income_records), 1))`);
    await tx.execute(sql`SELECT setval(pg_get_serial_sequence('opening_balances', 'id'), COALESCE((SELECT MAX(id) FROM opening_balances), 1))`);
  });
}

async function validateRestoredData(
  companyId: number,
  snapshot: ValidatedSnapshot,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const [company] = await db
    .select({ id: companiesTable.id })
    .from(companiesTable)
    .where(eq(companiesTable.id, companyId))
    .limit(1);
  if (!company) return { ok: false, error: "Company missing after restore" };

  const accounts = await db
    .select({ id: accountsTable.id })
    .from(accountsTable)
    .where(eq(accountsTable.companyId, companyId));
  if (snapshot.data.accounts.length > 0 && accounts.length === 0) {
    return { ok: false, error: "Accounts missing after restore" };
  }

  const fys = await db
    .select()
    .from(financialYearsTable)
    .where(eq(financialYearsTable.companyId, companyId));
  if (fys.length !== snapshot.data.financialYears.length) {
    return { ok: false, error: "Financial year count mismatch after restore" };
  }

  for (const expected of snapshot.data.financialYears) {
    const found = fys.find((f) => f.id === expected.id);
    if (!found) return { ok: false, error: `Missing financial year ${expected.label}` };
    if (String(found.status) !== String(expected.status)) {
      return {
        ok: false,
        error: `Financial year status mismatch for ${expected.label}: expected ${expected.status}, got ${found.status}`,
      };
    }
  }

  const journals = await db
    .select({ id: journalEntriesTable.id })
    .from(journalEntriesTable)
    .where(eq(journalEntriesTable.companyId, companyId));
  if (journals.length !== snapshot.data.journalEntries.length) {
    return { ok: false, error: "Journal entry count mismatch after restore" };
  }

  if (journals.length > 0) {
    const jeIdSet = new Set(journals.map((j) => j.id));
    const acctIdSet = new Set(accounts.map((a) => a.id));
    const lines = await db
      .select()
      .from(journalLinesTable)
      .where(inArray(journalLinesTable.journalEntryId, [...jeIdSet]));
    for (const line of lines) {
      if (!jeIdSet.has(line.journalEntryId)) {
        return { ok: false, error: `Broken journal line → entry FK (${line.id})` };
      }
      if (!acctIdSet.has(line.accountId)) {
        return { ok: false, error: `Broken journal line → account FK (${line.id})` };
      }
    }
  }

  return { ok: true };
}

/**
 * Run full restore with safety backup, validation, and rollback on failure.
 */
export async function executeAccountingRestore(opts: {
  companyId: number;
  backupId: number;
  userId: number;
  username: string;
  confirm: boolean;
  confirmPhrase?: string;
}): Promise<{
  ok: boolean;
  operation: any;
  error?: string;
}> {
  if (!opts.confirm) {
    return {
      ok: false,
      operation: null,
      error: "Explicit confirmation required. Restoring may replace current accounting data.",
    };
  }

  const restoreCode = await nextRestoreCode(opts.companyId);
  let steps = initialSteps();

  const [op] = await db
    .insert(accountingRestoreOperationsTable)
    .values({
      companyId: opts.companyId,
      restoreCode,
      backupId: opts.backupId,
      backupCode: "pending",
      restoreType: "accounting",
      status: "PENDING",
      stepsJson: JSON.stringify(steps),
      startedBy: opts.userId,
      startedByUsername: opts.username,
    })
    .returning();

  const fail = async (message: string, status: RestoreStatus = "FAILED") => {
    steps = steps.map((s) => (s.done ? s : { ...s, error: message }));
    const updated = await updateOp(op.id, {
      status,
      stepsJson: JSON.stringify(steps),
      resultMessage: message,
      errorDetails: message,
      completedAt: new Date(),
    });
    return { ok: false, operation: updated, error: message };
  };

  try {
    await updateOp(op.id, { status: "VALIDATING", stepsJson: JSON.stringify(steps) });
    const validated = await validateBackupForRestore({
      companyId: opts.companyId,
      backupId: opts.backupId,
    });
    if (!validated.ok) {
      return fail(
        validated.error || "Backup validation failed. The selected backup cannot be restored.",
      );
    }

    const { backup, snapshot } = validated;

    // Require typing RESTORE for all destructive restores
    if (String(opts.confirmPhrase || "").trim().toUpperCase() !== "RESTORE") {
      return fail("Type RESTORE to confirm before restoring.");
    }

    await db
      .update(accountingRestoreOperationsTable)
      .set({
        backupCode: backup.backupCode,
        restoreType: backup.backupType,
      })
      .where(eq(accountingRestoreOperationsTable.id, op.id));

    steps = steps.map((s) => (s.key === "validated" ? { ...s, done: true } : s));
    await updateOp(op.id, { stepsJson: JSON.stringify(steps) });

    await updateOp(op.id, { status: "SAFETY_BACKUP", stepsJson: JSON.stringify(steps) });
    const safety = await createAccountingBackup({
      companyId: opts.companyId,
      backupType: "accounting",
      userId: opts.userId,
      username: opts.username,
      source: "safety",
    });
    if (!safety.ok || safety.backup?.status !== "completed") {
      return fail("Restore cancelled because the safety backup could not be created.");
    }
    steps = steps.map((s) => (s.key === "safety" ? { ...s, done: true } : s));
    await updateOp(op.id, {
      safetyBackupId: safety.backup.id,
      safetyBackupCode: safety.backup.backupCode,
      stepsJson: JSON.stringify(steps),
    });

    await updateOp(op.id, { status: "RESTORING", stepsJson: JSON.stringify(steps) });
    try {
      await applySnapshotToCompany(opts.companyId, snapshot);
    } catch (err: any) {
      const safetyValidated = await validateBackupForRestore({
        companyId: opts.companyId,
        backupId: safety.backup.id,
      });
      if (safetyValidated.ok) {
        try {
          await applySnapshotToCompany(opts.companyId, safetyValidated.snapshot);
          return fail(
            "Restore failed. The system has been rolled back to the previous state using the safety backup.",
            "ROLLED_BACK",
          );
        } catch (rbErr: any) {
          return fail(
            `Restore failed and rollback also failed: ${err?.message || err}. Rollback: ${rbErr?.message || rbErr}`,
          );
        }
      }
      return fail(
        `Restore failed: ${err?.message || err}. Safety backup ${safety.backup.backupCode} is available for manual recovery.`,
      );
    }
    steps = steps.map((s) => (s.key === "restored" ? { ...s, done: true } : s));
    await updateOp(op.id, { stepsJson: JSON.stringify(steps) });

    await updateOp(op.id, { status: "VERIFYING", stepsJson: JSON.stringify(steps) });
    const verified = await validateRestoredData(opts.companyId, snapshot);
    if (!verified.ok) {
      const safetyValidated = await validateBackupForRestore({
        companyId: opts.companyId,
        backupId: safety.backup.id,
      });
      if (safetyValidated.ok) {
        try {
          await applySnapshotToCompany(opts.companyId, safetyValidated.snapshot);
          return fail(
            `Post-restore validation failed (${verified.error}). Rolled back using safety backup.`,
            "ROLLED_BACK",
          );
        } catch {
          /* fall through */
        }
      }
      return fail(`Post-restore validation failed: ${verified.error}`);
    }
    steps = steps.map((s) => (s.key === "verified" ? { ...s, done: true } : s));

    await db
      .update(accountingBackupsTable)
      .set({
        status: "restored",
        restoredAt: new Date(),
        restoredBy: opts.userId,
      })
      .where(eq(accountingBackupsTable.id, backup.id));

    const completed = await updateOp(op.id, {
      status: "COMPLETED",
      stepsJson: JSON.stringify(steps),
      resultMessage: "RESTORE COMPLETED",
      errorDetails: null,
      completedAt: new Date(),
    });

    return { ok: true, operation: completed };
  } catch (err: any) {
    return fail(err?.message || String(err));
  }
}

/**
 * Store an uploaded backup file after validating metadata (company, format, structure).
 * Does not trust filename alone — reads JSON content.
 */
export async function importUploadedBackup(opts: {
  companyId: number;
  userId: number;
  username: string;
  fileBuffer: Buffer;
}): Promise<{ ok: true; backup: any; meta: any } | { ok: false; error: string }> {
  let parsed: any;
  let raw: string;
  try {
    raw = opts.fileBuffer.toString("utf8");
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "Invalid backup file. Expected JSON backup format." };
  }

  if (parsed?.format !== SUPPORTED_FORMAT) {
    return { ok: false, error: "Unsupported backup format/version." };
  }
  if (Number(parsed.companyId) !== opts.companyId) {
    return { ok: false, error: "Backup belongs to a different company/tenant." };
  }
  if (!parsed.data || typeof parsed.data !== "object") {
    return { ok: false, error: "Backup structure is incompatible." };
  }

  const checksum = crypto.createHash("sha256").update(raw).digest("hex");
  const year = new Date().getFullYear();
  const existing = await db
    .select({ id: accountingBackupsTable.id })
    .from(accountingBackupsTable)
    .where(eq(accountingBackupsTable.companyId, opts.companyId));
  const backupCode = `BK-${year}-${String(existing.length + 1).padStart(4, "0")}`;
  const filename = `${opts.companyId}_${backupCode}_upload_${Date.now()}.json`;
  const { backupsDir } = await import("./accounting-backup.js");
  const pathMod = await import("path");
  if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true });
  const absPath = pathMod.join(backupsDir, filename);
  await fs.promises.writeFile(absPath, raw, "utf8");
  const verify = crypto
    .createHash("sha256")
    .update(await fs.promises.readFile(absPath, "utf8"))
    .digest("hex");
  if (verify !== checksum) {
    try {
      await fs.promises.unlink(absPath);
    } catch {
      /* ignore */
    }
    return { ok: false, error: "Uploaded backup failed integrity verification." };
  }
  const stat = await fs.promises.stat(absPath);
  const storagePath = pathMod.posix.join("uploads", "accounting-backups", filename);

  const [row] = await db
    .insert(accountingBackupsTable)
    .values({
      companyId: opts.companyId,
      backupCode,
      backupType: (parsed.backupType as BackupType) || "accounting",
      fromDate: parsed.fromDate || null,
      toDate: parsed.toDate || null,
      status: "completed",
      storagePath,
      storageRef: filename,
      fileSizeBytes: stat.size,
      checksumSha256: checksum,
      backupSource: "uploaded",
      createdBy: opts.userId,
      createdByUsername: opts.username,
      completedAt: new Date(),
    })
    .returning();

  return {
    ok: true,
    backup: row,
    meta: {
      format: parsed.format,
      backupType: parsed.backupType,
      companyId: parsed.companyId,
      fromDate: parsed.fromDate,
      toDate: parsed.toDate,
      accounts: parsed.data.accounts?.length || 0,
      journalEntries: parsed.data.journalEntries?.length || 0,
      financialYears: parsed.data.financialYears?.length || 0,
    },
  };
}
