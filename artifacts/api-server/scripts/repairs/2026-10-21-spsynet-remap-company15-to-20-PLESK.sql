-- =============================================================================
-- PLESK: bizone_spsynet — remap orphan company_id 15 → KEEP company_id 20
-- Review only. Defaults to ROLLBACK. Do NOT COMMIT without backup + approval.
--
-- Confirmed on Plesk (operator screenshot):
--   current_database() = bizone_spsynet
--   users: id=24, username=spsynet@gmail.com, company_id=20  ← KEEP login
--
-- Before COMMIT, re-run the count gates below. If any ABORT fires, stop.
-- =============================================================================

DO $$
BEGIN
  IF current_database() <> 'bizone_spsynet' THEN
    RAISE EXCEPTION 'ABORT: connected to %, expected bizone_spsynet', current_database();
  END IF;
END $$;

BEGIN;

-- -----------------------------------------------------------------------------
-- 1) Identity + evidence
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_co15_name text;
  v_co20_name text;
  v_co20_db   text;
  v_login_co  int;
  v_so_bad_inv int;
  v_so_bad_do  int;
BEGIN
  SELECT name INTO v_co15_name FROM companies WHERE id = 15;
  SELECT name, database_name INTO v_co20_name, v_co20_db FROM companies WHERE id = 20;

  IF v_co20_name IS NULL THEN
    RAISE EXCEPTION 'ABORT: company 20 missing';
  END IF;
  IF v_co20_name NOT ILIKE '%sysnet%' AND v_co20_name NOT ILIKE '%spsynet%' THEN
    RAISE EXCEPTION 'ABORT: company 20 name (%) does not look like Spsynet', v_co20_name;
  END IF;
  -- database_name may be null inside tenant copy; if set, must match this DB
  IF v_co20_db IS NOT NULL AND btrim(v_co20_db) <> '' AND v_co20_db IS DISTINCT FROM 'bizone_spsynet' THEN
    RAISE EXCEPTION 'ABORT: company 20 database_name is %, expected bizone_spsynet or null', v_co20_db;
  END IF;
  IF v_co15_name IS NULL THEN
    RAISE EXCEPTION 'ABORT: company 15 missing';
  END IF;
  IF v_co15_name NOT ILIKE '%sysnet%' AND v_co15_name NOT ILIKE '%spsynet%' THEN
    RAISE EXCEPTION 'ABORT: company 15 name (%) is not Spsynet tenant-local identity', v_co15_name;
  END IF;

  SELECT company_id INTO v_login_co
  FROM users
  WHERE lower(username) = 'spsynet@gmail.com'
  LIMIT 1;
  IF v_login_co IS DISTINCT FROM 20 THEN
    RAISE EXCEPTION 'ABORT: spsynet@gmail.com company_id is %, expected 20', v_login_co;
  END IF;

  SELECT COUNT(*) INTO v_so_bad_inv
  FROM sales_orders so
  WHERE so.company_id = 15
    AND so.inv_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.id = so.inv_id);
  SELECT COUNT(*) INTO v_so_bad_do
  FROM sales_orders so
  WHERE so.company_id = 15
    AND so.do_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM delivery_orders d WHERE d.id = so.do_id);
  IF v_so_bad_inv <> 7 THEN
    RAISE EXCEPTION 'ABORT: expected 7 SOs with missing invoice refs, found %', v_so_bad_inv;
  END IF;
  IF v_so_bad_do <> 1 THEN
    RAISE EXCEPTION 'ABORT: expected 1 SO with missing DO ref, found %', v_so_bad_do;
  END IF;

  IF (SELECT COUNT(*) FROM warehouse_stock) <> 0 THEN RAISE EXCEPTION 'ABORT: warehouse_stock not empty'; END IF;
  IF (SELECT COUNT(*) FROM stock_item_purchase_prices) <> 0 THEN RAISE EXCEPTION 'ABORT: stock_item_purchase_prices not empty'; END IF;
  IF (SELECT COUNT(*) FROM stock_movements) <> 0 THEN RAISE EXCEPTION 'ABORT: stock_movements not empty'; END IF;
  IF (SELECT COUNT(*) FROM opening_stock) <> 0 THEN RAISE EXCEPTION 'ABORT: opening_stock not empty'; END IF;
  IF (SELECT COUNT(*) FROM journal_lines) <> 0 THEN RAISE EXCEPTION 'ABORT: journal_lines not empty'; END IF;
  IF (SELECT COUNT(*) FROM goods_issue_items) <> 0 THEN RAISE EXCEPTION 'ABORT: goods_issue_items not empty'; END IF;
  IF (SELECT COUNT(*) FROM goods_receipt_items) <> 0 THEN RAISE EXCEPTION 'ABORT: goods_receipt_items not empty'; END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 2) Expected row counts (abort if differ)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  n15 int; n20 int;
