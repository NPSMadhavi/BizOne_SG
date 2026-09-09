-- Accounting Backup & Restore tables (also applied via startup-backfill)
CREATE TABLE IF NOT EXISTS accounting_backups (
  id serial PRIMARY KEY,
  company_id integer NOT NULL,
  backup_code text NOT NULL,
  backup_type text NOT NULL,
  from_date text,
  to_date text,
  financial_year_id integer,
  financial_year_label text,
  status text NOT NULL DEFAULT 'pending',
  storage_path text,
  storage_ref text,
  file_size_bytes bigint,
  checksum_sha256 text,
  backup_source text NOT NULL DEFAULT 'manual',
  schedule_id integer,
  error_message text,
  created_by integer,
  created_by_username text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  restored_at timestamptz,
  restored_by integer
);

CREATE TABLE IF NOT EXISTS backup_schedules (
  id serial PRIMARY KEY,
  company_id integer NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  frequency text NOT NULL,
  time_of_day text NOT NULL DEFAULT '23:00',
  day_of_week integer,
  backup_type text NOT NULL DEFAULT 'accounting',
  last_run_at timestamptz,
  next_run_at timestamptz,
  created_by integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS backup_retention_settings (
  id serial PRIMARY KEY,
  company_id integer NOT NULL UNIQUE,
  daily_keep_days integer NOT NULL DEFAULT 30,
  weekly_keep_weeks integer NOT NULL DEFAULT 12,
  monthly_keep_months integer NOT NULL DEFAULT 12,
  financial_year_keep_forever boolean NOT NULL DEFAULT true,
  updated_by integer,
  updated_at timestamptz NOT NULL DEFAULT now()
);
