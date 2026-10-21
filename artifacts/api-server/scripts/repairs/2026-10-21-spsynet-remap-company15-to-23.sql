-- =============================================================================
-- CORRECTED PROPOSED MIGRATION — review only (defaults to ROLLBACK)
--
-- Database : bizone_spsynet ONLY (never BizoneDB / other tenants)
-- Target   : company_id 23 = Spsynet
-- Legacy   : company_id 15 = tenant-local "SP Sysnet Pte Ltd" orphan
--
-- Code review findings incorporated:
--   * nextDocNumber increments counter THEN emits prefix+counter; merge of
--     co15 counters into co23 is required so next SO/INV/DO are SO9/INV8/DO9
--     (not SO1/INV1). numberExists() also skips collisions for global-unique
--     types (so/pq/po/qt/do/grn).
--   * SO convert (sales-orders.ts) blocks duplicates only when inv_id/do_id
--     points at an EXISTING invoice/DO row. Cleared links + status=confirmed
--     allow intentional one-time reconvert; does not auto-create docs.
--   * Valid SO statuses used by API: draft | confirmed | sent |
--     converted_to_invoice | converted_to_do | converted. confirmed is valid.
--   * audit_logs: PRESERVE company_id=15 (historical attribution). Remapping
--     would rewrite the company context of past events. Co23 audit UI will
--     not show them until a separate approved decision.
--   * Child tables without company_id that FK to remapped parents currently
--     have 0 rows (warehouse_stock, journal_lines, etc.) — pre-checked.
--   * No other business tables currently hold company_id=15 beyond the remap
--     list + excluded config (roles/settings/financial_years).
--
-- BACKUP GATE (operator — not verified by agent on disk):
--   No *.dump under scripts/repairs was found during this review.
--   Before COMMIT you MUST have a listed dump, e.g.:
--     "C:\Program Files\PostgreSQL\18\bin\pg_restore.exe" --list "<path\to\bizone_spsynet.dump>"
--   Record path + SHA256. Rollback after COMMIT = restore that dump into
--   bizone_spsynet only.
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
  v_co23_name text;
  v_co23_db   text;
  v_so_bad_inv int;
  v_so_bad_do  int;
  v_unexpected text;
BEGIN
  SELECT name INTO v_co15_name FROM companies WHERE id = 15;
  SELECT name, database_name INTO v_co23_name, v_co23_db FROM companies WHERE id = 23;

  IF v_co23_name IS DISTINCT FROM 'Spsynet' THEN
    RAISE EXCEPTION 'ABORT: company 23 name is %, expected Spsynet', v_co23_name;
  END IF;
  IF v_co23_db IS DISTINCT FROM 'bizone_spsynet' THEN
    RAISE EXCEPTION 'ABORT: company 23 database_name is %, expected bizone_spsynet', v_co23_db;
  END IF;
  IF v_co15_name IS NULL THEN
    RAISE EXCEPTION 'ABORT: company 15 missing';
  END IF;
  IF v_co15_name NOT ILIKE '%sysnet%' AND v_co15_name NOT ILIKE '%spsynet%' THEN
    RAISE EXCEPTION 'ABORT: company 15 name (%) is not Spsynet tenant-local identity', v_co15_name;
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

  -- Fail if any remapped-parent child table unexpectedly has rows (FK dependents)
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
  n15 int; n23 int;
