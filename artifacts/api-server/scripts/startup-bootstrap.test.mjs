/**
 * Disposable-Postgres tests for coordinated Passenger startup bootstrap.
 * Not a production entrypoint. Uses DATABASE_URL (admin) to CREATE DATABASE.
 */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(apiRoot, "..", "..");
const indexMjs = path.join(apiRoot, "dist", "index.mjs");
const frontendIndex = path.join(
  repoRoot,
  "artifacts",
  "po-app",
  "dist",
  "public",
  "index.html",
);

const LOCK_KEY = 87201401;
const results = [];

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
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
    if (process.env[key] === undefined || process.env[key] === "") {
      process.env[key] = value;
    }
  }
}

loadDotEnv(path.join(apiRoot, ".env"));

function adminUrl() {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is required for bootstrap tests");
  return raw.replace(/\/[^/?]+(\?|$)/, "/postgres$1");
}

function dbUrl(name) {
  const raw = process.env.DATABASE_URL;
  return raw.replace(/\/[^/?]+(\?|$)/, `/${name}$1`);
}

function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}

function spawnNode(args, env, extra = {}) {
  return spawn(process.execPath, args, {
    cwd: apiRoot,
    env: { ...process.env, NODE_ENV: "development", ...env },
    stdio: ["ignore", "pipe", "pipe"],
    ...extra,
  });
}

function collect(child) {
  let out = "";
  child.stdout.on("data", (b) => {
    out += b.toString();
  });
  child.stderr.on("data", (b) => {
    out += b.toString();
  });
  return {
    get text() {
      return out;
    },
    wait(ms = 180000) {
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => {
          child.kill("SIGKILL");
          reject(new Error("timeout"));
        }, ms);
        child.on("exit", (code) => {
          clearTimeout(t);
          resolve({ code, out });
        });
      });
    },
  };
}

const schemaSqlPath = path.join(repoRoot, "db-scripts", "schema-postgres.sql");

async function loadBaseSchema(client) {
  const sql = fs.readFileSync(schemaSqlPath, "utf8");
  await client.query(sql);
}

