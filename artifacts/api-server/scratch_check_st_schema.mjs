import pg from 'pg';
import fs from 'fs';

const env = fs.readFileSync('artifacts/api-server/.env', 'utf-8');
const match = env.match(/DATABASE_URL=["']?([^"'\r\n]+)/);
const conn = match[1].replace(/\/[^\/]+$/, '/bizone_spsynet');
const client = new pg.Client({ connectionString: conn });
await client.connect();

// Check if stock_transfers table has all required columns and constraints
const stCols = await client.query(`
  SELECT column_name, data_type, is_nullable 
  FROM information_schema.columns 
  WHERE table_name = 'stock_transfers'
`);
console.log('stock_transfers cols:');
console.table(stCols.rows);

const stiCols = await client.query(`
  SELECT column_name, data_type, is_nullable 
  FROM information_schema.columns 
  WHERE table_name = 'stock_transfer_items'
`);
console.log('stock_transfer_items cols:');
console.table(stiCols.rows);

await client.end();
