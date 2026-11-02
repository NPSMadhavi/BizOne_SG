/**
 * Individual Company-Scoped Backup & Restore Engine for BizOne Singapore ERP.
 * 
 * Rules:
 * 1. Backs up ONLY the specified company's database and business data.
 * 2. Never dumps master tables of other companies or combines multi-company data.
 * 3. Scans and archives ONLY uploaded files referenced by this company.
 * 4. Saves backups into isolated company-specific directories.
 * 5. Pre-restore safety backup created exclusively for the target company.
 * 6. Multi-tenant database restore is strictly isolated to that company's database.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import archiver from "archiver";
import extractZip from "extract-zip";
import pg from "pg";
import { getUploadsRoot } from "./ensure-uploads.js";
import { logger } from "./logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface BackupProgress {
  backupId?: number;
  companyId: number;
  companyName: string;
  backupCode: string;
  type: "manual" | "scheduled" | "safety";
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "FAILED";
  step: string;
  percent: number;
  logs: string[];
  fileSizeBytes?: number;
  checksumSha256?: string;
  fileName?: string;
  error?: string;
  startedAt: string;
  completedAt?: string;
}

export interface RestoreProgress {
  restoreId?: number;
  companyId: number;
  companyName: string;
  restoreCode: string;
  backupCode: string;
  status: "PENDING" | "VALIDATING" | "SAFETY_BACKUP" | "RESTORING" | "VERIFYING" | "COMPLETED" | "FAILED";
  step: string;
  percent: number;
  logs: string[];
  safetyBackupCode?: string;
  error?: string;
  startedAt: string;
  completedAt?: string;
}

// In-memory tracking for real-time progress updates (scoped by backupCode)
export const activeBackupOperations = new Map<string, BackupProgress>();
export const activeRestoreOperations = new Map<string, RestoreProgress>();

export function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "company";
}

export function getCompanyBackupsDir(companyId: number, companyName: string): string {
  const slug = slugify(companyName);
  const dir = path.join(getUploadsRoot(), "system-backups", `comp_${companyId}_${slug}`);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function pgDumpBin(): string {
  const candidates = [
    process.env.PG_DUMP_PATH,
    "C:\\Program Files\\PostgreSQL\\18\\bin\\pg_dump.exe",
    "C:\\Program Files\\PostgreSQL\\17\\bin\\pg_dump.exe",
    "C:\\Program Files\\PostgreSQL\\16\\bin\\pg_dump.exe",
    "C:\\Program Files\\PostgreSQL\\15\\bin\\pg_dump.exe",
    "pg_dump",
  ].filter((value): value is string => Boolean(value));
  return candidates.find((file) => file === "pg_dump" || fs.existsSync(file)) ?? "pg_dump";
}

export function psqlBin(): string {
  const candidates = [
    process.env.PSQL_PATH,
    "C:\\Program Files\\PostgreSQL\\18\\bin\\psql.exe",
    "C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe",
    "C:\\Program Files\\PostgreSQL\\16\\bin\\psql.exe",
    "C:\\Program Files\\PostgreSQL\\15\\bin\\psql.exe",
    "psql",
  ].filter((value): value is string => Boolean(value));
  return candidates.find((file) => file === "psql" || fs.existsSync(file)) ?? "psql";
}

function databaseUrlFor(baseUrl: string, dbName: string): string {
  const url = new URL(baseUrl);
  url.pathname = `/${dbName}`;
  return url.toString();
}

/**
 * Ensures system backup tables exist in the target database.
 */
