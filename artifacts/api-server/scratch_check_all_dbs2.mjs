import pg from 'pg';
import fs from 'fs';

const env = fs.readFileSync('artifacts/api-server/.env', 'utf-8');
const match = env.match(/DATABASE_URL=["']?([^"'\r\n]+)/);
const conn = match[1];

for (const dbName of ['BizoneDB', 'bizone_spsynet', 'bizone_msmsolutions']) {
  console.log(`\n=== CHECKING DB: ${dbName} ===`);
  const cConn = conn.replace(/\/[^\/]+$/, `/${dbName}`);
  const client = new pg.Client({ connectionString: cConn });
  try {
    await client.connect();
    const st = await client.query('SELECT * FROM stock_transfers ORDER BY id DESC LIMIT 5');
    console.log('stock_transfers:', st.rows);
    const sm = await client.query("SELECT * FROM stock_movements WHERE transaction_type ILIKE '%transfer%' ORDER BY id DESC LIMIT 5");
    console.log('stock_movements (transfer):', sm.rows);
    const wh = await client.query('SELECT id, name, code FROM warehouses');
    console.log('warehouses:', wh.rows);
    await client.end();
  } catch (e) {
    console.log(`Error in ${dbName}:`, e.message);
  }
}
