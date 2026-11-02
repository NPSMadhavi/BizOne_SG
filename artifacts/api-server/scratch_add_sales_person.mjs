import pg from 'pg';
import fs from 'fs';

const env = fs.readFileSync('artifacts/api-server/.env', 'utf-8');
const match = env.match(/DATABASE_URL=["']?([^"'\r\n]+)/);
const conn = match[1];

for (const dbName of ['BizoneDB', 'bizone_spsynet', 'bizone_msmsolutions']) {
  const cConn = conn.replace(/\/[^\/]+$/, `/${dbName}`);
  const client = new pg.Client({ connectionString: cConn });
  try {
    await client.connect();
    await client.query(`
      ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS sales_person text;
    `);
    console.log(`Added sales_person to stock_transfers in ${dbName}`);
    await client.end();
  } catch (e) {
    console.log(`DB ${dbName}:`, e.message);
  }
}
