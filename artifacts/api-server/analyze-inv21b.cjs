const { Client } = require("pg");
async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  // Reconstruct shelf effect of each INV22 invoice movement from bal deltas
  const moves = await c.query(`
    SELECT id, transaction_type, reference_type, quantity_in, quantity_out, balance, reference, created_at
    FROM stock_movements
    WHERE reference_id=21 AND stock_item_id=21 AND warehouse_id=3
      AND reference_type IN ('invoice','invoice_reversal','invoice_void')
    ORDER BY id`);

  console.log("=== Per-movement shelf delta (from qty in/out) ===");
  let net=0;
  for (const m of moves.rows) {
    const delta = Number(m.quantity_in) - Number(m.quantity_out);
    net += -delta; // net deducted
    const shelfDelta = delta; // positive = ADD to shelf
    console.log(`id=${m.id} shelfDelta=${shelfDelta>=0?"+"+shelfDelta:shelfDelta} runningNetDeducted=${net} bal=${m.balance} ${m.reference_type} | ${m.reference}`);
  }

  // Baseline before INV22: bal after id 223 was 40; after INV21 corrections
  console.log("\nIf clean single issue of lineQty=10 from pre-INV22 bal~40: expected warehouse=30");
  console.log("Actual warehouse=30 — happens to match NOW, but path was noisy");
  console.log("Last save (230+231): shelf +15 then -10 = +5 ADD on that save");

  // Latest 5 summary table
  const invs = await c.query(`SELECT id, inv_number, items FROM invoices ORDER BY id DESC LIMIT 5`);
  console.log("\n=== SUMMARY latest 5 ===");
  for (const inv of invs.rows) {
    for (const it of inv.items||[]) {
      if (!it.isStockItem && !it.stockItemId) continue;
      const m = await c.query(`
        SELECT COALESCE(SUM(quantity_in),0)::float as sin, COALESCE(SUM(quantity_out),0)::float as sout
        FROM stock_movements
        WHERE reference_id=$1 AND stock_item_id=$2
          AND reference_type IN ('invoice','invoice_reversal','invoice_void')`, [inv.id, it.stockItemId]);
      const sin=m.rows[0].sin, sout=m.rows[0].sout;
      const ws=await c.query(`SELECT quantity FROM warehouse_stock WHERE stock_item_id=$1 AND warehouse_id=$2`,[it.stockItemId, it.warehouseId]);
      console.log(`INV ${inv.inv_number}(#${inv.id}) item=${it.stockItemId} wh=${it.warehouseId} lineQty=${it.qty} movIn=${sin} movOut=${sout} netDeducted=${sout-sin} whQty=${ws.rows[0]?.quantity}`);
    }
  }
  await c.end();
}
main().catch(e=>{console.error(e);process.exit(1)});
