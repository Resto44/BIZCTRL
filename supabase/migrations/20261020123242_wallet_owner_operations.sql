-- Owner-originated wallet transfers, explicitly separate from beneficiary requests.
ALTER TABLE public.erp_bank_wallet_requests ADD COLUMN IF NOT EXISTS initiated_by_owner boolean NOT NULL DEFAULT false;
CREATE OR REPLACE FUNCTION public.erp_bank_wallet_owner_transfer(
 p_person uuid,p_kind text,p_amount numeric,p_currency text,p_request_id uuid,
 p_treasury_account uuid,p_note text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
 r public.erp_bank_wallet_requests; p public.business_partners; a public.treasury_accounts;
 v_account uuid; v_balance numeric; v_treasury_available numeric; v_treasury_tx uuid;
 v_method text; v_funding boolean;
BEGIN
 IF auth.uid() IS NULL OR p_person IS NULL OR p_request_id IS NULL OR p_treasury_account IS NULL
 OR p_kind IS NULL OR p_kind NOT IN ('fund_wallet','return_to_owner')
 OR p_amount IS NULL OR p_amount<=0 OR p_amount>10000000 OR p_amount<>round(p_amount,2)
 OR p_currency IS NULL OR p_currency !~ '^[A-Z]{3}$'
 OR length(trim(coalesce(p_note,'')))<8 OR length(p_note)>500
 THEN RAISE EXCEPTION 'WALLET_REQUEST_INVALID' USING ERRCODE='22023'; END IF;
 SELECT * INTO p FROM public.business_partners WHERE id=p_person FOR SHARE;
 IF NOT FOUND OR NOT coalesce(public.treasury_account_is_owner(p.restaurant_id),false)
 OR NOT p.is_active OR p.user_id IS NULL OR NOT EXISTS(
 SELECT 1 FROM public.restaurants WHERE id=p.restaurant_id AND coalesce(is_active,true))
 THEN RAISE EXCEPTION 'WALLET_OWNER_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 -- Concurrent retries serialize before inspecting the idempotency key.
 PERFORM pg_advisory_xact_lock(hashtextextended('bank-wallet-owner-request:'||p_request_id,0));
 SELECT * INTO r FROM public.erp_bank_wallet_requests WHERE id=p_request_id FOR UPDATE;
 IF FOUND THEN
  IF r.initiated_by_owner AND r.status='posted' AND r.created_by=auth.uid()
   AND r.restaurant_id=p.restaurant_id AND r.person_id=p_person AND r.kind=p_kind
   AND r.amount=p_amount AND r.currency=p_currency AND r.note=trim(p_note)
   AND r.owner_treasury_account_id=p_treasury_account THEN RETURN r.id; END IF;
  RAISE EXCEPTION 'WALLET_IDEMPOTENCY_CONFLICT' USING ERRCODE='23505';
 END IF;
 INSERT INTO public.erp_bank_wallet_requests(id,restaurant_id,person_id,kind,amount,currency,note,created_by,initiated_by_owner)
 VALUES(p_request_id,p.restaurant_id,p_person,p_kind,p_amount,p_currency,trim(p_note),auth.uid(),true)
 RETURNING * INTO r;
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
  reviewed_by=auth.uid(),reviewed_at=now(),review_note=trim(p_note),
  owner_treasury_account_id=a.id,treasury_transaction_id=v_treasury_tx
 WHERE id=r.id;
 RETURN r.id;
END;$$;
REVOKE ALL ON FUNCTION public.erp_bank_wallet_owner_transfer(uuid,text,numeric,text,uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.erp_bank_wallet_owner_transfer(uuid,text,numeric,text,uuid,uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.erp_bank_wallet_owner_overview(
 p_restaurant uuid,p_currency text,p_status text DEFAULT 'all',p_offset integer DEFAULT 0
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_accounts jsonb;v_people jsonb;v_summary jsonb;v_history jsonb;v_count bigint;
BEGIN
 IF auth.uid() IS NULL OR p_restaurant IS NULL OR p_currency IS NULL OR p_currency !~ '^[A-Z]{3}$'
 OR p_status IS NULL OR p_status NOT IN ('all','pending','posted','rejected') OR p_offset IS NULL OR p_offset<0
 OR NOT coalesce(public.treasury_account_is_owner(p_restaurant),false)
 OR NOT EXISTS(SELECT 1 FROM public.restaurants WHERE id=p_restaurant AND coalesce(is_active,true))
 THEN RAISE EXCEPTION 'WALLET_OWNER_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 v_accounts:=public.erp_bank_wallet_owner_funding_accounts(p_restaurant,p_currency);
 SELECT jsonb_build_object(
  'wallet_balance',coalesce(sum(signed_amount),0),
  'funded',coalesce(sum(signed_amount) FILTER(WHERE signed_amount>0),0),
  'returned',-coalesce(sum(signed_amount) FILTER(WHERE signed_amount<0),0)
 ) INTO v_summary FROM public.erp_bank_wallet_postings
 WHERE restaurant_id=p_restaurant AND currency=p_currency AND side='person';
 SELECT v_summary||jsonb_build_object('pending_count',count(*),'pending_amount',coalesce(sum(amount),0)) INTO v_summary
 FROM public.erp_bank_wallet_requests WHERE restaurant_id=p_restaurant AND currency=p_currency AND status='pending';
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.name,x.id),'[]') INTO v_people FROM (
 SELECT p.id,p.name,p.is_active,p.user_id IS NOT NULL linked,coalesce(a.status,'active') status,
 coalesce(j.balance,0) balance FROM public.business_partners p
 LEFT JOIN public.erp_bank_wallet_accounts a ON a.person_id=p.id AND a.restaurant_id=p_restaurant AND a.currency=p_currency
 LEFT JOIN LATERAL(SELECT sum(signed_amount) balance FROM public.erp_bank_wallet_postings
 WHERE wallet_account_id=a.id AND side='person')j ON true WHERE p.restaurant_id=p_restaurant
 )x;
 SELECT count(*) INTO v_count FROM public.erp_bank_wallet_requests
 WHERE restaurant_id=p_restaurant AND currency=p_currency AND (p_status='all' OR status=p_status);
 WITH ledger AS (
 SELECT j.request_id,j.posted_at,j.id posting_id,j.signed_amount,
 sum(j.signed_amount) OVER(PARTITION BY j.wallet_account_id,j.currency ORDER BY j.posted_at,j.id ROWS UNBOUNDED PRECEDING) balance_after
 FROM public.erp_bank_wallet_postings j WHERE j.restaurant_id=p_restaurant AND j.currency=p_currency AND j.side='person'
 )
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.activity_at DESC,x.posting_id DESC NULLS LAST,x.id DESC),'[]') INTO v_history FROM (
 SELECT r.id,r.person_id,p.name person_name,p.is_active,r.kind,r.amount,r.currency,r.status,r.note,r.review_note,
 r.initiated_by_owner,r.created_at,r.reviewed_at,r.treasury_transaction_id,a.account_name,
 j.balance_after-j.signed_amount balance_before,j.balance_after,j.posting_id,
 coalesce(j.posted_at,r.created_at) activity_at
 FROM public.erp_bank_wallet_requests r JOIN public.business_partners p ON p.id=r.person_id
 LEFT JOIN public.treasury_accounts a ON a.id=r.owner_treasury_account_id
 LEFT JOIN ledger j ON j.request_id=r.id
 WHERE r.restaurant_id=p_restaurant AND r.currency=p_currency AND (p_status='all' OR r.status=p_status)
 ORDER BY coalesce(j.posted_at,r.created_at) DESC,j.posting_id DESC NULLS LAST,r.id DESC LIMIT 50 OFFSET p_offset
 )x;
 RETURN jsonb_build_object('accounts',v_accounts,'people',v_people,'summary',v_summary,'transactions',v_history,'total',v_count,'currency',p_currency);
END;$$;
REVOKE ALL ON FUNCTION public.erp_bank_wallet_owner_overview(uuid,text,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.erp_bank_wallet_owner_overview(uuid,text,text,integer) TO authenticated;
