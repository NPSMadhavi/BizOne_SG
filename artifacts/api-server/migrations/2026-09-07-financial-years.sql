-- Financial year closing / opening balances (idempotent startup migration mirror)
-- Applied automatically via api-server startup-backfill.ts

CREATE TABLE IF NOT EXISTS financial_years (
  id serial PRIMARY KEY,
  company_id integer NOT NULL,
  label text NOT NULL,
  start_date text NOT NULL,
  end_date text NOT NULL,
  status text NOT NULL DEFAULT 'inactive',
  audit_status text NOT NULL DEFAULT 'pending',
  closed_at timestamptz,
  closed_by integer,
  closed_by_username text,
  activated_at timestamptz,
  activated_by integer,
  activated_by_username text,
  reopened_at timestamptz,
  reopened_by integer,
  opening_balances_generated boolean NOT NULL DEFAULT false,
  opening_journal_entry_id integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS financial_years_company_dates_uidx
  ON financial_years (company_id, start_date, end_date);

CREATE TABLE IF NOT EXISTS opening_balances (
  id serial PRIMARY KEY,
  company_id integer NOT NULL,
  financial_year_id integer NOT NULL,
  account_id integer,
  account_code text NOT NULL,
  account_name text NOT NULL,
  account_type text,
  debit numeric(15,2) NOT NULL DEFAULT 0,
  credit numeric(15,2) NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customer_opening_balances (
  id serial PRIMARY KEY,
  company_id integer NOT NULL,
  financial_year_id integer NOT NULL,
  customer_id integer,
  customer_name text NOT NULL,
  amount numeric(15,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'SGD',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vendor_opening_balances (
  id serial PRIMARY KEY,
  company_id integer NOT NULL,
  financial_year_id integer NOT NULL,
  vendor_id integer,
  vendor_name text NOT NULL,
  amount numeric(15,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'SGD',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inventory_opening_balances (
  id serial PRIMARY KEY,
  company_id integer NOT NULL,
  financial_year_id integer NOT NULL,
  stock_item_id integer,
  item_code text,
  item_name text NOT NULL,
  warehouse_id integer,
  warehouse_name text,
  quantity numeric(15,4) NOT NULL DEFAULT 0,
  value numeric(15,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fixed_asset_opening_balances (
  id serial PRIMARY KEY,
  company_id integer NOT NULL,
  financial_year_id integer NOT NULL,
  account_code text,
  description text NOT NULL,
  amount numeric(15,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bank_opening_balances (
  id serial PRIMARY KEY,
  company_id integer NOT NULL,
  financial_year_id integer NOT NULL,
  account_id integer,
  account_code text NOT NULL,
  account_name text NOT NULL,
  amount numeric(15,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
