/**
 * Validate migrate-drizzle-columns.ts ALTER types vs Drizzle schema field types.
 */
import fs from "fs";
import path from "path";

const root = process.cwd();
const migratePath = path.join(root, "artifacts/api-server/src/migrate-drizzle-columns.ts");
const schemaDir = path.join(root, "lib/db/src/schema");

const migrateSrc = fs.readFileSync(migratePath, "utf8");

const DOC_TABLES = [
  "sales_orders",
  "invoices",
  "quotations",
  "delivery_orders",
  "credit_notes",
  "debit_notes",
  "proforma_invoices",
  "vendor_invoices",
];

const CRITICAL = [
  "terms_and_conditions",
  "delivery_instructions",
  "customer_note",
  "authorised_signature",
];

const drizzleTypeMap = {
  text: "text",
  integer: "integer",
  boolean: "boolean",
  jsonb: "jsonb",
  decimal: "numeric",
  numeric: "numeric",
  timestamp: "timestamptz",
  serial: "serial",
  date: "date",
};

function extractDrizzleColumns(fileText) {
  const tables = {};
  const re = /pgTable\(\s*["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(fileText)) !== null) {
    const table = m[1];
    const slice = fileText.slice(m.index, m.index + 12000);
    const brace = slice.indexOf("{");
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
    const cols = {};
    const colRe =
      /(\w+)\s*:\s*(text|integer|boolean|jsonb|decimal|numeric|timestamp|serial|date)\s*\(\s*["']([a-z0-9_]+)["']/g;
    let c;
    while ((c = colRe.exec(block)) !== null) {
      const drizzleFn = c[2];
      const col = c[3];
      const nullable = !/\.notNull\(/.test(block.slice(c.index, c.index + 200));
      // crude: check same property chain for notNull/default
      const propEnd = block.indexOf(",", c.index);
      const prop = block.slice(c.index, propEnd > 0 ? propEnd : c.index + 180);
      cols[col] = {
        drizzleFn,
        pgHint: drizzleTypeMap[drizzleFn] || drizzleFn,
        notNull: prop.includes(".notNull("),
        hasDefault: prop.includes(".default("),
      };
    }
    tables[table] = cols;
  }
  return tables;
}

const allDrizzle = {};
for (const f of fs.readdirSync(schemaDir).filter((x) => x.endsWith(".ts"))) {
  Object.assign(
    allDrizzle,
    extractDrizzleColumns(fs.readFileSync(path.join(schemaDir, f), "utf8")),
  );
}

const alterRe =
  /ALTER TABLE\s+(\w+)\s+ADD COLUMN IF NOT EXISTS\s+(\w+)\s+([^`]+)/gi;
const alters = [];
let am;
while ((am = alterRe.exec(migrateSrc)) !== null) {
  alters.push({
    table: am[1],
    column: am[2],
    sqlType: am[3].trim().replace(/\s+/g, " "),
  });
}

const rows = [];
const suspicious = [];

for (const a of alters) {
  const d = allDrizzle[a.table]?.[a.column];
  const migType = a.sqlType.toLowerCase();
  let safe = true;
  let notes = "";
  if (!d) {
    notes = "not found in drizzle (ok if ops/legacy)";
  } else {
    const expect = d.pgHint;
    if (expect === "text" && !migType.startsWith("text")) {
      safe = false;
      notes = `drizzle expects text, migration has ${a.sqlType}`;
    }
    if (expect === "integer" && !migType.includes("integer") && !migType.includes("serial")) {
      safe = false;
      notes = `drizzle expects integer`;
    }
    if (expect === "boolean" && !migType.includes("boolean")) {
      safe = false;
      notes = `drizzle expects boolean`;
    }
    if (expect === "numeric" && !migType.includes("numeric")) {
      safe = false;
      notes = `drizzle expects numeric`;
    }
    if (expect === "jsonb" && !migType.includes("jsonb")) {
      safe = false;
      notes = `drizzle expects jsonb`;
    }
    if (d.notNull && !migType.includes("not null") && !migType.includes("default")) {
      notes += (notes ? "; " : "") + "drizzle notNull but migration nullable (safe for existing rows)";
    }
    if (d.notNull && migType.includes("not null") && !migType.includes("default")) {
      safe = false;
      notes = "NOT NULL without DEFAULT — unsafe on tables with existing rows";
    }
  }
  const row = {
    table: a.table,
    column: a.column,
    drizzleType: d ? `${d.drizzleFn}${d.notNull ? " notNull" : ""}` : "(n/a)",
    migrationType: a.sqlType,
    nullable: !/not null/i.test(a.sqlType),
    default: /default/i.test(a.sqlType) ? a.sqlType.match(/default\s+(.+)$/i)?.[1] : "",
    safe,
    notes,
  };
  rows.push(row);
  if (!safe) suspicious.push(row);
}

const criticalCoverage = [];
for (const t of DOC_TABLES) {
  for (const c of CRITICAL) {
    const hasAlter = alters.some((a) => a.table === t && a.column === c);
    const inDrizzle = Boolean(allDrizzle[t]?.[c]);
    criticalCoverage.push({ table: t, column: c, inDrizzle, hasAlter, ok: !inDrizzle || hasAlter });
  }
}

console.log(
  JSON.stringify(
    {
      alterCount: alters.length,
      suspiciousCount: suspicious.length,
      suspicious,
      criticalMissing: criticalCoverage.filter((x) => !x.ok),
      criticalCoverage,
      sampleDocAlters: rows.filter((r) => DOC_TABLES.includes(r.table) && CRITICAL.includes(r.column)),
    },
    null,
    2,
  ),
);
