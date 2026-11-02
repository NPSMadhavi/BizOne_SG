import pg from 'pg';
import fs from 'fs';

const env = fs.readFileSync('artifacts/api-server/.env', 'utf-8');
const match = env.match(/DATABASE_URL=["']?([^"'\r\n]+)/);
const conn = match[1].replace(/\/[^\/]+$/, '/bizone_spsynet');
const client = new pg.Client({ connectionString: conn });
await client.connect();

const cols = await client.query(`
  SELECT column_name 
  FROM information_schema.columns 
  WHERE table_name = 'settings' AND column_name LIKE 'st_%'
`);
console.log('SETTINGS st columns:', cols.rows);

const settings = await client.query('SELECT * FROM settings WHERE company_id = 23 LIMIT 1');
console.log('SETTINGS keys:', Object.keys(settings.rows[0] || {}));

await client.end();
