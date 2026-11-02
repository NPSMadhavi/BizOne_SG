import pg from 'pg';
const client = new pg.Client({ connectionString: 'postgresql://postgres:Madhu2002@localhost:5432/bizone_spsynet' });
await client.connect();

const sm = await client.query(`
  SELECT sm.id, sm.stock_item_id, si.code, sm.warehouse_id, w.name as wh_name,
         sm.transaction_type, sm.quantity_in, sm.quantity_out, sm.movement_date, sm.reference
  FROM stock_movements sm
  JOIN stock_items si ON si.id = sm.stock_item_id
  JOIN warehouses w ON w.id = sm.warehouse_id
  ORDER BY sm.stock_item_id, sm.id
`);
console.table(sm.rows);

await client.end();
