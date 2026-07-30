--
-- PostgreSQL database dump
--

\restrict heaFw4yRv2MVxkcUq9Cwav2KTQ3776CWuScDtnXuf7EKlehuTRvSvmAE1CTQrgQ

-- Dumped from database version 16.10
-- Dumped by pg_dump version 16.10

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: accounts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.accounts (
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


ALTER TABLE public.accounts OWNER TO postgres;

--
-- Name: accounts_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.accounts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.accounts_id_seq OWNER TO postgres;

--
-- Name: accounts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.accounts_id_seq OWNED BY public.accounts.id;


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.audit_logs (
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


ALTER TABLE public.audit_logs OWNER TO postgres;

--
-- Name: audit_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.audit_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.audit_logs_id_seq OWNER TO postgres;

--
-- Name: audit_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.audit_logs_id_seq OWNED BY public.audit_logs.id;


--
-- Name: companies; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.companies (
    id integer NOT NULL,
    name text NOT NULL,
    country text NOT NULL,
    address text,
    registration_no text,
    email text,
    phone text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    logo_url text,
    gst_reg_no text
);


ALTER TABLE public.companies OWNER TO postgres;

--
-- Name: companies_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.companies_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.companies_id_seq OWNER TO postgres;

--
-- Name: companies_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.companies_id_seq OWNED BY public.companies.id;


--
-- Name: credit_notes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.credit_notes (
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
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.credit_notes OWNER TO postgres;

--
-- Name: credit_notes_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.credit_notes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.credit_notes_id_seq OWNER TO postgres;

--
-- Name: credit_notes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.credit_notes_id_seq OWNED BY public.credit_notes.id;


--
-- Name: customer_deposits; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.customer_deposits (
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


ALTER TABLE public.customer_deposits OWNER TO postgres;

--
-- Name: customer_deposits_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.customer_deposits_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.customer_deposits_id_seq OWNER TO postgres;

--
-- Name: customer_deposits_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.customer_deposits_id_seq OWNED BY public.customer_deposits.id;


--
-- Name: customers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.customers (
    id integer NOT NULL,
    company_id integer NOT NULL,
    name text NOT NULL,
    address text,
    country text,
    contact_person text,
    contact_email text,
    phone text,
    gst_registered boolean DEFAULT false NOT NULL,
    gst_no text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    postal_code text,
    currency text,
    ship_to_address text,
    quotation_terms text
);


ALTER TABLE public.customers OWNER TO postgres;

--
-- Name: customers_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.customers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.customers_id_seq OWNER TO postgres;

--
-- Name: customers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.customers_id_seq OWNED BY public.customers.id;


--
-- Name: debit_notes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.debit_notes (
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
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.debit_notes OWNER TO postgres;

--
-- Name: debit_notes_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.debit_notes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.debit_notes_id_seq OWNER TO postgres;

--
-- Name: debit_notes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.debit_notes_id_seq OWNED BY public.debit_notes.id;


--
-- Name: delivery_orders; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.delivery_orders (
    id integer NOT NULL,
    do_number text NOT NULL,
    customer_name text NOT NULL,
    customer_address text,
    customer_contact text,
    delivery_date text,
    notes text,
    items jsonb DEFAULT '[]'::jsonb NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    created_by integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    company_id integer DEFAULT 1 NOT NULL,
    payment_terms text,
    is_private boolean DEFAULT false NOT NULL,
    issue_date text,
    inv_id integer,
    inv_number text,
    email_sent_to text
);


ALTER TABLE public.delivery_orders OWNER TO postgres;

--
-- Name: delivery_orders_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.delivery_orders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.delivery_orders_id_seq OWNER TO postgres;

--
-- Name: delivery_orders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.delivery_orders_id_seq OWNED BY public.delivery_orders.id;


--
-- Name: email_contacts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.email_contacts (
    id integer NOT NULL,
    company_id integer NOT NULL,
    name text,
    email text NOT NULL,
    use_count integer DEFAULT 1 NOT NULL,
    last_used_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.email_contacts OWNER TO postgres;

--
-- Name: email_contacts_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.email_contacts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.email_contacts_id_seq OWNER TO postgres;

--
-- Name: email_contacts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.email_contacts_id_seq OWNED BY public.email_contacts.id;


--
-- Name: expenses; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.expenses (
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
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.expenses OWNER TO postgres;

--
-- Name: expenses_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.expenses_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.expenses_id_seq OWNER TO postgres;

--
-- Name: expenses_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.expenses_id_seq OWNED BY public.expenses.id;


--
-- Name: grn; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.grn (
    id integer NOT NULL,
    grn_number text NOT NULL,
    po_id integer NOT NULL,
    po_number text NOT NULL,
    vendor_name text NOT NULL,
    company_id integer DEFAULT 1 NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    items jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_by integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.grn OWNER TO postgres;

--
-- Name: grn_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.grn_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.grn_id_seq OWNER TO postgres;

--
-- Name: grn_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.grn_id_seq OWNED BY public.grn.id;


--
-- Name: income_records; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.income_records (
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
    payment_method text DEFAULT 'bank_transfer'::text,
    account_id integer,
    reference text,
    notes text,
    status text DEFAULT 'draft'::text NOT NULL,
    journal_entry_id integer,
    created_by integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    exchange_rate numeric(10,6) DEFAULT 1.000000 NOT NULL
);


ALTER TABLE public.income_records OWNER TO postgres;

--
-- Name: income_records_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.income_records_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.income_records_id_seq OWNER TO postgres;

--
-- Name: income_records_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.income_records_id_seq OWNED BY public.income_records.id;


--
-- Name: invoice_payments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.invoice_payments (
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


ALTER TABLE public.invoice_payments OWNER TO postgres;

--
-- Name: invoice_payments_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.invoice_payments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.invoice_payments_id_seq OWNER TO postgres;

--
-- Name: invoice_payments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.invoice_payments_id_seq OWNED BY public.invoice_payments.id;


--
-- Name: invoices; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.invoices (
    id integer NOT NULL,
    inv_number text NOT NULL,
    customer_name text NOT NULL,
    customer_address text,
    customer_contact text,
    delivery_address text,
    delivery_date text,
    payment_terms text,
    notes text,
    items jsonb DEFAULT '[]'::jsonb NOT NULL,
    subtotal numeric(15,2) DEFAULT '0'::numeric NOT NULL,
    tax numeric(15,2) DEFAULT '0'::numeric NOT NULL,
    total_amount numeric(15,2) DEFAULT '0'::numeric NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    created_by integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    company_id integer DEFAULT 1 NOT NULL,
    currency text DEFAULT 'SGD'::text NOT NULL,
    customer_contact_email text,
    discount_amount numeric(15,2) DEFAULT '0'::numeric NOT NULL,
    is_private boolean DEFAULT false NOT NULL,
    void_reason text,
    issue_date text,
    po_ref_no text,
    email_sent_to text,
    exchange_rate numeric(10,6) DEFAULT 1.000000 NOT NULL
);


ALTER TABLE public.invoices OWNER TO postgres;

--
-- Name: invoices_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.invoices_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.invoices_id_seq OWNER TO postgres;

--
-- Name: invoices_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.invoices_id_seq OWNED BY public.invoices.id;


--
-- Name: journal_entries; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.journal_entries (
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


ALTER TABLE public.journal_entries OWNER TO postgres;

--
-- Name: journal_entries_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.journal_entries_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.journal_entries_id_seq OWNER TO postgres;

--
-- Name: journal_entries_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.journal_entries_id_seq OWNED BY public.journal_entries.id;


--
-- Name: journal_lines; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.journal_lines (
    id integer NOT NULL,
    journal_entry_id integer NOT NULL,
    account_id integer NOT NULL,
    description text,
    debit numeric(15,2) DEFAULT 0 NOT NULL,
    credit numeric(15,2) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.journal_lines OWNER TO postgres;

--
-- Name: journal_lines_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.journal_lines_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.journal_lines_id_seq OWNER TO postgres;

--
-- Name: journal_lines_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.journal_lines_id_seq OWNED BY public.journal_lines.id;


--
-- Name: maintenance; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.maintenance (
    id integer NOT NULL,
    is_enabled boolean DEFAULT false NOT NULL,
    scheduled_start text,
    scheduled_end text,
    message text,
    contact_email text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by_user text
);


ALTER TABLE public.maintenance OWNER TO postgres;

--
-- Name: maintenance_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.maintenance_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.maintenance_id_seq OWNER TO postgres;

--
-- Name: maintenance_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.maintenance_id_seq OWNED BY public.maintenance.id;


--
-- Name: proforma_invoices; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.proforma_invoices (
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
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.proforma_invoices OWNER TO postgres;

--
-- Name: proforma_invoices_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.proforma_invoices_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.proforma_invoices_id_seq OWNER TO postgres;

--
-- Name: proforma_invoices_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.proforma_invoices_id_seq OWNED BY public.proforma_invoices.id;


--
-- Name: projects; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.projects (
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


ALTER TABLE public.projects OWNER TO postgres;

--
-- Name: projects_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.projects_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.projects_id_seq OWNER TO postgres;

--
-- Name: projects_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.projects_id_seq OWNED BY public.projects.id;


--
-- Name: purchase_orders; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.purchase_orders (
    id integer NOT NULL,
    po_number text NOT NULL,
    vendor_name text NOT NULL,
    vendor_address text,
    vendor_contact text,
    delivery_address text,
    delivery_date text,
    payment_terms text,
    notes text,
    items jsonb DEFAULT '[]'::jsonb NOT NULL,
    subtotal numeric(15,2) DEFAULT '0'::numeric NOT NULL,
    tax numeric(15,2) DEFAULT '0'::numeric NOT NULL,
    total_amount numeric(15,2) DEFAULT '0'::numeric NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    created_by integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    company_id integer DEFAULT 1 NOT NULL,
    currency text DEFAULT 'SGD'::text NOT NULL,
    vendor_contact_email text,
    quote_ref_no text,
    is_private boolean DEFAULT false NOT NULL,
    issue_date text,
    email_sent_to text,
    customer_id integer,
    customer_po_ref text,
    ack_token text,
    ack_at text,
    ack_note text
);


ALTER TABLE public.purchase_orders OWNER TO postgres;

--
-- Name: purchase_orders_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.purchase_orders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.purchase_orders_id_seq OWNER TO postgres;

--
-- Name: purchase_orders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.purchase_orders_id_seq OWNED BY public.purchase_orders.id;


--
-- Name: quotations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.quotations (
    id integer NOT NULL,
    qt_number text NOT NULL,
    customer_name text NOT NULL,
    customer_address text,
    customer_contact text,
    delivery_address text,
    delivery_date text,
    payment_terms text,
    notes text,
    items jsonb DEFAULT '[]'::jsonb NOT NULL,
    subtotal numeric(15,2) DEFAULT '0'::numeric NOT NULL,
    tax numeric(15,2) DEFAULT '0'::numeric NOT NULL,
    total_amount numeric(15,2) DEFAULT '0'::numeric NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    created_by integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    company_id integer DEFAULT 1 NOT NULL,
    currency text DEFAULT 'SGD'::text NOT NULL,
    customer_contact_email text,
    discount_amount numeric(15,2) DEFAULT '0'::numeric NOT NULL,
    is_private boolean DEFAULT false NOT NULL,
    issue_date text,
    email_sent_to text
);


ALTER TABLE public.quotations OWNER TO postgres;

--
-- Name: quotations_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.quotations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.quotations_id_seq OWNER TO postgres;

--
-- Name: quotations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.quotations_id_seq OWNED BY public.quotations.id;


--
-- Name: session; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.session (
    sid character varying NOT NULL,
    sess json NOT NULL,
    expire timestamp(6) without time zone NOT NULL
);


ALTER TABLE public.session OWNER TO postgres;

--
-- Name: settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.settings (
    id integer NOT NULL,
    gst_rate numeric(5,2) DEFAULT '9'::numeric NOT NULL,
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
    allow_negative_stock boolean DEFAULT false NOT NULL,
    auto_deduct_on_do boolean DEFAULT false NOT NULL,
    low_stock_warning numeric(15,3) DEFAULT 0,
    default_uom text DEFAULT 'pcs'::text,
    company_id integer,
    bank_details text,
    terms_and_conditions text,
    quotation_terms text,
    cn_prefix text DEFAULT 'CN'::text,
    cn_counter integer DEFAULT 1 NOT NULL,
    cn_suffix text DEFAULT ''::text,
    pi_prefix text DEFAULT 'PI'::text,
    pi_counter integer DEFAULT 1 NOT NULL,
    pi_suffix text DEFAULT ''::text,
    pv_prefix text DEFAULT 'PV'::text,
    pv_counter integer DEFAULT 1 NOT NULL,
    pv_suffix text DEFAULT ''::text,
    default_verifier_id integer,
    default_approver_id integer,
    default_paid_by_id integer
);


ALTER TABLE public.settings OWNER TO postgres;

--
-- Name: settings_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.settings_id_seq OWNER TO postgres;

--
-- Name: settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.settings_id_seq OWNED BY public.settings.id;


--
-- Name: stock_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.stock_items (
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
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.stock_items OWNER TO postgres;

--
-- Name: stock_items_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.stock_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.stock_items_id_seq OWNER TO postgres;

--
-- Name: stock_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.stock_items_id_seq OWNED BY public.stock_items.id;


--
-- Name: stock_serials; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.stock_serials (
    id integer NOT NULL,
    company_id integer NOT NULL,
    stock_item_id integer NOT NULL,
    serial_number text NOT NULL,
    status text DEFAULT 'available'::text NOT NULL,
    grn_id integer,
    grn_number text,
    invoice_id integer,
    invoice_number text,
    do_id integer,
    do_number text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    reserved_by_user text
);


ALTER TABLE public.stock_serials OWNER TO postgres;

--
-- Name: stock_serials_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.stock_serials_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.stock_serials_id_seq OWNER TO postgres;

--
-- Name: stock_serials_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.stock_serials_id_seq OWNED BY public.stock_serials.id;


--
-- Name: tax_filings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.tax_filings (
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


ALTER TABLE public.tax_filings OWNER TO postgres;

--
-- Name: tax_filings_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.tax_filings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.tax_filings_id_seq OWNER TO postgres;

--
-- Name: tax_filings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.tax_filings_id_seq OWNED BY public.tax_filings.id;


--
-- Name: user_companies; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_companies (
    id integer NOT NULL,
    user_id integer NOT NULL,
    company_id integer NOT NULL,
    modules jsonb DEFAULT '["purchase_orders", "quotations", "invoices", "delivery_orders"]'::jsonb NOT NULL
);


ALTER TABLE public.user_companies OWNER TO postgres;

--
-- Name: user_companies_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.user_companies_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.user_companies_id_seq OWNER TO postgres;

--
-- Name: user_companies_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.user_companies_id_seq OWNED BY public.user_companies.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    id integer NOT NULL,
    username text NOT NULL,
    password_hash text NOT NULL,
    role text DEFAULT 'user'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    email text
);


ALTER TABLE public.users OWNER TO postgres;

--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.users_id_seq OWNER TO postgres;

--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: vendor_invoices; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.vendor_invoices (
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
    created_by integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    expense_account_id integer,
    gst_treatment text DEFAULT 'standard_rated'::text NOT NULL,
    gst_rate numeric(5,2) DEFAULT 9 NOT NULL,
    gst_amount numeric(15,2) DEFAULT 0 NOT NULL,
    gst_inclusive boolean DEFAULT false NOT NULL,
    exchange_rate numeric(10,6) DEFAULT 1.000000 NOT NULL
);


ALTER TABLE public.vendor_invoices OWNER TO postgres;

--
-- Name: vendor_invoices_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.vendor_invoices_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.vendor_invoices_id_seq OWNER TO postgres;

--
-- Name: vendor_invoices_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.vendor_invoices_id_seq OWNED BY public.vendor_invoices.id;


--
-- Name: vendor_payments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.vendor_payments (
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


ALTER TABLE public.vendor_payments OWNER TO postgres;

--
-- Name: vendor_payments_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.vendor_payments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.vendor_payments_id_seq OWNER TO postgres;

--
-- Name: vendor_payments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.vendor_payments_id_seq OWNED BY public.vendor_payments.id;


--
-- Name: vendors; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.vendors (
    id integer NOT NULL,
    company_id integer NOT NULL,
    name text NOT NULL,
    address text,
    country text,
    contact_person text,
    contact_email text,
    phone text,
    gst_registered boolean DEFAULT false NOT NULL,
    gst_no text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    postal_code text,
    currency text
);


ALTER TABLE public.vendors OWNER TO postgres;

--
-- Name: vendors_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.vendors_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.vendors_id_seq OWNER TO postgres;

--
-- Name: vendors_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.vendors_id_seq OWNED BY public.vendors.id;


--
-- Name: voucher_attachments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.voucher_attachments (
    id integer NOT NULL,
    voucher_id integer NOT NULL,
    file_name text DEFAULT 'attachment'::text NOT NULL,
    mime_type text DEFAULT 'image/jpeg'::text NOT NULL,
    file_data text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.voucher_attachments OWNER TO postgres;

--
-- Name: voucher_attachments_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.voucher_attachments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.voucher_attachments_id_seq OWNER TO postgres;

--
-- Name: voucher_attachments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.voucher_attachments_id_seq OWNED BY public.voucher_attachments.id;


--
-- Name: vouchers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.vouchers (
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
    created_by integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    proof_data text,
    proof_mime_type text,
    verifier_id integer,
    approver_id integer,
    paid_by_id integer,
    verified_at text,
    approved_at text,
    prepared_by_name text
);


ALTER TABLE public.vouchers OWNER TO postgres;

--
-- Name: vouchers_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.vouchers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.vouchers_id_seq OWNER TO postgres;

--
-- Name: vouchers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.vouchers_id_seq OWNED BY public.vouchers.id;


--
-- Name: wht_records; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.wht_records (
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


ALTER TABLE public.wht_records OWNER TO postgres;

--
-- Name: wht_records_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.wht_records_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.wht_records_id_seq OWNER TO postgres;

--
-- Name: wht_records_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.wht_records_id_seq OWNED BY public.wht_records.id;


--
-- Name: accounts id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.accounts ALTER COLUMN id SET DEFAULT nextval('public.accounts_id_seq'::regclass);


--
-- Name: audit_logs id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_logs ALTER COLUMN id SET DEFAULT nextval('public.audit_logs_id_seq'::regclass);


--
-- Name: companies id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.companies ALTER COLUMN id SET DEFAULT nextval('public.companies_id_seq'::regclass);


--
-- Name: credit_notes id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.credit_notes ALTER COLUMN id SET DEFAULT nextval('public.credit_notes_id_seq'::regclass);


--
-- Name: customer_deposits id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.customer_deposits ALTER COLUMN id SET DEFAULT nextval('public.customer_deposits_id_seq'::regclass);


--
-- Name: customers id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.customers ALTER COLUMN id SET DEFAULT nextval('public.customers_id_seq'::regclass);


--
-- Name: debit_notes id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.debit_notes ALTER COLUMN id SET DEFAULT nextval('public.debit_notes_id_seq'::regclass);


--
-- Name: delivery_orders id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.delivery_orders ALTER COLUMN id SET DEFAULT nextval('public.delivery_orders_id_seq'::regclass);


--
-- Name: email_contacts id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.email_contacts ALTER COLUMN id SET DEFAULT nextval('public.email_contacts_id_seq'::regclass);


--
-- Name: expenses id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.expenses ALTER COLUMN id SET DEFAULT nextval('public.expenses_id_seq'::regclass);


--
-- Name: grn id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.grn ALTER COLUMN id SET DEFAULT nextval('public.grn_id_seq'::regclass);


--
-- Name: income_records id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.income_records ALTER COLUMN id SET DEFAULT nextval('public.income_records_id_seq'::regclass);


--
-- Name: invoice_payments id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoice_payments ALTER COLUMN id SET DEFAULT nextval('public.invoice_payments_id_seq'::regclass);


--
-- Name: invoices id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoices ALTER COLUMN id SET DEFAULT nextval('public.invoices_id_seq'::regclass);


--
-- Name: journal_entries id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.journal_entries ALTER COLUMN id SET DEFAULT nextval('public.journal_entries_id_seq'::regclass);


--
-- Name: journal_lines id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.journal_lines ALTER COLUMN id SET DEFAULT nextval('public.journal_lines_id_seq'::regclass);


--
-- Name: maintenance id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.maintenance ALTER COLUMN id SET DEFAULT nextval('public.maintenance_id_seq'::regclass);


--
-- Name: proforma_invoices id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.proforma_invoices ALTER COLUMN id SET DEFAULT nextval('public.proforma_invoices_id_seq'::regclass);


--
-- Name: projects id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.projects ALTER COLUMN id SET DEFAULT nextval('public.projects_id_seq'::regclass);


--
-- Name: purchase_orders id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.purchase_orders ALTER COLUMN id SET DEFAULT nextval('public.purchase_orders_id_seq'::regclass);


--
-- Name: quotations id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.quotations ALTER COLUMN id SET DEFAULT nextval('public.quotations_id_seq'::regclass);


--
-- Name: settings id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.settings ALTER COLUMN id SET DEFAULT nextval('public.settings_id_seq'::regclass);


--
-- Name: stock_items id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.stock_items ALTER COLUMN id SET DEFAULT nextval('public.stock_items_id_seq'::regclass);


--
-- Name: stock_serials id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.stock_serials ALTER COLUMN id SET DEFAULT nextval('public.stock_serials_id_seq'::regclass);


--
-- Name: tax_filings id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tax_filings ALTER COLUMN id SET DEFAULT nextval('public.tax_filings_id_seq'::regclass);


--
-- Name: user_companies id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_companies ALTER COLUMN id SET DEFAULT nextval('public.user_companies_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: vendor_invoices id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vendor_invoices ALTER COLUMN id SET DEFAULT nextval('public.vendor_invoices_id_seq'::regclass);


--
-- Name: vendor_payments id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vendor_payments ALTER COLUMN id SET DEFAULT nextval('public.vendor_payments_id_seq'::regclass);


--
-- Name: vendors id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vendors ALTER COLUMN id SET DEFAULT nextval('public.vendors_id_seq'::regclass);


--
-- Name: voucher_attachments id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.voucher_attachments ALTER COLUMN id SET DEFAULT nextval('public.voucher_attachments_id_seq'::regclass);


--
-- Name: vouchers id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vouchers ALTER COLUMN id SET DEFAULT nextval('public.vouchers_id_seq'::regclass);


--
-- Name: wht_records id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.wht_records ALTER COLUMN id SET DEFAULT nextval('public.wht_records_id_seq'::regclass);


--
-- Data for Name: accounts; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.accounts (id, company_id, code, name, type, sub_type, description, is_active, is_system, created_at) FROM stdin;
1	1	1000	Cash & Cash Equivalents	asset	current_asset	\N	t	t	2026-06-17 11:31:03.900508+00
2	1	1010	Cash at Bank - SGD	asset	current_asset	\N	t	t	2026-06-17 11:31:03.900508+00
3	1	1020	Cash at Bank - Foreign Currency	asset	current_asset	\N	t	f	2026-06-17 11:31:03.900508+00
4	1	1030	Petty Cash	asset	current_asset	\N	t	f	2026-06-17 11:31:03.900508+00
5	1	1100	Accounts Receivable (Trade Debtors)	asset	current_asset	\N	t	t	2026-06-17 11:31:03.900508+00
6	1	1110	GST Input Tax Recoverable	asset	current_asset	\N	t	t	2026-06-17 11:31:03.900508+00
7	1	1120	Other Receivables	asset	current_asset	\N	t	f	2026-06-17 11:31:03.900508+00
8	1	1200	Inventory / Stock	asset	current_asset	\N	t	f	2026-06-17 11:31:03.900508+00
9	1	1300	Prepayments	asset	current_asset	\N	t	f	2026-06-17 11:31:03.900508+00
10	1	1400	Deposits Paid	asset	current_asset	\N	t	f	2026-06-17 11:31:03.900508+00
11	1	1500	Fixed Assets - Equipment	asset	fixed_asset	\N	t	f	2026-06-17 11:31:03.900508+00
12	1	1510	Less: Accumulated Depreciation - Equipment	asset	fixed_asset	\N	t	f	2026-06-17 11:31:03.900508+00
13	1	1600	Fixed Assets - Furniture & Fittings	asset	fixed_asset	\N	t	f	2026-06-17 11:31:03.900508+00
14	1	1610	Less: Accumulated Depreciation - F&F	asset	fixed_asset	\N	t	f	2026-06-17 11:31:03.900508+00
15	1	1700	Fixed Assets - Office Renovation	asset	fixed_asset	\N	t	f	2026-06-17 11:31:03.900508+00
16	1	1710	Less: Accumulated Depreciation - Renovation	asset	fixed_asset	\N	t	f	2026-06-17 11:31:03.900508+00
17	1	2000	Accounts Payable (Trade Creditors)	liability	current_liability	\N	t	t	2026-06-17 11:31:03.900508+00
18	1	2010	GST Output Tax Payable	liability	current_liability	\N	t	t	2026-06-17 11:31:03.900508+00
19	1	2020	Accrued Liabilities	liability	current_liability	\N	t	f	2026-06-17 11:31:03.900508+00
20	1	2030	Deferred Revenue	liability	current_liability	\N	t	f	2026-06-17 11:31:03.900508+00
21	1	2040	Staff Salaries Payable	liability	current_liability	\N	t	f	2026-06-17 11:31:03.900508+00
22	1	2050	CPF Contributions Payable	liability	current_liability	\N	t	f	2026-06-17 11:31:03.900508+00
23	1	2060	Other Current Liabilities	liability	current_liability	\N	t	f	2026-06-17 11:31:03.900508+00
24	1	2100	Director's Loan	liability	current_liability	\N	t	f	2026-06-17 11:31:03.900508+00
25	1	2200	Bank Loan	liability	long_term_liability	\N	t	f	2026-06-17 11:31:03.900508+00
26	1	2300	Other Long-term Liabilities	liability	long_term_liability	\N	t	f	2026-06-17 11:31:03.900508+00
27	1	3000	Paid-up Share Capital	equity	share_capital	\N	t	t	2026-06-17 11:31:03.900508+00
28	1	3100	Retained Earnings	equity	retained_earnings	\N	t	t	2026-06-17 11:31:03.900508+00
29	1	3200	Current Year Earnings	equity	retained_earnings	\N	t	t	2026-06-17 11:31:03.900508+00
30	1	4000	Sales Revenue	revenue	sales	\N	t	t	2026-06-17 11:31:03.900508+00
31	1	4100	Service Revenue	revenue	sales	\N	t	f	2026-06-17 11:31:03.900508+00
32	1	4200	Other Operating Revenue	revenue	other_income	\N	t	f	2026-06-17 11:31:03.900508+00
33	1	4300	Interest Income	revenue	other_income	\N	t	f	2026-06-17 11:31:03.900508+00
34	1	4400	Foreign Exchange Gain	revenue	other_income	\N	t	f	2026-06-17 11:31:03.900508+00
35	1	5000	Cost of Goods Sold	expense	cost_of_sales	\N	t	f	2026-06-17 11:31:03.900508+00
36	1	5100	Direct Materials	expense	cost_of_sales	\N	t	f	2026-06-17 11:31:03.900508+00
37	1	5200	Direct Labour	expense	cost_of_sales	\N	t	f	2026-06-17 11:31:03.900508+00
38	1	5300	Subcontractor Costs	expense	cost_of_sales	\N	t	f	2026-06-17 11:31:03.900508+00
39	1	6000	Salaries and Wages	expense	operating_expense	\N	t	f	2026-06-17 11:31:03.900508+00
40	1	6010	CPF Contributions (Employer)	expense	operating_expense	\N	t	f	2026-06-17 11:31:03.900508+00
41	1	6020	Employee Benefits	expense	operating_expense	\N	t	f	2026-06-17 11:31:03.900508+00
42	1	6100	Rent and Utilities	expense	operating_expense	\N	t	f	2026-06-17 11:31:03.900508+00
43	1	6110	Electricity and Water	expense	operating_expense	\N	t	f	2026-06-17 11:31:03.900508+00
44	1	6200	Office Supplies	expense	operating_expense	\N	t	f	2026-06-17 11:31:03.900508+00
45	1	6300	Telephone and Internet	expense	operating_expense	\N	t	f	2026-06-17 11:31:03.900508+00
46	1	6400	Professional Fees	expense	operating_expense	\N	t	f	2026-06-17 11:31:03.900508+00
47	1	6500	Marketing and Advertising	expense	operating_expense	\N	t	f	2026-06-17 11:31:03.900508+00
48	1	6600	Travel and Entertainment	expense	operating_expense	\N	t	f	2026-06-17 11:31:03.900508+00
49	1	6700	Depreciation	expense	operating_expense	\N	t	f	2026-06-17 11:31:03.900508+00
50	1	6800	Bank Charges and Fees	expense	operating_expense	\N	t	f	2026-06-17 11:31:03.900508+00
51	1	6900	Insurance	expense	operating_expense	\N	t	f	2026-06-17 11:31:03.900508+00
52	1	7000	Repairs and Maintenance	expense	operating_expense	\N	t	f	2026-06-17 11:31:03.900508+00
53	1	7100	Foreign Exchange Loss	expense	operating_expense	\N	t	f	2026-06-17 11:31:03.900508+00
54	1	7200	Miscellaneous Expenses	expense	operating_expense	\N	t	f	2026-06-17 11:31:03.900508+00
55	1	7300	Income Tax Expense	expense	operating_expense	\N	t	f	2026-06-17 11:31:03.900508+00
56	2	1000	Cash & Cash Equivalents	asset	current_asset	\N	t	t	2026-06-19 11:05:47.486754+00
57	2	1010	Cash at Bank - SGD	asset	current_asset	\N	t	t	2026-06-19 11:05:47.486754+00
58	2	1020	Cash at Bank - Foreign Currency	asset	current_asset	\N	t	f	2026-06-19 11:05:47.486754+00
59	2	1030	Petty Cash	asset	current_asset	\N	t	f	2026-06-19 11:05:47.486754+00
60	2	1100	Accounts Receivable (Trade Debtors)	asset	current_asset	\N	t	t	2026-06-19 11:05:47.486754+00
61	2	1110	GST Input Tax Recoverable	asset	current_asset	\N	t	t	2026-06-19 11:05:47.486754+00
62	2	1120	Other Receivables	asset	current_asset	\N	t	f	2026-06-19 11:05:47.486754+00
63	2	1200	Inventory / Stock	asset	current_asset	\N	t	f	2026-06-19 11:05:47.486754+00
64	2	1300	Prepayments	asset	current_asset	\N	t	f	2026-06-19 11:05:47.486754+00
65	2	1400	Deposits Paid	asset	current_asset	\N	t	f	2026-06-19 11:05:47.486754+00
66	2	1500	Fixed Assets - Equipment	asset	fixed_asset	\N	t	f	2026-06-19 11:05:47.486754+00
67	2	1510	Less: Accumulated Depreciation - Equipment	asset	fixed_asset	\N	t	f	2026-06-19 11:05:47.486754+00
68	2	1600	Fixed Assets - Furniture & Fittings	asset	fixed_asset	\N	t	f	2026-06-19 11:05:47.486754+00
69	2	1610	Less: Accumulated Depreciation - F&F	asset	fixed_asset	\N	t	f	2026-06-19 11:05:47.486754+00
70	2	1700	Fixed Assets - Office Renovation	asset	fixed_asset	\N	t	f	2026-06-19 11:05:47.486754+00
71	2	1710	Less: Accumulated Depreciation - Renovation	asset	fixed_asset	\N	t	f	2026-06-19 11:05:47.486754+00
72	2	2000	Accounts Payable (Trade Creditors)	liability	current_liability	\N	t	t	2026-06-19 11:05:47.486754+00
73	2	2010	GST Output Tax Payable	liability	current_liability	\N	t	t	2026-06-19 11:05:47.486754+00
74	2	2020	Accrued Liabilities	liability	current_liability	\N	t	f	2026-06-19 11:05:47.486754+00
75	2	2030	Deferred Revenue	liability	current_liability	\N	t	f	2026-06-19 11:05:47.486754+00
76	2	2040	Staff Salaries Payable	liability	current_liability	\N	t	f	2026-06-19 11:05:47.486754+00
77	2	2050	CPF Contributions Payable	liability	current_liability	\N	t	f	2026-06-19 11:05:47.486754+00
78	2	2060	Other Current Liabilities	liability	current_liability	\N	t	f	2026-06-19 11:05:47.486754+00
79	2	2100	Director's Loan	liability	current_liability	\N	t	f	2026-06-19 11:05:47.486754+00
80	2	2200	Bank Loan	liability	long_term_liability	\N	t	f	2026-06-19 11:05:47.486754+00
81	2	2300	Other Long-term Liabilities	liability	long_term_liability	\N	t	f	2026-06-19 11:05:47.486754+00
82	2	3000	Paid-up Share Capital	equity	share_capital	\N	t	t	2026-06-19 11:05:47.486754+00
83	2	3100	Retained Earnings	equity	retained_earnings	\N	t	t	2026-06-19 11:05:47.486754+00
84	2	3200	Current Year Earnings	equity	retained_earnings	\N	t	t	2026-06-19 11:05:47.486754+00
85	2	4000	Sales Revenue	revenue	sales	\N	t	t	2026-06-19 11:05:47.486754+00
86	2	4100	Service Revenue	revenue	sales	\N	t	f	2026-06-19 11:05:47.486754+00
87	2	4200	Other Operating Revenue	revenue	other_income	\N	t	f	2026-06-19 11:05:47.486754+00
88	2	4300	Interest Income	revenue	other_income	\N	t	f	2026-06-19 11:05:47.486754+00
89	2	4400	Foreign Exchange Gain	revenue	other_income	\N	t	f	2026-06-19 11:05:47.486754+00
90	2	5000	Cost of Goods Sold	expense	cost_of_sales	\N	t	f	2026-06-19 11:05:47.486754+00
91	2	5100	Direct Materials	expense	cost_of_sales	\N	t	f	2026-06-19 11:05:47.486754+00
92	2	5200	Direct Labour	expense	cost_of_sales	\N	t	f	2026-06-19 11:05:47.486754+00
93	2	5300	Subcontractor Costs	expense	cost_of_sales	\N	t	f	2026-06-19 11:05:47.486754+00
94	2	6000	Salaries and Wages	expense	operating_expense	\N	t	f	2026-06-19 11:05:47.486754+00
95	2	6010	CPF Contributions (Employer)	expense	operating_expense	\N	t	f	2026-06-19 11:05:47.486754+00
96	2	6020	Employee Benefits	expense	operating_expense	\N	t	f	2026-06-19 11:05:47.486754+00
97	2	6100	Rent and Utilities	expense	operating_expense	\N	t	f	2026-06-19 11:05:47.486754+00
98	2	6110	Electricity and Water	expense	operating_expense	\N	t	f	2026-06-19 11:05:47.486754+00
99	2	6200	Office Supplies	expense	operating_expense	\N	t	f	2026-06-19 11:05:47.486754+00
100	2	6300	Telephone and Internet	expense	operating_expense	\N	t	f	2026-06-19 11:05:47.486754+00
101	2	6400	Professional Fees	expense	operating_expense	\N	t	f	2026-06-19 11:05:47.486754+00
102	2	6500	Marketing and Advertising	expense	operating_expense	\N	t	f	2026-06-19 11:05:47.486754+00
103	2	6600	Travel and Entertainment	expense	operating_expense	\N	t	f	2026-06-19 11:05:47.486754+00
104	2	6700	Depreciation	expense	operating_expense	\N	t	f	2026-06-19 11:05:47.486754+00
105	2	6800	Bank Charges and Fees	expense	operating_expense	\N	t	f	2026-06-19 11:05:47.486754+00
106	2	6900	Insurance	expense	operating_expense	\N	t	f	2026-06-19 11:05:47.486754+00
107	2	7000	Repairs and Maintenance	expense	operating_expense	\N	t	f	2026-06-19 11:05:47.486754+00
108	2	7100	Foreign Exchange Loss	expense	operating_expense	\N	t	f	2026-06-19 11:05:47.486754+00
109	2	7200	Miscellaneous Expenses	expense	operating_expense	\N	t	f	2026-06-19 11:05:47.486754+00
110	2	7300	Income Tax Expense	expense	operating_expense	\N	t	f	2026-06-19 11:05:47.486754+00
111	1	2035	Customer Deposits / Advance Receipts	liability	current_liability	\N	t	f	2026-06-26 03:50:04.111425+00
112	2	2035	Customer Deposits / Advance Receipts	liability	current_liability	\N	t	f	2026-06-26 03:50:04.111425+00
113	3	2035	Customer Deposits / Advance Receipts	liability	current_liability	\N	t	f	2026-06-26 03:50:04.111425+00
\.


--
-- Data for Name: audit_logs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.audit_logs (id, company_id, user_id, username, action, entity_type, entity_id, entity_label, details, ip_address, created_at) FROM stdin;
1	1	1	\N	payment:delete	vendor_invoice	3	INV757576	\N	203.118.18.157	2026-04-30 07:43:54.811716+00
2	1	1	\N	payment:add	vendor_invoice	3	INV757576	{"amount": "200.00", "reference": "2113443211"}	203.118.18.157	2026-04-30 07:44:51.928734+00
3	1	1	admin	delete	invoice	3	INV-0003	\N	203.118.18.157	2026-05-08 04:06:05.658914+00
4	1	1	admin	delete	invoice	2	INV-0002	\N	203.118.18.157	2026-05-08 04:06:13.526526+00
5	1	1	admin	create	quotation	1	RQT-0001	\N	203.118.18.157	2026-05-08 05:56:29.1801+00
6	1	1	admin	create	quotation	2	RQT-0002	\N	203.118.18.157	2026-05-08 06:08:42.502456+00
7	1	1	admin	status:confirmed	invoice	6	INV-0006	\N	203.118.18.157	2026-05-08 06:12:41.478801+00
8	1	1	admin	create	invoice	7	INV-0007	\N	101.127.86.83	2026-06-03 06:16:44.733074+00
9	1	1	admin	update	invoice	7	INV-0007	\N	101.127.86.83	2026-06-03 06:17:11.116589+00
10	1	1	admin	create	invoice	8	INV-0008	\N	101.127.86.83	2026-06-03 06:38:22.404834+00
11	1	1	admin	update	invoice	8	INV-0008	\N	101.127.86.83	2026-06-03 06:39:17.690135+00
12	1	1	admin	update	invoice	8	INV-0008	\N	101.127.86.83	2026-06-03 06:39:56.545332+00
13	1	1	admin	update	invoice	8	INV-0008	\N	101.127.86.83	2026-06-03 06:41:00.677196+00
14	1	1	admin	update	invoice	8	INV-0008	\N	127.0.0.1	2026-06-03 06:46:57.156341+00
15	1	1	admin	update	invoice	8	INV-0008	\N	127.0.0.1	2026-06-03 06:48:07.660674+00
16	1	1	admin	update	invoice	8	INV-0008	\N	127.0.0.1	2026-06-03 06:48:16.624459+00
17	1	1	admin	update	invoice	7	INV-0007	\N	101.127.86.83	2026-06-03 06:49:12.06981+00
18	1	1	admin	update	invoice	8	INV-0008	\N	203.118.18.157	2026-06-04 03:57:57.050848+00
19	1	1	admin	update	invoice	8	INV-0008	\N	203.118.18.157	2026-06-04 04:02:03.884545+00
20	1	1	admin	create	invoice	9	INV-0009	\N	101.127.86.83	2026-06-09 10:42:44.091705+00
21	1	1	admin	update	invoice	9	INV-0009	\N	101.127.86.83	2026-06-09 10:43:23.378958+00
22	1	1	admin	create	invoice	10	INV-0010	\N	101.127.86.83	2026-06-09 10:47:44.113661+00
23	1	1	admin	update	invoice	10	INV-0010	\N	101.127.86.83	2026-06-09 10:49:29.602196+00
24	1	1	admin	update	invoice	10	INV-0010	\N	101.127.86.83	2026-06-09 10:49:37.144956+00
25	1	1	admin	update	invoice	10	INV-0010	\N	101.127.86.83	2026-06-09 10:54:41.944083+00
26	1	1	admin	create	invoice	11	RIN260101	\N	101.127.86.83	2026-06-09 13:06:00.299962+00
27	1	1	admin	create	invoice	12	RIN260102	\N	101.127.86.83	2026-06-09 13:09:33.718478+00
28	1	1	admin	update	invoice	12	RIN260102	\N	101.127.86.83	2026-06-09 13:10:42.876709+00
29	1	1	admin	update	invoice	12	RIN260102	\N	101.127.86.83	2026-06-09 13:11:00.724939+00
30	1	1	admin	update	invoice	12	RIN260102	\N	101.127.86.83	2026-06-09 13:11:56.709927+00
31	1	1	admin	update	invoice	12	RIN260102	\N	101.127.86.83	2026-06-09 13:15:24.450857+00
32	1	1	admin	update	invoice	12	RIN260102	\N	101.127.86.83	2026-06-09 13:41:20.149391+00
33	1	1	admin	update	invoice	12	RIN260102	\N	101.127.86.83	2026-06-09 13:48:33.563783+00
34	1	1	admin	create	invoice	13	RIN260103	\N	101.127.86.83	2026-06-17 17:31:57.004185+00
35	1	1	admin	update	invoice	13	RIN260103	\N	101.127.86.83	2026-06-17 17:32:42.992066+00
36	1	1	admin	update	invoice	13	RIN260103	\N	101.127.86.83	2026-06-17 17:34:29.321905+00
37	1	1	admin	update	invoice	13	RIN260103	\N	101.127.86.83	2026-06-17 17:35:04.758111+00
38	1	1	admin	update	invoice	13	RIN260103	\N	101.127.86.83	2026-06-17 17:36:33.674328+00
39	1	1	admin	update	invoice	13	RIN260103	\N	101.127.86.83	2026-06-17 17:41:13.060921+00
40	1	1	admin	update	invoice	13	RIN260103	\N	101.127.86.83	2026-06-17 17:52:36.689006+00
41	1	1	admin	update	invoice	13	RIN260103	\N	101.127.86.83	2026-06-17 17:53:25.929578+00
42	1	1	admin	update	invoice	13	RIN260103	\N	101.127.86.83	2026-06-17 17:54:52.266831+00
43	1	1	admin	update	invoice	13	RIN260103	\N	101.127.86.83	2026-06-17 17:57:36.502762+00
44	1	1	admin	update	invoice	13	RIN260103	\N	101.127.86.83	2026-06-17 17:57:53.059697+00
45	1	1	admin	update	invoice	13	RIN260103	\N	101.127.86.83	2026-06-17 17:58:41.392518+00
46	1	1	admin	update	invoice	13	RIN260103	\N	101.127.86.83	2026-06-17 17:59:55.966938+00
47	1	1	admin	update	invoice	13	RIN260103	\N	101.127.86.83	2026-06-17 18:00:27.019455+00
48	1	1	admin	update	invoice	13	RIN260103	\N	101.127.86.83	2026-06-17 18:03:20.040688+00
49	1	1	admin	update	invoice	13	RIN260103	\N	101.127.86.83	2026-06-17 18:04:16.578701+00
50	1	1	admin	update	invoice	13	RIN260103	\N	101.127.86.83	2026-06-17 18:04:36.822567+00
51	1	1	admin	update	invoice	13	RIN260103	\N	101.127.86.83	2026-06-17 18:08:33.18254+00
52	1	1	admin	update	invoice	13	RIN260103	\N	101.127.86.83	2026-06-17 18:09:01.72645+00
53	1	1	admin	update	invoice	13	RIN260103	\N	101.127.86.83	2026-06-17 18:09:41.822429+00
54	1	1	admin	update	invoice	13	RIN260103	\N	101.127.86.83	2026-06-17 18:10:51.536146+00
55	1	1	admin	update	invoice	13	RIN260103	\N	101.127.86.83	2026-06-17 18:14:00.326284+00
56	1	1	admin	update	invoice	9	INV-0009	\N	101.127.86.83	2026-06-17 18:18:57.673689+00
57	1	1	admin	update	invoice	9	INV-0009	\N	101.127.86.83	2026-06-17 18:19:30.289974+00
58	1	1	admin	update	invoice	9	INV-0009	\N	101.127.86.83	2026-06-17 18:37:48.682287+00
59	1	1	admin	status:confirmed	invoice	13	RIN260103	\N	203.118.18.157	2026-06-19 04:23:42.36573+00
60	1	1	admin	update	invoice	13	RIN260103	\N	203.118.18.157	2026-06-19 04:24:24.557397+00
61	1	1	admin	status:confirmed	invoice	13	RIN260103	\N	127.0.0.1	2026-06-19 04:34:29.44656+00
62	1	1	admin	void	invoice	13	RIN260103	{"voidReason": "Test void - auto-post verification"}	127.0.0.1	2026-06-19 04:35:35.745284+00
63	1	1	admin	create	vendor_invoice	4	TEST-AUTO-001	\N	127.0.0.1	2026-06-19 05:19:49.621544+00
64	1	1	admin	payment:add	vendor_invoice	4	TEST-AUTO-001	{"amount": "500.00", "reference": "TT-20260619"}	127.0.0.1	2026-06-19 05:20:08.90379+00
65	1	1	admin	delete	vendor_invoice	4	TEST-AUTO-001	\N	127.0.0.1	2026-06-19 05:20:17.024247+00
66	1	1	admin	create	invoice	14	RIN260104	\N	203.118.18.157	2026-06-24 02:34:33.544134+00
67	1	1	admin	create	invoice	15	RIN260105	\N	203.118.18.157	2026-06-24 02:35:52.4609+00
68	1	1	admin	update	invoice	14	RIN260104	\N	203.118.18.157	2026-06-24 05:34:44.691014+00
69	1	1	admin	update	invoice	14	RIN260104	\N	203.118.18.157	2026-06-24 05:35:41.993435+00
70	1	1	admin	update	invoice	15	RIN260105	\N	203.118.18.157	2026-06-24 05:54:16.297373+00
71	1	1	admin	status:confirmed	invoice	14	RIN260104	\N	203.118.18.157	2026-06-24 09:43:13.912709+00
72	1	1	admin	status:confirmed	invoice	15	RIN260105	\N	203.118.18.157	2026-06-24 09:43:51.600204+00
73	1	1	admin	update	invoice	14	RIN260104	\N	203.118.18.157	2026-06-24 10:00:34.297912+00
74	1	1	admin	update	invoice	14	RIN260104	\N	203.118.18.157	2026-06-24 10:02:39.668156+00
75	1	1	admin	update	invoice	14	RIN260104	\N	203.118.18.157	2026-06-24 10:08:43.351245+00
76	1	1	admin	create	purchase_order	2	RPO2	\N	203.118.18.157	2026-06-26 09:48:16.999766+00
77	1	1	admin	mark-sent	purchase_order	2	RPO2	\N	203.118.18.157	2026-06-26 10:05:47.899862+00
78	1	1	admin	mark-sent	purchase_order	2	RPO2	\N	203.118.18.157	2026-06-26 10:55:42.28992+00
79	2	1	admin	create	invoice	16	INV1	\N	203.118.18.157	2026-06-29 07:20:50.112102+00
80	2	1	admin	update	invoice	16	INV1	\N	203.118.18.157	2026-06-29 07:23:29.43809+00
81	2	1	admin	update	invoice	16	INV1	\N	203.118.18.157	2026-06-29 07:25:31.805571+00
82	2	1	admin	update	invoice	16	INV1	\N	203.118.18.157	2026-06-29 07:25:36.657309+00
83	1	1	admin	status:draft	quotation	2	RQT-0002	\N	203.118.18.157	2026-06-30 10:01:50.558979+00
84	1	1	admin	status:draft	quotation	2	RQT-0002	\N	203.118.18.157	2026-06-30 10:05:40.409958+00
85	1	1	admin	status:confirmed	invoice	10	INV-0010	\N	203.118.18.157	2026-06-30 10:07:43.478136+00
86	1	1	admin	update	invoice	10	INV-0010	\N	203.118.18.157	2026-06-30 10:08:29.930663+00
87	1	1	admin	mark-sent	quotation	2	RQT-0002	\N	151.192.195.18	2026-07-09 07:13:47.399811+00
88	1	1	admin	status:confirmed	quotation	2	RQT-0002	\N	151.192.195.18	2026-07-09 07:14:05.720138+00
89	1	1	admin	create	project	1	\N	\N	203.92.68.134	2026-07-13 08:37:49.950072+00
90	1	1	admin	create	voucher	1	\N	\N	203.92.68.134	2026-07-13 08:40:13.545214+00
91	1	1	admin	update	voucher	1	\N	{"status": "paid"}	101.127.86.83	2026-07-13 13:33:12.177381+00
92	1	1	admin	update	voucher	1	\N	{"status": "draft"}	101.127.86.83	2026-07-13 13:34:01.847456+00
93	1	1	admin	update	voucher	1	\N	{"status": "paid"}	101.127.86.83	2026-07-13 13:34:21.209213+00
94	1	1	admin	update	voucher	1	\N	{"status": "draft"}	101.127.86.83	2026-07-13 13:38:46.893657+00
95	1	1	admin	update	voucher	1	\N	{"status": "paid"}	101.127.86.83	2026-07-13 13:39:14.95686+00
96	1	1	admin	update	voucher	1	\N	{"status": "draft"}	101.127.86.83	2026-07-13 13:40:42.496483+00
97	1	1	admin	update	voucher	1	\N	\N	101.127.86.83	2026-07-13 13:52:11.348912+00
98	1	1	admin	update	voucher	1	\N	{"status": "paid"}	101.127.86.83	2026-07-13 13:52:23.120985+00
99	1	1	admin	update	voucher	1	\N	{"status": "draft"}	101.127.86.83	2026-07-13 13:53:24.425555+00
100	1	1	admin	update	voucher	1	\N	\N	101.127.86.83	2026-07-13 13:53:36.048713+00
101	1	1	admin	update	voucher	1	\N	\N	101.127.86.83	2026-07-13 13:56:48.692616+00
102	1	1	admin	update	voucher	1	\N	{"status": "paid"}	101.127.86.83	2026-07-13 13:58:17.899644+00
103	1	1	admin	update	voucher	1	\N	{"status": "draft"}	101.127.86.83	2026-07-13 14:01:19.837898+00
104	1	1	admin	update	voucher	1	\N	{"status": "draft"}	101.127.86.83	2026-07-13 14:02:20.029839+00
105	1	1	admin	update	voucher	1	\N	{"status": "paid"}	101.127.86.83	2026-07-13 14:03:42.066321+00
106	1	1	admin	update	voucher	1	\N	{"status": "draft"}	101.127.86.83	2026-07-13 14:08:46.105907+00
107	1	1	admin	update	voucher	1	\N	{"status": "paid"}	101.127.86.83	2026-07-13 14:09:05.89969+00
108	1	1	admin	delete	project	1	\N	\N	101.127.86.83	2026-07-13 14:23:05.124603+00
109	1	1	admin	create	project	2	\N	\N	101.127.86.83	2026-07-13 14:32:23.397727+00
110	1	1	admin	create	voucher	2	\N	\N	101.127.86.83	2026-07-13 14:33:29.546716+00
111	1	1	admin	update	voucher	2	\N	{"status": "paid"}	101.127.86.83	2026-07-13 14:33:50.20617+00
112	1	1	admin	update	voucher	2	\N	{"status": "reverted"}	101.127.86.83	2026-07-13 15:16:32.741937+00
113	1	1	admin	update	voucher	2	\N	{"status": "paid"}	101.127.86.83	2026-07-13 15:16:52.816994+00
114	1	1	admin	create	voucher	4	\N	\N	127.0.0.1	2026-07-13 15:27:41.93092+00
115	1	1	admin	create	voucher	5	\N	\N	127.0.0.1	2026-07-13 15:28:54.35224+00
116	1	1	admin	create	voucher	6	\N	\N	127.0.0.1	2026-07-15 06:23:57.825346+00
117	1	1	admin	delete	voucher	6	\N	\N	127.0.0.1	2026-07-15 06:23:58.078599+00
118	1	1	admin	update	voucher	5	\N	\N	127.0.0.1	2026-07-15 06:29:46.890125+00
119	1	1	admin	update	voucher	5	\N	\N	127.0.0.1	2026-07-15 06:29:47.212024+00
120	1	1	admin	create	project	3	\N	\N	203.118.18.157	2026-07-15 06:34:08.259806+00
121	1	1	admin	update	voucher	5	\N	{"movedToProjectId": 3}	203.118.18.157	2026-07-15 06:34:22.72569+00
122	1	1	admin	create	voucher	7	\N	\N	127.0.0.1	2026-07-15 06:44:04.68967+00
123	1	1	admin	delete	voucher	7	\N	\N	127.0.0.1	2026-07-15 06:44:05.123105+00
124	1	1	admin	status:cancelled	quotation	1	RQT-0001	\N	203.118.18.157	2026-07-17 04:03:35.290876+00
125	1	1	admin	create	expense	1	rental — venkatesh	\N	101.127.86.83	2026-07-23 15:40:07.884522+00
126	1	1	admin	update	expense	1	venkatesh	\N	101.127.86.83	2026-07-23 15:41:01.225498+00
127	1	1	admin	update	expense	1	venkatesh	\N	101.127.86.83	2026-07-23 15:42:37.226282+00
128	1	1	admin	create	expense	2	utilities — Kishore	\N	101.127.86.83	2026-07-23 15:45:07.764447+00
129	1	1	admin	create	expense	3	utilities — Kiran	\N	101.127.86.83	2026-07-23 15:46:42.671341+00
130	1	1	admin	create	expense	4	travel — Vamsi	\N	203.118.18.157	2026-07-24 03:43:23.627967+00
131	1	1	admin	create	expense	5	professional_fees — venkatesh	\N	203.118.18.157	2026-07-24 03:44:11.031318+00
132	1	1	admin	update	expense	5	venkatesh	\N	203.118.18.157	2026-07-29 07:44:12.462154+00
133	1	1	admin	delete	expense	5	venkatesh	\N	203.118.18.157	2026-07-29 07:44:15.407083+00
134	1	1	admin	delete	vendor_invoice	3	INV757576	\N	203.118.18.157	2026-07-30 09:18:15.751957+00
135	1	1	admin	create	vendor_invoice	5	123456789	\N	203.118.18.157	2026-07-30 09:18:37.6312+00
136	1	1	admin	delete	vendor_invoice	5	123456789	\N	203.118.18.157	2026-07-30 09:31:48.526897+00
137	1	1	admin	create	vendor_invoice	6	123124	\N	203.118.18.157	2026-07-30 09:32:09.482847+00
138	1	1	admin	delete	vendor_invoice	6	123124	\N	203.118.18.157	2026-07-30 09:32:25.037983+00
139	1	1	admin	create	vendor_invoice	7	121231	\N	203.118.18.157	2026-07-30 09:33:14.052045+00
140	1	1	admin	create	vendor_invoice	8	1212365	\N	203.118.18.157	2026-07-30 09:34:36.855212+00
141	1	1	admin	delete	vendor_invoice	7	121231	\N	203.118.18.157	2026-07-30 09:34:59.921082+00
142	1	1	admin	delete	vendor_invoice	8	1212365	\N	203.118.18.157	2026-07-30 09:35:03.615415+00
143	1	1	admin	create	vendor_invoice	9	1245454	\N	203.118.18.157	2026-07-30 09:38:00.314453+00
144	1	1	admin	create	vendor_invoice	10	1542511	\N	203.118.18.157	2026-07-30 09:38:26.40848+00
145	1	1	admin	create	vendor_invoice	11	256595	\N	203.118.18.157	2026-07-30 09:38:35.056512+00
146	1	1	admin	delete	vendor_invoice	9	1245454	\N	203.118.18.157	2026-07-30 09:39:18.739312+00
\.


--
-- Data for Name: companies; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.companies (id, name, country, address, registration_no, email, phone, created_at, logo_url, gst_reg_no) FROM stdin;
1	RSV Infotech Pte Ltd	Singapore	#07-52, 10 UBI Crescent, UBI Techpark Lobby C, Singapore 408564	201929506R	connectme@myrsv.com	+65 6123 4567	2026-04-13 05:38:57.429562+00	data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAABwgAAAF/CAYAAABdZJ3FAAAACXBIWXMAAC4jAAAuIwF4pT92AAAGNGlUWHRYTUw6Y29tLmFkb2JlLnhtcAAAAAAAPD94cGFja2V0IGJlZ2luPSLvu78iIGlkPSJXNU0wTXBDZWhpSHpyZVN6TlRjemtjOWQiPz4gPHg6eG1wbWV0YSB4bWxuczp4PSJhZG9iZTpuczptZXRhLyIgeDp4bXB0az0iQWRvYmUgWE1QIENvcmUgOS4xLWMwMDIgNzkuYTZhNjM5NiwgMjAyNC8wMy8xMi0wNzo0ODoyMyAgICAgICAgIj4gPHJkZjpSREYgeG1sbnM6cmRmPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5LzAyLzIyLXJkZi1zeW50YXgtbnMjIj4gPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9IiIgeG1sbnM6eG1wPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvIiB4bWxuczpkYz0iaHR0cDovL3B1cmwub3JnL2RjL2VsZW1lbnRzLzEuMS8iIHhtbG5zOnBob3Rvc2hvcD0iaHR0cDovL25zLmFkb2JlLmNvbS9waG90b3Nob3AvMS4wLyIgeG1sbnM6eG1wTU09Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9tbS8iIHhtbG5zOnN0RXZ0PSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvc1R5cGUvUmVzb3VyY2VFdmVudCMiIHhtcDpDcmVhdG9yVG9vbD0iQWRvYmUgUGhvdG9zaG9wIDI1LjExIChXaW5kb3dzKSIgeG1wOkNyZWF0ZURhdGU9IjIwMjQtMDgtMDZUMTE6MDQ6MTMrMDg6MDAiIHhtcDpNb2RpZnlEYXRlPSIyMDI0LTA4LTA2VDExOjA1OjQ3KzA4OjAwIiB4bXA6TWV0YWRhdGFEYXRlPSIyMDI0LTA4LTA2VDExOjA1OjQ3KzA4OjAwIiBkYzpmb3JtYXQ9ImltYWdlL3BuZyIgcGhvdG9zaG9wOkNvbG9yTW9kZT0iMyIgeG1wTU06SW5zdGFuY2VJRD0ieG1wLmlpZDpjMjY4NGExNS02YjY2LWVjNDUtYjQ0Ni05MDQ5NThlYzg5YTMiIHhtcE1NOkRvY3VtZW50SUQ9ImFkb2JlOmRvY2lkOnBob3Rvc2hvcDo1ZGM2OGNjMC04Y2JmLTAwNDQtOTAzYS0yOTUzZTZmYjdjMDUiIHhtcE1NOk9yaWdpbmFsRG9jdW1lbnRJRD0ieG1wLmRpZDplYzYzODNmNi1lMzI4LTdiNGUtOWE1Ni0wMmRjODM4OGM1MGMiPiA8eG1wTU06SGlzdG9yeT4gPHJkZjpTZXE+IDxyZGY6bGkgc3RFdnQ6YWN0aW9uPSJjcmVhdGVkIiBzdEV2dDppbnN0YW5jZUlEPSJ4bXAuaWlkOmVjNjM4M2Y2LWUzMjgtN2I0ZS05YTU2LTAyZGM4Mzg4YzUwYyIgc3RFdnQ6d2hlbj0iMjAyNC0wOC0wNlQxMTowNDoxMyswODowMCIgc3RFdnQ6c29mdHdhcmVBZ2VudD0iQWRvYmUgUGhvdG9zaG9wIDI1LjExIChXaW5kb3dzKSIvPiA8cmRmOmxpIHN0RXZ0OmFjdGlvbj0iY29udmVydGVkIiBzdEV2dDpwYXJhbWV0ZXJzPSJmcm9tIGFwcGxpY2F0aW9uL3ZuZC5hZG9iZS5waG90b3Nob3AgdG8gaW1hZ2UvcG5nIi8+IDxyZGY6bGkgc3RFdnQ6YWN0aW9uPSJzYXZlZCIgc3RFdnQ6aW5zdGFuY2VJRD0ieG1wLmlpZDpjMjY4NGExNS02YjY2LWVjNDUtYjQ0Ni05MDQ5NThlYzg5YTMiIHN0RXZ0OndoZW49IjIwMjQtMDgtMDZUMTE6MDU6NDcrMDg6MDAiIHN0RXZ0OnNvZnR3YXJlQWdlbnQ9IkFkb2JlIFBob3Rvc2hvcCAyNS4xMSAoV2luZG93cykiIHN0RXZ0OmNoYW5nZWQ9Ii8iLz4gPC9yZGY6U2VxPiA8L3htcE1NOkhpc3Rvcnk+IDwvcmRmOkRlc2NyaXB0aW9uPiA8L3JkZjpSREY+IDwveDp4bXBtZXRhPiA8P3hwYWNrZXQgZW5kPSJyIj8+qfCATgAAkI9JREFUeJzs3XeYZFW1sPG3qrsnRyaRcwYFiSImTCgGRBC95pyzXu/n9Rqu4ZrAhCKoiKIoiAFFQQUkIxJFcg6TGSbnDlXfH6vGGXCG6e6zT506Ve/veeoZZqbPOovp6lPn7LX32pV6vY4kSZIkSZIkSZKkzlAtOgFJkiRJkiRJkiRJzWOBUJIkSZIkSZIk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	\N
2	Netopsys Pte Ltd	Singapore	#07-52, 10 UBI Crescent, UBI Techpark Lobby C, Singapore 408564	202119506K	connectme@netopsys.net	+65 6234 5678	2026-04-13 05:38:57.463327+00	data:image/png;base64,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	\N
3	Netopsys AI Pvt Ltd	India	Door No 39-6-36, Madhavadhara Main Road, Visakhapatnam - 530007	U72900HR2023PTC400123	connectme@netopsys.in	+91 98765 43210	2026-04-13 05:38:57.467254+00	data:image/png;base64,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	\N
\.


--
-- Data for Name: credit_notes; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.credit_notes (id, cn_number, company_id, customer_name, customer_address, contact_person, contact_email, ref_inv_number, reason, issue_date, currency, payment_terms, notes, is_private, items, subtotal, discount_amount, tax_rate, tax, total_amount, status, void_reason, email_sent_to, created_by, created_at) FROM stdin;
\.


--
-- Data for Name: customer_deposits; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.customer_deposits (id, company_id, customer_name, currency, total_amount, applied_amount, status, payment_date, payment_method, bank_ref, notes, journal_entry_id, created_by, created_at) FROM stdin;
\.


--
-- Data for Name: customers; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.customers (id, company_id, name, address, country, contact_person, contact_email, phone, gst_registered, gst_no, is_active, created_at, postal_code, currency, ship_to_address, quotation_terms) FROM stdin;
2	1	Test	Vertex, 33 Ubi Avenue 3, Geylang\nSingapore 408868	\N	Raju DN	illanchaitanya@gmail.com	\N	f	\N	t	2026-06-24 02:34:33.530908+00	\N	\N	\N	\N
3	2	RSV INFOTECH PTE LTD	10 Ubi Crescent, #07-52 UBI Techpark Lobby C\n	Singapore	Suresh	suresh@myrsv.com	+65 9022 5006	t	\N	t	2026-06-29 07:06:49.197208+00	408564	SGD	\N	\N
1	1	SP Sysnet Pte Ltd	Vertex, 33 Ubi Avenue 3, Geylang	Singapore	Raju DN	illanchaitanya@gmail.com	+65 68344426	t	\N	t	2026-04-17 11:28:47.069825+00	408868	SGD	33, Vertex, 33 Ubi Avenue 3, Geylang\n408868	\N
\.


--
-- Data for Name: debit_notes; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.debit_notes (id, dn_number, company_id, customer_name, customer_address, contact_person, contact_email, ref_inv_number, reason, issue_date, currency, payment_terms, notes, is_private, items, subtotal, discount_amount, tax_rate, tax, total_amount, status, void_reason, email_sent_to, created_by, created_at) FROM stdin;
\.


--
-- Data for Name: delivery_orders; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.delivery_orders (id, do_number, customer_name, customer_address, customer_contact, delivery_date, notes, items, status, created_by, created_at, company_id, payment_terms, is_private, issue_date, inv_id, inv_number, email_sent_to) FROM stdin;
2	DO-0003	SP Sysnet Pte Ltd	Vertex, 33 Ubi Avenue 3, Geylang	Raju DN	\N	Auto-created from Invoice INV-0006	[{"qty": 3, "partNumber": "", "description": "Cisco IRS Configuration", "serialNumbers": ""}]	draft	1	2026-05-08 06:12:41.47103+00	1	\N	f	2026-05-08	6	INV-0006	\N
3	DO4	SP Sysnet Pte Ltd	Vertex, 33 Ubi Avenue 3, Geylang\nSingapore 408868	Raju DN	\N	Auto-created from Invoice RIN260103	[{"qty": 1, "partNumber": "", "description": "", "serialNumbers": ""}, {"qty": 1, "partNumber": "", "description": "Emergency ransomware incident response and infrastructure restoration, including after-hours and overnight support, performed from 08-06-2026 (Monday) to 11-06-2026 (Thursday).", "serialNumbers": ""}, {"qty": 0, "partNumber": "", "description": "On-site technical assessment and immediate response to ransomware incident.", "serialNumbers": ""}, {"qty": 0, "partNumber": "", "description": "Active Directory, DNS, and critical infrastructure recovery and stabilization.", "serialNumbers": ""}, {"qty": 0, "partNumber": "", "description": "Hyper-V, SAPServer, and BMSServer recovery and operational validation.", "serialNumbers": ""}, {"qty": 0, "partNumber": "", "description": "Storage and backup recovery operations; large-scale data recovery and migration.", "serialNumbers": ""}, {"qty": 0, "partNumber": "", "description": "System troubleshooting, repair, and network/service stabilization.", "serialNumbers": ""}, {"qty": 0, "partNumber": "", "description": "Business continuity restoration support, recovery planning, and operational monitoring.", "serialNumbers": ""}]	draft	1	2026-06-19 04:23:42.355562+00	1	30 Days Net	f	2026-06-17	13	RIN260103	\N
4	DO5	Test	Vertex, 33 Ubi Avenue 3, Geylang\nSingapore 408868	Raju DN	\N	Auto-created from Invoice RIN260104	[{"qty": 50, "partNumber": "", "description": "<p style=\\"text-align: justify;\\">IT Managed Infrastructure Maintenance Services - iCarePack25: IT Managed Infrastructure Maintenance Services – Ad-hoc basis Annual Contract – RSV iCarePack-50, 50 Hours of IT Services package and valid for 12 months, whichever comes first.</p><p style=\\"text-align: justify;\\">Contract Starts from 01-06-2026 to 31-06-2027.</p><p style=\\"text-align: justify;\\">(Previous iCarePack25 Serviced from 01-05-2024 to extended until 30-09-2025)</p>", "serialNumbers": ""}]	draft	1	2026-06-24 09:43:13.869606+00	1	30 Days Net	f	2026-06-24	14	RIN260104	\N
5	DO6	SP Sysnet Pte Ltd	Vertex, 33 Ubi Avenue 3, Geylang\nSingapore 408868	Raju DN	\N	Auto-created from Invoice RIN260105	[{"qty": 1, "partNumber": "", "description": "<p style=\\"text-align: justify;\\">HP Server DL380 memory Module 16 GB PC4-2666 ECC RDIMM New memory module,</p><p style=\\"text-align: justify;\\">Not refurbished, with 6 Months warranty. Warranty starts from Installed date: 29/04/2026</p>", "serialNumbers": ""}, {"qty": 2, "partNumber": "", "description": "<p>Professional charges to install and get it updated in the HPE SMART BIOS and make sure to detect and work along with existing memory modules.</p>\\n<p>(One time installation and setup cost)</p>\\n<p>Charges are based on 2 hours on-site visit and perform on-site job, regardless of the actual time taken to complete the scope.</p>\\n<p>These charges will be deducted from the iCarepack.</p>", "serialNumbers": ""}, {"qty": 13, "partNumber": "", "description": "<p style=\\"text-align: justify;\\">Microsoft 365 Business Basic (Annual Pre-Paid) license for 12 Months subscription:</p><p style=\\"text-align: justify;\\">Microsoft Office 365 with Teams, secure cloud storage, and Office Online (desktop versions not included). Per user Per year. Includes:</p><ul><li style=\\"text-align: justify;\\"><p style=\\"text-align: justify;\\">Email hosting with 50 GB mailbox and custom email domain address</p></li><li style=\\"text-align: justify;\\"><p style=\\"text-align: justify;\\">Web and mobile versions of Word, Excel, and PowerPoint included</p></li><li style=\\"text-align: justify;\\"><p style=\\"text-align: justify;\\">Host online meetings and video calls for up to 300 people with Microsoft Teams.</p></li><li style=\\"text-align: justify;\\"><p style=\\"text-align: justify;\\">Chat with your team from your desktop or on the go with Microsoft Teams</p></li><li style=\\"text-align: justify;\\"><p style=\\"text-align: justify;\\">Manage calendar, share available meetings, schedule meetings and get reminders.</p></li><li style=\\"text-align: justify;\\"><p style=\\"text-align: justify;\\">File storage and sharing with 1 TB of OneDrive storage</p></li><li style=\\"text-align: justify;\\"><p style=\\"text-align: justify;\\">Every mailbox is protected with premier anti-malware and anti-spam protection via Exchange Online Protection.</p></li></ul><p style=\\"text-align: justify;\\">(Price is back to back with Microsoft)</p>", "serialNumbers": ""}, {"qty": 26, "partNumber": "", "description": "<p style=\\"text-align: justify;\\"><strong>Professional charges to setup Office 365 Exchange on Microsoft Online:</strong></p><p style=\\"text-align: justify;\\">(One time Migration cost)</p><p style=\\"text-align: justify;\\"><strong>Office 365 Exchange setup, implementation and configuration charges Includes</strong></p><ul><li style=\\"text-align: justify;\\"><p style=\\"text-align: justify;\\">Office 365 - Exchange Server Online setup and Configuration</p></li><li style=\\"text-align: justify;\\"><p style=\\"text-align: justify;\\">Prepare Office 365 domain for \\"yihefa.com.sg\\"</p></li><li style=\\"text-align: justify;\\"><p style=\\"text-align: justify;\\">Prepare up to 13 users on the Office 365 Exchange Online</p></li><li style=\\"text-align: justify;\\"><p style=\\"text-align: justify;\\">Create all users and their configuration based on the list provided.</p></li><li style=\\"text-align: justify;\\"><p style=\\"text-align: justify;\\">Provide configuration of email on Android, iPhone Mobile</p></li><li style=\\"text-align: justify;\\"><p style=\\"text-align: justify;\\">Configuration of DNS record changes &amp; MX transfer from Vodien onto Microsoft</p></li><li style=\\"text-align: justify;\\"><p style=\\"text-align: justify;\\">Configure and enhance spam filter to block maximum possible spam emails.</p></li></ul><p style=\\"text-align: justify;\\"><strong>Professional charges includes to setup Desktop/Laptops for newly created MS Exchange (M365) installation:</strong></p><ul><li style=\\"text-align: justify;\\"><p style=\\"text-align: justify;\\">Configure Users Outlook Profile for newly created Exchange Online</p></li><li style=\\"text-align: justify;\\"><p style=\\"text-align: justify;\\">Configure newly created Office 365 environment and migrate all old emails from existing hosting.</p></li></ul><p style=\\"text-align: justify;\\">Charges are based on 2 hours per user, regardless of the actual time taken to complete the scope. Total effort: 13 users × 2 hours per user = 26 hours for the entire project.</p><p style=\\"text-align: justify;\\">These charges will be deducted from the iCarepack.</p>", "serialNumbers": ""}]	draft	1	2026-06-24 09:43:51.56876+00	1	30 Days Net	f	2026-06-24	15	RIN260105	\N
6	DO7	SP Sysnet Pte Ltd	Vertex, 33 Ubi Avenue 3, Geylang\nSingapore 408868	Raju DN	2026-07-09	Auto-created from Invoice INV-0010	[{"qty": 1, "partNumber": "CON-SNT-354XSP3A", "description": "<p>SNTC-8X5XNBD Nexus 3548-X 48 SFP+ </p><p>S.no:FOC2450R131 </p><p>Start Date:25/06/2026 </p><p>End Date:30/11/2026</p>", "serialNumbers": ""}, {"qty": 3, "partNumber": "CON-ECMU-N3548KAL", "description": "<p>SWSS UPGRADES Nexus 3500 Algo Boost License </p><p>S.no:0166PBZFACD </p><p>Start Date:01/06/2026</p><p>End Date:30/11/2026</p>", "serialNumbers": ""}, {"qty": 2, "partNumber": "CON-ECMU-N35481LA", "description": "<p>SWSS UPGRADES Nexus 3548 Layer 3 LAN Enterprise Licens S.no:SFRV0JJUJZY,KG2Z64N6TFR </p><p>Start Date:01/06/2026 </p><p>End Date:30/11/2026</p>", "serialNumbers": ""}, {"qty": 2, "partNumber": "CON-SNTP-3548PXL", "description": "<p>SNTC-24X7X4 Nexus 3548-XL 48 SFP+ ports, Enhanced, E (Duration: 36 months) S.no:FOC2603R00Y,FOC2630R1VE </p><p>Start Date:01/06/2026 </p><p>End Date:30/11/2026</p>", "serialNumbers": ""}, {"qty": 1, "partNumber": "CON-SNT-3548P10X", "description": "<p>SNTC-8X5XNBD Nexus 3548-X 48 SFP+ (Duration: 12 months) </p><p>S.no:FOC2508R028 </p><p>Start Date:01/06/2026 </p><p>End Date:30/11/2026</p>", "serialNumbers": ""}, {"qty": 1, "partNumber": "CON-ECMU-N35481LA", "description": "<p>SWSS UPGRADES Nexus 3548 Layer 3 LAN Enterprise License </p><p>S.no:F0NKFAAW5NR </p><p>Start Date:25/06/2026 </p><p>End Date:30/11/2026</p>", "serialNumbers": ""}, {"qty": 1, "partNumber": "CON-ECMU-N3548KAL", "description": "<p>SWSS UPGRADES Nexus 3500 Algo Boost License-12 months</p><p>S.no:H8Q0TDQDPS1</p><p>Start Date:25/06/2026</p><p>End Date:30/11/2026</p>", "serialNumbers": ""}]	draft	1	2026-06-30 10:07:43.447984+00	1	30 Days Net	f	2026-06-09	10	INV-0010	\N
\.


--
-- Data for Name: email_contacts; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.email_contacts (id, company_id, name, email, use_count, last_used_at, created_at) FROM stdin;
2	1	\N	chaitu556@gmail.com	3	2026-06-26 10:55:41.986+00	2026-06-26 09:48:45.508024+00
1	1	\N	illanchaitanya@gmail.com	2	2026-07-09 07:13:47.137+00	2026-06-23 11:40:29.597264+00
\.


--
-- Data for Name: expenses; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.expenses (id, company_id, expense_date, vendor_name, description, category, amount, gst_amount, gst_claimable, is_deductible, deductible_pct, currency, payment_method, receipt_data, receipt_mime_type, vendor_id, project_id, voucher_id, journal_entry_id, status, notes, created_by, created_at, updated_at) FROM stdin;
1	1	2026-07-23	venkatesh	Office Rent	rental	2400.00	216.00	t	t	100	SGD	bank_transfer	\N	\N	\N	\N	\N	\N	confirmed	Office rent paid  for the month June 2026 paid in July 2026	1	2026-07-23 15:40:07.871997+00	2026-07-23 15:42:37.215+00
2	1	2026-07-23	Kishore	Electricity charges	utilities	350.00	31.50	t	t	100	SGD	bank_transfer	\N	\N	\N	\N	\N	\N	confirmed	Office Electricity paid for the month of June 26 paid in July 26	1	2026-07-23 15:45:07.740889+00	2026-07-23 15:45:07.740889+00
3	1	2026-07-23	Kiran	telephone exp	utilities	80.00	NaN	f	f	100	SGD	cash	\N	\N	\N	\N	\N	\N	confirmed	Office Telephone bill paid for the month of June 26 paid in july 26	1	2026-07-23 15:46:42.660984+00	2026-07-23 15:46:42.660984+00
4	1	2026-07-24	Vamsi	Traveling exp	travel	143.00	NaN	f	f	100	SGD	cash	\N	\N	\N	\N	\N	\N	confirmed	\N	1	2026-07-24 03:43:23.425984+00	2026-07-24 03:43:23.425984+00
\.


--
-- Data for Name: grn; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.grn (id, grn_number, po_id, po_number, vendor_name, company_id, status, items, created_by, created_at, updated_at) FROM stdin;
1	GRN-0001	1	RPO-0001	Micro United Pte Ltd	1	complete	[{"qty": 2, "amount": 378, "received": true, "unitPrice": 189, "partNumber": "WP816", "description": "<p>Cordless Wi-Fi IP Phone</p>", "isStockItem": true, "serialNumbers": "3440121615\\n3440127B84"}, {"qty": 6, "amount": 210, "received": true, "unitPrice": 35, "partNumber": "GS-01", "description": "<p>GS-01 Li-ion Battery</p>", "isStockItem": true, "serialNumbers": ""}]	1	2026-04-17 11:30:12.011722+00	2026-04-17 11:30:35.896+00
2	GRN2	2	RPO2	Micro United Pte Ltd	1	draft	[{"qty": 1, "uom": "", "amount": 333, "received": false, "itemImage": "", "unitPrice": 333, "partNumber": "", "description": "<p>gdfdfgdfgf</p>", "isStockItem": false, "serialNumbers": ""}]	1	2026-06-26 09:48:16.919124+00	2026-06-26 09:48:16.919124+00
\.


--
-- Data for Name: income_records; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.income_records (id, company_id, income_date, payer_name, description, category, amount, gst_amount, gst_treatment, currency, payment_method, account_id, reference, notes, status, journal_entry_id, created_by, created_at, updated_at, exchange_rate) FROM stdin;
\.


--
-- Data for Name: invoice_payments; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.invoice_payments (id, company_id, invoice_id, payment_date, amount, reference, payment_method, notes, created_by, created_at) FROM stdin;
\.


--
-- Data for Name: invoices; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.invoices (id, inv_number, customer_name, customer_address, customer_contact, delivery_address, delivery_date, payment_terms, notes, items, subtotal, tax, total_amount, status, created_by, created_at, company_id, currency, customer_contact_email, discount_amount, is_private, void_reason, issue_date, po_ref_no, email_sent_to, exchange_rate) FROM stdin;
1	INV-0001	SP Sysnet Pte Ltd	Vertex, 33 Ubi Avenue 3, Geylang\nSingapore 408868	Raju DN	\N		30 Days Net		[{"qty": 1, "amount": "189.00", "discount": 0, "unitPrice": 189, "partNumber": "WP816", "description": "<p>Cordless Wi-Fi IP Phone</p><p><strong>Serial Numbers: 3440121615</strong></p>", "isStockItem": true, "selectedSerials": ["3440121615"], "selectedSerialIds": [1]}, {"qty": 3, "amount": "105.00", "discount": 0, "unitPrice": 35, "partNumber": "GS-01", "description": "<p>GS-01 Li-ion Battery</p>", "isStockItem": true, "selectedSerials": [], "selectedSerialIds": []}]	294.00	26.46	320.46	confirmed	1	2026-04-17 11:31:16.34263+00	1	SGD	illanchaitanya@gmail.com	0.00	f	\N	2026-04-17	\N	\N	1.000000
4	INV-0004	SP Sysnet Pte Ltd	Vertex, 33 Ubi Avenue 3, Geylang\nSingapore 408868	Raju DN	\N		30 Days Net		[{"qty": 1, "amount": 3500, "unitPrice": 3500, "partNumber": "", "description": "Services for Month of May 2026"}]	3500.00	315.00	3815.00	draft	1	2026-05-08 06:02:47.955087+00	1	SGD	illanchaitanya@gmail.com	0.00	f	\N	2026-05-08	\N	\N	1.000000
5	INV-0005	SP Sysnet Pte Ltd	Vertex, 33 Ubi Avenue 3, Geylang\nSingapore 408868	Raju DN	\N	2026-05-30	30 Days Net		[{"qty": 2, "amount": 58646, "unitPrice": 29323, "description": "Isntallation of CISCO ISR 1100 Routers"}]	58646.00	5278.14	63924.14	draft	1	2026-05-08 06:09:34.823025+00	1	SGD	illanchaitanya@gmail.com	0.00	f	\N	2026-05-08	\N	\N	1.000000
6	INV-0006	SP Sysnet Pte Ltd	Vertex, 33 Ubi Avenue 3, Geylang	Raju DN	\N				[{"qty": 3, "amount": "7500.00", "discount": 0, "unitPrice": 2500, "partNumber": "", "description": "Cisco IRS Configuration", "isStockItem": false, "selectedSerials": [], "selectedSerialIds": []}]	7500.00	675.00	8175.00	confirmed	1	2026-05-08 06:12:18.949326+00	1	SGD	illanchaitanya@gmail.com	0.00	f	\N	2026-05-08	\N	\N	1.000000
7	INV-0007	SP Sysnet Pte Ltd	Vertex, 33 Ubi Avenue 3, Geylang\nSingapore 408868	Raju DN	\N		30 Days Net		[{"type": "section", "sectionAlign": "left", "sectionLabel": "<p>TEST Header</p>"}, {"qty": 21, "type": "item", "amount": "4452.00", "discount": 0, "unitPrice": 212, "partNumber": "", "description": "<p>TSDFSDF sdfsdfi sdcskudfsdf</p><ol><li><p>sdfiusdf</p></li><li><p>\\\\sdfsdfsd</p></li><li><p>fsdfsdgsd</p></li><li><p>gsdgsdgsd</p></li></ol><p>sdfsdufhsdkcsdhfsdfsfsdfkusdhfksudhf skluse fskdfuusdkf sdf</p><p></p>", "isStockItem": false, "sectionAlign": "left", "sectionLabel": "", "selectedSerials": [], "selectedSerialIds": []}]	4452.00	400.68	4852.68	draft	1	2026-06-03 06:16:44.637904+00	1	SGD	illanchaitanya@gmail.com	0.00	f	\N	2026-06-03	RPO-0001	\N	1.000000
8	INV-0008	Test	Vertex, 33 Ubi Avenue 3, Geylang\nSingapore 408868	Raju DN	\N		30 Days Net		[{"qty": 1, "uom": "Lot", "type": "item", "isFoc": false, "amount": "100.00", "discount": 0, "unitPrice": 100, "partNumber": "", "description": "<p>Testfgdf</p>", "isStockItem": false, "sectionAlign": "left", "sectionLabel": "", "selectedSerials": [], "selectedSerialIds": []}, {"qty": 1, "uom": "", "type": "item", "isFoc": false, "amount": "0.00", "discount": 0, "unitPrice": 0, "partNumber": "d", "description": "", "isStockItem": false, "sectionAlign": "left", "sectionLabel": "", "selectedSerials": [], "selectedSerialIds": []}]	100.00	9.00	109.00	draft	1	2026-06-03 06:38:22.400116+00	1	SGD	illanchaitanya@gmail.com	0.00	f	\N	2026-06-03	PO-0003	\N	1.000000
11	RIN260101	SP Sysnet Pte Ltd	Vertex, 33 Ubi Avenue 3, Geylang\nSingapore 408868	Raju DN	\N		30 Days Net		[{"qty": 1, "uom": "", "type": "item", "isFoc": false, "amount": "1000.00", "discount": 0, "unitPrice": 1000, "partNumber": "", "description": "IT Managed Infrastructure Maintenance Services :- IT Managed Infrastructure Maintenance Services - on monthly basis capped at 10 hours based on below service coverage and billed monthly.\\nIT Services Coverage:\\n1. RSVInfoTech IT services covers mandatory cheks and provide IT services every month to make sure smooth IT operations for Hexachem. Which includes\\n2. Hexachem has One physical server (Dell server) in SG office, which contains two Virtual servers (one for Active Directory and Focus software application and another server for File Server)\\n3. Services to cover daily monitoring and support of Servers data backups.\\n4. Services to cover support of Micrososft 365 email for domains\\n1)hexachem.sg  2)seawaveliners.com  3)hexachemeng.com 4)pentachem.my\\nProvide ad-hoc support for total of about 21 email accounts for above domains.\\n5. Services to cover support of dekstops and laptops with in SG office.\\n6. Services to cover SG firewall, site to site VPN and regular firmware updates\\n7. Remote support services to cover India operations.\\n8. Remote support services to cover Malaysia operations.\\nIT Service Coverage Terms & Conditions:\\n'-IT services will be provided to end-users upon an ad-hoc call request from the end customer.\\n- The above services will be provided during office hours, from 9 AM to 6 PM, Monday to Friday.\\n- All service requests must come from authorized personnel and be submitted through WhatsApp (+65 88602526) or via email (helpdesk@myrsv.com).\\n- IT services will be charged at S$150 per hour.\\n- The above services does not include coverage for any hardware parts or software licenses.", "isStockItem": false, "sectionAlign": "left", "sectionLabel": "", "selectedSerials": [], "selectedSerialIds": []}]	1000.00	90.00	1090.00	draft	1	2026-06-09 13:06:00.294875+00	1	SGD	illanchaitanya@gmail.com	0.00	f	\N	2026-06-09	\N	\N	1.000000
13	RIN260103	SP Sysnet Pte Ltd	Vertex, 33 Ubi Avenue 3, Geylang\nSingapore 408868	Raju DN	33, Vertex, 33 Ubi Avenue 3, Geylang\n408868		30 Days Net		[{"qty": 1, "uom": "", "type": "section", "isFoc": false, "discount": 0, "itemImage": "", "unitPrice": 0, "partNumber": "", "description": "", "isStockItem": false, "sectionAlign": "left", "sectionLabel": "Emergency Recovery Services", "selectedSerials": [], "selectedSerialIds": []}, {"qty": 1, "uom": "", "type": "item", "isFoc": false, "amount": "9000.00", "discount": 0, "itemImage": "", "unitPrice": 9000, "partNumber": "", "description": "Emergency ransomware incident response and infrastructure restoration, including after-hours and overnight support, performed from 08-06-2026 (Monday) to 11-06-2026 (Thursday).", "isStockItem": false, "sectionAlign": "left", "sectionLabel": "", "selectedSerials": [], "selectedSerialIds": []}, {"qty": 1, "uom": "", "type": "item", "isFoc": false, "amount": "0.00", "discount": 0, "itemImage": "", "unitPrice": 0, "partNumber": "", "description": "On-site technical assessment and immediate response to ransomware incident.", "isStockItem": false, "sectionAlign": "left", "sectionLabel": "", "selectedSerials": [], "selectedSerialIds": []}, {"qty": 1, "uom": "", "type": "item", "isFoc": false, "amount": "0.00", "discount": 0, "itemImage": "", "unitPrice": 0, "partNumber": "", "description": "Active Directory, DNS, and critical infrastructure recovery and stabilization.", "isStockItem": false, "sectionAlign": "left", "sectionLabel": "", "selectedSerials": [], "selectedSerialIds": []}, {"qty": 1, "uom": "", "type": "item", "isFoc": false, "amount": "0.00", "discount": 0, "itemImage": "", "unitPrice": 0, "partNumber": "", "description": "Hyper-V, SAPServer, and BMSServer recovery and operational validation.", "isStockItem": false, "sectionAlign": "left", "sectionLabel": "", "selectedSerials": [], "selectedSerialIds": []}, {"qty": 1, "uom": "", "type": "item", "isFoc": false, "amount": "0.00", "discount": 0, "itemImage": "", "unitPrice": 0, "partNumber": "", "description": "Storage and backup recovery operations; large-scale data recovery and migration.", "isStockItem": false, "sectionAlign": "left", "sectionLabel": "", "selectedSerials": [], "selectedSerialIds": []}, {"qty": 1, "uom": "", "type": "item", "isFoc": false, "amount": "0.00", "discount": 0, "itemImage": "", "unitPrice": 0, "partNumber": "", "description": "System troubleshooting, repair, and network/service stabilization.", "isStockItem": false, "sectionAlign": "left", "sectionLabel": "", "selectedSerials": [], "selectedSerialIds": []}, {"qty": 1, "uom": "", "type": "item", "isFoc": false, "amount": "0.00", "discount": 0, "itemImage": "", "unitPrice": 0, "partNumber": "", "description": "Business continuity restoration support, recovery planning, and operational monitoring.", "isStockItem": false, "sectionAlign": "left", "sectionLabel": "", "selectedSerials": [], "selectedSerialIds": []}]	9000.00	59049.00	67149.00	void	1	2026-06-17 17:31:56.843974+00	1	SGD	illanchaitanya@gmail.com	900.00	f	Test void - auto-post verification	2026-06-17	\N	\N	1.000000
9	INV-0009	SP Sysnet Pte Ltd	Vertex, 33 Ubi Avenue 3, Geylang\nSingapore 408868	Raju DN	\N		30 Days Net		[{"qty": 2, "uom": "Unit", "type": "item", "isFoc": false, "amount": "2084.62", "discount": 0, "itemImage": "", "unitPrice": 1042.31, "partNumber": "C1111-8P", "description": "ISR 1100 8 Ports Dual GE WAN Ethernet Router", "isStockItem": false, "sectionAlign": "left", "sectionLabel": "", "selectedSerials": [], "selectedSerialIds": []}, {"qty": 2, "uom": "Unit", "type": "item", "isFoc": false, "amount": "392.70", "discount": 0, "itemImage": "", "unitPrice": 196.35, "partNumber": "CON-SNTP-C11118P", "description": "SNTC-24X7X4 ISR 1100 Dual GE Ethernet Router (Duration: 12 months)", "isStockItem": false, "sectionAlign": "left", "sectionLabel": "", "selectedSerials": [], "selectedSerialIds": []}, {"qty": 2, "uom": "Unit", "type": "item", "isFoc": false, "amount": "0.00", "discount": 0, "itemImage": "", "unitPrice": 0, "partNumber": "PWR-66W-AC-V2", "description": "Power Supply 66 Watt AC V2 for C890 and C1100 series", "isStockItem": false, "sectionAlign": "left", "sectionLabel": "", "selectedSerials": [], "selectedSerialIds": []}, {"qty": 2, "uom": "Unit", "type": "item", "isFoc": false, "amount": "0.00", "discount": 0, "itemImage": "", "unitPrice": 0, "partNumber": "SL-1100-8P-IPB", "description": "IP Base License for Cisco ISR 1100 8 Ports Series", "isStockItem": false, "sectionAlign": "left", "sectionLabel": "", "selectedSerials": [], "selectedSerialIds": []}, {"qty": 2, "uom": "Unit", "type": "item", "isFoc": false, "amount": "0.00", "discount": 0, "itemImage": "", "unitPrice": 0, "partNumber": "CAB-ACU", "description": "AC Power Cord (UK), C13, BS 1363, 2.5m", "isStockItem": false, "sectionAlign": "left", "sectionLabel": "", "selectedSerials": [], "selectedSerialIds": []}, {"qty": 2, "uom": "Unit", "type": "item", "isFoc": false, "amount": "148.96", "discount": 0, "itemImage": "", "unitPrice": 74.48, "partNumber": "ACS-1100-RM-19", "description": "Cisco 1100 Series Router Rackmount Wallmount Kit", "isStockItem": false, "sectionAlign": "left", "sectionLabel": "", "selectedSerials": [], "selectedSerialIds": []}, {"qty": 2, "uom": "Unit", "type": "item", "isFoc": false, "amount": "0.00", "discount": 0, "itemImage": "", "unitPrice": 0, "partNumber": "SISR1100UK9-1715", "description": "Cisco C11xx Series IOS XE Universal", "isStockItem": false, "sectionAlign": "left", "sectionLabel": "", "selectedSerials": [], "selectedSerialIds": []}, {"qty": 1, "uom": "", "type": "item", "isFoc": false, "amount": "22.00", "discount": 0, "itemImage": "", "unitPrice": 22, "partNumber": "", "description": "<p>fsdfsfsdfsdfs</p>", "isStockItem": false, "sectionAlign": "left", "sectionLabel": "", "selectedSerials": [], "selectedSerialIds": []}, {"qty": 1, "uom": "", "type": "item", "isFoc": false, "amount": "330.00", "discount": 0, "itemImage": "", "unitPrice": 330, "partNumber": "d", "description": "<p>dfssdsdfsfss</p>", "isStockItem": false, "sectionAlign": "left", "sectionLabel": "", "selectedSerials": [], "selectedSerialIds": []}, {"qty": 1, "uom": "", "type": "item", "isFoc": false, "amount": "33.00", "discount": 0, "itemImage": "", "unitPrice": 33, "partNumber": "", "description": "<p>fsdfsdfsfsd</p>", "isStockItem": false, "sectionAlign": "left", "sectionLabel": "", "selectedSerials": [], "selectedSerialIds": []}, {"qty": 1, "uom": "", "type": "item", "isFoc": false, "amount": "5.00", "discount": 0, "itemImage": "", "unitPrice": 5, "partNumber": "", "description": "<p>fdfgdfgdgdgsdgfdfgdd</p>", "isStockItem": false, "sectionAlign": "left", "sectionLabel": "", "selectedSerials": [], "selectedSerialIds": []}, {"qty": 1, "uom": "", "type": "item", "isFoc": false, "amount": "344.00", "discount": 0, "itemImage": "", "unitPrice": 344, "partNumber": "", "description": "<p>dfgfdgdfgdgf</p>", "isStockItem": false, "sectionAlign": "left", "sectionLabel": "", "selectedSerials": [], "selectedSerialIds": []}, {"qty": 1, "uom": "", "type": "item", "isFoc": false, "amount": "44.00", "discount": 0, "itemImage": "", "unitPrice": 44, "partNumber": "g", "description": "<p>gdfgdfgdfgdgdgd</p>", "isStockItem": false, "sectionAlign": "left", "sectionLabel": "", "selectedSerials": [], "selectedSerialIds": []}, {"qty": 1, "uom": "", "type": "item", "isFoc": false, "amount": "0.00", "discount": 0, "itemImage": "", "unitPrice": 0, "partNumber": "gd", "description": "", "isStockItem": false, "sectionAlign": "left", "sectionLabel": "", "selectedSerials": [], "selectedSerialIds": []}]	3404.28	306.39	3710.67	draft	1	2026-06-09 10:42:44.026846+00	1	USD	illanchaitanya@gmail.com	0.00	f	\N	2026-06-09	8000270858	\N	1.287429
10	INV-0010	SP Sysnet Pte Ltd	Vertex, 33 Ubi Avenue 3, Geylang\nSingapore 408868	Raju DN	\N	2026-07-09	30 Days Net		[{"qty": 1, "uom": "", "type": "item", "isFoc": false, "amount": "666.65", "discount": 0, "itemImage": "", "unitPrice": 666.65, "partNumber": "CON-SNT-354XSP3A", "description": "<p>SNTC-8X5XNBD Nexus 3548-X 48 SFP+ </p><p>S.no:FOC2450R131 </p><p>Start Date:25/06/2026 </p><p>End Date:30/11/2026</p>", "isStockItem": false, "sectionAlign": "left", "sectionLabel": "", "selectedSerials": [], "selectedSerialIds": []}, {"qty": 3, "uom": "", "type": "item", "isFoc": false, "amount": "757.53", "discount": 0, "itemImage": "", "unitPrice": 252.51, "partNumber": "CON-ECMU-N3548KAL", "description": "<p>SWSS UPGRADES Nexus 3500 Algo Boost License </p><p>S.no:0166PBZFACD </p><p>Start Date:01/06/2026</p><p>End Date:30/11/2026</p>", "isStockItem": false, "sectionAlign": "left", "sectionLabel": "", "selectedSerials": [], "selectedSerialIds": []}, {"qty": 2, "uom": "", "type": "item", "isFoc": false, "amount": "505.02", "discount": 0, "itemImage": "", "unitPrice": 252.51, "partNumber": "CON-ECMU-N35481LA", "description": "<p>SWSS UPGRADES Nexus 3548 Layer 3 LAN Enterprise Licens S.no:SFRV0JJUJZY,KG2Z64N6TFR </p><p>Start Date:01/06/2026 </p><p>End Date:30/11/2026</p>", "isStockItem": false, "sectionAlign": "left", "sectionLabel": "", "selectedSerials": [], "selectedSerialIds": []}, {"qty": 2, "uom": "", "type": "item", "isFoc": false, "amount": "2100.70", "discount": 0, "itemImage": "", "unitPrice": 1050.35, "partNumber": "CON-SNTP-3548PXL", "description": "<p>SNTC-24X7X4 Nexus 3548-XL 48 SFP+ ports, Enhanced, E (Duration: 36 months) S.no:FOC2603R00Y,FOC2630R1VE </p><p>Start Date:01/06/2026 </p><p>End Date:30/11/2026</p>", "isStockItem": false, "sectionAlign": "left", "sectionLabel": "", "selectedSerials": [], "selectedSerialIds": []}, {"qty": 1, "uom": "", "type": "item", "isFoc": false, "amount": "767.27", "discount": 0, "itemImage": "", "unitPrice": 767.27, "partNumber": "CON-SNT-3548P10X", "description": "<p>SNTC-8X5XNBD Nexus 3548-X 48 SFP+ (Duration: 12 months) </p><p>S.no:FOC2508R028 </p><p>Start Date:01/06/2026 </p><p>End Date:30/11/2026</p>", "isStockItem": false, "sectionAlign": "left", "sectionLabel": "", "selectedSerials": [], "selectedSerialIds": []}, {"qty": 1, "uom": "", "type": "item", "isFoc": false, "amount": "219.39", "discount": 0, "itemImage": "", "unitPrice": 219.39, "partNumber": "CON-ECMU-N35481LA", "description": "<p>SWSS UPGRADES Nexus 3548 Layer 3 LAN Enterprise License </p><p>S.no:F0NKFAAW5NR </p><p>Start Date:25/06/2026 </p><p>End Date:30/11/2026</p>", "isStockItem": false, "sectionAlign": "left", "sectionLabel": "", "selectedSerials": [], "selectedSerialIds": []}, {"qty": 1, "uom": "", "type": "item", "isFoc": true, "amount": "219.39", "discount": 0, "itemImage": "", "unitPrice": 219.39, "partNumber": "CON-ECMU-N3548KAL", "description": "<p>SWSS UPGRADES Nexus 3500 Algo Boost License-12 months</p><p>S.no:H8Q0TDQDPS1</p><p>Start Date:25/06/2026</p><p>End Date:30/11/2026</p>", "isStockItem": false, "sectionAlign": "left", "sectionLabel": "", "selectedSerials": [], "selectedSerialIds": []}]	5016.56	451.49	5468.05	confirmed	1	2026-06-09 10:47:44.108793+00	1	USD	illanchaitanya@gmail.com	0.00	f	\N	2026-06-09	\N	\N	1.287429
12	RIN260102	SP Sysnet Pte Ltd	Vertex, 33 Ubi Avenue 3, Geylang\nSingapore 408868	Raju DN	33, Vertex, 33 Ubi Avenue 3, Geylang\n408868		Immediate		[{"type": "section", "sectionAlign": "left", "sectionLabel": "<p><strong>IT Managed Infrastructure Maintenance Services</strong><br>Monthly Managed IT Support Services (Up to 10 Support Hours)</p>"}, {"type": "section", "sectionAlign": "left", "sectionLabel": "<p>Service coverage includes:</p>"}, {"qty": 1, "uom": "", "type": "item", "isFoc": false, "amount": "1000.00", "discount": 0, "unitPrice": 1000, "partNumber": "", "description": "<ul><li><p>Monthly preventive IT maintenance and monitoring</p></li><li><p>Support for Dell physical server and two virtual servers (AD, Focus Application &amp; File Server)</p></li><li><p>Daily server backup monitoring and support</p></li><li><p>Microsoft 365 email support for domains: <a target=\\"_blank\\" rel=\\"noopener noreferrer nofollow\\" href=\\"http://hexachem.sg\\">hexachem.sg</a>, <a target=\\"_blank\\" rel=\\"noopener noreferrer nofollow\\" href=\\"http://seawaveliners.com\\">seawaveliners.com</a>, <a target=\\"_blank\\" rel=\\"noopener noreferrer nofollow\\" href=\\"http://hexachemeng.com\\">hexachemeng.com</a> &amp; <a target=\\"_blank\\" rel=\\"noopener noreferrer nofollow\\" href=\\"http://pentachem.my\\">pentachem.my</a> (Approx. 21 email accounts)</p></li><li><p>Desktop and laptop support for Singapore office users</p></li><li><p>Firewall, Site-to-Site VPN and firmware update support</p></li><li><p>Remote IT support for Singapore, India and Malaysia operations</p></li></ul><p></p>", "isStockItem": false, "sectionAlign": "left", "sectionLabel": "", "selectedSerials": [], "selectedSerialIds": []}]	1000.00	90.00	1090.00	draft	1	2026-06-09 13:09:33.713252+00	1	SGD	illanchaitanya@gmail.com	0.00	f	\N	2026-06-09	VP T3234234	\N	1.000000
14	RIN260104	Test	Vertex, 33 Ubi Avenue 3, Geylang\nSingapore 408868	Raju DN	\N		30 Days Net	<p style="text-align: justify;"><strong>What IT Covers (Terms &amp; Conditions):</strong></p><ol><li style="text-align: justify;"><p style="text-align: justify;">IT Services will be provided to the end-users upon Ad-hoc call request from end-customer.</p></li><li style="text-align: justify;"><p style="text-align: justify;">No pro-active or preventive maintenance initiation from RSVInfoTech, unless end-customer requested for the service. Data backups are not monitored under iCarepack.</p></li><li style="text-align: justify;"><p style="text-align: justify;">IT service charges based on Number of hours utilised will be deducted from the total number of hours upon successful completion of the call.</p><ol type="A"><li style="text-align: justify;"><p style="text-align: justify;">Charges for Remote IT Support will be Minimum of 1 Hr and every 1 Hr thereafter.</p></li><li style="text-align: justify;"><p style="text-align: justify;">Charges for On-Site IT Support will be Minimum of 2 Hrs and every 1 Hr thereafter.</p></li><li style="text-align: justify;"><p style="text-align: justify;">Above charges are from 9AM to 6PM from Monday to Friday during office hours Only.</p></li><li style="text-align: justify;"><p style="text-align: justify;">IT Services requested by the end-customer for after office hours and public holidays, Charges will be deducted 2 times of normal office hour charges (As per 'A' and 'B' above)</p></li><li style="text-align: justify;"><p style="text-align: justify;">Every Service request from end users has to come from an authorised personal via WhatsApp (+65 88602526) / email (helpdesk@myrsv.com) only.</p></li><li style="text-align: justify;"><p style="text-align: justify;">Successful resolution of the IT request will be deducted from the iCarePack total Hrs.</p></li></ol></li><li style="text-align: justify;"><p style="text-align: justify;">Additional iCarePack of blocks of 25 hours for ad-hoc services can be purchased as and when required during the contract period.</p></li><li style="text-align: justify;"><p style="text-align: justify;">Price Per Hour S$130/- (Usual price is S$150/- per hour) will be billed upon the iCarePack service activation date.</p></li><li style="text-align: justify;"><p style="text-align: justify;">iCarePack service does not cover any hardware parts or software licenses. iCarePack of IT Services provided both remotely and on-site services</p></li><li style="text-align: justify;"><p style="text-align: justify;">Payment: Payment for the above services is 100% before new contract start.</p></li></ol><p style="text-align: justify;"></p><p style="text-align: justify;"></p><p style="text-align: justify;"></p><p style="text-align: justify;"></p><p style="text-align: justify;"></p><ol start="8"><li><p style="text-align: justify;"><strong>Customer Data &amp; Backup Responsibility: </strong>The Customer remains solely responsible for the security, integrity, backup, and recovery of all data, systems, applications, and business information. RSV Infotech Pte Ltd provides IT support services on a best-effort basis and does not guarantee the protection, availability, recovery, preservation, or security of Customer data. Unless expressly covered under a separate written agreement, RSV Infotech Pte Ltd shall not be liable for any loss, corruption, deletion, encryption, compromise, disclosure, or unavailability of Customer data, whether arising directly or indirectly from hardware failure, software failure, user error, unauthorized access, security incidents, system failures, third-party actions, or any other cause whatsoever, whether during or after the provision of services. The Customer is responsible for maintaining adequate and regularly tested backups of all critical business data.</p></li></ol><p style="text-align: justify;"></p>	[{"qty": 50, "uom": "", "type": "item", "isFoc": false, "amount": "6500.00", "discount": 0, "itemImage": "", "unitPrice": 130, "partNumber": "", "description": "<p style=\\"text-align: justify;\\">IT Managed Infrastructure Maintenance Services - iCarePack25: IT Managed Infrastructure Maintenance Services – Ad-hoc basis Annual Contract – RSV iCarePack-50, 50 Hours of IT Services package and valid for 12 months, whichever comes first.</p><p style=\\"text-align: justify;\\">Contract Starts from 01-06-2026 to 31-06-2027.</p><p style=\\"text-align: justify;\\">(Previous iCarePack25 Serviced from 01-05-2024 to extended until 30-09-2025)</p>", "isStockItem": false, "sectionAlign": "left", "sectionLabel": "", "selectedSerials": [], "selectedSerialIds": []}]	6500.00	585.00	7085.00	confirmed	1	2026-06-24 02:34:33.367528+00	1	SGD	illanchaitanya@gmail.com	0.00	f	\N	2026-06-24	\N	\N	1.000000
16	INV1	RSV INFOTECH PTE LTD	10 Ubi Crescent, #07-52 UBI Techpark Lobby C\n\nSingapore 408564	Suresh	\N		30 Days Net		[{"qty": 4, "uom": "", "type": "item", "isFoc": false, "amount": "1600.00", "discount": 0, "itemImage": "", "unitPrice": 400, "partNumber": "", "description": "<p><strong>Dell Latitude 3420</strong></p><p><strong>Processor</strong> : 11 Gen Intel(R) Core(TM) i5-1135G7 @ 2.40GHz<br><strong>RAM</strong>: 32GB<br><strong>Storage</strong>: 512 SSD <br><strong>Operating System</strong>: Windows 11 Pro 25H2 (Updated)<br><br>Serial Nos:  9PK9TL3, HH8GPL3, 7V8GPL3, 2Z9GPL3</p>", "isStockItem": false, "sectionAlign": "left", "sectionLabel": "", "selectedSerials": [], "selectedSerialIds": []}, {"qty": 4, "uom": "", "type": "item", "isFoc": true, "amount": "0.00", "discount": 0, "itemImage": "", "unitPrice": 0, "partNumber": "", "description": "<p>Aigo Wireless Mouse (FOC)</p>", "isStockItem": false, "sectionAlign": "left", "sectionLabel": "", "selectedSerials": [], "selectedSerialIds": []}, {"qty": 4, "uom": "", "type": "item", "isFoc": false, "amount": "0.00", "discount": 0, "itemImage": "", "unitPrice": 0, "partNumber": "", "description": "<p>Dell Bags (FOC)</p>", "isStockItem": false, "sectionAlign": "left", "sectionLabel": "", "selectedSerials": [], "selectedSerialIds": []}]	1600.00	144.00	1744.00	confirmed	1	2026-06-29 07:20:49.954509+00	2	SGD	suresh@myrsv.com	0.00	f	\N	2026-06-29	\N	\N	1.000000
15	RIN260105	SP Sysnet Pte Ltd	Vertex, 33 Ubi Avenue 3, Geylang\nSingapore 408868	Raju DN	\N		30 Days Net		[{"qty": 1, "uom": "", "type": "item", "isFoc": false, "amount": "370.00", "discount": 0, "itemImage": "", "unitPrice": 370, "partNumber": "", "description": "<p style=\\"text-align: justify;\\">HP Server DL380 memory Module 16 GB PC4-2666 ECC RDIMM New memory module,</p><p style=\\"text-align: justify;\\">Not refurbished, with 6 Months warranty. Warranty starts from Installed date: 29/04/2026</p>", "isStockItem": false, "sectionAlign": "left", "sectionLabel": "", "selectedSerials": [], "selectedSerialIds": []}, {"qty": 2, "uom": "", "type": "item", "isFoc": false, "amount": "0.00", "discount": 0, "itemImage": "", "unitPrice": 0, "partNumber": "", "description": "<p>Professional charges to install and get it updated in the HPE SMART BIOS and make sure to detect and work along with existing memory modules.</p>\\n<p>(One time installation and setup cost)</p>\\n<p>Charges are based on 2 hours on-site visit and perform on-site job, regardless of the actual time taken to complete the scope.</p>\\n<p>These charges will be deducted from the iCarepack.</p>", "isStockItem": false, "sectionAlign": "left", "sectionLabel": "", "selectedSerials": [], "selectedSerialIds": []}, {"qty": 13, "uom": "", "type": "item", "isFoc": false, "amount": "1144.00", "discount": 0, "itemImage": "", "unitPrice": 88, "partNumber": "", "description": "<p style=\\"text-align: justify;\\">Microsoft 365 Business Basic (Annual Pre-Paid) license for 12 Months subscription:</p><p style=\\"text-align: justify;\\">Microsoft Office 365 with Teams, secure cloud storage, and Office Online (desktop versions not included). Per user Per year. Includes:</p><ul><li style=\\"text-align: justify;\\"><p style=\\"text-align: justify;\\">Email hosting with 50 GB mailbox and custom email domain address</p></li><li style=\\"text-align: justify;\\"><p style=\\"text-align: justify;\\">Web and mobile versions of Word, Excel, and PowerPoint included</p></li><li style=\\"text-align: justify;\\"><p style=\\"text-align: justify;\\">Host online meetings and video calls for up to 300 people with Microsoft Teams.</p></li><li style=\\"text-align: justify;\\"><p style=\\"text-align: justify;\\">Chat with your team from your desktop or on the go with Microsoft Teams</p></li><li style=\\"text-align: justify;\\"><p style=\\"text-align: justify;\\">Manage calendar, share available meetings, schedule meetings and get reminders.</p></li><li style=\\"text-align: justify;\\"><p style=\\"text-align: justify;\\">File storage and sharing with 1 TB of OneDrive storage</p></li><li style=\\"text-align: justify;\\"><p style=\\"text-align: justify;\\">Every mailbox is protected with premier anti-malware and anti-spam protection via Exchange Online Protection.</p></li></ul><p style=\\"text-align: justify;\\">(Price is back to back with Microsoft)</p>", "isStockItem": false, "sectionAlign": "left", "sectionLabel": "", "selectedSerials": [], "selectedSerialIds": []}, {"qty": 26, "uom": "", "type": "item", "isFoc": false, "amount": "0.00", "discount": 0, "itemImage": "", "unitPrice": 0, "partNumber": "", "description": "<p style=\\"text-align: justify;\\"><strong>Professional charges to setup Office 365 Exchange on Microsoft Online:</strong></p><p style=\\"text-align: justify;\\">(One time Migration cost)</p><p style=\\"text-align: justify;\\"><strong>Office 365 Exchange setup, implementation and configuration charges Includes</strong></p><ul><li style=\\"text-align: justify;\\"><p style=\\"text-align: justify;\\">Office 365 - Exchange Server Online setup and Configuration</p></li><li style=\\"text-align: justify;\\"><p style=\\"text-align: justify;\\">Prepare Office 365 domain for \\"yihefa.com.sg\\"</p></li><li style=\\"text-align: justify;\\"><p style=\\"text-align: justify;\\">Prepare up to 13 users on the Office 365 Exchange Online</p></li><li style=\\"text-align: justify;\\"><p style=\\"text-align: justify;\\">Create all users and their configuration based on the list provided.</p></li><li style=\\"text-align: justify;\\"><p style=\\"text-align: justify;\\">Provide configuration of email on Android, iPhone Mobile</p></li><li style=\\"text-align: justify;\\"><p style=\\"text-align: justify;\\">Configuration of DNS record changes &amp; MX transfer from Vodien onto Microsoft</p></li><li style=\\"text-align: justify;\\"><p style=\\"text-align: justify;\\">Configure and enhance spam filter to block maximum possible spam emails.</p></li></ul><p style=\\"text-align: justify;\\"><strong>Professional charges includes to setup Desktop/Laptops for newly created MS Exchange (M365) installation:</strong></p><ul><li style=\\"text-align: justify;\\"><p style=\\"text-align: justify;\\">Configure Users Outlook Profile for newly created Exchange Online</p></li><li style=\\"text-align: justify;\\"><p style=\\"text-align: justify;\\">Configure newly created Office 365 environment and migrate all old emails from existing hosting.</p></li></ul><p style=\\"text-align: justify;\\">Charges are based on 2 hours per user, regardless of the actual time taken to complete the scope. Total effort: 13 users × 2 hours per user = 26 hours for the entire project.</p><p style=\\"text-align: justify;\\">These charges will be deducted from the iCarepack.</p>", "isStockItem": false, "sectionAlign": "left", "sectionLabel": "", "selectedSerials": [], "selectedSerialIds": []}]	1514.00	136.26	1650.26	confirmed	1	2026-06-24 02:35:52.455109+00	1	SGD	illanchaitanya@gmail.com	0.00	f	\N	2026-06-24	\N	\N	1.000000
17	RIN260106	Test	Vertex, 33 Ubi Avenue 3, Geylang\nSingapore 408868	Raju DN	\N	2026-07-31	15 Days Net	\N	[{"qty": 2, "amount": 70, "unitPrice": 35, "partNumber": "GS-01", "description": "GS-01 Li-ion Battery"}, {"qty": 2, "amount": 378, "unitPrice": 189, "partNumber": "WP816", "description": "Cordless Wi‑Fi IP Phone"}]	448.00	40.32	488.32	draft	1	2026-07-24 07:30:13.972448+00	1	SGD	illanchaitanya@gmail.com	0.00	f	\N	2026-07-24	\N	\N	1.000000
\.


--
-- Data for Name: journal_entries; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.journal_entries (id, company_id, entry_date, description, ref_type, ref_id, ref_number, status, reversal_of_id, created_by, created_at) FROM stdin;
2	1	2026-06-19	VOID — Invoice RIN260103 — SP Sysnet Pte Ltd	invoice	13	RIN260103	posted	1	1	2026-06-19 04:35:35.731972+00
1	1	2026-06-17	Invoice RIN260103 — SP Sysnet Pte Ltd	invoice	13	RIN260103	reversed	\N	1	2026-06-19 04:34:29.434372+00
3	1	2026-04-17	Invoice INV-0001 — SP Sysnet Pte Ltd	invoice	1	INV-0001	posted	\N	1	2026-06-19 05:04:56.01872+00
4	1	2026-05-08	Invoice INV-0006 — SP Sysnet Pte Ltd	invoice	6	INV-0006	posted	\N	1	2026-06-19 05:05:00.058227+00
6	1	2026-06-19	Payment — Vendor PI TEST-AUTO-001 — Test Supplier (Ref: TT-20260619)	vendor_payment	6	TEST-AUTO-001	posted	\N	1	2026-06-19 05:20:08.889277+00
7	1	2026-06-19	VOID — Vendor PI TEST-AUTO-001 — Test Supplier	vendor_invoice	4	TEST-AUTO-001	posted	5	1	2026-06-19 05:20:16.958971+00
5	1	2026-06-19	Vendor PI TEST-AUTO-001 — Test Supplier	vendor_invoice	4	TEST-AUTO-001	reversed	\N	1	2026-06-19 05:19:49.644703+00
8	1	2026-06-24	Invoice RIN260104 — Test	invoice	14	RIN260104	posted	\N	1	2026-06-24 09:43:13.902713+00
9	1	2026-06-24	Invoice RIN260105 — SP Sysnet Pte Ltd	invoice	15	RIN260105	posted	\N	1	2026-06-24 09:43:51.591828+00
10	1	2026-06-09	Invoice INV-0010 — SP Sysnet Pte Ltd	invoice	10	INV-0010	posted	\N	1	2026-06-30 10:07:43.465341+00
\.


--
-- Data for Name: journal_lines; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.journal_lines (id, journal_entry_id, account_id, description, debit, credit, created_at) FROM stdin;
1	1	5	Invoice RIN260103 — SP Sysnet Pte Ltd	67149.00	0.00	2026-06-19 04:34:29.440164+00
2	1	30	Sales — RIN260103	0.00	8100.00	2026-06-19 04:34:29.440164+00
3	1	18	GST Output Tax (9%) — RIN260103	0.00	59049.00	2026-06-19 04:34:29.440164+00
4	2	5	REVERSAL: Invoice RIN260103 — SP Sysnet Pte Ltd	0.00	67149.00	2026-06-19 04:35:35.737004+00
5	2	30	REVERSAL: Sales — RIN260103	8100.00	0.00	2026-06-19 04:35:35.737004+00
6	2	18	REVERSAL: GST Output Tax (9%) — RIN260103	59049.00	0.00	2026-06-19 04:35:35.737004+00
7	3	5	Invoice INV-0001 — SP Sysnet Pte Ltd	320.46	0.00	2026-06-19 05:05:19.660002+00
8	3	30	Sales — INV-0001	0.00	294.00	2026-06-19 05:05:19.660002+00
9	3	18	GST Output Tax (9%) — INV-0001	0.00	26.46	2026-06-19 05:05:19.660002+00
10	4	5	Invoice INV-0006 — SP Sysnet Pte Ltd	8175.00	0.00	2026-06-19 05:05:23.796071+00
11	4	30	Sales — INV-0006	0.00	7500.00	2026-06-19 05:05:23.796071+00
12	4	18	GST Output Tax (9%) — INV-0006	0.00	675.00	2026-06-19 05:05:23.796071+00
13	5	35	Vendor PI TEST-AUTO-001 — Test Supplier	1500.00	0.00	2026-06-19 05:19:49.662838+00
14	5	17	Vendor PI TEST-AUTO-001 — Test Supplier	0.00	1500.00	2026-06-19 05:19:49.662838+00
15	6	17	Payment — Vendor PI TEST-AUTO-001 — Test Supplier (Ref: TT-20260619)	500.00	0.00	2026-06-19 05:20:08.895327+00
16	6	2	Payment — Vendor PI TEST-AUTO-001 — Test Supplier (Ref: TT-20260619)	0.00	500.00	2026-06-19 05:20:08.895327+00
17	7	35	REVERSAL: Vendor PI TEST-AUTO-001 — Test Supplier	0.00	1500.00	2026-06-19 05:20:16.998234+00
18	7	17	REVERSAL: Vendor PI TEST-AUTO-001 — Test Supplier	1500.00	0.00	2026-06-19 05:20:16.998234+00
19	8	5	Invoice RIN260104 — Test	7085.00	0.00	2026-06-24 09:43:13.906824+00
20	8	30	Sales — RIN260104	0.00	6500.00	2026-06-24 09:43:13.906824+00
21	8	18	GST Output Tax (9%) — RIN260104	0.00	585.00	2026-06-24 09:43:13.906824+00
22	9	5	Invoice RIN260105 — SP Sysnet Pte Ltd	1650.26	0.00	2026-06-24 09:43:51.59601+00
23	9	30	Sales — RIN260105	0.00	1514.00	2026-06-24 09:43:51.59601+00
24	9	18	GST Output Tax (9%) — RIN260105	0.00	136.26	2026-06-24 09:43:51.59601+00
25	10	5	Invoice INV-0010 — SP Sysnet Pte Ltd	4881.48	0.00	2026-06-30 10:07:43.468821+00
26	10	30	Sales — INV-0010	0.00	4478.42	2026-06-30 10:07:43.468821+00
27	10	18	GST Output Tax (9%) — INV-0010	0.00	403.06	2026-06-30 10:07:43.468821+00
\.


--
-- Data for Name: maintenance; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.maintenance (id, is_enabled, scheduled_start, scheduled_end, message, contact_email, updated_at, updated_by_user) FROM stdin;
1	f	\N	\N	System upgrade in progress.	\N	2026-04-22 12:38:10.509+00	1
\.


--
-- Data for Name: proforma_invoices; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.proforma_invoices (id, pi_number, company_id, customer_name, customer_address, customer_contact, customer_contact_email, delivery_address, issue_date, delivery_date, payment_terms, notes, is_private, items, subtotal, discount_amount, tax, total_amount, currency, qt_ref_no, status, email_sent_to, created_by, created_at) FROM stdin;
\.


--
-- Data for Name: projects; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.projects (id, company_id, name, code, description, status, budget, start_date, end_date, created_by, created_at) FROM stdin;
2	1	Bike Installment	FBW9116X	sfsf	active	11000.00	2026-05-13	2028-03-13	1	2026-07-13 14:32:23.39112+00
3	1	TEST	TEST123	\N	active	\N	\N	\N	1	2026-07-15 06:34:08.253389+00
\.


--
-- Data for Name: purchase_orders; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.purchase_orders (id, po_number, vendor_name, vendor_address, vendor_contact, delivery_address, delivery_date, payment_terms, notes, items, subtotal, tax, total_amount, status, created_by, created_at, company_id, currency, vendor_contact_email, quote_ref_no, is_private, issue_date, email_sent_to, customer_id, customer_po_ref, ack_token, ack_at, ack_note) FROM stdin;
1	RPO-0001	Micro United Pte Ltd	10 Ubi Crescent, Geylang\nSingapore 408564	Sathish	RSV Infotech Pte. Ltd.\nSingapore	2026-04-17	30 Days Net		[{"qty": 2, "amount": 378, "unitPrice": 189, "partNumber": "WP816", "description": "<p>Cordless Wi-Fi IP Phone</p>", "isStockItem": true}, {"qty": 6, "amount": 210, "unitPrice": 35, "partNumber": "GS-01", "description": "<p>GS-01 Li-ion Battery</p>", "isStockItem": true}]	588.00	52.92	640.92	confirmed	1	2026-04-17 11:30:11.998971+00	1	SGD	chaitu556@gmail.com	SQ212-2615	f	2026-04-17	\N	\N	\N	\N	\N	\N
2	RPO2	Micro United Pte Ltd	10 Ubi Crescent, Geylang\nSingapore 408564	Sathish	RSV Infotech Pte. Ltd.\nSingapore		30 Days Net	<p>dfgdfgdfgfgd</p>	[{"qty": 1, "uom": "", "amount": 333, "itemImage": "", "unitPrice": 333, "partNumber": "", "description": "<p>gdfdfgdfgf</p>", "isStockItem": false}]	333.00	29.97	362.97	sent	1	2026-06-26 09:48:16.832631+00	1	SGD	chaitu556@gmail.com	443333	f	2026-06-26	chaitu556@gmail.com	1	433322	8225e485-4ce2-4e17-987e-e172ebcbaeac	2026-06-26T10:57:36.006Z	Order received with thanks
\.


--
-- Data for Name: quotations; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.quotations (id, qt_number, customer_name, customer_address, customer_contact, delivery_address, delivery_date, payment_terms, notes, items, subtotal, tax, total_amount, status, created_by, created_at, company_id, currency, customer_contact_email, discount_amount, is_private, issue_date, email_sent_to) FROM stdin;
2	RQT-0002	SP Sysnet Pte Ltd	Vertex, 33 Ubi Avenue 3, Geylang\nSingapore 408868	Raju DN	\N	2026-05-30	30 Days Net		[{"qty": 2, "uom": "", "type": "item", "isFoc": false, "amount": "58646.00", "discount": 0, "itemImage": "", "unitPrice": 29323, "partNumber": "", "description": "<p>Isntallation of CISCO ISR 1100 Routers</p>", "sectionAlign": "left", "sectionLabel": ""}, {"qty": 36, "uom": "", "type": "item", "isFoc": true, "amount": "360.00", "discount": 0, "itemImage": "", "unitPrice": 10, "partNumber": "2325", "description": "<p>Isntallation of CISCO ISR 1100 Router</p>", "sectionAlign": "left", "sectionLabel": ""}]	58646.00	5278.14	63924.14	confirmed	1	2026-05-08 06:08:42.496075+00	1	SGD	illanchaitanya@gmail.com	0.00	f	2026-05-08	illanchaitanya@gmail.com
1	RQT-0001	SP Sysnet Pte Ltd	Vertex, 33 Ubi Avenue 3, Geylang\nSingapore 408868	Raju DN	\N		30 Days Net		[{"qty": 1, "uom": "", "type": "item", "isFoc": false, "amount": "3500.00", "discount": 0, "itemImage": "", "unitPrice": 3500, "partNumber": "", "description": "<p>Services for Month of May 2026</p>", "sectionAlign": "left", "sectionLabel": ""}]	3500.00	315.00	3815.00	cancelled	1	2026-05-08 05:56:29.167599+00	1	SGD	illanchaitanya@gmail.com	0.00	f	2026-05-08	\N
\.


--
-- Data for Name: session; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.session (sid, sess, expire) FROM stdin;
CENDDZEgSA0xwzDiASIVpwzKJMKaCys5	{"cookie":{"originalMaxAge":604800000,"expires":"2026-07-30T15:24:49.916Z","secure":false,"httpOnly":true,"path":"/"},"userId":1,"username":"admin","isAdmin":true,"userRole":"admin"}	2026-07-30 15:24:51
oY16k81HK180zNFF2rWb7hLMH_4D4Sno	{"cookie":{"originalMaxAge":604800000,"expires":"2026-07-30T15:24:58.222Z","secure":false,"httpOnly":true,"path":"/"},"userId":1,"username":"admin","isAdmin":true,"userRole":"admin","companyId":1}	2026-07-30 15:24:59
UNULt1ehngM5zcTTXD7wyNKcFZDRGH1X	{"cookie":{"originalMaxAge":604800000,"expires":"2026-07-30T15:53:07.818Z","secure":false,"httpOnly":true,"path":"/"},"userId":1,"username":"admin","isAdmin":true,"userRole":"admin","companyId":1}	2026-07-30 15:53:08
4x-SZc3xNl-txH1GW3cOENt9QGIFL8AO	{"cookie":{"originalMaxAge":604800000,"expires":"2026-07-31T04:53:14.843Z","secure":false,"httpOnly":true,"path":"/"},"userId":1,"username":"admin","isAdmin":true,"userRole":"admin","companyId":1}	2026-08-06 10:24:43
pVzVah2N6JICWpM05kPqC4Tqr47QQKx4	{"cookie":{"originalMaxAge":604800000,"expires":"2026-07-31T03:41:50.842Z","secure":false,"httpOnly":true,"path":"/"},"userId":1,"username":"admin","isAdmin":true,"userRole":"admin","companyId":1}	2026-07-31 04:50:30
o-Vz8hwHu528GdTJW0nKPsSFIr8XMXJJ	{"cookie":{"originalMaxAge":604800000,"expires":"2026-07-24T04:03:02.371Z","secure":false,"httpOnly":true,"path":"/"},"userId":1,"username":"admin","isAdmin":true,"userRole":"admin","companyId":1}	2026-07-31 04:02:40
\.


--
-- Data for Name: settings; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.settings (id, gst_rate, smtp_host, smtp_port, smtp_user, smtp_pass, smtp_from, po_prefix, po_counter, po_suffix, inv_prefix, inv_counter, inv_suffix, qt_prefix, qt_counter, qt_suffix, do_prefix, do_counter, do_suffix, grn_prefix, grn_counter, grn_suffix, allow_negative_stock, auto_deduct_on_do, low_stock_warning, default_uom, company_id, bank_details, terms_and_conditions, quotation_terms, cn_prefix, cn_counter, cn_suffix, pi_prefix, pi_counter, pi_suffix, pv_prefix, pv_counter, pv_suffix, default_verifier_id, default_approver_id, default_paid_by_id) FROM stdin;
1	9.00	mail.myrsv.com	587	rsvsales@myrsv.com	@minrsvsale100	rsvsales@myrsv.com	RPO	2		RIN260	106		RQT	2		DO	7		GRN	2		f	f	0.000	pcs	1	<p><strong>ACCOUNT NO :</strong> 8051614566 SEELAM PADMA <strong>Bank :</strong> KOTAK MAHINDRA BANK</p>	<p>All prices final. No returns.</p>	<p>All prices final. No returns.</p>	RCN	1		RPI	1		RPV	26005		\N	\N	\N
2	9.00	\N	\N	\N	\N	\N	PO	0		INV	1		QT	0		DO	0		GRN	0		f	f	0.000	pcs	2	\N	\N	\N	CN	1		PI	1		PV	1		\N	\N	\N
4	9.00	\N	\N	\N	\N	\N	PO	1		INV	1		QT	1		DO	1		GRN	1		f	f	0.000	pcs	5	\N	\N	\N	CN	1		PI	1		PV	1		\N	\N	\N
5	18.00	\N	\N	\N	\N	\N	PO	1		INV	1		QT	1		DO	1		GRN	1		f	f	0.000	pcs	6	\N	\N	\N	CN	1		PI	1		PV	1		\N	\N	\N
3	18.00	\N	\N	\N	\N	\N	PO	0		INV	0		QT	0		DO	0		GRN	0		f	f	0.000	pcs	3	ACCOUNT NO : 8051614566\nSEELAM PADMA\nIFSC CODE :KKBK0007475\nBank : KOTAK MAHINDRA BANK\nBranch : KPHB(PRATIBA VIDYANIKETAN)\n	All prices are as per the currency stated on this invoice.\nPayment is due as per the terms mentioned above.\nGoods once sold are not returnable or exchangeable.	\N	CN	1		PI	1		PV	1		\N	\N	\N
\.


--
-- Data for Name: stock_items; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.stock_items (id, company_id, code, name, description, uom, type, unit_price, stock_qty, is_active, created_at) FROM stdin;
1	1	WP816	Cordless Wi-Fi IP Phone	\N	pcs	product	189.00	2.000	t	2026-04-17 11:30:35.957811+00
2	1	GS-01	GS-01 Li-ion Battery	\N	pcs	product	35.00	6.000	t	2026-04-17 11:30:35.992571+00
\.


--
-- Data for Name: stock_serials; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.stock_serials (id, company_id, stock_item_id, serial_number, status, grn_id, grn_number, invoice_id, invoice_number, do_id, do_number, created_at, reserved_by_user) FROM stdin;
2	1	1	3440127B84	available	1	GRN-0001	\N	\N	\N	\N	2026-04-17 11:30:35.984535+00	\N
1	1	1	3440121615	available	1	GRN-0001	\N	\N	\N	\N	2026-04-17 11:30:35.979933+00	\N
\.


--
-- Data for Name: tax_filings; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.tax_filings (id, company_id, type, financial_year, fy_end_date, revenue, chargeable_income, tax_payable, status, filed_date, reference_no, data, notes, created_at, updated_at, created_by) FROM stdin;
\.


--
-- Data for Name: user_companies; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.user_companies (id, user_id, company_id, modules) FROM stdin;
1	1	1	["purchase_orders", "quotations", "invoices", "delivery_orders"]
2	1	2	["purchase_orders", "quotations", "invoices", "delivery_orders"]
3	1	3	["purchase_orders", "quotations", "invoices", "delivery_orders"]
9	2	1	["purchase_orders"]
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.users (id, username, password_hash, role, created_at, email) FROM stdin;
1	admin	$2b$12$wf63FMsr7G7E7Pu7gEtObu6ZgDZYyE/Nm9P/B1zCF2NwHr/tvZh/m	admin	2026-04-13 04:26:09.031283+00	\N
2	raju@spsysnet.com	$2b$12$VjuCYCsqXSigkyVjrQ23SeRreIuoCCwueQyE61cpOiF7x0Dn5ypDq	external	2026-04-13 04:32:54.478155+00	\N
\.


--
-- Data for Name: vendor_invoices; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.vendor_invoices (id, company_id, pi_number, pi_date, vendor_name, po_ids, po_numbers, currency, total_amount, paid_amount, status, notes, created_by, created_at, updated_at, expense_account_id, gst_treatment, gst_rate, gst_amount, gst_inclusive, exchange_rate) FROM stdin;
10	1	1542511	2026-07-30	Micro United Pte Ltd	[1]	RPO-0001	SGD	218.00	0.00	pending	\N	1	2026-07-30 09:38:26.402836+00	2026-07-30 09:38:26.402836+00	\N	standard_rated	9.00	18.00	f	1.000000
11	1	256595	2026-07-30	Micro United Pte Ltd	[1]	RPO-0001	SGD	104.55	0.00	pending	\N	1	2026-07-30 09:38:35.051647+00	2026-07-30 09:38:35.051647+00	\N	standard_rated	9.00	8.63	f	1.000000
\.


--
-- Data for Name: vendor_payments; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.vendor_payments (id, company_id, vendor_invoice_id, payment_date, amount, reference, payment_method, notes, created_by, created_at) FROM stdin;
\.


--
-- Data for Name: vendors; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.vendors (id, company_id, name, address, country, contact_person, contact_email, phone, gst_registered, gst_no, is_active, created_at, postal_code, currency) FROM stdin;
1	1	Micro United Pte Ltd	10 Ubi Crescent, Geylang	Singapore	Sathish	chaitu556@gmail.com	+65 67654542	t	\N	t	2026-04-17 11:27:40.597603+00	408564	SGD
\.


--
-- Data for Name: voucher_attachments; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.voucher_attachments (id, voucher_id, file_name, mime_type, file_data, created_at) FROM stdin;
1	2	FBW9116X_July2026_DBSReceipt.jpeg	image/jpeg	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AAAAAAAAAAAAAAAAAAAAAAACLKiykBXLdTy3l91KPk0QAAAAAAAAAAAAAAAAAAAAAAAD08/Rz34/QyIHy+xrrHH4/vxsNgBFlaeCSkUSkUSkUSkUSkUSkUSkUSkUSkUSkUSkUSkUSkUSkUSkUSkUSkUSkUSkUSkUSkUSkUSkUSkUSkUJUeQArmOnj8fRwi/1+X92iXool6KJeiiXool6KJeiiXool6KJeiiXool6KJeiiXool6KJeiiXool6KJeiiXool6KJeiiXool6KJeii9rey687QfXngPl9jXWOPx/fjYbAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD5fY11jj8f342GwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA+X2NdY4/H/AP/aAAwDAQACEAMRAAAh88888888888888888888888888888888888888888888888888888888888o88888888888888888888888888888888888888888888888888888888888o88888844gc888888888888888888888888888888888888480Q0sIAs8888o888888UMsww8888888888888888888888888888888888wc8MMMssEoU888o88888888c8c888888888888888888888888888888888sMss8c888c88888o88888888888888888888888888888888888888888888888888888888888o88888888888888888888888888888888888888888888888888888888888o88888888888888888888888888888888888888888888888888888888888o88888888888888888888888888888888888888888888888888888888888o888m/wAfPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPOOGfPPF/VfPKPPPIsY/PPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPOn6NPPL7fPPKPPPLb7fPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPOwxHPPDbHfPKPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPKPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPKEMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMIKPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPKPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPKPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPKPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPKPPPPPPPPPPPPPPPPPPPPPPPPPPPPPLHPPPPPPPPPPPPPPPPPPPPPPPPPPPPKPPPPPPPPPPPPPPPPPPPPPPPPPPPOKTCtNtPPPPPPPPPPPPPPPPPPPPPPPPPKPPPPPPPPPPPPPPPPPPPPPPPPPOOJPffX9PPPPPPPPPPPPPPPPPPPPPPPPPPKPPPPPPPPPPPPPPPPPPPPPPPPOL+vfeZXXfPPPPPPPPPPPPPPPPPPPPPPPPPKPPPPPPPPPPPPPPPPPPPPPPPPPLf/aYv/XoHPPPPPPPPPPPPPPPPPPPPPPPPKPPPPPPPPPPPPPPPPPPPPPPPPPPNd/PveFvPPPPPPPPPPPPPPPPPPPPPPPPPKPPPPPPPPPPPPPPPPPPPPPPPPPLPL/ve9fNPPPPPPPPPPPPPPPPPPPPPPPPPKPPPPPPPPPPPPPPPPPPPPPPPPPPPNKEnPDt/PPPPPPPPPPPPPPPPPPPPPPPPKPPPPPPPPPPPPPPPPPPPPPPPPPPPNL/PPPPPPPPPPPPPPPPPPPPPPPPPPPPPKPPPPPPPPPPPPPPPPPPPPPPPPPPDPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPKPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPKPPPPPPPPPPPPPPPPPPPPPPP8dPPPPPPPPO/fNvPPPPPPPPPPPPPPPPPPPPPKPPPPPPPPPPPPPPPPPPPPPPLDPeSi4I+ncbFwf8Azzzzzzzzzzzzzzzzzzzzzyjzzzzzzzzzzzzz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88o8o4T8wfE3bTJx3n7xIAAnItvH8888888888888888888888888888888o889c+PtttNd/9N99/df99NdftttN8888888888888888888888888888888o881913518518x0881888888888889595988888888888888888888888888o88ToKI3Z68oic005sueg7Qk8TX7vwCALe88888888888888888888888888o88N9ddstdtdf9dds89Ntdst98888t9Nts88888888888888888888888888o88888888888888888888888888888888888888888888888888888888888o88888888888888888888888888888888888888888888888888888888888o88888888888888888888888888888888888888888888888888888888888o88Pb8888888888888888888888888888888888888888888888888888888o887H1888888888888888888888888888888888888888888888888888888o88888888888888888888888888888888888888888888888888888888888o8833199zzyz7819+7/8AP+88t8e+s9vt/Pft/fPPPPPPPPPPPPPPPPPPPPPPKPPP6OyUAYn66eH2RcwAha6/iK7K9ISc+fASYfPPPPPPPPPPPPPPPPPPPPPPKPPL7brr3PnH333/AA0+zxw9/wBu/vf9/wD/AL2w+w5zzzzzzzzzzzzzzzzzzzzzzyjzzDTnDzjjTjn33HzzXzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzyjzxuCcVMBRgAT9uwDS5Tzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzyjzw1++223809932181/wA8888888888888888888888888888888888888888o88888888888888888888888888888888888888888888888888888888888o88888888888888888888888888888888888888888888888888888888888o8888888888888888888888888888888888888888888888888888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PP8Az0AAAAAAAAAAAAAAAAAAAAAAAABfzyjzxP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8Ad85GPPPPPPPPPPPPPPPPPPPPPPPPM88o88888888888888888888888888888888888888888888888888888888888o88888888888888888888888888888888888888888888888888888888888o/9oADAMBAAIQAxEAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACgAAAAAAQhSggAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwzAAQxCgAAACgAAAAADDgBwyAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABBSiRhADjygAAACgAAAAAAACADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADDBACAAACCAAAACgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACgAAC/wMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQwMAADwcsACgAAA/NQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPZUgAAU8AACgAABPCMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABD62AABMAMACgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACjjDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDCSAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACgAAAAAAAAAAAAAAAAAAAAAAAAAAAABSAAAAAAAAAAAAAAAAAAAAAAAAAAAACgAAAAAAAAAAAAAAAAAAAAAAAAAAAQYDUJmMAAAAAAAAAAAAAAAAAAAAAAAACgAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAQMAAAAAAAAAAAAAAAAAAAAAAAAACgAAAAAAAAAAAAAAAAAAAAAAAARdAAAWyGMAAAAAAAAAAAAAAAAAAAAAAAAACgAAAAAAAAAAAAAAAAAAAAAAAACUYDzoMAEAAAAAAAAAAAAAAAAAAAAAAAAACgAAAAAAAAAAAAAAAAAAAAAAAAAQsMEMAAEAAAAAAAAAAAAAAAAAAAAAAAAACgAAAAAAAAAAAAAAAAAAAAAAAABACIIA6kAgAAAAAAAAAAAAAAAAAAAAAAAACgAAAAAAAAAAAAAAAAAAAAAAAABAAAQwEBIoAAAAAAAAAAAAAAAAAAAAAAAACgAAAAAAAAAAAAAAAAAAAAAAAAABChHAAAAAAAAAAAAAAAAAAAAAAAAAAAAACgAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACgAAAAAAAAAAAAAAAAAAAAAAQ8AAAAAAAAAAsAsAAAAAAAAAAAAAAAAAAAAACgAAAAAAAAAAAAAAAAAAAAAASGs/wDY08fPrEYzAAAAAAAAAAAAAAAAAAAAAAAoAAAAAAAAAAAAAAAAAAAAAAT8T7M3YYULMHELcAAAAAAAAAAAAAAAAAAAAAAoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoAAAAAAAAAAAAAAAAAAAAHLDgHGH4fvA+DAemIjBAAAAAAAAAAAAAAAAAAAAoAAAAAAAAAAAAAAAAAAAAApAQRVrNMD/bgDrfLOXAAAAAAAAAAAAAAAAAAAAoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoAAHUaueueoWueuem8u8uwO8P0C+O8L2e8e4ase+aqeueoUufuem+u8ukMAAoAAH/AE9w3yw04zy74+676+6z6wwyzx1817181/1309wyywwwzy/4/wAs+vOwACgACPvdessNfuMNfveN+/fv8MMP8MMP/MMv/vPesvvesMNfuMdfv+P+PeO4ACgACOtgfCSiHWihfvddcNeP9dfP/P8Aj/Trj/7rXrL73r37373DXv3DXHXzoAAoAAjvvwUEMUMdgXDXXXDfDXX/AI/8/wDPvv8ATrvrDv37z7373z3r3D3HXHfXiAAoAA3/AK6+9+88/wDvcNe//wD/AA1//wANPP8Azrz/AM6z7w/96w+9+941+9w379//AMcMACgADveQBTqesvvOOtvvv/s+vPsM/fPMc/fN+/d9PeccvPPfvj08NuahTx8sACgABvshQTwSM8/Ne8+Of++v9Mcv88sP89vP/wDfXbzPXrrYR/TLIYJhLTAv7AAoAALrvP77VTPfPXvfDX3XL/HXP/PvP/Prr7vr/rrvXvP8ycveYrfUMcPPrAAoAAP/AC+z363637z813x01w5z/wAv8/8AP7DvvLrr7L/rTPfvfrfvP3XXHXvDiAAoAAP/AKw536253721172y/wANM/8APTP/AD4w/wA+POuud+sOd+tsNe9sdf8Abf8AwwgAKAAPPy5x3yy0x7y+5/67666z7www/wANdN89dd99d8scd8sNOe8uue+u+vOEACgAACCBCACBCBABCBADCBADABADACADACADACBDACBCBCBCBABCBADCBBCAACgwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwygAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACgAAMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMACgACgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABQACgACgTwc88+ccscsAesMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQsBQACgACgDtfqtmar/s9wb0QAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADmUhQACgACgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABQACgACkwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwxgACgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACgADEIAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACgADO9CCAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACgAAEkgQgQQAwMAAAQsMEwQYIAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACgABajxQZAa1jHXTtPTLCdwIjLZeSAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACgABNCOANMMPMBOONOCMAPNMNBMPOMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACgAAsMswc8gMMA8gAAsAAAAAQAAAAAscMMMAAAAAAAAAAAAAAAAAAAAAAAAACgABDpNwwPNCasURgNBfOAbnQgJAiil/a5sAAAAAAAAAAAAAAAAAAAAAAAAACgABOPONANPNNBNONABNMMNCMMAAABMPONAAAAAAAAAAAAAAAAAAAAAAAAAACgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACgADKAgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACgAAGSsAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACgAAQAsIsgg8A0AMsMQoAQQAsgcQ8YccwAMMIMAAAAAAAAAAAAAAAAAAAAAACgAAXjGugceZVdQwNcTyf8AeNPGwywhfjUHo3H3AAAAAAAAAAAAAAAAAAAAAAAoAAQTzzAATwQQwQQjQggQCAjzwAwjAQzTgwRzgAAAAAAAAAAAAAAAAAAAAAAoAAEILIIGIIGPPPPECPAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoAAUO8nRA0gwUiQUFYDoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoAAzARjjzgzwQjTDwDAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoAALqZTXkorPDoPDPHHPDIDHgDDAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoAA4YjUAWFsmVVUWYd3eMgdtFUrAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoAAAIMMEAAAAEIIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoAASZhxXbg62HEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoAAOTIEM/FnfI8gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoAAHAAIAAAAAAAAAEIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoAATOATNkXjDpMfVJjMwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoAAzjzDDDzRzCDhDzzDCAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoAAVD9Q98MHpskTVHMncJ+sPAsfrjAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoAAAUbf4+7pYI7Mc8x8jngYELPPGAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoAAAAAgwAAAAAAAAAAAAAAAAAAgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoAAOHIAIEAAAAAEAAHIAADAAIAEAADOAALIPCAEAAAAPAAAAAAAAAAAAAAAAoEM/ZZdCyFIv739Gw8EltxEDTMfdLPKXdcMO1tdbLRU/pLkoEMMMMMMMMMMIoTzxxRRBhBhRhhxhRhxxBBRxBxRhgBhBxBzSiSSTCjSCTCTxzzzzzzzzzzzjoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoAAMYAfAIAIMrIRFLAACCEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoAAEkwJdkM1jeAoOLWVVyhAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoAAAQAzTAjgTAAxAgiRBDzAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoAA4wwwwwwwwwwwwwwwwwwwwwwwwwpACCDDDDDDDDDDDDDDDDDDDDDDDDzAAoAAoAAAAAAAAAAAAAAAAAAAAAAAAABAWAAAAAAAAAAAAAAAAAAAAAAAAAAAAoAAoAAAAAAEMAAAHAAAADAAAAAAAABAWAAAAAAAAAAHCAAAAAAAAAAAAAAAAoAAoAAAAAATQaL8QTX3kK/AAAAAAABAWAAAAAAAAAAoMOFeBAAAAAAAAAAAAoAAoAAAAAADQzwzAACXQTxAAAAAAABAWAAAAAAAAAAgRBCzCAAAAAAAAAAAAoAAoAAAAAAAAAAAAAAAAAAAAAAAAABAWAAAAAAAAAAAAAAAAAAAAAAAAAAAAoAAEAAAAAAAAAAAAAAAAAAAAAAAAADAGFMMMMMMMMMMMMMMMMMMMMMMMMdAAoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAo/9oACAECEAE/AMt20sPShqvCMMuW0sPShqvCMMuW0sPShqvCMMuW0sPShqvCMMuW0sPShqvCMMuW0sPShqvCMMuW0sPShqvCMMuW0sPShqvCMMuW0sPShqvCMPMIqKqhRjeDJ2TEA/MJL9NQIng57aWHpQ1XhGHnZslpxglfgEHi8xJPHS8y2lh6UNV4Rh5hG4RiLJaTv5w4vS3AnFjf4eY+YzntpYelDVeEYZctpYelDVeEYZctpYelDVeEYZctpYelDVeEYZctpYelDVeEYZctpYelDVeEYZctpYelDVeEYZctpYelDVeEYZctpYelDVeEYddJlXQOSIGyqBk4EiJ5qppNxYiIvzO/WGZGRU589D6NhdatpYelDVeEYdcQh2nzFJeDLrdtLD0oarwjDrVl2Y5SSSR803m8nPzOOlwsdfKOoUmslEZf++Yan0FtmalT1u2lh6UNV4Rh1pqxJS2andAzfso2GGd+Y1QnmBnFQV7GYInTNcXW7aWHpQ1XhGHWyNwI3zEU61PPrdtLD0oarwjDriFuBKI5jNwW0fe65bSw9KGq8Iw68bQ3pqU/H47HPncaL3OT6OMvZzZtlQI3019atpYelDVeEYddWmIjKv8AniVdZBKDe9Xg7+X+vW0sPShqvCMMuW0sPShqvCMMuW0sPShqvCMOrpSaqCHJHiMjzEf0SUReAMnZ5lIhdnJ/V7aWHpQ1XhGHV2a4Tpx0AkeioEnmqEPM8QqFFDnhKS5x3yIG48wg7rwSCiMr7rwX7MIh7sSQy7QTeUCTzDPOGvZ9nq9tLD0oarwjDq6FOvk8jBKSmsJXX2hHzXCNKgld+pQUacQjSoREFLEaQlfS7wQtzyO8Yj5rgtcXV7aWHpQ1XhGGXLaWHpQ1XhGGXLaWHpQ1XhGHVSJ4hMGTg6jxDi/7BAyENB5nAnYxD+Dw4OEOnTNDezgy0h1ewQ/gD0GXVbaWHpQ1XhGHVSxleD/wmxeI8QnZMZ3wl3wnMRAyBKvaZiHj1a2lh6UNV4Rhly2lh6UNV4Rhly2lh6UNV4Rhly2lh6UNV4RhOhBq+IufPuFz97cLnz7hc/e3C5+9uFz97cLnz7hc/e3C5+9uFz97cLn724XP3twufvbhc/e3C5+9uFz97cLn724XPn3C5+9uFz97cLn724XPn3C5+9uFz97cLn724XP3twufvbhc/e3C5+9uFz97cLn724XPn3C5+9uFz97cLn724XP3twufPuFz97cLn724XP3twufvbhc/e3C5+9uFz97cLn724XP3twufvbhc/e3C58+4XP3twufvbhc/e3C58+4LZGnOU9tLD0oarwjCdl0crKpKe2lh6UNV4RhOy6JZWOe2lh6UNV4RhOy6JTHM+Z4eHh4LJhz20sPShqvCMJ2XRLKxz20sPShqvCMJ2XRLLNtLD0oarwjCdl0SmM3DlSzhSnUgmpaAtcIJoR5shLVCTxEv0Qlo8n1CNR3khDSIn1AlqVeIghcWkpo1HeKgIXET9ojUq8QQuLzbaWHpQ1XhGE7LolM0TEQj9JIVfQGhljIw07Ia9EIvFkEyeFxYgzdCDaYk0hCISpCIuyGO8NeiYZ9Eh6wMuiGXSX5ttLD0oarwjCdl0SmWl+Nw5x1BTP8A4g0qUFIoTmEClX8hNEvKigRq9EQOSecIiT2BSojfzQmJPZCE9oJeojiBRJxBDP8A5BMScTwyQ7xmOe2lh6UNV4RhOy6JZWOe2lh6UNV4RhOy6JZWOe2lh6UNV4RhOxXiys0XCU9tLD0oarwjDzIzrPaIzrPaIzrPaIzrPaIzrPaIzrPaIzrPaIzrPaIzrPaIzrPaIzrPaIzrPaIzrPaIzrPaIzrPaIzrPaIzrPaIzrPaIzrPaIzrPaIzrPaIzrPaIzrPaIzrPaIzrPaIzrPaIzrPaIzrPaIzrPaIzrPaIzrPaIzrPaIzrPaIzrPaIzrPaIzrPaIzrPaIzrPaIzrPaIzrPaIzrPaIzrPaIzrPaIzrPaIzrPaIzrPaIzrPaIzrPaIzrPaIzrPaIzrPaIzrPaIzrPb5ltLD0oarwjDLltLD0oarwjDLltLD0oarwjCdwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHB09tLD0oarwjDLltLD0oarwjDzYCc9+4OOoQnUDIyxCE6gpDnX6c38pEJ1AyCUPzBx1CE3PEJ1CG/mdvEJ33ZFMnebbSw9KGq8Iw83s+I7Q/UH9MKEX+Pm4pj7WRSN2kEfm20sPShqvCMMuW0sPShqvCMMuW0sPShqvCMMuW0sPShqvCMMuW0sPShqvCMMuW0sPShqvCMJ03sV8OEN6m+CTnvg07r+VbaWHpQ1XhGE76A+gRCIRX8+VbaWHpQ1XhGGXLaWHpQ1XhGE8ND/AKS43CGh9cykGm+EpioIJS83BKYjcIDp7t8El781INLnHWDQbyLGf5hSXG4JS8Gh1NBlmCkuBpc7OTwaDIiOsEjHRSbhyWdO0JQZvzBKYrwSl5uBpoI6waTJ2cKTDRkC2lh6UNV4RhP2P7g16QPolpDMnnopCuiGV89BhHOCCoPE+gdr2gooS9oMj/UGeNQWEdFXgCe46sYW4LphHpDsf3BXRT4hNEO0JKFStBhHO5wZVeIRScQX0cgW0sPShqvCMJ30OHKqBNDIR7wRu8QRuCVGV4PDwpTwRuD8QfirBG68FLeDN4jBG6kRB4M3iMJUZXgRuDwR38+QLaWHpQ1XhGE5JeITBk4QmCJ4InzODpneYZO+kIniExCd4GTgRP63bSw9KGq8IwnxeI/SMUyL+0Z6wf5j0vAeiKgf/6FemYieYUDn9EfEelNQKBRTuFAxBU6b/gfW7aWHpQ1XhGE5GZB4eIpnh4eHiIPDw+d4eHh8z/OI3B4eH9ctpYelDVeEYZctpYelDVeEYZctpYelDVeEYZctpYelDVeEYTpDvDLFtLD0oarwjCdJu2HMZ5XtpYelDVeEYZctpYelDVeEYTkgzvE8Qm9zqQSTMGkyvk4GThCdV8GgyxDk1VAkGeK8DSZXydMZOBk6gQHUDQZXycIDvuOYkGeIEkzvE8Gkyvk4cmqowSDO8TwZOEB1XgaDLEDQZYjBMzPEIDqBoMr5OmhN7sY5NVRgkHUDLrFtLD0oarwjCdPR8Qns4x2f7gnoqC+cO0n2Qp3pBf/AOQjoq8Avohkl56KQ0DTphXT8R2/EJVzgrpeIadIJ7eIKoTXEGntDsf3Dsp9oL6QV0/7heV0gz/Iwz7XshWl4INekY7H9w7KQvop6xbSw9KGq8IwniocEqcb6gSwawpQ5URd0cp3RFfziIRUGVYixVjlBFS8RUvHKTcoI7/eEQ5TuiMKWDU83iKl4MwlTtjglUL6HvoEfdDxyndEVDgS8zxH1i2lh6UNV4Rh5rp3B0zg4ODg6Zwdkq2lh6UNV4RhPi8QXZ0TYwV+b0hUK5k/gCD5305KtpYelDVeEYTkbhEIhFjBG4PEQeIhEHgjBG4RCIRZKtpYelDVeEYZctpYelDVeEYZctpYelDVeEYZctpYelDVeEYTuofnBJvZyFANNLg6/mCkuDvweDK8HBxg0ucHGHGHGHAyBk4OMODjEJ1CG8CJ4ceQraWHpQ1XhGE5Xp4p/wBIUH9EGPhMnGPgP+wVE2Igc3oirIltLD0oarwjDLltLD0oarwjDLltLD0oarwjCdHRPFSEdK+MR9od4ekrN/kMXNHb0hn0wno1UhfZCvS9LJ9tLD0oarwjCeLmuzhCoTeIiIR81wj5o5oj5wSrnPCVCL/iOU/5ZPtpYelDVeEYZctpYelDVeEYZctpYelDVeEYZctpYelDVeEYTkkzyzbSw9KGq8IwnK94j/8AIKd0xk7aHAxWHU/yoVZwX5zGQVkm2lh6UNV4RhO8RCIEYeIg8RCKZ+8RB4eIhFkq2lh6UNV4Rhly2lh6UNV4RhOlJG+m8Rm4JdnEBPPug00PIElL3U6QSSInnW4nCAqKaDEJG9z6BCUL34wpJERU3waC5tPSxiFJ1hMOcKTS4gpHRdS8QFexhCX6MZhRERmVINJOfSDSRER33hKUnXQISIie+moEknnS8iJ4U7OEkk6weQLaWHpQ1XhGE7PteyYZ0PP0So0mGWP0sQVe5wSRl7IT94KGLnDsf3BXRT4hXYCc/RDOh51XtJhCiJ+cegIYVRYglRBr0g0/xCuinxB0JLvUj0YR2gfR53gLyfa/DINtLD0oarwjDLltLD0oarwjDLltLD0oarwjDLltLD0oarwjDLltLD0oarwjDLltPD0o6rwjDLltPD0o6rwjCdwdi+lIvMd5sJzuDp4ZiSDLz3dRtp4elHVeEYTp8zECvHMn8jnLzE/l5qp1A5vymqmhnxeYQxTKFXUbaeHpR1XhGAeHh4eIhEIhEIg8RCIRCIRCIPEQiEQiEQiEQiDxEIg8RCIRCIPEQjEYjEYjEYiEQjEQjEQeHh4eHh4eHh4eHh4tpYelHVeEYZctpYelDVeEYZctpYelDVeEYTkmh73BxV7pnTGV7POSb+YEnPTum5f/AFeTd2I4n95znf8AcxG+9SIyppKi/TemJRHeMj0CIr76K8QU3SSyQ/nKIzxOJzr+c30ZHtpYelDVeEYTl0fEJ/IPoIH2pn9EelNiUCoKZa0pskolEn/Qxm7tizFpWbHnEpkbRzQyN6Xu5pKO859Y5pKskmfNRyVMHZaU9HPCLH5NryJf6SIPvNP+PxEomZMVufiidfheUW7cIWaWzHkYaUrjg9Dsxf3CNNxwv5z3Q4/6gas0XSiJKeczO/6byd/dke2lh6UNV4Rh5zw+Z8z51sULpUhKjrNJH+IJigihgTCd9MJOPwDSxkKQpmRQJV6PNFyKVBG0iJCouhD0ZkMko6KUpf6JOHIIeZwJeq+cJU6QpmlTokkqG88iN2irI9tLD0oarwjDLltLD0oarwjDLltLD0oarwjCe8ItGwRaNgi0bBFo2CLRsEWjYItGwRaNgi0bBFo2CLRsEWjYItGwRaNgi0bBFo2CLRsEWjYItGwRaNgi0bBFo2CLRsEWjYItGwHNZ7c2LJSk9KgiOp53xdrb1q/vGLsa+tafeMXY19a0+8Yuxr61p94xdjX1rT7xi7GvrWn3jF2NfWtPvGLsa+tafeMXY19a0+8Yuxr61p94xdjX1rT7xi7GvrWn3jF2NfWtPvGLsa+tafeMXY19a0+8Yuxr61p94xdjX1rT7xi7GvrWn3jF2NfWtPvGLsa+tafeMXY19a0+8Yuxr61p94xdjX1rT7xi7GvrWn3jF2NfWtPvGLHlBqlaf9RSyeT0qN5GXjPbSw9KGq8IwnPFo61iLxmlf+gr2k/j1pF9Okp7aWHpQ1XhGE54tH0BoMr5eYRbvNd9DiLxmlf+gr2k/j9GzsZosokoUoqyJ4Uk0m4yMjLEdB/TIvp0lPbSw9KGq8IwnPFo89CnG8eyoEi9nziEudjcYgLm5x2VhBPxP/mPMFI6Ihv0BKb1F/OIb/tCBMUP0GIvGaV/6CvaT+P0a1Osdk6j/UX+Q5O6E2LF0lmtMXaNCfgOTZNEtYEGzNkURHFFGkr8VR6ByDEmjNnAr/VQjnR9E1VEGViESFKNPKHGaCSa+TLm31PeTzzCy2SWaubeUklOfFC++l5X3H9Ei+nSU9tLD0oarwjCc8Wjz0qcIxGIt4jvd0RhKnPxvviMReyOUEY5TnRfQYi8ZpX/AKCvaT+P0bOyySgkKZpaQmaiiNWPQYXZa1LSvo8n0Ep6KfALsuhZJZpZ8p0zLH+lIus+UZtIf6ZJ/wCATZXSSpBNEqVHD6KtIatYzfClPdT9Ei+nSU9tLD0oarwjCc8WjrWIvGaV/wCgr2k/j1pF9Okp7aWHpQ1XhGE98OzkHZyDs5B2cg7OQdnIOzkHZyDs5B2cg7OQdnIOzkHZyDs5B2cg7OQdnIOzkHZyDs5B2cg7OQdnIOzkDms6xzbM1IKg6DJ955YvEfNjf1Z7U/EfNjf1R7U/EfNjf1R7U/EfNjf1R7U/EfNjf1R7U/EfNjf1R7U/EfNjf1R7U/EfNjf1R7U/EfNjf1R7U/EfNjf1R7U/EfNjf1R7U/EfNjf1R7U/EfNjf1R7U/EfNjf1R7U/EfNjf1R7U/EfNjf1R7U/EfNjf1R7U/EfNjf1R7U/EfNjf1R7U/EfNjf1R7U/EfNjf1R7U/EfNjf1R7U/EfNjf1R7U/EfNjf1R7U/EfNjf1R7U/EMJLbGtMSYEvJ5mZXvA789tLD0oarwjDLltLD0oarwjDLltLD0oarwjAf/2gAIAQMQAT8Ay3bSw9KGq8Iwy5bSw9KGq8Iwy5bSw9KGq8Iwy5bSw9KGq8Iwy5bSw9KGq8Iwy5bSw9KGq8Iwy5bSw9KGq8Iwy5bSw9KGq8Iwy5bSw9KGq8Iw8wzprrIU4nAjfkxZHopIF5hm7RWDNwKe2lh6UNV4Rh5lecFR+Yz5slqxCH8QssfmKMXr/wD55ltLD0oarwjDzDJ4hEOS1FezB51bwbzxO8fMdMU9tLD0oarwjDLltLD0oarwjDLltLD0oarwjDLltLD0oarwjDLltLD0oarwjDLltLD0oarwjDLltLD0oarwjDLltLD0oarwjDLltLD0oarwjDrjVqlklS1qSzQgnqWoySlJFjMzoIhKtsZiyM0WKxOyDKjlVmbNn/al0ai0wBVsazzN5IsYi9Hk1u/+x4k+2U8yKyrGIiO+0YGdH/8ANZ0l/e/MLBs9jZjMmrBolqhXaTiOpRHSlRVGRGF2UbEkIYKg5iFLaJoWta0kpSTV0iQgzghI4Thic8xZjRK2ilIvGSXuTASlkkiWoklQlK1xKIqHEbnF1q2lh6UNV4Rh1z5Y/KZUoNlMWSnWKwU5JEdDZab7RVaX9Aqudj8yQJdayW3S0QZqZqMibMn81oj8CWXZViPMZkLFslFkM2bVmqJDVJLQdaVE8tB1liOjrdtLD0oarwjDrUgfJslsmrRstKibszZoJmtLQkE8jNRqSZpNZGROIjMixj5cRSZYVlmlqzanAbNm0ZNErpaqJm9xHEhRRPpxlQ+cieLBkCx5Nsc7LlRJqU1IysewnmloozK+txkZK3MypVS4gewWubNNrYbRiZvuZqZJzM2pREX34+t20sPShqvCMOtWDKamDCy2JKNPLpTDf6UREt1UTM1EdZEPlyyNcmWQ7sGyUegmiX7Hvmk+SbElew0s7GIrHlCxUmakKVRZSfSpoprLoKoVQ4xYMmsPk+yTZdnETWzFk+xbDeRwH6Sr5RFjVSlHZeoSpKjaUGqmzdcSlXi7CE4kILEktp3zpmtZMjJlZi8S2jNJaUJUZ/5l1u2lh6UNV4Rh1uzLFTZLFqxX0WyFIVmJROeWcr5ZxKFgNLDbNWDUnLZKNJ1KLsqLuqJyizGLGslpY7RDVks2bRmb0LTQZH8MRkdBlQYs2zmtltFNW7Q2rRd9R1FeIiJxJSVRERTIQajJKSNSlGRJIqTMzoIiLGZmPkzJPzdYbJir+ob2jb/dXSZf2k5D8cPW7aWHpQ1XhGHXPlN8lmUqoJRGTGyGZOZtXUKL0GmM0PvHfSdJYyEpyJZUnqNLdipBYmhFEyV7Ky5vh0qymsOT29lqgYMVtlVISZuzqO8ks6jIh8lfkWVgmmyLJhaWQX9NBUoY539prn6KcT7/AFy2lh6UNV4Rh12CPmuiiohc978TsbwUgWItLVarEseNiaTMjYM3uUcKnnC+IlQ0ZzqDNklmUKEpQkuykiSWwqJkrRZBElcLJqROQ16KGjryWuJKsRNL3rPSC0GgzSonGkzIyqMr/WraWHpQ1XhGHXbGb8itK3RQvofCblEZHCqmFZEb0qccKnG4NW6CQbNklSSWZKWpaiUpUL4U0EkiQTzPHEpx4i69bSw9KGq8Iwy5bSw9KGq8Iwy5bSw9KGq8Iw6upRJpMcqWMjJ+My+iUsk+II35pkrifmN3V7aWHpQ1XhGHV2iIiovlSDX6SQaucmpwi57sTgmJVL3VEFKPmleM74J5ZyEb6YnVEDWcJHeffOoI9qL8RF3oVVYg1Lo6dgOg0g1c8izBl2va6vbSw9KGq8Iw6utL7xuMgaVKoNwUi8ZdkQHE8QKTed8ApF6tISR49hCBSbzhCdd7eEopf+AgVeoPPjCkdHuhaHuMr5CA4nhCIX1H1e2lh6UNV4Rhly2lh6UNV4Rhly2lh6UNV4Rh1UzcIiBG8PpDz24gYIw+8DEX4uDw/eCVo0Y5or+YEej4B9W0Rfi7MCPOR9VtpYelDVeEYdVPEPiKxj8B4OzhW0fAFiCv/R+Q+FAIOxbwRg0385CrE4H/AOjwGOrqttLD0oarwjDLltLD0oarwjDLltLD0oarwjDLltLD0oarwjCdaySLozbxdGbeLo7u8XR3d4ujNvF0Zt4ujNvF0d3eLozbxdGbeLo7u8XR3d4ujNvF0Zt4uju7xdGbeLozbxdGbeLo7u8XR3d4ujNvF0Zt4uju7xdGbeLozbxdGbeLo7u8XRm3i6M28XRm3i6O7vF0Zt4ujNvF0d3eLo7u8XRm3i6M28XR3d4uju7xdGbeLozbxdGbeLozbxdGbeLozbxdGbeLo7u8XRm3i6M28XR3d45fu7xdGbeLozbwhqSsxz20sPShqvCMJ2vSPKyaJ7aWHpQ1XhGE7XpHlYp7aWHpQ1XhGE7XpHMQ/IODg4ODg4KyYU9tLD0oarwjCdr0j8x/mvyaU9tLD0oarwjCdr0jyzbSw9KGq8Iwna9I5iJ45I8x5nhKTOgGyPMYQiIGzMs+jISExG4QovRH+QUzcbqxAkqDMLZwm6++8DQlN8zfmC0Q5yO9NyaSvnSFohN2wcmkr50haIfNtpYelDVeEYTtekczNUJiD0VBN5dYZkeIyDO+rQYZHziC756cgkbgzhx39wavi/AEzxqo/ELXEZOxXguHtUHmDbFViDLpEGnSMerDXpGGvRT5ttLD0oarwjCdr0jmQpx3nh6SppCWl/HFfBKSmsJWT1ZxGlN7fkJmpx1iBPpA1kaiqILhV2xQkyMjiCoVUxOC1lQksQU5JlCDhVS9wW0po7IVCql7g0W/wmKe2lh6UNV4RhO16R5ZtpYelDVeEYTtekeWbaWHpQ1XhGE7ZFL68rM0RHPbSw9KGq8Iw8yAqi2CAqi2CAqi2CAqi2CAqi2CAqi2CAqi2CAqi2CAqi2CAqi2CAqi2CAqi2CAqi2CAqi2CAqi2CAqi2CAqi2CAqi2CAqi2CAqi2CAqi2CAqi2CAqi2CAqi2CAqi2CAqi2CAqi2CAqi2CAqi2CAqi2CAqi2CAqi2CAqi2CAqi2CAqi2CAqi2CAqi2CAqi2CAqi2CAqi2CAqi2CAqi2CAqi2CAqi2CAqi2CAqi2CAqi2CAqi2CAqi2CAqi2CAqi2CAqi2CAqi2eZbSw9KGq8Iwy5bSw9KGq8Iwy5bSw9KGq8IwneHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4fPbSw9KGq8IwnPLNtLD0oarwjCc5oje528PKsRFWHlWIirCVvfmz/wAoERVh4UtweVYiJ7g8qxFezvDyryKRv822lh6UNV4RhOc3a8B2do/SHdEJ/lF4Q0H7Q9KbF4j0s+YYx6PwHo6THx/lORDJ+gGXm20sPShqvCMJzyzbSw9KGq8IwnPLNtLD0oarwjDLltLD0oarwjDLltLD0oarwjDLltLD0oarwjCc7/gHiLcIs14ErfeyrbSw9KGq8IwndSHCHeHB17NlW2lh6UNV4Rhly2lh6UNV4RhPFS7xCVPpEVLqpkrJV4KVDSYNTieFKcTxGVHevA1OdnNwJT3lUCWTjPEX5BKnk8KU4Et9FJHnCVPBKe/MbgSyMzKoGrFTeeOUzK2BSyJ2cKVDSYNTqQSqTKoEojfmCVRU5AtpYelDVeEYT9ovZDLogukegg0NxaaAnpVP/INbxaSC+bR90LOkqHupo3DsmXo3gk4j9kt5hqV7E/m+BhpQ5P8AHEEXzxPpC+kjx2g3PKvEEP3mEG4laTF6G/n8R2/7fzBdJXgFUxUGeIgo4kp0kF83m/dDWu9i2hdBEmv8Ag+dU/IFtLD0oarwjCd2Mckn+GYNBGIC2Ayf4AyeDSR3w7eHYwlLgZPDsYdjqBk++EocCJwgL8/EGT6A4Ox1gicIC3v8QaSO+DJ4djBlezZAtpYelDVeEYTmpweCN4iIGbgZzPD5n+YR/SGbhEIgRgz63bSw9KGq8Iwnx+A+JDGN5Bd7Z+IzVfwgX5Auz4isVgvyFWgf9gzcQSCmzj0v5iHwIejNT/KhT8BTRvFIxmC3j4jeFfmX49btpYelDVeEYTmRGHBwhKZwcHBwhDg4OncHBwdM7zjJ4cHB3XLaWHpQ1XhGGXLaWHpQ1XhGGXLaWHpQ1XhGGXLaWHpQ1XhGE6n1h7s+WLaWHpQ1XhGE6ifuH5gidle2lh6UNV4Rhly2lh6UNV4RhOaiK+bhETnvoBqIgSiO8bwRvERV3gSyPGOUTWDWRY794EojvG+YjeCN4NZVglkd43iMqymNZFjIGoivmCUR3jeOUTWQNZFfMEbwayrvglkeMEsjxkDaEWMRlfeCWR3jfM8nPxDlE1kDWVYI39YtpYelDVeEYTqPnFjoCu0d4dovZCuknO8I5tO0dlXtBL/Rd4hOPmvpMLvp8QilT7zqA1NxaaPiGZ3wz6O0J6HgOx4BSeb4BJ83wDMubpCqIHU3wmlVUIZvd0R2v7R2lezvCOj4BPQ8B0kuh8Q0xaSDTs+0E6HAwy6JDt/2/mO0eggjpK6xbSw9KGq8IwnhpeFE8nVg0PzOxgkeISlw5Ohwh7w5PvCG9mENL6xDSR1A00kdQ5POHUOENDhyec3VTcnndmEF7uiGl45PvGDRncEod4gkuJwJNDgROCkv2vCkvzOpEHeMOBM3doxDS/M4Gil7zIQf+4+sW0sPShqvCMPNfO+d4eHh4fO/JVtLD0oarwjCfH4BWPSQ8HDF4A7w3UD0fAV6BVQ4fx4V+IOgOvfymb4B1GSraWHpQ1XhGE5k8QhwhxAyeHCEOEIhDgZAyeIRCIclW0sPShqvCMMuW0sPShqvCMMuW0sPShqvCMMuW0sPShqvCMJ30g1X8zt4pEVDw+9nBKD/AMQR3w8PIEp7w8PDw8EYI3gzKZ4iKsRAzD8hW0sPShqvCMJzviuYyo8J/iE4xWC/AfEV6ArFmHxH/QOmbGYL8hVpMVisfAEWQraWHpQ1XhGGXLaWHpQ1XhGGXLaWHpQ1XhGE6+kTyfQFuhvOpIYycUO4eknO77wxJTncf9ooeqLw0DsH3XhfQ8AvpOv0Xs4R2sXdCaeb6O/J9tLD0oarwjCeGl+YLS8hCZ33UVCDnPEHOeHK/wDcQg5rgpL0uCk4yEN+tQ5OrFk+2lh6UNV4Rhly2lh6UNV4Rhly2lh6UNV4Rhly2lh6UNV4RhOZuyzbSw9KGq8IwnO/4D8zB3jmpoxXw+/mFeIEb81Af/CBCrOH0eP5g8eYfAVAjBZJtpYelDVeEYTuDhCDIOEM0IhmduEIdvDg4Q5KtpYelDVeEYZctpYelDVeEYTqUZOovmRPBvzOEZuKtR0VAlG9x1PoBqURPo0YxEZm4qn0iM6aKSERk57qahEcTnOoeEqMzOhznAlnzqL2IGpROe6nFjCoszglVDzoCVvifQ4Rnfoce0nhSnacRAjMyI6KQSje6jOCUZmZOc4KUoqqREZmbnUYzBqMiKhxmbswJ+bwClKKreCyBbSw9KGq8Iwnadn2iDSlxeke4g0xejjCb/N8QoyP2qs4Vn5tF8JoiMUP5vjoHa/tCekrwBdsKcdJdINKXFWdOggtJm69RWCfzwanphx0A0nmDLohn/kE9JXgCpUfdoIUEaovAdmmvYQLpc3xqF9Xs/ieQbaWHpQ1XhGGXLaWHpQ1XhGGXLaWHpQ1XhGGXLaWHpQ1XhGGXLaWHpQ1XhGGXLaWHZQ1XhGGXLaWHZQ1XhGHmP8ApTP6GKd/mPmeH9YtpYdlDVeEYTqGYfEVjGDvlMrzPjOrFpKarQP+5iH88B/2Ej/sfkPzHwD7/hNFPjH5zVzY/CZIrHwFX09tLDsoarwjAODg4OEIcHBwhDhCIRCHBwhDhCHCEQhwcIQ4OEIhDg4QhwcHCEQiEQiAQiAQiEQCEQhwcHBwcHBwcHBwcHBwtpYdlDVeEYZctpYelDVeEYZctpYelDVeEYTmqlznh51b/MI7+ac1Xs4izUb9kxSU+wTs3lL1lFY3JQ1s+Ujjf4OhzvCUmoyIiMzOgiKkzPMQWzUg4VJNBlfJRGRl4HSLnac3/TXz+hzT53s0U+EzRktDokKRFSUSTS8qyffIckqKGFUXouOKu9fvU6Aykps0sZpZRJ/0mTRDM6FRKNoSzemhxoTAcRvJxmWR7aWHpQ1XhGE59KqgK/Mg6k/AF2fEb/xDukPRFYxpB0nNYtitW8hrSyZNGyilQjNLNCmiobmvuSRm6kqR8m7Fb2MiUzSyaMbORYhKsVKmakNiZqaQtmjJKiijJFBGkor7hG1WwkVpZiOWso7PNLMrJOFo1sSJFDVS+dyfK0JNb6DEr3ZJ6JTaJVKFkXSZ8mpSIWNhpjebRLRLVaqEcxMKGaYOlUPkYhmqUbHJoSVf1DZJW6FTcmajZEb6Om53ecFNbLbSbKRyibZRs21j3KqyCVGmyDaHyqGUVLuSfElPNIsQuVqfykNtya+RUiNLaE+TNCrDhJRL6LjVzb/SoFgWZZPzJZSWTVt/pWYzRCzUvmMGjNZtEuT0WKlPNRdEzv5HtpYelDVeEYec4OmdM6expSsixyNLGyWzBJnEaWbVbNJqvPMkmRGpxET77guUbIW0S1VZDZTVBOQ1Nqs2iSpoSsziIqTvHjMWFLjdhZTKzFLOymrE6OXUpq8nGTnmcROIzc4+adJBHygZMCsi5rEUwaWUyaMVrXZK26Us2vThRCjnVGtS3AjMjIyNxlSRlfI/iLKlBvZMPLN2reDo8q0U0h0RGbgmVLJSlCCspulDI3s0E2WSWZ1oKJyTcZ3qwwsxswJZMmzRiTQoWhM1qQS01KhMok0nQdGR7aWHpQ1XhGGXLaWHpQ1XhGGXLaWHpQ1XhGE98Q6doh07RDp2iHTtEOnaIdO0Q6doh07RDp2iHTtEOnaIdO0Q6doh07RDp2iHTtEOnaIdO0Q6doh07RDp2iHTtEOnaIdO0Q6doKb5ISSzlGz2LFs82TlrWkjcayZpM4XlSRGbnupc9wL5MycVHzfYtFbBBntMnmPJqT/s+xfcM/0jyak/7PsX3DP9I8mpP+z7F9wz/SPJqT/s+xfcM/0jyak/7PsX3DP9I8mpP+z7F9wz/SPJqT/s+xfcM/0jyak/7PsX3DP9I8mpP+z7F9wz/SPJqT/s+xfcM/0jyak/7PsX3DP9I8mpP+z7F9wz/SPJqT/s+xfcM/0jyak/7PsX3DP9I8mpP+z7F9wz/SPJqT/s+xfcM/0jyak/7PsX3DP9I8mpP+z7F9wz/SPJqT/s+xfcM/0jyak/7PsX3DP9I8mpP+z7F9wz/SPJqT/s+xfcM/0jyak/7PsX3DP9I8mpP+z7F9wz/SJX+SFgWRY7VKbFY2OskKNm1ZISzUhZE9J810SX3yN5GU9tLD0oarwjCcsenrWM/Ca11hRl/tNv8OtWT/Taewr/ABOe2lh6UNV4RhOWPT9ASyO8ZeY/f5r/AKHGfhNa6woy/wBpt/h9HZcuWHYrTkm1lMWDRxHA0WSDcd46cRhi2Q1SS2a0tEKpStCiUlRZlE8j+msn+m09hX+Jz20sPShqvCMJyx6fPWl5GQqiS6owa7+J2Z7xEZw4nkIzKLG78x2k474Wbsbv5izhKj52N17EIjN3Ov36LwUq/TezP2iKlOdLxEp0W76DGfhNa6woy/2m3+H0djsktJZs8lpSsrjsahREoukqsJs5Mjtpe5FBchYrOxm6GBUMmdkN0uMiIuilaoVKIsRUArMs2wmtgXTZCLLZyg0Ji0QTFLI2DZaDWg2Skm9bN5Gk43m6kfOspLsSzbNTZTJKbBsiyEpYHY6VcszYL6K2jyNPNoKAiVWoSh8oWi7IZMGbZVhIOxWdktGqLGVZjQ1NugySgkrSlBFSpSipvEPk7KDWy2ClN0mloyatGRr5NbEmyUOgbJZrIlJStJlR6T9H0Vk/02nsK/xOe2lh6UNV4RhOWPT56kvoEGd4gzueIb2YQX+8IPFwUl7sThBfxvEPteN4QbxBuJwg5sP0GM/Ca11hRl/tNv8AD6OzPk+trZLSymVmtrEU2ZoZNCZJZKelm91K0qMjpxCx/k7YzKx29juW2TZkR2S1arjbtlK7a1+kXZcREk6SIWL8nYGljtG9mNrNKwn3KzaJZpSzOGGNZoSRtWqU0EpV6+EfJ5CbEsuxOVXDZq261LcUSDsg3qJOLm4g3kB62LVhZLSxG7FgmxjapShoTVim8lozWRpMyVzknQZCT7BuVnByrRuo1KWtq1VEta10qP0UpqSkiSkvorJ/ptPYV/ic9tLD0oarwjCcsenrWM/Ca11hRl/tNv8ADrVk/wBNp7Cv8TntpYelDVeEYT3g/Me4PzHuD8x7g/Me4PzHuD8x7g/Me4PzHuD8x7g/Me4PzHuD8x7g/Me4PzHuD8x7g/Me4PzHuD8x7g/Me4PzHuD8x7g/Me4PzHuD8x7g/Me4FN8lZYRJlmsbIaJNTMokNIaVElok0xEWM0m43YyoBfLiSj/+akn1s2z/AP6x5byV9eR7tt+2PLeSvryPdtv2x5byV9eR7tt+2PLeSvryPdtv2x5byV9eR7tt+2PLeSvryPdtv2x5byV9eR7tt+2PLeSvryPdtv2x5byV9eR7tt+2PLeSvryPdtv2x5byV9eR7tt+2PLeSvryPdtv2x5byV9eR7tt+2PLeSvryPdtv2x5byV9eR7tt+2PLeSvryPdtv2x5byV9eR7tt+2PLeSvryPdtv2x5byV9eR7tt+2PLeSvryPdtv2x5byV9eR7tt+2PLeSvryPdtv2x5byV9eR7tt+2PLeSvryPdtv2xKvy9k5mwa8i3ulqpCks2aUNCepROI1KUlKSQR0nS914p7aWHpQ1XhGGXLaWHpQ1XhGGXLaWHpQ1XhGA//9oACAEBAQE/AvjbZVwlHQp76/jfZVwlHQp76/jfZVwlHQp76/jfZVwlHQp76/igkJvNwEKwvKpuL6NdeyNupT36fr4Rt1Ke/T9fCPOEcYR5wjjCEqCshr+x2VcJR0Ke+v8AbYdnlqWiUYJxiyLRBpTQPuY2OuuGZcQtxS7KVZVEi5Q0xhPCacHoCikrKjQAXRKziZlkPC5JBN+amWEGYw46ujhaZRqAzXZzE5KzGBihaHipKj1cxTkiWmceyh3JaTajB0tM4RxhTMKRYIyqV7VeXkjaCb/8w/5l+MJFAPgYqs5YSsKyQs7o8/kWsIBUo0CbydEYQ2TKUSiWFkcc748wzQnB0/OXkOGvvFU+h8IOAp5m9I/yLv8AtEvhyaklWHqrAypXcrqOXtiSnm51Fts84zpPL5Nk86pTuIBohABI0qOnqhpvGKSge2oDXdB2MKTlmGhE/JeZrsW0uXVqnJCZQ0G6GSHWsXnBrCVFJqISagHT+w2VcJR0Ke+v9rhCdEmypw5t6NKs0bHpIqtTbt7jtbPNnPX2Rsf4a/zL74ialG5pNl1NsZYbZS0kISkBAuAhLaW8iQnmFIwvNnCjyJZjdBKt9mJ08wgtCVlSgfumSNSYwK7M2HESqN0pQKnDkSKZL88LwpPYOWPOQHEK5r+ZQz88NOB1KVpvSoVHX8CzuyXzd5bYatBBoTap9oWvGNpUMiqHWIl8pheU88CFJCgQRUHKIVJS2B0rmLBWa7nPZrmGjnhzDs5NKo1VP8LaanXeYOEsIyt6y4B/Gi7siUmmsOJLTzdlxIraHaDm5jElJIk2w22Oc51HSfJh/hj38vcTGDaecM1NBjE3nkMYQakXplRemDVdkAI3qbgL1UIjCOCzIvJRW0he9VyVvrD2LJFpWbNDzOLoReD5ELILQzFP7DZVwlHQp76/2uyKRmJstYpNtKQa3gX9ZEJVhdIADYAFwFGvGMHKmscvzcVdvtb3TfluyxhmamZdhstDdGmMIFaXeMYNdcdYbU8LKyL83Mac0YXwuZlfmsuRQmi11oDyV0aT+TguWlpBFA62pxW/XaF/NyQ89RpbiKO0SSADvqRgrDLc5aFAysezXfD6Rsomm8WlqoK7VrmArGCGy3KspVls9t/wHh59bEqtSFFKqpFRlvMbGZx111xC3FLTi7W6JVeCBn54wtwp/pFQ1wZn5Ed2JfKYXlPPA8jjYcBSoWkquIMYQmNpmkiXYFFHfZgeXOTGC8NuzrmJcaS4lWUgZBy1upEtJtSoIaQEBRqfLsjbszazxwkjVT7RLLQhxBcTbQDuk6RC8FSMwoOtzKW2vaRnGs1EYcwi3MuthG7bZ/1aeq6MU24AUmxdkiYcFAlN9nyNooE6QP2GyrhKOhT31/t5LA7cm6p1KlkrrcaUvNdHkUm0CNIj9FGPeO/6f+Mfoox7x3/T/wAYk5RMo2lpJJCa5ct5rE5sbZfUVoJZJy0vTqiU2NssKtLUXiMlbhq+BJyURNtltdaK0ZbowdgdqQKlIKlKUKVVTJ1ARNbHmJlwukrBUakAih+kYoWQjMkADqhDYRBYBNfQdaS8koWLSVXERI4OakUlLYy5Scp9DCWC259NFblSd6sZR/SFbE3MzyCOUEeMfoo971v/AFeEfoo971v/AFeECRVpEeZK0iG5QJvJr+x2VcJR0Ke+v432VcJR0Ke+v432VcJR0Ke+v432VcJR0Ke+v432VcJR0Ke+v432VcJR0Ke+v432VcJR0Ke+v432VcJR0Ke+v432VcJR0Ke+v432VcJR0Ke+v05vGWatG8X00xKTYmBoUN8mH5pDFLZpXrhudacyLHZ2/DL76WE2lf8AcKm3lOBd4zpTms80Ss0mYTUXHONH7AmmW6K18oUFZCDTL6WyrhKOhT31+nNTIl02jlzDSYEo8f19aOZbPJEs+iaF4FtOVJzQ7ItOeyByi6EuLklBCzaaVkVo+GHWEPUtC1Zh3hjfy/8AKES6G1FQFCrL+wdaDqSk5DDTqpFWLcvbO9VogGsTk2ScSzes5ToiTlRLp0qO+PpbKuEo6FPfX6b4xk02lWQCvbD6rCFkZQkwzKqLaXm1frKmvLEpNiYGhQypidQFtLrmFesRg9RUyivNqPwsUGdeWkqKUN5hEtIplzaBUbqXw7wxv5f+UTUmmYpUkWdEOsmQUhSFEhRoQf2DzKXk2VZIVMOS1pkLBGZWiJKVSwmu+UrKrw9PZVwlHQp76/Tn2FKsuo37f1ES00mZTy+0mPMnWScS5RJzHNCpBxv9aldXReeWGnkzzZSdyfaENthtISMg+FpH18xz/c+RUraeS7XeilPzz+TC2Rv5/wBhNzZJxLN6zlOiGsHISgpVuirKfCGnVSKsW5e2d6rRANfS2VcJR0Ke+v8AYP4PQ6bQ/Vr0iMRNJyOpVz/9R5k876167QmHpDFUWxcpGbjQw4XEBRTZJzfC0kaTD40n7+hhY+qGe16byVKQoJNlRyGJSTEuNKjlPkeZS8myrJEnLqYBSpVoV3PIPS2VcJR0Ke+v4imcHofNqpSrSI2pHvVxtSPerjake9XDGDUNKtVKyMlf8Dsq4SjoU99fxvsq4SjoU99fxvsq4SjoU99fxvsq4SjoU99fxvsq4SjoU99cVipipipipipipipipipipipipipipipipipipipipipipipipipipipipipipipipipipipipipipipipipipipipipipipipipipipipipipipipipipipipipipipipipipipipipipipipipipipipipipipipipipipipipipipipipipipipipipipipipipipipipipipipipipipipipipipipipipipipipjZTwlHQjvL+N9lXCUdCnvL+N9lXCUdCnvr+N9lXCUdCnvr+N9lXCUdCnvr+N9lXCUdCnvr+N9lXCUdCnvr+N9lXCUdCnvr+N9lXCUdCnvr+N9lXCUdCnvr/HJpwtNqUMoyfjeyrhKOhT31/jk/wCq51IH+tP43sq4SjoU99f40t1KN8oCDPtDPXqhU6yu46Qcmi8QiZbXkWOz0HFmoSnfHPxRpjzcZ1LJ02iOy6GiaqSTWzS/kP4psq4SjoU99f4w46loVUaQ9hBS97uR9YJr6DUytrIbtByRLziXrt6rR4eRKKKWrjUpzAePkQ3YrnrlJz/imyrh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QTEaBJC/KZzTDB6MjkFgFiD32sZ7E0eBGIJdOehoEBEdRsnhe/ZCM5g2WxRavcIC2OhDtSRjPH5hbKbl5KapF4whdmbliLUgiCBEwUoACkXzKKDCXFoERPGmmilC7ZHqp0Yh3IYOPF4MygwXXtXwuygqlxBjiMW9agACwWKNuL5qJhHG4Gt6swghjD9onSK1LEyLsoaFgG1CXqervE2BEWacRRkJOsSV2xVltxeiDxurV+4UC6l45O1CMR3wT6j/AIyyAeGfGPGP4In+BJ/ljxj/AND7NmzZs2bMKjUajUajUajUajUajUajUajUajUajUajUajUajUajUajUajUajUajUajUajUajUajUajUajUajUajUajUajUajUajUajUajUajUajUajUajUajUajUajUajUajUajUajUajUajUajUajUajUajUajUajUajUajUajUajUajUajUajUahSml4qKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKio/wDuJOHDhw7WnN2IOvgBGhXnIT6U6IHmR5ZstWLt2KgDuT38JJZu5rw/kewPg4+bKfIWAOPRoCnqhgdfMUSQJyXMd/MnmL5KcggPCRa8aQbsqE5/ujIkhI7j5IMLExibh9agOwxvPtTnCNexnzC2cO912qJOrDJT3KIguAR3HwWLohYzRHMEzjRfokB5Xd+ltNQpChJt4YnFXIocKRJ2fKGlRzaEmO//ABw+7Njnd9K1yyv2gewnuFfkhGKNeYFSLYNHukWSDlUmonjAb3ObRipnaIW5tTY70XUZmfRarQg4HF60vJeIjZfblTOIsosteU0BRMuSHYKjsTDqRHhGJIhRGgrmDLyojDIiLHEYMqUVgWwMNBc1AUejpOqh2aEEYmrNYAfBEJ9JobGEHCp0oaKwZgyJSBsKILLH3qQUsTESsrUZbIiC645tftUS2GxWc6VN8UDMGRKcMWaCorsCzTdfXvWgahEjPEVOXN6VL2s2A1CjqK5lIt9g06VGwthoqL+EQN9fxTKK2xZRk0SKmIUgmC9gbTagTDXDjLaeGiUWwv5cyo0GLDM4e3ep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	2026-07-13 14:33:30.6367+00
2	2	FBW9116X_July2026_PaymentReceipt.jpeg	image/jpeg	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yG9q2MQykxGRCLtEAB0LOwN0LP0Ldu79u/tRBwTO4uzE4u7ddt+WUU1eAIyx9/GbHytumxw3LkGUi/UQxYFVyEFqKzBcAq1KIjljkrxeLSvIDADB4+PwpXRBFl7gWM46/wDT/KO367MGTuZq5Lj4sXK9+/YLyexMNulMPkDMwxsDCwizfDuzO3vbg3UnzFjKWbmSsw3svS2G7SnOIobWUq1o68Vo/s8mNwgruQiTA5QgXi3Z+ciIgizDemvimhUrYzPa/X2rH43E1cDjKWwVa92Chj65kUMEYFH0/j5CPmfkbtHH2Tuzu+PxPpW4v1rAwYDT4revRxQ5uoc+MjrQSTVMrMMtuAvGLw8e4q7ATCxgNeJmLpi8pjRBqX/jLWDy2DyFiApa2rw+zg8a7C1Sg/svB7ggzdlI0JSRsRO7CEhsLN5E76eHpt12lgmweC3baMP9Nh6uuULVQqUk1HD15HMKMfv1pAKIuxA3MCMwjBnJ+nd5dRBGGT4Xz+Sr4UP/AD3yBXs4X3yC1FWwTlPJI7sMhxnjShEowf2weOMGYe+2ciIn99fhTUq2wnnRs5A4zz0ezlQkkAoHyg1Gq/UduHn24CJOPn4+43n1279yAiDEa9rdPXf1KSvNNPPlsjNkrU8zs5nIfQiPwzN4hEEUQ/z4RD27v275dEQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBFwzs7ds/bOuUBFwzs/wCHXKAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgKAvV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IgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIvFl83htfpPks9lqWNqCYxvPbnCGNiJ+hHyJ2bt3dmZv5d0HtRY7CbHr2zQTWtczuPysNaZ600lKyEwxSsIk8ZODv4kwkLuL/PRN/lZFARY+XYMHBna2rzZimGYuVZrtegUwtYlrxEASSjH35OAlLEzl10zmLfyyyCAiLD19w1S3jclmauy4yXH4eWeDIWxtg8NSSD/eGU+/EHD58md28en766QZhF58fkKOWoVsrjLcVqnchCxXniJiCWIxYhMXb8s7Ozs/8A2vQgIiICIiAiIgIix9XYMFezN/XaWYpz5TFRwS3qccwlNVCbz9kpAZ+wY2jNx767YX6QZBFj8LsGC2SrLe17MU8lWhszU5JqswygM8MjxyxuQu7eQGJCTfliF2f5ZZBARFj6uwYK9mb+u08xTnymKigmvU45hKaqE3n7JSAz9gx+2fj3134v0gyCLWcTyfxrnsgOIwfIes5G8c8t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ZJ/B5BIPEydvscrvoggfEbhu5cuZ2bZre346nr1q9O+Nrarcs4/JYX6MTryR2RYoylaRu/biF7Ty+cbg4ePjOsMozwxzgxsMgsbMYOBMzt38iTM7P/07M7L7RAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREEK+p2TD7fpeT4Oyd3fMKe8YW9XizOuYGzehjdg8XrTSRQyMHuMT/AGP4uYMYsTO7dwTylsG64j01caen7mLh/kraLmdwOPbeD0TUJcgNWrWeMnoscDDXjmlKMYi8C6AGlIWbuJ3vAiD81/UjxDybv/KOw8o6HxbmNc2PGY3Sh13BNiZp8budUpQlt08szM9dvo5RiHonDwCuxF2xRlHOfqWk2jl3NaTY17j3cqtbhrmPXcnmpLeKMYcjjxEmlu0WByOzFD74uTiPbCxv18K2qIPzQ0jgPlbRti0LmHO6vnTw0mz8m5GejHj55rePgy9Igx5nWAXlH3ir/LOPYlNExMzl01xPRdxxtPEvpb464/3audfOYvE+V2uZM5V5JpTm9knbtuwaRgfp+uxdTWiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICI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	2026-07-13 14:33:31.04776+00
\.


--
-- Data for Name: vouchers; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.vouchers (id, voucher_number, company_id, project_id, type, payee, payee_contact, issue_date, description, status, items, total_amount, currency, paid_date, bank_ref, notes, created_by, created_at, proof_data, proof_mime_type, verifier_id, approver_id, paid_by_id, verified_at, approved_at, prepared_by_name) FROM stdin;
5	RPV26003	1	3	payment	Test Payee	\N	\N	\N	approved	[{"amount": 100, "category": "Others", "description": "Test item"}]	100.00	SGD	\N	\N	\N	1	2026-07-13 15:28:54.348181+00	\N	\N	\N	\N	\N	\N	\N	admin
2	RPV26001	1	2	reimbursement	ILLA NAVYA CHAITANYA	chaitu556@gmail.com	2026-07-13	MOTORBIKE INSTALLMENT FOR THE MONTH OF JULY 2026	paid	[{"amount": 328, "category": "Travel & Transport", "description": "JULY 2026 INSTALLMENT - FBW9116X"}]	328.00	SGD	2026-07-13	4544342342	\N	1	2026-07-13 14:33:29.53502+00	\N	\N	\N	\N	1	\N	\N	\N
3	PV-TEST	1	1	payment	Test	\N	\N	\N	approved	[]	10.00	SGD	\N	\N	\N	1	2026-07-13 15:25:04.290249+00	\N	\N	\N	\N	\N	\N	\N	admin
4	RPV26002	1	2	payment	Test Payee	\N	\N	\N	approved	[{"amount": 100, "category": "Others", "description": "Test item"}]	100.00	SGD	\N	\N	\N	1	2026-07-13 15:27:41.927332+00	\N	\N	\N	\N	\N	\N	\N	admin
\.


--
-- Data for Name: wht_records; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.wht_records (id, company_id, vendor_name, vendor_country, payment_date, nature, payment_type, currency, gross_amount, wht_rate, wht_amount, net_amount, filing_deadline, status, filed_date, reference_no, notes, created_at, created_by) FROM stdin;
\.


--
-- Name: accounts_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.accounts_id_seq', 113, true);


--
-- Name: audit_logs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.audit_logs_id_seq', 146, true);


--
-- Name: companies_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.companies_id_seq', 6, true);


--
-- Name: credit_notes_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.credit_notes_id_seq', 1, false);


--
-- Name: customer_deposits_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.customer_deposits_id_seq', 1, false);


--
-- Name: customers_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.customers_id_seq', 3, true);


--
-- Name: debit_notes_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.debit_notes_id_seq', 1, false);


--
-- Name: delivery_orders_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.delivery_orders_id_seq', 6, true);


--
-- Name: email_contacts_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.email_contacts_id_seq', 2, true);


--
-- Name: expenses_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.expenses_id_seq', 5, true);


--
-- Name: grn_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.grn_id_seq', 2, true);


--
-- Name: income_records_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.income_records_id_seq', 1, false);


--
-- Name: invoice_payments_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.invoice_payments_id_seq', 1, false);


--
-- Name: invoices_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.invoices_id_seq', 17, true);


--
-- Name: journal_entries_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.journal_entries_id_seq', 10, true);


--
-- Name: journal_lines_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.journal_lines_id_seq', 27, true);


--
-- Name: maintenance_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.maintenance_id_seq', 1, true);


--
-- Name: proforma_invoices_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.proforma_invoices_id_seq', 1, false);


--
-- Name: projects_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.projects_id_seq', 3, true);


--
-- Name: purchase_orders_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.purchase_orders_id_seq', 2, true);


--
-- Name: quotations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.quotations_id_seq', 2, true);


--
-- Name: settings_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.settings_id_seq', 5, true);


--
-- Name: stock_items_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.stock_items_id_seq', 2, true);


--
-- Name: stock_serials_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.stock_serials_id_seq', 2, true);


--
-- Name: tax_filings_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.tax_filings_id_seq', 1, false);


--
-- Name: user_companies_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.user_companies_id_seq', 11, true);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.users_id_seq', 2, true);


--
-- Name: vendor_invoices_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.vendor_invoices_id_seq', 11, true);


--
-- Name: vendor_payments_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.vendor_payments_id_seq', 6, true);


--
-- Name: vendors_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.vendors_id_seq', 1, true);


--
-- Name: voucher_attachments_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.voucher_attachments_id_seq', 2, true);


--
-- Name: vouchers_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.vouchers_id_seq', 7, true);


--
-- Name: wht_records_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.wht_records_id_seq', 1, false);


--
-- Name: accounts accounts_company_code_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_company_code_unique UNIQUE (company_id, code);


--
-- Name: accounts accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: companies companies_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_pkey PRIMARY KEY (id);


--
-- Name: credit_notes credit_notes_company_cn_number_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.credit_notes
    ADD CONSTRAINT credit_notes_company_cn_number_unique UNIQUE (company_id, cn_number);


--
-- Name: credit_notes credit_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.credit_notes
    ADD CONSTRAINT credit_notes_pkey PRIMARY KEY (id);


--
-- Name: customer_deposits customer_deposits_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.customer_deposits
    ADD CONSTRAINT customer_deposits_pkey PRIMARY KEY (id);


--
-- Name: customers customers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (id);


--
-- Name: debit_notes debit_notes_company_dn_number_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.debit_notes
    ADD CONSTRAINT debit_notes_company_dn_number_unique UNIQUE (company_id, dn_number);


--
-- Name: debit_notes debit_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.debit_notes
    ADD CONSTRAINT debit_notes_pkey PRIMARY KEY (id);


--
-- Name: delivery_orders delivery_orders_do_number_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.delivery_orders
    ADD CONSTRAINT delivery_orders_do_number_unique UNIQUE (do_number);


--
-- Name: delivery_orders delivery_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.delivery_orders
    ADD CONSTRAINT delivery_orders_pkey PRIMARY KEY (id);


--
-- Name: email_contacts email_contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.email_contacts
    ADD CONSTRAINT email_contacts_pkey PRIMARY KEY (id);


--
-- Name: expenses expenses_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_pkey PRIMARY KEY (id);


--
-- Name: grn grn_grn_number_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.grn
    ADD CONSTRAINT grn_grn_number_unique UNIQUE (grn_number);


--
-- Name: grn grn_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.grn
    ADD CONSTRAINT grn_pkey PRIMARY KEY (id);


--
-- Name: income_records income_records_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.income_records
    ADD CONSTRAINT income_records_pkey PRIMARY KEY (id);


--
-- Name: invoice_payments invoice_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoice_payments
    ADD CONSTRAINT invoice_payments_pkey PRIMARY KEY (id);


--
-- Name: invoices invoices_company_inv_number_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_company_inv_number_unique UNIQUE (company_id, inv_number);


--
-- Name: invoices invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);


--
-- Name: journal_entries journal_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT journal_entries_pkey PRIMARY KEY (id);


--
-- Name: journal_lines journal_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.journal_lines
    ADD CONSTRAINT journal_lines_pkey PRIMARY KEY (id);


--
-- Name: maintenance maintenance_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.maintenance
    ADD CONSTRAINT maintenance_pkey PRIMARY KEY (id);


--
-- Name: proforma_invoices proforma_invoices_company_pi_number_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.proforma_invoices
    ADD CONSTRAINT proforma_invoices_company_pi_number_unique UNIQUE (company_id, pi_number);


--
-- Name: proforma_invoices proforma_invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.proforma_invoices
    ADD CONSTRAINT proforma_invoices_pkey PRIMARY KEY (id);


--
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);


--
-- Name: purchase_orders purchase_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_pkey PRIMARY KEY (id);


--
-- Name: purchase_orders purchase_orders_po_number_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_po_number_unique UNIQUE (po_number);


--
-- Name: quotations quotations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.quotations
    ADD CONSTRAINT quotations_pkey PRIMARY KEY (id);


--
-- Name: quotations quotations_qt_number_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.quotations
    ADD CONSTRAINT quotations_qt_number_unique UNIQUE (qt_number);


--
-- Name: session session_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_pkey PRIMARY KEY (sid);


--
-- Name: settings settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.settings
    ADD CONSTRAINT settings_pkey PRIMARY KEY (id);


--
-- Name: stock_items stock_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.stock_items
    ADD CONSTRAINT stock_items_pkey PRIMARY KEY (id);


--
-- Name: stock_serials stock_serials_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.stock_serials
    ADD CONSTRAINT stock_serials_pkey PRIMARY KEY (id);


--
-- Name: tax_filings tax_filings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tax_filings
    ADD CONSTRAINT tax_filings_pkey PRIMARY KEY (id);


--
-- Name: user_companies user_companies_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_companies
    ADD CONSTRAINT user_companies_pkey PRIMARY KEY (id);


--
-- Name: user_companies user_companies_user_id_company_id_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_companies
    ADD CONSTRAINT user_companies_user_id_company_id_unique UNIQUE (user_id, company_id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_username_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_unique UNIQUE (username);


--
-- Name: vendor_invoices vendor_invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vendor_invoices
    ADD CONSTRAINT vendor_invoices_pkey PRIMARY KEY (id);


--
-- Name: vendor_payments vendor_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vendor_payments
    ADD CONSTRAINT vendor_payments_pkey PRIMARY KEY (id);


--
-- Name: vendors vendors_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vendors
    ADD CONSTRAINT vendors_pkey PRIMARY KEY (id);


--
-- Name: voucher_attachments voucher_attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.voucher_attachments
    ADD CONSTRAINT voucher_attachments_pkey PRIMARY KEY (id);


--
-- Name: vouchers vouchers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vouchers
    ADD CONSTRAINT vouchers_pkey PRIMARY KEY (id);


--
-- Name: wht_records wht_records_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.wht_records
    ADD CONSTRAINT wht_records_pkey PRIMARY KEY (id);


--
-- Name: IDX_session_expire; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IDX_session_expire" ON public.session USING btree (expire);


--
-- Name: audit_logs_company_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX audit_logs_company_id_idx ON public.audit_logs USING btree (company_id);


--
-- Name: audit_logs_created_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX audit_logs_created_at_idx ON public.audit_logs USING btree (created_at DESC);


--
-- Name: audit_logs_user_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX audit_logs_user_id_idx ON public.audit_logs USING btree (user_id);


--
-- Name: idx_stock_serials_company; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_stock_serials_company ON public.stock_serials USING btree (company_id);


--
-- Name: idx_stock_serials_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_stock_serials_status ON public.stock_serials USING btree (status);


--
-- Name: idx_stock_serials_stock_item; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_stock_serials_stock_item ON public.stock_serials USING btree (stock_item_id);


--
-- Name: invoice_payments_company_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX invoice_payments_company_id_idx ON public.invoice_payments USING btree (company_id);


--
-- Name: invoice_payments_invoice_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX invoice_payments_invoice_id_idx ON public.invoice_payments USING btree (invoice_id);


--
-- Name: tax_filings_company_type_year; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX tax_filings_company_type_year ON public.tax_filings USING btree (company_id, type, financial_year);


--
-- Name: customers customers_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: email_contacts email_contacts_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.email_contacts
    ADD CONSTRAINT email_contacts_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: expenses expenses_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: income_records income_records_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.income_records
    ADD CONSTRAINT income_records_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: invoice_payments invoice_payments_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoice_payments
    ADD CONSTRAINT invoice_payments_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: invoice_payments invoice_payments_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoice_payments
    ADD CONSTRAINT invoice_payments_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE;


--
-- Name: stock_items stock_items_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.stock_items
    ADD CONSTRAINT stock_items_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: stock_serials stock_serials_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.stock_serials
    ADD CONSTRAINT stock_serials_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: stock_serials stock_serials_stock_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.stock_serials
    ADD CONSTRAINT stock_serials_stock_item_id_fkey FOREIGN KEY (stock_item_id) REFERENCES public.stock_items(id) ON DELETE CASCADE;


--
-- Name: user_companies user_companies_company_id_companies_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_companies
    ADD CONSTRAINT user_companies_company_id_companies_id_fk FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: user_companies user_companies_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_companies
    ADD CONSTRAINT user_companies_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: vendor_invoices vendor_invoices_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vendor_invoices
    ADD CONSTRAINT vendor_invoices_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: vendor_payments vendor_payments_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vendor_payments
    ADD CONSTRAINT vendor_payments_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: vendor_payments vendor_payments_vendor_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vendor_payments
    ADD CONSTRAINT vendor_payments_vendor_invoice_id_fkey FOREIGN KEY (vendor_invoice_id) REFERENCES public.vendor_invoices(id) ON DELETE CASCADE;


--
-- Name: vendors vendors_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vendors
    ADD CONSTRAINT vendors_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: voucher_attachments voucher_attachments_voucher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.voucher_attachments
    ADD CONSTRAINT voucher_attachments_voucher_id_fkey FOREIGN KEY (voucher_id) REFERENCES public.vouchers(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict heaFw4yRv2MVxkcUq9Cwav2KTQ3776CWuScDtnXuf7EKlehuTRvSvmAE1CTQrgQ

