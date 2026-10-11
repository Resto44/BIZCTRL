-- Correct an objectively inconsistent legacy currency *label* for the
-- documented Cham'at Al Rayan (Tabuk) tenant. This is NOT an exchange conversion.
-- Only accounts already explicitly denominated in SAR (including SR alias)
-- and one server-generated Owner Network "$" placeholder are in scope.
-- No amounts, account balances, invoices, sales, or movements are touched.
BEGIN;
DO $$
DECLARE
  v_tenant constant uuid := 'c9e3506b-cc38-4307-a561-d9e227a99224';
  v_network constant uuid := 'dc860b42-53c9-453e-8afc-d0ded386b37e';
  v_restaurant_currency text;
  v_network_currency text;
  v_count integer;
BEGIN
  SELECT currency INTO v_restaurant_currency FROM public.restaurants
   WHERE id=v_tenant AND name='مطاعم شمعة الريان' FOR UPDATE;
  IF NOT FOUND OR v_restaurant_currency NOT IN ('$', 'SAR')
  THEN RAISE EXCEPTION 'TENANT_CURRENCY_REPAIR_REQUIRES_REVIEW'; END IF;

  SELECT currency INTO v_network_currency FROM public.treasury_accounts
    WHERE id=v_network AND restaurant_id=v_tenant
      AND is_system=true AND legacy_wallet_key='owner_network'
      AND account_type='network_pos' AND branch_id IS NULL AND branch_key IS NULL
    FOR UPDATE;
  IF NOT FOUND OR v_network_currency NOT IN ('$', 'SAR')
  THEN RAISE EXCEPTION 'OWNER_NETWORK_CURRENCY_REPAIR_REQUIRES_REVIEW'; END IF;

  IF EXISTS(SELECT 1 FROM public.treasury_accounts
    WHERE restaurant_id=v_tenant AND currency NOT IN ('SAR','SR','$'))
  THEN RAISE EXCEPTION 'TENANT_HAS_OTHER_CURRENCY_ACCOUNTS'; END IF;

  IF NOT EXISTS(SELECT 1 FROM public.treasury_accounts
    WHERE restaurant_id=v_tenant AND currency='SAR' AND is_system=false)
  THEN RAISE EXCEPTION 'TENANT_SAR_ACCOUNT_EVIDENCE_MISSING'; END IF;

  -- Network Closing underlying the accrual is a Saudi Riyal sale. The only
  -- impacted system account must have *no* other currency-tagged transfer.
  IF EXISTS(SELECT 1 FROM public.wallet_transactions
    WHERE account_id=v_network
      AND transaction_type NOT IN ('network_sales_auto_v2','network_sales_auto'))
  THEN RAISE EXCEPTION 'SYSTEM_NETWORK_HAS_MANUAL_POSTINGS_REVIEW_REQUIRED'; END IF;

  UPDATE public.restaurants SET currency='SAR'
    WHERE id=v_tenant AND currency='$';

  UPDATE public.treasury_accounts SET currency='SAR',updated_date=now()
    WHERE id=v_network AND restaurant_id=v_tenant AND currency='$';

  UPDATE public.treasury_accounts SET currency='SAR',updated_date=now()
    WHERE restaurant_id=v_tenant AND currency='SR';

  SELECT count(*) INTO v_count FROM public.treasury_accounts
    WHERE restaurant_id=v_tenant AND currency <> 'SAR';
  IF v_count<>0 THEN RAISE EXCEPTION 'TENANT_CURRENCY_METADATA_NOT_FULLY_NORMALIZED'; END IF;
END $$;
COMMIT;
