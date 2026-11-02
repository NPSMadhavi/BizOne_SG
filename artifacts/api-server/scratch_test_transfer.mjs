import pg from 'pg';
import fs from 'fs';

const env = fs.readFileSync('artifacts/api-server/.env', 'utf-8');
const match = env.match(/DATABASE_URL=["']?([^"'\r\n]+)/);
const conn = match[1].replace(/\/[^\/]+$/, '/bizone_spsynet');
const client = new pg.Client({ connectionString: conn });
await client.connect();

try {
  await client.query('BEGIN');

  // Check warehouses
  const wh = await client.query('SELECT id, name FROM warehouses WHERE company_id = 23 AND id IN (2, 3)');
  console.log('Warehouses found:', wh.rows);

  // Check balance
  const bal = await client.query('SELECT quantity FROM warehouse_stock WHERE warehouse_id = 2 AND stock_item_id = 4');
  console.log('Balance in WH 2 for Item 4:', bal.rows[0]);

  // Insert header
  const header = await client.query(`
    INSERT INTO stock_transfers (company_id, transfer_number, from_warehouse_id, to_warehouse_id, transfer_date, remarks, status)
    VALUES (23, 'ST-TEST-001', 2, 3, '2026-10-29', 'Test transfer', 'posted')
    RETURNING *
  `);
  console.log('Inserted header:', header.rows[0]);

  // Insert item
  const item = await client.query(`
    INSERT INTO stock_transfer_items (stock_transfer_id, stock_item_id, quantity)
    VALUES ($1, 4, 1)
    RETURNING *
  `, [header.rows[0].id]);
  console.log('Inserted item:', item.rows[0]);

  // Rollback so we don't pollute unless we want to
  await client.query('ROLLBACK');
  console.log('Transaction succeeded without error! (rolled back)');
} catch (e) {
  console.error('ERROR during transfer test:', e);
  await client.query('ROLLBACK');
}

await client.end();
