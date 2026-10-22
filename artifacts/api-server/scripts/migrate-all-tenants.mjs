/**
 * Migrate every company on MASTER (BizoneDB) onto its own bizone_<slug> database.
 * - Ensures unique slug
 * - CREATE DATABASE if missing
 * - Installs full schema from db-scripts/schema-postgres.sql
 * - Copies company-scoped rows from master → tenant
 * - Sets companies.database_name + users.database_name
 *
 * Safe-ish: does not DROP master business tables (run prune separately after verify).
 * Usage: node scripts/migrate-all-tenants.mjs [--dry-run] [--company=ID]
 */
import pg from "pg";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(root, "../..");
for (const line of fs.readFileSync(path.join(root, ".env"), "utf8").split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("=");
  if (eq <= 0) continue;
  const k = t.slice(0, eq).trim();
  let v = t.slice(eq + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  if (!process.env[k]) process.env[k] = v;
}

const DRY = process.argv.includes("--dry-run");
const onlyId = (() => {
  const arg = process.argv.find((a) => a.startsWith("--company="));
  return arg ? Number(arg.split("=")[1]) : null;
})();

function normalizeSlug(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 48);
}

function slugFromName(name, id) {
  let base = normalizeSlug(name);
  if (base.length < 3) base = `company${id}`;
  return base;
}

function dbUrlFor(databaseUrl, dbName) {
  const url = new URL(databaseUrl);
  url.pathname = `/${dbName}`;
  return url.toString();
}

function schemaPath() {
  const candidates = [
    path.join(repoRoot, "db-scripts/schema-postgres.sql"),
    path.join(root, "../../db-scripts/schema-postgres.sql"),
    path.join(process.cwd(), "db-scripts/schema-postgres.sql"),
  ];
  return candidates.find((f) => fs.existsSync(f));
}

function ddlOnly(sql) {
  const insertAt = sql.search(/^INSERT\s/m);
  return insertAt === -1 ? sql : sql.slice(0, insertAt);
}

async function tableColumns(client, table) {
  const r = await client.query(
    `SELECT column_name, udt_name, is_nullable, column_default
     FROM information_schema.columns
     WHERE table_schema='public' AND table_name=$1 AND is_generated='NEVER'
     ORDER BY ordinal_position`,
    [table],
  );
  return r.rows.map((row) => ({
    name: row.column_name,
    udt: row.udt_name,
    nullable: row.is_nullable === "YES",
    hasDefault: row.column_default != null,
  }));
}

function bindValue(value, col) {
  if (value == null) {
    if (col.nullable || col.hasDefault) return value;
    // Coerce NOT NULL without default so schema-postgres stricter columns don't abort migrate
    if (col.udt === "json" || col.udt === "jsonb") return "{}";
    if (col.udt === "bool") return false;
    if (col.udt === "int2" || col.udt === "int4" || col.udt === "int8" || col.udt === "numeric") return 0;
    return "";
  }
  if (col.udt === "json" || col.udt === "jsonb") return JSON.stringify(value);
  return value;
}