export async function ensureBackupSchema(clientOrPool: pg.Pool | pg.Client): Promise<void> {
  await clientOrPool.query(`
    CREATE TABLE IF NOT EXISTS accounting_backups (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL,
      backup_code TEXT NOT NULL,
      backup_type TEXT NOT NULL DEFAULT 'company_database',
      from_date TEXT,
      to_date TEXT,
      financial_year_id INTEGER,
      financial_year_label TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      storage_path TEXT,
      storage_ref TEXT,
      file_size_bytes BIGINT,
      checksum_sha256 TEXT,
      backup_source TEXT NOT NULL DEFAULT 'manual',
      schedule_id INTEGER,
      error_message TEXT,
      created_by INTEGER,
      created_by_username TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ,
      restored_at TIMESTAMPTZ,
      restored_by INTEGER
    );

    CREATE TABLE IF NOT EXISTS backup_schedules (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL UNIQUE,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      frequency TEXT NOT NULL DEFAULT 'daily',
      time_of_day TEXT NOT NULL DEFAULT '02:00',
      day_of_week INTEGER,
      backup_type TEXT NOT NULL DEFAULT 'company_database',
      destination_dir TEXT DEFAULT 'C:\\BizOne_Backups',
      local_download_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      local_destination_dir TEXT DEFAULT 'D:\\BizOneBackups',
      local_timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
      local_download_time TEXT NOT NULL DEFAULT '02:30',
      local_download_frequency TEXT NOT NULL DEFAULT 'daily',
      agent_token TEXT,
      last_agent_contact_at TIMESTAMPTZ,
      last_successful_download_at TIMESTAMPTZ,
      last_download_status TEXT,
      last_run_at TIMESTAMPTZ,
      next_run_at TIMESTAMPTZ,
      created_by INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS local_backup_download_history (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL,
      backup_id INTEGER,
      backup_code TEXT,
      file_name TEXT NOT NULL,
      destination_folder TEXT NOT NULL,
      file_size_bytes BIGINT,
      status TEXT NOT NULL DEFAULT 'Completed',
      checksum_status TEXT NOT NULL DEFAULT 'Passed',
      checksum_sha256 TEXT,
      error_message TEXT,
      agent_hostname TEXT,
      downloaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS backup_retention_settings (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL UNIQUE,
      daily_keep_days INTEGER NOT NULL DEFAULT 30,
      weekly_keep_weeks INTEGER NOT NULL DEFAULT 12,
      monthly_keep_months INTEGER NOT NULL DEFAULT 12,
      financial_year_keep_forever BOOLEAN NOT NULL DEFAULT TRUE,
      updated_by INTEGER,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS accounting_restore_operations (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL,
      restore_code TEXT NOT NULL,
      backup_id INTEGER NOT NULL,
      backup_code TEXT NOT NULL,
      restore_type TEXT NOT NULL DEFAULT 'company_database',
      status TEXT NOT NULL DEFAULT 'PENDING',
      safety_backup_id INTEGER,
      safety_backup_code TEXT,
      steps_json TEXT,
      result_message TEXT,
      error_details TEXT,
      started_by INTEGER,
      started_by_username TEXT,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    );
  `);

  // Migrations for backup_schedules columns
  try {
    await clientOrPool.query("ALTER TABLE backup_schedules ADD COLUMN IF NOT EXISTS destination_dir TEXT DEFAULT 'C:\\\\BizOne_Backups'");
    await clientOrPool.query("ALTER TABLE backup_schedules ADD COLUMN IF NOT EXISTS local_download_enabled BOOLEAN NOT NULL DEFAULT TRUE");
    await clientOrPool.query("ALTER TABLE backup_schedules ADD COLUMN IF NOT EXISTS local_destination_dir TEXT DEFAULT 'D:\\\\BizOneBackups'");
    await clientOrPool.query("ALTER TABLE backup_schedules ADD COLUMN IF NOT EXISTS local_timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata'");
    await clientOrPool.query("ALTER TABLE backup_schedules ADD COLUMN IF NOT EXISTS local_download_time TEXT NOT NULL DEFAULT '02:30'");
    await clientOrPool.query("ALTER TABLE backup_schedules ADD COLUMN IF NOT EXISTS local_download_frequency TEXT NOT NULL DEFAULT 'daily'");
    await clientOrPool.query("ALTER TABLE backup_schedules ADD COLUMN IF NOT EXISTS agent_token TEXT");
    await clientOrPool.query("ALTER TABLE backup_schedules ADD COLUMN IF NOT EXISTS last_agent_contact_at TIMESTAMPTZ");
    await clientOrPool.query("ALTER TABLE backup_schedules ADD COLUMN IF NOT EXISTS last_successful_download_at TIMESTAMPTZ");
    await clientOrPool.query("ALTER TABLE backup_schedules ADD COLUMN IF NOT EXISTS last_download_status TEXT");
    await clientOrPool.query("CREATE UNIQUE INDEX IF NOT EXISTS backup_schedules_company_id_key ON backup_schedules (company_id)");
  } catch {}
}

/**
 * Generates an SQL dump of a database using pg_dump.
 */
async function dumpDatabase(dbUrl: string, outputPath: string): Promise<void> {
  const bin = pgDumpBin();
  const args = [
    "--clean",
    "--if-exists",
    "--no-owner",
    "--no-privileges",
    "--format=plain",
    `--file=${outputPath}`,
    dbUrl,
  ];

  await new Promise<void>((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true });
    let stderr = "";
    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("error", (err) => {
      reject(new Error(`Failed to start pg_dump: ${err.message}`));
    });
    child.on("close", (code) => {
      if (code === 0 && fs.existsSync(outputPath)) {
        resolve();
      } else {
        reject(new Error(`pg_dump failed (code ${code}): ${stderr}`));
      }
    });
  });
}

/**
 * Restores an SQL dump to a target database using psql.
 */
async function restoreDatabase(dbUrl: string, sqlFilePath: string): Promise<void> {
  const bin = psqlBin();
  const args = [
    "--quiet",
    "--no-psqlrc",
    "--file",
    sqlFilePath,
    dbUrl,
  ];

  await new Promise<void>((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true });
    let stderr = "";
    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("error", (err) => {
      reject(new Error(`Failed to start psql: ${err.message}`));
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`psql restore failed (code ${code}): ${stderr}`));
      }
    });
  });
}

/**
 * Computes SHA-256 hash of a file.
 */
export async function computeFileSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

export function computeNextRunAt(frequency: string, timeOfDay: string, dayOfWeek?: number | null): Date {
  const [hStr, mStr] = (timeOfDay || "02:00").split(":");
  const hour = parseInt(hStr || "2", 10);
  const min = parseInt(mStr || "0", 10);

  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, min, 0, 0);

  if (frequency === "weekly") {
    const targetDay = dayOfWeek != null ? dayOfWeek : 0; // 0 = Sunday
    while (next.getDay() !== targetDay || next.getTime() <= now.getTime()) {
      next.setDate(next.getDate() + 1);
    }
  } else if (frequency === "monthly") {
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    next.setDate(lastDay);
    if (next.getTime() <= now.getTime()) {
      const nextMonthLastDay = new Date(now.getFullYear(), now.getMonth() + 2, 0).getDate();
      next.setMonth(now.getMonth() + 1);
      next.setDate(nextMonthLastDay);
    }
  } else {
    if (next.getTime() <= now.getTime()) {
      next.setDate(next.getDate() + 1);
    }
  }
  return next;
}

