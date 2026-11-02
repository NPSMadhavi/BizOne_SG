#!/usr/bin/env node
/**
 * Cross-Platform / Node.js Company Backup Download Agent for Windows.
 * Downloads individual company-specific backup archives and verifies SHA-256 hash.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const serverUrl = process.env.BIZONE_SERVER_URL || "http://localhost:8080";
const agentKey = process.env.BIZONE_AGENT_KEY || "bizone-backup-sync-key";

// Company argument from CLI: --company 23 or --slug spsynet
const companyArgIdx = process.argv.indexOf("--company");
const companyId = companyArgIdx !== -1 ? process.argv[companyArgIdx + 1] : process.env.BIZONE_COMPANY_ID;
const slugArgIdx = process.argv.indexOf("--slug");
const companySlug = slugArgIdx !== -1 ? process.argv[slugArgIdx + 1] : process.env.BIZONE_COMPANY_SLUG;

const query = companyId ? `?companyId=${companyId}` : companySlug ? `?companySlug=${companySlug}` : "";
const downloadUrl = `${serverUrl}/api/system-backups/latest/download${query}`;

console.log(`[${new Date().toISOString()}] Connecting to ${downloadUrl}...`);

async function run() {
  const res = await fetch(downloadUrl, {
    headers: { "x-backup-agent-key": agentKey },
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Server returned ${res.status}: ${errText}`);
  }

  const companyName = res.headers.get("x-company-name") || "Company";
  const serverDestDir = res.headers.get("x-destination-dir");
  const backupCode = res.headers.get("x-backup-code") || "BK-SYNC";
  const expectedHash = res.headers.get("x-checksum-sha256");
  const contentDisp = res.headers.get("content-disposition");

  const destinationDir = serverDestDir || path.join("C:\\BizOne_Backups", companyName);
  if (!fs.existsSync(destinationDir)) {
    fs.mkdirSync(destinationDir, { recursive: true });
  }

  let fileName = `bizone_${companyName}_${backupCode}.zip`;
  if (contentDisp && contentDisp.includes('filename="')) {
    fileName = contentDisp.split('filename="')[1].split('"')[0];
  }

  const targetPath = path.join(destinationDir, fileName);
  const tempPath = path.join(destinationDir, `sync_${Date.now()}.tmp`);

  const fileStream = fs.createWriteStream(tempPath);
  const reader = res.body.getReader();
  const hash = crypto.createHash("sha256");

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    hash.update(value);
    fileStream.write(value);
  }
  fileStream.end();

  const computedHash = hash.digest("hex");
  if (expectedHash && expectedHash.toLowerCase() !== computedHash.toLowerCase()) {
    fs.unlinkSync(tempPath);
    throw new Error(`Checksum mismatch! Expected: ${expectedHash}, computed: ${computedHash}`);
  }

  fs.renameSync(tempPath, targetPath);
  const stats = fs.statSync(targetPath);
  console.log(`[SUCCESS] Saved backup for ${companyName}: ${fileName} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`[LOCATION] Folder: ${destinationDir}`);
  console.log(`[VERIFIED] SHA-256: ${computedHash}`);
}

run().catch((e) => {
  console.error(`[ERROR] ${e.message}`);
  process.exit(1);
});
