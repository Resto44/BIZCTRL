-- BizCTRL ERP capacity expansion, November 1, 2026
-- Canonical source: public.subscription_plans, consumed by the server capacity
-- triggers, owner snapshot, quota meters and public pricing catalog.
-- NO changes to price IDs, monthly/annual rates, trials, subscriptions,
-- existing usage or payment history. Inactive hidden Free plan is unchanged.
DO $migration$
DECLARE v_changed integer;
BEGIN
  IF (SELECT count(*) FROM public.subscription_plans
      WHERE id IN ('starter_20','growth_40','enterprise_100')
        AND is_active AND is_public
        AND (id,monthly_price_cents) IN (
          ('starter_20',1000),('growth_40',2000),('enterprise_100',5000)
        )
     ) <> 3 THEN
     RAISE EXCEPTION 'PLAN_CAPACITY_CATALOG_PRECONDITION_FAILED';
  END IF;

  UPDATE public.subscription_plans AS p
  SET
    max_restaurants = c.restaurants,
    max_branches = c.branches,
    max_users = c.users,
    max_employees = c.employees,
    max_storage_mb = c.storage_mb,
    max_pdf_exports = c.pdf_exports,
    max_ocr_scans = c.ocr_scans,
    -- These keys override canonical columns in platform_owner_plan_limit().
    -- Clear only outdated duplicates; preserve all other owner-specific quotas.
    entitlement_limits = p.entitlement_limits
      - 'restaurants' - 'max_restaurants' - 'branches' - 'max_branches'
      - 'users' - 'max_users' - 'employees' - 'max_employees'
      - 'storage_mb' - 'max_storage_mb' - 'pdf_exports' - 'max_pdf_exports'
      - 'ocr_scans' - 'max_ocr_scans',
    updated_at=now()
  FROM (VALUES
    ('starter_20',     2,  3, 10,  20,  10240,  250,  150),
    ('growth_40',      5,  5, 25,  50,  51200, 1000,  750),
    ('enterprise_100',15, 15, 75, 150, 204800, 5000, 2500)
  ) AS c(id,restaurants,branches,users,employees,storage_mb,pdf_exports,ocr_scans)
  WHERE p.id=c.id;
  GET DIAGNOSTICS v_changed=ROW_COUNT;
  IF v_changed<>3 THEN RAISE EXCEPTION 'PLAN_CAPACITY_ROWCOUNT_MISMATCH'; END IF;
END
$migration$;
