const { Client } = require("pg");
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const inv = await c.query(`SELECT id, inv_number, status, items, created_at FROM invoices WHERE id=22`);
  console.log(JSON.stringify(inv.rows[0], null, 2));

  // net effect for INV23
  const net = await c.query(`
    SELECT warehouse_id, stock_item_id,
           SUM(quantity_out::numeric) - SUM(quantity_in::numeric) AS net_out
    FROM stock_movements
    WHERE company_id=4 AND reference_id=22
      AND reference_type IN ('invoice','invoice_reversal','invoice_void')
    GROUP BY warehouse_id, stock_item_id
  `);
  console.log("\nNet for INV22/id22:", JSON.stringify(net.rows, null, 2));

  // balances reconstruction
  console.log("\nExpected after transfer only: Main 60 WH1 40");
  console.log("After wrong first issue 20 Main: Main 40 WH1 40");
  console.log("After edit reverse+issue: Main 60 WH1 30");
  console.log("Correct final if only WH1-10: Main 60 WH1 30  <-- matches current");
  console.log("stock_items.stock_qty still 90 (legacy field not updated by invoice?)");

  await c.end();
})().catch(e=>{console.error(e);process.exit(1);});
