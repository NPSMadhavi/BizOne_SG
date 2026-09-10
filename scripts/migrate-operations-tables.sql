-- Operations modules from BizOne 8June (company-scoped for Singapore project)
-- Applied automatically on API startup via migrateOperationsTables().
-- Safe to re-run: CREATE IF NOT EXISTS + ADD COLUMN IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS assets (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL,
  tag TEXT NOT NULL,
  type TEXT NOT NULL,
  category TEXT NOT NULL,
  serial TEXT NOT NULL,
  model TEXT,
  manufacturer TEXT,
  status TEXT NOT NULL DEFAULT 'available',
  condition TEXT,
  assigned_to TEXT,
  location TEXT,
  vendor TEXT,
  vendor_id INTEGER,
  invoice_number TEXT,
  purchase_date TIMESTAMPTZ,
  warranty_expiry TIMESTAMPTZ,
  cost TEXT,
  depreciation_start_date TIMESTAMPTZ,
  useful_life_years INTEGER,
  depreciation_method TEXT,
  description TEXT,
  has_license BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS employees (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL,
  employee_id TEXT NOT NULL,
  user_id INTEGER,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT NOT NULL,
  department TEXT NOT NULL,
  designation TEXT NOT NULL,
  join_date TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  salary TEXT,
  annual_salary TEXT,
  nationality TEXT,
  pr_status TEXT,
  date_of_birth TIMESTAMPTZ,
  passport_number TEXT,
  passport_expiry TIMESTAMPTZ,
  visa_number TEXT,
  visa_expiry TIMESTAMPTZ,
  visa_type TEXT,
  visa_remarks TEXT,
  nric_number TEXT,
  nric_expiry TIMESTAMPTZ,
  passport_scan TEXT,
  visa_scan TEXT,
  nric_scan TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dependents (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL,
  employee_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  relationship TEXT NOT NULL,
  passport_number TEXT,
  passport_expiry TIMESTAMPTZ,
  visa_number TEXT,
  visa_expiry TIMESTAMPTZ,
  visa_type TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS licenses (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL,
  asset_id INTEGER,
  name TEXT NOT NULL,
  license_key TEXT NOT NULL,
  type TEXT NOT NULL,
  seats INTEGER DEFAULT 1,
  vendor_id INTEGER,
  purchase_date TIMESTAMPTZ,
  expiry_date TIMESTAMPTZ,
  cost TEXT,
  renewal_cycle TEXT DEFAULT 'none',
  status TEXT DEFAULT 'active',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS asset_assignments (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL,
  asset_id INTEGER NOT NULL,
  employee_id INTEGER NOT NULL,
  date_assigned TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  date_returned TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS maintenance_records (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL,
  asset_id INTEGER NOT NULL,
  issue_description TEXT NOT NULL,
  resolution TEXT,
  service_date TIMESTAMPTZ NOT NULL,
  next_maintenance_date TIMESTAMPTZ,
  cost TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS employee_payroll (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL,
  employee_id INTEGER NOT NULL,
  base_salary NUMERIC(10,2) NOT NULL,
  payroll_period TEXT NOT NULL DEFAULT 'monthly',
  hourly_rate NUMERIC(8,2),
  overtime_rate NUMERIC(8,2),
  no_of_working_days INTEGER,
  cpf_employee_rate NUMERIC(5,2),
  cpf_employer_rate NUMERIC(5,2),
  tax_rate NUMERIC(5,2) DEFAULT 0,
  cpf_rate NUMERIC(5,2),
  cpf_amount NUMERIC(12,2),
  employer_cpf_rate NUMERIC(5,2),
  employer_cpf_amount NUMERIC(12,2),
  net_salary NUMERIC(12,2),
  allowances JSONB DEFAULT '{}'::jsonb,
  deductions JSONB DEFAULT '{}'::jsonb,
  bank_name TEXT,
  bank_account TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  effective_from DATE,
  effective_to DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payroll_records (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL,
  employee_id INTEGER NOT NULL,
  payroll_config_id INTEGER,
  pay_period_start TIMESTAMPTZ NOT NULL,
  pay_period_end TIMESTAMPTZ NOT NULL,
  base_salary NUMERIC(10,2),
  overtime_hours NUMERIC(6,2) DEFAULT 0,
  overtime_pay NUMERIC(10,2) DEFAULT 0,
  allowances JSONB DEFAULT '{}'::jsonb,
  deductions JSONB DEFAULT '{}'::jsonb,
  gross_pay NUMERIC(12,2) NOT NULL,
  net_pay NUMERIC(12,2) NOT NULL,
  cpf_employee NUMERIC(12,2) DEFAULT 0,
  cpf_employer NUMERIC(12,2) DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  notes TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS service_reports (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL,
  csr_number TEXT NOT NULL,
  customer_id INTEGER,
  customer_name TEXT NOT NULL,
  customer_address TEXT,
  customer_contact_person TEXT,
  customer_phone TEXT,
  customer_email TEXT,
  support_requested_by TEXT NOT NULL,
  support_request_date TIMESTAMPTZ NOT NULL,
  problem_description TEXT NOT NULL,
  engineer_id INTEGER,
  service_date TIMESTAMPTZ NOT NULL,
  service_time TEXT NOT NULL,
  hours_charged NUMERIC(4,2) NOT NULL,
  service_details TEXT NOT NULL,
  remarks TEXT,
  priority_level TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'draft',
  created_by INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS employee_documents (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL,
  employee_id INTEGER NOT NULL,
  document_type TEXT NOT NULL,
  file_path TEXT NOT NULL,
  issue_date TIMESTAMPTZ,
  expiry_date TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Column upgrades for existing databases (idempotent)
ALTER TABLE employees ADD COLUMN IF NOT EXISTS annual_salary TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS pr_status TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS date_of_birth TIMESTAMPTZ;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS passport_number TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS passport_expiry TIMESTAMPTZ;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS visa_number TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS visa_expiry TIMESTAMPTZ;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS visa_type TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS visa_remarks TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS nric_number TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS nric_expiry TIMESTAMPTZ;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS passport_scan TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS visa_scan TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS nric_scan TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS user_id INTEGER;

ALTER TABLE assets ADD COLUMN IF NOT EXISTS vendor_id INTEGER;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS invoice_number TEXT;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS depreciation_start_date TIMESTAMPTZ;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS useful_life_years INTEGER;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS depreciation_method TEXT;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS has_license BOOLEAN DEFAULT FALSE;

ALTER TABLE employee_payroll ADD COLUMN IF NOT EXISTS hourly_rate NUMERIC(8,2);
ALTER TABLE employee_payroll ADD COLUMN IF NOT EXISTS overtime_rate NUMERIC(8,2);
ALTER TABLE employee_payroll ADD COLUMN IF NOT EXISTS no_of_working_days INTEGER;
ALTER TABLE employee_payroll ADD COLUMN IF NOT EXISTS cpf_employee_rate NUMERIC(5,2);
ALTER TABLE employee_payroll ADD COLUMN IF NOT EXISTS cpf_employer_rate NUMERIC(5,2);
ALTER TABLE employee_payroll ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(5,2) DEFAULT 0;
ALTER TABLE employee_payroll ADD COLUMN IF NOT EXISTS cpf_rate NUMERIC(5,2);
ALTER TABLE employee_payroll ADD COLUMN IF NOT EXISTS cpf_amount NUMERIC(12,2);
ALTER TABLE employee_payroll ADD COLUMN IF NOT EXISTS employer_cpf_rate NUMERIC(5,2);
ALTER TABLE employee_payroll ADD COLUMN IF NOT EXISTS employer_cpf_amount NUMERIC(12,2);
ALTER TABLE employee_payroll ADD COLUMN IF NOT EXISTS net_salary NUMERIC(12,2);
ALTER TABLE employee_payroll ADD COLUMN IF NOT EXISTS bank_name TEXT;
ALTER TABLE employee_payroll ADD COLUMN IF NOT EXISTS bank_account TEXT;
ALTER TABLE employee_payroll ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE employee_payroll ADD COLUMN IF NOT EXISTS effective_from DATE;
ALTER TABLE employee_payroll ADD COLUMN IF NOT EXISTS effective_to DATE;
ALTER TABLE employee_payroll ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE employee_payroll ADD COLUMN IF NOT EXISTS allowances JSONB DEFAULT '{}'::jsonb;
ALTER TABLE employee_payroll ADD COLUMN IF NOT EXISTS deductions JSONB DEFAULT '{}'::jsonb;

ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS payroll_config_id INTEGER;
ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS base_salary NUMERIC(10,2);
ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS overtime_hours NUMERIC(6,2) DEFAULT 0;
ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS overtime_pay NUMERIC(10,2) DEFAULT 0;
ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS allowances JSONB DEFAULT '{}'::jsonb;
ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS deductions JSONB DEFAULT '{}'::jsonb;
ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS cpf_employee NUMERIC(12,2) DEFAULT 0;
ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS cpf_employer NUMERIC(12,2) DEFAULT 0;
ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;
ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE licenses ADD COLUMN IF NOT EXISTS vendor_id INTEGER;
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS renewal_cycle TEXT DEFAULT 'none';
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS notes TEXT;

ALTER TABLE service_reports ADD COLUMN IF NOT EXISTS customer_id INTEGER;
ALTER TABLE service_reports ADD COLUMN IF NOT EXISTS customer_address TEXT;
ALTER TABLE service_reports ADD COLUMN IF NOT EXISTS customer_contact_person TEXT;
ALTER TABLE service_reports ADD COLUMN IF NOT EXISTS customer_phone TEXT;
ALTER TABLE service_reports ADD COLUMN IF NOT EXISTS customer_email TEXT;
ALTER TABLE service_reports ADD COLUMN IF NOT EXISTS engineer_id INTEGER;
ALTER TABLE service_reports ADD COLUMN IF NOT EXISTS remarks TEXT;
ALTER TABLE service_reports ADD COLUMN IF NOT EXISTS created_by INTEGER;
ALTER TABLE service_reports ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS employees_company_id_idx ON employees (company_id);
CREATE INDEX IF NOT EXISTS employee_payroll_company_id_idx ON employee_payroll (company_id);
CREATE INDEX IF NOT EXISTS employee_payroll_employee_id_idx ON employee_payroll (employee_id);
CREATE INDEX IF NOT EXISTS payroll_records_company_id_idx ON payroll_records (company_id);
CREATE INDEX IF NOT EXISTS payroll_records_employee_period_idx ON payroll_records (company_id, employee_id, pay_period_start, pay_period_end);
CREATE INDEX IF NOT EXISTS assets_company_id_idx ON assets (company_id);
CREATE INDEX IF NOT EXISTS licenses_company_id_idx ON licenses (company_id);
CREATE INDEX IF NOT EXISTS service_reports_company_id_idx ON service_reports (company_id);
CREATE INDEX IF NOT EXISTS employee_documents_company_id_idx ON employee_documents (company_id);
