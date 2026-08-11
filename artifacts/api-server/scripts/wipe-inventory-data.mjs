/**
 * Ensure WMS stock_movements exists, then wipe inventory for a company.
 * Usage: node --env-file=src/.env scripts/wipe-inventory-data.mjs [companyId]
 */
import pg from "pg";

const companyId = Number(process.argv[2] || 4);
if (!Number.isFinite(companyId) || companyId <= 0) {
  console.error("Invalid companyId");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const CREATE_STOCK_MOVEMENTS = `
CREATE TABLE IF NOT EXISTS stock_movements (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
  stock_item_id INTEGER NOT NULL REFERENCES stock_items(id),
  transaction_type TEXT NOT NULL,
  document_number TEXT,
  reference_type TEXT,
  reference_id INTEGER,
  quantity_in DECIMAL(15,3) NOT NULL DEFAULT 0,
  quantity_out DECIMAL(15,3) NOT NULL DEFAULT 0,
  balance DECIMAL(15,3) NOT NULL,
  reference TEXT,
  user_id INTEGER,
  username TEXT,
  movement_date TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS stock_movements_company_idx ON stock_movements(company_id);
CREATE INDEX IF NOT EXISTS stock_movements_item_idx ON stock_movements(stock_item_id);
CREATE INDEX IF NOT EXISTS stock_movements_wh_idx ON stock_movements(warehouse_id);
CREATE INDEX IF NOT EXISTS stock_movements_date_idx ON stock_movements(movement_date);
`;

async function tableExists(client, name) {
  const r = await client.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`,
    [name],
  );
  return r.rowCount > 0;
}

async function safeDelete(client, sql, params = []) {
  try {
    const r = await client.query(sql, params);
    console.log(`OK (${r.rowCount}): ${sql.split("\n")[0].trim()}`);
  } catch (err) {
    if (String(err.message).includes("does not exist")) {
      console.log(`SKIP (missing): ${sql.split("\n")[0].trim()}`);
      return;
    }
    throw err;
  }
}

async function main() {
  const client = await pool.connect();
  try {
    if (!(await tableExists(client, "stock_movements"))) {
      console.log("Creating missing stock_movements table...");
      await client.query(CREATE_STOCK_MOVEMENTS);
      console.log("stock_movements created.");
    } else {
      console.log("stock_movements already exists.");
    }

    await client.query("BEGIN");

    await safeDelete(client, `
      DELETE FROM goods_receipt_items
      WHERE stock_item_id IN (SELECT id FROM stock_items WHERE company_id = $1)
         OR goods_receipt_id IN (SELECT id FROM goods_receipts WHERE company_id = $1)
    `, [companyId]);
    await safeDelete(client, `
      DELETE FROM goods_issue_items
      WHERE stock_item_id IN (SELECT id FROM stock_items WHERE company_id = $1)
         OR goods_issue_id IN (SELECT id FROM goods_issues WHERE company_id = $1)
    `, [companyId]);
    await safeDelete(client, `
      DELETE FROM stock_transfer_items
      WHERE stock_item_id IN (SELECT id FROM stock_items WHERE company_id = $1)
         OR stock_transfer_id IN (SELECT id FROM stock_transfers WHERE company_id = $1)
    `, [companyId]);

    await safeDelete(client, `DELETE FROM stock_adjustments WHERE company_id = $1`, [companyId]);
    await safeDelete(client, `DELETE FROM stock_movements WHERE company_id = $1`, [companyId]);
    await safeDelete(client, `DELETE FROM opening_stock WHERE company_id = $1`, [companyId]);
    await safeDelete(client, `DELETE FROM warehouse_stock WHERE company_id = $1`, [companyId]);
    await safeDelete(client, `
      DELETE FROM stock_serials
      WHERE company_id = $1
         OR stock_item_id IN (SELECT id FROM stock_items WHERE company_id = $1)
    `, [companyId]);
    await safeDelete(client, `DELETE FROM goods_receipts WHERE company_id = $1`, [companyId]);
    await safeDelete(client, `DELETE FROM goods_issues WHERE company_id = $1`, [companyId]);
    await safeDelete(client, `DELETE FROM stock_transfers WHERE company_id = $1`, [companyId]);
    await safeDelete(client, `DELETE FROM stock_items WHERE company_id = $1`, [companyId]);

    await client.query(`
      UPDATE settings SET
        igr_counter = COALESCE(igr_counter, 0) * 0,
        gin_counter = COALESCE(gin_counter, 0) * 0,
        st_counter = COALESCE(st_counter, 0) * 0,
        sa_counter = COALESCE(sa_counter, 0) * 0,
        si_counter = COALESCE(si_counter, 0) * 0
      WHERE company_id = $1
    `, [companyId]).catch(async () => {
      // some counter columns may not exist on older settings rows
      await client.query(`UPDATE settings SET st_counter = 0 WHERE company_id = $1`, [companyId]).catch(() => {});
    });

    await client.query("COMMIT");

    const counts = await client.query(`
      SELECT
        (SELECT count(*)::int FROM stock_items WHERE company_id = $1) AS stock_items,
        (SELECT count(*)::int FROM warehouse_stock WHERE company_id = $1) AS warehouse_stock,
        (SELECT count(*)::int FROM stock_movements WHERE company_id = $1) AS stock_movements,
        (SELECT count(*)::int FROM stock_transfers WHERE company_id = $1) AS stock_transfers,
        (SELECT count(*)::int FROM warehouses WHERE company_id = $1) AS warehouses
    `, [companyId]);

    console.log(`Wiped inventory data for company_id=${companyId}`);
    console.log(counts.rows[0]);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Wipe failed:", err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
