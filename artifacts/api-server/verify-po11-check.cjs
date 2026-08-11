const { Client } = require("pg");

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  const mov = await c.query(`
    SELECT id, reference_type, reference_id, stock_item_id, warehouse_id, quantity_in, quantity_out, document_number, created_at
    FROM stock_movements
    WHERE reference_id = 11 AND reference_type IN ('purchase_order','purchase_order_reversal')
    ORDER BY id
  `);
  console.log("=== STOCK MOVEMENTS for PO11 ===");
  console.log(JSON.stringify(mov.rows, null, 2));

  const items = await c.query(`
    SELECT id, code, name FROM stock_items
    WHERE UPPER(code) IN ('STK6','CHAIRS','TABLES')
       OR name ILIKE '%chair%'
       OR name ILIKE '%table%'
       OR code ILIKE 'STK6'
    ORDER BY id
  `);
  console.log("=== MATCHING STOCK ITEMS ===");
  console.log(JSON.stringify(items.rows, null, 2));

  const ws = await c.query(`
    SELECT ws.warehouse_id, ws.stock_item_id, ws.quantity, si.code, si.name, w.name as warehouse_name
    FROM warehouse_stock ws
    JOIN stock_items si ON si.id = ws.stock_item_id
    LEFT JOIN warehouses w ON w.id = ws.warehouse_id
    WHERE UPPER(si.code) IN ('STK6','CHAIRS','TABLES')
       OR si.name ILIKE '%chair%'
       OR si.name ILIKE '%table%'
    ORDER BY si.code, ws.warehouse_id
  `);
  console.log("=== WAREHOUSE_STOCK STK6/Chairs/Tables ===");
  console.log(JSON.stringify(ws.rows, null, 2));

  const ws2 = await c.query(`
    SELECT ws.warehouse_id, ws.stock_item_id, ws.quantity, si.code, si.name
    FROM warehouse_stock ws
    JOIN stock_items si ON si.id = ws.stock_item_id
    WHERE ws.stock_item_id IN (16, 22)
    ORDER BY ws.stock_item_id, ws.warehouse_id
  `);
  console.log("=== WAREHOUSE_STOCK ids 16,22 ===");
  console.log(JSON.stringify(ws2.rows, null, 2));

  await c.end();
})().catch((e) => { console.error(e); process.exit(1); });
