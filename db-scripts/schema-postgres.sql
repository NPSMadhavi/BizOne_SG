-- ============================================================
-- RSV Infotech Document Management System
-- PostgreSQL Schema + Seed Script
-- Requires: PostgreSQL 13+
-- Generated: 2026-06-16
-- ============================================================

-- ============================================================
-- TABLE: companies
-- ============================================================
CREATE TABLE IF NOT EXISTS companies (
  id               SERIAL        PRIMARY KEY,
  name             TEXT          NOT NULL,
  country          TEXT          NOT NULL,           -- 'SG' | 'IN' | full name
  address          TEXT,
  registration_no  TEXT,
  email            TEXT,
  phone            TEXT,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE: users
-- role: 'admin' | 'user'
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id             SERIAL       PRIMARY KEY,
  username       TEXT         NOT NULL UNIQUE,
  password_hash  TEXT         NOT NULL,              -- bcrypt hash
  role           TEXT         NOT NULL DEFAULT 'user',
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE: user_companies  (many-to-many users ↔ companies)
-- modules: JSON array of permitted module keys:
--   "purchase_orders" | "quotations" | "invoices" | "delivery_orders"
-- Admin users bypass module checks and have access to all companies.
-- ============================================================
CREATE TABLE IF NOT EXISTS user_companies (
  id          SERIAL   PRIMARY KEY,
  user_id     INTEGER  NOT NULL REFERENCES users(id)     ON DELETE CASCADE,
  company_id  INTEGER  NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  modules     JSONB    NOT NULL DEFAULT '["purchase_orders","quotations","invoices","delivery_orders"]',
  UNIQUE (user_id, company_id)
);

-- ============================================================
-- TABLE: settings  (one row per company; company_id nullable for legacy global row)
-- Running number counters are incremented atomically at document creation time.
-- Singapore companies: 9% GST.  India companies: 18% GST.
-- ============================================================
CREATE TABLE IF NOT EXISTS settings (
  id                    SERIAL          PRIMARY KEY,
  company_id            INTEGER,
  gst_rate              DECIMAL(5,2)    NOT NULL DEFAULT 9,
  smtp_host             TEXT,
  smtp_port             TEXT,
  smtp_user             TEXT,
  smtp_pass             TEXT,                        -- stored encrypted or plain depending on deployment
  smtp_from             TEXT,
  po_prefix             TEXT            DEFAULT 'PO',
  po_counter            INTEGER         NOT NULL DEFAULT 1,
  po_suffix             TEXT            DEFAULT '',
  inv_prefix            TEXT            DEFAULT 'INV',
  inv_counter           INTEGER         NOT NULL DEFAULT 1,
  inv_suffix            TEXT            DEFAULT '',
  qt_prefix             TEXT            DEFAULT 'QT',
  qt_counter            INTEGER         NOT NULL DEFAULT 1,
  qt_suffix             TEXT            DEFAULT '',
  do_prefix             TEXT            DEFAULT 'DO',
  do_counter            INTEGER         NOT NULL DEFAULT 1,
  do_suffix             TEXT            DEFAULT '',
  grn_prefix            TEXT            DEFAULT 'GRN',
  grn_counter           INTEGER         NOT NULL DEFAULT 1,
  grn_suffix            TEXT            DEFAULT '',
  allow_negative_stock  BOOLEAN         NOT NULL DEFAULT FALSE,
  auto_deduct_on_do     BOOLEAN         NOT NULL DEFAULT FALSE,
  low_stock_warning     DECIMAL(15,3)   DEFAULT 0,
  default_uom           TEXT            DEFAULT 'pcs',
  bank_details          TEXT,
  terms_and_conditions  TEXT
);

-- ============================================================
-- TABLE: vendors
-- ============================================================
CREATE TABLE IF NOT EXISTS vendors (
  id              SERIAL       PRIMARY KEY,
  company_id      INTEGER      NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name            TEXT         NOT NULL,
  address         TEXT,
  postal_code     TEXT,
  country         TEXT,
  contact_person  TEXT,
  contact_email   TEXT,
  phone           TEXT,
  currency        TEXT,
  gst_registered  BOOLEAN      NOT NULL DEFAULT FALSE,
  gst_no          TEXT,
  is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE: customers
-- ============================================================
CREATE TABLE IF NOT EXISTS customers (
  id               SERIAL       PRIMARY KEY,
  company_id       INTEGER      NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name             TEXT         NOT NULL,
  address          TEXT,
  postal_code      TEXT,
  country          TEXT,
  contact_person   TEXT,
  contact_email    TEXT,
  phone            TEXT,
  currency         TEXT,
  gst_registered   BOOLEAN      NOT NULL DEFAULT FALSE,
  gst_no           TEXT,
  ship_to_address  TEXT,
  is_active        BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE: stock_items  (product/service catalogue per company)
-- type: 'product' | 'service'
-- ============================================================
CREATE TABLE IF NOT EXISTS stock_items (
  id           SERIAL         PRIMARY KEY,
  company_id   INTEGER        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  code         TEXT           NOT NULL,
  name         TEXT           NOT NULL,
  description  TEXT,
  uom          TEXT           NOT NULL DEFAULT 'pcs',
  type         TEXT           NOT NULL DEFAULT 'product',
  unit_price   DECIMAL(15,2)  DEFAULT 0,
  stock_qty    DECIMAL(15,3)  DEFAULT 0,
  is_active    BOOLEAN        NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE: stock_serials  (serial number tracking per stock item)
-- status: 'available' | 'reserved' | 'sold'
-- ============================================================
CREATE TABLE IF NOT EXISTS stock_serials (
  id                SERIAL       PRIMARY KEY,
  company_id        INTEGER      NOT NULL REFERENCES companies(id)   ON DELETE CASCADE,
  stock_item_id     INTEGER      NOT NULL REFERENCES stock_items(id) ON DELETE CASCADE,
  serial_number     TEXT         NOT NULL,
  status            TEXT         NOT NULL DEFAULT 'available',
  grn_id            INTEGER,
  grn_number        TEXT,
  invoice_id        INTEGER,
  invoice_number    TEXT,
  reserved_by_user  TEXT,
  do_id             INTEGER,
  do_number         TEXT,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE: purchase_orders
-- items JSONB — array of line item objects:
--   {
--     type:         "item" | "section",
--     description:  string,
--     partNumber:   string,
--     uom:          string,
--     qty:          number,
--     unitPrice:    number,
--     tax:          number,    -- percentage
--     discount:     number,    -- percentage
--     sectionLabel: string,    -- used when type="section"
--     sectionAlign: "left" | "center",
--     itemImage:    string     -- base64 data-URL or ""
--   }
-- status: 'draft' | 'confirmed' | 'cancelled'
-- ============================================================
CREATE TABLE IF NOT EXISTS purchase_orders (
  id                    SERIAL         PRIMARY KEY,
  po_number             TEXT           NOT NULL UNIQUE,
  company_id            INTEGER        NOT NULL DEFAULT 1,
  vendor_name           TEXT           NOT NULL,
  vendor_address        TEXT,
  vendor_contact        TEXT,
  vendor_contact_email  TEXT,
  delivery_address      TEXT,
  issue_date            TEXT,           -- stored as ISO date string "YYYY-MM-DD"
  delivery_date         TEXT,
  payment_terms         TEXT,
  quote_ref_no          TEXT,           -- Sales Quote reference
  notes                 TEXT,
  is_private            BOOLEAN        NOT NULL DEFAULT FALSE,
  items                 JSONB          NOT NULL DEFAULT '[]',
  subtotal              DECIMAL(15,2)  NOT NULL DEFAULT 0,
  tax                   DECIMAL(15,2)  NOT NULL DEFAULT 0,
  total_amount          DECIMAL(15,2)  NOT NULL DEFAULT 0,
  currency              TEXT           NOT NULL DEFAULT 'SGD',  -- SGD|USD|EUR|GBP|MYR|INR
  status                TEXT           NOT NULL DEFAULT 'draft',
  created_by            INTEGER        NOT NULL,
  created_at            TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE: quotations
-- items JSONB — same structure as purchase_orders.items
-- status: 'draft' | 'confirmed' | 'cancelled'
-- ============================================================
CREATE TABLE IF NOT EXISTS quotations (
  id                     SERIAL         PRIMARY KEY,
  qt_number              TEXT           NOT NULL UNIQUE,
  company_id             INTEGER        NOT NULL DEFAULT 1,
  customer_name          TEXT           NOT NULL,
  customer_address       TEXT,
  customer_contact       TEXT,
  customer_contact_email TEXT,
  delivery_address       TEXT,
  issue_date             TEXT,
  delivery_date          TEXT,
  payment_terms          TEXT,
  notes                  TEXT,
  is_private             BOOLEAN        NOT NULL DEFAULT FALSE,
  items                  JSONB          NOT NULL DEFAULT '[]',
  subtotal               DECIMAL(15,2)  NOT NULL DEFAULT 0,
  discount_amount        DECIMAL(15,2)  NOT NULL DEFAULT 0,
  tax                    DECIMAL(15,2)  NOT NULL DEFAULT 0,
  total_amount           DECIMAL(15,2)  NOT NULL DEFAULT 0,
  currency               TEXT           NOT NULL DEFAULT 'SGD',
  status                 TEXT           NOT NULL DEFAULT 'draft',
  created_by             INTEGER        NOT NULL,
  created_at             TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE: invoices
-- status: 'draft' | 'confirmed' | 'void' | 'paid'
-- void_reason: populated when status = 'void'
-- po_ref_no:   free-text reference to a PO number (no FK enforced)
-- NOTE: invoices are NEVER deleted; use void/paid workflow instead.
-- ============================================================
CREATE TABLE IF NOT EXISTS invoices (
  id                     SERIAL         PRIMARY KEY,
  inv_number             TEXT           NOT NULL,
  company_id             INTEGER        NOT NULL DEFAULT 1,
  customer_name          TEXT           NOT NULL,
  customer_address       TEXT,
  customer_contact       TEXT,
  customer_contact_email TEXT,
  delivery_address       TEXT,
  issue_date             TEXT,
  delivery_date          TEXT,
  payment_terms          TEXT,
  notes                  TEXT,
  is_private             BOOLEAN        NOT NULL DEFAULT FALSE,
  items                  JSONB          NOT NULL DEFAULT '[]',
  subtotal               DECIMAL(15,2)  NOT NULL DEFAULT 0,
  discount_amount        DECIMAL(15,2)  NOT NULL DEFAULT 0,
  tax                    DECIMAL(15,2)  NOT NULL DEFAULT 0,
  total_amount           DECIMAL(15,2)  NOT NULL DEFAULT 0,
  currency               TEXT           NOT NULL DEFAULT 'SGD',
  po_ref_no              TEXT,
  status                 TEXT           NOT NULL DEFAULT 'draft',
  void_reason            TEXT,
  created_by             INTEGER        NOT NULL,
  created_at             TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  CONSTRAINT invoices_company_inv_number_unique UNIQUE (company_id, inv_number)
);

-- ============================================================
-- TABLE: delivery_orders
-- items JSONB — array of:
--   { description, partNumber, uom, qty, itemImage }
-- status: 'draft' | 'confirmed' | 'cancelled'
-- inv_id / inv_number: linked invoice (optional)
-- ============================================================
CREATE TABLE IF NOT EXISTS delivery_orders (
  id                SERIAL       PRIMARY KEY,
  do_number         TEXT         NOT NULL UNIQUE,
  company_id        INTEGER      NOT NULL DEFAULT 1,
  customer_name     TEXT         NOT NULL,
  customer_address  TEXT,
  customer_contact  TEXT,
  issue_date        TEXT,
  delivery_date     TEXT,
  payment_terms     TEXT,
  notes             TEXT,
  is_private        BOOLEAN      NOT NULL DEFAULT FALSE,
  items             JSONB        NOT NULL DEFAULT '[]',
  status            TEXT         NOT NULL DEFAULT 'draft',
  inv_id            INTEGER,
  inv_number        TEXT,
  created_by        INTEGER      NOT NULL,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE: vendor_invoices  (Accounts Payable — Proforma Invoices)
-- po_ids: JSON array of PO IDs this PI covers, e.g. [1, 3]
-- status: 'pending' | 'partial' | 'paid'
-- ============================================================
CREATE TABLE IF NOT EXISTS vendor_invoices (
  id            SERIAL         PRIMARY KEY,
  company_id    INTEGER        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  pi_number     TEXT           NOT NULL,
  pi_date       TEXT,
  vendor_name   TEXT           NOT NULL,
  po_ids        JSONB          NOT NULL DEFAULT '[]',
  po_numbers    TEXT,
  currency      TEXT           NOT NULL DEFAULT 'SGD',
  total_amount  DECIMAL(15,2)  NOT NULL DEFAULT 0,
  paid_amount   DECIMAL(15,2)  NOT NULL DEFAULT 0,
  status        TEXT           NOT NULL DEFAULT 'pending',
  notes         TEXT,
  created_by    INTEGER        NOT NULL,
  created_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE: vendor_payments  (payment records against a vendor invoice)
-- payment_method: 'bank_transfer' | 'cheque' | 'cash' | etc.
-- ============================================================
CREATE TABLE IF NOT EXISTS vendor_payments (
  id                 SERIAL         PRIMARY KEY,
  company_id         INTEGER        NOT NULL REFERENCES companies(id)      ON DELETE CASCADE,
  vendor_invoice_id  INTEGER        NOT NULL REFERENCES vendor_invoices(id) ON DELETE CASCADE,
  payment_date       TEXT           NOT NULL,
  amount             DECIMAL(15,2)  NOT NULL,
  reference          TEXT,
  payment_method     TEXT           DEFAULT 'bank_transfer',
  notes              TEXT,
  created_by         INTEGER        NOT NULL,
  created_at         TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE: grn  (Goods Received Notes)
-- status: 'draft' | 'confirmed'
-- items JSONB — received line items
-- ============================================================
CREATE TABLE IF NOT EXISTS grn (
  id           SERIAL       PRIMARY KEY,
  grn_number   TEXT         NOT NULL UNIQUE,
  po_id        INTEGER      NOT NULL,
  po_number    TEXT         NOT NULL,
  vendor_name  TEXT         NOT NULL,
  company_id   INTEGER      NOT NULL DEFAULT 1,
  status       TEXT         NOT NULL DEFAULT 'draft',
  items        JSONB        NOT NULL DEFAULT '[]',
  created_by   INTEGER      NOT NULL,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE: email_contacts  (autocomplete history per company)
-- ============================================================
CREATE TABLE IF NOT EXISTS email_contacts (
  id            SERIAL       PRIMARY KEY,
  company_id    INTEGER      NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name          TEXT,
  email         TEXT         NOT NULL,
  use_count     INTEGER      NOT NULL DEFAULT 1,
  last_used_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE: audit_logs
-- action: 'CREATE' | 'UPDATE' | 'DELETE' | 'VIEW' | etc.
-- entity_type: 'purchase_order' | 'quotation' | 'invoice' | 'delivery_order' | etc.
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id            SERIAL       PRIMARY KEY,
  company_id    INTEGER,
  user_id       INTEGER,
  username      TEXT,
  action        TEXT         NOT NULL,
  entity_type   TEXT         NOT NULL,
  entity_id     TEXT,
  entity_label  TEXT,
  details       JSONB,
  ip_address    TEXT,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE: maintenance  (system maintenance mode flag)
-- ============================================================
CREATE TABLE IF NOT EXISTS maintenance (
  id               SERIAL       PRIMARY KEY,
  is_enabled       BOOLEAN      NOT NULL DEFAULT FALSE,
  scheduled_start  TEXT,
  scheduled_end    TEXT,
  message          TEXT,
  contact_email    TEXT,
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_by_user  TEXT
);

-- ============================================================
-- TABLE: conversations  (AI assistant chat threads)
-- ============================================================
CREATE TABLE IF NOT EXISTS conversations (
  id         SERIAL       PRIMARY KEY,
  title      TEXT         NOT NULL,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE: messages  (messages within a conversation)
-- role: 'user' | 'assistant'
-- ============================================================
CREATE TABLE IF NOT EXISTS messages (
  id               SERIAL       PRIMARY KEY,
  conversation_id  INTEGER      NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role             TEXT         NOT NULL,
  content          TEXT         NOT NULL,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);


-- ============================================================
-- SEED DATA
-- ============================================================

-- 3 companies
INSERT INTO companies (name, country, address, registration_no, email, phone) VALUES
  ('RSV Infotech Pte Ltd',   'SG', '101 Cecil Street, #20-12 Tong Eng Building, Singapore 069533', '200812581D',           'admin@rsvinfotech.com', '+65 6221 1234'),
  ('Netopsys Pte Ltd',        'SG', '101 Cecil Street, #20-12 Tong Eng Building, Singapore 069533', '202312345K',           'admin@netopsys.com',    '+65 6221 5678'),
  ('Netopsys AI Pvt Ltd',     'IN', 'Bengaluru, Karnataka, India',                                   'U72900KA2023PTC123456','admin@netopsys.ai',     '+91 80 1234 5678')
ON CONFLICT DO NOTHING;

-- Admin user
-- IMPORTANT: The password_hash is a bcrypt (10 rounds) hash of 'admin123'.
-- Because bcrypt uses a random salt, you should generate your own hash at setup time:
--   Node.js:  node -e "require('bcryptjs').hash('admin123',10).then(h=>console.log(h))"
--   Python:   python3 -c "import bcrypt; print(bcrypt.hashpw(b'admin123', bcrypt.gensalt(10)).decode())"
-- Replace the placeholder below with the output.
INSERT INTO users (username, password_hash, role) VALUES
  ('admin', '$2b$10$REPLACE_WITH_BCRYPT_HASH_OF_admin123', 'admin')
ON CONFLICT (username) DO NOTHING;

-- Assign admin to all 3 companies with full module access
INSERT INTO user_companies (user_id, company_id, modules)
SELECT u.id, c.id, '["purchase_orders","quotations","invoices","delivery_orders"]'::jsonb
FROM   users u
CROSS  JOIN companies c
WHERE  u.username = 'admin'
ON CONFLICT DO NOTHING;

-- Per-company settings  (Singapore = 9% GST, India = 18% GST)
INSERT INTO settings (company_id, gst_rate, default_uom) VALUES
  (1, 9.00,  'pcs'),
  (2, 9.00,  'pcs'),
  (3, 18.00, 'pcs')
ON CONFLICT DO NOTHING;

-- Default maintenance row (disabled)
INSERT INTO maintenance (is_enabled) VALUES (FALSE);
