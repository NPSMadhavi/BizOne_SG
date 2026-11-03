import { Router, type IRouter } from "express";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import pg from "pg";
import multer from "multer";
import extractZip from "extract-zip";
import { getUploadsRoot } from "../lib/ensure-uploads.js";
import {
  createCompanyBackup,
  getCompanyBackupDashboardData,
  validateCompanyBackupArchive,
  executeCompanyRestore,
  updateCompanyBackupSchedule,
  regenerateCompanyAgentToken,
  recordLocalDownloadReport,
  getLocalDownloadHistory,
  ensureBackupSchema,
  activeBackupOperations,
  activeRestoreOperations,
  computeFileSha256,
  detectArchiveFormat,
  getCompanyBackupsDir,
} from "../lib/system-backup-engine.js";
import { logAudit } from "../lib/audit.js";

const router: IRouter = Router();

const tempUploadDir = path.join(getUploadsRoot(), "temp_restore_uploads");
if (!fs.existsSync(tempUploadDir)) {
  fs.mkdirSync(tempUploadDir, { recursive: true });
}

const restoreArchiveUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, tempUploadDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || ".dump";
      const unique = `${Date.now()}_${crypto.randomBytes(6).toString("hex")}`;
      cb(null, `restore_upload_${unique}${ext}`);
    },
  }),
  limits: {
    fileSize: 2 * 1024 * 1024 * 1024, // 2GB limit
  },
});

async function requireCompanyAuth(req: any, res: any): Promise<number | null> {
  if (!req.session?.userId) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }
  const role = String(req.session.userRole || "").toLowerCase();
  const isAdm =
    Boolean(req.session.isAdmin) ||
    role === "admin" ||
    role === "administrator" ||
    role === "accountant";
  if (!isAdm) {
    res.status(403).json({ error: "Administrator authorization required for Backup & Restore operations" });
    return null;
  }

  // Strictly use session companyId. Never trust companyId from request body or query params!
  let companyId = req.session.companyId;
  if (!companyId) {
    res.status(400).json({ error: "No authorized company active in session. Please select a company." });
    return null;
  }

  return Number(companyId);
}

async function resolveAgentAuth(req: any, pool: pg.Pool): Promise<{
  authorized: boolean;
  companyId: number | null;
  company: any | null;
  schedule: any | null;
}> {
  const agentKey = ((req.headers["x-backup-agent-key"] as string) || (req.query.agentKey as string) || "").trim();
  const configuredKey = process.env.BACKUP_AGENT_KEY || "bizone-backup-sync-key";

  // 1. Session admin authentication
  if (req.session?.userId && (req.session.isAdmin || req.session.userRole === "admin")) {
    const compId = Number(req.session.companyId || req.query.companyId || 0);
    if (compId) {
      const cRes = await pool.query("SELECT * FROM companies WHERE id = $1", [compId]);
      const sRes = await pool.query("SELECT * FROM backup_schedules WHERE company_id = $1", [compId]);
      return { authorized: true, companyId: compId, company: cRes.rows[0], schedule: sRes.rows[0] };
    }
  }

  if (!agentKey) {
    return { authorized: false, companyId: null, company: null, schedule: null };
  }

  // 2. Per-company revocable agent token
  const tokenMatch = await pool.query("SELECT * FROM backup_schedules WHERE agent_token = $1", [agentKey]);
  if (tokenMatch.rows[0]) {
    const sched = tokenMatch.rows[0];
    const compRes = await pool.query("SELECT * FROM companies WHERE id = $1", [sched.company_id]);
    return { authorized: true, companyId: sched.company_id, company: compRes.rows[0], schedule: sched };
  }

  // 3. Global fallback agent key or SESSION_SECRET
  if (agentKey === configuredKey || (process.env.SESSION_SECRET && agentKey === process.env.SESSION_SECRET)) {
    let targetId = Number(req.query.companyId || req.body?.companyId || 0);
    if (!targetId && req.query.companySlug) {
      const cRes = await pool.query(
        "SELECT id FROM companies WHERE LOWER(name) LIKE $1 OR LOWER(database_name) LIKE $1 LIMIT 1",
        [`%${String(req.query.companySlug).toLowerCase()}%`]
      );
      if (cRes.rows[0]) targetId = cRes.rows[0].id;
    }
    if (!targetId) {
      const firstComp = await pool.query("SELECT id FROM companies ORDER BY id ASC LIMIT 1");
      targetId = firstComp.rows[0]?.id;
    }
    if (targetId) {
      const compRes = await pool.query("SELECT * FROM companies WHERE id = $1", [targetId]);
      const sRes = await pool.query("SELECT * FROM backup_schedules WHERE company_id = $1", [targetId]);
      return { authorized: true, companyId: targetId, company: compRes.rows[0], schedule: sRes.rows[0] };
    }
  }

  return { authorized: false, companyId: null, company: null, schedule: null };
}

