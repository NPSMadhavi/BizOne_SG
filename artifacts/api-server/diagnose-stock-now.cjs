const { Client } = require("pg");

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  const invs = await c.query(`
    SELECT i.id, i.inv_number, i.status, i.created_at, i.items, i.company_id
    FROM invoices i
    ORDER BY i.id DESC
    LIMIT 5
  `);

  console.log("=== LATEST 5 INVOICES ===");
  const parsed = [];
  for (const inv of invs.rows) {
    let items = inv.items;
    if (typeof items === "string") {
      try { items = JSON.parse(items); } catch { items = []; }
    }
    if (!Array.isArray(items)) items = [];
    const slim = items.map((it) => ({
      qty: it.quantity ?? it.qty,
      stockItemId: it.stockItemId ?? it.stock_item_id,
      warehouseId: it.warehouseId ?? it.warehouse_id,
      partNumber: it.partNumber ?? it.part_number ?? it.itemCode ?? it.item_code,
      description: it.description ?? it.itemName ?? it.item_name,
      rawKeys: Object.keys(it),
    }));
    parsed.push({ ...inv, items: slim, rawItems: items });
    console.log(JSON.stringify({
      id: inv.id, inv_number: inv.inv_number, status: inv.status, created_at: inv.created_at, company_id: inv.company_id, items: slim
    }, null, 2));
  }

  console.log("\n=== NET DEDUCTED VS LINE QTY ===");
  for (const inv of parsed) {
    for (const it of inv.items) {
      const sid = it.stockItemId;
      if (!sid) {
        console.log(JSON.stringify({ invoice: inv.inv_number, invId: inv.id, flag: "NO_STOCK_ITEM_ID", it }));
        continue;
      }
      const mov = await c.query(`
        SELECT
          COALESCE(SUM(CASE WHEN reference_type IN ('invoice','invoice_reversal','invoice_void')
            THEN COALESCE(quantity_out,0) - COALESCE(quantity_in,0) ELSE 0 END),0)::float as net_deducted,
          COUNT(*) FILTER (WHERE reference_type IN ('invoice','invoice_reversal','invoice_void')) as mov_count,
          array_agg(DISTINCT reference_type) as types,
          array_agg(DISTINCT transaction_type) as txn_types
        FROM stock_movements
        WHERE stock_item_id = $1
          AND (
            reference_id::text = $2::text
            OR document_number ILIKE '%' || $3 || '%'
            OR reference ILIKE '%' || $3 || '%'
          )
      `, [sid, inv.id, inv.inv_number]);

      const movStrict = await c.query(`
        SELECT
          COALESCE(SUM(COALESCE(quantity_out,0) - COALESCE(quantity_in,0)),0)::float as net_deducted,
          COUNT(*) as mov_count,
          json_agg(json_build_object(
            'id', id, 'ref_type', reference_type, 'txn', transaction_type,
            'qin', quantity_in, 'qout', quantity_out, 'wh', warehouse_id,
            'ref_id', reference_id, 'doc', document_number, 'ref', reference
          ) ORDER BY id) as rows
        FROM stock_movements
        WHERE stock_item_id = $1
          AND reference_type IN ('invoice','invoice_reversal','invoice_void')
          AND (
            reference_id::text = $2::text
            OR document_number ILIKE '%' || $3 || '%'
          )
      `, [sid, inv.id, inv.inv_number]);

      const net = Number(movStrict.rows[0].net_deducted);
      const qty = Number(it.qty);
      let flag = "OK";
      if (movStrict.rows[0].mov_count === 0 || net === 0) flag = "ZERO_NET";
      else if (Math.abs(net - qty) > 0.001) flag = "MISMATCH";
      console.log(JSON.stringify({
        invoice: inv.inv_number, invId: inv.id, status: inv.status,
        stockItemId: sid, warehouseId: it.warehouseId, lineQty: qty,
        netDeducted: net, movCount: movStrict.rows[0].mov_count,
        broad: { net: mov.rows[0].net_deducted, count: mov.rows[0].mov_count, types: mov.rows[0].types, txn: mov.rows[0].txn_types },
        movements: movStrict.rows[0].rows,
        flag
      }, null, 2));
    }
  }

  console.log("\n=== CHAIRS (code 102 / id 21) ===");
  const chairs = await c.query(`
    SELECT id, item_code, part_number, item_name, stock_qty, company_id
    FROM stock_items
    WHERE id = 21 OR item_code = '102' OR item_code ILIKE '102' OR LOWER(item_name) LIKE '%chair%'
    ORDER BY id LIMIT 20
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

  const recentIds = [...new Set(parsed.flatMap(p => p.items.map(i => i.stockItemId).filter(Boolean)))];
  console.log("\n=== RECENT INVOICE STOCK ITEMS AVAILABILITY ===");
  for (const sid of recentIds) {
    const si = await c.query(`SELECT id, item_code, part_number, item_name, stock_qty FROM stock_items WHERE id = $1`, [sid]);
    const ws = await c.query(`
      SELECT ws.warehouse_id, w.name as warehouse_name, ws.quantity
      FROM warehouse_stock ws LEFT JOIN warehouses w ON w.id = ws.warehouse_id
      WHERE ws.stock_item_id = $1 ORDER BY ws.warehouse_id
    `, [sid]);
    console.log(JSON.stringify({ stock_item: si.rows[0], warehouse_stock: ws.rows }, null, 2));
  }

  console.log("\n=== LATEST 15 stock_movements for latest invoice stock item ===");
  const latest = parsed[0];
  const sid = latest?.items?.[0]?.stockItemId;
  if (sid) {
    const movs = await c.query(`
      SELECT id, stock_item_id, warehouse_id, quantity_in, quantity_out, balance,
             transaction_type, reference_type, reference_id, document_number, reference,
             movement_date, created_at
      FROM stock_movements
      WHERE stock_item_id = $1
      ORDER BY id DESC
      LIMIT 15
    `, [sid]);
    console.log("stock_item_id:", sid, "invoice:", latest.inv_number, "invId:", latest.id);
    console.log(JSON.stringify(movs.rows, null, 2));
  } else {
    console.log("No stock item on latest invoice");
  }

  await c.end();
})().catch((e) => { console.error(e); process.exit(1); });
