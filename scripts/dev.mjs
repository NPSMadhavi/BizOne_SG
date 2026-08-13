import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apiDir = path.join(root, "artifacts", "api-server");
const webDir = path.join(root, "artifacts", "po-app");
const nodeBin = process.execPath;

const API_PORT = process.env.API_PORT || "8080";
const WEB_PORT = process.env.WEB_PORT || "5001";

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const env = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
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
    env[key] = value;
  }
  return env;
}

function freePort(port) {
  if (process.platform !== "win32") {
    try {
      execSync(`lsof -ti:${port} | xargs -r kill -9`, { stdio: "ignore" });
    } catch {
      // ignore
    }
    return;
  }

  try {
    const out = execSync(`netstat -ano | findstr :${port}`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const pids = new Set();
    for (const line of out.split(/\r?\n/)) {
      if (!line.includes("LISTENING")) continue;
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && /^\d+$/.test(pid) && pid !== "0") pids.add(pid);
    }
    for (const pid of pids) {
      try {
        execSync(`taskkill /PID ${pid} /F`, { stdio: "ignore" });
        console.log(`Freed port ${port} (killed PID ${pid})`);
      } catch {
        // ignore
      }
    }
  } catch {
    // nothing listening
  }
}

function run(name, args, env, cwd) {
  const child = spawn(nodeBin, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: "inherit",
    shell: false,
    windowsHide: true,
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      console.error(`[${name}] stopped (${signal})`);
      shutdown(1);
      return;
    }
    if (code && code !== 0) {
      console.error(`[${name}] exited with code ${code}`);
      shutdown(code);
    }
  });

  return child;
}

function runSync(args, env, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(nodeBin, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: "inherit",
      shell: false,
      windowsHide: true,
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Command failed with exit code ${code}`));
    });
  });
}

const children = [];

function shutdown(code = 0) {
  for (const child of children) {
    if (!child.killed) {
      try {
        child.kill();
      } catch {
        // ignore
      }
    }
  }
  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

freePort(API_PORT);
freePort(WEB_PORT);

const fileEnv = loadEnvFile(path.join(apiDir, "src", ".env"));
const apiEnv = {
  ...fileEnv,
  PORT: API_PORT,
  NODE_ENV: "development",
};

const webEnv = {
  PORT: WEB_PORT,
  API_PORT,
  BASE_PATH: "/",
  NODE_ENV: "development",
};

console.log("Building API...");
await runSync([path.join(apiDir, "build.mjs")], apiEnv, apiDir);

console.log(`Starting API on http://localhost:${API_PORT} ...`);
children.push(
  run(
    "api",
    ["--enable-source-maps", path.join(apiDir, "dist", "index.mjs")],
    apiEnv,
    apiDir,
  ),
);

const viteCandidates = [
  path.join(webDir, "node_modules", "vite", "bin", "vite.js"),
  path.join(root, "node_modules", "vite", "bin", "vite.js"),
];
const viteJs = viteCandidates.find((p) => fs.existsSync(p));
if (!viteJs) {
  console.error("Cannot find vite. Run `npm install` from the repo root first.");
  process.exit(1);
}
console.log(`Starting frontend on http://localhost:${WEB_PORT} ...`);
children.push(
  run(
    "web",
    [viteJs, "--config", "vite.config.ts", "--host", "0.0.0.0"],
    webEnv,
    webDir,
  ),
);
