-- =============================================================================
-- RSV Infotech Document Management System
-- Complete PostgreSQL Database Schema
-- Generated: 2026-07-20
--
-- Companies:
--   1. RSV Infotech Pte. Ltd.   (Singapore)
--   2. Netopsys Pte. Ltd.       (Singapore)
--   3. Netopsys AI Pvt. Ltd.    (India)
--
-- JSONB "items" column structure (line items stored as array of objects):
--   Item row   : { type, sectionLabel, sectionAlign, partNumber, description,
--                  qty, uom, unitPrice, discount, isFoc, isStockItem, itemImage }
--   Section row: { type: "section", sectionLabel, sectionAlign }
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Drop tables in reverse-dependency order (safe re-run)
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS messages                CASCADE;
DROP TABLE IF EXISTS conversations           CASCADE;
DROP TABLE IF EXISTS audit_logs              CASCADE;
DROP TABLE IF EXISTS maintenance             CASCADE;
DROP TABLE IF EXISTS email_contacts          CASCADE;
DROP TABLE IF EXISTS voucher_attachments     CASCADE;
DROP TABLE IF EXISTS vouchers                CASCADE;
DROP TABLE IF EXISTS wht_records             CASCADE;
DROP TABLE IF EXISTS tax_filings             CASCADE;
DROP TABLE IF EXISTS customer_deposits       CASCADE;
DROP TABLE IF EXISTS journal_lines           CASCADE;
DROP TABLE IF EXISTS journal_entries         CASCADE;
DROP TABLE IF EXISTS stock_serials           CASCADE;
DROP TABLE IF EXISTS grn                     CASCADE;
DROP TABLE IF EXISTS invoice_payments        CASCADE;
DROP TABLE IF EXISTS vendor_payments         CASCADE;
DROP TABLE IF EXISTS vendor_invoices         CASCADE;
DROP TABLE IF EXISTS credit_notes            CASCADE;
DROP TABLE IF EXISTS proforma_invoices       CASCADE;
DROP TABLE IF EXISTS delivery_orders         CASCADE;
DROP TABLE IF EXISTS invoices                CASCADE;
DROP TABLE IF EXISTS quotations              CASCADE;
DROP TABLE IF EXISTS purchase_orders         CASCADE;
DROP TABLE IF EXISTS projects                CASCADE;
DROP TABLE IF EXISTS accounts                CASCADE;
DROP TABLE IF EXISTS stock_items             CASCADE;
DROP TABLE IF EXISTS customers               CASCADE;
DROP TABLE IF EXISTS vendors                 CASCADE;
DROP TABLE IF EXISTS settings                CASCADE;
DROP TABLE IF EXISTS user_companies          CASCADE;
DROP TABLE IF EXISTS users                   CASCADE;
DROP TABLE IF EXISTS companies               CASCADE;

-- =============================================================================
-- CORE TABLES
-- =============================================================================