BEGIN
  SELECT COUNT(*) FILTER (WHERE company_id=15), COUNT(*) FILTER (WHERE company_id=20) INTO n15, n20 FROM accounts;
  IF n15 <> 56 OR n20 <> 0 THEN RAISE EXCEPTION 'accounts %/% expected 56/0', n15, n20; END IF;

  SELECT COUNT(*) FILTER (WHERE company_id=15), COUNT(*) FILTER (WHERE company_id=20) INTO n15, n20 FROM assets;
  IF n15 <> 8 OR n20 <> 0 THEN RAISE EXCEPTION 'assets %/% expected 8/0', n15, n20; END IF;

  SELECT COUNT(*) FILTER (WHERE company_id=15), COUNT(*) FILTER (WHERE company_id=20) INTO n15, n20 FROM customers;
  IF n15 <> 8 OR n20 <> 0 THEN RAISE EXCEPTION 'customers %/% expected 8/0', n15, n20; END IF;

  SELECT COUNT(*) FILTER (WHERE company_id=15), COUNT(*) FILTER (WHERE company_id=20) INTO n15, n20 FROM email_contacts;
  IF n15 <> 1 OR n20 <> 0 THEN RAISE EXCEPTION 'email_contacts %/% expected 1/0', n15, n20; END IF;

  SELECT COUNT(*) FILTER (WHERE company_id=15), COUNT(*) FILTER (WHERE company_id=20) INTO n15, n20 FROM employee_payroll;
  IF n15 <> 8 OR n20 <> 0 THEN RAISE EXCEPTION 'employee_payroll %/% expected 8/0', n15, n20; END IF;

  SELECT COUNT(*) FILTER (WHERE company_id=15), COUNT(*) FILTER (WHERE company_id=20) INTO n15, n20 FROM employees;
  IF n15 <> 8 OR n20 <> 0 THEN RAISE EXCEPTION 'employees %/% expected 8/0', n15, n20; END IF;

  SELECT COUNT(*) FILTER (WHERE company_id=15), COUNT(*) FILTER (WHERE company_id=20) INTO n15, n20 FROM expenses;
  IF n15 <> 1 OR n20 <> 0 THEN RAISE EXCEPTION 'expenses %/% expected 1/0', n15, n20; END IF;

  SELECT COUNT(*) FILTER (WHERE company_id=15), COUNT(*) FILTER (WHERE company_id=20) INTO n15, n20 FROM ir8a_employers;
  IF n15 <> 1 OR n20 <> 0 THEN RAISE EXCEPTION 'ir8a_employers %/% expected 1/0', n15, n20; END IF;

  SELECT COUNT(*) FILTER (WHERE company_id=15), COUNT(*) FILTER (WHERE company_id=20) INTO n15, n20 FROM licenses;
  IF n15 <> 2 OR n20 <> 0 THEN RAISE EXCEPTION 'licenses %/% expected 2/0', n15, n20; END IF;

  SELECT COUNT(*) FILTER (WHERE company_id=15), COUNT(*) FILTER (WHERE company_id=20) INTO n15, n20 FROM purchase_quotations;
  IF n15 <> 8 OR n20 <> 0 THEN RAISE EXCEPTION 'purchase_quotations %/% expected 8/0', n15, n20; END IF;

  SELECT COUNT(*) FILTER (WHERE company_id=15), COUNT(*) FILTER (WHERE company_id=20) INTO n15, n20 FROM sales_orders;
  IF n15 <> 8 OR n20 <> 0 THEN RAISE EXCEPTION 'sales_orders %/% expected 8/0', n15, n20; END IF;

  SELECT COUNT(*) FILTER (WHERE company_id=15), COUNT(*) FILTER (WHERE company_id=20) INTO n15, n20 FROM sales_persons;
  IF n15 <> 7 OR n20 <> 0 THEN RAISE EXCEPTION 'sales_persons %/% expected 7/0', n15, n20; END IF;

  SELECT COUNT(*) FILTER (WHERE company_id=15), COUNT(*) FILTER (WHERE company_id=20) INTO n15, n20 FROM stock_items;
  IF n15 <> 8 OR n20 <> 0 THEN RAISE EXCEPTION 'stock_items %/% expected 8/0', n15, n20; END IF;

  SELECT COUNT(*) FILTER (WHERE company_id=15), COUNT(*) FILTER (WHERE company_id=20) INTO n15, n20 FROM stock_serials;
  IF n15 <> 10 OR n20 <> 0 THEN RAISE EXCEPTION 'stock_serials %/% expected 10/0', n15, n20; END IF;

  SELECT COUNT(*) FILTER (WHERE company_id=15), COUNT(*) FILTER (WHERE company_id=20) INTO n15, n20 FROM vendors;
  IF n15 <> 8 OR n20 <> 0 THEN RAISE EXCEPTION 'vendors %/% expected 8/0', n15, n20; END IF;

  SELECT COUNT(*) FILTER (WHERE company_id=15), COUNT(*) FILTER (WHERE company_id=20) INTO n15, n20 FROM warehouses;
  IF n15 <> 3 OR n20 <> 0 THEN RAISE EXCEPTION 'warehouses %/% expected 3/0', n15, n20; END IF;

  SELECT COUNT(*) FILTER (WHERE company_id=15), COUNT(*) FILTER (WHERE company_id=20) INTO n15, n20 FROM audit_logs;
  IF n15 <> 115 OR n20 <> 0 THEN RAISE EXCEPTION 'audit_logs %/% expected 115/0 (preserve on 15)', n15, n20; END IF;

  SELECT COUNT(*) FILTER (WHERE company_id=15), COUNT(*) FILTER (WHERE company_id=20) INTO n15, n20 FROM financial_years;
  IF n15 <> 1 OR n20 <> 1 THEN RAISE EXCEPTION 'financial_years %/% expected 1/1', n15, n20; END IF;
  SELECT COUNT(*) FILTER (WHERE company_id=15), COUNT(*) FILTER (WHERE company_id=20) INTO n15, n20 FROM roles;
  IF n15 <> 5 OR n20 <> 5 THEN RAISE EXCEPTION 'roles %/% expected 5/5', n15, n20; END IF;
  SELECT COUNT(*) FILTER (WHERE company_id=15), COUNT(*) FILTER (WHERE company_id=20) INTO n15, n20 FROM settings;
  IF n15 <> 1 OR n20 <> 1 THEN RAISE EXCEPTION 'settings %/% expected 1/1', n15, n20; END IF;

  SELECT COUNT(*) FILTER (WHERE company_id=15), COUNT(*) FILTER (WHERE company_id=20) INTO n15, n20 FROM user_companies;
  IF n15 <> 0 OR n20 <> 1 THEN RAISE EXCEPTION 'user_companies %/% expected 0/1', n15, n20; END IF;
  SELECT COUNT(*) FILTER (WHERE company_id=15), COUNT(*) FILTER (WHERE company_id=20) INTO n15, n20 FROM users;
  IF n15 <> 0 OR n20 <> 1 THEN RAISE EXCEPTION 'users %/% expected 0/1', n15, n20; END IF;

  IF (SELECT COUNT(*) FROM invoices) <> 0 THEN RAISE EXCEPTION 'ABORT: invoices not empty'; END IF;
  IF (SELECT COUNT(*) FROM delivery_orders) <> 0 THEN RAISE EXCEPTION 'ABORT: delivery_orders not empty'; END IF;
  IF (SELECT COUNT(*) FROM purchase_orders) <> 0 THEN RAISE EXCEPTION 'ABORT: purchase_orders not empty'; END IF;
  IF (SELECT COUNT(*) FROM journal_entries) <> 0 THEN RAISE EXCEPTION 'ABORT: journal_entries not empty'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='settings' AND column_name='vpi_counter'
  ) THEN
    RAISE EXCEPTION 'ABORT: settings.vpi_counter missing';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 3) Remap business rows 15 → 20
