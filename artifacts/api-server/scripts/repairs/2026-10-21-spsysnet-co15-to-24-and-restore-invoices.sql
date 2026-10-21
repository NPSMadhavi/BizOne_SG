-- bizone_spsysnet ONLY
-- Remap orphan company_id 15 → live company 24 (spsysnet)
-- Restore invoices from sales_orders that already claim converted_to_invoice
-- (source-of-truth recovery; invoices table was empty)

DO $$
BEGIN
  IF current_database() <> 'bizone_spsysnet' THEN
    RAISE EXCEPTION 'ABORT: connected to %, expected bizone_spsysnet', current_database();
  END IF;
END $$;

BEGIN;

DO $$
DECLARE
  n15 int; n24 int; v_name text; v_db text;
BEGIN
  SELECT name, database_name INTO v_name, v_db FROM companies WHERE id = 24;
  IF v_name IS DISTINCT FROM 'spsysnet' THEN
    RAISE EXCEPTION 'ABORT: company 24 name is %, expected spsysnet', v_name;
  END IF;
  IF v_db IS DISTINCT FROM 'bizone_spsysnet' THEN
    RAISE EXCEPTION 'ABORT: company 24 database_name is %', v_db;
  END IF;

  SELECT COUNT(*) FILTER (WHERE company_id=15), COUNT(*) FILTER (WHERE company_id=24)
    INTO n15, n24 FROM sales_orders;
  IF n15 <> 8 OR n24 <> 0 THEN RAISE EXCEPTION 'sales_orders %/% expected 8/0', n15, n24; END IF;

  IF (SELECT COUNT(*) FROM invoices) <> 0 THEN
    RAISE EXCEPTION 'ABORT: invoices not empty — refuse restore';
  END IF;
END $$;

-- Remap business rows (only tables that currently have co15)
UPDATE accounts            SET company_id = 24 WHERE company_id = 15;
UPDATE assets              SET company_id = 24 WHERE company_id = 15;
UPDATE employee_payroll    SET company_id = 24 WHERE company_id = 15;
UPDATE employees           SET company_id = 24 WHERE company_id = 15;
UPDATE ir8a_employers      SET company_id = 24 WHERE company_id = 15;
UPDATE licenses            SET company_id = 24 WHERE company_id = 15;
UPDATE purchase_quotations SET company_id = 24 WHERE company_id = 15;
UPDATE sales_orders        SET company_id = 24 WHERE company_id = 15;

-- Preserve historical audit company attribution (leave on 15)
-- financial_years: keep both if present; do not remap co15 FY (unique dates)
-- roles/settings/users already on 24

-- Restore invoices from SOs that retain inv_number (deleted invoice rows)
INSERT INTO invoices (
  id,
  inv_number,
  company_id,
  customer_name,
  customer_address,
  customer_contact,
  customer_contact_email,
  delivery_address,
  issue_date,
  delivery_date,
  payment_terms,
  notes,
  is_private,
  items,
  subtotal,
  discount_amount,
  tax,
  total_amount,
  currency,
  status,
  created_by,
  created_at,
  so_id,
  so_number,
  terms_and_conditions,
  delivery_instructions,
  customer_note,
  authorised_signature
)
SELECT
  so.inv_id,
  so.inv_number,
  24,
  so.customer_name,
  so.customer_address,
  so.customer_contact,
  so.customer_contact_email,
  so.delivery_address,
  so.issue_date,
  so.delivery_date,
  so.payment_terms,
  so.notes,
  COALESCE(so.is_private, false),
  COALESCE(so.items, '[]'::jsonb),
  so.subtotal,
  COALESCE(so.discount_amount, 0),
  so.tax,
  so.total_amount,
  COALESCE(so.currency, 'SGD'),
  'confirmed',
  -- Legacy SO created_by may reference a user not present in this tenant (FK)
  COALESCE(
    (SELECT u.id FROM users u WHERE u.company_id = 24 ORDER BY u.id LIMIT 1),
    so.created_by
  ),
  COALESCE(so.created_at, NOW()),
  so.id,
  so.so_number,
  so.terms_and_conditions,
  so.delivery_instructions,
  so.customer_note,
  so.authorised_signature
FROM sales_orders so
WHERE so.company_id = 24
  AND so.inv_id IS NOT NULL
  AND so.inv_number IS NOT NULL
  AND so.status IN ('converted_to_invoice', 'converted');

SELECT setval(
  pg_get_serial_sequence('invoices', 'id'),
  GREATEST((SELECT COALESCE(MAX(id), 1) FROM invoices), 1),
  true
);

-- Clear dangling DO link on SO2 (delivery_orders empty — do not invent DO)
UPDATE sales_orders
SET do_id = NULL, do_number = NULL, status = 'confirmed'
WHERE company_id = 24
  AND do_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM delivery_orders d WHERE d.id = sales_orders.do_id);

-- Merge document counters into company 24 settings from high-water marks
UPDATE settings
SET
  so_counter  = GREATEST(COALESCE(so_counter, 0), 8),
  inv_counter = GREATEST(COALESCE(inv_counter, 0), 7),
  do_counter  = GREATEST(COALESCE(do_counter, 0), 8),
  pq_counter  = GREATEST(COALESCE(pq_counter, 0), 8),
  po_counter  = GREATEST(COALESCE(po_counter, 0), 9),
  qt_counter  = GREATEST(COALESCE(qt_counter, 0), 9),
  grn_counter = GREATEST(COALESCE(grn_counter, 0), 8),
  fa_counter  = GREATEST(COALESCE(fa_counter, 0), 8),
  bc_counter  = GREATEST(COALESCE(bc_counter, 0), 8),
  si_counter  = GREATEST(COALESCE(si_counter, 0), 8)
WHERE company_id = 24;

-- Post checks
DO $$
DECLARE
  n15 int; n24 int; n_inv int; dangling int;
BEGIN
  SELECT COUNT(*) FILTER (WHERE company_id=15), COUNT(*) FILTER (WHERE company_id=24)
    INTO n15, n24 FROM sales_orders;
  IF n15 <> 0 OR n24 <> 8 THEN RAISE EXCEPTION 'POST sales_orders %/% expected 0/8', n15, n24; END IF;

  SELECT COUNT(*) INTO n_inv FROM invoices WHERE company_id = 24;
  IF n_inv <> 7 THEN RAISE EXCEPTION 'POST invoices expected 7 got %', n_inv; END IF;

  SELECT COUNT(*) INTO dangling
  FROM sales_orders so
  WHERE so.company_id = 24
    AND so.inv_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.id = so.inv_id);
  IF dangling <> 0 THEN RAISE EXCEPTION 'POST dangling inv links %', dangling; END IF;

  IF (SELECT COUNT(*) FROM invoices WHERE company_id <> 24) <> 0 THEN
    RAISE EXCEPTION 'POST invoice leaked to other company_id';
  END IF;

  RAISE NOTICE 'OK: remapped to company 24 and restored 7 invoices';
END $$;

COMMIT;
