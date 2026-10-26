const { Client } = require("pg");
(async () => {
  const c = new Client({
    connectionString: "postgresql://postgres:Madhu2002@localhost:5432/bizone_spsynet",
  });
  await c.connect();

  const vi = await c.query(`
    SELECT id, pi_number, status, pi_date, created_at::date AS created,
           items, po_ids, po_numbers
    FROM vendor_invoices
    WHERE pi_number ILIKE '%INV-005%' OR pi_number ILIKE '%005%'
    ORDER BY id DESC LIMIT 5
  `);
  console.log("=== Vendor invoices ===");
  for (const r of vi.rows) {
    console.log(JSON.stringify({
      id: r.id, pi: r.pi_number, status: r.status, pi_date: r.pi_date, created: r.created,
      po_ids: r.po_ids, po_numbers: r.po_numbers,
      items: r.items,
    }, null, 2));
  }

  const moves = await c.query(`
    SELECT m.id, si.code, m.transaction_type, m.reference_type, m.reference_id,
           m.quantity_in::float AS qi, m.quantity_out::float AS qo,
           m.document_number, m.movement_date::date AS d
    FROM stock_movements m
    JOIN stock_items si ON si.id = m.stock_item_id
    WHERE si.code IN ('STK4','STK1')
       OR m.document_number ILIKE '%INV-005%'
       OR m.document_number ILIKE '%DN%'
    ORDER BY m.movement_date, m.id
  `);
  console.log("\n=== Movements STK1/STK4 / INV-005 / DN ===");
  for (const m of moves.rows) {
    console.log([m.code, m.transaction_type, m.reference_type, `in=${m.qi}`, `out=${m.qo}`, m.document_number, m.d].join(" | "));
  }

  const dn = await c.query(`
    SELECT id, dn_number, status, issue_date, items, created_at::date AS created
    FROM debit_notes ORDER BY id DESC LIMIT 10
  `);
  console.log("\n=== Debit notes ===");
  for (const d of dn.rows) {
    console.log(d.dn_number, d.status, d.issue_date, d.created, JSON.stringify(d.items).slice(0, 300));
  }

  // Simulate period 2026-10-18 .. 2026-10-25 for STK1 and STK4
  const sim = await c.query(`
    SELECT si.code,
      m.transaction_type, m.reference_type,
      m.quantity_in::float AS qi, m.quantity_out::float AS qo,
      CASE WHEN m.movement_date::date < '2026-10-18' THEN 'OPENING'
           WHEN m.movement_date::date <= '2026-10-25' THEN 'PERIOD'
           ELSE 'AFTER' END AS bucket
    FROM stock_movements m
    JOIN stock_items si ON si.id = m.stock_item_id
    WHERE si.code IN ('STK1','STK4')
    ORDER BY si.code, m.movement_date
  `);
  console.log("\n=== Date buckets 18-25 Oct ===");
  for (const m of sim.rows) {
    console.log([m.code, m.bucket, m.transaction_type, m.reference_type, m.qi, m.qo].join(" | "));
  }

  await c.end();
})().catch((e) => { console.error(e); process.exit(1); });
