import pg from 'pg';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf-8');
const match = env.match(/DATABASE_URL=["']?([^"'\r\n]+)/);
const conn = match[1].replace(/\/[^\/]+$/, '/bizone_spsynet');
const client = new pg.Client({ connectionString: conn });
await client.connect();

const whs = await client.query('SELECT id, name, is_default, is_active FROM warehouses ORDER BY id');
console.log('WAREHOUSES:');
console.table(whs.rows);

const ws = await client.query(`
  SELECT ws.id, ws.warehouse_id, w.name as wh_name, ws.stock_item_id, si.code, si.name, ws.quantity 
  FROM warehouse_stock ws 
  JOIN warehouses w ON w.id = ws.warehouse_id 
  JOIN stock_items si ON si.id = ws.stock_item_id 
  ORDER BY si.code, ws.warehouse_id
`);
console.log('WAREHOUSE_STOCK:');
console.table(ws.rows);

await client.end();