async function copyRows(master, tenant, table, whereSql, params) {
  const present = await tenant.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`,
    [table],
  );
  if (!present.rowCount) return 0;
  const masterCols = await tableColumns(master, table);
  const tenantColList = await tableColumns(tenant, table);
  const tenantCols = new Map(tenantColList.map((c) => [c.name, c]));
  const columns = masterCols.filter((c) => tenantCols.has(c.name) && /^[a-z_][a-z0-9_]*$/i.test(c.name));
  // Master users no longer have password_hash — inject empty default for tenant NOT NULL.
  if (table === "users" && tenantCols.has("password_hash") && !columns.some((c) => c.name === "password_hash")) {
    columns.push({ name: "password_hash", udt: "text", nullable: false, hasDefault: false });
  }
  if (!columns.length) return 0;
  const selectCols = columns.filter((c) => masterCols.some((m) => m.name === c.name));
  const rows = await master.query(
    `SELECT ${selectCols.map((c) => `"${c.name}"`).join(", ")} FROM "${table}" WHERE ${whereSql}`,
    params,
  );
  let n = 0;
  for (const row of rows.rows) {
    const values = columns.map((c) => {
      if (!(c.name in row) && c.name === "password_hash") return "";
      return bindValue(row[c.name], tenantCols.get(c.name) ?? c);
    });
    const ph = columns.map((_, i) => `$${i + 1}`).join(", ");
    try {
      await tenant.query(
        `INSERT INTO "${table}" (${columns.map((c) => `"${c.name}"`).join(", ")})
         VALUES (${ph}) ON CONFLICT DO NOTHING`,
        values,
      );
      n++;
    } catch (err) {
      console.warn(`    skip ${table} row: ${err.message?.slice(0, 120)}`);
    }
  }
  if (columns.some((c) => c.name === "id")) {
    await tenant
      .query(
        `SELECT setval(pg_get_serial_sequence($1, 'id'), GREATEST(COALESCE((SELECT MAX(id) FROM "${table}"), 1), 1), true)`,
        [table],
      )
      .catch(() => undefined);
  }
  return n;
}

async function ensureDbExists(admin, dbName) {
  const r = await admin.query(`SELECT 1 FROM pg_database WHERE datname = $1`, [dbName]);
  if (r.rowCount) return false;
  if (DRY) {
    console.log(`  [dry-run] CREATE DATABASE ${dbName}`);
    return true;
  }
  await admin.query(`CREATE DATABASE "${dbName}"`);
  return true;
}

async function healTenantColumns(client) {
  const stmts = [
    `ALTER TABLE companies ADD COLUMN IF NOT EXISTS slug text`,
    `ALTER TABLE companies ADD COLUMN IF NOT EXISTS database_name text`,
    `ALTER TABLE companies ADD COLUMN IF NOT EXISTS gst_reg_no text`,
    `ALTER TABLE companies ADD COLUMN IF NOT EXISTS logo_url text`,
    `ALTER TABLE companies ADD COLUMN IF NOT EXISTS domain text`,
    `ALTER TABLE companies ADD COLUMN IF NOT EXISTS business_type text`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS database_name text`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS email text`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name text`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_number text`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS company_id integer`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS role_id integer`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS sales_person_id integer`,
    `ALTER TABLE users ALTER COLUMN password_hash SET DEFAULT ''`,
  ];
  for (const s of stmts) {
    await client.query(s).catch(() => undefined);
  }
}

async function installSchema(tenantUrl) {
  const file = schemaPath();
  if (!file) throw new Error("schema-postgres.sql not found");
  if (DRY) {
    console.log(`  [dry-run] install schema from ${file}`);
    return;
  }
  const client = new pg.Client({ connectionString: tenantUrl });
  await client.connect();
  try {
    await client.query(ddlOnly(fs.readFileSync(file, "utf8")));
    await healTenantColumns(client);
  } finally {
    await client.end();
  }
}

