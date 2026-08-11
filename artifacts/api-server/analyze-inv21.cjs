const { Client } = require("pg");
async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const latestId = 21;
  const inv = (await c.query(`SELECT id, inv_number, items FROM invoices WHERE id=$1`, [latestId])).rows[0];
  const line = inv.items[0];
  const lineQty = Number(line.qty);
  const moves = await c.query(`
    SELECT id, transaction_type, reference_type, quantity_in, quantity_out, balance, reference
    FROM stock_movements
    WHERE reference_id = $1
      AND reference_type IN ('invoice', 'invoice_reversal', 'invoice_void')
      AND stock_item_id = $2 AND warehouse_id = $3
    ORDER BY id`, [latestId, line.stockItemId, line.warehouseId]);
  console.log("=== INVOICE-ONLY for #" + latestId + " ===");
  let sumIn=0,sumOut=0;
  for (const m of moves.rows) {
    sumIn += Number(m.quantity_in); sumOut += Number(m.quantity_out);
    console.log(`id=${m.id} ${m.transaction_type}/${m.reference_type} in=${m.quantity_in} out=${m.quantity_out} bal=${m.balance} | ${m.reference}`);
  }
  console.log(`lineQty=${lineQty} sumIn=${sumIn} sumOut=${sumOut} net=${sumIn-sumOut} expected=${-lineQty}`);
  for (let i=0;i<moves.rows.length;i++) {
    const m=moves.rows[i];
    if (m.reference_type!=="invoice_reversal") continue;
    const prevI=moves.rows.slice(0,i).filter(x=>x.reference_type==="invoice");
    const prevR=moves.rows.slice(0,i).filter(x=>x.reference_type==="invoice_reversal"||x.reference_type==="invoice_void");
    const outstanding=prevI.reduce((s,x)=>s+Number(x.quantity_out),0)-prevR.reduce((s,x)=>s+Number(x.quantity_in),0);
    const thisRev=Number(m.quantity_in);
    console.log(`REV id=${m.id} in=${thisRev} outstanding_before=${outstanding} delta=${thisRev-outstanding} | ${m.reference}`);
  }
  const lastRev=[...moves.rows].map((m,i)=>({m,i})).filter(x=>x.m.reference_type==="invoice_reversal").pop();
  if (lastRev) {
    const after=moves.rows.slice(lastRev.i);
    const revIn=Number(lastRev.m.quantity_in);
    const outAfter=after.filter(x=>x.reference_type==="invoice").reduce((s,x)=>s+Number(x.quantity_out),0);
    console.log(`LAST SAVE: revIn=${revIn} goods_issue_after=${outAfter} net_window=${revIn-outAfter}`);
    console.log(revIn>outAfter ? "ADD without full matching goods_issue" : "issue >= reversal in last window");
  }
  const ws=await c.query(`SELECT quantity FROM warehouse_stock WHERE stock_item_id=$1 AND warehouse_id=$2`,[line.stockItemId,line.warehouseId]);
  console.log("warehouse qty", ws.rows[0]?.quantity);
  await c.end();
}
main().catch(e=>{console.error(e);process.exit(1)});
