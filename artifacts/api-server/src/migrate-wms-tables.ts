import { pool } from "@workspace/db";
import { logger } from "./lib/logger";

const WMS_MIGRATIONS = [
  `ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS min_stock_level DECIMAL(15,3) DEFAULT 0`,
  `ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS reorder_level DECIMAL(15,3) DEFAULT 0`,
  `ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS max_stock_level DECIMAL(15,3) DEFAULT 0`,
  `ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS mrp_price DECIMAL(15,2) DEFAULT 0`,
  `ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS batch_no TEXT`,
  `ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS alternate_uom TEXT`,
  `ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS alternate_qty DECIMAL(15,4) DEFAULT 0`,
  `ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS main_qty DECIMAL(15,4) DEFAULT 0`,
  `ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS created_by INTEGER`,
  `ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS updated_by INTEGER`,
  `ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`,

  `ALTER TABLE settings ADD COLUMN IF NOT EXISTS igr_prefix TEXT DEFAULT 'IGR'`,
  `ALTER TABLE settings ADD COLUMN IF NOT EXISTS igr_counter INTEGER DEFAULT 0`,
  `ALTER TABLE settings ADD COLUMN IF NOT EXISTS igr_suffix TEXT DEFAULT ''`,
  `ALTER TABLE settings ADD COLUMN IF NOT EXISTS gin_prefix TEXT DEFAULT 'GIN'`,
  `ALTER TABLE settings ADD COLUMN IF NOT EXISTS gin_counter INTEGER DEFAULT 0`,
  `ALTER TABLE settings ADD COLUMN IF NOT EXISTS gin_suffix TEXT DEFAULT ''`,
  `ALTER TABLE settings ADD COLUMN IF NOT EXISTS st_prefix TEXT DEFAULT 'ST'`,
  `ALTER TABLE settings ADD COLUMN IF NOT EXISTS st_counter INTEGER DEFAULT 0`,
  `ALTER TABLE settings ADD COLUMN IF NOT EXISTS st_suffix TEXT DEFAULT ''`,
  `ALTER TABLE settings ADD COLUMN IF NOT EXISTS sa_prefix TEXT DEFAULT 'SA'`,
  `ALTER TABLE settings ADD COLUMN IF NOT EXISTS sa_counter INTEGER DEFAULT 0`,
  `ALTER TABLE settings ADD COLUMN IF NOT EXISTS sa_suffix TEXT DEFAULT ''`,

  `ALTER TABLE settings ADD COLUMN IF NOT EXISTS si_prefix TEXT DEFAULT 'STK'`,
  `ALTER TABLE settings ADD COLUMN IF NOT EXISTS si_counter INTEGER DEFAULT 0`,
  `ALTER TABLE settings ADD COLUMN IF NOT EXISTS si_suffix TEXT DEFAULT ''`,

  `ALTER TABLE settings ADD COLUMN IF NOT EXISTS cn_prefix TEXT DEFAULT 'CN'`,
  `ALTER TABLE settings ADD COLUMN IF NOT EXISTS cn_counter INTEGER DEFAULT 0`,
  `ALTER TABLE settings ADD COLUMN IF NOT EXISTS cn_suffix TEXT DEFAULT ''`,
  `ALTER TABLE settings ADD COLUMN IF NOT EXISTS pi_prefix TEXT DEFAULT 'PI'`,
  `ALTER TABLE settings ADD COLUMN IF NOT EXISTS pi_counter INTEGER DEFAULT 0`,
  `ALTER TABLE settings ADD COLUMN IF NOT EXISTS pi_suffix TEXT DEFAULT ''`,
  `ALTER TABLE settings ADD COLUMN IF NOT EXISTS pv_prefix TEXT DEFAULT 'PV'`,
  `ALTER TABLE settings ADD COLUMN IF NOT EXISTS pv_counter INTEGER DEFAULT 0`,
  `ALTER TABLE settings ADD COLUMN IF NOT EXISTS pv_suffix TEXT DEFAULT ''`,
  `ALTER TABLE settings ADD COLUMN IF NOT EXISTS grn_prefix TEXT DEFAULT 'GRN'`,
  `ALTER TABLE settings ADD COLUMN IF NOT EXISTS grn_counter INTEGER DEFAULT 0`,
  `ALTER TABLE settings ADD COLUMN IF NOT EXISTS grn_suffix TEXT DEFAULT ''`,

  `CREATE TABLE IF NOT EXISTS warehouses (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    address TEXT,
    city TEXT,
    country TEXT,
    contact_person TEXT,
    contact_number TEXT,
    email TEXT,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by INTEGER,
    updated_by INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(company_id, code)
  )`,

  `CREATE TABLE IF NOT EXISTS warehouse_stock (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
    stock_item_id INTEGER NOT NULL REFERENCES stock_items(id) ON DELETE CASCADE,
    quantity DECIMAL(15,3) NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(warehouse_id, stock_item_id)
  )`,

  `CREATE TABLE IF NOT EXISTS opening_stock (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
    stock_item_id INTEGER NOT NULL REFERENCES stock_items(id),
    quantity DECIMAL(15,3) NOT NULL,
    unit_cost DECIMAL(15,2) DEFAULT 0,
    entry_date DATE NOT NULL,
    remarks TEXT,
    created_by INTEGER,
    updated_by INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(warehouse_id, stock_item_id)
  )`,

  `CREATE TABLE IF NOT EXISTS goods_receipts (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    grn_number TEXT NOT NULL,
    warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
    supplier TEXT,
    reference_number TEXT,
    receipt_date DATE NOT NULL,
    remarks TEXT,
    status TEXT NOT NULL DEFAULT 'posted',
    created_by INTEGER,
    updated_by INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS goods_receipt_items (
    id SERIAL PRIMARY KEY,
    goods_receipt_id INTEGER NOT NULL REFERENCES goods_receipts(id) ON DELETE CASCADE,
    stock_item_id INTEGER NOT NULL REFERENCES stock_items(id),
    quantity DECIMAL(15,3) NOT NULL,
    unit_cost DECIMAL(15,2) DEFAULT 0
  )`,

  `CREATE TABLE IF NOT EXISTS goods_issues (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    gin_number TEXT NOT NULL,
    warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
    reason TEXT,
    issue_date DATE NOT NULL,
    remarks TEXT,
    status TEXT NOT NULL DEFAULT 'posted',
    created_by INTEGER,
    updated_by INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS goods_issue_items (
    id SERIAL PRIMARY KEY,
    goods_issue_id INTEGER NOT NULL REFERENCES goods_issues(id) ON DELETE CASCADE,
    stock_item_id INTEGER NOT NULL REFERENCES stock_items(id),
    quantity DECIMAL(15,3) NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS stock_transfers (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    transfer_number TEXT NOT NULL,
    from_warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
    to_warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
    transfer_date DATE NOT NULL,
    remarks TEXT,
    status TEXT NOT NULL DEFAULT 'posted',
    created_by INTEGER,
    updated_by INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS stock_transfer_items (
    id SERIAL PRIMARY KEY,
    stock_transfer_id INTEGER NOT NULL REFERENCES stock_transfers(id) ON DELETE CASCADE,
    stock_item_id INTEGER NOT NULL REFERENCES stock_items(id),
    quantity DECIMAL(15,3) NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS stock_adjustments (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    adjustment_number TEXT NOT NULL,
    warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
    stock_item_id INTEGER NOT NULL REFERENCES stock_items(id),
    adjustment_type TEXT NOT NULL,
    reason TEXT,
    current_quantity DECIMAL(15,3) NOT NULL,
    actual_quantity DECIMAL(15,3) NOT NULL,
    difference DECIMAL(15,3) NOT NULL,
    remarks TEXT,
    adjustment_date DATE NOT NULL,
    created_by INTEGER,
    updated_by INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS stock_movements (
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
  )`,

  `CREATE INDEX IF NOT EXISTS stock_movements_company_idx ON stock_movements(company_id)`,
  `CREATE INDEX IF NOT EXISTS stock_movements_item_idx ON stock_movements(stock_item_id)`,
  `CREATE INDEX IF NOT EXISTS stock_movements_wh_idx ON stock_movements(warehouse_id)`,
  `CREATE INDEX IF NOT EXISTS stock_movements_date_idx ON stock_movements(movement_date)`,

  `ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS state TEXT`,
  `ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS pin_code TEXT`,
  `ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS remarks TEXT`,

  `ALTER TABLE vendor_invoices ADD COLUMN IF NOT EXISTS items JSONB NOT NULL DEFAULT '[]'::jsonb`,
  `ALTER TABLE vendor_invoices ADD COLUMN IF NOT EXISTS subtotal DECIMAL(15,2) NOT NULL DEFAULT 0`,
  `ALTER TABLE vendor_invoices ADD COLUMN IF NOT EXISTS tax DECIMAL(15,2) NOT NULL DEFAULT 0`,
];

export async function migrateWmsTables(): Promise<void> {
  for (const sql of WMS_MIGRATIONS) {
    await pool.query(sql);
  }
  logger.info("WMS tables migration complete");
}