async function copyCompany(masterUrl, tenantUrl, companyId) {
  if (DRY) {
    console.log(`  [dry-run] copy company ${companyId} rows`);
    return;
  }
  const master = new pg.Client({ connectionString: masterUrl });
  const tenant = new pg.Client({ connectionString: tenantUrl });
  await master.connect();
  await tenant.connect();
  try {
    await tenant.query("SET session_replication_role = replica").catch(() => undefined);
    await copyRows(master, tenant, "companies", "id = $1", [companyId]);
    await copyRows(master, tenant, "permissions", "true", []).catch(() => 0);
    await copyRows(master, tenant, "roles", "company_id = $1", [companyId]);
    await copyRows(
      master,
      tenant,
      "role_permissions",
      "role_id IN (SELECT id FROM roles WHERE company_id = $1)",
      [companyId],
    );
    await copyRows(master, tenant, "users", "company_id = $1", [companyId]);
    // passwords from login_credentials
    const hasCreds = await master.query(
      `SELECT 1 FROM information_schema.tables WHERE table_name='login_credentials'`,
    );
    const hasPw = await tenant.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='password_hash'`,
    );
    if (hasCreds.rowCount && hasPw.rowCount) {
      const creds = await master.query(
        `SELECT lc.user_id, lc.password_hash FROM login_credentials lc
         JOIN users u ON u.id = lc.user_id WHERE u.company_id = $1`,
        [companyId],
      );
      for (const row of creds.rows) {
        await tenant.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [
          row.password_hash,
          row.user_id,
        ]);
      }
    }
    await copyRows(master, tenant, "user_companies", "company_id = $1", [companyId]);
    await copyRows(master, tenant, "settings", "company_id = $1", [companyId]);

    const tables = await master.query(
      `SELECT c.table_name
       FROM information_schema.columns c
       JOIN information_schema.tables t
         ON t.table_schema = c.table_schema AND t.table_name = c.table_name
       WHERE c.table_schema = 'public'
         AND c.column_name = 'company_id'
         AND t.table_type = 'BASE TABLE'
         AND c.table_name NOT IN ('companies','roles','users','user_companies','settings','role_permissions')
       ORDER BY c.table_name`,
    );
    for (const { table_name } of tables.rows) {
      if (!/^[a-z_][a-z0-9_]*$/i.test(table_name)) continue;
      try {
        const n = await copyRows(master, tenant, table_name, "company_id = $1", [companyId]);
        if (n > 0) console.log(`    ${table_name}: ${n}`);
      } catch (err) {
        console.warn(`    ${table_name} FAILED: ${err.message?.slice(0, 160)}`);
      }
    }
  } finally {
    await tenant.query("SET session_replication_role = origin").catch(() => undefined);
    await tenant.end();
    await master.end();
  }
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL missing");
  if (!/localhost|127\.0\.0\.1/.test(databaseUrl) && !process.env.ALLOW_REMOTE_MIGRATE) {
    throw new Error("Refusing non-localhost migrate without ALLOW_REMOTE_MIGRATE=1");
  }

  const master = new pg.Client({ connectionString: databaseUrl });
  await master.connect();
  console.log("master", (await master.query("SELECT current_database() AS db")).rows[0].db);
  console.log(DRY ? "MODE: dry-run" : "MODE: apply");

  // Ensure master directory columns
  await master.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS slug text`);
  await master.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS database_name text`);
  await master.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS database_name text`);
  await master.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS companies_slug_unique ON companies (slug) WHERE slug IS NOT NULL`,
  );

  const companies = await master.query(
    `SELECT id, name, email, slug, database_name FROM companies ORDER BY id`,
  );
  /** Slugs already claimed by another company (or reserved during this run). */
  const claimedSlugs = new Set();
  for (const c of companies.rows) {
    const s = normalizeSlug(c.slug);
    if (s.length >= 3) claimedSlugs.add(s);
  }

  async function uniqueSlugFor(co) {
    let base = normalizeSlug(co.slug);
    if (base.length < 3) base = slugFromName(co.name, co.id);
    if (base.length < 3) base = `company${co.id}`;

    let candidate = base;
    let n = 2;
    for (;;) {
      const ownedByOther = companies.rows.some(
        (x) => x.id !== co.id && (normalizeSlug(x.slug) === candidate || x.database_name === `bizone_${candidate}`),
      );
      const reserved = claimedSlugs.has(candidate) && normalizeSlug(co.slug) !== candidate;
      const dbCheck = await master.query(`SELECT 1 FROM pg_database WHERE datname = $1`, [
        `bizone_${candidate}`,
      ]);
      const dbOwnedBySelf = co.database_name === `bizone_${candidate}`;
      const dbConflict = (dbCheck.rowCount ?? 0) > 0 && !dbOwnedBySelf && ownedByOther;

      if (!ownedByOther && !reserved && !dbConflict) {
        // Allow reusing existing DB only if this company already points at it, or nobody claims it
        if ((dbCheck.rowCount ?? 0) > 0 && !dbOwnedBySelf) {
          const claimedDb = companies.rows.find((x) => x.database_name === `bizone_${candidate}`);
          if (claimedDb && claimedDb.id !== co.id) {
            candidate = `${base}${n++}`;
            continue;
          }
        }
        return candidate;
      }
      candidate = `${base}${n++}`;
    }
  }

  const targets = companies.rows.filter((c) => (onlyId ? c.id === onlyId : true));
  const summary = [];

  for (const co of targets) {
    // Prefer existing database_name / slug when already provisioned
    let slug;
    let dbName;
    if (co.database_name && /^bizone_[a-z0-9]+$/.test(co.database_name)) {
      dbName = co.database_name;
      slug = normalizeSlug(co.slug) || co.database_name.replace(/^bizone_/, "");
      claimedSlugs.add(slug);
    } else {
      slug = await uniqueSlugFor(co);
      claimedSlugs.add(slug);
      dbName = `bizone_${slug}`;
    }

    console.log(`\n=== company ${co.id} ${co.name} → ${dbName} ===`);

    if (!DRY) {
      await master.query(`UPDATE companies SET slug = $1 WHERE id = $2`, [slug, co.id]);
    } else {
      console.log(`  [dry-run] set slug=${slug}`);
    }

    const admin = new pg.Client({ connectionString: databaseUrl });
    await admin.connect();
    try {
      const created = await ensureDbExists(admin, dbName);
      console.log(created ? "  created DB" : "  DB already exists");
    } finally {
      await admin.end();
    }

    const tenantUrl = dbUrlFor(databaseUrl, dbName);
    const tableCount = DRY
      ? 0
      : await (async () => {
          const t = new pg.Client({ connectionString: tenantUrl });
          await t.connect();
          try {
            const r = await t.query(
              `SELECT count(*)::int AS n FROM information_schema.tables
               WHERE table_schema='public' AND table_type='BASE TABLE'`,
            );
            return r.rows[0].n;
          } finally {
            await t.end();
          }
        })();

    if (!DRY && tableCount < 20) {
      console.log("  installing schema…");
      await installSchema(tenantUrl);
    } else if (!DRY) {
      console.log(`  schema present (${tableCount} tables)`);
      const heal = new pg.Client({ connectionString: tenantUrl });
      await heal.connect();
      try {
        await healTenantColumns(heal);
      } finally {
        await heal.end();
      }
    }

    console.log("  copying company data…");
    await copyCompany(databaseUrl, tenantUrl, co.id);

    if (!DRY) {
      await master.query(`UPDATE companies SET database_name = $1, slug = $2 WHERE id = $3`, [
        dbName,
        slug,
        co.id,
      ]);
      await master.query(`UPDATE users SET database_name = $1 WHERE company_id = $2`, [dbName, co.id]);
      // ensure tenant companies row has database_name/slug
      const t = new pg.Client({ connectionString: tenantUrl });
      await t.connect();
      try {
        await t.query(
          `UPDATE companies SET slug = $1, database_name = $2 WHERE id = $3`,
          [slug, dbName, co.id],
        ).catch(() => undefined);
        await t.query(`UPDATE users SET database_name = $1 WHERE company_id = $2`, [dbName, co.id]).catch(
          () => undefined,
        );
      } finally {
        await t.end();
      }
    }

    summary.push({ id: co.id, name: co.name, slug, dbName });
  }

  console.log("\n=== SUMMARY ===");
  console.table(summary);

  const shared = await master.query(
    `SELECT count(*)::int AS n FROM companies WHERE database_name IS NULL OR btrim(database_name)=''`,
  );
  console.log("companies still on shared master:", shared.rows[0].n);

  await master.end();
  console.log("done");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