-- ---------------------------------------------------------------------------
-- companies
-- ---------------------------------------------------------------------------
CREATE TABLE companies (
    id              SERIAL PRIMARY KEY,
    name            TEXT        NOT NULL,
    country         TEXT        NOT NULL,
    address         TEXT,
    registration_no TEXT,
    email           TEXT,
    phone           TEXT,
    logo_url        TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
CREATE TABLE users (
    id            SERIAL PRIMARY KEY,
    username      TEXT        NOT NULL UNIQUE,
    password_hash TEXT        NOT NULL,
    role          TEXT        NOT NULL DEFAULT 'user',  -- 'admin' | 'user'
    email         TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- user_companies  (many-to-many: users ↔ companies + per-user module list)
-- modules JSONB array values: 'purchase_orders' | 'quotations' | 'invoices'
--                              | 'delivery_orders'
-- ---------------------------------------------------------------------------
CREATE TABLE user_companies (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id)     ON DELETE CASCADE,
    company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    modules    JSONB   NOT NULL DEFAULT '["purchase_orders","quotations","invoices","delivery_orders"]',
    UNIQUE (user_id, company_id)
);

-- ---------------------------------------------------------------------------
-- settings  (one row per company; company_id NULL = global fallback)
-- Running-number counters are incremented atomically per doc type.
-- ---------------------------------------------------------------------------
CREATE TABLE settings (
    id                   SERIAL PRIMARY KEY,
    company_id           INTEGER REFERENCES companies(id) ON DELETE CASCADE,
    -- GST / Tax
    gst_rate             NUMERIC(5,2)  NOT NULL DEFAULT 9,
    -- SMTP
    smtp_host            TEXT,
    smtp_port            TEXT,
    smtp_user            TEXT,
    smtp_pass            TEXT,
    smtp_from            TEXT,
    -- Running numbers: Purchase Orders
    po_prefix            TEXT    DEFAULT 'PO',
    po_counter           INTEGER NOT NULL DEFAULT 1,
    po_suffix            TEXT    DEFAULT '',
    -- Running numbers: Invoices
    inv_prefix           TEXT    DEFAULT 'INV',
    inv_counter          INTEGER NOT NULL DEFAULT 1,
    inv_suffix           TEXT    DEFAULT '',
    -- Running numbers: Quotations
    qt_prefix            TEXT    DEFAULT 'QT',
    qt_counter           INTEGER NOT NULL DEFAULT 1,
    qt_suffix            TEXT    DEFAULT '',
    -- Running numbers: Delivery Orders
    do_prefix            TEXT    DEFAULT 'DO',
    do_counter           INTEGER NOT NULL DEFAULT 1,
    do_suffix            TEXT    DEFAULT '',
    -- Running numbers: Goods Received Notes
    grn_prefix           TEXT    DEFAULT 'GRN',
    grn_counter          INTEGER NOT NULL DEFAULT 1,
    grn_suffix           TEXT    DEFAULT '',
    -- Running numbers: Credit Notes
    cn_prefix            TEXT    DEFAULT 'CN',
    cn_counter           INTEGER NOT NULL DEFAULT 1,
    cn_suffix            TEXT    DEFAULT '',
    -- Running numbers: Proforma Invoices
    pi_prefix            TEXT    DEFAULT 'PI',
    pi_counter           INTEGER NOT NULL DEFAULT 1,
    pi_suffix            TEXT    DEFAULT '',
    -- Running numbers: Payment Vouchers
    pv_prefix            TEXT    DEFAULT 'PV',
    pv_counter           INTEGER NOT NULL DEFAULT 1,
    pv_suffix            TEXT    DEFAULT '',
    -- ERP / Inventory
    allow_negative_stock BOOLEAN NOT NULL DEFAULT FALSE,
    auto_deduct_on_do    BOOLEAN NOT NULL DEFAULT FALSE,
    low_stock_warning    NUMERIC(15,3)    DEFAULT 0,
    default_uom          TEXT             DEFAULT 'pcs',
    -- Document footers
    bank_details         TEXT,
    terms_and_conditions TEXT,
    quotation_terms      TEXT,
    -- Voucher workflow defaults
    default_verifier_id  INTEGER,
    default_approver_id  INTEGER,
    default_paid_by_id   INTEGER
);

-- =============================================================================
-- DIRECTORY TABLES
-- =============================================================================

-- ---------------------------------------------------------------------------
-- vendors  (AP / purchase side)
-- ---------------------------------------------------------------------------
CREATE TABLE vendors (
    id             SERIAL PRIMARY KEY,
    company_id     INTEGER     NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name           TEXT        NOT NULL,
    address        TEXT,
    postal_code    TEXT,
    country        TEXT,
    contact_person TEXT,
    contact_email  TEXT,
    phone          TEXT,
    currency       TEXT,
    gst_registered BOOLEAN     NOT NULL DEFAULT FALSE,
    gst_no         TEXT,
    is_active      BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- customers  (AR / sales side)
-- ---------------------------------------------------------------------------
CREATE TABLE customers (
    id              SERIAL PRIMARY KEY,
    company_id      INTEGER     NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name            TEXT        NOT NULL,
    address         TEXT,
    postal_code     TEXT,
    country         TEXT,
    contact_person  TEXT,
    contact_email   TEXT,
    phone           TEXT,
    currency        TEXT,
    gst_registered  BOOLEAN     NOT NULL DEFAULT FALSE,
    gst_no          TEXT,
    ship_to_address TEXT,
    is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- INVENTORY TABLES
-- =============================================================================

-- ---------------------------------------------------------------------------
-- stock_items  (product / service catalogue per company)
-- type: 'product' | 'service'
-- ---------------------------------------------------------------------------
CREATE TABLE stock_items (
    id         SERIAL PRIMARY KEY,
    company_id INTEGER      NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    code       TEXT         NOT NULL,
    name       TEXT         NOT NULL,
    description TEXT,
    uom        TEXT         NOT NULL DEFAULT 'pcs',
    type       TEXT         NOT NULL DEFAULT 'product',
    unit_price NUMERIC(15,2)         DEFAULT 0,
    stock_qty  NUMERIC(15,3)         DEFAULT 0,
    is_active  BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- stock_serials  (serial-number tracking per stock item)
-- status: 'available' | 'reserved' | 'sold' | 'returned'
-- ---------------------------------------------------------------------------
CREATE TABLE stock_serials (
    id             SERIAL PRIMARY KEY,
    company_id     INTEGER     NOT NULL REFERENCES companies(id)    ON DELETE CASCADE,
    stock_item_id  INTEGER     NOT NULL REFERENCES stock_items(id)  ON DELETE CASCADE,
    serial_number  TEXT        NOT NULL,
    status         TEXT        NOT NULL DEFAULT 'available',
    grn_id         INTEGER,
    grn_number     TEXT,
    invoice_id     INTEGER,
    invoice_number TEXT,
    reserved_by_user TEXT,
    do_id          INTEGER,
    do_number      TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- DOCUMENT TABLES
-- =============================================================================

-- ---------------------------------------------------------------------------
-- purchase_orders
-- status: 'draft' | 'confirmed' | 'closed'
-- items JSONB: array of line-item objects (see header comment)
-- ---------------------------------------------------------------------------
CREATE TABLE purchase_orders (
    id                  SERIAL PRIMARY KEY,
    po_number           TEXT         NOT NULL UNIQUE,
    company_id          INTEGER      NOT NULL DEFAULT 1,
    vendor_name         TEXT         NOT NULL,
    vendor_address      TEXT,
    vendor_contact      TEXT,
    vendor_contact_email TEXT,
    delivery_address    TEXT,
    issue_date          TEXT,                    -- stored as YYYY-MM-DD string
    delivery_date       TEXT,
    payment_terms       TEXT,
    quote_ref_no        TEXT,
    notes               TEXT,
    is_private          BOOLEAN      NOT NULL DEFAULT FALSE,
    items               JSONB        NOT NULL DEFAULT '[]',
    subtotal            NUMERIC(15,2) NOT NULL DEFAULT 0,
    tax                 NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_amount        NUMERIC(15,2) NOT NULL DEFAULT 0,
    currency            TEXT         NOT NULL DEFAULT 'SGD',
    status              TEXT         NOT NULL DEFAULT 'draft',
    customer_id         INTEGER,                 -- optional link to customer (internal ref)
    customer_po_ref     TEXT,
    email_sent_to       TEXT,
    ack_token           TEXT,                    -- vendor acknowledgement token
    ack_at              TEXT,
    ack_note            TEXT,
    created_by          INTEGER      NOT NULL REFERENCES users(id),
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- quotations
-- status: 'draft' | 'confirmed' | 'closed'
-- ---------------------------------------------------------------------------
CREATE TABLE quotations (
    id                    SERIAL PRIMARY KEY,
    qt_number             TEXT         NOT NULL UNIQUE,
    company_id            INTEGER      NOT NULL DEFAULT 1,
    customer_name         TEXT         NOT NULL,
    customer_address      TEXT,
    customer_contact      TEXT,
    customer_contact_email TEXT,
    delivery_address      TEXT,
    issue_date            TEXT,
    delivery_date         TEXT,
    payment_terms         TEXT,
    notes                 TEXT,
    is_private            BOOLEAN      NOT NULL DEFAULT FALSE,
    items                 JSONB        NOT NULL DEFAULT '[]',
    subtotal              NUMERIC(15,2) NOT NULL DEFAULT 0,
    discount_amount       NUMERIC(15,2) NOT NULL DEFAULT 0,
    tax                   NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_amount          NUMERIC(15,2) NOT NULL DEFAULT 0,
    currency              TEXT         NOT NULL DEFAULT 'SGD',
    status                TEXT         NOT NULL DEFAULT 'draft',
    email_sent_to         TEXT,
    created_by            INTEGER      NOT NULL REFERENCES users(id),
    created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- invoices
-- status: 'draft' | 'confirmed' | 'partial' | 'paid' | 'void'
-- Invoices are NEVER deleted — use status 'void' with void_reason.
-- ---------------------------------------------------------------------------
CREATE TABLE invoices (
    id                    SERIAL PRIMARY KEY,
    inv_number            TEXT         NOT NULL,
    company_id            INTEGER      NOT NULL DEFAULT 1,
    customer_name         TEXT         NOT NULL,
    customer_address      TEXT,
    customer_contact      TEXT,
    customer_contact_email TEXT,
    delivery_address      TEXT,
    issue_date            TEXT,
    delivery_date         TEXT,
    payment_terms         TEXT,
    notes                 TEXT,
    is_private            BOOLEAN      NOT NULL DEFAULT FALSE,
    items                 JSONB        NOT NULL DEFAULT '[]',
    subtotal              NUMERIC(15,2) NOT NULL DEFAULT 0,
    discount_amount       NUMERIC(15,2) NOT NULL DEFAULT 0,
    tax                   NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_amount          NUMERIC(15,2) NOT NULL DEFAULT 0,
    currency              TEXT         NOT NULL DEFAULT 'SGD',
    po_ref_no             TEXT,
    status                TEXT         NOT NULL DEFAULT 'draft',
    email_sent_to         TEXT,
    void_reason           TEXT,
    created_by            INTEGER      NOT NULL REFERENCES users(id),
    created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT invoices_company_inv_number_unique UNIQUE (company_id, inv_number)
);

-- ---------------------------------------------------------------------------
-- invoice_payments  (AR receipts — mirrors vendor_payments for AP)
-- payment_method: 'bank_transfer' | 'cheque' | 'cash' | 'paynow' | other
-- ---------------------------------------------------------------------------
CREATE TABLE invoice_payments (
    id             SERIAL PRIMARY KEY,
    company_id     INTEGER      NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    invoice_id     INTEGER      NOT NULL REFERENCES invoices(id)  ON DELETE CASCADE,
    payment_date   TEXT         NOT NULL,
    amount         NUMERIC(15,2) NOT NULL,
    reference      TEXT,
    payment_method TEXT                   DEFAULT 'bank_transfer',
    notes          TEXT,
    created_by     INTEGER      NOT NULL REFERENCES users(id),
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- delivery_orders
-- status: 'draft' | 'confirmed'
-- No pricing columns — items contain only description + qty + part_number.
-- ---------------------------------------------------------------------------
CREATE TABLE delivery_orders (
    id             SERIAL PRIMARY KEY,
    do_number      TEXT         NOT NULL UNIQUE,
    company_id     INTEGER      NOT NULL DEFAULT 1,
    customer_name  TEXT         NOT NULL,
    customer_address TEXT,
    customer_contact TEXT,
    issue_date     TEXT,
    delivery_date  TEXT,
    payment_terms  TEXT,
    notes          TEXT,
    is_private     BOOLEAN      NOT NULL DEFAULT FALSE,
    items          JSONB        NOT NULL DEFAULT '[]',
    status         TEXT         NOT NULL DEFAULT 'draft',
    email_sent_to  TEXT,
    inv_id         INTEGER,                -- linked invoice id (optional)
    inv_number     TEXT,                   -- linked invoice number (denormalised)
    created_by     INTEGER      NOT NULL REFERENCES users(id),
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- credit_notes
-- status: 'draft' | 'confirmed' | 'void'
-- ---------------------------------------------------------------------------
CREATE TABLE credit_notes (
    id               SERIAL PRIMARY KEY,
    cn_number        TEXT         NOT NULL,
    company_id       INTEGER      NOT NULL DEFAULT 1,
    customer_name    TEXT         NOT NULL,
    customer_address TEXT,
    contact_person   TEXT,
    contact_email    TEXT,
    ref_inv_number   TEXT,                  -- invoice number this CN is against
    reason           TEXT,
    issue_date       TEXT,
    currency         TEXT         NOT NULL DEFAULT 'SGD',
    payment_terms    TEXT,
    notes            TEXT,
    is_private       BOOLEAN      NOT NULL DEFAULT FALSE,
    items            JSONB        NOT NULL DEFAULT '[]',
    subtotal         NUMERIC(15,2) NOT NULL DEFAULT 0,
    discount_amount  NUMERIC(15,2) NOT NULL DEFAULT 0,
    tax_rate         NUMERIC(5,2)  NOT NULL DEFAULT 9,
    tax              NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_amount     NUMERIC(15,2) NOT NULL DEFAULT 0,
    status           TEXT         NOT NULL DEFAULT 'draft',
    void_reason      TEXT,
    email_sent_to    TEXT,
    created_by       INTEGER      NOT NULL REFERENCES users(id),
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT credit_notes_company_cn_number_unique UNIQUE (company_id, cn_number)
);

-- ---------------------------------------------------------------------------
-- proforma_invoices
-- status: 'draft' | 'confirmed' | 'converted'
-- ---------------------------------------------------------------------------
CREATE TABLE proforma_invoices (
    id                    SERIAL PRIMARY KEY,
    pi_number             TEXT         NOT NULL,
    company_id            INTEGER      NOT NULL DEFAULT 1,
    customer_name         TEXT         NOT NULL,
    customer_address      TEXT,
    customer_contact      TEXT,
    customer_contact_email TEXT,
    delivery_address      TEXT,
    issue_date            TEXT,
    delivery_date         TEXT,
    payment_terms         TEXT,
    notes                 TEXT,
    is_private            BOOLEAN      NOT NULL DEFAULT FALSE,
    items                 JSONB        NOT NULL DEFAULT '[]',
    subtotal              NUMERIC(15,2) NOT NULL DEFAULT 0,
    discount_amount       NUMERIC(15,2) NOT NULL DEFAULT 0,
    tax                   NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_amount          NUMERIC(15,2) NOT NULL DEFAULT 0,
    currency              TEXT         NOT NULL DEFAULT 'SGD',
    qt_ref_no             TEXT,
    status                TEXT         NOT NULL DEFAULT 'draft',
    email_sent_to         TEXT,
    created_by            INTEGER      NOT NULL REFERENCES users(id),
    created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT proforma_invoices_company_pi_number_unique UNIQUE (company_id, pi_number)
);

-- ---------------------------------------------------------------------------
-- grn  (Goods Received Notes — linked to purchase_orders)
-- status: 'draft' | 'confirmed'
-- items JSONB: [{ partNumber, description, orderedQty, receivedQty, uom }]
-- ---------------------------------------------------------------------------
CREATE TABLE grn (
    id          SERIAL PRIMARY KEY,
    grn_number  TEXT         NOT NULL UNIQUE,
    po_id       INTEGER      NOT NULL,        -- references purchase_orders(id)
    po_number   TEXT         NOT NULL,
    vendor_name TEXT         NOT NULL,
    company_id  INTEGER      NOT NULL DEFAULT 1,
    status      TEXT         NOT NULL DEFAULT 'draft',
    items       JSONB        NOT NULL DEFAULT '[]',
    created_by  INTEGER      NOT NULL REFERENCES users(id),
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- ACCOUNTS PAYABLE (AP)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- vendor_invoices  (AP: supplier / vendor invoices recorded against POs)
-- status: 'pending' | 'partial' | 'paid'
-- po_ids JSONB: array of PO ids this PI is spread across
-- ---------------------------------------------------------------------------
CREATE TABLE vendor_invoices (
    id                SERIAL PRIMARY KEY,
    company_id        INTEGER      NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    pi_number         TEXT         NOT NULL,
    pi_date           TEXT,
    vendor_name       TEXT         NOT NULL,
    po_ids            JSONB        NOT NULL DEFAULT '[]',
    po_numbers        TEXT,                    -- comma-separated (denormalised)
    currency          TEXT         NOT NULL DEFAULT 'SGD',
    total_amount      NUMERIC(15,2) NOT NULL DEFAULT 0,
    paid_amount       NUMERIC(15,2) NOT NULL DEFAULT 0,
    status            TEXT         NOT NULL DEFAULT 'pending',
    notes             TEXT,
    expense_account_id INTEGER,               -- GL account for expense posting
    created_by        INTEGER      NOT NULL REFERENCES users(id),
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- vendor_payments  (AP: individual payments against a vendor invoice)
-- ---------------------------------------------------------------------------
CREATE TABLE vendor_payments (
    id                SERIAL PRIMARY KEY,
    company_id        INTEGER      NOT NULL REFERENCES companies(id)       ON DELETE CASCADE,
    vendor_invoice_id INTEGER      NOT NULL REFERENCES vendor_invoices(id) ON DELETE CASCADE,
    payment_date      TEXT         NOT NULL,
    amount            NUMERIC(15,2) NOT NULL,
    reference         TEXT,
    payment_method    TEXT                   DEFAULT 'bank_transfer',
    notes             TEXT,
    created_by        INTEGER      NOT NULL REFERENCES users(id),
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- ACCOUNTING / GL
-- =============================================================================

-- ---------------------------------------------------------------------------
-- accounts  (Chart of Accounts per company)
-- type   : 'asset' | 'liability' | 'equity' | 'revenue' | 'expense'
-- sub_type examples: 'current_asset' | 'fixed_asset' | 'current_liability' |
--   'long_term_liability' | 'share_capital' | 'retained_earnings' |
--   'sales' | 'other_income' | 'cost_of_sales' | 'operating_expense'
-- is_system = TRUE means the account is seeded and cannot be deleted.
-- ---------------------------------------------------------------------------
CREATE TABLE accounts (
    id          SERIAL PRIMARY KEY,
    company_id  INTEGER     NOT NULL,
    code        TEXT        NOT NULL,
    name        TEXT        NOT NULL,
    type        TEXT        NOT NULL,
    sub_type    TEXT        NOT NULL,
    description TEXT,
    is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
    is_system   BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT accounts_company_code_unique UNIQUE (company_id, code)
);

-- ---------------------------------------------------------------------------
-- journal_entries  (GL double-entry header)
-- ref_type: 'invoice' | 'purchase_order' | 'vendor_payment' |
--           'invoice_payment' | 'manual'
-- status  : 'draft' | 'posted' | 'reversed'
-- ---------------------------------------------------------------------------
CREATE TABLE journal_entries (
    id            SERIAL PRIMARY KEY,
    company_id    INTEGER     NOT NULL,
    entry_date    TEXT        NOT NULL,          -- YYYY-MM-DD
    description   TEXT        NOT NULL,
    ref_type      TEXT,
    ref_id        INTEGER,
    ref_number    TEXT,
    status        TEXT        NOT NULL DEFAULT 'posted',
    reversal_of_id INTEGER,                      -- points to original entry if this is a reversal
    created_by    INTEGER     NOT NULL REFERENCES users(id),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- journal_lines  (GL double-entry lines)
-- Each entry must have sum(debit) = sum(credit).
-- ---------------------------------------------------------------------------
CREATE TABLE journal_lines (
    id               SERIAL PRIMARY KEY,
    journal_entry_id INTEGER      NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
    account_id       INTEGER      NOT NULL REFERENCES accounts(id),
    description      TEXT,
    debit            NUMERIC(15,2) NOT NULL DEFAULT 0,
    credit           NUMERIC(15,2) NOT NULL DEFAULT 0,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- TAX & COMPLIANCE
-- =============================================================================

-- ---------------------------------------------------------------------------
-- tax_filings  (Singapore CIT: ECI / Form C-S filings per company per FY)
-- type  : 'eci' | 'form_cs'
-- status: 'draft' | 'filed' | 'nil_exempt'
-- data JSONB holds form-specific extra fields (varies by filing type)
-- ---------------------------------------------------------------------------
CREATE TABLE tax_filings (
    id               SERIAL PRIMARY KEY,
    company_id       INTEGER      NOT NULL,
    type             TEXT         NOT NULL,
    financial_year   INTEGER      NOT NULL,
    fy_end_date      TEXT,
    revenue          NUMERIC(15,2),
    chargeable_income NUMERIC(15,2),
    tax_payable      NUMERIC(15,2),
    status           TEXT         NOT NULL DEFAULT 'draft',
    filed_date       TEXT,
    reference_no     TEXT,
    data             JSONB                 DEFAULT '{}',
    notes            TEXT,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    created_by       INTEGER      REFERENCES users(id)
);

-- ---------------------------------------------------------------------------
-- wht_records  (Withholding Tax records — Singapore S45)
-- status: 'pending' | 'filed'
-- payment_type examples: 'royalty' | 'interest' | 'service_fee' | 'rent'
-- ---------------------------------------------------------------------------
CREATE TABLE wht_records (
    id              SERIAL PRIMARY KEY,
    company_id      INTEGER      NOT NULL,
    vendor_name     TEXT         NOT NULL,
    vendor_country  TEXT,
    payment_date    TEXT         NOT NULL,
    nature          TEXT         NOT NULL,
    payment_type    TEXT         NOT NULL,
    currency        TEXT         NOT NULL DEFAULT 'SGD',
    gross_amount    NUMERIC(15,2) NOT NULL,
    wht_rate        NUMERIC(5,2)  NOT NULL,
    wht_amount      NUMERIC(15,2) NOT NULL,
    net_amount      NUMERIC(15,2) NOT NULL,
    filing_deadline TEXT,
    status          TEXT         NOT NULL DEFAULT 'pending',
    filed_date      TEXT,
    reference_no    TEXT,
    notes           TEXT,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    created_by      INTEGER      REFERENCES users(id)
);

-- =============================================================================
-- FINANCE
-- =============================================================================

-- ---------------------------------------------------------------------------
-- customer_deposits  (advance payments received from customers)
-- status: 'available' | 'exhausted' | 'refunded'
-- ---------------------------------------------------------------------------
CREATE TABLE customer_deposits (
    id               SERIAL PRIMARY KEY,
    company_id       INTEGER      NOT NULL,
    customer_name    TEXT         NOT NULL,
    currency         TEXT         NOT NULL DEFAULT 'SGD',
    total_amount     NUMERIC(15,2) NOT NULL,
    applied_amount   NUMERIC(15,2) NOT NULL DEFAULT 0,
    status           TEXT         NOT NULL DEFAULT 'available',
    payment_date     TEXT         NOT NULL,
    payment_method   TEXT                   DEFAULT 'bank_transfer',
    bank_ref         TEXT,
    notes            TEXT,
    journal_entry_id INTEGER      REFERENCES journal_entries(id),
    created_by       INTEGER      NOT NULL REFERENCES users(id),
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- vouchers  (Payment / Receipt Vouchers with approval workflow)
-- type  : 'payment' | 'receipt'
-- status: 'draft' | 'pending_verification' | 'pending_approval' | 'approved' | 'paid'
-- items JSONB: [{ description, amount, accountId }]
-- ---------------------------------------------------------------------------
CREATE TABLE vouchers (
    id               SERIAL PRIMARY KEY,
    voucher_number   TEXT         NOT NULL,
    company_id       INTEGER      NOT NULL,
    project_id       INTEGER,                  -- optional project link
    type             TEXT         NOT NULL DEFAULT 'payment',
    payee            TEXT         NOT NULL,
    payee_contact    TEXT,
    issue_date       TEXT,
    description      TEXT,
    status           TEXT         NOT NULL DEFAULT 'draft',
    items            JSONB        NOT NULL DEFAULT '[]',
    total_amount     NUMERIC(15,2) NOT NULL DEFAULT 0,
    currency         TEXT         NOT NULL DEFAULT 'SGD',
    paid_date        TEXT,
    bank_ref         TEXT,
    notes            TEXT,
    -- Legacy proof storage (base64); new vouchers use voucher_attachments
    proof_data       TEXT,
    proof_mime_type  TEXT,
    -- Creator
    created_by       INTEGER      NOT NULL REFERENCES users(id),
    prepared_by_name TEXT,
    -- Workflow signatories
    verifier_id      INTEGER      REFERENCES users(id),
    approver_id      INTEGER      REFERENCES users(id),
    paid_by_id       INTEGER      REFERENCES users(id),
    verified_at      TEXT,
    approved_at      TEXT,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- voucher_attachments  (proof images / receipts stored as base64)
-- ---------------------------------------------------------------------------
CREATE TABLE voucher_attachments (
    id          SERIAL PRIMARY KEY,
    voucher_id  INTEGER     NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE,
    file_name   TEXT        NOT NULL DEFAULT 'attachment',
    mime_type   TEXT        NOT NULL DEFAULT 'image/jpeg',
    file_data   TEXT        NOT NULL,            -- base64 encoded
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- PROJECTS
-- =============================================================================

-- ---------------------------------------------------------------------------
-- projects  (cost-centre / project tracking)
-- status: 'active' | 'completed' | 'on_hold' | 'cancelled'
-- ---------------------------------------------------------------------------
CREATE TABLE projects (
    id          SERIAL PRIMARY KEY,
    company_id  INTEGER      NOT NULL,
    name        TEXT         NOT NULL,
    code        TEXT,
    description TEXT,
    status      TEXT         NOT NULL DEFAULT 'active',
    budget      NUMERIC(15,2),
    start_date  TEXT,
    end_date    TEXT,
    created_by  INTEGER      NOT NULL REFERENCES users(id),
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- SYSTEM / UTILITY TABLES
-- =============================================================================

-- ---------------------------------------------------------------------------
-- audit_logs  (action trail for all create / update / delete events)
-- action      : 'create' | 'update' | 'delete' | 'login' | 'logout' | etc.
-- entity_type : 'purchase_order' | 'invoice' | 'user' | etc.
-- details JSONB: before/after snapshot or other metadata
-- ---------------------------------------------------------------------------
CREATE TABLE audit_logs (
    id           SERIAL PRIMARY KEY,
    company_id   INTEGER,
    user_id      INTEGER,
    username     TEXT,
    action       TEXT        NOT NULL,
    entity_type  TEXT        NOT NULL,
    entity_id    TEXT,
    entity_label TEXT,
    details      JSONB,
    ip_address   TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- email_contacts  (autocomplete history for email recipients)
-- ---------------------------------------------------------------------------
CREATE TABLE email_contacts (
    id           SERIAL PRIMARY KEY,
    company_id   INTEGER     NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name         TEXT,
    email        TEXT        NOT NULL,
    use_count    INTEGER     NOT NULL DEFAULT 1,
    last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- maintenance  (global maintenance-mode flag, one row)
-- ---------------------------------------------------------------------------
CREATE TABLE maintenance (
    id               SERIAL PRIMARY KEY,
    is_enabled       BOOLEAN     NOT NULL DEFAULT FALSE,
    scheduled_start  TEXT,
    scheduled_end    TEXT,
    message          TEXT,
    contact_email    TEXT,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by_user  TEXT
);

-- ---------------------------------------------------------------------------
-- conversations + messages  (AI assistant chat history)
-- ---------------------------------------------------------------------------
CREATE TABLE conversations (
    id         SERIAL PRIMARY KEY,
    title      TEXT        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE messages (
    id              SERIAL PRIMARY KEY,
    conversation_id INTEGER     NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role            TEXT        NOT NULL,   -- 'user' | 'assistant' | 'system'
    content         TEXT        NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- INDEXES  (recommended for common query patterns)
-- =============================================================================

-- Document lists — always filtered by company
CREATE INDEX idx_purchase_orders_company  ON purchase_orders (company_id, created_at DESC);
CREATE INDEX idx_quotations_company       ON quotations      (company_id, created_at DESC);
CREATE INDEX idx_invoices_company         ON invoices        (company_id, created_at DESC);
CREATE INDEX idx_delivery_orders_company  ON delivery_orders (company_id, created_at DESC);
CREATE INDEX idx_credit_notes_company     ON credit_notes    (company_id, created_at DESC);
CREATE INDEX idx_proforma_invoices_company ON proforma_invoices (company_id, created_at DESC);
CREATE INDEX idx_grn_company              ON grn             (company_id, created_at DESC);

-- AP / AR payment lookups
CREATE INDEX idx_vendor_payments_vi       ON vendor_payments  (vendor_invoice_id);
CREATE INDEX idx_invoice_payments_inv     ON invoice_payments (invoice_id);

-- GL
CREATE INDEX idx_journal_lines_entry      ON journal_lines    (journal_entry_id);
CREATE INDEX idx_journal_lines_account    ON journal_lines    (account_id);
CREATE INDEX idx_journal_entries_company  ON journal_entries  (company_id, entry_date DESC);

-- Directory
CREATE INDEX idx_vendors_company          ON vendors          (company_id);
CREATE INDEX idx_customers_company        ON customers        (company_id);
CREATE INDEX idx_stock_items_company      ON stock_items      (company_id);

-- Audit
CREATE INDEX idx_audit_logs_company       ON audit_logs       (company_id, created_at DESC);
CREATE INDEX idx_audit_logs_entity        ON audit_logs       (entity_type, entity_id);

-- =============================================================================
-- SEED DATA  (default admin user + 3 companies + per-company settings)
-- Password hash below = bcrypt of 'admin123', cost factor 10.
-- Change this before production deployment.
-- =============================================================================

INSERT INTO companies (name, country, address, registration_no, email, phone) VALUES
  ('RSV Infotech Pte. Ltd.',   'Singapore', '10 Anson Road, #10-11, International Plaza, Singapore 079903', '202012345A', 'info@rsvinfotech.com.sg', '+65 6123 4567'),
  ('Netopsys Pte. Ltd.',       'Singapore', '1 Raffles Place, #20-61, One Raffles Place, Singapore 048616',  '202054321B', 'info@netopsys.com.sg',    '+65 6234 5678'),
  ('Netopsys AI Pvt. Ltd.',    'India',     '14th Floor, Concorde Towers, UB City, Bangalore 560001',        'U72900KA2021PTC123456', 'info@netopsysai.in', '+91 80 4567 8901');

INSERT INTO users (username, password_hash, role, email) VALUES
  ('admin', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin', 'admin@rsvinfotech.com.sg');
-- NOTE: the hash above is the bcrypt hash of the string 'password'.
-- Replace with a proper hash before use:
--   Node.js: const bcrypt = require('bcryptjs'); bcrypt.hashSync('your_password', 10)

-- Per-company settings rows (one per company)
INSERT INTO settings (company_id, gst_rate) VALUES (1, 9), (2, 9), (3, 18);

-- Assign admin user to all three companies with all modules
INSERT INTO user_companies (user_id, company_id, modules) VALUES
  (1, 1, '["purchase_orders","quotations","invoices","delivery_orders"]'),
  (1, 2, '["purchase_orders","quotations","invoices","delivery_orders"]'),
  (1, 3, '["purchase_orders","quotations","invoices","delivery_orders"]');

-- Seed one maintenance row (disabled)
INSERT INTO maintenance (is_enabled) VALUES (FALSE);
