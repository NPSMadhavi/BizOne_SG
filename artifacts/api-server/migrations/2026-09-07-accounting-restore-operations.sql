-- Restore operation audit / progress tracking
CREATE TABLE IF NOT EXISTS accounting_restore_operations (
  id serial PRIMARY KEY,
  company_id integer NOT NULL,
  restore_code text NOT NULL,
  backup_id integer NOT NULL,
  backup_code text NOT NULL,
  restore_type text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING',
  safety_backup_id integer,
  safety_backup_code text,
  steps_json text,
  result_message text,
  error_details text,
  started_by integer,
  started_by_username text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS accounting_restore_ops_company_idx
  ON accounting_restore_operations (company_id);
CREATE INDEX IF NOT EXISTS accounting_restore_ops_backup_idx
  ON accounting_restore_operations (backup_id);
