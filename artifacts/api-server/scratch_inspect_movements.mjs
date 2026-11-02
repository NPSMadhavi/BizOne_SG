import pg from 'pg';
const client = new pg.Client({ connectionString: 'postgresql://postgres:Madhu2002@localhost:5432/bizone_spsynet' });
await client.connect();

const movements = await client.query(`
  SELECT sm.id, sm.movement_date, sm.transaction_type, sm.document_number, 
         sm.warehouse_id, w.name as wh_name, sm.stock_item_id, si.code as item_code,
         sm.quantity_in, sm.quantity_out, sm.balance, sm.reference
  FROM stock_movements sm
  LEFT JOIN warehouses w ON w.id = sm.warehouse_id
  LEFT JOIN stock_items si ON si.id = sm.stock_item_id
  ORDER BY sm.id ASC
`);
console.log('ALL MOVEMENTS:');
console.table(movements.rows);

const whStock = await client.query(`
  SELECT ws.id, ws.warehouse_id, w.name as wh_name, ws.stock_item_id, si.code as item_code, ws.quantity
  FROM warehouse_stock ws
  LEFT JOIN warehouses w ON w.id = ws.warehouse_id
  LEFT JOIN stock_items si ON si.id = ws.stock_item_id
  ORDER BY si.code, ws.warehouse_id
`);
console.log('WAREHOUSE STOCK:');
console.table(whStock.rows);

const transfers = await client.query(`
  SELECT st.id, st.transfer_number, st.from_warehouse_id, w1.name as from_wh,
         st.to_warehouse_id, w2.name as to_wh, st.status, st.items
  FROM stock_transfers st
  LEFT JOIN warehouses w1 ON w1.id = st.from_warehouse_id
  LEFT JOIN warehouses w2 ON w2.id = st.to_warehouse_id
`);
console.log('STOCK TRANSFERS:');
console.table(transfers.rows);

await client.end();
