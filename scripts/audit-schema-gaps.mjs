import fs from "fs";
import path from "path";

const root = process.cwd();
const schemaDir = path.join(root, "lib/db/src/schema");
const migrateSources = [
  "artifacts/api-server/src/lib/startup-backfill.ts",
  "artifacts/api-server/src/migrate-wms-tables.ts",
  "artifacts/api-server/src/migrate-operations-tables.ts",
  "artifacts/api-server/src/migrate-auth-fields.ts",
  "scripts/migrate-operations-tables.sql",
].map((p) => fs.readFileSync(path.join(root, p), "utf8")).join("\n");

const COL_TYPES =
  /\b(?:serial|text|integer|boolean|timestamp|jsonb|decimal|numeric|varchar|date|time|bigint|real|doublePrecision|json)\s*\(\s*["']([a-z0-9_]+)["']/g;

function extractTables(text) {
  const tables = {};
  const re = /pgTable\(\s*["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const table = m[1];
    const slice = text.slice(m.index, m.index + 12000);
    const brace = slice.indexOf("{");
    if (brace < 0) continue;
    let depth = 0;
    let end = brace;
    for (let i = brace; i < slice.length; i++) {
      if (slice[i] === "{") depth++;
      if (slice[i] === "}") {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    const block = slice.slice(brace, end + 1);
    const cols = new Set();
    let x;
    COL_TYPES.lastIndex = 0;
    while ((x = COL_TYPES.exec(block)) !== null) cols.add(x[1]);
    tables[table] = [...cols].sort();
  }
  return tables;
}

function createHasColumn(sqlText, table, col) {
  const createRe = new RegExp(
    `CREATE TABLE IF NOT EXISTS\\s+${table}\\s*\\(([\\s\\S]*?)\\)`,
    "i",
  );
  const cm = sqlText.match(createRe);
  if (!cm) return false;
  return new RegExp(`\\b${col}\\b`, "i").test(cm[1]);
}

function alterHasColumn(sqlText, table, col) {
  const alterPat = new RegExp(
    `ALTER TABLE\\s+${table}\\s+ADD COLUMN(?:\\s+IF NOT EXISTS)?\\s+${col}\\b`,
    "i",
  );
  return alterPat.test(sqlText);
}

const allTables = {};
for (const file of fs.readdirSync(schemaDir).filter((f) => f.endsWith(".ts"))) {
  Object.assign(allTables, extractTables(fs.readFileSync(path.join(schemaDir, file), "utf8")));
}

const gaps = [];
for (const [table, cols] of Object.entries(allTables)) {
  for (const col of cols) {
    const inCreate = createHasColumn(migrateSources, table, col);
    const inAlter = alterHasColumn(migrateSources, table, col);
    if (!inCreate && !inAlter) gaps.push({ table, col });
  }
}

gaps.sort((a, b) => a.table.localeCompare(b.table) || a.col.localeCompare(b.col));
const by = {};
for (const g of gaps) (by[g.table] ||= []).push(g.col);

console.log(JSON.stringify({ tableCount: Object.keys(allTables).length, gapCount: gaps.length, by }, null, 2));
