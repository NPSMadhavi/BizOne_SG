import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type pg from "pg";

type Queryable = {
  query: (sql: string) => Promise<unknown>;
};

/** Locate checked-in full tenant DDL (91 CREATE TABLE IF NOT EXISTS statements). */
export function fullTenantSchemaPath(): string | null {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    // Bundled next to api-server (Plesk often deploys artifacts/api-server only)
    path.resolve(here, "../../db-scripts/schema-postgres.sql"),
    path.resolve(here, "../db-scripts/schema-postgres.sql"),
    path.resolve(process.cwd(), "db-scripts/schema-postgres.sql"),
    // Monorepo root db-scripts
    path.resolve(here, "../../../../db-scripts/schema-postgres.sql"),
    path.resolve(here, "../../../db-scripts/schema-postgres.sql"),
    path.resolve(process.cwd(), "../../db-scripts/schema-postgres.sql"),
    path.resolve(process.cwd(), "../db-scripts/schema-postgres.sql"),
  ];
  return candidates.find((file) => fs.existsSync(file)) ?? null;
}

function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let buf = "";
  let inSingle = false;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    const next = sql[i + 1];
    if (inSingle) {
      buf += ch;
      if (ch === "'" && next === "'") {
        buf += next;
        i++;
        continue;
      }
      if (ch === "'") inSingle = false;
      continue;
    }
    if (ch === "'") {
      inSingle = true;
      buf += ch;
      continue;
    }
    if (ch === ";") {
      const stmt = buf.trim();
      if (stmt) statements.push(stmt);
      buf = "";
      continue;
    }
    buf += ch;
  }
  const tail = buf.trim();
  if (tail) statements.push(tail);
  return statements;
}

function isBenignSchemaError(err: unknown): boolean {
  const code = (err as { code?: string })?.code || "";
  const msg = String((err as { message?: string })?.message || err || "");
  return (
    code === "42P07" || // duplicate_table
    code === "42710" || // duplicate_object
    code === "42701" || // duplicate_column
    code === "42P16" || // invalid_table_definition (edge)
    /already exists/i.test(msg) ||
    /duplicate key/i.test(msg)
  );
}

/**
 * Apply the full 91-table tenant schema safely (CREATE IF NOT EXISTS only).
 * Used when Plesk / older company DBs were provisioned from a lean dump (~61 tables).
 */
export async function applyFullTenantSchema(
  db: Queryable,
  opts?: { label?: string },
): Promise<{ applied: number; skipped: number; path: string | null }> {
  const schemaPath = fullTenantSchemaPath();
  if (!schemaPath) {
    console.warn("[full-schema] schema-postgres.sql not found — cannot heal missing tables");
    return { applied: 0, skipped: 0, path: null };
  }

  const raw = fs.readFileSync(schemaPath, "utf8");
  const statements = splitSqlStatements(raw)
    .map((s) =>
      // Header comments have no trailing `;` so they glue onto the first CREATE —
      // strip leading `--` lines before filtering.
      s
        .split(/\r?\n/)
        .filter((line) => !/^\s*--/.test(line))
        .join("\n")
        .trim(),
    )
    .filter((t) => {
      if (!t) return false;
      // Skip destructive or session noise if any slipped in
      if (/^DROP\s/i.test(t)) return false;
      if (/^\\/i.test(t)) return false;
      return true;
    });

  let applied = 0;
  let skipped = 0;
  for (const statement of statements) {
    try {
      await db.query(statement);
      applied++;
    } catch (err) {
      if (isBenignSchemaError(err)) {
        skipped++;
        continue;
      }
      // Constraint/index conflicts on partially migrated DBs — keep going.
      const msg = String((err as { message?: string })?.message || err || "");
      if (/constraint|relation|does not exist|multiple primary keys/i.test(msg)) {
        skipped++;
        continue;
      }
      console.warn(
        `[full-schema] ${opts?.label || "tenant"} stmt skipped:`,
        msg.slice(0, 180),
      );
      skipped++;
    }
  }

  console.info(
    `[full-schema] ${opts?.label || "tenant"} applied=${applied} skipped=${skipped} file=${path.basename(schemaPath)}`,
  );
  return { applied, skipped, path: schemaPath };
}

/** Count public base tables on a pool/client. */
export async function countPublicTables(db: Queryable): Promise<number> {
  const result = (await db.query(
    `SELECT count(*)::int AS n
     FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
  )) as { rows?: Array<{ n: number }> };
  return Number(result.rows?.[0]?.n ?? 0);
}

/**
 * If the tenant is missing tables vs the full app schema (~91), apply the DDL heal.
 * Expected count is soft — anything under 85 gets a full pass.
 */
export async function ensureFullTenantSchema(
  pool: pg.Pool | Queryable,
  opts?: { label?: string; minTables?: number },
): Promise<void> {
  const minTables = opts?.minTables ?? 85;
  let before = 0;
  try {
    before = await countPublicTables(pool);
  } catch {
    before = 0;
  }
  // Always run CREATE IF NOT EXISTS — cheap when complete; critical when incomplete.
  await applyFullTenantSchema(pool, { label: opts?.label || `tables-before=${before}` });
  try {
    const after = await countPublicTables(pool);
    if (after < minTables) {
      console.warn(
        `[full-schema] still only ${after} tables (want >= ${minTables}) — check DB permissions / schema file on deploy`,
      );
    } else if (before < minTables) {
      console.info(`[full-schema] healed table count ${before} → ${after}`);
    }
  } catch {
    /* ignore */
  }
}