async function dropDb(admin, name) {
  await admin.query(
    `SELECT pg_terminate_backend(pid)
     FROM pg_stat_activity
     WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [name],
  );
  await admin.query(`DROP DATABASE IF EXISTS ${name}`);
}

async function withDb(admin, name, fn, { baseSchema = true } = {}) {
  await dropDb(admin, name);
  await admin.query(`CREATE DATABASE ${name}`);
  const client = new pg.Client({ connectionString: dbUrl(name) });
  await client.connect();
  try {
    if (baseSchema) await loadBaseSchema(client);
    return await fn(client, dbUrl(name));
  } finally {
    await client.end();
    await dropDb(admin, name);
  }
}

async function migrate(url) {
  const child = spawnNode([indexMjs, "--migrate-only"], { DATABASE_URL: url });
  const c = collect(child);
  const result = await c.wait();
  return result;
}

async function main() {
  if (!fs.existsSync(indexMjs)) {
    throw new Error(`Missing ${indexMjs} — run npm run build first`);
  }

  const admin = new pg.Client({ connectionString: adminUrl() });
  await admin.connect();
  const stamp = Date.now().toString(36);

  try {
    // A. Fresh DB
    await withDb(admin, `bizone_a_${stamp}`, async (c, url) => {
      const r = await migrate(url);
      const session = await c.query(
        `SELECT to_regclass('public.session') AS t`,
      );
      const maint = await c.query(
        `SELECT to_regclass('public.maintenance') AS t`,
      );
      const ok =
        r.code === 0 &&
        session.rows[0].t === "session" &&
        maint.rows[0].t === "maintenance";
      record("A fresh DB", ok, `exit=${r.code}`);
    });

    // B. Partially migrated DB
    await withDb(admin, `bizone_b_${stamp}`, async (c, url) => {
      await c.query(`DROP TABLE IF EXISTS sales_orders CASCADE`);
      const r = await migrate(url);
      const so = await c.query(
        `SELECT to_regclass('public.sales_orders') AS t`,
      );
      record("B partial schema", r.code === 0 && so.rows[0].t === "sales_orders", `exit=${r.code}`);
    });

    // C. Fully migrated DB (second boot)
    await withDb(admin, `bizone_c_${stamp}`, async (c, url) => {
      const first = await migrate(url);
      const second = await migrate(url);
      record(
        "C fully migrated re-run",
        first.code === 0 && second.code === 0,
        `first=${first.code} second=${second.code}`,
      );
    });

    // D. Missing optional field
    await withDb(admin, `bizone_d_${stamp}`, async (c, url) => {
      await migrate(url);
      await c.query(
        `ALTER TABLE stock_items DROP COLUMN IF EXISTS batch_no`,
      );
      const r = await migrate(url);
      const col = await c.query(
        `SELECT 1 FROM information_schema.columns
         WHERE table_name='stock_items' AND column_name='batch_no'`,
      );
      record("D missing optional field", r.code === 0 && col.rowCount === 1);
    });

    // E. Missing critical field
    await withDb(admin, `bizone_e_${stamp}`, async (c, url) => {
      await migrate(url);
      await c.query(
        `ALTER TABLE invoices DROP COLUMN IF EXISTS terms_and_conditions`,
      );
      const r = await migrate(url);
      const col = await c.query(
        `SELECT 1 FROM information_schema.columns
         WHERE table_name='invoices' AND column_name='terms_and_conditions'`,
      );
      record("E missing critical field restored", r.code === 0 && col.rowCount === 1);
    });

    // F. Existing grn (dump has po_id NOT NULL; bootstrap must drop NOT NULL)
    await withDb(admin, `bizone_f_${stamp}`, async (c, url) => {
      const r = await migrate(url);
      const nul = await c.query(
        `SELECT is_nullable FROM information_schema.columns
         WHERE table_name='grn' AND column_name='po_id'`,
      );
      record(
        "F existing grn po_id nullable",
        r.code === 0 && nul.rows[0]?.is_nullable === "YES",
      );
    });

    // G. Missing grn
    await withDb(admin, `bizone_g_${stamp}`, async (c, url) => {
      await c.query(`DROP TABLE IF EXISTS grn CASCADE`);
      const r = await migrate(url);
      record("G missing grn (42P01 benign)", r.code === 0, `exit=${r.code}`);
    });

    // H. vendor_invoices with pi_date
    await withDb(admin, `bizone_h_${stamp}`, async (c, url) => {
      const co = await c.query(`SELECT id FROM companies LIMIT 1`);
      const companyId = co.rows[0]?.id ?? 1;
      await c.query(
        `INSERT INTO vendor_invoices (company_id, pi_number, pi_date, due_date, vendor_name, created_by)
         VALUES ($1, 'PI-TEST', '2024-01-01', NULL, 'Vendor', 1)`,
        [companyId],
      );
      const r = await migrate(url);
      const row = await c.query(
        `SELECT due_date FROM vendor_invoices WHERE pi_number = 'PI-TEST' LIMIT 1`,
      );
      record(
        "H vendor_invoices with pi_date",
        r.code === 0 && Boolean(row.rows[0]?.due_date),
        `due_date=${row.rows[0]?.due_date ?? "null"}`,
      );
    });

    // I. vendor_invoices without pi_date
    await withDb(admin, `bizone_i_${stamp}`, async (c, url) => {
      await c.query(`ALTER TABLE vendor_invoices DROP COLUMN IF EXISTS pi_date`);
      const r = await migrate(url);
      record("I vendor_invoices without pi_date", r.code === 0, `exit=${r.code}`);
    });

    // Concurrency: holder blocks workers; they do not skip
    await withDb(admin, `bizone_conc_${stamp}`, async (c, url) => {
      const holder = new pg.Client({ connectionString: url });
      await holder.connect();
      await holder.query("SELECT pg_advisory_lock($1)", [LOCK_KEY]);
      const started = Date.now();
      const child = spawnNode([indexMjs, "--migrate-only"], { DATABASE_URL: url });
      const cap = collect(child);
      await new Promise((r) => setTimeout(r, 2500));
      const waiting = /waiting for advisory lock/.test(cap.text);
      const acquiredEarly = /acquired advisory lock/.test(cap.text);
      await holder.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]);
      await holder.end();
      const done = await cap.wait();
      const waited = Date.now() - started >= 2000;
      record(
        "concurrency wait-not-skip",
        done.code === 0 && waiting && !acquiredEarly && waited,
        `exit=${done.code} waiting=${waiting} earlyAcquire=${acquiredEarly}`,
      );
    });

    // Two concurrent migrate-only processes serialize
    await withDb(admin, `bizone_two_${stamp}`, async (_c, url) => {
      const a = spawnNode([indexMjs, "--migrate-only"], { DATABASE_URL: url });
      const b = spawnNode([indexMjs, "--migrate-only"], { DATABASE_URL: url });
      const ca = collect(a);
      const cb = collect(b);
      const [ra, rb] = await Promise.all([ca.wait(), cb.wait()]);
      const aAcq = (ca.text.match(/acquired advisory lock/g) || []).length;
      const bAcq = (cb.text.match(/acquired advisory lock/g) || []).length;
      record(
        "concurrency two workers",
        ra.code === 0 && rb.code === 0 && aAcq === 1 && bAcq === 1,
        `a=${ra.code} b=${rb.code}`,
      );
    });

    // Failure recovery: owner dies holding lock
    await withDb(admin, `bizone_fail_${stamp}`, async (_c, url) => {
      const holder = spawn(
        process.execPath,
        [
          "--input-type=module",
          "-e",
          `import pg from 'pg';
           const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
           await c.connect();
           await c.query('SELECT pg_advisory_lock($1)', [87201401]);
           process.exit(1);`,
        ],
        { cwd: apiRoot, env: { ...process.env, DATABASE_URL: url }, stdio: "ignore" },
      );
      await new Promise((resolve) => holder.on("exit", resolve));
      await new Promise((r) => setTimeout(r, 500));
      const r = await migrate(url);
      record("failure recovery after owner death", r.code === 0, `exit=${r.code}`);
    });

    // Listen path: Server listening + APIs
    const listenName = `bizone_listen_${stamp}`;
    await dropDb(admin, listenName);
    await admin.query(`CREATE DATABASE ${listenName}`);
    const listenClient = new pg.Client({ connectionString: dbUrl(listenName) });
    await listenClient.connect();
    await loadBaseSchema(listenClient);
    await listenClient.end();
    try {
      const port = 34551;
      const child = spawnNode([indexMjs], {
        DATABASE_URL: dbUrl(listenName),
        PORT: String(port),
        NODE_ENV: "development",
      });
      const cap = collect(child);
      const ready = await new Promise((resolve) => {
        const t = setTimeout(() => resolve(false), 120000);
        const check = () => {
          if (/Server listening/.test(cap.text)) {
            clearTimeout(t);
            resolve(true);
          }
        };
        child.stdout.on("data", check);
        child.stderr.on("data", check);
      });
      let me = 0;
      let maint = 0;
      let html = false;
      if (ready) {
        const hit = async (p) => {
          const res = await fetch(`http://127.0.0.1:${port}${p}`);
          return res;
        };
        const meRes = await hit("/api/auth/me");
        me = meRes.status;
        const maintRes = await hit("/api/maintenance");
        maint = maintRes.status;
        if (fs.existsSync(frontendIndex)) {
          const home = await hit("/");
          html = home.status === 200 && /html/i.test(home.headers.get("content-type") || "");
        }
      }
      if (!ready) {
        console.error("--- listen process log ---\n" + cap.text.slice(-4000));
      }
      await new Promise((r) => setTimeout(r, 500));
      child.kill("SIGKILL");
      record(
        "listen + /api/auth/me + /api/maintenance",
        ready && me === 401 && maint === 200,
        `ready=${ready} me=${me} maintenance=${maint} frontend=${html}`,
      );
      record(
        "frontend served",
        !fs.existsSync(frontendIndex) ? false : html,
        fs.existsSync(frontendIndex) ? `html=${html}` : "po-app dist missing",
      );
    } finally {
      await dropDb(admin, listenName);
    }
  } finally {
    await admin.end();
  }

  const failed = results.filter((r) => !r.ok);
  console.log("\n--- summary ---");
  for (const r of results) {
    console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.detail ? " — " + r.detail : ""}`);
  }
  if (failed.length) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
