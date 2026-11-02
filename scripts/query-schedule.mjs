import pg from 'pg';
const { Client } = pg;
const c = new Client({ connectionString: 'postgresql://postgres:Madhu2002@localhost:5432/BizoneDB' });
await c.connect();
const res = await c.query('SELECT * FROM backup_schedules WHERE company_id = 23');
console.log(JSON.stringify(res.rows[0], null, 2));
await c.end();
