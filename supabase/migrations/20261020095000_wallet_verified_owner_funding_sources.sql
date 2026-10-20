-- Trusted owner Treasury balances for bank-wallet funding source selection.
-- Keep legacy wallet_transaction rows with NULL currency when they have a valid
-- account_id; this is the SAME accounting rule used by transfer approval.
CREATE OR REPLACE FUNCTION public.erp_bank_wallet_owner_funding_accounts(
 p_restaurant uuid, p_currency text
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO public,pg_temp AS $$
DECLARE v_result jsonb;
BEGIN
 IF auth.uid() IS NULL OR p_restaurant IS NULL OR p_currency IS NULL
   OR p_currency !~ '^[A-Z]{3}$'
   OR NOT coalesce(public.treasury_account_is_owner(p_restaurant),false)
 THEN RAISE EXCEPTION 'WALLET_OWNER_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.account_name),'[]'::jsonb)
 INTO v_result FROM (
   SELECT a.id,a.account_name,a.currency,a.account_type,
     (a.opening_balance + coalesce(sum(
       CASE WHEN t.direction='in' THEN t.amount
            WHEN t.direction='out' THEN -t.amount
            ELSE 0 END
     ),0))::numeric(18,2) AS available_balance,
     count(t.id)::int AS posted_transactions,
     CASE
       WHEN a.legacy_wallet_key='owner_network' THEN 'network'
       WHEN a.legacy_wallet_key='owner_cash' THEN 'cash'
       WHEN a.account_type IN('cash','petty_cash') THEN 'cash'
       ELSE 'network' END AS payment_method
   FROM public.treasury_accounts a
   LEFT JOIN public.wallet_transactions t
     ON t.account_id=a.id AND t.restaurant_id=a.restaurant_id
   WHERE a.restaurant_id=p_restaurant AND a.currency=p_currency
     AND a.is_active AND a.branch_id IS NULL AND a.branch_key IS NULL
     AND (a.legacy_wallet_key IS NULL OR a.legacy_wallet_key IN('owner_cash','owner_network'))
   GROUP BY a.id
 )x;
 RETURN v_result;
END;$$;
REVOKE ALL ON FUNCTION public.erp_bank_wallet_owner_funding_accounts(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.erp_bank_wallet_owner_funding_accounts(uuid,text) TO authenticated;

-- Source type may be temporarily inconsistent in old Treasury accounts.
-- Owner network/cash classification is authoritative when legacy_wallet_key
-- explicitly identifies which owner pocket receives the actual movement.

CREATE OR REPLACE FUNCTION public.erp_bank_wallet_review(
 p_request_id uuid,p_approve boolean,p_treasury_account uuid DEFAULT NULL,
 p_review_note text DEFAULT ''
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,pg_temp AS $$
DECLARE
 r public.erp_bank_wallet_requests;
 p public.business_partners;
 a public.treasury_accounts;
 v_account uuid;
 v_balance numeric;
 v_treasury_available numeric;
 v_treasury_tx uuid;
 v_method text;
 v_funding boolean;
BEGIN
 IF auth.uid() IS NULL OR p_approve IS NULL OR p_request_id IS NULL OR
 length(coalesce(p_review_note,''))>500 OR
 (p_approve AND length(trim(coalesce(p_review_note,'')))<8) OR
 (NOT p_approve AND length(trim(coalesce(p_review_note,'')))<8)
 THEN RAISE EXCEPTION 'WALLET_REVIEW_INVALID' USING ERRCODE='22023'; END IF;
 SELECT * INTO r FROM public.erp_bank_wallet_requests WHERE id=p_request_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'WALLET_REQUEST_NOT_FOUND' USING ERRCODE='22023';END IF;
 IF NOT coalesce(public.treasury_account_is_owner(r.restaurant_id),false) OR
  r.created_by=auth.uid() THEN
  RAISE EXCEPTION 'WALLET_OWNER_APPROVAL_REQUIRED' USING ERRCODE='42501';END IF;
 IF r.status<>'pending' THEN
  IF (p_approve AND r.status='posted') OR
     (NOT p_approve AND r.status='rejected') THEN RETURN r.id;END IF;
  RAISE EXCEPTION 'WALLET_REQUEST_ALREADY_CLOSED' USING ERRCODE='22023';
 END IF;
 IF NOT p_approve THEN
  UPDATE public.erp_bank_wallet_requests SET status='rejected',
   reviewed_by=auth.uid(),reviewed_at=now(),review_note=trim(p_review_note)
   WHERE id=r.id;
  RETURN r.id;
 END IF;
 SELECT * INTO p FROM public.business_partners WHERE id=r.person_id FOR SHARE;
 IF NOT FOUND OR NOT p.is_active OR p.restaurant_id<>r.restaurant_id OR
  NOT EXISTS(SELECT 1 FROM public.restaurants
   WHERE id=r.restaurant_id AND coalesce(is_active,true)) THEN
  RAISE EXCEPTION 'WALLET_ACCOUNT_INACTIVE' USING ERRCODE='42501';
 END IF;
 -- Serialize balance checks and posts across all requests for same subaccount.
 PERFORM pg_advisory_xact_lock(hashtextextended('bank-wallet:'||p.id||':'||r.currency,0));
 INSERT INTO public.erp_bank_wallet_accounts(restaurant_id,person_id,currency)
 VALUES(r.restaurant_id,r.person_id,r.currency)
 ON CONFLICT(restaurant_id,person_id,currency) DO NOTHING;
 SELECT id INTO v_account FROM public.erp_bank_wallet_accounts
 WHERE restaurant_id=r.restaurant_id AND person_id=r.person_id
  AND currency=r.currency AND status='active' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'WALLET_ACCOUNT_FROZEN' USING ERRCODE='42501';END IF;
 SELECT * INTO a FROM public.treasury_accounts
 WHERE id=p_treasury_account AND restaurant_id=r.restaurant_id
  AND currency=r.currency AND is_active
  AND branch_id IS NULL AND branch_key IS NULL
  AND (legacy_wallet_key IS NULL OR legacy_wallet_key IN('owner_cash','owner_network'))
 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'WALLET_TREASURY_ACCOUNT_INVALID' USING ERRCODE='42501';END IF;
 v_funding:=(r.kind='fund_wallet');
 v_method:=CASE
   WHEN a.legacy_wallet_key='owner_network' THEN 'network'
   WHEN a.legacy_wallet_key='owner_cash' THEN 'cash'
   WHEN a.account_type IN('cash','petty_cash') THEN 'cash'
   ELSE 'network' END;
 IF v_funding THEN
  SELECT a.opening_balance+coalesce(sum(CASE WHEN t.direction='in' THEN t.amount
    WHEN t.direction='out' THEN -t.amount ELSE 0 END),0)
   INTO v_treasury_available FROM public.wallet_transactions t
   WHERE t.account_id=a.id AND t.restaurant_id=r.restaurant_id;
  IF coalesce(v_treasury_available,0)<r.amount THEN
   RAISE EXCEPTION 'WALLET_TREASURY_INSUFFICIENT_FUNDS' USING ERRCODE='22003';END IF;
 ELSE
  SELECT coalesce(sum(signed_amount),0) INTO v_balance
   FROM public.erp_bank_wallet_postings
   WHERE wallet_account_id=v_account AND side='person' AND currency=r.currency;
  IF v_balance<r.amount THEN
   RAISE EXCEPTION 'WALLET_INSUFFICIENT_FUNDS' USING ERRCODE='22003';END IF;
 END IF;
 INSERT INTO public.wallet_transactions(
  currency,restaurant_id,transaction_date,transaction_type,direction,wallet,
  amount,payment_method,account_id,description,reference_id,auto_generated,recorded_by,created_by)
 VALUES(r.currency,r.restaurant_id,current_date,'transfer',
  CASE WHEN v_funding THEN 'out' ELSE 'in' END,
  CASE WHEN v_method='cash' THEN 'owner_cash' ELSE 'owner_network' END,
  r.amount,v_method,a.id,'Internal bank-style wallet: '||p.name,
  'bank_wallet:'||r.id::text,true,auth.jwt()->>'email',auth.jwt()->>'email')
 RETURNING id INTO v_treasury_tx;
 INSERT INTO public.erp_bank_wallet_postings(request_id,restaurant_id,
  wallet_account_id,currency,side,signed_amount)
 VALUES
 (r.id,r.restaurant_id,v_account,r.currency,'person',
   CASE WHEN v_funding THEN r.amount ELSE -r.amount END),
 (r.id,r.restaurant_id,v_account,r.currency,'owner_clearing',
   CASE WHEN v_funding THEN -r.amount ELSE r.amount END);
 UPDATE public.erp_bank_wallet_requests SET status='posted',
  reviewed_by=auth.uid(),reviewed_at=now(),review_note=trim(p_review_note),
  owner_treasury_account_id=a.id,treasury_transaction_id=v_treasury_tx
 WHERE id=r.id;
 RETURN r.id;
END;$$;