BEGIN
  SELECT COUNT(*) FILTER (WHERE company_id=15), COUNT(*) FILTER (WHERE company_id=23) INTO n15, n23 FROM accounts;
  IF n15 <> 56 OR n23 <> 0 THEN RAISE EXCEPTION 'accounts %/% expected 56/0', n15, n23; END IF;

  SELECT COUNT(*) FILTER (WHERE company_id=15), COUNT(*) FILTER (WHERE company_id=23) INTO n15, n23 FROM assets;
  IF n15 <> 8 OR n23 <> 0 THEN RAISE EXCEPTION 'assets %/% expected 8/0', n15, n23; END IF;

  SELECT COUNT(*) FILTER (WHERE company_id=15), COUNT(*) FILTER (WHERE company_id=23) INTO n15, n23 FROM customers;
  IF n15 <> 8 OR n23 <> 0 THEN RAISE EXCEPTION 'customers %/% expected 8/0', n15, n23; END IF;

  SELECT COUNT(*) FILTER (WHERE company_id=15), COUNT(*) FILTER (WHERE company_id=23) INTO n15, n23 FROM email_contacts;
  IF n15 <> 1 OR n23 <> 0 THEN RAISE EXCEPTION 'email_contacts %/% expected 1/0', n15, n23; END IF;

  SELECT COUNT(*) FILTER (WHERE company_id=15), COUNT(*) FILTER (WHERE company_id=23) INTO n15, n23 FROM employee_payroll;
  IF n15 <> 8 OR n23 <> 0 THEN RAISE EXCEPTION 'employee_payroll %/% expected 8/0', n15, n23; END IF;

  SELECT COUNT(*) FILTER (WHERE company_id=15), COUNT(*) FILTER (WHERE company_id=23) INTO n15, n23 FROM employees;
  IF n15 <> 8 OR n23 <> 0 THEN RAISE EXCEPTION 'employees %/% expected 8/0', n15, n23; END IF;

  SELECT COUNT(*) FILTER (WHERE company_id=15), COUNT(*) FILTER (WHERE company_id=23) INTO n15, n23 FROM expenses;
  IF n15 <> 1 OR n23 <> 0 THEN RAISE EXCEPTION 'expenses %/% expected 1/0', n15, n23; END IF;

  SELECT COUNT(*) FILTER (WHERE company_id=15), COUNT(*) FILTER (WHERE company_id=23) INTO n15, n23 FROM ir8a_employers;
  IF n15 <> 1 OR n23 <> 0 THEN RAISE EXCEPTION 'ir8a_employers %/% expected 1/0', n15, n23; END IF;

  SELECT COUNT(*) FILTER (WHERE company_id=15), COUNT(*) FILTER (WHERE company_id=23) INTO n15, n23 FROM licenses;
  IF n15 <> 2 OR n23 <> 0 THEN RAISE EXCEPTION 'licenses %/% expected 2/0', n15, n23; END IF;

  SELECT COUNT(*) FILTER (WHERE company_id=15), COUNT(*) FILTER (WHERE company_id=23) INTO n15, n23 FROM purchase_quotations;
  IF n15 <> 8 OR n23 <> 0 THEN RAISE EXCEPTION 'purchase_quotations %/% expected 8/0', n15, n23; END IF;

  SELECT COUNT(*) FILTER (WHERE company_id=15), COUNT(*) FILTER (WHERE company_id=23) INTO n15, n23 FROM sales_orders;
  IF n15 <> 8 OR n23 <> 0 THEN RAISE EXCEPTION 'sales_orders %/% expected 8/0', n15, n23; END IF;

  SELECT COUNT(*) FILTER (WHERE company_id=15), COUNT(*) FILTER (WHERE company_id=23) INTO n15, n23 FROM sales_persons;
  IF n15 <> 7 OR n23 <> 0 THEN RAISE EXCEPTION 'sales_persons %/% expected 7/0', n15, n23; END IF;

  SELECT COUNT(*) FILTER (WHERE company_id=15), COUNT(*) FILTER (WHERE company_id=23) INTO n15, n23 FROM stock_items;
  IF n15 <> 8 OR n23 <> 0 THEN RAISE EXCEPTION 'stock_items %/% expected 8/0', n15, n23; END IF;

  SELECT COUNT(*) FILTER (WHERE company_id=15), COUNT(*) FILTER (WHERE company_id=23) INTO n15, n23 FROM stock_serials;
  IF n15 <> 10 OR n23 <> 0 THEN RAISE EXCEPTION 'stock_serials %/% expected 10/0', n15, n23; END IF;

  SELECT COUNT(*) FILTER (WHERE company_id=15), COUNT(*) FILTER (WHERE company_id=23) INTO n15, n23 FROM vendors;
  IF n15 <> 8 OR n23 <> 0 THEN RAISE EXCEPTION 'vendors %/% expected 8/0', n15, n23; END IF;

  SELECT COUNT(*) FILTER (WHERE company_id=15), COUNT(*) FILTER (WHERE company_id=23) INTO n15, n23 FROM warehouses;
  IF n15 <> 3 OR n23 <> 0 THEN RAISE EXCEPTION 'warehouses %/% expected 3/0', n15, n23; END IF;

  -- audit_logs: preserved on 15 (not remapped)
  SELECT COUNT(*) FILTER (WHERE company_id=15), COUNT(*) FILTER (WHERE company_id=23) INTO n15, n23 FROM audit_logs;
  IF n15 <> 115 OR n23 <> 0 THEN RAISE EXCEPTION 'audit_logs %/% expected 115/0 (preserve on 15)', n15, n23; END IF;

  -- Config excluded from remap
  SELECT COUNT(*) FILTER (WHERE company_id=15), COUNT(*) FILTER (WHERE company_id=23) INTO n15, n23 FROM financial_years;
  IF n15 <> 1 OR n23 <> 1 THEN RAISE EXCEPTION 'financial_years %/% expected 1/1', n15, n23; END IF;
  SELECT COUNT(*) FILTER (WHERE company_id=15), COUNT(*) FILTER (WHERE company_id=23) INTO n15, n23 FROM roles;
  IF n15 <> 5 OR n23 <> 5 THEN RAISE EXCEPTION 'roles %/% expected 5/5', n15, n23; END IF;
  SELECT COUNT(*) FILTER (WHERE company_id=15), COUNT(*) FILTER (WHERE company_id=23) INTO n15, n23 FROM settings;
  IF n15 <> 1 OR n23 <> 1 THEN RAISE EXCEPTION 'settings %/% expected 1/1', n15, n23; END IF;

  SELECT COUNT(*) FILTER (WHERE company_id=15), COUNT(*) FILTER (WHERE company_id=23) INTO n15, n23 FROM user_companies;
  IF n15 <> 0 OR n23 <> 1 THEN RAISE EXCEPTION 'user_companies %/% expected 0/1', n15, n23; END IF;
  SELECT COUNT(*) FILTER (WHERE company_id=15), COUNT(*) FILTER (WHERE company_id=23) INTO n15, n23 FROM users;
  IF n15 <> 0 OR n23 <> 1 THEN RAISE EXCEPTION 'users %/% expected 0/1', n15, n23; END IF;

  IF (SELECT COUNT(*) FROM invoices) <> 0 THEN RAISE EXCEPTION 'ABORT: invoices not empty'; END IF;
  IF (SELECT COUNT(*) FROM delivery_orders) <> 0 THEN RAISE EXCEPTION 'ABORT: delivery_orders not empty'; END IF;
  IF (SELECT COUNT(*) FROM purchase_orders) <> 0 THEN RAISE EXCEPTION 'ABORT: purchase_orders not empty'; END IF;
  IF (SELECT COUNT(*) FROM journal_entries) <> 0 THEN RAISE EXCEPTION 'ABORT: journal_entries not empty'; END IF;

  -- settings counter columns used below must exist (integer)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='settings' AND column_name='vpi_counter'
  ) THEN
    RAISE EXCEPTION 'ABORT: settings.vpi_counter missing';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 3) Remap business rows 15 → 23
