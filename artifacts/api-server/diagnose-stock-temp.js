const { Client } = require("pg");

(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  console.log("CONNECTED: yes");

  const tables = await client.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema='public'
      AND (table_name ILIKE '%stock%' OR table_name ILIKE '%invoice%'
           OR table_name ILIKE '%warehouse%' OR table_name ILIKE '%movement%')
    ORDER BY table_name`);
  console.log("\n=== RELEVANT TABLES ===");
  console.log(tables.rows.map(r => r.table_name).join(", "));

  // stock items matching chair/table/STK
  let stockItems;
  try {
    stockItems = await client.query(`
      SELECT id, code, name, stock_qty
      FROM stock_items
      WHERE name ILIKE '%chair%' OR name ILIKE '%table%'
         OR code ILIKE '%chair%' OR code ILIKE '%table%'
         OR code ILIKE '%STK%' OR name ILIKE '%STK%'
      ORDER BY id`);
  } catch (e) {
    // try alternate column names
    const cols = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name='stock_items' ORDER BY ordinal_position`);
    console.log("stock_items columns:", cols.rows.map(r => r.column_name).join(", "));
    throw e;
  }
  console.log("\n=== STOCK ITEMS (chair/table/STK) ===");
  console.log(JSON.stringify(stockItems.rows, null, 2));
  const itemIds = stockItems.rows.map(r => r.id);

  // warehouse_stock for those items
  if (itemIds.length) {
    const ws = await client.query(`
      SELECT * FROM warehouse_stock
      WHERE stock_item_id = ANY($1::int[])
      ORDER BY stock_item_id, warehouse_id`, [itemIds]);
    console.log("\n=== WAREHOUSE_STOCK for matching items ===");
    console.log(JSON.stringify(ws.rows, null, 2));
  } else {
    console.log("\n=== WAREHOUSE_STOCK === (no matching stock items)");
  }

  // latest 15 invoices
  const invCols = await client.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name IN ('invoices','tax_invoices','sales_invoices')
    ORDER BY table_name, ordinal_position`);
  console.log("\n=== INVOICE COLUMNS ===");
  console.log(invCols.rows.map(r => r.table_name + "." + r.column_name).join(", "));

  await client.end();
})().catch(e => { console.error("ERR", e.message); process.exit(1); });
