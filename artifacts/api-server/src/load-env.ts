import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Load key=value pairs from .env into process.env (does not override existing vars).
 * Looks in the usual places for local / monorepo runs.
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

export function loadLocalEnv(): void {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const cwd = process.cwd();
  const candidates = [
    path.join(here, ".env"), // src/.env when running from source maps / ts
    path.join(cwd, "src", ".env"), // artifacts/api-server/src/.env (dev.mjs cwd)
    path.join(cwd, ".env"),
    path.resolve(here, "..", ".env"),
    path.resolve(here, "..", "src", ".env"),
  ];

  const merged: Record<string, string> = {};
  for (const file of candidates) {
    Object.assign(merged, parseEnvFile(file));
  }

  const preferFileKeys = new Set([
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

  function looksLikePlaceholder(v: string | undefined): boolean {
    if (!v) return true;
    const k = v.trim().toLowerCase();
    return (
      k.length < 20 ||
      k.includes("your-openai") ||
      k.includes("your-api-key") ||
      k === "sk-xxx" ||
      k.endsWith("-here")
    );
  }

  for (const [key, value] of Object.entries(merged)) {
    const current = process.env[key];
    const shouldSet =
      preferFileKeys.has(key) ||
      current === undefined ||
      current === "" ||
      looksLikePlaceholder(current);
    if (shouldSet) {
      process.env[key] = value;
    }
  }
}

loadLocalEnv();
