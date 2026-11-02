import pg from 'pg';
import fs from 'fs';
const envText = fs.readFileSync('artifacts/api-server/.env', 'utf8');
const dbLine = envText.split(/\r?\n/).find(l => l.startsWith('DATABASE_URL='));
let dbUrl = dbLine.replace('DATABASE_URL=', '').trim();
if (dbUrl.startsWith('"')) dbUrl = dbUrl.slice(1, -1);
const tenantUrl = dbUrl.replace('/BizoneDB', '/bizone_spsynet');
const client = new pg.Client({ connectionString: tenantUrl });
await client.connect();

const whs = await client.query('SELECT id, name, code, is_default, company_id FROM warehouses');
console.log('warehouses:');
console.table(whs.rows);

const res = await client.query(`
  SELECT ws.id, ws.warehouse_id, w.name as wh_name, ws.stock_item_id, si.code, si.name, ws.quantity 
  FROM warehouse_stock ws 
  LEFT JOIN warehouses w ON w.id = ws.warehouse_id 
  LEFT JOIN stock_items si ON si.id = ws.stock_item_id 
  ORDER BY w.id, si.code
`);
console.log('warehouse_stock rows:');
console.table(res.rows);

const items = await client.query('SELECT id, code, name, stock_qty, warehouse_id FROM stock_items');
console.log('stock_items:');
console.table(items.rows);

const movements = await client.query('SELECT id, stock_item_id, warehouse_id, transaction_type, quantity_in, quantity_out FROM stock_movements ORDER BY id DESC LIMIT 20');
console.log('recent movements:');
console.table(movements.rows);

await client.end();
