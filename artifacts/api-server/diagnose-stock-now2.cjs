const { Client } = require("pg");
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  const chairs = await c.query(`
    SELECT id, company_id, code, name, stock_qty, uom, type
    FROM stock_items WHERE id IN (20, 21) OR code IN ('101','102')
    ORDER BY id
  `);
  for (const si of chairs.rows) {
    const ws = await c.query(`
      SELECT ws.warehouse_id, w.name as warehouse_name, ws.quantity, ws.company_id
      FROM warehouse_stock ws
      LEFT JOIN warehouses w ON w.id = ws.warehouse_id
      WHERE ws.stock_item_id = $1
      ORDER BY ws.warehouse_id
    `, [si.id]);
    console.log(JSON.stringify({ stock_item: si, warehouse_stock: ws.rows }, null, 2));
  }

  console.log("\n=== LATEST 15 stock_movements stock_item_id=21 ===");
  const movs = await c.query(`
    SELECT id, stock_item_id, warehouse_id, quantity_in, quantity_out, balance,
           transaction_type, reference_type, reference_id, document_number, reference,
           movement_date, created_at
    FROM stock_movements
    WHERE stock_item_id = 21
    ORDER BY id DESC
    LIMIT 15
  `);
  console.log(JSON.stringify(movs.rows, null, 2));

  const wh = await c.query(`SELECT id, name, company_id FROM warehouses WHERE company_id=4 ORDER BY id`);
  console.log("\nwarehouses co4:", JSON.stringify(wh.rows));

  await c.end();
})().catch(e=>{console.error(e); process.exit(1);});
