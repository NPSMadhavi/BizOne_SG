import pg from 'pg';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf-8');
const match = env.match(/DATABASE_URL=["']?([^"'\r\n]+)/);
const conn = match[1];
const client = new pg.Client({ connectionString: conn });
await client.connect();

const comps = await client.query(`SELECT id, name, database_name FROM companies`);
console.log('COMPANIES in main BizoneDB:');
console.table(comps.rows);

await client.end();

