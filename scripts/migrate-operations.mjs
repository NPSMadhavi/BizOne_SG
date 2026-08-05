import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.resolve(__dirname, "../artifacts/api-server/package.json"));
const pg = require("pg");

function loadDatabaseUrl() {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const envPath = path.resolve(__dirname, "../artifacts/api-server/src/.env");
  const envText = fs.readFileSync(envPath, "utf8");
  const match = envText.match(/^DATABASE_URL=(.+)$/m);
  if (!match) {
    throw new Error("DATABASE_URL not found in artifacts/api-server/src/.env");
  }
  return match[1].trim().replace(/^"|"$/g, "");
}

const sqlText = fs.readFileSync(path.resolve(__dirname, "migrate-operations-tables.sql"), "utf8");
const statements = sqlText
  .split(";")
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("--"));

const pool = new pg.Pool({ connectionString: loadDatabaseUrl() });

try {
  for (const statement of statements) {
    await pool.query(`${statement};`);
  }

  await pool.query(`
    UPDATE user_companies
    SET modules = (
      SELECT COALESCE(jsonb_agg(DISTINCT value), '[]'::jsonb)
      FROM jsonb_array_elements_text(
        COALESCE(modules, '[]'::jsonb) ||
        '["dashboard","assets","licenses","employees","payroll","service_reports"]'::jsonb
      ) AS value
    )
    WHERE modules IS NULL OR NOT modules @> '["assets"]'::jsonb;
  `);

  console.log("Operations tables migration complete.");
} finally {
  await pool.end();
}
