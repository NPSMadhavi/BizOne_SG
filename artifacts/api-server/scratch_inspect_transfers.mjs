import pg from 'pg';
import fs from 'fs';

const env = fs.readFileSync('artifacts/api-server/.env', 'utf-8');
const match = env.match(/DATABASE_URL=["']?([^"'\r\n]+)/);
const conn = match[1].replace(/\/[^\/]+$/, '/bizone_spsynet');
const client = new pg.Client({ connectionString: conn });
await client.connect();

console.log('Connected to:', conn);

const st = await client.query('SELECT * FROM stock_transfers ORDER BY id DESC LIMIT 10');
console.log('STOCK_TRANSFERS:');
console.table(st.rows);

const sti = await client.query('SELECT * FROM stock_transfer_items ORDER BY id DESC LIMIT 10');
console.log('STOCK_TRANSFER_ITEMS:');
console.table(sti.rows);

const sm = await client.query("SELECT id, movement_date, transaction_type, document_number, warehouse_id, stock_item_id, quantity_in, quantity_out, balance FROM stock_movements WHERE transaction_type ILIKE '%transfer%' ORDER BY id DESC LIMIT 10");
console.log('STOCK_MOVEMENTS (transfer):');
console.table(sm.rows);

const ws = await client.query(`
  SELECT ws.id, ws.warehouse_id, w.name as wh_name, ws.stock_item_id, si.code, si.name, ws.quantity 
  FROM warehouse_stock ws 
  JOIN warehouses w ON w.id = ws.warehouse_id 
  JOIN stock_items si ON si.id = ws.stock_item_id 
  ORDER BY ws.id DESC LIMIT 15
`);
console.log('WAREHOUSE_STOCK:');
console.table(ws.rows);

const whs = await client.query('SELECT id, name, code, is_default, is_active FROM warehouses ORDER BY id');
console.log('WAREHOUSES:');
console.table(whs.rows);

await client.end();