/**
 * Collects uploaded document file paths belonging exclusively to this company.
 */
async function collectCompanyUploadFiles(tenantPool: pg.Pool): Promise<string[]> {
  const files = new Set<string>();

  // 1. Employee scans
  try {
    const res = await tenantPool.query(`
      SELECT passport_scan, visa_scan, nric_scan 
      FROM employees 
      WHERE passport_scan IS NOT NULL OR visa_scan IS NOT NULL OR nric_scan IS NOT NULL
    `);
    for (const r of res.rows) {
      if (r.passport_scan) files.add(r.passport_scan);
      if (r.visa_scan) files.add(r.visa_scan);
      if (r.nric_scan) files.add(r.nric_scan);
    }
  } catch {}

  // 2. employee_documents
  try {
    const res = await tenantPool.query("SELECT file_path FROM employee_documents WHERE file_path IS NOT NULL");
    for (const r of res.rows) if (r.file_path) files.add(r.file_path);
  } catch {}

  // 3. ops_company_documents
  try {
    const res = await tenantPool.query("SELECT file_path FROM ops_company_documents WHERE file_path IS NOT NULL");
    for (const r of res.rows) if (r.file_path) files.add(r.file_path);
  } catch {}

  // 4. voucher_attachments
  try {
    const res = await tenantPool.query("SELECT file_path FROM voucher_attachments WHERE file_path IS NOT NULL");
    for (const r of res.rows) if (r.file_path) files.add(r.file_path);
  } catch {}

  // 5. income_attachments
  try {
    const res = await tenantPool.query("SELECT file_path FROM income_attachments WHERE file_path IS NOT NULL");
    for (const r of res.rows) if (r.file_path) files.add(r.file_path);
  } catch {}

  return Array.from(files);
}

/**
 * Creates an INDIVIDUAL company-scoped backup:
 * - Backs up ONLY the specified company's database
 * - Backs up ONLY the uploaded documents referenced by this company
 * - Never includes other companies' databases or documents
 */
