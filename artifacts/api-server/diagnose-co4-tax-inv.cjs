const { Client } = require("pg");

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  console.log("=== 1. LATEST 5 INVOICES company 4 ===");
  const invs = await c.query(`
    SELECT i.id, i.inv_number, i.status, i.items
    FROM invoices i
    WHERE i.company_id = 4
    ORDER BY i.id DESC
    LIMIT 5
  `);

  for (const inv of invs.rows) {
    let items = inv.items;
    if (typeof items === "string") {
      try { items = JSON.parse(items); } catch { items = []; }
    }
    if (!Array.isArray(items)) items = [];
    const mapped = items.filter(it => it && it.type !== "section").map(it => ({
      qty: it.qty,
      stockItemId: it.stockItemId,
      warehouseId: it.warehouseId,
      partNumber: it.partNumber || it.part_number || it.code || it.name,
    }));
    console.log(JSON.stringify({ id: inv.id, inv_number: inv.inv_number, status: inv.status, items: mapped }, null, 2));
  }

  const latest = invs.rows[0];
  if (!latest) { await c.end(); return; }

  console.log("\n=== 2. ALL stock_movements for latest invoice", latest.id, latest.inv_number, "===");
  const movs2 = await c.query(`
    SELECT id, warehouse_id, stock_item_id, transaction_type, reference_type,
           quantity_in AS qty_in, quantity_out AS qty_out, created_at, movement_date,
           reference, document_number, reference_id
    FROM stock_movements
    WHERE company_id = 4
      AND reference_type IN ('invoice','invoice_reversal','invoice_void')
      AND reference_id = $1
    ORDER BY id
  `, [latest.id]);
  console.log(JSON.stringify(movs2.rows, null, 2));

  // Also show movements near invoice time that might be bootstrap for those items
  let items = latest.items;
  if (typeof items === "string") try { items = JSON.parse(items); } catch { items = []; }
  const stockIds = [...new Set((items||[]).map(i => Number(i.stockItemId)).filter(n => n > 0))];
  console.log("\nStock item ids on latest invoice:", stockIds);

  console.log("\n=== 3. Last 25 stock_movements for items 20 and 21 ===");
  const movs = await c.query(`
    SELECT id, warehouse_id, stock_item_id, transaction_type, reference_type,
           quantity_in AS qty_in, quantity_out AS qty_out, created_at, movement_date,
           reference, document_number, reference_id
    FROM stock_movements
    WHERE company_id = 4 AND stock_item_id IN (20, 21)
    ORDER BY id DESC
    LIMIT 25
  `);
  console.log(JSON.stringify(movs.rows, null, 2));

  console.log("\n=== Focus opening/bootstrap/adj ===");
  const boot = await c.query(`
    SELECT id, warehouse_id, stock_item_id, transaction_type, reference_type,
           quantity_in AS qty_in, quantity_out AS qty_out, created_at, movement_date,
           reference, document_number
    FROM stock_movements
    WHERE company_id = 4 AND stock_item_id IN (20, 21)
      AND (
        reference_type IN ('opening_stock','stock_bootstrap','adjustment_in','adjustment','invoice_reversal')
        OR COALESCE(transaction_type,'') ILIKE '%open%'
        OR COALESCE(transaction_type,'') ILIKE '%boot%'
        OR COALESCE(transaction_type,'') ILIKE '%adjust%'
        OR COALESCE(document_number,'') ILIKE 'BOOT-%'
        OR COALESCE(reference,'') ILIKE '%boot%'
        OR COALESCE(reference,'') ILIKE '%Synced%'
      )
    ORDER BY id
  `);
  console.log(JSON.stringify(boot.rows, null, 2));

  console.log("\n=== Movements into warehouse 3 for items 20,21 ===");
  const into3 = await c.query(`
    SELECT id, warehouse_id, stock_item_id, transaction_type, reference_type,
           quantity_in AS qty_in, quantity_out AS qty_out, created_at, movement_date,
           reference, document_number, reference_id
    FROM stock_movements
    WHERE company_id = 4 AND stock_item_id IN (20, 21) AND warehouse_id = 3
      AND COALESCE(quantity_in,0) > 0
    ORDER BY id
  `);
  console.log(JSON.stringify(into3.rows, null, 2));

  console.log("\n=== 4. warehouse_stock items 20,21 ===");
  const ws = await c.query(`
    SELECT ws.id, ws.warehouse_id, ws.stock_item_id, ws.quantity, w.name AS warehouse_name, w.is_default
    FROM warehouse_stock ws
    LEFT JOIN warehouses w ON w.id = ws.warehouse_id
    WHERE ws.company_id = 4 AND ws.stock_item_id IN (20, 21)
    ORDER BY ws.stock_item_id, ws.warehouse_id
  `);
  console.log(JSON.stringify(ws.rows, null, 2));

  console.log("\n=== 5. Any stock_bootstrap or BOOT- company 4 ===");
  const b2 = await c.query(`
    SELECT id, warehouse_id, stock_item_id, transaction_type, reference_type,
           quantity_in AS qty_in, quantity_out AS qty_out, created_at, reference, document_number
    FROM stock_movements
    WHERE company_id = 4
      AND (reference_type = 'stock_bootstrap' OR COALESCE(document_number,'') ILIKE 'BOOT-%'
           OR reference_type = 'opening_stock' OR transaction_type = 'opening_stock')
    ORDER BY id DESC
    LIMIT 50
  `);
  console.log(JSON.stringify(b2.rows, null, 2));

  console.log("\n=== stock_items 20,21 ===");
  const siCols = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name='stock_items' ORDER BY ordinal_position`);
  console.log("stock_items cols:", siCols.rows.map(r => r.column_name).join(", "));
  const si = await c.query(`SELECT * FROM stock_items WHERE id IN (20,21)`);
  console.log(JSON.stringify(si.rows, null, 2));

  console.log("\n=== warehouses company 4 ===");
  const wh = await c.query(`SELECT id, code, name, is_default, is_active FROM warehouses WHERE company_id = 4 ORDER BY id`);
  console.log(JSON.stringify(wh.rows, null, 2));

  // All invoice movements for recent invoices for items 20/21
  console.log("\n=== All invoice* movements for items 20/21 last 40 ===");
  const allInv = await c.query(`
    SELECT id, warehouse_id, stock_item_id, transaction_type, reference_type,
           quantity_in AS qty_in, quantity_out AS qty_out, created_at, reference, document_number, reference_id
    FROM stock_movements
    WHERE company_id = 4 AND stock_item_id IN (20, 21)
      AND reference_type IN ('invoice','invoice_reversal','invoice_void')
    ORDER BY id DESC
    LIMIT 40
  `);
  console.log(JSON.stringify(allInv.rows, null, 2));

  await c.end();
})().catch((e) => { console.error(e); process.exit(1); });
