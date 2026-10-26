import fs from "node:fs";
import pg from "pg";
import { execSync } from "node:child_process";

const sqlPath = new URL("../db-scripts/schema-postgres.sql", import.meta.url);
const raw = fs.readFileSync(sqlPath, "utf8");

function splitSql(sql) {
  const out = [];
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
      const s = buf.trim();
      if (s) out.push(s);
      buf = "";
      continue;
    }
    buf += ch;
  }
  const t = buf.trim();
  if (t) out.push(t);
  return out;
}

execSync(
  `"C:\\Program Files\\PostgreSQL\\18\\bin\\psql.exe" -h localhost -U postgres -d postgres -c "DROP DATABASE IF EXISTS bizone_schema_heal_test;" -c "CREATE DATABASE bizone_schema_heal_test;"`,
  { env: { ...process.env, PGPASSWORD: "Madhu2002" }, stdio: "inherit" },
);

const stmts = splitSql(raw)
  .map((s) =>
    s
      .split(/\r?\n/)
      .filter((line) => !/^\s*--/.test(line))
      .join("\n")
      .trim(),
  )
  .filter((t) => t && !/^DROP\s/i.test(t) && !/^\\/i.test(t));

const client = new pg.Client({
  connectionString: "postgresql://postgres:Madhu2002@localhost:5432/bizone_schema_heal_test",
});
await client.connect();
let ok = 0;
let skip = 0;
for (const s of stmts) {
  try {
    await client.query(s);
    ok++;
  } catch {
    skip++;
  }
}
const r = await client.query(
  "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'",
);
console.log(JSON.stringify({ ok, skip, tables: r.rows[0].n, first: stmts[0].slice(0, 50) }));
await client.end();