-- -----------------------------------------------------------------------------
UPDATE accounts            SET company_id = 20 WHERE company_id = 15;  -- 56
UPDATE assets              SET company_id = 20 WHERE company_id = 15;  -- 8
UPDATE customers           SET company_id = 20 WHERE company_id = 15;  -- 8
UPDATE email_contacts      SET company_id = 20 WHERE company_id = 15;  -- 1
UPDATE employee_payroll    SET company_id = 20 WHERE company_id = 15;  -- 8
UPDATE employees           SET company_id = 20 WHERE company_id = 15;  -- 8
UPDATE expenses            SET company_id = 20 WHERE company_id = 15;  -- 1
UPDATE ir8a_employers      SET company_id = 20 WHERE company_id = 15;  -- 1
UPDATE licenses            SET company_id = 20 WHERE company_id = 15;  -- 2
UPDATE purchase_quotations SET company_id = 20 WHERE company_id = 15;  -- 8
UPDATE sales_orders        SET company_id = 20 WHERE company_id = 15;  -- 8
UPDATE sales_persons       SET company_id = 20 WHERE company_id = 15;  -- 7
UPDATE stock_items         SET company_id = 20 WHERE company_id = 15;  -- 8
UPDATE stock_serials       SET company_id = 20 WHERE company_id = 15;  -- 10
UPDATE vendors             SET company_id = 20 WHERE company_id = 15;  -- 8
UPDATE warehouses          SET company_id = 20 WHERE company_id = 15;  -- 3

