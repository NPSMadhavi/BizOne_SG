import pg from 'pg';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf-8');
const match = env.match(/DATABASE_URL=["']?([^"'\r\n]+)/);
const conn = match[1].replace(/\/[^\/]+$/, '/bizone_spsynet');
const client = new pg.Client({ connectionString: conn });
await client.connect();

const movements = await client.query(`
  SELECT sm.stock_item_id, si.code, sm.warehouse_id, w.name as wh_name,
         SUM(sm.quantity_in::numeric) as total_in,
         SUM(sm.quantity_out::numeric) as total_out,
         SUM((sm.quantity_in::numeric) - (sm.quantity_out::numeric)) as net
  FROM stock_movements sm
  LEFT JOIN warehouses w ON w.id = sm.warehouse_id
  LEFT JOIN stock_items si ON si.id = sm.stock_item_id
  GROUP BY sm.stock_item_id, si.code, sm.warehouse_id, w.name
  ORDER BY si.code, sm.warehouse_id
`);
console.log('MOVEMENTS GROUPED BY ITEM & WAREHOUSE:');
console.table(movements.rows);

const totalMovements = await client.query(`
  SELECT sm.stock_item_id, si.code,
         SUM(sm.quantity_in::numeric) as total_in,
         SUM(sm.quantity_out::numeric) as total_out,
         SUM((sm.quantity_in::numeric) - (sm.quantity_out::numeric)) as net
  FROM stock_movements sm
  LEFT JOIN stock_items si ON si.id = sm.stock_item_id
  GROUP BY sm.stock_item_id, si.code
  ORDER BY si.code
`);
console.log('TOTAL MOVEMENTS (ALL WAREHOUSES):');
console.table(totalMovements.rows);

await client.end();
