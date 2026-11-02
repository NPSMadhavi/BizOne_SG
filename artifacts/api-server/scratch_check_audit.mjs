import pg from 'pg';
import fs from 'fs';

const env = fs.readFileSync('artifacts/api-server/.env', 'utf-8');
const match = env.match(/DATABASE_URL=["']?([^"'\r\n]+)/);
const conn = match[1].replace(/\/[^\/]+$/, '/bizone_spsynet');
const client = new pg.Client({ connectionString: conn });
await client.connect();

try {
  const audit = await client.query('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 20');
  console.log('AUDIT LOGS:');
  console.table(audit.rows);
} catch (e) {
  console.log('Error audit_logs:', e.message);
}

await client.end();
