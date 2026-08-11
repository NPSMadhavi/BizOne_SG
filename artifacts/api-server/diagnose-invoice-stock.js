const { Client } = require("pg");

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  const tables = await c.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema='public'
      AND (table_name ILIKE '%invoice%' OR table_name ILIKE '%stock%' OR table_name ILIKE '%warehouse%' OR table_name ILIKE '%tax%')
    ORDER BY 1`);
  console.log("=== TABLES ===");
  console.log(tables.rows.map((r) => r.table_name).join("\n"));

  await c.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
