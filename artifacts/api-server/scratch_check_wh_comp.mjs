import pg from 'pg';
import fs from 'fs';

const env = fs.readFileSync('artifacts/api-server/.env', 'utf-8');
const match = env.match(/DATABASE_URL=["']?([^"'\r\n]+)/);
const conn = match[1].replace(/\/[^\/]+$/, '/bizone_spsynet');
const client = new pg.Client({ connectionString: conn });
await client.connect();

const wh = await client.query('SELECT * FROM warehouses');
console.log('WAREHOUSES:');
console.table(wh.rows);

const comps = await client.query('SELECT * FROM companies');
console.log('COMPANIES in bizone_spsynet:');
console.table(comps.rows);

const si = await client.query('SELECT id, code, name, company_id FROM stock_items LIMIT 5');
console.log('STOCK_ITEMS:');
console.table(si.rows);

await client.end();
