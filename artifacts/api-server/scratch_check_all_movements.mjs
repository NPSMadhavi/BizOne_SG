import pg from 'pg';
import fs from 'fs';

const env = fs.readFileSync('artifacts/api-server/.env', 'utf-8');
const match = env.match(/DATABASE_URL=["']?([^"'\r\n]+)/);
const conn = match[1].replace(/\/[^\/]+$/, '/bizone_spsynet');
const client = new pg.Client({ connectionString: conn });
await client.connect();

const sm = await client.query(`
  SELECT id, movement_date, transaction_type, document_number, reference_type, reference_id, 
         warehouse_id, stock_item_id, quantity_in, quantity_out, balance, reference 
  FROM stock_movements 
  ORDER BY id DESC
`);
console.log('ALL STOCK MOVEMENTS in bizone_spsynet:');
console.table(sm.rows);

await client.end();
