import pg from 'pg';
import fs from 'fs';

const env = fs.readFileSync('artifacts/api-server/.env', 'utf-8');
const match = env.match(/DATABASE_URL=["']?([^"'\r\n]+)/);
const client = new pg.Client({ connectionString: match[1].replace(/\/[^\/]+$/, '/bizone_spsynet') });
await client.connect();

const res = await client.query(`
  SELECT id, warehouse_id, stock_item_id, transaction_type, document_number, reference_type, quantity_in, quantity_out, movement_date
  FROM stock_movements
  ORDER BY id DESC
  LIMIT 20;
`);
console.log('recent stock movements:', res.rows);
await client.end();
