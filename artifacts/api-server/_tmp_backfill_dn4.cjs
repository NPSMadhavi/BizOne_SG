const { Client } = require("pg");
(async () => {
  const c = new Client({
    connectionString: "postgresql://postgres:Madhu2002@localhost:5432/bizone_spsynet",
  });
  await c.connect();
  await c.query("BEGIN");

  const dn = (await c.query(`SELECT * FROM debit_notes WHERE dn_number = 'DN4'`)).rows[0];
  if (!dn) throw new Error("DN4 not found");

  const existing = await c.query(
    `SELECT count(*)::int AS n FROM stock_movements
     WHERE company_id = $1 AND reference_id = $2 AND reference_type IN ('debit_note','debit_note_reversal')`,
    [dn.company_id, dn.id],
  );
  if (existing.rows[0].n > 0) {
    console.log("DN4 already has stock movements");
    await c.query("ROLLBACK");
    await c.end();
    return;
  }

  const items = typeof dn.items === "string" ? JSON.parse(dn.items) : dn.items;
  for (const it of items || []) {
    if (it?.type === "section") continue;
    const qty = Number(it.qty) || 0;
    const code = String(it.partNumber || "").trim();
    if (qty <= 0 || !code) continue;

    const si = (await c.query(
      `SELECT id FROM stock_items WHERE company_id = $1 AND lower(code) = lower($2) LIMIT 1`,
      [dn.company_id, code],
    )).rows[0];
    if (!si) throw new Error("No item " + code);

    let wh = (await c.query(
      `SELECT warehouse_id FROM warehouse_stock
       WHERE company_id = $1 AND stock_item_id = $2 AND quantity::numeric > 0
       ORDER BY quantity::numeric DESC LIMIT 1`,
      [dn.company_id, si.id],
    )).rows[0];
    if (!wh) {
      wh = (await c.query(
        `SELECT id AS warehouse_id FROM warehouses WHERE company_id = $1 AND is_active = true ORDER BY is_default DESC NULLS LAST LIMIT 1`,
        [dn.company_id],
      )).rows[0];
    }
    if (!wh) throw new Error("No warehouse");

    // Use 2026-10-25 so it appears in current Stock Summary range (18-25 Oct)
    const moveDate = "2026-10-25";

    await c.query(
      `UPDATE warehouse_stock
       SET quantity = GREATEST(0, quantity::numeric - $1), updated_at = NOW()
       WHERE company_id = $2 AND warehouse_id = $3 AND stock_item_id = $4`,
      [qty, dn.company_id, wh.warehouse_id, si.id],
    );

    const bal = (await c.query(
      `SELECT coalesce(quantity::float, 0) AS q FROM warehouse_stock
       WHERE company_id = $1 AND warehouse_id = $2 AND stock_item_id = $3`,
      [dn.company_id, wh.warehouse_id, si.id],
    )).rows[0];

    await c.query(
      `INSERT INTO stock_movements (
         company_id, warehouse_id, stock_item_id, transaction_type,
         document_number, reference_type, reference_id,
         quantity_in, quantity_out, balance, reference, movement_date
       ) VALUES ($1,$2,$3,'purchase_return',$4,'debit_note',$5,'0',$6,$7,$8,$9::date)`,
      [
        dn.company_id, wh.warehouse_id, si.id, dn.dn_number, dn.id,
        String(qty), String(bal.q), `Debit Note ${dn.dn_number}`, moveDate,
      ],
    );

    const total = (await c.query(
      `SELECT coalesce(sum(quantity::numeric), 0)::float AS t
       FROM warehouse_stock WHERE company_id = $1 AND stock_item_id = $2`,
      [dn.company_id, si.id],
    )).rows[0];
    await c.query(`UPDATE stock_items SET stock_qty = $1, updated_at = NOW() WHERE id = $2`, [
      String(total.t), si.id,
    ]);

    console.log("Backfilled DN4", code, `out=${qty}`, "on", moveDate);
  }

  await c.query("COMMIT");
  await c.end();
})().catch((e) => { console.error(e); process.exit(1); });
