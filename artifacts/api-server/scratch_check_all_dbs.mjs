import pg from 'pg';
import fs from 'fs';

const env = fs.readFileSync('artifacts/api-server/.env', 'utf-8');
const match = env.match(/DATABASE_URL=["']?([^"'\r\n]+)/);
const conn = match[1];
const client = new pg.Client({ connectionString: conn });
await client.connect();

const dbs = await client.query(`SELECT datname FROM pg_database WHERE datistemplate = false;`);
console.log('DATABASES:', dbs.rows.map(r => r.datname));

try {
  const comps = await client.query(`SELECT * FROM companies;`);
  console.log('COMPANIES in main DB:');
  console.table(comps.rows.map(c => ({ id: c.id, name: c.name, tenant_db_name: c.tenant_db_name, db_name: c.db_name })));

  for (const c of comps.rows) {
    const dbName = c.tenant_db_name || c.db_name;
    if (!dbName) continue;
    try {
      const cConn = conn.replace(/\/[^\/]+$/, `/${dbName}`);
      const cClient = new pg.Client({ connectionString: cConn });
      await cClient.connect();
      const st = await cClient.query(`SELECT * FROM stock_transfers;`);
      console.log(`stock_transfers in ${dbName}:`, st.rows.length);
      if (st.rows.length > 0) console.table(st.rows);

      const sm = await cClient.query(`SELECT * FROM stock_movements WHERE transaction_type ILIKE '%transfer%';`);
      console.log(`transfer movements in ${dbName}:`, sm.rows.length);
      if (sm.rows.length > 0) console.table(sm.rows);

      const wh = await cClient.query(`SELECT * FROM warehouses;`);
      console.log(`warehouses in ${dbName}:`, wh.rows.map(w => ({ id: w.id, name: w.name, code: w.code })));

      await cClient.end();
    } catch (e) {
      console.log(`Could not check db ${dbName}:`, e.message);
    }
  }
} catch (e) {
  console.log('Error:', e.message);
}

await client.end();
