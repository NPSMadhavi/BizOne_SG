import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Load key=value pairs from .env into process.env.
 *
 * Critical for Plesk/Passenger:
 * - Never overwrite host-supplied PORT / NODE_ENV (and related) once set.
 * - Placeholder detection applies only to integration secrets (API keys / SMTP),
 *   never to short values like PORT ("8080") or NODE_ENV ("production").
 */
function parseEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) return {};
  const env: Record<string, string> = {};
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

/** Set by Passenger / Plesk / the OS — .env must not clobber these when present. */
const HOST_OWNED_KEYS = new Set([
  "PORT",
  "NODE_ENV",
  "HOST",
  "PASSENGER_APP_ENV",
  "PASSENGER_SPAWN_WORK_DIR",
  "PASSENGER_CONNECT_PASSWORD",
]);

/** Local secrets that may safely replace empty/placeholder process env values. */
const PREFER_FILE_KEYS = new Set([
  "AI_INTEGRATIONS_OPENAI_API_KEY",
  "AI_INTEGRATIONS_OPENAI_BASE_URL",
  "OPENAI_API_KEY",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_FROM",
  "SMTP_SECURE",
]);

function looksLikeSecretPlaceholder(v: string | undefined): boolean {
  if (!v) return true;
  const k = v.trim().toLowerCase();
  return (
    k.includes("your-openai") ||
    k.includes("your-api-key") ||
    k === "sk-xxx" ||
    k.endsWith("-here")
  );
}

export function loadLocalEnv(): void {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const cwd = process.cwd();
  const candidates = [
    path.join(here, ".env"), // next to bundled entry (dist/) or src/
    path.join(cwd, "src", ".env"), // artifacts/api-server/src/.env (dev.mjs cwd)
    path.join(cwd, ".env"), // app root on Plesk (/sg.biz1.in/.env)
    path.resolve(here, "..", ".env"),
    path.resolve(here, "..", "src", ".env"),
  ];

  const merged: Record<string, string> = {};
  for (const file of candidates) {
    Object.assign(merged, parseEnvFile(file));
  }

  for (const [key, value] of Object.entries(merged)) {
    const current = process.env[key];

    // Passenger/Plesk own these. If already set (even to a short port number), keep them.
    if (HOST_OWNED_KEYS.has(key)) {
      if (current !== undefined && current !== "") continue;
      // Only fill when completely unset; never install an empty PORT from .env.
      if (value !== "") {
        process.env[key] = value;
      }
      continue;
    }

    if (PREFER_FILE_KEYS.has(key)) {
      if (
        current === undefined ||
        current === "" ||
        looksLikeSecretPlaceholder(current)
      ) {
        process.env[key] = value;
      }
      continue;
    }

    // Default: fill gaps only — never override a non-empty process env value.
    if (current === undefined || current === "") {
      process.env[key] = value;
    }
  }
}

loadLocalEnv();