--    FK company_id → companies(id): 23 exists (NO ACTION on update).
--    stock_serials.stock_item_id → stock_items.id: parent ids unchanged.
--    No child rows currently reference remapped parents (pre-checked empty).
-- -----------------------------------------------------------------------------
UPDATE accounts            SET company_id = 23 WHERE company_id = 15;  -- 56
UPDATE assets              SET company_id = 23 WHERE company_id = 15;  -- 8
UPDATE customers           SET company_id = 23 WHERE company_id = 15;  -- 8
UPDATE email_contacts      SET company_id = 23 WHERE company_id = 15;  -- 1
UPDATE employee_payroll    SET company_id = 23 WHERE company_id = 15;  -- 8
UPDATE employees           SET company_id = 23 WHERE company_id = 15;  -- 8
UPDATE expenses            SET company_id = 23 WHERE company_id = 15;  -- 1
UPDATE ir8a_employers      SET company_id = 23 WHERE company_id = 15;  -- 1
UPDATE licenses            SET company_id = 23 WHERE company_id = 15;  -- 2
UPDATE purchase_quotations SET company_id = 23 WHERE company_id = 15;  -- 8
UPDATE sales_orders        SET company_id = 23 WHERE company_id = 15;  -- 8
UPDATE sales_persons       SET company_id = 23 WHERE company_id = 15;  -- 7
UPDATE stock_items         SET company_id = 23 WHERE company_id = 15;  -- 8
UPDATE stock_serials       SET company_id = 23 WHERE company_id = 15;  -- 10
UPDATE vendors             SET company_id = 23 WHERE company_id = 15;  -- 8
UPDATE warehouses          SET company_id = 23 WHERE company_id = 15;  -- 3

