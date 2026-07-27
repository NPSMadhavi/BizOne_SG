-- ============================================================
-- RSV Infotech Document Management System
-- MySQL Schema + Seed Script
-- Requires: MySQL 8.0+ (JSON type, TEXT defaults, window functions)
-- All tables use InnoDB for foreign key and transaction support.
-- Generated: 2026-06-16
-- ============================================================

-- Drop and recreate DB (optional — comment out if adding to existing DB)
-- CREATE DATABASE IF NOT EXISTS rsv_dms CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- USE rsv_dms;

SET FOREIGN_KEY_CHECKS = 0;

-- ============================================================
-- TABLE: companies
-- ============================================================
CREATE TABLE IF NOT EXISTS companies (
  id               INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name             TEXT          NOT NULL,
  country          VARCHAR(10)   NOT NULL,          -- 'SG' | 'IN' | full name
  address          TEXT,
  registration_no  VARCHAR(100),
  email            VARCHAR(255),
  phone            VARCHAR(50),
  created_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- TABLE: users
-- role: 'admin' | 'user'
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id             INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  username       VARCHAR(255) NOT NULL UNIQUE,
  password_hash  TEXT         NOT NULL,             -- bcrypt hash
  role           VARCHAR(20)  NOT NULL DEFAULT 'user',
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- TABLE: user_companies  (many-to-many users ↔ companies)
-- modules: JSON array of permitted module keys:
--   "purchase_orders" | "quotations" | "invoices" | "delivery_orders"
-- Admin users bypass module checks and have access to all companies.
-- ============================================================
CREATE TABLE IF NOT EXISTS user_companies (
  id          INT     NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id     INT     NOT NULL,
  company_id  INT     NOT NULL,
  modules     JSON    NOT NULL DEFAULT (JSON_ARRAY('purchase_orders','quotations','invoices','delivery_orders')),
  UNIQUE KEY uq_user_company (user_id, company_id),
  CONSTRAINT fk_uc_user    FOREIGN KEY (user_id)    REFERENCES users(id)     ON DELETE CASCADE,
  CONSTRAINT fk_uc_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- TABLE: settings  (one row per company; company_id nullable for legacy global row)
-- Running number counters are incremented atomically at document creation time.
-- ============================================================
CREATE TABLE IF NOT EXISTS settings (
  id                    INT            NOT NULL AUTO_INCREMENT PRIMARY KEY,
  company_id            INT,
  gst_rate              DECIMAL(5,2)   NOT NULL DEFAULT 9,
  smtp_host             VARCHAR(255),
  smtp_port             VARCHAR(10),
  smtp_user             VARCHAR(255),
  smtp_pass             TEXT,
  smtp_from             VARCHAR(255),
  po_prefix             VARCHAR(20)    DEFAULT 'PO',
  po_counter            INT            NOT NULL DEFAULT 1,
  po_suffix             VARCHAR(20)    DEFAULT '',
  inv_prefix            VARCHAR(20)    DEFAULT 'INV',
  inv_counter           INT            NOT NULL DEFAULT 1,
  inv_suffix            VARCHAR(20)    DEFAULT '',
  qt_prefix             VARCHAR(20)    DEFAULT 'QT',
  qt_counter            INT            NOT NULL DEFAULT 1,
  qt_suffix             VARCHAR(20)    DEFAULT '',
  do_prefix             VARCHAR(20)    DEFAULT 'DO',
  do_counter            INT            NOT NULL DEFAULT 1,
  do_suffix             VARCHAR(20)    DEFAULT '',
  grn_prefix            VARCHAR(20)    DEFAULT 'GRN',
  grn_counter           INT            NOT NULL DEFAULT 1,
  grn_suffix            VARCHAR(20)    DEFAULT '',
  allow_negative_stock  TINYINT(1)     NOT NULL DEFAULT 0,
  auto_deduct_on_do     TINYINT(1)     NOT NULL DEFAULT 0,
  low_stock_warning     DECIMAL(15,3)  DEFAULT 0,
  default_uom           VARCHAR(50)    DEFAULT 'pcs',
  bank_details          TEXT,
  terms_and_conditions  TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- TABLE: vendors
-- ============================================================
CREATE TABLE IF NOT EXISTS vendors (
  id              INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  company_id      INT          NOT NULL,
  name            TEXT         NOT NULL,
  address         TEXT,
  postal_code     VARCHAR(20),
  country         VARCHAR(100),
  contact_person  VARCHAR(255),
  contact_email   VARCHAR(255),
  phone           VARCHAR(50),
  currency        VARCHAR(10),
  gst_registered  TINYINT(1)   NOT NULL DEFAULT 0,
  gst_no          VARCHAR(50),
  is_active       TINYINT(1)   NOT NULL DEFAULT 1,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_vendors_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- TABLE: customers
-- ============================================================
CREATE TABLE IF NOT EXISTS customers (
  id               INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  company_id       INT          NOT NULL,
  name             TEXT         NOT NULL,
  address          TEXT,
  postal_code      VARCHAR(20),
  country          VARCHAR(100),
  contact_person   VARCHAR(255),
  contact_email    VARCHAR(255),
  phone            VARCHAR(50),
  currency         VARCHAR(10),
  gst_registered   TINYINT(1)   NOT NULL DEFAULT 0,
  gst_no           VARCHAR(50),
  ship_to_address  TEXT,
  is_active        TINYINT(1)   NOT NULL DEFAULT 1,
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_customers_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- TABLE: stock_items  (product/service catalogue per company)
-- type: 'product' | 'service'
-- ============================================================
CREATE TABLE IF NOT EXISTS stock_items (
  id           INT            NOT NULL AUTO_INCREMENT PRIMARY KEY,
  company_id   INT            NOT NULL,
  code         VARCHAR(100)   NOT NULL,
  name         TEXT           NOT NULL,
  description  TEXT,
  uom          VARCHAR(50)    NOT NULL DEFAULT 'pcs',
  type         VARCHAR(20)    NOT NULL DEFAULT 'product',
  unit_price   DECIMAL(15,2)  DEFAULT 0,
  stock_qty    DECIMAL(15,3)  DEFAULT 0,
  is_active    TINYINT(1)     NOT NULL DEFAULT 1,
  created_at   DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_stock_items_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- TABLE: stock_serials  (serial number tracking per stock item)
-- status: 'available' | 'reserved' | 'sold'
-- ============================================================
CREATE TABLE IF NOT EXISTS stock_serials (
  id                INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  company_id        INT          NOT NULL,
  stock_item_id     INT          NOT NULL,
  serial_number     VARCHAR(255) NOT NULL,
  status            VARCHAR(20)  NOT NULL DEFAULT 'available',
  grn_id            INT,
  grn_number        VARCHAR(100),
  invoice_id        INT,
  invoice_number    VARCHAR(100),
  reserved_by_user  VARCHAR(255),
  do_id             INT,
  do_number         VARCHAR(100),
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_serials_company    FOREIGN KEY (company_id)    REFERENCES companies(id)   ON DELETE CASCADE,
  CONSTRAINT fk_serials_stock_item FOREIGN KEY (stock_item_id) REFERENCES stock_items(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- TABLE: purchase_orders
-- items JSON — array of line item objects:
--   {
--     "type":         "item" | "section",
--     "description":  string,
--     "partNumber":   string,
--     "uom":          string,
--     "qty":          number,
--     "unitPrice":    number,
--     "tax":          number,
--     "discount":     number,
--     "sectionLabel": string,
--     "sectionAlign": "left" | "center",
--     "itemImage":    string   (base64 data-URL or "")
--   }
-- status: 'draft' | 'confirmed' | 'cancelled'
-- ============================================================
CREATE TABLE IF NOT EXISTS purchase_orders (
  id                    INT            NOT NULL AUTO_INCREMENT PRIMARY KEY,
  po_number             VARCHAR(100)   NOT NULL UNIQUE,
  company_id            INT            NOT NULL DEFAULT 1,
  vendor_name           TEXT           NOT NULL,
  vendor_address        TEXT,
  vendor_contact        VARCHAR(255),
  vendor_contact_email  VARCHAR(255),
  delivery_address      TEXT,
  issue_date            VARCHAR(20),              -- ISO date string 'YYYY-MM-DD'
  delivery_date         VARCHAR(50),
  payment_terms         VARCHAR(100),
  quote_ref_no          VARCHAR(100),
  notes                 TEXT,
  is_private            TINYINT(1)     NOT NULL DEFAULT 0,
  items                 JSON           NOT NULL,
  subtotal              DECIMAL(15,2)  NOT NULL DEFAULT 0,
  tax                   DECIMAL(15,2)  NOT NULL DEFAULT 0,
  total_amount          DECIMAL(15,2)  NOT NULL DEFAULT 0,
  currency              VARCHAR(10)    NOT NULL DEFAULT 'SGD',
  status                VARCHAR(20)    NOT NULL DEFAULT 'draft',
  created_by            INT            NOT NULL,
  created_at            DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- TABLE: quotations
-- items JSON — same structure as purchase_orders.items
-- status: 'draft' | 'confirmed' | 'cancelled'
-- ============================================================
CREATE TABLE IF NOT EXISTS quotations (
  id                     INT            NOT NULL AUTO_INCREMENT PRIMARY KEY,
  qt_number              VARCHAR(100)   NOT NULL UNIQUE,
  company_id             INT            NOT NULL DEFAULT 1,
  customer_name          TEXT           NOT NULL,
  customer_address       TEXT,
  customer_contact       VARCHAR(255),
  customer_contact_email VARCHAR(255),
  delivery_address       TEXT,
  issue_date             VARCHAR(20),
  delivery_date          VARCHAR(50),
  payment_terms          VARCHAR(100),
  notes                  TEXT,
  is_private             TINYINT(1)     NOT NULL DEFAULT 0,
  items                  JSON           NOT NULL,
  subtotal               DECIMAL(15,2)  NOT NULL DEFAULT 0,
  discount_amount        DECIMAL(15,2)  NOT NULL DEFAULT 0,
  tax                    DECIMAL(15,2)  NOT NULL DEFAULT 0,
  total_amount           DECIMAL(15,2)  NOT NULL DEFAULT 0,
  currency               VARCHAR(10)    NOT NULL DEFAULT 'SGD',
  status                 VARCHAR(20)    NOT NULL DEFAULT 'draft',
  created_by             INT            NOT NULL,
  created_at             DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- TABLE: invoices
-- status: 'draft' | 'confirmed' | 'void' | 'paid'
-- void_reason: populated when status = 'void'
-- po_ref_no:   free-text reference to a PO (no FK enforced)
-- NOTE: invoices are NEVER deleted; use void / knock-off (paid) workflow.
-- ============================================================
CREATE TABLE IF NOT EXISTS invoices (
  id                     INT            NOT NULL AUTO_INCREMENT PRIMARY KEY,
  inv_number             VARCHAR(100)   NOT NULL,
  company_id             INT            NOT NULL DEFAULT 1,
  customer_name          TEXT           NOT NULL,
  customer_address       TEXT,
  customer_contact       VARCHAR(255),
  customer_contact_email VARCHAR(255),
  delivery_address       TEXT,
  issue_date             VARCHAR(20),
  delivery_date          VARCHAR(50),
  payment_terms          VARCHAR(100),
  notes                  TEXT,
  is_private             TINYINT(1)     NOT NULL DEFAULT 0,
  items                  JSON           NOT NULL,
  subtotal               DECIMAL(15,2)  NOT NULL DEFAULT 0,
  discount_amount        DECIMAL(15,2)  NOT NULL DEFAULT 0,
  tax                    DECIMAL(15,2)  NOT NULL DEFAULT 0,
  total_amount           DECIMAL(15,2)  NOT NULL DEFAULT 0,
  currency               VARCHAR(10)    NOT NULL DEFAULT 'SGD',
  po_ref_no              VARCHAR(100),
  status                 VARCHAR(20)    NOT NULL DEFAULT 'draft',
  void_reason            TEXT,
  created_by             INT            NOT NULL,
  created_at             DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_company_inv_number (company_id, inv_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- TABLE: delivery_orders
-- items JSON — array of:
--   { "description", "partNumber", "uom", "qty", "itemImage" }
-- status: 'draft' | 'confirmed' | 'cancelled'
-- inv_id / inv_number: linked invoice (optional)
-- ============================================================
CREATE TABLE IF NOT EXISTS delivery_orders (
  id                INT            NOT NULL AUTO_INCREMENT PRIMARY KEY,
  do_number         VARCHAR(100)   NOT NULL UNIQUE,
  company_id        INT            NOT NULL DEFAULT 1,
  customer_name     TEXT           NOT NULL,
  customer_address  TEXT,
  customer_contact  VARCHAR(255),
  issue_date        VARCHAR(20),
  delivery_date     VARCHAR(50),
  payment_terms     VARCHAR(100),
  notes             TEXT,
  is_private        TINYINT(1)     NOT NULL DEFAULT 0,
  items             JSON           NOT NULL,
  status            VARCHAR(20)    NOT NULL DEFAULT 'draft',
  inv_id            INT,
  inv_number        VARCHAR(100),
  created_by        INT            NOT NULL,
  created_at        DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- TABLE: vendor_invoices  (Accounts Payable — Proforma Invoices)
-- po_ids: JSON array of PO IDs this PI covers, e.g. [1, 3]
-- status: 'pending' | 'partial' | 'paid'
-- ============================================================
CREATE TABLE IF NOT EXISTS vendor_invoices (
  id            INT            NOT NULL AUTO_INCREMENT PRIMARY KEY,
  company_id    INT            NOT NULL,
  pi_number     VARCHAR(100)   NOT NULL,
  pi_date       VARCHAR(20),
  vendor_name   TEXT           NOT NULL,
  po_ids        JSON           NOT NULL,
  po_numbers    TEXT,
  currency      VARCHAR(10)    NOT NULL DEFAULT 'SGD',
  total_amount  DECIMAL(15,2)  NOT NULL DEFAULT 0,
  paid_amount   DECIMAL(15,2)  NOT NULL DEFAULT 0,
  status        VARCHAR(20)    NOT NULL DEFAULT 'pending',
  notes         TEXT,
  created_by    INT            NOT NULL,
  created_at    DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_vi_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- TABLE: vendor_payments
-- ============================================================
CREATE TABLE IF NOT EXISTS vendor_payments (
  id                 INT            NOT NULL AUTO_INCREMENT PRIMARY KEY,
  company_id         INT            NOT NULL,
  vendor_invoice_id  INT            NOT NULL,
  payment_date       VARCHAR(20)    NOT NULL,
  amount             DECIMAL(15,2)  NOT NULL,
  reference          VARCHAR(255),
  payment_method     VARCHAR(50)    DEFAULT 'bank_transfer',
  notes              TEXT,
  created_by         INT            NOT NULL,
  created_at         DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_vp_company        FOREIGN KEY (company_id)        REFERENCES companies(id)       ON DELETE CASCADE,
  CONSTRAINT fk_vp_vendor_invoice FOREIGN KEY (vendor_invoice_id) REFERENCES vendor_invoices(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- TABLE: grn  (Goods Received Notes)
-- status: 'draft' | 'confirmed'
-- ============================================================
CREATE TABLE IF NOT EXISTS grn (
  id           INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  grn_number   VARCHAR(100) NOT NULL UNIQUE,
  po_id        INT          NOT NULL,
  po_number    VARCHAR(100) NOT NULL,
  vendor_name  TEXT         NOT NULL,
  company_id   INT          NOT NULL DEFAULT 1,
  status       VARCHAR(20)  NOT NULL DEFAULT 'draft',
  items        JSON         NOT NULL,
  created_by   INT          NOT NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- TABLE: email_contacts  (autocomplete history per company)
-- ============================================================
CREATE TABLE IF NOT EXISTS email_contacts (
  id            INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  company_id    INT          NOT NULL,
  name          VARCHAR(255),
  email         VARCHAR(255) NOT NULL,
  use_count     INT          NOT NULL DEFAULT 1,
  last_used_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ec_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- TABLE: audit_logs
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id            INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  company_id    INT,
  user_id       INT,
  username      VARCHAR(255),
  action        VARCHAR(50)  NOT NULL,
  entity_type   VARCHAR(100) NOT NULL,
  entity_id     VARCHAR(100),
  entity_label  TEXT,
  details       JSON,
  ip_address    VARCHAR(45),
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- TABLE: maintenance  (system maintenance mode flag)
-- ============================================================
CREATE TABLE IF NOT EXISTS maintenance (
  id               INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  is_enabled       TINYINT(1)   NOT NULL DEFAULT 0,
  scheduled_start  VARCHAR(50),
  scheduled_end    VARCHAR(50),
  message          TEXT,
  contact_email    VARCHAR(255),
  updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by_user  VARCHAR(255)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- TABLE: conversations  (AI assistant chat threads)
-- ============================================================
CREATE TABLE IF NOT EXISTS conversations (
  id         INT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
  title      TEXT     NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- TABLE: messages
-- role: 'user' | 'assistant'
-- ============================================================
CREATE TABLE IF NOT EXISTS messages (
  id               INT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
  conversation_id  INT      NOT NULL,
  role             VARCHAR(20) NOT NULL,
  content          LONGTEXT NOT NULL,
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_messages_conversation FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- TABLE: expenses  (Singapore-only expense tracking)
-- category: staff_costs | rental | professional_fees | advertising |
--           office_supplies | utilities | travel | entertainment |
--           motor_vehicle_private | motor_vehicle_commercial |
--           training | insurance | bank_charges | other
-- status: 'draft' | 'confirmed' | 'void'
-- gst_claimable: whether input GST can be claimed on GST F5 Box 7
-- is_deductible: whether expense is tax-deductible for income tax
-- deductible_pct: percentage deductible (0-100), e.g. 50 for entertainment
-- ============================================================
CREATE TABLE IF NOT EXISTS expenses (
  id                 INT            NOT NULL AUTO_INCREMENT PRIMARY KEY,
  company_id         INT            NOT NULL,
  expense_date       VARCHAR(20)    NOT NULL,
  vendor_name        TEXT           NOT NULL,
  description        TEXT           NOT NULL,
  category           VARCHAR(50)    NOT NULL,
  amount             DECIMAL(15,2)  NOT NULL,
  gst_amount         DECIMAL(15,2)  NOT NULL DEFAULT 0,
  gst_claimable      TINYINT(1)     NOT NULL DEFAULT 0,
  is_deductible      TINYINT(1)     NOT NULL DEFAULT 1,
  deductible_pct     INT            NOT NULL DEFAULT 100,
  currency           VARCHAR(10)    NOT NULL DEFAULT 'SGD',
  payment_method     VARCHAR(50)             DEFAULT 'bank_transfer',
  receipt_data       LONGTEXT,
  receipt_mime_type  VARCHAR(100),
  vendor_id          INT,
  project_id         INT,
  voucher_id         INT,
  journal_entry_id   INT,
  status             VARCHAR(20)    NOT NULL DEFAULT 'draft',
  notes              TEXT,
  created_by         INT            NOT NULL,
  created_at         DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_exp_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- TABLE: income_records  (Singapore-only non-trade income tracking)
-- category: rental_income | interest_income | dividend_income |
--           grant_subsidy | commission_income | service_fee |
--           royalty_income | gain_on_disposal | forex_gain | other_income
-- gst_treatment: 'standard_rated' | 'zero_rated' | 'exempt' | 'out_of_scope'
-- status: 'draft' | 'confirmed' | 'void'
-- Confirmed records auto-post a journal entry and feed GST F5:
--   standard_rated → Box 1 (net) & Box 6 (GST)
--   zero_rated     → Box 2
--   exempt         → Box 3
-- ============================================================
CREATE TABLE IF NOT EXISTS income_records (
  id               INT            NOT NULL AUTO_INCREMENT PRIMARY KEY,
  company_id       INT            NOT NULL,
  income_date      VARCHAR(20)    NOT NULL,
  payer_name       TEXT           NOT NULL,
  description      TEXT           NOT NULL,
  category         VARCHAR(50)    NOT NULL,
  amount           DECIMAL(15,2)  NOT NULL,
  gst_amount       DECIMAL(15,2)  NOT NULL DEFAULT 0,
  gst_treatment    VARCHAR(20)    NOT NULL DEFAULT 'standard_rated',
  currency         VARCHAR(10)    NOT NULL DEFAULT 'SGD',
  payment_method   VARCHAR(50)             DEFAULT 'bank_transfer',
  account_id       INT,
  reference        VARCHAR(255),
  notes            TEXT,
  status           VARCHAR(20)    NOT NULL DEFAULT 'draft',
  journal_entry_id INT,
  created_by       INT            NOT NULL,
  created_at       DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_inc_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET FOREIGN_KEY_CHECKS = 1;


-- ============================================================
-- SEED DATA
-- ============================================================

-- 3 companies
INSERT IGNORE INTO companies (name, country, address, registration_no, email, phone) VALUES
  ('RSV Infotech Pte Ltd',   'SG', '101 Cecil Street, #20-12 Tong Eng Building, Singapore 069533', '200812581D',            'admin@rsvinfotech.com', '+65 6221 1234'),
  ('Netopsys Pte Ltd',        'SG', '101 Cecil Street, #20-12 Tong Eng Building, Singapore 069533', '202312345K',            'admin@netopsys.com',    '+65 6221 5678'),
  ('Netopsys AI Pvt Ltd',     'IN', 'Bengaluru, Karnataka, India',                                   'U72900KA2023PTC123456', 'admin@netopsys.ai',     '+91 80 1234 5678');

-- Admin user
-- IMPORTANT: The password_hash is a bcrypt (10 rounds) hash of 'admin123'.
-- Because bcrypt uses a random salt, generate your own hash at setup time:
--   Node.js:  node -e "require('bcryptjs').hash('admin123',10).then(h=>console.log(h))"
--   Python:   python3 -c "import bcrypt; print(bcrypt.hashpw(b'admin123', bcrypt.gensalt(10)).decode())"
-- Replace the placeholder below with the output before running this script.
INSERT IGNORE INTO users (username, password_hash, role) VALUES
  ('admin', '$2b$10$REPLACE_WITH_BCRYPT_HASH_OF_admin123', 'admin');

-- Assign admin to all 3 companies with full module access
INSERT IGNORE INTO user_companies (user_id, company_id, modules)
SELECT u.id, c.id, JSON_ARRAY('purchase_orders','quotations','invoices','delivery_orders')
FROM   users u
CROSS  JOIN companies c
WHERE  u.username = 'admin';

-- Per-company settings (Singapore = 9% GST, India = 18% GST)
INSERT IGNORE INTO settings (company_id, gst_rate, default_uom) VALUES
  (1, 9.00,  'pcs'),
  (2, 9.00,  'pcs'),
  (3, 18.00, 'pcs');

-- Default maintenance row (disabled)
INSERT INTO maintenance (is_enabled) VALUES (0);
