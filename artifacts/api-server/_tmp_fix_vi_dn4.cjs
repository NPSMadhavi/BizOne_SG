const { Client } = require("pg");
(async () => {
  const c = new Client({
    connectionString: "postgresql://postgres:Madhu2002@localhost:5432/bizone_spsynet",
  });
  await c.connect();

  const viMoves = await c.query(`
    SELECT id, transaction_type, reference_type, reference_id, quantity_in, document_number
    FROM stock_movements WHERE reference_id = 6 AND reference_type LIKE 'vendor_invoice%'
  `);
  console.log("INV-005 (id 6) movements:", viMoves.rows);

  const dn4 = await c.query(`SELECT id, company_id, dn_number, items, issue_date FROM debit_notes WHERE dn_number = 'DN4'`);
  console.log("DN4:", dn4.rows[0]);

  await c.end();
})().catch((e) => { console.error(e); process.exit(1); });