-- NOT remapped (intentional):
--   audit_logs          — preserve historical company_id=15 attribution
--   financial_years     — unique (company_id, start_date, end_date) collision
--   roles               — live co23 role set already exists
--   settings.company_id — would duplicate co23 settings row
--   user_companies, users, companies

-- -----------------------------------------------------------------------------
-- 4) Clear dangling SO invoice/DO links; set status=confirmed
--    App convert guards on existing inv/do rows, not on status alone.
--    Clearing links prevents false "already converted" and allows one manual
--    reconvert per SO. Does NOT insert invoices or delivery orders.
-- -----------------------------------------------------------------------------
UPDATE sales_orders so
SET
  inv_id = NULL,
  inv_number = NULL,
  do_id = NULL,
  do_number = NULL,
  status = 'confirmed'
WHERE so.company_id = 23
  AND (
    (so.inv_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.id = so.inv_id))
    OR (so.do_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM delivery_orders d WHERE d.id = so.do_id))
    OR so.status IN ('converted_to_invoice', 'converted_to_do', 'converted')
  );

-- -----------------------------------------------------------------------------
-- 5) Merge ALL document counters into co23 settings (columns verified present)
--    Expected after merge from co15: so=8 inv=7 do=8 po=9 pq=8 qt=9 grn=8
--    pi=5 si=8 fa=8 bc=8 dn=2 (and GREATEST with co23 defaults).
-- -----------------------------------------------------------------------------
UPDATE settings AS s23
SET
  po_counter  = GREATEST(COALESCE(s23.po_counter, 0),  COALESCE(s15.po_counter, 0)),
  inv_counter = GREATEST(COALESCE(s23.inv_counter, 0), COALESCE(s15.inv_counter, 0)),
  qt_counter  = GREATEST(COALESCE(s23.qt_counter, 0),  COALESCE(s15.qt_counter, 0)),
  do_counter  = GREATEST(COALESCE(s23.do_counter, 0),  COALESCE(s15.do_counter, 0)),
  grn_counter = GREATEST(COALESCE(s23.grn_counter, 0), COALESCE(s15.grn_counter, 0)),
  cn_counter  = GREATEST(COALESCE(s23.cn_counter, 0),  COALESCE(s15.cn_counter, 0)),
  pi_counter  = GREATEST(COALESCE(s23.pi_counter, 0),  COALESCE(s15.pi_counter, 0)),
  pv_counter  = GREATEST(COALESCE(s23.pv_counter, 0),  COALESCE(s15.pv_counter, 0)),
  igr_counter = GREATEST(COALESCE(s23.igr_counter, 0), COALESCE(s15.igr_counter, 0)),
  gin_counter = GREATEST(COALESCE(s23.gin_counter, 0), COALESCE(s15.gin_counter, 0)),
  st_counter  = GREATEST(COALESCE(s23.st_counter, 0),  COALESCE(s15.st_counter, 0)),
  sa_counter  = GREATEST(COALESCE(s23.sa_counter, 0),  COALESCE(s15.sa_counter, 0)),
  si_counter  = GREATEST(COALESCE(s23.si_counter, 0),  COALESCE(s15.si_counter, 0)),
  dn_counter  = GREATEST(COALESCE(s23.dn_counter, 0),  COALESCE(s15.dn_counter, 0)),
  so_counter  = GREATEST(COALESCE(s23.so_counter, 0),  COALESCE(s15.so_counter, 0)),
  pq_counter  = GREATEST(COALESCE(s23.pq_counter, 0),  COALESCE(s15.pq_counter, 0)),
  fa_counter  = GREATEST(COALESCE(s23.fa_counter, 0),  COALESCE(s15.fa_counter, 0)),
  bc_counter  = GREATEST(COALESCE(s23.bc_counter, 0),  COALESCE(s15.bc_counter, 0)),
  vpi_counter = GREATEST(COALESCE(s23.vpi_counter, 0), COALESCE(s15.vpi_counter, 0))
