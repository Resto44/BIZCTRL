-- Central owner network ledger and atomic, owner-authorized branch funding.
-- Existing historic sales are NOT re-posted: reconciliation is required first.
-- Network sales are accrued receivables, NOT confirmation of bank settlement.
BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS uq_owner_network_closing_v2
 ON public.wallet_transactions (restaurant_id, reference_id)
 WHERE transaction_type='network_sales_auto_v2';

CREATE OR REPLACE FUNCTION public.erp_post_finalized_network_to_owner()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','pg_temp' AS $$
DECLARE
  v_restaurant uuid;
  v_account uuid;
  v_amount numeric(18,2);
  v_old_count integer;
  v_row uuid;
  v_branch text;
BEGIN
  IF NEW.restaurant_id IS NULL OR NEW.restaurant_id !~
   '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  THEN
    IF NEW.closing_state IN ('finalized','locked')
       AND GREATEST(COALESCE(NEW.restaurant_network,0),COALESCE(NEW.network,0),0)>0
    THEN RAISE EXCEPTION 'OWNER_NETWORK_CLOSING_MISSING_TENANT'; END IF;
    RETURN NEW;
  END IF;
  v_restaurant:=NEW.restaurant_id::uuid;
  v_amount:=CASE WHEN NEW.closing_state IN ('finalized','locked')
   THEN GREATEST(COALESCE(NEW.restaurant_network,0),COALESCE(NEW.network,0),0) ELSE 0 END;
  -- Prevent duplicate network receipt when the Closing save path retries.
  PERFORM pg_advisory_xact_lock(hashtextextended('owner-network:'||NEW.id::text,0));
  SELECT id INTO v_account FROM public.treasury_accounts
   WHERE restaurant_id=v_restaurant AND legacy_wallet_key='owner_network'
     AND branch_id IS NULL AND branch_key IS NULL AND is_active=true
   ORDER BY created_date LIMIT 1;
  IF v_account IS NULL AND v_amount>0 THEN
    INSERT INTO public.treasury_accounts(restaurant_id,account_name,account_type,currency,legacy_wallet_key,is_system,is_active,notes)
    SELECT r.id,'Owner Network - Pending Settlement','network_pos',
      COALESCE(NULLIF(r.currency,''),'SAR'),'owner_network',true,true,
      'Card sales accruals; verify payment provider settlement before funding branches.'
    FROM public.restaurants r WHERE r.id=v_restaurant
    ON CONFLICT DO NOTHING;
    SELECT id INTO v_account FROM public.treasury_accounts
     WHERE restaurant_id=v_restaurant AND legacy_wallet_key='owner_network'
       AND branch_id IS NULL AND branch_key IS NULL AND is_active=true
     ORDER BY created_date LIMIT 1;
    IF v_account IS NULL THEN RAISE EXCEPTION 'OWNER_NETWORK_ACCOUNT_MISSING'; END IF;
  END IF;

  SELECT id INTO v_row FROM public.wallet_transactions
   WHERE restaurant_id=v_restaurant AND reference_id=NEW.id::text
     AND transaction_type='network_sales_auto_v2' LIMIT 1 FOR UPDATE;
  IF v_row IS NOT NULL THEN
    UPDATE public.wallet_transactions SET amount=v_amount,
      transaction_date=NEW.date,branch=NEW.branch,branch_id=NEW.branch_id,
      account_id=COALESCE(v_account,account_id),updated_date=now()
      WHERE id=v_row AND (amount IS DISTINCT FROM v_amount OR transaction_date IS DISTINCT FROM NEW.date
        OR branch IS DISTINCT FROM NEW.branch OR branch_id IS DISTINCT FROM NEW.branch_id
        OR account_id IS DISTINCT FROM v_account);
    RETURN NEW;
  END IF;

  -- Historic client-side auto entries exist. Match them by *this* Closing ID;
  -- never add a second entry to the same Closing or reconcile old orphans blindly.
  SELECT count(*) INTO v_old_count
    FROM public.wallet_transactions
   WHERE restaurant_id=v_restaurant AND reference_id=NEW.id::text
     AND transaction_type='network_sales_auto';
  IF v_old_count=1 THEN
    SELECT id INTO v_row FROM public.wallet_transactions
     WHERE restaurant_id=v_restaurant AND reference_id=NEW.id::text
       AND transaction_type='network_sales_auto' LIMIT 1 FOR UPDATE;
  END IF;
  IF v_old_count>1 THEN RAISE EXCEPTION 'OWNER_NETWORK_LEGACY_DUPLICATE_CLOSING'; END IF;
  IF v_old_count=1 THEN
    UPDATE public.wallet_transactions SET amount=v_amount,
      transaction_date=NEW.date,branch=NEW.branch,branch_id=NEW.branch_id,
      account_id=v_account,updated_date=now()
      WHERE id=v_row AND (amount IS DISTINCT FROM v_amount
       OR transaction_date IS DISTINCT FROM NEW.date OR branch IS DISTINCT FROM NEW.branch
       OR branch_id IS DISTINCT FROM NEW.branch_id OR account_id IS DISTINCT FROM v_account);
    RETURN NEW;
  END IF;

  IF v_amount>0 THEN
    INSERT INTO public.wallet_transactions(
      transaction_date,transaction_type,flow_type,direction,wallet,
      branch,branch_id,amount,payment_method,description,reference_id,
      auto_generated,recorded_by,restaurant_id,account_id)
    VALUES(NEW.date,'network_sales_auto_v2','network_sales_auto','in','owner_network',
      NEW.branch,NEW.branch_id,v_amount,'network',
      'Unsettled network sales - Closing '||NEW.id::text,NEW.id::text,
      true,COALESCE(NEW.created_by,''),v_restaurant,v_account);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zzz_erp_owner_network_finalized ON public.daily_sales;