-- NOT remapped (intentional):
--   audit_logs, financial_years, roles, settings.company_id, users, user_companies

-- -----------------------------------------------------------------------------
-- 4) Clear dangling SO invoice/DO links; set status=confirmed
-- -----------------------------------------------------------------------------
UPDATE sales_orders so
SET
  inv_id = NULL,
  inv_number = NULL,
  do_id = NULL,
  do_number = NULL,
  status = 'confirmed'
WHERE so.company_id = 20
  AND (
    (so.inv_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.id = so.inv_id))
    OR (so.do_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM delivery_orders d WHERE d.id = so.do_id))
    OR so.status IN ('converted_to_invoice', 'converted_to_do', 'converted')
  );

-- -----------------------------------------------------------------------------
-- 5) Merge document counters into company 20 settings
-- -----------------------------------------------------------------------------
UPDATE settings AS s20
SET
  po_counter  = GREATEST(COALESCE(s20.po_counter, 0),  COALESCE(s15.po_counter, 0)),
  inv_counter = GREATEST(COALESCE(s20.inv_counter, 0), COALESCE(s15.inv_counter, 0)),
  qt_counter  = GREATEST(COALESCE(s20.qt_counter, 0),  COALESCE(s15.qt_counter, 0)),
  do_counter  = GREATEST(COALESCE(s20.do_counter, 0),  COALESCE(s15.do_counter, 0)),
  grn_counter = GREATEST(COALESCE(s20.grn_counter, 0), COALESCE(s15.grn_counter, 0)),
  cn_counter  = GREATEST(COALESCE(s20.cn_counter, 0),  COALESCE(s15.cn_counter, 0)),
  pi_counter  = GREATEST(COALESCE(s20.pi_counter, 0),  COALESCE(s15.pi_counter, 0)),
  pv_counter  = GREATEST(COALESCE(s20.pv_counter, 0),  COALESCE(s15.pv_counter, 0)),
  igr_counter = GREATEST(COALESCE(s20.igr_counter, 0), COALESCE(s15.igr_counter, 0)),
  gin_counter = GREATEST(COALESCE(s20.gin_counter, 0), COALESCE(s15.gin_counter, 0)),
  st_counter  = GREATEST(COALESCE(s20.st_counter, 0),  COALESCE(s15.st_counter, 0)),
  sa_counter  = GREATEST(COALESCE(s20.sa_counter, 0),  COALESCE(s15.sa_counter, 0)),
  si_counter  = GREATEST(COALESCE(s20.si_counter, 0),  COALESCE(s15.si_counter, 0)),
  dn_counter  = GREATEST(COALESCE(s20.dn_counter, 0),  COALESCE(s15.dn_counter, 0)),
  so_counter  = GREATEST(COALESCE(s20.so_counter, 0),  COALESCE(s15.so_counter, 0)),
  pq_counter  = GREATEST(COALESCE(s20.pq_counter, 0),  COALESCE(s15.pq_counter, 0)),
  fa_counter  = GREATEST(COALESCE(s20.fa_counter, 0),  COALESCE(s15.fa_counter, 0)),
  bc_counter  = GREATEST(COALESCE(s20.bc_counter, 0),  COALESCE(s15.bc_counter, 0)),
  vpi_counter = GREATEST(COALESCE(s20.vpi_counter, 0), COALESCE(s15.vpi_counter, 0))
FROM settings AS s15
WHERE s20.company_id = 20
  AND s15.company_id = 15;

