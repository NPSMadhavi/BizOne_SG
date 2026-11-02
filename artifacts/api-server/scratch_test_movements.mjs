import pg from 'pg';
import fs from 'fs';

const env = fs.readFileSync('artifacts/api-server/.env', 'utf-8');
const match = env.match(/DATABASE_URL=["']?([^"'\r\n]+)/);
const conn = match[1].replace(/\/[^\/]+$/, '/bizone_spsynet');
const client = new pg.Client({ connectionString: conn });
await client.connect();

try {
  await client.query('BEGIN');

  // Let's test the updates that adjustWarehouseQuantity does:
  // 1. insert on conflict do nothing:
  await client.query(`
    INSERT INTO warehouse_stock (company_id, warehouse_id, stock_item_id, quantity)
    VALUES (23, 3, 4, 0)
    ON CONFLICT (warehouse_id, stock_item_id) DO NOTHING
  `);
  console.log('Insert into target WH OK');

  // 2. update source:
  const src = await client.query(`
    UPDATE warehouse_stock
    SET quantity = quantity - 1, updated_at = NOW()
    WHERE company_id = 23 AND warehouse_id = 2 AND stock_item_id = 4 AND (quantity - 1 >= 0)
    RETURNING quantity
  `);
  console.log('Source update:', src.rows[0]);

  // 3. update dest:
  const dest = await client.query(`
    UPDATE warehouse_stock
    SET quantity = quantity + 1, updated_at = NOW()
    WHERE company_id = 23 AND warehouse_id = 3 AND stock_item_id = 4
    RETURNING quantity
  `);
  console.log('Dest update:', dest.rows[0]);

  // 4. insert stock movement
  const sm1 = await client.query(`
    INSERT INTO stock_movements (company_id, warehouse_id, stock_item_id, transaction_type, document_number, reference_type, reference_id, quantity_out, balance, reference, movement_date)
    VALUES (23, 2, 4, 'transfer_out', 'ST-TEST', 'stock_transfer', 1, 1, $1, 'test', NOW())
    RETURNING *
  `, [src.rows[0].quantity]);
  console.log('Stock movement 1 OK');

  const sm2 = await client.query(`
    INSERT INTO stock_movements (company_id, warehouse_id, stock_item_id, transaction_type, document_number, reference_type, reference_id, quantity_in, balance, reference, movement_date)
    VALUES (23, 3, 4, 'transfer_in', 'ST-TEST', 'stock_transfer', 1, 1, $1, 'test', NOW())
    RETURNING *
  `, [dest.rows[0].quantity]);
  console.log('Stock movement 2 OK');

  await client.query('ROLLBACK');
  console.log('All movements simulated successfully!');
} catch (e) {
  console.error('ERROR:', e);
  await client.query('ROLLBACK');
}

await client.end();