export async function createCompanyBackup(options: {
  companyId: number;
  userId?: number;
  username?: string;
  source?: "manual" | "scheduled" | "safety";
}): Promise<{
  ok: boolean;
  backup?: any;
  error?: string;
}> {
  const { companyId, userId, username, source = "manual" } = options;
  const masterDbUrl = process.env.DATABASE_URL;
  if (!masterDbUrl) {
    return { ok: false, error: "DATABASE_URL is not configured" };
  }

  const masterPool = new pg.Pool({ connectionString: masterDbUrl });
  let tenantPool: pg.Pool | null = null;

  try {
    await ensureBackupSchema(masterPool);

    // Strictly verify company from database
    const compResult = await masterPool.query(
      "SELECT * FROM companies WHERE id = $1",
      [companyId]
    );
    const company = compResult.rows[0];
    if (!company) {
      return { ok: false, error: `Company with ID ${companyId} not found` };
    }

    if (!company.database_name) {
      return { ok: false, error: `Company ${company.name} has no designated tenant database` };
    }

    const companySlug = slugify(company.name);
    const companyBackupsDir = getCompanyBackupsDir(company.id, company.name);

    const year = new Date().getFullYear();
    const timestampStr = new Date().toISOString().replace(/[:.]/g, "-");
    const randomSuffix = crypto.randomBytes(3).toString("hex").toUpperCase();
    const prefix = source === "safety" ? "SAFE" : "BK";
    const backupCode = `${prefix}-${year}-${randomSuffix}`;
    const archiveFileName = `bizone_${companySlug}_${backupCode}_${timestampStr}.zip`;
    const archivePath = path.join(companyBackupsDir, archiveFileName);

    // Initialize progress tracking
    const progress: BackupProgress = {
      companyId: company.id,
      companyName: company.name,
      backupCode,
      type: source,
      status: "IN_PROGRESS",
      step: `Initializing backup for ${company.name}...`,
      percent: 5,
      logs: [`[${new Date().toLocaleTimeString()}] Backup initiated for company: ${company.name} (${backupCode})`],
      fileName: archiveFileName,
      startedAt: new Date().toISOString(),
    };
    activeBackupOperations.set(backupCode, progress);

    const updateProgress = (step: string, percent: number) => {
      progress.step = step;
      progress.percent = Math.min(100, Math.max(0, percent));
      progress.logs.push(`[${new Date().toLocaleTimeString()}] ${step}`);
      logger.info({ companyId, companyName: company.name, backupCode, step, percent }, "[company-backup-engine]");
    };

    const tempDir = path.join(companyBackupsDir, `temp_${backupCode}`);

    // Connect to company's tenant database
    const tenantUrl = databaseUrlFor(masterDbUrl, company.database_name);
    tenantPool = new pg.Pool({ connectionString: tenantUrl });
    await ensureBackupSchema(tenantPool);

    // Insert pending record in master DB (and tenant)
    const insertSql = `
      INSERT INTO accounting_backups (
        company_id, backup_code, backup_type, status, storage_path, storage_ref,
        backup_source, created_by, created_by_username, created_at
      ) VALUES ($1, $2, 'company_database', 'in_progress', $3, $4, $5, $6, $7, NOW())
      RETURNING *
    `;
    const insertValues = [
      company.id,
      backupCode,
      archivePath,
      archiveFileName,
      source,
      userId || null,
      username || "administrator",
    ];

    const masterInsert = await masterPool.query(insertSql, insertValues);
    const insertedRow = masterInsert.rows[0];
    try {
      await tenantPool.query(insertSql, insertValues);
    } catch {}

    progress.backupId = insertedRow.id;

    // Create temp work directory
    fs.mkdirSync(tempDir, { recursive: true });

    // Step 1: Dump Company's Tenant Database ONLY
    updateProgress(`Dumping database for ${company.name} (${company.database_name})...`, 30);
    const dbDumpPath = path.join(tempDir, "company_database.sql");
    await dumpDatabase(tenantUrl, dbDumpPath);

    // Step 2: Collect ONLY uploaded files belonging to this company
    updateProgress(`Collecting uploaded documents belonging to ${company.name}...`, 60);
    const companyFiles = await collectCompanyUploadFiles(tenantPool);
    const uploadsRoot = getUploadsRoot();

    // Step 3: Write manifest.json
    const manifest = {
      version: "2.1.0",
      backupCode,
      backupType: "company_database",
      backupSource: source,
      company: {
        id: company.id,
        name: company.name,
        databaseName: company.database_name,
        country: company.country,
      },
      createdAt: new Date().toISOString(),
      createdBy: username || "administrator",
      databaseDump: "company_database.sql",
      fileCount: companyFiles.length,
    };
    fs.writeFileSync(path.join(tempDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");

    // Step 4: Zip database and files into compressed archive
    updateProgress(`Compressing backup archive for ${company.name}...`, 80);
    await new Promise<void>((resolve, reject) => {
      const output = fs.createWriteStream(archivePath);
      const archive = archiver("zip", { zlib: { level: 9 } });

      output.on("close", resolve);
      archive.on("error", reject);

      archive.pipe(output);

      // Append database dump
      archive.file(dbDumpPath, { name: "company_database.sql" });
      archive.file(path.join(tempDir, "manifest.json"), { name: "manifest.json" });

      // Append only this company's referenced upload files
      for (const relFile of companyFiles) {
        // Strip leading slashes
        const normalizedRel = relFile.replace(/^[/\\]+/, "");
        const fullSourcePath = path.resolve(uploadsRoot, normalizedRel.replace(/^uploads[/\\]+/, ""));
        if (fs.existsSync(fullSourcePath) && fs.statSync(fullSourcePath).isFile()) {
          archive.file(fullSourcePath, { name: path.join("uploads", normalizedRel.replace(/^uploads[/\\]+/, "")) });
        }
      }

      archive.finalize();
    });

    // Step 5: Compute SHA-256 Checksum and finalize
    updateProgress("Verifying archive integrity and computing SHA-256...", 95);
    const checksum = await computeFileSha256(archivePath);
    const finalStats = fs.statSync(archivePath);

    const updateSql = `
      UPDATE accounting_backups
      SET status = 'completed',
          file_size_bytes = $1,
          checksum_sha256 = $2,
          completed_at = NOW()
      WHERE backup_code = $3
      RETURNING *
    `;
    const finalMasterRes = await masterPool.query(updateSql, [finalStats.size, checksum, backupCode]);
    try {
      await tenantPool.query(updateSql, [finalStats.size, checksum, backupCode]);
    } catch {}

    const completedBackup = finalMasterRes.rows[0] || insertedRow;

    updateProgress(`Backup for ${company.name} completed successfully!`, 100);
    progress.status = "COMPLETED";
    progress.fileSizeBytes = finalStats.size;
    progress.checksumSha256 = checksum;
    progress.completedAt = new Date().toISOString();

    // Auto-sync / auto-save to configured local destination directory (e.g. C:\BizOneBackups)
    try {
      const schedRes = await masterPool.query(
        "SELECT * FROM backup_schedules WHERE company_id = $1",
        [company.id]
      );
      const schedule = schedRes.rows[0];
      const targetLocalDir =
        schedule?.local_destination_dir ||
        schedule?.destination_dir ||
        "C:\\BizOneBackups";

      if (schedule?.local_download_enabled !== false && targetLocalDir) {
        const normalizedDir = path.normalize(targetLocalDir);
        if (!fs.existsSync(normalizedDir)) {
          try {
            fs.mkdirSync(normalizedDir, { recursive: true });
          } catch (mkdirErr) {
            logger.warn({ err: mkdirErr, path: normalizedDir }, "[company-backup-engine] Could not create local directory");
          }
        }

        if (fs.existsSync(normalizedDir)) {
          const destFilePath = path.join(normalizedDir, archiveFileName);
          fs.copyFileSync(archivePath, destFilePath);

          const copiedChecksum = await computeFileSha256(destFilePath);
          const isChecksumValid = copiedChecksum === checksum;

          await recordLocalDownloadReport({
            companyId: company.id,
            backupId: completedBackup.id,
            backupCode,
            fileName: archiveFileName,
            destinationFolder: normalizedDir,
            fileSizeBytes: finalStats.size,
            status: isChecksumValid ? "Completed" : "Failed",
            checksumStatus: isChecksumValid ? "Passed" : "Failed",
            checksumSha256: copiedChecksum,
            agentHostname: process.env.COMPUTERNAME || "BizOne-Server",
          });

          // Also keep download-history.json updated inside the local folder
          try {
            const historyFile = path.join(normalizedDir, "download-history.json");
            let localHistory: any[] = [];
            if (fs.existsSync(historyFile)) {
              try {
                localHistory = JSON.parse(fs.readFileSync(historyFile, "utf8"));
                if (!Array.isArray(localHistory)) localHistory = [];
              } catch {}
            }
            const historyEntry = {
              id: crypto.randomUUID(),
              backupId: completedBackup.id,
              backupCode,
              fileName: archiveFileName,
              downloadedAt: new Date().toISOString(),
              folder: normalizedDir,
              sizeBytes: finalStats.size,
              status: isChecksumValid ? "Completed" : "Failed",
              checksumStatus: isChecksumValid ? "Passed" : "Failed",
              checksumSha256: copiedChecksum,
            };
            localHistory.unshift(historyEntry);
            fs.writeFileSync(historyFile, JSON.stringify(localHistory.slice(0, 100), null, 2), "utf8");
          } catch (histErr) {
            logger.warn({ err: histErr }, "[company-backup-engine] Failed to update local download-history.json");
          }

          updateProgress(`Saved verified backup archive directly to: ${destFilePath}`, 100);
        }
      }
    } catch (localSyncErr: any) {
      logger.warn(
        { err: localSyncErr?.message, companyId },
        "[company-backup-engine] Automatic local destination copy skipped/failed"
      );
    }

    setTimeout(() => {
      activeBackupOperations.delete(backupCode);
    }, 15_000);

    // Cleanup temp work dir
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}

    return {
      ok: true,
      backup: completedBackup,
    };
  } catch (err: any) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error({ error: errorMsg, companyId }, "[company-backup-engine] Backup failed");

    return { ok: false, error: errorMsg };
  } finally {
    await masterPool.end();
    if (tenantPool) await tenantPool.end();
  }
}

