const { Client } = require("pg");

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  console.log("=== Find Tables/Chairs / 101 / 102 / item ids ===");
  const si = await c.query(`
    SELECT id, code, name, stock_qty, company_id, is_active
    FROM stock_items
    WHERE company_id = 4
      AND (
        id IN (20,21,26)
        OR code IN ('101','102','20','21')
        OR name ILIKE '%table%' OR name ILIKE '%chair%'
        OR code ILIKE '%101%' OR code ILIKE '%102%'
      )
    ORDER BY id
  `);
  console.log(JSON.stringify(si.rows, null, 2));

  console.log("\n=== All stock_items company 4 ===");
  const all = await c.query(`SELECT id, code, name, stock_qty FROM stock_items WHERE company_id = 4 ORDER BY id`);
  console.log(JSON.stringify(all.rows, null, 2));

  console.log("\n=== warehouse_stock for item 26 all warehouses ===");
  const ws = await c.query(`
    SELECT ws.*, w.name AS warehouse_name, w.is_default
    FROM warehouse_stock ws
    LEFT JOIN warehouses w ON w.id = ws.warehouse_id
    WHERE ws.company_id = 4 AND ws.stock_item_id = 26
    ORDER BY ws.warehouse_id
  `);
  console.log(JSON.stringify(ws.rows, null, 2));

  console.log("\n=== ALL stock_movements for item 26 ordered by id ===");
  const movs = await c.query(`
    SELECT id, warehouse_id, stock_item_id, transaction_type, reference_type,
           quantity_in AS qty_in, quantity_out AS qty_out, created_at, movement_date,
           reference, document_number, reference_id, balance
    FROM stock_movements
    WHERE company_id = 4 AND stock_item_id = 26
    ORDER BY id
  `);
  console.log(JSON.stringify(movs.rows, null, 2));

  console.log("\n=== INV23 full items JSON ===");
  const inv = await c.query(`SELECT id, inv_number, status, items, created_at, updated_at FROM invoices WHERE id=22`);
  // may not have updated_at
  console.log(JSON.stringify(inv.rows, null, 2));

  // Also check invoices 18-21 movements
  for (const id of [18,19,20,21,22]) {
    const m = await c.query(`
      SELECT id, warehouse_id, stock_item_id, transaction_type, reference_type,
             quantity_in AS qty_in, quantity_out AS qty_out, reference, document_number
      FROM stock_movements
      WHERE company_id=4 AND reference_type IN ('invoice','invoice_reversal','invoice_void')
        AND reference_id=$1
      ORDER BY id
    `, [id]);
    console.log(`\n--- invoice id ${id} movements ---`);
    console.log(JSON.stringify(m.rows, null, 2));
  }

  console.log("\n=== Any BOOT/bootstrap anywhere company 4 ===");
  const boot = await c.query(`
    SELECT id, warehouse_id, stock_item_id, transaction_type, reference_type,
           quantity_in, quantity_out, document_number, reference, created_at
    FROM stock_movements
    WHERE company_id = 4
      AND (
        reference_type = 'stock_bootstrap'
        OR document_number ILIKE 'BOOT-%'
        OR transaction_type = 'opening_stock'
        OR reference ILIKE '%Synced from stock%'
      )
    ORDER BY id
  `);
  console.log(JSON.stringify(boot.rows, null, 2));

  console.log("\n=== Last 40 stock_movements company 4 ===");
  const last = await c.query(`
    SELECT id, warehouse_id, stock_item_id, transaction_type, reference_type,
           quantity_in AS qty_in, quantity_out AS qty_out, document_number, reference, created_at
    FROM stock_movements
    WHERE company_id = 4
    ORDER BY id DESC
    LIMIT 40
  `);
  console.log(JSON.stringify(last.rows, null, 2));

  await c.end();
})().catch((e) => { console.error(e); process.exit(1); });