FROM settings AS s15
WHERE s23.company_id = 23
  AND s15.company_id = 15;

-- -----------------------------------------------------------------------------
-- 6) Post-checks
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  n15 int; n23 int; dangling int; n_bad_status int;
BEGIN
  SELECT COUNT(*) FILTER (WHERE company_id=15), COUNT(*) FILTER (WHERE company_id=23) INTO n15, n23 FROM accounts;
  IF n15 <> 0 OR n23 <> 56 THEN RAISE EXCEPTION 'POST accounts %/% expected 0/56', n15, n23; END IF;

  SELECT COUNT(*) FILTER (WHERE company_id=15), COUNT(*) FILTER (WHERE company_id=23) INTO n15, n23 FROM customers;
  IF n15 <> 0 OR n23 <> 8 THEN RAISE EXCEPTION 'POST customers %/% expected 0/8', n15, n23; END IF;

  SELECT COUNT(*) FILTER (WHERE company_id=15), COUNT(*) FILTER (WHERE company_id=23) INTO n15, n23 FROM vendors;
  IF n15 <> 0 OR n23 <> 8 THEN RAISE EXCEPTION 'POST vendors %/% expected 0/8', n15, n23; END IF;

  SELECT COUNT(*) FILTER (WHERE company_id=15), COUNT(*) FILTER (WHERE company_id=23) INTO n15, n23 FROM expenses;
  IF n15 <> 0 OR n23 <> 1 THEN RAISE EXCEPTION 'POST expenses %/% expected 0/1', n15, n23; END IF;

  SELECT COUNT(*) FILTER (WHERE company_id=15), COUNT(*) FILTER (WHERE company_id=23) INTO n15, n23 FROM sales_orders;
  IF n15 <> 0 OR n23 <> 8 THEN RAISE EXCEPTION 'POST sales_orders %/% expected 0/8', n15, n23; END IF;

  SELECT COUNT(*) FILTER (WHERE company_id=15), COUNT(*) FILTER (WHERE company_id=23) INTO n15, n23 FROM purchase_quotations;
  IF n15 <> 0 OR n23 <> 8 THEN RAISE EXCEPTION 'POST purchase_quotations %/% expected 0/8', n15, n23; END IF;

  SELECT COUNT(*) FILTER (WHERE company_id=15), COUNT(*) FILTER (WHERE company_id=23) INTO n15, n23 FROM stock_items;
  IF n15 <> 0 OR n23 <> 8 THEN RAISE EXCEPTION 'POST stock_items %/% expected 0/8', n15, n23; END IF;

  SELECT COUNT(*) FILTER (WHERE company_id=15), COUNT(*) FILTER (WHERE company_id=23) INTO n15, n23 FROM stock_serials;
  IF n15 <> 0 OR n23 <> 10 THEN RAISE EXCEPTION 'POST stock_serials %/% expected 0/10', n15, n23; END IF;

  SELECT COUNT(*) FILTER (WHERE company_id=15), COUNT(*) FILTER (WHERE company_id=23) INTO n15, n23 FROM warehouses;
  IF n15 <> 0 OR n23 <> 3 THEN RAISE EXCEPTION 'POST warehouses %/% expected 0/3', n15, n23; END IF;

  SELECT COUNT(*) FILTER (WHERE company_id=15), COUNT(*) FILTER (WHERE company_id=23) INTO n15, n23 FROM assets;
  IF n15 <> 0 OR n23 <> 8 THEN RAISE EXCEPTION 'POST assets %/% expected 0/8', n15, n23; END IF;

  SELECT COUNT(*) FILTER (WHERE company_id=15), COUNT(*) FILTER (WHERE company_id=23) INTO n15, n23 FROM employees;
  IF n15 <> 0 OR n23 <> 8 THEN RAISE EXCEPTION 'POST employees %/% expected 0/8', n15, n23; END IF;

  SELECT COUNT(*) FILTER (WHERE company_id=15), COUNT(*) FILTER (WHERE company_id=23) INTO n15, n23 FROM employee_payroll;
  IF n15 <> 0 OR n23 <> 8 THEN RAISE EXCEPTION 'POST employee_payroll %/% expected 0/8', n15, n23; END IF;

  SELECT COUNT(*) FILTER (WHERE company_id=15), COUNT(*) FILTER (WHERE company_id=23) INTO n15, n23 FROM sales_persons;
  IF n15 <> 0 OR n23 <> 7 THEN RAISE EXCEPTION 'POST sales_persons %/% expected 0/7', n15, n23; END IF;

  SELECT COUNT(*) FILTER (WHERE company_id=15), COUNT(*) FILTER (WHERE company_id=23) INTO n15, n23 FROM licenses;
  IF n15 <> 0 OR n23 <> 2 THEN RAISE EXCEPTION 'POST licenses %/% expected 0/2', n15, n23; END IF;

  SELECT COUNT(*) FILTER (WHERE company_id=15), COUNT(*) FILTER (WHERE company_id=23) INTO n15, n23 FROM ir8a_employers;
  IF n15 <> 0 OR n23 <> 1 THEN RAISE EXCEPTION 'POST ir8a_employers %/% expected 0/1', n15, n23; END IF;

  SELECT COUNT(*) FILTER (WHERE company_id=15), COUNT(*) FILTER (WHERE company_id=23) INTO n15, n23 FROM email_contacts;
  IF n15 <> 0 OR n23 <> 1 THEN RAISE EXCEPTION 'POST email_contacts %/% expected 0/1', n15, n23; END IF;

  -- audit preserved on legacy company
  SELECT COUNT(*) FILTER (WHERE company_id=15), COUNT(*) FILTER (WHERE company_id=23) INTO n15, n23 FROM audit_logs;
  IF n15 <> 115 OR n23 <> 0 THEN RAISE EXCEPTION 'POST audit_logs %/% expected 115/0 (preserved)', n15, n23; END IF;

  SELECT COUNT(*) FILTER (WHERE company_id=15), COUNT(*) FILTER (WHERE company_id=23) INTO n15, n23 FROM financial_years;
  IF n15 <> 1 OR n23 <> 1 THEN RAISE EXCEPTION 'POST financial_years %/% expected 1/1', n15, n23; END IF;
  SELECT COUNT(*) FILTER (WHERE company_id=15), COUNT(*) FILTER (WHERE company_id=23) INTO n15, n23 FROM roles;
  IF n15 <> 5 OR n23 <> 5 THEN RAISE EXCEPTION 'POST roles %/% expected 5/5', n15, n23; END IF;
  SELECT COUNT(*) FILTER (WHERE company_id=15), COUNT(*) FILTER (WHERE company_id=23) INTO n15, n23 FROM settings;
  IF n15 <> 1 OR n23 <> 1 THEN RAISE EXCEPTION 'POST settings rows %/% expected 1/1', n15, n23; END IF;

  IF (SELECT so_counter  FROM settings WHERE company_id=23) < 8 THEN RAISE EXCEPTION 'POST so_counter < 8'; END IF;
  IF (SELECT inv_counter FROM settings WHERE company_id=23) < 7 THEN RAISE EXCEPTION 'POST inv_counter < 7'; END IF;
  IF (SELECT do_counter  FROM settings WHERE company_id=23) < 8 THEN RAISE EXCEPTION 'POST do_counter < 8'; END IF;
  IF (SELECT pq_counter  FROM settings WHERE company_id=23) < 8 THEN RAISE EXCEPTION 'POST pq_counter < 8'; END IF;
  IF (SELECT po_counter  FROM settings WHERE company_id=23) < 9 THEN RAISE EXCEPTION 'POST po_counter < 9'; END IF;

  SELECT COUNT(*) INTO dangling
  FROM sales_orders so
  WHERE so.company_id = 23
    AND (
      (so.inv_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.id = so.inv_id))
      OR (so.do_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM delivery_orders d WHERE d.id = so.do_id))
    );
  IF dangling <> 0 THEN RAISE EXCEPTION 'POST dangling SO links: %', dangling; END IF;

  SELECT COUNT(*) INTO n_bad_status
  FROM sales_orders WHERE company_id = 23 AND status IS DISTINCT FROM 'confirmed';
  IF n_bad_status <> 0 THEN RAISE EXCEPTION 'POST SO status not confirmed: %', n_bad_status; END IF;

  IF (SELECT COUNT(*) FROM invoices) <> 0 THEN RAISE EXCEPTION 'POST invoices must stay empty'; END IF;
  IF (SELECT COUNT(*) FROM delivery_orders) <> 0 THEN RAISE EXCEPTION 'POST delivery_orders must stay empty'; END IF;
  IF (SELECT COUNT(*) FROM purchase_orders) <> 0 THEN RAISE EXCEPTION 'POST purchase_orders must stay empty'; END IF;
  IF (SELECT COUNT(*) FROM journal_entries) <> 0 THEN RAISE EXCEPTION 'POST journal_entries must stay empty'; END IF;

  RAISE NOTICE 'VALIDATION OK — provide verified backup path, then COMMIT or keep ROLLBACK';
END $$;

-- Optional readout before decide:
-- SELECT id, so_number, status, inv_id, do_id FROM sales_orders WHERE company_id=23 ORDER BY id;
-- SELECT company_id, so_counter, inv_counter, do_counter, po_counter, pq_counter FROM settings WHERE company_id IN (15,23);
-- SELECT company_id, COUNT(*) FROM audit_logs GROUP BY 1;

-- =============================================================================
-- ROLLBACK / COMMIT
--
-- After COMMIT failure recovery:
--   pg_restore --clean --if-exists --dbname=bizone_spsynet "<your-verified-dump>"
-- Never restore into BizoneDB or another tenant.
--
-- To apply later: comment ROLLBACK and uncomment COMMIT only after:
--   1) pg_restore --list succeeds on your dump
--   2) SHA256 recorded
--   3) explicit approval
-- =============================================================================

-- COMMIT;
ROLLBACK;