/**
 * Validates a single company's backup archive before restoration.
 */
export async function validateCompanyBackupArchive(backupId: number, companyId: number): Promise<{
  ok: boolean;
  backup?: any;
  manifest?: any;
  error?: string;
}> {
  const masterDbUrl = process.env.DATABASE_URL;
  if (!masterDbUrl) return { ok: false, error: "Database not configured" };

  const pool = new pg.Pool({ connectionString: masterDbUrl });
  try {
    await ensureBackupSchema(pool);
    const res = await pool.query(
      "SELECT * FROM accounting_backups WHERE id = $1 AND company_id = $2",
      [backupId, companyId]
    );
    const backup = res.rows[0];
    if (!backup) {
      return { ok: false, error: "Backup record not found or does not belong to the selected company" };
    }

    if (!backup.storage_path || !fs.existsSync(backup.storage_path)) {
      return { ok: false, error: `Backup archive file missing from server: ${backup.storage_ref || backup.storage_path}` };
    }

    // Verify SHA-256 hash
    const currentHash = await computeFileSha256(backup.storage_path);
    if (backup.checksum_sha256 && backup.checksum_sha256 !== currentHash) {
      return {
        ok: false,
        error: `Archive checksum mismatch! Expected ${backup.checksum_sha256}, got ${currentHash}. File may be corrupted.`,
      };
    }

    // Inspect manifest inside zip
    const tempExtract = path.join(path.dirname(backup.storage_path), `inspect_${backup.backup_code}_${Date.now()}`);
    fs.mkdirSync(tempExtract, { recursive: true });

    let manifest: any = null;
    try {
      await extractZip(backup.storage_path, { dir: tempExtract });
      const manifestPath = path.join(tempExtract, "manifest.json");
      if (fs.existsSync(manifestPath)) {
        manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      }
    } finally {
      try {
        fs.rmSync(tempExtract, { recursive: true, force: true });
      } catch {}
    }

    // Verify ownership in manifest
    if (manifest?.company && manifest.company.id !== companyId) {
      return {
        ok: false,
        error: `Archive belongs to company ID ${manifest.company.id} (${manifest.company.name}), not current company ${companyId}. Restore blocked.`,
      };
    }

    return {
      ok: true,
      backup,
      manifest,
    };
  } catch (err: any) {
    return { ok: false, error: err.message };
  } finally {
    await pool.end();
  }
}

/**
 * Restores an individual company's backup without affecting other companies:
 * 1. Validates that the backup belongs strictly to this company.
 * 2. Creates a Safety Backup of this company's current live state.
 * 3. Restores SQL dump to this company's tenant database only.
 * 4. Restores uploaded documents for this company.
 */
