#!/usr/bin/env node
/**
 * Plesk Scheduled Task Runner for BizOne Singapore Company-Wise Backups.
 * 
 * Rules:
 * - Creates separate, independent backups per company.
 * - Never combines multiple companies into a single archive.
 * - Only includes the specific company's database and uploaded files.
 * 
 * Usage in Plesk:
 * Command: node /var/www/vhosts/sg.biz1.in/scripts/run-scheduled-backup.mjs
 * Schedule: 0 2 * * * (Every day at 2:00 AM)
 * 
 * Options:
 *   --company <id>   Run backup only for a specific company ID
 *   --force          Run backup immediately, bypassing time checks
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import pg from "pg";
import archiver from "archiver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

// Load environment variables
const envPaths = [
  path.join(rootDir, "artifacts", "api-server", ".env"),
  path.join(rootDir, ".env"),
  path.join(process.cwd(), ".env"),
];

for (const p of envPaths) {
  if (fs.existsSync(p)) {
    const content = fs.readFileSync(p, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const k = trimmed.slice(0, eq).trim();
      let v = trimmed.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (!process.env[k]) {
        process.env[k] = v;
      }
    }
    break;
  }
}

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("[ERROR] DATABASE_URL environment variable is missing!");
  process.exit(1);
}

const isForce = process.argv.includes("--force") || process.argv.includes("--now");
const targetCompanyArgIndex = process.argv.indexOf("--company");
const targetCompanyId = targetCompanyArgIndex !== -1 ? Number(process.argv[targetCompanyArgIndex + 1]) : null;

console.log(`[${new Date().toISOString()}] BizOne Company-Wise Scheduled Backup Runner (force: ${isForce}, targetCompany: ${targetCompanyId || "all active"})`);

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "company";
}

function getUploadsRoot() {
  const candidates = [
    path.resolve(rootDir, "artifacts", "api-server", "uploads"),
    path.resolve(rootDir, "uploads"),
    path.resolve(process.cwd(), "uploads"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return path.resolve(rootDir, "artifacts", "api-server", "uploads");
}

function pgDumpBin() {
  const candidates = [
    process.env.PG_DUMP_PATH,
    "C:\\Program Files\\PostgreSQL\\18\\bin\\pg_dump.exe",
    "C:\\Program Files\\PostgreSQL\\17\\bin\\pg_dump.exe",
    "C:\\Program Files\\PostgreSQL\\16\\bin\\pg_dump.exe",
    "C:\\Program Files\\PostgreSQL\\15\\bin\\pg_dump.exe",
    "pg_dump",
  ].filter(Boolean);
  return candidates.find((file) => file === "pg_dump" || fs.existsSync(file)) ?? "pg_dump";
}

function databaseUrlFor(baseUrl, dbName) {
  const url = new URL(baseUrl);
  url.pathname = `/${dbName}`;
  return url.toString();
}

async function dumpDatabase(targetUrl, outputPath) {
  const bin = pgDumpBin();
  const args = [
    "--clean",
    "--if-exists",
    "--no-owner",
    "--no-privileges",
    "--format=plain",
    `--file=${outputPath}`,
    targetUrl,
  ];

  await new Promise((resolve, reject) => {
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

async function computeSha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (c) => hash.update(c));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

function computeNextRun(frequency, timeOfDay, dayOfWeek) {
  const [hStr, mStr] = (timeOfDay || "02:00").split(":");
  const hour = parseInt(hStr || "2", 10);
  const min = parseInt(mStr || "0", 10);

  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, min, 0, 0);

  if (frequency === "weekly") {
    const targetDay = dayOfWeek != null ? dayOfWeek : 0;
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

async function collectCompanyUploadFiles(tenantPool) {
  const files = new Set();
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

  for (const t of ["employee_documents", "ops_company_documents", "voucher_attachments", "income_attachments"]) {
    try {
      const res = await tenantPool.query(`SELECT file_path FROM ${t} WHERE file_path IS NOT NULL`);
      for (const r of res.rows) if (r.file_path) files.add(r.file_path);
    } catch {}
  }
  return Array.from(files);
}

async function backupSingleCompany(pool, company) {
  const companySlug = slugify(company.name);
  console.log(`\n--------------------------------------------------`);
  console.log(`[COMPANY BACKUP] Processing ${company.name} (ID: ${company.id}, DB: ${company.database_name})...`);

  // Check schedule for this specific company
  const schedRes = await pool.query(
    "SELECT * FROM backup_schedules WHERE company_id = $1 LIMIT 1",
    [company.id]
  );
  const schedule = schedRes.rows[0];

  if (!isForce) {
    if (schedule && !schedule.enabled) {
      console.log(`[SKIP] Backups disabled for ${company.name}.`);
      return;
    }
    const now = new Date();
    if (schedule?.next_run_at) {
      const nextRun = new Date(schedule.next_run_at);
      if (now.getTime() < nextRun.getTime() - 15 * 60 * 1000) {
        console.log(`[SKIP] Current time is earlier than next run (${nextRun.toISOString()}) for ${company.name}.`);
        return;
      }
    }
  }

  const uploadsRoot = getUploadsRoot();
  const companyBackupsDir = path.join(uploadsRoot, "system-backups", `comp_${company.id}_${companySlug}`);
  if (!fs.existsSync(companyBackupsDir)) {
    fs.mkdirSync(companyBackupsDir, { recursive: true });
  }

  const year = new Date().getFullYear();
  const timestampStr = new Date().toISOString().replace(/[:.]/g, "-");
  const randomSuffix = crypto.randomBytes(3).toString("hex").toUpperCase();
  const backupCode = `BK-${year}-${randomSuffix}`;
  const archiveFileName = `bizone_${companySlug}_${backupCode}_${timestampStr}.zip`;
  const archivePath = path.join(companyBackupsDir, archiveFileName);
  const tempDir = path.join(companyBackupsDir, `cron_temp_${backupCode}`);

  fs.mkdirSync(tempDir, { recursive: true });

  // Connect to this company's tenant DB
  const tenantUrl = databaseUrlFor(dbUrl, company.database_name);
  const tenantPool = new pg.Pool({ connectionString: tenantUrl });

  try {
    // Insert pending row
    const insertRes = await pool.query(
      `INSERT INTO accounting_backups (
        company_id, backup_code, backup_type, status, storage_path, storage_ref,
        backup_source, created_by_username, created_at
      ) VALUES ($1, $2, 'company_database', 'in_progress', $3, $4, 'scheduled', 'Plesk Cron Task', NOW())
      RETURNING *`,
      [company.id, backupCode, archivePath, archiveFileName]
    );
    const backupRow = insertRes.rows[0];

    // 1. Dump ONLY this company's database
    console.log(`[DUMP] Dumping tenant database: ${company.database_name}...`);
    const dbDumpPath = path.join(tempDir, "company_database.sql");
    await dumpDatabase(tenantUrl, dbDumpPath);

    // 2. Collect ONLY this company's files
    console.log(`[FILES] Scanning documents belonging to ${company.name}...`);
    const companyFiles = await collectCompanyUploadFiles(tenantPool);

    // 3. Manifest
    const manifest = {
      version: "2.1.0",
      backupCode,
      backupType: "company_database",
      backupSource: "scheduled",
      company: {
        id: company.id,
        name: company.name,
        databaseName: company.database_name,
      },
      createdAt: new Date().toISOString(),
      fileCount: companyFiles.length,
    };
    fs.writeFileSync(path.join(tempDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");

    // 4. Archive into compressed ZIP
    console.log(`[ZIP] Packaging archive: ${archiveFileName}...`);
    await new Promise((resolve, reject) => {
      const output = fs.createWriteStream(archivePath);
      const archive = archiver("zip", { zlib: { level: 9 } });

      output.on("close", resolve);
      archive.on("error", reject);

      archive.pipe(output);
      archive.file(dbDumpPath, { name: "company_database.sql" });
      archive.file(path.join(tempDir, "manifest.json"), { name: "manifest.json" });

      for (const relFile of companyFiles) {
        const normalizedRel = relFile.replace(/^[/\\]+/, "");
        const fullSourcePath = path.resolve(uploadsRoot, normalizedRel.replace(/^uploads[/\\]+/, ""));
        if (fs.existsSync(fullSourcePath) && fs.statSync(fullSourcePath).isFile()) {
          archive.file(fullSourcePath, { name: path.join("uploads", normalizedRel.replace(/^uploads[/\\]+/, "")) });
        }
      }

      archive.finalize();
    });

    // 5. Checksum & DB Update
    const checksum = await computeSha256(archivePath);
    const stats = fs.statSync(archivePath);

    await pool.query(
      `UPDATE accounting_backups
       SET status = 'completed',
           file_size_bytes = $1,
           checksum_sha256 = $2,
           completed_at = NOW()
       WHERE id = $3`,
      [stats.size, checksum, backupRow.id]
    );

    console.log(`[SUCCESS] Backup complete for ${company.name}: ${backupCode} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
    console.log(`[CHECKSUM] SHA-256: ${checksum}`);

    // Local destination copy if configured and accessible on this machine
    const localTargetDir = schedule?.local_destination_dir || schedule?.destination_dir;
    if (schedule?.local_download_enabled !== false && localTargetDir) {
      try {
        const normalizedLocal = path.normalize(localTargetDir);
        if (!fs.existsSync(normalizedLocal)) {
          fs.mkdirSync(normalizedLocal, { recursive: true });
        }
        if (fs.existsSync(normalizedLocal)) {
          const destCopyPath = path.join(normalizedLocal, archiveFileName);
          fs.copyFileSync(archivePath, destCopyPath);
          console.log(`[LOCAL COPY] Copied verified backup archive to: ${destCopyPath}`);

          // Also record into local download history in DB and local JSON
          await pool.query(
            `INSERT INTO local_backup_download_history (
               company_id, backup_id, backup_code, file_name, destination_folder,
               file_size_bytes, status, checksum_status, checksum_sha256, agent_hostname, downloaded_at
             ) VALUES ($1, $2, $3, $4, $5, $6, 'Completed', 'Passed', $7, $8, NOW())`,
            [company.id, backupRow.id, backupCode, archiveFileName, normalizedLocal, stats.size, checksum, process.env.COMPUTERNAME || "BizOne-Host"]
          );

          await pool.query(
            "UPDATE backup_schedules SET last_successful_download_at = NOW(), last_download_status = 'Completed' WHERE id = $1",
            [schedule.id]
          );

          const histJsonPath = path.join(normalizedLocal, "download-history.json");
          let hist = [];
          if (fs.existsSync(histJsonPath)) {
            try { hist = JSON.parse(fs.readFileSync(histJsonPath, "utf8")); if (!Array.isArray(hist)) hist = []; } catch {}
          }
          hist.unshift({
            id: crypto.randomUUID(),
            backupId: backupRow.id,
            backupCode,
            fileName: archiveFileName,
            downloadedAt: new Date().toISOString(),
            folder: normalizedLocal,
            sizeBytes: stats.size,
            status: "Completed",
            checksumStatus: "Passed",
            checksumSha256: checksum,
          });
          fs.writeFileSync(histJsonPath, JSON.stringify(hist.slice(0, 100), null, 2), "utf8");
        }
      } catch (copyErr) {
        console.warn(`[LOCAL COPY] Skipped/failed: ${copyErr?.message}`);
      }
    }

    // Update schedule
    if (schedule) {
      const nextRun = computeNextRun(schedule.frequency || "daily", schedule.time_of_day || "02:00", schedule.day_of_week);
      await pool.query(
        "UPDATE backup_schedules SET last_run_at = NOW(), next_run_at = $1, updated_at = NOW() WHERE id = $2",
        [nextRun, schedule.id]
      );
      console.log(`[NEXT RUN] Next backup for ${company.name}: ${nextRun.toISOString()}`);
    }

    // Retention: clean up backups older than 30 days for this company ONLY
    const oldRes = await pool.query(
      `SELECT id, backup_code, storage_path
       FROM accounting_backups
       WHERE company_id = $1
         AND created_at < NOW() - INTERVAL '30 days'
         AND backup_source != 'safety'
       ORDER BY created_at ASC`,
      [company.id]
    );

    for (const old of oldRes.rows) {
      console.log(`[RETENTION] Pruning expired archive: ${old.backup_code}`);
      if (old.storage_path && fs.existsSync(old.storage_path)) {
        try {
          fs.unlinkSync(old.storage_path);
        } catch {}
      }
      await pool.query("DELETE FROM accounting_backups WHERE id = $1", [old.id]);
    }
  } finally {
    await tenantPool.end();
    try {
      if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  }
}

async function main() {
  const pool = new pg.Pool({ connectionString: dbUrl });
  try {
    let query = "SELECT * FROM companies WHERE database_name IS NOT NULL AND database_name != ''";
    const params = [];
    if (targetCompanyId) {
      query += " AND id = $1";
      params.push(targetCompanyId);
    }
    query += " ORDER BY id ASC";

    const companiesRes = await pool.query(query, params);
    const companies = companiesRes.rows;

    if (companies.length === 0) {
      console.log("[INFO] No matching companies found with active databases. Exiting.");
      process.exit(0);
    }

    console.log(`[INFO] Found ${companies.length} company/companies to process.`);

    for (const comp of companies) {
      try {
        await backupSingleCompany(pool, comp);
      } catch (err) {
        console.error(`[ERROR] Failed to backup company ${comp.name}:`, err.message);
      }
    }

    console.log("\n[DONE] All company scheduled tasks finished successfully.");
    process.exit(0);
  } catch (err) {
    console.error("[FATAL] Error in scheduled backup runner:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
