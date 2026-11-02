import pg from 'pg';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf-8');
const match = env.match(/DATABASE_URL=["']?([^"'\r\n]+)/);
const conn = match[1];

for (const dbName of ['BizoneDB', 'bizone_spsynet', 'bizone_msmsolutions']) {
  const cConn = conn.replace(/\/[^\/]+$/, `/${dbName}`);
  const client = new pg.Client({ connectionString: cConn });
  try {
    await client.connect();
    const res = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE '%backup%'");
    console.log(`Database ${dbName} backup tables:`, res.rows.map(r => r.table_name));
    await client.end();
  } catch (e) {
    console.log(`Failed ${dbName}:`, e.message);
  }
}