// GET /system-backups/agent/status - test connection, touch heartbeat, and inspect latest backup
router.get("/system-backups/agent/status", async (req, res): Promise<void> => {
  const masterDbUrl = process.env.DATABASE_URL;
  if (!masterDbUrl) {
    res.status(500).json({ error: "Database not configured" });
    return;
  }
  const pool = new pg.Pool({ connectionString: masterDbUrl });
  try {
    await ensureBackupSchema(pool);
    const auth = await resolveAgentAuth(req, pool);
    if (!auth.authorized || !auth.companyId) {
      res.status(401).json({ error: "Unauthorized access: invalid or missing agent key" });
      return;
    }

    // Touch last_agent_contact_at
    await pool.query("UPDATE backup_schedules SET last_agent_contact_at = NOW() WHERE company_id = $1", [auth.companyId]);

    const latestRes = await pool.query(
      `SELECT * FROM accounting_backups WHERE company_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [auth.companyId]
    );
    const latest = latestRes.rows[0] || null;

    const inProgressOp = Array.from(activeBackupOperations.values()).find(
      (op) => op.companyId === auth.companyId && op.status === "IN_PROGRESS"
    );

    res.json({
      success: true,
      authenticated: true,
      company: {
        id: auth.company?.id || auth.companyId,
        name: auth.company?.name || `Company ${auth.companyId}`,
        databaseName: auth.company?.database_name || "",
      },
      serverSchedule: {
        enabled: auth.schedule?.enabled ?? true,
        frequency: auth.schedule?.frequency || "daily",
        timeOfDay: auth.schedule?.time_of_day || "02:00",
        nextRunAt: auth.schedule?.next_run_at,
      },
      localSchedule: {
        enabled: auth.schedule?.local_download_enabled ?? true,
        destinationDir: auth.schedule?.local_destination_dir || `D:\\BizOneBackups\\${auth.company?.name || "Company"}`,
        timezone: auth.schedule?.local_timezone || "Asia/Kolkata",
        downloadTime: auth.schedule?.local_download_time || "02:30",
        downloadFrequency: auth.schedule?.local_download_frequency || "daily",
        lastSuccessfulDownloadAt: auth.schedule?.last_successful_download_at,
        lastAgentContactAt: new Date().toISOString(),
      },
      latestBackup: latest
        ? {
          id: latest.id,
          backupCode: latest.backup_code,
          status: inProgressOp ? "IN_PROGRESS" : latest.status,
          fileName: latest.storage_ref || (latest.storage_path ? path.basename(latest.storage_path) : null),
          fileSizeBytes: latest.file_size_bytes,
          checksumSha256: latest.checksum_sha256,
          createdAt: latest.created_at,
          completedAt: latest.completed_at,
        }
        : null,
      serverTime: new Date().toISOString(),
    });
  } finally {
    await pool.end();
  }
});

// POST /system-backups/agent/report - record local Windows agent download execution results
router.post("/system-backups/agent/report", async (req, res): Promise<void> => {
  const masterDbUrl = process.env.DATABASE_URL;
  if (!masterDbUrl) {
    res.status(500).json({ error: "Database not configured" });
    return;
  }
  const pool = new pg.Pool({ connectionString: masterDbUrl });
  try {
    await ensureBackupSchema(pool);
    const auth = await resolveAgentAuth(req, pool);
    if (!auth.authorized || !auth.companyId) {
      res.status(401).json({ error: "Unauthorized agent report" });
      return;
    }

    const {
      backupId,
      backupCode,
      fileName,
      destinationFolder,
      fileSizeBytes,
      status,
      checksumStatus,
      checksumSha256,
      errorMessage,
      agentHostname,
    } = req.body;

    const report = await recordLocalDownloadReport({
      companyId: auth.companyId,
      backupId: backupId ? Number(backupId) : undefined,
      backupCode,
      fileName: fileName || "unknown_backup.zip",
      destinationFolder: destinationFolder || auth.schedule?.local_destination_dir || "D:\\BizOneBackups",
      fileSizeBytes: fileSizeBytes ? Number(fileSizeBytes) : undefined,
      status: status || "Completed",
      checksumStatus: checksumStatus || "Passed",
      checksumSha256,
      errorMessage,
      agentHostname,
    });

    res.json({ success: true, report });
  } finally {
    await pool.end();
  }
});

// POST /system-backups/agent/token/regenerate - generate a fresh revocable token for active company
router.post("/system-backups/agent/token/regenerate", async (req, res): Promise<void> => {
  const companyId = await requireCompanyAuth(req, res);
  if (!companyId) return;

  try {
    const token = await regenerateCompanyAgentToken(companyId);
    logAudit({
      req,
      action: "agent_token_regenerated",
      entityType: "system_backup",
      details: { companyId },
    });
    res.json({ success: true, token });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to regenerate agent token" });
  }
});

// POST /system-backups/agent/run-local - trigger Windows agent execution immediately from UI
router.post("/system-backups/agent/run-local", async (req, res): Promise<void> => {
  const masterDbUrl = process.env.DATABASE_URL;
  let companyId: number | null = null;
  if (masterDbUrl && (req.headers["x-backup-agent-key"] || req.query.companyId || req.query.companySlug)) {
    const pool = new pg.Pool({ connectionString: masterDbUrl });
    try {
      const agentAuth = await resolveAgentAuth(req, pool);
      if (agentAuth) companyId = agentAuth.companyId;
    } finally {
      await pool.end();
    }
  }
  if (!companyId) {
    companyId = await requireCompanyAuth(req, res);
  }
  if (!companyId) return;

  if (process.platform !== "win32") {
    res.status(400).json({ error: "Local agent execution is only supported on Windows host environments" });
    return;
  }

  const rootDir = path.resolve(process.cwd());
  const possiblePaths = [
    path.join(rootDir, "scripts", "windows-backup-agent.ps1"),
    path.join(rootDir, "..", "scripts", "windows-backup-agent.ps1"),
    path.join(rootDir, "..", "..", "scripts", "windows-backup-agent.ps1"),
    "C:\\BizOne_SG\\scripts\\windows-backup-agent.ps1",
  ];
  const agentScript = possiblePaths.find((p) => fs.existsSync(p));
  if (!agentScript) {
    res.status(404).json({ error: "windows-backup-agent.ps1 script not found on server" });
    return;
  }

  try {
    const ps = spawn(
      "powershell.exe",
      ["-ExecutionPolicy", "Bypass", "-NoProfile", "-File", agentScript, "-CompanyId", String(companyId)],
      { windowsHide: true }
    );

    let output = "";
    ps.stdout.on("data", (data) => { output += data.toString(); });
    ps.stderr.on("data", (data) => { output += data.toString(); });

    ps.on("close", (code) => {
      if (code === 0) {
        res.json({
          success: true,
          message: "Local backup download completed successfully!",
          output: output.split("\n").slice(-8).join("\n"),
        });
      } else {
        res.status(500).json({
          error: "Agent download script finished with error",
          output: output.split("\n").slice(-8).join("\n"),
        });
      }
    });

    ps.on("error", (err) => {
      res.status(500).json({ error: err.message || "Failed to launch PowerShell agent" });
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to execute Windows backup agent" });
  }
});

// GET /system-backups/download-history - fetch local Windows agent download history
router.get("/system-backups/download-history", async (req, res): Promise<void> => {
  const masterDbUrl = process.env.DATABASE_URL;
  let companyId: number | null = null;
  if (masterDbUrl && (req.headers["x-backup-agent-key"] || req.query.companyId || req.query.companySlug)) {
    const pool = new pg.Pool({ connectionString: masterDbUrl });
    try {
      const agentAuth = await resolveAgentAuth(req, pool);
      if (agentAuth) companyId = agentAuth.companyId;
    } finally {
      await pool.end();
    }
  }
  if (!companyId) {
    companyId = await requireCompanyAuth(req, res);
  }
  if (!companyId) return;

  try {
    const history = await getLocalDownloadHistory(companyId);
    res.json({ history });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to load local download history" });
  }
});

// GET /system-backups/latest/download - for Windows automated client agent
router.get("/system-backups/latest/download", async (req, res): Promise<void> => {
  const masterDbUrl = process.env.DATABASE_URL;
  if (!masterDbUrl) {
    res.status(500).json({ error: "Database not configured" });
    return;
  }

  const pool = new pg.Pool({ connectionString: masterDbUrl });
  try {
    await ensureBackupSchema(pool);
    const auth = await resolveAgentAuth(req, pool);
    if (!auth.authorized || !auth.companyId) {
      res.status(401).json({ error: "Unauthorized access to backup download: invalid or missing agent key" });
      return;
    }

    const targetCompanyId = auth.companyId;
    const company = auth.company;
    const schedule = auth.schedule;

    // Check if a backup operation is currently running on server
    const activeOp = Array.from(activeBackupOperations.values()).find((op) => op.companyId === targetCompanyId);
    if (activeOp && activeOp.status !== "COMPLETED" && activeOp.status !== "FAILED") {
      res.status(423).json({
        status: "IN_PROGRESS",
        error: "Server backup is currently in progress. Please retry in 30 seconds.",
        progressPercent: activeOp.percent,
        backupCode: activeOp.backupCode,
      });
      return;
    }

    // Touch last_agent_contact_at
    await pool.query("UPDATE backup_schedules SET last_agent_contact_at = NOW() WHERE company_id = $1", [targetCompanyId]);

    const destinationDir = schedule?.local_destination_dir || schedule?.destination_dir || `D:\\BizOneBackups\\${company?.name || "Company"}`;

    const r = await pool.query(
      `SELECT * FROM accounting_backups
       WHERE company_id = $1 AND (status = 'completed' OR status = 'restored')
       ORDER BY created_at DESC LIMIT 1`,
      [targetCompanyId]
    );
    const b = r.rows[0];
    if (!b || !b.storage_path || !fs.existsSync(b.storage_path)) {
      res.status(404).json({
        error: `No completed backup found for company ${company?.name || targetCompanyId}`,
        companyId: targetCompanyId,
      });
      return;
    }

    res.setHeader("X-Company-Id", String(targetCompanyId));
    res.setHeader("X-Company-Name", company?.name || "Company");
    res.setHeader("X-Destination-Dir", destinationDir);
    res.setHeader("X-Backup-Id", String(b.id));
    res.setHeader("X-Backup-Code", b.backup_code);
    res.setHeader("X-Checksum-Sha256", b.checksum_sha256 || "");
    res.setHeader("X-File-Size", String(b.file_size_bytes || 0));
    const filename = b.storage_ref || path.basename(b.storage_path);
    const contentType = filename.endsWith(".dump") ? "application/octet-stream" : "application/zip";
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", contentType);
    fs.createReadStream(b.storage_path).pipe(res);
  } finally {
    await pool.end();
  }
});

// GET /system-backups - dashboard data for the active company ONLY
router.get("/system-backups", async (req, res): Promise<void> => {
  const companyId = await requireCompanyAuth(req, res);
  if (!companyId) return;

  try {
    const data = await getCompanyBackupDashboardData(companyId);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to load backup dashboard data" });
  }
});

// POST /system-backups/browse-folder - open native Windows folder picker helper
router.post("/system-backups/browse-folder", async (req, res): Promise<void> => {
  const companyId = await requireCompanyAuth(req, res);
  if (!companyId) return;

  if (process.platform !== "win32") {
    res.json({
      supported: false,
      message: "Native Windows folder browser helper is only available on Windows hosts.",
    });
    return;
  }

  const rawPath = typeof req.body?.initialPath === "string" ? req.body.initialPath.trim() : "";
  const initialPath = rawPath || "C:\\BizOneBackups";

  const psScript = `
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = "Select Local Backup Destination Folder"
$dialog.SelectedPath = "${initialPath.replace(/["`$]/g, "")}"
$dialog.ShowNewFolderButton = $true
$result = $dialog.ShowDialog()
if ($result -eq [System.Windows.Forms.DialogResult]::OK -and $dialog.SelectedPath) {
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    Write-Output $dialog.SelectedPath
}
`;

  try {
    const ps = spawn(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", psScript],
      { windowsHide: false }
    );

    let output = "";
    ps.stdout.on("data", (data) => {
      output += data.toString();
    });

    const timeout = setTimeout(() => {
      try {
        ps.kill();
      } catch {}
    }, 45000);

    ps.on("close", (code) => {
      clearTimeout(timeout);
      const selectedPath = output.trim();
      if (selectedPath) {
        res.json({ supported: true, success: true, path: selectedPath });
      } else {
        res.json({ supported: true, success: true, path: null, cancelled: true });
      }
    });

    ps.on("error", (err) => {
      clearTimeout(timeout);
      res.json({ supported: false, error: err.message });
    });
  } catch (err: any) {
    res.json({ supported: false, error: err.message });
  }
});

// POST /system-backups/create - trigger immediate company-scoped backup
router.post("/system-backups/create", async (req, res): Promise<void> => {
  const companyId = await requireCompanyAuth(req, res);
  if (!companyId) return;

  const userId = req.session.userId;
  const username = req.session.username || "admin";
  const destinationDir = typeof req.body?.destinationDir === "string" ? req.body.destinationDir.trim() : undefined;

  // Generate real backupCode upfront synchronously
  const now = new Date();
  const randomSuffix = crypto.randomBytes(3).toString("hex").toUpperCase();
  const backupCode = `BK-${now.getFullYear()}-${randomSuffix}`;

  // Register in memory immediately so frontend gets instant real-time progress
  activeBackupOperations.set(backupCode, {
    companyId,
    companyName: req.session.companyName || "Company",
    backupCode,
    type: "manual",
    status: "IN_PROGRESS",
    step: "Preparing backup",
    percent: 10,
    logs: [`[${new Date().toLocaleTimeString()}] Backup initiated for company (${backupCode})`],
    startedAt: new Date().toISOString(),
  });

  logAudit({
    req,
    action: "company_backup_started",
    entityType: "system_backup",
    details: { companyId, backupCode, initiatedBy: username, destinationDir },
  });

  // Start backup in background with the registered backupCode
  createCompanyBackup({
    companyId,
    userId,
    username,
    source: "manual",
    destinationDir,
    backupCode,
  }).then((result) => {
    if (result.ok) {
      logAudit({
        req,
        action: "company_backup_completed",
        entityType: "system_backup",
        entityId: result.backup?.id,
        entityLabel: result.backup?.backup_code,
        details: { companyId, backupCode: result.backup?.backup_code, fileSize: result.backup?.file_size_bytes, savedToLocalPath: result.savedToLocalPath },
      });
    } else {
      logAudit({
        req,
        action: "company_backup_failed",
        entityType: "system_backup",
        details: { companyId, error: result.error },
      });
    }
  }).catch(() => { });

  res.status(202).json({
    message: "Company backup started",
    backupCode,
    status: "IN_PROGRESS",
  });
});

// GET /system-backups/progress/:code - real-time progress polling for company
router.get("/system-backups/progress/:code", async (req, res): Promise<void> => {
  const companyId = await requireCompanyAuth(req, res);
  if (!companyId) return;

  const code = req.params.code;
  let active = activeBackupOperations.get(code);

  // If code is BK-INIT or not found, check if an active operation for this company exists
  if (!active && (code === "BK-INIT" || !code || code.includes("INIT"))) {
    active = Array.from(activeBackupOperations.values()).reverse().find((op) => op.companyId === companyId);
  }

  if (active) {
    if (active.companyId !== companyId) {
      res.status(403).json({ error: "Access denied to this backup progress" });
      return;
    }
    res.json(active);
    return;
  }

  // Query DB
  const masterDbUrl = process.env.DATABASE_URL;
  if (!masterDbUrl) {
    res.status(404).json({ error: "Backup progress not found" });
    return;
  }

  const pool = new pg.Pool({ connectionString: masterDbUrl });
  try {
    let r = await pool.query(
      "SELECT * FROM accounting_backups WHERE backup_code = $1 AND company_id = $2 LIMIT 1",
      [code, companyId]
    );

    // If code was BK-INIT or not found directly, fall back to latest backup for this company
    if (r.rows.length === 0 && (code === "BK-INIT" || !code || code.includes("INIT"))) {
      r = await pool.query(
        "SELECT * FROM accounting_backups WHERE company_id = $1 ORDER BY created_at DESC LIMIT 1",
        [companyId]
      );
    }

    if (r.rows.length === 0) {
      res.status(404).json({ error: "Backup not found for this company" });
      return;
    }
    const b = r.rows[0];

    // Check local download history
    const localHistRes = await pool.query(
      "SELECT destination_folder, status FROM local_backup_download_history WHERE backup_code = $1 ORDER BY downloaded_at DESC LIMIT 1",
      [b.backup_code]
    );
    const localHist = localHistRes.rows[0];

    res.json({
      companyId: b.company_id,
      backupId: b.id,
      backupCode: b.backup_code,
      status: b.status === "completed" ? "COMPLETED" : b.status === "failed" ? "FAILED" : "IN_PROGRESS",
      step: b.status === "completed" ? "Completed" : b.error_message || "Processing...",
      percent: b.status === "completed" ? 100 : b.status === "failed" ? 0 : 50,
      logs: [`Status: ${b.status}`],
      fileSizeBytes: b.file_size_bytes,
      checksumSha256: b.checksum_sha256,
      fileName: b.storage_ref,
      destinationPath: localHist?.destination_folder || b.storage_path,
      localSaved: localHist?.status === "Completed",
      error: b.error_message,
    });
  } finally {
    await pool.end();
  }
});

// GET /system-backups/:id/download - authenticated file download for active company
router.get("/system-backups/:id/download", async (req, res): Promise<void> => {
  const companyId = await requireCompanyAuth(req, res);
  if (!companyId) return;

  const id = Number(req.params.id);
  const masterDbUrl = process.env.DATABASE_URL;
  if (!masterDbUrl) {
    res.status(500).json({ error: "Database not configured" });
    return;
  }

  const pool = new pg.Pool({ connectionString: masterDbUrl });
  try {
    const r = await pool.query(
      "SELECT * FROM accounting_backups WHERE id = $1 AND company_id = $2 LIMIT 1",
      [id, companyId]
    );
    const b = r.rows[0];
    if (!b) {
      res.status(403).json({ error: "Backup not found or does not belong to the selected company" });
      return;
    }

    if (!b.storage_path || !fs.existsSync(b.storage_path)) {
      res.status(404).json({ error: "Backup file not found on disk" });
      return;
    }

    const filename = b.storage_ref || path.basename(b.storage_path);
    const contentType = filename.endsWith(".dump") ? "application/octet-stream" : "application/zip";
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", contentType);
    const stream = fs.createReadStream(b.storage_path);
    stream.pipe(res);

    logAudit({
      req,
      action: "company_backup_downloaded",
      entityType: "system_backup",
      entityId: b.id,
      entityLabel: b.backup_code,
      details: { companyId },
    });
  } finally {
    await pool.end();
  }
});

// POST /system-backups/upload - upload a local backup file from computer and register for restore
router.post("/system-backups/upload", restoreArchiveUpload.single("file"), async (req, res): Promise<void> => {
  const companyId = await requireCompanyAuth(req, res);
  if (!companyId) return;

  const file = (req as any).file as Express.Multer.File | undefined;
  if (!file || !file.path || !fs.existsSync(file.path)) {
    res.status(400).json({ error: "No backup file uploaded" });
    return;
  }

  const masterDbUrl = process.env.DATABASE_URL;
  if (!masterDbUrl) {
    try { fs.unlinkSync(file.path); } catch {}
    res.status(500).json({ error: "Database not configured" });
    return;
  }

  const pool = new pg.Pool({ connectionString: masterDbUrl });
  try {
    await ensureBackupSchema(pool);
    const compRes = await pool.query("SELECT * FROM companies WHERE id = $1", [companyId]);
    const company = compRes.rows[0];
    if (!company) {
      try { fs.unlinkSync(file.path); } catch {}
      res.status(404).json({ error: "Active company not found" });
      return;
    }

    const checksumSha256 = await computeFileSha256(file.path);
    const { isZip, isCustomDump, isSql, formatLabel } = detectArchiveFormat(file.path);

    let manifest: any = null;

    if (isZip) {
      const inspectDir = path.join(tempUploadDir, `inspect_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`);
      fs.mkdirSync(inspectDir, { recursive: true });
      try {
        await extractZip(file.path, { dir: inspectDir });
        const manifestPath = path.join(inspectDir, "manifest.json");
        if (fs.existsSync(manifestPath)) {
          try {
            manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
          } catch {}
        }
        // Verify that archive has a database dump
        const candidateDumps = [
          path.join(inspectDir, "company_database.dump"),
          path.join(inspectDir, "database.dump"),
          path.join(inspectDir, "company_database.sql"),
          path.join(inspectDir, "database.sql"),
        ];
        let hasDump = candidateDumps.some((p) => fs.existsSync(p));
        if (!hasDump) {
          const allF = fs.readdirSync(inspectDir);
          hasDump = allF.some((f) => f.endsWith(".dump") || f.endsWith(".sql"));
        }
        if (!hasDump) {
          try { fs.unlinkSync(file.path); } catch {}
          res.status(400).json({ error: "The uploaded archive does not contain a PostgreSQL database dump (.dump or .sql)" });
          return;
        }
      } catch (err: any) {
        try { fs.unlinkSync(file.path); } catch {}
        res.status(400).json({ error: `Failed to inspect uploaded archive: ${err.message}` });
        return;
      } finally {
        try { fs.rmSync(inspectDir, { recursive: true, force: true }); } catch {}
      }

      // Strict Company Isolation Check:
      if (manifest?.company) {
        const mId = manifest.company.id ? Number(manifest.company.id) : null;
        const mDb = (manifest.company.databaseName || "").toLowerCase();
        const cDb = (company.database_name || "").toLowerCase();
        if (mId && mId !== companyId && mDb && mDb !== cDb) {
          try { fs.unlinkSync(file.path); } catch {}
          res.status(400).json({
            error: `Company Isolation Safeguard: This backup belongs to '${manifest.company.name || "Company ID " + mId}', but your active session is '${company.name}'. You cannot restore data from another company.`,
          });
          return;
        }
      }
    } else if (!isCustomDump && !isSql) {
      try { fs.unlinkSync(file.path); } catch {}
      res.status(400).json({
        error: "Unsupported backup file format. Please upload a PostgreSQL backup file (.dump, .zip, or .sql).",
      });
      return;
    }

    // Store file in the company's dedicated backups directory
    const companyDir = getCompanyBackupsDir(company.id, company.name);
    const originalName = file.originalname || `upload_${Date.now()}.dump`;
    const safeName = path.basename(originalName).replace(/[^a-zA-Z0-9._\-]/g, "_");
    let finalPath = path.join(companyDir, safeName);
    if (fs.existsSync(finalPath)) {
      const parsed = path.parse(safeName);
      finalPath = path.join(companyDir, `${parsed.name}_${Date.now()}${parsed.ext}`);
    }
    fs.renameSync(file.path, finalPath);

    const backupCode = `BK-UPL-${new Date().getFullYear()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
    const stat = fs.statSync(finalPath);
    const insertRes = await pool.query(
      `INSERT INTO accounting_backups (
        company_id, backup_code, backup_type, backup_source, status,
        storage_path, storage_ref, file_size_bytes, checksum_sha256,
        created_at, metadata
      ) VALUES (
        $1, $2, 'company_database', 'manual', 'completed',
        $3, $4, $5, $6,
        $7, $8
      ) RETURNING *`,
      [
        companyId,
        backupCode,
        finalPath,
        path.basename(finalPath),
        stat.size,
        checksumSha256,
        manifest?.createdAt ? new Date(manifest.createdAt) : new Date(),
        JSON.stringify({
          uploadedBy: req.session.username || "admin",
          originalFileName: originalName,
          format: formatLabel,
          manifest: manifest || null,
        }),
      ]
    );
    const newBackup = insertRes.rows[0];

    logAudit({
      req,
      action: "company_backup_uploaded",
      entityType: "system_backup",
      entityId: newBackup.id,
      entityLabel: backupCode,
      details: { companyId, fileName: path.basename(finalPath), fileSize: stat.size },
    });

    res.json({
      ok: true,
      backup: {
        id: newBackup.id,
        company_id: newBackup.company_id,
        backup_code: newBackup.backup_code,
        backup_type: newBackup.backup_type,
        backup_source: newBackup.backup_source,
        status: newBackup.status,
        storage_ref: newBackup.storage_ref,
        storage_path: newBackup.storage_path,
        file_size_bytes: newBackup.file_size_bytes,
        checksum_sha256: newBackup.checksum_sha256,
        created_at: newBackup.created_at,
        created_by_username: req.session.username || "admin",
      },
      validation: {
        valid: true,
        format: formatLabel,
        fileName: newBackup.storage_ref,
        fileSizeBytes: newBackup.file_size_bytes,
        checksumSha256: newBackup.checksum_sha256,
        timestamp: manifest?.createdAt || newBackup.created_at,
        companyName: company.name,
        databaseName: company.database_name,
        manifest: manifest || null,
      },
    });
  } finally {
    await pool.end();
  }
});

// POST /system-backups/:id/validate - pre-restore validation for active company
router.post("/system-backups/:id/validate", async (req, res): Promise<void> => {
  const companyId = await requireCompanyAuth(req, res);
  if (!companyId) return;

  const id = Number(req.params.id);
  const val = await validateCompanyBackupArchive(id, companyId);
  if (!val.ok) {
    res.status(400).json({ valid: false, error: val.error });
    return;
  }
  res.json({
    valid: true,
    backup: val.backup,
    manifest: val.manifest,
  });
});

// POST /system-backups/:id/restore - execute safe restore for active company ONLY
router.post("/system-backups/:id/restore", async (req, res): Promise<void> => {
  const companyId = await requireCompanyAuth(req, res);
  if (!companyId) return;

  const id = Number(req.params.id);
  const userId = req.session.userId;
  const username = req.session.username || "admin";
  const confirmPhrase = String(req.body?.confirmPhrase || "").trim();

  if (confirmPhrase.toUpperCase() !== "RESTORE") {
    res.status(400).json({ error: "You must type RESTORE to confirm this operation" });
    return;
  }

  logAudit({
    req,
    action: "company_restore_started",
    entityType: "system_backup",
    entityId: id,
    details: { companyId, backupId: id, initiatedBy: username },
  });

  executeCompanyRestore({
    backupId: id,
    companyId,
    userId,
    username,
    confirmPhrase,
  }).then((result) => {
    if (result.ok) {
      logAudit({
        req,
        action: "company_restore_completed",
        entityType: "system_backup",
        entityId: id,
        details: { companyId, restoreCode: result.operation?.restore_code, safetyBackup: result.safetyBackup?.backup_code },
      });
    } else {
      logAudit({
        req,
        action: "company_restore_failed",
        entityType: "system_backup",
        entityId: id,
        details: { companyId, error: result.error },
      });
    }
  }).catch(() => { });

  const lastRestoreOp = Array.from(activeRestoreOperations.values()).reverse().find((op) => op.companyId === companyId);
  res.status(202).json({
    message: "Restore operation initiated with pre-restore safety backup for this company",
    restoreCode: lastRestoreOp?.restoreCode || "RST-INIT",
    status: "VALIDATING",
  });
});

// GET /system-backups/restore/progress/:code - poll restore progress for company
router.get("/system-backups/restore/progress/:code", async (req, res): Promise<void> => {
  const companyId = await requireCompanyAuth(req, res);
  if (!companyId) return;

  const code = req.params.code;
  const active = activeRestoreOperations.get(code);
  if (active) {
    if (active.companyId !== companyId) {
      res.status(403).json({ error: "Access denied to this restore progress" });
      return;
    }
    res.json(active);
    return;
  }

  const masterDbUrl = process.env.DATABASE_URL;
  if (!masterDbUrl) {
    res.status(404).json({ error: "Restore progress not found" });
    return;
  }

  const pool = new pg.Pool({ connectionString: masterDbUrl });
  try {
    const r = await pool.query(
      "SELECT * FROM accounting_restore_operations WHERE restore_code = $1 AND company_id = $2 LIMIT 1",
      [code, companyId]
    );
    if (r.rows.length === 0) {
      res.status(404).json({ error: "Restore operation not found for this company" });
      return;
    }
    const op = r.rows[0];
    res.json({
      companyId: op.company_id,
      restoreCode: op.restore_code,
      backupCode: op.backup_code,
      status: op.status,
      step: op.status === "COMPLETED" ? "Restore completed successfully" : op.error_details || "Restoring...",
      percent: op.status === "COMPLETED" ? 100 : op.status === "FAILED" ? 0 : 50,
      logs: [`Status: ${op.status}`, op.result_message].filter(Boolean),
      safetyBackupCode: op.safety_backup_code,
      error: op.error_details,
    });
  } finally {
    await pool.end();
  }
});

// DELETE /system-backups/:id - delete backup (strictly company-scoped)
router.delete("/system-backups/:id", async (req, res): Promise<void> => {
  const companyId = await requireCompanyAuth(req, res);
  if (!companyId) return;

  const id = Number(req.params.id);
  const masterDbUrl = process.env.DATABASE_URL;
  if (!masterDbUrl) {
    res.status(500).json({ error: "Database not configured" });
    return;
  }

  const pool = new pg.Pool({ connectionString: masterDbUrl });
  try {
    const r = await pool.query(
      "SELECT * FROM accounting_backups WHERE id = $1 AND company_id = $2 LIMIT 1",
      [id, companyId]
    );
    const b = r.rows[0];
    if (!b) {
      res.status(403).json({ error: "Backup record not found or does not belong to the selected company" });
      return;
    }

    // Safety backup safeguard
    if (b.backup_source === "safety") {
      const recentSafeties = await pool.query(
        "SELECT COUNT(*) FROM accounting_backups WHERE company_id = $1 AND backup_source = 'safety' AND created_at > NOW() - INTERVAL '2 days'",
        [companyId]
      );
      if (Number(recentSafeties.rows[0].count) <= 1 && req.query.force !== "true") {
        res.status(400).json({
          error: "This safety backup protects your most recent restore point. Use force=true to proceed.",
        });
        return;
      }
    }

    if (b.storage_path && fs.existsSync(b.storage_path)) {
      try {
        fs.unlinkSync(b.storage_path);
      } catch { }
    }

    await pool.query("DELETE FROM accounting_backups WHERE id = $1 AND company_id = $2", [id, companyId]);
    logAudit({
      req,
      action: "company_backup_deleted",
      entityType: "system_backup",
      entityId: b.id,
      entityLabel: b.backup_code,
      details: { companyId },
    });

    res.json({ success: true, message: "Backup deleted successfully" });
  } finally {
    await pool.end();
  }
});

// POST /system-backups/schedule - update automatic backup schedule for active company
router.post("/system-backups/schedule", async (req, res): Promise<void> => {
  const companyId = await requireCompanyAuth(req, res);
  if (!companyId) return;

  const {
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
  } = req.body;

  try {
    const updated = await updateCompanyBackupSchedule({
      companyId,
      enabled: enabled !== false,
      frequency: frequency || "daily",
      timeOfDay: timeOfDay || "02:00",
      dayOfWeek: dayOfWeek != null ? Number(dayOfWeek) : null,
      destinationDir: destinationDir || "C:\\BizOne_Backups",
      localDownloadEnabled: localDownloadEnabled !== false,
      localDestinationDir: localDestinationDir || "D:\\BizOneBackups",
      localTimezone: localTimezone || "Asia/Kolkata",
      localDownloadTime: localDownloadTime || "02:30",
      localDownloadFrequency: localDownloadFrequency || "daily",
      userId: req.session.userId,
    });

    logAudit({
      req,
      action: "company_backup_schedule_updated",
      entityType: "backup_schedule",
      details: {
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
      },
    });

    res.json({ success: true, schedule: updated });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Failed to update backup schedule" });
  }
});

export default router;
