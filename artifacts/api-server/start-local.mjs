/**
 * Start API for local mobile/web development.
 * Loads src/.env then runs dist/index.mjs on PORT (default 8080).
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(dir, "src", ".env");
const env = { ...process.env };

if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!env[key]) env[key] = value;
  }
}

env.PORT = env.PORT || env.API_PORT || "8080";
env.NODE_ENV = env.NODE_ENV || "development";

const entry = path.join(dir, "dist", "index.mjs");
if (!fs.existsSync(entry)) {
  console.error("Missing dist/index.mjs — run: node build.mjs");
  process.exit(1);
}

console.log(`Starting BizOne API on http://0.0.0.0:${env.PORT} ...`);
const child = spawn(process.execPath, ["--enable-source-maps", entry], {
  cwd: dir,
  env,
  stdio: "inherit",
  windowsHide: true,
});

child.on("exit", (code) => process.exit(code ?? 0));
