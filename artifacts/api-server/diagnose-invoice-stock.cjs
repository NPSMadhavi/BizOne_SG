const { Client } = require("pg");

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  // 1) Latest 5 invoices with line details
  const invs = await c.query(`
    SELECT id, inv_number, status, company_id, created_at, items
    FROM invoices
    ORDER BY id DESC
    LIMIT 5`);

  console.log("=== 1) LATEST 5 INVOICES (lines) ===");
  for (const inv of invs.rows) {
    console.log(`\nInvoice #${inv.id} ${inv.inv_number} status=${inv.status} company=${inv.company_id} created=${inv.created_at}`);
    const items = Array.isArray(inv.items) ? inv.items : [];
    if (!items.length) console.log("  (no items)");
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      console.log(`  line[${i}]: qty=${it.qty ?? it.quantity ?? it.Qty} stockItemId=${it.stockItemId ?? it.stock_item_id ?? it.itemId} warehouseId=${it.warehouseId ?? it.warehouse_id} keys=${Object.keys(it).join(",")}`);
      console.log("    raw:", JSON.stringify(it));
    }
  }

  const latest = invs.rows[0];
  if (!latest) {
    console.log("No invoices");
    await c.end();
    return;
  }

  // 2) All stock_movements for that reference_id
  console.log("\n=== 2) STOCK_MOVEMENTS for reference_id=" + latest.id + " (all reference_types) ===");
  const moves = await c.query(`
    SELECT id, warehouse_id, stock_item_id, transaction_type, reference_type, reference_id,
           quantity_in, quantity_out, balance, reference, document_number, movement_date, created_at
    FROM stock_movements
    WHERE reference_id = $1
    ORDER BY id`, [latest.id]);

  // Also by document / inv number in case reference_id differs
  const movesByDoc = await c.query(`
    SELECT id, warehouse_id, stock_item_id, transaction_type, reference_type, reference_id,
           quantity_in, quantity_out, balance, reference, document_number, movement_date, created_at
    FROM stock_movements
    WHERE reference_id = $1
       OR document_number = $2
       OR reference ILIKE '%' || $2 || '%'
       OR (reference_type ILIKE '%invoice%' AND reference_id = $1)
    ORDER BY id`, [latest.id, latest.inv_number]);

  console.log(`By reference_id only: ${moves.rows.length} rows`);
  console.log(`By ref_id OR doc/ref match: ${movesByDoc.rows.length} rows`);

  const allMoves = movesByDoc.rows.length >= moves.rows.length ? movesByDoc.rows : moves.rows;
  for (const m of allMoves) {
    console.log(`  id=${m.id} type=${m.transaction_type} refType=${m.reference_type} refId=${m.reference_id} wh=${m.warehouse_id} item=${m.stock_item_id} in=${m.quantity_in} out=${m.quantity_out} bal=${m.balance} ref=${m.reference} doc=${m.document_number}`);
  }

  // Also specifically invoice-related movements with various reference patterns
  console.log("\n=== 2b) Movements mentioning invoice id or number ===");
  const moves2 = await c.query(`
    SELECT id, warehouse_id, stock_item_id, transaction_type, reference_type, reference_id,
           quantity_in, quantity_out, balance, reference, document_number
    FROM stock_movements
    WHERE reference_id = $1
       OR CAST(reference AS text) ILIKE $2
       OR document_number ILIKE $3
    ORDER BY id`, [latest.id, `%${latest.id}%`, `%${latest.inv_number}%`]);
  for (const m of moves2.rows) {
    console.log(`  id=${m.id} type=${m.transaction_type} refType=${m.reference_type} refId=${m.reference_id} wh=${m.warehouse_id} item=${m.stock_item_id} in=${m.quantity_in} out=${m.quantity_out} bal=${m.balance} ref=${m.reference} doc=${m.document_number}`);
  }

  // Distinct transaction/reference types sample
  const types = await c.query(`
    SELECT DISTINCT transaction_type, reference_type FROM stock_movements
    WHERE transaction_type ILIKE '%invoice%' OR reference_type ILIKE '%invoice%'
       OR transaction_type ILIKE '%goods%' OR transaction_type ILIKE '%adjust%'
       OR reference_type ILIKE '%reversal%' OR transaction_type ILIKE '%reversal%'
    ORDER BY 1,2`);
  console.log("\n=== Distinct invoice/goods/adjust types ===");
  for (const t of types.rows) console.log(`  ${t.transaction_type} / ${t.reference_type}`);

  // 3) Net vs line qty for latest
  console.log("\n=== 3) NET vs LINE QTY (latest invoice #" + latest.id + ") ===");
  const items = Array.isArray(latest.items) ? latest.items : [];
  const itemKeys = new Set();
  for (const it of items) {
    const sid = it.stockItemId ?? it.stock_item_id ?? it.itemId;
    const wid = it.warehouseId ?? it.warehouse_id;
    const qty = Number(it.qty ?? it.quantity ?? it.Qty ?? 0);
    itemKeys.add(`${sid}|${wid}`);
    const related = allMoves.filter((m) => m.stock_item_id == sid && (wid == null || m.warehouse_id == wid));
    // also all moves for item regardless of warehouse if wid missing
    const relatedAny = allMoves.filter((m) => m.stock_item_id == sid);
    const use = related.length ? related : relatedAny;
    let sumIn = 0, sumOut = 0;
    for (const m of use) {
      sumIn += Number(m.quantity_in || 0);
      sumOut += Number(m.quantity_out || 0);
    }
    const net = sumIn - sumOut; // positive = ADD to stock
    console.log(`  item=${sid} wh=${wid} lineQty=${qty} sumIn=${sumIn} sumOut=${sumOut} net(in-out)=${net} expectedNet=-${qty} matchOut=${sumOut === qty && sumIn === 0} PROBLEM_ADD=${net > 0}`);
  }

  // 4) Check last save: adjustment_in / invoice_reversal without matching goods_issue
  console.log("\n=== 4) LAST-SAVE PATTERN (adjustment_in / invoice_reversal vs goods_issue) ===");
  const byItem = {};
  for (const m of allMoves) {
    const k = `${m.stock_item_id}|${m.warehouse_id}`;
    if (!byItem[k]) byItem[k] = [];
    byItem[k].push(m);
  }
  for (const [k, list] of Object.entries(byItem)) {
    const addTypes = list.filter((m) =>
      /adjustment_in|invoice_reversal|reversal/i.test(String(m.transaction_type) + " " + String(m.reference_type)) ||
      Number(m.quantity_in) > 0
    );
    const issueTypes = list.filter((m) =>
      /goods_issue|invoice|sale/i.test(String(m.transaction_type) + " " + String(m.reference_type)) &&
      Number(m.quantity_out) > 0
    );
    const last = list[list.length - 1];
    const lastIsAdd = Number(last.quantity_in) > 0 && Number(last.quantity_out || 0) === 0;
    const totalIn = list.reduce((s, m) => s + Number(m.quantity_in || 0), 0);
    const totalOut = list.reduce((s, m) => s + Number(m.quantity_out || 0), 0);
    console.log(`  ${k}: moves=${list.length} totalIn=${totalIn} totalOut=${totalOut} lastId=${last.id} lastType=${last.transaction_type}/${last.reference_type} lastIn=${last.quantity_in} lastOut=${last.quantity_out} lastIsAdd=${lastIsAdd}`);
    console.log(`    ADD-like rows: ${addTypes.map((m) => `${m.id}:${m.transaction_type}/${m.reference_type} in=${m.quantity_in}`).join(" | ") || "(none)"}`);
    console.log(`    OUT/issue rows: ${issueTypes.map((m) => `${m.id}:${m.transaction_type}/${m.reference_type} out=${m.quantity_out}`).join(" | ") || "(none)"}`);
    if (lastIsAdd && totalOut < totalIn) {
      console.log(`    >>> ROOT PATTERN: last movement ADDS stock; net ADD without full matching goods_issue (in=${totalIn} out=${totalOut})`);
    }
  }

  // 5) Current warehouse qty
  console.log("\n=== 5) CURRENT warehouse_stock for invoice line items ===");
  for (const it of items) {
    const sid = it.stockItemId ?? it.stock_item_id ?? it.itemId;
    const wid = it.warehouseId ?? it.warehouse_id;
    if (sid == null) continue;
    const ws = await c.query(`
      SELECT warehouse_id, stock_item_id, quantity, updated_at
      FROM warehouse_stock
      WHERE stock_item_id = $1 AND ($2::int IS NULL OR warehouse_id = $2)
      ORDER BY warehouse_id`, [sid, wid ?? null]);
    const si = await c.query(`SELECT id, code, name, stock_qty FROM stock_items WHERE id=$1`, [sid]);
    console.log(`  item ${sid} (${si.rows[0]?.code} ${si.rows[0]?.name}) stock_items.stock_qty=${si.rows[0]?.stock_qty}`);
    for (const w of ws.rows) {
      console.log(`    wh=${w.warehouse_id} qty=${w.quantity} updated=${w.updated_at}`);
    }
    if (!ws.rows.length) console.log(`    (no warehouse_stock rows for item=${sid} wh=${wid})`);
  }

  await c.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
