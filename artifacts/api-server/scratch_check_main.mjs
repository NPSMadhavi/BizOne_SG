import pg from 'pg';
import fs from 'fs';

const env = fs.readFileSync('artifacts/api-server/.env', 'utf-8');
const match = env.match(/DATABASE_URL=["']?([^"'\r\n]+)/);
const conn = match[1];
const client = new pg.Client({ connectionString: conn });
await client.connect();

const comps = await client.query('SELECT * FROM companies');
console.log('ALL COMPANIES:');
console.table(comps.rows);

const whs = await client.query('SELECT * FROM warehouses');
console.log('ALL WAREHOUSES in main:');
console.table(whs.rows);

await client.end();