CREATE TRIGGER zzz_erp_owner_network_finalized
 AFTER INSERT OR UPDATE OF restaurant_network,network,closing_state,date,branch,branch_id
 ON public.daily_sales FOR EACH ROW
 EXECUTE FUNCTION public.erp_post_finalized_network_to_owner();

REVOKE ALL ON FUNCTION public.erp_post_finalized_network_to_owner() FROM PUBLIC,anon,authenticated;

-- Only the restaurant Owner can commit the two-leg funding transfer.
CREATE OR REPLACE FUNCTION public.erp_owner_fund_branch(
 p_restaurant_id uuid,p_branch_id uuid,p_source_account_id uuid,
 p_destination_account_id uuid,p_amount numeric,p_payment_method text,
 p_request_id uuid,p_note text DEFAULT '',p_network_settlement_confirmed boolean DEFAULT false,
 p_branch_receipt_confirmed boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','pg_temp' AS $$
DECLARE
 v_src public.treasury_accounts%ROWTYPE;
 v_dest public.treasury_accounts%ROWTYPE;
 v_branch public.branches%ROWTYPE;
 v_available numeric;
 v_existing uuid;
 v_from uuid;
 v_to uuid;
 v_wallet text;
 v_date date := (now() at time zone 'Asia/Riyadh')::date;
BEGIN
 IF NOT public.treasury_account_is_owner(p_restaurant_id)
 THEN RAISE EXCEPTION 'OWNER_FUNDING_PERMISSION_DENIED' USING ERRCODE='42501'; END IF;
 IF p_request_id IS NULL THEN RAISE EXCEPTION 'OWNER_FUNDING_REQUEST_ID_REQUIRED'; END IF;
 IF NOT p_branch_receipt_confirmed THEN RAISE EXCEPTION 'OWNER_FUNDING_BRANCH_RECEIPT_NOT_CONFIRMED'; END IF;
 IF p_source_account_id=p_destination_account_id
 THEN RAISE EXCEPTION 'OWNER_FUNDING_SAME_ACCOUNT'; END IF;
 IF p_amount IS NULL OR p_amount<=0 OR p_amount>1000000000 OR round(p_amount,2)<>p_amount
 THEN RAISE EXCEPTION 'OWNER_FUNDING_INVALID_AMOUNT'; END IF;
 IF lower(COALESCE(p_payment_method,'')) NOT IN ('cash','network')
 THEN RAISE EXCEPTION 'OWNER_FUNDING_PAYMENT_METHOD_REQUIRED'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('owner-fund:'||p_restaurant_id::text||':'||p_request_id::text,0));
 SELECT id INTO v_existing FROM public.wallet_transactions
   WHERE settlement_request_id=p_request_id AND restaurant_id=p_restaurant_id
     AND transaction_type='owner_branch_funding_debit';
 IF v_existing IS NOT NULL THEN
   IF EXISTS(SELECT 1 FROM public.wallet_transactions WHERE reference_id=p_request_id::text
      AND transaction_type='owner_to_branch_funding' AND restaurant_id=p_restaurant_id)
   THEN RETURN jsonb_build_object('request_id',p_request_id,'status','already_posted'); END IF;
   RAISE EXCEPTION 'OWNER_FUNDING_INCOMPLETE_TRANSFER';
 END IF;

 SELECT * INTO v_branch FROM public.branches
   WHERE id=p_branch_id AND restaurant_id=p_restaurant_id AND is_active IS DISTINCT FROM false;
 IF NOT FOUND THEN RAISE EXCEPTION 'OWNER_FUNDING_INVALID_BRANCH'; END IF;
 SELECT * INTO v_src FROM public.treasury_accounts
   WHERE id=p_source_account_id AND restaurant_id=p_restaurant_id AND is_active=true
     AND branch_id IS NULL AND branch_key IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'OWNER_FUNDING_INVALID_OWNER_ACCOUNT'; END IF;
 SELECT * INTO v_dest FROM public.treasury_accounts
   WHERE id=p_destination_account_id AND restaurant_id=p_restaurant_id AND is_active=true
     AND (branch_id=p_branch_id OR (branch_id IS NULL AND branch_key=v_branch.branch_key))
     FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'OWNER_FUNDING_INVALID_BRANCH_ACCOUNT'; END IF;
 IF v_dest.account_type NOT IN ('cash','petty_cash')
 THEN RAISE EXCEPTION 'OWNER_FUNDING_DESTINATION_MUST_BE_BRANCH_CASH'; END IF;
 IF v_src.currency IS DISTINCT FROM v_dest.currency
 THEN RAISE EXCEPTION 'OWNER_FUNDING_CURRENCY_MISMATCH'; END IF;
 IF v_src.account_type IN ('network_pos','clearing') AND NOT p_network_settlement_confirmed
 THEN RAISE EXCEPTION 'OWNER_FUNDING_NETWORK_SETTLEMENT_NOT_CONFIRMED'; END IF;
 IF v_src.account_type NOT IN ('bank','cash','digital_wallet','network_pos','clearing')
 THEN RAISE EXCEPTION 'OWNER_FUNDING_UNSUPPORTED_SOURCE_ACCOUNT'; END IF;

 SELECT COALESCE(v_src.opening_balance,0)+COALESCE(sum(
   CASE WHEN direction='out' THEN -amount ELSE amount END),0)
   INTO v_available FROM public.wallet_transactions WHERE account_id=v_src.id;
 IF p_amount>v_available THEN RAISE EXCEPTION 'OWNER_FUNDING_INSUFFICIENT_BALANCE'; END IF;
 v_wallet:=COALESCE(v_src.legacy_wallet_key,CASE WHEN v_src.account_type='cash'
   THEN 'owner_cash' ELSE 'owner_network' END);
 INSERT INTO public.wallet_transactions(transaction_date,transaction_type,flow_type,
   direction,wallet,branch,branch_id,amount,payment_method,description,reference_id,
   auto_generated,restaurant_id,account_id,settlement_request_id,recorded_by)
 VALUES(v_date,'owner_branch_funding_debit','owner_funding','out',v_wallet,
   v_branch.branch_key,p_branch_id,p_amount,lower(p_payment_method),
   'Owner funding - '||COALESCE(p_note,''),p_request_id::text,false,p_restaurant_id,
   v_src.id,p_request_id,auth.uid()::text)
 RETURNING id INTO v_from;
 INSERT INTO public.wallet_transactions(transaction_date,transaction_type,flow_type,
   direction,wallet,branch,branch_id,amount,payment_method,description,reference_id,
   auto_generated,restaurant_id,account_id,recorded_by)
 VALUES(v_date,'owner_to_branch_funding','owner_funding','in',
   COALESCE(v_dest.legacy_wallet_key,'branch_cash'),
   v_branch.branch_key,p_branch_id,p_amount,lower(p_payment_method),
   'Owner funding received - '||COALESCE(p_note,''),p_request_id::text,false,
   p_restaurant_id,v_dest.id,auth.uid()::text)
 RETURNING id INTO v_to;
 RETURN jsonb_build_object('request_id',p_request_id,'status','posted',
  'debit_id',v_from,'credit_id',v_to,'amount',p_amount,
  'branch_id',p_branch_id);
END;
$$;
REVOKE ALL ON FUNCTION public.erp_owner_fund_branch(uuid,uuid,uuid,uuid,numeric,text,uuid,text,boolean,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.erp_owner_fund_branch(uuid,uuid,uuid,uuid,numeric,text,uuid,text,boolean,boolean) TO authenticated;

COMMIT;