-- -----------------------------------------------------------------------------
-- 6) Post-checks
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  n15 int; n20 int; dangling int; n_bad_status int;
BEGIN
  SELECT COUNT(*) FILTER (WHERE company_id=15), COUNT(*) FILTER (WHERE company_id=20) INTO n15, n20 FROM accounts;
  IF n15 <> 0 OR n20 <> 56 THEN RAISE EXCEPTION 'POST accounts %/% expected 0/56', n15, n20; END IF;

  SELECT COUNT(*) FILTER (WHERE company_id=15), COUNT(*) FILTER (WHERE company_id=20) INTO n15, n20 FROM customers;
  IF n15 <> 0 OR n20 <> 8 THEN RAISE EXCEPTION 'POST customers %/% expected 0/8', n15, n20; END IF;

  SELECT COUNT(*) FILTER (WHERE company_id=15), COUNT(*) FILTER (WHERE company_id=20) INTO n15, n20 FROM vendors;
  IF n15 <> 0 OR n20 <> 8 THEN RAISE EXCEPTION 'POST vendors %/% expected 0/8', n15, n20; END IF;

  SELECT COUNT(*) FILTER (WHERE company_id=15), COUNT(*) FILTER (WHERE company_id=20) INTO n15, n20 FROM expenses;
  IF n15 <> 0 OR n20 <> 1 THEN RAISE EXCEPTION 'POST expenses %/% expected 0/1', n15, n20; END IF;

  SELECT COUNT(*) FILTER (WHERE company_id=15), COUNT(*) FILTER (WHERE company_id=20) INTO n15, n20 FROM sales_orders;
  IF n15 <> 0 OR n20 <> 8 THEN RAISE EXCEPTION 'POST sales_orders %/% expected 0/8', n15, n20; END IF;

  SELECT COUNT(*) FILTER (WHERE company_id=15), COUNT(*) FILTER (WHERE company_id=20) INTO n15, n20 FROM purchase_quotations;
  IF n15 <> 0 OR n20 <> 8 THEN RAISE EXCEPTION 'POST purchase_quotations %/% expected 0/8', n15, n20; END IF;

  SELECT COUNT(*) FILTER (WHERE company_id=15), COUNT(*) FILTER (WHERE company_id=20) INTO n15, n20 FROM stock_items;
  IF n15 <> 0 OR n20 <> 8 THEN RAISE EXCEPTION 'POST stock_items %/% expected 0/8', n15, n20; END IF;

  SELECT COUNT(*) FILTER (WHERE company_id=15), COUNT(*) FILTER (WHERE company_id=20) INTO n15, n20 FROM stock_serials;
  IF n15 <> 0 OR n20 <> 10 THEN RAISE EXCEPTION 'POST stock_serials %/% expected 0/10', n15, n20; END IF;

  SELECT COUNT(*) FILTER (WHERE company_id=15), COUNT(*) FILTER (WHERE company_id=20) INTO n15, n20 FROM warehouses;
  IF n15 <> 0 OR n20 <> 3 THEN RAISE EXCEPTION 'POST warehouses %/% expected 0/3', n15, n20; END IF;

  SELECT COUNT(*) FILTER (WHERE company_id=15), COUNT(*) FILTER (WHERE company_id=20) INTO n15, n20 FROM assets;
  IF n15 <> 0 OR n20 <> 8 THEN RAISE EXCEPTION 'POST assets %/% expected 0/8', n15, n20; END IF;

  SELECT COUNT(*) FILTER (WHERE company_id=15), COUNT(*) FILTER (WHERE company_id=20) INTO n15, n20 FROM employees;
  IF n15 <> 0 OR n20 <> 8 THEN RAISE EXCEPTION 'POST employees %/% expected 0/8', n15, n20; END IF;

  SELECT COUNT(*) FILTER (WHERE company_id=15), COUNT(*) FILTER (WHERE company_id=20) INTO n15, n20 FROM employee_payroll;
  IF n15 <> 0 OR n20 <> 8 THEN RAISE EXCEPTION 'POST employee_payroll %/% expected 0/8', n15, n20; END IF;

  SELECT COUNT(*) FILTER (WHERE company_id=15), COUNT(*) FILTER (WHERE company_id=20) INTO n15, n20 FROM sales_persons;
  IF n15 <> 0 OR n20 <> 7 THEN RAISE EXCEPTION 'POST sales_persons %/% expected 0/7', n15, n20; END IF;

  SELECT COUNT(*) FILTER (WHERE company_id=15), COUNT(*) FILTER (WHERE company_id=20) INTO n15, n20 FROM licenses;
  IF n15 <> 0 OR n20 <> 2 THEN RAISE EXCEPTION 'POST licenses %/% expected 0/2', n15, n20; END IF;

  SELECT COUNT(*) FILTER (WHERE company_id=15), COUNT(*) FILTER (WHERE company_id=20) INTO n15, n20 FROM ir8a_employers;
  IF n15 <> 0 OR n20 <> 1 THEN RAISE EXCEPTION 'POST ir8a_employers %/% expected 0/1', n15, n20; END IF;

  SELECT COUNT(*) FILTER (WHERE company_id=15), COUNT(*) FILTER (WHERE company_id=20) INTO n15, n20 FROM email_contacts;
  IF n15 <> 0 OR n20 <> 1 THEN RAISE EXCEPTION 'POST email_contacts %/% expected 0/1', n15, n20; END IF;

  SELECT COUNT(*) FILTER (WHERE company_id=15), COUNT(*) FILTER (WHERE company_id=20) INTO n15, n20 FROM audit_logs;
  IF n15 <> 115 OR n20 <> 0 THEN RAISE EXCEPTION 'POST audit_logs %/% expected 115/0 (preserved)', n15, n20; END IF;

  SELECT COUNT(*) FILTER (WHERE company_id=15), COUNT(*) FILTER (WHERE company_id=20) INTO n15, n20 FROM financial_years;
  IF n15 <> 1 OR n20 <> 1 THEN RAISE EXCEPTION 'POST financial_years %/% expected 1/1', n15, n20; END IF;
  SELECT COUNT(*) FILTER (WHERE company_id=15), COUNT(*) FILTER (WHERE company_id=20) INTO n15, n20 FROM roles;
  IF n15 <> 5 OR n20 <> 5 THEN RAISE EXCEPTION 'POST roles %/% expected 5/5', n15, n20; END IF;
  SELECT COUNT(*) FILTER (WHERE company_id=15), COUNT(*) FILTER (WHERE company_id=20) INTO n15, n20 FROM settings;
  IF n15 <> 1 OR n20 <> 1 THEN RAISE EXCEPTION 'POST settings rows %/% expected 1/1', n15, n20; END IF;

  IF (SELECT so_counter  FROM settings WHERE company_id=20) < 8 THEN RAISE EXCEPTION 'POST so_counter < 8'; END IF;
  IF (SELECT inv_counter FROM settings WHERE company_id=20) < 7 THEN RAISE EXCEPTION 'POST inv_counter < 7'; END IF;
  IF (SELECT do_counter  FROM settings WHERE company_id=20) < 8 THEN RAISE EXCEPTION 'POST do_counter < 8'; END IF;
  IF (SELECT pq_counter  FROM settings WHERE company_id=20) < 8 THEN RAISE EXCEPTION 'POST pq_counter < 8'; END IF;
  IF (SELECT po_counter  FROM settings WHERE company_id=20) < 9 THEN RAISE EXCEPTION 'POST po_counter < 9'; END IF;

  SELECT COUNT(*) INTO dangling
  FROM sales_orders so
  WHERE so.company_id = 20
    AND (
      (so.inv_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.id = so.inv_id))
      OR (so.do_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM delivery_orders d WHERE d.id = so.do_id))
    );
  IF dangling <> 0 THEN RAISE EXCEPTION 'POST dangling SO links: %', dangling; END IF;

  SELECT COUNT(*) INTO n_bad_status
  FROM sales_orders WHERE company_id = 20 AND status IS DISTINCT FROM 'confirmed';
  IF n_bad_status <> 0 THEN RAISE EXCEPTION 'POST SO status not confirmed: %', n_bad_status; END IF;

  IF (SELECT COUNT(*) FROM invoices) <> 0 THEN RAISE EXCEPTION 'POST invoices must stay empty'; END IF;
  IF (SELECT COUNT(*) FROM delivery_orders) <> 0 THEN RAISE EXCEPTION 'POST delivery_orders must stay empty'; END IF;
  IF (SELECT COUNT(*) FROM purchase_orders) <> 0 THEN RAISE EXCEPTION 'POST purchase_orders must stay empty'; END IF;
  IF (SELECT COUNT(*) FROM journal_entries) <> 0 THEN RAISE EXCEPTION 'POST journal_entries must stay empty'; END IF;

  RAISE NOTICE 'VALIDATION OK — backup, then COMMIT or keep ROLLBACK';
END $$;

-- COMMIT;
ROLLBACK;
