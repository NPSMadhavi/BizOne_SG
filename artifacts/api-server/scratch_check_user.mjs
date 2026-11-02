import pg from 'pg';
import fs from 'fs';

const env = fs.readFileSync('artifacts/api-server/.env', 'utf-8');
const match = env.match(/DATABASE_URL=["']?([^"'\r\n]+)/);
const conn = match[1];
const client = new pg.Client({ connectionString: conn });
await client.connect();

const u = await client.query("SELECT id, email, password FROM users WHERE email = 'spsynet@gmail.com'");
console.log('User:', u.rows[0]);

await client.end();