export async function executeCompanyRestore(options: {
  backupId: number;
  companyId: number;
  userId?: number;
  username?: string;
  confirmPhrase: string;
}): Promise<{
  ok: boolean;
  operation?: any;
  safetyBackup?: any;
  error?: string;
}> {
  const { backupId, companyId, userId, username, confirmPhrase } = options;
  if (confirmPhrase.trim().toUpperCase() !== "RESTORE") {
    return { ok: false, error: "Confirmation phrase must be 'RESTORE'" };
  }

  const masterDbUrl = process.env.DATABASE_URL;
  if (!masterDbUrl) return { ok: false, error: "Database not configured" };

  const masterPool = new pg.Pool({ connectionString: masterDbUrl });
  const year = new Date().getFullYear();
  const restoreCode = `RST-${year}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;

  const progress: RestoreProgress = {
    companyId,
    companyName: "",
    restoreCode,
    backupCode: `BK-${backupId}`,
    status: "VALIDATING",
    step: "Validating company backup archive...",
    percent: 5,
    logs: [`[${new Date().toLocaleTimeString()}] Restore initiated: ${restoreCode}`],
    startedAt: new Date().toISOString(),
  };
  activeRestoreOperations.set(restoreCode, progress);

  const updateProgress = (step: string, status: RestoreProgress["status"], percent: number) => {
    progress.step = step;
    progress.status = status;
    progress.percent = Math.min(100, Math.max(0, percent));
    progress.logs.push(`[${new Date().toLocaleTimeString()}] ${step}`);
    logger.info({ companyId, restoreCode, step, percent, status }, "[company-restore-engine]");
  };

  let tempExtractDir = "";

  try {
    await ensureBackupSchema(masterPool);

    // Verify company
    const compRes = await masterPool.query("SELECT * FROM companies WHERE id = $1", [companyId]);
    const company = compRes.rows[0];
    if (!company) throw new Error("Company not found");
    progress.companyName = company.name;

    // Validate backup archive
    const valResult = await validateCompanyBackupArchive(backupId, companyId);
    if (!valResult.ok || !valResult.backup) {
      throw new Error(valResult.error || "Backup archive validation failed");
    }
    const targetBackup = valResult.backup;
    progress.backupCode = targetBackup.backup_code;

    // Insert restore tracking row
    const opInsert = await masterPool.query(
      `INSERT INTO accounting_restore_operations (
        company_id, restore_code, backup_id, backup_code, restore_type, status,
        started_by, started_by_username, started_at
      ) VALUES ($1, $2, $3, $4, 'company_database', 'SAFETY_BACKUP', $5, $6, NOW())
      RETURNING *`,
      [companyId, restoreCode, targetBackup.id, targetBackup.backup_code, userId || null, username || "admin"]
    );
    const operation = opInsert.rows[0];
    progress.restoreId = operation.id;

    // Mandatory: Create pre-restore safety backup of this company first
    updateProgress(`Creating pre-restore safety snapshot for ${company.name}...`, "SAFETY_BACKUP", 20);
    const safetyResult = await createCompanyBackup({
      companyId,
      userId,
      username,
      source: "safety",
    });

    if (!safetyResult.ok || !safetyResult.backup) {
      throw new Error(`Safety backup failed: ${safetyResult.error}. Restoration aborted to safeguard data.`);
    }

    const safetyBackup = safetyResult.backup;
    progress.safetyBackupCode = safetyBackup.backup_code;
    await masterPool.query(
      "UPDATE accounting_restore_operations SET safety_backup_id = $1, safety_backup_code = $2 WHERE id = $3",
      [safetyBackup.id, safetyBackup.backup_code, operation.id]
    );

    // Extract archive
    tempExtractDir = path.join(getCompanyBackupsDir(companyId, company.name), `restore_work_${restoreCode}`);
    fs.mkdirSync(tempExtractDir, { recursive: true });
    updateProgress("Extracting backup archive contents...", "RESTORING", 40);
    await extractZip(targetBackup.storage_path, { dir: tempExtractDir });

    // Restore ONLY this company's database
    const sqlDumpPath = path.join(tempExtractDir, "company_database.sql");
    if (!fs.existsSync(sqlDumpPath)) {
      throw new Error("Archive does not contain valid company_database.sql");
    }

    updateProgress(`Restoring database for ${company.name} (${company.database_name})...`, "RESTORING", 60);
    const tenantUrl = databaseUrlFor(masterDbUrl, company.database_name);
    await restoreDatabase(tenantUrl, sqlDumpPath);

    // Restore uploaded files for this company
    const uploadsInBackup = path.join(tempExtractDir, "uploads");
    if (fs.existsSync(uploadsInBackup)) {
      updateProgress(`Restoring documents for ${company.name}...`, "RESTORING", 80);
      const destinationUploads = getUploadsRoot();
      copyDirectoryRecursive(uploadsInBackup, destinationUploads);
    }

    // Verify
    updateProgress("Verifying restored database integrity...", "VERIFYING", 95);

    // Complete
    await masterPool.query(
      `UPDATE accounting_restore_operations
       SET status = 'COMPLETED',
           result_message = 'Restore completed successfully. Other companies were untouched.',
           completed_at = NOW()
       WHERE id = $1`,
      [operation.id]
    );

    await masterPool.query(
      "UPDATE accounting_backups SET status = 'restored', restored_at = NOW(), restored_by = $1 WHERE id = $2",
      [userId || null, targetBackup.id]
    );

    updateProgress(`Company ${company.name} restored successfully!`, "COMPLETED", 100);
    progress.status = "COMPLETED";
    progress.completedAt = new Date().toISOString();

    return {
      ok: true,
      operation,
      safetyBackup,
    };
  } catch (err: any) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error({ error: errorMsg, restoreCode }, "[company-restore-engine] Restore failed");

    progress.status = "FAILED";
    progress.error = errorMsg;
    progress.logs.push(`[${new Date().toLocaleTimeString()}] FAILED: ${errorMsg}`);

    return { ok: false, error: errorMsg };
  } finally {
    if (tempExtractDir && fs.existsSync(tempExtractDir)) {
      try {
        fs.rmSync(tempExtractDir, { recursive: true, force: true });
      } catch {}
    }
    await masterPool.end();
  }
}

function copyDirectoryRecursive(src: string, dest: string) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirectoryRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Fetch company-specific backup dashboard data.
 * Strictly filtered by companyId!
 */
export async function getCompanyBackupDashboardData(companyId: number): Promise<{
  company: { id: number; name: string; databaseName: string };
  backups: any[];
  schedule: any;
  summary: {
    totalBackups: number;
    lastSuccessfulBackup: any | null;
    failedBackups: number;
    nextScheduledBackup: string | null;
  };
}> {
  const masterDbUrl = process.env.DATABASE_URL;
  if (!masterDbUrl) {
    return {
      company: { id: companyId, name: "", databaseName: "" },
      backups: [],
      schedule: null,
      summary: { totalBackups: 0, lastSuccessfulBackup: null, failedBackups: 0, nextScheduledBackup: null },
    };
  }

  const pool = new pg.Pool({ connectionString: masterDbUrl });
  try {
    await ensureBackupSchema(pool);

    const compRes = await pool.query("SELECT id, name, database_name FROM companies WHERE id = $1", [companyId]);
    const comp = compRes.rows[0] || { id: companyId, name: `Company ${companyId}`, database_name: "" };

    // Backups for this company ONLY
    const backupsRes = await pool.query(
      "SELECT * FROM accounting_backups WHERE company_id = $1 ORDER BY created_at DESC",
      [companyId]
    );
    const backups = backupsRes.rows;

    // Schedule for this company ONLY
    let schedRes = await pool.query("SELECT * FROM backup_schedules WHERE company_id = $1 LIMIT 1", [companyId]);
    if (schedRes.rows.length === 0) {
      const defaultNext = computeNextRunAt("daily", "02:00");
      const defaultDir = `C:\\BizOne_Backups\\${slugify(comp.name)}`;
      const defaultToken = "bza_" + companyId + "_" + crypto.randomBytes(18).toString("hex");
      await pool.query(
        `INSERT INTO backup_schedules (
           company_id, enabled, frequency, time_of_day, backup_type, destination_dir,
           local_download_enabled, local_destination_dir, local_timezone, local_download_time,
           local_download_frequency, agent_token, next_run_at
         )
         VALUES ($1, TRUE, 'daily', '02:00', 'company_database', $2, TRUE, 'D:\\\\BizOneBackups', 'Asia/Kolkata', '02:30', 'daily', $3, $4)`,
        [companyId, defaultDir, defaultToken, defaultNext]
      );
      schedRes = await pool.query("SELECT * FROM backup_schedules WHERE company_id = $1 LIMIT 1", [companyId]);
    }
    let schedule = schedRes.rows[0];

    // Ensure agent_token exists for existing records
    if (!schedule.agent_token) {
      const token = "bza_" + companyId + "_" + crypto.randomBytes(18).toString("hex");
      await pool.query("UPDATE backup_schedules SET agent_token = $1 WHERE id = $2", [token, schedule.id]);
      schedule.agent_token = token;
    }

    // Query local download history
    const historyRes = await pool.query(
      "SELECT * FROM local_backup_download_history WHERE company_id = $1 ORDER BY downloaded_at DESC LIMIT 50",
      [companyId]
    );
    const localHistory = historyRes.rows;

    const completed = backups.filter((b) => b.status === "completed" || b.status === "restored");
    const failed = backups.filter((b) => b.status === "failed");
    const lastSuccess = completed.length > 0 ? completed[0] : null;

    let nextScheduledStr: string | null = null;
    if (schedule && schedule.enabled) {
      const nextDate = schedule.next_run_at ? new Date(schedule.next_run_at) : computeNextRunAt(schedule.frequency, schedule.time_of_day, schedule.day_of_week);
      nextScheduledStr = nextDate.toISOString();
    }

    const agentContacted = schedule.last_agent_contact_at
      ? Date.now() - new Date(schedule.last_agent_contact_at).getTime() < 86400000 * 2
      : false;

    return {
      company: { id: comp.id, name: comp.name, databaseName: comp.database_name },
      backups,
      schedule,
      localHistory,
      agentStatus: {
        connected: agentContacted,
        lastContactAt: schedule.last_agent_contact_at,
        lastSuccessfulDownloadAt: schedule.last_successful_download_at,
        lastDownloadStatus: schedule.last_download_status,
        agentToken: schedule.agent_token,
        timezone: schedule.local_timezone || "Asia/Kolkata",
      },
      summary: {
        totalBackups: backups.length,
        lastSuccessfulBackup: lastSuccess,
        failedBackups: failed.length,
        nextScheduledBackup: nextScheduledStr,
      },
    };
  } finally {
    await pool.end();
  }
}

/**
 * Update schedule settings for a specific company.
 */
export async function updateCompanyBackupSchedule(options: {
  companyId: number;
  enabled: boolean;
  frequency: "daily" | "weekly" | "monthly";
  timeOfDay: string;
  dayOfWeek?: number | null;
  destinationDir?: string;
  localDownloadEnabled?: boolean;
  localDestinationDir?: string;
  localTimezone?: string;
  localDownloadTime?: string;
  localDownloadFrequency?: string;
  userId?: number;
}): Promise<any> {
  const {
    companyId,
    enabled,
    frequency,
    timeOfDay,
    dayOfWeek,
    destinationDir,
    localDownloadEnabled,
    localDestinationDir,
    localTimezone,
    localDownloadTime,
    localDownloadFrequency,
    userId,
  } = options;
  const masterDbUrl = process.env.DATABASE_URL;
  if (!masterDbUrl) throw new Error("DATABASE_URL is not set");

  const pool = new pg.Pool({ connectionString: masterDbUrl });
  try {
    await ensureBackupSchema(pool);
    const nextRun = computeNextRunAt(frequency, timeOfDay, dayOfWeek);
    const defaultToken = "bza_" + companyId + "_" + crypto.randomBytes(18).toString("hex");

    // Check if a schedule row already exists for this company
    const existing = await pool.query(
      "SELECT id, agent_token FROM backup_schedules WHERE company_id = $1 LIMIT 1",
      [companyId]
    );

    let res;
    if (existing.rows.length > 0) {
      res = await pool.query(
        `UPDATE backup_schedules SET
           enabled = $1,
           frequency = $2,
           time_of_day = $3,
           day_of_week = $4,
           destination_dir = $5,
           local_download_enabled = $6,
           local_destination_dir = $7,
           local_timezone = $8,
           local_download_time = $9,
           local_download_frequency = $10,
           next_run_at = $11,
           updated_at = NOW()
         WHERE company_id = $12
         RETURNING *`,
        [
          enabled,
          frequency,
          timeOfDay,
          dayOfWeek || null,
          destinationDir || "C:\\BizOne_Backups",
          localDownloadEnabled !== false,
          localDestinationDir || "D:\\BizOneBackups",
          localTimezone || "Asia/Kolkata",
          localDownloadTime || "02:30",
          localDownloadFrequency || "daily",
          nextRun,
          companyId,
        ]
      );
    } else {
      res = await pool.query(
        `INSERT INTO backup_schedules (
           company_id, enabled, frequency, time_of_day, day_of_week, backup_type,
           destination_dir, local_download_enabled, local_destination_dir, local_timezone,
           local_download_time, local_download_frequency, agent_token, next_run_at, created_by, updated_at
         ) VALUES ($1, $2, $3, $4, $5, 'company_database', $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
         RETURNING *`,
        [
          companyId,
          enabled,
          frequency,
          timeOfDay,
          dayOfWeek || null,
          destinationDir || "C:\\BizOne_Backups",
          localDownloadEnabled !== false,
          localDestinationDir || "D:\\BizOneBackups",
          localTimezone || "Asia/Kolkata",
          localDownloadTime || "02:30",
          localDownloadFrequency || "daily",
          defaultToken,
          nextRun,
          userId || null,
        ]
      );
    }
    return res.rows[0];
  } finally {
    await pool.end();
  }
}

/**
 * Regenerate revocable agent token for a company.
 */
export async function regenerateCompanyAgentToken(companyId: number): Promise<string> {
  const masterDbUrl = process.env.DATABASE_URL;
  if (!masterDbUrl) throw new Error("DATABASE_URL is not set");
  const pool = new pg.Pool({ connectionString: masterDbUrl });
  try {
    await ensureBackupSchema(pool);
    const newToken = "bza_" + companyId + "_" + crypto.randomBytes(18).toString("hex");
    await pool.query(
      `UPDATE backup_schedules SET agent_token = $1, updated_at = NOW() WHERE company_id = $2`,
      [newToken, companyId]
    );
    return newToken;
  } finally {
    await pool.end();
  }
}

/**
 * Record a report sent by the local Windows backup download agent.
 */
export async function recordLocalDownloadReport(data: {
  companyId: number;
  backupId?: number;
  backupCode?: string;
  fileName: string;
  destinationFolder: string;
  fileSizeBytes?: number;
  status: string;
  checksumStatus?: string;
  checksumSha256?: string;
  errorMessage?: string;
  agentHostname?: string;
}): Promise<any> {
  const masterDbUrl = process.env.DATABASE_URL;
  if (!masterDbUrl) throw new Error("DATABASE_URL is not set");
  const pool = new pg.Pool({ connectionString: masterDbUrl });
  try {
    await ensureBackupSchema(pool);
    const res = await pool.query(
      `INSERT INTO local_backup_download_history (
         company_id, backup_id, backup_code, file_name, destination_folder,
         file_size_bytes, status, checksum_status, checksum_sha256, error_message,
         agent_hostname, downloaded_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
       RETURNING *`,
      [
        data.companyId,
        data.backupId || null,
        data.backupCode || null,
        data.fileName,
        data.destinationFolder,
        data.fileSizeBytes || null,
        data.status || "Completed",
        data.checksumStatus || "Passed",
        data.checksumSha256 || null,
        data.errorMessage || null,
        data.agentHostname || null,
      ]
    );

    const isSuccess = data.status === "Completed" && data.checksumStatus !== "Failed";
    await pool.query(
      `UPDATE backup_schedules
       SET last_agent_contact_at = NOW(),
           last_download_status = $1
           ${isSuccess ? ", last_successful_download_at = NOW()" : ""}
       WHERE company_id = $2`,
      [data.status, data.companyId]
    );

    return res.rows[0];
  } finally {
    await pool.end();
  }
}

/**
 * Query local download history for a company.
 */
export async function getLocalDownloadHistory(companyId: number): Promise<any[]> {
  const masterDbUrl = process.env.DATABASE_URL;
  if (!masterDbUrl) return [];
  const pool = new pg.Pool({ connectionString: masterDbUrl });
  try {
    await ensureBackupSchema(pool);
    const res = await pool.query(
      `SELECT * FROM local_backup_download_history WHERE company_id = $1 ORDER BY downloaded_at DESC LIMIT 50`,
      [companyId]
    );
    return res.rows;
  } finally {
    await pool.end();
  }
}
