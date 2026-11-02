import pg from 'pg';
import fs from 'fs';

const env = fs.readFileSync('artifacts/api-server/.env', 'utf-8');
const match = env.match(/DATABASE_URL=["']?([^"'\r\n]+)/);
const conn = match[1].replace(/\/[^\/]+$/, '/bizone_spsynet');
const client = new pg.Client({ connectionString: conn });
await client.connect();

const res = await client.query(`
  SELECT st_prefix, st_counter, st_suffix FROM settings WHERE company_id = 23
`);
console.log('ST settings:', res.rows[0]);

const docs = await client.query(`
  SELECT transfer_number FROM stock_transfers WHERE company_id = 23
`);
console.log('Existing transfer numbers:', docs.rows);

await client.end();
