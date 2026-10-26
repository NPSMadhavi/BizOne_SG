-- Auto-generated full tenant schema (CREATE IF NOT EXISTS). Safe for Plesk heal.
-- Source: local bizone_spsynet (91 tables). Never DROP.

CREATE TABLE IF NOT EXISTS public.accounting_backups (
    id integer NOT NULL,
    company_id integer NOT NULL,
    backup_code text NOT NULL,
    backup_type text NOT NULL,
    from_date text,
    to_date text,
    financial_year_id integer,
    financial_year_label text,
    status text DEFAULT 'pending'::text NOT NULL,
    storage_path text,
    storage_ref text,
    file_size_bytes bigint,
    checksum_sha256 text,
    backup_source text DEFAULT 'manual'::text NOT NULL,
    schedule_id integer,
    error_message text,
    created_by integer,
    created_by_username text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    restored_at timestamp with time zone,
    restored_by integer
);
CREATE SEQUENCE IF NOT EXISTS public.accounting_backups_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.accounting_backups_id_seq OWNED BY public.accounting_backups.id;
CREATE TABLE IF NOT EXISTS public.accounting_restore_operations (
    id integer NOT NULL,
    company_id integer NOT NULL,
    restore_code text NOT NULL,
    backup_id integer NOT NULL,
    backup_code text NOT NULL,
    restore_type text NOT NULL,
    status text DEFAULT 'PENDING'::text NOT NULL,
    safety_backup_id integer,
    safety_backup_code text,
    steps_json text,
    result_message text,
    error_details text,
    started_by integer,
    started_by_username text,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone
);
CREATE SEQUENCE IF NOT EXISTS public.accounting_restore_operations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.accounting_restore_operations_id_seq OWNED BY public.accounting_restore_operations.id;
CREATE TABLE IF NOT EXISTS public.accounts (
    id integer NOT NULL,
    company_id integer NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    sub_type text NOT NULL,
    description text,
    is_active boolean DEFAULT true NOT NULL,
    is_system boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS public.accounts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.accounts_id_seq OWNED BY public.accounts.id;
CREATE TABLE IF NOT EXISTS public.asset_assignments (
    id integer NOT NULL,
    company_id integer NOT NULL,
    asset_id integer NOT NULL,
    employee_id integer NOT NULL,
    date_assigned timestamp with time zone DEFAULT now() NOT NULL,
    date_returned timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT now()
);
CREATE SEQUENCE IF NOT EXISTS public.asset_assignments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.asset_assignments_id_seq OWNED BY public.asset_assignments.id;
CREATE TABLE IF NOT EXISTS public.assets (
    id integer NOT NULL,
    company_id integer NOT NULL,
    tag text NOT NULL,
    type text NOT NULL,
    category text NOT NULL,
    serial text NOT NULL,
    model text,
    manufacturer text,
    status text DEFAULT 'available'::text NOT NULL,
    condition text,
    assigned_to text,
    location text,
    vendor text,
    vendor_id integer,
    invoice_number text,
    purchase_date timestamp with time zone,
    warranty_expiry timestamp with time zone,
    cost text,
    depreciation_start_date timestamp with time zone,
    useful_life_years integer,
    depreciation_method text,
    description text,
    has_license boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);
CREATE SEQUENCE IF NOT EXISTS public.assets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.assets_id_seq OWNED BY public.assets.id;
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id integer NOT NULL,
    company_id integer,
    user_id integer,
    username text,
    action text NOT NULL,
    entity_type text NOT NULL,
    entity_id text,
    entity_label text,
    details jsonb,
    ip_address text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS public.audit_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.audit_logs_id_seq OWNED BY public.audit_logs.id;
CREATE TABLE IF NOT EXISTS public.backup_retention_settings (
    id integer NOT NULL,
    company_id integer NOT NULL,
    daily_keep_days integer DEFAULT 30 NOT NULL,
    weekly_keep_weeks integer DEFAULT 12 NOT NULL,
    monthly_keep_months integer DEFAULT 12 NOT NULL,
    financial_year_keep_forever boolean DEFAULT true NOT NULL,
    updated_by integer,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS public.backup_retention_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.backup_retention_settings_id_seq OWNED BY public.backup_retention_settings.id;
CREATE TABLE IF NOT EXISTS public.backup_schedules (
    id integer NOT NULL,
    company_id integer NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    frequency text NOT NULL,
    time_of_day text DEFAULT '23:00'::text NOT NULL,
    day_of_week integer,
    backup_type text DEFAULT 'accounting'::text NOT NULL,
    last_run_at timestamp with time zone,
    next_run_at timestamp with time zone,
    created_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS public.backup_schedules_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.backup_schedules_id_seq OWNED BY public.backup_schedules.id;
CREATE TABLE IF NOT EXISTS public.bank_opening_balances (
    id integer NOT NULL,
    company_id integer NOT NULL,
    financial_year_id integer NOT NULL,
    account_id integer,
    account_code text NOT NULL,
    account_name text NOT NULL,
    amount numeric(15,2) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS public.bank_opening_balances_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.bank_opening_balances_id_seq OWNED BY public.bank_opening_balances.id;
CREATE TABLE IF NOT EXISTS public.companies (
    id integer NOT NULL,
    name text NOT NULL,
    country text NOT NULL,
    address text,
    registration_no text,
    email text,
    phone text,
    logo_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    domain text,
    gst_reg_no text,
    slug text,
    database_name text,
    business_type text
);
CREATE SEQUENCE IF NOT EXISTS public.companies_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.companies_id_seq OWNED BY public.companies.id;
CREATE TABLE IF NOT EXISTS public.conversations (
    id integer NOT NULL,
    title text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS public.conversations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.conversations_id_seq OWNED BY public.conversations.id;
CREATE TABLE IF NOT EXISTS public.credit_notes (
    id integer NOT NULL,
    cn_number text NOT NULL,
    company_id integer DEFAULT 1 NOT NULL,
    customer_name text NOT NULL,
    customer_address text,
    contact_person text,
    contact_email text,
    ref_inv_number text,
    reason text,
    issue_date text,
    currency text DEFAULT 'SGD'::text NOT NULL,
    payment_terms text,
    notes text,
    is_private boolean DEFAULT false NOT NULL,
    items jsonb DEFAULT '[]'::jsonb NOT NULL,
    subtotal numeric(15,2) DEFAULT 0 NOT NULL,
    discount_amount numeric(15,2) DEFAULT 0 NOT NULL,
    tax_rate numeric(5,2) DEFAULT 9 NOT NULL,
    tax numeric(15,2) DEFAULT 0 NOT NULL,
    total_amount numeric(15,2) DEFAULT 0 NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    void_reason text,
    email_sent_to text,
    created_by integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    so_id integer,
    so_number text,
    terms_and_conditions text,
    delivery_instructions text,
    customer_note text,
    authorised_signature text
);
CREATE SEQUENCE IF NOT EXISTS public.credit_notes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.credit_notes_id_seq OWNED BY public.credit_notes.id;
CREATE TABLE IF NOT EXISTS public.customer_deposits (
    id integer NOT NULL,
    company_id integer NOT NULL,
    customer_name text NOT NULL,
    currency text DEFAULT 'SGD'::text NOT NULL,
    total_amount numeric(15,2) NOT NULL,
    applied_amount numeric(15,2) DEFAULT 0 NOT NULL,
    status text DEFAULT 'available'::text NOT NULL,
    payment_date text NOT NULL,
    payment_method text DEFAULT 'bank_transfer'::text,
    bank_ref text,
    notes text,
    journal_entry_id integer,
    created_by integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS public.customer_deposits_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.customer_deposits_id_seq OWNED BY public.customer_deposits.id;
CREATE TABLE IF NOT EXISTS public.customer_opening_balances (
    id integer NOT NULL,
    company_id integer NOT NULL,
    financial_year_id integer NOT NULL,
    customer_id integer,
    customer_name text NOT NULL,
    amount numeric(15,2) DEFAULT 0 NOT NULL,
    currency text DEFAULT 'SGD'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS public.customer_opening_balances_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.customer_opening_balances_id_seq OWNED BY public.customer_opening_balances.id;
CREATE TABLE IF NOT EXISTS public.customers (
    id integer NOT NULL,
    company_id integer NOT NULL,
    name text NOT NULL,
    address text,
    postal_code text,
    country text,
    contact_person text,
    contact_email text,
    phone text,
    currency text,
    gst_registered boolean DEFAULT false NOT NULL,
    gst_no text,
    ship_to_address text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    quotation_terms text,
    credit_limit_enabled boolean DEFAULT false NOT NULL,
    credit_limit numeric(15,2)
);
CREATE SEQUENCE IF NOT EXISTS public.customers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.customers_id_seq OWNED BY public.customers.id;
CREATE TABLE IF NOT EXISTS public.debit_notes (
    id integer NOT NULL,
    dn_number text NOT NULL,
    company_id integer DEFAULT 1 NOT NULL,
    customer_name text NOT NULL,
    customer_address text,
    contact_person text,
    contact_email text,
    ref_inv_number text,
    reason text,
    issue_date text,
    currency text DEFAULT 'SGD'::text NOT NULL,
    payment_terms text,
    notes text,
    is_private boolean DEFAULT false NOT NULL,
    items jsonb DEFAULT '[]'::jsonb NOT NULL,
    subtotal numeric(15,2) DEFAULT 0 NOT NULL,
    discount_amount numeric(15,2) DEFAULT 0 NOT NULL,
    tax_rate numeric(5,2) DEFAULT 9 NOT NULL,
    tax numeric(15,2) DEFAULT 0 NOT NULL,
    total_amount numeric(15,2) DEFAULT 0 NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    void_reason text,
    email_sent_to text,
    created_by integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    so_id integer,
    so_number text,
    terms_and_conditions text,
    delivery_instructions text,
    customer_note text,
    authorised_signature text,
    attachment_path text,
    attachment_name text
);
CREATE SEQUENCE IF NOT EXISTS public.debit_notes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.debit_notes_id_seq OWNED BY public.debit_notes.id;
CREATE TABLE IF NOT EXISTS public.delivery_orders (
    id integer NOT NULL,
    do_number text NOT NULL,
    company_id integer DEFAULT 1 NOT NULL,
    customer_name text NOT NULL,
    customer_address text,
    customer_contact text,
    issue_date text,
    delivery_date text,
    payment_terms text,
    notes text,
    is_private boolean DEFAULT false NOT NULL,
    items jsonb DEFAULT '[]'::jsonb NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    email_sent_to text,
    inv_id integer,
    inv_number text,
    created_by integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    so_id integer,
    so_number text,
    terms_and_conditions text,
    delivery_instructions text,
    customer_note text,
    authorised_signature text
);
CREATE SEQUENCE IF NOT EXISTS public.delivery_orders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.delivery_orders_id_seq OWNED BY public.delivery_orders.id;
CREATE TABLE IF NOT EXISTS public.dependents (
    id integer NOT NULL,
    company_id integer NOT NULL,
    employee_id integer NOT NULL,
    name text NOT NULL,
    relationship text NOT NULL,
    passport_number text,
    passport_expiry timestamp with time zone,
    visa_number text,
    visa_expiry timestamp with time zone,
    visa_type text,
    created_at timestamp with time zone DEFAULT now()
);
CREATE SEQUENCE IF NOT EXISTS public.dependents_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.dependents_id_seq OWNED BY public.dependents.id;
CREATE TABLE IF NOT EXISTS public.email_contacts (
    id integer NOT NULL,
    company_id integer NOT NULL,
    name text,
    email text NOT NULL,
    use_count integer DEFAULT 1 NOT NULL,
    last_used_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS public.email_contacts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.email_contacts_id_seq OWNED BY public.email_contacts.id;
CREATE TABLE IF NOT EXISTS public.employee_documents (
    id integer NOT NULL,
    company_id integer NOT NULL,
    employee_id integer NOT NULL,
    document_type text NOT NULL,
    file_path text NOT NULL,
    issue_date timestamp with time zone,
    expiry_date timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT now()
);
CREATE SEQUENCE IF NOT EXISTS public.employee_documents_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.employee_documents_id_seq OWNED BY public.employee_documents.id;
CREATE TABLE IF NOT EXISTS public.employee_payroll (
    id integer NOT NULL,
    company_id integer NOT NULL,
    employee_id integer NOT NULL,
    base_salary numeric(10,2) NOT NULL,
    payroll_period text DEFAULT 'monthly'::text NOT NULL,
    cpf_employee_rate numeric(5,2),
    cpf_employer_rate numeric(5,2),
    allowances jsonb DEFAULT '[]'::jsonb,
    deductions jsonb DEFAULT '[]'::jsonb,
    bank_name text,
    bank_account text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    hourly_rate numeric(8,2),
    overtime_rate numeric(8,2),
    no_of_working_days integer,
    tax_rate numeric(5,2) DEFAULT 0,
    cpf_rate numeric(5,2),
    cpf_amount numeric(12,2),
    employer_cpf_rate numeric(5,2),
    employer_cpf_amount numeric(12,2),
    net_salary numeric(12,2),
    effective_from date,
    effective_to date
);
CREATE SEQUENCE IF NOT EXISTS public.employee_payroll_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.employee_payroll_id_seq OWNED BY public.employee_payroll.id;
CREATE TABLE IF NOT EXISTS public.employees (
    id integer NOT NULL,
    company_id integer NOT NULL,
    employee_id text NOT NULL,
    user_id integer,
    name text NOT NULL,
    email text NOT NULL,
    phone text NOT NULL,
    address text NOT NULL,
    department text NOT NULL,
    designation text NOT NULL,
    join_date timestamp with time zone NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    salary text,
    annual_salary text,
    nationality text,
    pr_status text,
    date_of_birth timestamp with time zone,
    passport_number text,
    passport_expiry timestamp with time zone,
    visa_number text,
    visa_expiry timestamp with time zone,
    visa_type text,
    visa_remarks text,
    nric_number text,
    nric_expiry timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    passport_scan text,
    visa_scan text,
    nric_scan text,
    gender text
);
CREATE SEQUENCE IF NOT EXISTS public.employees_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.employees_id_seq OWNED BY public.employees.id;
CREATE TABLE IF NOT EXISTS public.expenses (
    id integer NOT NULL,
    company_id integer NOT NULL,
    expense_date text NOT NULL,
    vendor_name text NOT NULL,
    description text NOT NULL,
    category text NOT NULL,
    amount numeric(15,2) NOT NULL,
    gst_amount numeric(15,2) DEFAULT 0 NOT NULL,
    gst_claimable boolean DEFAULT false NOT NULL,
    is_deductible boolean DEFAULT true NOT NULL,
    deductible_pct integer DEFAULT 100 NOT NULL,
    currency text DEFAULT 'SGD'::text NOT NULL,
    payment_method text DEFAULT 'bank_transfer'::text,
    receipt_data text,
    receipt_mime_type text,
    vendor_id integer,
    project_id integer,
    voucher_id integer,
    journal_entry_id integer,
    status text DEFAULT 'draft'::text NOT NULL,
    notes text,
    created_by integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    account_id integer
);
CREATE SEQUENCE IF NOT EXISTS public.expenses_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.expenses_id_seq OWNED BY public.expenses.id;
CREATE TABLE IF NOT EXISTS public.financial_years (
    id integer NOT NULL,
    company_id integer NOT NULL,
    label text NOT NULL,
    start_date text NOT NULL,
    end_date text NOT NULL,
    status text DEFAULT 'inactive'::text NOT NULL,
    audit_status text DEFAULT 'pending'::text NOT NULL,
    closed_at timestamp with time zone,
    closed_by integer,
    closed_by_username text,
    activated_at timestamp with time zone,
    activated_by integer,
    activated_by_username text,
    reopened_at timestamp with time zone,
    reopened_by integer,
    opening_balances_generated boolean DEFAULT false NOT NULL,
    opening_journal_entry_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS public.financial_years_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.financial_years_id_seq OWNED BY public.financial_years.id;
CREATE TABLE IF NOT EXISTS public.fixed_asset_opening_balances (
    id integer NOT NULL,
    company_id integer NOT NULL,
    financial_year_id integer NOT NULL,
    account_code text,
    description text NOT NULL,
    amount numeric(15,2) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS public.fixed_asset_opening_balances_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.fixed_asset_opening_balances_id_seq OWNED BY public.fixed_asset_opening_balances.id;
CREATE TABLE IF NOT EXISTS public.goods_issue_items (
    id integer NOT NULL,
    goods_issue_id integer NOT NULL,
    stock_item_id integer NOT NULL,
    quantity numeric(15,3) NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS public.goods_issue_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.goods_issue_items_id_seq OWNED BY public.goods_issue_items.id;
CREATE TABLE IF NOT EXISTS public.goods_issues (
    id integer NOT NULL,
    company_id integer NOT NULL,
    gin_number text NOT NULL,
    warehouse_id integer NOT NULL,
    reason text,
    issue_date date NOT NULL,
    remarks text,
    status text DEFAULT 'posted'::text NOT NULL,
    created_by integer,
    updated_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS public.goods_issues_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.goods_issues_id_seq OWNED BY public.goods_issues.id;
CREATE TABLE IF NOT EXISTS public.goods_receipt_items (
    id integer NOT NULL,
    goods_receipt_id integer NOT NULL,
    stock_item_id integer NOT NULL,
    quantity numeric(15,3) NOT NULL,
    unit_cost numeric(15,2) DEFAULT 0
);
CREATE SEQUENCE IF NOT EXISTS public.goods_receipt_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.goods_receipt_items_id_seq OWNED BY public.goods_receipt_items.id;
CREATE TABLE IF NOT EXISTS public.goods_receipts (
    id integer NOT NULL,
    company_id integer NOT NULL,
    grn_number text NOT NULL,
    warehouse_id integer NOT NULL,
    supplier text,
    reference_number text,
    receipt_date date NOT NULL,
    remarks text,
    status text DEFAULT 'posted'::text NOT NULL,
    created_by integer,
    updated_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS public.goods_receipts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.goods_receipts_id_seq OWNED BY public.goods_receipts.id;
CREATE TABLE IF NOT EXISTS public.grn (
    id integer NOT NULL,
    grn_number text NOT NULL,
    po_id integer,
    po_number text NOT NULL,
    vendor_name text NOT NULL,
    company_id integer DEFAULT 1 NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    items jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_by integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS public.grn_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.grn_id_seq OWNED BY public.grn.id;
CREATE TABLE IF NOT EXISTS public.income_attachments (
    id integer NOT NULL,
    income_id integer NOT NULL,
    file_name text DEFAULT 'attachment'::text NOT NULL,
    mime_type text DEFAULT 'application/octet-stream'::text NOT NULL,
    file_data text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS public.income_attachments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.income_attachments_id_seq OWNED BY public.income_attachments.id;
CREATE TABLE IF NOT EXISTS public.income_records (
    id integer NOT NULL,
    company_id integer NOT NULL,
    income_date text NOT NULL,
    payer_name text NOT NULL,
    description text NOT NULL,
    category text NOT NULL,
    amount numeric(15,2) NOT NULL,
    gst_amount numeric(15,2) DEFAULT 0 NOT NULL,
    gst_treatment text DEFAULT 'standard_rated'::text NOT NULL,
    currency text DEFAULT 'SGD'::text NOT NULL,
    exchange_rate numeric(10,6) DEFAULT 1.000000 NOT NULL,
    payment_method text DEFAULT 'bank_transfer'::text,
    account_id integer,
    reference text,
    notes text,
    status text DEFAULT 'draft'::text NOT NULL,
    journal_entry_id integer,
    created_by integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    gst_claimable boolean DEFAULT false NOT NULL,
    is_deductible boolean DEFAULT true NOT NULL,
    deductible_pct integer DEFAULT 100 NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS public.income_records_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.income_records_id_seq OWNED BY public.income_records.id;
CREATE TABLE IF NOT EXISTS public.inventory_opening_balances (
    id integer NOT NULL,
    company_id integer NOT NULL,
    financial_year_id integer NOT NULL,
    stock_item_id integer,
    item_code text,
    item_name text NOT NULL,
    warehouse_id integer,
    warehouse_name text,
    quantity numeric(15,4) DEFAULT 0 NOT NULL,
    value numeric(15,2) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS public.inventory_opening_balances_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.inventory_opening_balances_id_seq OWNED BY public.inventory_opening_balances.id;
CREATE TABLE IF NOT EXISTS public.invoice_payments (
    id integer NOT NULL,
    company_id integer NOT NULL,
    invoice_id integer NOT NULL,
    payment_date text NOT NULL,
    amount numeric(15,2) NOT NULL,
    reference text,
    payment_method text DEFAULT 'bank_transfer'::text,
    notes text,
    created_by integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS public.invoice_payments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.invoice_payments_id_seq OWNED BY public.invoice_payments.id;
CREATE TABLE IF NOT EXISTS public.invoices (
    id integer NOT NULL,
    inv_number text NOT NULL,
    company_id integer DEFAULT 1 NOT NULL,
    customer_name text NOT NULL,
    customer_address text,
    customer_contact text,
    customer_contact_email text,
    delivery_address text,
    issue_date text,
    delivery_date text,
    payment_terms text,
    notes text,
    is_private boolean DEFAULT false NOT NULL,
    items jsonb DEFAULT '[]'::jsonb NOT NULL,
    subtotal numeric(15,2) DEFAULT 0 NOT NULL,
    discount_amount numeric(15,2) DEFAULT 0 NOT NULL,
    tax numeric(15,2) DEFAULT 0 NOT NULL,
    total_amount numeric(15,2) DEFAULT 0 NOT NULL,
    currency text DEFAULT 'SGD'::text NOT NULL,
    po_ref_no text,
    status text DEFAULT 'draft'::text NOT NULL,
    email_sent_to text,
    void_reason text,
    created_by integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    exchange_rate numeric(10,6) DEFAULT 1.000000 NOT NULL,
    so_id integer,
    so_number text,
    sales_person text,
    terms_and_conditions text,
    delivery_instructions text,
    customer_note text,
    authorised_signature text,
    is_modified boolean DEFAULT false NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS public.invoices_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.invoices_id_seq OWNED BY public.invoices.id;
CREATE TABLE IF NOT EXISTS public.ir8a_employers (
    id integer NOT NULL,
    company_id integer NOT NULL,
    employer_name text NOT NULL,
    uen text NOT NULL,
    address text NOT NULL,
    signatory_name text NOT NULL,
    designation text NOT NULL,
    declaration_date date,
    signature text,
    created_at timestamp with time zone DEFAULT now()
);
CREATE SEQUENCE IF NOT EXISTS public.ir8a_employers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.ir8a_employers_id_seq OWNED BY public.ir8a_employers.id;
CREATE TABLE IF NOT EXISTS public.journal_entries (
    id integer NOT NULL,
    company_id integer NOT NULL,
    entry_date text NOT NULL,
    description text NOT NULL,
    ref_type text,
    ref_id integer,
    ref_number text,
    status text DEFAULT 'posted'::text NOT NULL,
    reversal_of_id integer,
    created_by integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS public.journal_entries_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.journal_entries_id_seq OWNED BY public.journal_entries.id;
CREATE TABLE IF NOT EXISTS public.journal_lines (
    id integer NOT NULL,
    journal_entry_id integer NOT NULL,
    account_id integer NOT NULL,
    description text,
    debit numeric(15,2) DEFAULT 0 NOT NULL,
    credit numeric(15,2) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS public.journal_lines_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.journal_lines_id_seq OWNED BY public.journal_lines.id;
CREATE TABLE IF NOT EXISTS public.licenses (
    id integer NOT NULL,
    company_id integer NOT NULL,
    asset_id integer,
    name text NOT NULL,
    license_key text NOT NULL,
    type text NOT NULL,
    seats integer DEFAULT 1,
    vendor_id integer,
    purchase_date timestamp with time zone,
    expiry_date timestamp with time zone,
    cost text,
    renewal_cycle text DEFAULT 'none'::text,
    status text DEFAULT 'active'::text,
    notes text,
    created_at timestamp with time zone DEFAULT now()
);
CREATE SEQUENCE IF NOT EXISTS public.licenses_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.licenses_id_seq OWNED BY public.licenses.id;
CREATE TABLE IF NOT EXISTS public.login_credentials (
    user_id integer NOT NULL,
    password_hash text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.maintenance (
    id integer NOT NULL,
    is_enabled boolean DEFAULT false NOT NULL,
    scheduled_start text,
    scheduled_end text,
    message text,
    contact_email text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by_user text
);
CREATE SEQUENCE IF NOT EXISTS public.maintenance_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.maintenance_id_seq OWNED BY public.maintenance.id;
CREATE TABLE IF NOT EXISTS public.maintenance_records (
    id integer NOT NULL,
    company_id integer NOT NULL,
    asset_id integer NOT NULL,
    issue_description text NOT NULL,
    resolution text,
    service_date timestamp with time zone NOT NULL,
    next_maintenance_date timestamp with time zone,
    cost text,
    created_at timestamp with time zone DEFAULT now()
);
CREATE SEQUENCE IF NOT EXISTS public.maintenance_records_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.maintenance_records_id_seq OWNED BY public.maintenance_records.id;
CREATE TABLE IF NOT EXISTS public.messages (
    id integer NOT NULL,
    conversation_id integer NOT NULL,
    role text NOT NULL,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS public.messages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.messages_id_seq OWNED BY public.messages.id;
CREATE TABLE IF NOT EXISTS public.opening_balances (
    id integer NOT NULL,
    company_id integer NOT NULL,
    financial_year_id integer NOT NULL,
    account_id integer,
    account_code text NOT NULL,
    account_name text NOT NULL,
    account_type text,
    debit numeric(15,2) DEFAULT 0 NOT NULL,
    credit numeric(15,2) DEFAULT 0 NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS public.opening_balances_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.opening_balances_id_seq OWNED BY public.opening_balances.id;
CREATE TABLE IF NOT EXISTS public.opening_stock (
    id integer NOT NULL,
    company_id integer NOT NULL,
    warehouse_id integer NOT NULL,
    stock_item_id integer NOT NULL,
    quantity numeric(15,3) NOT NULL,
    unit_cost numeric(15,2) DEFAULT 0,
    entry_date date NOT NULL,
    remarks text,
    created_by integer,
    updated_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS public.opening_stock_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.opening_stock_id_seq OWNED BY public.opening_stock.id;
CREATE TABLE IF NOT EXISTS public.ops_asset_assignments (
    id integer NOT NULL,
    company_id integer NOT NULL,
    asset_id integer NOT NULL,
    employee_id integer NOT NULL,
    date_assigned text,
    date_returned text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS public.ops_asset_assignments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.ops_asset_assignments_id_seq OWNED BY public.ops_asset_assignments.id;
CREATE TABLE IF NOT EXISTS public.ops_assets (
    id integer NOT NULL,
    company_id integer NOT NULL,
    tag text NOT NULL,
    type text NOT NULL,
    category text DEFAULT 'hardware'::text NOT NULL,
    serial text,
    model text,
    manufacturer text,
    status text DEFAULT 'available'::text NOT NULL,
    condition text,
    assigned_to text,
    location text,
    vendor text,
    purchase_date text,
    warranty_expiry text,
    cost text,
    description text,
    has_license boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS public.ops_assets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.ops_assets_id_seq OWNED BY public.ops_assets.id;
CREATE TABLE IF NOT EXISTS public.ops_company_documents (
    id integer NOT NULL,
    company_id integer NOT NULL,
    document_type text DEFAULT 'other'::text NOT NULL,
    title text NOT NULL,
    file_path text,
    issue_date text,
    expiry_date text,
    notes text,
    uploaded_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS public.ops_company_documents_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.ops_company_documents_id_seq OWNED BY public.ops_company_documents.id;
CREATE TABLE IF NOT EXISTS public.ops_employee_payroll (
    id integer NOT NULL,
    company_id integer NOT NULL,
    employee_id integer NOT NULL,
    base_salary numeric(15,2) DEFAULT 0 NOT NULL,
    allowances jsonb DEFAULT '{}'::jsonb,
    deductions jsonb DEFAULT '{}'::jsonb,
    currency text DEFAULT 'SGD'::text NOT NULL,
    pay_frequency text DEFAULT 'monthly'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS public.ops_employee_payroll_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.ops_employee_payroll_id_seq OWNED BY public.ops_employee_payroll.id;
CREATE TABLE IF NOT EXISTS public.ops_employees (
    id integer NOT NULL,
    company_id integer NOT NULL,
    employee_code text NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    phone text,
    address text,
    department text,
    designation text,
    join_date text,
    status text DEFAULT 'active'::text NOT NULL,
    salary text,
    nationality text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS public.ops_employees_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.ops_employees_id_seq OWNED BY public.ops_employees.id;
CREATE TABLE IF NOT EXISTS public.ops_licenses (
    id integer NOT NULL,
    company_id integer NOT NULL,
    asset_id integer,
    name text NOT NULL,
    license_key text NOT NULL,
    type text DEFAULT 'perpetual'::text NOT NULL,
    seats integer DEFAULT 1,
    purchase_date text,
    expiry_date text,
    cost text,
    renewal_cycle text DEFAULT 'none'::text,
    status text DEFAULT 'active'::text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS public.ops_licenses_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.ops_licenses_id_seq OWNED BY public.ops_licenses.id;
CREATE TABLE IF NOT EXISTS public.ops_payroll_records (
    id integer NOT NULL,
    company_id integer NOT NULL,
    employee_id integer NOT NULL,
    payroll_config_id integer,
    period_start text NOT NULL,
    period_end text NOT NULL,
    gross_pay numeric(15,2) DEFAULT 0 NOT NULL,
    net_pay numeric(15,2) DEFAULT 0 NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS public.ops_payroll_records_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.ops_payroll_records_id_seq OWNED BY public.ops_payroll_records.id;
CREATE TABLE IF NOT EXISTS public.ops_tasks (
    id integer NOT NULL,
    company_id integer NOT NULL,
    title text NOT NULL,
    description text,
    status text DEFAULT 'todo'::text NOT NULL,
    priority text DEFAULT 'medium'::text NOT NULL,
    assignee_id integer,
    start_date text,
    due_date text,
    event_type text DEFAULT 'task'::text,
    created_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS public.ops_tasks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.ops_tasks_id_seq OWNED BY public.ops_tasks.id;
CREATE TABLE IF NOT EXISTS public.payroll_records (
    id integer NOT NULL,
    company_id integer NOT NULL,
    employee_id integer NOT NULL,
    payroll_config_id integer,
    pay_period_start timestamp with time zone NOT NULL,
    pay_period_end timestamp with time zone NOT NULL,
    gross_pay numeric(12,2) NOT NULL,
    net_pay numeric(12,2) NOT NULL,
    cpf_employee numeric(12,2) DEFAULT 0,
    cpf_employer numeric(12,2) DEFAULT 0,
    status text DEFAULT 'draft'::text NOT NULL,
    processed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    base_salary numeric(10,2),
    overtime_hours numeric(6,2) DEFAULT 0,
    overtime_pay numeric(10,2) DEFAULT 0,
    allowances jsonb DEFAULT '{}'::jsonb,
    deductions jsonb DEFAULT '{}'::jsonb,
    notes text,
    updated_at timestamp with time zone DEFAULT now(),
    payroll_month integer,
    payroll_year integer
);
CREATE SEQUENCE IF NOT EXISTS public.payroll_records_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.payroll_records_id_seq OWNED BY public.payroll_records.id;
CREATE TABLE IF NOT EXISTS public.permissions (
    id integer NOT NULL,
    module text NOT NULL,
    action text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS public.permissions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.permissions_id_seq OWNED BY public.permissions.id;
CREATE TABLE IF NOT EXISTS public.pos_sales (
    id text NOT NULL,
    company_id integer NOT NULL,
    channel text DEFAULT 'retail'::text NOT NULL,
    pos_number text NOT NULL,
    sales_person_id integer,
    sales_person_name text,
    created_by integer,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.proforma_invoices (
    id integer NOT NULL,
    pi_number text NOT NULL,
    company_id integer DEFAULT 1 NOT NULL,
    customer_name text NOT NULL,
    customer_address text,
    customer_contact text,
    customer_contact_email text,
    delivery_address text,
    issue_date text,
    delivery_date text,
    payment_terms text,
    notes text,
    is_private boolean DEFAULT false NOT NULL,
    items jsonb DEFAULT '[]'::jsonb NOT NULL,
    subtotal numeric(15,2) DEFAULT 0 NOT NULL,
    discount_amount numeric(15,2) DEFAULT 0 NOT NULL,
    tax numeric(15,2) DEFAULT 0 NOT NULL,
    total_amount numeric(15,2) DEFAULT 0 NOT NULL,
    currency text DEFAULT 'SGD'::text NOT NULL,
    qt_ref_no text,
    status text DEFAULT 'draft'::text NOT NULL,
    email_sent_to text,
    created_by integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    terms_and_conditions text,
    delivery_instructions text,
    customer_note text,
    authorised_signature text
);
CREATE SEQUENCE IF NOT EXISTS public.proforma_invoices_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.proforma_invoices_id_seq OWNED BY public.proforma_invoices.id;
CREATE TABLE IF NOT EXISTS public.projects (
    id integer NOT NULL,
    company_id integer NOT NULL,
    name text NOT NULL,
    code text,
    description text,
    status text DEFAULT 'active'::text NOT NULL,
    budget numeric(15,2),
    start_date text,
    end_date text,
    created_by integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS public.projects_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.projects_id_seq OWNED BY public.projects.id;
CREATE TABLE IF NOT EXISTS public.purchase_orders (
    id integer NOT NULL,
    po_number text NOT NULL,
    company_id integer DEFAULT 1 NOT NULL,
    vendor_name text NOT NULL,
    vendor_address text,
    vendor_contact text,
    vendor_contact_email text,
    delivery_address text,
    issue_date text,
    delivery_date text,
    payment_terms text,
    quote_ref_no text,
    notes text,
    is_private boolean DEFAULT false NOT NULL,
    items jsonb DEFAULT '[]'::jsonb NOT NULL,
    subtotal numeric(15,2) DEFAULT 0 NOT NULL,
    tax numeric(15,2) DEFAULT 0 NOT NULL,
    total_amount numeric(15,2) DEFAULT 0 NOT NULL,
    currency text DEFAULT 'SGD'::text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    customer_id integer,
    customer_po_ref text,
    email_sent_to text,
    ack_token text,
    ack_at text,
    ack_note text,
    created_by integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    attachment_path text,
    attachment_name text
);
CREATE SEQUENCE IF NOT EXISTS public.purchase_orders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.purchase_orders_id_seq OWNED BY public.purchase_orders.id;
CREATE TABLE IF NOT EXISTS public.purchase_quotations (
    id integer NOT NULL,
    pq_number text NOT NULL,
    company_id integer DEFAULT 1 NOT NULL,
    vendor_name text NOT NULL,
    vendor_address text,
    vendor_contact text,
    vendor_contact_email text,
    delivery_address text,
    issue_date text,
    delivery_date text,
    payment_terms text,
    notes text,
    is_private boolean DEFAULT false NOT NULL,
    items jsonb DEFAULT '[]'::jsonb NOT NULL,
    subtotal numeric(15,2) DEFAULT 0 NOT NULL,
    discount_amount numeric(15,2) DEFAULT 0 NOT NULL,
    tax numeric(15,2) DEFAULT 0 NOT NULL,
    total_amount numeric(15,2) DEFAULT 0 NOT NULL,
    currency text DEFAULT 'SGD'::text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    email_sent_to text,
    converted_po_id integer,
    converted_po_number text,
    created_by integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS public.purchase_quotations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.purchase_quotations_id_seq OWNED BY public.purchase_quotations.id;
CREATE TABLE IF NOT EXISTS public.quotations (
    id integer NOT NULL,
    qt_number text NOT NULL,
    company_id integer DEFAULT 1 NOT NULL,
    customer_name text NOT NULL,
    customer_address text,
    customer_contact text,
    customer_contact_email text,
    delivery_address text,
    issue_date text,
    delivery_date text,
    payment_terms text,
    notes text,
    is_private boolean DEFAULT false NOT NULL,
    items jsonb DEFAULT '[]'::jsonb NOT NULL,
    subtotal numeric(15,2) DEFAULT 0 NOT NULL,
    discount_amount numeric(15,2) DEFAULT 0 NOT NULL,
    tax numeric(15,2) DEFAULT 0 NOT NULL,
    total_amount numeric(15,2) DEFAULT 0 NOT NULL,
    currency text DEFAULT 'SGD'::text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    email_sent_to text,
    created_by integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    terms_and_conditions text,
    delivery_instructions text,
    customer_note text,
    authorised_signature text,
    valid_until text,
    sales_person text
);
CREATE SEQUENCE IF NOT EXISTS public.quotations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.quotations_id_seq OWNED BY public.quotations.id;
CREATE TABLE IF NOT EXISTS public.report_definitions (
    id integer NOT NULL,
    module text NOT NULL,
    report_type text NOT NULL,
    name text NOT NULL,
    description text,
    is_system boolean DEFAULT true NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS public.report_definitions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.report_definitions_id_seq OWNED BY public.report_definitions.id;
CREATE TABLE IF NOT EXISTS public.report_fields (
    id integer NOT NULL,
    report_definition_id integer NOT NULL,
    field_key text NOT NULL,
    field_label text NOT NULL,
    field_group text NOT NULL,
    data_type text DEFAULT 'string'::text NOT NULL,
    is_repeatable boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS public.report_fields_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.report_fields_id_seq OWNED BY public.report_fields.id;
CREATE TABLE IF NOT EXISTS public.report_templates (
    id integer NOT NULL,
    company_id integer,
    report_definition_id integer NOT NULL,
    name text NOT NULL,
    description text,
    template_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    is_system_template boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT false NOT NULL,
    created_by integer,
    updated_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS public.report_templates_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.report_templates_id_seq OWNED BY public.report_templates.id;
CREATE TABLE IF NOT EXISTS public.role_permissions (
    role_id integer NOT NULL,
    permission_id integer NOT NULL
);
CREATE TABLE IF NOT EXISTS public.roles (
    id integer NOT NULL,
    name text NOT NULL,
    company_id integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS public.roles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.roles_id_seq OWNED BY public.roles.id;
CREATE TABLE IF NOT EXISTS public.sales_orders (
    id integer NOT NULL,
    so_number text NOT NULL,
    company_id integer DEFAULT 1 NOT NULL,
    qt_id integer,
    qt_number text,
    customer_name text NOT NULL,
    customer_address text,
    customer_contact text,
    customer_contact_email text,
    delivery_address text,
    issue_date text,
    delivery_date text,
    payment_terms text,
    notes text,
    is_private boolean DEFAULT false NOT NULL,
    items jsonb DEFAULT '[]'::jsonb NOT NULL,
    subtotal numeric(15,2) DEFAULT 0 NOT NULL,
    discount_amount numeric(15,2) DEFAULT 0 NOT NULL,
    tax numeric(15,2) DEFAULT 0 NOT NULL,
    total_amount numeric(15,2) DEFAULT 0 NOT NULL,
    currency text DEFAULT 'SGD'::text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    email_sent_to text,
    created_by integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    inv_id integer,
    inv_number text,
    do_id integer,
    do_number text,
    terms_and_conditions text,
    delivery_instructions text,
    customer_note text,
    authorised_signature text,
    attachment_path text,
    attachment_name text
);
CREATE SEQUENCE IF NOT EXISTS public.sales_orders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.sales_orders_id_seq OWNED BY public.sales_orders.id;
CREATE TABLE IF NOT EXISTS public.sales_persons (
    id integer NOT NULL,
    company_id integer NOT NULL,
    name text NOT NULL,
    employment_code text NOT NULL,
    password_hash text DEFAULT ''::text NOT NULL,
    department text DEFAULT ''::text NOT NULL,
    phone text DEFAULT ''::text NOT NULL,
    country text DEFAULT 'Singapore'::text NOT NULL,
    address text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS public.sales_persons_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.sales_persons_id_seq OWNED BY public.sales_persons.id;
CREATE TABLE IF NOT EXISTS public.service_reports (
    id integer NOT NULL,
    company_id integer NOT NULL,
    csr_number text NOT NULL,
    customer_id integer,
    customer_name text NOT NULL,
    customer_address text,
    customer_contact_person text,
    customer_phone text,
    customer_email text,
    support_requested_by text NOT NULL,
    support_request_date timestamp with time zone NOT NULL,
    problem_description text NOT NULL,
    engineer_id integer,
    service_date timestamp with time zone NOT NULL,
    service_time text NOT NULL,
    hours_charged numeric(4,2) NOT NULL,
    service_details text NOT NULL,
    remarks text,
    priority_level text DEFAULT 'medium'::text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    created_by integer,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);
CREATE SEQUENCE IF NOT EXISTS public.service_reports_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.service_reports_id_seq OWNED BY public.service_reports.id;
CREATE TABLE IF NOT EXISTS public.session (
    sid character varying NOT NULL,
    sess json NOT NULL,
    expire timestamp(6) without time zone NOT NULL
);
CREATE TABLE IF NOT EXISTS public.settings (
    id integer NOT NULL,
    company_id integer,
    gst_rate numeric(5,2) DEFAULT 9 NOT NULL,
    smtp_host text,
    smtp_port text,
    smtp_user text,
    smtp_pass text,
    smtp_from text,
    po_prefix text DEFAULT 'PO'::text,
    po_counter integer DEFAULT 1 NOT NULL,
    po_suffix text DEFAULT ''::text,
    inv_prefix text DEFAULT 'INV'::text,
    inv_counter integer DEFAULT 1 NOT NULL,
    inv_suffix text DEFAULT ''::text,
    qt_prefix text DEFAULT 'QT'::text,
    qt_counter integer DEFAULT 1 NOT NULL,
    qt_suffix text DEFAULT ''::text,
    do_prefix text DEFAULT 'DO'::text,
    do_counter integer DEFAULT 1 NOT NULL,
    do_suffix text DEFAULT ''::text,
    grn_prefix text DEFAULT 'GRN'::text,
    grn_counter integer DEFAULT 1 NOT NULL,
    grn_suffix text DEFAULT ''::text,
    cn_prefix text DEFAULT 'CN'::text,
    cn_counter integer DEFAULT 1 NOT NULL,
    cn_suffix text DEFAULT ''::text,
    pi_prefix text DEFAULT 'PI'::text,
    pi_counter integer DEFAULT 1 NOT NULL,
    pi_suffix text DEFAULT ''::text,
    pv_prefix text DEFAULT 'PV'::text,
    pv_counter integer DEFAULT 1 NOT NULL,
    pv_suffix text DEFAULT ''::text,
    allow_negative_stock boolean DEFAULT false NOT NULL,
    auto_deduct_on_do boolean DEFAULT false NOT NULL,
    low_stock_warning numeric(15,3) DEFAULT 0,
    default_uom text DEFAULT 'pcs'::text,
    bank_details text,
    terms_and_conditions text,
    quotation_terms text,
    default_verifier_id integer,
    default_approver_id integer,
    default_paid_by_id integer,
    igr_prefix text DEFAULT 'IGR'::text,
    igr_counter integer DEFAULT 1,
    igr_suffix text DEFAULT ''::text,
    gin_prefix text DEFAULT 'GIN'::text,
    gin_counter integer DEFAULT 1,
    gin_suffix text DEFAULT ''::text,
    st_prefix text DEFAULT 'ST'::text,
    st_counter integer DEFAULT 1,
    st_suffix text DEFAULT ''::text,
    sa_prefix text DEFAULT 'SA'::text,
    sa_counter integer DEFAULT 1,
    sa_suffix text DEFAULT ''::text,
    si_prefix text DEFAULT 'STK'::text,
    si_counter integer DEFAULT 1,
    si_suffix text DEFAULT ''::text,
    dn_prefix text DEFAULT 'DN'::text NOT NULL,
    dn_counter integer DEFAULT 1 NOT NULL,
    dn_suffix text DEFAULT ''::text NOT NULL,
    so_prefix text DEFAULT 'SO'::text,
    so_counter integer DEFAULT 0 NOT NULL,
    so_suffix text DEFAULT ''::text,
    pq_prefix text DEFAULT 'PQ'::text,
    pq_counter integer DEFAULT 0 NOT NULL,
    pq_suffix text DEFAULT ''::text,
    fa_prefix text DEFAULT 'FA'::text,
    fa_counter integer DEFAULT 0 NOT NULL,
    fa_suffix text DEFAULT ''::text,
    bc_prefix text DEFAULT 'BC'::text,
    bc_counter integer DEFAULT 0,
    bc_suffix text DEFAULT ''::text,
    vpi_prefix text DEFAULT 'VPI'::text,
    vpi_counter integer DEFAULT 0 NOT NULL,
    vpi_suffix text DEFAULT ''::text
);
CREATE SEQUENCE IF NOT EXISTS public.settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.settings_id_seq OWNED BY public.settings.id;
CREATE TABLE IF NOT EXISTS public.stock_adjustments (
    id integer NOT NULL,
    company_id integer NOT NULL,
    adjustment_number text NOT NULL,
    warehouse_id integer NOT NULL,
    stock_item_id integer NOT NULL,
    adjustment_type text NOT NULL,
    reason text,
    current_quantity numeric(15,3) NOT NULL,
    actual_quantity numeric(15,3) NOT NULL,
    difference numeric(15,3) NOT NULL,
    remarks text,
    adjustment_date date NOT NULL,
    created_by integer,
    updated_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS public.stock_adjustments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.stock_adjustments_id_seq OWNED BY public.stock_adjustments.id;
CREATE TABLE IF NOT EXISTS public.stock_item_purchase_prices (
    id integer NOT NULL,
    company_id integer NOT NULL,
    stock_item_id integer NOT NULL,
    purchase_price numeric(15,2) DEFAULT 0 NOT NULL,
    quantity numeric(15,3) DEFAULT 0 NOT NULL,
    effective_date text NOT NULL,
    source_type text DEFAULT 'item_master'::text NOT NULL,
    source_id integer,
    source_ref text,
    notes text,
    created_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS public.stock_item_purchase_prices_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.stock_item_purchase_prices_id_seq OWNED BY public.stock_item_purchase_prices.id;
CREATE TABLE IF NOT EXISTS public.stock_items (
    id integer NOT NULL,
    company_id integer NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    description text,
    uom text DEFAULT 'pcs'::text NOT NULL,
    type text DEFAULT 'product'::text NOT NULL,
    unit_price numeric(15,2) DEFAULT 0,
    stock_qty numeric(15,3) DEFAULT 0,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    min_stock_level numeric(15,3) DEFAULT 0,
    reorder_level numeric(15,3) DEFAULT 0,
    max_stock_level numeric(15,3) DEFAULT 0,
    created_by integer,
    updated_by integer,
    updated_at timestamp with time zone DEFAULT now(),
    batch_no text,
    mrp_price numeric(15,2) DEFAULT 0,
    alternate_uom text,
    alternate_qty numeric(15,4) DEFAULT 0,
    main_qty numeric(15,4) DEFAULT 0,
    is_weight_based boolean DEFAULT false NOT NULL,
    category text,
    sub_category text,
    brand text,
    barcode text,
    sales_person text,
    item_image text,
    purchase_price numeric(15,2) DEFAULT 0,
    track_inventory boolean DEFAULT true NOT NULL,
    show_in_pos boolean DEFAULT true NOT NULL,
    pricing_method text DEFAULT 'fixed'::text,
    tax_percent numeric(5,2) DEFAULT 9,
    expiry_date text,
    manufacturing_date text,
    batches_json text,
    stock_group text
);
CREATE SEQUENCE IF NOT EXISTS public.stock_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.stock_items_id_seq OWNED BY public.stock_items.id;
CREATE TABLE IF NOT EXISTS public.stock_movements (
    id integer NOT NULL,
    company_id integer NOT NULL,
    warehouse_id integer NOT NULL,
    stock_item_id integer NOT NULL,
    transaction_type text NOT NULL,
    document_number text,
    reference_type text,
    reference_id integer,
    quantity_in numeric(15,3) DEFAULT 0 NOT NULL,
    quantity_out numeric(15,3) DEFAULT 0 NOT NULL,
    balance numeric(15,3) NOT NULL,
    reference text,
    user_id integer,
    username text,
    movement_date timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS public.stock_movements_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.stock_movements_id_seq OWNED BY public.stock_movements.id;
CREATE TABLE IF NOT EXISTS public.stock_serials (
    id integer NOT NULL,
    company_id integer NOT NULL,
    stock_item_id integer NOT NULL,
    serial_number text NOT NULL,
    status text DEFAULT 'available'::text NOT NULL,
    grn_id integer,
    grn_number text,
    invoice_id integer,
    invoice_number text,
    reserved_by_user text,
    do_id integer,
    do_number text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    batch_no text,
    expiry_date text,
    manufacturing_date text
);
CREATE SEQUENCE IF NOT EXISTS public.stock_serials_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.stock_serials_id_seq OWNED BY public.stock_serials.id;
CREATE TABLE IF NOT EXISTS public.stock_transfer_items (
    id integer NOT NULL,
    stock_transfer_id integer NOT NULL,
    stock_item_id integer NOT NULL,
    quantity numeric(15,3) NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS public.stock_transfer_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.stock_transfer_items_id_seq OWNED BY public.stock_transfer_items.id;
CREATE TABLE IF NOT EXISTS public.stock_transfers (
    id integer NOT NULL,
    company_id integer NOT NULL,
    transfer_number text NOT NULL,
    from_warehouse_id integer NOT NULL,
    to_warehouse_id integer NOT NULL,
    transfer_date date NOT NULL,
    remarks text,
    status text DEFAULT 'posted'::text NOT NULL,
    created_by integer,
    updated_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS public.stock_transfers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.stock_transfers_id_seq OWNED BY public.stock_transfers.id;
CREATE TABLE IF NOT EXISTS public.tax_filings (
    id integer NOT NULL,
    company_id integer NOT NULL,
    type text NOT NULL,
    financial_year integer NOT NULL,
    fy_end_date text,
    revenue numeric(15,2),
    chargeable_income numeric(15,2),
    tax_payable numeric(15,2),
    status text DEFAULT 'draft'::text NOT NULL,
    filed_date text,
    reference_no text,
    data jsonb DEFAULT '{}'::jsonb,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by integer
);
CREATE SEQUENCE IF NOT EXISTS public.tax_filings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.tax_filings_id_seq OWNED BY public.tax_filings.id;
CREATE TABLE IF NOT EXISTS public.user_companies (
    id integer NOT NULL,
    user_id integer NOT NULL,
    company_id integer NOT NULL,
    modules jsonb DEFAULT '["purchase_orders", "quotations", "invoices", "delivery_orders"]'::jsonb NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS public.user_companies_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.user_companies_id_seq OWNED BY public.user_companies.id;
CREATE TABLE IF NOT EXISTS public.users (
    id integer NOT NULL,
    username text NOT NULL,
    password_hash text DEFAULT ''::text,
    role text DEFAULT 'user'::text NOT NULL,
    email text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    full_name text,
    phone_number text,
    is_active boolean DEFAULT true NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    company_id integer,
    role_id integer,
    sales_person_id integer,
    database_name text
);
CREATE SEQUENCE IF NOT EXISTS public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;
CREATE TABLE IF NOT EXISTS public.vendor_invoices (
    id integer NOT NULL,
    company_id integer NOT NULL,
    pi_number text NOT NULL,
    pi_date text,
    vendor_name text NOT NULL,
    po_ids jsonb DEFAULT '[]'::jsonb NOT NULL,
    po_numbers text,
    currency text DEFAULT 'SGD'::text NOT NULL,
    total_amount numeric(15,2) DEFAULT 0 NOT NULL,
    paid_amount numeric(15,2) DEFAULT 0 NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    notes text,
    expense_account_id integer,
    created_by integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    items jsonb DEFAULT '[]'::jsonb NOT NULL,
    subtotal numeric(15,2) DEFAULT 0 NOT NULL,
    tax numeric(15,2) DEFAULT 0 NOT NULL,
    exchange_rate numeric(10,6) DEFAULT 1.000000 NOT NULL,
    gst_treatment text DEFAULT 'standard_rated'::text NOT NULL,
    gst_rate numeric(5,2) DEFAULT 9 NOT NULL,
    gst_amount numeric(15,2) DEFAULT 0 NOT NULL,
    gst_inclusive boolean DEFAULT false NOT NULL,
    payment_terms text,
    due_date text,
    planned_payment_date text,
    reminders_enabled boolean DEFAULT true NOT NULL,
    reminder_start_day integer,
    reminder_extra_recipients jsonb DEFAULT '[]'::jsonb NOT NULL,
    reminder_extra_emails jsonb DEFAULT '[]'::jsonb NOT NULL,
    reminder_start_after_day integer,
    reminder_emails jsonb DEFAULT '[]'::jsonb NOT NULL,
    sales_person text,
    customer_note text,
    delivery_instructions text,
    terms_and_conditions text,
    authorised_signature text,
    discount_amount numeric(15,2) DEFAULT 0 NOT NULL,
    attachment_path text,
    attachment_name text
);
CREATE SEQUENCE IF NOT EXISTS public.vendor_invoices_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.vendor_invoices_id_seq OWNED BY public.vendor_invoices.id;
CREATE TABLE IF NOT EXISTS public.vendor_opening_balances (
    id integer NOT NULL,
    company_id integer NOT NULL,
    financial_year_id integer NOT NULL,
    vendor_id integer,
    vendor_name text NOT NULL,
    amount numeric(15,2) DEFAULT 0 NOT NULL,
    currency text DEFAULT 'SGD'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS public.vendor_opening_balances_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.vendor_opening_balances_id_seq OWNED BY public.vendor_opening_balances.id;
CREATE TABLE IF NOT EXISTS public.vendor_payments (
    id integer NOT NULL,
    company_id integer NOT NULL,
    vendor_invoice_id integer NOT NULL,
    payment_date text NOT NULL,
    amount numeric(15,2) NOT NULL,
    reference text,
    payment_method text DEFAULT 'bank_transfer'::text,
    notes text,
    created_by integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS public.vendor_payments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.vendor_payments_id_seq OWNED BY public.vendor_payments.id;
CREATE TABLE IF NOT EXISTS public.vendor_proforma_invoices (
    id integer NOT NULL,
    vpi_number text NOT NULL,
    company_id integer DEFAULT 1 NOT NULL,
    vendor_name text NOT NULL,
    vendor_address text,
    vendor_contact text,
    vendor_contact_email text,
    delivery_address text,
    issue_date text,
    delivery_date text,
    payment_terms text,
    notes text,
    is_private boolean DEFAULT false NOT NULL,
    items jsonb DEFAULT '[]'::jsonb NOT NULL,
    subtotal numeric(15,2) DEFAULT 0 NOT NULL,
    discount_amount numeric(15,2) DEFAULT 0 NOT NULL,
    tax numeric(15,2) DEFAULT 0 NOT NULL,
    total_amount numeric(15,2) DEFAULT 0 NOT NULL,
    currency text DEFAULT 'SGD'::text NOT NULL,
    pq_ref_no text,
    status text DEFAULT 'draft'::text NOT NULL,
    email_sent_to text,
    terms_and_conditions text,
    delivery_instructions text,
    customer_note text,
    authorised_signature text,
    created_by integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS public.vendor_proforma_invoices_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.vendor_proforma_invoices_id_seq OWNED BY public.vendor_proforma_invoices.id;
CREATE TABLE IF NOT EXISTS public.vendors (
    id integer NOT NULL,
    company_id integer NOT NULL,
    name text NOT NULL,
    address text,
    postal_code text,
    country text,
    contact_person text,
    contact_email text,
    phone text,
    currency text,
    gst_registered boolean DEFAULT false NOT NULL,
    gst_no text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS public.vendors_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.vendors_id_seq OWNED BY public.vendors.id;
CREATE TABLE IF NOT EXISTS public.voucher_attachments (
    id integer NOT NULL,
    voucher_id integer NOT NULL,
    file_name text DEFAULT 'attachment'::text NOT NULL,
    mime_type text DEFAULT 'image/jpeg'::text NOT NULL,
    file_data text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS public.voucher_attachments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.voucher_attachments_id_seq OWNED BY public.voucher_attachments.id;
CREATE TABLE IF NOT EXISTS public.vouchers (
    id integer NOT NULL,
    voucher_number text NOT NULL,
    company_id integer NOT NULL,
    project_id integer,
    type text DEFAULT 'payment'::text NOT NULL,
    payee text NOT NULL,
    payee_contact text,
    issue_date text,
    description text,
    status text DEFAULT 'draft'::text NOT NULL,
    items jsonb DEFAULT '[]'::jsonb NOT NULL,
    total_amount numeric(15,2) DEFAULT 0 NOT NULL,
    currency text DEFAULT 'SGD'::text NOT NULL,
    paid_date text,
    bank_ref text,
    notes text,
    proof_data text,
    proof_mime_type text,
    created_by integer NOT NULL,
    prepared_by_name text,
    verifier_id integer,
    approver_id integer,
    paid_by_id integer,
    verified_at text,
    approved_at text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS public.vouchers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.vouchers_id_seq OWNED BY public.vouchers.id;
CREATE TABLE IF NOT EXISTS public.warehouse_stock (
    id integer NOT NULL,
    company_id integer NOT NULL,
    warehouse_id integer NOT NULL,
    stock_item_id integer NOT NULL,
    quantity numeric(15,3) DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS public.warehouse_stock_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.warehouse_stock_id_seq OWNED BY public.warehouse_stock.id;
CREATE TABLE IF NOT EXISTS public.warehouses (
    id integer NOT NULL,
    company_id integer NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    description text,
    address text,
    city text,
    country text,
    contact_person text,
    contact_number text,
    email text,
    is_default boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_by integer,
    updated_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    state text,
    pin_code text,
    remarks text
);
CREATE SEQUENCE IF NOT EXISTS public.warehouses_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.warehouses_id_seq OWNED BY public.warehouses.id;
CREATE TABLE IF NOT EXISTS public.wht_records (
    id integer NOT NULL,
    company_id integer NOT NULL,
    vendor_name text NOT NULL,
    vendor_country text,
    payment_date text NOT NULL,
    nature text NOT NULL,
    payment_type text NOT NULL,
    currency text DEFAULT 'SGD'::text NOT NULL,
    gross_amount numeric(15,2) NOT NULL,
    wht_rate numeric(5,2) NOT NULL,
    wht_amount numeric(15,2) NOT NULL,
    net_amount numeric(15,2) NOT NULL,
    filing_deadline text,
    status text DEFAULT 'pending'::text NOT NULL,
    filed_date text,
    reference_no text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by integer
);
CREATE SEQUENCE IF NOT EXISTS public.wht_records_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.wht_records_id_seq OWNED BY public.wht_records.id;
ALTER TABLE ONLY public.accounting_backups ALTER COLUMN id SET DEFAULT nextval('public.accounting_backups_id_seq'::regclass);
ALTER TABLE ONLY public.accounting_restore_operations ALTER COLUMN id SET DEFAULT nextval('public.accounting_restore_operations_id_seq'::regclass);
ALTER TABLE ONLY public.accounts ALTER COLUMN id SET DEFAULT nextval('public.accounts_id_seq'::regclass);
ALTER TABLE ONLY public.asset_assignments ALTER COLUMN id SET DEFAULT nextval('public.asset_assignments_id_seq'::regclass);
ALTER TABLE ONLY public.assets ALTER COLUMN id SET DEFAULT nextval('public.assets_id_seq'::regclass);
ALTER TABLE ONLY public.audit_logs ALTER COLUMN id SET DEFAULT nextval('public.audit_logs_id_seq'::regclass);
ALTER TABLE ONLY public.backup_retention_settings ALTER COLUMN id SET DEFAULT nextval('public.backup_retention_settings_id_seq'::regclass);
ALTER TABLE ONLY public.backup_schedules ALTER COLUMN id SET DEFAULT nextval('public.backup_schedules_id_seq'::regclass);
ALTER TABLE ONLY public.bank_opening_balances ALTER COLUMN id SET DEFAULT nextval('public.bank_opening_balances_id_seq'::regclass);
ALTER TABLE ONLY public.companies ALTER COLUMN id SET DEFAULT nextval('public.companies_id_seq'::regclass);
ALTER TABLE ONLY public.conversations ALTER COLUMN id SET DEFAULT nextval('public.conversations_id_seq'::regclass);
ALTER TABLE ONLY public.credit_notes ALTER COLUMN id SET DEFAULT nextval('public.credit_notes_id_seq'::regclass);
ALTER TABLE ONLY public.customer_deposits ALTER COLUMN id SET DEFAULT nextval('public.customer_deposits_id_seq'::regclass);
ALTER TABLE ONLY public.customer_opening_balances ALTER COLUMN id SET DEFAULT nextval('public.customer_opening_balances_id_seq'::regclass);
ALTER TABLE ONLY public.customers ALTER COLUMN id SET DEFAULT nextval('public.customers_id_seq'::regclass);
ALTER TABLE ONLY public.debit_notes ALTER COLUMN id SET DEFAULT nextval('public.debit_notes_id_seq'::regclass);
ALTER TABLE ONLY public.delivery_orders ALTER COLUMN id SET DEFAULT nextval('public.delivery_orders_id_seq'::regclass);
ALTER TABLE ONLY public.dependents ALTER COLUMN id SET DEFAULT nextval('public.dependents_id_seq'::regclass);
ALTER TABLE ONLY public.email_contacts ALTER COLUMN id SET DEFAULT nextval('public.email_contacts_id_seq'::regclass);
ALTER TABLE ONLY public.employee_documents ALTER COLUMN id SET DEFAULT nextval('public.employee_documents_id_seq'::regclass);
ALTER TABLE ONLY public.employee_payroll ALTER COLUMN id SET DEFAULT nextval('public.employee_payroll_id_seq'::regclass);
ALTER TABLE ONLY public.employees ALTER COLUMN id SET DEFAULT nextval('public.employees_id_seq'::regclass);
ALTER TABLE ONLY public.expenses ALTER COLUMN id SET DEFAULT nextval('public.expenses_id_seq'::regclass);
ALTER TABLE ONLY public.financial_years ALTER COLUMN id SET DEFAULT nextval('public.financial_years_id_seq'::regclass);
ALTER TABLE ONLY public.fixed_asset_opening_balances ALTER COLUMN id SET DEFAULT nextval('public.fixed_asset_opening_balances_id_seq'::regclass);
ALTER TABLE ONLY public.goods_issue_items ALTER COLUMN id SET DEFAULT nextval('public.goods_issue_items_id_seq'::regclass);
ALTER TABLE ONLY public.goods_issues ALTER COLUMN id SET DEFAULT nextval('public.goods_issues_id_seq'::regclass);
ALTER TABLE ONLY public.goods_receipt_items ALTER COLUMN id SET DEFAULT nextval('public.goods_receipt_items_id_seq'::regclass);
ALTER TABLE ONLY public.goods_receipts ALTER COLUMN id SET DEFAULT nextval('public.goods_receipts_id_seq'::regclass);
ALTER TABLE ONLY public.grn ALTER COLUMN id SET DEFAULT nextval('public.grn_id_seq'::regclass);
ALTER TABLE ONLY public.income_attachments ALTER COLUMN id SET DEFAULT nextval('public.income_attachments_id_seq'::regclass);
ALTER TABLE ONLY public.income_records ALTER COLUMN id SET DEFAULT nextval('public.income_records_id_seq'::regclass);
ALTER TABLE ONLY public.inventory_opening_balances ALTER COLUMN id SET DEFAULT nextval('public.inventory_opening_balances_id_seq'::regclass);
ALTER TABLE ONLY public.invoice_payments ALTER COLUMN id SET DEFAULT nextval('public.invoice_payments_id_seq'::regclass);
ALTER TABLE ONLY public.invoices ALTER COLUMN id SET DEFAULT nextval('public.invoices_id_seq'::regclass);
ALTER TABLE ONLY public.ir8a_employers ALTER COLUMN id SET DEFAULT nextval('public.ir8a_employers_id_seq'::regclass);
ALTER TABLE ONLY public.journal_entries ALTER COLUMN id SET DEFAULT nextval('public.journal_entries_id_seq'::regclass);
ALTER TABLE ONLY public.journal_lines ALTER COLUMN id SET DEFAULT nextval('public.journal_lines_id_seq'::regclass);
ALTER TABLE ONLY public.licenses ALTER COLUMN id SET DEFAULT nextval('public.licenses_id_seq'::regclass);
ALTER TABLE ONLY public.maintenance ALTER COLUMN id SET DEFAULT nextval('public.maintenance_id_seq'::regclass);
ALTER TABLE ONLY public.maintenance_records ALTER COLUMN id SET DEFAULT nextval('public.maintenance_records_id_seq'::regclass);
ALTER TABLE ONLY public.messages ALTER COLUMN id SET DEFAULT nextval('public.messages_id_seq'::regclass);
ALTER TABLE ONLY public.opening_balances ALTER COLUMN id SET DEFAULT nextval('public.opening_balances_id_seq'::regclass);
ALTER TABLE ONLY public.opening_stock ALTER COLUMN id SET DEFAULT nextval('public.opening_stock_id_seq'::regclass);
ALTER TABLE ONLY public.ops_asset_assignments ALTER COLUMN id SET DEFAULT nextval('public.ops_asset_assignments_id_seq'::regclass);
ALTER TABLE ONLY public.ops_assets ALTER COLUMN id SET DEFAULT nextval('public.ops_assets_id_seq'::regclass);
ALTER TABLE ONLY public.ops_company_documents ALTER COLUMN id SET DEFAULT nextval('public.ops_company_documents_id_seq'::regclass);
ALTER TABLE ONLY public.ops_employee_payroll ALTER COLUMN id SET DEFAULT nextval('public.ops_employee_payroll_id_seq'::regclass);
ALTER TABLE ONLY public.ops_employees ALTER COLUMN id SET DEFAULT nextval('public.ops_employees_id_seq'::regclass);
ALTER TABLE ONLY public.ops_licenses ALTER COLUMN id SET DEFAULT nextval('public.ops_licenses_id_seq'::regclass);
ALTER TABLE ONLY public.ops_payroll_records ALTER COLUMN id SET DEFAULT nextval('public.ops_payroll_records_id_seq'::regclass);
ALTER TABLE ONLY public.ops_tasks ALTER COLUMN id SET DEFAULT nextval('public.ops_tasks_id_seq'::regclass);
ALTER TABLE ONLY public.payroll_records ALTER COLUMN id SET DEFAULT nextval('public.payroll_records_id_seq'::regclass);
ALTER TABLE ONLY public.permissions ALTER COLUMN id SET DEFAULT nextval('public.permissions_id_seq'::regclass);
ALTER TABLE ONLY public.proforma_invoices ALTER COLUMN id SET DEFAULT nextval('public.proforma_invoices_id_seq'::regclass);
ALTER TABLE ONLY public.projects ALTER COLUMN id SET DEFAULT nextval('public.projects_id_seq'::regclass);
ALTER TABLE ONLY public.purchase_orders ALTER COLUMN id SET DEFAULT nextval('public.purchase_orders_id_seq'::regclass);
ALTER TABLE ONLY public.purchase_quotations ALTER COLUMN id SET DEFAULT nextval('public.purchase_quotations_id_seq'::regclass);
ALTER TABLE ONLY public.quotations ALTER COLUMN id SET DEFAULT nextval('public.quotations_id_seq'::regclass);
ALTER TABLE ONLY public.report_definitions ALTER COLUMN id SET DEFAULT nextval('public.report_definitions_id_seq'::regclass);
ALTER TABLE ONLY public.report_fields ALTER COLUMN id SET DEFAULT nextval('public.report_fields_id_seq'::regclass);
ALTER TABLE ONLY public.report_templates ALTER COLUMN id SET DEFAULT nextval('public.report_templates_id_seq'::regclass);
ALTER TABLE ONLY public.roles ALTER COLUMN id SET DEFAULT nextval('public.roles_id_seq'::regclass);
ALTER TABLE ONLY public.sales_orders ALTER COLUMN id SET DEFAULT nextval('public.sales_orders_id_seq'::regclass);
ALTER TABLE ONLY public.sales_persons ALTER COLUMN id SET DEFAULT nextval('public.sales_persons_id_seq'::regclass);
ALTER TABLE ONLY public.service_reports ALTER COLUMN id SET DEFAULT nextval('public.service_reports_id_seq'::regclass);
ALTER TABLE ONLY public.settings ALTER COLUMN id SET DEFAULT nextval('public.settings_id_seq'::regclass);
ALTER TABLE ONLY public.stock_adjustments ALTER COLUMN id SET DEFAULT nextval('public.stock_adjustments_id_seq'::regclass);
ALTER TABLE ONLY public.stock_item_purchase_prices ALTER COLUMN id SET DEFAULT nextval('public.stock_item_purchase_prices_id_seq'::regclass);
ALTER TABLE ONLY public.stock_items ALTER COLUMN id SET DEFAULT nextval('public.stock_items_id_seq'::regclass);
ALTER TABLE ONLY public.stock_movements ALTER COLUMN id SET DEFAULT nextval('public.stock_movements_id_seq'::regclass);
ALTER TABLE ONLY public.stock_serials ALTER COLUMN id SET DEFAULT nextval('public.stock_serials_id_seq'::regclass);
ALTER TABLE ONLY public.stock_transfer_items ALTER COLUMN id SET DEFAULT nextval('public.stock_transfer_items_id_seq'::regclass);
ALTER TABLE ONLY public.stock_transfers ALTER COLUMN id SET DEFAULT nextval('public.stock_transfers_id_seq'::regclass);
ALTER TABLE ONLY public.tax_filings ALTER COLUMN id SET DEFAULT nextval('public.tax_filings_id_seq'::regclass);
ALTER TABLE ONLY public.user_companies ALTER COLUMN id SET DEFAULT nextval('public.user_companies_id_seq'::regclass);
ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);
ALTER TABLE ONLY public.vendor_invoices ALTER COLUMN id SET DEFAULT nextval('public.vendor_invoices_id_seq'::regclass);
ALTER TABLE ONLY public.vendor_opening_balances ALTER COLUMN id SET DEFAULT nextval('public.vendor_opening_balances_id_seq'::regclass);
ALTER TABLE ONLY public.vendor_payments ALTER COLUMN id SET DEFAULT nextval('public.vendor_payments_id_seq'::regclass);
ALTER TABLE ONLY public.vendor_proforma_invoices ALTER COLUMN id SET DEFAULT nextval('public.vendor_proforma_invoices_id_seq'::regclass);
ALTER TABLE ONLY public.vendors ALTER COLUMN id SET DEFAULT nextval('public.vendors_id_seq'::regclass);
ALTER TABLE ONLY public.voucher_attachments ALTER COLUMN id SET DEFAULT nextval('public.voucher_attachments_id_seq'::regclass);
ALTER TABLE ONLY public.vouchers ALTER COLUMN id SET DEFAULT nextval('public.vouchers_id_seq'::regclass);
ALTER TABLE ONLY public.warehouse_stock ALTER COLUMN id SET DEFAULT nextval('public.warehouse_stock_id_seq'::regclass);
ALTER TABLE ONLY public.warehouses ALTER COLUMN id SET DEFAULT nextval('public.warehouses_id_seq'::regclass);
ALTER TABLE ONLY public.wht_records ALTER COLUMN id SET DEFAULT nextval('public.wht_records_id_seq'::regclass);
ALTER TABLE ONLY public.accounting_backups
    ADD CONSTRAINT accounting_backups_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.accounting_restore_operations
    ADD CONSTRAINT accounting_restore_operations_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_company_code_unique UNIQUE (company_id, code);
ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.asset_assignments
    ADD CONSTRAINT asset_assignments_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.backup_retention_settings
    ADD CONSTRAINT backup_retention_settings_company_id_key UNIQUE (company_id);
ALTER TABLE ONLY public.backup_retention_settings
    ADD CONSTRAINT backup_retention_settings_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.backup_schedules
    ADD CONSTRAINT backup_schedules_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.bank_opening_balances
    ADD CONSTRAINT bank_opening_balances_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.credit_notes
    ADD CONSTRAINT credit_notes_company_cn_number_unique UNIQUE (company_id, cn_number);
ALTER TABLE ONLY public.credit_notes
    ADD CONSTRAINT credit_notes_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.customer_deposits
    ADD CONSTRAINT customer_deposits_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.customer_opening_balances
    ADD CONSTRAINT customer_opening_balances_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.debit_notes
    ADD CONSTRAINT debit_notes_company_dn_number_unique UNIQUE (company_id, dn_number);
ALTER TABLE ONLY public.debit_notes
    ADD CONSTRAINT debit_notes_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.delivery_orders
    ADD CONSTRAINT delivery_orders_do_number_key UNIQUE (do_number);
ALTER TABLE ONLY public.delivery_orders
    ADD CONSTRAINT delivery_orders_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.dependents
    ADD CONSTRAINT dependents_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.email_contacts
    ADD CONSTRAINT email_contacts_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.employee_documents
    ADD CONSTRAINT employee_documents_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.employee_payroll
    ADD CONSTRAINT employee_payroll_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.financial_years
    ADD CONSTRAINT financial_years_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.fixed_asset_opening_balances
    ADD CONSTRAINT fixed_asset_opening_balances_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.goods_issue_items
    ADD CONSTRAINT goods_issue_items_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.goods_issues
    ADD CONSTRAINT goods_issues_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.goods_receipt_items
    ADD CONSTRAINT goods_receipt_items_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.goods_receipts
    ADD CONSTRAINT goods_receipts_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.grn
    ADD CONSTRAINT grn_grn_number_key UNIQUE (grn_number);
ALTER TABLE ONLY public.grn
    ADD CONSTRAINT grn_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.income_attachments
    ADD CONSTRAINT income_attachments_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.income_records
    ADD CONSTRAINT income_records_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.inventory_opening_balances
    ADD CONSTRAINT inventory_opening_balances_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.invoice_payments
    ADD CONSTRAINT invoice_payments_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_company_inv_number_unique UNIQUE (company_id, inv_number);
ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.ir8a_employers
    ADD CONSTRAINT ir8a_employers_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT journal_entries_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.journal_lines
    ADD CONSTRAINT journal_lines_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.licenses
    ADD CONSTRAINT licenses_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.login_credentials
    ADD CONSTRAINT login_credentials_pkey PRIMARY KEY (user_id);
ALTER TABLE ONLY public.maintenance
    ADD CONSTRAINT maintenance_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.maintenance_records
    ADD CONSTRAINT maintenance_records_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.opening_balances
    ADD CONSTRAINT opening_balances_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.opening_stock
    ADD CONSTRAINT opening_stock_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.opening_stock
    ADD CONSTRAINT opening_stock_warehouse_id_stock_item_id_key UNIQUE (warehouse_id, stock_item_id);
ALTER TABLE ONLY public.ops_asset_assignments
    ADD CONSTRAINT ops_asset_assignments_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.ops_assets
    ADD CONSTRAINT ops_assets_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.ops_company_documents
    ADD CONSTRAINT ops_company_documents_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.ops_employee_payroll
    ADD CONSTRAINT ops_employee_payroll_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.ops_employees
    ADD CONSTRAINT ops_employees_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.ops_licenses
    ADD CONSTRAINT ops_licenses_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.ops_payroll_records
    ADD CONSTRAINT ops_payroll_records_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.ops_tasks
    ADD CONSTRAINT ops_tasks_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.payroll_records
    ADD CONSTRAINT payroll_records_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT permissions_module_action_unique UNIQUE (module, action);
ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT permissions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.pos_sales
    ADD CONSTRAINT pos_sales_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.proforma_invoices
    ADD CONSTRAINT proforma_invoices_company_pi_number_unique UNIQUE (company_id, pi_number);
ALTER TABLE ONLY public.proforma_invoices
    ADD CONSTRAINT proforma_invoices_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_po_number_key UNIQUE (po_number);
ALTER TABLE ONLY public.purchase_quotations
    ADD CONSTRAINT purchase_quotations_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.purchase_quotations
    ADD CONSTRAINT purchase_quotations_pq_number_key UNIQUE (pq_number);
ALTER TABLE ONLY public.quotations
    ADD CONSTRAINT quotations_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.quotations
    ADD CONSTRAINT quotations_qt_number_key UNIQUE (qt_number);
ALTER TABLE ONLY public.report_definitions
    ADD CONSTRAINT report_definitions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.report_fields
    ADD CONSTRAINT report_fields_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.report_templates
    ADD CONSTRAINT report_templates_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_role_id_permission_id_unique UNIQUE (role_id, permission_id);
ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.sales_orders
    ADD CONSTRAINT sales_orders_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.sales_orders
    ADD CONSTRAINT sales_orders_so_number_key UNIQUE (so_number);
ALTER TABLE ONLY public.sales_persons
    ADD CONSTRAINT sales_persons_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.service_reports
    ADD CONSTRAINT service_reports_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_pkey PRIMARY KEY (sid);
ALTER TABLE ONLY public.settings
    ADD CONSTRAINT settings_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.stock_adjustments
    ADD CONSTRAINT stock_adjustments_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.stock_item_purchase_prices
    ADD CONSTRAINT stock_item_purchase_prices_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.stock_items
    ADD CONSTRAINT stock_items_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.stock_serials
    ADD CONSTRAINT stock_serials_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.stock_transfer_items
    ADD CONSTRAINT stock_transfer_items_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.stock_transfers
    ADD CONSTRAINT stock_transfers_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.tax_filings
    ADD CONSTRAINT tax_filings_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.user_companies
    ADD CONSTRAINT user_companies_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.user_companies
    ADD CONSTRAINT user_companies_user_id_company_id_key UNIQUE (user_id, company_id);
ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_key UNIQUE (username);
ALTER TABLE ONLY public.vendor_invoices
    ADD CONSTRAINT vendor_invoices_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.vendor_opening_balances
    ADD CONSTRAINT vendor_opening_balances_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.vendor_payments
    ADD CONSTRAINT vendor_payments_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.vendor_proforma_invoices
    ADD CONSTRAINT vendor_proforma_invoices_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.vendors
    ADD CONSTRAINT vendors_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.voucher_attachments
    ADD CONSTRAINT voucher_attachments_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.vouchers
    ADD CONSTRAINT vouchers_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.warehouse_stock
    ADD CONSTRAINT warehouse_stock_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.warehouse_stock
    ADD CONSTRAINT warehouse_stock_warehouse_id_stock_item_id_key UNIQUE (warehouse_id, stock_item_id);
ALTER TABLE ONLY public.warehouses
    ADD CONSTRAINT warehouses_company_id_code_key UNIQUE (company_id, code);
ALTER TABLE ONLY public.warehouses
    ADD CONSTRAINT warehouses_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.wht_records
    ADD CONSTRAINT wht_records_pkey PRIMARY KEY (id);
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON public.session USING btree (expire);
CREATE INDEX IF NOT EXISTS accounting_backups_company_idx ON public.accounting_backups USING btree (company_id);
CREATE INDEX IF NOT EXISTS accounting_backups_status_idx ON public.accounting_backups USING btree (company_id, status);
CREATE INDEX IF NOT EXISTS accounting_restore_ops_backup_idx ON public.accounting_restore_operations USING btree (backup_id);
CREATE INDEX IF NOT EXISTS accounting_restore_ops_company_idx ON public.accounting_restore_operations USING btree (company_id);
CREATE INDEX IF NOT EXISTS assets_company_id_idx ON public.assets USING btree (company_id);
CREATE UNIQUE INDEX IF NOT EXISTS companies_slug_unique ON public.companies USING btree (slug) WHERE (slug IS NOT NULL);
CREATE INDEX IF NOT EXISTS employee_documents_company_id_idx ON public.employee_documents USING btree (company_id);
CREATE INDEX IF NOT EXISTS employee_payroll_company_id_idx ON public.employee_payroll USING btree (company_id);
CREATE INDEX IF NOT EXISTS employee_payroll_employee_id_idx ON public.employee_payroll USING btree (employee_id);
CREATE INDEX IF NOT EXISTS employees_company_id_idx ON public.employees USING btree (company_id);
CREATE UNIQUE INDEX IF NOT EXISTS financial_years_company_dates_uidx ON public.financial_years USING btree (company_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_audit_logs_company ON public.audit_logs USING btree (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON public.audit_logs USING btree (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_credit_notes_company ON public.credit_notes USING btree (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customers_company ON public.customers USING btree (company_id);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_company ON public.delivery_orders USING btree (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_grn_company ON public.grn USING btree (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoice_payments_inv ON public.invoice_payments USING btree (invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoices_company ON public.invoices USING btree (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_journal_entries_company ON public.journal_entries USING btree (company_id, entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_journal_lines_account ON public.journal_lines USING btree (account_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_entry ON public.journal_lines USING btree (journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_proforma_invoices_company ON public.proforma_invoices USING btree (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_company ON public.purchase_orders USING btree (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quotations_company ON public.quotations USING btree (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_items_company ON public.stock_items USING btree (company_id);
CREATE INDEX IF NOT EXISTS idx_vendor_payments_vi ON public.vendor_payments USING btree (vendor_invoice_id);
CREATE INDEX IF NOT EXISTS idx_vendors_company ON public.vendors USING btree (company_id);
CREATE INDEX IF NOT EXISTS ir8a_employers_company_id_idx ON public.ir8a_employers USING btree (company_id);
CREATE INDEX IF NOT EXISTS licenses_company_id_idx ON public.licenses USING btree (company_id);
CREATE INDEX IF NOT EXISTS payroll_records_company_id_idx ON public.payroll_records USING btree (company_id);
CREATE INDEX IF NOT EXISTS payroll_records_employee_period_idx ON public.payroll_records USING btree (company_id, employee_id, pay_period_start, pay_period_end);
CREATE INDEX IF NOT EXISTS pos_sales_company_channel_idx ON public.pos_sales USING btree (company_id, channel);
CREATE UNIQUE INDEX IF NOT EXISTS pos_sales_company_number_idx ON public.pos_sales USING btree (company_id, pos_number);
CREATE UNIQUE INDEX IF NOT EXISTS report_definitions_report_type_idx ON public.report_definitions USING btree (report_type);
CREATE UNIQUE INDEX IF NOT EXISTS report_fields_definition_key_idx ON public.report_fields USING btree (report_definition_id, field_key);
CREATE UNIQUE INDEX IF NOT EXISTS report_templates_company_def_name_idx ON public.report_templates USING btree (company_id, report_definition_id, lower(name)) WHERE (company_id IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS report_templates_one_active_idx ON public.report_templates USING btree (company_id, report_definition_id) WHERE ((is_active = true) AND (company_id IS NOT NULL) AND (is_system_template = false));
CREATE UNIQUE INDEX IF NOT EXISTS report_templates_one_system_default_idx ON public.report_templates USING btree (report_definition_id) WHERE ((is_system_template = true) AND (company_id IS NULL));
CREATE UNIQUE INDEX IF NOT EXISTS sales_persons_company_code_idx ON public.sales_persons USING btree (company_id, employment_code);
CREATE INDEX IF NOT EXISTS service_reports_company_id_idx ON public.service_reports USING btree (company_id);
CREATE INDEX IF NOT EXISTS stock_item_purchase_prices_item_idx ON public.stock_item_purchase_prices USING btree (stock_item_id, effective_date DESC, id DESC);
CREATE INDEX IF NOT EXISTS stock_movements_company_idx ON public.stock_movements USING btree (company_id);
CREATE INDEX IF NOT EXISTS stock_movements_date_idx ON public.stock_movements USING btree (movement_date);
CREATE INDEX IF NOT EXISTS stock_movements_item_idx ON public.stock_movements USING btree (stock_item_id);
CREATE INDEX IF NOT EXISTS stock_movements_wh_idx ON public.stock_movements USING btree (warehouse_id);
CREATE UNIQUE INDEX IF NOT EXISTS vendor_proforma_invoices_company_vpi_number_unique ON public.vendor_proforma_invoices USING btree (company_id, vpi_number);
ALTER TABLE ONLY public.customer_deposits
    ADD CONSTRAINT customer_deposits_journal_entry_id_fkey FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id);
ALTER TABLE ONLY public.goods_issue_items
    ADD CONSTRAINT goods_issue_items_goods_issue_id_fkey FOREIGN KEY (goods_issue_id) REFERENCES public.goods_issues(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.goods_issue_items
    ADD CONSTRAINT goods_issue_items_stock_item_id_fkey FOREIGN KEY (stock_item_id) REFERENCES public.stock_items(id);
ALTER TABLE ONLY public.goods_issues
    ADD CONSTRAINT goods_issues_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id);
ALTER TABLE ONLY public.goods_receipt_items
    ADD CONSTRAINT goods_receipt_items_goods_receipt_id_fkey FOREIGN KEY (goods_receipt_id) REFERENCES public.goods_receipts(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.goods_receipt_items
    ADD CONSTRAINT goods_receipt_items_stock_item_id_fkey FOREIGN KEY (stock_item_id) REFERENCES public.stock_items(id);
ALTER TABLE ONLY public.goods_receipts
    ADD CONSTRAINT goods_receipts_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id);
ALTER TABLE ONLY public.income_attachments
    ADD CONSTRAINT income_attachments_income_id_fkey FOREIGN KEY (income_id) REFERENCES public.income_records(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.invoice_payments
    ADD CONSTRAINT invoice_payments_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.journal_lines
    ADD CONSTRAINT journal_lines_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id);
ALTER TABLE ONLY public.journal_lines
    ADD CONSTRAINT journal_lines_journal_entry_id_fkey FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.opening_stock
    ADD CONSTRAINT opening_stock_stock_item_id_fkey FOREIGN KEY (stock_item_id) REFERENCES public.stock_items(id);
ALTER TABLE ONLY public.opening_stock
    ADD CONSTRAINT opening_stock_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id);
ALTER TABLE ONLY public.pos_sales
    ADD CONSTRAINT pos_sales_sales_person_id_fkey FOREIGN KEY (sales_person_id) REFERENCES public.sales_persons(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.report_fields
    ADD CONSTRAINT report_fields_report_definition_id_fkey FOREIGN KEY (report_definition_id) REFERENCES public.report_definitions(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.report_templates
    ADD CONSTRAINT report_templates_report_definition_id_fkey FOREIGN KEY (report_definition_id) REFERENCES public.report_definitions(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_permission_id_fkey FOREIGN KEY (permission_id) REFERENCES public.permissions(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.stock_adjustments
    ADD CONSTRAINT stock_adjustments_stock_item_id_fkey FOREIGN KEY (stock_item_id) REFERENCES public.stock_items(id);
ALTER TABLE ONLY public.stock_adjustments
    ADD CONSTRAINT stock_adjustments_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id);
ALTER TABLE ONLY public.stock_item_purchase_prices
    ADD CONSTRAINT stock_item_purchase_prices_stock_item_id_fkey FOREIGN KEY (stock_item_id) REFERENCES public.stock_items(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_stock_item_id_fkey FOREIGN KEY (stock_item_id) REFERENCES public.stock_items(id);
ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id);
ALTER TABLE ONLY public.stock_serials
    ADD CONSTRAINT stock_serials_stock_item_id_fkey FOREIGN KEY (stock_item_id) REFERENCES public.stock_items(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.stock_transfer_items
    ADD CONSTRAINT stock_transfer_items_stock_item_id_fkey FOREIGN KEY (stock_item_id) REFERENCES public.stock_items(id);
ALTER TABLE ONLY public.stock_transfer_items
    ADD CONSTRAINT stock_transfer_items_stock_transfer_id_fkey FOREIGN KEY (stock_transfer_id) REFERENCES public.stock_transfers(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.stock_transfers
    ADD CONSTRAINT stock_transfers_from_warehouse_id_fkey FOREIGN KEY (from_warehouse_id) REFERENCES public.warehouses(id);
ALTER TABLE ONLY public.stock_transfers
    ADD CONSTRAINT stock_transfers_to_warehouse_id_fkey FOREIGN KEY (to_warehouse_id) REFERENCES public.warehouses(id);
ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_sales_person_id_fkey FOREIGN KEY (sales_person_id) REFERENCES public.sales_persons(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.vendor_payments
    ADD CONSTRAINT vendor_payments_vendor_invoice_id_fkey FOREIGN KEY (vendor_invoice_id) REFERENCES public.vendor_invoices(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.voucher_attachments
    ADD CONSTRAINT voucher_attachments_voucher_id_fkey FOREIGN KEY (voucher_id) REFERENCES public.vouchers(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.warehouse_stock
    ADD CONSTRAINT warehouse_stock_stock_item_id_fkey FOREIGN KEY (stock_item_id) REFERENCES public.stock_items(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.warehouse_stock
    ADD CONSTRAINT warehouse_stock_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id) ON DELETE CASCADE;